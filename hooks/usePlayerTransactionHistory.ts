
import { useQuery } from '@tanstack/react-query';
import { listPlayerTransactionHistory, type PlayerTransactionEntry } from '../services/multi/playerHistoryService';
import type { LeagueTeamRow } from '../services/multi/roomQueries';

/**
 * 선수 프로필(멀티) "선수 이동 내역" 위젯용 — usePlayerShotEvents.ts와 동일한 얇은 래퍼
 * 패턴. leagueTeams는 queryKey에 넣지 않는다(팀 슬러그/약어는 리그 생성 후 안 바뀌는
 * 값이라 매핑용 참조로만 쓰고 캐시 무효화 기준으로 삼을 필요가 없음).
 */
export function usePlayerTransactionHistory(
    roomId: string | undefined,
    playerId: string | undefined,
    leagueTeams: LeagueTeamRow[],
) {
    return useQuery<PlayerTransactionEntry[]>({
        queryKey: ['playerTransactionHistory', roomId, playerId],
        enabled: !!roomId && !!playerId,
        queryFn: () => listPlayerTransactionHistory(roomId!, playerId!, leagueTeams),
    });
}
