
import { Player, HiddenTendencies, PlayerStats, TacticalSliders } from '../../../types';
import { SIM_CONFIG } from '../config/constants';
import { ShootingResult, OpponentDefensiveMetrics, PerfModifiers } from './types';
import { calculateAceStopperImpact } from './aceStopperSystem';
import { distributeAttemptsToZones } from './shotDistribution'; 
import { generateHiddenTendencies } from '../../../utils/hiddenTendencies';

export function calculateShootingStats(
    p: Player,
    mp: number,
    fga: number,
    tactics: { offense: string[] },
    sliders: TacticalSliders, // [New] Needed for Pace check
    modifiers: PerfModifiers,
    oppDefMetrics: OpponentDefensiveMetrics,
    oppHasStopper: boolean,
    stopperId: string | undefined,
    acePlayerId: string,
    stopperPlayer?: Player,
    stopperMP: number = 0
): ShootingResult {
    const C = SIM_CONFIG.SHOOTING;
    const { effectivePerfDrop, homeAdvantage, mentalClutchBonus } = modifiers;
    
    // Ensure tendencies
    let lateralBias = 0;
    if (p.tendencies) {
        // Map 0-3 scale (DB) to -1~1 scale (Runtime) for calculation consistency
        // 0: Strong Left, 1: Left, 2: Right, 3: Strong Right
        const tb = p.tendencies.lateral_bias;
        if (tb === 0) lateralBias = -0.8;
        else if (tb === 1) lateralBias = -0.4;
        else if (tb === 2) lateralBias = 0.4;
        else if (tb === 3) lateralBias = 0.8;
    } else {
        const ht = p.hiddenTendencies || generateHiddenTendencies(p);
        lateralBias = ht.lateralBias;
    }

    // --- Step 0: Calculate Haste Penalty (The "Rush" Factor) ---
    // High pace reduces accuracy unless player has high composure.
    let hasteMalus = 0;
    const pace = sliders.pace;
    
    if (pace > 6) {
        // Base penalty scales with pace above 6
        // Pace 7: -5%, Pace 8: -10%, Pace 9: -15%, Pace 10: -20% (Base)
        const basePacePenalty = (pace - 6) * 0.05; 
        
        // Calculate "Composure" Rating (Ability to play fast without error)
        // Weighted: ShotIQ (45%) + OffConsist (40%) + Intangibles (15%)
        const composure = (p.shotIq * 0.45) + (p.offConsist * 0.40) + (p.intangibles * 0.15);
        
        // Mitigation Factor: 
        // Composure 100 -> 100% Mitigation (No Penalty)
        // Composure 70  -> 30% Penalty Applied
        // Composure 50  -> 50% Penalty Applied
        const mitigation = Math.min(1.0, composure / 100);
        
        // Final Penalty applied to percentages (e.g. -0.05 for -5%)
        hasteMalus = basePacePenalty * (1 - mitigation);
        
        // Cap penalty (Max -15% realistic impact)
        hasteMalus = Math.min(0.15, hasteMalus);
    }


    // --- Step 1: Determine Volume (Attempts) by Range ---
    // [Update] Boosted Base Tendencies for Modern NBA (2025-26)
    // Even average shooters shoot more 3s now. Base rate ~40%
    const threeAvg = (p.threeCorner + p.three45 + p.threeTop) / 3;
    let base3PTendency = 0;

    if (threeAvg >= 90) base3PTendency = 0.65;       // Elite (Curry/Dame range)
    else if (threeAvg >= 85) base3PTendency = 0.55;  // Great
    else if (threeAvg >= 80) base3PTendency = 0.48;  // Good
    else if (threeAvg >= 75) base3PTendency = 0.40;  // Solid (League Standard ~40%)
    else if (threeAvg >= 70) base3PTendency = 0.25;  // Capable
    else if (threeAvg >= 65) base3PTendency = 0.15;  // Occasional
    else base3PTendency = 0.02;                      // Non-shooter

    // [Update] Advanced Role-Based Tactic Modifiers
    // Compressed range to prevent extreme drops. (0.85 ~ 1.25)
    let tacticMult = 1.0;
    const isBig = ['C', 'PF'].includes(p.position);
    
    if (tactics.offense.includes('PostFocus')) {
        // [Logic Change] Post Focus shouldn't kill 3s. It creates kick-outs.
        if (isBig) {
            // Bigs focus inside unless they are elite stretch bigs
            if (threeAvg < 82) tacticMult = 0.85; 
            else tacticMult = 1.0; // Stretch bigs still space the floor
        } else {
            // Guards/Wings get MORE 3s from kick-outs
            tacticMult = 1.10; 
        }
    }
    else if (tactics.offense.includes('PerimeterFocus')) {
        // PnR heavy. Handlers shoot, Rollers roll.
        if (isBig && threeAvg < 75) {
            tacticMult = 0.80; // Hard Roller
        } else {
            tacticMult = 1.15; // Handlers & Spacers shoot more
        }
    }
    else if (tactics.offense.includes('PaceAndSpace')) {
        tacticMult = 1.25; // Everyone green light
    }
    else if (tactics.offense.includes('SevenSeconds')) {
        tacticMult = 1.25; // Extreme pace
    }
    else if (tactics.offense.includes('Grind')) {
        tacticMult = 0.95; // Slightly conservative
    }

    // [Update] Slasher Penalty (Context Aware)
    // If a player is a slasher but the tactic is PaceAndSpace, they should slash less and shoot more 3s if capable.
    if (p.ins > threeAvg + 15) {
        // Only penalize if 3PT rating is mediocre
        if (threeAvg < 80) base3PTendency *= 0.90;
    }

    // Calculate Raw Attempts
    let p3a = Math.round(fga * base3PTendency * tacticMult);

    // [New] Modern Era Floor (The "3-Point Revolution" Correction)
    // Capable shooters (70+) should essentially NEVER shoot 0 threes in high minutes.
    // Ensure at least 35% of shots are 3s for capable shooters.
    // threeAvg threshold modified from 70 to 80 by User. DO NOT CHANGE.
    if (threeAvg >= 80 && fga >= 5) {
        const modernFloor = Math.round(fga * 0.35); 
        if (p3a < modernFloor) {
            // Force up to the floor
            p3a = modernFloor;
        }
    }

    // Soft Cap for High Volume (Prevent 20 3PA/game unless truly elite volume shooter)
    // If 3PA > 14, dampen the excess
    if (p3a > 14) {
        p3a = 14 + Math.round((p3a - 14) * 0.5);
    }
    
    // Hard Logic Caps
    if (threeAvg < 60) p3a = Math.min(p3a, 1);       
    else if (threeAvg < 65) p3a = Math.min(p3a, 3);  
    
    // Safety clamp
    if (p3a > fga) p3a = fga;

    const twoPa = fga - p3a;
    const rimAttr = (p.layup + p.dunk + p.postPlay + p.closeShot) / 4;
    const midAttr = p.midRange;
    
    // Rim vs Mid-Range Distribution
    let rimBias = 0.5; 
    if (isBig) rimBias = 0.80; // Bigs naturally gravitate to rim
    
    // Attribute Bias
    if (rimAttr > midAttr + 10) rimBias += 0.15;
    else if (midAttr > rimAttr + 10) rimBias -= 0.15;
    
    // Tactic Bias
    if (tactics.offense.includes('PostFocus')) rimBias += 0.15;
    if (tactics.offense.includes('PerimeterFocus')) rimBias -= 0.05; // More mid-range pullups
    if (tactics.offense.includes('PaceAndSpace')) rimBias += 0.10; // More rim or 3s (Moreyball)
    
    let rimA = Math.round(twoPa * Math.min(0.95, Math.max(0.05, rimBias)));
    let midA = twoPa - rimA;

    // --- Step 2: Distribute Attempts to Specific 10 Zones ---
    const zoneAttempts = distributeAttemptsToZones(p, rimA, midA, p3a);

    // --- Step 3: Calculate Makes per Zone (Applying Off-Spot Penalty) ---
    const calcMakes = (attempts: number, basePct: number, zoneSide: 'L' | 'R' | 'C') => {
        if (attempts <= 0) return 0;

        let penalty = 0;
        if (zoneSide === 'L' && lateralBias > 0.2) penalty = 0.05; 
        else if (zoneSide === 'R' && lateralBias < -0.2) penalty = 0.05; 

        const finalPct = Math.max(0.10, basePct - penalty);
        return Math.round(attempts * finalPct);
    };

    // Calculate Base PCTs for Ranges
    const tacticInteriorBonus = tactics.offense.includes('PostFocus') ? 1.08 : 1.0;
    const tacticPerimeterBonus = tactics.offense.includes('PerimeterFocus') ? 1.06 : 
                                 (tactics.offense.includes('PaceAndSpace') ? 1.08 : 
                                 (tactics.offense.includes('SevenSeconds') ? 1.10 : 1.0));

    // [Update] Apply Haste Malus (Calculated above) to Base Percentages
    const rimAbility = (rimAttr * 0.7 + p.strength * 0.2 + p.vertical * 0.1) * tacticInteriorBonus * (1 - effectivePerfDrop);
    const rimBasePct = Math.min(0.85, Math.max(0.30, 
      C.INSIDE_BASE_PCT + (rimAbility - oppDefMetrics.intDef) * C.INSIDE_DEF_IMPACT 
      - (oppDefMetrics.block * 0.001) - (hasteMalus * 0.5) + mentalClutchBonus + homeAdvantage
    ));

    const midAbility = (midAttr * 0.8 + p.shotIq * 0.2) * tacticPerimeterBonus * (1 - effectivePerfDrop);
    const midBasePct = Math.min(0.60, Math.max(0.20, 
      C.MID_BASE_PCT + (midAbility - oppDefMetrics.perDef) * C.MID_DEF_IMPACT 
      - (oppDefMetrics.pressure * 0.001) - hasteMalus + mentalClutchBonus + homeAdvantage
    ));

    // [Balance Fix] 3PT Hard Cap reduced from 0.50 to 0.42 (42%)
    // Base is 0.27. Elite (99) vs Avg Def (75) -> +24 diff * 0.005 = +0.12. Total 0.39.
    // Tactic bonus might push it to ~0.42.
    const threeBasePct = Math.min(0.42, Math.max(0.18, 
       C.THREE_BASE_PCT + ((threeAvg - oppDefMetrics.perDef) * C.THREE_DEF_IMPACT) 
       - effectivePerfDrop - hasteMalus + (mentalClutchBonus * 0.5) + (homeAdvantage * 0.8)
    ));

    // Calculate Zone Makes
    const z = zoneAttempts;
    const zm = {
        rim: calcMakes(z.zone_rim_a, rimBasePct, 'C'),
        paint: calcMakes(z.zone_paint_a, rimBasePct * 0.7, 'C'), 
        
        midL: calcMakes(z.zone_mid_l_a, midBasePct, 'L'),
        midC: calcMakes(z.zone_mid_c_a, midBasePct, 'C'),
        midR: calcMakes(z.zone_mid_r_a, midBasePct, 'R'),
        
        c3L: calcMakes(z.zone_c3_l_a, threeBasePct * 1.05, 'L'), 
        c3R: calcMakes(z.zone_c3_r_a, threeBasePct * 1.05, 'R'),
        atb3L: calcMakes(z.zone_atb3_l_a, threeBasePct, 'L'),
        atb3C: calcMakes(z.zone_atb3_c_a, threeBasePct, 'C'),
        atb3R: calcMakes(z.zone_atb3_r_a, threeBasePct, 'R'),
    };

    // --- Step 4: Aggregate Results ---
    let rimM = zm.rim + zm.paint;
    let midM = zm.midL + zm.midC + zm.midR;
    let p3m = zm.c3L + zm.c3R + zm.atb3L + zm.atb3C + zm.atb3R;

    // Stopper Effect
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
