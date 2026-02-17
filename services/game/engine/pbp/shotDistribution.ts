
import { Player, HiddenTendencies, PlayerTendencies, TacticalSliders } from '../../../types';
import { generateHiddenTendencies } from '../../../utils/hiddenTendencies';
import { ArchetypeRatings } from './archetypeSystem';
import { calculatePlayerArchetypes } from './archetypeSystem';

export interface ZoneAttempts {
    zone_rim_a: number; zone_paint_a: number;
    zone_mid_l_a: number; zone_mid_c_a: number; zone_mid_r_a: number;
    zone_c3_l_a: number; zone_c3_r_a: number;
    zone_atb3_l_a: number; zone_atb3_c_a: number; zone_atb3_r_a: number;
}

/**
 * Calculates weights for zones based on Tendencies (Real DB Data) OR Fallback (Archetypes + Hash).
 */
export function calculateZoneWeights(player: Player, tendencyFallback: HiddenTendencies) {
    
    // --- Priority 1: Use REAL Tendencies from DB if available ---
    if (player.tendencies) {
        return calculateWeightsFromRealData(player.tendencies);
    }

    // --- Priority 2: Fallback to Archetype + Hash Logic ---
    return calculateWeightsFromArchetype(player, tendencyFallback);
}

/**
 * [NEW] Calculates weights using explicit DB tendencies.
 * Automatically normalizes values even if sum != 100.
 */
function calculateWeightsFromRealData(t: PlayerTendencies) {
    const z = t.zones;
    
    // 1. Normalize Zones (Handle any sum)
    const totalWeight = (z.ra + z.itp + z.mid + z.cnr + z.p45 + z.atb) || 1; // Avoid divide by zero
    
    // Raw Probabilities (0.0 - 1.0)
    const pRim = z.ra / totalWeight;
    const pPaint = z.itp / totalWeight;
    const pMid = z.mid / totalWeight;
    const pCnr = z.cnr / totalWeight;
    const pWing = z.p45 / totalWeight;
    const pTop = z.atb / totalWeight;

    // 2. Apply Lateral Bias to Split Zones (Left/Right)
    // Bias: 0 (Strong Left) ... 3 (Strong Right)
    // Multipliers:
    // 0: L x1.6, C x1.0, R x0.4
    // 1: L x1.2, C x1.0, R x0.8
    // 2: L x0.8, C x1.0, R x1.2 (Default Righty)
    // 3: L x0.4, C x1.0, R x1.6
    
    const bias = t.lateral_bias;
    let leftMult = 1.0;
    let rightMult = 1.0;

    if (bias === 0) { leftMult = 1.6; rightMult = 0.4; }
    else if (bias === 1) { leftMult = 1.2; rightMult = 0.8; }
    else if (bias === 2) { leftMult = 0.8; rightMult = 1.2; }
    else if (bias === 3) { leftMult = 0.4; rightMult = 1.6; }

    // 3. Construct Mid Range Weights (Left, Center, Right)
    // Center is stable, Left/Right split the rest based on bias
    // Assume Mid splits roughly 30% Left, 40% Center, 30% Right by default
    const midWeights = {
        l: pMid * 0.3 * leftMult,
        c: pMid * 0.4, 
        r: pMid * 0.3 * rightMult
    };
    // Re-normalize Mid (to ensure sum equals pMid)
    const midTotal = midWeights.l + midWeights.c + midWeights.r || 1;
    midWeights.l = (midWeights.l / midTotal);
    midWeights.c = (midWeights.c / midTotal);
    midWeights.r = (midWeights.r / midTotal);

    // 4. Construct 3PT Weights
    // Corner: Split pCnr
    // Wing: Split pWing
    // Top: pTop
    
    // Normalize 3PT group (relative to each other)
    const threeTotalProb = pCnr + pWing + pTop || 1;
    
    // Relative weights within 3PT bucket
    const relCnr = pCnr / threeTotalProb;
    const relWing = pWing / threeTotalProb;
    const relTop = pTop / threeTotalProb;

    const threeWeights = {
        l_corn: (relCnr * 0.5) * leftMult,
        r_corn: (relCnr * 0.5) * rightMult,
        l_wing: (relWing * 0.5) * leftMult,
        r_wing: (relWing * 0.5) * rightMult,
        c_top: relTop
    };

    // Re-normalize 3PT (to ensure sum = 1.0 for distribution logic)
    const threeSum = threeWeights.l_corn + threeWeights.r_corn + threeWeights.l_wing + threeWeights.r_wing + threeWeights.c_top || 1;
    threeWeights.l_corn /= threeSum;
    threeWeights.r_corn /= threeSum;
    threeWeights.l_wing /= threeSum;
    threeWeights.r_wing /= threeSum;
    threeWeights.c_top /= threeSum;
    
    // Pass Ratio for Rim/Paint Split (Used in distributeAttempts)
    // pRim vs pPaint ratio
    const totalInside = pRim + pPaint || 1;
    const rimRatio = pRim / totalInside;

    return { midWeights, threeWeights, rimRatio, isRealData: true };
}

