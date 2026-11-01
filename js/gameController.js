/**
 * @file gameController.js
 * @description 인게임 핵심 조작 컨트롤러 (로봇 선택, 슬라이딩 이동 물리 호출, 되돌리기, 리셋, 다음 스테이지 및 전체 렌더링)
 */

import {
  gameState,
  recordMoveForUndo,
  undoLastMove,
  resetCurrentRound,
  updateBestRecord,
  initGameState,
  isInfinitePuzzleReady,
  DIFF_META,
  cloneRobots,
  getSolutionPath,
} from './state.js';
import {
  getCurrentTutorialStep,
  getTutorialExpectedMove,
  getStep3Phase,
  setStep3Phase,
  getStep4Phase,
  setStep4Phase,
} from './tutorial.js';
import { computeSlideDestination } from './physics.js';
import { evaluateRoundStatus } from './rules.js';
import { buildSolverFeedback } from './solver.js';
import {
  syncBoardPixelSize,
  renderBoardGrid,
  renderRobots,
  updateRobotPositions,
  renderHUD,
  renderRuleFeedback,
} from './renderer.js';
import {
  playRobotSelect,
  playSlide,
  playWallHit,
  playRobotBufferHit,
  playUndo,
  playClear,
  playButtonClick,
} from './audio.js';
import { openClearOverlay } from './clearModal.js';
import {
  updateTutorialStepCard,
  updateTutorialGestureGuide,
  getTutorialUndoLocked,
  setTutorialUndoLocked,
  hideHudPopover,
} from './hudController.js';
import { bindInputEvents } from './input.js';
import { authState } from './api.js';
import { logger } from './logger.js';
import {
  boardWrapperEl,
  boardGridEl,
  robotsLayerEl,
  btnUndoEl,
  btnResetEl,
  btnSkipStageEl,
  btnViewSolutionEl,
  btnClearRetryEl,
  btnReopenClearEl,
  clearModeRewardEl,
  tutorialGestureLayerEl,
} from './elements.js';

let isNextStageLocked = false;
let navigationHandlers = {
  showPuzzleLoading: () => {},
  hidePuzzleLoading: () => {},
  syncLobbyDifficultyUI: () => {},
  syncInGameHeaderByMode: () => {},
  trackAnalyticsView: () => {},
};

export function setGameNavigationHandlers(handlers) {
  navigationHandlers = { ...navigationHandlers, ...handlers };
}

/**
 * 조작할 로봇 색상을 변경합니다.
 * @param {string} color 'red' | 'green' | 'blue' | 'yellow'
 */
export function handleSelectRobot(color) {
  if (gameState.isCleared) return;
  if (!color) return;

  if (gameState.gameMode === 'tutorial') {
    const step = getCurrentTutorialStep();
    const expected = getTutorialExpectedMove(
      step.stepIndex,
      gameState.robots,
      getStep3Phase(),
      getStep4Phase()
    );
    if (expected && expected.robotColor !== color) {
      playWallHit();
      renderRuleFeedback({
        status: 'INVALID',
        message: '💡 손가락 제스처가 가리키는 로봇을 움직여주세요!',
      });
      return;
    }
  }

  if (gameState.selectedRobot === color) return;
  gameState.selectedRobot = color;
  playRobotSelect();
  updateRobotPositions(robotsLayerEl, gameState);
  renderHUD(gameState);
}

/**
 * 선택된 로봇을 지정된 방향으로 미끄러뜨려 이동시키고 최종 격자 좌표에 스냅합니다.
 * @param {string} direction 'UP' | 'RIGHT' | 'DOWN' | 'LEFT'
 */
