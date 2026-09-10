
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import {
    parseAllstarThreePointContestPayload, parseAllstarDunkContestPayload, parseAllstarThreePointContestResultPayload,
    parseAllstarDunkContestResultPayload,
    type AllstarThreePointContestDetail, type AllstarDunkContestDetail, type AllstarThreePointContestResultDetail,
    type AllstarDunkContestResultDetail,
} from '../services/multi/leagueEventPayload';

// [2026-09-09] "올스타 화면에 탭 그룹을 추가해(올스타/라이징스타/3점 컨테스트/덩크 컨테스트)"
// 요청 — 3점/덩크 컨테스트는 league_allstar_votes가 아니라 league_events(allstar_three_point_contest/
// allstar_dunk_contest, server/src/postAllStarVoteNews.ts가 allStarStart에 1회 게시)에만 저장돼
// 있어 useAllStarVotes()로는 못 읽는다 — 이 둘을 위한 전용 조회 훅. useAllStarVotes.ts와 동일하게
// "가장 최근 sim_date 1건"만 읽어(하루 1회, 같은 sim_date로 멱등 upsert가 아니라 insert-once라
// 사실상 최초 1건이 곧 최신 1건) 모든 유저가 동일한 참가자 명단을 보게 한다.
export interface AllStarSideEventsSnapshot {
    threePointContest: AllstarThreePointContestDetail | null;
    dunkContest: AllstarDunkContestDetail | null;
    /** [2026-09-09] 참가자 발표(threePointContest)와 별개로, 실제 슈팅 시뮬레이션 완료 후에만
     *  존재(server/src/postThreePointContest.ts). 대회 실행일 전에는 항상 null. */
    threePointContestResult: AllstarThreePointContestResultDetail | null;
    /** [2026-09-09] 참가자 발표(dunkContest)와 별개로, 실제 채점 시뮬레이션 완료 후에만
     *  존재(server/src/postDunkContest.ts). 대회 실행일 전에는 항상 null. */
    dunkContestResult: AllstarDunkContestResultDetail | null;
}

export function useAllStarSideEvents(roomId: string | undefined | null) {
    return useQuery({
        queryKey: ['allStarSideEvents', roomId],
        enabled: !!roomId,
        queryFn: async (): Promise<AllStarSideEventsSnapshot> => {
            const [threePtRes, dunkRes, threePtResultRes, dunkResultRes] = await Promise.all([
                supabase
                    .from('league_events')
                    .select('payload')
                    .eq('room_id', roomId!).eq('type', 'allstar_three_point_contest')
                    .order('sim_date', { ascending: false })
                    .limit(1)
                    .maybeSingle(),
                supabase
                    .from('league_events')
                    .select('payload')
                    .eq('room_id', roomId!).eq('type', 'allstar_dunk_contest')
                    .order('sim_date', { ascending: false })
                    .limit(1)
                    .maybeSingle(),
                supabase
                    .from('league_events')
                    .select('payload')
                    .eq('room_id', roomId!).eq('type', 'allstar_three_point_contest_result')
                    .order('sim_date', { ascending: false })
                    .limit(1)
                    .maybeSingle(),
                supabase
                    .from('league_events')
                    .select('payload')
                    .eq('room_id', roomId!).eq('type', 'allstar_dunk_contest_result')
                    .order('sim_date', { ascending: false })
                    .limit(1)
                    .maybeSingle(),
            ]);
            if (threePtRes.error) throw threePtRes.error;
            if (dunkRes.error) throw dunkRes.error;
            if (threePtResultRes.error) throw threePtResultRes.error;
            if (dunkResultRes.error) throw dunkResultRes.error;

            return {
                threePointContest: threePtRes.data ? parseAllstarThreePointContestPayload(threePtRes.data.payload) : null,
                dunkContest: dunkRes.data ? parseAllstarDunkContestPayload(dunkRes.data.payload) : null,
                threePointContestResult: threePtResultRes.data ? parseAllstarThreePointContestResultPayload(threePtResultRes.data.payload) : null,
                dunkContestResult: dunkResultRes.data ? parseAllstarDunkContestResultPayload(dunkResultRes.data.payload) : null,
            };
        },
    });
}
