/**
 * @file navigation.js
 * @description 화면 전환(로비 ↔ 인게임), 모드 진입(튜토리얼, 무한 모드, 일일 챌린지), 세션 이탈 보호 및 브라우저 히스토리 라우팅 모듈
 */

import {
  gameState,
  initGameState,
  isDailyChallengeReady,
  isInfinitePuzzleReady,
  getTodayKSTDateSeed,
  getMsUntilNextKSTMidnight,
  warmupAllDailyChallenges,
  DIFF_META,
} from './state.js';
import { createBoardData } from './boardPresets.js';
import {
  getCurrentTutorialStep,
  getTutorialExpectedMove,
  getStep3Phase,
  getStep4Phase,
  isTutorialFinalStep,
  resetTutorialProgress,
} from './tutorial.js';
import { syncBoardPixelSize } from './renderer.js';
import { unlockAudio, isBGMMuted, startBGM, playWallHit, playButtonClick } from './audio.js';
import { authState } from './api.js';
import {
  updateTutorialStepCard,
  updateTutorialGestureGuide,
  setTutorialUndoLocked,
  hideHudPopover,
} from './hudController.js';
import { renderAll, setGameNavigationHandlers } from './gameController.js';
import {
  syncLobbyDifficultyUI,
  syncAuthUI,
  showLobbyToast,
} from './lobbyController.js';
import { logger } from './logger.js';
import {
  lobbyScreenEl,
  gameScreenEl,
  puzzleLoadingOverlayEl,
  loadingTitleEl,
  loadingSubEl,
  hudModeTitleEl,
  hudDifficultyBadgeEl,
  btnOpenLeaderboardEl,
  btnSkipStageEl,
  btnBackLobbyEl,
  tutorialGuideCardEl,
  tutorialGestureLayerEl,
  btnClearNextEl,
  btnClearShareEl,
  btnClearShareTextEl,
  leaveConfirmModalEl,
  btnLeaveStayEl,
  btnLeaveConfirmEl,
  dailyExpiredModalEl,
  btnDailyExpiredConfirmEl,
  boardWrapperEl,
  robotsLayerEl,
  btnReopenClearEl,
  clearOverlayEl,
  btnUndoEl,
  btnClearRetryEl,
  lobbyDiffDrawerEl,
  lobbyDailyDiffDrawerEl,
  inputNicknameEl,
} from './elements.js';

export function showPuzzleLoading(
  title = '⚙️ 작전 구역 분석 중...',
  sub = '지반 충격을 최소화하는 최적 경로를 연산하고 있습니다'
) {
  if (!puzzleLoadingOverlayEl) return;
  if (loadingTitleEl) loadingTitleEl.textContent = title;
  if (loadingSubEl) loadingSubEl.textContent = sub;
  puzzleLoadingOverlayEl.hidden = false;
}

export function hidePuzzleLoading() {
  if (!puzzleLoadingOverlayEl) return;
  puzzleLoadingOverlayEl.hidden = true;
}

/**
 * SPA 네비게이션 가상 뷰 추적 및 히스토리 관리
 * @param {'lobby' | 'infinite' | 'daily' | 'tutorial'} viewMode
 * @param {boolean} pushEntry
 */
export function trackAnalyticsView(viewMode, pushEntry = false) {
  if (typeof window === 'undefined' || !window.history) return;
  try {
    const nextUrl = '/';
    if (pushEntry) {
      window.history.pushState({ viewMode }, '', nextUrl);
    } else {
      window.history.replaceState({ viewMode }, '', nextUrl);
      window.dispatchEvent(
        new PopStateEvent('popstate', { state: { viewMode, synthetic: true } })
      );
    }
  } catch (_) {
    // 무시
  }
}

export function syncInGameHeaderByMode() {
  const isDaily = gameState.gameMode === 'daily';
  const isTutorial = gameState.gameMode === 'tutorial';
  const todayInfo = getTodayKSTDateSeed();

  if (hudModeTitleEl) {
    if (isTutorial) {
      hudModeTitleEl.textContent = '🎮 튜토리얼';
    } else if (isDaily) {
      hudModeTitleEl.textContent = `일일 챌린지 (${todayInfo.shortFormatted})`;
    } else {
      hudModeTitleEl.textContent = '무한 모드';
    }
  }

  if (hudDifficultyBadgeEl) {
    hudDifficultyBadgeEl.hidden = isTutorial;
  }
  if (btnOpenLeaderboardEl) {
    btnOpenLeaderboardEl.hidden = isTutorial;
  }
  if (btnSkipStageEl) {
    btnSkipStageEl.hidden = isDaily;
    const labelSpan = btnSkipStageEl.querySelector('span');
    if (labelSpan) {
      labelSpan.textContent = isTutorial ? '다음 단계' : '다음 문제';
    }
  }

  if (tutorialGuideCardEl) {
    tutorialGuideCardEl.hidden = !isTutorial;
    tutorialGuideCardEl.style.display = isTutorial ? '' : 'none';
  }
  if (tutorialGestureLayerEl && !isTutorial) {
    tutorialGestureLayerEl.hidden = true;
  }
  if (!isTutorial) {
    setTutorialUndoLocked(false);
  }

  if (btnClearNextEl) {
    if (isTutorial) {
      btnClearNextEl.textContent = isTutorialFinalStep() ? '메인 로비로' : '다음 단계로 ▸';
    } else {
      btnClearNextEl.textContent = isDaily ? '🏆 순위표 보기' : '다음 문제';
    }
  }
  if (btnClearShareEl) {
    btnClearShareEl.hidden = isTutorial || !isDaily;
    btnClearShareEl.classList.remove('copied');
  }
  if (btnClearShareTextEl) {
    btnClearShareTextEl.textContent = '기록 공유하기';
  }
}

