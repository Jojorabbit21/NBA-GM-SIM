-- ============================================================
-- Multi-league: user-defined team naming
-- Run: Supabase SQL Editor (manual apply)
-- Depends on: room_members table existing
-- ============================================================

ALTER TABLE room_members
    ADD COLUMN IF NOT EXISTS team_name            TEXT,
    ADD COLUMN IF NOT EXISTS team_abbr            TEXT,
    ADD COLUMN IF NOT EXISTS team_color_primary   TEXT,
    ADD COLUMN IF NOT EXISTS team_color_secondary TEXT;

-- Enforce slug format on team_id (drop old if exists, re-add)
ALTER TABLE room_members
    DROP CONSTRAINT IF EXISTS room_members_team_id_format;

ALTER TABLE room_members
    ADD CONSTRAINT room_members_team_id_format
    CHECK (team_id IS NULL OR team_id ~ '^[a-z0-9]{2,4}$');

-- Unique abbreviation per room (partial index — only when team_id is set)
DROP INDEX IF EXISTS uq_room_members_team_id;
CREATE UNIQUE INDEX uq_room_members_team_id
    ON room_members (room_id, team_id)
    WHERE team_id IS NOT NULL;
