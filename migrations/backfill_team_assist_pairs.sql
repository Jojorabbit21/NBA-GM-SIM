-- [2026-11-21] 어시스트 네트워크(team_assist_pairs) 추정 백필 — 엔진 집계(statsMappers.recordAssistPair·recordPassPairs) 배포 전 경기용.
-- 대상: 아래 :room 의 경기 중 team_assist_pairs 행이 없는 경기(올스타 제외). 지금까지 실행: NBA-L TR(1acb6203-c99f-46e5-8516-aae6c1e5d339), 2026-11-21.
--   (같은 날 ast·pts만 채운 1차본을 실행했다가 passes·fgm 추가로 TR 추정 행을 지우고 이 2차본으로 다시 채움)
--   서버 배포 전에 치른 TR 경기가 더 생기면 같은 쿼리를 다시 실행하면 된다(행 있는 경기는 건너뜀).
--   보관본 엔진 방(S2)에는 사용자 결정으로 하지 않음(S2는 비워 둠).
--
-- 공통 재료: 들어간 슛(shot_events isMake)과 득점 문장(events type='score')은 경기 안 순번이 1:1(TR 47,825 = 47,825 확인).
--   "진짜 패스" = assistPlayerId(= 엔진 secondaryActor)가 있고 슈터와 다르며, 픽앤롤 핸들러 슛이면 득점 문장에 패서 이름이 있을 때(킥아웃)만
--   — 킥아웃 득점 문장은 항상 패서 이름 포함, 핸들러 본인 득점 문장엔 스크리너 이름 없음.
-- ① ast·pts: 경기·패서별 수 = 박스 ast(정확). 후보 가중치 = 엔진 assistOdds(PostUp 이름 있음 .9/없음 .55, PnR_Handler .9/0, Iso .9/.38,
--    CatchShoot·DriveKick .97, Cut·OffBallScreen·PnR_Pop .95, PnR_Roll .9, Handoff .78, Transition .9, Putback .1, 그 외 .6), 최대 잔여법.
--    하네스 60경기 정답 비교: 총수 일치, 경기 단위 쌍 95%, 시즌 쌍 오차 2%.
-- ② fgm: 진짜 패스 + 성공 슛 수(하네스 정답과 100% 일치).
-- ③ passes = fgm + 추정 실패 패스. 실패 슛엔 패서 기록이 없어, 슈터·경기·플레이타입별 "성공 슛 중 진짜 패스 비율"(없으면 방 전체 플레이타입 비율)만큼을
--    그 경기 그 플레이타입 성공 슛의 패서 분포 → 없으면 그 경기 슈터 전체 패서 분포 → 없으면 시즌 같은 팀 패서 분포로 나누고, 슈터·경기별 최대 잔여법.
--    하네스 60경기 정답 비교: 패스 총수 오차 0.3%, 시즌 쌍별 |차이| 합/총수 10%.
-- 추정 행은 is_estimated = true.

