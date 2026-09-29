-- league_user_history.league_id FK를 NO ACTION → ON DELETE SET NULL로 변경.
--
-- 배경: "Weakly League" 삭제 시도 시 다음 에러로 실패함 —
--   update or delete on table "leagues" violates foreign key constraint
--   "league_user_history_league_id_fkey" on table "league_user_history"
-- league_user_history는 유저 통산 기록(project_multiplayer_career_history.md) 아카이버가
-- 채우는 테이블로, league_name/team_count/wins/losses/playoff_wins/playoff_losses/
-- final_rank/playoff_result/completed_at 등 표시에 필요한 데이터를 전부 이 행 자체에
-- 비정규화해서 저장해 둔다 — league_id는 그저 원본 리그로의 참조 포인터일 뿐, 화면
-- 렌더링에는 필요 없다(참고: rooms/room_members/league_teams 등 다른 자식 테이블은 전부
-- CASCADE라 리그를 지우면 같이 사라지지만, 이건 유저의 영구 통산 기록이라 리그가 삭제돼도
-- 남아있어야 한다). 따라서 CASCADE(기록도 같이 삭제)가 아니라 SET NULL(참조만 끊고 기록은
-- 보존)이 맞는 정책.

ALTER TABLE public.league_user_history
    DROP CONSTRAINT league_user_history_league_id_fkey;

ALTER TABLE public.league_user_history
    ADD CONSTRAINT league_user_history_league_id_fkey
    FOREIGN KEY (league_id) REFERENCES public.leagues(id) ON DELETE SET NULL;
