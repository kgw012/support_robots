/**
 * @file main.js
 * @description 애플리케이션 진입점 및 이벤트 바인딩 (1~5단계)
 */

import {
  gameState,
  initGameState,
  recordMoveForUndo,
  undoLastMove,
  resetCurrentRound,
  updateBestRecord,
  scheduleBackgroundRefill,
} from './state.js';
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

const lobbyScreenEl = document.getElementById('lobby-screen');
const gameScreenEl = document.getElementById('game-screen');
const btnLoreToggleEl = document.getElementById('btn-lore-toggle');
const lobbyLoreBodyEl = document.getElementById('lobby-lore-body');
const loreToggleBadgeEl = document.getElementById('lore-toggle-badge');
const btnModeDailyEl = document.getElementById('btn-mode-daily');
const btnModeInfiniteEl = document.getElementById('btn-mode-infinite');
const btnLobbyDiffEl = document.getElementById('btn-lobby-diff');
const lobbyDiffLabelEl = document.getElementById('lobby-diff-label');
const lobbyDiffDrawerEl = document.getElementById('lobby-diff-drawer');
const btnHowToPlayEl = document.getElementById('btn-how-to-play');
const howtoModalEl = document.getElementById('howto-modal');
const btnHowtoCloseEl = document.getElementById('btn-howto-close');
const btnHowtoCloseTopEl = document.getElementById('btn-howto-close-top');
const lobbyToastEl = document.getElementById('lobby-toast');
const btnBackLobbyEl = document.getElementById('btn-back-lobby');
const btnChangeDifficultyEl = document.getElementById('btn-change-difficulty');

const boardWrapperEl = document.querySelector('.board-wrapper');
const boardGridEl = document.getElementById('board-grid');
const robotsLayerEl = document.getElementById('robots-layer');
const btnUndoEl = document.getElementById('btn-undo');
const btnResetEl = document.getElementById('btn-reset');
const btnSkipStageEl = document.getElementById('btn-skip-stage');
const btnClearRetryEl = document.getElementById('btn-clear-retry');
const btnClearNextEl = document.getElementById('btn-clear-next');
const hudTargetBadgeEl = document.getElementById('hud-target-badge');
const hudDifficultyBadgeEl = document.getElementById('hud-difficulty-badge');
const hudMoveBoxEl = document.getElementById('hud-move-box');
const hudCollisionBoxEl = document.getElementById('hud-collision-box');
const hudInfoPopoverEl = document.getElementById('hud-info-popover');

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

function buildChangeDifficultyPopoverHTML() {
  const currentDiff = gameState.selectedDifficultyMode || 'normal';
  const items = Object.entries(DIFF_META)
    .map(([diffId, meta]) => {
      const activeClass = diffId === currentDiff ? 'is-active' : '';
      return `
        <button type="button" class="popover-diff-select-btn ${activeClass}" data-select-diff="${diffId}">
          <span class="difficulty-badge diff-${diffId}">${meta.label}</span>
          <span>${meta.range}</span>
        </button>
      `;
    })
    .join('');

  return `
    <strong>무한 모드 난이도 변경 (선택 시 즉시 새 문제 출제)</strong>
    <div class="popover-diff-grid">
      ${items}
    </div>
  `;
}

function showHudPopover(type) {
  if (!hudInfoPopoverEl) return;
  if (type === 'changeDiff') {
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

function syncLobbyDifficultyUI() {
  const diffId = gameState.selectedDifficultyMode || 'normal';
  const meta = DIFF_META[diffId] || DIFF_META.normal;

  if (btnLobbyDiffEl) {
    btnLobbyDiffEl.className = `lobby-diff-badge difficulty-badge diff-${diffId}`;
  }
  if (lobbyDiffLabelEl) {
    lobbyDiffLabelEl.textContent = meta.label;
  }
  if (lobbyDiffDrawerEl) {
    const btns = lobbyDiffDrawerEl.querySelectorAll('.drawer-diff-btn');
    btns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.diff === diffId);
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
  }, 2800);
}

