/**
 * @file boardPresets.js
 * @description 1단계: 보드 타일 프리셋 데이터화 및 8x8 사분면 4개 랜덤 조합 생성기
 *
 * - 벽 비트마스크: 북(NORTH)=1, 동(EAST)=2, 남(SOUTH)=4, 서(WEST)=8
 * - 4개의 8x8 사분면 타일(A, B, C, D)을 기본 방향(좌상단, 0도 회전 기준)으로 정의합니다.
 *   기본 방향(좌상단)에서:
 *   - 북쪽(r=0)과 서쪽(c=0)이 외곽 벽입니다.
 *   - 우하단 모서리 칸(r=7, c=7)이 중앙 2x2 폐쇄 구역을 구성하는 1x1 검은 벽입니다.
 * - 4개의 슬롯(좌상: 0°, 우상: 90°, 우하: 180°, 좌하: 270° 시계방향 회전)에
 *   4개의 8x8 보드판을 랜덤(또는 지정된 순서)으로 배치하여 16x16 보드를 완성합니다.
 */

export const WALL = Object.freeze({
  NONE: 0,
  NORTH: 1, // 북: 1 (0b0001)
  EAST: 2,  // 동: 2 (0b0010)
  SOUTH: 4, // 남: 4 (0b0100)
  WEST: 8,  // 서: 8 (0b1000)
  ALL: 15,  // 사방 폐쇄: 15 (0b1111)
});

export const ROBOT_COLORS = Object.freeze({
  RED: 'red',
  GREEN: 'green',
  BLUE: 'blue',
  YELLOW: 'yellow',
  MULTI: 'multi', // 다색 소용돌이(Vortex) 타깃용
});

export const TARGET_SYMBOLS = Object.freeze({
  CIRCLE: 'circle',     // 원형 (달/Moon)
  TRIANGLE: 'triangle', // 삼각형 (기어/Gear)
  STAR: 'star',         // 십자별 (별/Star)
  HEXAGON: 'hexagon',   // 육각형 (행성/Planet)
  VORTEX: 'vortex',     // 다색 소용돌이 (Whirlpool)
});

/**
 * 중앙 2x2 폐쇄 구역 좌표 (16x16 기준)
 */
export const CENTER_CLOSED_CELLS = Object.freeze([
  { row: 7, col: 7 },
  { row: 7, col: 8 },
  { row: 8, col: 7 },
  { row: 8, col: 8 },
]);

/**
 * 4개의 8x8 사분면 보드 프리셋 정의
 * 모든 프리셋은 '좌상단(Top-Left, 0도)' 배치를 기준으로 정규화되어 있습니다.
 * - 외곽 벽(북쪽 r=0, 서쪽 c=0) 및 중앙 폐쇄 칸(r=7, c=7)은 빌더가 공통 적용하며,
 *   아래 정의에는 각 타일 고유의 외곽 돌출 벽(edgeWalls), 내부 ㄱ자 벽 및 타깃(targets)을 명시합니다.
 */
