
import { useQuery } from '@tanstack/react-query';
import { listPlayerTransactionHistory, type PlayerTransactionEntry } from '../services/multi/playerHistoryService';
import type { LeagueTeamRow } from '../services/multi/roomQueries';

/**
 * 선수 프로필(멀티) "선수 이동 내역" 위젯용 — usePlayerShotEvents.ts와 동일한 얇은 래퍼
 * 패턴. leagueTeams는 queryKey에 넣지 않는다(팀 슬러그/약어는 리그 생성 후 안 바뀌는
 * 값이라 매핑용 참조로만 쓰고 캐시 무효화 기준으로 삼을 필요가 없음).
 *
 * [2026-09-04] staleTime: 0 명시 — 전역 QueryClient 기본값(index.tsx, staleTime: Infinity)을
 * 그대로 두면, FA서명/방출(league_transactions에 새로 INSERT)이 이 화면 밖(FA/로스터 화면)
 * 에서 일어난 뒤 프로필로 돌아와도 캐시가 갱신되지 않는다 — MultiFrontOfficeView.tsx의
 * 트레이드 히스토리는 탭 진입 시 명시적 refetch()로 이 문제를 우회하지만, 여기는 무거운
 * 조회가 아니라서(room+player로 필터된 로그 몇 줄) 그냥 마운트마다(=이 프로필 화면에
 * 들어올 때마다) 다시 fetch하는 쪽이 더 간단하고 확실하다.
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
        staleTime: 0,
    });
}
