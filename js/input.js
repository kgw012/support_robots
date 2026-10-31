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
 * 보드 컨테이너에 터치 스와이프, 마우스 드래그, 키보드 조작 이벤트를 등록합니다.
 *
 * 키보드 조작:
 * - 숫자키 1(빨강), 2(초록), 3(파랑), 4(노랑) 또는 Tab(순환): 로봇 선택
 * - 방향키(↑, ↓, ←, →) 및 W, A, S, D: 선택된 로봇 미끄러짐 이동
 * - Z 키 또는 Ctrl+Z: 마지막 이동 되돌리기(Undo)
 * - R 키: 현재 라운드 처음부터 다시하기(Reset)
 *
 * @param {HTMLElement} boardEl 스와이프를 감지할 보드 래퍼 엘리먼트 (.board-wrapper)
 * @param {object} callbacks
 * @param {function(string): void} callbacks.onSelectRobot 로봇 선택 콜백 (color)
 * @param {function(string): void} callbacks.onMoveDirection 방향 이동 콜백 (direction)
 * @param {function(): void} [callbacks.onUndo] 되돌리기 콜백
 * @param {function(): void} [callbacks.onReset] 처음부터 다시하기 콜백
 * @param {function(): string} [callbacks.getSelectedRobot] 현재 선택된 로봇 색상 반환 함수
 */
export function bindInputEvents(
  boardEl,
  { onSelectRobot, onMoveDirection, onUndo, onReset, getSelectedRobot }
) {
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

  // 1. 모바일 터치 이벤트 (touchstart / touchmove / touchend)
  // iOS Safari 및 카카오톡 WKWebView는 touchmove 시점이 아니라 touchstart 시점에
  // 화면 가장자리(edge) 터치를 e.preventDefault()하지 않으면 네이티브 뒤로가기가 먼저 가로챕니다.
  window.addEventListener(
    'touchstart',
    (e) => {
      if (!e.touches || e.touches.length === 0) return;
      const touchX = e.touches[0].clientX;
      const edgeThreshold = 35; // 화면 양쪽 가장자리 35px 이내 터치 감지

      // 가장자리에서 시작된 터치이거나 보드판 영역 내부 터치라면 네이티브 제스처 즉시 차단
      if (touchX < edgeThreshold || touchX > window.innerWidth - edgeThreshold || e.target.closest('.board-wrapper')) {
        if (e.cancelable) {
          e.preventDefault();
        }
      }
    },
    { passive: false }
  );

  window.addEventListener(
    'touchmove',
    (e) => {
      if (!e.touches || e.touches.length === 0) return;
      if (startX === null || startY === null) return;

      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - startX);
      const dy = Math.abs(touch.clientY - startY);

      // 가로 이동이 감지되면 브라우저/카카오톡 엣지 스와이프 뒤로가기 제스처를 즉시 무력화
      if (dx > dy && dx > 4 && e.cancelable) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

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
    { passive: false }
  );

  boardEl.addEventListener(
    'touchmove',
    (e) => {
      // 보드판 위에서의 모든 터치 이동 시 브라우저 기본 동작 차단
      if (startX !== null && e.cancelable) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  window.addEventListener(
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
        if (e.cancelable) {
          e.preventDefault();
        }
        onMoveDirection(direction);
      }
    },
    { passive: false }
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

  // 3. 데스크톱 키보드 조작 지원
  const ROBOT_CYCLE = ['red', 'green', 'blue', 'yellow'];

  window.addEventListener('keydown', (e) => {
    // 인풋/텍스트에 포커스되어 타이핑 중일 때는 단축키 무시
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) {
      return;
    }

    // 1) 로봇 선택: 숫자키 1, 2, 3, 4
    if (e.code === 'Digit1' || e.key === '1') {
      e.preventDefault();
      if (typeof onSelectRobot === 'function') onSelectRobot('red');
      return;
    }
    if (e.code === 'Digit2' || e.key === '2') {
      e.preventDefault();
      if (typeof onSelectRobot === 'function') onSelectRobot('green');
      return;
    }
    if (e.code === 'Digit3' || e.key === '3') {
      e.preventDefault();
      if (typeof onSelectRobot === 'function') onSelectRobot('blue');
      return;
    }
    if (e.code === 'Digit4' || e.key === '4') {
      e.preventDefault();
      if (typeof onSelectRobot === 'function') onSelectRobot('yellow');
      return;
    }

    // 2) 로봇 순환 선택: Tab (Shift+Tab은 역순)
    if (e.code === 'Tab') {
      e.preventDefault();
      const current = typeof getSelectedRobot === 'function' ? getSelectedRobot() : 'red';
      const curIdx = ROBOT_CYCLE.indexOf(current);
      const step = e.shiftKey ? -1 : 1;
      const nextIdx = (curIdx + step + ROBOT_CYCLE.length) % ROBOT_CYCLE.length;
      if (typeof onSelectRobot === 'function') {
        onSelectRobot(ROBOT_CYCLE[nextIdx]);
      }
      return;
    }

    // 3) 되돌리기(Undo): Z 키 또는 Ctrl+Z / Cmd+Z
    if (e.code === 'KeyZ' || e.key === 'z' || e.key === 'Z') {
      e.preventDefault();
      if (typeof onUndo === 'function') onUndo();
      return;
    }

    // 4) 처음부터 다시하기(Reset): R 키
    if (e.code === 'KeyR' || e.key === 'r' || e.key === 'R') {
      // Ctrl+R(브라우저 새로고침)은 방해하지 않음
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (typeof onReset === 'function') onReset();
        return;
      }
    }

    // 5) 방향키 및 WASD 이동
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
