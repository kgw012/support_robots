/**
 * @file clearModal.js
 * @description 퍼즐 클리어 결과 오버레이, 보상 지급/기록 제출 및 SNS 공유 모듈
 */

import { gameState, updateBestRecord, getTodayKSTDateSeed, DIFF_META } from './state.js';
import { getCurrentTutorialStep, isTutorialFinalStep } from './tutorial.js';
import {
  authState,
  submitDailyChallengeRecord,
  addInfiniteModeScore,
  INFINITE_DIFF_POINTS,
} from './api.js';
import { playButtonClick } from './audio.js';
import { logger } from './logger.js';
import {
  clearOverlayEl,
  btnClearRetryEl,
  btnClearNextEl,
  btnClearShareEl,
  btnClearShareTextEl,
  clearModeRewardEl,
  btnClearCloseEl,
  btnReopenClearEl,
} from './elements.js';

let shareFeedbackTimer = null;
let onRetryCallback = null;
let onNextCallback = null;

export function showShareFeedback(message) {
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
export async function handleShareDailyRecord() {
  playButtonClick();

  const diffKey = gameState.dailyDifficultyMode || 'normal';
  const diffLabel = DIFF_META[diffKey]?.label || diffKey.toUpperCase();

  const origin =
    typeof window !== 'undefined' && window.location && window.location.origin
      ? window.location.origin
      : 'https://supportrobots.vercel.app';
  const shareUrl = origin;

  const fullShareText = `🤖 서포트 로봇 일일 챌린지 [${diffLabel}]\n🎯 ${gameState.moveCount}회 이동 · 완충 ${gameState.collisionCount}회로 구조 성공!\n${shareUrl}`;

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
        return;
      }
    }
  }

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
    logger.track('record_shared', {
      isLoggedIn: authState.isLoggedIn,
      mode: 'daily',
      difficulty: diffKey,
      method: typeof navigator !== 'undefined' && navigator.clipboard ? 'clipboard' : 'fallback',
    });
    showShareFeedback('✅ 클립보드 복사 완료!');
  } else {
    logger.warn('Share copy failed', { diffKey });
    showShareFeedback('⚠️ 복사 실패 (직접 복사해 주세요)');
  }
}

/**
 * 클리어 시 모드별 보상/기록 자동 제출 처리
 * @param {{ isOptimal: boolean, message: string } | null} solverFeedback
 * @param {Function} [onScoreSync] 점수 갱신 후 UI 동기화 콜백
 */
export async function handleModeClearSubmission(solverFeedback, onScoreSync) {
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
        logger.warn('Challenge record submission rejected', { res, dateSeed: gameState.dateSeed });
        clearModeRewardEl.textContent = '⚠️ 기록 제출에 실패했습니다. 로그인 상태를 확인해 주세요.';
      }
    } catch (err) {
      logger.error('Failed to submit challenge record', err, { dateSeed: gameState.dateSeed });
      clearModeRewardEl.textContent = '⚠️ 네트워크 오류로 기록을 제출하지 못했습니다.';
    }
    return;
  }

  // 무한 모드: 최단 이동 & 최대 완충(isOptimal) 완벽 달성 시에만 점수 지급
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
      if (typeof onScoreSync === 'function') {
        onScoreSync();
      }
    }
  } catch (_) {
    clearModeRewardEl.textContent = `✨ 완벽 클리어 보너스 +${expectedPts}P`;
  }
}

/**
 * 클리어 오버레이 열기 및 모드별 UI 구성
 */
export function openClearOverlay(solverFeedback, onScoreSync) {
  if (!clearOverlayEl) return;

  const isTutorial = gameState.gameMode === 'tutorial';
  const isDaily = gameState.gameMode === 'daily';
  const clearTitleEl = clearOverlayEl.querySelector('.clear-title');

  if (btnReopenClearEl) btnReopenClearEl.hidden = true;

  if (isTutorial) {
    const step = getCurrentTutorialStep();
    const isFinal = isTutorialFinalStep();

    if (step.stepIndex === 3) {
      if (gameState.collisionCount === 0) {
        if (clearTitleEl) clearTitleEl.textContent = '⚠️ 외벽 충돌 (완충 0회)';
        if (btnClearNextEl) btnClearNextEl.hidden = true;
        if (btnClearRetryEl) {
          btnClearRetryEl.hidden = false;
          btnClearRetryEl.textContent = '다시 연습 (완충 도전)';
          btnClearRetryEl.classList.add('is-pulse-focus');
        }
      } else {
        if (clearTitleEl) clearTitleEl.textContent = '🎉 3단계 성공!';
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
      if (clearTitleEl) clearTitleEl.textContent = step.clearTitle;
      if (btnClearNextEl) btnClearNextEl.textContent = isFinal ? '메인 로비로' : '다음 단계로 ▸';
      if (btnClearRetryEl) {
        btnClearRetryEl.hidden = isFinal;
        btnClearRetryEl.textContent = '다시 연습';
        btnClearRetryEl.classList.remove('is-pulse-focus');
      }
    }

    if (btnClearShareEl) btnClearShareEl.hidden = true;
  } else {
    if (clearTitleEl) clearTitleEl.textContent = '구조 성공!';
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

  handleModeClearSubmission(solverFeedback, onScoreSync);
}

export function handleCloseClearOverlay() {
  playButtonClick();
  if (clearOverlayEl) {
    clearOverlayEl.hidden = true;
  }
  if (gameState.isCleared && btnReopenClearEl) {
    btnReopenClearEl.hidden = false;
  }
}

export function handleReopenClearOverlay() {
  playButtonClick();
  if (clearOverlayEl) {
    clearOverlayEl.hidden = false;
  }
  if (btnReopenClearEl) {
    btnReopenClearEl.hidden = true;
  }
}

/**
 * 클리어 오버레이 이벤트 바인딩
 */
export function initClearModal({ onRetry, onNext }) {
  onRetryCallback = onRetry;
  onNextCallback = onNext;

  if (btnClearRetryEl) {
    btnClearRetryEl.addEventListener('click', () => {
      playButtonClick();
      if (typeof onRetryCallback === 'function') {
        onRetryCallback();
      }
    });
  }

  if (btnClearShareEl) {
    btnClearShareEl.addEventListener('click', handleShareDailyRecord);
  }

  if (btnClearNextEl) {
    btnClearNextEl.addEventListener('click', () => {
      playButtonClick();
      if (typeof onNextCallback === 'function') {
        onNextCallback();
      }
    });
  }

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
}
