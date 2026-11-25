/**
 * @file leaderboardModal.js
 * @description 리더보드 모달 UI 및 랭킹 데이터 렌더링 모듈 (일일 챌린지 실시간 순위, 지난 1위 명예의 전당, 무한 모드 누적 점수 순위)
 */

import { gameState, getTodayKSTDateSeed, DIFF_META } from './state.js';
import {
  authState,
  fetchDailyLeaderboard,
  fetchDailyHistoryLeaderboard,
  fetchDailyHonorLeaderboard,
  fetchInfiniteLeaderboard,
  DAILY_HONOR_RANKS,
  getHonorRankInfo,
} from './api.js';
import {
  leaderboardModalEl,
  leaderboardModalTitleEl,
  leaderboardDateSubEl,
  leaderboardModeTabsEl,
  leaderboardDiffTabsEl,
  leaderboardBodyEl,
  btnLeaderboardHistoryEl,
  btnLeaderboardCloseEl,
  btnLeaderboardCloseTopEl,
  btnOpenLeaderboardEl,
} from './elements.js';
import { logger } from './logger.js';

let activeLeaderboardMode = 'daily';
let activeLeaderboardDiff = 'normal';
let isDailyHistoryView = false;
let isHonorRankGuideView = false;

/**
 * 계급별 필요 점수표 HTML을 생성합니다. (로비 드로어 & 명예 랭킹 가이드 공용)
 * @param {number|null} userScore - 로그인된 유저의 누적 명예 점수 (비로그인 시 null)
 */
export function buildHonorRankGuideHTML(userScore = null) {
  const hasUser = userScore !== null && userScore !== undefined;
  const currentTitle = hasUser ? getHonorRankInfo(userScore).current.title : null;

  const itemsHTML = DAILY_HONOR_RANKS.map((rank) => {
    const isCurrent = hasUser && rank.title === currentTitle;
    const isAchieved = hasUser && !isCurrent && Number(userScore) >= rank.minScore;
    const statusLabel = isCurrent ? '<span class="rank-guide-tag">현재</span>' : isAchieved ? '<span class="rank-guide-check">✓</span>' : '';

    return `
      <div class="rank-guide-item ${isCurrent ? 'is-current' : ''} ${isAchieved ? 'is-achieved' : ''}">
        <span class="rank-guide-name">${rank.icon} ${rank.title}${statusLabel}</span>
        <span class="rank-guide-pts">${rank.minScore.toLocaleString()}P+</span>
      </div>
    `;
  }).join('');

  return `<div class="rank-guide-grid">${itemsHTML}</div>`;
}

