
import { Player, DefenseTactic, OffenseTactic, TacticalSliders } from '../../../types';

// ==========================================================================================
//  🛑 FOUL SYSTEM CONFIGURATION & TUNING
//  Global modifiers to adjust the frequency and sensitivity of fouls.
// ==========================================================================================
export const FOUL_CONFIG = {
    // 1. Attribute Weights
    WEIGHTS: {
        COMMON: {
            DEF_CONSISTENCY: 0.35, 
            HUSTLE: 0.10,          
            STAMINA: 0.15          
        },
        POSITIONAL: {
            GUARD: { PER_DEF: 0.15, HELP_IQ: 0.15, AGILITY: 0.10 },
            FORWARD: { PER_DEF: 0.15, HELP_IQ: 0.15, AGILITY: 0.10 },
            BIG: { INT_DEF: 0.15, BLOCK: 0.10, STRENGTH: 0.10, PER_DEF: 0.05 },
            CENTER: { INT_DEF: 0.20, BLOCK: 0.15, STRENGTH: 0.05 }
        }
    },

    // 2. Base Scale & Floor (Tuned for ~21 PF/Team per game)
    // 100 possessions per game, 0.21 chance per possession = ~21 fouls
    BASE_FOUL_RATE: 1.8, 

    // Discipline Rating conversion
    PROPENSITY_SCALE: 15, 

    // 3. Matchup Modifier
    DRAW_FOUL_FACTOR: 0.008, 

    // 4. Tactical Multipliers
    TACTICS: {
        MAN_TO_MAN_MOD: 1.03, // 3% increase for PG, SG, SF, PF
        ZONE_PF_MOD: 1.03,    // 3% increase for PF
        ZONE_C_MOD: 1.05,     // 5% increase for C
        GRIND_OFFENSE_MOD: 1.15 // Grind offense is physical
    },

    // 5. Slider Multipliers
    SLIDERS: {
        DEF_INTENSITY_IMPACT: 0.15, 
        PRESS_IMPACT: 0.10,         
        REB_IMPACT: 0.08            
    },

    // 6. Randomness (Referees)
    VARIANCE: {
        MIN: 0.9, 
        MAX: 1.3  
    },

    // 7. Ejection Rules
    FOUL_LIMIT: 6,
    MIN_MINUTES_FLOOR: 8 
};

/**
 * Calculates foul propensity for a player based on stats and tactics
 */
