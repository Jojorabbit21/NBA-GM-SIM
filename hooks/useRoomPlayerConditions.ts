import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';

// 멀티 리그 선수 현재 체력 — room_player_state.condition (docs/plan/multiplayer-fatigue.md 5장, D4 UI).
// 서버가 경기 종료 시(simRunner §6.5)와 가상 자정마다(scheduler runFatigueMidnights) 갱신하므로
// 로스터 identity 쿼리(leagueRawSeasonInjury, staleTime Infinity)에 얹지 않고 별도로 짧게 폴링한다.
// 행이 없거나 condition이 NULL이면 100(완전 휴식)으로 본다(서버 엔진과 같은 규칙).
// pregame: 서버가 마지막 경기를 시작할 때의 체력(room_player_state.pregame_condition) — 그 경기 결과가
// 공개되기 전까지 화면이 이 값을 보여준다(useMultiPlayerConditions). 기록 전 행은 null.

const REFETCH_INTERVAL_MS = 60_000;
const CHUNK = 200;   // .in() 필터가 URL에 실리므로 로스터 전체(수백 명)를 나눠서 조회

export interface RoomPlayerCondition {
    condition: number;
    pregame: number | null;
}
export type RoomPlayerConditionMap = Map<string, RoomPlayerCondition>;

async function fetchConditions(roomId: string, playerIds: string[]): Promise<RoomPlayerConditionMap> {
    const map: RoomPlayerConditionMap = new Map(playerIds.map(id => [id, { condition: 100, pregame: null }]));
    for (let i = 0; i < playerIds.length; i += CHUNK) {
        const { data, error } = await supabase
            .from('room_player_state')
            .select('player_id, condition, pregame_condition')
            .eq('room_id', roomId)
            .in('player_id', playerIds.slice(i, i + CHUNK));
        if (error) throw error;
        for (const row of (data ?? []) as { player_id: string; condition: number | string | null; pregame_condition: number | string | null }[]) {
            map.set(row.player_id, {
                condition: row.condition == null ? 100 : Number(row.condition),
                pregame: row.pregame_condition == null ? null : Number(row.pregame_condition),
            });
        }
    }
    return map;
}

export function useRoomPlayerConditions(roomId: string | null | undefined, playerIds: string[]) {
    return useQuery({
        queryKey: ['roomPlayerConditions', roomId ?? null, playerIds.join(',')] as const,
        queryFn: () => fetchConditions(roomId!, playerIds),
        enabled: !!roomId && playerIds.length > 0,
        staleTime: REFETCH_INTERVAL_MS / 2,
        refetchInterval: REFETCH_INTERVAL_MS,
        refetchOnWindowFocus: true,
    });
}