export const QUADRANT_PRESETS = Object.freeze([
  // =========================================================================
  // 보드 A (사진의 좌상단 보드 - 다색 소용돌이 포함)
  // =========================================================================
  {
    id: 'A',
    name: 'Sector A (Vortex)',
    edgeWalls: [
      { row: 0, col: 3, wall: WALL.EAST },  // 상단 외벽에서 아래로 돌출된 수직 벽 (c=3과 c=4 사이)
      { row: 6, col: 0, wall: WALL.SOUTH }, // 좌측 외벽에서 오른쪽으로 돌출된 수평 벽 (r=6과 r=7 사이)
    ],
    targets: [
      { row: 1, col: 6, color: ROBOT_COLORS.BLUE,   symbol: TARGET_SYMBOLS.CIRCLE,   walls: WALL.SOUTH | WALL.WEST },
      { row: 3, col: 1, color: ROBOT_COLORS.YELLOW, symbol: TARGET_SYMBOLS.TRIANGLE, walls: WALL.NORTH | WALL.EAST },
      { row: 4, col: 5, color: ROBOT_COLORS.GREEN,  symbol: TARGET_SYMBOLS.HEXAGON,  walls: WALL.NORTH | WALL.WEST },
      { row: 5, col: 2, color: ROBOT_COLORS.RED,    symbol: TARGET_SYMBOLS.STAR,     walls: WALL.SOUTH | WALL.EAST },
      { row: 5, col: 7, color: ROBOT_COLORS.MULTI,  symbol: TARGET_SYMBOLS.VORTEX,   walls: WALL.SOUTH | WALL.EAST },
    ],
  },

  // =========================================================================
  // 보드 B (사진의 우상단 보드를 좌상단 0도 기준으로 역회전 정규화)
  // - 사진(우상단, 90° CW 상태)에서의 좌표 -> 좌상단(0°) 좌표 변환: (r, c) = (7 - lc, lr)
  // =========================================================================
  {
    id: 'B',
    name: 'Sector B',
    edgeWalls: [
      { row: 0, col: 3, wall: WALL.EAST },  // 우상단 배치 시 우측 외벽(r=3, c=15)의 남쪽 벽이 됨
      { row: 4, col: 0, wall: WALL.NORTH }, // 우상단 배치 시 상단 외벽(r=0, c=11)의 동쪽 벽이 됨
    ],
    targets: [
      { row: 2, col: 1, color: ROBOT_COLORS.RED,    symbol: TARGET_SYMBOLS.HEXAGON,  walls: WALL.SOUTH | WALL.WEST },
      { row: 6, col: 2, color: ROBOT_COLORS.BLUE,   symbol: TARGET_SYMBOLS.TRIANGLE, walls: WALL.NORTH | WALL.EAST },
      { row: 1, col: 5, color: ROBOT_COLORS.GREEN,  symbol: TARGET_SYMBOLS.STAR,     walls: WALL.EAST | WALL.SOUTH },
      { row: 4, col: 6, color: ROBOT_COLORS.YELLOW, symbol: TARGET_SYMBOLS.CIRCLE,   walls: WALL.NORTH | WALL.WEST },
    ],
  },

  // =========================================================================
  // 보드 C (사진의 좌하단 보드를 좌상단 0도 기준으로 역회전 정규화)
  // - 사진(좌하단, 270° CW 상태)에서의 좌표 -> 좌상단(0°) 좌표 변환: (r, c) = (lc, 7 - lr)
  // =========================================================================
  {
    id: 'C',
    name: 'Sector C',
    edgeWalls: [
      { row: 0, col: 4, wall: WALL.WEST },  // 좌하단 배치 시 좌측 외벽(r=11, c=0)의 남쪽 벽이 됨
      { row: 4, col: 0, wall: WALL.SOUTH }, // 좌하단 배치 시 하단 외벽(r=15, c=4)의 동쪽 벽이 됨
    ],
    targets: [
      { row: 5, col: 7, color: ROBOT_COLORS.RED,    symbol: TARGET_SYMBOLS.TRIANGLE, walls: WALL.SOUTH | WALL.WEST },
      { row: 2, col: 5, color: ROBOT_COLORS.BLUE,   symbol: TARGET_SYMBOLS.STAR,     walls: WALL.EAST | WALL.SOUTH },
      { row: 4, col: 2, color: ROBOT_COLORS.GREEN,  symbol: TARGET_SYMBOLS.CIRCLE,   walls: WALL.NORTH | WALL.EAST },
      { row: 6, col: 1, color: ROBOT_COLORS.YELLOW, symbol: TARGET_SYMBOLS.HEXAGON,  walls: WALL.NORTH | WALL.WEST },
    ],
  },

  // =========================================================================
  // 보드 D (사진의 우하단 보드를 좌상단 0도 기준으로 역회전 정규화)
  // - 사진(우하단, 180° CW 상태)에서의 좌표 -> 좌상단(0°) 좌표 변환: (r, c) = (7 - lr, 7 - lc)
  // =========================================================================
  {
    id: 'D',
    name: 'Sector D',
    edgeWalls: [
      { row: 0, col: 5, wall: WALL.WEST },  // 우하단 배치 시 하단 외벽(r=15, c=10)의 동쪽 벽이 됨
      { row: 7, col: 0, wall: WALL.NORTH }, // 우하단 배치 시 우측 외벽(r=8, c=15)의 남쪽 벽이 됨
    ],
    targets: [
      { row: 6, col: 4, color: ROBOT_COLORS.BLUE,   symbol: TARGET_SYMBOLS.HEXAGON,  walls: WALL.NORTH | WALL.EAST },
      { row: 4, col: 1, color: ROBOT_COLORS.RED,    symbol: TARGET_SYMBOLS.CIRCLE,   walls: WALL.SOUTH | WALL.WEST },
      { row: 3, col: 6, color: ROBOT_COLORS.YELLOW, symbol: TARGET_SYMBOLS.STAR,     walls: WALL.SOUTH | WALL.EAST },
      { row: 1, col: 2, color: ROBOT_COLORS.GREEN,  symbol: TARGET_SYMBOLS.TRIANGLE, walls: WALL.NORTH | WALL.WEST },
    ],
  },
]);

