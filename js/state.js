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
  evaluateBoardCandidates,
  scoreCandidatePuzzle,
} from './solver.js';

export const PLAYABLE_ROBOTS = Object.freeze([
  ROBOT_COLORS.RED,
  ROBOT_COLORS.GREEN,
  ROBOT_COLORS.BLUE,
  ROBOT_COLORS.YELLOW,
]);

/**
 * 난이도별 엄선된 후보 맵 바구니 (완충 점수 내림차순 정렬 유지)
 */
const curatedBaskets = {
  easy: [],
  normal: [],
  hard: [],
  hell: [],
};

let backgroundRefillTimer = null;
let scannedBoardsInCycle = 0;
let nextBoardId = 1;
const dailyPuzzleCache = {};

/**
 * 한국 표준시(KST, UTC+9) 기준 오늘의 날짜 시드('YYYYMMDD')와 표시용 문자열('YYYY.MM.DD')을 반환합니다.
 */
export function getTodayKSTDateSeed() {
  const now = new Date();
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kstDate = new Date(kstMs);
  const yyyy = String(kstDate.getUTCFullYear());
  const mm = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kstDate.getUTCDate()).padStart(2, '0');
  return {
    seed: `${yyyy}${mm}${dd}`,
    formatted: `${yyyy}.${mm}.${dd}`,
    shortFormatted: `${mm}.${dd}`,
  };
}

/**
 * 문자열 시드를 기반으로 모든 브라우저/기기에서 100% 동일한 난수열을 생성하는 결정론적 PRNG (xmur3 + mulberry32)
 * @param {string} seedStr
 * @returns {function(): number}
 */