export function handleMoveDirection(direction) {
  if (gameState.isCleared) return;

  // 4단계 직진 무효 상태에서는 되돌리기(Undo)를 누르기 전까지 다른 조작을 잠금
  if (getTutorialUndoLocked()) {
    playWallHit();
    renderRuleFeedback({
      status: 'INVALID_STRAIGHT',
      message: '⚠️ 직진 도달 무효! 하단의 [되돌리기] 버튼을 눌러 출발 위치로 돌아가세요.',
    });
    return;
  }

  // 튜토리얼 모드: 가이드된 로봇 및 가이드된 방향만 엄격히 허용
  if (gameState.gameMode === 'tutorial') {
    const step = getCurrentTutorialStep();
    const expected = getTutorialExpectedMove(
      step.stepIndex,
      gameState.robots,
      getStep3Phase(),
      getStep4Phase()
    );
    if (expected) {
      if (gameState.selectedRobot !== expected.robotColor) {
        gameState.selectedRobot = expected.robotColor;
        updateRobotPositions(robotsLayerEl, gameState);
        renderHUD(gameState);
      }

      if (direction !== expected.direction) {
        playWallHit();
        const dirKoreanMap = {
          UP: '위(↑)',
          RIGHT: '오른쪽(→)',
          DOWN: '아래(↓)',
          LEFT: '왼쪽(←)',
        };
        const targetDirName = dirKoreanMap[expected.direction] || expected.direction;
        renderRuleFeedback({
          status: 'INVALID',
          message: `💡 손가락 안내를 따라 ${targetDirName} 방향으로 밀어주세요!`,
        });
        return;
      }
    }
  }

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

  playSlide();
  if (slideResult.stoppedBy === 'robot') {
    setTimeout(() => playRobotBufferHit(), 70);
  } else if (slideResult.stoppedBy === 'wall') {
    setTimeout(() => playWallHit(), 70);
  }

  recordMoveForUndo(robotColor, direction, {
    row: slideResult.endRow,
    col: slideResult.endCol,
  });

  gameState.robots[robotColor] = {
    row: slideResult.endRow,
    col: slideResult.endCol,
  };

  gameState.moveCount += 1;
  if (slideResult.stoppedBy === 'robot') {
    gameState.collisionCount += 1;
  }

  updateRobotPositions(robotsLayerEl, gameState);
  renderHUD(gameState);

  // 4단계 공식 규칙 판정
  const evaluation = evaluateRoundStatus(gameState, robotColor);
  if (evaluation.status === 'CLEARED') {
    gameState.isCleared = true;
    gameState.clearedSolution = {
      gameMode: gameState.gameMode,
      dateSeed: gameState.board?.dateSeed || gameState.dateSeed,
      difficulty:
        gameState.gameMode === 'daily'
          ? gameState.dailyDifficultyMode
          : gameState.selectedDifficultyMode,
      moveCount: gameState.moveCount,
      collisionCount: gameState.collisionCount,
      initialRobots: cloneRobots(gameState.initialRobots),
      finalRobots: cloneRobots(gameState.robots),
      activeTarget: { ...gameState.activeTarget },
      board: gameState.board,
      path: getSolutionPath(),
    };
    const isTutorial = gameState.gameMode === 'tutorial';
    const isDaily = gameState.gameMode === 'daily';

    if (boardWrapperEl) boardWrapperEl.classList.add('is-cleared');
    if (robotsLayerEl) robotsLayerEl.classList.add('is-cleared');
    if (btnReopenClearEl) btnReopenClearEl.hidden = true;
    if (btnViewSolutionEl) btnViewSolutionEl.hidden = isDaily || isTutorial;
    setTimeout(() => playClear(), 100);
    if (tutorialGestureLayerEl) tutorialGestureLayerEl.hidden = true;

    const solverFeedback =
      isDaily || isTutorial
        ? null
        : buildSolverFeedback(
            gameState.moveCount,
            gameState.collisionCount,
            gameState.minMoves,
            gameState.maxCollisions
          );

    if (solverFeedback?.isOptimal) {
      gameState.isOptimalCleared = true;
    }
    const bestRecordInfo = isTutorial
      ? null
      : updateBestRecord(gameState.moveCount, gameState.collisionCount);

    renderRuleFeedback(evaluation, solverFeedback, bestRecordInfo);
    const clearLogData = {
      isLoggedIn: authState.isLoggedIn,
      mode: gameState.gameMode,
      difficulty: gameState.gameMode === 'daily' ? gameState.dailyDifficultyMode : gameState.selectedDifficultyMode,
      moveCount: gameState.moveCount,
      collisionCount: gameState.collisionCount,
      isOptimal: solverFeedback?.isOptimal ?? false,
    };
    logger.track('puzzle_cleared', clearLogData);
    openClearOverlay(solverFeedback, () => {
      navigationHandlers.syncAuthUI && navigationHandlers.syncAuthUI();
    });
    return;
  }

  if (evaluation.status === 'INVALID_STRAIGHT') {
    if (gameState.gameMode === 'tutorial') {
      setStep4Phase('undo_required');
      setTutorialUndoLocked(true);
      if (btnUndoEl) btnUndoEl.classList.add('is-pulse-focus');
      if (tutorialGestureLayerEl) tutorialGestureLayerEl.hidden = true;
      updateTutorialStepCard();
      evaluation.message = '⚠️ 직진 도달 무효! 하단의 [되돌리기] 버튼을 눌러 출발 위치로 돌아가세요.';
    }
  } else {
    updateTutorialGestureGuide();
  }

  renderRuleFeedback(evaluation);
}

/**
 * 이전 동작 취소 (Undo)
 */
export function handleUndo() {
  if (getTutorialUndoLocked()) {
    setTutorialUndoLocked(false);
    if (btnUndoEl) btnUndoEl.classList.remove('is-pulse-focus');
    if (gameState.gameMode === 'tutorial' && getCurrentTutorialStep().stepIndex === 4) {
      setStep4Phase('detour');
      updateTutorialStepCard();
    }
  }

  if (undoLastMove()) {
    playUndo();
    if (boardWrapperEl) boardWrapperEl.classList.remove('is-cleared');
    if (robotsLayerEl) robotsLayerEl.classList.remove('is-cleared');
    if (btnReopenClearEl) btnReopenClearEl.hidden = true;
    if (btnViewSolutionEl) {
      btnViewSolutionEl.hidden = gameState.gameMode === 'daily' || gameState.gameMode === 'tutorial';
    }
    updateRobotPositions(robotsLayerEl, gameState);
    renderHUD(gameState);
    renderRuleFeedback({ status: 'NONE' });
    updateTutorialGestureGuide();
  }
}

