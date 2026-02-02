
import { Player, GameTactics, OffenseTactic, DefenseTactic } from '../../../types';

/**
 * Calculates personal fouls and adjusts minutes if fouled out.
 * 
 * Logic:
 * 1. Base Foul Rate derived from Attributes (Position specific).
 * 2. Tactical Modifiers (Offensive & Defensive schemes).
 * 3. Matchup Modifier (Opponent's Draw Foul).
 * 4. Simulation & Normalization (0-6 scale).
 * 5. Ejection Logic (Cap minutes if PF >= 6).
 */
export function calculateFoulStats(
    defender: Player,
    minutesPlanned: number,
    defTactics: { defense: DefenseTactic[] },
    oppOffTactics: { offense: OffenseTactic[] },
    matchupOpponent?: Player
): { pf: number, adjustedMinutes: number } {
    if (minutesPlanned <= 0) return { pf: 0, adjustedMinutes: 0 };

    // 1. Base Discipline Score (Higher = Fewer Fouls)
    // Common (60%)
    const commonScore = (defender.defConsist * 0.35) + (defender.hustle * 0.10) + (defender.stamina * 0.15);
    
    // Positional (40%)
    let posScore = 0;
    const pos = defender.position;

    if (pos === 'PG' || pos === 'SG' || pos === 'G') {
        posScore = (defender.perDef * 0.15) + (defender.helpDefIq * 0.15) + (defender.agility * 0.10);
    } else if (pos === 'SF' || pos === 'F') {
        posScore = (defender.perDef * 0.15) + (defender.helpDefIq * 0.15) + (defender.agility * 0.10);
    } else if (pos === 'PF') {
        posScore = (defender.perDef * 0.05) + (defender.intDef * 0.15) + (defender.blk * 0.10) + (defender.strength * 0.10);
    } else if (pos === 'C') {
        posScore = (defender.intDef * 0.20) + (defender.blk * 0.15) + (defender.strength * 0.05);
    } else {
        // Fallback
        posScore = (defender.def * 0.40);
    }

    // Total Discipline Rating (0-100)
    // Scale: 60 (Common) + 40 (Positional)
    const disciplineRating = commonScore + posScore;

    // Convert to Foul Propensity (Lower Discipline = Higher Propensity)
    // Base foul rate per 36 mins ranges roughly 1.5 (High IQ) to 4.5 (Low IQ)
    let foulPropensity = (100 - disciplineRating) / 20; 

    // 2. Matchup Modifier (Opponent Draw Foul)
    if (matchupOpponent) {
        const drawVal = matchupOpponent.drawFoul || 50;
        // Increase propensity by up to 10% based on draw foul
        const drawEffect = (drawVal - 50) * 0.005; // -0.1 to +0.25 approx
        foulPropensity += Math.max(0, drawEffect);
    }

    // 3. Defensive Tactic Modifiers
    if (defTactics.defense.includes('ManToManPerimeter')) {
        if (['PG', 'SG', 'SF', 'G', 'F'].includes(pos)) foulPropensity *= 1.05;
    }
    if (defTactics.defense.includes('ZoneDefense')) {
        if (['PF', 'C'].includes(pos)) foulPropensity *= 1.05;
    }

    // 4. Opponent Offensive Tactic Modifiers
    const oppTacticsList = oppOffTactics.offense;
    if (oppTacticsList.includes('PostFocus')) {
        if (['PF', 'C'].includes(pos)) foulPropensity *= 1.03;
    }
    if (oppTacticsList.includes('PaceAndSpace') || oppTacticsList.includes('SevenSeconds')) {
        if (['SG', 'SF', 'F'].includes(pos)) foulPropensity *= 1.03;
    }
    if (oppTacticsList.includes('PerimeterFocus')) {
        if (['PG', 'G'].includes(pos)) foulPropensity *= 1.03;
    }

    // 5. Simulation (Per Minute Check)
    // Scale propensity to the actual minutes played
    // Random variation factor (0.8 to 1.3)
    const randomFactor = 0.8 + (Math.random() * 0.5);
    const estimatedFouls = (foulPropensity * (minutesPlanned / 36)) * randomFactor;

    // Rounding and integer conversion with probability
    let pf = Math.floor(estimatedFouls);
    if (Math.random() < (estimatedFouls - pf)) {
        pf += 1;
    }

    // 6. Ejection Logic (Foul Out)
    let adjustedMinutes = minutesPlanned;
    
    // Clamp to 6 max (Ejection)
    if (pf >= 6) {
        pf = 6;
        
        // Calculate when the ejection happened approximately
        // If simulated to have >6 fouls, it means they fouled out early.
        // We reduce their minutes proportionally.
        // Heuristic: If est was 8 fouls in 30 mins, they likely fouled out around 30 * (6/8) = 22.5 mins.
        
        // Safety: Don't foul out too early unless propensity is insane. 
        // Realistically, coaches pull players. But here we simulate the limit.
        const foulOutRatio = 6 / Math.max(6.1, estimatedFouls);
        adjustedMinutes = Math.floor(minutesPlanned * foulOutRatio);
        
        // Ensure minimum floor to represent "playing until fouling out"
        // Rarely foul out in < 15 mins unless hack-a-shaq or disaster
        adjustedMinutes = Math.max(12, adjustedMinutes);
    }

    return { pf, adjustedMinutes };
}