export function formatSubmittedTime(isoString) {
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

export function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatHistoryDate(dateSeed) {
  if (!dateSeed) return '-';
  const str = String(dateSeed);
  if (str.length === 8) {
    const mm = str.slice(4, 6);
    const dd = str.slice(6, 8);
    return `${mm}/${dd}`;
  }
  return str;
}

/**
 * 누적 점수형 순위표(명예 랭킹 / 무한 모드)를 공통 레이아웃으로 렌더링합니다.
 * 로그인 상태에서는 1~3위 + ... + 본인 및 위/아래 경쟁자를 표시합니다.
 */
function renderCumulativeLeaderboard({
  rows,
  scoreKey,
  emptyHTML,
  outOfRankTip,
  buildNickHTML,
  buildMyOutNickHTML,
}) {
  if (!rows || rows.length === 0) {
    leaderboardBodyEl.innerHTML = emptyHTML;
    return;
  }

  const myId = authState.user?.id;
  const isLoggedIn = Boolean(authState.isLoggedIn && myId);

  const headerHTML = `
    <div class="lb-header-row is-infinite">
      <span>순위</span>
      <span>대원명</span>
      <span class="lb-stat">누적 점수</span>
    </div>
  `;

  const buildRowHTML = (r, rankNum, isMe = false) => {
    const displayRank = r.rank ? Number(r.rank) : rankNum;
    let rankLabel = `${displayRank}위`;
    if (displayRank === 1) rankLabel = '🥇 1위';
    else if (displayRank === 2) rankLabel = '🥈 2위';
    else if (displayRank === 3) rankLabel = '🥉 3위';

    const nickContent = buildNickHTML
      ? buildNickHTML(r, isMe, displayRank)
      : `${escapeHTML(r.nickname)}${isMe ? ' (나)' : ''}`;

    return `
      <div class="lb-row is-infinite ${isMe ? 'is-me' : ''}">
        <span class="lb-rank">${rankLabel}</span>
        <span class="lb-nick">${nickContent}</span>
        <span class="lb-score">${Number(r[scoreKey] || 0).toLocaleString()}P</span>
      </div>
    `;
  };

  const dividerHTML = `
    <div class="lb-divider-row" aria-hidden="true">
      <span>• • •</span>
    </div>
  `;

  let rowsHTML = '';

  if (!isLoggedIn) {
    const top10HTML = rows
      .slice(0, 10)
      .map((r, idx) => buildRowHTML(r, idx + 1, false))
      .join('');
    const loginTipHTML = rows.length > 10
      ? `<div class="lb-hint-box">💡 상위 10위까지만 표시됩니다. 로그인하면 내 순위와 주변 경쟁자를 확인할 수 있습니다!</div>`
      : '';
    rowsHTML = top10HTML + loginTipHTML;
  } else {
    const myIndex = rows.findIndex((r) => r.id === myId);
    const myScore = Number(authState.user?.[scoreKey] || 0);

    if (myIndex === -1 || myScore === 0) {
      const top3HTML = rows
        .slice(0, 3)
        .map((r, idx) => buildRowHTML(r, idx + 1, r.id === myId))
        .join('');

      const myOutNick = buildMyOutNickHTML
        ? buildMyOutNickHTML(myScore)
        : `${escapeHTML(authState.user.nickname)} (나)`;

      const myOutRowHTML = `
        <div class="lb-row is-infinite is-me is-out-of-rank">
          <span class="lb-rank is-out-of-rank">순위 밖</span>
          <span class="lb-nick">${myOutNick}</span>
          <span class="lb-score">${myScore.toLocaleString()}P</span>
        </div>
      `;

      const tipHTML = `<div class="lb-hint-box">${outOfRankTip}</div>`;
      rowsHTML = top3HTML + (rows.length > 0 ? dividerHTML : '') + myOutRowHTML + tipHTML;
    } else {
      const targetIndices = new Set();
      for (let i = 0; i < Math.min(3, rows.length); i++) {
        targetIndices.add(i);
      }
      if (myIndex - 1 >= 0) targetIndices.add(myIndex - 1);
      targetIndices.add(myIndex);
      if (myIndex + 1 < rows.length) targetIndices.add(myIndex + 1);

      const sortedIndices = Array.from(targetIndices).sort((a, b) => a - b);
      const parts = [];

      for (let i = 0; i < sortedIndices.length; i++) {
        const currIdx = sortedIndices[i];
        const prevIdx = i > 0 ? sortedIndices[i - 1] : null;
        if (prevIdx !== null && currIdx > prevIdx + 1) {
          parts.push(dividerHTML);
        }
        const r = rows[currIdx];
        parts.push(buildRowHTML(r, currIdx + 1, r.id === myId));
      }

      const lastRenderedIdx = sortedIndices[sortedIndices.length - 1];
      if (lastRenderedIdx < rows.length - 1) {
        parts.push(dividerHTML);
      }

      rowsHTML = parts.join('');
    }
  }

  leaderboardBodyEl.innerHTML = headerHTML + rowsHTML;
}

export async function renderCurrentLeaderboard() {
  if (!leaderboardModalEl || !leaderboardBodyEl) return;
  leaderboardBodyEl.scrollTop = 0;

  // 1) 모드 탭 활성화 상태 동기화
  if (leaderboardModeTabsEl) {
    const modeBtns = leaderboardModeTabsEl.querySelectorAll('[data-lb-mode]');
    modeBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.lbMode === activeLeaderboardMode);
    });
  }

  // 2-A) 일일 챌린지 누적 명예 랭킹
  if (activeLeaderboardMode === 'honor') {
    if (leaderboardDiffTabsEl) leaderboardDiffTabsEl.hidden = true;
    if (btnLeaderboardHistoryEl) btnLeaderboardHistoryEl.hidden = false;

    if (isHonorRankGuideView) {
      if (leaderboardModalTitleEl) {
        leaderboardModalTitleEl.textContent = '🎖️ 대원 계급 기준표';
      }
      if (leaderboardDateSubEl) {
        leaderboardDateSubEl.textContent =
          '일일 챌린지 누적 명예 점수에 따라 영구 승급합니다 (EASY 10P · NORMAL 25P · HARD 50P · HELL 100P)';
      }
      if (btnLeaderboardHistoryEl) {
        btnLeaderboardHistoryEl.textContent = '🏆 명예 랭킹 보기';
        btnLeaderboardHistoryEl.classList.add('is-active-view');
      }

      const myScore = authState.isLoggedIn && authState.user ? Number(authState.user.total_score || 0) : null;
      leaderboardBodyEl.innerHTML = buildHonorRankGuideHTML(myScore);
      return;
    }

    if (leaderboardModalTitleEl) {
      leaderboardModalTitleEl.textContent = '🎖️ 일일 명예 랭킹';
    }
    if (leaderboardDateSubEl) {
      leaderboardDateSubEl.textContent =
        '일일 챌린지 누적 점수 & 계급 칭호 (EASY 10P · NORMAL 25P · HARD 50P · HELL 100P)';
    }
    if (btnLeaderboardHistoryEl) {
      btnLeaderboardHistoryEl.textContent = '🎖️ 계급별 필요 점수 보기';
      btnLeaderboardHistoryEl.classList.remove('is-active-view');
    }

    leaderboardBodyEl.innerHTML = `<p class="leaderboard-empty">명예 랭킹 데이터를 불러오는 중...</p>`;

    const formatHonorNick = (nickname, score, isMe) => {
      const rankInfo = getHonorRankInfo(score);
      return `<span class="lb-rank-pill">${rankInfo.current.icon} ${rankInfo.current.title}</span><span class="lb-nick-text">${escapeHTML(nickname)}${isMe ? ' (나)' : ''}</span>`;
    };

    try {
      const rows = await fetchDailyHonorLeaderboard();
      renderCumulativeLeaderboard({
        rows,
        scoreKey: 'total_score',
        emptyHTML: `
          <p class="leaderboard-empty">
            아직 일일 명예 점수를 획득한 대원이 없습니다.<br/>
            오늘의 일일 챌린지를 클리어하고 첫 계급 승급에 도전해 보세요!
          </p>
        `,
        outOfRankTip:
          '💡 오늘의 일일 챌린지를 난이도별로 첫 클리어할 때마다 명예 점수와 계급이 영구 누적됩니다!',
        buildNickHTML: (r, isMe) => formatHonorNick(r.nickname, r.total_score, isMe),
        buildMyOutNickHTML: (myScore) =>
          formatHonorNick(authState.user?.nickname, myScore, true),
      });
    } catch (err) {
      leaderboardBodyEl.innerHTML = `<p class="leaderboard-empty">명예 랭킹을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>`;
    }
    return;
  }

  // 2-B) 무한 모드 (누적 점수) 순위표
  if (activeLeaderboardMode === 'infinite') {
    if (btnLeaderboardHistoryEl) btnLeaderboardHistoryEl.hidden = true;
    if (leaderboardModalTitleEl) {
      leaderboardModalTitleEl.textContent = '🏆 무한 모드 순위표';
    }
    if (leaderboardDateSubEl) {
      leaderboardDateSubEl.textContent = authState.isLoggedIn && authState.user
        ? '상위 1~3위 명예의 전당 및 나의 경쟁 구역 순위 (EASY 10P · NORMAL 25P · HARD 50P · HELL 100P)'
        : '완벽 클리어(최단 이동 · 최대 완충) 누적 점수 랭킹 (EASY 10P · NORMAL 25P · HARD 50P · HELL 100P)';
    }
    if (leaderboardDiffTabsEl) {
      leaderboardDiffTabsEl.hidden = true;
    }

    leaderboardBodyEl.innerHTML = `<p class="leaderboard-empty">순위 데이터를 불러오는 중...</p>`;

    try {
      const rows = await fetchInfiniteLeaderboard();
      renderCumulativeLeaderboard({
        rows,
        scoreKey: 'infinite_score',
        emptyHTML: `
          <p class="leaderboard-empty">
            아직 무한 모드 누적 점수를 획득한 대원이 없습니다.<br/>
            무한 모드에서 최단 이동 · 최대 완충 클리어로 첫 랭커가 되어 보세요!
          </p>
        `,
        outOfRankTip:
          '💡 무한 모드 완벽 클리어 시 누적 점수가 적립되어 순위표에 진입합니다!',
      });
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
    const isLoggedIn = Boolean(authState.isLoggedIn && myId);
    const displayRows = isLoggedIn ? rows : rows.slice(0, 10);

    const headerHTML = `
      <div class="lb-header-row">
        <span>순위</span>
        <span>대원명</span>
        <span class="lb-stat">이동</span>
        <span class="lb-stat">완충</span>
        <span class="lb-time">달성 시각</span>
      </div>
    `;

    const rowsHTML = displayRows
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

    const loginTipHTML = !isLoggedIn && rows.length > 10
      ? `<div class="lb-hint-box">💡 상위 10위까지만 표시됩니다. 로그인하면 전체 순위와 내 기록을 확인할 수 있습니다!</div>`
      : '';

    leaderboardBodyEl.innerHTML = headerHTML + rowsHTML + loginTipHTML;
  } catch (err) {
    leaderboardBodyEl.innerHTML = `<p class="leaderboard-empty">순위표를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>`;
  }
}

