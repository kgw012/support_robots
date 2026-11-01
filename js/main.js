/**
 * @file main.js
 * @description 애플리케이션 최상위 진입점 및 모듈 오케스트레이션 (부트스트랩, 이벤트 배선, 사운드 언락)
 */

import {
  gameState,
  initGameState,
  scheduleBackgroundRefill,
  isDailyChallengeReady,
  isInfinitePuzzleReady,
  warmupAllDailyChallenges,
  DIFF_META,
} from './state.js';
import {
  advanceTutorialStep,
  isTutorialFinalStep,
} from './tutorial.js';
import { syncBoardPixelSize } from './renderer.js';
import {
  unlockAudio,
  isBGMMuted,
  isBGMActive,
  toggleBGMMute,
  toggleSFXMute,
  startBGM,
  playButtonClick,
} from './audio.js';
import { restoreAuthSession } from './api.js';

import {
  openLeaderboardModal,
  initLeaderboardModal,
} from './leaderboardModal.js';
import { initClearModal } from './clearModal.js';
import {
  syncAuthUI,
  syncLobbyDifficultyUI,
  syncSoundUI,
  initLobbyEvents,
} from './lobbyController.js';
import {
  showPuzzleLoading,
  hidePuzzleLoading,
  syncInGameHeaderByMode,
  applyTutorialStep,
  enterTutorialMode,
  enterInfiniteMode,
  enterDailyChallengeMode,
  returnToLobby,
  trackAnalyticsView,
  initNavigationEvents,
} from './navigation.js';
import {
  updateTutorialGestureGuide,
  initHudEvents,
} from './hudController.js';
import {
  handleReset,
  handleNextStage,
  renderAll,
  initGameControls,
} from './gameController.js';
import {
  boardWrapperEl,
  gameScreenEl,
  btnBgmToggleLobbyEl,
  btnSfxToggleLobbyEl,
  btnBgmToggleGameEl,
  btnSfxToggleGameEl,
} from './elements.js';

/**
 * 초기 실행 (앱 부트스트랩)
 */