export function createSeededRandom(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  let state = (h ^= h >>> 16) >>> 0;

  return function seededRandom() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 날짜 시드('20261031')와 난이도('easy'|'normal'|'hard'|'hell')로
 * 전 세계 모든 유저에게 동일한 최고 완충 점수 일일 챌린지 맵을 생성합니다.
 * 후보군 선정 후 단일 타깃 정밀 솔버(solveBoardBFS)로 팩트체크하여 난이도 100% 일치를 보장합니다.
 */
export function generateDailyChallengePuzzle(dateSeed, difficulty) {
  const cacheKey = `${dateSeed}::${difficulty}`;
  if (dailyPuzzleCache[cacheKey]) {
    return dailyPuzzleCache[cacheKey];
  }

  const rng = createSeededRandom(cacheKey);
  const matchingPool = [];
  const allPool = [];

  // 결정론적 시드로 보드들을 스캔하여 정밀 검증된 해당 난이도 후보들을 수집 (최대 20판)
  for (let i = 0; i < 20; i++) {
    const board = createBoardData({ randomFn: rng });
    const robots = generateRandomRobots(board.targets, rng);
    const candidates = evaluateBoardCandidates(board, robots);

    for (const cand of candidates) {
      let verifiedCand = cand;
      // 난이도가 일치하거나, 미해결(solved=false) 또는 8회 이상인 후보는 심층 솔버로 팩트체크
      if (!cand.solved || cand.minMoves >= 8 || cand.difficulty.id === difficulty) {
        const precise = solveBoardBFS(board.grid, robots, cand.activeTarget);
        if (precise.solved) {
          verifiedCand = {
            ...cand,
            minMoves: precise.minMoves,
            maxCollisions: precise.maxCollisions,
            difficulty: precise.difficulty,
            score: scoreCandidatePuzzle({ minMoves: precise.minMoves, maxCollisions: precise.maxCollisions }),
          };
        }
      }

      allPool.push(verifiedCand);
      if (verifiedCand.difficulty.id === difficulty) {
        matchingPool.push(verifiedCand);
      }
    }

    if (matchingPool.length >= 2) {
      break;
    }
  }

  const targetPool = matchingPool.length > 0 ? matchingPool : allPool;
  // 완충 점수 내림차순 정렬 (동점일 경우 시드 순서 유지)
  targetPool.sort((a, b) => b.score - a.score);

  const bestPuzzle = targetPool[0];
  dailyPuzzleCache[cacheKey] = bestPuzzle;
  return bestPuzzle;
}

/**
 * 보드 1판(17개 타깃)을 일괄 스캔하되, 동일한 보드/로봇 배치가 연속 출제되지 않도록
 * 각 난이도별로 가장 점수가 높은 대표 타깃 1개씩만 바구니에 추가합니다.
 * @param {function(): number} [randomFn]
 */
export function scanBoardIntoBaskets(randomFn = Math.random) {
  const boardId = nextBoardId++;
  const board = createBoardData({ randomFn });
  const robots = generateRandomRobots(board.targets, randomFn);
  const candidates = evaluateBoardCandidates(board, robots);

  // 후보 중 미해결(solved=false)이거나 8회 이상인 후보는 정밀 솔버로 팩트체크하여 실제 난이도로 보정
  for (const cand of candidates) {
    if (!cand.solved || cand.minMoves >= 8) {
      const precise = solveBoardBFS(board.grid, robots, cand.activeTarget);
      if (precise.solved) {
        cand.minMoves = precise.minMoves;
        cand.maxCollisions = precise.maxCollisions;
        cand.difficulty = precise.difficulty;
        cand.solved = true;
        cand.score = scoreCandidatePuzzle(cand);
      }
    }
  }

  // 한 보드 내에서는 난이도별로 최고 점수 후보 단 1개만 선별 (동일 맵/로봇 배치 중복 방지)
  const bestPerDifficulty = {};
  for (const cand of candidates) {
    const diffId = cand.difficulty.id;
    if (
      !bestPerDifficulty[diffId] ||
      cand.score > bestPerDifficulty[diffId].score
    ) {
      bestPerDifficulty[diffId] = { ...cand, boardId };
    }
  }

  for (const [diffId, bestCand] of Object.entries(bestPerDifficulty)) {
    if (curatedBaskets[diffId]) {
      curatedBaskets[diffId].push(bestCand);
    }
  }

  // 각 바구니를 완충 점수 내림차순으로 정렬하고 상위 12개까지만 유지
  for (const key of Object.keys(curatedBaskets)) {
    curatedBaskets[key].sort((a, b) => b.score - a.score);
    if (curatedBaskets[key].length > 12) {
      curatedBaskets[key].length = 12;
    }
  }
}

/**
 * 플레이 중 또는 '다음 문제' 1초 쿨타임 동안 백그라운드에서 프레임 단위로 분할하여
 * 보드들을 스캔해 바구니를 채워둡니다 (화면 프리징 0ms).
 */
export function scheduleBackgroundRefill(boardsToScan = 2) {
  if (typeof window === 'undefined') return;
  if (backgroundRefillTimer !== null) return;
  scannedBoardsInCycle = 0;

  const step = () => {
    scanBoardIntoBaskets();
    scannedBoardsInCycle += 1;
    if (scannedBoardsInCycle < boardsToScan) {
      backgroundRefillTimer = setTimeout(step, 35);
    } else {
      backgroundRefillTimer = null;
    }
  };

  backgroundRefillTimer = setTimeout(step, 35);
}

/**
 * 현재 게임 라운드의 전체 상태 객체
 */
export const gameState = {
  gameMode: 'infinite',   // 'infinite' | 'daily'
  dateSeed: null,         // 일일 챌린지 날짜 시드 (예: '20261031')
  board: null,            // { quadrantOrder, grid, targets, closedCells }
  robots: {},             // { red: { row, col }, green: { row, col }, blue: { row, col }, yellow: { row, col } }
  initialRobots: {},      // 라운드 시작 시점의 로봇 초기 좌표 (Position Markers & Reset용)
  selectedRobot: ROBOT_COLORS.RED, // 현재 조작 선택된 로봇 색상
  activeTarget: null,     // 현재 라운드의 목표 타깃 { row, col, color, symbol, walls, quadrantId }
  minMoves: null,         // 7단계 BFS 솔버가 계산한 수학적 최단 이동 횟수
  maxCollisions: 0,       // 최단 이동 횟수 내에서 달성 가능한 최대 로봇 간 완충 충돌 횟수
  difficulty: null,       // 7단계 난이도 분류 { id: 'easy'|'normal'|'hard'|'hell', label: ... }
  selectedDifficultyMode: 'normal', // 무한 모드에서 현재 고정 선택된 난이도 ('easy'|'normal'|'hard'|'hell')
  dailyDifficultyMode: 'normal',    // 일일 챌린지에서 현재 선택된 난이도 ('easy'|'normal'|'hard'|'hell')
  currentBoardId: null,   // 직전 라운드와 동일한 보드/로봇 배치가 연속 출제되는 것을 방지하기 위한 식별자
  infiniteRewardClaimed: false, // 현재 무한 모드 문제에서 이미 클리어 점수를 획득했는지 여부
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
    mode = gameState.gameMode || 'infinite',
    dateSeed: customDateSeed,
    quadrantOrder,
    initialRobots,
    activeTarget,
    targetDifficulty,
    minMoves: precomputedMinMoves,
    randomFn = Math.random,
  } = options;

  gameState.gameMode = mode;

  let board;
  let startRobots;
  let chosenTarget;
  let minMoves = precomputedMinMoves ?? null;
  let maxCollisions = 0;
  let difficulty = classifyDifficulty(minMoves);

  const isCustomPreset = Boolean(quadrantOrder || initialRobots || activeTarget);

  if (mode === 'daily' && !isCustomPreset) {
    const todayInfo = getTodayKSTDateSeed();
    // 일일 챌린지는 이전 날짜 및 임의 시드 조작을 원천 차단하고 항상 한국 시간(KST) 오늘 날짜만 적용
    const effectiveSeed = todayInfo.seed;
    const effectiveDiff =
      targetDifficulty || gameState.dailyDifficultyMode || 'normal';

    gameState.dateSeed = effectiveSeed;
    gameState.dailyDifficultyMode = effectiveDiff;

    const dailyPicked = generateDailyChallengePuzzle(effectiveSeed, effectiveDiff);
    board = dailyPicked.board;
    startRobots = cloneRobots(dailyPicked.initialRobots);
    chosenTarget = { ...dailyPicked.activeTarget };
    minMoves = dailyPicked.minMoves;
    maxCollisions = dailyPicked.maxCollisions;
    difficulty = dailyPicked.difficulty;
  } else if (!isCustomPreset) {
    gameState.dateSeed = null;
    const effectiveDifficulty =
      targetDifficulty || gameState.selectedDifficultyMode || 'normal';
    gameState.selectedDifficultyMode = effectiveDifficulty;

    // 바구니가 비어있다면 초기 1판(17개 후보) 즉시 스캔
    const totalAvailable =
      curatedBaskets.easy.length +
      curatedBaskets.normal.length +
      curatedBaskets.hard.length +
      curatedBaskets.hell.length;

    if (totalAvailable === 0) {
      scanBoardIntoBaskets(randomFn);
    }

    // 선택된 난이도 바구니에 직전 라운드와 다른 보드(boardId) 후보가 있는지 확인하고 없으면 최대 10판 스캔
    const hasDifferentBoard = (diffKey) =>
      curatedBaskets[diffKey] &&
      curatedBaskets[diffKey].some((c) => c.boardId !== gameState.currentBoardId);

    if (!hasDifferentBoard(effectiveDifficulty)) {
      for (let i = 0; i < 10; i++) {
        scanBoardIntoBaskets(randomFn);
        if (hasDifferentBoard(effectiveDifficulty)) break;
      }
    }

    let picked = null;
    const basket = curatedBaskets[effectiveDifficulty];
    if (basket && basket.length > 0) {
      let pickIdx = basket.findIndex((c) => c.boardId !== gameState.currentBoardId);
      if (pickIdx === -1) pickIdx = 0;
      picked = basket.splice(pickIdx, 1)[0];
    }

    // 만약 바구니 10판 스캔 후에도 요구 난이도를 찾지 못한 경우, 직접 타깃을 탐색하여 출제
    if (!picked) {
      let attempts = 0;
      while (!picked && attempts < 15) {
        attempts++;
        const fallbackBoard = createBoardData({ randomFn });
        const fallbackRobots = generateRandomRobots(fallbackBoard.targets, randomFn);
        for (const t of fallbackBoard.targets) {
          const fallbackSolved = solveBoardBFS(fallbackBoard.grid, fallbackRobots, t);
          if (fallbackSolved.solved && fallbackSolved.difficulty.id === effectiveDifficulty) {
            picked = {
              boardId: nextBoardId++,
              board: fallbackBoard,
              initialRobots: fallbackRobots,
              activeTarget: t,
              minMoves: fallbackSolved.minMoves,
              maxCollisions: fallbackSolved.maxCollisions,
              difficulty: fallbackSolved.difficulty,
            };
            break;
          }
        }
      }

      // 최후의 경우 (극단적 탐색 실패 시) 비어있지 않은 인접 난이도 바구니 활용
      if (!picked) {
        const fallbackOrder = ['hell', 'hard', 'normal', 'easy'];
        const nonEmptyKey = fallbackOrder.find(
          (k) => curatedBaskets[k] && curatedBaskets[k].length > 0
        );
        if (nonEmptyKey) {
          picked = curatedBaskets[nonEmptyKey].shift();
        } else {
          const fb = createBoardData({ randomFn });
          const fr = generateRandomRobots(fb.targets, randomFn);
          const ft = fb.targets[0];
          const fs = solveBoardBFS(fb.grid, fr, ft);
          picked = {
            boardId: nextBoardId++,
            board: fb,
            initialRobots: fr,
            activeTarget: ft,
            minMoves: fs.minMoves,
            maxCollisions: fs.maxCollisions,
            difficulty: fs.difficulty,
          };
        }
      }
    }

    gameState.currentBoardId = picked.boardId ?? null;
    board = picked.board;
    startRobots = cloneRobots(picked.initialRobots);
    chosenTarget = { ...picked.activeTarget };
    minMoves = picked.minMoves;
    maxCollisions = picked.maxCollisions;
    difficulty = picked.difficulty;

    // 다음 문제들을 위해 백그라운드에서 3판 분할 스캔 예약
    scheduleBackgroundRefill(3);
  } else {
    board = createBoardData({ quadrantOrder, randomFn });
    startRobots = initialRobots
      ? cloneRobots(initialRobots)
      : generateRandomRobots(board.targets, randomFn);
    chosenTarget =
      activeTarget ||
      board.targets[Math.floor(randomFn() * board.targets.length)];

    if (minMoves === null) {
      let solverResult = solveBoardBFS(board.grid, startRobots, chosenTarget);
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
  }

  gameState.board = board;
  gameState.initialRobots = cloneRobots(startRobots);
  gameState.robots = cloneRobots(startRobots);
  gameState.activeTarget = { ...chosenTarget };
  gameState.minMoves = minMoves;
  gameState.maxCollisions = maxCollisions;
  gameState.difficulty = difficulty;
  gameState.infiniteRewardClaimed = false;
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

