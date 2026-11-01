/**
 * @file renderer.js
 * @description 2단계: 16x16 CSS Grid 보드 레이아웃, 벽, 타깃 심볼 및 4대 로봇 UI 렌더링 모듈
 *
 * - 외부 무거운 이미지 에셋 없이 가볍고 선명한 CSS 도형 및 인라인 SVG로 타일/벽/타깃/로봇을 표현합니다.
 * - 4대의 로봇(빨강, 초록, 파랑, 노랑)은 `position: absolute;` 구조로 격자판 위에 동적으로 배치됩니다.
 */

import { WALL, TARGET_SYMBOLS, ROBOT_COLORS } from './boardPresets.js';
import { PLAYABLE_ROBOTS, isCenterClosedCell } from './state.js';

const COLOR_LABELS_KO = Object.freeze({
  [ROBOT_COLORS.RED]: '빨강',
  [ROBOT_COLORS.GREEN]: '초록',
  [ROBOT_COLORS.BLUE]: '파랑',
  [ROBOT_COLORS.YELLOW]: '노랑',
  [ROBOT_COLORS.MULTI]: '다색(모든 로봇)',
});

const SYMBOL_LABELS_KO = Object.freeze({
  [TARGET_SYMBOLS.CIRCLE]: '달(원형)',
  [TARGET_SYMBOLS.TRIANGLE]: '기어(삼각형)',
  [TARGET_SYMBOLS.STAR]: '십자별',
  [TARGET_SYMBOLS.HEXAGON]: '행성(육각형)',
  [TARGET_SYMBOLS.VORTEX]: '소용돌이',
});

/**
 * 목표 지점(Target Zone)을 나타내는 통일된 인라인 SVG 마크업을 반환합니다.
 * 원형 점(●) 형태의 로봇과 한눈에 구분되도록 속이 빈 각진 다이아몬드/타깃 게이트(깃발·비콘) 형태로 표현합니다.
 * @param {string} [color] 로봇/타깃 색상 ('multi'인 경우 다색 그라데이션 적용)
 * @returns {string} SVG 문자열
 */
