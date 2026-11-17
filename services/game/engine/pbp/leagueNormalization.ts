
import { SIM_CONFIG } from '../../config/constants';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LeagueContext {
    muRef: number;       // calibration anchor (standard league rotation avg OVR)
    muLeague: number;    // current league rotation avg OVR
    k: number;           // compression coefficient 0..1
    /**
     * [2026-11-15] 파울 유도 가산에서 빼는 리그 공통 값 표 — 인덱스 i = 정규화 강도 k가 i/20일 때의 값(0~1, 21칸).
     * 있으면 파울 유도 능력치(drFoul)는 깎지 않고 이 값을 유도 가산에서 뺀다(getDrawFoulOffset).
     * 없으면(이 표가 생기기 전에 확정된 방) 예전 방식 그대로 — 능력치를 shift × ATTR_K_BOOST만큼 깎는다.
     */
    drFoulOffsets?: number[];
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
    const keepDrFoul = usesDrFoulOffset(ctx);
    const result = { ...rawAttr };

    for (const key of Object.keys(result)) {
        if (targetSet.has(key)) {
            // 오프셋 방식이면 파울 유도 능력치는 깎지 않는다 — 대신 유도 가산에서 리그 공통 값을 뺀다(아래 getDrawFoulOffset)
            if (keepDrFoul && key === 'drFoul') continue;
            const boost = boostMap?.[key] ?? 1.0;
            (result as Record<string, number>)[key] =
                Math.max(0, Math.min(99, result[key] - shift * boost));
        }
    }

    return result;
}

// ── 파울 유도 정규화: 능력치 차감 대신 가산 오프셋 ─────────────────────────────
// [2026-11-15] 예전엔 drFoul을 다른 능력치의 ATTR_K_BOOST(2.5)배로 깎았다. 유도 곡선(SHOOTING_FOUL.DRAW_FOUL_CURVE)은
// 90 이후가 급경사라, 전원을 평탄 구간으로 내리면 선수 간 격차가 사라진다(레전드 리그: 99 → 76.7, 능력–자유투 상관 0.26).
// 새 방식: 능력치는 그대로 곡선에 넣고, 유도 가산에서 리그 공통 값을 뺀다. 그 값 = "예전 방식이 리그 평균에서 깎던 가산량"
// (로테이션 선수 평균) → 리그 자유투 총량은 예전 수준, 선수 간 격차만 곡선대로 살아난다. 3점 파울 공식은 능력치를 그대로 쓴다.
// 표는 강도 k(0~1)를 DR_FOUL_OFFSET_STEPS 등분해 미리 계산해 두므로 세션에서 정규화 단계를 바꿔도 다시 계산할 필요가 없다.
// 끄기: SIM_CONFIG.NORMALIZATION.DR_FOUL_OFFSET_ENABLED = false (표가 있어도 예전 방식). client·server 미러.

const DR_FOUL_OFFSET_STEPS = 20;

/** flowEngine.interpolateCurve와 같은 규칙(양끝 고정, 구간 선형) — 이 모듈을 엔진 의존 없이 두려고 따로 둔다. */
function curveAt(x: number, curve: readonly (readonly [number, number])[]): number {
    if (x <= curve[0][0]) return curve[0][1];
    if (x >= curve[curve.length - 1][0]) return curve[curve.length - 1][1];
    for (let i = 1; i < curve.length; i++) {
        if (x <= curve[i][0]) {
            const [x0, y0] = curve[i - 1];
            const [x1, y1] = curve[i];
            return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
        }
    }
    return curve[curve.length - 1][1];
}

/** 이 컨텍스트가 파울 유도를 오프셋 방식으로 처리하는지 (표가 있고 스위치가 켜져 있을 때만). */
export function usesDrFoulOffset(ctx: LeagueContext | null | undefined): boolean {
    const cfg = SIM_CONFIG.NORMALIZATION;
    return !!cfg.ENABLED && !!cfg.DR_FOUL_OFFSET_ENABLED
        && Array.isArray(ctx?.drFoulOffsets) && ctx!.drFoulOffsets!.length === DR_FOUL_OFFSET_STEPS + 1;
}

