/**
 * @file main.js
 * @description 애플리케이션 진입점 및 이벤트 바인딩 (1~5단계)
 */

import {
  gameState,
  initGameState,
  recordMoveForUndo,
  undoLastMove,
  resetCurrentRound,
  updateBestRecord,
} from './state.js';
import {
  renderBoardGrid,
  renderRobots,
  updateRobotPositions,
  renderHUD,
  renderRuleFeedback,
} from './renderer.js';
import { computeSlideDestination } from './physics.js';
import { bindInputEvents } from './input.js';
import { evaluateRoundStatus } from './rules.js';
import { buildSolverFeedback } from './solver.js';

const boardWrapperEl = document.querySelector('.board-wrapper');
const boardGridEl = document.getElementById('board-grid');
const robotsLayerEl = document.getElementById('robots-layer');
const btnUndoEl = document.getElementById('btn-undo');
const btnResetEl = document.getElementById('btn-reset');
const btnSkipStageEl = document.getElementById('btn-skip-stage');
const btnClearRetryEl = document.getElementById('btn-clear-retry');
const btnClearNextEl = document.getElementById('btn-clear-next');

/**
 * 조작할 로봇 색상을 변경합니다.
 * @param {string} color 'red' | 'green' | 'blue' | 'yellow'
 */
function handleSelectRobot(color) {
  if (gameState.isCleared) return;
  if (!color || gameState.selectedRobot === color) return;
  gameState.selectedRobot = color;
  updateRobotPositions(robotsLayerEl, gameState);
  renderHUD(gameState);
}

/**
 * 선택된 로봇을 지정된 방향으로 미끄러뜨려 이동시키고 최종 격자 좌표에 스냅합니다.
 * @param {string} direction 'UP' | 'RIGHT' | 'DOWN' | 'LEFT'
 */
function handleMoveDirection(direction) {
  if (gameState.isCleared) return;

  const robotColor = gameState.selectedRobot;
  if (!robotColor || !gameState.board) return;

  const slideResult = computeSlideDestination(
    gameState.board.grid,
    gameState.robots,
    robotColor,
    direction
  );

  // 이미 벽이나 다른 로봇에 막혀 1칸도 움직이지 못한 경우 무시
  if (!slideResult.moved) return;

  // 이동 전 상태를 Undo 스택에 기록 ([로봇색상, 출발좌표, 이전 이동횟수, 이전 완충횟수, 이동방향])
  recordMoveForUndo(robotColor, direction);

  // 최종 정지한 격자 좌표로 스냅 업데이트
  gameState.robots[robotColor] = {
    row: slideResult.endRow,
    col: slideResult.endCol,
  };

  // 이동 횟수 및 로봇 간 충돌(완충) 횟수 반영
  gameState.moveCount += 1;
  if (slideResult.stoppedBy === 'robot') {
    gameState.collisionCount += 1;
  }

  updateRobotPositions(robotsLayerEl, gameState);
  renderHUD(gameState);

  // 4단계 공식 규칙(색상 매칭 + 최소 1회 90도 방향 전환 필수) 판정
  const evaluation = evaluateRoundStatus(gameState, robotColor);
  if (evaluation.status === 'CLEARED') {
    gameState.isCleared = true;
    const solverFeedback = buildSolverFeedback(
      gameState.moveCount,
      gameState.collisionCount,
      gameState.minMoves,
      gameState.maxCollisions
    );
    const bestRecordInfo = updateBestRecord(
      gameState.moveCount,
      gameState.collisionCount
    );
    renderRuleFeedback(evaluation, solverFeedback, bestRecordInfo);
    return;
  }
  renderRuleFeedback(evaluation);
}

/**
 * 이전 동작 취소 (Undo)
 */
function handleUndo() {
  if (undoLastMove()) {
    updateRobotPositions(robotsLayerEl, gameState);
    renderHUD(gameState);
    renderRuleFeedback({ status: 'NONE' });
  }
}

/**
 * 현재 라운드 처음부터 다시하기 (Reset)
 */
function handleReset() {
  if (resetCurrentRound()) {
    updateRobotPositions(robotsLayerEl, gameState);
    renderHUD(gameState);
    renderRuleFeedback({ status: 'NONE' });
  }
}

/**
 * 새로운 라운드(다음 문제) 시작
 */
function handleNextStage() {
  initGameState();
  renderAll();
}

/**
 * 전체 화면(격자, 로봇, 상단 HUD)을 다시 렌더링합니다.
 */
function renderAll() {
  renderBoardGrid(boardGridEl, gameState);
  renderRobots(robotsLayerEl, gameState, handleSelectRobot);
  renderHUD(gameState);
  renderRuleFeedback({ status: 'NONE' });
}

/**
 * 초기 실행
 */
function bootstrap() {
  initGameState();
  renderAll();

  bindInputEvents(boardWrapperEl, {
    onSelectRobot: handleSelectRobot,
    onMoveDirection: handleMoveDirection,
  });

  if (btnUndoEl) {
    btnUndoEl.addEventListener('click', handleUndo);
  }
  if (btnResetEl) {
    btnResetEl.addEventListener('click', handleReset);
  }
  if (btnSkipStageEl) {
    btnSkipStageEl.addEventListener('click', handleNextStage);
  }
  if (btnClearRetryEl) {
    btnClearRetryEl.addEventListener('click', handleReset);
  }
  if (btnClearNextEl) {
    btnClearNextEl.addEventListener('click', handleNextStage);
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);
