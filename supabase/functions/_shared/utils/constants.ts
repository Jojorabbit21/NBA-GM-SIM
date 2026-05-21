
import { Player } from '../types.ts';

// ─── INITIAL_STATS factory ───────────────────────────────────────────────────

export const INITIAL_STATS = () => ({
    g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
    fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
    rimM: 0, rimA: 0, midM: 0, midA: 0,
    pf: 0,
    techFouls: 0,
    flagrantFouls: 0,
    plusMinus: 0,

    // 10-Zone Shooting Data
    zone_rim_m: 0, zone_rim_a: 0,
    zone_paint_m: 0, zone_paint_a: 0,
    zone_mid_l_m: 0, zone_mid_l_a: 0,
    zone_mid_c_m: 0, zone_mid_c_a: 0,
    zone_mid_r_m: 0, zone_mid_r_a: 0,
    zone_c3_l_m: 0, zone_c3_l_a: 0,
    zone_c3_r_m: 0, zone_c3_r_a: 0,
    zone_atb3_l_m: 0, zone_atb3_l_a: 0,
    zone_atb3_c_m: 0, zone_atb3_c_a: 0,
    zone_atb3_r_m: 0, zone_atb3_r_a: 0,
});

// ─── OVR Calculation (Edge Function 전용 간소화 버전) ─────────────────────────

type OvrPosition = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

function resolvePosition(position: string): OvrPosition {
    if (position.startsWith('PG')) return 'PG';
    if (position.startsWith('SG')) return 'SG';
    if (position.startsWith('SF')) return 'SF';
    if (position.startsWith('PF')) return 'PF';
    if (position.startsWith('C'))  return 'C';
    const first = position.split('/')[0].trim();
    if (['PG','SG','SF','PF','C'].includes(first)) return first as OvrPosition;
    return 'SF';
}

