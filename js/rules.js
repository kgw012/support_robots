/**
 * @file rules.js
 * @description 4단계: 공식 규칙 적용 (색상 매칭, 방향 전환(Ricochet) 필수 조건 및 탈출 성공 판정)
 *
 * 규칙 요약:
 * 1. 색상 매칭: 목표 타깃과 동일한 색상의 로봇이 타깃 좌표에 도달해야 함 (단, 'multi' 소용돌이 타깃은 모든 로봇 허용).
 * 2. 방향 전환(Ricochet) 필수: 출발지에서 목적지까지 직진(또는 단일 축 왕복)만으로 도달하는 것은 무효 처리하며,
 *    해당 로봇이 라운드 중 최소 1회 이상 벽이나 다른 로봇에 부딪혀 90도로 꺾인(수평 <-> 수직 전환) 적이 있어야 탈출 성공으로 인정.
 */

import { ROBOT_COLORS } from './boardPresets.js';
import { DIRECTIONS } from './physics.js';

/**
 * 이동 방향이 수평('H')인지 수직('V')인지 축 정보를 반환합니다.
 * @param {string} direction 'UP' | 'RIGHT' | 'DOWN' | 'LEFT'
 * @returns {'H' | 'V' | null}
 */
export function getDirectionAxis(direction) {
  if (direction === DIRECTIONS.LEFT || direction === DIRECTIONS.RIGHT) {
    return 'H';
  }
  if (direction === DIRECTIONS.UP || direction === DIRECTIONS.DOWN) {
    return 'V';
  }
  return null;
}

/**
 * 특정 로봇이 현재까지의 이동 기록(undoStack) 내에서 최소 1회 이상 90도 방향 전환(Ricochet)을 했는지 판정합니다.
 * @param {Array} undoStack 각 원소: [robotColor, prevCoord, prevMoveCount, prevCollisionCount, direction]
 * @param {string} robotColor 확인할 로봇 색상
 * @returns {boolean} 90도 꺾임(수평 <-> 수직 전환)이 1회 이상 존재하면 true
 */
export function hasRobotRicocheted(undoStack, robotColor) {
  let firstAxis = null;

  for (const entry of undoStack) {
    const [movedColor, , , , direction] = entry;
    if (movedColor !== robotColor) continue;

    const axis = getDirectionAxis(direction);
    if (!axis) continue;

    if (firstAxis === null) {
      firstAxis = axis;
    } else if (axis !== firstAxis) {
      // 이전 이동 축과 다른 축(수평 <-> 수직, 즉 90도 방향 전환)이 발생함
      return true;
    }
  }

  return false;
}

/**
 * 해당 로봇이 현재 목표 타깃의 색상 조건에 부합하는지 확인합니다.
 * @param {object} activeTarget { row, col, color, ... }
 * @param {string} robotColor 'red' | 'green' | 'blue' | 'yellow'
 * @returns {boolean}
 */
export function isTargetColorMatch(activeTarget, robotColor) {
  if (!activeTarget || !robotColor) return false;
  if (activeTarget.color === ROBOT_COLORS.MULTI) return true;
  return activeTarget.color === robotColor;
}

/**
 * 로봇 이동 직후 현재 상태가 탈출 성공인지, 혹은 직진 도달 무효(Ricochet 미충족) 상태인지 판정합니다.
 *
 * @param {object} state gameState 객체
 * @param {string} lastMovedRobotColor 방금 이동을 마친 로봇 색상
 * @returns {{
 *   status: 'NONE' | 'INVALID_STRAIGHT' | 'CLEARED',
 *   robotColor: string | null,
 *   moveCount: number,
 *   collisionCount: number,
 *   message: string
 * }}
 */
export function evaluateRoundStatus(state, lastMovedRobotColor) {
  const { activeTarget, robots, undoStack, moveCount, collisionCount } = state;

  if (!activeTarget || !lastMovedRobotColor) {
    return {
      status: 'NONE',
      robotColor: null,
      moveCount,
      collisionCount,
      message: '',
    };
  }

  const pos = robots[lastMovedRobotColor];
  if (!pos) {
    return {
      status: 'NONE',
      robotColor: null,
      moveCount,
      collisionCount,
      message: '',
    };
  }

  // 1. 방금 움직인 로봇이 목표 타깃 좌표 위에 정지했는지 확인
  const isOnTargetCell =
    pos.row === activeTarget.row && pos.col === activeTarget.col;

  if (!isOnTargetCell) {
    return {
      status: 'NONE',
      robotColor: null,
      moveCount,
      collisionCount,
      message: '',
    };
  }

  // 2. 타깃 색상과 로봇 색상이 일치하는지 확인 (다른 색 로봇이 타깃 칸을 밟고 지나가거나 멈춘 경우는 일반 이동)
  if (!isTargetColorMatch(activeTarget, lastMovedRobotColor)) {
    return {
      status: 'NONE',
      robotColor: lastMovedRobotColor,
      moveCount,
      collisionCount,
      message: '',
    };
  }

  // 3. 최소 1회 이상 90도 방향 전환(Ricochet) 여부 확인
  const ricocheted = hasRobotRicocheted(undoStack, lastMovedRobotColor);
  state.hasRicocheted = ricocheted;

  if (!ricocheted) {
    return {
      status: 'INVALID_STRAIGHT',
      robotColor: lastMovedRobotColor,
      moveCount,
      collisionCount,
      message:
        '직진 도달 무효! 최소 1회 이상 벽이나 로봇에 부딪혀 90도 방향 전환(Ricochet) 후 도달해야 합니다.',
    };
  }

  return {
    status: 'CLEARED',
    robotColor: lastMovedRobotColor,
    moveCount,
    collisionCount,
    message: `구조 성공! 총 ${moveCount}회 이동 (완충 충돌 ${collisionCount}회)`,
  };
}

