// useActiveInjuryMap.ts — "지금 이 순간 활성인" 부상/출장정지 맵(playerId → ActiveInjuryStatus). [2026-10-13]
// 홈 화면 4개 위젯(리그 리더·트랜잭션·내 로스터 요약·내 팀 부상자)이 같은 블록
// (allRosterIds → useLeagueRawStats(playerInjuryRows, includePbp:false) → 가상 오늘 날짜 → buildActiveInjurySeverityMap)
// 을 각자 복붙하던 것(docs/plan/ui-audit/06-home-standings-schedule.md H33)을 한 훅으로.
//
// 날짜 기준은 반드시 가상 캘린더 날짜(findCurrentVirtualDate)여야 한다 — rooms.sim_date(실제 KST 날짜)를 그대로
// 쓰면 메인리그에서 몇 달 뒤 복귀일까지 계속 "활성"으로 남는 버그가 있었다(2026-09-05 수정분 그대로 유지).
import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLeagueContext } from '../league/LeagueLayout';
import { useSeasonContext } from './seasonContext';
import { leagueRawSeasonInjuryQuery } from '../../../hooks/useLeagueRawStats';
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

    // 리그 전체 로스터 id — 호출부(홈 위젯)가 useLeagueRawStats/시즌 스탯 조회 키로 그대로 쓴다.
    const allRosterIds = useMemo(() => [...new Set(leagueTeams.flatMap(t => t.roster ?? []))], [leagueTeams]);
    // [2026-11-08] 방 단위 room_player_state 캐시(leagueRawSeasonInjury — useLeagueRawStats·부트스트랩 게이트와 같은 키)를 직접 읽는다.
    // 전엔 useLeagueRawStats(allRosterIds)를 거쳐 "현재 로스터 선수" 행만 남았기 때문에, 웨이버·방출로 로스터를 떠난 선수는
    // 부상 중이어도 홈 최근 거래 호버카드 등에서 배지가 사라졌다. 조회 자체는 원래 방 전체라 추가 요청은 없다.
    const selectInjuryRows = useCallback(
        (d: { playerInjuryRows: any[] }) => playerIds ? d.playerInjuryRows.filter(r => playerIds.has(r.player_id)) : d.playerInjuryRows,
        [playerIds],
    );
    const { data: injuryRows = [] } = useQuery({
        ...leagueRawSeasonInjuryQuery(room?.id),
        enabled: !!room?.id && allRosterIds.length > 0,
        select: selectInjuryRows,
    });

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

    // [2026-11-07] nowMs — 공개 전 경기에서 생긴 부상·출장정지 숨김(스포일러 방지). 15초 버킷이 이미 있어 그대로 쓴다.
    const activeInjuryByPlayer = useMemo(
        () => buildActiveInjurySeverityMap(injuryRows, todaySimDate, room?.season_number, {
            schedule, getTeamId: id => teamIdByPlayer.get(id), nowMs: serverNow,
        }),
        [injuryRows, todaySimDate, room?.season_number, schedule, teamIdByPlayer, serverNow],
    );

    return { activeInjuryByPlayer, todaySimDate, teamIdByPlayer, allRosterIds };
}
