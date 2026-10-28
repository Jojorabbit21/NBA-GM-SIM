// Win Shares(OWS / DWS / WS / WS48) — 공개된 계산식(Dean Oliver 방식, Basketball-Reference 가 쓰는 형태)을 이 프로젝트의
// 박스스코어에 맞춰 직접 구현. 선수가 만든 득점·포제션(공격)과 스탑·개인 수비 레이팅(수비)에서 "리그 평균 대비 한계 득점"을 구하고,
// 한계 득점 ÷ (승리 한 번에 필요한 한계 득점)으로 승수로 환산한다. 순수 함수 — hooks/useLeaderboardData.ts 가 호출.
// 입력 컨텍스트는 PER/Win Shares 공용(utils/leagueMetricsContext.ts). 모든 값은 시즌 누적.
//
// 한계: 멀티는 경기별 상대 박스가 없어 상대팀 합계(opp)가 "상대 시즌 평균으로 근사한 값"이다 — 개인 수비 레이팅 보정(팀 DRtg 의 20%)에만
// 영향을 주고 팀 DRtg 자체(실점/포제션)는 실제 경기 결과 값이다.

import type { LeagueMetricsContext, PlayerTotals } from './leagueMetricsContext';

export interface WinSharesResult {
    ows: number;
    dws: number;
    ws: number;
    /** 48분당 WS(리그 평균 ≈ 0.100) */
    ws48: number;
}

const ZERO: WinSharesResult = { ows: 0, dws: 0, ws: 0, ws48: 0 };

/** 자유투 실패로 포제션이 이어지지 않는 비율 항: (1 − FT/FTA)² — FTA 가 0 이면 0. */
const ftMissSq = (ft: number, fta: number) => (fta > 0 ? (1 - ft / fta) ** 2 : 0);

