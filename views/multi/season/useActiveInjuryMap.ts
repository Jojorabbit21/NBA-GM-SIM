// useActiveInjuryMap.ts — "지금 이 순간 활성인" 부상/출장정지 맵(playerId → ActiveInjuryStatus). [2026-10-13]
// 홈 화면 4개 위젯(리그 리더·트랜잭션·내 로스터 요약·내 팀 부상자)이 같은 블록
// (allRosterIds → useLeagueRawStats(playerInjuryRows, includePbp:false) → 가상 오늘 날짜 → buildActiveInjurySeverityMap)
// 을 각자 복붙하던 것(docs/plan/ui-audit/06-home-standings-schedule.md H33)을 한 훅으로.
//
// 날짜 기준은 반드시 가상 캘린더 날짜(findCurrentVirtualDate)여야 한다 — rooms.sim_date(실제 KST 날짜)를 그대로
// 쓰면 메인리그에서 몇 달 뒤 복귀일까지 계속 "활성"으로 남는 버그가 있었다(2026-09-05 수정분 그대로 유지).
import { useCallback, useMemo } from 'react';
import { useLeagueContext } from '../league/LeagueLayout';
import { useSeasonContext } from './seasonContext';
import { useLeagueRawStats, type LeagueRawStatsData } from '../../../hooks/useLeagueRawStats';
import { useServerClockBucket } from '../../../utils/serverClock';
import { findCurrentVirtualDate } from './multiScheduleUtils';
import { buildActiveInjurySeverityMap } from '../../../services/multi/activeInjuryStatus';

interface Options {
    /** 지정하면 이 선수들의 부상 행만 판정(내 팀 부상자 위젯). 미지정 시 리그 전체. */
    playerIds?: Set<string>;
}

export function useActiveInjuryMap(opts: Options = {}) {
    const { league, leagueTeams, room } = useLeagueContext();
    const { schedule, currentSimDate } = useSeasonContext();
    // 경기 공개 딜레이/가상 오늘 날짜 판정에만 쓰여 초 단위 정밀도가 필요 없다 — 15초 버킷으로 리렌더 절감.
    const serverNow = useServerClockBucket();
    const { playerIds } = opts;

    // 리그 전체 로스터 id — useLeagueRawStats의 queryKey라 다른 홈 위젯/로스터/리더보드 화면과 캐시를 공유한다.
    const allRosterIds = useMemo(() => [...new Set(leagueTeams.flatMap(t => t.roster ?? []))], [leagueTeams]);
    // playerInjuryRows만 필요하고 game_pbp는 전혀 안 쓰므로 includePbp:false(빼먹으면 room 전체 game_pbp 수 MB를 또 받는다).
    const selectInjuryRows = useCallback(
        (raw: LeagueRawStatsData) => playerIds ? raw.playerInjuryRows.filter(r => playerIds.has(r.player_id)) : raw.playerInjuryRows,
        [playerIds],
    );
    const { data: injuryRows = [] } = useLeagueRawStats(room?.id, allRosterIds, selectInjuryRows, { includePbp: false });

    const isMainLeague = league?.type === 'main_league';
    const todaySimDate = useMemo(() => {
        if (!isMainLeague) return currentSimDate;
        return findCurrentVirtualDate(schedule, league?.sim_real_start_at ?? null, league?.games_per_real_day ?? 5, serverNow) ?? currentSimDate;
    }, [isMainLeague, schedule, league?.sim_real_start_at, league?.games_per_real_day, serverNow, currentSimDate]);

    const teamIdByPlayer = useMemo(() => {
        const m = new Map<string, string>();
        for (const t of leagueTeams) for (const id of (t.roster ?? [])) m.set(id, t.team_slug);
        return m;
    }, [leagueTeams]);

    const activeInjuryByPlayer = useMemo(
        () => buildActiveInjurySeverityMap(injuryRows, todaySimDate, room?.season_number, {
            schedule, getTeamId: id => teamIdByPlayer.get(id),
        }),
        [injuryRows, todaySimDate, room?.season_number, schedule, teamIdByPlayer],
    );

    return { activeInjuryByPlayer, todaySimDate, teamIdByPlayer, allRosterIds };
}
