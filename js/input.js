/**
 * @file input.js
 * @description 3단계: 모바일 터치 스와이프(touchstart/touchend) 및 마우스/키보드 조작 캡처 모듈
 *
 * - 모바일 환경: touchstart 및 touchend 좌표 차이(dx, dy)를 계산하여 상·하·좌·우 스와이프 감지
 * - 로봇 위에서 바로 드래그/스와이프를 시작하면 해당 로봇을 즉시 선택함과 동시에 미끄러짐 이동을 수행합니다.
 * - 데스크톱 테스트 편의성을 위해 마우스 드래그 및 방향키(화살표/WASD) 입력도 함께 지원합니다.
 */

import { DIRECTIONS } from './physics.js';

const SWIPE_THRESHOLD_PX = 24; // 탭(클릭)과 스와이프를 구분하는 최소 이동 픽셀

/**
 * 스와이프 시작점과 종료점의 변위(dx, dy)로 이동 방향을 판별합니다.
 * @param {number} dx 종료 X - 시작 X
 * @param {number} dy 종료 Y - 시작 Y
 * @returns {string|null} 'UP' | 'RIGHT' | 'DOWN' | 'LEFT' 또는 임계값 미달 시 null
 */
export function resolveSwipeDirection(dx, dy) {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (Math.max(absX, absY) < SWIPE_THRESHOLD_PX) {
    return null;
  }

  if (absX > absY) {
    return dx > 0 ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT;
  }
  return dy > 0 ? DIRECTIONS.DOWN : DIRECTIONS.UP;
}

/**
 * 보드 컨테이너에 터치 스와이프, 마우스 드래그, 키보드 방향키 이벤트를 등록합니다.
 *
 * @param {HTMLElement} boardEl 스와이프를 감지할 보드 래퍼 엘리먼트 (.board-wrapper)
 * @param {object} callbacks
 * @param {function(string): void} callbacks.onSelectRobot 로봇 선택 콜백 (color)
 * @param {function(string): void} callbacks.onMoveDirection 방향 이동 콜백 (direction)
 */
export function bindInputEvents(boardEl, { onSelectRobot, onMoveDirection }) {
  if (!boardEl) return;

  let startX = null;
  let startY = null;

  /**
   * 이벤트 타깃이 특정 로봇 말(.robot-piece) 내부인지 확인하여 색상을 반환합니다.
   */
  function extractRobotColorFromTarget(target) {
    if (!target || typeof target.closest !== 'function') return null;
    const robotEl = target.closest('.robot-piece');
    return robotEl ? robotEl.dataset.color : null;
  }

  // 1. 모바일 터치 이벤트 (touchstart / touchend)
  boardEl.addEventListener(
    'touchstart',
    (e) => {
      if (!e.touches || e.touches.length === 0) return;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;

      // 로봇 위에서 터치를 시작했다면 해당 로봇을 즉시 선택 상태로 전환
      const touchedRobotColor = extractRobotColorFromTarget(e.target);
      if (touchedRobotColor && typeof onSelectRobot === 'function') {
        onSelectRobot(touchedRobotColor);
      }
    },
    { passive: true }
  );

  boardEl.addEventListener(
    'touchend',
    (e) => {
      if (startX === null || startY === null) return;
      if (!e.changedTouches || e.changedTouches.length === 0) return;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      startX = null;
      startY = null;

      const direction = resolveSwipeDirection(dx, dy);
      if (direction && typeof onMoveDirection === 'function') {
        onMoveDirection(direction);
      }
    },
    { passive: true }
  );

  // 2. 데스크톱 마우스 드래그 지원 (mousedown / mouseup)
  boardEl.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startY = e.clientY;

    const clickedRobotColor = extractRobotColorFromTarget(e.target);
    if (clickedRobotColor && typeof onSelectRobot === 'function') {
      onSelectRobot(clickedRobotColor);
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (startX === null || startY === null) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    startX = null;
    startY = null;

    const direction = resolveSwipeDirection(dx, dy);
    if (direction && typeof onMoveDirection === 'function') {
      onMoveDirection(direction);
    }
  });

  // 3. 키보드 방향키 / WASD 지원 (데스크톱 테스트용)
  window.addEventListener('keydown', (e) => {
    const keyMap = {
      ArrowUp: DIRECTIONS.UP,
      KeyW: DIRECTIONS.UP,
      ArrowRight: DIRECTIONS.RIGHT,
      KeyD: DIRECTIONS.RIGHT,
      ArrowDown: DIRECTIONS.DOWN,
      KeyS: DIRECTIONS.DOWN,
      ArrowLeft: DIRECTIONS.LEFT,
      KeyA: DIRECTIONS.LEFT,
    };

    const direction = keyMap[e.code];
    if (direction && typeof onMoveDirection === 'function') {
      e.preventDefault();
      onMoveDirection(direction);
    }
  });
}
