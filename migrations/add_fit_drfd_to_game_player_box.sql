-- [2026-11-15] FIT%(스크린을 맞은 수비수 파이트쓰루) · DRFD(DrivesFaced, 막은 돌파 수) 집계 칼럼
--
-- 배경: 엔진이 경기 박스스코어(game_pbp.home_box/away_box)의 선수 줄에 fitFaced / fitThru / drfd / drfdZone 을 기록하기 시작한다
-- (2026-11-15 이후 경기부터, 이전 경기 JSON 에는 키가 없다 → NULL).
--   fit_faced : 판정된 스크린 수(스크린을 맞은 수비수 기준)      fit_thru : 스크린에 걸리지 않고 빠져나간 수 → FIT% = fit_thru ÷ fit_faced
--   drfd      : 맨투맨에서 막은 림·페인트 돌파 수                drfd_zone: 지역방어에서 막은 돌파 수(골밑 앵커 귀속이라 따로 집계)
--
-- 바꾸는 것(SCRN% 칼럼 추가 때와 같은 경로):
--   1. game_player_box 에 integer 칼럼 4개(기본값 없는 nullable 추가 → 표를 다시 쓰지 않는다)
--   2. sync_game_box() — 트리거·백필이 쓰는 같은 함수가 새 칼럼도 채운다(현행 정의에 문자열 치환 → 다른 부분은 글자 하나 안 바뀐다)
--   3. get_player_season_stats_league 3겹(바깥 / _box / _legacy) — 결과 열 끝에 4개 추가. 결과 열이 바뀌어 CREATE OR REPLACE 가 안 되므로
--      DROP 후 다시 만들고, 접근 권한은 원래와 같게 되돌린다(바깥·_legacy = 공개 실행, _box = 서비스 키만).
--      화면 쪽(usePlayerSeasonStatsLeague)은 새 열이 없으면 0 으로 읽는다 → 적용 순서(DB 먼저/화면 먼저) 상관없음.
--
-- 사전 점검(2026-11-15): 한 트랜잭션에서 적용하고 되돌림(ROLLBACK) — 새 열 4개·권한·기존 열 값 동일·sync_game_box 의 새 칼럼 채움 확인.
-- 적용 시각: 경기가 돌지 않는 시간(game_player_box 에 아주 짧은 잠금).
--
-- 적용: 2026-11-15 운영 DB(Supabase 마이그레이션 add_fit_drfd_to_game_player_box). 적용 후 새 열 4개·권한 3종 동일·조회 결과(정규 450행/플레이오프 267행) 확인.
-- 롤백(2026-11-15 같은 방식으로 한 트랜잭션에서 시험 후 되돌림 — 흔적 0·결과 행 동일·권한 동일 확인). 반드시 이 순서(함수 → 칼럼):
--   do $rb$ declare v_def text; v_sig text; v_new text; begin
--       v_def := pg_get_functiondef('public.sync_game_box(uuid, text)'::regprocedure);
--       v_def := replace(v_def, 'scr_partial, scr_fail, fit_faced, fit_thru, drfd, drfd_zone)', 'scr_partial, scr_fail)');
--       v_def := replace(v_def, $k$(t.e->>'scrFail')::integer, (t.e->>'fitFaced')::integer, (t.e->>'fitThru')::integer, (t.e->>'drfd')::integer, (t.e->>'drfdZone')::integer$k$, $k$(t.e->>'scrFail')::integer$k$);
--       execute v_def;
--       foreach v_sig in array array['public.get_player_season_stats_league_box(uuid, uuid[], boolean)', 'public.get_player_season_stats_league_legacy(uuid, uuid[], boolean)', 'public.get_player_season_stats_league(uuid, uuid[], boolean)'] loop
--           v_def := pg_get_functiondef(v_sig::regprocedure);
--           v_new := replace(v_def, 'scr_fail numeric, fit_faced numeric, fit_thru numeric, drfd numeric, drfd_zone numeric)', 'scr_fail numeric)');
--           v_new := replace(v_new, 'coalesce(sum(b.scr_fail), 0)::numeric, coalesce(sum(b.fit_faced), 0)::numeric, coalesce(sum(b.fit_thru), 0)::numeric, coalesce(sum(b.drfd), 0)::numeric, coalesce(sum(b.drfd_zone), 0)::numeric', 'coalesce(sum(b.scr_fail), 0)::numeric');
--           v_new := regexp_replace(v_new, 'AS scr_fail,\s+coalesce\(sum\(\(elem->>''fitFaced''\)::numeric\), 0\)\s+AS fit_faced,\s+coalesce\(sum\(\(elem->>''fitThru''\)::numeric\), 0\)\s+AS fit_thru,\s+coalesce\(sum\(\(elem->>''drfd''\)::numeric\), 0\)\s+AS drfd,\s+coalesce\(sum\(\(elem->>''drfdZone''\)::numeric\), 0\)\s+AS drfd_zone', 'AS scr_fail');
--           execute 'drop function ' || v_sig; execute v_new;
--       end loop;
--   end $rb$;
--   revoke all on function public.get_player_season_stats_league_box(uuid, uuid[], boolean) from public, anon, authenticated;
--   grant execute on function public.get_player_season_stats_league_box(uuid, uuid[], boolean) to service_role;
--   grant execute on function public.get_player_season_stats_league(uuid, uuid[], boolean) to public, anon, authenticated, service_role;
--   grant execute on function public.get_player_season_stats_league_legacy(uuid, uuid[], boolean) to public, anon, authenticated, service_role;
--   alter table public.game_player_box drop column fit_faced, drop column fit_thru, drop column drfd, drop column drfd_zone;

