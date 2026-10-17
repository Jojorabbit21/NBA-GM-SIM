import { useMemo } from 'react';
import { useLeagueContext } from '../league/LeagueLayout';
import { useSeasonContext } from './seasonContext';
import { useRoomPlayerConditions } from '../../../hooks/useRoomPlayerConditions';
import { useServerClockBucket } from '../../../utils/serverClock';
import { isFinal, resolveRealAt } from './multiGameReveal';

/**
 * 멀티 리그 선수 체력 표시용 맵 (docs/plan/multiplayer-fatigue.md 5장) — 로스터 탭·선수 프로필 공용.
 *
 * 값: number = 표시할 체력(행 없음/NULL은 100), null = 보여줄 값이 없음("경기 중").
 * 서버는 경기를 시뮬하는 즉시(리플레이 공개 전) 경기 후 체력을 기록하므로, 시뮬됐지만 공개 전
 * (played && !isFinal)인 경기의 양 팀 현 로스터 선수는 경기 전 체력(pregame_condition)을 대신 보여준다 —
 * 결과가 공개되는 순간 경기 후 값으로 바뀐다. 경기 전 값이 없는 행(칼럼 도입 전 서버가 쓴 행)만 null.
 * 로스터에 없는 선수(FA)는 해당 없음. 데이터 로딩 전에는 undefined.
 */
export function useMultiPlayerConditions(playerIds: string[]): Map<string, number | null> | undefined {
    const { room, league, leagueTeams } = useLeagueContext();
    const { schedule } = useSeasonContext();
    const serverNow = useServerClockBucket();
    const { data: conditionMap } = useRoomPlayerConditions(room?.id, playerIds);

    const simStart = league?.sim_real_start_at ?? null;
    const gprd = league?.games_per_real_day ?? 5;

    return useMemo(() => {
        if (!conditionMap) return undefined;
        const liveTeams = new Set<string>();
        for (const g of schedule) {
            if (!g.played) continue;
            const scheduledAt = resolveRealAt(g, simStart, gprd) ?? g.scheduledAt;
            const gated = scheduledAt && scheduledAt !== g.scheduledAt ? { ...g, scheduledAt } : g;
            if (!isFinal(gated, serverNow)) { liveTeams.add(g.homeTeamId); liveTeams.add(g.awayTeamId); }
        }
        const hiddenPlayers = new Set<string>();
        for (const lt of leagueTeams) {
            if (liveTeams.has(lt.team_slug)) for (const id of (lt.roster ?? [])) hiddenPlayers.add(id);
        }
        const map = new Map<string, number | null>();
        for (const id of playerIds) {
            const c = conditionMap.get(id);
            map.set(id, hiddenPlayers.has(id) ? (c?.pregame ?? null) : (c?.condition ?? 100));
        }
        return map;
    }, [conditionMap, schedule, simStart, gprd, serverNow, leagueTeams, playerIds]);
}
