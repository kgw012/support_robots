/**
 * @file tutorial.js
 * @description 인터랙티브 4단계 구조 훈련 튜토리얼 모듈
 *
 * 1단계: 기본 이동 & 벽 충돌 멈추기 (로봇 슬라이딩 물리 및 벽 충돌 기초)
 * 2단계: 동료 로봇으로 완충(스토퍼) 세우기 (서포트 로봇 길목 배치 및 완충 충돌 전략)
 * 3단계: 완충 보너스 비교 체험 (외벽 충돌 vs 로봇 완충 점수/순위 차이 체감)
 * 4단계: 직진 진입 불가 (방향 전환 필수 특이케이스 룰 체험 및 우회 진입)
 */

import { ROBOT_COLORS } from './boardPresets.js';

export const TUTORIAL_STEPS = Object.freeze([
  {
    stepIndex: 1,
    title: '기본 이동 & 벽 충돌',
    badge: '1단계 / 4단계',
    instruction: '로봇은 벽에 부딪힐 때까지 멈추지 않고 미끄러집니다. 벽을 이용해 방향을 꺾어 탈출구로 들어가세요.',
    hint: '💡 손가락 제스처 안내를 따라 로봇을 드래그해보세요.',
    initialRobots: {
      [ROBOT_COLORS.RED]: { row: 3, col: 3 },
      [ROBOT_COLORS.BLUE]: { row: 15, col: 15 },
      [ROBOT_COLORS.GREEN]: { row: 15, col: 0 },
      [ROBOT_COLORS.YELLOW]: { row: 0, col: 15 },
    },
    targetIndex: 3, // red star at (row: 5, col: 2)
    minMoves: 2,
    maxCollisions: 0,
    clearTitle: '🎉 1단계 성공!',
    clearMessage: '벽에 부딪혀 방향을 꺾어 들어가는 기본 이동을 완벽히 마쳤습니다.',
  },
  {
    stepIndex: 2,
    title: '동료 로봇으로 완충(스토퍼) 세우기',
    badge: '2단계 / 4단계',
    instruction: '탈출구 앞에 벽이 없습니다! 동료 파란 로봇을 먼저 보내 길목을 막고(완충), 빨간 로봇을 부딪히게 하여 진입하세요.',
    hint: '💡 파란 로봇을 먼저 내려 길목을 막은 뒤, 빨간 로봇을 부딪혀보세요.',
    initialRobots: {
      [ROBOT_COLORS.RED]: { row: 2, col: 4 },
      [ROBOT_COLORS.BLUE]: { row: 0, col: 1 },
      [ROBOT_COLORS.GREEN]: { row: 15, col: 0 },
      [ROBOT_COLORS.YELLOW]: { row: 0, col: 15 },
    },
    targetIndex: 3, // red star at (row: 5, col: 2)
    minMoves: 3,
    maxCollisions: 1,
    clearTitle: '🎉 2단계 성공!',
    clearMessage: '동료 로봇으로 길목을 막아 충격을 흡수하는 완충(스토퍼) 이동을 성공했습니다.',
  },
  {
    stepIndex: 3,
    title: '완충 보너스 비교 (외벽 vs 로봇)',
    badge: '3단계 / 4단계',
    instruction: '먼저 노란 로봇을 아래(↓)로 밀어 외벽에 부딪힌 뒤, 왼쪽(←) 탈출구로 들어가보세요.',
    hint: '💡 손가락 제스처 안내를 따라 아래(↓) 외벽으로 먼저 밀어보세요.',
    initialRobots: {
      [ROBOT_COLORS.YELLOW]: { row: 3, col: 13 },
      [ROBOT_COLORS.BLUE]: { row: 3, col: 5 },
      [ROBOT_COLORS.RED]: { row: 15, col: 15 },
      [ROBOT_COLORS.GREEN]: { row: 0, col: 0 },
    },
    targetIndex: 12, // yellow hexagon at (row: 14, col: 6)
    minMoves: 2,
    maxCollisions: 1,
    clearTitle: '🎉 3단계 성공!',
    clearMessage: '동일한 이동 횟수라도 로봇 완충을 활용할수록 지반 충격을 흡수해 더 높은 순위를 기록합니다.',
  },
  {
    stepIndex: 4,
    title: '직진 진입 불가 (방향 전환 필수)',
    badge: '4단계 / 4단계',
    instruction: '탈출구가 바로 눈앞에 있습니다. 빨간 로봇을 오른쪽(→)으로 밀어 탈출구로 들어가보세요!',
    hint: '💡 손가락 제스처 안내를 따라 로봇을 오른쪽으로 밀어보세요.',
    initialRobots: {
      [ROBOT_COLORS.RED]: { row: 5, col: 0 },
      [ROBOT_COLORS.BLUE]: { row: 0, col: 3 },
      [ROBOT_COLORS.GREEN]: { row: 15, col: 0 },
      [ROBOT_COLORS.YELLOW]: { row: 0, col: 15 },
    },
    targetIndex: 3, // red star at (row: 5, col: 2)
    minMoves: 3,
    maxCollisions: 1,
    clearTitle: '🏆 튜토리얼 완료!',
    clearMessage: '서포트 로봇 기본 조작과 완충 제어 기술을 모두 마스터했습니다.',
  },
]);