function enterInfiniteMode() {
  if (lobbyScreenEl) lobbyScreenEl.hidden = true;
  if (gameScreenEl) gameScreenEl.hidden = false;
  if (lobbyDiffDrawerEl) lobbyDiffDrawerEl.hidden = true;

  initGameState({ targetDifficulty: gameState.selectedDifficultyMode });
  renderAll();
}

function returnToLobby() {
  hideHudPopover();
  syncLobbyDifficultyUI();
  if (gameScreenEl) gameScreenEl.hidden = true;
  if (lobbyScreenEl) lobbyScreenEl.hidden = false;
}

/**
 * 조작할 로봇 색상을 변경합니다.
 * @param {string} color 'red' | 'green' | 'blue' | 'yellow'
 */
function handleSelectRobot(color) {
  if (gameState.isCleared) return;
  if (!color || gameState.selectedRobot === color) return;
  gameState.selectedRobot = color;
  updateRobotPositions(robotsLayerEl, gameState);
  renderHUD(gameState);
}

/**
 * 선택된 로봇을 지정된 방향으로 미끄러뜨려 이동시키고 최종 격자 좌표에 스냅합니다.
 * @param {string} direction 'UP' | 'RIGHT' | 'DOWN' | 'LEFT'
 */
function handleMoveDirection(direction) {
  if (gameState.isCleared) return;

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
    const solverFeedback = buildSolverFeedback(
      gameState.moveCount,
      gameState.collisionCount,
      gameState.minMoves,
      gameState.maxCollisions
    );
    const bestRecordInfo = updateBestRecord(
      gameState.moveCount,
      gameState.collisionCount
    );
    renderRuleFeedback(evaluation, solverFeedback, bestRecordInfo);
    return;
  }
  renderRuleFeedback(evaluation);
}

/**
 * 이전 동작 취소 (Undo)
 */
function handleUndo() {
  if (undoLastMove()) {
    updateRobotPositions(robotsLayerEl, gameState);
    renderHUD(gameState);
    renderRuleFeedback({ status: 'NONE' });
  }
}

/**
 * 현재 라운드 처음부터 다시하기 (Reset)
 */
function handleReset() {
  if (resetCurrentRound()) {
    updateRobotPositions(robotsLayerEl, gameState);
    renderHUD(gameState);
    renderRuleFeedback({ status: 'NONE' });
  }
}

let isNextStageLocked = false;

/**
 * 새로운 라운드(다음 문제) 시작 (현재 선택된 난이도 유지 + 1초 쿨타임 적용)
 */
function handleNextStage(targetDifficulty = gameState.selectedDifficultyMode) {
  if (isNextStageLocked) return;

  isNextStageLocked = true;
  if (btnSkipStageEl) {
    btnSkipStageEl.disabled = true;
  }

  hideHudPopover();
  initGameState({ targetDifficulty });
  syncLobbyDifficultyUI();
  renderAll();

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
  syncBoardPixelSize(boardWrapperEl);
  renderBoardGrid(boardGridEl, gameState);
  renderRobots(robotsLayerEl, gameState, handleSelectRobot);
  renderHUD(gameState);
  renderRuleFeedback({ status: 'NONE' });
}

/**
 * 초기 실행
 */