/** 입력 순서 그대로 결과 배열을 돌려준다. 출전시간 0·팀/리그 값을 못 구하면 전부 0. */
export function computeWinShares(players: PlayerTotals[], ctx: LeagueMetricsContext): WinSharesResult[] {
    const { lgPace, lgPtsPerPoss, lgPtsPerGame } = ctx;
    if (!(lgPace > 0) || !(lgPtsPerPoss > 0) || !(lgPtsPerGame > 0)) return players.map(() => ZERO);

    return players.map(p => {
        const team = ctx.teams.get(p.teamId);
        if (!team || p.mp <= 0 || team.totals.mp <= 0 || !(team.pace > 0) || !(team.teamPoss > 0)) return ZERO;
        const tm = team.totals;
        const opp = team.opp;

        // 승리 1회당 한계 득점 — 팀 페이스가 빠를수록 득점이 잘 나오므로 더 많이 필요하다
        const marginalPtsPerWin = 0.32 * lgPtsPerGame * (team.pace / lgPace);
        if (!(marginalPtsPerWin > 0)) return ZERO;

        // ─────────── 공격 ───────────
        const mpShare = p.mp / (tm.mp / 5);
        const qAstTerm1 = tm.fgm > 0 ? mpShare * 1.14 * ((tm.ast - p.ast) / tm.fgm) : 0;
        const qAstDen = (tm.fgm / tm.mp) * p.mp * 5 - p.fgm;
        const qAstTerm2 = qAstDen > 0 ? (((tm.ast / tm.mp) * p.mp * 5 - p.ast) / qAstDen) * (1 - mpShare) : 0;
        const qAst = qAstTerm1 + qAstTerm2;

        const scoredNonFt = p.pts - p.ftm;
        const fgShare = p.fga > 0 ? 0.5 * (scoredNonFt / (2 * p.fga)) * qAst : 0;
        const fgPart = p.fgm * (1 - fgShare);

        const tmOtherFga = tm.fga - p.fga;
        const astScale = tmOtherFga > 0 ? 0.5 * ((tm.pts - tm.ftm - scoredNonFt) / (2 * tmOtherFga)) : 0;
        const astPart = astScale * p.ast;
        const ftPart = (1 - ftMissSq(p.ftm, p.fta)) * 0.4 * p.fta;

        const teamScoringPoss = tm.fgm + (1 - ftMissSq(tm.ftm, tm.fta)) * tm.fta * 0.4;
        const teamOrbPct = tm.offReb + opp.defReb > 0 ? tm.offReb / (tm.offReb + opp.defReb) : 0;
        const teamPlayDen = tm.fga + tm.fta * 0.4 + tm.tov;
        const teamPlayPct = teamPlayDen > 0 ? teamScoringPoss / teamPlayDen : 0;
        const orbWeightDen = (1 - teamOrbPct) * teamPlayPct + teamOrbPct * (1 - teamPlayPct);
        const teamOrbWeight = orbWeightDen > 0 ? ((1 - teamOrbPct) * teamPlayPct) / orbWeightDen : 0;
        const orbPart = p.offReb * teamOrbWeight * teamPlayPct;

        const orbDiscount = teamScoringPoss > 0 ? 1 - (tm.offReb / teamScoringPoss) * teamOrbWeight * teamPlayPct : 1;
        const scPoss = (fgPart + astPart + ftPart) * orbDiscount + orbPart;
        const fgxPoss = (p.fga - p.fgm) * (1 - 1.07 * teamOrbPct);
        const ftxPoss = ftMissSq(p.ftm, p.fta) * 0.4 * p.fta;
        const totPoss = scPoss + fgxPoss + ftxPoss + p.tov;

        const pprodFgPart = 2 * (p.fgm + 0.5 * p.p3m) * (1 - fgShare);
        const tmOtherFgm = tm.fgm - p.fgm;
        const pprodAstPart = tmOtherFgm > 0
            ? 2 * ((tmOtherFgm + 0.5 * (tm.p3m - p.p3m)) / tmOtherFgm) * astScale * p.ast
            : 0;
        const pprodOrbPart = teamScoringPoss > 0 ? orbPart * (tm.pts / teamScoringPoss) : 0;
        const pprod = (pprodFgPart + pprodAstPart + p.ftm) * orbDiscount + pprodOrbPart;

        const marginalOffense = pprod - 0.92 * lgPtsPerPoss * totPoss;
        const ows = marginalOffense / marginalPtsPerWin;

        // ─────────── 수비 ───────────
        const dorPct = opp.offReb + tm.defReb > 0 ? opp.offReb / (opp.offReb + tm.defReb) : 0;
        const dfgPct = opp.fga > 0 ? opp.fgm / opp.fga : 0;
        const fmDen = dfgPct * (1 - dorPct) + (1 - dfgPct) * dorPct;
        const fmWt = fmDen > 0 ? (dfgPct * (1 - dorPct)) / fmDen : 0;
        const stops1 = p.stl + p.blk * fmWt * (1 - 1.07 * dorPct) + p.defReb * (1 - fmWt);
        const stops2 =
            (((opp.fga - opp.fgm - tm.blk) / tm.mp) * fmWt * (1 - 1.07 * dorPct) + (opp.tov - tm.stl) / tm.mp) * p.mp
            + (tm.pf > 0 ? (p.pf / tm.pf) * 0.4 * opp.fta * ftMissSq(opp.ftm, opp.fta) : 0);
        const stops = stops1 + stops2;
        // 상대 출전시간 = 팀 출전시간
        const stopPct = (stops * tm.mp) / (team.teamPoss * p.mp);

        const teamDrtg = (100 * team.oppPts) / team.teamPoss;
        const oppScPoss = opp.fgm + (1 - ftMissSq(opp.ftm, opp.fta)) * opp.fta * 0.4;
        const dPtsPerScPoss = oppScPoss > 0 ? team.oppPts / oppScPoss : 0;
        const drtg = teamDrtg + 0.2 * (100 * dPtsPerScPoss * (1 - stopPct) - teamDrtg);
        const marginalDefense = (p.mp / tm.mp) * team.teamPoss * (1.08 * lgPtsPerPoss - drtg / 100);
        const dws = marginalDefense / marginalPtsPerWin;

        const ws = ows + dws;
        return { ows, dws, ws, ws48: (ws / p.mp) * 48 };
    });
}