export function closeLeaderboardModal() {
  if (leaderboardModalEl) leaderboardModalEl.hidden = true;
  isDailyHistoryView = false;
  isHonorRankGuideView = false;
}

export async function openLeaderboardModal(
  diffId = gameState.dailyDifficultyMode || 'normal',
  mode = activeLeaderboardMode,
  resetHistoryView = true
) {
  if (!leaderboardModalEl || !leaderboardBodyEl) return;
  const validMode = mode === 'infinite' || mode === 'honor' ? mode : 'daily';
  activeLeaderboardMode = validMode;
  activeLeaderboardDiff = diffId || activeLeaderboardDiff || 'normal';
  if (resetHistoryView) {
    isDailyHistoryView = false;
    isHonorRankGuideView = false;
  }

  leaderboardModalEl.hidden = false;
  logger.track('leaderboard_view', {
    mode: activeLeaderboardMode,
    difficulty: activeLeaderboardDiff,
  });
  await renderCurrentLeaderboard();
}

/**
 * 리더보드 모달 이벤트 바인딩
 */
export function initLeaderboardModal() {
  if (btnOpenLeaderboardEl) {
    btnOpenLeaderboardEl.addEventListener('click', () => {
      const targetMode = gameState.gameMode === 'infinite' ? 'infinite' : 'daily';
      openLeaderboardModal(gameState.dailyDifficultyMode || 'normal', targetMode, true);
    });
  }
  if (btnLeaderboardHistoryEl) {
    btnLeaderboardHistoryEl.addEventListener('click', () => {
      if (activeLeaderboardMode === 'honor') {
        isHonorRankGuideView = !isHonorRankGuideView;
      } else {
        isDailyHistoryView = !isDailyHistoryView;
      }
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

  // 데스크톱 키보드 ESC 키 모달 닫기 지원
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && leaderboardModalEl && !leaderboardModalEl.hidden) {
      closeLeaderboardModal();
    }
  });
  if (leaderboardModeTabsEl) {
    leaderboardModeTabsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-lb-mode]');
      if (!btn || !btn.dataset.lbMode) return;
      activeLeaderboardMode = btn.dataset.lbMode;
      isDailyHistoryView = false;
      isHonorRankGuideView = false;
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
}
