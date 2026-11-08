/**
 * seasonAwardRewards.ts — 시즌 종료 어워드 BP 보상(순수). 계획: docs/plan/points-system-plan.md "시즌 어워드 보상" (2026-11-08 확정)
 *
 * league_player_awards.(award_type, rank) → 소속 유저 팀에 선수당 지급. 팀 상한 없음.
 * 파이널 MVP 는 league_events.finals_mvp(teamSlug) — 우승 600 과 별개 사건(선수 어워드).
 * 미구현 어워드(ROY·식스맨·MIP·올해의 감독)는 문서에만 예약값으로 보존 — 어워드가 생기면 여기에 추가.
 */
export const FINALS_MVP_BONUS = 150;

/** award_type → rank → BP. rank 0 = 순위 없는 팀 선정(올-리그·올-디펜시브). */
const AWARD_TABLE: Record<string, Record<number, number>> = {
    MVP:       { 1: 200, 2: 80, 3: 50, 4: 20, 5: 20 },
    DPOY:      { 1: 120, 2: 50, 3: 30 },
    ALL_NBA_1: { 0: 60 },
    ALL_NBA_2: { 0: 40 },
    ALL_NBA_3: { 0: 25 },
    ALL_DEF_1: { 0: 40 },
    ALL_DEF_2: { 0: 25 },
};

export const SEASON_AWARD_TYPES = Object.keys(AWARD_TABLE);

/** 해당 어워드·순위의 보상. 표에 없으면 0(지급 안 함). */
export function seasonAwardBonus(awardType: string, rank: number | null | undefined): number {
    return AWARD_TABLE[awardType]?.[rank ?? 0] ?? 0;
}

export function seasonAwardKey(leagueId: string, seasonNumber: number, awardType: string, rank: number, playerId: string, userId: string): string {
    return `award:${leagueId}:${seasonNumber}:${awardType}:${rank}:${playerId}:${userId}`;
}
