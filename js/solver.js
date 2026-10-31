/**
 * @file solver.js
 * @description 6~7단계: BFS 자동 맵 솔버, 난이도 자동 분류(Easy/Hard/Hell) 및 승리 우선권 타이 브레이커 모듈
 *
 * 핵심 기능:
 * 1. 너비 우선 탐색(BFS + 레벨별 최대 완충 횟수 DP)을 통해 현재 맵의:
 *    - 수학적 최소 해결 이동 횟수(minMoves)
 *    - 해당 최단 이동 횟수 내에서 달성 가능한 최대 로봇 간 완충 충돌 횟수(maxCollisions)
 *    를 동시에 계산합니다 (최소 1회 90도 방향 전환 Ricochet 필수 규칙 반영).
 * 2. 최단 해결 횟수에 따른 난이도 자동 분류 (4단계):
 *    - Easy: 1~4회
 *    - Normal: 5~7회
 *    - Hard: 8~9회
 *    - Hell: 10회 이상
 * 3. 6단계 커스텀 승리 우선권 타이 브레이커 비교 함수 및 수치 비노출 힌트 피드백 루틴 제공
 * 4. 보드 1판의 17개 타깃을 로봇 색상별 4회 탐색만으로 일괄 채점하는 멀티 타깃 스캐너 제공
 */

import { WALL, ROBOT_COLORS } from './boardPresets.js';
import { PLAYABLE_ROBOTS, isCenterClosedCell } from './state.js';

export const DIFFICULTY_TIERS = Object.freeze({
  EASY: { id: 'easy', label: 'EASY', min: 1, max: 4 },
  NORMAL: { id: 'normal', label: 'NORMAL', min: 5, max: 7 },
  HARD: { id: 'hard', label: 'HARD', min: 8, max: 9 },
  HELL: { id: 'hell', label: 'HELL', min: 10, max: Infinity },
});

/**
 * 최단 해결 이동 횟수(minMoves)에 따라 난이도를 4단계로 분류합니다.
 * @param {number|null} minMoves 솔버가 계산한 최단 이동 횟수
 * @returns {{ id: 'easy'|'normal'|'hard'|'hell'|'unsolved', label: string }}
 */
export function classifyDifficulty(minMoves) {
  if (typeof minMoves !== 'number' || minMoves < 1 || !Number.isFinite(minMoves)) {
    return { id: 'unsolved', label: 'UNKNOWN' };
  }
  if (minMoves <= 4) {
    return { id: DIFFICULTY_TIERS.EASY.id, label: DIFFICULTY_TIERS.EASY.label };
  }
  if (minMoves <= 7) {
    return { id: DIFFICULTY_TIERS.NORMAL.id, label: DIFFICULTY_TIERS.NORMAL.label };
  }
  if (minMoves <= 9) {
    return { id: DIFFICULTY_TIERS.HARD.id, label: DIFFICULTY_TIERS.HARD.label };
  }
  return { id: DIFFICULTY_TIERS.HELL.id, label: DIFFICULTY_TIERS.HELL.label };
}

/**
 * 6단계 커스텀 승리 우선권 타이 브레이커 비교 함수
 * - 우선순위 1: 최소 이동 횟수 (moveCount가 낮을수록 우수)
 * - 우선순위 2: 최다 로봇 간 충돌 횟수 (이동 횟수가 같다면 collisionCount가 높을수록 우수)
 * - 우선순위 3: 제출 시각 (submittedAt이 빠를수록 우수 - 선택적 비교)
 *
 * @param {{ moveCount: number, collisionCount: number, submittedAt?: number|string }} a
 * @param {{ moveCount: number, collisionCount: number, submittedAt?: number|string }} b
 * @returns {number} a가 더 우수하면 음수(<0), b가 더 우수하면 양수(>0), 완전히 동일하면 0
 */
