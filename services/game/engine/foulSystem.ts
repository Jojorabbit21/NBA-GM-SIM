
import { Player, DefenseTactic, OffenseTactic, TacticalSliders } from '../../../types';

// ==========================================================================================
//  🛑 FOUL SYSTEM CONFIGURATION & TUNING
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

    // 2. Base Scale (Tuned for ~21 PF/Team per game)
    // 상향 조정: 기존 1.8 -> 4.2 (경기당 개인 파울 기대값의 베이스라인)
    BASE_FOUL_RATE: 4.2, 

    // Discipline Rating conversion
    PROPENSITY_SCALE: 12, 

    // 3. Matchup Modifier
    DRAW_FOUL_FACTOR: 0.015, 

    // 4. Tactical Multipliers
    TACTICS: {
        MAN_TO_MAN_MOD: 1.10,
        ZONE_PF_MOD: 1.05,
        ZONE_C_MOD: 1.08,
        GRIND_OFFENSE_MOD: 1.25
    },

    // 5. Slider Multipliers
    SLIDERS: {
        DEF_INTENSITY_IMPACT: 0.25, 
        PRESS_IMPACT: 0.15,         
        REB_IMPACT: 0.10            
    },

    // 6. Randomness
    VARIANCE: {
        MIN: 0.85, 
        MAX: 1.15  
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
): { pf: number, foulScore: number } {
    if (minutesPlanned <= 0) return { pf: 0, foulScore: 0 };

    const C = FOUL_CONFIG;
    const pos = defender.position;

    // 1. Calculate Discipline Rating (높을수록 파울을 안함)
    const commonScore = (defender.defConsist * C.WEIGHTS.COMMON.DEF_CONSISTENCY) + 
                        (defender.hustle * C.WEIGHTS.COMMON.HUSTLE) + 
                        (defender.stamina * C.WEIGHTS.COMMON.STAMINA);
    
    let posScore = 0;
    let skillPenalty = 1.0;

    if (['PG', 'SG', 'G'].includes(pos)) {
        posScore = (defender.perDef * C.WEIGHTS.POSITIONAL.GUARD.PER_DEF) + 
                   (defender.helpDefIq * C.WEIGHTS.POSITIONAL.GUARD.HELP_IQ) + 
                   (defender.agility * C.WEIGHTS.POSITIONAL.GUARD.AGILITY);
        if (defTactics.defenseTactics.includes('ManToManPerimeter')) {
            if (defender.perDef < 75) skillPenalty += 0.15;
        }
    } else if (['SF', 'F', 'PF'].includes(pos)) {
        posScore = (defender.perDef * C.WEIGHTS.POSITIONAL.FORWARD.PER_DEF) + 
                   (defender.intDef * 0.1) +
                   (defender.helpDefIq * 0.1);
    } else if (pos === 'C') {
        posScore = (defender.intDef * C.WEIGHTS.POSITIONAL.CENTER.INT_DEF) + 
                   (defender.blk * C.WEIGHTS.POSITIONAL.CENTER.BLOCK) + 
                   (defender.strength * C.WEIGHTS.POSITIONAL.CENTER.STRENGTH);
    }

    const disciplineRating = commonScore + posScore;
    // 파울 성향 점수 산출
    let foulPropensity = (C.BASE_FOUL_RATE + ((100 - disciplineRating) / C.PROPENSITY_SCALE)) * skillPenalty;

    // 2. Tactical Positional Modifiers
    if (defTactics.defenseTactics.includes('ManToManPerimeter')) foulPropensity *= C.TACTICS.MAN_TO_MAN_MOD;
    if (oppOffTactics.offenseTactics.includes('Grind')) foulPropensity *= C.TACTICS.GRIND_OFFENSE_MOD;

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
    const foulScore = expectedFouls * randomFactor;

    // 반올림하여 박스스코어용 정수 반환
    let pf = Math.floor(foulScore);
    if (Math.random() < (foulScore - pf)) pf += 1;

    return { pf, foulScore };
}