export function applyTutorialStep(step) {
  setTutorialUndoLocked(false);
  if (btnUndoEl) btnUndoEl.classList.remove('is-pulse-focus');
  if (btnClearRetryEl) btnClearRetryEl.classList.remove('is-pulse-focus');

  const fixedBoard = createBoardData({ quadrantOrder: ['A', 'B', 'C', 'D'] });
  const target = fixedBoard.targets[step.targetIndex];

  initGameState({
    mode: 'tutorial',
    quadrantOrder: ['A', 'B', 'C', 'D'],
    initialRobots: step.initialRobots,
    activeTarget: target,
    minMoves: step.minMoves,
  });

  const initialExpected = getTutorialExpectedMove(
    step.stepIndex,
    gameState.robots,
    getStep3Phase(),
    getStep4Phase()
  );
  if (initialExpected && initialExpected.robotColor) {
    gameState.selectedRobot = initialExpected.robotColor;
  }

  updateTutorialStepCard();
  syncInGameHeaderByMode();
  renderAll();
  requestAnimationFrame(() => {
    syncBoardPixelSize(boardWrapperEl);
    updateTutorialGestureGuide();
  });
}

export function enterTutorialMode() {
  unlockAudio();
  if (!isBGMMuted()) {
    startBGM();
  }

  if (lobbyDiffDrawerEl) lobbyDiffDrawerEl.hidden = true;
  if (lobbyDailyDiffDrawerEl) lobbyDailyDiffDrawerEl.hidden = true;

  if (lobbyScreenEl) lobbyScreenEl.hidden = true;
  if (gameScreenEl) gameScreenEl.hidden = false;

  resetTutorialProgress();
  const step = getCurrentTutorialStep();
  applyTutorialStep(step);

  requestAnimationFrame(() => {
    syncBoardPixelSize(boardWrapperEl);
    updateTutorialGestureGuide();
  });

  trackAnalyticsView('tutorial', true);
  logger.track('mode_enter', { mode: 'tutorial' });
}

export async function enterInfiniteMode() {
  unlockAudio();
  if (!isBGMMuted()) {
    startBGM();
  }

  const targetDiff = gameState.selectedDifficultyMode || 'normal';
  const needsLoading = !isInfinitePuzzleReady(targetDiff);
  if (needsLoading) {
    showPuzzleLoading(
      `🔥 [${(DIFF_META[targetDiff]?.label || targetDiff).toUpperCase()}] 구역 분석 중...`,
      '가장 완충 활용도가 높은 고난도 퍼즐 맵을 엄선하고 있습니다'
    );
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30)));
  }

  try {
    if (lobbyScreenEl) lobbyScreenEl.hidden = true;
    if (gameScreenEl) gameScreenEl.hidden = false;
    if (lobbyDiffDrawerEl) lobbyDiffDrawerEl.hidden = true;
    if (lobbyDailyDiffDrawerEl) lobbyDailyDiffDrawerEl.hidden = true;

    if (tutorialGuideCardEl) {
      tutorialGuideCardEl.hidden = true;
      tutorialGuideCardEl.style.display = 'none';
    }
    if (tutorialGestureLayerEl) {
      tutorialGestureLayerEl.hidden = true;
    }
    setTutorialUndoLocked(false);

    await initGameState({
      mode: 'infinite',
      targetDifficulty: gameState.selectedDifficultyMode,
    });
    syncInGameHeaderByMode();
    renderAll();
    trackAnalyticsView('infinite', true);
    logger.track('mode_enter', {
      mode: 'infinite',
      difficulty: gameState.selectedDifficultyMode,
    });
  } finally {
    hidePuzzleLoading();
  }
}

