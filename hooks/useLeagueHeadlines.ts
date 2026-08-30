
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';

// 멀티플레이어 "리그 소식"(League Headlines) — 대량득점차/연승/개인 활약/유저간
// 트레이드처럼 "주목할 만한" 사건만 league_events에 이미 걸러서 insert돼 있으므로
// (server/src/simRunner.ts, respond_trade_offer RPC), 여기서는 최근 N개를 그대로
// 가져오기만 하면 된다 — ZenGM의 processEvents() 같은 읽기 시점 재필터링 불필요.

export type LeagueEventType = 'game_result' | 'player_feat' | 'player_streak' | 'win_streak' | 'trade';

export interface LeagueEvent {
    id: string;
    type: LeagueEventType;
    teamIds: string[];
    playerIds: string[];
    score: number;
    headline: string;
    createdAt: string;
    /** 조회 시점에 계산 — team_ids에 내 팀이 포함돼 있으면 true(강조 표시용). */
    involvesMyTeam: boolean;
}

const DEFAULT_LIMIT = 8;

export function useLeagueHeadlines(roomId: string | undefined, myTeamSlug: string | null, limit: number = DEFAULT_LIMIT) {
    return useQuery({
        queryKey: ['leagueHeadlines', roomId, limit],
        enabled: !!roomId,
        queryFn: async (): Promise<LeagueEvent[]> => {
            const { data, error } = await supabase
                .from('league_events')
                .select('id, type, team_ids, player_ids, score, payload, created_at')
                .eq('room_id', roomId!)
                .order('created_at', { ascending: false })
                .limit(limit);
            if (error) throw error;

            return (data ?? []).map((row: any) => ({
                id: row.id,
                type: row.type,
                teamIds: row.team_ids ?? [],
                playerIds: row.player_ids ?? [],
                score: row.score ?? 0,
                headline: row.payload?.headline ?? '',
                createdAt: row.created_at,
                involvesMyTeam: !!myTeamSlug && (row.team_ids ?? []).includes(myTeamSlug),
            }));
        },
    });
}
