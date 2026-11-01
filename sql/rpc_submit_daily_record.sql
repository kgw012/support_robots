-- ==============================================================================
-- Function: public.rpc_submit_daily_record
-- Description: 일일 챌린지 기록 검증 및 등록 (KST 자정 날짜 검증 & 타이 브레이커 갱신)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rpc_submit_daily_record(
    p_user_id UUID,
    p_password_hash TEXT,
    p_date_seed VARCHAR(8),
    p_difficulty VARCHAR(16),
    p_move_count INT,
    p_collision_count INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_saved_hash TEXT;
    v_today_kst VARCHAR(8);
    v_existing_moves INT;
    v_existing_cols INT;
    v_status TEXT;
BEGIN
    -- 1. 유저 인증 검증 (단방향 해시 검증)
    SELECT password_hash INTO v_saved_hash
    FROM public.users
    WHERE id = p_user_id;

    IF v_saved_hash IS NULL THEN
        RETURN jsonb_build_object(
            'ok', false,
            'message', '존재하지 않는 사용자 계정입니다.'
        );
    END IF;

    -- pgcrypto bcrypt 또는 SHA-256 검증 (일치 여부 확인)
    IF v_saved_hash <> crypt(p_password_hash, v_saved_hash) AND v_saved_hash <> p_password_hash THEN
        RETURN jsonb_build_object(
            'ok', false,
            'message', '비밀번호 인증에 실패했습니다.'
        );
    END IF;

    -- 2. 한국 표준시(KST, Asia/Seoul) 기준 현재 오늘 날짜 시드 계산
    v_today_kst := TO_CHAR(NOW() AT TIME ZONE 'Asia/Seoul', 'YYYYMMDD');

    -- 3. 날짜 검증: 요청받은 날짜 시드가 오늘 KST 날짜와 다르면 만료 처리
    IF p_date_seed <> v_today_kst THEN
        RETURN jsonb_build_object(
            'ok', false,
            'code', 'EXPIRED_DATE',
            'message', '일일 챌린지 클리어 가능 시간(자정 24:00)이 경과했습니다. 오늘의 새로운 퍼즐에 도전해 보세요!'
        );
    END IF;

    -- 4. 기존 일일 챌린지 기록 조회
    SELECT move_count, collision_count
    INTO v_existing_moves, v_existing_cols
    FROM public.challenge_records
    WHERE user_id = p_user_id
      AND date_seed = p_date_seed
      AND difficulty = p_difficulty;

    IF v_existing_moves IS NULL THEN
        -- 최초 등록 (INSERT)
        INSERT INTO public.challenge_records (
            user_id,
            date_seed,
            difficulty,
            move_count,
            collision_count,
            submitted_at
        ) VALUES (
            p_user_id,
            p_date_seed,
            p_difficulty,
            p_move_count,
            p_collision_count,
            NOW()
        );
        v_status := 'INSERTED';
    ELSE
        -- 기존 기록 존재 시 우선권 판정:
        -- 우선순위 1: 최소 이동 횟수 (move_count 낮을수록 우수)
        -- 우선순위 2: 최다 로봇 간 충돌 횟수 (collision_count 높을수록 우수)
        IF p_move_count < v_existing_moves
           OR (p_move_count = v_existing_moves AND p_collision_count > v_existing_cols) THEN
            UPDATE public.challenge_records
            SET move_count = p_move_count,
                collision_count = p_collision_count,
                submitted_at = NOW()
            WHERE user_id = p_user_id
              AND date_seed = p_date_seed
              AND difficulty = p_difficulty;
            v_status := 'UPDATED';
        ELSE
            v_status := 'MAINTAINED';
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'status', v_status,
        'date_seed', p_date_seed,
        'difficulty', p_difficulty,
        'move_count', p_move_count,
        'collision_count', p_collision_count
    );
END;
$$;
