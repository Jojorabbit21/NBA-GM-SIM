// GOBERT — 수비 전용 임팩트 지표. Guarded-shot Outcomes & Box Estimate, Regressed and Team-adjusted.
// "코트에 있을 때 팀 실점을 100포제션당 몇 점 줄이는가"를 수비 기록만으로 추정한 값. 리그 평균 = 0, 클수록 좋다.
// 입력은 수비 기록뿐이다: 수비 리바운드 · 턴오버 유도(스틸 + 차징 유도) · 블락 · 파울 · 구역별(골밑 / 미드 / 3점) 수비한 슛 수와 허용 수.
// 득점 · 야투 같은 공격 기록은 쓰지 않는다(BIM 의 DBIM 과 다른 점).
// 계수는 이 프로젝트 엔진의 포제션 데이터로 직접 적합했다(scripts/bim/extract.py → fit_gobert.py).
// 계산: ① 100포제션당 수비 기록에서 리그 평균을 뺀 값 × 계수 = 원점수, ② 팀 보정 — 팀원 원점수의 출전 비중 합이
// 팀의 리그 평균 대비 수비 효율과 같아지도록 팀원 전원에게 같은 상수를 더한다.
// 순수 함수 — hooks/useLeaderboardData.ts 가 호출. 팀 · 리그 값은 PER/Win Shares/BIM 과 공용 컨텍스트(utils/leagueMetricsContext.ts).

import type { LeagueMetricsContext } from './leagueMetricsContext';

type DefKey = 'defReb' | 'tovForced' | 'blk' | 'pf' | 'dRimA' | 'dRimM' | 'dMidA' | 'dMidM' | 'd3A' | 'd3M';

/** 선수 시즌 누적 수비 기록. 구역 묶음: 골밑 = RA + ITP, 미드 = MID, 3점 = CNR + WING + ATB. A = 수비한 슛 수, M = 그중 허용(성공) 수. */
export type GobertTotals = { teamId: string; mp: number } & Record<DefKey, number>;

/**
 * 100포제션당 해당 기록이 1 늘 때 팀 실점(100포제션당)이 줄어드는 양.
 * 적합 기준: 2026-11-12, 방 2개(Test League 1276경기 · NBA Active 1324경기, 2026-10-26 ~ 11-11 경기), 포제션 525,184개.
 * 엔진 밸런스가 크게 바뀌면 scripts/bim/fit_gobert.py 로 다시 적합해 이 표를 교체한다.
 */
export const GOBERT_COEFFICIENTS: Record<DefKey, number> = {
    defReb: 0.179,
    tovForced: 1.456,
    blk: 1.129,
    pf: -0.279,
    dRimA: 0.119,
    dRimM: -0.496,
    dMidA: 0.594,
    dMidM: -0.991,
    d3A: 0.172,
    d3M: -0.932,
};

const KEYS = Object.keys(GOBERT_COEFFICIENTS) as DefKey[];

/** 입력 순서 그대로 GOBERT 배열을 돌려준다. 출전시간 0 · 팀/리그 값을 못 구하면 0. */
export function computeGobert(players: GobertTotals[], ctx: LeagueMetricsContext): number[] {
    const lgPtsPerPoss = ctx.lgPtsPerPoss;
    if (!(lgPtsPerPoss > 0)) return players.map(() => 0);

    // 선수가 코트에 있던 포제션 추정 = 팀 포제션 × 출전 비중 (utils/bim.ts 와 같은 식)
    const poss = players.map(p => {
        const t = ctx.teams.get(p.teamId);
        if (!t || p.mp <= 0 || t.totals.mp <= 0 || !(t.teamPoss > 0)) return 0;
        return (p.mp / (t.totals.mp / 5)) * t.teamPoss;
    });

    let lgPoss = 0;
    const lgSum: Record<DefKey, number> = { defReb: 0, tovForced: 0, blk: 0, pf: 0, dRimA: 0, dRimM: 0, dMidA: 0, dMidM: 0, d3A: 0, d3M: 0 };
    players.forEach((p, i) => {
        if (poss[i] <= 0) return;
        lgPoss += poss[i];
        for (const k of KEYS) lgSum[k] += p[k];
    });
    if (lgPoss <= 0) return players.map(() => 0);

    const raw = players.map((p, i) => {
        if (poss[i] <= 0) return 0;
        let v = 0;
        for (const k of KEYS) v += GOBERT_COEFFICIENTS[k] * 100 * (p[k] / poss[i] - lgSum[k] / lgPoss);
        return v;
    });

    // 팀 보정 상수 = (팀의 리그 평균 대비 수비 효율 − 팀원 원점수의 출전 비중 합) ÷ 5
    const sums = new Map<string, number>();
    players.forEach((p, i) => {
        if (poss[i] <= 0) return;
        sums.set(p.teamId, (sums.get(p.teamId) ?? 0) + raw[i] * (poss[i] / ctx.teams.get(p.teamId)!.teamPoss));
    });
    const adj = new Map<string, number>();
    sums.forEach((sum, teamId) => {
        const t = ctx.teams.get(teamId)!;
        const defRel = 100 * (lgPtsPerPoss - t.oppPts / t.teamPoss);
        adj.set(teamId, (defRel - sum) / 5);
    });

    return players.map((p, i) => (poss[i] > 0 ? raw[i] + (adj.get(p.teamId) ?? 0) : 0));
}
