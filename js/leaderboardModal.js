/**
 * @file leaderboardModal.js
 * @description 리더보드 모달 UI 및 랭킹 데이터 렌더링 모듈 (일일 챌린지 실시간 순위, 지난 1위 명예의 전당, 무한 모드 누적 점수 순위)
 */

import { gameState, getTodayKSTDateSeed, DIFF_META } from './state.js';
import {
  authState,
  fetchDailyLeaderboard,
  fetchDailyHistoryLeaderboard,
  fetchInfiniteLeaderboard,
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

let activeLeaderboardMode = 'daily';
let activeLeaderboardDiff = 'normal';
let isDailyHistoryView = false;

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

export async function renderCurrentLeaderboard() {
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

        return `
          <div class="lb-row is-infinite ${isMe ? 'is-me' : ''}">
            <span class="lb-rank">${rankLabel}</span>
            <span class="lb-nick">${escapeHTML(r.nickname)}${isMe ? ' (나)' : ''}</span>
            <span class="lb-score">${Number(r.infinite_score || 0).toLocaleString()}P</span>
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
        // 비로그인 시: 전체 순위표 그대로 출력
        rowsHTML = rows
          .map((r, idx) => buildRowHTML(r, idx + 1, false))
          .join('');
      } else {
        // 로그인 시: 1~3위 + ... + 본인 및 바로 위/아래 경쟁자 표시
        const myIndex = rows.findIndex((r) => r.id === myId);
        const myScore = Number(authState.user?.infinite_score || 0);

        if (myIndex === -1 || myScore === 0) {
          // 0점이거나 랭킹에 없는 경우: 1~3위 + ... + 본인(순위 밖, 0P)
          const top3HTML = rows
            .slice(0, 3)
            .map((r, idx) => buildRowHTML(r, idx + 1, r.id === myId))
            .join('');

          const myOutRowHTML = `
            <div class="lb-row is-infinite is-me is-out-of-rank">
              <span class="lb-rank is-out-of-rank">순위 밖</span>
              <span class="lb-nick">${escapeHTML(authState.user.nickname)} (나)</span>
              <span class="lb-score">${myScore.toLocaleString()}P</span>
            </div>
          `;

          const tipHTML = `
            <div class="lb-hint-box">
              💡 무한 모드 완벽 클리어 시 누적 점수가 적립되어 순위표에 진입합니다!
            </div>
          `;

          rowsHTML = top3HTML + (rows.length > 0 ? dividerHTML : '') + myOutRowHTML + tipHTML;
        } else {
          // 랭킹에 존재하는 경우
          const targetIndices = new Set();

          // 1~3위 추가
          for (let i = 0; i < Math.min(3, rows.length); i++) {
            targetIndices.add(i);
          }

          // 본인 바로 위 경쟁자
          if (myIndex - 1 >= 0) targetIndices.add(myIndex - 1);
          // 본인
          targetIndices.add(myIndex);
          // 본인 바로 아래 경쟁자
          if (myIndex + 1 < rows.length) targetIndices.add(myIndex + 1);

          const sortedIndices = Array.from(targetIndices).sort((a, b) => a - b);
          const parts = [];

          for (let i = 0; i < sortedIndices.length; i++) {
            const currIdx = sortedIndices[i];
            const prevIdx = i > 0 ? sortedIndices[i - 1] : null;

            // 이전 항목과 2칸 이상 떨어져 있다면 중간에 ... 삽입
            if (prevIdx !== null && currIdx > prevIdx + 1) {
              parts.push(dividerHTML);
            }

            const r = rows[currIdx];
            parts.push(buildRowHTML(r, currIdx + 1, r.id === myId));
          }

          // 본인 아래에 더 많은 랭커가 남아있다면 하단 생략선 추가
          const lastRenderedIdx = sortedIndices[sortedIndices.length - 1];
          if (lastRenderedIdx < rows.length - 1) {
            parts.push(dividerHTML);
          }

          rowsHTML = parts.join('');
        }
      }

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

export function closeLeaderboardModal() {
  if (leaderboardModalEl) leaderboardModalEl.hidden = true;
  isDailyHistoryView = false;
}

export async function openLeaderboardModal(
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
}
