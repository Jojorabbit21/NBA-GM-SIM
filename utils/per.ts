// PER(Player Efficiency Rating) — 공개된 계산식(Hollinger)을 이 프로젝트 박스스코어에 맞춰 직접 구현.
// 입력은 선수 시즌 누적(총 출전시간 포함)과 팀 페이스, 출력은 리그 평균이 15가 되도록 정규화한 PER.
// 리그 평균(lg_aPER)은 리그 전체 선수의 aPER 를 출전시간으로 가중평균한 값이라 "전원 계산 → 정규화" 두 단계다.
// 이미 화면이 리그 전체 선수 시즌 스탯을 받아 두므로(RPC 1회, 5분 캐시) 별도 저장 없이 그 데이터로 바로 계산한다
// (2026-10-28 결정: 서버 일일 스냅샷 대신 클라이언트 계산). 순수 함수 — hooks/useLeaderboardData.ts 가 호출.
// 입력 컨텍스트는 PER/Win Shares 공용(utils/leagueMetricsContext.ts).

import type { LeagueMetricsContext, PlayerTotals } from './leagueMetricsContext';

/** PER 의 리그 평균 기준값 — 정규화 후 리그 평균이 이 값이 된다. */
export const PER_LEAGUE_AVERAGE = 15;

/**
 * 입력 순서 그대로 PER 배열을 돌려준다. 출전시간이 0 이거나 리그 합계를 못 구하면(경기 전) 0.
 * 팀 AST/FG 비율·리그 합계·팀 페이스는 공통 컨텍스트(utils/leagueMetricsContext.ts)에서 읽는다 — 팀 페이스가 없으면 보정 1.0.
 */
export function computePer(players: PlayerTotals[], ctx: LeagueMetricsContext): number[] {
    const zeros = players.map(() => 0);
    const lg = ctx.lg;
    const lgPossBase = lg.fga - lg.offReb + lg.tov + 0.44 * lg.fta;
    if (lg.fgm <= 0 || lg.ftm <= 0 || lg.pf <= 0 || lg.reb <= 0 || lgPossBase <= 0) return zeros;

    const factor = 2 / 3 - (0.5 * (lg.ast / lg.fgm)) / (2 * (lg.fgm / lg.ftm));
    const vop = lg.pts / lgPossBase;
    const drbp = (lg.reb - lg.offReb) / lg.reb;
    const ftPerPf = lg.ftm / lg.pf;
    const ftaPerPf = lg.fta / lg.pf;
    const lgPace = ctx.lgPace;

    // 1단계: 선수별 aPER(페이스 보정된 uPER)
    const aper = players.map(p => {
        if (p.mp <= 0) return 0;
        const t = ctx.teams.get(p.teamId);
        const tmRatio = t && t.totals.fgm > 0 ? t.totals.ast / t.totals.fgm : 0;
        const uper = (1 / p.mp) * (
            p.p3m
            + (2 / 3) * p.ast
            + (2 - factor * tmRatio) * p.fgm
            + p.ftm * 0.5 * (2 - (1 / 3) * tmRatio)
            - vop * p.tov
            - vop * drbp * (p.fga - p.fgm)
            - vop * 0.44 * (0.44 + 0.56 * drbp) * (p.fta - p.ftm)
            + vop * (1 - drbp) * (p.reb - p.offReb)
            + vop * drbp * p.offReb
            + vop * p.stl
            + vop * drbp * p.blk
            - p.pf * (ftPerPf - 0.44 * ftaPerPf * vop)
        );
        const tmPace = t?.pace;
        const paceAdj = lgPace > 0 && tmPace && tmPace > 0 ? lgPace / tmPace : 1;
        return uper * paceAdj;
    });

    // 2단계: 출전시간 가중 리그 평균으로 정규화
    let weighted = 0;
    let minutes = 0;
    players.forEach((p, i) => { if (p.mp > 0) { weighted += aper[i] * p.mp; minutes += p.mp; } });
    if (minutes <= 0 || weighted <= 0) return zeros;
    const lgAPer = weighted / minutes;
    return players.map((p, i) => (p.mp > 0 ? aper[i] * (PER_LEAGUE_AVERAGE / lgAPer) : 0));
}
