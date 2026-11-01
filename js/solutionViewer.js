/**
 * @file solutionViewer.js
 * @description 무한 모드 정답보기(경로 사진 뷰어) 및 점수 미지급 확인 모달 모듈
 */

import { gameState, registerSolutionWarmupHook } from './state.js';
import { solveBoardWithPath } from './solver.js';
import { renderSolutionCanvas } from './routeImage.js';
import { playButtonClick, playWallHit } from './audio.js';
import { logger } from './logger.js';
import {
  btnViewSolutionEl,
  solutionConfirmModalEl,
  btnSolutionCancelEl,
  btnSolutionConfirmEl,
  solutionViewModalEl,
  solutionViewImgEl,
  solutionViewLoadingEl,
  btnSolutionViewCloseTopEl,
  boardWrapperEl,
} from './elements.js';

let isSolvingInProgress = false;
let warmupTimer = null;

function cancelWarmupTimer() {
  if (warmupTimer !== null) {
    if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
      window.cancelIdleCallback(warmupTimer);
    } else {
      clearTimeout(warmupTimer);
    }
    warmupTimer = null;
  }
}

/**
 * 정답 사진 뷰어의 크기를 현재 실제 인게임 보드판(boardWrapperEl)의 픽셀 크기와 1:1로 일치시킵니다.
 */
export function syncSolutionViewSize() {
  if (!boardWrapperEl || !solutionViewModalEl) return;
  const container = solutionViewModalEl.querySelector('.solution-view-container');
  if (!container) return;

  const width = boardWrapperEl.offsetWidth;
  const height = boardWrapperEl.offsetHeight;
  if (width > 0 && height > 0) {
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
  }
}

/**
 * 현재 무한 모드 문제의 정답 경로 및 이미지를 백그라운드 유휴 시간에 미리 연산/렌더링해 둡니다.
 * 대원이 '정답보기'를 누르는 순간 0ms 즉시 정답 사진이 표출됩니다.
 */
export function warmupCurrentSolution() {
  if (gameState.gameMode !== 'infinite') return;
  if (!gameState.board || !gameState.initialRobots || !gameState.activeTarget) return;

  const currentBoardId = gameState.currentBoardId;
  const currentBoard = gameState.board;
  const currentRobots = gameState.initialRobots;
  const currentTarget = gameState.activeTarget;
  const currentDiff = gameState.selectedDifficultyMode || gameState.difficulty?.id || 'normal';

  // 이미 현재 보드에 대한 웜업이 완료되어 있다면 중복 실행 방지
  if (gameState.cachedSolution && gameState.cachedSolution.boardId === currentBoardId) {
    return;
  }

  // 이전 예약 취소
  cancelWarmupTimer();

  const runWarmup = () => {
    warmupTimer = null;
    // 실행 시점에 이미 보드가 바뀌었거나 클리어된 경우 중단
    if (gameState.currentBoardId !== currentBoardId) return;
    if (gameState.cachedSolution && gameState.cachedSolution.boardId === currentBoardId) return;

    try {
      const t0 = Date.now();
      const result = solveBoardWithPath(
        currentBoard.grid,
        currentRobots,
        currentTarget,
        { maxStates: 500000 }
      );

      if (result && result.solved && result.path && result.path.length > 0) {
        // 비동기 연산 도중 보드가 바뀌었는지 재검증
        if (gameState.currentBoardId !== currentBoardId) return;

        const solutionData = {
          dateSeed: 'INFINITE',
          difficulty: currentDiff,
          moveCount: result.minMoves,
          collisionCount: 0,
          initialRobots: currentRobots,
          finalRobots: result.finalRobots,
          activeTarget: currentTarget,
          board: currentBoard,
          path: result.path,
        };

        // 실제 보드판과 1:1로 일치하는 순수 보드 캔버스 생성 (pureBoard: true)
        const canvas = renderSolutionCanvas(solutionData, { pureBoard: true });
        const dataUrl = canvas.toDataURL('image/png');

        gameState.cachedSolution = {
          boardId: currentBoardId,
          solved: true,
          minMoves: result.minMoves,
          path: result.path,
          finalRobots: result.finalRobots,
          dataUrl,
        };

        logger.info('Warmup solution cached for infinite mode (pureBoard)', {
          boardId: currentBoardId,
          minMoves: result.minMoves,
          durationMs: Date.now() - t0,
        });
      }
    } catch (err) {
      logger.warn('Solution warmup failed, fallback on click', err);
    }
  };

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    warmupTimer = window.requestIdleCallback(runWarmup, { timeout: 2000 });
  } else {
    warmupTimer = setTimeout(runWarmup, 60);
  }
}

