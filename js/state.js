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

export const DIFF_META = Object.freeze({
  easy: { label: 'EASY', range: '1 ~ 4회' },
  normal: { label: 'NORMAL', range: '5 ~ 7회' },
  hard: { label: 'HARD', range: '8 ~ 9회' },
  hell: { label: 'HELL', range: '10회 이상' },
});

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
 * 다음 한국 표준시(KST, UTC+9) 자정(00:00:00)까지 남은 밀리초(ms)를 계산합니다.
 * @returns {number} 남은 밀리초
 */
export function getMsUntilNextKSTMidnight() {
  const now = new Date();
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kstDate = new Date(kstMs);

  // 다음날 00:00:00 KST
  const nextKstMidnightUtc = Date.UTC(
    kstDate.getUTCFullYear(),
    kstDate.getUTCMonth(),
    kstDate.getUTCDate() + 1,
    0, 0, 0, 0
  );

  return Math.max(0, nextKstMidnightUtc - kstMs);
}

/**
 * 주어진 날짜 시드가 오늘 날짜(KST)와 다른지(만료되었는지) 판정합니다.
 * @param {string|number} [dateSeed]
 * @returns {boolean}
 */
export function isDailyDateExpired(dateSeed) {
  if (!dateSeed) return false;
  const today = getTodayKSTDateSeed();
  return String(dateSeed) !== today.seed;
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
export async function generateDailyChallengePuzzle(dateSeed, difficulty) {
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

    // 타임 슬라이싱: 각 보드 검증 완료 후 브라우저 메인 스레드에 0ms 프레임 양보
    // 저사양 모바일 기기에서도 스피너 60fps 회전 유지 및 ANR(페이지 응답 없음) 원천 차단
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  const targetPool = matchingPool.length > 0 ? matchingPool : allPool;
  // 완충 점수 내림차순 정렬 (동점일 경우 시드 순서 유지)
  targetPool.sort((a, b) => b.score - a.score);

  const bestPuzzle = {
    ...targetPool[0],
    dateSeed: String(dateSeed),
  };
  if (bestPuzzle.board) {
    bestPuzzle.board.dateSeed = String(dateSeed);
  }
  dailyPuzzleCache[cacheKey] = bestPuzzle;
  return bestPuzzle;
}

let isDailyWarmupRunning = false;

/**
 * 오늘 일일 챌린지의 해당 난이도 퍼즐이 이미 백그라운드에서 연산 완료되어 캐싱되어 있는지 확인합니다.
 * @param {string} [difficulty]
 * @returns {boolean}
 */
export function isDailyChallengeReady(difficulty = gameState.dailyDifficultyMode || 'normal') {
  if (typeof window === 'undefined') return false;
  const todayInfo = getTodayKSTDateSeed();
  return Boolean(dailyPuzzleCache[`${todayInfo.seed}::${difficulty}`]);
}

/**
 * 무한 모드의 해당 난이도 퍼즐이 바구니에 준비되어 있는지 확인합니다.
 * (직전 보드와 다른 새로운 보드가 최소 1개 이상 존재해야 true)
 * @param {string} [difficulty]
 * @returns {boolean}
 */
export function isInfinitePuzzleReady(difficulty = gameState.selectedDifficultyMode || 'normal') {
  const basket = curatedBaskets[difficulty];
  return Boolean(
    basket &&
    basket.length > 0 &&
    basket.some((c) => c.boardId !== gameState.currentBoardId)
  );
}

/**
 * 특정 난이도의 오늘 일일 챌린지 맵을 백그라운드에서 우선 생성하여 캐싱해둡니다.
 * @param {string} [targetDiff]
 */
export async function warmupDailyChallenge(targetDiff = gameState.dailyDifficultyMode || 'normal') {
  if (typeof window === 'undefined') return;
  const todayInfo = getTodayKSTDateSeed();
  const cacheKey = `${todayInfo.seed}::${targetDiff}`;
  if (dailyPuzzleCache[cacheKey]) return;

  try {
    await generateDailyChallengePuzzle(todayInfo.seed, targetDiff);
  } catch (_) {
    // 백그라운드 워밍업 예외 무시
  }
}

/**
 * 페이지 최초 진입(로비) 시 브라우저 유휴 시간을 활용하여
 * 오늘의 일일 챌린지 4개 난이도를 백그라운드에서 우선순위대로 사전 생성해둡니다.
 * (우선순위: 현재 선택된 난이도 -> HELL -> HARD -> EASY)
 */
export async function warmupAllDailyChallenges() {
  if (typeof window === 'undefined') return;
  if (isDailyWarmupRunning) return;
  isDailyWarmupRunning = true;

  try {
    const todayInfo = getTodayKSTDateSeed();
    const currentDiff = gameState.dailyDifficultyMode || 'normal';
    const diffsToWarm = [currentDiff, 'hell', 'hard', 'easy'].filter(
      (d, idx, arr) => arr.indexOf(d) === idx
    );

    for (const diff of diffsToWarm) {
      const cacheKey = `${todayInfo.seed}::${diff}`;
      if (!dailyPuzzleCache[cacheKey]) {
        await generateDailyChallengePuzzle(todayInfo.seed, diff);
        // 모바일 저발열 및 브라우저 숨 돌리기
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
    }
  } catch (_) {
    // 백그라운드 워밍업 예외 무시
  } finally {
    isDailyWarmupRunning = false;
  }
}

/**
 * 보드 1판(17개 타깃)을 스캔하여, 비어있는 난이도 바구니에 필요한 퍼즐을 1개씩 충전합니다.
 * 모든 난이도(easy, normal, hard, hell)에 이미 다음 문제가 1개씩 준비되어 있다면 연산을 즉시 생략합니다.
 * @param {function(): number} [randomFn]
 */
export async function scanBoardIntoBaskets(randomFn = Math.random) {
  // 이미 모든 난이도에 다음 문제가 1개씩 채워져 있다면 연산할 필요 없이 즉시 종료
  if (
    curatedBaskets.easy.length >= 1 &&
    curatedBaskets.normal.length >= 1 &&
    curatedBaskets.hard.length >= 1 &&
    curatedBaskets.hell.length >= 1
  ) {
    return;
  }

  const boardId = nextBoardId++;
  const board = createBoardData({ randomFn });
  const robots = generateRandomRobots(board.targets, randomFn);
  const candidates = evaluateBoardCandidates(board, robots);

  // hard 또는 hell 바구니가 비어있을 때만 무거운 BFS 검증을 수행하고, 이미 채워져 있다면 건너뜀
  const needsHardOrHell =
    curatedBaskets.hard.length < 1 || curatedBaskets.hell.length < 1;

  for (const cand of candidates) {
    if ((!cand.solved || cand.minMoves >= 8) && needsHardOrHell) {
      // 메인 스레드에 제어권을 양보하여 오디오 렌더링 및 UI 스와이프 버벅임 방지
      await new Promise((resolve) => setTimeout(resolve, 0));
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

  // 비어있는 난이도 바구니에 넣을 최고 점수 후보 1개씩만 선별
  const bestPerDifficulty = {};
  for (const cand of candidates) {
    if (!cand.solved) continue;
    const diffId = cand.difficulty.id;
    // 해당 바구니가 이미 채워져 있다면 추가 선별 불필요
    if (curatedBaskets[diffId] && curatedBaskets[diffId].length >= 1) continue;

    if (
      !bestPerDifficulty[diffId] ||
      cand.score > bestPerDifficulty[diffId].score
    ) {
      bestPerDifficulty[diffId] = { ...cand, boardId };
    }
  }

  for (const [diffId, bestCand] of Object.entries(bestPerDifficulty)) {
    if (curatedBaskets[diffId] && curatedBaskets[diffId].length < 1) {
      curatedBaskets[diffId].push(bestCand);
    }
  }
}

/**
 * 플레이 중 또는 '다음 문제' 1초 쿨타임 동안 백그라운드에서 프레임 단위로 분할하여
 * 비어있는 난이도 바구니에 퍼즐을 1개씩만 보충해둡니다 (화면 프리징 및 오디오 끊김 0%).
 */
export function scheduleBackgroundRefill(boardsToScan = 2) {
  if (typeof window === 'undefined') return;
  if (backgroundRefillTimer !== null) return;

  // 모든 난이도에 이미 다음 문제가 1개씩 준비되어 있다면 스캔 예약 자체를 하지 않음
  const isBasketsSufficient =
    curatedBaskets.easy.length >= 1 &&
    curatedBaskets.normal.length >= 1 &&
    curatedBaskets.hard.length >= 1 &&
    curatedBaskets.hell.length >= 1;
  if (isBasketsSufficient) return;

  scannedBoardsInCycle = 0;

  const scheduleNext = (cb) => {
    if (typeof window.requestIdleCallback === 'function') {
      return window.requestIdleCallback(cb, { timeout: 1000 });
    }
    return setTimeout(cb, 250);
  };

  const step = async () => {
    try {
      await scanBoardIntoBaskets();
    } catch (_) {}
    scannedBoardsInCycle += 1;

    const stillNeedsMore =
      curatedBaskets.easy.length < 1 ||
      curatedBaskets.normal.length < 1 ||
      curatedBaskets.hard.length < 1 ||
      curatedBaskets.hell.length < 1;

    if (stillNeedsMore && scannedBoardsInCycle < boardsToScan) {
      backgroundRefillTimer = scheduleNext(step);
    } else {
      backgroundRefillTimer = null;
    }
  };

  backgroundRefillTimer = scheduleNext(step);
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
  clearedSolution: null,  // 클리어 시점 풀이 경로 스냅샷 { path, initialRobots, finalRobots, ... }
  solutionViewed: false,  // 무한 모드에서 정답보기를 확인했는지 여부 (확인 시 점수 미지급)
  cachedSolution: null,   // 무한 모드 백그라운드 사전 연산 정답 경로 및 이미지 캐시 { boardId, minMoves, path, dataUrl }
};

let _solutionWarmupHook = null;

/**
 * 무한 모드 문제 시작 시 백그라운드 정답 웜업을 수행할 훅 함수를 등록합니다.
 * @param {function} fn
 */
export function registerSolutionWarmupHook(fn) {
  _solutionWarmupHook = typeof fn === 'function' ? fn : null;
}

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
export async function initGameState(options = {}) {
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

    const dailyPicked = await generateDailyChallengePuzzle(effectiveSeed, effectiveDiff);
    board = dailyPicked.board;
    if (board) {
      board.dateSeed = effectiveSeed;
    }
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
      await scanBoardIntoBaskets(randomFn);
    }

    // 선택된 난이도 바구니에 직전 라운드와 다른 보드(boardId) 후보가 있는지 확인하고 없으면 최대 10판 스캔
    const hasDifferentBoard = (diffKey) =>
      curatedBaskets[diffKey] &&
      curatedBaskets[diffKey].some((c) => c.boardId !== gameState.currentBoardId);

    if (!hasDifferentBoard(effectiveDifficulty)) {
      for (let i = 0; i < 10; i++) {
        await scanBoardIntoBaskets(randomFn);
        if (hasDifferentBoard(effectiveDifficulty)) break;
        // 타임 슬라이싱: 보드 1판 스캔 후 메인 스레드에 0ms 양보하여 부드러운 스피너 회전 보장
        await new Promise((resolve) => setTimeout(resolve, 0));
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
        await new Promise((resolve) => setTimeout(resolve, 0));
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

    // 다음 문제들을 위해 백그라운드에서 1판 분할 스캔 예약 (오디오 및 프레임 드랍 방지)
    scheduleBackgroundRefill(1);
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
  gameState.clearedSolution = null;
  gameState.solutionViewed = false;
  gameState.cachedSolution = null;

  if (gameState.gameMode === 'infinite' && _solutionWarmupHook) {
    try {
      _solutionWarmupHook();
    } catch {
      // 웜업 예외 방어
    }
  }

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
 * 저장 정보(5단계 규격 + 이동 방향 + 도착 좌표): [움직인 로봇 색상, 출발 전 좌표, 이동 전 누적 이동 횟수, 이동 전 로봇 간 충돌 횟수, 이동 방향, 도착 좌표]
 * @param {string} robotColor 움직인 로봇 색상
 * @param {string} [direction] 이동 방향 ('UP' | 'RIGHT' | 'DOWN' | 'LEFT')
 * @param {{row: number, col: number}} [endCoord] 이동 완료 후의 정지 좌표
 */
export function recordMoveForUndo(robotColor, direction = null, endCoord = null) {
  const prevPos = gameState.robots[robotColor];
  if (!prevPos) return;

  gameState.undoStack.push([
    robotColor,
    { row: prevPos.row, col: prevPos.col },
    gameState.moveCount,
    gameState.collisionCount,
    direction,
    endCoord ? { row: endCoord.row, col: endCoord.col } : null,
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
  gameState.clearedSolution = null;

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
  gameState.clearedSolution = null;

  if (gameState.activeTarget) {
    gameState.selectedRobot =
      gameState.activeTarget.color === ROBOT_COLORS.MULTI
        ? ROBOT_COLORS.RED
        : gameState.activeTarget.color;
  }

  return true;
}

/**
 * 현재 라운드에서 클리어까지 수행된 이동 경로 리스트를 반환합니다.
 * @returns {Array<{ step: number, robotColor: string, from: { row: number, col: number }, to: { row: number, col: number }, direction: string }>}
 */
export function getSolutionPath() {
  if (!gameState.undoStack || gameState.undoStack.length === 0) {
    return [];
  }

  return gameState.undoStack.map((entry, idx) => {
    const robotColor = entry[0];
    const from = { ...entry[1] };
    let to = entry[5] ? { ...entry[5] } : null;

    if (!to) {
      for (let j = idx + 1; j < gameState.undoStack.length; j++) {
        if (gameState.undoStack[j][0] === robotColor) {
          to = { ...gameState.undoStack[j][1] };
          break;
        }
      }
      if (!to && gameState.robots[robotColor]) {
        to = { ...gameState.robots[robotColor] };
      }
    }

    return {
      step: idx + 1,
      robotColor,
      from,
      to: to || from,
      direction: entry[4],
    };
  });
}

