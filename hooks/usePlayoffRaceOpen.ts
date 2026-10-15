import { useMemo } from 'react';
import type { Game } from '../types';
import { getRegularSeasonEndDate, isPlayoffRaceOpen } from '../views/multi/season/playoffRaceUtils';

/**
 * "순위 경쟁" 메뉴/화면 노출 여부 — 정규시즌 종료 30일 전(가상 캘린더)부터 시즌 끝까지(브라켓이
 * 생겨도 유지, 2026-10-15 요청). 사이드바/헤더/화면이 같은 기준을 쓰도록 한 곳에 둔다. main_league 전용.
 * 일정 전체 스캔은 schedule 참조가 바뀔 때만 한다(헤더는 매초 리렌더되므로).
 */
export function usePlayoffRaceOpen(
    schedule: Game[],
    currentVirtualDate: string | null,
    leagueType: string | undefined,
): boolean {
    const seasonEnd = useMemo(() => getRegularSeasonEndDate(schedule), [schedule]);
    if (leagueType !== 'main_league') return false;
    return isPlayoffRaceOpen(currentVirtualDate, seasonEnd);
}
