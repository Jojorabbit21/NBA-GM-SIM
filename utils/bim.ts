// BIM(Box Impact Margin) — 박스스코어만으로 "코트에 있을 때 팀 득실마진을 100포제션당 몇 점 움직이는가"를 추정한 값. 리그 평균 = 0.
// 공격 쪽(OBIM: 팀 득점에 주는 영향)과 수비 쪽(DBIM: 팀 실점에 주는 영향)을 따로 구하고 BIM = OBIM + DBIM.
// 계수는 공개 지표의 것을 쓰지 않고 이 프로젝트 엔진의 포제션 데이터로 직접 적합했다(scripts/bim/extract.py → fit.py).
// 계산: ① 선수의 100포제션당 박스 지표에서 리그 평균을 뺀 값 × 계수 = 원점수, ② 팀 보정 — 팀원 원점수의 출전 비중 합이
// 팀의 리그 평균 대비 공격 효율(O) · 수비 효율(D)과 같아지도록 팀원 전원에게 같은 상수를 더한다(합치면 팀 득실마진).
// 기본 박스 기록만 쓴다 — 수비 야투 같은 추적 기록은 XIM 몫으로 남겨 둔다(2026-11-12 결정).
// 순수 함수 — hooks/useLeaderboardData.ts 가 호출. 입력 컨텍스트는 PER/Win Shares 와 공용(utils/leagueMetricsContext.ts).

import type { LeagueMetricsContext, PlayerTotals } from './leagueMetricsContext';

type BoxKey = 'pts' | 'fga' | 'fta' | 'p3m' | 'ast' | 'tov' | 'offReb' | 'defReb' | 'stl' | 'blk' | 'pf';

/**
 * 100포제션당 해당 기록이 1 늘 때 팀 공격 효율(100포제션당 득점)이 움직이는 양.
 * 적합 기준: 2026-11-12, 방 2개(Test League 1276경기 · NBA Active 1324경기, 2026-10-26 ~ 11-11 경기), 포제션 524,389개.
 * 엔진 밸런스가 크게 바뀌면 scripts/bim 으로 다시 적합해 두 표를 함께 교체한다.
 */
export const BIM_OFFENSE_COEFFICIENTS: Record<BoxKey, number> = {
    pts: 0.493,
    fga: -0.366,
    fta: 0.101,
    p3m: 0.085,
    ast: 0.336,
    tov: -0.616,
    offReb: 0.133,
    defReb: 0.078,
    stl: 0.095,
    blk: 0.255,
    pf: -0.080,
};

/** 100포제션당 해당 기록이 1 늘 때 팀 수비 효율이 좋아지는 양(100포제션당 실점 감소가 +). 적합 기준은 위와 같다. */
export const BIM_DEFENSE_COEFFICIENTS: Record<BoxKey, number> = {
    pts: 0.121,
    fga: -0.120,
    fta: -0.123,
    p3m: -0.027,
    ast: 0.051,
    tov: 0.192,
    offReb: -0.241,
    defReb: 0.246,
    stl: 1.792,
    blk: 1.382,
    pf: -0.250,
};

const KEYS = Object.keys(BIM_OFFENSE_COEFFICIENTS) as BoxKey[];

export interface BimResult {
    obim: number;
    dbim: number;
    bim: number;
}

const ZERO: BimResult = { obim: 0, dbim: 0, bim: 0 };

/** 입력 순서 그대로 결과 배열을 돌려준다. 출전시간 0·팀/리그 값을 못 구하면 전부 0. */
export function computeBim(players: PlayerTotals[], ctx: LeagueMetricsContext): BimResult[] {
    const lgPtsPerPoss = ctx.lgPtsPerPoss;
    if (!(lgPtsPerPoss > 0)) return players.map(() => ZERO);

    // 선수가 코트에 있던 포제션 추정 = 팀 포제션 × 출전 비중
    const poss = players.map(p => {
        const t = ctx.teams.get(p.teamId);
        if (!t || p.mp <= 0 || t.totals.mp <= 0 || !(t.teamPoss > 0)) return 0;
        return (p.mp / (t.totals.mp / 5)) * t.teamPoss;
    });

    // 리그 평균(100포제션당) — 포제션 가중
    let lgPoss = 0;
    const lgSum: Record<BoxKey, number> = { pts: 0, fga: 0, fta: 0, p3m: 0, ast: 0, tov: 0, offReb: 0, defReb: 0, stl: 0, blk: 0, pf: 0 };
    players.forEach((p, i) => {
        if (poss[i] <= 0) return;
        lgPoss += poss[i];
        for (const k of KEYS) lgSum[k] += p[k];
    });
    if (lgPoss <= 0) return players.map(() => ZERO);

    const rawO: number[] = [];
    const rawD: number[] = [];
    players.forEach((p, i) => {
        let o = 0;
        let d = 0;
        if (poss[i] > 0) {
            for (const k of KEYS) {
                const diff = 100 * (p[k] / poss[i] - lgSum[k] / lgPoss);
                o += BIM_OFFENSE_COEFFICIENTS[k] * diff;
                d += BIM_DEFENSE_COEFFICIENTS[k] * diff;
            }
        }
        rawO.push(o);
        rawD.push(d);
    });

    // 팀 보정 상수 = (팀의 리그 평균 대비 효율 − 팀원 원점수의 출전 비중 합) ÷ 5 — 공격 · 수비 따로
    const sums = new Map<string, { o: number; d: number }>();
    players.forEach((p, i) => {
        if (poss[i] <= 0) return;
        const share = poss[i] / ctx.teams.get(p.teamId)!.teamPoss;
        let s = sums.get(p.teamId);
        if (!s) { s = { o: 0, d: 0 }; sums.set(p.teamId, s); }
        s.o += rawO[i] * share;
        s.d += rawD[i] * share;
    });
    const adj = new Map<string, { o: number; d: number }>();
    sums.forEach((s, teamId) => {
        const t = ctx.teams.get(teamId)!;
        const offRel = 100 * (t.pts / t.teamPoss - lgPtsPerPoss);
        const defRel = 100 * (lgPtsPerPoss - t.oppPts / t.teamPoss);
        adj.set(teamId, { o: (offRel - s.o) / 5, d: (defRel - s.d) / 5 });
    });

    return players.map((p, i) => {
        if (poss[i] <= 0) return ZERO;
        const a = adj.get(p.teamId);
        const obim = rawO[i] + (a?.o ?? 0);
        const dbim = rawD[i] + (a?.d ?? 0);
        return { obim, dbim, bim: obim + dbim };
    });
}
