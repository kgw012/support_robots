/**
 * @file api.js
 * @description Supabase 서버리스 API 연동, 단방향 암호화 인증(SHA-256 + DB bcrypt),
 *              일일 챌린지 기록 자동 제출/리더보드 조회 및 무한 모드 점수 관리 모듈
 */

import { logger } from './logger.js';

export const SUPABASE_URL = 'https://zpvagsiphemiovqycxbr.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_BZQzWYNjUtKvuQrK-Cz49A_gy89IMni';

const AUTH_STORAGE_KEY = 'sr_auth_session_v1';

export const INFINITE_DIFF_POINTS = Object.freeze({
  easy: 10,
  normal: 25,
  hard: 50,
  hell: 100,
});

/**
 * 현재 로그인된 유저 상태
 */
export const authState = {
  isLoggedIn: false,
  user: null, // { id, nickname, total_score, infinite_score }
  passwordHash: null,
};

/**
 * 부적절한 단어 (욕설, 비속어, 성적/혐오/비하 표현) 금칙어 목록
 */
const PROFANITY_WORDS = Object.freeze([
  // 한국어 비속어/욕설/비하
  '시발', '씨발', '쉬발', '슈발', '시벌', '씨벌', '씨팔', '시팔',
  '개새', '개새끼', '개색', '새끼', '새키', '병신', '븅신', '등신',
  '지랄', '엠창', '애미', '애비', '느금', '창녀', '걸레', '보지', '자지',
  '섹스', '야동', '성폭', '강간', '변태', '존나', '졸라', '썅',
  '미친놈', '미친년', '호구', '일베', '메갈', '한남', '한녀',
  // 영어 비속어/비하
  'fuck', 'shit', 'bitch', 'asshole', 'dick', 'pussy', 'bastard',
  'cunt', 'nigger', 'faggot', 'whore', 'slut', 'cock',
]);

/**
 * 닉네임 유효성 및 바이트(한글 2B, 영문 1B, 최대 16B) 검증 및 금칙어 검사
 * @param {string} rawNickname
 * @returns {{ valid: boolean, nickname: string, byteLength: number, message: string }}
 */
export function validateNickname(rawNickname) {
  const nickname = (rawNickname || '').trim();
  if (!nickname) {
    return {
      valid: false,
      nickname,
      byteLength: 0,
      message: '닉네임을 입력해 주세요.',
    };
  }

  // 완성형 한글(가-힣) 및 영문(a-zA-Z)만 허용
  if (!/^[가-힣a-zA-Z]+$/.test(nickname)) {
    return {
      valid: false,
      nickname,
      byteLength: 0,
      message: '닉네임은 공백·숫자·특수문자 없이 한글과 영문으로만 입력해 주세요.',
    };
  }

  // 부적절한 단어 포함 여부 검사 (대소문자 무시)
  const lowerNick = nickname.toLowerCase();
  for (const badWord of PROFANITY_WORDS) {
    if (lowerNick.includes(badWord)) {
      return {
        valid: false,
        nickname,
        byteLength: 0,
        message: '부적절한 단어가 포함된 닉네임은 사용할 수 없습니다.',
      };
    }
  }

  let byteLength = 0;
  for (const ch of nickname) {
    if (/[가-힣]/.test(ch)) {
      byteLength += 2;
    } else {
      byteLength += 1;
    }
  }

  if (byteLength < 2 || byteLength > 16) {
    return {
      valid: false,
      nickname,
      byteLength,
      message: `닉네임은 2~16Byte 이하(한글 최대 8자, 영문 최대 16자)여야 합니다. (현재 ${byteLength}Byte)`,
    };
  }

  return {
    valid: true,
    nickname,
    byteLength,
    message: '사용 가능한 닉네임 형식입니다.',
  };
}

