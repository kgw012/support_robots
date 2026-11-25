-- ==============================================================================
-- Migration: Daily Challenge Honor Score Leaderboard & Retroactive Backfill
-- Description:
--   1. 일일 챌린지 누적 명예 점수 순위표 뷰(v_daily_honor_leaderboard) 생성
--   2. 기존 challenge_records 기록을 난이도별 고정 점수로 환산하여 users.total_score 소급 정산
-- ==============================================================================

-- 1. 일일 챌린지 누적 명예 점수 순위표 뷰
CREATE OR REPLACE VIEW public.v_daily_honor_leaderboard AS
SELECT
    ROW_NUMBER() OVER (
        ORDER BY total_score DESC, created_at ASC
    ) AS rank,
    id,
    nickname,
    total_score,
    created_at
FROM public.users
WHERE total_score > 0;

-- 익명/인증 클라이언트 읽기 권한 부여 (기존 리더보드 뷰와 동일 정책)
GRANT SELECT ON public.v_daily_honor_leaderboard TO anon, authenticated;

-- 2. 기존 일일 챌린지 클리어 기록 소급 정산 (중복 실행해도 안전한 GREATEST 사용)
WITH user_daily_totals AS (
    SELECT
        user_id,
        COALESCE(SUM(
            CASE LOWER(difficulty)
                WHEN 'easy' THEN 10
                WHEN 'normal' THEN 25
                WHEN 'hard' THEN 50
                WHEN 'hell' THEN 100
                ELSE 0
            END
        ), 0)::INT AS calc_score
    FROM public.challenge_records
    GROUP BY user_id
)
UPDATE public.users u
SET total_score = GREATEST(COALESCE(u.total_score, 0), t.calc_score)
FROM user_daily_totals t
WHERE u.id = t.user_id;
