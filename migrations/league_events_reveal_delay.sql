-- ============================================================
-- league_events.le_member_select — game_pbp와 동일한 "+10분 공개 지연" 적용
--
-- 배경: 사용자 지적 — "박스스코어는 10분 지연으로 안 보이는데 그 경기 뉴스(득점/리바운드
-- 등 스탯이 전부 담긴 헤드라인)는 왜 즉시 보이냐"는 정당한 모순 지적. 실제로 league_events
-- RLS(le_member_select)엔 시간 조건이 전혀 없이 방 멤버십만 체크하고 있었다 — game_pbp의
-- "room members can read game_pbp" 정책(game_start_time + 10분 <= now())과 완전히
-- 어긋난 상태. 뉴스가 경기 스코어/개인 스탯을 그대로 헤드라인에 담고 있으니 사실상
-- game_pbp보다 먼저 스포일러가 새는 구조였음.
--
-- 수정: league_events도 game_id로 연결된 game_pbp 행의 공개 시점을 그대로 따르게 함
-- (같은 room_id/game_id 조합의 game_pbp가 아직 공개 전이면 league_events도 숨김).
-- game_id가 NULL인 이벤트(trade — respond_trade_offer RPC가 직접 insert, 경기와 무관)는
-- 이 게이트와 상관없이 기존처럼 즉시 노출(트레이드는 스포일러 개념이 없음).
--
-- game_pbp_room_game_unique(room_id, game_id) 유니크 인덱스가 이미 있어 EXISTS 조인이
-- 인덱스를 탄다(추가 인덱스 불필요).
-- [적용] 2026-09-01 Supabase MCP로 반영
-- ============================================================

DROP POLICY IF EXISTS "le_member_select" ON public.league_events;

CREATE POLICY "le_member_select" ON public.league_events
    FOR SELECT USING (
        room_id IN (SELECT my_room_ids())
        AND (
            game_id IS NULL
            OR EXISTS (
                SELECT 1 FROM public.game_pbp gp
                WHERE gp.room_id = league_events.room_id
                  AND gp.game_id = league_events.game_id
                  AND gp.game_start_time + interval '10 minutes' <= now()
            )
        )
    );
