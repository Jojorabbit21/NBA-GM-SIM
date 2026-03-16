-- Add quarter_scores JSONB column to game result tables
-- Stores per-quarter scores: { home: [Q1, Q2, Q3, Q4], away: [Q1, Q2, Q3, Q4] }
-- Lightweight alternative to saving full pbp_logs for CPU games (~100 bytes vs ~125KB per game)

ALTER TABLE user_game_results
ADD COLUMN IF NOT EXISTS quarter_scores JSONB;

ALTER TABLE user_playoffs_results
ADD COLUMN IF NOT EXISTS quarter_scores JSONB;
