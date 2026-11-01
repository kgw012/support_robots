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

  /**
   * 화면에 활성화된(보이는) 모달 또는 풀스크린 오버레이가 있는지 확인합니다.
   */
  function isAnyModalActive() {
    const activeOverlay = document.querySelector(
      '.howto-modal:not([hidden]), .clear-overlay:not([hidden]), .puzzle-loading-overlay:not([hidden])'
    );
    return activeOverlay !== null;
  }

  /**
   * 이벤트 타깃이 모달, 대화상자, 상하단 HUD/푸터 또는 버튼 등 상호작용 UI 내부인지 확인합니다.
   * 단, 게임 보드판 내의 로봇 버튼(.robot-piece)은 드래그/선택 대상이므로 차단하지 않습니다.
   */
  function isInteractiveOrModalTarget(target) {
    if (!target || typeof target.closest !== 'function') return false;
    // 게임 보드 내의 로봇 버튼(.robot-piece)은 드래그 및 선택의 대상이므로 차단 대상에서 제외
    if (target.closest('.robot-piece')) return false;

    return Boolean(
      target.closest(
        '.howto-modal, .clear-overlay, .puzzle-loading-overlay, .hud-header, .game-footer, button, a, input, select, textarea'
      )
    );
  }

  // 1. 모바일 터치 이벤트 (touchstart / touchmove / touchend / touchcancel)
  // 보드판 내부뿐만 아니라, 보드 좌우의 바깥 패딩면에서 시작된 드래그도 완벽히 수용하여
  // 브라우저 뒤로가기 제스처를 원천 차단하고 선택된 로봇을 정상 이동시킵니다.
  window.addEventListener(
    'touchstart',
    (e) => {
      if (!e.touches || e.touches.length === 0) return;
      if (!boardEl || boardEl.offsetParent === null) return; // 인게임 화면이 아닐 때는 무시

      // 화면에 활성화된 모달/오버레이가 있거나 모달/UI 영역을 터치한 경우 보드 스와이프 인터셉트 원천 차단
      if (isAnyModalActive() || isInteractiveOrModalTarget(e.target)) {
        startX = null;
        startY = null;
        return;
      }

      const touch = e.touches[0];
      const rect = boardEl.getBoundingClientRect();

      // 터치 Y좌표가 보드의 상하 높이 범위(상하 12px 여백 포함) 안에 있다면
      // 보드 안쪽이든, 보드 좌우 패딩면이든 무조건 스와이프 조작 시작점으로 캡처
      if (touch.clientY >= rect.top - 12 && touch.clientY <= rect.bottom + 12) {
        startX = touch.clientX;
        startY = touch.clientY;

        // 로봇 위에서 터치를 시작했다면 해당 로봇을 즉시 선택 상태로 전환
        const touchedRobotColor = extractRobotColorFromTarget(e.target);
        if (touchedRobotColor && typeof onSelectRobot === 'function') {
          onSelectRobot(touchedRobotColor);
        }
      }
    },
    { passive: false }
  );

  // 보드 높이 영역(보드 + 패딩면)에서 시작된 드래그 중에는 브라우저 뒤로가기 및 스크롤을 즉시 차단
  const handleTouchMove = (e) => {
    // 모달이 열려 있다면 스와이프 상태를 해제하고 브라우저 기본 스크롤을 방해하지 않음
    if (isAnyModalActive()) {
      startX = null;
      startY = null;
      return;
    }
    if (startX !== null && e.cancelable) {
      e.preventDefault();
    }
  };

  boardEl.addEventListener('touchmove', handleTouchMove, { passive: false });
  window.addEventListener('touchmove', handleTouchMove, { passive: false });

  // 손가락을 뗐을 때 스와이프 방향 계산 및 로봇 이동 실행
  window.addEventListener(
    'touchend',
    (e) => {
      if (isAnyModalActive()) {
        startX = null;
        startY = null;
        return;
      }
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

  // 터치 취소(알림 수신, 전화 수신, 제스처 이탈 등) 발생 시 상태 즉시 리셋
  window.addEventListener('touchcancel', () => {
    startX = null;
    startY = null;
  });

  // 2. 데스크톱 마우스 드래그 지원 (mousedown / mouseup)
  boardEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // 마우스 좌클릭만 허용
    if (isAnyModalActive() || isInteractiveOrModalTarget(e.target)) return;

    // 브라우저 기본 드래그(텍스트 선택, 이미지 고스트) 방지
    if (e.cancelable) {
      e.preventDefault();
    }

    startX = e.clientX;
    startY = e.clientY;

    const clickedRobotColor = extractRobotColorFromTarget(e.target);
    if (clickedRobotColor && typeof onSelectRobot === 'function') {
      onSelectRobot(clickedRobotColor);
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (isAnyModalActive()) {
      startX = null;
      startY = null;
      return;
    }
    if (startX === null || startY === null) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    startX = null;
    startY = null;

    const direction = resolveSwipeDirection(dx, dy);
    if (direction && typeof onMoveDirection === 'function') {
      if (e.cancelable) {
        e.preventDefault();
      }
      onMoveDirection(direction);
    }
  });

  // 3. 데스크톱 키보드 조작 지원
  const ROBOT_CYCLE = ['red', 'green', 'blue', 'yellow'];

  /**
   * 키보드 모드(로봇 위에 1, 2, 3, 4 번호 배지 표시) 활성화/비활성화
   */
  function setKeyboardMode(active) {
    if (!boardEl) return;
    boardEl.classList.toggle('show-robot-numbers', Boolean(active));
  }

  // 마우스 클릭 또는 화면 터치/스와이프 시 키보드 모드 즉시 해제 (기본값인 숫자 숨김 복귀)
  window.addEventListener('mousedown', () => setKeyboardMode(false), { passive: true });
  window.addEventListener('touchstart', () => setKeyboardMode(false), { passive: true });

  window.addEventListener('keydown', (e) => {
    // 인풋/텍스트에 포커스되어 타이핑 중일 때는 단축키 무시
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) {
      return;
    }

    // 모달이 열려 있거나 인게임 보드가 활성화 상태가 아니면 단축키 무시
    if (isAnyModalActive() || !boardEl || boardEl.offsetParent === null) {
      return;
    }

    // 게임 조작 키 입력 감지 시 키보드 모드 활성화 (로봇 번호 표시)
    const isGameKey =
      ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Tab', 'KeyZ', 'KeyR', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code) ||
      ['1', '2', '3', '4', 'Tab', 'z', 'Z', 'ㅋ', 'r', 'R', 'ㄱ', 'w', 'W', 'ㅈ', 'a', 'A', 'ㅁ', 's', 'S', 'ㄴ', 'd', 'D', 'ㅇ'].includes(e.key);

    if (isGameKey) {
      setKeyboardMode(true);
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
    if (e.code === 'Tab' || e.key === 'Tab') {
      e.preventDefault();
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      const current = typeof getSelectedRobot === 'function' ? getSelectedRobot() : null;
      let curIdx = ROBOT_CYCLE.indexOf(current);
      if (curIdx === -1) {
        curIdx = e.shiftKey ? 0 : ROBOT_CYCLE.length - 1;
      }
      const step = e.shiftKey ? -1 : 1;
      const nextIdx = (curIdx + step + ROBOT_CYCLE.length) % ROBOT_CYCLE.length;
      if (typeof onSelectRobot === 'function') {
        onSelectRobot(ROBOT_CYCLE[nextIdx]);
      }
      return;
    }

    // 3) 되돌리기(Undo): Z 키 또는 Ctrl+Z / Cmd+Z (한글 'ㅋ' 키 포함)
    if (e.code === 'KeyZ' || e.key === 'z' || e.key === 'Z' || e.key === 'ㅋ') {
      e.preventDefault();
      if (typeof onUndo === 'function') onUndo();
      return;
    }

    // 4) 처음부터 다시하기(Reset): R 키 (한글 'ㄱ' 키 포함, 브라우저 새로고침 제외)
    if (e.code === 'KeyR' || e.key === 'r' || e.key === 'R' || e.key === 'ㄱ') {
      // Ctrl+R / Cmd+R (브라우저 새로고침)은 방해하지 않음
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (typeof onReset === 'function') onReset();
        return;
      }
    }

    // 5) 방향키 및 WASD 이동 (한글 자판 ㅈ, ㅁ, ㄴ, ㅇ 호환)
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

    let direction = keyMap[e.code];
    if (!direction && e.key) {
      const charKeyMap = {
        w: DIRECTIONS.UP,
        W: DIRECTIONS.UP,
        ㅈ: DIRECTIONS.UP,
        d: DIRECTIONS.RIGHT,
        D: DIRECTIONS.RIGHT,
        ㅇ: DIRECTIONS.RIGHT,
        s: DIRECTIONS.DOWN,
        S: DIRECTIONS.DOWN,
        ㄴ: DIRECTIONS.DOWN,
        a: DIRECTIONS.LEFT,
        A: DIRECTIONS.LEFT,
        ㅁ: DIRECTIONS.LEFT,
      };
      direction = charKeyMap[e.key];
    }

    if (direction && typeof onMoveDirection === 'function') {
      e.preventDefault();
      onMoveDirection(direction);
    }
  });
}