export function compareRecords(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  // 우선순위 1: 최소 이동 횟수 (ASC)
  if (a.moveCount !== b.moveCount) {
    return a.moveCount - b.moveCount;
  }

  // 우선순위 2: 최다 로봇 간 완충 충돌 횟수 (DESC)
  if (a.collisionCount !== b.collisionCount) {
    return b.collisionCount - a.collisionCount;
  }

  // 우선순위 3: 먼저 제출한 시각 (ASC)
  if (a.submittedAt && b.submittedAt) {
    const timeA = new Date(a.submittedAt).getTime();
    const timeB = new Date(b.submittedAt).getTime();
    if (timeA !== timeB) {
      return timeA - timeB;
    }
  }

  return 0;
}

/**
 * 16x16 보드에서 각 칸(0~255)과 4방향(0:북, 1:동, 2:남, 3:서)에 대해
 * 다른 로봇이 없을 때 벽에 부딪혀 멈추는 최종 칸 인덱스(0~255)를 사전 계산합니다.
 * @param {number[][]} grid 16x16 벽 비트마스크 배열
 * @returns {Uint8Array} 길이 256 * 4 인 1차원 배열 (인덱스: (cellIdx << 2) | dir)
 */
export function buildWallSlideTable(grid) {
  const table = new Uint8Array(256 * 4);
  const dr = [-1, 0, 1, 0];
  const dc = [0, 1, 0, -1];
  const wallMasks = [WALL.NORTH, WALL.EAST, WALL.SOUTH, WALL.WEST];
  const oppMasks = [WALL.SOUTH, WALL.WEST, WALL.NORTH, WALL.EAST];

  for (let r = 0; r < 16; r++) {
    for (let c = 0; c < 16; c++) {
      const startIdx = (r << 4) | c;

      for (let dir = 0; dir < 4; dir++) {
        let cr = r;
        let cc = c;

        while (true) {
          if (grid[cr][cc] & wallMasks[dir]) break;
          const nr = cr + dr[dir];
          const nc = cc + dc[dir];
          if (nr < 0 || nr >= 16 || nc < 0 || nc >= 16) break;
          if (isCenterClosedCell(nr, nc) || (grid[nr][nc] & oppMasks[dir])) break;
          cr = nr;
          cc = nc;
        }

        table[(startIdx << 2) | dir] = (cr << 4) | cc;
      }
    }
  }

  return table;
}

/**
 * 사전 계산된 벽 테이블과 다른 3대 로봇의 좌표(o1, o2, o3)를 이용해
 * startIdx에서 dir 방향으로 미끄러졌을 때 정지하는 최종 칸 인덱스(0~255)와
 * 로봇 충돌 여부(0 또는 1)를 패킹하여 ((endIdx << 1) | hitRobot) 형태로 O(1) 반환합니다.
 *
 * @param {Uint8Array} wallTable buildWallSlideTable 반환값
 * @param {number} startIdx 출발 칸 인덱스 (0~255)
 * @param {number} dir 이동 방향 (0:UP, 1:RIGHT, 2:DOWN, 3:LEFT)
 * @param {number} o1 다른 로봇 1의 칸 인덱스
 * @param {number} o2 다른 로봇 2의 칸 인덱스
 * @param {number} o3 다른 로봇 3의 칸 인덱스
 * @returns {number} (endIdx << 1) | hitRobot
 */
