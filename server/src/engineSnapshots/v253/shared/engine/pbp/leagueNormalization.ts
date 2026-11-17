
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

// ── 드래프트 풀 기준 muLeague 캐싱 ──────────────────────────────────────────────
// 실제로 뽑힌 팀 로스터가 아니라 "드래프트 풀 자체"(뽑힐 수 있었던 후보군) 기준으로
// muLeague를 계산한다 — 같은 풀 설정(draftPool/ovrMin/ovrMax/팀수)을 쓰는 리그는
// 항상 같은 값을 쓰게 되어, 방마다 실제 드래프트 결과에 따라 압축 강도가 들쭉날쭉해지는
// 것을 막는다. 프로세스 메모리에 캐싱해 같은 풀 설정으로 여러 리그가 생성돼도 최초
// 1회만 계산한다(서버 재시작 시에는 캐시가 비워져 다음 최초 호출에서 다시 계산됨).
const poolMuLeagueCache = new Map<string, number>();

export async function getOrComputeDraftPoolMuLeague(
    key: string,
    teamCount: number,
    fetchPoolOvrs: () => Promise<number[]>,
): Promise<number> {
    const cached = poolMuLeagueCache.get(key);
    if (cached !== undefined) return cached;

    const cfg = SIM_CONFIG.NORMALIZATION;
    const ovrs = (await fetchPoolOvrs()).sort((a, b) => b - a);
    const count = Math.min(teamCount * cfg.ROTATION_SIZE, ovrs.length);
    const muLeague = count > 0
        ? ovrs.slice(0, count).reduce((s, v) => s + v, 0) / count
        : cfg.MU_REF;

    poolMuLeagueCache.set(key, muLeague);
    return muLeague;
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
