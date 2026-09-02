-- ============================================================
-- 멀티플레이어 정규시즌 어워드(MVP/DPOY/올-NBA/올-디펜시브) 시상 파이프라인 — DB 토대
--
-- 배경: 지금까지 멀티플레이어엔 어워드를 "선정해서 발송"하는 서버 파이프라인이 없었다
-- (MultiPlayerDetailView.tsx가 페이지 열 때마다 runAwardVoting()을 클라이언트에서
-- 즉석 재계산해 프로필 위젯만 채워주고 있었음 — 영구 저장/뉴스 발표 없음).
-- 이 마이그레이션은 그 파이프라인의 데이터 토대 3가지를 추가한다.
--
-- 1) leagues.regular_season_ended_at — 정규시즌이 "언제" 끝났는지 1회성으로 스탬프.
--    scheduler.ts의 checkSeasonCompletions()가 정규시즌 완료를 감지하는 순간(플레이오프
--    시작 직전) 한 번만 채워 넣는다. 이후 별도 스케줄러 루프가 이 값 + 1일이 지났는지를
--    확인해 어워드 계산을 트리거한다(정규시즌 종료 직후가 아니라 "하루 뒤" 발표 요건).
--
-- 2) league_player_awards — room별 시상 결과 영구 저장. 이 프로젝트의 다른 room 관련
--    테이블(games/game_pbp/league_teams/league_trade_offers 등)과 동일하게 "테이블
--    하나 + room_id 컬럼" 패턴을 따른다(room마다 테이블을 새로 만드는 건 안티패턴).
--    (room_id, season_number, player_id, award_type, rank) 유니크 제약 + insert 시
--    ON CONFLICT DO NOTHING으로, 스케줄러 재시도로 같은 시즌 어워드가 두 번 계산돼도
--    중복 삽입되지 않는다(멱등성 — game_pbp의 room_id+game_id upsert onConflict와 동일 원칙).
--
-- 3) get_league_season_awards_stats(p_room_id) RPC — 어워드 후보 스코어링에 필요한
--    room 전체 선수의 "정규시즌 한정" 누적 스탯을 집계. 기존 get_player_season_stats_batch는
--    (a) 요청한 player_id 몇 명만 반환하도록 설계돼 room 전체(최대 450명) 조회엔 안 맞고,
--    (b) is_playoff 필터가 없어 플레이오프 박스스코어까지 섞인다 — 이 RPC는 두 가지를 다르게
--    가져간다: 필터 없이 전체 반환 + games 테이블과 조인해 is_playoff=false만 집계.
--    또한 DPOY 스코어링에 필요한 offReb/defReb 분리 합계(기존 RPC엔 reb 합계만 있음)도 추가.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. leagues: 정규시즌 종료 시각 스탬프
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.leagues
    ADD COLUMN IF NOT EXISTS regular_season_ended_at timestamptz;

-- ────────────────────────────────────────────────────────────
-- 2. league_player_awards 테이블
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.league_player_awards (
    id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id       uuid        NOT NULL REFERENCES public.rooms(id)   ON DELETE CASCADE,
    league_id     uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
    season_number integer     NOT NULL,

    player_id     uuid        NOT NULL,
    team_slug     text        NOT NULL,
    -- 'MVP' | 'DPOY' | 'ALL_NBA_1' | 'ALL_NBA_2' | 'ALL_NBA_3' | 'ALL_DEF_1' | 'ALL_DEF_2'
    -- (types/player.ts의 PlayerAwardType과 동일한 값 — 싱글플레이어와 어휘 통일)
    award_type    text        NOT NULL,
    -- MVP 1~10위/DPOY 1~5위만 채움, 올-NBA/올-디펜시브는 순위 개념이 없어 0.
    rank          integer     NOT NULL DEFAULT 0,

    created_at    timestamptz NOT NULL DEFAULT now(),

    UNIQUE (room_id, season_number, player_id, award_type, rank)
);

CREATE INDEX IF NOT EXISTS lpa_room_player_idx
    ON public.league_player_awards (room_id, player_id);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.league_player_awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lpa_member_select" ON public.league_player_awards
    FOR SELECT USING (room_id IN (SELECT my_room_ids()));

CREATE POLICY "lpa_service_write" ON public.league_player_awards
    FOR ALL USING (auth.role() = 'service_role')
          WITH CHECK (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────
-- 3. get_league_season_awards_stats RPC — room 전체 선수의 정규시즌 누적 스탯
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_league_season_awards_stats(p_room_id uuid)
 RETURNS TABLE (
    player_id uuid,
    g       integer,
    mp      numeric,
    pts     numeric,
    reb     numeric,
    off_reb numeric,
    def_reb numeric,
    ast     numeric,
    stl     numeric,
    blk     numeric,
    tov     numeric,
    fgm     numeric,
    fga     numeric,
    p3m     numeric,
    p3a     numeric,
    ftm     numeric,
    fta     numeric
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT
        (elem->>'playerId')::uuid AS player_id,
        count(*)::integer                       AS g,
        sum((elem->>'mp')::numeric)              AS mp,
        sum((elem->>'pts')::numeric)             AS pts,
        sum((elem->>'reb')::numeric)             AS reb,
        sum((elem->>'offReb')::numeric)          AS off_reb,
        sum((elem->>'defReb')::numeric)          AS def_reb,
        sum((elem->>'ast')::numeric)             AS ast,
        sum((elem->>'stl')::numeric)             AS stl,
        sum((elem->>'blk')::numeric)             AS blk,
        sum((elem->>'tov')::numeric)             AS tov,
        sum((elem->>'fgm')::numeric)             AS fgm,
        sum((elem->>'fga')::numeric)             AS fga,
        sum((elem->>'p3m')::numeric)             AS p3m,
        sum((elem->>'p3a')::numeric)             AS p3a,
        sum((elem->>'ftm')::numeric)             AS ftm,
        sum((elem->>'fta')::numeric)             AS fta
    FROM public.game_pbp gp
    JOIN public.games g
      ON g.room_id = gp.room_id AND g.game_id = gp.game_id AND g.is_playoff = false
    CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(gp.home_box, '[]'::jsonb) || COALESCE(gp.away_box, '[]'::jsonb)
    ) AS elem
    WHERE gp.room_id = p_room_id
      AND gp.game_start_time + interval '10 minutes' <= now()
      AND COALESCE((elem->>'mp')::numeric, 0) > 0
    GROUP BY (elem->>'playerId')::uuid;
$function$;