/**
 * 단일 칸의 4비트 벽 마스크를 시계방향으로 90도 회전합니다.
 * 북(1) -> 동(2) -> 남(4) -> 서(8) -> 북(1)
 * @param {number} mask 0~15 사이의 비트마스크
 * @param {number} quarterTurns 시계방향 90도 회전 횟수 (0, 1, 2, 3)
 * @returns {number} 회전된 비트마스크
 */
export function rotateWallMask(mask, quarterTurns = 1) {
  const turns = ((quarterTurns % 4) + 4) % 4;
  let result = mask & WALL.ALL;
  for (let i = 0; i < turns; i++) {
    result = ((result << 1) & WALL.ALL) | (result >> 3);
  }
  return result;
}

/**
 * 8x8 격자 내의 좌표 (row, col)을 시계방향으로 90도씩 회전합니다.
 * @param {number} row 0~7
 * @param {number} col 0~7
 * @param {number} quarterTurns 시계방향 90도 회전 횟수 (0, 1, 2, 3)
 * @returns {{ row: number, col: number }}
 */
export function rotateCoord8x8(row, col, quarterTurns = 1) {
  const turns = ((quarterTurns % 4) + 4) % 4;
  let r = row;
  let c = col;
  for (let i = 0; i < turns; i++) {
    const nextR = c;
    const nextC = 7 - r;
    r = nextR;
    c = nextC;
  }
  return { row: r, col: c };
}

/**
 * 정규화된(좌상단 0도 기준) 사분면 프리셋을 받아 8x8 벽 배열과 타깃 목록을 생성한 뒤,
 * 지정된 슬롯 위치에 맞게 회전시켜 반환합니다.
 *
 * 슬롯 인덱스 및 회전 규칙 (가운데 1x1 검은 벽이 항상 16x16의 중앙을 향하도록 회전):
 * - slot 0 (좌상단, Top-Left):     0도 회전   (quarterTurns = 0, 오프셋 r+0, c+0)
 * - slot 1 (우상단, Top-Right):    90도 회전  (quarterTurns = 1, 오프셋 r+0, c+8)
 * - slot 2 (좌하단, Bottom-Left):  270도 회전 (quarterTurns = 3, 오프셋 r+8, c+0)
 * - slot 3 (우하단, Bottom-Right): 180도 회전 (quarterTurns = 2, 오프셋 r+8, c+8)
 *
 * @param {object} preset QUADRANT_PRESETS의 요소
 * @param {number} slotIndex 배치될 사분면 슬롯 (0: 좌상, 1: 우상, 2: 좌하, 3: 우하)
 */
export function buildRotatedQuadrant(preset, slotIndex) {
  const slotConfig = [
    { quarterTurns: 0, rowOffset: 0, colOffset: 0 }, // 0: 좌상단 (TL)
    { quarterTurns: 1, rowOffset: 0, colOffset: 8 }, // 1: 우상단 (TR)
    { quarterTurns: 3, rowOffset: 8, colOffset: 0 }, // 2: 좌하단 (BL)
    { quarterTurns: 2, rowOffset: 8, colOffset: 8 }, // 3: 우하단 (BR)
  ][slotIndex];

  if (!slotConfig) {
    throw new Error(`유효하지 않은 슬롯 인덱스입니다: ${slotIndex}`);
  }

  const { quarterTurns, rowOffset, colOffset } = slotConfig;

  // 1. 0도 기준 8x8 빈 그리드 초기화
  const baseGrid = Array.from({ length: 8 }, () => Array(8).fill(WALL.NONE));

  // 외곽 벽 설정 (좌상단 기준: 북쪽 r=0, 서쪽 c=0)
  for (let i = 0; i < 8; i++) {
    baseGrid[0][i] |= WALL.NORTH;
    baseGrid[i][0] |= WALL.WEST;
  }

  // 중앙 1x1 폐쇄 구역 (좌상단 기준: r=7, c=7)
  baseGrid[7][7] = WALL.ALL;

  // 외벽 돌출 벽 적용
  for (const edge of preset.edgeWalls) {
    baseGrid[edge.row][edge.col] |= edge.wall;
  }

  // 타깃 주변 ㄱ자 벽 적용
  for (const target of preset.targets) {
    baseGrid[target.row][target.col] |= target.walls;
  }

  // 2. quarterTurns 만큼 8x8 벽 그리드 및 타깃 좌표를 회전
  const rotatedGrid = Array.from({ length: 8 }, () => Array(8).fill(WALL.NONE));
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const { row: nr, col: nc } = rotateCoord8x8(r, c, quarterTurns);
      rotatedGrid[nr][nc] = rotateWallMask(baseGrid[r][c], quarterTurns);
    }
  }

  const rotatedTargets = preset.targets.map((target) => {
    const { row: nr, col: nc } = rotateCoord8x8(target.row, target.col, quarterTurns);
    return {
      row: nr + rowOffset,
      col: nc + colOffset,
      color: target.color,
      symbol: target.symbol,
      walls: rotateWallMask(target.walls, quarterTurns),
      quadrantId: preset.id,
    };
  });

  return {
    quadrantId: preset.id,
    slotIndex,
    quarterTurns,
    rowOffset,
    colOffset,
    grid: rotatedGrid,
    targets: rotatedTargets,
  };
}

