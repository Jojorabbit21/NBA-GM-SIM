import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { leagueRawSeasonInjuryQuery } from './useLeagueRawStats';

// 멀티 리그 선수 현재 체력 — room_player_state.condition (docs/plan/multiplayer-fatigue.md 5장, D4 UI).
// [2026-10-27] 별도 폴링 쿼리를 없애고 방 단위 leagueRawSeasonInjury 캐시(같은 room_player_state 행)에서 읽는다.
// 체력은 경기 시뮬 시점·가상 자정에만 바뀌어 잦은 갱신이 필요 없고, 부트스트랩 게이트로 로스터와 같은 시점에 도착한다.
// 행이 없거나 condition이 NULL이면 100(완전 휴식)으로 본다(서버 엔진과 같은 규칙).
// pregame: 서버가 마지막 경기를 시작할 때의 체력(room_player_state.pregame_condition) — 그 경기 결과가
// 공개되기 전까지 화면이 이 값을 보여준다(useMultiPlayerConditions). 기록 전 행은 null.

export interface RoomPlayerCondition {
    condition: number;
    pregame: number | null;
}
export type RoomPlayerConditionMap = Map<string, RoomPlayerCondition>;

type StateRow = { player_id: string; condition?: number | string | null; pregame_condition?: number | string | null };

export function buildConditionMap(rows: StateRow[], playerIds: string[]): RoomPlayerConditionMap {
    const ids = new Set(playerIds);
    const map: RoomPlayerConditionMap = new Map(playerIds.map(id => [id, { condition: 100, pregame: null }]));
    for (const row of rows) {
        if (!ids.has(row.player_id)) continue;
        map.set(row.player_id, {
            condition: row.condition == null ? 100 : Number(row.condition),
            pregame: row.pregame_condition == null ? null : Number(row.pregame_condition),
        });
    }
    return map;
}

export function useRoomPlayerConditions(roomId: string | null | undefined, playerIds: string[]) {
    const idsKey = playerIds.join(',');
    const select = useCallback(
        (d: { playerInjuryRows: StateRow[] }) => buildConditionMap(d.playerInjuryRows, playerIds),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [idsKey],
    );
    return useQuery({
        ...leagueRawSeasonInjuryQuery(roomId),
        enabled: !!roomId && playerIds.length > 0,
        select,
    });
}
