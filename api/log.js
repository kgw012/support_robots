/**
 * @file api/log.js
 * @description Vercel 실시간 런타임 로그 수집용 서버리스 엔드포인트
 * 
 * 클라이언트에서 발생한 런타임 에러, 비정상 예외, 핵심 텔레메트리를 수신하여
 * Vercel Dashboard > Project > Logs 스트림에 실시간으로 출력합니다.
 */

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 프리플라이트 요청 처리
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    let payload = req.body;

    // sendBeacon이나 text/plain으로 전송된 경우 파싱
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (_) {
        payload = { raw: payload };
      }
    }

    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const {
      level = 'info',
      message = 'No message provided',
      stack,
      context = {},
      device = {},
      timestamp = new Date().toISOString(),
    } = payload;

    const logEntry = {
      level: String(level).toUpperCase(),
      message,
      context,
      device: {
        userAgent: req.headers['user-agent'] || device.userAgent || 'unknown',
        screen: device.screen || 'unknown',
        url: device.url || req.headers['referer'] || 'unknown',
      },
      stack: stack ? String(stack).slice(0, 1500) : undefined,
      clientTimestamp: timestamp,
      serverTimestamp: new Date().toISOString(),
    };

    // Vercel 런타임 로그 스트림에 레벨별 출력
    switch (level.toLowerCase()) {
      case 'error':
        console.error('[CLIENT_ERROR]', JSON.stringify(logEntry, null, 2));
        break;
      case 'warn':
        console.warn('[CLIENT_WARN]', JSON.stringify(logEntry, null, 2));
        break;
      default:
        console.log('[CLIENT_INFO]', JSON.stringify(logEntry, null, 2));
        break;
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[LOGGER_HANDLER_ERROR]', err);
    return res.status(500).json({ error: 'Failed to process log' });
  }
}

