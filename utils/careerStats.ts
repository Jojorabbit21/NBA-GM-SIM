// Career/season stat-line helpers shared by the player profile (PlayerDetailView) and the
// multiplayer player compare screen. Moved verbatim from views/PlayerDetailView.tsx (2026-10-18).
import type { PlayerStats } from '../types/player';

export function computeCareerAvg(rows: any[], teamLabel: string): Record<string, any> {
    // 2TM 합산 행 제외, gp>0인 행만
    const valid = rows.filter(r => r.team !== '2TM' && (r.gp ?? 0) > 0);
    if (valid.length === 0) return {};
    const totalGP = valid.reduce((s, r) => s + (r.gp ?? 0), 0);
    // 항상 집계되는 스탯 — null 없음
    const wavg = (key: string) =>
        valid.reduce((s, r) => s + ((r[key] ?? 0) * (r.gp ?? 0)), 0) / totalGP;
    // 시대 미집계 가능 스탯 — null 시즌 제외 후 평균, 전부 null이면 null 반환
    const wavgNullable = (key: string): number | null => {
        const tracked = valid.filter(r => r[key] != null);
        if (tracked.length === 0) return null;
        const gpSum = tracked.reduce((s, r) => s + (r.gp ?? 0), 0);
        return tracked.reduce((s, r) => s + (r[key] * (r.gp ?? 0)), 0) / gpSum;
    };
    // 슈팅% 는 성분 스탯에서 재계산
    const tot = (key: string) => valid.reduce((s, r) => s + ((r[key] ?? 0) * (r.gp ?? 0)), 0);
    const fga = tot('fga'); const fg3a = tot('fg3a'); const fta = tot('fta');
    // fg3a: 집계된 시즌이 하나라도 있어야 fg3_pct 계산
    const hasFg3 = valid.some(r => r.fg3a != null);
    return {
        season: `${valid.length}시즌`, team: teamLabel, age: null,
        gp: totalGP,
        gs: valid.reduce((s, r) => s + (r.gs ?? 0), 0),
        min: wavg('min'), pts: wavg('pts'),
        oreb: wavgNullable('oreb'), dreb: wavgNullable('dreb'), reb: wavg('reb'),
        ast: wavg('ast'),
        stl: wavgNullable('stl'), blk: wavgNullable('blk'), tov: wavgNullable('tov'),
        pf: wavg('pf'),
        fgm: wavg('fgm'), fga: wavg('fga'),
        fg_pct: fga > 0 ? tot('fgm') / fga : null,
        fg3m: wavgNullable('fg3m'), fg3a: wavgNullable('fg3a'),
        fg3_pct: (hasFg3 && fg3a > 0) ? tot('fg3m') / fg3a : null,
        ftm: wavg('ftm'), fta: wavg('fta'),
        ft_pct: fta > 0 ? tot('ftm') / fta : null,
        ts_pct: wavg('ts_pct'), efg_pct: wavg('efg_pct'),
        tov_pct: wavgNullable('tov_pct'),
        fg3a_rate: wavgNullable('fg3a_rate'), fta_rate: wavg('fta_rate'),
        usg_pct: wavgNullable('usg_pct'), ast_pct: wavgNullable('ast_pct'),
        orb_pct: wavgNullable('orb_pct'), drb_pct: wavgNullable('drb_pct'), trb_pct: wavgNullable('trb_pct'),
        stl_pct: wavgNullable('stl_pct'), blk_pct: wavgNullable('blk_pct'),
        cont_pg: wavgNullable('cont_pg'),
        dfg_pct: wavgNullable('dfg_pct'),
    };
}

export interface TeamAdvCtx {
    tmFga: number; tmFta: number; tmTov: number; tmFgm: number; tmMp: number;
    tmOreb: number; tmDreb: number; tmReb: number;
    oppOreb: number; oppDreb: number; oppReb: number; oppPoss: number; opp2pa: number;
}

