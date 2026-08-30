-- ============================================================
-- league_events 테이블: 멀티플레이어 "리그 소식"(League Headlines) 이벤트 로그
--
-- 배경: ZenGM의 League Headlines를 참고해 도입 — 대량득점차/연승/개인 활약/트레이드
-- 체결처럼 "주목할 만한" 사건이 발생하는 시점에 한 줄씩 append하고, 시즌 홈 화면이
-- 최근 N개를 그대로 읽어 보여준다. ZenGM과 달리 읽기 시점 필터링이 아니라 쓰기
-- 시점에 이미 중요도 기준을 통과한 이벤트만 insert한다(Supabase 네트워크 쿼리 비용
-- 최소화 — 상세: docs/history/dev-log.md 참고).
--
-- 1단계 범위: 경기 결과 기반(대량득점차/연승/개인 활약) + 유저-유저 트레이드 체결만.
-- CPU 트레이드/FA/웨이버/시상/부상은 해당 멀티플레이어 서브시스템이 아직 없어 제외 —
-- 생기면 이 테이블에 새 type만 추가해 확장한다.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.league_events (
    id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id       uuid        NOT NULL REFERENCES public.rooms(id)   ON DELETE CASCADE,
    league_id     uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,

    type          text        NOT NULL,   -- 'blowout' | 'win_streak' | 'player_feat' | 'trade'
    season_number integer,
    game_id       text,                   -- games.game_id 참조(경기 기반 이벤트만), nullable
    team_ids      text[]      NOT NULL DEFAULT '{}',  -- team_slug 배열(games 테이블과 동일 컨벤션)
    player_ids    text[]      NOT NULL DEFAULT '{}',  -- meta_players.id 배열, nullable
    score         integer     NOT NULL DEFAULT 0,     -- 중요도(정렬/강조용, 클수록 중요)
    payload       jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- {headline: string, ...구조화 필드}

    created_at    timestamptz NOT NULL DEFAULT now()
);

-- 시즌 홈 위젯의 "최근 N개" 조회 전용 인덱스.
CREATE INDEX IF NOT EXISTS league_events_room_idx
    ON public.league_events (room_id, created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.league_events ENABLE ROW LEVEL SECURITY;

-- 읽기: 방 멤버만 (games.g_member_select와 동일 기준, my_room_ids() 재사용).
CREATE POLICY "le_member_select" ON public.league_events
    FOR SELECT USING (room_id IN (SELECT my_room_ids()));

-- 서버(Bun/fly.io, service_role) 전권 — games.g_service_write와 동일 패턴.
CREATE POLICY "le_service_write" ON public.league_events
    FOR ALL USING (auth.role() = 'service_role')
          WITH CHECK (auth.role() = 'service_role');

-- ── Realtime ────────────────────────────────────────────────
-- 시즌 홈 위젯이 폴링 없이 즉시 새 헤드라인을 받도록.
ALTER PUBLICATION supabase_realtime ADD TABLE public.league_events;