/**
 * 브라우저 단방향 암호화 (SHA-256)
 * 네트워크 전송 전 평문 비밀번호를 복호화 불가능한 해시로 변환하며,
 * DB 내부에서는 이 값을 다시 pgcrypto bcrypt로 2차 단방향 해싱하여 저장합니다.
 * @param {string} rawPassword
 * @returns {Promise<string>}
 */
export async function hashPasswordClient(rawPassword) {
  const salted = `sr_v1_salt::${rawPassword}`;
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const msgBuffer = new TextEncoder().encode(salted);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // 비보안 컨텍스트(로컬 테스트 등) 폴백 해시
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < salted.length; i++) {
    const ch = salted.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/**
 * Supabase REST/RPC 공통 호출 헬퍼
 */
async function supabaseRequest(path, { method = 'GET', body = null } = {}) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    const err = new Error(`DB 요청 실패 (${response.status}): ${errText}`);
    logger.error('Supabase request failed', err, { path, status: response.status });
    throw err;
  }

  return response.json();
}

function saveSessionToStorage(user, passwordHash) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        id: user.id,
        nickname: user.nickname,
        total_score: user.total_score ?? 0,
        infinite_score: user.infinite_score ?? 0,
        passwordHash,
      })
    );
  } catch (_) {
    // 스토리지 제한 환경 무시
  }
}

/**
 * 로컬스토리지에 저장된 로그인 세션을 복원하고 최신 유저 점수를 동기화합니다.
 */
export async function restoreAuthSession() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.id || !parsed.nickname || !parsed.passwordHash) {
      return null;
    }

    authState.isLoggedIn = true;
    authState.user = {
      id: parsed.id,
      nickname: parsed.nickname,
      total_score: parsed.total_score ?? 0,
      infinite_score: parsed.infinite_score ?? 0,
    };
    authState.passwordHash = parsed.passwordHash;

    // DB에서 최신 점수 비동기 조회
    try {
      const rows = await supabaseRequest(
        `/rest/v1/users?id=eq.${encodeURIComponent(parsed.id)}&select=id,nickname,total_score,infinite_score`
      );
      if (Array.isArray(rows) && rows.length > 0) {
        authState.user = rows[0];
        saveSessionToStorage(rows[0], parsed.passwordHash);
      }
    } catch (_) {
      // 일시적 네트워크 에러 시 캐시된 세션 유지
    }

    logger.track('user_auto_login', { userId: authState.user.id });
    logger.info('user_auto_login', { userId: authState.user.id }, true);

    return authState.user;
  } catch (_) {
    return authState.user;
  }
}

/**
 * 로그아웃 및 로컬 세션 삭제
 */
export function logoutUser() {
  authState.isLoggedIn = false;
  authState.user = null;
  authState.passwordHash = null;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (_) {
      // 무시
    }
  }
}

/**
 * 원스톱 가입 및 로그인 실행
 * @param {string} rawNickname
 * @param {string} rawPassword
 */
export async function loginOrRegisterUser(rawNickname, rawPassword) {
  const nickCheck = validateNickname(rawNickname);
  if (!nickCheck.valid) {
    return { ok: false, message: nickCheck.message };
  }

  const trimmedPw = (rawPassword || '').trim();
  if (trimmedPw.length < 4) {
    return { ok: false, message: '비밀번호는 최소 4자리 이상 입력해 주세요.' };
  }

  const passwordHash = await hashPasswordClient(trimmedPw);
  const result = await supabaseRequest('/rest/v1/rpc/rpc_login_or_register', {
    method: 'POST',
    body: {
      p_nickname: nickCheck.nickname,
      p_password_hash: passwordHash,
    },
  });

  if (!result || !result.ok) {
    return {
      ok: false,
      message: result?.message || '로그인에 실패했습니다. 닉네임과 비밀번호를 확인해 주세요.',
    };
  }

  authState.isLoggedIn = true;
  authState.user = result.user;
  authState.passwordHash = passwordHash;
  saveSessionToStorage(result.user, passwordHash);

  const eventName = result.is_new ? 'user_signup' : 'user_login';
  logger.track(eventName, { userId: result.user.id });
  logger.info(eventName, { userId: result.user.id }, true);

  return {
    ok: true,
    isNew: Boolean(result.is_new),
    user: result.user,
  };
}