function bootstrap() {
  syncLobbyDifficultyUI();
  // 로비에 머무는 동안 백그라운드에서 난이도별 후보맵 바구니를 미리 채워둠
  scheduleBackgroundRefill(3);

  window.addEventListener('resize', () => {
    if (gameScreenEl && !gameScreenEl.hidden) {
      syncBoardPixelSize(boardWrapperEl);
    }
  });

  // 1. 메인 로비 이벤트 바인딩
  if (btnLoreToggleEl && lobbyLoreBodyEl) {
    btnLoreToggleEl.addEventListener('click', () => {
      const isCurrentlyHidden = lobbyLoreBodyEl.hidden;
      lobbyLoreBodyEl.hidden = !isCurrentlyHidden;
      btnLoreToggleEl.setAttribute('aria-expanded', String(isCurrentlyHidden));
      if (loreToggleBadgeEl) {
        loreToggleBadgeEl.textContent = isCurrentlyHidden ? '접기 ▴' : '펼쳐보기 ▾';
      }
    });
  }

  if (btnModeDailyEl) {
    btnModeDailyEl.addEventListener('click', () => {
      showLobbyToast('🚧 일일 챌린지는 현재 개발 중입니다! 곧 오픈됩니다. (Coming Soon)');
    });
  }

  if (btnLobbyDiffEl) {
    btnLobbyDiffEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (lobbyDiffDrawerEl) {
        lobbyDiffDrawerEl.hidden = !lobbyDiffDrawerEl.hidden;
      }
    });
  }

  if (lobbyDiffDrawerEl) {
    lobbyDiffDrawerEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.drawer-diff-btn');
      if (!btn || !btn.dataset.diff) return;
      gameState.selectedDifficultyMode = btn.dataset.diff;
      syncLobbyDifficultyUI();
      lobbyDiffDrawerEl.hidden = true;
    });
  }

  if (btnModeInfiniteEl) {
    btnModeInfiniteEl.addEventListener('click', (e) => {
      // 우측 난이도 배지를 누른 경우는 제외
      if (e.target.closest('#btn-lobby-diff')) return;
      enterInfiniteMode();
    });
    btnModeInfiniteEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('#btn-lobby-diff')) return;
        e.preventDefault();
        enterInfiniteMode();
      }
    });
  }

  if (btnBackLobbyEl) {
    btnBackLobbyEl.addEventListener('click', returnToLobby);
  }

  const closeHowtoModal = () => {
    if (howtoModalEl) howtoModalEl.hidden = true;
  };

  if (btnHowToPlayEl && howtoModalEl) {
    btnHowToPlayEl.addEventListener('click', () => {
      howtoModalEl.hidden = false;
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

  // 2. 인게임 보드 및 상단/하단 버튼 이벤트 바인딩
  bindInputEvents(boardWrapperEl, {
    onSelectRobot: handleSelectRobot,
    onMoveDirection: handleMoveDirection,
  });

  if (btnUndoEl) {
    btnUndoEl.addEventListener('click', handleUndo);
  }
  if (btnResetEl) {
    btnResetEl.addEventListener('click', handleReset);
  }
  if (btnChangeDifficultyEl) {
    btnChangeDifficultyEl.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleHudPopover('changeDiff');
    });
  }
  if (btnSkipStageEl) {
    btnSkipStageEl.addEventListener('click', () => handleNextStage());
  }
  if (btnClearRetryEl) {
    btnClearRetryEl.addEventListener('click', handleReset);
  }
  if (btnClearNextEl) {
    btnClearNextEl.addEventListener('click', () => handleNextStage());
  }

  if (hudInfoPopoverEl) {
    hudInfoPopoverEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const selectBtn = e.target.closest('[data-select-diff]');
      if (!selectBtn) return;
      const newDiff = selectBtn.dataset.selectDiff;
      if (!newDiff) return;
      gameState.selectedDifficultyMode = newDiff;
      syncLobbyDifficultyUI();
      hideHudPopover();
      initGameState({ targetDifficulty: newDiff });
      renderAll();
    });
  }

  // 상단 목표 배지 / 난이도 배지 호버 및 클릭(모바일 탭) 시 설명 표시
  const bindBadgeInfo = (el, type) => {
    if (!el) return;
    el.addEventListener('mouseenter', () => {
      if (window.matchMedia('(hover: hover)').matches && activePopoverType !== 'changeDiff') {
        showHudPopover(type);
      }
    });
    el.addEventListener('mouseleave', () => {
      if (window.matchMedia('(hover: hover)').matches && activePopoverType !== 'changeDiff') {
        hideHudPopover();
      }
    });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleHudPopover(type);
    });
  };

  bindBadgeInfo(hudTargetBadgeEl, 'target');
  bindBadgeInfo(hudDifficultyBadgeEl, 'difficulty');
  bindBadgeInfo(hudMoveBoxEl, 'move');
  bindBadgeInfo(hudCollisionBoxEl, 'collision');

  document.addEventListener('click', () => {
    hideHudPopover();
  });
}

document.addEventListener('DOMContentLoaded', bootstrap);
