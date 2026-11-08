/**
 * allStarRewards.ts — 올스타 BP 보상 상수·키(순수). 계획: docs/plan/points-system-plan.md "올스타 보상" (2026-11-08 확정)
 *
 * 전부 "유저 팀 소속 선수가 ~에 뽑혔다/이겼다" 형태. 선수당 지급(한 팀이 3명 배출하면 3배), 팀당 상한 없음.
 * 올스타전 승리 컨퍼런스 보상은 두지 않는다(유저가 관여할 수 없는 복권성 — 사용자 결정).
 */
export const ALLSTAR_STARTER_BONUS = 50;
export const ALLSTAR_RESERVE_BONUS = 30;
export const RISING_STARS_BONUS = 20;
export const ALLSTAR_GAME_MVP_BONUS = 100;
export const RISING_STARS_MVP_BONUS = 50;
export const CONTEST_WIN_BONUS = 60;
export const CONTEST_ENTRY_BONUS = 10;

export type AllStarEventKind =
    | 'starter' | 'reserve' | 'rising'
    | 'asg_mvp' | 'rs_mvp'
    | 'three_entry' | 'three_win'
    | 'dunk_entry' | 'dunk_win';

export const ALLSTAR_BONUS: Record<AllStarEventKind, number> = {
    starter:     ALLSTAR_STARTER_BONUS,
    reserve:     ALLSTAR_RESERVE_BONUS,
    rising:      RISING_STARS_BONUS,
    asg_mvp:     ALLSTAR_GAME_MVP_BONUS,
    rs_mvp:      RISING_STARS_MVP_BONUS,
    three_entry: CONTEST_ENTRY_BONUS,
    three_win:   CONTEST_WIN_BONUS,
    dunk_entry:  CONTEST_ENTRY_BONUS,
    dunk_win:    CONTEST_WIN_BONUS,
};

/** 원장 멱등 키 — 사건·선수·유저당 1행. */
export function allStarKey(leagueId: string, seasonNumber: number, kind: AllStarEventKind, playerId: string, userId: string): string {
    return `allstar:${leagueId}:${seasonNumber}:${kind}:${playerId}:${userId}`;
}
