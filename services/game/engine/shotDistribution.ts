
import { Player, HiddenTendencies } from '../../../types';
import { generateHiddenTendencies } from '../../../utils/hiddenTendencies';
import { ArchetypeRatings } from './pbp/archetypeSystem';
import { calculatePlayerArchetypes } from './pbp/archetypeSystem';

export interface ZoneAttempts {
    // Rim
    zone_rim_a: number;
    zone_paint_a: number;
    // Mid
    zone_mid_l_a: number; zone_mid_c_a: number; zone_mid_r_a: number;
    // 3PT
    zone_c3_l_a: number; zone_c3_r_a: number;
    zone_atb3_l_a: number; zone_atb3_c_a: number; zone_atb3_r_a: number;
}

/**
 * Calculates weights for zones based on Tendencies (Bias) AND Archetypes (Role).
 * 
 * Precedence:
 * 1. Archetype Scores (High Spacer = More 3s, High PostScorer = More Paint)
 * 2. Lateral Bias (Left/Right preference)
 */
function calculateZoneWeights(player: Player, tendency: HiddenTendencies) {
    const { lateralBias } = tendency;

    // Convert raw attributes to Archetype Ratings on the fly if not present
    // (This ensures we use the consistent logic from archetypeSystem)
    // Note: In PbP engine, 'p.archetypes' exists. In View, it might not.
    // We try to use existing, or calculate fresh.
    let archs: ArchetypeRatings;
    if ((player as any).archetypes) {
        archs = (player as any).archetypes;
    } else {
        // Mock attr structure for calculation if passing a raw Player object
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
            foulTendency: 50, reb: player.reb
        };
        archs = calculatePlayerArchetypes(mockAttr, player.condition || 100);
    }

    // Base Weights [Left, Center, Right]
    const midWeights = { l: 0.33, c: 0.34, r: 0.33 };
    const threeWeights = { l_corn: 0.15, l_wing: 0.2, c_top: 0.3, r_wing: 0.2, r_corn: 0.15 };

    // --- 1. Archetype Modifiers (Macro Adjustment) ---
    
    // A. Corner Sitter (High Spacer, Low Handler)
    // If Spacer > 80 and Handler < 70, boost corners.
    if (archs.spacer > 80 && archs.handler < 70) {
        threeWeights.l_corn += 0.25; 
        threeWeights.r_corn += 0.25;
        threeWeights.c_top -= 0.3;
    } 
    // B. Top Initiator / Pull-up Shooter (High Handler & Spacer)
    // If Handler > 80 and Spacer > 75, boost Top & Wings
    else if (archs.handler > 80 && archs.spacer > 75) {
        threeWeights.c_top += 0.3;
        threeWeights.l_corn -= 0.1; 
        threeWeights.r_corn -= 0.1;
    }

    // --- 2. Lateral Bias (-1.0 to 1.0) (Micro Adjustment) ---
    // Bias > 0 favors Right, Bias < 0 favors Left
    const biasFactor = 0.6; // Stronger shift

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
    const normMid = midWeights.l + midWeights.c + midWeights.r;
    midWeights.l /= normMid; midWeights.c /= normMid; midWeights.r /= normMid;

    const norm3 = threeWeights.l_corn + threeWeights.l_wing + threeWeights.c_top + threeWeights.r_wing + threeWeights.r_corn;
    threeWeights.l_corn /= norm3; threeWeights.l_wing /= norm3; threeWeights.c_top /= norm3;
    threeWeights.r_wing /= norm3; threeWeights.r_corn /= norm3;

    return { midWeights, threeWeights, archs };
}

/**
 * Distributes total attempts into zones based on player tendencies.
 * Used by Game Engine to decide WHERE shots are taken.
 */
export function distributeAttemptsToZones(
    player: Player,
    totalRimA: number,
    totalMidA: number,
    total3PA: number
): ZoneAttempts {
    const tendency = player.tendencies || generateHiddenTendencies(player);
    const { midWeights, threeWeights, archs } = calculateZoneWeights(player, tendency);

    const result: ZoneAttempts = {
        zone_rim_a: 0, zone_paint_a: 0,
        zone_mid_l_a: 0, zone_mid_c_a: 0, zone_mid_r_a: 0,
        zone_c3_l_a: 0, zone_c3_r_a: 0,
        zone_atb3_l_a: 0, zone_atb3_c_a: 0, zone_atb3_r_a: 0
    };

    // Rim Distribution (Rim vs Paint)
    // Post Scorers stay in Paint/Rim. Slashers go to Rim.
    // If PostScorer > Driver, bias towards Paint (Short mid-range/Post hooks)
    // If Driver > PostScorer, bias towards Rim (Layups/Dunks)
    
    let rimRatio = 0.75;
    if (archs.postScorer > archs.driver + 10) {
        rimRatio = 0.50; // More post hooks (Paint)
    } else if (archs.driver > archs.postScorer + 10) {
        rimRatio = 0.85; // More drives (Rim)
    }

    result.zone_rim_a = Math.round(totalRimA * rimRatio);
    result.zone_paint_a = totalRimA - result.zone_rim_a;

    // Mid Distribution
    result.zone_mid_l_a = Math.round(totalMidA * midWeights.l);
    result.zone_mid_c_a = Math.round(totalMidA * midWeights.c);
    result.zone_mid_r_a = totalMidA - result.zone_mid_l_a - result.zone_mid_c_a;

    // 3PT Distribution
    result.zone_c3_l_a = Math.round(total3PA * threeWeights.l_corn);
    result.zone_atb3_l_a = Math.round(total3PA * threeWeights.l_wing);
    result.zone_atb3_c_a = Math.round(total3PA * threeWeights.c_top);
    result.zone_atb3_r_a = Math.round(total3PA * threeWeights.r_wing);
    result.zone_c3_r_a = total3PA - result.zone_c3_l_a - result.zone_atb3_l_a - result.zone_atb3_c_a - result.zone_atb3_r_a;

    return result;
}

/**
 * Returns a normalized density map (0.0 - 1.0) for UI visualization (Scouting Report).
 * This shows "Where the player WANTS to shoot".
 */
export function getProjectedZoneDensity(player: Player) {
    const tendency = player.tendencies || generateHiddenTendencies(player);
    const { midWeights, threeWeights, archs } = calculateZoneWeights(player, tendency);

    // Identify max weight to normalize opacity
    const allWeights = [
        ...Object.values(midWeights), 
        ...Object.values(threeWeights)
    ];
    const maxW = Math.max(...allWeights);

    // Rim vs Paint density based on archetype
    let rimDens = 0.8;
    let paintDens = 0.4;
    if (archs.postScorer > archs.driver) {
        paintDens = 0.7; // High post activity
        rimDens = 0.6;
    }

    return {
        rim: rimDens, 
        paint: paintDens,
        midL: midWeights.l / maxW,
        midC: midWeights.c / maxW,
        midR: midWeights.r / maxW,
        c3L: threeWeights.l_corn / maxW,
        atb3L: threeWeights.l_wing / maxW,
        atb3C: threeWeights.c_top / maxW,
        atb3R: threeWeights.r_wing / maxW,
        c3R: threeWeights.r_corn / maxW,
    };
}
