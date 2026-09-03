import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import type { PlayerInjuryStateRow } from '../services/multi/activeInjuryStatus';

// room_player_state(부상/출장정지 현재상태+이력)만 가볍게 조회하는 전용 훅 — 트레이드 화면처럼
// meta_players+game_pbp를 통째로 내려받는 useLeagueRawStats를 쓰기엔 과한 곳(임의의 player_id
// 집합, 로스터 밖 선수 포함 가능)에서 usePlayerSeasonStatsBatch와 같은 패턴으로 사용.
// buildActiveInjurySeverityMap(services/multi/activeInjuryStatus.ts)에 결과를 그대로 넘기면 됨.
export function usePlayerInjuryStatus(roomId: string | undefined, playerIds: string[]) {
    // 배열 순서가 바뀌어도 동일 queryKey를 쓰도록 정렬 — 같은 선수 집합이면 캐시 재사용.
    const sortedIds = [...new Set(playerIds)].sort();

    return useQuery({
        queryKey: ['playerInjuryStatus', roomId, sortedIds.join(',')],
        enabled: !!roomId && sortedIds.length > 0,
        queryFn: async (): Promise<PlayerInjuryStateRow[]> => {
            const { data, error } = await supabase
                .from('room_player_state')
                .select('player_id, injury_history, health, return_date, season_number')
                .eq('room_id', roomId!)
                .in('player_id', sortedIds);
            if (error) throw error;
            return (data ?? []) as unknown as PlayerInjuryStateRow[];
        },
    });
}
