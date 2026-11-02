/**
 * @file lobbyController.js
 * @description 메인 로비 화면 제어, 계정 인증(로그인/가입/로그아웃), 난이도 선택 드로어 및 조작 가이드 모달 모듈
 */

import { gameState, getTodayKSTDateSeed, DIFF_META, warmupDailyChallenge } from './state.js';
import {
  authState,
  loginOrRegisterUser,
  logoutUser,
} from './api.js';
import {
  isBGMMuted,
  isSFXMuted,
  playButtonClick,
} from './audio.js';
import { logger } from './logger.js';
import {
  authLoginFormEl,
  inputNicknameEl,
  inputPasswordEl,
  btnAuthSubmitEl,
  authFeedbackMsgEl,
  authUserViewEl,
  authUserNicknameEl,
  authUserInfScoreEl,
  btnAuthLogoutEl,
  btnLoreToggleEl,
  lobbyLoreBodyEl,
  loreToggleBadgeEl,
  loreToggleLabelEl,
  loreToggleIconEl,
  btnModeDailyEl,
  lobbyDailyDateBadgeEl,
  btnLobbyDailyDiffEl,
  lobbyDailyDiffLabelEl,
  lobbyDailyDiffDrawerEl,
  btnModeInfiniteEl,
  btnLobbyDiffEl,
  lobbyDiffLabelEl,
  lobbyDiffDrawerEl,
  btnHowToPlayEl,
  btnLobbyGuideTextEl,
  btnLobbyLeaderboardEl,
  howtoModalEl,
  btnHowtoCloseEl,
  btnHowtoCloseTopEl,
  lobbyToastEl,
  btnBgmToggleLobbyEl,
  btnSfxToggleLobbyEl,
  btnBgmToggleGameEl,
  btnSfxToggleGameEl,
} from './elements.js';

let lobbyToastTimer = null;
let lockoutTimer = null;
const LOCKOUT_STORAGE_KEY = 'sr_auth_lockout_until';

/**
 * 활성 계정 잠금 카운트다운 타이머 중지
 */
function clearLockoutCountdown() {
  if (lockoutTimer) {
    clearInterval(lockoutTimer);
    lockoutTimer = null;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(LOCKOUT_STORAGE_KEY);
    } catch (_) {}
  }
}

/**
 * 현재 잠금 상태 여부 반환
 */
function isLockoutActive() {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    const until = parseInt(window.localStorage.getItem(LOCKOUT_STORAGE_KEY) || '0', 10);
    return until > Date.now();
  } catch (_) {
    return false;
  }
}

/**
 * 계정 잠금 카운트다운 시작
 * @param {number} totalSeconds
 */
function startLockoutCountdown(totalSeconds) {
  clearLockoutCountdown();
  const until = Date.now() + Math.max(1, totalSeconds) * 1000;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(LOCKOUT_STORAGE_KEY, String(until));
    } catch (_) {}
  }

  const updateTick = () => {
    const diffMs = until - Date.now();
    if (diffMs <= 0) {
      clearLockoutCountdown();
      if (btnAuthSubmitEl) btnAuthSubmitEl.disabled = false;
      showAuthFeedback('계정 잠금이 해제되었습니다. 다시 접속해 주세요.', true, false);
      return;
    }

    const remainSec = Math.ceil(diffMs / 1000);
    const m = Math.floor(remainSec / 60);
    const s = String(remainSec % 60).padStart(2, '0');
    if (btnAuthSubmitEl) btnAuthSubmitEl.disabled = true;
    showAuthFeedback(
      `⏳ 계정보호를 위해 임시 잠금되었습니다. (${m}분 ${s}초 후 재시도 가능)`,
      false,
      true
    );
  };

  updateTick();
  lockoutTimer = setInterval(updateTick, 1000);
}

/**
 * 저장된 잠금 만료 시간 확인 및 복원
 */
function checkStoredLockout() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const raw = window.localStorage.getItem(LOCKOUT_STORAGE_KEY);
    if (!raw) return;
    const until = parseInt(raw, 10);
    const diffSec = Math.ceil((until - Date.now()) / 1000);
    if (diffSec > 0) {
      startLockoutCountdown(diffSec);
    } else {
      window.localStorage.removeItem(LOCKOUT_STORAGE_KEY);
    }
  } catch (_) {}
}