export function calculateFoulStats(
    defender: Player,
    minutesPlanned: number,
    defTactics: { defenseTactics: DefenseTactic[] },
    oppOffTactics: { offenseTactics: OffenseTactic[] },
    sliders: TacticalSliders,
    matchupOpponent?: Player,
    isStopper: boolean = false
): { pf: number, adjustedMinutes: number } {
    if (minutesPlanned <= 0) return { pf: 0, adjustedMinutes: 0 };

    const C = FOUL_CONFIG;
    const pos = defender.id.includes('_') ? defender.position : defender.position; // Ensure pos access

    // 1. Calculate Discipline Rating
    const commonScore = (defender.defConsist * C.WEIGHTS.COMMON.DEF_CONSISTENCY) + 
                        (defender.hustle * C.WEIGHTS.COMMON.HUSTLE) + 
                        (defender.stamina * C.WEIGHTS.COMMON.STAMINA);
    
    let posScore = 0;
    let skillPenalty = 1.0;

    if (['PG', 'SG', 'G'].includes(pos)) {
        posScore = (defender.perDef * C.WEIGHTS.POSITIONAL.GUARD.PER_DEF) + 
                   (defender.helpDefIq * C.WEIGHTS.POSITIONAL.GUARD.HELP_IQ) + 
                   (defender.agility * C.WEIGHTS.POSITIONAL.GUARD.AGILITY);
        // Penalty for low skill in Man-to-Man
        if (defTactics.defenseTactics.includes('ManToManPerimeter')) {
            if (defender.perDef < 75 || defender.agility < 75) skillPenalty += 0.1;
        }
    } else if (['SF', 'F'].includes(pos)) {
        posScore = (defender.perDef * C.WEIGHTS.POSITIONAL.FORWARD.PER_DEF) + 
                   (defender.helpDefIq * C.WEIGHTS.POSITIONAL.FORWARD.HELP_IQ) + 
                   (defender.agility * C.WEIGHTS.POSITIONAL.FORWARD.AGILITY);
        if (defTactics.defenseTactics.includes('ManToManPerimeter')) {
            if (defender.perDef < 75 || defender.helpDefIq < 75) skillPenalty += 0.1;
        }
    } else if (pos === 'PF') {
        posScore = (defender.perDef * C.WEIGHTS.POSITIONAL.BIG.PER_DEF) + 
                   (defender.intDef * C.WEIGHTS.POSITIONAL.BIG.INT_DEF) + 
                   (defender.blk * C.WEIGHTS.POSITIONAL.BIG.BLOCK) + 
                   (defender.strength * C.WEIGHTS.POSITIONAL.BIG.STRENGTH);
        if (defTactics.defenseTactics.includes('ZoneDefense')) {
            if (defender.intDef < 75 || defender.blk < 75) skillPenalty += 0.12;
        }
    } else if (pos === 'C') {
        posScore = (defender.intDef * C.WEIGHTS.POSITIONAL.CENTER.INT_DEF) + 
                   (defender.blk * C.WEIGHTS.POSITIONAL.CENTER.BLOCK) + 
                   (defender.strength * C.WEIGHTS.POSITIONAL.CENTER.STRENGTH);
        if (defTactics.defenseTactics.includes('ZoneDefense')) {
            if (defender.intDef < 80 || defender.vertical < 70) skillPenalty += 0.15;
        }
    }

    const disciplineRating = commonScore + posScore;
    let foulPropensity = (C.BASE_FOUL_RATE + ((100 - disciplineRating) / C.PROPENSITY_SCALE)) * skillPenalty;

    // 2. Tactical Positional Modifiers
    if (defTactics.defenseTactics.includes('ManToManPerimeter')) {
        if (['PG', 'SG', 'SF', 'PF'].includes(pos)) foulPropensity *= C.TACTICS.MAN_TO_MAN_MOD;
    }
    if (defTactics.defenseTactics.includes('ZoneDefense')) {
        if (pos === 'PF') foulPropensity *= C.TACTICS.ZONE_PF_MOD;
        if (pos === 'C') foulPropensity *= C.TACTICS.ZONE_C_MOD;
    }
    if (oppOffTactics.offenseTactics.includes('Grind')) {
        foulPropensity *= C.TACTICS.GRIND_OFFENSE_MOD;
    }

    // 3. Matchup Modifier (Draw Foul)
    if (matchupOpponent) {
        const drawVal = matchupOpponent.drawFoul || 50;
        const drawEffect = (drawVal - 50) * C.DRAW_FOUL_FACTOR; 
        foulPropensity += Math.max(0, drawEffect);
    }

    // 4. Slider Impact
    if (sliders.defIntensity > 5) {
        foulPropensity *= (1.0 + (sliders.defIntensity - 5) * C.SLIDERS.DEF_INTENSITY_IMPACT);
    }

    // 5. Final Calculation
    const expectedFouls = foulPropensity * (minutesPlanned / 36);
    const randomFactor = C.VARIANCE.MIN + (Math.random() * (C.VARIANCE.MAX - C.VARIANCE.MIN));
    const finalEstimate = expectedFouls * randomFactor;

    let pf = Math.floor(finalEstimate);
    if (Math.random() < (finalEstimate - pf)) pf += 1;

    let adjustedMinutes = minutesPlanned;
    if (pf >= C.FOUL_LIMIT) {
        pf = C.FOUL_LIMIT;
        const foulOutRatio = C.FOUL_LIMIT / Math.max(6.1, finalEstimate);
        adjustedMinutes = Math.max(C.MIN_MINUTES_FLOOR, Math.floor(minutesPlanned * foulOutRatio));
    }

    return { pf, adjustedMinutes };
}
