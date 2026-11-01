/**
 * @file elements.js
 * @description 애플리케이션 전역 DOM 요소 캐시 모듈 (단일 진실 공급원)
 */

// 로비 화면 및 인증/계정 관련 DOM
export const lobbyScreenEl = document.getElementById('lobby-screen');
export const gameScreenEl = document.getElementById('game-screen');
export const btnLoreToggleEl = document.getElementById('btn-lore-toggle');
export const lobbyLoreBodyEl = document.getElementById('lobby-lore-body');
export const loreToggleBadgeEl = document.getElementById('lore-toggle-badge');
export const loreToggleLabelEl = document.getElementById('lore-toggle-label');
export const loreToggleIconEl = document.getElementById('lore-toggle-icon');

export const authLoginFormEl = document.getElementById('auth-login-form');
export const inputNicknameEl = document.getElementById('input-nickname');
export const inputPasswordEl = document.getElementById('input-password');
export const btnAuthSubmitEl = document.getElementById('btn-auth-submit');
export const authFeedbackMsgEl = document.getElementById('auth-feedback-msg');
export const authUserViewEl = document.getElementById('auth-user-view');
export const authUserNicknameEl = document.getElementById('auth-user-nickname');
export const authUserInfScoreEl = document.getElementById('auth-user-inf-score');
export const btnAuthLogoutEl = document.getElementById('btn-auth-logout');

export const btnModeDailyEl = document.getElementById('btn-mode-daily');
export const lobbyDailyDateBadgeEl = document.getElementById('lobby-daily-date-badge');
export const btnLobbyDailyDiffEl = document.getElementById('btn-lobby-daily-diff');
export const lobbyDailyDiffLabelEl = document.getElementById('lobby-daily-diff-label');
export const lobbyDailyDiffDrawerEl = document.getElementById('lobby-daily-diff-drawer');

export const btnModeInfiniteEl = document.getElementById('btn-mode-infinite');
export const btnLobbyDiffEl = document.getElementById('btn-lobby-diff');
export const lobbyDiffLabelEl = document.getElementById('lobby-diff-label');
export const lobbyDiffDrawerEl = document.getElementById('lobby-diff-drawer');

export const btnHowToPlayEl = document.getElementById('btn-how-to-play');
export const btnLobbyGuideTextEl = document.getElementById('btn-lobby-guide-text');
export const btnLobbyLeaderboardEl = document.getElementById('btn-lobby-leaderboard');
export const howtoModalEl = document.getElementById('howto-modal');
export const btnHowtoCloseEl = document.getElementById('btn-howto-close');
export const btnHowtoCloseTopEl = document.getElementById('btn-howto-close-top');
export const lobbyToastEl = document.getElementById('lobby-toast');

// 사운드 토글 버튼
export const btnBgmToggleLobbyEl = document.getElementById('btn-bgm-toggle-lobby');
export const btnSfxToggleLobbyEl = document.getElementById('btn-sfx-toggle-lobby');
export const btnBgmToggleGameEl = document.getElementById('btn-bgm-toggle-game');
export const btnSfxToggleGameEl = document.getElementById('btn-sfx-toggle-game');

// 인게임 상단 헤더 & 네비게이션
export const btnBackLobbyEl = document.getElementById('btn-back-lobby');
export const hudModeTitleEl = document.getElementById('hud-mode-title');
export const btnOpenLeaderboardEl = document.getElementById('btn-open-leaderboard');
export const btnViewSolutionEl = document.getElementById('btn-view-solution');

// 로딩 오버레이 & 이탈 확인 모달 & 일일 챌린지 만료 모달 & 무한 모드 정답 모달
export const puzzleLoadingOverlayEl = document.getElementById('puzzle-loading-overlay');
export const loadingTitleEl = document.getElementById('loading-title');
export const loadingSubEl = document.getElementById('loading-sub');
export const leaveConfirmModalEl = document.getElementById('leave-confirm-modal');
export const btnLeaveStayEl = document.getElementById('btn-leave-stay');
export const btnLeaveConfirmEl = document.getElementById('btn-leave-confirm');
export const dailyExpiredModalEl = document.getElementById('daily-expired-modal');
export const btnDailyExpiredConfirmEl = document.getElementById('btn-daily-expired-confirm');

