/**
 * @file state.js
 * @description 게임 상태 관리 모듈 (순수 객체 리터럴 및 배열 기반)
 *
 * 원작 룰북 규칙:
 * - 4대의 로봇(빨강, 초록, 파랑, 노랑)은 중앙 폐쇄 구역(4칸)과 타깃 심볼이 있는 칸(17칸)을 제외한
 *   빈 칸에 배치되며, 각 로봇의 초기 위치에는 색상 위치 마커(Position Marker)가 놓입니다.
 */

import {
  createBoardData,
  ROBOT_COLORS,
  CENTER_CLOSED_CELLS,
} from './boardPresets.js';
import {
  solveBoardBFS,
  classifyDifficulty,
  compareRecords,
} from './solver.js';

export const PLAYABLE_ROBOTS = Object.freeze([
  ROBOT_COLORS.RED,
  ROBOT_COLORS.GREEN,
  ROBOT_COLORS.BLUE,
  ROBOT_COLORS.YELLOW,
]);

/**
 * 현재 게임 라운드의 전체 상태 객체
 */
export const gameState = {
  board: null,            // { quadrantOrder, grid, targets, closedCells }
  robots: {},             // { red: { row, col }, green: { row, col }, blue: { row, col }, yellow: { row, col } }
  initialRobots: {},      // 라운드 시작 시점의 로봇 초기 좌표 (Position Markers & Reset용)
  selectedRobot: ROBOT_COLORS.RED, // 현재 조작 선택된 로봇 색상
  activeTarget: null,     // 현재 라운드의 목표 타깃 { row, col, color, symbol, walls, quadrantId }
  minMoves: null,         // 7단계 BFS 솔버가 계산한 수학적 최단 이동 횟수
  maxCollisions: 0,       // 최단 이동 횟수 내에서 달성 가능한 최대 로봇 간 완충 충돌 횟수
  difficulty: null,       // 7단계 난이도 분류 { id: 'easy'|'hard'|'hell', label: 'EASY'|'HARD'|'HELL' }
  bestRecord: null,       // 6단계 타이 브레이커 기준 현재 라운드 유저 최고 기록 { moveCount, collisionCount }
  moveCount: 0,           // 누적 이동 횟수
  collisionCount: 0,      // 누적 로봇 간 충돌(완충) 횟수
  hasRicocheted: false,   // 목표 로봇이 최소 1회 이상 방향 전환(90도 꺾임)했는지 여부
  isCleared: false,       // 현재 라운드 클리어 여부
  undoStack: [],          // 5단계 Undo용 스택
};

/**
 * 특정 좌표가 중앙 폐쇄 구역인지 확인합니다.
 */
export function isCenterClosedCell(row, col) {
  return CENTER_CLOSED_CELLS.some((cell) => cell.row === row && cell.col === col);
}

/**
 * 타깃 칸 및 중앙 폐쇄 구역을 피해 4대의 로봇 초기 좌표를 무작위로 생성합니다.
 * @param {Array<{row: number, col: number}>} targets 보드 내 17개 타깃 배열
 * @param {function(): number} [randomFn] 난수 생성 함수
 */
export function generateRandomRobots(targets, randomFn = Math.random) {
  const occupied = new Set();

  // 중앙 4칸 제외
  for (const cell of CENTER_CLOSED_CELLS) {
    occupied.add(`${cell.row},${cell.col}`);
  }

  // 17개 타깃 칸 제외 (룰북: "Put the 4 robots on any 4 gameboard spaces not marked with a target symbol")
  for (const t of targets) {
    occupied.add(`${t.row},${t.col}`);
  }

  const robots = {};
  for (const color of PLAYABLE_ROBOTS) {
    let row;
    let col;
    do {
      row = Math.floor(randomFn() * 16);
      col = Math.floor(randomFn() * 16);
    } while (occupied.has(`${row},${col}`));

    occupied.add(`${row},${col}`);
    robots[color] = { row, col };
  }

  return robots;
}

/**
 * 로봇 좌표 객체를 깊은 복사합니다.
 */
export function cloneRobots(robots) {
  const copy = {};
  for (const color of PLAYABLE_ROBOTS) {
    if (robots[color]) {
      copy[color] = { row: robots[color].row, col: robots[color].col };
    }
  }
  return copy;
}

/**
 * 새로운 보드와 라운드 상태를 초기화합니다.
 * @param {object} [options]
 * @param {string[]} [options.quadrantOrder] 4개 사분면 배치 순서 (생략 시 랜덤)
 * @param {object} [options.initialRobots] 지정된 로봇 초기 위치 (생략 시 랜덤 배치)
 * @param {object} [options.activeTarget] 지정된 목표 타깃 (생략 시 랜덤 타깃 1개 선택)
 * @param {function(): number} [options.randomFn] 난수 함수
 */
