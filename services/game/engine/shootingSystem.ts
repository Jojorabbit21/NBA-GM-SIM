
import { Player, HiddenTendencies, PlayerStats } from '../../../types';
import { SIM_CONFIG } from '../config/constants';
import { ShootingResult, OpponentDefensiveMetrics, PerfModifiers } from './types';
import { calculateAceStopperImpact } from './aceStopperSystem';
import { distributeAttemptsToZones } from './shotDistribution'; // New import
import { generateHiddenTendencies } from '../../../utils/hiddenTendencies';

export function calculateShootingStats(
    p: Player,
    mp: number,
    fga: number,
    tactics: { offense: string[] },
    modifiers: PerfModifiers,
    oppDefMetrics: OpponentDefensiveMetrics,
    oppHasStopper: boolean,
    stopperId: string | undefined,
    acePlayerId: string,
    stopperPlayer?: Player,
    stopperMP: number = 0
): ShootingResult {
    const C = SIM_CONFIG.SHOOTING;
    const { effectivePerfDrop, homeAdvantage, hastePenalty, mentalClutchBonus } = modifiers;
    
    // Ensure tendencies
    const tendencies = p.tendencies || generateHiddenTendencies(p);
    const { lateralBias, archetype } = tendencies;

    // --- Step 1: Determine Volume (Attempts) by Range ---
    // [Update] Boosted Base Tendencies for Modern NBA (2025-26)
    const threeAvg = (p.threeCorner + p.three45 + p.threeTop) / 3;
    let base3PTendency = 0;

    if (threeAvg >= 90) base3PTendency = 0.55;       // Elite (Curry range)
    else if (threeAvg >= 85) base3PTendency = 0.48;  // Great
    else if (threeAvg >= 80) base3PTendency = 0.40;  // Good
    else if (threeAvg >= 75) base3PTendency = 0.32;  // Average (League avg is high now)
    else if (threeAvg >= 70) base3PTendency = 0.15;  // Occasional
    else base3PTendency = 0.05;                      // Non-shooter

    // [Update] Positional Penalty relaxed for Stretch Bigs
    if (['C', 'PF'].includes(p.position)) {
        // Only penalize if they are primarily post players or poor shooters
        if (archetype === 'Elbow Operator' || threeAvg < 75) {
            base3PTendency *= 0.80; 
        }
        // Stretch bigs (Archtypes 'Balanced' or 'Top Initiator' with high 3PT) get no penalty
    }

    // [Update] Slasher Penalty relaxed (Many slashers now shoot 3s)
    // Old: if (p.ins > threeAvg + 15) base3PTendency *= 0.5;
    if (p.ins > threeAvg + 20) {
        base3PTendency *= 0.85; // Only slight reduction
    }

    // [Update] Tactical Multipliers Boosted
    let tacticMult = 1.0;
    if (tactics.offense.includes('SevenSeconds')) tacticMult = 1.35; // Significant boost
    else if (tactics.offense.includes('PaceAndSpace')) tacticMult = 1.25;
    else if (tactics.offense.includes('PerimeterFocus')) tacticMult = (threeAvg > 75) ? 1.20 : 0.9;
    else if (tactics.offense.includes('PostFocus')) tacticMult = 0.85; // Reduce 3s for post focus
    else if (tactics.offense.includes('Grind')) tacticMult = 0.90;

    // Calculate Raw Attempts
    let p3a = Math.round(fga * base3PTendency * tacticMult);

    // [Update] Relaxed Hard Caps for High Volume
    // Diminishing returns starts at 14 attempts now (was 10)
    // [CRITICAL FIX] Added Math.round to prevent floating point attempts (e.g. 16.4 attempts)
    if (p3a > 14) p3a = Math.round(14 + (p3a - 14) * 0.4); 
    
    // Low rating hard caps
    if (threeAvg < 60) p3a = Math.min(p3a, 1);       // Can't shoot
    else if (threeAvg < 70) p3a = Math.min(p3a, 4);  // Bad shooter max 4
    
    // Safety clamp
    if (p3a > fga) p3a = fga;

    const twoPa = fga - p3a;
    const rimAttr = (p.layup + p.dunk + p.postPlay + p.closeShot) / 4;
    const midAttr = p.midRange;
    
    let rimBias = 0.5; 
    if (['C', 'PF'].includes(p.position)) rimBias = 0.75;
    if (rimAttr > midAttr + 10) rimBias += 0.15;
    else if (midAttr > rimAttr + 10) rimBias -= 0.15;
    if (tactics.offense.includes('PostFocus')) rimBias += 0.1;
    
    let rimA = Math.round(twoPa * Math.min(0.95, Math.max(0.05, rimBias)));
    let midA = twoPa - rimA;

    // --- Step 2: Distribute Attempts to Specific 10 Zones ---
    const zoneAttempts = distributeAttemptsToZones(p, rimA, midA, p3a);

    // --- Step 3: Calculate Makes per Zone (Applying Off-Spot Penalty) ---
    // Helper to calc makes with off-spot logic
    const calcMakes = (attempts: number, basePct: number, zoneSide: 'L' | 'R' | 'C') => {
        if (attempts <= 0) return 0;

        let penalty = 0;
        // Off-Spot Penalty Logic:
        // If Player prefers Right (Bias > 0.2) but shoots Left -> Penalty
        // If Player prefers Left (Bias < -0.2) but shoots Right -> Penalty
        if (zoneSide === 'L' && lateralBias > 0.2) penalty = 0.05; // -5%
        else if (zoneSide === 'R' && lateralBias < -0.2) penalty = 0.05; // -5%

        const finalPct = Math.max(0.10, basePct - penalty);
        return Math.round(attempts * finalPct);
    };

    // Calculate Base PCTs for Ranges
    const tacticInteriorBonus = tactics.offense.includes('PostFocus') ? 1.08 : 1.0;
    const tacticPerimeterBonus = tactics.offense.includes('PerimeterFocus') ? 1.06 : 
                                 (tactics.offense.includes('PaceAndSpace') ? 1.08 : 
                                 (tactics.offense.includes('SevenSeconds') ? 1.10 : 1.0));

    const rimAbility = (rimAttr * 0.7 + p.strength * 0.2 + p.vertical * 0.1) * tacticInteriorBonus * (1 - effectivePerfDrop);
    const rimBasePct = Math.min(0.85, Math.max(0.30, 
      C.INSIDE_BASE_PCT + (rimAbility - oppDefMetrics.intDef) * C.INSIDE_DEF_IMPACT 
      - (oppDefMetrics.block * 0.001) - (hastePenalty * 0.5) + mentalClutchBonus + homeAdvantage
    ));

    const midAbility = (midAttr * 0.8 + p.shotIq * 0.2) * tacticPerimeterBonus * (1 - effectivePerfDrop);
    const midBasePct = Math.min(0.60, Math.max(0.20, 
      C.MID_BASE_PCT + (midAbility - oppDefMetrics.perDef) * C.MID_DEF_IMPACT 
      - (oppDefMetrics.pressure * 0.001) - hastePenalty + mentalClutchBonus + homeAdvantage
    ));

    const threeBasePct = Math.min(0.50, Math.max(0.20, 
       C.THREE_BASE_PCT + ((threeAvg - oppDefMetrics.perDef) * C.THREE_DEF_IMPACT 
       - effectivePerfDrop - (hastePenalty * 0.8) + (mentalClutchBonus * 0.5) + (homeAdvantage * 0.8)
    ));

    // Calculate Zone Makes
    const z = zoneAttempts;
    const zm = {
        rim: calcMakes(z.zone_rim_a, rimBasePct, 'C'),
        paint: calcMakes(z.zone_paint_a, rimBasePct * 0.7, 'C'), // Paint harder than Rim
        
        midL: calcMakes(z.zone_mid_l_a, midBasePct, 'L'),
        midC: calcMakes(z.zone_mid_c_a, midBasePct, 'C'),
        midR: calcMakes(z.zone_mid_r_a, midBasePct, 'R'),
        
        c3L: calcMakes(z.zone_c3_l_a, threeBasePct * 1.05, 'L'), // Corner bonus
        c3R: calcMakes(z.zone_c3_r_a, threeBasePct * 1.05, 'R'),
        atb3L: calcMakes(z.zone_atb3_l_a, threeBasePct, 'L'),
        atb3C: calcMakes(z.zone_atb3_c_a, threeBasePct, 'C'),
        atb3R: calcMakes(z.zone_atb3_r_a, threeBasePct, 'R'),
    };

    // --- Step 4: Aggregate Results ---
    let rimM = zm.rim + zm.paint;
    let midM = zm.midL + zm.midC + zm.midR;
    let p3m = zm.c3L + zm.c3R + zm.atb3L + zm.atb3C + zm.atb3R;

    // Stopper Effect (Applied to totals for simplicity, could apply to zones)
    const isAceTarget = !!(oppHasStopper && p.id === acePlayerId && stopperId && stopperMP > 0);
    let matchupEffect = 0;

    if (isAceTarget && stopperPlayer) {
        const advancedImpact = calculateAceStopperImpact(p, stopperPlayer, stopperMP);
        let overlapRatio = stopperMP >= mp ? 1.0 : (stopperMP / mp);
        
        let freedomBonus = 0;
        const minutesWithoutStopper = Math.max(0, mp - stopperMP);
        if (minutesWithoutStopper > 5) freedomBonus = Math.min(10, (minutesWithoutStopper - 5) * 0.8);

        matchupEffect = Math.round((advancedImpact * overlapRatio) + freedomBonus);
        const factor = (1.0 + (matchupEffect / 100));
        
        rimM = Math.round(rimM * factor);
        midM = Math.round(midM * factor);
        p3m = Math.round(p3m * factor);
        
        // Scale down individual zones roughly
        // (Optimization: We don't scale distinct zones here to save perf, usually only totals matter for box score)
    }

    // Consistency Checks
    if (rimM > rimA) rimM = rimA;
    if (midM > midA) midM = midA;
    if (p3m > p3a) p3m = p3a;

    const fgm = rimM + midM + p3m;
    
    // Free Throws
    const drawFoulRate = (p.drawFoul * 0.6 + p.agility * 0.2 + rimBias * 20) / 400;
    const fta = Math.round(fga * drawFoulRate);
    const ftHca = homeAdvantage > 0 ? 0.02 : -0.01; 
    const ftm = Math.round(fta * ((p.ft / 100) + mentalClutchBonus + ftHca));
    const pts = (fgm - p3m) * 2 + p3m * 3 + ftm;

    // Construct Zone Data for Box Score
    const zoneData: Partial<PlayerStats> = {
        zone_rim_m: zm.rim, zone_rim_a: z.zone_rim_a,
        zone_paint_m: zm.paint, zone_paint_a: z.zone_paint_a,
        zone_mid_l_m: zm.midL, zone_mid_l_a: z.zone_mid_l_a,
        zone_mid_c_m: zm.midC, zone_mid_c_a: z.zone_mid_c_a,
        zone_mid_r_m: zm.midR, zone_mid_r_a: z.zone_mid_r_a,
        zone_c3_l_m: zm.c3L, zone_c3_l_a: z.zone_c3_l_a,
        zone_c3_r_m: zm.c3R, zone_c3_r_a: z.zone_c3_r_a,
        zone_atb3_l_m: zm.atb3L, zone_atb3_l_a: z.zone_atb3_l_a,
        zone_atb3_c_m: zm.atb3C, zone_atb3_c_a: z.zone_atb3_c_a,
        zone_atb3_r_m: zm.atb3R, zone_atb3_r_a: z.zone_atb3_r_a,
    };

    return { 
        pts, fgm, fga, p3m, p3a, ftm, fta, rimM, rimA, midM, midA, 
        matchupEffect, isAceTarget, zoneData 
    };
}