function slideFastWithCollision(wallTable, startIdx, dir, o1, o2, o3) {
  const wallEndIdx = wallTable[(startIdx << 2) | dir];
  const r = startIdx >> 4;
  const c = startIdx & 15;
  const others = [o1, o2, o3];
  let hitRobot = 0;

  if (dir === 0) {
    // UP (같은 열, 행 감소)
    let stopRow = wallEndIdx >> 4;
    for (let i = 0; i < 3; i++) {
      const pos = others[i];
      if ((pos & 15) === c) {
        const or = pos >> 4;
        if (or < r && or >= stopRow) {
          stopRow = or + 1;
          hitRobot = 1;
        }
      }
    }
    return (((stopRow << 4) | c) << 1) | hitRobot;
  }

  if (dir === 1) {
    // RIGHT (같은 행, 열 증가)
    let stopCol = wallEndIdx & 15;
    for (let i = 0; i < 3; i++) {
      const pos = others[i];
      if ((pos >> 4) === r) {
        const oc = pos & 15;
        if (oc > c && oc <= stopCol) {
          stopCol = oc - 1;
          hitRobot = 1;
        }
      }
    }
    return (((r << 4) | stopCol) << 1) | hitRobot;
  }

  if (dir === 2) {
    // DOWN (같은 열, 행 증가)
    let stopRow = wallEndIdx >> 4;
    for (let i = 0; i < 3; i++) {
      const pos = others[i];
      if ((pos & 15) === c) {
        const or = pos >> 4;
        if (or > r && or <= stopRow) {
          stopRow = or - 1;
          hitRobot = 1;
        }
      }
    }
    return (((stopRow << 4) | c) << 1) | hitRobot;
  }

  // LEFT (dir === 3, 같은 행, 열 감소)
  let stopCol = wallEndIdx & 15;
  for (let i = 0; i < 3; i++) {
    const pos = others[i];
    if ((pos >> 4) === r) {
      const oc = pos & 15;
      if (oc < c && oc >= stopCol) {
        stopCol = oc + 1;
        hitRobot = 1;
      }
    }
  }
  return (((r << 4) | stopCol) << 1) | hitRobot;
}

/**
 * 3대의 보조 로봇 위치(0~255)를 오름차순으로 정렬하여 24비트 정수로 패킹합니다.
 */
function packSortedHelpers(a, b, c) {
  let x = a;
  let y = b;
  let z = c;
  if (x > y) { const t = x; x = y; y = t; }
  if (y > z) { const t = y; y = z; z = t; }
  if (x > y) { const t = x; x = y; y = t; }
  return (x << 16) | (y << 8) | z;
}

/**
 * 목표 로봇 위치(8비트), 방향 전환 상태(2비트), 정렬된 보조 로봇 3대 위치(24비트)를
 * 단일 34비트 안전 정수(Number) 키로 패킹합니다.
 */
function encodeStateKey(targetPos, axisState, sortedHelpers24) {
  return ((targetPos << 2) | axisState) * 16777216 + sortedHelpers24;
}

/**
 * BFS 알고리즘을 사용하여 현재 맵을 해결할 수 있는 수학적 최소 이동 횟수(minMoves)와
 * 해당 최단 이동 횟수에서 달성 가능한 최대 로봇 간 완충 충돌 횟수(maxCollisions)를 계산합니다.
 *
 * @param {number[][]} grid 16x16 벽 비트마스크 배열
 * @param {object} robots 초기 로봇 위치 { red: {row, col}, green: {row, col}, blue: {row, col}, yellow: {row, col} }
 * @param {object} target 목표 타깃 { row: number, col: number, color: string }
 * @param {object} [options]
 * @param {number} [options.maxDepth=18] 최대 탐색 깊이
 * @param {number} [options.maxStates=500000] 최대 탐색 상태 수 상한
 * @returns {{
 *   solved: boolean,
 *   minMoves: number | null,
 *   maxCollisions: number,
 *   difficulty: { id: string, label: string },
 *   exploredStates: number
 * }}
 */