/**
 * 정답 확인 경고 모달 열기
 */
export function openSolutionConfirmModal() {
  playButtonClick();
  if (gameState.gameMode !== 'infinite') return;
  if (gameState.isCleared) return;

  if (solutionConfirmModalEl) {
    solutionConfirmModalEl.hidden = false;
  }
}

/**
 * 정답 확인 경고 모달 닫기
 */
export function closeSolutionConfirmModal() {
  playButtonClick();
  if (solutionConfirmModalEl) {
    solutionConfirmModalEl.hidden = true;
  }
}

/**
 * 정답 사진 뷰어 모달 닫기
 */
export function closeSolutionViewModal() {
  playButtonClick();
  if (solutionViewModalEl) {
    solutionViewModalEl.hidden = true;
  }
}

/**
 * 유저가 '예 (정답 보기)'를 눌렀을 때 실행되는 핸들러:
 * 1. 무한 모드 점수 획득 차단 (gameState.solutionViewed = true)
 * 2. 캐시된 사전 연산 결과가 있으면 0ms 즉시 표출!
 * 3. 캐시가 없으면 즉시 솔버 연산 후 표출 (Fallback)
 */
export async function handleConfirmViewSolution() {
  if (isSolvingInProgress) return;
  playButtonClick();
  cancelWarmupTimer();

  // 1. 점수 획득 차단 플래그 활성화
  gameState.solutionViewed = true;

  // 확인 모달 닫기
  if (solutionConfirmModalEl) {
    solutionConfirmModalEl.hidden = true;
  }

  // 뷰어 모달 열기
  if (!solutionViewModalEl || !solutionViewImgEl) return;

  // 실제 보드판 크기와 1:1 동기화
  syncSolutionViewSize();

  // 2. 백그라운드에서 사전 연산된 캐시가 있는 경우 -> 솔버 재실행 없이 0ms 즉시 표시!
  const cached = gameState.cachedSolution;
  const currentBoardId = gameState.currentBoardId;
  const isCacheValid = cached && cached.boardId === currentBoardId && cached.dataUrl;

  if (isCacheValid) {
    solutionViewModalEl.hidden = false;
    if (solutionViewLoadingEl) solutionViewLoadingEl.hidden = true;
    solutionViewImgEl.src = cached.dataUrl;
    solutionViewImgEl.style.opacity = '1';

    logger.track('infinite_solution_viewed_cached', {
      difficulty: gameState.selectedDifficultyMode,
      minMoves: cached.minMoves,
    });
    return;
  }

  // 3. 캐시가 아직 준비되지 않은 극단적인 예외 상황 -> 즉석 솔버 Fallback 실행
  solutionViewModalEl.hidden = false;
  if (solutionViewLoadingEl) solutionViewLoadingEl.hidden = false;
  solutionViewImgEl.style.opacity = '0.2';

  isSolvingInProgress = true;

  // 브라우저가 모달과 로딩 스피너를 먼저 렌더링할 수 있도록 0ms 프레임 양보
  await new Promise((resolve) => setTimeout(resolve, 30));

  try {
    const t0 = Date.now();
    const result = solveBoardWithPath(
      gameState.board.grid,
      gameState.initialRobots,
      gameState.activeTarget,
      { maxStates: 500000 }
    );
    const duration = Date.now() - t0;

    if (!result || !result.solved || !result.path || result.path.length === 0) {
      if (solutionViewLoadingEl) solutionViewLoadingEl.hidden = true;
      solutionViewImgEl.style.opacity = '1';
      logger.warn('Failed to find solution path', { duration });
      return;
    }

    const solutionData = {
      dateSeed: 'INFINITE',
      difficulty: gameState.selectedDifficultyMode || gameState.difficulty?.id || 'normal',
      moveCount: result.minMoves,
      collisionCount: 0,
      initialRobots: gameState.initialRobots,
      finalRobots: result.finalRobots,
      activeTarget: gameState.activeTarget,
      board: gameState.board,
      path: result.path,
    };

    // 실제 보드판과 1:1로 일치하는 순수 보드 캔버스 생성 (pureBoard: true)
    const canvas = renderSolutionCanvas(solutionData, { pureBoard: true });
    const dataUrl = canvas.toDataURL('image/png');

    solutionViewImgEl.src = dataUrl;
    solutionViewImgEl.onload = () => {
      if (solutionViewLoadingEl) solutionViewLoadingEl.hidden = true;
      solutionViewImgEl.style.opacity = '1';
    };

    // 캐시에 보관하여 이후 다시 열 때 0ms 유지
    gameState.cachedSolution = {
      boardId: currentBoardId,
      solved: true,
      minMoves: result.minMoves,
      path: result.path,
      finalRobots: result.finalRobots,
      dataUrl,
    };

    logger.track('infinite_solution_viewed_computed', {
      difficulty: gameState.selectedDifficultyMode,
      minMoves: result.minMoves,
      duration,
    });
  } catch (err) {
    logger.error('Error generating solution image', err);
    if (solutionViewLoadingEl) solutionViewLoadingEl.hidden = true;
    solutionViewImgEl.style.opacity = '1';
  } finally {
    isSolvingInProgress = false;
  }
}

