
import { Player, DefenseTactic, OffenseTactic, TacticalSliders } from '../../../types';

// ==========================================================================================
//  🛑 FOUL SYSTEM CONFIGURATION & TUNING
//  Global modifiers to adjust the frequency and sensitivity of fouls.
// ==========================================================================================
export const FOUL_CONFIG = {
    // 1. Attribute Weights (Must sum to 1.0 within their groups ideally, but relative scale matters)
    WEIGHTS: {
        COMMON: {
            DEF_CONSISTENCY: 0.35, // 수비 일관성: 낮으면 멍청한 파울 빈도 증가
            HUSTLE: 0.10,          // 허슬: 높으면 공격적 수비로 인한 파울 가능성
            STAMINA: 0.15          // 지구력: 지치면 발이 느려져 손을 쓰게 됨
        },
        POSITIONAL: {
            GUARD: { PER_DEF: 0.15, HELP_IQ: 0.15, AGILITY: 0.10 }, // 가드: 외곽수비, 헬프수비, 민첩성 중요
            FORWARD: { PER_DEF: 0.15, HELP_IQ: 0.15, AGILITY: 0.10 }, // 포워드: 가드와 동일
            BIG: { INT_DEF: 0.15, BLOCK: 0.10, STRENGTH: 0.10, PER_DEF: 0.05 }, // 빅맨: 골밑수비, 블록, 힘 중요
            CENTER: { INT_DEF: 0.20, BLOCK: 0.15, STRENGTH: 0.05 } // 센터: 골밑수비 비중 극대화
        }
    },

    // 2. Base Scale & Floor (TUNED for NBA Realistic Stats ~21 PF/Team)
    // Previous Settings Resulted in ~32 PF/Team (Too High)
    // Adjustment: Lower Base & Reduce Sensitivity
    
    // Constant foul rate per 36m that applies to everyone
    BASE_FOUL_RATE: 0.8, 

    // How to convert Discipline Rating (0-100) to EXTRA Fouls.
    // Higher scale = Less extra fouls for bad defenders.
    // Rating 75 (Avg) -> Gap 25 -> 25 / 17 = ~1.47 + 0.8 = 2.27 Fouls/36m
    PROPENSITY_SCALE: 17, 

    // 3. Matchup Modifier
    // How much the opponent's 'Draw Foul' attribute affects the defender.
    // Factor: (OppDrawFoul - 50) * DRAW_FOUL_FACTOR
    DRAW_FOUL_FACTOR: 0.006, 

    // 4. Tactical Multipliers (Percentage Increase)
    TACTICS: {
        DEF_AGGRESSIVE: 1.05, // Man-to-Man (Guards/Wings) / Zone (Bigs) increases fouls by 5%
        OFF_MISMATCH: 1.03    // Offensive schemes targeting specific weaknesses increase fouls by 3%
    },

    // 5. Slider Multipliers (New)
    // Adjust foul rates based on intensity sliders (1-10, Default 5)
    SLIDERS: {
        DEF_INTENSITY_IMPACT: 0.12, // Each point above 5 adds 12% foul rate
        PRESS_IMPACT: 0.08,         // Each point above 5 adds 8% foul rate (Guards/Wings)
        REB_IMPACT: 0.05            // Each point above 5 adds 5% foul rate (Loose ball fouls)
    },

    // 6. Randomness (Referees)
    // Reduced ceiling to prevent outlier games with excessive fouls
    VARIANCE: {
        MIN: 0.85, // -15% luck (Strict refs)
        MAX: 1.25  // +25% luck (Whistle happy refs)
    },

    // 7. Ejection Rules
    FOUL_LIMIT: 6,
    // Minimum minutes a player must play even if they foul out rapidly (simulation artifact prevention)
    MIN_MINUTES_FLOOR: 10 
};

/**
 * [Technical Document: Personal Foul Algorithm]
 * 
 * Calculates personal fouls (PF) for a player in a simulated game segment.
 * 
 * 1. **Base Discipline Calculation**:
 *    - Combines 'Common' attributes (Consistency, Hustle, Stamina) with 'Positional' attributes.
 *    - Result is a `disciplineRating` (0-100). Higher means fewer fouls.
 * 
 * 2. **Propensity Conversion**:
 *    - Converts Discipline Rating to a raw `foulPropensity` score.
 *    - Adds `BASE_FOUL_RATE` to ensure minimum realistic foul counts.
 * 
 * 3. **Contextual Modifiers**:
 *    - **Matchup**: Adds penalty if opponent has high `Draw Foul` attribute.
 *    - **Tactics**: Increases probability based on team's defensive aggression or opponent's offensive targeting.
 *    - **Sliders**: Increases probability based on Intensity, Press, and Rebounding aggression.
 * 
 * 4. **Simulation**:
 *    - Scales propensity to actual `minutesPlanned` (extrapolated from Per 36).
 *    - Applies random variance (Referee factor).
 * 
 * 5. **Ejection Handling**:
 *    - If PF >= 6, cap at 6.
 *    - Reduce `adjustedMinutes` proportionally to when the 6th foul likely occurred.
 */
