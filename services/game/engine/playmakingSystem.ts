
import { Player, TacticalSliders, OffenseTactic } from '../../../types';
import { SIM_CONFIG } from '../config/constants';
import { PlaymakingResult } from './types';

export function calculatePlaymakingStats(
    p: Player,
    mp: number,
    fga: number,
    sliders: TacticalSliders,
    offTactic: OffenseTactic, // [New] Added Tactic
    isAceTarget: boolean,
    stopper?: Player
): PlaymakingResult {
    const C = SIM_CONFIG.STATS;

    // 1. Assist Weight (Potential)
    // Pass Accuracy, Vision, IQ + Usage (MP)
    // This represents the ability to create shots for others
    const plmAttr = (p.passAcc * 0.4 + p.passVision * 0.4 + p.passIq * 0.2);
    const assistWeight = plmAttr * (mp / 48) * C.AST_BASE_FACTOR;

    // 2. Turnovers (Direct Event)
    // Usage proxy uses FGA + AstWeight to estimate ball handling load
    const usageProxy = (fga + (assistWeight / 3)); 
    const tovAttr = (100 - p.handling) * 0.02 + (100 - p.passIq) * 0.02;
    let tovBase = (usageProxy * C.TOV_USAGE_FACTOR) + (tovAttr * 0.05); 

    // [New] Haste Malus for Turnovers (Revised)
    
    // A. Pace Slider Penalty (7+)
    if (sliders.pace >= 7) {
        // Condition: PassAcc < 82
        if (p.passAcc < 82) {
            let pacePenalty = 0; // Additive percentage points
            if (sliders.pace === 7) pacePenalty = 5;
            else if (sliders.pace === 8) pacePenalty = 6;
            else if (sliders.pace === 9) pacePenalty = 8;
            else if (sliders.pace === 10) pacePenalty = 10;
            
            // Add directly to base TOV count (simulating % increase)
            // Since tovBase is roughly a count, we add a percentage of usageProxy
            tovBase += (usageProxy * (pacePenalty / 100));
        }
    }

    // B. Tactic Penalty (SevenSeconds)
    if (offTactic === 'SevenSeconds') {
        // Unconditional +5% penalty
        tovBase += (usageProxy * 0.05);
    }

    let tov = Math.round(tovBase * (mp / 48) * (Math.random() * 0.5 + 0.7));

    // Ace Stopper Impact on Turnovers
    if (isAceTarget && stopper) {
        const stealRating = stopper.steal || 50;
        const tovIncrease = (stealRating / 100) * 0.40;
        tov = Math.round(tov * (1.0 + tovIncrease));
    }

    return { tov, assistWeight };
}