/**
 * 정답보기 관련 DOM 이벤트 바인딩
 */
export function initSolutionViewer() {
  // 문제 시작 시 백그라운드 웜업 훅 등록
  registerSolutionWarmupHook(warmupCurrentSolution);

  // 초기 로드 시점 현재 문제가 무한 모드라면 웜업 시도
  warmupCurrentSolution();

  if (btnViewSolutionEl) {
    btnViewSolutionEl.addEventListener('click', openSolutionConfirmModal);
  }

  if (btnSolutionCancelEl) {
    btnSolutionCancelEl.addEventListener('click', closeSolutionConfirmModal);
  }

  if (btnSolutionConfirmEl) {
    btnSolutionConfirmEl.addEventListener('click', handleConfirmViewSolution);
  }

  if (btnSolutionViewCloseTopEl) {
    btnSolutionViewCloseTopEl.addEventListener('click', closeSolutionViewModal);
  }

  // 모달 바깥 배경 클릭 시 닫기
  if (solutionConfirmModalEl) {
    solutionConfirmModalEl.addEventListener('click', (e) => {
      if (e.target === solutionConfirmModalEl) {
        closeSolutionConfirmModal();
      }
    });
  }

  if (solutionViewModalEl) {
    solutionViewModalEl.addEventListener('click', (e) => {
      if (e.target === solutionViewModalEl) {
        closeSolutionViewModal();
      }
    });
  }

  // 윈도우 리사이즈 시 보드 크기 동기화
  window.addEventListener('resize', () => {
    if (solutionViewModalEl && !solutionViewModalEl.hidden) {
      syncSolutionViewSize();
    }
  });

  // ESC 키 닫기 단축키 지원
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (solutionViewModalEl && !solutionViewModalEl.hidden) {
        closeSolutionViewModal();
        return;
      }
      if (solutionConfirmModalEl && !solutionConfirmModalEl.hidden) {
        closeSolutionConfirmModal();
      }
    }
  });
}