export function solveBoardBFS(grid, robots, target, options = {}) {
  const { maxDepth = 18, maxStates = 500000 } = options;

  if (!grid || !robots || !target) {
    return {
      solved: false,
      minMoves: null,
      maxCollisions: 0,
      difficulty: classifyDifficulty(null),
      exploredStates: 0,
    };
  }

  const wallTable = buildWallSlideTable(grid);
  const goalIdx = (target.row << 4) | target.col;

  const candidateGoalColors =
    target.color === ROBOT_COLORS.MULTI
      ? PLAYABLE_ROBOTS
      : [target.color];

  // visited Map: key(34비트 상태) -> value((depth << 8) | maxCollisionsAtDepth)
  const visited = new Map();
  let currentLevel = [];

  for (const goalColor of candidateGoalColors) {
    const goalStart = robots[goalColor];
    if (!goalStart) continue;

    const targetPos = (goalStart.row << 4) | goalStart.col;
    const helperIndices = [];

    for (const color of PLAYABLE_ROBOTS) {
      if (color === goalColor) continue;
      const pos = robots[color];
      helperIndices.push((pos.row << 4) | pos.col);
    }

    const sortedHelpers = packSortedHelpers(
      helperIndices[0],
      helperIndices[1],
      helperIndices[2]
    );
    const key = encodeStateKey(targetPos, 0, sortedHelpers);

    if (!visited.has(key)) {
      visited.set(key, 0); // depth=0, collisions=0
      currentLevel.push(key);
    }
  }

  let exploredStates = visited.size;

  /**
   * 다음 상태를 큐에 등록하거나, 동일 깊이(depth)에서 더 높은 완충 충돌 횟수로 도달한 경우 갱신합니다.
   */
  function tryEnqueue(nextLevel, nextKey, depth, nextCollisions) {
    const existing = visited.get(nextKey);
    if (existing === undefined) {
      visited.set(nextKey, (depth << 8) | nextCollisions);
      nextLevel.push(nextKey);
      exploredStates += 1;
    } else {
      const existingDepth = existing >> 8;
      const existingCols = existing & 255;
      if (existingDepth === depth && nextCollisions > existingCols) {
        visited.set(nextKey, (depth << 8) | nextCollisions);
      }
    }
  }

  for (let depth = 1; depth <= maxDepth; depth++) {
    const nextLevel = [];
    let foundAtThisDepth = false;
    let bestCollisionsAtGoal = -1;

    for (let i = 0; i < currentLevel.length; i++) {
      const stateKey = currentLevel[i];
      const baseCollisions = visited.get(stateKey) & 255;

      const high10 = Math.floor(stateKey / 16777216);
      const low24 = stateKey % 16777216;

      const targetPos = high10 >> 2;
      const axisState = high10 & 3;
      const h1 = (low24 >> 16) & 255;
      const h2 = (low24 >> 8) & 255;
      const h3 = low24 & 255;

      // 1. 목표 로봇(targetPos)을 4방향으로 이동
      for (let dir = 0; dir < 4; dir++) {
        const res = slideFastWithCollision(wallTable, targetPos, dir, h1, h2, h3);
        const nextTargetPos = res >> 1;
        if (nextTargetPos === targetPos) continue;

        const nextCollisions = baseCollisions + (res & 1);
        const moveAxisBit = (dir & 1) === 0 ? 2 : 1;
        const nextAxisState = axisState | moveAxisBit;

        if (nextTargetPos === goalIdx && nextAxisState === 3) {
          foundAtThisDepth = true;
          if (nextCollisions > bestCollisionsAtGoal) {
            bestCollisionsAtGoal = nextCollisions;
          }
          continue;
        }

        if (!foundAtThisDepth) {
          const nextKey = encodeStateKey(nextTargetPos, nextAxisState, low24);
          tryEnqueue(nextLevel, nextKey, depth, nextCollisions);
          if (exploredStates >= maxStates) break;
        }
      }

      if (foundAtThisDepth || exploredStates >= maxStates) continue;

      // 2. 보조 로봇 1 (h1)을 4방향으로 이동
      for (let dir = 0; dir < 4; dir++) {
        const res = slideFastWithCollision(wallTable, h1, dir, targetPos, h2, h3);
        const nh1 = res >> 1;
        if (nh1 === h1) continue;
        const nextCollisions = baseCollisions + (res & 1);
        const nextHelpers = packSortedHelpers(nh1, h2, h3);
        const nextKey = encodeStateKey(targetPos, axisState, nextHelpers);
        tryEnqueue(nextLevel, nextKey, depth, nextCollisions);
        if (exploredStates >= maxStates) break;
      }

      if (exploredStates >= maxStates) break;

      // 3. 보조 로봇 2 (h2)를 4방향으로 이동
      for (let dir = 0; dir < 4; dir++) {
        const res = slideFastWithCollision(wallTable, h2, dir, targetPos, h1, h3);
        const nh2 = res >> 1;
        if (nh2 === h2) continue;
        const nextCollisions = baseCollisions + (res & 1);
        const nextHelpers = packSortedHelpers(h1, nh2, h3);
        const nextKey = encodeStateKey(targetPos, axisState, nextHelpers);
        tryEnqueue(nextLevel, nextKey, depth, nextCollisions);
        if (exploredStates >= maxStates) break;
      }

      if (exploredStates >= maxStates) break;

      // 4. 보조 로봇 3 (h3)을 4방향으로 이동
      for (let dir = 0; dir < 4; dir++) {
        const res = slideFastWithCollision(wallTable, h3, dir, targetPos, h1, h2);
        const nh3 = res >> 1;
        if (nh3 === h3) continue;
        const nextCollisions = baseCollisions + (res & 1);
        const nextHelpers = packSortedHelpers(h1, h2, nh3);
        const nextKey = encodeStateKey(targetPos, axisState, nextHelpers);
        tryEnqueue(nextLevel, nextKey, depth, nextCollisions);
        if (exploredStates >= maxStates) break;
      }

      if (exploredStates >= maxStates) break;
    }

    // 현재 깊이(최단 이동 횟수)에서 해답을 찾았다면 해당 깊이의 모든 후보 중 최대 완충 횟수와 함께 반환
    if (foundAtThisDepth) {
      return {
        solved: true,
        minMoves: depth,
        maxCollisions: bestCollisionsAtGoal,
        difficulty: classifyDifficulty(depth),
        exploredStates,
      };
    }

    if (nextLevel.length === 0 || exploredStates >= maxStates) {
      break;
    }
    currentLevel = nextLevel;
  }

  if (exploredStates >= maxStates) {
    return {
      solved: false,
      minMoves: maxDepth,
      maxCollisions: 0,
      difficulty: DIFFICULTY_TIERS.HELL,
      exploredStates,
    };
  }

  return {
    solved: false,
    minMoves: null,
    maxCollisions: 0,
    difficulty: classifyDifficulty(null),
    exploredStates,
  };
}

