-- ============================================================
-- player_stat_streaks 테이블: 멀티플레이어 "리그 소식" 선수 연속 기록 집계
--
-- 배경: "리그 소식" 이벤트 종류 확장 — 20+/30+/40+ 득점, 10+리바운드, 10+어시스트,
-- 5+스틸, 5+블락 연속 기록을 감지하려면 경기 하나만으로는 판정할 수 없고 선수별로
-- 여러 경기에 걸친 누적 상태가 필요하다. 이 테이블이 그 상태를 보관한다 — 직접 화면에
-- 노출되지 않는 내부 집계용(사용자에게 보이는 건 이 값을 바탕으로 만들어져 league_events에
-- 쓰이는 헤드라인뿐).
--
-- 결장(DNP) 처리: server/src/shared/leagueEvents.ts의 detectPlayerStatStreaks()가
-- 이번 경기 박스스코어에서 실제 출전(g===1)한 선수만 갱신 — 결장한 선수는 스트릭을
-- 건드리지 않고(리셋도 증가도 안 함) 복귀 경기부터 그대로 이어간다.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.player_stat_streaks (
    room_id    uuid        NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    player_id  text        NOT NULL,
    -- {pts20, pts30, pts40, reb10, ast10, stl5, blk5: 현재 연속 경기 수}
    streaks    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (room_id, player_id)
);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.player_stat_streaks ENABLE ROW LEVEL SECURITY;

-- 읽기: 방 멤버만 (games.g_member_select와 동일 기준, my_room_ids() 재사용).
CREATE POLICY "pss_member_select" ON public.player_stat_streaks
    FOR SELECT USING (room_id IN (SELECT my_room_ids()));

-- 서버(Bun/fly.io, service_role) 전권 — games.g_service_write와 동일 패턴.
CREATE POLICY "pss_service_write" ON public.player_stat_streaks
    FOR ALL USING (auth.role() = 'service_role')
          WITH CHECK (auth.role() = 'service_role');

-- ── updated_at 자동 갱신 ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.player_stat_streaks_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS player_stat_streaks_touch ON public.player_stat_streaks;
CREATE TRIGGER player_stat_streaks_touch BEFORE UPDATE ON public.player_stat_streaks
    FOR EACH ROW EXECUTE FUNCTION public.player_stat_streaks_touch_updated_at();