export function getTargetSymbolSVG(color = '') {
  const isMulti = color === ROBOT_COLORS.MULTI;
  const strokeAttr = isMulti ? 'url(#vortexGrad)' : 'currentColor';

  return `
    <svg viewBox="0 0 24 24" class="target-svg" aria-hidden="true">
      ${
        isMulti
          ? `<defs>
              <linearGradient id="vortexGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ef4444"/>
                <stop offset="35%" stop-color="#eab308"/>
                <stop offset="70%" stop-color="#22c55e"/>
                <stop offset="100%" stop-color="#3b82f6"/>
              </linearGradient>
            </defs>`
          : ''
      }
      <!-- 바깥쪽 네 모서리 타깃 브래킷 -->
      <path d="M3 8 V3 H8 M16 3 H21 V8 M21 16 V21 H16 M8 21 H3 V16"
            fill="none" stroke="${strokeAttr}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- 안쪽 속이 빈 회전 다이아몬드(게이트) -->
      <polygon points="12,5.5 18.5,12 12,18.5 5.5,12"
               fill="none" stroke="${strokeAttr}" stroke-width="2.2" stroke-linejoin="round"/>
      <!-- 중심 십자 타깃 포인트 -->
      <path d="M12 9 V15 M9 12 H15"
             stroke="${strokeAttr}" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
}

/**
 * 모바일(특히 iOS Safari)에서 16등분 격자(1fr)의 서브픽셀 반올림 오차로 인해
 * 맨 아랫줄/오른쪽 줄이 잘리거나 로봇 좌표(6.25%)와 격자가 어긋나는 현상을 방지하기 위해,
 * 보드 내부 크기를 정확히 16px의 배수로 맞춤 정렬합니다.
 *
 * @param {HTMLElement} boardWrapperEl .board-wrapper 엘리먼트
 */
export function syncBoardPixelSize(boardWrapperEl) {
  if (!boardWrapperEl || !boardWrapperEl.parentElement) return;

  const parentWidth = boardWrapperEl.parentElement.clientWidth;
  if (!parentWidth) return;

  const borderTotal = 8; // 좌우 4px * 2 테두리
  const availableInner = Math.max(256, parentWidth - borderTotal);
  const cellPx = Math.floor(availableInner / 16);
  const exactInnerPx = cellPx * 16;
  const exactOuterPx = exactInnerPx + borderTotal;

  boardWrapperEl.style.width = `${exactOuterPx}px`;
  boardWrapperEl.style.height = `${exactOuterPx}px`;
}

/**
 * 16x16 보드 격자판, 벽, 타깃 심볼 및 중앙 폐쇄 구역을 렌더링합니다.
 * @param {HTMLElement} gridEl #board-grid 엘리먼트
 * @param {object} state gameState 객체
 */
export function renderBoardGrid(gridEl, state) {
  if (!gridEl || !state.board) return;

  gridEl.innerHTML = '';
  const { grid } = state.board;

  const fragment = document.createDocumentFragment();

  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 16; c++) {
      const cell = document.createElement('div');
      cell.className = 'board-cell';
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);

      if (isCenterClosedCell(r, c)) {
        cell.classList.add('cell-closed');
      }

      const mask = grid[r][c];
      // 최외곽 테두리(r=0 북, r=15 남, c=0 서, c=15 동)는 .board-wrapper의 외곽 테두리가 담당하므로
      // 가장자리 칸 내부가 잘려 보이지 않도록 내부 벽에만 클래스를 부여합니다.
      if ((mask & WALL.NORTH) && r > 0) cell.classList.add('wall-n');
      if ((mask & WALL.EAST) && c < 15) cell.classList.add('wall-e');
      if ((mask & WALL.SOUTH) && r < 15) cell.classList.add('wall-s');
      if ((mask & WALL.WEST) && c > 0) cell.classList.add('wall-w');

      // 현재 라운드의 목표 타깃(activeTarget)만 보드에 표시하고 나머지 타깃 심볼은 숨김 처리 (벽만 유지)
      if (
        state.activeTarget &&
        state.activeTarget.row === r &&
        state.activeTarget.col === c
      ) {
        const target = state.activeTarget;
        const targetEl = document.createElement('div');
        targetEl.className = `target-marker color-${target.color} is-active-goal`;
        targetEl.title = `목표 지점: ${COLOR_LABELS_KO[target.color]}`;
        targetEl.innerHTML = getTargetSymbolSVG(target.color);
        cell.appendChild(targetEl);
      }

      fragment.appendChild(cell);
    }
  }

  // 중앙 2x2 폐쇄 구역(7,7 ~ 8,8) 위에 현재 목표 타깃 심볼만 깔끔하게 표시 (좌표 텍스트 제거)
  const centerpiece = document.createElement('div');
  centerpiece.className = 'board-centerpiece';
  if (state.activeTarget) {
    centerpiece.innerHTML = `
      <div class="centerpiece-inner color-${state.activeTarget.color}">
        ${getTargetSymbolSVG(state.activeTarget.color)}
      </div>
    `;
  }

  gridEl.appendChild(fragment);
  gridEl.appendChild(centerpiece);
}

/**
 * 4대의 로봇(빨강, 초록, 파랑, 노랑)과 초기 위치 마커(Position Markers)를
 * 격자판 위의 레이어(`#robots-layer`)에 `position: absolute;`로 렌더링합니다.
 *
 * @param {HTMLElement} robotsLayerEl #robots-layer 엘리먼트
 * @param {object} state gameState 객체
 * @param {function(string): void} [onSelectRobot] 로봇 클릭/터치 시 선택 콜백
 */
export function renderRobots(robotsLayerEl, state, onSelectRobot) {
  if (!robotsLayerEl || !state.robots) return;

  robotsLayerEl.innerHTML = '';
  const fragment = document.createDocumentFragment();

  // 1. 각 로봇의 출발 위치 마커 (사각 테두리 표시) 렌더링
  for (const color of PLAYABLE_ROBOTS) {
    const initPos = state.initialRobots[color];
    if (!initPos) continue;

    const markerEl = document.createElement('div');
    markerEl.className = `robot-start-marker marker-${color}`;
    markerEl.style.left = `${initPos.col * 6.25}%`;
    markerEl.style.top = `${initPos.row * 6.25}%`;
    fragment.appendChild(markerEl);
  }

  // 2. 4대 로봇 본체 (원형 점 UI, position: absolute) 렌더링
  const ROBOT_KEY_NUMBERS = {
    red: '1',
    green: '2',
    blue: '3',
    yellow: '4',
  };

  for (const color of PLAYABLE_ROBOTS) {
    const pos = state.robots[color];
    if (!pos) continue;

    const robotEl = document.createElement('button');
    robotEl.type = 'button';
    robotEl.className = `robot-piece robot-${color}${
      state.selectedRobot === color ? ' is-selected' : ''
    }`;
    robotEl.dataset.color = color;
    robotEl.dataset.row = String(pos.row);
    robotEl.dataset.col = String(pos.col);
    robotEl.ariaLabel = `${COLOR_LABELS_KO[color]} 로봇 (${pos.row}, ${pos.col})`;
    robotEl.style.left = `${pos.col * 6.25}%`;
    robotEl.style.top = `${pos.row * 6.25}%`;

    const dotInner = document.createElement('span');
    dotInner.className = 'robot-core';

    // 데스크톱 키보드 조작 시 시각적 단축키 안내 번호 배지
    const keyBadge = document.createElement('span');
    keyBadge.className = 'robot-key-badge';
    keyBadge.textContent = ROBOT_KEY_NUMBERS[color] || '';
    keyBadge.setAttribute('aria-hidden', 'true');
    dotInner.appendChild(keyBadge);

    robotEl.appendChild(dotInner);

    if (typeof onSelectRobot === 'function') {
      robotEl.addEventListener('click', () => onSelectRobot(color));
    }

    fragment.appendChild(robotEl);
  }

  robotsLayerEl.appendChild(fragment);
}

/**
 * 이미 생성된 로봇 DOM 엘리먼트의 위치와 선택 상태만 빠르게 갱신합니다 (애니메이션 이동 시 활용).
 * @param {HTMLElement} robotsLayerEl #robots-layer 엘리먼트
 * @param {object} state gameState 객체
 */
export function updateRobotPositions(robotsLayerEl, state) {
  if (!robotsLayerEl) return;

  const robotEls = robotsLayerEl.querySelectorAll('.robot-piece');
  robotEls.forEach((el) => {
    const color = el.dataset.color;
    const pos = state.robots[color];
    if (!pos) return;

    el.dataset.row = String(pos.row);
    el.dataset.col = String(pos.col);
    el.style.left = `${pos.col * 6.25}%`;
    el.style.top = `${pos.row * 6.25}%`;
    el.classList.toggle('is-selected', state.selectedRobot === color);
  });
}

/**
 * 상단 상태 패널(현재 타깃 정보, 이동 횟수, 완충 충돌 횟수)을 갱신합니다.
 * @param {object} state gameState 객체
 */
export function renderHUD(state) {
  const moveCountEl = document.getElementById('hud-move-count');
  const collisionCountEl = document.getElementById('hud-collision-count');
  const targetBadgeEl = document.getElementById('hud-target-badge');
  const difficultyBadgeEl = document.getElementById('hud-difficulty-badge');
  const btnUndo = document.getElementById('btn-undo');
  const btnReset = document.getElementById('btn-reset');

  if (moveCountEl) moveCountEl.textContent = String(state.moveCount);
  if (collisionCountEl) collisionCountEl.textContent = String(state.collisionCount);

  if (btnUndo) {
    btnUndo.disabled = !state.undoStack || state.undoStack.length === 0;
  }
  if (btnReset) {
    btnReset.disabled = state.moveCount === 0 && (!state.undoStack || state.undoStack.length === 0);
  }

  if (difficultyBadgeEl && state.difficulty) {
    difficultyBadgeEl.textContent = state.difficulty.label;
    difficultyBadgeEl.className = `difficulty-badge diff-${state.difficulty.id} is-interactive`;
  }

  if (targetBadgeEl && state.activeTarget) {
    const { color } = state.activeTarget;
    targetBadgeEl.className = `target-badge color-${color} is-interactive`;
    targetBadgeEl.innerHTML = `
      ${getTargetSymbolSVG(color)}
      <span>목표: ${COLOR_LABELS_KO[color]} 탈출구</span>
    `;
  }
}

/**
 * 4~7단계 규칙 판정 결과(직진 도달 무효 경고 토스트 또는 탈출 성공 + BFS 솔버 피드백 오버레이)를 화면에 렌더링합니다.
 * @param {object} evaluation evaluateRoundStatus 반환 객체
 * @param {object} [solverFeedback] { isOptimal: boolean, feedbackMessage: string }
 * @param {object} [bestRecordInfo] { isNewBest: boolean, bestRecord: { moveCount: number, collisionCount: number } }
 */
export function renderRuleFeedback(evaluation, solverFeedback = null, bestRecordInfo = null) {
  const toastEl = document.getElementById('rule-toast');
  const clearOverlayEl = document.getElementById('clear-overlay');
  const clearSummaryEl = document.getElementById('clear-summary');
  const clearSolverFeedbackEl = document.getElementById('clear-solver-feedback');
  const clearBestRecordEl = document.getElementById('clear-best-record');

  if (!evaluation || evaluation.status === 'NONE') {
    if (toastEl) toastEl.hidden = true;
    if (clearOverlayEl) clearOverlayEl.hidden = true;
    if (clearSolverFeedbackEl) {
      clearSolverFeedbackEl.hidden = true;
      clearSolverFeedbackEl.textContent = '';
    }
    return;
  }

  if (evaluation.status === 'INVALID_STRAIGHT') {
    if (toastEl) {
      toastEl.textContent = evaluation.message;
      toastEl.hidden = false;
    }
    if (clearOverlayEl) clearOverlayEl.hidden = true;
    return;
  }

  if (evaluation.status === 'CLEARED') {
    if (toastEl) toastEl.hidden = true;
    if (clearSummaryEl) {
      clearSummaryEl.innerHTML = `이번 기록: <strong>${evaluation.moveCount}회</strong> 이동 · 로봇 완충 <strong>${evaluation.collisionCount}회</strong>`;
    }
    if (clearSolverFeedbackEl) {
      if (solverFeedback && solverFeedback.feedbackMessage) {
        clearSolverFeedbackEl.textContent = solverFeedback.feedbackMessage;
        clearSolverFeedbackEl.className = `clear-solver-feedback ${
          solverFeedback.isOptimal ? 'is-optimal' : 'is-suboptimal'
        }`;
        clearSolverFeedbackEl.hidden = false;
      } else {
        clearSolverFeedbackEl.textContent = '';
        clearSolverFeedbackEl.className = 'clear-solver-feedback';
        clearSolverFeedbackEl.hidden = true;
      }
    }
    if (clearBestRecordEl && bestRecordInfo && bestRecordInfo.bestRecord) {
      const { moveCount, collisionCount } = bestRecordInfo.bestRecord;
      const newBadge = bestRecordInfo.isNewBest ? ' (최고 기록 달성!)' : '';
      clearBestRecordEl.textContent = `현재 맵 최고 기록: ${moveCount}회 이동 / 완충 ${collisionCount}회${newBadge}`;
    }
    if (clearOverlayEl) clearOverlayEl.hidden = false;
  }
}

