/**
 * playerStatMilestones.ts — 선수 스탯 시즌 마일스톤 사다리(순수). 계획: docs/plan/points-system-plan.md "선수 스탯 마일스톤" (2026-11-08 확정)
 *
 * 누적 지표(정규시즌 합계, 경기마다 판정): 득점·리바운드·어시스트·스틸·블락·3점 성공 — 4단계, 보상 5/15/50/120 (커먼/레어/유니크/에픽)
 * 비율 지표(정규시즌 종료 시 1회 판정): 야투율·자유투·3점 — 최소 시도 미달이면 어떤 단계도 없음. 같은 4단계 보상.
 * 선수당·단계당 시즌 1회, 넘는 순간 그 선수 소속팀의 소유 유저에게. 전 경기 출장 보상은 두지 않는다(사용자 결정).
 * 임계값은 Pro Basketball League 1시즌 분포로 보정(스틸·3점은 재보정하지 않기로 함).
 */

export const STAT_RUNG_REWARDS = [5, 15, 50, 120] as const;

export type CumulativeStat = 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'p3m';
export const CUMULATIVE_STATS: CumulativeStat[] = ['pts', 'reb', 'ast', 'stl', 'blk', 'p3m'];

/** 지표별 임계값 4개(오름차순). 인덱스 = STAT_RUNG_REWARDS 인덱스 */
export const CUMULATIVE_LADDERS: Record<CumulativeStat, readonly [number, number, number, number]> = {
    pts: [1000, 1500, 2000, 2500],
    reb: [500, 700, 850, 1000],
    ast: [400, 600, 750, 900],
    stl: [80, 100, 150, 200],
    blk: [80, 100, 150, 200],
    p3m: [150, 200, 300, 400],
};

export type RatioStat = 'fg' | 'ft' | 'p3';
export interface RatioLadder { made: 'fgm' | 'ftm' | 'p3m'; att: 'fga' | 'fta' | 'p3a'; minAttempts: number; thresholds: readonly [number, number, number, number] }
export const RATIO_LADDERS: Record<RatioStat, RatioLadder> = {
    fg: { made: 'fgm', att: 'fga', minAttempts: 500, thresholds: [0.50, 0.55, 0.60, 0.65] },
    ft: { made: 'ftm', att: 'fta', minAttempts: 150, thresholds: [0.85, 0.88, 0.90, 0.93] },
    p3: { made: 'p3m', att: 'p3a', minAttempts: 200, thresholds: [0.40, 0.42, 0.45, 0.48] },
};

export interface StatRung { stat: string; threshold: number; reward: number; rarityIndex: number }

/** before < threshold <= after 인 단계들(한 경기에 여러 단계를 한꺼번에 넘을 수 있다 — 50점 경기 등). */
export function crossedCumulativeRungs(stat: CumulativeStat, before: number, after: number): StatRung[] {
    const out: StatRung[] = [];
    CUMULATIVE_LADDERS[stat].forEach((thr, i) => {
        if (before < thr && after >= thr) out.push({ stat, threshold: thr, reward: STAT_RUNG_REWARDS[i], rarityIndex: i });
    });
    return out;
}

/** 시즌 종료 시 비율 판정 — 최소 시도 미달이면 []. 달성한 모든 단계 반환. */
export function ratioRungs(stat: RatioStat, made: number, attempts: number): StatRung[] {
    const lad = RATIO_LADDERS[stat];
    if (attempts < lad.minAttempts || attempts <= 0) return [];
    const pct = made / attempts;
    const out: StatRung[] = [];
    lad.thresholds.forEach((thr, i) => {
        if (pct >= thr) out.push({ stat, threshold: thr, reward: STAT_RUNG_REWARDS[i], rarityIndex: i });
    });
    return out;
}

/** 원장 멱등 키 — 예: pstat:{league}:{season}:{player}:pts_2000:{user}, pstat:...:fg_0.6:{user} */
export function playerStatKey(leagueId: string, seasonNumber: number, playerId: string, stat: string, threshold: number, userId: string): string {
    return `pstat:${leagueId}:${seasonNumber}:${playerId}:${stat}_${threshold}:${userId}`;
}
