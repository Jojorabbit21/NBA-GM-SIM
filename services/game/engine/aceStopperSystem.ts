
import { Player } from '../../../types';

// ==========================================================================================
//  🛡️ ADVANCED ACE STOPPER ALGORITHM
//  Core Philosophy: Physical Relativity & Motor
// ==========================================================================================

export type AceArchetype = 'Speedster' | 'Bully' | 'Shooter' | 'Balanced';

/**
 * Calculates the defensive impact (percentage modifier) of a stopper against an ace.
 * Returns a value typically between -50 (Lockdown) and +30 (Cooked).
 * Negative values reduce the Ace's FG%, Positive values increase it.
 */
export function calculateAceStopperImpact(
    ace: Player, 
    stopper: Player, 
    stopperMinutesPlayed: number
): number {
    
    // 1. Identify Ace Archetype & Key Physical Stat
    const { archetype, primaryStatVal } = identifyArchetype(ace);
    
    // 2. Calculate Physical Matchup Delta (The "Body" Battle)
    const physicalDelta = calculatePhysicalDelta(archetype, ace, stopper);

    // 3. Calculate Technical Matchup Delta (The "Skill" Battle)
    // Compare Stopper's Perimeter Defense & IQ vs Ace's Offensive Consistency & IQ
    const techValStopper = (stopper.perDef * 0.6) + (stopper.helpDefIq * 0.2) + (stopper.steal * 0.2);
    const techValAce = (ace.offConsist * 0.5) + (ace.shotIq * 0.3) + (ace.handling * 0.2);
    const techDelta = techValStopper - techValAce;

    // 4. Calculate Base Impact Score
    // Physical advantages matter more for Stoppers (60%) than pure skill (40%) in 1-on-1 denial
    let baseImpact = (physicalDelta * 0.6) + (techDelta * 0.4);

    // 5. "The Motor" - Hustle & Recovery Logic
    // If baseImpact is negative (Stopper is losing), Hustle gives a chance to recover (Chase-down, Poke-away)
    if (baseImpact < 0) {
        const recoveryRoll = Math.random() * 100;
        // High hustle allows recovery even when physically outmatched
        if (recoveryRoll < stopper.hustle) {
            const recoveryBonus = (stopper.hustle - 50) * 0.3; 
            baseImpact += recoveryBonus; // Mitigate the loss
        }
    } else {
        // If Stopper is winning, High Hustle acts as a "Clamp" (preventing lucky breaks)
        baseImpact += (stopper.hustle - 50) * 0.1;
    }

    // 6. Fatigue & Efficiency Decay (The "Legs" Battle)
    // Stopper efficiency drops drastically if they are more tired than the Ace
    const fatiguePenalty = calculateFatiguePenalty(ace, stopper, stopperMinutesPlayed);
    
    // Apply Fatigue: Reduces the defensive impact. 
    // If Stopper was winning (positive impact), fatigue reduces it towards 0 or negative.
    // If Stopper was losing (negative impact), fatigue makes it worse.
    let finalScore = baseImpact - fatiguePenalty;

    // 7. Normalize to Percentage Modifier
    // Score typically ranges -20 to +20. Map to percentage roughly 1:1.2
    // We invert the sign here because:
    // Positive Score (Stopper Win) -> Negative Matchup Effect (Lower FG%)
    // Negative Score (Stopper Lose) -> Positive Matchup Effect (Higher FG%)
    
    let matchupEffect = -(finalScore * 1.2); 

    // Cap the effect (Max -50% FG impact, Max +40% FG impact)
    return Math.max(-50, Math.min(40, Math.round(matchupEffect)));
}

function identifyArchetype(p: Player): { archetype: AceArchetype, primaryStatVal: number } {
    const spdScore = (p.speed + p.agility) / 2;
    const strScore = p.strength;
    const shootScore = (p.vertical + p.agility) / 2; // Vertical helps creating separation on jumpers

    if (spdScore >= 90 && spdScore > strScore && spdScore > shootScore) {
        return { archetype: 'Speedster', primaryStatVal: spdScore };
    }
    if (strScore >= 85 && strScore > spdScore) {
        return { archetype: 'Bully', primaryStatVal: strScore };
    }
    if (shootScore > spdScore && shootScore > strScore) {
        return { archetype: 'Shooter', primaryStatVal: shootScore };
    }
    return { archetype: 'Balanced', primaryStatVal: (spdScore + strScore + shootScore) / 3 };
}

function calculatePhysicalDelta(type: AceArchetype, ace: Player, stopper: Player): number {
    switch (type) {
        case 'Speedster':
            // Stopper needs Speed & Agility to stay in front.
            // If Stopper is slower, they get blown by.
            const aceSpd = (ace.speed + ace.agility) / 2;
            const stopSpd = (stopper.speed + stopper.agility) / 2;
            return stopSpd - aceSpd; // Positive if Stopper is faster

        case 'Bully':
            // Stopper needs Strength to absorb contact.
            // If Stopper is weaker, they get bumped off spots.
            return stopper.strength - ace.strength;

        case 'Shooter':
            // Stopper needs Vertical (contest) and Agility (screen navigation).
            const aceIso = (ace.vertical + ace.agility) / 2;
            const stopContest = (stopper.vertical + stopper.agility) / 2;
            return stopContest - aceIso;

        case 'Balanced':
        default:
             // Average athletic comparison
             return stopper.ath - ace.ath;
    }
}

function calculateFatiguePenalty(ace: Player, stopper: Player, mp: number): number {
    // Condition is 0-100.
    const aceCond = ace.condition || 100;
    const stopCond = stopper.condition || 100;

    // Stopper duty burns legs faster. We check the relative energy levels.
    // If Stopper has significantly less energy than Ace, penalty scales up.
    let delta = aceCond - stopCond; // Positive means Ace has more energy
    
    // Base fatigue from minutes played (heavy legs) even if condition is okay
    let minutesTax = 0;
    if (mp > 30) minutesTax = (mp - 30) * 0.5;

    if (delta > 0) {
        // Ace has energy advantage
        return (delta * 0.5) + minutesTax;
    } else {
        // Stopper has energy advantage (or equal) -> Minimal penalty only from raw minutes
        return Math.max(0, minutesTax);
    }
}