export async function enterDailyChallengeMode() {
  if (!authState.isLoggedIn) {
    showLobbyToast('🔒 일일 챌린지는 상단에서 대원 접속(로그인) 후 입장할 수 있습니다!');
    if (inputNicknameEl) inputNicknameEl.focus();
    return;
  }

  unlockAudio();
  if (!isBGMMuted()) {
    startBGM();
  }

  const targetDiff = gameState.dailyDifficultyMode || 'normal';
  const needsLoading = !isDailyChallengeReady(targetDiff);
  if (needsLoading) {
    showPuzzleLoading(
      `📡 일일 챌린지 [${(DIFF_META[targetDiff]?.label || targetDiff).toUpperCase()}] 데이터 연산 중...`,
      '오늘의 최고 완충 수학적 최단 경로를 정밀 연산하고 있습니다'
    );
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30)));
  }

  try {
    if (lobbyScreenEl) lobbyScreenEl.hidden = true;
    if (gameScreenEl) gameScreenEl.hidden = false;
    if (lobbyDiffDrawerEl) lobbyDiffDrawerEl.hidden = true;
    if (lobbyDailyDiffDrawerEl) lobbyDailyDiffDrawerEl.hidden = true;

    if (tutorialGuideCardEl) {
      tutorialGuideCardEl.hidden = true;
      tutorialGuideCardEl.style.display = 'none';
    }
    if (tutorialGestureLayerEl) {
      tutorialGestureLayerEl.hidden = true;
    }
    setTutorialUndoLocked(false);

    await initGameState({
      mode: 'daily',
      targetDifficulty: gameState.dailyDifficultyMode,
    });
    syncInGameHeaderByMode();
    renderAll();
    trackAnalyticsView('daily', false);
    logger.track('mode_enter', {
      mode: 'daily',
      difficulty: gameState.dailyDifficultyMode,
    });
  } finally {
    hidePuzzleLoading();
  }
}

export function returnToLobby(fromPopState = false) {
  setTutorialUndoLocked(false);
  hidePuzzleLoading();
  if (btnUndoEl) btnUndoEl.classList.remove('is-pulse-focus');
  if (tutorialGestureLayerEl) tutorialGestureLayerEl.hidden = true;
  hideHudPopover();
  if (leaveConfirmModalEl) leaveConfirmModalEl.hidden = true;
  if (clearOverlayEl) clearOverlayEl.hidden = true;
  if (tutorialGuideCardEl) {
    tutorialGuideCardEl.hidden = true;
    tutorialGuideCardEl.style.display = 'none';
  }
  if (boardWrapperEl) boardWrapperEl.classList.remove('is-cleared');
  if (robotsLayerEl) robotsLayerEl.classList.remove('is-cleared');
  if (btnReopenClearEl) btnReopenClearEl.hidden = true;
  if (lobbyDiffDrawerEl) lobbyDiffDrawerEl.hidden = true;
  if (lobbyDailyDiffDrawerEl) lobbyDailyDiffDrawerEl.hidden = true;

  syncLobbyDifficultyUI();
  syncAuthUI();
  if (gameScreenEl) gameScreenEl.hidden = true;
  if (lobbyScreenEl) lobbyScreenEl.hidden = false;
  if (!fromPopState) {
    trackAnalyticsView('lobby', false);
  }
}

/**
 * 인게임 상태에서 뒤로가기 발생 시 이탈 처리
 * @param {'popstate' | 'backButton'} source
 */
export function requestLeaveToLobby(source = 'backButton') {
  if (gameScreenEl && gameScreenEl.hidden) return;
  if (leaveConfirmModalEl && !leaveConfirmModalEl.hidden) return;

  const shouldConfirm = !gameState.isCleared && gameState.moveCount > 0;

  if (shouldConfirm) {
    if (source === 'popstate') {
      trackAnalyticsView(gameState.gameMode || 'infinite', true);
    }
    if (leaveConfirmModalEl) {
      leaveConfirmModalEl.hidden = false;
    }
  } else {
    returnToLobby(source === 'popstate');
  }
}

/**
 * 일일 챌린지 자정 만료 모달을 화면에 표시합니다.
 * (어제 시작하여 자정 이후 잔류 중이거나, 만료된 퍼즐 클리어 시도 시 호출)
 */
export function openDailyExpiredModal() {
  if (!dailyExpiredModalEl) return;
  if (clearOverlayEl) clearOverlayEl.hidden = true;
  if (leaveConfirmModalEl) leaveConfirmModalEl.hidden = true;
  hideHudPopover();
  playWallHit();
  dailyExpiredModalEl.hidden = false;
}

/**
 * 일일 챌린지 자정 만료 모달을 닫습니다.
 */
export function closeDailyExpiredModal() {
  if (dailyExpiredModalEl) {
    dailyExpiredModalEl.hidden = true;
  }
}

let lastKnownKSTDateSeed = getTodayKSTDateSeed().seed;
let midnightTimer = null;