/**
 * 로테이션 선수들의 파울 유도 능력치로 오프셋 표를 만든다. 칸 i = 강도 k = i/STEPS일 때
 * 평균[ 곡선(원래 능력치) − 곡선(예전 방식으로 깎은 능력치) ]. 리그 평균이 기준 이하면(깎을 게 없으면) undefined.
 */
export function computeDrFoulOffsets(drFouls: number[], muLeague: number): number[] | undefined {
    const cfg = SIM_CONFIG.NORMALIZATION;
    const delta = muLeague - cfg.MU_REF;
    if (!cfg.ENABLED || !cfg.DR_FOUL_OFFSET_ENABLED || delta <= 0 || drFouls.length === 0) return undefined;

    const boost = cfg.ATTR_K_BOOST?.drFoul ?? 1.0;
    const curve = SIM_CONFIG.SHOOTING_FOUL.DRAW_FOUL_CURVE;
    const table: number[] = [];
    for (let i = 0; i <= DR_FOUL_OFFSET_STEPS; i++) {
        const shift = delta * (i / DR_FOUL_OFFSET_STEPS) * boost;
        let sum = 0;
        for (const v of drFouls) sum += curveAt(v, curve) - curveAt(Math.max(0, Math.min(99, v - shift)), curve);
        table.push(Math.round((sum / drFouls.length) * 1e5) / 1e5);
    }
    return table;
}

/** 이번 경기의 파울 유도 가산에서 뺄 값(확률, 예: 0.06 = 6%p). 오프셋 방식이 아니면 0. */
export function getDrawFoulOffset(ctx: LeagueContext | null | undefined): number {
    if (!usesDrFoulOffset(ctx)) return 0;
    const c = ctx!;
    const baseDelta = c.muLeague - SIM_CONFIG.NORMALIZATION.MU_REF;   // 표를 만들 때의 기준 격차
    if (baseDelta <= 0) return 0;
    // 표는 MU_REF 기준 — 세션이 muRef를 바꿨으면 실제 차감량이 같아지는 지점으로 환산한다
    const kEff = Math.max(0, Math.min(1, c.k * Math.max(0, c.muLeague - c.muRef) / baseDelta));
    const pos = kEff * DR_FOUL_OFFSET_STEPS;
    const i = Math.min(DR_FOUL_OFFSET_STEPS - 1, Math.floor(pos));
    const t = c.drFoulOffsets!;
    return t[i] + (t[i + 1] - t[i]) * (pos - i);
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
    const rotDrFouls: number[] = [];   // [2026-11-15] 같은 로테이션 선수들의 파울 유도 능력치 — 오프셋 표 계산용

    for (const team of teams) {
        if (!team.roster || team.roster.length === 0) continue;
        const ranked = team.roster
            .map(p => ({ ovr: calcOvr(p), drFoul: Number((p as any).drawFoul) }))
            .sort((a, b) => b.ovr - a.ovr);
        const count = Math.min(rotSize, ranked.length);
        for (let i = 0; i < count; i++) {
            totalOvr += ranked[i].ovr;
            totalPlayers++;
            if (Number.isFinite(ranked[i].drFoul)) rotDrFouls.push(ranked[i].drFoul);
        }
    }

    const muLeague = totalPlayers > 0 ? totalOvr / totalPlayers : muRef;
    const drFoulOffsets = computeDrFoulOffsets(rotDrFouls, muLeague);
    return drFoulOffsets ? { muRef, muLeague, k, drFoulOffsets } : { muRef, muLeague, k };
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
            // [2026-11-15] 저장된 파울 유도 오프셋 표를 그대로 넘긴다 — 없는 방(이전 확정)은 예전 방식 유지
            ...(cached.drFoulOffsets ? { drFoulOffsets: cached.drFoulOffsets } : {}),
        };
        return;
    }

    const teams = matchTeams.filter((t: any) => t.roster?.length > 0);
    const lc = computeLeagueContext(teams, calcOvr, normOverride?.k ?? simSettings.normalizationStrength);
    if (normOverride?.muRef) lc.muRef = normOverride.muRef;
    simSettings.leagueContext = lc;
}