/**
 * [FALLBACK] Calculates weights based on Archetypes and Hash.
 */
function calculateWeightsFromArchetype(player: Player, tendency: HiddenTendencies) {
    const { lateralBias } = tendency;

    // ... (Archetype Calculation Logic - Same as before) ...
    let archs: ArchetypeRatings;
    if ((player as any).archetypes) {
        archs = (player as any).archetypes;
    } else {
        const mockAttr = {
            ins: player.ins, out: player.out, mid: player.midRange, ft: player.ft, 
            threeVal: (player.threeCorner+player.three45+player.threeTop)/3,
            speed: player.speed, agility: player.agility, strength: player.strength, vertical: player.vertical,
            stamina: player.stamina, durability: player.durability, hustle: player.hustle,
            height: player.height, weight: player.weight,
            handling: player.handling, hands: player.hands, pas: player.passAcc, passAcc: player.passAcc,
            passVision: player.passVision, passIq: player.passIq, shotIq: player.shotIq, offConsist: player.offConsist,
            drFoul: player.drawFoul, def: player.def, intDef: player.intDef, perDef: player.perDef,
            blk: player.blk, stl: player.steal, helpDefIq: player.helpDefIq, defConsist: player.defConsist,
            passPerc: player.passPerc, foulTendency: 50, reb: player.reb, postPlay: player.postPlay
        };
        archs = calculatePlayerArchetypes(mockAttr, player.condition || 100);
    }

    // Base Weights
    const midWeights = { l: 0.33, c: 0.34, r: 0.33 };
    const threeWeights = { l_corn: 0.15, l_wing: 0.2, c_top: 0.3, r_wing: 0.2, r_corn: 0.15 };

    // ... (Apply Archetype Modifiers) ...
    // Spacer: Loves corners
    if (archs.spacer > 80 && archs.handler < 70) {
        threeWeights.l_corn += 0.25; threeWeights.r_corn += 0.25; threeWeights.c_top -= 0.3;
    } 
    // Handler: Loves Top
    else if (archs.handler > 80 && archs.spacer > 75) {
        threeWeights.c_top += 0.3; threeWeights.l_corn -= 0.1; threeWeights.r_corn -= 0.1;
    }

    // ... (Apply Lateral Bias) ...
    const biasFactor = 0.6;
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

    // Normalize
    const normMid = midWeights.l + midWeights.c + midWeights.r || 1;
    midWeights.l /= normMid; midWeights.c /= normMid; midWeights.r /= normMid;

    const norm3 = threeWeights.l_corn + threeWeights.l_wing + threeWeights.c_top + threeWeights.r_wing + threeWeights.r_corn || 1;
    threeWeights.l_corn /= norm3; threeWeights.l_wing /= norm3; threeWeights.c_top /= norm3;
    threeWeights.r_wing /= norm3; threeWeights.r_corn /= norm3;
    
    // Derive Rim Ratio from Archetypes
    let rimRatio = 0.75;
    if (archs.postScorer > archs.driver + 10) rimRatio = 0.50; 
    else if (archs.driver > archs.postScorer + 10) rimRatio = 0.85;

    return { midWeights, threeWeights, rimRatio, isRealData: false, archs };
}

/**
 * Distributes total attempts into zones based on player tendencies.
 */
