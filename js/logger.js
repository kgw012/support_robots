/**
 * @file logger.js
 * @description 무의존성(Zero-dependency) 공용 로깅 및 텔레메트리 모듈
 *
 * 1. Vercel Web Analytics 커스텀 이벤트 로깅 (사용자 플레이 분석/통계)
 * 2. Vercel 실시간 런타임 로그 전송 (/api/log 서버리스 엔드포인트)
 * 3. 글로벌 런타임 에러(window.onerror, unhandledrejection) 자동 수집
 */

// 동일 에러 중복 전송 방지용 캐시 (에러 키 -> 마지막 전송 시각)
const recentErrorTimestamps = new Map();
const DEDUPE_INTERVAL_MS = 5000;

/**
 * 현재 환경이 로컬 개발 환경인지 판별합니다.
 */
function isDevEnvironment() {
  if (typeof window === 'undefined' || !window.location) return false;
  const { hostname } = window.location;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
}

/**
 * 객체를 Vercel Web Analytics용 단일 레벨(flat) 객체로 정제합니다.
 */
function sanitizeAnalyticsData(data) {
  if (!data || typeof data !== 'object') return {};
  const clean = {};
  for (const [key, val] of Object.entries(data)) {
    if (val === null || val === undefined) {
      clean[key] = null;
    } else if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'string') {
      clean[key] = val;
    } else {
      clean[key] = String(val);
    }
  }
  return clean;
}

/**
 * Vercel 실시간 런타임 로그 수집 엔드포인트(/api/log)로 데이터를 전송합니다.
 */
function sendRemoteLog(level, message, error = null, context = {}) {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  const errorKey = `${level}:${message}:${error?.message || ''}`;
  const lastSent = recentErrorTimestamps.get(errorKey) || 0;

  // 에러/경고의 경우 5초 내 동일 에러는 중복 전송 방지 (무한 루프 에러 폭풍 방어)
  if (level !== 'info') {
    if (now - lastSent < DEDUPE_INTERVAL_MS) {
      return;
    }
    recentErrorTimestamps.set(errorKey, now);
  }

  // 오래된 캐시 정리
  if (recentErrorTimestamps.size > 50) {
    for (const [k, time] of recentErrorTimestamps.entries()) {
      if (now - time > DEDUPE_INTERVAL_MS * 2) {
        recentErrorTimestamps.delete(k);
      }
    }
  }

  const payload = {
    level,
    message: String(message),
    stack: error?.stack || (error instanceof Error ? error.stack : undefined),
    context,
    device: {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      screen:
        typeof window !== 'undefined'
          ? `${window.innerWidth}x${window.innerHeight}`
          : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
    },
    timestamp: new Date().toISOString(),
  };

  const jsonStr = JSON.stringify(payload);

  // 1) 페이지 이탈 시에도 유실되지 않는 navigator.sendBeacon 우선 시도
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const queued = navigator.sendBeacon('/api/log', blob);
      if (queued) return;
    } catch (_) {
      // sendBeacon 실패 시 아래 fetch로 폴백
    }
  }

  // 2) fetch keepalive 폴백
  if (typeof fetch === 'function') {
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: jsonStr,
      keepalive: true,
    }).catch(() => {
      // 로깅 실패는 재귀 방지를 위해 조용히 무시
    });
  }
}

export const logger = {
  /**
   * 로컬 개발 디버그 로그 (프로덕션 콘솔 숨김)
   */
  debug(message, context) {
    if (isDevEnvironment()) {
      console.debug(`[DEBUG] ${message}`, context !== undefined ? context : '');
    }
  },

  /**
   * 일반 정보 로그 (로컬 개발 콘솔 출력 전용)
   */
  info(message, context) {
    if (isDevEnvironment()) {
      console.info(`[INFO] ${message}`, context !== undefined ? context : '');
    }
  },

  /**
   * 경고 로그 (콘솔 출력 및 원격 로깅)
   */
  warn(message, context = {}, sendToRemote = false) {
    console.warn(`[WARN] ${message}`, context);
    if (sendToRemote) {
      sendRemoteLog('warn', message, null, context);
    }
  },

  /**
   * 에러 로그 (콘솔 출력 및 Vercel 실시간 서버 로그 전송)
   */
  error(message, error = null, context = {}) {
    console.error(`[ERROR] ${message}`, error, context);
    sendRemoteLog('error', message, error, context);
  },

  /**
   * Vercel Web Analytics 커스텀 이벤트 로깅
   * @param {string} eventName 이벤트 이름 (32자 이내)
   * @param {Record<string, any>} [data] 이벤트 속성
   */
  track(eventName, data = {}) {
    const cleanData = sanitizeAnalyticsData(data);

    if (isDevEnvironment()) {
      console.log(`📊 [Vercel Analytics Track] ${eventName}`, cleanData);
    }

    if (typeof window !== 'undefined') {
      try {
        if (typeof window.va === 'function') {
          window.va('event', { name: eventName, data: cleanData });
        } else {
          // 스크립트 로드 전인 경우 큐잉
          window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
          window.va('event', { name: eventName, data: cleanData });
        }
      } catch (err) {
        // 통계 전송 실패는 사용자 경험을 방해하지 않음
      }

      // Vercel 무료(Hobby) 플랜에서도 Logs 탭에서 실시간 확인할 수 있도록 /api/log로 동시 전송
      sendRemoteLog('info', eventName, null, cleanData);
    }
  },

  /**
   * 브라우저 글로벌 런타임 에러 자동 감지 핸들러 등록
   */
  initGlobalErrorHandlers() {
    if (typeof window === 'undefined') return;

    window.addEventListener('error', (event) => {
      // 확장 프로그램 또는 외부 스크립트 에러 필터링
      const filename = event.filename || '';
      if (filename.includes('extension') || filename.includes('contentscript')) {
        return;
      }

      logger.error(`Uncaught Exception: ${event.message}`, event.error, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      logger.error(
        `Unhandled Promise Rejection: ${reason?.message || reason}`,
        reason instanceof Error ? reason : null,
        { reason }
      );
    });

    logger.debug('Global error handlers initialized successfully.');
  },
};

