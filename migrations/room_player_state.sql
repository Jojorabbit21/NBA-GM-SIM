-- ============================================================
-- room_player_state 테이블: 멀티플레이어 선수 상태(부상/체력) 영속화
--
-- 배경: 멀티플레이어에서 sim_settings.injuriesEnabled를 켜도 부상이 경기 종료와
-- 함께 사라지고 체력(condition)도 매 경기 100으로 리셋됐다 — 선수의 능력치/상태
-- 변동을 담는 전용 테이블이 지금까지 존재하지 않았기 때문이다.
--
--   - meta_players: 공유 읽기전용 원본 능력치, 변동 저장 불가
--   - rooms.roster_state (JSONB): 드래프트 확정 시 1회만 기록되고 이후 갱신 안 됨
--   - player_stat_streaks: 연속기록 집계 전용, 상태와 무관
--
-- server/src/shared/engine/pbp/liveEngine.ts의 result.rosterUpdates/result.injuries가
-- 부상 데이터를 정확히 만들어내는데도(applyRosterState()가 읽는 필드 그대로) 쓸 곳이
-- 없어서 버려지고 있었다. 이 테이블이 그 write-back 대상이다.
--
-- 동시성: server/src/scheduler.ts가 같은 방의 여러 경기를 Promise.allSettled로 동시에
-- 시뮬레이션한다. rooms.roster_state처럼 방 1행짜리 JSONB blob을 read-modify-write하면
-- lost update가 나지만, 이 테이블은 PK (room_id, player_id) 행 단위 upsert라 안전하다
-- — 동시 실행되는 경기들은 선수 집합이 겹치지 않는다(선수는 한 팀 소속, 팀은 한 번에
-- 한 경기만 뛴다).
--
-- injury_history는 싱글플레이어 SavedPlayerState.injuryHistory(types/player.ts)와
-- 동일한 형태(InjuryHistoryEntry[])로 맞춰, 나중에 클라이언트를 붙일 때 PlayerDetailView가
-- 변환 없이 그대로 소비할 수 있게 했다. health/injury_type/return_date는 그 이력의
-- "현재 상태" 투영(projection)이며, 쓰기는 simRunner.ts 한 곳뿐이라 이중 진실 공급원이
-- 되지 않는다.
--
-- 이 테이블은 앞으로의 확장 지점이기도 하다 — 싱글의 성장/퇴화(attrDeltas 등), 사기,
-- 인기도가 멀티에도 필요해지면 전부 이 테이블의 컬럼으로 붙는다. 이번엔 부상/체력만.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.room_player_state (
    room_id        uuid        NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    player_id      text        NOT NULL,

    condition      numeric,                                    -- 경기 간 체력 이월
    -- 아래 4개는 injury_history 최신 활성 엔트리의 투영. 항상 return_date와 인게임
    -- 날짜(games.game_date)를 비교해 해석한다 — server/src/simRunner.ts 참고.
    health         text,                                       -- 'Healthy'|'Injured'|'Day-to-Day'
    injury_type    text,
    return_date    date,                                       -- null + season_number = 시즌아웃
    season_number  integer,
    injury_history jsonb       NOT NULL DEFAULT '[]'::jsonb,    -- InjuryHistoryEntry[]

    updated_at     timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (room_id, player_id)
);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.room_player_state ENABLE ROW LEVEL SECURITY;

-- 읽기: 방 멤버만 (player_stat_streaks.pss_member_select와 동일 패턴, my_room_ids() 재사용).
CREATE POLICY "rps_member_select" ON public.room_player_state
    FOR SELECT USING (room_id IN (SELECT my_room_ids()));

-- 서버(Bun/fly.io, service_role) 전권 — player_stat_streaks.pss_service_write와 동일 패턴.
CREATE POLICY "rps_service_write" ON public.room_player_state
    FOR ALL USING (auth.role() = 'service_role')
          WITH CHECK (auth.role() = 'service_role');

-- ── updated_at 자동 갱신 ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.room_player_state_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS room_player_state_touch ON public.room_player_state;
CREATE TRIGGER room_player_state_touch BEFORE UPDATE ON public.room_player_state
    FOR EACH ROW EXECUTE FUNCTION public.room_player_state_touch_updated_at();

-- [적용] 2026-09-03 Supabase MCP로 반영
