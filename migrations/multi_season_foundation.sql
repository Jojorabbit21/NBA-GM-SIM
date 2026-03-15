-- ============================================================
-- 멀티시즌 토대: DB 마이그레이션
-- 실행 대상: Supabase SQL Editor
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. saves 테이블: 시즌 번호 + 시즌 라벨 추가
-- ────────────────────────────────────────────────────────────
ALTER TABLE saves
    ADD COLUMN IF NOT EXISTS season_number INTEGER NOT NULL DEFAULT 1;

ALTER TABLE saves
    ADD COLUMN IF NOT EXISTS current_season TEXT NOT NULL DEFAULT '2025-2026';

-- ────────────────────────────────────────────────────────────
-- 2. user_game_results 테이블: 시즌 컬럼 추가 + 인덱스
-- ────────────────────────────────────────────────────────────
ALTER TABLE user_game_results
    ADD COLUMN IF NOT EXISTS season TEXT NOT NULL DEFAULT '2025-2026';

CREATE INDEX IF NOT EXISTS idx_ugr_user_season
    ON user_game_results (user_id, season);

-- ────────────────────────────────────────────────────────────
-- 3. user_playoffs_results 테이블: 시즌 컬럼 추가
-- ────────────────────────────────────────────────────────────
ALTER TABLE user_playoffs_results
    ADD COLUMN IF NOT EXISTS season TEXT NOT NULL DEFAULT '2025-2026';

CREATE INDEX IF NOT EXISTS idx_upr_user_season
    ON user_playoffs_results (user_id, season);

-- ────────────────────────────────────────────────────────────
-- 4. user_playoffs 테이블: season unique constraint 확인
--    (이미 onConflict: 'user_id, team_id, season' 사용 중)
--    기존에 UNIQUE(user_id, team_id)만 있으면 season 포함으로 변경
-- ────────────────────────────────────────────────────────────
-- 기존 constraint 확인 후 필요 시 실행:
-- ALTER TABLE user_playoffs DROP CONSTRAINT IF EXISTS user_playoffs_user_id_team_id_key;
-- ALTER TABLE user_playoffs ADD CONSTRAINT user_playoffs_user_id_team_id_season_key UNIQUE (user_id, team_id, season);

-- ────────────────────────────────────────────────────────────
-- 5. user_season_history 테이블 (새 테이블)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_season_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    season TEXT NOT NULL,              -- '2025-2026'
    season_number INTEGER NOT NULL,    -- 1, 2, 3...
    team_id TEXT NOT NULL,

    -- 팀 성적
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    playoff_result TEXT,               -- 'Champion', 'Finals', 'CF', 'R2', 'R1', 'Play-In', null

    -- 선수별 시즌 스탯 아카이브
    player_stats JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- 선수 상태 스냅샷 (다음 시즌 베이스라인)
    player_overrides JSONB,

    -- 어워드 (추후 오프시즌 콘텐츠용)
    awards JSONB,

    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT user_season_history_user_season_key UNIQUE (user_id, season)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_ush_user_id
    ON user_season_history (user_id);

CREATE INDEX IF NOT EXISTS idx_ush_user_season_number
    ON user_season_history (user_id, season_number);

-- ────────────────────────────────────────────────────────────
-- 6. RLS (Row Level Security) - user_season_history
-- ────────────────────────────────────────────────────────────
ALTER TABLE user_season_history ENABLE ROW LEVEL SECURITY;

-- 자신의 데이터만 조회/수정 가능
CREATE POLICY "Users can view own season history"
    ON user_season_history FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own season history"
    ON user_season_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own season history"
    ON user_season_history FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own season history"
    ON user_season_history FOR DELETE
    USING (auth.uid() = user_id);
