-- ==============================================================================
-- Function: public.rpc_add_infinite_score
-- Description: 무한 모드 클리어 점수 누적 (단방향 해시 및 계정 잠금 검증)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rpc_add_infinite_score(
    p_user_id UUID,
    p_password_hash TEXT,
    p_score_delta INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_saved_hash TEXT;
    v_locked_until TIMESTAMPTZ;
    v_new_score INT;
BEGIN
    -- 1. 유저 인증 및 잠금 여부 검증
    SELECT password_hash, locked_until 
    INTO v_saved_hash, v_locked_until
    FROM public.users
    WHERE id = p_user_id;

    IF v_saved_hash IS NULL THEN
        RETURN jsonb_build_object(
            'ok', false,
            'message', '존재하지 않는 사용자 계정입니다.'
        );
    END IF;

    IF v_locked_until IS NOT NULL AND v_locked_until > NOW() THEN
        RETURN jsonb_build_object(
            'ok', false,
            'locked', true,
            'message', '계정보호를 위해 일시 잠금된 상태입니다.'
        );
    END IF;

    -- pgcrypto bcrypt 또는 SHA-256 검증
    IF v_saved_hash <> crypt(p_password_hash, v_saved_hash) AND v_saved_hash <> p_password_hash THEN
        RETURN jsonb_build_object(
            'ok', false,
            'message', '비밀번호 인증에 실패했습니다.'
        );
    END IF;

    -- 점수 증분 유효성 검증 (비정상 값 방어: 1회당 최대 100점 이하만 허용)
    IF p_score_delta <= 0 OR p_score_delta > 100 THEN
        RETURN jsonb_build_object(
            'ok', false,
            'message', '유효하지 않은 점수 획득 요청입니다.'
        );
    END IF;

    -- 점수 누적 업데이트
    UPDATE public.users
    SET infinite_score = COALESCE(infinite_score, 0) + p_score_delta
    WHERE id = p_user_id
    RETURNING infinite_score INTO v_new_score;

    RETURN jsonb_build_object(
        'ok', true,
        'infinite_score', v_new_score
    );
END;
$$;

