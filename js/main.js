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
  syncBoardPixelSize,
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
const hudTargetBadgeEl = document.getElementById('hud-target-badge');
const hudDifficultyBadgeEl = document.getElementById('hud-difficulty-badge');
const hudMoveBoxEl = document.getElementById('hud-move-box');
const hudCollisionBoxEl = document.getElementById('hud-collision-box');
const hudInfoPopoverEl = document.getElementById('hud-info-popover');

const HUD_INFO_CONTENT = Object.freeze({
  target: `
    <strong>목표 탈출구 안내</strong>
    탈출구와 같은 색상의 로봇을 해당 위치에 정지시키세요. (다색 탈출구는 모든 로봇 가능)<br/>
    ※ 출발지에서 직진 한 번으로 도달하는 것은 무효이며, 최소 1회 이상 벽이나 다른 로봇에 부딪혀 90도 방향 전환 후 들어가야 합니다.
  `,
  difficulty: `
    <strong>난이도 분류 기준 (최단 이동 횟수)</strong>
    <div class="popover-diff-grid">
      <div class="popover-diff-item">
        <span class="difficulty-badge diff-easy">EASY</span>
        <span>1 ~ 4회</span>
      </div>
      <div class="popover-diff-item">
        <span class="difficulty-badge diff-normal">NORMAL</span>
        <span>5 ~ 8회</span>
      </div>
      <div class="popover-diff-item">
        <span class="difficulty-badge diff-hard">HARD</span>
        <span>9 ~ 11회</span>
      </div>
      <div class="popover-diff-item">
        <span class="difficulty-badge diff-hell">HELL</span>
        <span>12회 이상</span>
      </div>
    </div>
  `,
  move: `
    <strong>이동 횟수 (순위 판정 1순위 · 낮을수록 우수)</strong>
    보조 로봇을 포함해 라운드 동안 로봇이 미끄러져 기동한 총 횟수입니다.<br/>
    붕괴 중인 지하 폐기장의 지반 진동을 최소화하기 위해, <b>최소한의 이동 횟수(최단 경로)</b>로 구조할수록 가장 높은 우선순위를 부여받습니다.
  `,
  collision: `
    <strong>완충 횟수 — 로봇 간 충격 흡수 (순위 판정 2순위 · 높을수록 우수)</strong>
    미끄러진 로봇이 단단한 벽 대신 <b>다른 로봇에 부딪혀 멈춘 횟수</b>입니다 (벽 충돌 제외).<br/>
    콘크리트 외벽 충돌은 지반 붕괴를 가속하지만, 동료 로봇에 부딪히면 내장된 <b>유압식 충격 흡수 장치(Shock Absorber)</b>가 작동해 충격파를 안전하게 분산시킵니다.<br/>
    ※ <b>이동 횟수가 같다면, 완충 횟수가 많을수록</b> 더 정교하고 안전한 구조로 인정되어 높은 순위를 획득합니다!
  `,
});

let activePopoverType = null;

function showHudPopover(type) {
  if (!hudInfoPopoverEl || !HUD_INFO_CONTENT[type]) return;
  activePopoverType = type;
  hudInfoPopoverEl.innerHTML = HUD_INFO_CONTENT[type];
  hudInfoPopoverEl.hidden = false;
}

function hideHudPopover() {
  if (!hudInfoPopoverEl) return;
  activePopoverType = null;
  hudInfoPopoverEl.hidden = true;
}

function toggleHudPopover(type) {
  if (activePopoverType === type && !hudInfoPopoverEl.hidden) {
    hideHudPopover();
  } else {
    showHudPopover(type);
  }
}

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
  syncBoardPixelSize(boardWrapperEl);
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

  window.addEventListener('resize', () => {
    syncBoardPixelSize(boardWrapperEl);
  });

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

  // 상단 목표 배지 / 난이도 배지 호버 및 클릭(모바일 탭) 시 설명 표시
  const bindBadgeInfo = (el, type) => {
    if (!el) return;
    el.addEventListener('mouseenter', () => {
      if (window.matchMedia('(hover: hover)').matches) {
        showHudPopover(type);
      }
    });
    el.addEventListener('mouseleave', () => {
      if (window.matchMedia('(hover: hover)').matches) {
        hideHudPopover();
      }
    });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleHudPopover(type);
    });
  };

  bindBadgeInfo(hudTargetBadgeEl, 'target');
  bindBadgeInfo(hudDifficultyBadgeEl, 'difficulty');
  bindBadgeInfo(hudMoveBoxEl, 'move');
  bindBadgeInfo(hudCollisionBoxEl, 'collision');

  document.addEventListener('click', () => {
    hideHudPopover();
  });
}

document.addEventListener('DOMContentLoaded', bootstrap);