export function distributeAttemptsToZones(
    player: Player,
    totalFGA: number,
    sliders: TacticalSliders // [New] Sliders drive distribution
): ZoneAttempts {
    const tendency = player.tendencies ? ({} as HiddenTendencies) : (player.hiddenTendencies || generateHiddenTendencies(player));
    
    // 1. Calculate detailed weights (Archetype or Real Tendency based)
    const { midWeights, threeWeights, rimRatio } = calculateZoneWeights(player, tendency);

    // 2. Determine Range Distribution (Rim / Mid / 3PT)
    // Based on Sliders (1-10) and Player Attributes
    
    // Base Weights from Sliders
    let wRim = sliders.shot_rim * 1.0;
    let wMid = sliders.shot_mid * 1.0;
    let w3pt = sliders.shot_3pt * 1.0;

    // Attribute Modifiers (Player capability affects preference)
    const attr = player as any; // Using flat player structure
    
    // If player is elite at a range, they gravitate towards it
    if (attr.threeVal > 85) w3pt += 3;
    if (attr.mid > 85) wMid += 2;
    if (attr.ins > 85) wRim += 2;
    
    // If player is bad, they avoid it
    if (attr.threeVal < 65) w3pt *= 0.3;
    
    const totalW = wRim + wMid + w3pt || 1;
    
    const rimA = Math.round(totalFGA * (wRim / totalW));
    const midA = Math.round(totalFGA * (wMid / totalW));
    const p3A = totalFGA - rimA - midA;

    // 3. Sub-Zone Distribution (Using detailed weights)
    const result: ZoneAttempts = {
        // Rim vs Paint
        zone_rim_a: Math.round(rimA * rimRatio), 
        zone_paint_a: rimA - Math.round(rimA * rimRatio),
        
        // Mid Range
        zone_mid_l_a: Math.round(midA * midWeights.l),
        zone_mid_c_a: Math.round(midA * midWeights.c),
        zone_mid_r_a: midA - Math.round(midA * midWeights.l) - Math.round(midA * midWeights.c),
        
        // 3 Point
        zone_c3_l_a: Math.round(p3A * threeWeights.l_corn),
        zone_atb3_l_a: Math.round(p3A * threeWeights.l_wing),
        zone_atb3_c_a: Math.round(p3A * threeWeights.c_top),
        zone_atb3_r_a: Math.round(p3A * threeWeights.r_wing),
        zone_c3_r_a: p3A - Math.round(p3A * threeWeights.l_corn) - Math.round(p3A * threeWeights.l_wing) - Math.round(p3A * threeWeights.c_top) - Math.round(p3A * threeWeights.r_wing)
    };
    
    return result;
}

export function resolveDynamicZone(player: any, broadZone: 'Rim' | 'Paint' | 'Mid' | '3PT'): string {
    const rand = Math.random();
    if (broadZone === 'Mid') {
        if (rand < 0.33) return 'zone_mid_l';
        if (rand < 0.66) return 'zone_mid_c';
        return 'zone_mid_r';
    }
    if (broadZone === '3PT') {
        if (rand < 0.15) return 'zone_c3_l';
        if (rand < 0.35) return 'zone_atb3_l';
        if (rand < 0.65) return 'zone_atb3_c';
        if (rand < 0.85) return 'zone_atb3_r';
        return 'zone_c3_r';
    }
    return broadZone === 'Rim' ? 'zone_rim' : 'zone_paint';
}

// For UI projection
export function getProjectedZoneDensity(player: Player) {
    // Re-use logic to show heatmap in UI
    const tendency = player.tendencies ? ({} as HiddenTendencies) : (player.hiddenTendencies || generateHiddenTendencies(player));
    const { midWeights, threeWeights, rimRatio } = calculateZoneWeights(player, tendency);
    
    return {
        rim: 0.4 * rimRatio, 
        paint: 0.4 * (1 - rimRatio),
        midL: 0.3 * midWeights.l, 
        midC: 0.3 * midWeights.c, 
        midR: 0.3 * midWeights.r,
        c3L: 0.3 * threeWeights.l_corn, 
        atb3L: 0.3 * threeWeights.l_wing, 
        atb3C: 0.3 * threeWeights.c_top, 
        atb3R: 0.3 * threeWeights.r_wing, 
        c3R: 0.3 * threeWeights.r_corn
    };
}
