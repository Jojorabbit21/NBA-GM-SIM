
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import {
    parseAllstarVotePayload, parseAllstarRosterPayload,
    type AllstarVoteUpdateDetail, type AllstarRosterResult,
} from '../services/multi/leagueEventPayload';

// league_allstar_votes(server/src/postAllStarVoteNews.ts가 매일 1회 upsert)의 최신 1건을
// 읽는다. 클라이언트에서 runAllStarVote()를 직접 재계산하지 않는 이유: 유저마다 조회 시점/
// 로스터 스냅샷이 달라지면 같은 리그인데 서로 다른 득표수를 보게 되는 불일치가 생길 수 있어,
// 서버가 하루 1회 계산해 저장한 값을 모든 유저가 동일하게 읽도록 설계했다
// (docs/history/dev-log.md 2026-09-08 항목 참고).

export interface AllStarVoteSnapshot {
    simDate: string;
    voteProgress: number;
    detail: AllstarVoteUpdateDetail;
    /** 투표 마감일(sim_date === allStarVoteEnd) 스냅샷에만 존재 — 그 전엔 null. */
    roster: AllstarRosterResult | null;
}

export function useAllStarVotes(roomId: string | undefined | null, seasonNumber: number | undefined | null) {
    return useQuery({
        queryKey: ['allStarVotes', roomId, seasonNumber],
        enabled: !!roomId && seasonNumber != null,
        queryFn: async (): Promise<AllStarVoteSnapshot | null> => {
            const { data, error } = await supabase
                .from('league_allstar_votes')
                .select('sim_date, vote_progress, payload, roster')
                .eq('room_id', roomId!).eq('season_number', seasonNumber!)
                .order('sim_date', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (error) throw error;
            if (!data) return null;

            const detail = parseAllstarVotePayload(data.payload);
            if (!detail) return null;

            return {
                simDate: data.sim_date, voteProgress: Number(data.vote_progress), detail,
                roster: parseAllstarRosterPayload(data.roster),
            };
        },
    });
}