export function calculateFoulStats(
    defender: Player,
    minutesPlanned: number,
    defTactics: { defense: DefenseTactic[] },
    oppOffTactics: { offense: OffenseTactic[] },
    sliders: TacticalSliders,
    matchupOpponent?: Player,
    isStopper: boolean = false
): { pf: number, adjustedMinutes: number } {
    if (minutesPlanned <= 0) return { pf: 0, adjustedMinutes: 0 };

    const C = FOUL_CONFIG;

    // ==================================================================
    // STEP 1: Calculate Discipline Rating (The "Skill" to avoid fouls)
    // ==================================================================
    
    // 1-A. Common Attributes (60% weight of total discipline)
    const commonScore = (defender.defConsist * C.WEIGHTS.COMMON.DEF_CONSISTENCY) + 
                        (defender.hustle * C.WEIGHTS.COMMON.HUSTLE) + 
                        (defender.stamina * C.WEIGHTS.COMMON.STAMINA);
    
    // 1-B. Positional Attributes (40% weight of total discipline)
    let posScore = 0;
    const pos = defender.position;

    if (['PG', 'SG', 'G'].includes(pos)) {
        posScore = (defender.perDef * C.WEIGHTS.POSITIONAL.GUARD.PER_DEF) + 
                   (defender.helpDefIq * C.WEIGHTS.POSITIONAL.GUARD.HELP_IQ) + 
                   (defender.agility * C.WEIGHTS.POSITIONAL.GUARD.AGILITY);
    } else if (['SF', 'F'].includes(pos)) {
        posScore = (defender.perDef * C.WEIGHTS.POSITIONAL.FORWARD.PER_DEF) + 
                   (defender.helpDefIq * C.WEIGHTS.POSITIONAL.FORWARD.HELP_IQ) + 
                   (defender.agility * C.WEIGHTS.POSITIONAL.FORWARD.AGILITY);
    } else if (pos === 'PF') {
        posScore = (defender.perDef * C.WEIGHTS.POSITIONAL.BIG.PER_DEF) + 
                   (defender.intDef * C.WEIGHTS.POSITIONAL.BIG.INT_DEF) + 
                   (defender.blk * C.WEIGHTS.POSITIONAL.BIG.BLOCK) + 
                   (defender.strength * C.WEIGHTS.POSITIONAL.BIG.STRENGTH);
    } else if (pos === 'C') {
        posScore = (defender.intDef * C.WEIGHTS.POSITIONAL.CENTER.INT_DEF) + 
                   (defender.blk * C.WEIGHTS.POSITIONAL.CENTER.BLOCK) + 
                   (defender.strength * C.WEIGHTS.POSITIONAL.CENTER.STRENGTH);
    } else {
        // Fallback for undefined positions
        posScore = (defender.def * 0.40);
    }

    // Total Discipline Rating (0-100)
    const disciplineRating = commonScore + posScore;

    // ==================================================================
    // STEP 2: Convert to Base Foul Propensity
    // ==================================================================
    
    // Base foul rate per 36 mins.
    // Logic: Base Floor + (Skill Gap / Scale)
    let foulPropensity = C.BASE_FOUL_RATE + ((100 - disciplineRating) / C.PROPENSITY_SCALE);

    // ==================================================================
    // STEP 3: Apply Matchup Modifiers
    // ==================================================================
    
    if (matchupOpponent) {
        const drawVal = matchupOpponent.drawFoul || 50;
        // Increase propensity based on opponent's ability to draw contact
        const drawEffect = (drawVal - 50) * C.DRAW_FOUL_FACTOR; 
        foulPropensity += Math.max(0, drawEffect);
    }

    // ==================================================================
    // STEP 4: Apply Tactical & Slider Modifiers
    // ==================================================================

    // 4-A. Defensive Tactics (Static Tactic Bonus)
    if (defTactics.defense.includes('ManToManPerimeter')) {
        // Aggressive perimeter defense leads to reach-ins for guards/wings
        if (['PG', 'SG', 'SF', 'G', 'F'].includes(pos)) foulPropensity *= C.TACTICS.DEF_AGGRESSIVE;
    }
    if (defTactics.defense.includes('ZoneDefense')) {
        // Zone defense exposes bigs to more contest situations
        if (['PF', 'C'].includes(pos)) foulPropensity *= C.TACTICS.DEF_AGGRESSIVE;
    }
    
    // 4-A-2. Ace Stopper Dynamic Logic
    // Compare Stopper Ability vs Ace Threat
    if (isStopper && matchupOpponent) {
        // Stopper Defensive Power: Perimeter Def (40%), Consistency (30%), Agility (20%), Strength (10%)
        const stopperRating = (defender.perDef * 0.4) + 
                              (defender.defConsist * 0.3) + 
                              (defender.agility * 0.2) + 
                              (defender.strength * 0.1);
        
        // Ace Offensive Threat: OVR (50%), Ball Handling (30%), Speed (20%)
        const aceRating = (matchupOpponent.ovr * 0.5) + 
                          (matchupOpponent.handling * 0.3) + 
                          (matchupOpponent.speed * 0.2);

        const diff = aceRating - stopperRating;
        
        // Only increase fouls if Stopper is worse than Ace
        if (diff > 0) {
             // Max penalty 25% if diff is >= 25 points.
             // 1 point diff = 1% increase in fouls
             const penalty = Math.min(0.25, diff * 0.01);
             foulPropensity *= (1.0 + penalty);
        }
        // If Stopper is better (diff <= 0), no penalty applied (neutral)
    }

    // 4-B. Opponent Offensive Tactics (Pressure Points)
    const oppTacticsList = oppOffTactics.offense;
    if (oppTacticsList.includes('PostFocus')) {
        // Opponent pounding inside -> Bigs foul more
        if (['PF', 'C'].includes(pos)) foulPropensity *= C.TACTICS.OFF_MISMATCH;
    }
    if (oppTacticsList.includes('PaceAndSpace') || oppTacticsList.includes('SevenSeconds')) {
        // Opponent spreading floor -> Wings foul more closing out
        if (['SG', 'SF', 'F'].includes(pos)) foulPropensity *= C.TACTICS.OFF_MISMATCH;
    }
    if (oppTacticsList.includes('PerimeterFocus')) {
        // Opponent PnR heavy -> Guards foul more fighting screens
        if (['PG', 'G'].includes(pos)) foulPropensity *= C.TACTICS.OFF_MISMATCH;
    }

    // 4-C. Slider Adjustments (Dynamic Intensity)
    // Defensive Intensity (Global)
    if (sliders.defIntensity > 5) {
        const intensityMult = 1.0 + ((sliders.defIntensity - 5) * C.SLIDERS.DEF_INTENSITY_IMPACT);
        foulPropensity *= intensityMult;
    }

    // Full Court Press (Guards/Wings)
    if (sliders.fullCourtPress > 5 && ['PG', 'SG', 'SF', 'G', 'F'].includes(pos)) {
        const pressMult = 1.0 + ((sliders.fullCourtPress - 5) * C.SLIDERS.PRESS_IMPACT);
        foulPropensity *= pressMult;
    }

    // Rebound Aggression (Bigs - Loose ball fouls)
    const rebAggression = Math.max(sliders.offReb, sliders.defReb);
    if (rebAggression > 5 && ['PF', 'C'].includes(pos)) {
        const rebMult = 1.0 + ((rebAggression - 5) * C.SLIDERS.REB_IMPACT);
        foulPropensity *= rebMult;
    }

    // ==================================================================
    // STEP 5: Simulation & Normalization
    // ==================================================================

    // Scale propensity to actual minutes played
    const expectedFouls = foulPropensity * (minutesPlanned / 36);

    // Apply Random Variation (Referees, Bad Luck)
    const randomFactor = C.VARIANCE.MIN + (Math.random() * (C.VARIANCE.MAX - C.VARIANCE.MIN));
    const finalEstimate = expectedFouls * randomFactor;

    // Convert float to integer with probability for the decimal part
    // e.g., 3.7 fouls -> 3 fouls (30% chance) or 4 fouls (70% chance)
    let pf = Math.floor(finalEstimate);
    if (Math.random() < (finalEstimate - pf)) {
        pf += 1;
    }

    // ==================================================================
    // STEP 6: Ejection & Minute Adjustment
    // ==================================================================
    
    let adjustedMinutes = minutesPlanned;
    
    if (pf >= C.FOUL_LIMIT) {
        pf = C.FOUL_LIMIT; // Hard cap at 6
        
        // If simulated to have >6 fouls, they fouled out early.
        // Reduce minutes proportionally to simulate early exit.
        // Formula: Planned * (Limit / Projected)
        const foulOutRatio = C.FOUL_LIMIT / Math.max(6.1, finalEstimate);
        adjustedMinutes = Math.floor(minutesPlanned * foulOutRatio);
        
        // Ensure a logical floor (rarely foul out in < 10 mins unless extreme)
        adjustedMinutes = Math.max(C.MIN_MINUTES_FLOOR, adjustedMinutes);
    }

    return { pf, adjustedMinutes };
}
