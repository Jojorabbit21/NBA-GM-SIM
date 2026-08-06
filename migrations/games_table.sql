-- ============================================================
-- games 테이블: rooms.schedule JSONB / leagues.bracket_data.schedule 정규화
--
-- 배경: rooms.schedule(경기 배열)이 경기 하나 끝날 때마다 전체를 읽어
-- 하나만 고쳐서 통째로 다시 쓰는 패턴이라 동시 쓰기 레이스(lost-update)에
-- 취약했다. leagues.bracket_data.schedule도 완전히 동일한 배열을 중복
-- 보관하며 같은 문제를 가짐. 상세: docs/history/dev-log.md 2026-08-06 항목.
--
-- 무중단 적용 가능 — 이 시점엔 아직 아무 코드도 이 테이블을 읽거나 쓰지 않음.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.games (
    room_id      uuid        NOT NULL REFERENCES public.rooms(id)   ON DELETE CASCADE,
    game_id      text        NOT NULL,
    league_id    uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,

    home_team_id text        NOT NULL,
    away_team_id text        NOT NULL,
    game_date    date        NOT NULL,
    game_time    text,                    -- 정규시즌 전용(HH:MM 슬롯), 토너먼트는 NULL
    game_seq     integer,                 -- 시간압축 슬롯 인덱스
    scheduled_at timestamptz,             -- 실제 방송 시각 SSOT

    played       boolean     NOT NULL DEFAULT false,
    home_score   integer,
    away_score   integer,
    is_playoff   boolean     NOT NULL DEFAULT false,
    series_id    text,                   -- PlayoffSeries.id, 정규시즌 경기는 NULL

    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (room_id, game_id)
);

-- 스케줄러의 "지금 돌릴 경기" 질의 전용 부분 인덱스
CREATE INDEX IF NOT EXISTS games_due_idx
    ON public.games (league_id, scheduled_at) WHERE played = false;

-- handleTournamentAdvance의 시리즈 prune / 신규 라운드 중복 생성 방지 체크
CREATE INDEX IF NOT EXISTS games_room_series_idx
    ON public.games (room_id, series_id) WHERE series_id IS NOT NULL;

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- 읽기: 방 멤버 (rooms.r_member_select와 동일 기준, my_room_ids() 재사용).
-- game_pbp처럼 "+10분 지연" 조건을 넣지 않는다 — 넣으면 Realtime UPDATE
-- 자체가 배달 안 돼서 실시간 갱신이 깨진다. 스포일러 차단은 이미 클라이언트
-- multiGameReveal.ts(getGameDisplayState/isFinal)가 별도로 담당한다.
CREATE POLICY "g_member_select" ON public.games
    FOR SELECT USING (room_id IN (SELECT my_room_ids()));

-- 서버(Bun/fly.io, service_role) 전권 — game_pbp 정책과 동일 패턴
CREATE POLICY "g_service_write" ON public.games
    FOR ALL USING (auth.role() = 'service_role')
          WITH CHECK (auth.role() = 'service_role');

-- 리그 어드민 쓰기 — updateGameScheduledAt/resetTournament가 클라이언트에서
-- 직접 호출하므로 필요. rooms.r_admin_write와 동일 술어.
-- league_id를 games row에 비정규화해 둔 이유가 이것(rooms 조인 불필요).
CREATE POLICY "g_admin_write" ON public.games
    FOR ALL USING     (league_id IN (SELECT id FROM leagues WHERE admin_user_id = (SELECT auth.uid())))
          WITH CHECK  (league_id IN (SELECT id FROM leagues WHERE admin_user_id = (SELECT auth.uid())));

-- ── Realtime ────────────────────────────────────────────────
-- useMultiGameData의 스케줄 구독 대상을 rooms → games로 옮기므로 필수.
ALTER PUBLICATION supabase_realtime ADD TABLE public.games;

-- ── updated_at 자동 갱신 ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.games_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS games_touch ON public.games;
CREATE TRIGGER games_touch BEFORE UPDATE ON public.games
    FOR EACH ROW EXECUTE FUNCTION public.games_touch_updated_at();