/**
 * 일일 챌린지 클리어 기록 자동 제출 (첫 클리어 등록 또는 최고 기록 경신 시 자동 업데이트)
 */
export async function submitDailyChallengeRecord({
  dateSeed,
  difficulty,
  moveCount,
  collisionCount,
}) {
  if (!authState.isLoggedIn || !authState.user) {
    return { ok: false, message: '로그인이 필요합니다.' };
  }

  const result = await supabaseRequest('/rest/v1/rpc/rpc_submit_daily_record', {
    method: 'POST',
    body: {
      p_user_id: authState.user.id,
      p_password_hash: authState.passwordHash,
      p_date_seed: String(dateSeed),
      p_difficulty: difficulty,
      p_move_count: moveCount,
      p_collision_count: collisionCount,
    },
  });

  return result;
}

/**
 * 특정 날짜 시드 + 난이도의 실시간 일일 챌린지 리더보드를 조회합니다.
 */
export async function fetchDailyLeaderboard(dateSeed, difficulty) {
  const query =
    `/rest/v1/v_challenge_leaderboard` +
    `?date_seed=eq.${encodeURIComponent(String(dateSeed))}` +
    `&difficulty=eq.${encodeURIComponent(difficulty)}` +
    `&order=rank.asc&limit=50`;

  const rows = await supabaseRequest(query);
  return Array.isArray(rows) ? rows : [];
}

/**
 * 특정 난이도의 지난 일자별 1위 기록(최근 최대 10일)을 조회합니다.
 * DB View(v_challenge_daily_hall_of_fame)에 난이도별 최근 10일 1위 필터링이 캡슐화되어 있습니다.
 * @param {'easy'|'normal'|'hard'|'hell'} difficulty
 * @returns {Promise<Array>}
 */
export async function fetchDailyHistoryLeaderboard(difficulty) {
  const query =
    `/rest/v1/v_challenge_daily_hall_of_fame` +
    `?difficulty=eq.${encodeURIComponent(difficulty)}` +
    `&order=date_seed.desc`;

  const rows = await supabaseRequest(query);
  return Array.isArray(rows) ? rows : [];
}

/**
 * 무한 모드 누적 점수 순위표(상위 50명)를 조회합니다.
 */
/**
 * 무한 모드 누적 점수 순위표(상위 100명)를 조회합니다 (DB 뷰 v_infinite_leaderboard 연동).
 */
export async function fetchInfiniteLeaderboard() {
  const query =
    `/rest/v1/v_infinite_leaderboard` +
    `?select=rank,id,nickname,infinite_score` +
    `&order=rank.asc` +
    `&limit=100`;

  const rows = await supabaseRequest(query);
  return Array.isArray(rows) ? rows : [];
}

/**
 * 무한 모드 클리어 시 난이도별 점수를 적립합니다.
 * @param {'easy'|'normal'|'hard'|'hell'} difficulty
 */
export async function addInfiniteModeScore(difficulty) {
  if (!authState.isLoggedIn || !authState.user) {
    return { ok: false, pointsAdded: 0 };
  }

  const points = INFINITE_DIFF_POINTS[difficulty] || 10;
  const result = await supabaseRequest('/rest/v1/rpc/rpc_add_infinite_score', {
    method: 'POST',
    body: {
      p_user_id: authState.user.id,
      p_password_hash: authState.passwordHash,
      p_score_delta: points,
    },
  });

  if (result && result.ok && typeof result.infinite_score === 'number') {
    authState.user.infinite_score = result.infinite_score;
    saveSessionToStorage(authState.user, authState.passwordHash);
    return {
      ok: true,
      pointsAdded: points,
      infiniteScore: result.infinite_score,
    };
  }

  return { ok: false, pointsAdded: 0 };
}

