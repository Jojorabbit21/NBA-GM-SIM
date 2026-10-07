-- league_teams.court_three: fill color inside the 3-point line (NULL = follow default; default falls back to background).
-- update_team_profile gets a 14th arg: '__keep__' (default) = leave as is, NULL = reset to default, hex = set.
alter table public.league_teams add column if not exists court_three text;
-- (function body: see Supabase migration "add_court_three"; same as add_court_logo_scale.sql plus
--  court_three = case when p_court_three = '__keep__' then court_three else p_court_three end)
drop function if exists public.update_team_profile(uuid, uuid, text, text, text, text, text, text, text, text, text, boolean, integer);