let currentTutorialStepIndex = 1;
let step3PhaseState = 'try_wall'; // 'try_wall' | 'try_buffer'
let step4PhaseState = 'try_straight'; // 'try_straight' | 'undo_required' | 'detour'

export function getStep3Phase() {
  return step3PhaseState;
}

export function setStep3Phase(phase) {
  step3PhaseState = phase;
}

export function getStep4Phase() {
  return step4PhaseState;
}

export function setStep4Phase(phase) {
  step4PhaseState = phase;
}

export function getTutorialStep(stepNumber) {
  const step = TUTORIAL_STEPS.find((s) => s.stepIndex === stepNumber) || TUTORIAL_STEPS[0];

  if (step.stepIndex === 3) {
    if (step3PhaseState === 'try_buffer') {
      return {
        ...step,
        instruction: '외벽 충돌은 완충 0회! 이번엔 왼쪽(←) 파란 로봇에 부딪혀 충격을 흡수(완충 1회)하며 들어가보세요!',
        hint: '💡 파란 로봇에 완충(왼쪽←)한 뒤 아래(↓)로 꺾어 골인하세요!',
      };
    }
    return {
      ...step,
      instruction: '먼저 노란 로봇을 아래(↓)로 밀어 외벽에 부딪힌 뒤, 왼쪽(←) 탈출구로 들어가보세요.',
      hint: '💡 손가락 제스처 안내를 따라 아래(↓) 외벽으로 먼저 밀어보세요.',
    };
  }

  if (step.stepIndex === 4) {
    if (step4PhaseState === 'undo_required') {
      return {
        ...step,
        instruction: '직진으로 바로 들어가는 것은 탈출 실패! 하단의 [되돌리기]를 눌러 출발 위치로 돌아가세요.',
        hint: '↩️ 하단의 [되돌리기] 버튼을 눌러 출발 위치로 돌아가세요.',
      };
    }
    if (step4PhaseState === 'detour') {
      return {
        ...step,
        instruction: '최소 1회 꺾여야 인정됩니다! 이제 위(↑)로 올려서 파란 로봇을 활용해 우회해보세요.',
        hint: '💡 위로 올린 뒤 → 오른쪽 파란 로봇에 부딪히고 → 아래로 꺾어서 골인하세요!',
      };
    }
  }

  return step;
}

export function getCurrentTutorialStep() {
  return getTutorialStep(currentTutorialStepIndex);
}

export function setTutorialStep(stepNumber) {
  currentTutorialStepIndex = Math.max(
    1,
    Math.min(stepNumber, TUTORIAL_STEPS.length)
  );
  if (currentTutorialStepIndex === 3) {
    step3PhaseState = 'try_wall';
  }
  if (currentTutorialStepIndex === 4) {
    step4PhaseState = 'try_straight';
  }
  return getCurrentTutorialStep();
}

export function advanceTutorialStep() {
  if (currentTutorialStepIndex < TUTORIAL_STEPS.length) {
    currentTutorialStepIndex += 1;
    if (currentTutorialStepIndex === 3) {
      step3PhaseState = 'try_wall';
    }
    if (currentTutorialStepIndex === 4) {
      step4PhaseState = 'try_straight';
    }
    return { hasNext: true, step: getCurrentTutorialStep() };
  }
  return { hasNext: false, step: getCurrentTutorialStep() };
}

export function isTutorialFinalStep() {
  return currentTutorialStepIndex === TUTORIAL_STEPS.length;
}

export function resetTutorialProgress() {
  currentTutorialStepIndex = 1;
  step3PhaseState = 'try_wall';
  step4PhaseState = 'try_straight';
  return getCurrentTutorialStep();
}

/**
 * 현재 튜토리얼 단계와 보드 상의 로봇 위치를 기반으로
 * 유저에게 시각적으로 가이드할 손가락 제스처 모션(위치 및 스와이프 방향)을 계산합니다.
 *
 * @param {number} stepIndex 현재 단계 번호 (1, 2, 3, 4)
 * @param {object} robots 현재 로봇 좌표 객체 { red, blue, green, yellow }
 * @param {string} [step4Phase] 4단계 세부 진행 상태 ('try_straight' | 'undo_required' | 'detour')
 * @returns {{ active: boolean, robotColor?: string, row?: number, col?: number, directionClass?: string }}
 */
