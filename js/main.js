/**
 * @file main.js
 * @description 애플리케이션 진입점 및 이벤트 바인딩 (로비, 인증, 일일 챌린지, 무한 모드, 리더보드)
 */

import {
  gameState,
  initGameState,
  recordMoveForUndo,
  undoLastMove,
  resetCurrentRound,
  updateBestRecord,
  scheduleBackgroundRefill,
  getTodayKSTDateSeed,
} from './state.js';
import {
  createBoardData,
} from './boardPresets.js';
import {
  getCurrentTutorialStep,
  advanceTutorialStep,
  isTutorialFinalStep,
  resetTutorialProgress,
  getTutorialGestureGuide,
  getTutorialExpectedMove,
  getStep3Phase,
  setStep3Phase,
  getStep4Phase,
  setStep4Phase,
} from './tutorial.js';
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
import {
  unlockAudio,
  isBGMMuted,
  isBGMActive,
  isSFXMuted,
  toggleBGMMute,
  toggleSFXMute,
  startBGM,
  stopBGM,
  playRobotSelect,
  playSlide,
  playWallHit,
  playRobotBufferHit,
  playUndo,
  playClear,
  playButtonClick,
} from './audio.js';
import {
  authState,
  restoreAuthSession,
  loginOrRegisterUser,
  logoutUser,
  submitDailyChallengeRecord,
  fetchDailyLeaderboard,
  fetchDailyHistoryLeaderboard,
  fetchInfiniteLeaderboard,
  addInfiniteModeScore,
  INFINITE_DIFF_POINTS,
} from './api.js';

const lobbyScreenEl = document.getElementById('lobby-screen');
const gameScreenEl = document.getElementById('game-screen');
const btnLoreToggleEl = document.getElementById('btn-lore-toggle');
const lobbyLoreBodyEl = document.getElementById('lobby-lore-body');
const loreToggleBadgeEl = document.getElementById('lore-toggle-badge');
const loreToggleLabelEl = document.getElementById('lore-toggle-label');
const loreToggleIconEl = document.getElementById('lore-toggle-icon');

const authLoginFormEl = document.getElementById('auth-login-form');
const inputNicknameEl = document.getElementById('input-nickname');
const inputPasswordEl = document.getElementById('input-password');
const btnAuthSubmitEl = document.getElementById('btn-auth-submit');
const authFeedbackMsgEl = document.getElementById('auth-feedback-msg');
const authUserViewEl = document.getElementById('auth-user-view');
const authUserNicknameEl = document.getElementById('auth-user-nickname');
const authUserInfScoreEl = document.getElementById('auth-user-inf-score');
const btnAuthLogoutEl = document.getElementById('btn-auth-logout');

const btnModeDailyEl = document.getElementById('btn-mode-daily');
const lobbyDailyDateBadgeEl = document.getElementById('lobby-daily-date-badge');
const btnLobbyDailyDiffEl = document.getElementById('btn-lobby-daily-diff');
const lobbyDailyDiffLabelEl = document.getElementById('lobby-daily-diff-label');
const lobbyDailyDiffDrawerEl = document.getElementById('lobby-daily-diff-drawer');

const btnModeInfiniteEl = document.getElementById('btn-mode-infinite');
const btnLobbyDiffEl = document.getElementById('btn-lobby-diff');
const lobbyDiffLabelEl = document.getElementById('lobby-diff-label');
const lobbyDiffDrawerEl = document.getElementById('lobby-diff-drawer');

const btnHowToPlayEl = document.getElementById('btn-how-to-play');
const btnLobbyGuideTextEl = document.getElementById('btn-lobby-guide-text');
const btnLobbyLeaderboardEl = document.getElementById('btn-lobby-leaderboard');
const howtoModalEl = document.getElementById('howto-modal');
const btnHowtoCloseEl = document.getElementById('btn-howto-close');
const btnHowtoCloseTopEl = document.getElementById('btn-howto-close-top');
const lobbyToastEl = document.getElementById('lobby-toast');

const btnBackLobbyEl = document.getElementById('btn-back-lobby');
const hudModeTitleEl = document.getElementById('hud-mode-title');
const btnOpenLeaderboardEl = document.getElementById('btn-open-leaderboard');

const tutorialGuideCardEl = document.getElementById('tutorial-guide-card');
const tutorialStepTagEl = document.getElementById('tutorial-step-tag');
const tutorialStepTitleEl = document.getElementById('tutorial-step-title');
const tutorialStepDescEl = document.getElementById('tutorial-step-desc');
const tutorialStepHintEl = document.getElementById('tutorial-step-hint');
const tutorialGestureLayerEl = document.getElementById('tutorial-gesture-layer');
const tutorialFingerEl = document.getElementById('tutorial-finger');
const btnBgmToggleLobbyEl = document.getElementById('btn-bgm-toggle-lobby');
const btnSfxToggleLobbyEl = document.getElementById('btn-sfx-toggle-lobby');
const btnBgmToggleGameEl = document.getElementById('btn-bgm-toggle-game');
const btnSfxToggleGameEl = document.getElementById('btn-sfx-toggle-game');

const boardWrapperEl = document.querySelector('.board-wrapper');
const boardGridEl = document.getElementById('board-grid');
const robotsLayerEl = document.getElementById('robots-layer');
const btnUndoEl = document.getElementById('btn-undo');
const btnResetEl = document.getElementById('btn-reset');
const btnSkipStageEl = document.getElementById('btn-skip-stage');
const btnClearRetryEl = document.getElementById('btn-clear-retry');
const btnClearNextEl = document.getElementById('btn-clear-next');
const btnClearShareEl = document.getElementById('btn-clear-share');
const btnClearShareTextEl = document.getElementById('btn-clear-share-text');
const clearModeRewardEl = document.getElementById('clear-mode-reward');
const clearOverlayEl = document.getElementById('clear-overlay');
const btnClearCloseEl = document.getElementById('btn-clear-close');
const btnReopenClearEl = document.getElementById('btn-reopen-clear');

const hudTargetBadgeEl = document.getElementById('hud-target-badge');
const hudDifficultyBadgeEl = document.getElementById('hud-difficulty-badge');
const hudMoveBoxEl = document.getElementById('hud-move-box');
const hudCollisionBoxEl = document.getElementById('hud-collision-box');
const hudInfoPopoverEl = document.getElementById('hud-info-popover');

const leaderboardModalEl = document.getElementById('leaderboard-modal');
const leaderboardModalTitleEl = document.getElementById('leaderboard-modal-title');
const leaderboardDateSubEl = document.getElementById('leaderboard-date-subtitle');
const leaderboardModeTabsEl = document.getElementById('leaderboard-mode-tabs');
const leaderboardDiffTabsEl = document.getElementById('leaderboard-diff-tabs');
const leaderboardBodyEl = document.getElementById('leaderboard-body');
const btnLeaderboardHistoryEl = document.getElementById('btn-leaderboard-history');
const btnLeaderboardCloseEl = document.getElementById('btn-leaderboard-close');
const btnLeaderboardCloseTopEl = document.getElementById('btn-leaderboard-close-top');

const leaveConfirmModalEl = document.getElementById('leave-confirm-modal');
const btnLeaveStayEl = document.getElementById('btn-leave-stay');
const btnLeaveConfirmEl = document.getElementById('btn-leave-confirm');

const puzzleLoadingOverlayEl = document.getElementById('puzzle-loading-overlay');
const loadingTitleEl = document.getElementById('loading-title');
const loadingSubEl = document.getElementById('loading-sub');

function showPuzzleLoading(
  title = '⚙️ 작전 구역 분석 중...',
  sub = '지반 충격을 최소화하는 최적 경로를 연산하고 있습니다'
) {
  if (!puzzleLoadingOverlayEl) return;
  if (loadingTitleEl) loadingTitleEl.textContent = title;
  if (loadingSubEl) loadingSubEl.textContent = sub;
  puzzleLoadingOverlayEl.hidden = false;
}

function hidePuzzleLoading() {
  if (!puzzleLoadingOverlayEl) return;
  puzzleLoadingOverlayEl.hidden = true;
}

