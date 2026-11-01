/**
 * @file hudController.js
 * @description 인게임 상단 HUD 팝오버(목표/난이도/이동/완충 안내, 실시간 난이도 변경) 및 튜토리얼 안내 카드/손가락 가이드 모듈
 */

import { gameState, DIFF_META } from './state.js';
import {
  getCurrentTutorialStep,
  getTutorialGestureGuide,
  getStep4Phase,
} from './tutorial.js';
import { updateRobotPositions, renderHUD } from './renderer.js';
import {
  hudTargetBadgeEl,
  hudDifficultyBadgeEl,
  hudMoveBoxEl,
  hudCollisionBoxEl,
  hudInfoPopoverEl,
  tutorialGuideCardEl,
  tutorialStepTagEl,
  tutorialStepTitleEl,
  tutorialStepDescEl,
  tutorialStepHintEl,
  tutorialGestureLayerEl,
  tutorialFingerEl,
  boardGridEl,
  robotsLayerEl,
  gameScreenEl,
} from './elements.js';

export const HUD_INFO_CONTENT = Object.freeze({
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
let isTutorialUndoLocked = false;

export function getTutorialUndoLocked() {
  return isTutorialUndoLocked;
}

export function setTutorialUndoLocked(val) {
  isTutorialUndoLocked = Boolean(val);
}

export function updateTutorialStepCard() {
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
export function updateTutorialGestureGuide() {
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
  const topPx = guide.row * cellSize + cellSize / 2 - 22;
  const leftPx = guide.col * cellSize + cellSize / 2 - 22;

  tutorialFingerEl.style.top = `${topPx}px`;
  tutorialFingerEl.style.left = `${leftPx}px`;
  tutorialFingerEl.className = `tutorial-finger ${guide.directionClass}`;
  tutorialGestureLayerEl.hidden = false;
}

export function buildChangeDifficultyPopoverHTML() {
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

export function showHudPopover(type) {
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

export function hideHudPopover() {
  if (!hudInfoPopoverEl) return;
  activePopoverType = null;
  hudInfoPopoverEl.hidden = true;
}

export function toggleHudPopover(type) {
  if (activePopoverType === type && !hudInfoPopoverEl.hidden) {
    hideHudPopover();
  } else {
    showHudPopover(type);
  }
}

/**
 * 상단 HUD 및 팝오버 인터랙션 이벤트 바인딩
 */
export function initHudEvents({ onChangeDifficulty }) {
  if (hudInfoPopoverEl) {
    hudInfoPopoverEl.addEventListener('click', async (e) => {
      e.stopPropagation();
      const selectBtn = e.target.closest('[data-select-diff]');
      if (!selectBtn) return;
      const newDiff = selectBtn.dataset.selectDiff;
      if (!newDiff) return;

      hideHudPopover();
      if (typeof onChangeDifficulty === 'function') {
        await onChangeDifficulty(newDiff);
      }
    });
  }

  const bindBadgeInfo = (el, type, enableHover = true) => {
    if (!el) return;
    if (enableHover) {
      el.addEventListener('mouseenter', () => {
        if (window.matchMedia('(hover: hover)').matches) {
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
  // 난이도 배지는 클릭/탭으로만 열고 닫히도록 설정
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
}