export function syncAuthUI() {
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

export function showAuthFeedback(msg, isOk = false, isLocked = false) {
  if (!authFeedbackMsgEl) return;
  authFeedbackMsgEl.textContent = msg;
  authFeedbackMsgEl.classList.toggle('is-ok', isOk);
  authFeedbackMsgEl.classList.toggle('is-locked', isLocked);
  authFeedbackMsgEl.hidden = false;
}

export function syncLobbyDifficultyUI() {
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

export function showLobbyToast(message) {
  if (!lobbyToastEl) return;
  lobbyToastEl.textContent = message;
  lobbyToastEl.hidden = false;
  if (lobbyToastTimer) clearTimeout(lobbyToastTimer);
  lobbyToastTimer = setTimeout(() => {
    if (lobbyToastEl) lobbyToastEl.hidden = true;
  }, 3000);
}

export function syncSoundUI() {
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

export function openHowtoModal() {
  playButtonClick();
  if (howtoModalEl) howtoModalEl.hidden = false;
}

export function closeHowtoModal() {
  playButtonClick();
  if (howtoModalEl) howtoModalEl.hidden = true;
}

/**
 * 로비 인터랙션 및 계정 인증 이벤트 바인딩
 */
export function initLobbyEvents({
  onStartDaily,
  onStartInfinite,
  onStartTutorial,
  onOpenLeaderboard,
}) {
  // 로비 초기화 시 기존 계정 잠금 여부 복원
  checkStoredLockout();

  // 0. 로그인 / 자동 가입 폼 이벤트
  if (authLoginFormEl) {
    authLoginFormEl.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!inputNicknameEl || !inputPasswordEl) return;

      if (isLockoutActive()) {
        showLobbyToast('계정보호를 위해 잠금 처리된 상태입니다. 잠시 후 시도해 주세요.');
        return;
      }

      if (btnAuthSubmitEl) btnAuthSubmitEl.disabled = true;
      showAuthFeedback('인증 확인 중...', true);

      try {
        const res = await loginOrRegisterUser(
          inputNicknameEl.value,
          inputPasswordEl.value
        );
        if (!res.ok) {
          logger.warn('User auth failed', { message: res.message });
          if (res.locked) {
            startLockoutCountdown(res.remainingSeconds || 60);
          } else {
            showAuthFeedback(res.message, false);
          }
        } else {
          clearLockoutCountdown();
          logger.track('auth_success', { isNew: Boolean(res.isNew) });
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
        logger.error('Auth request exception', err);
        showAuthFeedback('서버 통신에 실패했습니다. 잠시 후 다시 시도해 주세요.', false);
      } finally {
        if (!isLockoutActive() && btnAuthSubmitEl) {
          btnAuthSubmitEl.disabled = false;
        }
      }
    });
  }

  if (btnAuthLogoutEl) {
    btnAuthLogoutEl.addEventListener('click', () => {
      logger.track('user_logout');
      logoutUser();
      syncAuthUI();
      showLobbyToast('로그아웃되었습니다.');
    });
  }

  // 1. 작전 브리핑(세계관) 아코디언 펼치기/접기
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

  // 2. 일일 챌린지 난이도 서랍 토글 및 선택
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
      warmupDailyChallenge(gameState.dailyDifficultyMode);
    });
  }

  if (btnModeDailyEl) {
    const handleDailyClick = (e) => {
      if (e.target.closest('#btn-lobby-daily-diff')) return;
      playButtonClick();
      if (typeof onStartDaily === 'function') onStartDaily();
    };
    btnModeDailyEl.addEventListener('click', handleDailyClick);
    btnModeDailyEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleDailyClick(e);
      }
    });
  }

  // 3. 무한 모드 난이도 서랍 토글 및 선택
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
    const handleInfiniteClick = (e) => {
      if (e.target.closest('#btn-lobby-diff')) return;
      playButtonClick();
      if (typeof onStartInfinite === 'function') onStartInfinite();
    };
    btnModeInfiniteEl.addEventListener('click', handleInfiniteClick);
    btnModeInfiniteEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleInfiniteClick(e);
      }
    });
  }

  // 4. 로비 리더보드 버튼
  if (btnLobbyLeaderboardEl) {
    btnLobbyLeaderboardEl.addEventListener('click', () => {
      if (typeof onOpenLeaderboard === 'function') {
        onOpenLeaderboard(gameState.dailyDifficultyMode || 'normal', 'daily', true);
      }
    });
  }

  // 5. 튜토리얼 및 조작법 모달
  if (btnHowToPlayEl) {
    const handleTutorialClick = (e) => {
      if (e.target.closest('#btn-lobby-guide-text')) return;
      playButtonClick();
      if (typeof onStartTutorial === 'function') onStartTutorial();
    };
    btnHowToPlayEl.addEventListener('click', handleTutorialClick);
    btnHowToPlayEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleTutorialClick(e);
      }
    });
  }

  if (btnLobbyGuideTextEl) {
    btnLobbyGuideTextEl.addEventListener('click', (e) => {
      e.stopPropagation();
      openHowtoModal();
    });
  }

  if (btnHowtoCloseEl) btnHowtoCloseEl.addEventListener('click', closeHowtoModal);
  if (btnHowtoCloseTopEl) btnHowtoCloseTopEl.addEventListener('click', closeHowtoModal);
  if (howtoModalEl) {
    howtoModalEl.addEventListener('click', (e) => {
      if (e.target === howtoModalEl) {
        closeHowtoModal();
      }
    });
  }

  // 데스크톱 키보드 ESC 키 조작법 모달 닫기 지원
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && howtoModalEl && !howtoModalEl.hidden) {
      closeHowtoModal();
    }
  });
}
