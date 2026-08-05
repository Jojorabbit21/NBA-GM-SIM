
import { PlayerBoxScore } from '../types';

export interface TeamBoxTotals {
    mp: number;
    fgm: number;
    fga: number;
    p3m: number;
    p3a: number;
    ftm: number;
    fta: number;
    oreb: number;
    dreb: number;
    ast: number;
    stl: number;
    blk: number;
    tov: number;
    pf: number;
}

export function computeTeamBoxTotals(box: PlayerBoxScore[]): TeamBoxTotals {
    return box.reduce((acc, p) => ({
        mp: acc.mp + p.mp,
        fgm: acc.fgm + p.fgm,
        fga: acc.fga + p.fga,
        p3m: acc.p3m + p.p3m,
        p3a: acc.p3a + p.p3a,
        ftm: acc.ftm + p.ftm,
        fta: acc.fta + p.fta,
        oreb: acc.oreb + (p.offReb || 0),
        dreb: acc.dreb + (p.defReb || 0),
        ast: acc.ast + p.ast,
        stl: acc.stl + p.stl,
        blk: acc.blk + p.blk,
        tov: acc.tov + p.tov,
        pf: acc.pf + (p.pf || 0),
    }), {
        mp: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
        oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
    });
}

export interface AdvancedPlayerStats {
    tsPct: number | null;
    efgPct: number | null;
    usgPct: number | null;
    astPct: number | null;
    tovPct: number | null;
    orebPct: number | null;
    drebPct: number | null;
    trbPct: number | null;
}

// Basketball-Reference 방식 근사식 — 실제 온코트 포제션 추적 없이 팀 전체 스탯을
// 선수의 출전시간(MP) 비중으로 스케일링해 추정한다. team = 이 선수의 소속팀 합계,
// opp = 상대팀 합계 (리바운드%는 상대팀 리바운드 기회도 분모에 필요).
export function computeAdvancedStats(p: PlayerBoxScore, team: TeamBoxTotals, opp: TeamBoxTotals): AdvancedPlayerStats {
    const offReb = p.offReb || 0;
    const defReb = p.defReb || 0;

    const tsa = p.fga + 0.44 * p.fta;
    const tsPct = tsa > 0 ? (p.pts / (2 * tsa)) * 100 : null;

    const efgPct = p.fga > 0 ? ((p.fgm + 0.5 * p.p3m) / p.fga) * 100 : null;

    const teamMpPerFive = team.mp / 5;
    const teamPlays = team.fga + 0.44 * team.fta + team.tov;
    const usgPct = (p.mp > 0 && teamPlays > 0)
        ? ((p.fga + 0.44 * p.fta + p.tov) * teamMpPerFive) / (p.mp * teamPlays) * 100
        : null;

    const astDenom = (p.mp > 0 && teamMpPerFive > 0) ? ((p.mp / teamMpPerFive) * team.fgm) - p.fgm : 0;
    const astPct = astDenom > 0 ? (p.ast / astDenom) * 100 : null;

    const plays = p.fga + 0.44 * p.fta + p.tov;
    const tovPct = plays > 0 ? (p.tov / plays) * 100 : null;

    const orebDenom = team.oreb + opp.dreb;
    const orebPct = (p.mp > 0 && orebDenom > 0) ? (offReb * teamMpPerFive) / (p.mp * orebDenom) * 100 : null;

    const drebDenom = team.dreb + opp.oreb;
    const drebPct = (p.mp > 0 && drebDenom > 0) ? (defReb * teamMpPerFive) / (p.mp * drebDenom) * 100 : null;

    const trbDenom = team.oreb + team.dreb + opp.oreb + opp.dreb;
    const trbPct = (p.mp > 0 && trbDenom > 0) ? ((offReb + defReb) * teamMpPerFive) / (p.mp * trbDenom) * 100 : null;

    return { tsPct, efgPct, usgPct, astPct, tovPct, orebPct, drebPct, trbPct };
}

// PIE(Player Impact Estimate) — NBA.com 공식 그대로. 분자는 선수 개인, 분모는 그 경기
// 양팀 전체 선수의 같은 합산식 총합이라 호출부에서 두 팀 box를 합쳐 totalPieRaw를 구한 뒤 나눠야 한다.
export function computePieRaw(p: PlayerBoxScore): number {
    const offReb = p.offReb || 0;
    const defReb = p.defReb || 0;
    const pf = p.pf || 0;
    return p.pts + p.fgm + p.ftm - p.fga - p.fta + defReb + 0.5 * offReb + p.ast + p.stl + 0.5 * p.blk - pf - p.tov;
}
