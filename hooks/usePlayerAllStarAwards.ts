import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import type { PlayerAwardEntry } from '../types/player';

/**
 * [2026-09-09] 올스타 선정 배지 — MVP/DPOY/올-NBA/올-디펜시브(MultiPlayerDetailView.tsx의
 * teamsWithAwards)와 달리 올스타는 client-side로 재계산할 수 없다(투표/선발 알고리즘 전체를
 * 매번 다시 돌려야 하고, 과거 시즌 로스터·투표 데이터도 남아있지 않음) — 대신 서버가 로스터
 * 확정 시점에 이미 저장해둔 league_player_awards(award_type='ALL_STAR', server/src/
 * postAllStarVoteNews.ts)를 그대로 읽는다. 시즌 라벨 문자열도 insert 시점에 함께 저장돼
 * 있어(season_number만으로는 과거 연도를 역산할 수 없음 — migrations/
 * add_season_label_to_league_player_awards.sql 참고) 별도 조회 없이 바로 쓸 수 있다.
 *
 * usePlayerCareerHistory.ts와 동일한 이유로 staleTime: Infinity — 한 번 기록된 올스타
 * 선정 이력은 절대 바뀌지 않는다(새 시즌마다 행이 추가되기만 함).
 */
export function usePlayerAllStarAwards(roomId: string | undefined, playerId: string | undefined, enabled: boolean) {
    return useQuery({
        queryKey: ['playerAllStarAwards', roomId, playerId],
        enabled: enabled && !!roomId && !!playerId,
        staleTime: Infinity,
        gcTime: Infinity,
        queryFn: async (): Promise<PlayerAwardEntry[]> => {
            const { data, error } = await supabase
                .from('league_player_awards')
                .select('season, team_slug')
                .eq('room_id', roomId!).eq('player_id', playerId!).eq('award_type', 'ALL_STAR');
            if (error) throw error;
            return (data ?? [])
                .filter((r): r is { season: string; team_slug: string } => !!r.season)
                .map(r => ({ type: 'ALL_STAR' as const, season: r.season, teamId: r.team_slug }));
        },
    });
}