set local lock_timeout = '5s';

alter table public.game_player_box
    add column if not exists fit_faced integer,
    add column if not exists fit_thru  integer,
    add column if not exists drfd      integer,
    add column if not exists drfd_zone integer;

do $mig$
declare
    v_def text;
    v_new text;
    v_old_ret text := 'scr_fail numeric)';
    v_new_ret text := 'scr_fail numeric, fit_faced numeric, fit_thru numeric, drfd numeric, drfd_zone numeric)';
    v_sig text;
begin
    -- 2) sync_game_box: 칼럼 목록 + 값 목록 끝에 4개 추가
    v_def := pg_get_functiondef('public.sync_game_box(uuid, text)'::regprocedure);
    if position('fit_faced' in v_def) > 0 then
        raise notice 'sync_game_box already handles FIT/DRFD - skipped';
    else
        if (length(v_def) - length(replace(v_def, 'scr_partial, scr_fail)', ''))) <> length('scr_partial, scr_fail)')
           or (length(v_def) - length(replace(v_def, $k$(t.e->>'scrFail')::integer$k$, ''))) <> length($k$(t.e->>'scrFail')::integer$k$) then
            raise exception 'sync_game_box: expected anchors not found exactly once';
        end if;
        v_new := replace(v_def, 'scr_partial, scr_fail)', 'scr_partial, scr_fail, fit_faced, fit_thru, drfd, drfd_zone)');
        v_new := replace(v_new, $k$(t.e->>'scrFail')::integer$k$,
            $k$(t.e->>'scrFail')::integer, (t.e->>'fitFaced')::integer, (t.e->>'fitThru')::integer, (t.e->>'drfd')::integer, (t.e->>'drfdZone')::integer$k$);
        execute v_new;
    end if;

    -- 3) 조회 3겹: 결과 열 끝에 4개 추가 후 DROP → 재생성
    foreach v_sig in array array[
        'public.get_player_season_stats_league_box(uuid, uuid[], boolean)',
        'public.get_player_season_stats_league_legacy(uuid, uuid[], boolean)',
        'public.get_player_season_stats_league(uuid, uuid[], boolean)'
    ] loop
        v_def := pg_get_functiondef(v_sig::regprocedure);
        if position('fit_faced' in v_def) > 0 then
            raise notice '% already has FIT/DRFD - skipped', v_sig;
            continue;
        end if;
        if (length(v_def) - length(replace(v_def, v_old_ret, ''))) <> length(v_old_ret) then
            raise exception '%: RETURNS TABLE anchor not found exactly once', v_sig;
        end if;
        v_new := replace(v_def, v_old_ret, v_new_ret);
        if v_sig like '%_box(%' then
            if (length(v_def) - length(replace(v_def, 'coalesce(sum(b.scr_fail), 0)::numeric', ''))) <> length('coalesce(sum(b.scr_fail), 0)::numeric') then
                raise exception '%: scr_fail sum anchor not found exactly once', v_sig;
            end if;
            v_new := replace(v_new, 'coalesce(sum(b.scr_fail), 0)::numeric',
                'coalesce(sum(b.scr_fail), 0)::numeric, coalesce(sum(b.fit_faced), 0)::numeric, coalesce(sum(b.fit_thru), 0)::numeric, coalesce(sum(b.drfd), 0)::numeric, coalesce(sum(b.drfd_zone), 0)::numeric');
        elsif v_sig like '%_legacy(%' then
            if (length(v_def) - length(replace(v_def, 'AS scr_fail', ''))) <> length('AS scr_fail') then
                raise exception '%: AS scr_fail anchor not found exactly once', v_sig;
            end if;
            v_new := replace(v_new, 'AS scr_fail',
                E'AS scr_fail,\n        coalesce(sum((elem->>''fitFaced'')::numeric), 0)    AS fit_faced,\n        coalesce(sum((elem->>''fitThru'')::numeric), 0)     AS fit_thru,\n        coalesce(sum((elem->>''drfd'')::numeric), 0)        AS drfd,\n        coalesce(sum((elem->>''drfdZone'')::numeric), 0)    AS drfd_zone');
        end if;   -- 바깥 함수는 select * 로 아래 두 개를 그대로 넘기므로 결과 열 선언만 바뀐다
        execute 'drop function ' || v_sig;
        execute v_new;
    end loop;
end
$mig$;

-- 권한: 바깥·_legacy 는 원래대로(공개 실행 — 바깥은 함수 안에서 can_read_room_games 로 접근을 확인), _box 는 서비스 키만
revoke all on function public.get_player_season_stats_league_box(uuid, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.get_player_season_stats_league_box(uuid, uuid[], boolean) to service_role;
grant execute on function public.get_player_season_stats_league(uuid, uuid[], boolean) to public, anon, authenticated, service_role;
grant execute on function public.get_player_season_stats_league_legacy(uuid, uuid[], boolean) to public, anon, authenticated, service_role;