function wavg(pairs: Array<[number, number]>): number {
    let totalW = 0, totalV = 0;
    for (const [v, w] of pairs) { totalV += v * w; totalW += w; }
    return totalW > 0 ? totalV / totalW : 0;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * 간소화된 OVR 계산 — Edge Function 환경에서 admin 서비스 없이 동작.
 * 핵심 모듈 가중치 기반 포지션별 계산.
 */
export const calculatePlayerOvr = (p: Player | any, positionOverride?: string): number => {
    const pos = resolvePosition(positionOverride ?? p.position ?? 'SF');

    const ins    = p.ins ?? 70;
    const out    = p.out ?? 70;
    const plm    = p.plm ?? 70;
    const def    = p.def ?? 70;
    const reb    = p.reb ?? 70;
    const ath    = p.ath ?? 70;

    const closeShot  = p.closeShot  ?? ins;
    const layup      = p.layup      ?? ins;
    const dunk       = p.dunk       ?? ins;
    const postPlay   = p.postPlay   ?? ins;
    const drawFoul   = p.drawFoul   ?? ins;
    const hands      = p.hands      ?? ins;

    const midRange    = p.midRange    ?? out;
    const threeCorner = p.threeCorner ?? out;
    const three45     = p.three45     ?? out;
    const threeTop    = p.threeTop    ?? out;
    const ft          = p.ft          ?? out;
    const shotIq      = p.shotIq      ?? out;
    const offConsist  = p.offConsist  ?? out;

    const passAcc         = p.passAcc         ?? plm;
    const handling        = p.handling        ?? plm;
    const spdBall         = p.spdBall         ?? plm;
    const passVision      = p.passVision      ?? plm;
    const passIq          = p.passIq          ?? plm;
    const offBallMovement = p.offBallMovement ?? plm;

    const intDef    = p.intDef    ?? def;
    const perDef    = p.perDef    ?? def;
    const steal     = p.steal     ?? def;
    const blk       = p.blk       ?? def;
    const helpDefIq = p.helpDefIq ?? def;
    const passPerc  = p.passPerc  ?? def;
    const defConsist = p.defConsist ?? def;

    const offReb = p.offReb ?? reb;
    const defReb = p.defReb ?? reb;
    const boxOut = p.boxOut ?? reb;

    const speed      = p.speed      ?? ath;
    const agility    = p.agility    ?? ath;
    const strength   = p.strength   ?? ath;
    const vertical   = p.vertical   ?? ath;
    const stamina    = p.stamina    ?? ath;
    const hustle     = p.hustle     ?? ath;
    const durability = p.durability ?? ath;

    const intangibles = p.intangibles ?? 70;

    // Key modules
    const spotUp    = wavg([[threeCorner,0.30],[three45,0.28],[threeTop,0.22],[ft,0.08],[shotIq,0.06],[offConsist,0.06]]);
    const shotCr    = wavg([[midRange,0.28],[threeTop,0.18],[handling,0.16],[spdBall,0.12],[drawFoul,0.10],[layup,0.08],[shotIq,0.08]]);
    const rimFin    = wavg([[layup,0.26],[dunk,0.18],[closeShot,0.14],[drawFoul,0.12],[hands,0.08],[spdBall,0.08],[vertical,0.08],[agility,0.06]]);
    const postCraft = wavg([[postPlay,0.26],[closeShot,0.26],[strength,0.14],[drawFoul,0.10],[hands,0.10],[shotIq,0.07],[offConsist,0.07]]);
    const makePl    = wavg([[passVision,0.28],[passAcc,0.24],[passIq,0.18],[handling,0.16],[spdBall,0.10],[offBallMovement,0.04]]);
    const poa       = wavg([[perDef,0.30],[steal,0.14],[passPerc,0.12],[helpDefIq,0.12],[agility,0.10],[speed,0.10],[defConsist,0.12]]);
    const teamDef   = wavg([[helpDefIq,0.20],[passPerc,0.18],[perDef,0.16],[intDef,0.14],[steal,0.08],[blk,0.08],[boxOut,0.08],[defConsist,0.08]]);
    const rimProt   = wavg([[intDef,0.42],[blk,0.14],[helpDefIq,0.18],[strength,0.12],[vertical,0.08],[defConsist,0.06]]);
    const reboundM  = wavg([[offReb,0.24],[defReb,0.34],[boxOut,0.24],[strength,0.10],[hustle,0.08]]);
    const motorM    = wavg([[durability,0.35],[stamina,0.25],[hustle,0.20],[offConsist,0.10],[defConsist,0.10]]);

    let posBase: number;
    switch (pos) {
        case 'PG': posBase = wavg([[makePl,0.31],[spotUp,0.24],[rimFin,0.11],[poa,0.08],[motorM,0.06],[teamDef,0.04],[shotCr,0.04]]); break;
        case 'SG': posBase = wavg([[spotUp,0.27],[shotCr,0.18],[rimFin,0.13],[makePl,0.09],[poa,0.10],[motorM,0.06],[teamDef,0.04]]); break;
        case 'SF': posBase = wavg([[postCraft,0.10],[spotUp,0.14],[shotCr,0.12],[rimFin,0.13],[makePl,0.09],[poa,0.14],[teamDef,0.11],[reboundM,0.09],[motorM,0.04]]); break;
        case 'PF': posBase = wavg([[postCraft,0.08],[spotUp,0.10],[rimFin,0.11],[makePl,0.06],[rimProt,0.21],[reboundM,0.17],[teamDef,0.11],[poa,0.06],[motorM,0.03]]); break;
        case 'C':  posBase = wavg([[postCraft,0.08],[spotUp,0.05],[rimFin,0.10],[makePl,0.08],[rimProt,0.24],[reboundM,0.27],[teamDef,0.10],[motorM,0.02]]); break;
    }

    const intBonus = clamp(((intangibles - 50) / 50) * 1.0, -1.0, 1.0);
    const calAdj = pos === 'SF' ? 4.0 : (pos === 'PF' ? 5.0 : (pos === 'C' ? 5.0 : 0));

    return Math.round(clamp(posBase + intBonus + calAdj, 40, 99));
};

// ─── OVR tier helpers ────────────────────────────────────────────────────────

export type OvrTier = 'SUPERSTAR' | 'STAR' | 'STARTER' | 'ROLE' | 'FRINGE';

const OVR_TIER_THRESHOLDS: Record<string, number> = {
    SUPERSTAR: 93,
    STAR:      88,
    STARTER:   80,
    ROLE:      73,
    FRINGE:    68,
};

export function getOVRThreshold(tier: OvrTier): number {
    return OVR_TIER_THRESHOLDS[tier] ?? 70;
}