/**
 * 현재 라운드 처음부터 다시하기 (Reset)
 */
export function handleReset() {
  setTutorialUndoLocked(false);
  if (btnUndoEl) btnUndoEl.classList.remove('is-pulse-focus');
  if (btnClearRetryEl) btnClearRetryEl.classList.remove('is-pulse-focus');
  if (gameState.gameMode === 'tutorial') {
    const step = getCurrentTutorialStep();
    if (step.stepIndex === 3) {
      setStep3Phase('try_buffer');
      updateTutorialStepCard();
    }
    if (step.stepIndex === 4) {
      setStep4Phase('try_straight');
      updateTutorialStepCard();
    }
  }

  if (resetCurrentRound()) {
    logger.track('puzzle_reset', {
      mode: gameState.gameMode,
      difficulty: gameState.gameMode === 'daily' ? gameState.dailyDifficultyMode : gameState.selectedDifficultyMode,
    });
    playUndo();
    if (boardWrapperEl) boardWrapperEl.classList.remove('is-cleared');
    if (robotsLayerEl) robotsLayerEl.classList.remove('is-cleared');
    if (btnReopenClearEl) btnReopenClearEl.hidden = true;
    if (btnViewSolutionEl) {
      btnViewSolutionEl.hidden = gameState.gameMode === 'daily' || gameState.gameMode === 'tutorial';
    }
    updateRobotPositions(robotsLayerEl, gameState);
    renderHUD(gameState);
    renderRuleFeedback({ status: 'NONE' });
    updateTutorialGestureGuide();
  }
}

/**
 * 무한 모드 새로운 라운드(다음 문제) 시작 (현재 선택된 난이도 유지 + 1초 쿨타임 적용)
 */
export async function handleNextStage(targetDifficulty = gameState.selectedDifficultyMode) {
  if (isNextStageLocked) return;

  isNextStageLocked = true;
  if (btnSkipStageEl) {
    btnSkipStageEl.disabled = true;
  }

  const needsLoading = !isInfinitePuzzleReady(targetDifficulty);
  if (needsLoading) {
    navigationHandlers.showPuzzleLoading(
      `🔥 [${(DIFF_META[targetDifficulty]?.label || targetDifficulty).toUpperCase()}] 구역 생성 중...`,
      '탈출 경로와 완충 데이터를 정밀 연산하고 있습니다'
    );
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30)));
  }

  try {
    hideHudPopover();
    await initGameState({ mode: 'infinite', targetDifficulty });
    navigationHandlers.syncLobbyDifficultyUI();
    navigationHandlers.syncInGameHeaderByMode();
    renderAll();
    navigationHandlers.trackAnalyticsView('infinite', false);
  } finally {
    navigationHandlers.hidePuzzleLoading();
  }

  setTimeout(() => {
    isNextStageLocked = false;
    if (btnSkipStageEl) {
      btnSkipStageEl.disabled = false;
    }
  }, 1000);
}

/**
 * 전체 화면(격자, 로봇, 상단 HUD)을 다시 렌더링합니다.
 */
export function renderAll() {
  if (clearModeRewardEl) {
    clearModeRewardEl.hidden = true;
  }
  if (boardWrapperEl) {
    boardWrapperEl.classList.remove('is-cleared');
  }
  if (robotsLayerEl) {
    robotsLayerEl.classList.remove('is-cleared');
  }
  if (btnReopenClearEl) {
    btnReopenClearEl.hidden = true;
  }
  if (btnViewSolutionEl) {
    btnViewSolutionEl.hidden = gameState.gameMode === 'daily' || gameState.gameMode === 'tutorial';
  }
  syncBoardPixelSize(boardWrapperEl);
  renderBoardGrid(boardGridEl, gameState);
  renderRobots(robotsLayerEl, gameState, handleSelectRobot);
  renderHUD(gameState);
  renderRuleFeedback({ status: 'NONE' });
  updateTutorialGestureGuide();
}

/**
 * 인게임 조작 이벤트 바인딩 (보드 입력, Undo, Reset, Skip)
 */
export function initGameControls({ onSkipStage }) {
  if (boardWrapperEl) {
    bindInputEvents(boardWrapperEl, {
      onSelectRobot: handleSelectRobot,
      onMoveDirection: handleMoveDirection,
      onUndo: handleUndo,
      onReset: handleReset,
      getSelectedRobot: () => gameState.selectedRobot,
    });
  }

  if (btnUndoEl) {
    btnUndoEl.addEventListener('click', () => {
      handleUndo();
    });
  }

  if (btnResetEl) {
    btnResetEl.addEventListener('click', () => {
      handleReset();
    });
  }

  if (btnSkipStageEl) {
    btnSkipStageEl.addEventListener('click', () => {
      playButtonClick();
      if (typeof onSkipStage === 'function') {
        onSkipStage();
      } else {
        handleNextStage();
      }
    });
  }
}