export function getTutorialGestureGuide(stepIndex, robots, step4Phase = step4PhaseState) {
  if (!robots) return { active: false };

  const red = robots[ROBOT_COLORS.RED];
  const blue = robots[ROBOT_COLORS.BLUE];
  const yellow = robots[ROBOT_COLORS.YELLOW];

  // 1단계: 기본 이동 (좌 -> 하)
  if (stepIndex === 1 && red) {
    if (red.row === 3 && red.col === 3) {
      return { active: true, robotColor: ROBOT_COLORS.RED, row: 3, col: 3, directionClass: 'swipe-left' };
    }
    if (red.row === 3 && red.col === 2) {
      return { active: true, robotColor: ROBOT_COLORS.RED, row: 3, col: 2, directionClass: 'swipe-down' };
    }
    return { active: false };
  }

  // 2단계: 동료 로봇 스토퍼 (파랑 하 -> 빨강 좌 -> 빨강 하)
  if (stepIndex === 2 && red && blue) {
    if (blue.row === 0 && blue.col === 1) {
      return { active: true, robotColor: ROBOT_COLORS.BLUE, row: 0, col: 1, directionClass: 'swipe-down' };
    }
    if (blue.row === 2 && blue.col === 1 && red.row === 2 && red.col === 4) {
      return { active: true, robotColor: ROBOT_COLORS.RED, row: 2, col: 4, directionClass: 'swipe-left' };
    }
    if (red.row === 2 && red.col === 2) {
      return { active: true, robotColor: ROBOT_COLORS.RED, row: 2, col: 2, directionClass: 'swipe-down' };
    }
    return { active: false };
  }

  // 3단계: 완충 보너스 비교 (외벽 먼저 체험 -> 이후 파란 로봇 완충 체험)
  if (stepIndex === 3 && yellow) {
    if (step3PhaseState === 'try_wall') {
      // 1) 외벽 충돌 먼저 유도: 아래(↓) 외벽 충돌
      if (yellow.row === 3 && yellow.col === 13) {
        return { active: true, robotColor: ROBOT_COLORS.YELLOW, row: 3, col: 13, directionClass: 'swipe-down' };
      }
      // 외벽 충돌 후 (14, 13): 왼쪽 탈출구 진입 가이드
      if (yellow.row === 14 && yellow.col === 13) {
        return { active: true, robotColor: ROBOT_COLORS.YELLOW, row: 14, col: 13, directionClass: 'swipe-left' };
      }
      return { active: false };
    }

    if (step3PhaseState === 'try_buffer') {
      // 2) 로봇 완충 유도: 왼쪽(←) 파란 로봇 충돌
      if (yellow.row === 3 && yellow.col === 13) {
        return { active: true, robotColor: ROBOT_COLORS.YELLOW, row: 3, col: 13, directionClass: 'swipe-left' };
      }
      // 로봇 완충 충돌 후 (3, 6): 아래쪽 탈출구 진입 가이드
      if (yellow.row === 3 && yellow.col === 6) {
        return { active: true, robotColor: ROBOT_COLORS.YELLOW, row: 3, col: 6, directionClass: 'swipe-down' };
      }
      return { active: false };
    }

    return { active: false };
  }

  // 4단계: 직진 불가 체험 및 우회
  if (stepIndex === 4 && red) {
    if (step4Phase === 'try_straight') {
      // 1) 처음에는 탈출구로 바로 오른쪽으로 쏘게 안내!
      if (red.row === 5 && red.col === 0) {
        return { active: true, robotColor: ROBOT_COLORS.RED, row: 5, col: 0, directionClass: 'swipe-right' };
      }
      return { active: false };
    }

    if (step4Phase === 'undo_required') {
      // 되돌리기를 누를 때까지 손가락 숨김
      return { active: false };
    }

    // 2) 되돌리기를 누른 후 우회 루트 안내 (상 -> 우 -> 하)
    if (red.row === 5 && red.col === 0) {
      return { active: true, robotColor: ROBOT_COLORS.RED, row: 5, col: 0, directionClass: 'swipe-up' };
    }
    if (red.row === 0 && red.col === 0) {
      return { active: true, robotColor: ROBOT_COLORS.RED, row: 0, col: 0, directionClass: 'swipe-right' };
    }
    if (red.row === 0 && red.col === 2) {
      return { active: true, robotColor: ROBOT_COLORS.RED, row: 0, col: 2, directionClass: 'swipe-down' };
    }
    return { active: false };
  }

  return { active: false };
}

/**
 * 현재 튜토리얼 단계에서 허용되는 정확한 로봇 색상과 방향을 반환합니다.
 * 허용되지 않는 동작(다른 로봇 또는 다른 방향 조작)을 원천 차단하기 위해 사용됩니다.
 *
 * @param {number} stepIndex
 * @param {object} robots
 * @param {string} [step3Phase]
 * @param {string} [step4Phase]
 * @returns {{ robotColor: string, direction: string } | null}
 */
export function getTutorialExpectedMove(
  stepIndex,
  robots,
  step3Phase = step3PhaseState,
  step4Phase = step4PhaseState
) {
  const guide = getTutorialGestureGuide(stepIndex, robots, step4Phase);
  if (!guide || !guide.active || !guide.robotColor || !guide.directionClass) {
    return null;
  }

  const directionMap = {
    'swipe-up': 'UP',
    'swipe-right': 'RIGHT',
    'swipe-down': 'DOWN',
    'swipe-left': 'LEFT',
  };

  const direction = directionMap[guide.directionClass];
  if (!direction) return null;

  return {
    robotColor: guide.robotColor,
    direction,
  };
}