export const solutionConfirmModalEl = document.getElementById('solution-confirm-modal');
export const btnSolutionCancelEl = document.getElementById('btn-solution-cancel');
export const btnSolutionConfirmEl = document.getElementById('btn-solution-confirm');

export const solutionViewModalEl = document.getElementById('solution-view-modal');
export const solutionViewTitleEl = document.getElementById('solution-view-title');
export const solutionViewBadgeEl = document.getElementById('solution-view-badge');
export const solutionViewImgEl = document.getElementById('solution-view-img');
export const solutionViewLoadingEl = document.getElementById('solution-view-loading');
export const btnSolutionViewCloseEl = document.getElementById('btn-solution-view-close');
export const btnSolutionViewCloseTopEl = document.getElementById('btn-solution-view-close-top');

// 인게임 상단 HUD 팝오버
export const hudTargetBadgeEl = document.getElementById('hud-target-badge');
export const hudDifficultyBadgeEl = document.getElementById('hud-difficulty-badge');
export const hudMoveBoxEl = document.getElementById('hud-move-box');
export const hudCollisionBoxEl = document.getElementById('hud-collision-box');
export const hudInfoPopoverEl = document.getElementById('hud-info-popover');

// 튜토리얼 카드 & 제스처 가이드
export const tutorialGuideCardEl = document.getElementById('tutorial-guide-card');
export const tutorialStepTagEl = document.getElementById('tutorial-step-tag');
export const tutorialStepTitleEl = document.getElementById('tutorial-step-title');
export const tutorialStepDescEl = document.getElementById('tutorial-step-desc');
export const tutorialStepHintEl = document.getElementById('tutorial-step-hint');
export const tutorialGestureLayerEl = document.getElementById('tutorial-gesture-layer');
export const tutorialFingerEl = document.getElementById('tutorial-finger');

// 보드 및 하단 조작 컨트롤
export const boardWrapperEl = document.querySelector('.board-wrapper');
export const boardGridEl = document.getElementById('board-grid');
export const robotsLayerEl = document.getElementById('robots-layer');
export const btnUndoEl = document.getElementById('btn-undo');
export const btnResetEl = document.getElementById('btn-reset');
export const btnSkipStageEl = document.getElementById('btn-skip-stage');

// 클리어 결과 오버레이
export const clearOverlayEl = document.getElementById('clear-overlay');
export const btnClearRetryEl = document.getElementById('btn-clear-retry');
export const btnClearNextEl = document.getElementById('btn-clear-next');
export const btnClearShareEl = document.getElementById('btn-clear-share');
export const btnClearShareTextEl = document.getElementById('btn-clear-share-text');
export const btnClearPhotoEl = document.getElementById('btn-clear-photo');
export const btnClearPhotoTextEl = document.getElementById('btn-clear-photo-text');
export const clearModeRewardEl = document.getElementById('clear-mode-reward');
export const btnClearCloseEl = document.getElementById('btn-clear-close');
export const btnReopenClearEl = document.getElementById('btn-reopen-clear');

// 리더보드 모달
export const leaderboardModalEl = document.getElementById('leaderboard-modal');
export const leaderboardModalTitleEl = document.getElementById('leaderboard-modal-title');
export const leaderboardDateSubEl = document.getElementById('leaderboard-date-subtitle');
export const leaderboardModeTabsEl = document.getElementById('leaderboard-mode-tabs');
export const leaderboardDiffTabsEl = document.getElementById('leaderboard-diff-tabs');
export const leaderboardBodyEl = document.getElementById('leaderboard-body');
export const btnLeaderboardHistoryEl = document.getElementById('btn-leaderboard-history');
export const btnLeaderboardCloseEl = document.getElementById('btn-leaderboard-close');
export const btnLeaderboardCloseTopEl = document.getElementById('btn-leaderboard-close-top');