/**
 * 다음 한국 표준시(KST) 자정 시점에 맞춰 정밀 타이머를 예약합니다.
 */
function scheduleNextMidnightCheck() {
  if (midnightTimer) {
    clearTimeout(midnightTimer);
    midnightTimer = null;
  }
  const msUntilMidnight = getMsUntilNextKSTMidnight();
  // 자정 경과 직후(700ms 여유) 안정적으로 실행되도록 예약
  midnightTimer = setTimeout(() => {
    checkDailyMidnightTransition();
  }, Math.max(1000, msUntilMidnight + 700));
}

/**
 * 자정 날짜 전환 및 일일 챌린지 만료 상태를 감지합니다.
 */
export function checkDailyMidnightTransition() {
  const todayInfo = getTodayKSTDateSeed();
  const currentSeed = todayInfo.seed;

  // 1. 일일 챌린지 플레이 중 잔류 감지:
  // 현재 게임 모드가 일일 챌린지이고, 보드/게임에 귀속된 날짜 시드가 오늘 KST 날짜와 다르면 만료 모달 즉시 표시
  if (gameState.gameMode === 'daily') {
    const puzzleDateSeed = gameState.board?.dateSeed || gameState.dateSeed;
    if (puzzleDateSeed && String(puzzleDateSeed) !== currentSeed) {
      openDailyExpiredModal();
      return;
    }
  }

  // 2. 날짜 변경(자정 통과) 감지
  if (currentSeed !== lastKnownKSTDateSeed) {
    logger.info('Midnight date transition detected', {
      prev: lastKnownKSTDateSeed,
      current: currentSeed,
    });
    lastKnownKSTDateSeed = currentSeed;

    // 로비 날짜 배지 UI 동기화
    syncLobbyDifficultyUI();

    // 오늘의 새 일일 챌린지 4개 난이도 백그라운드 사전 생성 워밍업 재호출
    warmupAllDailyChallenges();

    // 다음 자정 타이머 재설정
    scheduleNextMidnightCheck();
  }
}

/**
 * 화면 전환 및 라우팅 이벤트 바인딩
 */
export function initNavigationEvents() {
  // gameController에 필요한 네비게이션 콜백 주입
  setGameNavigationHandlers({
    showPuzzleLoading,
    hidePuzzleLoading,
    syncLobbyDifficultyUI,
    syncInGameHeaderByMode,
    trackAnalyticsView,
    syncAuthUI,
  });

  if (btnBackLobbyEl) {
    btnBackLobbyEl.addEventListener('click', () => requestLeaveToLobby('backButton'));
  }

  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.synthetic) return;
    if (gameScreenEl && !gameScreenEl.hidden) {
      requestLeaveToLobby('popstate');
    }
  });

  if (btnLeaveStayEl) {
    btnLeaveStayEl.addEventListener('click', () => {
      if (leaveConfirmModalEl) leaveConfirmModalEl.hidden = true;
    });
  }

  if (btnLeaveConfirmEl) {
    btnLeaveConfirmEl.addEventListener('click', () => {
      returnToLobby(false);
    });
  }

  if (leaveConfirmModalEl) {
    leaveConfirmModalEl.addEventListener('click', (e) => {
      if (e.target === leaveConfirmModalEl) {
        leaveConfirmModalEl.hidden = true;
      }
    });
  }

  // 일일 챌린지 만료 모달 [오늘의 새로운 퍼즐 시작하기] 버튼 바인딩
  if (btnDailyExpiredConfirmEl) {
    btnDailyExpiredConfirmEl.addEventListener('click', async () => {
      closeDailyExpiredModal();
      playButtonClick();
      // 오늘 날짜의 최신 일일 챌린지 퍼즐로 즉시 시작
      await enterDailyChallengeMode();
      showLobbyToast('✨ 오늘의 새로운 일일 챌린지가 시작되었습니다!');
    });
  }

  // 1. 자정 정밀 타이머 스케줄러 가동
  scheduleNextMidnightCheck();

  // 2. 스마트폰 화면 켜짐(절전 모드 해제) / 백그라운드 탭 복귀 시 즉시 날짜 변경 확인
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkDailyMidnightTransition();
    }
  });

  window.addEventListener('focus', () => {
    checkDailyMidnightTransition();
  });

  // 3. 주기적 안전 폴백 검사 (5초마다 날짜 일치 여부 확인)
  setInterval(() => {
    checkDailyMidnightTransition();
  }, 5000);

  // 플레이 중 4분마다 세션 활성 유지
  setInterval(() => {
    if (document.visibilityState === 'visible' && gameScreenEl && !gameScreenEl.hidden) {
      trackAnalyticsView(gameState.gameMode || 'infinite', false);
    }
  }, 240000);
}
