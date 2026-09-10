-- ============================================================
-- 멀티플레이어 올스타 팬 투표 — 서버 일일 집계 저장 테이블
--
-- 배경: utils/allStarSelection.ts(server/src/shared/multi/allStarSelection.ts 미러)의
-- runAllStarVote()는 이미 구현돼 있었지만, 지금까지는 서버 자동 파이프라인이 없어 수동
-- 테스트 스크립트로만 실행됐다(league_events에 1회성 테스트 이벤트만 존재). 이제 서버가
-- 가상 캘린더 날짜(current_virtual_date(room_id)) 기준 하루 1회 득표를 계산해 이 테이블에
-- 저장하고, 클라이언트 "올스타" 페이지가 이 값을 읽어 모든 유저에게 동일한 득표수를
-- 보여준다(클라이언트 재계산 방식은 조회 시점/로스터 스냅샷 차이로 유저 간 결과가
-- 불일치할 수 있어 채택하지 않음).
--
-- 이 프로젝트의 다른 room 관련 테이블(games/game_pbp/league_player_awards 등)과 동일하게
-- "테이블 하나 + room_id 컬럼" 패턴을 따른다(room마다 테이블을 새로 만드는 건 안티패턴).
-- (room_id, season_number, sim_date) 유니크 제약 + upsert ignoreDuplicates로, 30초 폴링
-- 스케줄러가 같은 가상 날짜에 여러 번 돌아도 중복 계산/삽입되지 않는다(멱등성).
--
-- ⚠️ sim_date 컬럼은 rooms.sim_date(실제 KST 방송 예정일, text)가 아니라
-- current_virtual_date(room_id) RPC의 반환값(가상 NBA 캘린더 날짜)을 저장한다.
-- 두 값은 완전히 다른 축이며 혼동 시 올스타 투표가 영원히 트리거되지 않는 리그레션이 남.
-- (docs/history/dev-log.md 2026-09-08 항목 참조)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.league_allstar_votes (
    id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id       uuid        NOT NULL REFERENCES public.rooms(id)   ON DELETE CASCADE,
    league_id     uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
    season_number integer     NOT NULL,

    -- current_virtual_date(room_id) 결과 — 인게임 가상 캘린더 날짜.
    sim_date      date        NOT NULL,
    -- 0~1, 투표 시작 대비 경과 비율 (runAllStarVote의 voteProgress 그대로).
    vote_progress numeric     NOT NULL,
    -- AllstarVoteUpdateDetail(services/multi/leagueEventPayload.ts)과 동일 형태:
    -- { roundLabel, voteProgress, east:{guards,frontcourt}, west:{guards,frontcourt} }
    payload       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    -- [2026-09-08] 투표 마감일(sim_date === getAllStarKeyDates().allStarVoteEnd)에만 채워지는
    -- 최종 명단(runAllStarSelection 결과) — AllstarRosterResult(leagueEventPayload.ts) 형태:
    -- { east:{starters,reserves}, west:{starters,reserves} }. 그 외 날짜는 NULL.
    roster        jsonb,

    created_at    timestamptz NOT NULL DEFAULT now(),

    UNIQUE (room_id, season_number, sim_date)
);

CREATE INDEX IF NOT EXISTS lav_room_date_idx
    ON public.league_allstar_votes (room_id, season_number, sim_date DESC);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.league_allstar_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lav_member_select" ON public.league_allstar_votes
    FOR SELECT USING (room_id IN (SELECT my_room_ids()));

CREATE POLICY "lav_service_write" ON public.league_allstar_votes
    FOR ALL USING (auth.role() = 'service_role')
          WITH CHECK (auth.role() = 'service_role');