/**
 * 16x16 격자의 모든 인접한 칸 사이에 벽 비트마스크를 양방향으로 동기화합니다.
 * 예: (r, c)에 동쪽(EAST) 벽이 있으면 (r, c+1)에는 반드시 서쪽(WEST) 벽이 존재하도록 보장합니다.
 * @param {number[][]} grid 16x16 2차원 비트마스크 배열
 */
export function syncBidirectionalWalls(grid) {
  const size = 16;

  // 최외곽 테두리 벽 및 중앙 4칸(7,7 / 7,8 / 8,7 / 8,8) 폐쇄 구역 강제 보장
  for (let i = 0; i < size; i++) {
    grid[0][i] |= WALL.NORTH;
    grid[size - 1][i] |= WALL.SOUTH;
    grid[i][0] |= WALL.WEST;
    grid[i][size - 1] |= WALL.EAST;
  }

  for (const { row, col } of CENTER_CLOSED_CELLS) {
    grid[row][col] = WALL.ALL;
  }

  // 인접 칸 양방향 동기화
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const mask = grid[r][c];
      if ((mask & WALL.NORTH) && r > 0) {
        grid[r - 1][c] |= WALL.SOUTH;
      }
      if ((mask & WALL.SOUTH) && r < size - 1) {
        grid[r + 1][c] |= WALL.NORTH;
      }
      if ((mask & WALL.WEST) && c > 0) {
        grid[r][c - 1] |= WALL.EAST;
      }
      if ((mask & WALL.EAST) && c < size - 1) {
        grid[r][c + 1] |= WALL.WEST;
      }
    }
  }

  return grid;
}

/**
 * 4개의 8x8 사분면 보드 프리셋을 조합하여 16x16 게임 보드 데이터를 생성합니다.
 *
 * @param {object} [options]
 * @param {string[]} [options.quadrantOrder] 길이 4인 보드 ID 배열 (예: ['A', 'B', 'C', 'D']).
 *   생략 시 4개의 보드판을 랜덤하게 섞어 배치합니다 (좌상, 우상, 좌하, 우하 순서).
 * @param {function(): number} [options.randomFn] 0 이상 1 미만의 난수를 반환하는 함수 (일일 챌린지 시드 고정용, 기본값 Math.random)
 * @returns {{
 *   quadrantOrder: string[],
 *   grid: number[][],
 *   targets: Array<{ row: number, col: number, color: string, symbol: string, walls: number, quadrantId: string }>,
 *   closedCells: ReadonlyArray<{ row: number, col: number }>
 * }}
 */
export function createBoardData(options = {}) {
  const { quadrantOrder, randomFn = Math.random } = options;

  let orderedIds;
  if (Array.isArray(quadrantOrder) && quadrantOrder.length === 4) {
    orderedIds = [...quadrantOrder];
  } else {
    // Fisher-Yates 셔플로 4개의 8x8 보드판을 랜덤 배치
    orderedIds = QUADRANT_PRESETS.map((p) => p.id);
    for (let i = orderedIds.length - 1; i > 0; i--) {
      const j = Math.floor(randomFn() * (i + 1));
      [orderedIds[i], orderedIds[j]] = [orderedIds[j], orderedIds[i]];
    }
  }

  const grid = Array.from({ length: 16 }, () => Array(16).fill(WALL.NONE));
  const targets = [];

  orderedIds.forEach((id, slotIndex) => {
    const preset = QUADRANT_PRESETS.find((p) => p.id === id);
    if (!preset) {
      throw new Error(`알 수 없는 사분면 보드 프리셋 ID입니다: ${id}`);
    }

    const rotated = buildRotatedQuadrant(preset, slotIndex);

    // 16x16 그리드에 8x8 사분면 복사
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        grid[rotated.rowOffset + r][rotated.colOffset + c] |= rotated.grid[r][c];
      }
    }

    targets.push(...rotated.targets);
  });

  // 사분면 경계선 및 중앙 폐쇄 구역의 양방향 벽 동기화
  syncBidirectionalWalls(grid);

  return {
    quadrantOrder: orderedIds,
    grid,
    targets,
    closedCells: CENTER_CLOSED_CELLS,
  };
}
