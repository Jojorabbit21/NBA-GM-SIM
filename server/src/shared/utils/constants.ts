
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

// ─── OVR tier helpers ────────────────────────────────────────────────────────
// OVR 계산 자체는 utils/ovrEngine.ts + utils/ovrUtils.ts로 이관됨(싱글플레이어 엔진 이식).

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