/**
 * 7단계 피드백 루틴 메시지를 생성합니다.
 * - 몇 회 이동 / 완충 몇 회가 가능한지 구체적인 숫자는 절대 노출하지 않습니다.
 * - 대신 (1) 이동 횟수를 더 줄일 수 있는지, (2) 이동 횟수는 최적인데 완충 충돌을 더 활용할 수 있는지,
 *   (3) 이동과 완충 모두 완벽한 최적 경로인지 구분하여 안내합니다.
 *
 * @param {number} userMoves 유저의 클리어 이동 횟수
 * @param {number} userCollisions 유저의 클리어 로봇 간 완충 충돌 횟수
 * @param {number|null} minMoves BFS 솔버가 계산한 최단 이동 횟수
 * @param {number} [maxCollisions=0] 최단 이동 횟수에서 달성 가능한 최대 로봇 간 완충 충돌 횟수
 * @returns {{ isOptimal: boolean, feedbackMessage: string }}
 */
export function buildSolverFeedback(
  userMoves,
  userCollisions,
  minMoves,
  maxCollisions = 0
) {
  if (typeof minMoves === 'number' && minMoves > 0) {
    if (userMoves > minMoves) {
      return {
        isOptimal: false,
        feedbackMessage:
          '더 좋은 탈출 경로가 있습니다! 이동 횟수를 더 줄여보세요.',
      };
    }

    if (userMoves === minMoves && userCollisions < maxCollisions) {
      return {
        isOptimal: false,
        feedbackMessage:
          '이동 횟수는 최적입니다! 하지만 로봇 간 완충을 더 늘릴 수 있는 경로가 있습니다.',
      };
    }
  }

  return {
    isOptimal: true,
    feedbackMessage: '완벽한 탈출 경로입니다! 최단 이동과 최적 완충을 모두 달성했습니다!',
  };
}

/**
 * 후보 퍼즐의 재미 점수(완충 활용도 중심)를 계산합니다.
 * - 완충 충돌 횟수(maxCollisions)가 많을수록 압도적으로 높은 점수를 부여합니다.
 * - 완충 횟수가 같다면 완충 밀도(maxCollisions / minMoves)와 이동 깊이를 반영합니다.
 * @param {{ minMoves: number, maxCollisions: number }} candidate
 * @returns {number}
 */
