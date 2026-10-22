-- [2026-10-22] 공용 풀 드래프트 지명 기록(draft_picks.ovr)을 고정 OVR로 기록.
-- 배경: submit_draft_pick_v2가 meta_players.base_attributes->>'ovr'(옛 키, 값 없으면 0)를 draft_picks.ovr에 기록했다.
-- 실제 DB 지명 750건 중 286건이 0, 689건이 ovr_base와 달랐다(어드민 지명 목록/리그 설정 드래프트 결과 표에 노출).
-- 변경: ① 헬퍼 meta_player_fixed_ovr(player, league) — 리그의 use_custom_overrides에 따라 ovr_custom/ovr_base,
--       둘 다 null이면 옛 키(base_attributes.ovr) → 0 순으로 폴백(클라이언트/서버 매퍼의 우선순위와 동일).
--       ② submit_draft_pick_v2 두 오버로드가 league_id 확정 후 v_ovr을 이 헬퍼로 설정.
--       ③ 기존 draft_picks 행 ovr 일괄 보정(표시용 값, 게임 로직 영향 없음).
-- 롤백: 두 오버로드를 `COALESCE((base_attributes->>'ovr')::integer, 0)`를 SELECT에서 읽던 이전 정의로 되돌리고
--       헬퍼를 DROP. 보정된 draft_picks.ovr은 옛 값을 복원할 수 없으므로(백업 없음) 필요하면 이 보정 전에 따로 백업할 것.

CREATE OR REPLACE FUNCTION public.meta_player_fixed_ovr(p_player_id uuid, p_league_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(
        CASE WHEN COALESCE((SELECT l.use_custom_overrides FROM leagues l WHERE l.id = p_league_id), false)
             THEN mp.ovr_custom ELSE mp.ovr_base END,
        (mp.base_attributes->>'ovr')::integer,
        0
    )
    FROM meta_players mp
    WHERE mp.id = p_player_id;
$function$;

DO $mig$
DECLARE
    v_sig regprocedure;
    v_def text;
    v_new text;
BEGIN
    FOR v_sig IN
        SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'submit_draft_pick_v2'
    LOOP
        v_def := pg_get_functiondef(v_sig);
        v_new := v_def;
        -- ① 선수 조회에서 옛 ovr 키 읽기 제거 (오버로드마다 줄바꿈 모양이 달라 두 형태 모두 처리)
        v_new := replace(v_new,
            E'SELECT name, position, COALESCE((base_attributes->>''ovr'')::integer, 0)\n    INTO   v_player_name, v_position, v_ovr',
            E'SELECT name, position\n    INTO   v_player_name, v_position');
        v_new := replace(v_new,
            E'SELECT name,\n           position,\n           COALESCE((base_attributes->>''ovr'')::integer, 0)\n    INTO   v_player_name, v_position, v_ovr',
            E'SELECT name,\n           position\n    INTO   v_player_name, v_position');
        -- ② league_id 확정 직후 고정 OVR 설정
        v_new := replace(v_new,
            E'FROM   rooms\n    WHERE  id = p_room_id\n    FOR UPDATE;\n',
            E'FROM   rooms\n    WHERE  id = p_room_id\n    FOR UPDATE;\n\n    v_ovr := public.meta_player_fixed_ovr(p_player_id, v_league_id);\n');
        IF v_new = v_def OR position('meta_player_fixed_ovr' in v_new) = 0 OR position('base_attributes->>''ovr''' in v_new) > 0 THEN
            RAISE EXCEPTION 'submit_draft_pick_v2 patch failed for %', v_sig;
        END IF;
        EXECUTE v_new;
    END LOOP;
END
$mig$;

-- ③ 기존 지명 기록 보정 (표시용)
UPDATE public.draft_picks dp
SET    ovr = public.meta_player_fixed_ovr(dp.player_id, dp.league_id)
WHERE  dp.ovr IS DISTINCT FROM public.meta_player_fixed_ovr(dp.player_id, dp.league_id);
