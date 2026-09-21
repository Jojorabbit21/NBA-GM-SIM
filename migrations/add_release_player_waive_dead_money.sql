-- ============================================================
-- release_player(): 캡 활성 리그(cap_enabled=true)에서 방출 시 데드캡 기록 (waive만, 1단계)
--
-- 배경: docs/domain/nba-salary-cap-2025-26.md §8 리서치(2026-09-21 보강) 기반. 실제 CBA는
-- waive(일방 방출, 잔여 보장 급여 전액 데드캡)/buyout(협상 할인)/stretch(2n+1년 분산,
-- 15% 캡 제한)/set-off(재계약 시 상계) 4가지를 구분하지만, 이번 1단계는 "waive만" —
-- 잔여 연봉 전액이 그대로 데드캡으로 남는 가장 단순한 경로만 구현한다. buyout 협상/stretch
-- 분산/set-off 상계는 다음 단계 스코프.
--
-- 웨이버 클레임(48시간 동안 다른 팀이 잔여 계약을 그대로 흡수) 메커니즘은 의도적으로
-- 제외했다 — 이 리그의 시간압축(day_length_min 20~40분, 기본 30분)에서는 48시간(가상
-- 2일)이 실제 40~80분(기본 60분)밖에 안 돼 "비동기, 동시접속 불필요"라는 멀티플레이어
-- 설계 원칙과 맞지 않는다(그 시간에 접속하지 않은 유저는 클레임 기회를 원천적으로 놓침).
-- 대신 방출된 선수는 클레임 경쟁 없이 즉시 그 리그의 일반 FA 풀로 들어가고, 기존
-- sign_free_agent()의 선착순 동시성 처리(같은 리그 내 다른 팀이 이미 데려갔는지 체크)를
-- 그대로 재사용한다 — 이 RPC 자체는 손대지 않는다.
--
-- 데드캡 저장 위치: rooms.team_finances(jsonb, SavedTeamFinances와 동일 형태) —
-- team_finances[team_slug].deadMoney[]에 DeadMoneyEntry 1건 추가. 이미 클라이언트에
-- SavedTeamFinances 타입과 TeamPayrollTable.tsx의 렌더 로직(team.deadMoney)이 존재해서
-- (싱글플레이어용으로 만들어졌지만 형태가 동일) 재사용한다 — 새 테이블/새 컬럼 불필요.
--
-- 계약 조회 우선순위: room_player_state.contract(이 리그의 오버라이드) → 없으면
-- meta_players.base_attributes.contract 폴백(add_room_player_state_contract.sql과 동일
-- 우선순위, services/multi/buildLeagueTeams.ts의 contractByPlayer 병합 규칙과 일치).
-- 잔여 연봉 = years[currentYear:] 합계(진행 중인 시즌 포함 전액 — 실제 CBA와 동일,
-- 분할 없이 이번 시즌 데드캡 1건으로 기록).
--
-- 동시성: rooms 행에 명시적 FOR UPDATE 락을 걸지 않는다 — 같은 팀이 아주 짧은 간격으로
-- 여러 선수를 연속 방출하면(관리자 조작 등) team_finances 갱신이 드물게 lost update될 수
-- 있음(1단계 스코프에서 수용, dev-log에 명시).
-- cap_enabled=false인 리그는 기존 동작(즉시 로스터 제거, 데드캡 없음) 그대로 유지.
-- [적용] 2026-09-21 Supabase MCP로 반영
-- ============================================================

CREATE OR REPLACE FUNCTION public.release_player(p_team_id uuid, p_player_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_uid          uuid := auth.uid();
    v_team         league_teams%ROWTYPE;
    v_admin        boolean;
    v_cap_enabled  boolean;
    v_room_season  text;
    v_contract     jsonb;
    v_player_name  text;
    v_current_year int;
    v_remaining    numeric;
    v_dead_entry   jsonb;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not_authenticated';
    END IF;

    SELECT * INTO v_team FROM league_teams WHERE id = p_team_id FOR UPDATE;
    IF v_team.id IS NULL THEN
        RAISE EXCEPTION 'team_not_found';
    END IF;

    SELECT l.admin_user_id = v_uid, coalesce(l.cap_enabled, false)
    INTO v_admin, v_cap_enabled
    FROM rooms r JOIN leagues l ON l.id = r.league_id
    WHERE r.id = v_team.room_id;

    IF NOT v_admin AND v_team.user_id IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'not_team_owner';
    END IF;
    IF NOT (v_team.roster ? p_player_id) THEN
        RAISE EXCEPTION 'player_not_on_roster';
    END IF;

    UPDATE league_teams SET roster = (
        SELECT coalesce(jsonb_agg(e), '[]'::jsonb)
        FROM jsonb_array_elements_text(roster) e
        WHERE e <> p_player_id
    ) WHERE id = v_team.id;

    -- 방출 선수가 걸려있던 트레이드 블록 정리 (트레이드 accept 로직과 동일 관례)
    DELETE FROM league_trade_blocks WHERE team_id = v_team.id AND player_id = p_player_id;

    -- 뎁스차트/전술이 방금 방출된 선수를 참조하고 있을 수 있음 — 트레이드 accept와
    -- 동일하게 리셋(다음 접속 시 자동 재생성 폴백)해 stale 참조를 방지.
    UPDATE room_members SET tactics = NULL, depth_chart = NULL
    WHERE room_id = v_team.room_id AND team_id = v_team.team_slug;

    -- ── 캡 활성 리그: waive 데드캡 기록 ──────────────────────────────────
    IF v_cap_enabled THEN
        SELECT coalesce(rps.contract, mp.base_attributes->'contract'), mp.name, r.season
        INTO v_contract, v_player_name, v_room_season
        FROM meta_players mp
        JOIN rooms r ON r.id = v_team.room_id
        LEFT JOIN room_player_state rps ON rps.room_id = v_team.room_id AND rps.player_id = p_player_id
        WHERE mp.id::text = p_player_id;

        IF v_contract IS NOT NULL AND jsonb_typeof(v_contract->'years') = 'array' THEN
            v_current_year := coalesce((v_contract->>'currentYear')::int, 0);

            SELECT coalesce(sum((y.val)::numeric), 0) INTO v_remaining
            FROM jsonb_array_elements_text(v_contract->'years') WITH ORDINALITY AS y(val, idx)
            WHERE y.idx - 1 >= v_current_year;

            IF v_remaining > 0 THEN
                v_dead_entry := jsonb_build_object(
                    'playerId',    p_player_id,
                    'playerName',  coalesce(v_player_name, ''),
                    'amount',      v_remaining,
                    'season',      coalesce(v_room_season, ''),
                    'releaseType', 'waive'
                );
                UPDATE rooms
                SET team_finances = coalesce(team_finances, '{}'::jsonb)
                    || jsonb_build_object(
                        v_team.team_slug,
                        coalesce(team_finances -> v_team.team_slug, '{}'::jsonb)
                            || jsonb_build_object('deadMoney',
                                coalesce(team_finances #> array[v_team.team_slug, 'deadMoney'], '[]'::jsonb)
                                    || jsonb_build_array(v_dead_entry))
                    )
                WHERE id = v_team.room_id;
            END IF;
        END IF;
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$function$
;
