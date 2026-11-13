/**
 * allStarSettings.ts — 세션 설정 "올스타" 탭(메인리그) 공용 판정. 클라이언트 전용.
 *
 * [2026-11-13] 같은 규칙의 서버 쪽 짝:
 *  - 스위치 연쇄(올스타 끄면 하위 행사도 끔) — server/src/scheduler.ts allStarFlags()
 *  - 잠금(그 시즌 팬 투표 시작일부터) — DB 트리거 trg_leagues_allstar_lock
 *  - 키데이트 검증 — DB RPC update_league_allstar_settings (migrations/add_league_allstar_settings.sql)
 * 규칙을 바꾸면 세 곳을 같이 고칠 것.
 */
import { getAllStarKeyDates } from './allStarSelection';
import { resolveSeasonCalendar, DEFAULT_ALL_STAR_OFFSETS, type AllStarOffsets } from './seasonCalendar';
import { addDaysToDateStr, daysBetweenDateStr } from './leagueTimeline';

interface LeagueAllStarFields {
    type?: string | null;
    status?: string | null;
    virtual_season_year?: number | null;
    season_calendar?: unknown;
    allstar_enabled?: boolean | null;
    rising_stars_enabled?: boolean | null;
    three_point_contest_enabled?: boolean | null;
    dunk_contest_enabled?: boolean | null;
}

export interface AllStarFlags {
    allStar: boolean;
    risingStars: boolean;
    threePoint: boolean;
    dunk: boolean;
}

/** 리그의 실효 스위치 — 메인리그가 아니거나 올스타가 꺼지면 하위 행사도 전부 false. 칼럼이 없던 리그는 켜짐. */
export function resolveAllStarFlags(league: LeagueAllStarFields | null | undefined): AllStarFlags {
    const allStar = !!league && league.type === 'main_league' && league.allstar_enabled !== false;
    return {
        allStar,
        risingStars: allStar && league?.rising_stars_enabled !== false,
        threePoint:  allStar && league?.three_point_contest_enabled !== false,
        dunk:        allStar && league?.dunk_contest_enabled !== false,
    };
}

const seasonYear = (league: LeagueAllStarFields) => league.virtual_season_year ?? new Date().getFullYear();

/** 그 시즌 팬 투표가 시작돼 올스타 설정이 잠겼는가 — 진행 중/종료 리그에서 가상 오늘 ≥ 투표 시작일. */
export function isAllStarSettingsLocked(league: LeagueAllStarFields, currentVirtualDate: string | null): boolean {
    if (league.type !== 'main_league') return false;
    if (league.status !== 'in_progress' && league.status !== 'finished') return false;
    if (!currentVirtualDate) return false;
    return currentVirtualDate >= getAllStarKeyDates(seasonYear(league), league.season_calendar).allStarVoteStart;
}

/** 저장된 오프셋(없으면 기본값). */
export function currentAllStarOffsets(league: LeagueAllStarFields): AllStarOffsets {
    return resolveSeasonCalendar(seasonYear(league), league.season_calendar).allStarOffsets ?? DEFAULT_ALL_STAR_OFFSETS;
}

/** 브레이크 첫날·마지막 날·정규시즌 개막일 — 오프셋 ↔ 날짜 변환과 입력 범위용. */
export function allStarBreakBounds(league: LeagueAllStarFields): { breakStart: string; breakEnd: string; regularStart: string } {
    const cal = resolveSeasonCalendar(seasonYear(league), league.season_calendar);
    return { breakStart: cal.allStarStart, breakEnd: cal.allStarEnd, regularStart: cal.regularStart };
}

export const offsetToDate = (breakStart: string, offset: number) => addDaysToDateStr(breakStart, offset);
export const dateToOffset = (breakStart: string, date: string) => daysBetweenDateStr(breakStart, date);

/**
 * 키데이트 검증(RPC update_league_allstar_settings와 같은 규칙) — 화면에 띄울 문구 목록, 비면 저장 가능.
 * currentVirtualDate를 주면(진행 중 리그) 투표 시작일이 가상 오늘보다 뒤여야 한다(DB 트리거 allstar_vote_start_past).
 */
export function validateAllStarOffsets(
    o: AllStarOffsets,
    bounds: { breakStart: string; breakEnd: string; regularStart: string },
    currentVirtualDate: string | null,
): string[] {
    const errors: string[] = [];
    const span = daysBetweenDateStr(bounds.breakStart, bounds.breakEnd);
    if (!(o.voteStart < o.voteEnd && o.voteEnd <= -1)) errors.push('투표 마감일은 시작일보다 뒤, 브레이크보다 앞이어야 합니다.');
    else if (o.voteEnd - o.voteStart < 4) errors.push('투표 기간은 4일 이상이어야 합니다.');
    if (offsetToDate(bounds.breakStart, o.voteStart) < bounds.regularStart) errors.push('투표 시작일이 정규시즌 개막보다 앞섭니다.');
    if (Math.min(o.rising, o.contests, o.main) < 1 || Math.max(o.rising, o.contests, o.main) > span - 1) {
        errors.push('행사 날짜는 브레이크 안이어야 합니다.');
    }
    if (o.rising === o.contests || o.rising === o.main || o.contests === o.main) {
        errors.push('라이징스타·컨테스트·본경기는 서로 다른 날이어야 합니다.');
    }
    if (currentVirtualDate && offsetToDate(bounds.breakStart, o.voteStart) <= currentVirtualDate) {
        errors.push('투표 시작일은 오늘(가상 날짜) 이후여야 합니다.');
    }
    return errors;
}