/** PlayerStats(시뮬 누적 합계) → CareerSeasonStat 형식(per-game 평균)으로 변환 */
export function statsToCareerRow(
    stats: PlayerStats,
    season: string,
    teamAbbr: string,
    age: number,
    playoff: boolean,
    ctx?: TeamAdvCtx,
): Record<string, any> {
    const g = stats.g;
    const mp  = stats.mp || 0;
    const safe = (n: number) => (g > 0 ? n / g : 0);
    const pct   = (m: number, a: number) => (a > 0 ? m / a : null);
    const fga   = stats.fga;
    const fta   = stats.fta;
    const pts   = stats.pts;
    const p3a   = stats.p3a;
    const tov   = stats.tov;
    const tsD   = 2 * (fga + 0.44 * fta);

    let usg_pct: number | null = null;
    let ast_pct: number | null = null;
    let orb_pct: number | null = null;
    let drb_pct: number | null = null;
    let trb_pct: number | null = null;
    let stl_pct: number | null = null;
    let blk_pct: number | null = null;

    if (ctx && mp > 0) {
        const { tmFga, tmFta, tmTov, tmFgm, tmMp,
                tmOreb, tmDreb, tmReb,
                oppOreb, oppDreb, oppReb, oppPoss, opp2pa } = ctx;
        const tmMp5    = tmMp / 5;
        const tmUsage  = tmFga + 0.44 * tmFta + tmTov;
        const plPoss   = fga + 0.44 * fta + tov;

        if (tmUsage > 0)
            usg_pct = (plPoss * tmMp5) / (mp * tmUsage) * 100;

        const astDen = (mp / tmMp5) * tmFgm - stats.fgm;
        if (astDen > 0)
            ast_pct = (stats.ast / astDen) * 100;

        if ((tmOreb + oppDreb) > 0)
            orb_pct = (stats.offReb * tmMp5) / (mp * (tmOreb + oppDreb)) * 100;
        if ((tmDreb + oppOreb) > 0)
            drb_pct = (stats.defReb * tmMp5) / (mp * (tmDreb + oppOreb)) * 100;
        if ((tmReb + oppReb) > 0)
            trb_pct = (stats.reb    * tmMp5) / (mp * (tmReb  + oppReb))  * 100;
        if (oppPoss > 0)
            stl_pct = (stats.stl   * tmMp5) / (mp * oppPoss) * 100;
        if (opp2pa > 0)
            blk_pct = (stats.blk   * tmMp5) / (mp * opp2pa)  * 100;
    }

    return {
        season,
        team:    teamAbbr,
        age,
        gp:      g,
        gs:      stats.gs,
        min:     safe(stats.mp),
        pts:     safe(pts),
        oreb:    safe(stats.offReb),
        dreb:    safe(stats.defReb),
        reb:     safe(stats.reb),
        ast:     safe(stats.ast),
        stl:     safe(stats.stl),
        blk:     safe(stats.blk),
        tov:     safe(tov),
        pf:      safe(stats.pf),
        fgm:     safe(stats.fgm),
        fga:     safe(fga),
        fg_pct:  pct(stats.fgm, fga),
        fg3m:    safe(stats.p3m),
        fg3a:    safe(p3a),
        fg3_pct: pct(stats.p3m, p3a),
        ftm:     safe(stats.ftm),
        fta:     safe(fta),
        ft_pct:  pct(stats.ftm, fta),
        ts_pct:  tsD > 0 ? pts / tsD : null,
        efg_pct: fga > 0 ? (stats.fgm + 0.5 * stats.p3m) / fga : null,
        tov_pct: (fga + 0.44 * fta + tov) > 0 ? tov / (fga + 0.44 * fta + tov) : null,
        fg3a_rate: fga > 0 ? p3a / fga : null,
        fta_rate:  fga > 0 ? fta / fga : null,
        usg_pct, ast_pct, orb_pct, drb_pct, trb_pct, stl_pct, blk_pct,
        cont_pg: g > 0 ? (stats.contestedAttempted ?? 0) / g : null,
        dfg_pct: (stats.contestedAttempted ?? 0) > 0 ? (stats.contestedMade ?? 0) / (stats.contestedAttempted ?? 0) : null,
        playoff,
    };
}