export function initGameState(options = {}) {
  const {
    quadrantOrder,
    initialRobots,
    activeTarget,
    minMoves: precomputedMinMoves,
    randomFn = Math.random,
  } = options;

  const board = createBoardData({ quadrantOrder, randomFn });
  let startRobots = initialRobots
    ? cloneRobots(initialRobots)
    : generateRandomRobots(board.targets, randomFn);

  const chosenTarget =
    activeTarget ||
    board.targets[Math.floor(randomFn() * board.targets.length)];

  // BFS 솔버로 최단 해결 횟수, 최대 완충 횟수 및 난이도 자동 계산
  let minMoves = precomputedMinMoves ?? null;
  let maxCollisions = 0;
  let difficulty = classifyDifficulty(minMoves);

  if (minMoves === null) {
    let solverResult = solveBoardBFS(board.grid, startRobots, chosenTarget);
    // 만약 무작위 배치에서 해가 없는 특수 케이스라면 로봇 위치를 재배치하여 보장
    let retries = 0;
    while (!solverResult.solved && !initialRobots && retries < 5) {
      startRobots = generateRandomRobots(board.targets, randomFn);
      solverResult = solveBoardBFS(board.grid, startRobots, chosenTarget);
      retries += 1;
    }
    minMoves = solverResult.minMoves;
    maxCollisions = solverResult.maxCollisions;
    difficulty = solverResult.difficulty;
  }

  gameState.board = board;
  gameState.initialRobots = cloneRobots(startRobots);
  gameState.robots = cloneRobots(startRobots);
  gameState.activeTarget = { ...chosenTarget };
  gameState.minMoves = minMoves;
  gameState.maxCollisions = maxCollisions;
  gameState.difficulty = difficulty;
  gameState.bestRecord = null;
  gameState.selectedRobot =
    chosenTarget.color === ROBOT_COLORS.MULTI
      ? ROBOT_COLORS.RED
      : chosenTarget.color;
  gameState.moveCount = 0;
  gameState.collisionCount = 0;
  gameState.hasRicocheted = false;
  gameState.isCleared = false;
  gameState.undoStack = [];

  return gameState;
}

/**
 * 6단계 커스텀 승리 우선권 타이 브레이커(최소 이동 -> 최다 로봇 완충 충돌)에 따라
 * 현재 라운드의 최고 기록(bestRecord)을 갱신합니다.
 * @param {number} moveCount
 * @param {number} collisionCount
 * @returns {{ isNewBest: boolean, bestRecord: { moveCount: number, collisionCount: number } }}
 */
export function updateBestRecord(moveCount, collisionCount) {
  const candidate = { moveCount, collisionCount };
  if (!gameState.bestRecord || compareRecords(candidate, gameState.bestRecord) < 0) {
    gameState.bestRecord = candidate;
    return { isNewBest: true, bestRecord: candidate };
  }
  return { isNewBest: false, bestRecord: gameState.bestRecord };
}

/**
 * 로봇 이동 직전에 현재 상태를 Undo 스택에 기록합니다.
 * 저장 정보(5단계 규격 + 이동 방향): [움직인 로봇 색상, 출발 전 좌표, 이동 전 누적 이동 횟수, 이동 전 로봇 간 충돌 횟수, 이동 방향]
 * @param {string} robotColor 움직인 로봇 색상
 * @param {string} [direction] 이동 방향 ('UP' | 'RIGHT' | 'DOWN' | 'LEFT')
 */
export function recordMoveForUndo(robotColor, direction = null) {
  const prevPos = gameState.robots[robotColor];
  if (!prevPos) return;

  gameState.undoStack.push([
    robotColor,
    { row: prevPos.row, col: prevPos.col },
    gameState.moveCount,
    gameState.collisionCount,
    direction,
  ]);
}

/**
 * 마지막 이동을 취소(Undo)하고 이전 상태로 복원합니다.
 * @returns {boolean} 복원 성공 여부
 */
export function undoLastMove() {
  if (gameState.undoStack.length === 0) return false;

  const [robotColor, prevCoord, prevMoveCount, prevCollisionCount] =
    gameState.undoStack.pop();

  gameState.robots[robotColor] = {
    row: prevCoord.row,
    col: prevCoord.col,
  };
  gameState.selectedRobot = robotColor;
  gameState.moveCount = prevMoveCount;
  gameState.collisionCount = prevCollisionCount;
  gameState.isCleared = false;

  return true;
}

/**
 * 현재 라운드의 진행 상황을 모두 지우고 초기 상태로 되돌립니다(Reset).
 * @returns {boolean} 리셋 수행 여부
 */
export function resetCurrentRound() {
  if (gameState.moveCount === 0 && gameState.undoStack.length === 0) {
    return false;
  }

  gameState.robots = cloneRobots(gameState.initialRobots);
  gameState.moveCount = 0;
  gameState.collisionCount = 0;
  gameState.hasRicocheted = false;
  gameState.isCleared = false;
  gameState.undoStack = [];

  if (gameState.activeTarget) {
    gameState.selectedRobot =
      gameState.activeTarget.color === ROBOT_COLORS.MULTI
        ? ROBOT_COLORS.RED
        : gameState.activeTarget.color;
  }

  return true;
}

