
import { Player, HiddenTendencies, PlayerStats } from '../../../types';
import { generateHiddenTendencies } from '../../../utils/hiddenTendencies';

interface ShotCounts {
    rimM: number; rimA: number;
    midM: number; midA: number;
    p3m: number; p3a: number;
}

/**
 * Distributes the broad shot counts (Rim, Mid, 3PT) into the 10 specific zones
 * based on the player's hidden tendencies.
 */
export function distributeShotsToZones(
    player: Player, 
    shots: ShotCounts
): Partial<PlayerStats> {
    
    // Ensure tendencies exist
    const tendency = player.tendencies || generateHiddenTendencies(player);
    const { lateralBias, archetype } = tendency;

    // Weights container
    // Structure: [Left, Center, Right]
    const midWeights = { l: 0.33, c: 0.34, r: 0.33 };
    const threeWeights = { l_corn: 0.15, l_wing: 0.2, c_top: 0.3, r_wing: 0.2, r_corn: 0.15 };

    // 1. Apply Archetype Modifiers
    if (archetype === 'Corner Sitter') {
        threeWeights.l_corn += 0.15;
        threeWeights.r_corn += 0.15;
        threeWeights.c_top -= 0.2;
        threeWeights.l_wing -= 0.05;
        threeWeights.r_wing -= 0.05;
    } else if (archetype === 'Top Initiator') {
        threeWeights.c_top += 0.2;
        threeWeights.l_corn -= 0.1;
        threeWeights.r_corn -= 0.1;
    }

    // 2. Apply Lateral Bias
    // Bias > 0 favors Right side, Bias < 0 favors Left side
    // Bias is -1.0 to 1.0. 
    // Effect: +/- 50% shift max
    const biasFactor = 0.5; // Max 50% shift

    const applyBias = (val: number, isRight: boolean, isLeft: boolean) => {
        if (isRight) return val * (1 + (lateralBias > 0 ? lateralBias * biasFactor : 0));
        if (isLeft) return val * (1 + (lateralBias < 0 ? Math.abs(lateralBias) * biasFactor : 0));
        return val;
    };

    midWeights.l = applyBias(midWeights.l, false, true);
    midWeights.r = applyBias(midWeights.r, true, false);

    threeWeights.l_corn = applyBias(threeWeights.l_corn, false, true);
    threeWeights.l_wing = applyBias(threeWeights.l_wing, false, true);
    threeWeights.r_corn = applyBias(threeWeights.r_corn, true, false);
    threeWeights.r_wing = applyBias(threeWeights.r_wing, true, false);

    // Normalize weights
    const normMid = midWeights.l + midWeights.c + midWeights.r;
    midWeights.l /= normMid; midWeights.c /= normMid; midWeights.r /= normMid;

    const norm3 = threeWeights.l_corn + threeWeights.l_wing + threeWeights.c_top + threeWeights.r_wing + threeWeights.r_corn;
    threeWeights.l_corn /= norm3; threeWeights.l_wing /= norm3; threeWeights.c_top /= norm3; 
    threeWeights.r_wing /= norm3; threeWeights.r_corn /= norm3;

    // 3. Distribute Shots
    const result: Partial<PlayerStats> = {
        // Rim (Zone 1)
        zone_rim_m: 0, zone_rim_a: 0,
        // Paint (Zone 2)
        zone_paint_m: 0, zone_paint_a: 0,
        // Mid
        zone_mid_l_m: 0, zone_mid_l_a: 0,
        zone_mid_c_m: 0, zone_mid_c_a: 0,
        zone_mid_r_m: 0, zone_mid_r_a: 0,
        // 3PT
        zone_c3_l_m: 0, zone_c3_l_a: 0,
        zone_c3_r_m: 0, zone_c3_r_a: 0,
        zone_atb3_l_m: 0, zone_atb3_l_a: 0,
        zone_atb3_c_m: 0, zone_atb3_c_a: 0,
        zone_atb3_r_m: 0, zone_atb3_r_a: 0,
    };

    // Rim vs Paint Split (Approx 70% Rim, 30% Paint for Inside shots)
    // This could also be influenced by 'Post Play' stat but keeping simple for now
    const rimRatio = 0.7;
    result.zone_rim_a = Math.round(shots.rimA * rimRatio);
    result.zone_rim_m = Math.round(shots.rimM * rimRatio); // Assuming consistent FG%
    result.zone_paint_a = shots.rimA - result.zone_rim_a;
    result.zone_paint_m = shots.rimM - result.zone_rim_m;

    // Mid Distribution
    const distribute = (totalA: number, totalM: number, weight: number) => {
        return {
            a: Math.round(totalA * weight),
            m: Math.round(totalM * weight) // Simplified: Uniform efficiency across zones
        };
    };

    const midL = distribute(shots.midA, shots.midM, midWeights.l);
    const midC = distribute(shots.midA, shots.midM, midWeights.c);
    // Assign remainder to Right to ensure total sum matches
    const midR = { a: shots.midA - midL.a - midC.a, m: shots.midM - midL.m - midC.m };

    result.zone_mid_l_a = midL.a; result.zone_mid_l_m = midL.m;
    result.zone_mid_c_a = midC.a; result.zone_mid_c_m = midC.m;
    result.zone_mid_r_a = midR.a; result.zone_mid_r_m = midR.m;

    // 3PT Distribution
    const c3L = distribute(shots.p3a, shots.p3m, threeWeights.l_corn);
    const atb3L = distribute(shots.p3a, shots.p3m, threeWeights.l_wing);
    const atb3C = distribute(shots.p3a, shots.p3m, threeWeights.c_top);
    const atb3R = distribute(shots.p3a, shots.p3m, threeWeights.r_wing);
    const c3R = { 
        a: shots.p3a - c3L.a - atb3L.a - atb3C.a - atb3R.a,
        m: shots.p3m - c3L.m - atb3L.m - atb3C.m - atb3R.m
    };

    result.zone_c3_l_a = c3L.a; result.zone_c3_l_m = c3L.m;
    result.zone_atb3_l_a = atb3L.a; result.zone_atb3_l_m = atb3L.m;
    result.zone_atb3_c_a = atb3C.a; result.zone_atb3_c_m = atb3C.m;
    result.zone_atb3_r_a = atb3R.a; result.zone_atb3_r_m = atb3R.m;
    result.zone_c3_r_a = c3R.a; result.zone_c3_r_m = c3R.m;

    return result;
}
