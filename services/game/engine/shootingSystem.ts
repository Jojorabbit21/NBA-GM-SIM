
import { Player } from '../../../types';
import { SIM_CONFIG } from '../config/constants';
import { ShootingResult, OpponentDefensiveMetrics, PerfModifiers } from './types';

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

    // --- 3PT Attempt Logic Optimization ---
    const threeAvg = (p.threeCorner + p.three45 + p.threeTop) / 3;

    // 1. Calculate 3PT Attempts & Makes
    let base3PTendency = 0;
    if (threeAvg >= 90) base3PTendency = 0.38;
    else if (threeAvg >= 85) base3PTendency = 0.32;
    else if (threeAvg >= 80) base3PTendency = 0.25;
    else if (threeAvg >= 75) base3PTendency = 0.18;
    else if (threeAvg >= 70) base3PTendency = 0.10; 
    else base3PTendency = 0.04;                     

    // Big man penalty for 3PA
    if (['C', 'PF'].includes(p.position)) {
        base3PTendency *= 0.65;
    }

    if (p.ins > threeAvg + 15) base3PTendency *= 0.5; 

    let tacticMult = 1.0;
    if (tactics.offense.includes('PaceAndSpace') || tactics.offense.includes('SevenSeconds')) tacticMult = 1.15;
    if (tactics.offense.includes('PerimeterFocus')) tacticMult = (threeAvg > 80) ? 1.12 : 0.8;

    let p3a = fga * base3PTendency * tacticMult;
    
    // Hard Volume Cap: Applying diminishing returns to 3PA
    if (p3a > 10) {
        p3a = 10 + (p3a - 10) * 0.3;
    }
    p3a = Math.round(p3a);

    if (threeAvg < 65) p3a = Math.min(p3a, 1);
    if (threeAvg < 75) p3a = Math.min(p3a, 6); 
    if (p3a > fga) p3a = fga;

    const p3p = Math.min(0.50, Math.max(0.20, 
       C.THREE_BASE_PCT 
       + ((threeAvg - oppDefMetrics.perDef) * C.THREE_DEF_IMPACT) 
       - effectivePerfDrop 
       - (hastePenalty * 0.8) 
       + (mentalClutchBonus * 0.5) 
       + (homeAdvantage * 0.8)
    )); 
    let p3m = Math.round(p3a * p3p);

    // 2. Calculate 2PT Split (Rim vs Mid)
    const twoPa = fga - p3a;
    
    const rimAttr = (p.layup + p.dunk + p.postPlay + p.closeShot) / 4;
    const midAttr = p.midRange;
    
    // Determine Rim Tendency based on skills and position
    let rimBias = 0.5; // Base split
    if (['C', 'PF'].includes(p.position)) rimBias = 0.75;
    if (rimAttr > midAttr + 10) rimBias += 0.15;
    else if (midAttr > rimAttr + 10) rimBias -= 0.15;
    
    if (tactics.offense.includes('PostFocus')) rimBias += 0.1;
    
    let rimA = Math.round(twoPa * Math.min(0.95, Math.max(0.05, rimBias)));
    let midA = twoPa - rimA;

    // 3. Calculate Rim Makes
    // Tactic Bonus Handling
    const tacticInteriorBonus = tactics.offense.includes('PostFocus') ? 1.08 : 1.0;
    const tacticPerimeterBonus = tactics.offense.includes('PerimeterFocus') ? 1.06 : 
                                 (tactics.offense.includes('PaceAndSpace') ? 1.08 : 
                                 (tactics.offense.includes('SevenSeconds') ? 1.10 : 1.0));

    const rimAbility = (rimAttr * 0.7 + p.strength * 0.2 + p.vertical * 0.1) * tacticInteriorBonus * (1 - effectivePerfDrop);
    const rimSuccessRate = Math.min(0.85, Math.max(0.30, 
      C.INSIDE_BASE_PCT 
      + (rimAbility - oppDefMetrics.intDef) * C.INSIDE_DEF_IMPACT 
      - (oppDefMetrics.block * 0.001) 
      - (hastePenalty * 0.5) 
      + mentalClutchBonus 
      + homeAdvantage
    ));
    let rimM = Math.round(rimA * rimSuccessRate);

    // 4. Calculate Mid-Range Makes
    const midAbility = (midAttr * 0.8 + p.shotIq * 0.2) * tacticPerimeterBonus * (1 - effectivePerfDrop);
    const midSuccessRate = Math.min(0.60, Math.max(0.20, 
      C.MID_BASE_PCT 
      + (midAbility - oppDefMetrics.perDef) * C.MID_DEF_IMPACT 
      - (oppDefMetrics.pressure * 0.001) 
      - hastePenalty 
      + mentalClutchBonus 
      + homeAdvantage
    ));
    let midM = Math.round(midA * midSuccessRate);

    // 5. Stopper Effect
    // Only set as target if stopper actually played (> 0 min)
    const isAceTarget = !!(oppHasStopper && p.id === acePlayerId && stopperId && stopperMP > 0);
    let matchupEffect = 0;

    if (isAceTarget && stopperPlayer) {
        const perDef = stopperPlayer.perDef || 50;
        
        // [Balance Update] Wider Range Calculation (-50% ~ +50%)
        // Formula: 40 - (Defense * 0.9)
        // If Def=100 -> 40 - 90 = -50 (Max Suppression)
        // If Def=40  -> 40 - 36 = +4 (Minor Advantage for Ace)
        let rawImpact = 40 - (perDef * 0.9); 
        
        // Calculate Overlap Factor
        let overlapRatio = stopperMP >= mp ? 1.0 : (stopperMP / mp);
        
        // [Balance Update] Freedom Bonus (Dynamic)
        // If Ace plays without Stopper, bonus increases significantly
        let freedomBonus = 0;
        const minutesWithoutStopper = Math.max(0, mp - stopperMP);
        
        if (minutesWithoutStopper > 0) {
            // +1.2% bonus per minute played without stopper, capped at +35%
            freedomBonus = Math.min(35, minutesWithoutStopper * 1.2); 
        }

        let adjustedImpact = (rawImpact * overlapRatio) + freedomBonus;
        
        // Cap the total impact between -50% and +50%
        adjustedImpact = Math.max(-50, Math.min(50, adjustedImpact)); 
        
        matchupEffect = Math.round(adjustedImpact);
        
        const factor = (1.0 + (matchupEffect / 100));
        rimM = Math.round(rimM * factor);
        midM = Math.round(midM * factor);
        p3m = Math.round(p3m * factor);
    }

    // 6. Final Tally Consistency Check
    const fgm = rimM + midM + p3m;
    if (rimM > rimA) rimM = rimA;
    if (midM > midA) midM = midA;
    if (p3m > p3a) p3m = p3a;

    // 7. Free Throws
    const drawFoulRate = (p.drawFoul * 0.6 + p.agility * 0.2 + rimBias * 20) / 400;
    const fta = Math.round(fga * drawFoulRate * (1.0)); // Removed redundant defIntensity coupling for now
    
    const ftHca = homeAdvantage > 0 ? 0.02 : -0.01; 
    const ftm = Math.round(fta * ((p.ft / 100) + mentalClutchBonus + ftHca));
    const pts = (fgm - p3m) * 2 + p3m * 3 + ftm;

    return { 
        pts, fgm, fga, p3m, p3a, ftm, fta, rimM, rimA, midM, midA, 
        matchupEffect, isAceTarget 
    };
}
