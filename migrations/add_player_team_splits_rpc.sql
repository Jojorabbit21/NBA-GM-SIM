-- ============================================================
-- get_player_team_splits(p_room_id, p_player_id) — 선수 1명의 "팀별" 시즌 누적 (2026-10-26)
--
-- 배경: get_player_season_stats_league는 선수 단위로만 합산해서, 시즌 중 트레이드된 선수의 프로필
-- 기록이 한 팀으로 뭉쳐 보였다. 이 RPC는 박스스코어 행이 어느 팀(home_box=home_team_id,
-- away_box=away_team_id) 소속으로 뛴 경기인지를 그대로 써서 팀 × (정규/플레이오프)별로 나눠 돌려준다.
-- 프로필 기록 탭이 2TM/3TM 요약행 + 팀별 서브행을 만드는 데 쓴다.
-- 리빌 게이팅/올스타 제외/mp>0 조건은 get_player_season_stats_league와 동일.
--
-- 롤백: drop function public.get_player_team_splits(uuid, text);
-- ============================================================
create or replace function public.get_player_team_splits(p_room_id uuid, p_player_id text)
returns table(
    team_id text, is_playoff boolean, first_at timestamptz,
    g integer, gs numeric, mp numeric, pts numeric, reb numeric, off_reb numeric, def_reb numeric,
    ast numeric, stl numeric, blk numeric, tov numeric, pf numeric,
    fgm numeric, fga numeric, p3m numeric, p3a numeric, ftm numeric, fta numeric,
    contested_attempted numeric, contested_made numeric
)
language sql
stable
set search_path = public
as $$
    select
        t.tid as team_id,
        g.is_playoff,
        min(gp.game_start_time) as first_at,
        count(*)::integer,
        sum((t.e->>'gs')::numeric), sum((t.e->>'mp')::numeric), sum((t.e->>'pts')::numeric),
        sum((t.e->>'reb')::numeric), sum((t.e->>'offReb')::numeric), sum((t.e->>'defReb')::numeric),
        sum((t.e->>'ast')::numeric), sum((t.e->>'stl')::numeric), sum((t.e->>'blk')::numeric),
        sum((t.e->>'tov')::numeric), sum((t.e->>'pf')::numeric),
        sum((t.e->>'fgm')::numeric), sum((t.e->>'fga')::numeric),
        sum((t.e->>'p3m')::numeric), sum((t.e->>'p3a')::numeric),
        sum((t.e->>'ftm')::numeric), sum((t.e->>'fta')::numeric),
        sum((t.e->>'contestedAttempted')::numeric), sum((t.e->>'contestedMade')::numeric)
    from game_pbp gp
    join public.games g
      on g.room_id = gp.room_id and g.game_id = gp.game_id and g.is_allstar = false
    cross join lateral (
        select gp.home_team_id as tid, e from jsonb_array_elements(coalesce(gp.home_box, '[]'::jsonb)) e
        union all
        select gp.away_team_id, e from jsonb_array_elements(coalesce(gp.away_box, '[]'::jsonb)) e
    ) t
    where gp.room_id = p_room_id
      and public.game_reveal_at(p_room_id, gp.game_start_time, gp.ot_periods) <= now()
      and t.e->>'playerId' = p_player_id
      and coalesce((t.e->>'mp')::numeric, 0) > 0
    group by t.tid, g.is_playoff;
$$;

grant execute on function public.get_player_team_splits(uuid, text) to anon, authenticated;
