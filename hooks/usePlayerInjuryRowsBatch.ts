
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import type { PlayerInjuryStateRow } from '../services/multi/activeInjuryStatus';

const INJURY_COLS = 'player_id, injury_history, health, return_date, season_number';

// room_player_state는 이미 player_id 단위로 행이 나뉜 일반 테이블이라(게임PBP JSONB를
// 서버에서 스캔·집계해야 하는 usePlayerSeasonStatsBatch의 시즌 스탯과 달리), 화면에 뜬
// 선수 몇 명(뉴스피드 기사 1건에 보통 1~4명)만 필요한 곳에서 room 전체 로스터를 fetch하는
// useLeagueRawStats 대신 쓰기 위한 가벼운 대안 — RPC 없이 player_id 목록으로 직접 좁혀
// select한다. 반환값은 원본 행 그대로(가공은 buildActiveInjurySeverityMap 호출부 몫 —
// currentSimDate/season_number 비교가 렌더 시점마다 최신이어야 해서 훅 안에 굳이 넣지 않음).
export function usePlayerInjuryRowsBatch(roomId: string | undefined, playerIds: string[]) {
    // 배열 순서가 바뀌어도 동일 queryKey를 쓰도록 정렬 — 같은 선수 집합이면 캐시 재사용.
    const sortedIds = [...new Set(playerIds)].sort();

    return useQuery({
        queryKey: ['playerInjuryRowsBatch', roomId, sortedIds.join(',')],
        enabled: !!roomId && sortedIds.length > 0,
        queryFn: async (): Promise<PlayerInjuryStateRow[]> => {
            const { data, error } = await supabase
                .from('room_player_state')
                .select(INJURY_COLS)
                .eq('room_id', roomId!)
                .in('player_id', sortedIds);
            if (error) throw error;
            return (data ?? []) as PlayerInjuryStateRow[];
        },
    });
}
