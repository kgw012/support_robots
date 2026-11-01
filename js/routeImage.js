/**
 * @file routeImage.js
 * @description 실제 인게임 보드 그래픽 위에 아날로그 색연필(크레파스 질감)로 이동 경로를 직접 그린 듯한 고해상도 인증 사진 생성 모듈
 */

import { ROBOT_COLORS, WALL } from './boardPresets.js';
import { DIFF_META } from './state.js';
import { authState } from './api.js';
import { logger } from './logger.js';

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1320;
const BOARD_SIZE = 1000;
const BOARD_X = 40;
const BOARD_Y = 160;
const CELL_SIZE = BOARD_SIZE / 16; // 62.5px

// 인게임 실제 보드 색상 팔레트
const REAL_ROBOT_COLORS = Object.freeze({
  [ROBOT_COLORS.RED]: '#e53935',
  [ROBOT_COLORS.GREEN]: '#2e9e49',
  [ROBOT_COLORS.BLUE]: '#1e88e5',
  [ROBOT_COLORS.YELLOW]: '#f5b400',
  [ROBOT_COLORS.MULTI]: '#9c27b0',
});

// 색연필 / 크레파스 아날로그 안료 팔레트 (베이지 보드 위에서 뛰어난 시인성과 생생한 질감)
const CRAYON_PALETTE = Object.freeze({
  [ROBOT_COLORS.RED]: {
    stroke: '#e11d48', // 선명한 진홍 크레파스
    fill: '#be123c',
    highlight: '#fb7185',
    rgba: (a) => `rgba(225, 29, 72, ${a})`,
  },
  [ROBOT_COLORS.GREEN]: {
    stroke: '#15803d', // 짙은 에메랄드 초록 크레파스
    fill: '#166534',
    highlight: '#22c55e',
    rgba: (a) => `rgba(21, 128, 61, ${a})`,
  },
  [ROBOT_COLORS.BLUE]: {
    stroke: '#0284c7', // 선명한 코발트 파랑 크레파스
    fill: '#0369a1',
    highlight: '#38bdf8',
    rgba: (a) => `rgba(2, 132, 199, ${a})`,
  },
  [ROBOT_COLORS.YELLOW]: {
    stroke: '#d97706', // 베이지 보드 위에서도 또렷한 앰버 골드 크레파스
    fill: '#b45309',
    highlight: '#facc15',
    rgba: (a) => `rgba(217, 119, 6, ${a})`,
  },
});

const DIFF_COLORS = Object.freeze({
  easy: '#22c55e',
  normal: '#00b0ff',
  hard: '#f59e0b',
  hell: '#ef4444',
});

/**
 * 결정론적 시드 난수 생성기 (동일 풀이에 대해 일관되고 완성도 높은 크레파스 질감 재현)
 */
