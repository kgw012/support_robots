/**
 * @file physics.js
 * @description 3단계: 로봇 직선 슬라이딩 물리 엔진 및 충돌 판정 모듈
 *
 * - 지정된 방향으로 이동 시 장애물(외곽 벽, 중앙 차단 구역, 내부 벽, 다른 로봇)을 만날 때까지
 *   미끄러져 이동한 최종 정지 좌표와 충돌 대상(벽 vs 다른 로봇)을 계산합니다.
 */

import { WALL } from './boardPresets.js';
import { PLAYABLE_ROBOTS, isCenterClosedCell } from './state.js';

export const DIRECTIONS = Object.freeze({
  UP: 'UP',
  RIGHT: 'RIGHT',
  DOWN: 'DOWN',
  LEFT: 'LEFT',
});

export const DIRECTION_VECTORS = Object.freeze({
  [DIRECTIONS.UP]:    { dr: -1, dc: 0,  wallMask: WALL.NORTH, oppositeWallMask: WALL.SOUTH },
  [DIRECTIONS.RIGHT]: { dr: 0,  dc: 1,  wallMask: WALL.EAST,  oppositeWallMask: WALL.WEST },
  [DIRECTIONS.DOWN]:  { dr: 1,  dc: 0,  wallMask: WALL.SOUTH, oppositeWallMask: WALL.NORTH },
  [DIRECTIONS.LEFT]:  { dr: 0,  dc: -1, wallMask: WALL.WEST,  oppositeWallMask: WALL.EAST },
});

/**
 * 특정 칸(row, col)에 다른 로봇이 있는지 확인하고, 있다면 해당 로봇의 색상을 반환합니다.
 * @param {object} robots { red: {row, col}, ... }
 * @param {number} row
 * @param {number} col
 * @param {string} [excludeColor] 제외할 로봇 색상 (자기 자신)
 * @returns {string|null} 충돌한 로봇 색상 또는 null
 */
export function getRobotAt(robots, row, col, excludeColor = null) {
  for (const color of PLAYABLE_ROBOTS) {
    if (color === excludeColor) continue;
    const pos = robots[color];
    if (pos && pos.row === row && pos.col === col) {
      return color;
    }
  }
  return null;
}

/**
 * 로봇이 특정 방향으로 미끄러졌을 때의 최종 정지 좌표와 충돌 정보를 계산하는 순수 함수입니다.
 *
 * @param {number[][]} grid 16x16 벽 비트마스크 2차원 배열
 * @param {object} robots 현재 4대 로봇의 위치 객체
 * @param {string} robotColor 이동할 로봇 색상
 * @param {string} direction 'UP' | 'RIGHT' | 'DOWN' | 'LEFT'
 * @returns {{
 *   robotColor: string,
 *   direction: string,
 *   moved: boolean,
 *   startRow: number,
 *   startCol: number,
 *   endRow: number,
 *   endCol: number,
 *   steps: number,
 *   stoppedBy: 'wall' | 'robot' | null,
 *   collidedRobot: string | null
 * }}
 */
export function computeSlideDestination(grid, robots, robotColor, direction) {
  const startPos = robots[robotColor];
  if (!startPos) {
    throw new Error(`유효하지 않은 로봇 색상입니다: ${robotColor}`);
  }

  const dirInfo = DIRECTION_VECTORS[direction];
  if (!dirInfo) {
    throw new Error(`유효하지 않은 이동 방향입니다: ${direction}`);
  }

  let r = startPos.row;
  let c = startPos.col;
  let steps = 0;
  let stoppedBy = null;
  let collidedRobot = null;

  while (true) {
    // 1. 현재 칸에서 진행 방향으로 벽이 막고 있는지 확인 (외곽 벽, 내부 벽 포함)
    if (grid[r][c] & dirInfo.wallMask) {
      stoppedBy = 'wall';
      break;
    }

    const nr = r + dirInfo.dr;
    const nc = c + dirInfo.dc;

    // 2. 보드 경계(0~15)를 벗어나는지 확인
    if (nr < 0 || nr >= 16 || nc < 0 || nc >= 16) {
      stoppedBy = 'wall';
      break;
    }

    // 3. 다음 칸의 진입 방향 벽 또는 중앙 2x2 폐쇄 구역인지 확인
    if (
      isCenterClosedCell(nr, nc) ||
      (grid[nr][nc] & dirInfo.oppositeWallMask)
    ) {
      stoppedBy = 'wall';
      break;
    }

    // 4. 다음 칸에 다른 로봇이 서 있는지 확인 (유압식 충격 흡수 장치 작동 조건)
    const blockingRobot = getRobotAt(robots, nr, nc, robotColor);
    if (blockingRobot) {
      stoppedBy = 'robot';
      collidedRobot = blockingRobot;
      break;
    }

    // 장애물이 없으면 다음 칸으로 미끄러짐 진행
    r = nr;
    c = nc;
    steps += 1;
  }

  return {
    robotColor,
    direction,
    moved: steps > 0,
    startRow: startPos.row,
    startCol: startPos.col,
    endRow: r,
    endCol: c,
    steps,
    stoppedBy,
    collidedRobot,
  };
}
