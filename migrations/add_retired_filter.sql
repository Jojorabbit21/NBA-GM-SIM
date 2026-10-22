-- meta_players.retired + leagues.draft_retired_filter (2026-10-22). Supabase MCP로 적용 완료, 기록용.
ALTER TABLE meta_players ADD COLUMN IF NOT EXISTS retired BOOLEAN NOT NULL DEFAULT false;
-- 휴리스틱 백필: 2026-27을 덮는 계약 없음 + 2025-26 이후 출전 기록 없음 + draft_year<2026
UPDATE meta_players m SET retired = true
WHERE m.draft_year < 2026
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(m.base_attributes->'contract'->'yearSeasons','[]'::jsonb)) y WHERE y::int >= 2026)
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(m.career_history,'[]'::jsonb)) e WHERE (e->>'season') >= '2025-26');
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS draft_retired_filter TEXT NOT NULL DEFAULT 'all';
ALTER TABLE leagues ADD CONSTRAINT leagues_draft_retired_filter_check CHECK (draft_retired_filter IN ('all','active','retired'));
-- trg_lal_league_settings() v_cols 배열에 'draft_retired_filter' 추가(함수 재생성)