async function bootstrap() {
  syncLobbyDifficultyUI();
  syncAuthUI();
  syncSoundUI();

  // 로컬스토리지 로그인 세션 비동기 복원
  await restoreAuthSession();
  syncAuthUI();

  // 1. 일일 챌린지 오늘 맵 우선 백그라운드 사전 생성 (0ms 즉시 시작 보장)
  warmupAllDailyChallenges();

  // 2. 무한 모드 난이도별 바구니 백그라운드 사전 충전 (다음 문제 0ms 즉시 시작 보장)
  scheduleBackgroundRefill(2);

  window.addEventListener('resize', () => {
    if (gameScreenEl && !gameScreenEl.hidden) {
      syncBoardPixelSize(boardWrapperEl);
      updateTutorialGestureGuide();
    }
  });

  // 1. 로비 및 인증 이벤트 바인딩
  initLobbyEvents({
    onStartDaily: enterDailyChallengeMode,
    onStartInfinite: enterInfiniteMode,
    onStartTutorial: enterTutorialMode,
    onOpenLeaderboard: (diff, mode, reset) => openLeaderboardModal(diff, mode, reset),
  });

  // 2. 화면 전환 및 세션 이탈 보호 네비게이션 이벤트 바인딩
  initNavigationEvents();

  // 3. 리더보드 모달 이벤트 바인딩
  initLeaderboardModal();

  // 4. 클리어 결과창 이벤트 바인딩
  initClearModal({
    onRetry: () => {
      if (gameState.gameMode === 'tutorial') {
        if (isTutorialFinalStep()) {
          returnToLobby();
        } else {
          handleReset();
        }
      } else {
        handleReset();
      }
    },
    onNext: () => {
      if (gameState.gameMode === 'tutorial') {
        if (isTutorialFinalStep()) {
          returnToLobby();
        } else {
          const { step } = advanceTutorialStep();
          applyTutorialStep(step);
        }
      } else if (gameState.gameMode === 'daily') {
        openLeaderboardModal(gameState.dailyDifficultyMode || 'normal', 'daily');
      } else {
        handleNextStage();
      }
    },
  });

  // 5. 상단 HUD 팝오버 및 인게임 난이도 변경 이벤트 바인딩
  initHudEvents({
    onChangeDifficulty: async (newDiff) => {
      const isDaily = gameState.gameMode === 'daily';
      const needsLoading = isDaily
        ? !isDailyChallengeReady(newDiff)
        : !isInfinitePuzzleReady(newDiff);

      if (needsLoading) {
        showPuzzleLoading(
          `🔥 [${(DIFF_META[newDiff]?.label || newDiff).toUpperCase()}] 구역 전환 중...`,
          '탈출 경로와 완충 데이터를 정밀 연산하고 있습니다'
        );
        await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30)));
      }

      try {
        if (isDaily) {
          gameState.dailyDifficultyMode = newDiff;
          syncLobbyDifficultyUI();
          await initGameState({ mode: 'daily', targetDifficulty: newDiff });
          syncInGameHeaderByMode();
          renderAll();
          trackAnalyticsView('daily', false);
        } else {
          gameState.selectedDifficultyMode = newDiff;
          syncLobbyDifficultyUI();
          await initGameState({ mode: 'infinite', targetDifficulty: newDiff });
          syncInGameHeaderByMode();
          renderAll();
          trackAnalyticsView('infinite', false);
        }
      } finally {
        hidePuzzleLoading();
      }
    },
  });

  // 6. 인게임 보드 조작 (보드 스와이프/클릭, Undo, Reset, Skip) 이벤트 바인딩
  initGameControls({
    onSkipStage: () => {
      if (gameState.gameMode === 'tutorial') {
        if (isTutorialFinalStep()) {
          returnToLobby();
        } else {
          const { step } = advanceTutorialStep();
          applyTutorialStep(step);
        }
      } else if (gameState.gameMode === 'daily') {
        openLeaderboardModal(gameState.dailyDifficultyMode || 'normal', 'daily');
      } else {
        handleNextStage();
      }
    },
  });

  // 7. BGM / SFX 개별 토글 이벤트 바인딩
  const handleToggleBGM = () => {
    unlockAudio();
    toggleBGMMute();
    syncSoundUI();
  };

  const handleToggleSFX = () => {
    unlockAudio();
    const muted = toggleSFXMute();
    syncSoundUI();
    if (!muted) {
      playButtonClick();
    }
  };

  if (btnBgmToggleLobbyEl) btnBgmToggleLobbyEl.addEventListener('click', handleToggleBGM);
  if (btnBgmToggleGameEl) btnBgmToggleGameEl.addEventListener('click', handleToggleBGM);
  if (btnSfxToggleLobbyEl) btnSfxToggleLobbyEl.addEventListener('click', handleToggleSFX);
  if (btnSfxToggleGameEl) btnSfxToggleGameEl.addEventListener('click', handleToggleSFX);

  // 8. 모바일/브라우저 인터랙션 시 Web Audio API 언락 및 BGM 시작 (Autoplay 정책 대응)
  const cleanupAudioUnlockListeners = () => {
    window.removeEventListener('pointerdown', handleAudioUnlock);
    window.removeEventListener('touchstart', handleAudioUnlock);
    window.removeEventListener('pointerup', handleAudioUnlock);
    window.removeEventListener('touchend', handleAudioUnlock);
    window.removeEventListener('click', handleAudioUnlock);
    window.removeEventListener('keydown', handleAudioUnlock);
  };

  const handleAudioUnlock = () => {
    unlockAudio();
    if (!isBGMMuted()) {
      startBGM();
    }
    if (isBGMActive() || isBGMMuted()) {
      cleanupAudioUnlockListeners();
    }
  };

  window.addEventListener('pointerdown', handleAudioUnlock, { passive: true });
  window.addEventListener('touchstart', handleAudioUnlock, { passive: true });
  window.addEventListener('pointerup', handleAudioUnlock, { passive: true });
  window.addEventListener('touchend', handleAudioUnlock, { passive: true });
  window.addEventListener('click', handleAudioUnlock, { passive: true });
  window.addEventListener('keydown', handleAudioUnlock, { passive: true });

  // 페이지 로드 즉시 자동 재생 시도
  handleAudioUnlock();
}

document.addEventListener('DOMContentLoaded', bootstrap);