export function scoreCandidatePuzzle(candidate) {
  if (!candidate || !candidate.minMoves) return -1;
  const { minMoves, maxCollisions } = candidate;
  const hasCollisionBonus = maxCollisions > 0 ? 500 : 0;
  const collisionScore = maxCollisions * 150;
  const densityScore = (maxCollisions / Math.max(1, minMoves)) * 60;
  const depthBonus = Math.min(minMoves, 12) * 2;
  return hasCollisionBonus + collisionScore + densityScore + depthBonus;
}

/**
 * 단일 보드(grid, robots)에 존재하는 17개 타깃 전부를
 * 로봇 색상별 단 4회의 BFS 패스로 일괄 스캔하여 17개의 후보 문제 데이터를 반환합니다.
 *
 * @param {object} board createBoardData 반환 객체 ({ grid, targets, ... })
 * @param {object} robots 4대 로봇 초기 위치
 * @param {object} [options]
 * @param {number} [options.maxDepth=11] 최대 탐색 깊이
 * @param {number} [options.maxStatesPerColor=35000] 색상당 최대 탐색 상태 수
 * @returns {Array<{
 *   board: object,
 *   initialRobots: object,
 *   activeTarget: object,
 *   minMoves: number,
 *   maxCollisions: number,
 *   difficulty: { id: string, label: string },
 *   score: number
 * }>}
 */
