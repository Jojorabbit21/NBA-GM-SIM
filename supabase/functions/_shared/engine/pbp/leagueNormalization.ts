
import { SIM_CONFIG } from '../../game/config/constants.ts';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LeagueContext {
    muRef: number;       // calibration anchor (standard league rotation avg OVR)
    muLeague: number;    // current league rotation avg OVR
    k: number;           // compression coefficient 0..1
}

// ── Lazy-cached TARGET_ATTRS Set ─────────────────────────────────────────────

let _targetSet: Set<string> | undefined;
function getTargetSet(): Set<string> {
    return _targetSet ??= new Set(SIM_CONFIG.NORMALIZATION.TARGET_ATTRS);
}

// ── Core: normalizeAttrs ─────────────────────────────────────────────────────

export function normalizeAttrs<T extends Record<string, number>>(
    rawAttr: T,
    ctx: LeagueContext,
): T {
    const cfg = SIM_CONFIG.NORMALIZATION;
    if (!cfg.ENABLED) return rawAttr;

    const delta = ctx.muLeague - ctx.muRef;
    if (delta <= 0) return rawAttr;

    const shift = delta * ctx.k;
    if (shift === 0) return rawAttr;

    const targetSet = getTargetSet();
    const boostMap = cfg.ATTR_K_BOOST;
    const result = { ...rawAttr };

    for (const key of Object.keys(result)) {
        if (targetSet.has(key)) {
            const boost = boostMap?.[key] ?? 1.0;
            (result as Record<string, number>)[key] =
                Math.max(0, Math.min(99, result[key] - shift * boost));
        }
    }

    return result;
}

// ── League Context computation ───────────────────────────────────────────────

interface HasRoster { roster: Array<{ id: string } & Record<string, any>> }

export function computeLeagueContext(
    teams: HasRoster[],
    calcOvr: (p: any) => number,
    kOverride?: number,
): LeagueContext {
    const cfg = SIM_CONFIG.NORMALIZATION;
    const muRef = cfg.MU_REF;
    const k = Math.max(cfg.K_MIN, Math.min(cfg.K_MAX, kOverride ?? cfg.DEFAULT_K));

    if (!cfg.ENABLED || !teams || teams.length === 0) {
        return { muRef, muLeague: muRef, k };
    }

    const rotSize = cfg.ROTATION_SIZE;
    let totalOvr = 0;
    let totalPlayers = 0;

    for (const team of teams) {
        if (!team.roster || team.roster.length === 0) continue;
        const ovrs = team.roster.map(p => calcOvr(p)).sort((a, b) => b - a);
        const count = Math.min(rotSize, ovrs.length);
        for (let i = 0; i < count; i++) {
            totalOvr += ovrs[i];
            totalPlayers++;
        }
    }

    const muLeague = totalPlayers > 0 ? totalOvr / totalPlayers : muRef;
    return { muRef, muLeague, k };
}

// ── MP: resolve normalization context from room cache / overrides ─────────────

export function resolveNormalizationContext(
    simSettings: any,
    matchTeams: HasRoster[],
    calcOvr: (p: any) => number,
): void {
    const cfg = SIM_CONFIG.NORMALIZATION;
    if (!cfg.ENABLED || !simSettings) return;

    const cached = simSettings.leagueContext as LeagueContext | undefined;
    const normOverride = simSettings.normalization as
        { enabled?: boolean; k?: number; muRef?: number } | undefined;

    if (normOverride?.enabled === false) {
        simSettings.leagueContext = undefined;
        return;
    }

    if (cached && cached.muLeague > 0) {
        simSettings.leagueContext = {
            muRef: normOverride?.muRef ?? cached.muRef,
            muLeague: cached.muLeague,
            k: normOverride?.k ?? simSettings.normalizationStrength ?? cached.k,
        };
        return;
    }

    const teams = matchTeams.filter((t: any) => t.roster?.length > 0);
    const lc = computeLeagueContext(teams, calcOvr, normOverride?.k ?? simSettings.normalizationStrength);
    if (normOverride?.muRef) lc.muRef = normOverride.muRef;
    simSettings.leagueContext = lc;
}
