/**
 * dailySettlement.ts — BP 경기·플레이오프 보상 공식(순수 함수). 계획: docs/plan/points-system-plan.md "① 일일 정산", "플레이오프 보상"
 *
 * 경기 보상: 점수차 m 에 대해 t = min(5, floor(|m| / 4)) (20점 차 이상이면 상한).
 *   정규시즌·플레이인: 승 20 + t (20~25) / 패 10 − t (5~10)
 *   플레이오프 본선 : 승 30 + t (30~35) / 패 10 − t (5~10)       ← 2026-11-08 권장안 확정
 * 같은 점수차면 승+패 합이 고정(30 / 40) → 리그 전체 지급량은 승패 분포와 무관.
 *
 * 플레이오프 사건 보상(시리즈 단위, 라운드 이름은 maxRound 기준 — playoff_team_count 가 2~16 으로 가변이라 번호로 고정하지 않음):
 *   본선 진출(R1 첫 경기 공개 시 양 팀)      100
 *   시리즈 승리 — 파이널(= 우승)            600
 *   시리즈 승리 — 컨퍼런스 파이널(= 파이널 진출) 300
 *   시리즈 승리 — 그 외 라운드 r            100 + 50 × (r − 1)   (R1 100, R2 150, …)
 * "컨파 진출"·"파이널 진출"은 직전 시리즈 승리와 같은 사건이라 따로 주지 않는다(이중 부과 금지).
 */

export const DAILY_WIN_BASE = 20;
export const PLAYOFF_WIN_BASE = 30;
export const DAILY_LOSS_BASE = 10;
/** 점수차 몇 점당 보정 1 */
export const DAILY_MARGIN_STEP = 4;
/** 보정 상한(= 20점 차) */
export const DAILY_MARGIN_CAP = 5;

export const PLAYOFF_QUALIFY_BONUS = 100;
export const PLAYOFF_FINALS_WIN_BONUS = 600;
export const PLAYOFF_CONF_FINALS_WIN_BONUS = 300;
export const PLAYOFF_ROUND_WIN_BASE = 100;
export const PLAYOFF_ROUND_WIN_STEP = 50;

export type GameStage = 'regular' | 'play_in' | 'playoff';

export interface DailyReward {
    amount: number;
    /** 적용된 보정(0~5) — 원장 meta 기록용 */
    marginBonus: number;
}

export function dailyGameReward(won: boolean, margin: number, stage: GameStage = 'regular'): DailyReward {
    const m = Math.abs(Math.trunc(margin));
    const t = Math.min(DAILY_MARGIN_CAP, Math.floor(m / DAILY_MARGIN_STEP));
    const winBase = stage === 'playoff' ? PLAYOFF_WIN_BASE : DAILY_WIN_BASE;
    return { amount: won ? winBase + t : DAILY_LOSS_BASE - t, marginBonus: t };
}

/** 시리즈 승리 보상. round 는 1부터, maxRound 는 브라켓의 마지막 라운드(파이널). */
export function playoffSeriesWinBonus(round: number, maxRound: number): number {
    if (round >= maxRound) return PLAYOFF_FINALS_WIN_BONUS;
    if (round === maxRound - 1) return PLAYOFF_CONF_FINALS_WIN_BONUS;
    return PLAYOFF_ROUND_WIN_BASE + PLAYOFF_ROUND_WIN_STEP * (round - 1);
}

/** 라운드 이름(원장 meta·내역 표시용) */
export function playoffRoundLabel(round: number, maxRound: number): 'finals' | 'conf_finals' | `round_${number}` {
    if (round >= maxRound) return 'finals';
    if (round === maxRound - 1) return 'conf_finals';
    return `round_${round}`;
}

// ── 원장 멱등 키 ─────────────────────────────────────────────
export function dailySettlementKey(leagueId: string, seasonNumber: number, gameId: string, userId: string): string {
    return `daily:${leagueId}:${seasonNumber}:${gameId}:${userId}`;
}
export function playoffQualifyKey(leagueId: string, seasonNumber: number, userId: string): string {
    return `po_qualify:${leagueId}:${seasonNumber}:${userId}`;
}
export function playoffSeriesKey(leagueId: string, seasonNumber: number, seriesId: string, userId: string): string {
    return `po_series:${leagueId}:${seasonNumber}:${seriesId}:${userId}`;
}
