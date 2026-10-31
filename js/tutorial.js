/**
 * @file tutorial.js
 * @description 인터랙티브 3단계 구조 훈련 튜토리얼 모듈
 *
 * 1단계: 기본 이동 & 벽 충돌 멈추기 (로봇 슬라이딩 물리 및 벽 충돌 기초)
 * 2단계: 동료 로봇으로 완충(스토퍼) 세우기 (서포트 로봇 길목 배치 및 완충 충돌 전략)
 * 3단계: 직진 진입 불가 (방향 전환 필수 특이케이스 룰 체험 및 우회 진입)
 */

import { ROBOT_COLORS } from './boardPresets.js';

export const TUTORIAL_STEPS = Object.freeze([
  {
    stepIndex: 1,
    title: '기본 이동 & 벽 충돌',
    badge: '1단계 / 3단계',
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
    badge: '2단계 / 3단계',
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
    title: '직진 진입 불가 (방향 전환 필수)',
    badge: '3단계 / 3단계',
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
let step3PhaseState = 'try_straight'; // 'try_straight' | 'undo_required' | 'detour'

export function getStep3Phase() {
  return step3PhaseState;
}

export function setStep3Phase(phase) {
  step3PhaseState = phase;
}

export function getTutorialStep(stepNumber) {
  const step = TUTORIAL_STEPS.find((s) => s.stepIndex === stepNumber) || TUTORIAL_STEPS[0];
  if (step.stepIndex === 3) {
    if (step3PhaseState === 'undo_required') {
      return {
        ...step,
        instruction: '직진으로 바로 들어가는 것은 탈출 실패! 하단의 [되돌리기]를 눌러 출발 위치로 돌아가세요.',
        hint: '↩️ 하단의 [되돌리기] 버튼을 눌러 출발 위치로 돌아가세요.',
      };
    }
    if (step3PhaseState === 'detour') {
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
    step3PhaseState = 'try_straight';
  }
  return getCurrentTutorialStep();
}

export function advanceTutorialStep() {
  if (currentTutorialStepIndex < TUTORIAL_STEPS.length) {
    currentTutorialStepIndex += 1;
    if (currentTutorialStepIndex === 3) {
      step3PhaseState = 'try_straight';
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
  step3PhaseState = 'try_straight';
  return getCurrentTutorialStep();
}

/**
 * 현재 튜토리얼 단계와 보드 상의 로봇 위치를 기반으로
 * 유저에게 시각적으로 가이드할 손가락 제스처 모션(위치 및 스와이프 방향)을 계산합니다.
 *
 * @param {number} stepIndex 현재 단계 번호 (1, 2, 3)
 * @param {object} robots 현재 로봇 좌표 객체 { red, blue, green, yellow }
 * @param {string} [step3Phase] 3단계 세부 진행 상태 ('try_straight' | 'undo_required' | 'detour')
 * @returns {{ active: boolean, robotColor?: string, row?: number, col?: number, directionClass?: string }}
 */
export function getTutorialGestureGuide(stepIndex, robots, step3Phase = step3PhaseState) {
  if (!robots) return { active: false };

  const red = robots[ROBOT_COLORS.RED];
  const blue = robots[ROBOT_COLORS.BLUE];

  if (!red || !blue) return { active: false };

  // 1단계: 기본 이동 (좌 -> 하)
  if (stepIndex === 1) {
    if (red.row === 3 && red.col === 3) {
      return { active: true, robotColor: ROBOT_COLORS.RED, row: 3, col: 3, directionClass: 'swipe-left' };
    }
    if (red.row === 3 && red.col === 2) {
      return { active: true, robotColor: ROBOT_COLORS.RED, row: 3, col: 2, directionClass: 'swipe-down' };
    }
    return { active: false };
  }

  // 2단계: 동료 로봇 스토퍼 (파랑 하 -> 빨강 좌 -> 빨강 하)
  if (stepIndex === 2) {
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

  // 3단계: 직진 불가 체험 및 우회
  if (stepIndex === 3) {
    if (step3Phase === 'try_straight') {
      // 1) 처음에는 탈출구로 바로 오른쪽으로 쏘게 안내!
      if (red.row === 5 && red.col === 0) {
        return { active: true, robotColor: ROBOT_COLORS.RED, row: 5, col: 0, directionClass: 'swipe-right' };
      }
      return { active: false };
    }

    if (step3Phase === 'undo_required') {
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
