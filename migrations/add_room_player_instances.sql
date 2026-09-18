-- ============================================================
-- room_player_instances 테이블: 룸 스코프 선수 인스턴스 (개인 팩 드래프트 전용)
--
-- 배경: 개인 팩 드래프트(docs/plan/tournament-personal-pack-draft-plan.md)는 완전
-- 비동기·독립 랜덤이라 같은 선수(meta_players.id)가 한 토너먼트 안에서 여러 팀
-- 로스터에 중복 존재할 수 있다. meta_players 테이블은 건드리지 않는다는 제약 하에
-- 이 중복을 다운스트림 시스템과 충돌 없이 표현하려면 "같은 선수, 다른 인스턴스"를
-- 나타낼 방법이 필요하다.
--
-- 핵심 아이디어: 카드가 뽑히는 순간 이 테이블에 새 instance_id(신규 uuid)를 발급하고,
-- 이후 league_teams.roster / room_player_state.player_id / game_pbp box score의
-- playerId에 meta_players.id 대신 이 instance_id를 그대로 흘려보낸다. room_player_state의
-- PK(room_id, player_id)나 get_player_season_stats_full RPC의 GROUP BY playerId가
-- 이미 팀마다 유일한 값을 받게 되므로, 두 시스템 모두 스키마·RPC를 고치지 않고도
-- 자동으로 안전해진다(instance_id 자체가 팀당 유일하기 때문).
--
-- meta_players는 순수 읽기전용 템플릿으로만 참조된다 — 이 테이블이 존재해도
-- meta_players에는 row 추가/수정이 전혀 일어나지 않는다.
--
-- 정리(cleanup): 토너먼트 종료 후 tournamentArchiver.ts가 아카이빙을 마치면 해당
-- room_id의 row를 전부 삭제한다(영속 보관하지 않음) — 과거 박스스코어는
-- tournament_game_player_stats가 player_name/position을 이미 비정규화 저장해두므로
-- 인스턴스 삭제와 무관하게 계속 조회 가능하다.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.room_player_instances (
    instance_id       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id           uuid        NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    team_id           uuid        NOT NULL REFERENCES public.league_teams(id) ON DELETE CASCADE,
    source_player_id  uuid        NOT NULL REFERENCES public.meta_players(id),
    drafted_round     integer     NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_player_instances_room   ON public.room_player_instances(room_id);
CREATE INDEX IF NOT EXISTS idx_room_player_instances_team   ON public.room_player_instances(team_id);
CREATE INDEX IF NOT EXISTS idx_room_player_instances_source ON public.room_player_instances(source_player_id);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.room_player_instances ENABLE ROW LEVEL SECURITY;

-- 읽기: 방 멤버만 (room_player_state.rps_member_select와 동일 패턴).
CREATE POLICY "rpi_member_select" ON public.room_player_instances
    FOR SELECT USING (room_id IN (SELECT my_room_ids()));

-- 서버(Bun/fly.io, service_role) 전권 — submit_personal_draft_pick RPC가 이 경로로 insert.
CREATE POLICY "rpi_service_write" ON public.room_player_instances
    FOR ALL USING (auth.role() = 'service_role')
          WITH CHECK (auth.role() = 'service_role');

-- [적용] 2026-09-18 Supabase MCP로 반영