-- :room 을 방 id로 바꿔 실행
with gp as (
    select gp.room_id, gp.game_id, gp.shot_events, gp.events, gp.home_box, gp.away_box, g.series_id
    from game_pbp gp
    join games g on g.room_id = gp.room_id and g.game_id = gp.game_id
    where gp.room_id = :room
      and coalesce(g.is_allstar, false) = false
      and not exists (select 1 from team_assist_pairs t where t.room_id = gp.room_id and t.game_id = gp.game_id)
),
allshots as (
    select gp.game_id, e.i, e.v from gp, jsonb_array_elements(gp.shot_events) with ordinality as e(v, i)
),
made as (
    select game_id, v, row_number() over (partition by game_id order by i) as k from allshots where (v->>'isMake')::boolean
),
scores as (
    select gp.game_id, e.v->>'text' as txt, row_number() over (partition by gp.game_id order by e.i) as k
    from gp, jsonb_array_elements(gp.events) with ordinality as e(v, i)
    where e.v->>'type' = 'score'
),
mk as (
    select m.game_id, m.v->>'teamId' as team_id, m.v->>'assistPlayerId' as passer_id, m.v->>'playerId' as receiver_id,
           coalesce((m.v->>'points')::int, 2) as points, m.v->>'playType' as pt,
           (m.v->>'assistPlayerName') is not null and position(m.v->>'assistPlayerName' in coalesce(s.txt, '')) > 0 as named
    from made m left join scores s on s.game_id = m.game_id and s.k = m.k
),
mk2 as (
    select *, (passer_id is not null and passer_id <> receiver_id and not (pt = 'PnR_Handler' and not named)) as real_pass from mk
),
-- ① ast·pts
weighted as (
    select *, case pt
        when 'PostUp' then case when named then .9 else .55 end
        when 'PnR_Handler' then case when named then .9 else 0 end
        when 'Iso' then case when named then .9 else .38 end
        when 'CatchShoot' then .97 when 'DriveKick' then .97
        when 'Cut' then .95 when 'OffBallScreen' then .95 when 'PnR_Pop' then .95
        when 'PnR_Roll' then .9 when 'Handoff' then .78 when 'Transition' then .9 when 'Putback' then .1
        else .6 end::numeric as w
    from mk2 where passer_id is not null and passer_id <> receiver_id
),
cand as (
    select game_id, team_id, passer_id, receiver_id, count(*) as c, sum(w) as w,
           sum(w * points) / nullif(sum(w), 0) as avg_pts_w, avg(points) as avg_pts
    from weighted group by 1, 2, 3, 4
),
box as (
    select gp.game_id, b->>'playerId' as player_id, coalesce((b->>'ast')::int, 0) as ast
    from gp, jsonb_array_elements(gp.home_box || gp.away_box) b
),
quota as (
    select c.*, bx.ast as n,
           sum(c.w) over (partition by c.game_id, c.passer_id) as sw,
           sum(c.c) over (partition by c.game_id, c.passer_id) as sc
    from cand c join box bx on bx.game_id = c.game_id and bx.player_id = c.passer_id
    where bx.ast > 0
),
q2 as (select *, case when sw > 0 then n * w / sw else n * c::numeric / sc end as q from quota),
base as (select *, least(floor(q)::int, c::int) as b from q2),
lr as (
    select *, n - sum(b) over (partition by game_id, passer_id) as left_n,
           row_number() over (partition by game_id, passer_id
                              order by (case when b < c then 0 else 1 end), (q - floor(q)) desc, w desc, receiver_id) as rk
    from base
),
ast_alloc as (
    select game_id, team_id, passer_id, receiver_id,
           b + case when b < c and rk <= left_n then 1 else 0 end as ast,
           coalesce(avg_pts_w, avg_pts) as ppa
    from lr
),
-- ② fgm
fgm_pair as (
    select game_id, team_id, passer_id, receiver_id, count(*) as fgm from mk2 where real_pass group by 1, 2, 3, 4
),
-- ③ 실패 패스 추정
rpt as (
    select game_id, receiver_id, pt, count(*) as m_cnt, count(*) filter (where real_pass) as p_cnt from mk2 group by 1, 2, 3
),
rpt_pass as (select game_id, receiver_id, pt, passer_id, count(*) as c from mk2 where real_pass group by 1, 2, 3, 4),
r_pass as (select game_id, receiver_id, passer_id, count(*) as c from mk2 where real_pass group by 1, 2, 3),
season_r as (select team_id, receiver_id, passer_id, count(*) as c from mk2 where real_pass group by 1, 2, 3),
pt_rate as (select pt, (count(*) filter (where real_pass))::numeric / count(*) as rate from mk2 group by pt),
miss_rows as (
    select row_number() over () as mid, a.game_id, a.v->>'teamId' as team_id, a.v->>'playerId' as receiver_id, a.v->>'playType' as pt,
           coalesce(r.p_cnt, 0) as p_cnt,
           coalesce(case when r.m_cnt > 0 then r.p_cnt::numeric / r.m_cnt end, pr.rate, 0) as rate,
           exists (select 1 from r_pass x where x.game_id = a.game_id and x.receiver_id = a.v->>'playerId') as has_game
    from allshots a
    left join rpt r on r.game_id = a.game_id and r.receiver_id = a.v->>'playerId' and r.pt = a.v->>'playType'
    left join pt_rate pr on pr.pt = a.v->>'playType'
    where not (a.v->>'isMake')::boolean
),
dist as (
    select mr.mid, mr.game_id, mr.team_id, mr.receiver_id, mr.rate, rp.passer_id, rp.c
    from miss_rows mr join rpt_pass rp on rp.game_id = mr.game_id and rp.receiver_id = mr.receiver_id and rp.pt = mr.pt
    where mr.p_cnt > 0 and mr.rate > 0
    union all
    select mr.mid, mr.game_id, mr.team_id, mr.receiver_id, mr.rate, rp.passer_id, rp.c
    from miss_rows mr join r_pass rp on rp.game_id = mr.game_id and rp.receiver_id = mr.receiver_id
    where mr.p_cnt = 0 and mr.rate > 0 and mr.has_game
    union all
    select mr.mid, mr.game_id, mr.team_id, mr.receiver_id, mr.rate, sr.passer_id, sr.c
    from miss_rows mr join season_r sr on sr.team_id = mr.team_id and sr.receiver_id = mr.receiver_id
    where mr.p_cnt = 0 and mr.rate > 0 and not mr.has_game
),
miss_frac as (
    select game_id, team_id, receiver_id, passer_id, sum(rate * c / tot) as f
    from (select *, sum(c) over (partition by mid) as tot from dist) d
    group by 1, 2, 3, 4
),
miss_lr as (
    select *, floor(f)::int as b,
           round(sum(f) over (partition by game_id, receiver_id))::int - sum(floor(f)::int) over (partition by game_id, receiver_id) as left_n,
           row_number() over (partition by game_id, receiver_id order by (f - floor(f)) desc, passer_id) as rk
    from miss_frac
),
miss_alloc as (
    select game_id, team_id, passer_id, receiver_id, b + case when rk <= left_n then 1 else 0 end as misses from miss_lr
),
keys as (
    select game_id, team_id, passer_id, receiver_id from ast_alloc where ast > 0
    union select game_id, team_id, passer_id, receiver_id from fgm_pair
    union select game_id, team_id, passer_id, receiver_id from miss_alloc where misses > 0
)
insert into team_assist_pairs (room_id, game_id, team_id, passer_id, receiver_id, season_number, is_playoff, ast, pts, passes, fgm, is_estimated)
select :room, k.game_id, k.team_id, k.passer_id, k.receiver_id,
       (select r.season_number from rooms r where r.id = :room),
       gp.series_id is not null,
       coalesce(a.ast, 0), coalesce(round(a.ast * a.ppa)::int, 0),
       coalesce(f.fgm, 0) + coalesce(ma.misses, 0), coalesce(f.fgm, 0), true
from keys k
join gp on gp.game_id = k.game_id
left join ast_alloc a on (a.game_id, a.team_id, a.passer_id, a.receiver_id) = (k.game_id, k.team_id, k.passer_id, k.receiver_id)
left join fgm_pair f on (f.game_id, f.team_id, f.passer_id, f.receiver_id) = (k.game_id, k.team_id, k.passer_id, k.receiver_id)
left join miss_alloc ma on (ma.game_id, ma.team_id, ma.passer_id, ma.receiver_id) = (k.game_id, k.team_id, k.passer_id, k.receiver_id);

-- 마무리: 후보 가중치가 0뿐인 예외 배분으로 ast > fgm이 된 행(TR 3행)을 fgm에 맞춰 자름
update team_assist_pairs set pts = case when ast > 0 then round(pts::numeric * fgm / ast)::int else 0 end, ast = fgm
where room_id = :room and is_estimated and ast > fgm;

-- 롤백(추정 행만): delete from team_assist_pairs where room_id = :room and is_estimated;