function createPseudoRandom(seed = 13579) {
  let s = seed;
  return function () {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/**
 * 날짜 시드('YYYYMMDD') 포맷팅
 */
function formatDateSeed(seed) {
  if (!seed) return '';
  const s = String(seed);
  if (s.length === 8) {
    return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`;
  }
  return s;
}

/**
 * 둥근 모서리 사각형 경로 헬퍼
 */
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * 캔버스 전체 배경 렌더링 (다크 데스크 매트 분위기)
 */
function renderCanvasBackground(ctx) {
  ctx.fillStyle = '#0f141c';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const bgGrad = ctx.createRadialGradient(
    CANVAS_WIDTH / 2,
    CANVAS_HEIGHT / 2,
    100,
    CANVAS_WIDTH / 2,
    CANVAS_HEIGHT / 2,
    750
  );
  bgGrad.addColorStop(0, '#161e2b');
  bgGrad.addColorStop(1, '#090d14');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

/**
 * 상단 헤더 (타이틀, 날짜, 난이도, 풀이 성적, 대원 닉네임)
 */
function renderHeader(ctx, solution) {
  const { dateSeed, difficulty, moveCount, collisionCount } = solution;
  const diffKey = difficulty || 'normal';
  const diffLabel = DIFF_META[diffKey]?.label || diffKey.toUpperCase();
  const diffColor = DIFF_COLORS[diffKey] || '#00b0ff';
  const nickname = authState.user?.nickname || '대원';
  const dateFormatted = formatDateSeed(dateSeed);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 145);
  ctx.lineTo(CANVAS_WIDTH - 40, 145);
  ctx.stroke();

  // 좌측 타이틀
  ctx.save();
  ctx.font = '900 30px "Pretendard", -apple-system, sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.shadowColor = 'rgba(56, 189, 248, 0.35)';
  ctx.shadowBlur = 8;
  ctx.fillText('SUPPORT ROBOTS', 40, 52);
  ctx.restore();

  // 좌측 서브 타이틀
  ctx.font = '600 15px "Pretendard", -apple-system, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('✏️ 일일 챌린지 풀이 경로 인증샷 (DAILY ROUTE)', 40, 78);

  // 날짜 및 대원
  ctx.font = '500 14px "Pretendard", -apple-system, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText(`📅 ${dateFormatted} (KST)  |  👤 대원: `, 40, 108);

  ctx.font = '700 14px "Pretendard", -apple-system, sans-serif';
  ctx.fillStyle = '#e2e8f0';
  const labelWidth = ctx.measureText(`📅 ${dateFormatted} (KST)  |  👤 대원: `).width;
  ctx.fillText(nickname, 40 + labelWidth, 108);

  // 우측 상단 메트릭
  const rightBoxRight = CANVAS_WIDTH - 40;

  // 난이도 뱃지
  ctx.save();
  ctx.font = '800 13px "Pretendard", -apple-system, sans-serif';
  const badgeText = diffLabel;
  const badgeWidth = ctx.measureText(badgeText).width + 16;
  const badgeX = rightBoxRight - badgeWidth;
  const badgeY = 32;

  roundRect(ctx, badgeX, badgeY, badgeWidth, 24, 6);
  ctx.fillStyle = diffColor;
  ctx.globalAlpha = 0.2;
  ctx.fill();
  ctx.globalAlpha = 1.0;
  ctx.strokeStyle = diffColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = diffColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, badgeX + badgeWidth / 2, badgeY + 12);
  ctx.restore();

  // 성적 뱃지
  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = '800 24px "Pretendard", -apple-system, sans-serif';
  ctx.fillStyle = '#facc15';
  ctx.shadowColor = 'rgba(250, 204, 21, 0.4)';
  ctx.shadowBlur = 8;
  ctx.fillText(`🎯 ${moveCount}회 이동 · 완충 ${collisionCount}회`, rightBoxRight, 92);

  ctx.font = '500 13px "Pretendard", -apple-system, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.shadowBlur = 0;
  ctx.fillText('지반 충격 분산 제어 성공', rightBoxRight, 114);
  ctx.restore();
}

/**
 * 인게임 타깃 심볼 SVG 마크를 캔버스 경로로 정밀 렌더링
 * (사각 브래킷 + 속이 빈 회전 다이아몬드 게이트 + 십자 포인트)
 */
function renderTargetSymbolOnCanvas(ctx, cx, cy, size, color) {
  const isMulti = color === ROBOT_COLORS.MULTI;
  const strokeColor = isMulti ? '#9c27b0' : REAL_ROBOT_COLORS[color] || '#38bdf8';
  const scale = size / 24;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 1. 네 모서리 타깃 브래킷
  // 좌상: M -9 -4 V -9 H -4
  ctx.beginPath();
  ctx.moveTo(-9, -4);
  ctx.lineTo(-9, -9);
  ctx.lineTo(-4, -9);
  ctx.stroke();

  // 우상: M 4 -9 H 9 V -4
  ctx.beginPath();
  ctx.moveTo(4, -9);
  ctx.lineTo(9, -9);
  ctx.lineTo(9, -4);
  ctx.stroke();

  // 우하: M 9 4 V 9 H 4
  ctx.beginPath();
  ctx.moveTo(9, 4);
  ctx.lineTo(9, 9);
  ctx.lineTo(4, 9);
  ctx.stroke();

  // 좌하: M -4 9 H -9 V 4
  ctx.beginPath();
  ctx.moveTo(-4, 9);
  ctx.lineTo(-9, 9);
  ctx.lineTo(-9, 4);
  ctx.stroke();

  // 2. 안쪽 회전 다이아몬드 게이트
  ctx.beginPath();
  ctx.moveTo(0, -6.5);
  ctx.lineTo(6.5, 0);
  ctx.lineTo(0, 6.5);
  ctx.lineTo(-6.5, 0);
  ctx.closePath();
  ctx.stroke();

  // 3. 중심 십자 타깃 포인트
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(0, -3);
  ctx.lineTo(0, 3);
  ctx.moveTo(-3, 0);
  ctx.lineTo(3, 0);
  ctx.stroke();

  ctx.restore();
}

/**
 * 인게임 실제 보드 그래픽 렌더링
 * (따뜻한 베이지 타일, 인셋 테두리 장식, 묵직한 다크 벽, 중앙 2x2 폐쇄 구역)
 */
function renderRealBoard(ctx, solution) {
  const { board, activeTarget } = solution;
  if (!board) return;

  const { grid } = board;

  ctx.save();

  // 1. 보드 외곽 테두리 (실제 게임: 4px solid var(--wall-color): #22272e, 그림자)
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, BOARD_X, BOARD_Y, BOARD_SIZE, BOARD_SIZE, 6);
  ctx.fillStyle = '#d8d3c8'; // var(--bg-board)
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = '#22272e'; // var(--wall-color)
  ctx.lineWidth = 6;
  ctx.stroke();

  // 2. 16x16 셀 타일 및 인게임 그리드 디테일
  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 16; c++) {
      const cx = BOARD_X + c * CELL_SIZE;
      const cy = BOARD_Y + r * CELL_SIZE;

      // 타일 색상: 짝수/홀수 미세 질감 (#d8d3c8 / #d2cdc1)
      ctx.fillStyle = (r + c) % 2 === 0 ? '#d8d3c8' : '#d2cdc1';
      ctx.fillRect(cx, cy, CELL_SIZE, CELL_SIZE);

      // 타일 내부 사선 느낌의 미세 장식 테두리 (실제 게임의 .board-cell::before)
      ctx.strokeStyle = 'rgba(110, 100, 86, 0.18)';
      ctx.lineWidth = 1;
      const inset = CELL_SIZE * 0.14;
      ctx.strokeRect(cx + inset, cy + inset, CELL_SIZE - inset * 2, CELL_SIZE - inset * 2);

      // 셀 격자 구분선 (실제 게임: 1px solid var(--cell-grid-line))
      ctx.strokeStyle = 'rgba(90, 82, 70, 0.28)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx, cy, CELL_SIZE, CELL_SIZE);
    }
  }

  // 3. 4개 사분면 경계선 (8번째 열/행 사이의 사분면 이음새 강조선)
  ctx.strokeStyle = 'rgba(45, 40, 35, 0.55)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(BOARD_X + 8 * CELL_SIZE, BOARD_Y);
  ctx.lineTo(BOARD_X + 8 * CELL_SIZE, BOARD_Y + BOARD_SIZE);
  ctx.moveTo(BOARD_X, BOARD_Y + 8 * CELL_SIZE);
  ctx.lineTo(BOARD_X + BOARD_SIZE, BOARD_Y + 8 * CELL_SIZE);
  ctx.stroke();

  // 4. 중앙 2x2 폐쇄 구역 (7,7 ~ 8,8)
  const centerLeft = BOARD_X + 7 * CELL_SIZE;
  const centerTop = BOARD_Y + 7 * CELL_SIZE;
  const centerSize = 2 * CELL_SIZE;

  // 실제 게임: .board-centerpiece { background: #1b2028; border: 3px solid #11151a; border-radius: 4px; }
  ctx.fillStyle = '#1b2028';
  ctx.fillRect(centerLeft, centerTop, centerSize, centerSize);
  ctx.strokeStyle = '#11151a';
  ctx.lineWidth = 3.5;
  ctx.strokeRect(centerLeft, centerTop, centerSize, centerSize);

  // 센터피스 내부 타깃 심볼
  if (activeTarget) {
    renderTargetSymbolOnCanvas(
      ctx,
      centerLeft + centerSize / 2,
      centerTop + centerSize / 2,
      centerSize * 0.65,
      activeTarget.color
    );
  }

  // 5. 비트마스크 벽 (Walls) - 실제 게임: 2.5px solid var(--wall-color): #22272e
  ctx.strokeStyle = '#22272e';
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';

  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 16; c++) {
      const mask = grid[r][c];
      const cx = BOARD_X + c * CELL_SIZE;
      const cy = BOARD_Y + r * CELL_SIZE;

      if ((mask & WALL.NORTH) && r > 0) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + CELL_SIZE, cy);
        ctx.stroke();
      }
      if ((mask & WALL.EAST) && c < 15) {
        ctx.beginPath();
        ctx.moveTo(cx + CELL_SIZE, cy);
        ctx.lineTo(cx + CELL_SIZE, cy + CELL_SIZE);
        ctx.stroke();
      }
      if ((mask & WALL.SOUTH) && r < 15) {
        ctx.beginPath();
        ctx.moveTo(cx, cy + CELL_SIZE);
        ctx.lineTo(cx + CELL_SIZE, cy + CELL_SIZE);
        ctx.stroke();
      }
      if ((mask & WALL.WEST) && c > 0) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx, cy + CELL_SIZE);
        ctx.stroke();
      }
    }
  }

  // 6. 목표 탈출구 타깃 지점 (Active Target Zone)
  if (activeTarget) {
    const tx = BOARD_X + (activeTarget.col + 0.5) * CELL_SIZE;
    const ty = BOARD_Y + (activeTarget.row + 0.5) * CELL_SIZE;

    // 실제 게임: background: rgba(255, 255, 255, 0.45);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillRect(
      BOARD_X + activeTarget.col * CELL_SIZE + 4,
      BOARD_Y + activeTarget.row * CELL_SIZE + 4,
      CELL_SIZE - 8,
      CELL_SIZE - 8
    );

    // 탈출 성공 골인 목표 지점 황금빛 네온 링 강조
    ctx.beginPath();
    ctx.arc(tx, ty, 27, 0, Math.PI * 2);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = '#facc15';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowColor = 'transparent';

    renderTargetSymbolOnCanvas(ctx, tx, ty, CELL_SIZE * 0.76, activeTarget.color);
  }

  ctx.restore();
}

/**
 * 인게임 실제 4대 로봇 칩 렌더링 (원형 바디, 2.5px 흰색 테두리, box-shadow 및 inset 광택)
 * - 사용자의 요구에 따라 시작점(initialRobots)에 4대 로봇을 배치하여,
 *   로봇의 초기 배치에서부터 화살표를 따라 최종 골인 지점까지의 풀이 경로를 직관적으로 파악할 수 있도록 합니다.
 */
function renderRealRobots(ctx, initialRobots) {
  if (!initialRobots) return;

  for (const [color, pos] of Object.entries(initialRobots)) {
    if (!pos) continue;

    const colorHex = REAL_ROBOT_COLORS[color] || '#ffffff';
    const rx = BOARD_X + (pos.col + 0.5) * CELL_SIZE;
    const ry = BOARD_Y + (pos.row + 0.5) * CELL_SIZE;

    ctx.save();

    // 실제 인게임 로봇 크기: width 72%, height 72% (반지름 약 22.5px)
    const bodyRadius = CELL_SIZE * 0.36;

    // 1. 하단 입체감 그림자 (box-shadow: 0 2px 5px rgba(0, 0, 0, 0.55))
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 2;

    // 2. 로봇 본체 단색 원 (var(--color-red/green/blue/yellow))
    ctx.beginPath();
    ctx.arc(rx, ry, bodyRadius, 0, Math.PI * 2);
    ctx.fillStyle = colorHex;
    ctx.fill();

    ctx.shadowColor = 'transparent';

    // 3. 인게임의 상단 미세 내부 광택 (inset 0 2px 3px rgba(255, 255, 255, 0.35))
    ctx.save();
    ctx.beginPath();
    ctx.arc(rx, ry, bodyRadius, 0, Math.PI * 2);
    ctx.clip();

    const insetShine = ctx.createLinearGradient(rx, ry - bodyRadius, rx, ry + bodyRadius);
    insetShine.addColorStop(0, 'rgba(255, 255, 255, 0.38)');
    insetShine.addColorStop(0.35, 'rgba(255, 255, 255, 0.08)');
    insetShine.addColorStop(1, 'rgba(0, 0, 0, 0.15)');
    ctx.fillStyle = insetShine;
    ctx.fill();
    ctx.restore();

    // 4. 로봇 외곽 2.5px 흰색 테두리 (border: 2px solid #ffffff)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(rx, ry, bodyRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }
}

/**
 * 색연필 / 크레파스 질감으로 화살표 선 및 머리 그리기
 * - 다중 서브 스트로크 (손떨림 지터 + 다층 왁스 겹침)
 * - 크레파스 찌꺼기/가루 스패터링 (Wax Grains & Chalky Noise)
 * - 손으로 빗금 치며 칠한 화살표 머리 (Crayon Scratch Arrowhead)
 */
function drawCrayonArrow(ctx, sx, sy, ex, ey, robotColor, rand) {
  const crayon = CRAYON_PALETTE[robotColor] || CRAYON_PALETTE[ROBOT_COLORS.RED];

  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;

  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  // 타일 중심에서 시작하여 도착 타일 중심에 정확히 화살표 끝이 닿도록 최소 오프셋(2px) 적용
  // 1칸 이동(62.5px)에서도 선의 길이와 화살표 머리가 충분히 확보되어 점으로 보이지 않고 뚜렷한 화살표로 표현됨
  const startOffset = 2;
  const endOffset = 2;
  const actualLen = Math.max(12, len - startOffset - endOffset);

  const startX = sx + ux * startOffset;
  const startY = sy + uy * startOffset;
  const headTipX = ex - ux * endOffset;
  const headTipY = ey - uy * endOffset;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const baseWidth = 6.5;

  // 1칸 이동(짧은 이동)과 다칸 이동에 따라 화살표 머리 크기 조절
  const isShortMove = len <= CELL_SIZE * 1.25;
  const headLength = isShortMove ? Math.min(17, actualLen * 0.36) : 22;

  // 1. 크레파스 줄기(Stem) 다중 레이어 스트로크
  const numPasses = 5;
  for (let pass = 0; pass < numPasses; pass++) {
    const passOffset = (rand() - 0.5) * baseWidth * 0.7;
    const strokeWidth = baseWidth * (0.4 + rand() * 0.4);
    const alpha = 0.35 + rand() * 0.3;

    ctx.strokeStyle = crayon.rgba(alpha);
    ctx.lineWidth = strokeWidth;

    ctx.beginPath();
    const steps = Math.max(4, Math.floor(actualLen / 5));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // 자연스러운 손떨림/곡률 (짧은 선일 때 곡률 진폭 스케일링)
      const wobbleAmp = isShortMove ? 0.45 : 0.8;
      const wobble = Math.sin(t * Math.PI * 3 + pass) * wobbleAmp + (rand() - 0.5) * (wobbleAmp * 1.5);
      const px = startX + ux * (actualLen * t) + nx * (passOffset + wobble);
      const py = startY + uy * (actualLen * t) + ny * (passOffset + wobble);

      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
  }

  // 2. 크레파스 가루 및 거친 입자(Wax Grains / Dust) 흩뿌리기
  const numGrains = Math.floor(actualLen * 1.8);
  for (let g = 0; g < numGrains; g++) {
    const distAlong = rand() * actualLen;
    const distSide = (rand() - 0.5) * (baseWidth * 1.6);
    const gx = startX + ux * distAlong + nx * distSide;
    const gy = startY + uy * distAlong + ny * distSide;

    const grainRadius = 0.7 + rand() * 1.4;
    const grainAlpha = 0.22 + rand() * 0.45;

    ctx.beginPath();
    ctx.arc(gx, gy, grainRadius, 0, Math.PI * 2);
    ctx.fillStyle = crayon.rgba(grainAlpha);
    ctx.fill();
  }

  // 3. 크레파스 화살표 머리(Head) 렌더링
  const headWingAngle = Math.PI / 6.5; // 약 27도
  const leftWingX = headTipX - headLength * Math.cos(Math.atan2(dy, dx) - headWingAngle);
  const leftWingY = headTipY - headLength * Math.sin(Math.atan2(dy, dx) - headWingAngle);
  const rightWingX = headTipX - headLength * Math.cos(Math.atan2(dy, dx) + headWingAngle);
  const rightWingY = headTipY - headLength * Math.sin(Math.atan2(dy, dx) + headWingAngle);

  // 화살표 머리 안쪽 채우기 (손으로 빗금 친 크레파스 텍스처)
  const numHatches = isShortMove ? 12 : 16;
  for (let h = 0; h < numHatches; h++) {
    const t = h / numHatches;
    const bx = leftWingX + (rightWingX - leftWingX) * t;
    const by = leftWingY + (rightWingY - leftWingY) * t;

    ctx.strokeStyle = crayon.rgba(0.38 + rand() * 0.35);
    ctx.lineWidth = 2.4 + rand() * 1.4;
    ctx.beginPath();
    ctx.moveTo(bx + (rand() - 0.5) * 2, by + (rand() - 0.5) * 2);
    ctx.lineTo(headTipX + (rand() - 0.5) * 2, headTipY + (rand() - 0.5) * 2);
    ctx.stroke();
  }

  // 화살표 양 날개 윤곽선 덧칠
  for (let w = 0; w < 3; w++) {
    ctx.strokeStyle = crayon.rgba(0.6 + rand() * 0.3);
    ctx.lineWidth = 2.8 + rand() * 1.4;

    ctx.beginPath();
    ctx.moveTo(headTipX + (rand() - 0.5), headTipY + (rand() - 0.5));
    ctx.lineTo(leftWingX + (rand() - 0.5) * 2, leftWingY + (rand() - 0.5) * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(headTipX + (rand() - 0.5), headTipY + (rand() - 0.5));
    ctx.lineTo(rightWingX + (rand() - 0.5) * 2, rightWingY + (rand() - 0.5) * 2);
    ctx.stroke();
  }

  // 화살표 머리 주변 미세 가루
  const numHeadGrains = isShortMove ? 14 : 20;
  for (let g = 0; g < numHeadGrains; g++) {
    const hgx = headTipX - ux * (rand() * headLength) + nx * ((rand() - 0.5) * 14);
    const hgy = headTipY - uy * (rand() * headLength) + ny * ((rand() - 0.5) * 14);
    ctx.beginPath();
    ctx.arc(hgx, hgy, 0.8 + rand() * 1.2, 0, Math.PI * 2);
    ctx.fillStyle = crayon.rgba(0.28 + rand() * 0.4);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * 손으로 크레파스 원을 둥글게 치고 번호를 적은 듯한 아날로그 스텝 배지
 */
function drawCrayonStepBadge(ctx, x, y, step, robotColor, rand, radius = 17) {
  const crayon = CRAYON_PALETTE[robotColor] || CRAYON_PALETTE[ROBOT_COLORS.RED];
  const stepStr = String(step);
  const isTwoDigits = stepStr.length >= 2;

  // 두 자리 숫자(10 이상)일 경우 가로 폭을 고려하여 크기 조정
  const effectiveRadius = isTwoDigits ? Math.max(radius, 17.5) : radius;

  ctx.save();

  // 1. 배지 바탕 (보드 위에서 숫자가 선명하게 읽히도록 부드러운 화이트 패치)
  ctx.beginPath();
  ctx.arc(x, y, effectiveRadius + 1.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 253, 248, 0.95)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 1.5;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // 2. 크레파스로 손으로 둥글게 2~3번 덧그린 듯한 도톰한 테두리
  for (let pass = 0; pass < 3; pass++) {
    ctx.beginPath();
    const segments = 26;
    for (let s = 0; s <= segments; s++) {
      const angle = (s / segments) * Math.PI * 2;
      const rOffset = (rand() - 0.5) * 1.8;
      const px = x + Math.cos(angle) * (effectiveRadius + rOffset);
      const py = y + Math.sin(angle) * (effectiveRadius + rOffset);
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = crayon.rgba(0.72 + rand() * 0.25);
    ctx.lineWidth = 2.4 + rand() * 1.0;
    ctx.stroke();
  }

  // 3. 한눈에 시원하게 보이는 큼직한 번호 텍스트
  const fontSize = isTwoDigits ? (effectiveRadius <= 16 ? 15 : 17) : (effectiveRadius <= 16 ? 18 : 21);
  ctx.font = `900 ${fontSize}px "Pretendard", -apple-system, sans-serif`;
  ctx.fillStyle = crayon.stroke;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(stepStr, x, y + 0.5);

  ctx.restore();
}

/**
 * 풀이 경로를 크레파스 질감으로 일괄 렌더링
 */
function renderCrayonSolutionRoute(ctx, path) {
  if (!Array.isArray(path) || path.length === 0) return;

  const rand = createPseudoRandom(42981);

  // 1. 모든 화살표 스트로크 렌더링 (타일 중심에서 중심까지 온전한 길이 확보)
  path.forEach((move) => {
    const { robotColor, from, to } = move;
    if (!from || !to) return;

    const sx = BOARD_X + (from.col + 0.5) * CELL_SIZE;
    const sy = BOARD_Y + (from.row + 0.5) * CELL_SIZE;
    const ex = BOARD_X + (to.col + 0.5) * CELL_SIZE;
    const ey = BOARD_Y + (to.row + 0.5) * CELL_SIZE;

    drawCrayonArrow(ctx, sx, sy, ex, ey, robotColor, rand);
  });

  // 2. 스텝 번호 배지 렌더링 (화살표 위에 겹쳐 2차 패스로 깔끔하게 표출)
  const placedBadges = [];

  path.forEach((move) => {
    const { step, robotColor, from, to } = move;
    if (!from || !to) return;

    const sx = BOARD_X + (from.col + 0.5) * CELL_SIZE;
    const sy = BOARD_Y + (from.row + 0.5) * CELL_SIZE;
    const ex = BOARD_X + (to.col + 0.5) * CELL_SIZE;
    const ey = BOARD_Y + (to.row + 0.5) * CELL_SIZE;

    const moveLen = Math.hypot(ex - sx, ey - sy);
    const isShortMove = moveLen <= CELL_SIZE * 1.25;

    // 시원하고 큼직하게 표출되도록 배지 기본 반지름 확대
    const defaultT = isShortMove ? 0.3 : 0.5;
    const badgeRadius = isShortMove ? 15 : 17.5;

    let t = defaultT;
    let badgeX = sx + (ex - sx) * t;
    let badgeY = sy + (ey - sy) * t;

    // 배지 간 겹침 방지 (배지 크기 확대에 맞춰 거리 기준 30px로 조정)
    const isOverlapping = (x, y) =>
      placedBadges.some((b) => Math.hypot(b.x - x, b.y - y) < 30);

    if (isOverlapping(badgeX, badgeY)) {
      const candidates = isShortMove
        ? [0.24, 0.38, 0.18]
        : [0.35, 0.65, 0.22, 0.78];

      for (const candT of candidates) {
        const cx = sx + (ex - sx) * candT;
        const cy = sy + (ey - sy) * candT;
        if (!isOverlapping(cx, cy)) {
          badgeX = cx;
          badgeY = cy;
          break;
        }
      }
    }

    placedBadges.push({ x: badgeX, y: badgeY });
    drawCrayonStepBadge(ctx, badgeX, badgeY, step, robotColor, rand, badgeRadius);
  });
}

/**
 * 하단 푸터 (완충 제어 성공 문구 및 웹사이트 주소)
 */
function renderFooter(ctx) {
  const footerY = 1205;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, footerY);
  ctx.lineTo(CANVAS_WIDTH - 40, footerY);
  ctx.stroke();

  ctx.font = '600 14px "Pretendard", -apple-system, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('⚡ 지반 진동 최소화 · 유압 충격 완충 분산 제어 성공', 40, footerY + 45);

  ctx.save();
  ctx.textAlign = 'right';
  ctx.font = '600 14px "Pretendard", -apple-system, sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('supportrobots.vercel.app', CANVAS_WIDTH - 40, footerY + 45);
  ctx.restore();
}

/**
 * 실제 보드 + 크레파스 질감 풀이 경로를 오프스크린 캔버스에 렌더링하여 반환
 * @param {object} solution
 * @param {{ pureBoard?: boolean }} [options] pureBoard가 true이면 상하단 텍스트 없이 1:1 순수 보드만 렌더링
 * @returns {HTMLCanvasElement}
 */
export function renderSolutionCanvas(solution, options = {}) {
  const isPureBoard = options.pureBoard === true;
  const canvas = document.createElement('canvas');

  if (isPureBoard) {
    canvas.width = BOARD_SIZE;
    canvas.height = BOARD_SIZE;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D Context를 생성할 수 없습니다.');
    }

    ctx.save();
    ctx.translate(-BOARD_X, -BOARD_Y);

    // 1. 인게임 실제 보드판 (베이지 타일, 격자선, 다크 메탈릭 벽, 중앙 폐쇄 구역, 목표 탈출구)
    renderRealBoard(ctx, solution);

    // 2. 인게임 실제 4대 로봇 말 (시작점 initialRobots에 배치)
    renderRealRobots(ctx, solution.initialRobots);

    // 3. 크레파스 질감 이동 경로 화살표 및 스텝 번호
    renderCrayonSolutionRoute(ctx, solution.path);

    ctx.restore();
    return canvas;
  }

  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D Context를 생성할 수 없습니다.');
  }

  // 1. 전체 매트 배경
  renderCanvasBackground(ctx);

  // 2. 상단 헤더
  renderHeader(ctx, solution);

  // 3. 인게임 실제 보드판 (베이지 타일, 격자선, 다크 메탈릭 벽, 중앙 폐쇄 구역, 목표 탈출구)
  renderRealBoard(ctx, solution);

  // 4. 인게임 실제 4대 로봇 말 (시작점 initialRobots에 배치)
  renderRealRobots(ctx, solution.initialRobots);

  // 5. ★ 크레파스 질감 이동 경로 화살표 및 아날로그 스텝 배지 (로봇 시작점에서 최종 탈출구까지 표현)
  renderCrayonSolutionRoute(ctx, solution.path);

  // 6. 하단 푸터
  renderFooter(ctx);

  return canvas;
}

/**
 * 풀이 캔버스를 이미지 Blob으로 변환
 * @param {object} solution
 * @returns {Promise<Blob>}
 */
export function generateSolutionBlob(solution) {
  return new Promise((resolve, reject) => {
    try {
      const canvas = renderSolutionCanvas(solution);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('이미지 Blob 생성에 실패했습니다.'));
          }
        },
        'image/png',
        1.0
      );
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * 일일 챌린지 풀이 사진 다운로드 (모바일 Web Share 및 파일 다운로드)
 * @param {object} solution
 * @returns {Promise<{ success: boolean, method: 'download' | 'share' }>}
 */
export async function downloadSolutionRouteImage(solution) {
  if (!solution) {
    throw new Error('저장할 풀이 정보가 존재하지 않습니다.');
  }

  const dateSeed = solution.dateSeed || 'daily';
  const diffKey = solution.difficulty || 'normal';
  const moves = solution.moveCount ?? 0;
  const fileName = `support-robots-daily-${dateSeed}-${diffKey}-${moves}moves.png`;

  const blob = await generateSolutionBlob(solution);

  // 모바일 Web Share API 시도
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof File !== 'undefined'
  ) {
    try {
      const file = new File([blob], fileName, { type: 'image/png' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: '서포트 로봇 일일 챌린지 풀이 인증',
          text: `🤖 서포트 로봇 [${diffKey.toUpperCase()}] ${moves}회 이동 풀이 경로 인증샷!`,
        });
        logger.track('route_image_shared', { dateSeed, difficulty: diffKey, moves });
        return { success: true, method: 'share' };
      }
    } catch (shareErr) {
      if (shareErr.name === 'AbortError') {
        return { success: true, method: 'share' };
      }
    }
  }

  // 표준 파일 다운로드 fallback
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();

  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
  }, 1500);

  logger.track('route_image_downloaded', { dateSeed, difficulty: diffKey, moves });
  return { success: true, method: 'download' };
}