const DIFF_META = Object.freeze({
  easy: { label: 'EASY', range: '1 ~ 4회' },
  normal: { label: 'NORMAL', range: '5 ~ 7회' },
  hard: { label: 'HARD', range: '8 ~ 9회' },
  hell: { label: 'HELL', range: '10회 이상' },
});

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
        <span>5 ~ 7회</span>
      </div>
      <div class="popover-diff-item">
        <span class="difficulty-badge diff-hard">HARD</span>
        <span>8 ~ 9회</span>
      </div>
      <div class="popover-diff-item">
        <span class="difficulty-badge diff-hell">HELL</span>
        <span>10회 이상</span>
      </div>
    </div>
  `,
  move: `
    <strong>이동 횟수 (1순위 · 낮을수록 우수)</strong>
    로봇이 미끄러져 이동한 총 횟수입니다.<br/>
    더 적은 이동 횟수로 탈출할수록 높은 순위를 기록합니다.
  `,
  collision: `
    <strong>완충 횟수 (2순위 · 높을수록 우수)</strong>
    벽 대신 <b>다른 로봇에 부딪혀 멈춘 횟수</b>입니다 (벽 충돌 제외).<br/>
    이동 횟수가 같다면, 완충 횟수가 많을수록 더 높은 순위를 기록합니다.
  `,
});

let activePopoverType = null;
let lobbyToastTimer = null;
let activeLeaderboardMode = 'daily';
let activeLeaderboardDiff = 'normal';
let isDailyHistoryView = false;
let isTutorialUndoLocked = false;

/**
 * 튜토리얼 미션 지시 카드 텍스트를 현재 세부 진행 상태에 맞게 실시간 갱신합니다.
 */
function updateTutorialStepCard() {
  if (!tutorialGuideCardEl || gameState.gameMode !== 'tutorial') return;
  const step = getCurrentTutorialStep();
  if (tutorialStepTagEl) tutorialStepTagEl.textContent = step.badge;
  if (tutorialStepTitleEl) tutorialStepTitleEl.textContent = step.title;
  if (tutorialStepDescEl) tutorialStepDescEl.textContent = step.instruction;
  if (tutorialStepHintEl) tutorialStepHintEl.innerHTML = step.hint;
}

/**
 * 튜토리얼 모드에서 유저가 다음으로 이동시켜야 할 로봇과 방향을
 * 보드판 위에 손가락 제스처 모션(👆)으로 시각화합니다.
 */
function updateTutorialGestureGuide() {
  if (!tutorialGestureLayerEl || !tutorialFingerEl || !boardGridEl) return;

  if (
    gameState.gameMode !== 'tutorial' ||
    gameState.isCleared ||
    isTutorialUndoLocked ||
    (gameScreenEl && gameScreenEl.hidden)
  ) {
    tutorialGestureLayerEl.hidden = true;
    return;
  }

  const step = getCurrentTutorialStep();
  const guide = getTutorialGestureGuide(step.stepIndex, gameState.robots, getStep4Phase());

  if (!guide.active) {
    tutorialGestureLayerEl.hidden = true;
    return;
  }

  // 가이드 대상 로봇으로 선택 상태 자동 동기화
  if (guide.robotColor && gameState.selectedRobot !== guide.robotColor) {
    gameState.selectedRobot = guide.robotColor;
    updateRobotPositions(robotsLayerEl, gameState);
    renderHUD(gameState);
  }

  const boardWidth = boardGridEl.clientWidth;
  if (!boardWidth) {
    requestAnimationFrame(updateTutorialGestureGuide);
    return;
  }
  const cellSize = boardWidth / 16;

  // 손가락 중심을 대상 로봇 셀 중앙에 정렬
  const topPx = guide.row * cellSize + (cellSize / 2) - 22;
  const leftPx = guide.col * cellSize + (cellSize / 2) - 22;

  tutorialFingerEl.style.top = `${topPx}px`;
  tutorialFingerEl.style.left = `${leftPx}px`;
  tutorialFingerEl.className = `tutorial-finger ${guide.directionClass}`;
  tutorialGestureLayerEl.hidden = false;
}

/**
 * SPA 네비게이션 가상 뷰 추적 및 히스토리 관리
 * URL에 불필요한 쿼리 파라미터를 남기지 않고 깔끔한 메인 URL(/)을 유지합니다.
 * @param {'lobby' | 'infinite' | 'daily'} viewMode
 * @param {boolean} [pushEntry=false]
 */
function trackAnalyticsView(viewMode, pushEntry = false) {
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
    // 샌드박스나 file:// 환경 예외 무시
  }
}

function buildChangeDifficultyPopoverHTML() {
  const isDaily = gameState.gameMode === 'daily';
  const isTutorial = gameState.gameMode === 'tutorial';
  const currentDiff = isDaily
    ? gameState.dailyDifficultyMode || 'normal'
    : gameState.selectedDifficultyMode || 'normal';

  const items = Object.entries(DIFF_META)
    .map(([diffId, meta]) => {
      const activeClass = diffId === currentDiff ? 'is-active' : '';
      if (isTutorial) {
        return `
          <div class="popover-diff-item ${activeClass}">
            <span class="difficulty-badge diff-${diffId}">${meta.label}</span>
            <span>${meta.range}</span>
          </div>
        `;
      }
      return `
        <button type="button" class="popover-diff-select-btn ${activeClass}" data-select-diff="${diffId}" title="${meta.label} 난이도로 변경">
          <span class="difficulty-badge diff-${diffId}">${meta.label}</span>
          <span>${meta.range}</span>
        </button>
      `;
    })
    .join('');

  let headerTitle = '난이도 분류 기준 및 변경';
  let descText = '수학적 최단 해결 횟수에 따라 분류됩니다. 원하는 난이도를 클릭하면 즉시 변경됩니다.';
  if (isDaily) {
    headerTitle = '일일 챌린지 난이도 변경';
    descText = '클릭하면 오늘의 해당 난이도 문제로 즉시 이동합니다.';
  } else if (isTutorial) {
    headerTitle = '난이도 분류 기준 (최단 이동 횟수)';
    descText = '수학적 최단 해결 횟수에 따라 4단계로 분류됩니다 (튜토리얼은 단계별 고정).';
  } else {
    headerTitle = '무한 모드 난이도 변경';
    descText = '클릭하면 선택한 난이도의 고품질 새 문제가 즉시 출제됩니다.';
  }

  return `
    <strong>${headerTitle}</strong>
    <p style="margin: 4px 0 8px; font-size: 0.76rem; color: #94a3b8; line-height: 1.35;">${descText}</p>
    <div class="popover-diff-grid">
      ${items}
    </div>
  `;
}

function showHudPopover(type) {
  if (!hudInfoPopoverEl) return;
  if (type === 'changeDiff' || type === 'difficulty') {
    activePopoverType = type;
    hudInfoPopoverEl.innerHTML = buildChangeDifficultyPopoverHTML();
    hudInfoPopoverEl.hidden = false;
    return;
  }
  if (!HUD_INFO_CONTENT[type]) return;
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

function syncAuthUI() {
  if (!authLoginFormEl || !authUserViewEl) return;
  if (authState.isLoggedIn && authState.user) {
    authLoginFormEl.hidden = true;
    authUserViewEl.hidden = false;
    if (authUserNicknameEl) {
      authUserNicknameEl.textContent = authState.user.nickname;
    }
    if (authUserInfScoreEl) {
      authUserInfScoreEl.textContent = String(authState.user.infinite_score ?? 0);
    }
  } else {
    authLoginFormEl.hidden = false;
    authUserViewEl.hidden = true;
  }
}

function showAuthFeedback(msg, isOk = false) {
  if (!authFeedbackMsgEl) return;
  authFeedbackMsgEl.textContent = msg;
  authFeedbackMsgEl.classList.toggle('is-ok', isOk);
  authFeedbackMsgEl.hidden = false;
}

function syncLobbyDifficultyUI() {
  // 1. 무한 모드 난이도 배지 동기화
  const infDiffId = gameState.selectedDifficultyMode || 'normal';
  const infMeta = DIFF_META[infDiffId] || DIFF_META.normal;

  if (btnLobbyDiffEl) {
    btnLobbyDiffEl.className = `lobby-diff-badge difficulty-badge diff-${infDiffId}`;
  }
  if (lobbyDiffLabelEl) {
    lobbyDiffLabelEl.textContent = infMeta.label;
  }
  if (lobbyDiffDrawerEl) {
    const btns = lobbyDiffDrawerEl.querySelectorAll('.drawer-diff-btn');
    btns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.diff === infDiffId);
    });
  }

  // 2. 일일 챌린지 난이도 배지 및 오늘 날짜 배지 동기화
  const dailyDiffId = gameState.dailyDifficultyMode || 'normal';
  const dailyMeta = DIFF_META[dailyDiffId] || DIFF_META.normal;
  const todayInfo = getTodayKSTDateSeed();

  if (lobbyDailyDateBadgeEl) {
    lobbyDailyDateBadgeEl.textContent = todayInfo.shortFormatted;
  }
  if (btnLobbyDailyDiffEl) {
    btnLobbyDailyDiffEl.className = `lobby-diff-badge difficulty-badge diff-${dailyDiffId}`;
  }
  if (lobbyDailyDiffLabelEl) {
    lobbyDailyDiffLabelEl.textContent = dailyMeta.label;
  }
  if (lobbyDailyDiffDrawerEl) {
    const btns = lobbyDailyDiffDrawerEl.querySelectorAll('.drawer-diff-btn');
    btns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.dailyDiff === dailyDiffId);
    });
  }
}

function showLobbyToast(message) {
  if (!lobbyToastEl) return;
  lobbyToastEl.textContent = message;
  lobbyToastEl.hidden = false;
  if (lobbyToastTimer) clearTimeout(lobbyToastTimer);
  lobbyToastTimer = setTimeout(() => {
    lobbyToastEl.hidden = true;
  }, 3000);
}

function syncSoundUI() {
  const bgmMuted = isBGMMuted();
  const sfxMuted = isSFXMuted();

  const updateBtn = (btn, muted, icon, labelBase) => {
    if (!btn) return;
    const iconEl = btn.querySelector('.sound-icon');
    if (iconEl) iconEl.textContent = icon;
    btn.title = `${labelBase} ${muted ? '켜기' : '끄기'}`;
    btn.classList.toggle('is-muted', muted);
  };

  updateBtn(btnBgmToggleLobbyEl, bgmMuted, '🎵', '배경음악');
  updateBtn(btnBgmToggleGameEl, bgmMuted, '🎵', '배경음악');
  updateBtn(btnSfxToggleLobbyEl, sfxMuted, '🔊', '효과음');
  updateBtn(btnSfxToggleGameEl, sfxMuted, '🔊', '효과음');
}

function syncInGameHeaderByMode() {
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

  // 상단 액션 버튼 제어
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

  // 튜토리얼 안내 카드 및 제스처 레이어 노출 제어 (무한 모드/일일 챌린지 오염 방어)
  if (tutorialGuideCardEl) {
    tutorialGuideCardEl.hidden = !isTutorial;
    tutorialGuideCardEl.style.display = isTutorial ? '' : 'none';
  }
  if (tutorialGestureLayerEl && !isTutorial) {
    tutorialGestureLayerEl.hidden = true;
  }
  if (!isTutorial) {
    isTutorialUndoLocked = false;
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

function applyTutorialStep(step) {
  isTutorialUndoLocked = false;
  if (btnUndoEl) {
    btnUndoEl.classList.remove('is-pulse-focus');
  }
  if (btnClearRetryEl) {
    btnClearRetryEl.classList.remove('is-pulse-focus');
  }

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

function enterTutorialMode() {
  unlockAudio();
  if (!isBGMMuted()) {
    startBGM();
  }

  if (lobbyDiffDrawerEl) lobbyDiffDrawerEl.hidden = true;
  if (lobbyDailyDiffDrawerEl) lobbyDailyDiffDrawerEl.hidden = true;

  // 화면 전환을 먼저 수행하여 인게임 보드 및 격자 셀의 실제 픽셀 너비가 계산되도록 합니다
  if (lobbyScreenEl) lobbyScreenEl.hidden = true;
  if (gameScreenEl) gameScreenEl.hidden = false;

  resetTutorialProgress();
  const step = getCurrentTutorialStep();
  applyTutorialStep(step);

  // 렌더링 직후 보드 픽셀 정렬 및 손가락 제스처 가이드 위치를 동기화
  requestAnimationFrame(() => {
    syncBoardPixelSize(boardWrapperEl);
    updateTutorialGestureGuide();
  });

  trackAnalyticsView('tutorial', true);
}

async function enterInfiniteMode() {
  unlockAudio();
  if (!isBGMMuted()) {
    startBGM();
  }

  const isHell = gameState.selectedDifficultyMode === 'hell';
  if (isHell) {
    showPuzzleLoading(
      '🔥 HELL 작전 구역 분석 중...',
      '10회 이상 고난도 탈출 경로와 완충 데이터를 정밀 연산하고 있습니다'
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
    isTutorialUndoLocked = false;

    initGameState({
      mode: 'infinite',
      targetDifficulty: gameState.selectedDifficultyMode,
    });
    syncInGameHeaderByMode();
    renderAll();
    trackAnalyticsView('infinite', true);
  } finally {
    if (isHell) {
      hidePuzzleLoading();
    }
  }
}

async function enterDailyChallengeMode() {
  if (!authState.isLoggedIn) {
    showLobbyToast('🔒 일일 챌린지는 상단에서 대원 접속(로그인) 후 입장할 수 있습니다!');
    if (inputNicknameEl) inputNicknameEl.focus();
    return;
  }

  unlockAudio();
  if (!isBGMMuted()) {
    startBGM();
  }

  const isHell = (gameState.dailyDifficultyMode || 'normal') === 'hell';
  if (isHell) {
    showPuzzleLoading(
      '📡 일일 챌린지 [HELL] 데이터 연산 중...',
      '오늘의 고난도 10회 이상 수학적 최단 경로를 정밀 검증하고 있습니다'
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
    isTutorialUndoLocked = false;

    initGameState({
      mode: 'daily',
      targetDifficulty: gameState.dailyDifficultyMode,
    });
    syncInGameHeaderByMode();
    renderAll();
    trackAnalyticsView('daily', false);
  } finally {
    if (isHell) {
      hidePuzzleLoading();
    }
  }
}

function returnToLobby(fromPopState = false) {
  isTutorialUndoLocked = false;
  hidePuzzleLoading();
  if (btnUndoEl) {
    btnUndoEl.classList.remove('is-pulse-focus');
  }
  if (tutorialGestureLayerEl) {
    tutorialGestureLayerEl.hidden = true;
  }
  hideHudPopover();
  if (leaveConfirmModalEl) {
    leaveConfirmModalEl.hidden = true;
  }
  if (clearOverlayEl) {
    clearOverlayEl.hidden = true;
  }
  if (tutorialGuideCardEl) {
    tutorialGuideCardEl.hidden = true;
    tutorialGuideCardEl.style.display = 'none';
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
  if (lobbyDiffDrawerEl) {
    lobbyDiffDrawerEl.hidden = true;
  }
  if (lobbyDailyDiffDrawerEl) {
    lobbyDailyDiffDrawerEl.hidden = true;
  }
  syncLobbyDifficultyUI();
  syncAuthUI();
  if (gameScreenEl) gameScreenEl.hidden = true;
  if (lobbyScreenEl) lobbyScreenEl.hidden = false;
  if (!fromPopState) {
    trackAnalyticsView('lobby', false);
  }
}

/**
 * 인게임 상태에서 뒤로가기(화면이동) 발생 시 이탈 처리
 * - 게임 진행 중 1회 이상 조작(moveCount > 0)한 경우에만 확인 모달을 띄워 진행 상황 소실을 방지합니다.
 * - 조작이 없었거나(moveCount === 0) 이미 클리어하여 결과창이 표시된 상태(isCleared)에서는 확인창 없이 즉시 로비로 이동합니다.
 * @param {'popstate' | 'backButton'} source
 */
function requestLeaveToLobby(source = 'backButton') {
  // 이미 로비에 있다면 무시
  if (gameScreenEl && gameScreenEl.hidden) return;

  // 이미 확인 모달이 열려있다면 중복 방지
  if (leaveConfirmModalEl && !leaveConfirmModalEl.hidden) return;

  // 게임 진행 중(미클리어)이면서 1회 이상 이동한 경우에만 확인창 표시
  const shouldConfirm = !gameState.isCleared && (gameState.moveCount > 0);

  if (shouldConfirm) {
    // 브라우저/카카오톡 뒤로가기(popstate)로 인한 진입인 경우, 취소 시 게임을 유지하도록 히스토리를 1단계 복구
    if (source === 'popstate') {
      trackAnalyticsView(gameState.gameMode || 'infinite', true);
    }
    if (leaveConfirmModalEl) {
      leaveConfirmModalEl.hidden = false;
    }
  } else {
    // 0회 이동이거나 결과창(성공) 상태에서는 확인창 없이 즉시 로비로 복귀
    returnToLobby(source === 'popstate');
  }
}

function formatSubmittedTime(isoString) {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  } catch (_) {
    return '-';
  }
}

function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatHistoryDate(dateSeed) {
  if (!dateSeed) return '-';
  const str = String(dateSeed);
  if (str.length === 8) {
    const mm = str.slice(4, 6);
    const dd = str.slice(6, 8);
    return `${mm}/${dd}`;
  }
  return str;
}

async function renderCurrentLeaderboard() {
  if (!leaderboardModalEl || !leaderboardBodyEl) return;

  // 1) 모드 탭 활성화 상태 동기화
  if (leaderboardModeTabsEl) {
    const modeBtns = leaderboardModeTabsEl.querySelectorAll('[data-lb-mode]');
    modeBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.lbMode === activeLeaderboardMode);
    });
  }

  // 2) 무한 모드 (누적 점수) 순위표
  if (activeLeaderboardMode === 'infinite') {
    if (btnLeaderboardHistoryEl) btnLeaderboardHistoryEl.hidden = true;
    if (leaderboardModalTitleEl) {
      leaderboardModalTitleEl.textContent = '🏆 무한 모드 순위표';
    }
    if (leaderboardDateSubEl) {
      leaderboardDateSubEl.textContent =
        '완벽 클리어(최단 이동 · 최대 완충) 누적 점수 랭킹 (EASY 10P · NORMAL 25P · HARD 50P · HELL 100P)';
    }
    if (leaderboardDiffTabsEl) {
      leaderboardDiffTabsEl.hidden = true;
    }

    leaderboardBodyEl.innerHTML = `<p class="leaderboard-empty">순위 데이터를 불러오는 중...</p>`;

    try {
      const rows = await fetchInfiniteLeaderboard();
      if (!rows || rows.length === 0) {
        leaderboardBodyEl.innerHTML = `
          <p class="leaderboard-empty">
            아직 무한 모드 누적 점수를 획득한 대원이 없습니다.<br/>
            무한 모드에서 최단 이동 · 최대 완충 클리어로 첫 랭커가 되어 보세요!
          </p>
        `;
        return;
      }

      const myId = authState.user?.id;
      const headerHTML = `
        <div class="lb-header-row is-infinite">
          <span>순위</span>
          <span>대원명</span>
          <span class="lb-stat">누적 점수</span>
        </div>
      `;

      const rowsHTML = rows
        .map((r, idx) => {
          const rankNum = idx + 1;
          let rankLabel = `${rankNum}위`;
          if (rankNum === 1) rankLabel = '🥇 1위';
          else if (rankNum === 2) rankLabel = '🥈 2위';
          else if (rankNum === 3) rankLabel = '🥉 3위';

          const isMe = myId && r.id === myId;
          return `
            <div class="lb-row is-infinite ${isMe ? 'is-me' : ''}">
              <span class="lb-rank">${rankLabel}</span>
              <span class="lb-nick">${escapeHTML(r.nickname)}${isMe ? ' (나)' : ''}</span>
              <span class="lb-score">${Number(r.infinite_score || 0).toLocaleString()}P</span>
            </div>
          `;
        })
        .join('');

      leaderboardBodyEl.innerHTML = headerHTML + rowsHTML;
    } catch (err) {
      leaderboardBodyEl.innerHTML = `<p class="leaderboard-empty">순위표를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>`;
    }
    return;
  }

  // 3) 일일 챌린지 순위표 (지난 순위표 vs 오늘의 실시간 순위표)
  if (btnLeaderboardHistoryEl) btnLeaderboardHistoryEl.hidden = false;
  if (leaderboardDiffTabsEl) {
    leaderboardDiffTabsEl.hidden = false;
    const btns = leaderboardDiffTabsEl.querySelectorAll('[data-lb-diff]');
    btns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.lbDiff === activeLeaderboardDiff);
    });
  }

  // 3-A) 지난 순위표 보기 (각 난이도별 최근 최대 10일 일자별 1위)
  if (isDailyHistoryView) {
    if (leaderboardModalTitleEl) {
      leaderboardModalTitleEl.textContent = '🏆 지난 순위표 (명예의 전당)';
    }
    if (leaderboardDateSubEl) {
      const diffLabel = DIFF_META[activeLeaderboardDiff]?.label || '';
      leaderboardDateSubEl.textContent = `최근 10일간 ${diffLabel} 난이도 일자별 1위 명예의 전당`;
    }
    if (btnLeaderboardHistoryEl) {
      btnLeaderboardHistoryEl.textContent = '⚡ 오늘의 실시간 순위표 보기';
      btnLeaderboardHistoryEl.classList.add('is-active-view');
    }

    leaderboardBodyEl.innerHTML = `<p class="leaderboard-empty">지난 1위 기록을 불러오는 중...</p>`;

    try {
      const rows = await fetchDailyHistoryLeaderboard(activeLeaderboardDiff);
      if (!rows || rows.length === 0) {
        leaderboardBodyEl.innerHTML = `
          <p class="leaderboard-empty">
            아직 <strong>${DIFF_META[activeLeaderboardDiff]?.label || ''}</strong> 난이도의 지난 1위 기록이 없습니다.<br/>
            오늘의 첫 번째 1위 주인공이 되어 보세요!
          </p>
        `;
        return;
      }

      const myId = authState.user?.id;
      const headerHTML = `
        <div class="lb-header-row is-history">
          <span>날짜</span>
          <span>최우수 대원명</span>
          <span class="lb-time">달성시각</span>
        </div>
      `;

      const rowsHTML = rows
        .slice(0, 10)
        .map((r) => {
          const isMe = myId && r.user_id === myId;
          const formattedDate = formatHistoryDate(r.date_seed);
          const formattedTime = formatSubmittedTime(r.submitted_at);
          return `
            <div class="lb-row is-history ${isMe ? 'is-me' : ''}">
              <span class="lb-date">${formattedDate}</span>
              <span class="lb-nick">🏆 ${escapeHTML(r.nickname)}${isMe ? ' (나)' : ''}</span>
              <span class="lb-time">${formattedTime}</span>
            </div>
          `;
        })
        .join('');

      leaderboardBodyEl.innerHTML = headerHTML + rowsHTML;
    } catch (err) {
      leaderboardBodyEl.innerHTML = `<p class="leaderboard-empty">지난 순위표를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>`;
    }
    return;
  }

  // 3-B) 오늘의 실시간 순위표
  const todayInfo = getTodayKSTDateSeed();
  const dateSeed = gameState.dateSeed || todayInfo.seed;

  if (leaderboardModalTitleEl) {
    leaderboardModalTitleEl.textContent = '🏆 일일 챌린지 순위표';
  }
  if (leaderboardDateSubEl) {
    leaderboardDateSubEl.textContent = `${todayInfo.formatted} (KST) · 1순위 최소이동 / 2순위 최다완충 / 3순위 선착순`;
  }
  if (btnLeaderboardHistoryEl) {
    btnLeaderboardHistoryEl.textContent = '📅 지난 순위표 보기';
    btnLeaderboardHistoryEl.classList.remove('is-active-view');
  }

  leaderboardBodyEl.innerHTML = `<p class="leaderboard-empty">순위 데이터를 불러오는 중...</p>`;

  try {
    const rows = await fetchDailyLeaderboard(dateSeed, activeLeaderboardDiff);
    if (!rows || rows.length === 0) {
      leaderboardBodyEl.innerHTML = `
        <p class="leaderboard-empty">
          아직 오늘 <strong>${DIFF_META[activeLeaderboardDiff]?.label || ''}</strong> 난이도 클리어 기록이 없습니다.<br/>
          지금 첫 번째 1위를 달성해 보세요!
        </p>
      `;
      return;
    }

    const myId = authState.user?.id;
    const headerHTML = `
      <div class="lb-header-row">
        <span>순위</span>
        <span>대원명</span>
        <span class="lb-stat">이동</span>
        <span class="lb-stat">완충</span>
        <span class="lb-time">달성 시각</span>
      </div>
    `;

    const rowsHTML = rows
      .map((r) => {
        const rankNum = Number(r.rank);
        let rankLabel = `${rankNum}위`;
        if (rankNum === 1) rankLabel = '🥇 1위';
        else if (rankNum === 2) rankLabel = '🥈 2위';
        else if (rankNum === 3) rankLabel = '🥉 3위';

        const isMe = myId && r.user_id === myId;
        return `
          <div class="lb-row ${isMe ? 'is-me' : ''}">
            <span class="lb-rank">${rankLabel}</span>
            <span class="lb-nick">${escapeHTML(r.nickname)}${isMe ? ' (나)' : ''}</span>
            <span class="lb-stat">${r.move_count}회</span>
            <span class="lb-stat">${r.collision_count}회</span>
            <span class="lb-time">${formatSubmittedTime(r.submitted_at)}</span>
          </div>
        `;
      })
      .join('');

    leaderboardBodyEl.innerHTML = headerHTML + rowsHTML;
  } catch (err) {
    leaderboardBodyEl.innerHTML = `<p class="leaderboard-empty">순위표를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>`;
  }
}

async function openLeaderboardModal(
  diffId = gameState.dailyDifficultyMode || 'normal',
  mode = activeLeaderboardMode,
  resetHistoryView = true
) {
  if (!leaderboardModalEl || !leaderboardBodyEl) return;
  activeLeaderboardMode = mode === 'infinite' ? 'infinite' : 'daily';
  activeLeaderboardDiff = diffId || activeLeaderboardDiff || 'normal';
  if (resetHistoryView) {
    isDailyHistoryView = false;
  }

  leaderboardModalEl.hidden = false;
  await renderCurrentLeaderboard();
}

/**
 * 클리어 시 모드별 보상/기록 자동 제출 처리
 * @param {{ isOptimal: boolean, message: string } | null} solverFeedback
 */
async function handleModeClearSubmission(solverFeedback) {
  if (!clearModeRewardEl) return;

  if (gameState.gameMode === 'tutorial') {
    const step = getCurrentTutorialStep();
    clearModeRewardEl.hidden = false;
    if (step.stepIndex === 3) {
      if (gameState.collisionCount > 0) {
        clearModeRewardEl.innerHTML = `🌟 <strong>완충 성공! (이동 ${gameState.moveCount}회 / 완충 ${gameState.collisionCount}회)</strong><br>동료 로봇으로 충격을 완벽히 흡수했습니다! 같은 2회 이동이라도 완충을 활용할수록 리더보드 최우선 순위가 부여됩니다.`;
      } else {
        clearModeRewardEl.innerHTML = `⚠️ <strong>외벽 충돌 (이동 ${gameState.moveCount}회 / 완충 0회)</strong><br>지반 충격을 분산하지 못했습니다. 더 좋은 풀이(동료 완충)가 있습니다!<br>하단의 [다시 연습]을 눌러 완충으로 도전해보세요!`;
      }
    } else {
      clearModeRewardEl.textContent = `🎯 ${step.clearMessage}`;
    }
    return;
  }

  if (gameState.gameMode === 'daily') {
    if (!authState.isLoggedIn) {
      clearModeRewardEl.hidden = false;
      clearModeRewardEl.textContent = '💡 구조 성공! 로비에서 대원 로그인 시 일일 순위표에 기록됩니다.';
      return;
    }

    clearModeRewardEl.hidden = false;
    clearModeRewardEl.textContent = '📡 일일 챌린지 기록을 서버에 자동 제출 중...';
    try {
      const res = await submitDailyChallengeRecord({
        dateSeed: gameState.dateSeed || getTodayKSTDateSeed().seed,
        difficulty: gameState.dailyDifficultyMode,
        moveCount: gameState.moveCount,
        collisionCount: gameState.collisionCount,
      });
      if (res && res.ok) {
        if (res.status === 'INSERTED') {
          clearModeRewardEl.textContent = '🏆 오늘의 일일 챌린지 첫 클리어 기록이 등록되었습니다!';
        } else if (res.status === 'UPDATED') {
          clearModeRewardEl.textContent = '🔥 오늘의 일일 챌린지 개인 최고 기록을 경신했습니다!';
        } else {
          clearModeRewardEl.textContent = '✅ 이미 달성한 오늘의 개인 최고 기록이 유지됩니다.';
        }
      } else {
        clearModeRewardEl.textContent = '⚠️ 기록 제출에 실패했습니다. 로그인 상태를 확인해 주세요.';
      }
    } catch (_) {
      clearModeRewardEl.textContent = '⚠️ 네트워크 오류로 기록을 제출하지 못했습니다.';
    }
    return;
  }

  // 무한 모드인 경우: 최단 이동 & 최대 완충(isOptimal) 완벽 달성 시에만 점수 지급
  const diffId = gameState.difficulty?.id || 'normal';
  const expectedPts = INFINITE_DIFF_POINTS[diffId] || 10;

  if (!solverFeedback || !solverFeedback.isOptimal) {
    clearModeRewardEl.hidden = false;
    clearModeRewardEl.textContent = `🎯 최단 이동·최대 완충을 모두 달성하면 +${expectedPts}P가 적립됩니다! [다시 도전]해 보세요.`;
    return;
  }

  if (!authState.isLoggedIn) {
    clearModeRewardEl.hidden = false;
    clearModeRewardEl.textContent = `💡 완벽한 구조 성공! 로비에서 로그인하면 무한 점수(+${expectedPts}P)가 누적됩니다.`;
    return;
  }

  if (gameState.infiniteRewardClaimed) {
    clearModeRewardEl.hidden = false;
    clearModeRewardEl.textContent = `현재 누적 무한 점수: ${authState.user?.infinite_score ?? 0}P`;
    return;
  }

  gameState.infiniteRewardClaimed = true;
  clearModeRewardEl.hidden = false;
  clearModeRewardEl.textContent = `✨ 완벽 클리어 보너스 +${expectedPts}P 적립 중...`;

  try {
    const res = await addInfiniteModeScore(diffId);
    if (res && res.ok) {
      clearModeRewardEl.textContent = `✨ 완벽 클리어 +${res.pointsAdded}P 획득! (누적 ${res.infiniteScore}P)`;
      syncAuthUI();
    }
  } catch (_) {
    clearModeRewardEl.textContent = `✨ 완벽 클리어 보너스 +${expectedPts}P`;
  }
}

let shareFeedbackTimer = null;

function showShareFeedback(message) {
  if (!btnClearShareEl || !btnClearShareTextEl) return;
  if (shareFeedbackTimer) clearTimeout(shareFeedbackTimer);

  btnClearShareEl.classList.add('copied');
  btnClearShareTextEl.textContent = message;

  shareFeedbackTimer = setTimeout(() => {
    if (btnClearShareEl) btnClearShareEl.classList.remove('copied');
    if (btnClearShareTextEl) btnClearShareTextEl.textContent = '기록 공유하기';
  }, 2500);
}

/**
 * 일일 챌린지 클리어 기록 공유 (Web Share API 및 클립보드 복사 Fallback)
 */
async function handleShareDailyRecord() {
  playButtonClick();

  const diffKey = gameState.dailyDifficultyMode || 'normal';
  const diffLabel = DIFF_META[diffKey]?.label || diffKey.toUpperCase();

  const origin = (typeof window !== 'undefined' && window.location && window.location.origin)
    ? window.location.origin
    : 'https://supportrobots.vercel.app';
  const shareUrl = origin;

  // 파라미터 없는 메인 URL을 포함하여 정확히 3줄로 완성된 단일 공유 텍스트
  const fullShareText = `🤖 서포트 로봇 일일 챌린지 [${diffLabel}]\n🎯 ${gameState.moveCount}회 이동 · 완충 ${gameState.collisionCount}회로 구조 성공!\n${shareUrl}`;

  // 1) 모바일 Web Share API 시도
  // url 파라미터를 따로 전달하면 카카오톡 등 메신저에서 '텍스트'와 '링크'가 2개의 메시지로 분할 전송됩니다.
  // 완성된 3줄 전체를 text 하나로 묶어 전달하면 카카오톡/인스타그램/문자 등 모든 앱에서 1개의 말풍선으로 깔끔하게 전송됩니다.
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const shareData = { text: fullShareText };
    try {
      if (typeof navigator.canShare === 'function' && !navigator.canShare(shareData)) {
        throw new Error('Web Share not supported for this data');
      }
      await navigator.share(shareData);
      showShareFeedback('✅ 공유 완료!');
      return;
    } catch (err) {
      if (err.name === 'AbortError') {
        // 사용자가 네이티브 공유창을 닫은 경우 피드백 없이 종료
        return;
      }
      // 권한 오류나 미지원 시 아래 클립보드 복사(2단계 Fallback)로 안전하게 진행
    }
  }

  // 2) 클립보드 복사 Fallback (동일한 3줄 텍스트 복사)
  let copied = false;
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(fullShareText);
      copied = true;
    } catch (_) {}
  }

  if (!copied && typeof document !== 'undefined') {
    try {
      const ta = document.createElement('textarea');
      ta.value = fullShareText;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      copied = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (_) {}
  }

  if (copied) {
    showShareFeedback('✅ 클립보드 복사 완료!');
  } else {
    showShareFeedback('⚠️ 복사 실패 (직접 복사해 주세요)');
  }
}

/**
 * 조작할 로봇 색상을 변경합니다.
 * @param {string} color 'red' | 'green' | 'blue' | 'yellow'
 */
function handleSelectRobot(color) {
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
function handleMoveDirection(direction) {
  if (gameState.isCleared) return;

  // 4단계 직진 무효 상태에서는 되돌리기(Undo)를 누르기 전까지 다른 조작을 잠금
  if (isTutorialUndoLocked) {
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
      // 다른 곳을 스와이프했더라도 조작 대상을 expected 로봇으로 자동 보정
      if (gameState.selectedRobot !== expected.robotColor) {
        gameState.selectedRobot = expected.robotColor;
        updateRobotPositions(robotsLayerEl, gameState);
        renderHUD(gameState);
      }

      // 가이드된 방향이 아닌 경우 차단!
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

  // 미끄러짐 추진 및 충돌 완충 효과음 재생
  playSlide();
  if (slideResult.stoppedBy === 'robot') {
    setTimeout(() => playRobotBufferHit(), 70);
  } else if (slideResult.stoppedBy === 'wall') {
    setTimeout(() => playWallHit(), 70);
  }

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
    if (boardWrapperEl) boardWrapperEl.classList.add('is-cleared');
    if (robotsLayerEl) robotsLayerEl.classList.add('is-cleared');
    if (btnReopenClearEl) btnReopenClearEl.hidden = true;
    setTimeout(() => playClear(), 100);
    if (tutorialGestureLayerEl) tutorialGestureLayerEl.hidden = true;

    const isTutorial = gameState.gameMode === 'tutorial';
    const isDaily = gameState.gameMode === 'daily';

    const clearTitleEl = clearOverlayEl ? clearOverlayEl.querySelector('.clear-title') : null;
    if (isTutorial) {
      const step = getCurrentTutorialStep();
      const isFinal = isTutorialFinalStep();

      if (step.stepIndex === 3) {
        if (gameState.collisionCount === 0) {
          // 외벽 충돌 클리어: 더 좋은 풀이 유도를 위해 [다음 단계로] 숨기고 [다시 연습] 강조!
          if (clearTitleEl) {
            clearTitleEl.textContent = '⚠️ 외벽 충돌 (완충 0회)';
          }
          if (btnClearNextEl) {
            btnClearNextEl.hidden = true;
          }
          if (btnClearRetryEl) {
            btnClearRetryEl.hidden = false;
            btnClearRetryEl.textContent = '다시 연습 (완충 도전)';
            btnClearRetryEl.classList.add('is-pulse-focus');
          }
        } else {
          // 로봇 완충 성공: 3단계 진짜 성공! [다음 단계로] 활성화!
          if (clearTitleEl) {
            clearTitleEl.textContent = '🎉 3단계 성공!';
          }
          if (btnClearNextEl) {
            btnClearNextEl.hidden = false;
            btnClearNextEl.textContent = '다음 단계로 ▸';
          }
          if (btnClearRetryEl) {
            btnClearRetryEl.hidden = false;
            btnClearRetryEl.textContent = '다시 연습';
            btnClearRetryEl.classList.remove('is-pulse-focus');
          }
        }
      } else {
        if (clearTitleEl) {
          clearTitleEl.textContent = step.clearTitle;
        }
        if (btnClearNextEl) {
          btnClearNextEl.textContent = isFinal ? '메인 로비로' : '다음 단계로 ▸';
        }
        if (btnClearRetryEl) {
          btnClearRetryEl.hidden = isFinal;
          btnClearRetryEl.textContent = '다시 연습';
          btnClearRetryEl.classList.remove('is-pulse-focus');
        }
      }

      if (btnClearShareEl) btnClearShareEl.hidden = true;
    } else {
      if (clearTitleEl) {
        clearTitleEl.textContent = '구조 성공!';
      }
      if (btnClearRetryEl) {
        btnClearRetryEl.hidden = false;
        btnClearRetryEl.textContent = '다시 도전';
      }
      if (btnClearNextEl) {
        btnClearNextEl.textContent = isDaily ? '🏆 순위표 보기' : '다음 문제';
      }
      if (btnClearShareEl) {
        btnClearShareEl.hidden = !isDaily;
        btnClearShareEl.classList.remove('copied');
      }
      if (btnClearShareTextEl) {
        btnClearShareTextEl.textContent = '기록 공유하기';
      }
    }

    const solverFeedback = (isDaily || isTutorial)
      ? null
      : buildSolverFeedback(
          gameState.moveCount,
          gameState.collisionCount,
          gameState.minMoves,
          gameState.maxCollisions
        );
    const bestRecordInfo = isTutorial
      ? null
      : updateBestRecord(
          gameState.moveCount,
          gameState.collisionCount
        );
    renderRuleFeedback(evaluation, solverFeedback, bestRecordInfo);
    handleModeClearSubmission(solverFeedback);
    return;
  }

  // 4단계에서 직진 도달 무효 발생 시 되돌리기(Undo) 버튼 강제 포커싱 및 우회 안내 준비
  if (evaluation.status === 'INVALID_STRAIGHT') {
    if (gameState.gameMode === 'tutorial') {
      setStep4Phase('undo_required');
      isTutorialUndoLocked = true;
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
function handleUndo() {
  if (isTutorialUndoLocked) {
    isTutorialUndoLocked = false;
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
    updateRobotPositions(robotsLayerEl, gameState);
    renderHUD(gameState);
    renderRuleFeedback({ status: 'NONE' });
    updateTutorialGestureGuide();
  }
}

/**
 * 현재 라운드 처음부터 다시하기 (Reset)
 */
function handleReset() {
  isTutorialUndoLocked = false;
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
    playUndo();
    if (boardWrapperEl) boardWrapperEl.classList.remove('is-cleared');
    if (robotsLayerEl) robotsLayerEl.classList.remove('is-cleared');
    if (btnReopenClearEl) btnReopenClearEl.hidden = true;
    updateRobotPositions(robotsLayerEl, gameState);
    renderHUD(gameState);
    renderRuleFeedback({ status: 'NONE' });
    updateTutorialGestureGuide();
  }
}

let isNextStageLocked = false;

/**
 * 무한 모드 새로운 라운드(다음 문제) 시작 (현재 선택된 난이도 유지 + 1초 쿨타임 적용)
 */
async function handleNextStage(targetDifficulty = gameState.selectedDifficultyMode) {
  if (isNextStageLocked) return;

  isNextStageLocked = true;
  if (btnSkipStageEl) {
    btnSkipStageEl.disabled = true;
  }

  const isHell = targetDifficulty === 'hell';
  if (isHell) {
    showPuzzleLoading(
      '🔥 새로운 HELL 퍼즐 생성 중...',
      '10회 이상 고난도 탈출 경로와 완충 데이터를 정밀 연산하고 있습니다'
    );
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30)));
  }

  try {
    hideHudPopover();
    initGameState({ mode: 'infinite', targetDifficulty });
    syncLobbyDifficultyUI();
    syncInGameHeaderByMode();
    renderAll();
    trackAnalyticsView('infinite', false);
  } finally {
    if (isHell) {
      hidePuzzleLoading();
    }
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
function renderAll() {
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
  syncBoardPixelSize(boardWrapperEl);
  renderBoardGrid(boardGridEl, gameState);
  renderRobots(robotsLayerEl, gameState, handleSelectRobot);
  renderHUD(gameState);
  renderRuleFeedback({ status: 'NONE' });
  updateTutorialGestureGuide();
}

/**
 * 초기 실행
 */
async function bootstrap() {
  syncLobbyDifficultyUI();
  syncAuthUI();
  syncSoundUI();

  // 로컬스토리지 로그인 세션 비동기 복원
  await restoreAuthSession();
  syncAuthUI();

  // 로비에 머무는 동안 백그라운드에서 난이도별 후보맵 바구니를 미리 채워둠
  scheduleBackgroundRefill(3);

  window.addEventListener('resize', () => {
    if (gameScreenEl && !gameScreenEl.hidden) {
      syncBoardPixelSize(boardWrapperEl);
      updateTutorialGestureGuide();
    }
  });

  // 0. 로그인 / 자동 가입 폼 이벤트
  if (authLoginFormEl) {
    authLoginFormEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!inputNicknameEl || !inputPasswordEl) return;

      if (btnAuthSubmitEl) btnAuthSubmitEl.disabled = true;
      showAuthFeedback('인증 확인 중...', true);

      try {
        const res = await loginOrRegisterUser(
          inputNicknameEl.value,
          inputPasswordEl.value
        );
        if (!res.ok) {
          showAuthFeedback(res.message, false);
        } else {
          if (authFeedbackMsgEl) authFeedbackMsgEl.hidden = true;
          inputPasswordEl.value = '';
          syncAuthUI();
          showLobbyToast(
            res.isNew
              ? `🎉 환영합니다, ${res.user.nickname} 대원! 신규 등록 및 로그인되었습니다.`
              : `✅ 반갑습니다, ${res.user.nickname} 대원! 접속 완료되었습니다.`
          );
        }
      } catch (err) {
        showAuthFeedback('서버 통신에 실패했습니다. 잠시 후 다시 시도해 주세요.', false);
      } finally {
        if (btnAuthSubmitEl) btnAuthSubmitEl.disabled = false;
      }
    });
  }

  if (btnAuthLogoutEl) {
    btnAuthLogoutEl.addEventListener('click', () => {
      logoutUser();
      syncAuthUI();
      showLobbyToast('로그아웃되었습니다.');
    });
  }

  // 1. 메인 로비 이벤트 바인딩 (통합 작전 브리핑 페이드아웃 펼쳐보기/접기)
  if (btnLoreToggleEl && lobbyLoreBodyEl) {
    btnLoreToggleEl.addEventListener('click', () => {
      const isCollapsed = lobbyLoreBodyEl.classList.contains('is-collapsed');
      if (isCollapsed) {
        lobbyLoreBodyEl.classList.remove('is-collapsed');
        lobbyLoreBodyEl.classList.add('is-expanded');
        btnLoreToggleEl.setAttribute('aria-expanded', 'true');
        if (loreToggleLabelEl) loreToggleLabelEl.textContent = '작전 브리핑 접기';
        if (loreToggleIconEl) loreToggleIconEl.textContent = '▴';
        if (loreToggleBadgeEl) loreToggleBadgeEl.textContent = '접기 ▴';
      } else {
        lobbyLoreBodyEl.classList.remove('is-expanded');
        lobbyLoreBodyEl.classList.add('is-collapsed');
        btnLoreToggleEl.setAttribute('aria-expanded', 'false');
        if (loreToggleLabelEl) loreToggleLabelEl.textContent = '작전 브리핑 펼쳐보기';
        if (loreToggleIconEl) loreToggleIconEl.textContent = '▾';
        if (loreToggleBadgeEl) loreToggleBadgeEl.textContent = '펼쳐보기 ▾';
      }
    });
  }

  // 일일 챌린지 난이도 배지 및 시작 버튼
  if (btnLobbyDailyDiffEl) {
    btnLobbyDailyDiffEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (lobbyDailyDiffDrawerEl) {
        lobbyDailyDiffDrawerEl.hidden = !lobbyDailyDiffDrawerEl.hidden;
      }
      if (lobbyDiffDrawerEl) {
        lobbyDiffDrawerEl.hidden = true;
      }
    });
  }

  if (lobbyDailyDiffDrawerEl) {
    lobbyDailyDiffDrawerEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-daily-diff]');
      if (!btn || !btn.dataset.dailyDiff) return;
      playButtonClick();
      gameState.dailyDifficultyMode = btn.dataset.dailyDiff;
      syncLobbyDifficultyUI();
      lobbyDailyDiffDrawerEl.hidden = true;
    });
  }

  if (btnModeDailyEl) {
    btnModeDailyEl.addEventListener('click', (e) => {
      if (e.target.closest('#btn-lobby-daily-diff')) return;
      playButtonClick();
      enterDailyChallengeMode();
    });
    btnModeDailyEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('#btn-lobby-daily-diff')) return;
        e.preventDefault();
        playButtonClick();
        enterDailyChallengeMode();
      }
    });
  }

  // 무한 모드 난이도 배지 및 시작 버튼
  if (btnLobbyDiffEl) {
    btnLobbyDiffEl.addEventListener('click', (e) => {
      e.stopPropagation();
      playButtonClick();
      if (lobbyDiffDrawerEl) {
        lobbyDiffDrawerEl.hidden = !lobbyDiffDrawerEl.hidden;
      }
      if (lobbyDailyDiffDrawerEl) {
        lobbyDailyDiffDrawerEl.hidden = true;
      }
    });
  }

  if (lobbyDiffDrawerEl) {
    lobbyDiffDrawerEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.drawer-diff-btn');
      if (!btn || !btn.dataset.diff) return;
      playButtonClick();
      gameState.selectedDifficultyMode = btn.dataset.diff;
      syncLobbyDifficultyUI();
      lobbyDiffDrawerEl.hidden = true;
    });
  }

  if (btnModeInfiniteEl) {
    btnModeInfiniteEl.addEventListener('click', (e) => {
      // 우측 난이도 배지를 누른 경우는 제외
      if (e.target.closest('#btn-lobby-diff')) return;
      playButtonClick();
      enterInfiniteMode();
    });
    btnModeInfiniteEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('#btn-lobby-diff')) return;
        e.preventDefault();
        playButtonClick();
        enterInfiniteMode();
      }
    });
  }

  if (btnBackLobbyEl) {
    btnBackLobbyEl.addEventListener('click', () => requestLeaveToLobby('backButton'));
  }

  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.synthetic) return;
    if (gameScreenEl && !gameScreenEl.hidden) {
      requestLeaveToLobby('popstate');
    }
  });

  // 로비 이탈 확인 모달 이벤트
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

  // 플레이 중 4분마다 활성 세션 신호를 갱신하여 장시간 고민 중에도 online 상태 유지
  setInterval(() => {
    if (document.visibilityState === 'visible' && gameScreenEl && !gameScreenEl.hidden) {
      trackAnalyticsView(gameState.gameMode || 'infinite', false);
    }
  }, 240000);

  const openHowtoModal = () => {
    playButtonClick();
    if (howtoModalEl) howtoModalEl.hidden = false;
  };

  const closeHowtoModal = () => {
    playButtonClick();
    if (howtoModalEl) howtoModalEl.hidden = true;
  };

  // 게임 방법 버튼 본체 클릭 시: 인터랙티브 3단계 튜토리얼 모드 시작!
  if (btnHowToPlayEl) {
    btnHowToPlayEl.addEventListener('click', (e) => {
      if (e.target.closest('#btn-lobby-guide-text')) return;
      playButtonClick();
      enterTutorialMode();
    });
    btnHowToPlayEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('#btn-lobby-guide-text')) return;
        e.preventDefault();
        playButtonClick();
        enterTutorialMode();
      }
    });
  }

  // 우측 작은 '가이드 ▸' 버튼 클릭 시: 조작법 텍스트 모달 열기!
  if (btnLobbyGuideTextEl) {
    btnLobbyGuideTextEl.addEventListener('click', (e) => {
      e.stopPropagation();
      openHowtoModal();
    });
  }


  if (btnHowtoCloseEl) {
    btnHowtoCloseEl.addEventListener('click', closeHowtoModal);
  }
  if (btnHowtoCloseTopEl) {
    btnHowtoCloseTopEl.addEventListener('click', closeHowtoModal);
  }
  if (howtoModalEl) {
    howtoModalEl.addEventListener('click', (e) => {
      if (e.target === howtoModalEl) {
        closeHowtoModal();
      }
    });
  }

  // 리더보드 모달 이벤트 바인딩
  const closeLeaderboardModal = () => {
    if (leaderboardModalEl) leaderboardModalEl.hidden = true;
    isDailyHistoryView = false;
  };

  if (btnLobbyLeaderboardEl) {
    btnLobbyLeaderboardEl.addEventListener('click', () => {
      openLeaderboardModal(gameState.dailyDifficultyMode || 'normal', 'daily', true);
    });
  }
  if (btnOpenLeaderboardEl) {
    btnOpenLeaderboardEl.addEventListener('click', () => {
      const targetMode = gameState.gameMode === 'infinite' ? 'infinite' : 'daily';
      openLeaderboardModal(gameState.dailyDifficultyMode || 'normal', targetMode, true);
    });
  }
  if (btnLeaderboardHistoryEl) {
    btnLeaderboardHistoryEl.addEventListener('click', () => {
      isDailyHistoryView = !isDailyHistoryView;
      renderCurrentLeaderboard();
    });
  }
  if (btnLeaderboardCloseEl) {
    btnLeaderboardCloseEl.addEventListener('click', closeLeaderboardModal);
  }
  if (btnLeaderboardCloseTopEl) {
    btnLeaderboardCloseTopEl.addEventListener('click', closeLeaderboardModal);
  }
  if (leaderboardModalEl) {
    leaderboardModalEl.addEventListener('click', (e) => {
      if (e.target === leaderboardModalEl) {
        closeLeaderboardModal();
      }
    });
  }
  if (leaderboardModeTabsEl) {
    leaderboardModeTabsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-lb-mode]');
      if (!btn || !btn.dataset.lbMode) return;
      activeLeaderboardMode = btn.dataset.lbMode;
      isDailyHistoryView = false;
      renderCurrentLeaderboard();
    });
  }
  if (leaderboardDiffTabsEl) {
    leaderboardDiffTabsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-lb-diff]');
      if (!btn || !btn.dataset.lbDiff) return;
      activeLeaderboardDiff = btn.dataset.lbDiff;
      renderCurrentLeaderboard();
    });
  }

  // 2. 인게임 보드 및 상단/하단 버튼 이벤트 바인딩
  bindInputEvents(boardWrapperEl, {
    onSelectRobot: handleSelectRobot,
    onMoveDirection: handleMoveDirection,
    onUndo: handleUndo,
    onReset: handleReset,
    getSelectedRobot: () => gameState.selectedRobot,
  });

  if (btnUndoEl) {
    btnUndoEl.addEventListener('click', handleUndo);
  }
  if (btnResetEl) {
    btnResetEl.addEventListener('click', handleReset);
  }
  if (btnSkipStageEl) {
    btnSkipStageEl.addEventListener('click', () => {
      playButtonClick();
      if (gameState.gameMode === 'tutorial') {
        if (isTutorialFinalStep()) {
          returnToLobby();
        } else {
          const { step } = advanceTutorialStep();
          applyTutorialStep(step);
        }
      } else {
        handleNextStage();
      }
    });
  }
  if (btnClearRetryEl) {
    btnClearRetryEl.addEventListener('click', () => {
      playButtonClick();
      if (gameState.gameMode === 'tutorial') {
        if (isTutorialFinalStep()) {
          returnToLobby();
        } else {
          handleReset();
        }
      } else {
        handleReset();
      }
    });
  }
  if (btnClearShareEl) {
    btnClearShareEl.addEventListener('click', handleShareDailyRecord);
  }
  if (btnClearNextEl) {
    btnClearNextEl.addEventListener('click', () => {
      playButtonClick();
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
    });
  }

  // 성공 결과창(clear-overlay) 닫기 및 보드 확인 모드 / 다시 열기
  const handleCloseClearOverlay = () => {
    playButtonClick();
    if (clearOverlayEl) {
      clearOverlayEl.hidden = true;
    }
    if (gameState.isCleared && btnReopenClearEl) {
      btnReopenClearEl.hidden = false;
    }
  };

  const handleReopenClearOverlay = () => {
    playButtonClick();
    if (clearOverlayEl) {
      clearOverlayEl.hidden = false;
    }
    if (btnReopenClearEl) {
      btnReopenClearEl.hidden = true;
    }
  };

  if (btnClearCloseEl) {
    btnClearCloseEl.addEventListener('click', handleCloseClearOverlay);
  }

  if (btnReopenClearEl) {
    btnReopenClearEl.addEventListener('click', handleReopenClearOverlay);
  }

  if (clearOverlayEl) {
    clearOverlayEl.addEventListener('click', (e) => {
      if (e.target === clearOverlayEl) {
        handleCloseClearOverlay();
      }
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && clearOverlayEl && !clearOverlayEl.hidden) {
      handleCloseClearOverlay();
    }
  });

  if (hudInfoPopoverEl) {
    hudInfoPopoverEl.addEventListener('click', async (e) => {
      e.stopPropagation();
      const selectBtn = e.target.closest('[data-select-diff]');
      if (!selectBtn) return;
      const newDiff = selectBtn.dataset.selectDiff;
      if (!newDiff) return;

      hideHudPopover();
      const isHell = newDiff === 'hell';
      if (isHell) {
        showPuzzleLoading(
          '🔥 HELL 구역 전환 및 맵 생성 중...',
          '10회 이상 고난도 탈출 경로와 완충 데이터를 정밀 연산하고 있습니다'
        );
        await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 30)));
      }

      try {
        if (gameState.gameMode === 'daily') {
          gameState.dailyDifficultyMode = newDiff;
          syncLobbyDifficultyUI();
          initGameState({ mode: 'daily', targetDifficulty: newDiff });
          syncInGameHeaderByMode();
          renderAll();
          trackAnalyticsView('daily', false);
        } else {
          gameState.selectedDifficultyMode = newDiff;
          syncLobbyDifficultyUI();
          initGameState({ mode: 'infinite', targetDifficulty: newDiff });
          syncInGameHeaderByMode();
          renderAll();
          trackAnalyticsView('infinite', false);
        }
      } finally {
        if (isHell) {
          hidePuzzleLoading();
        }
      }
    });
  }

  // 상단 목표 배지 / 이동 / 완충 박스 호버 설명 및 클릭 시 고정 토글
  const bindBadgeInfo = (el, type, enableHover = true) => {
    if (!el) return;
    if (enableHover) {
      el.addEventListener('mouseenter', () => {
        if (window.matchMedia('(hover: hover)').matches) {
          // 유저가 난이도 팝오버를 열어둔 상태라면 마우스 스침으로 닫히지 않도록 보호
          if (activePopoverType === 'changeDiff' || activePopoverType === 'difficulty') {
            return;
          }
          showHudPopover(type);
        }
      });
      el.addEventListener('mouseleave', () => {
        if (window.matchMedia('(hover: hover)').matches) {
          if (activePopoverType === 'changeDiff' || activePopoverType === 'difficulty') {
            return;
          }
          hideHudPopover();
        }
      });
    }
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleHudPopover(type);
    });
  };

  bindBadgeInfo(hudTargetBadgeEl, 'target', true);
  // 난이도 배지는 마우스 올릴 때가 아니라 오직 클릭/탭으로 열고 닫히도록 설정 (PC에서 난이도 버튼 안정적 클릭 보장)
  bindBadgeInfo(hudDifficultyBadgeEl, 'difficulty', false);
  bindBadgeInfo(hudMoveBoxEl, 'move', true);
  bindBadgeInfo(hudCollisionBoxEl, 'collision', true);

  if (hudDifficultyBadgeEl) {
    hudDifficultyBadgeEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        toggleHudPopover('difficulty');
      }
    });
  }

  document.addEventListener('click', () => {
    hideHudPopover();
  });

  // BGM / SFX 개별 토글 이벤트 바인딩
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

  // 모바일/브라우저 인터랙션 시 Web Audio API 언락 및 BGM 시작 (Autoplay 정책 대응)
  const cleanupAudioUnlockListeners = () => {
    window.removeEventListener('pointerdown', handleAudioUnlock);
    window.removeEventListener('touchstart', handleAudioUnlock);
    window.removeEventListener('click', handleAudioUnlock);
    window.removeEventListener('keydown', handleAudioUnlock);
  };

  const handleAudioUnlock = () => {
    unlockAudio();
    if (!isBGMMuted()) {
      startBGM();
    }
    // BGM이 성공적으로 활성화되었거나 음소거 상태인 경우 리스너 완전 해제
    if (isBGMActive() || isBGMMuted()) {
      cleanupAudioUnlockListeners();
    }
  };

  window.addEventListener('pointerdown', handleAudioUnlock, { passive: true });
  window.addEventListener('touchstart', handleAudioUnlock, { passive: true });
  window.addEventListener('click', handleAudioUnlock, { passive: true });
  window.addEventListener('keydown', handleAudioUnlock, { passive: true });
}

document.addEventListener('DOMContentLoaded', bootstrap);