export function evaluateBoardCandidates(board, robots, options = {}) {
  const { maxDepth = 11, maxStatesPerColor = 35000 } = options;
  const wallTable = buildWallSlideTable(board.grid);
  const { targets } = board;

  // 각 타깃(0~16)의 최적 결과 저장
  const resultsByTargetIdx = targets.map(() => ({
    solved: false,
    minMoves: null,
    maxCollisions: 0,
  }));

  for (const goalColor of PLAYABLE_ROBOTS) {
    const goalStart = robots[goalColor];
    if (!goalStart) continue;

    // 현재 색상 로봇이 들어갈 수 있는 타깃(해당 색상 4개 + multi 1개) 필터링
    const targetMap = new Map(); // cellIdx -> targetIdx
    for (let tIdx = 0; tIdx < targets.length; tIdx++) {
      const t = targets[tIdx];
      if (t.color === goalColor || t.color === ROBOT_COLORS.MULTI) {
        targetMap.set((t.row << 4) | t.col, tIdx);
      }
    }

    let remainingCount = targetMap.size;
    const solvedAtThisColor = new Map(); // tIdx -> { minMoves, maxCollisions }

    const startTargetPos = (goalStart.row << 4) | goalStart.col;
    const helperIndices = [];
    for (const c of PLAYABLE_ROBOTS) {
      if (c === goalColor) continue;
      helperIndices.push((robots[c].row << 4) | robots[c].col);
    }

    const sortedHelpers = packSortedHelpers(
      helperIndices[0],
      helperIndices[1],
      helperIndices[2]
    );
    const startKey = encodeStateKey(startTargetPos, 0, sortedHelpers);

    const visited = new Map();
    visited.set(startKey, 0);
    let currentLevel = [startKey];
    let exploredStates = 1;

    function tryEnqueue(nextLevel, nextKey, depth, nextCollisions) {
      const existing = visited.get(nextKey);
      if (existing === undefined) {
        visited.set(nextKey, (depth << 8) | nextCollisions);
        nextLevel.push(nextKey);
        exploredStates += 1;
      } else {
        const existingDepth = existing >> 8;
        const existingCols = existing & 255;
        if (existingDepth === depth && nextCollisions > existingCols) {
          visited.set(nextKey, (depth << 8) | nextCollisions);
        }
      }
    }

    for (let depth = 1; depth <= maxDepth; depth++) {
      const nextLevel = [];

      for (let i = 0; i < currentLevel.length; i++) {
        const stateKey = currentLevel[i];
        const baseCollisions = visited.get(stateKey) & 255;

        const high10 = Math.floor(stateKey / 16777216);
        const low24 = stateKey % 16777216;

        const targetPos = high10 >> 2;
        const axisState = high10 & 3;
        const h1 = (low24 >> 16) & 255;
        const h2 = (low24 >> 8) & 255;
        const h3 = low24 & 255;

        // 1. 목표 로봇 이동
        for (let dir = 0; dir < 4; dir++) {
          const res = slideFastWithCollision(wallTable, targetPos, dir, h1, h2, h3);
          const nextTargetPos = res >> 1;
          if (nextTargetPos === targetPos) continue;

          const nextCollisions = baseCollisions + (res & 1);
          const moveAxisBit = (dir & 1) === 0 ? 2 : 1;
          const nextAxisState = axisState | moveAxisBit;

          if (nextAxisState === 3 && targetMap.has(nextTargetPos)) {
            const tIdx = targetMap.get(nextTargetPos);
            const prev = solvedAtThisColor.get(tIdx);
            if (!prev) {
              solvedAtThisColor.set(tIdx, {
                minMoves: depth,
                maxCollisions: nextCollisions,
              });
              remainingCount -= 1;
            } else if (
              prev.minMoves === depth &&
              nextCollisions > prev.maxCollisions
            ) {
              prev.maxCollisions = nextCollisions;
            }
          }

          const nextKey = encodeStateKey(nextTargetPos, nextAxisState, low24);
          tryEnqueue(nextLevel, nextKey, depth, nextCollisions);
          if (exploredStates >= maxStatesPerColor) break;
        }

        if (exploredStates >= maxStatesPerColor) break;

        // 2. 보조 로봇 1~3 이동
        const helpers = [h1, h2, h3];
        for (let hIdx = 0; hIdx < 3; hIdx++) {
          const curH = helpers[hIdx];
          const oA = helpers[(hIdx + 1) % 3];
          const oB = helpers[(hIdx + 2) % 3];

          for (let dir = 0; dir < 4; dir++) {
            const res = slideFastWithCollision(wallTable, curH, dir, targetPos, oA, oB);
            const nextH = res >> 1;
            if (nextH === curH) continue;
            const nextCollisions = baseCollisions + (res & 1);
            const nextHelpers = packSortedHelpers(nextH, oA, oB);
            const nextKey = encodeStateKey(targetPos, axisState, nextHelpers);
            tryEnqueue(nextLevel, nextKey, depth, nextCollisions);
            if (exploredStates >= maxStatesPerColor) break;
          }
          if (exploredStates >= maxStatesPerColor) break;
        }

        if (exploredStates >= maxStatesPerColor) break;
      }

      if (
        remainingCount <= 0 ||
        nextLevel.length === 0 ||
        exploredStates >= maxStatesPerColor
      ) {
        break;
      }
      currentLevel = nextLevel;
    }

    // 이번 색상 결과를 전체 타깃 결과에 병합 (multi 타깃은 4색 중 최단 이동 & 최다 완충 선택)
    for (const [tIdx, info] of solvedAtThisColor.entries()) {
      const cur = resultsByTargetIdx[tIdx];
      if (
        !cur.solved ||
        info.minMoves < cur.minMoves ||
        (info.minMoves === cur.minMoves && info.maxCollisions > cur.maxCollisions)
      ) {
        resultsByTargetIdx[tIdx] = {
          solved: true,
          minMoves: info.minMoves,
          maxCollisions: info.maxCollisions,
        };
      }
    }
  }

  return targets.map((target, idx) => {
    const res = resultsByTargetIdx[idx];
    const minMoves = res.solved ? res.minMoves : 10; // 탐색 상한 초과 시 최소 10회 이상(HELL)
    const maxCollisions = res.solved ? res.maxCollisions : 1;
    const difficulty = classifyDifficulty(minMoves);
    const candidate = {
      board,
      initialRobots: robots,
      activeTarget: target,
      minMoves,
      maxCollisions,
      difficulty,
      score: 0,
    };
    candidate.score = scoreCandidatePuzzle(candidate);
    return candidate;
  });
}
