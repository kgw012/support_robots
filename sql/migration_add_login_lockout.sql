-- ==============================================================================
-- Migration: Add Login Lockout & Brute-Force Protection Columns
-- Description: users 테이블에 연속 로그인 실패 횟수 및 계정 잠금 추적 컬럼 추가
-- ==============================================================================

-- 1. users 테이블에 브루트포스 방어용 컬럼 추가
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_failed_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ DEFAULT NULL;

-- 2. 성능 최적화를 위한 잠금 만료 시각 인덱스
CREATE INDEX IF NOT EXISTS idx_users_locked_until ON public.users (locked_until);
CREATE INDEX IF NOT EXISTS idx_users_nickname_lower ON public.users (LOWER(nickname));

