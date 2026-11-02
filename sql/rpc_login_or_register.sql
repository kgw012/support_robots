-- ==============================================================================
-- Function: public.rpc_login_or_register
-- Description: 원스톱 회원가입 및 로그인 (비밀번호 브루트포스 방지 계정 잠금 & 점진적 백오프)
-- 정책:
--   - 5회 연속 실패: 1분 잠금
--   - 10회 이상 연속 실패 (5회 추가 실패): 10분 잠금
--   - 마지막 실패 후 15분 경과 시: 실패 횟수 자동 리셋
--   - 로그인 성공 시: 실패 횟수 및 잠금 즉시 초기화 (0회)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rpc_login_or_register(
    p_nickname VARCHAR(32),
    p_password_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_user RECORD;
    v_new_user RECORD;
    v_remaining_secs INT := 0;
    v_lockout_interval INTERVAL;
    v_new_failed_attempts INT;
    v_hashed_pw TEXT;
BEGIN
    -- 1. 닉네임 기본 유효성 검증
    p_nickname := TRIM(p_nickname);
    IF p_nickname IS NULL OR LENGTH(p_nickname) < 1 THEN
        RETURN jsonb_build_object(
            'ok', false,
            'message', '닉네임을 올바르게 입력해 주세요.'
        );
    END IF;

    IF p_password_hash IS NULL OR LENGTH(p_password_hash) < 4 THEN
        RETURN jsonb_build_object(
            'ok', false,
            'message', '비밀번호 해시 정보가 유효하지 않습니다.'
        );
    END IF;

    -- 2. 기존 사용자 조회 (동시성 방어를 위해 FOR UPDATE 잠금)
    SELECT id, nickname, password_hash, total_score, infinite_score, failed_attempts, locked_until, last_failed_at
    INTO v_user
    FROM public.users
    WHERE LOWER(nickname) = LOWER(p_nickname)
    FOR UPDATE;

    -- ==========================================================================
    -- CASE A: 신규 사용자 -> 즉시 자동 등록 (비밀번호 pgcrypto bcrypt 해싱 저장)
    -- ==========================================================================
    IF v_user.id IS NULL THEN
        -- DB 레벨에서 pgcrypto bcrypt (Cost Factor 10) 2차 단방향 해싱
        v_hashed_pw := crypt(p_password_hash, gen_salt('bf', 10));

        INSERT INTO public.users (
            nickname,
            password_hash,
            failed_attempts,
            locked_until,
            last_failed_at
        ) VALUES (
            p_nickname,
            v_hashed_pw,
            0,
            NULL,
            NULL
        )
        RETURNING id, nickname, total_score, infinite_score INTO v_new_user;

        RETURN jsonb_build_object(
            'ok', true,
            'is_new', true,
            'user', jsonb_build_object(
                'id', v_new_user.id,
                'nickname', v_new_user.nickname,
                'total_score', v_new_user.total_score,
                'infinite_score', v_new_user.infinite_score
            )
        );
    END IF;

    -- ==========================================================================
    -- CASE B: 기존 사용자 -> 브루트포스 방어 및 인증 검증
    -- ==========================================================================

    -- 1) 계정 잠금 여부 검사 (locked_until이 현재 시각보다 미래인지 확인)
    IF v_user.locked_until IS NOT NULL AND v_user.locked_until > NOW() THEN
        v_remaining_secs := GREATEST(1, EXTRACT(EPOCH FROM (v_user.locked_until - NOW()))::INT);
        RETURN jsonb_build_object(
            'ok', false,
            'locked', true,
            'remaining_seconds', v_remaining_secs,
            'message', format(
                '계정 보안을 위해 일시적으로 잠겼습니다. %s분 %s초 후 다시 시도해 주세요.',
                (v_remaining_secs / 60),
                (v_remaining_secs % 60)
            )
        );
    END IF;

    -- 2) 슬라이딩 윈도우: 마지막 실패 후 15분이 경과한 경우 실패 카운트 리셋
    IF v_user.last_failed_at IS NOT NULL AND v_user.last_failed_at < (NOW() - INTERVAL '15 minutes') THEN
        v_user.failed_attempts := 0;
    END IF;

    -- 3) 비밀번호 일치 검증 (bcrypt 또는 legacy SHA-256 지원)
    IF v_user.password_hash = crypt(p_password_hash, v_user.password_hash) 
       OR v_user.password_hash = p_password_hash THEN
        
        -- [인증 성공] -> 실패 카운트 및 잠금 상태 완전 초기화 (0회)
        UPDATE public.users
        SET failed_attempts = 0,
            locked_until = NULL,
            last_failed_at = NULL
        WHERE id = v_user.id;

        RETURN jsonb_build_object(
            'ok', true,
            'is_new', false,
            'user', jsonb_build_object(
                'id', v_user.id,
                'nickname', v_user.nickname,
                'total_score', v_user.total_score,
                'infinite_score', v_user.infinite_score
            )
        );
    END IF;

    -- ==========================================================================
    -- [인증 실패] -> 실패 횟수 누적 및 잠금(Lockout) 적용
    -- ==========================================================================
    v_new_failed_attempts := COALESCE(v_user.failed_attempts, 0) + 1;

    IF v_new_failed_attempts >= 10 THEN
        -- 10회 이상 실패 (5회 잠금 후 5회 더 실패): 10분 잠금
        v_lockout_interval := INTERVAL '10 minutes';
        UPDATE public.users
        SET failed_attempts = v_new_failed_attempts,
            last_failed_at = NOW(),
            locked_until = NOW() + v_lockout_interval
        WHERE id = v_user.id;

        RETURN jsonb_build_object(
            'ok', false,
            'locked', true,
            'failed_attempts', v_new_failed_attempts,
            'remaining_seconds', 600,
            'message', '비밀번호를 연속 10회 잘못 입력하여 계정이 10분간 보호 잠금되었습니다.'
        );
    ELSIF v_new_failed_attempts >= 5 THEN
        -- 5회 실패: 1분 잠금
        v_lockout_interval := INTERVAL '1 minute';
        UPDATE public.users
        SET failed_attempts = v_new_failed_attempts,
            last_failed_at = NOW(),
            locked_until = NOW() + v_lockout_interval
        WHERE id = v_user.id;

        RETURN jsonb_build_object(
            'ok', false,
            'locked', true,
            'failed_attempts', v_new_failed_attempts,
            'remaining_seconds', 60,
            'message', '비밀번호를 연속 5회 잘못 입력하여 계정보호를 위해 1분간 잠금 처리되었습니다.'
        );
    ELSE
        -- 1~4회 실패: 경고 및 5회 실패 시 1분 잠금 안내
        UPDATE public.users
        SET failed_attempts = v_new_failed_attempts,
            last_failed_at = NOW()
        WHERE id = v_user.id;

        RETURN jsonb_build_object(
            'ok', false,
            'locked', false,
            'failed_attempts', v_new_failed_attempts,
            'remaining_attempts', (5 - v_new_failed_attempts),
            'message', format(
                '비밀번호가 일치하지 않습니다. (연속 %s회 실패 / 5회 실패 시 1분간 잠금)',
                v_new_failed_attempts
            )
        );
    END IF;

END;
$$;
