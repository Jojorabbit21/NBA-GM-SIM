
import { Player, TacticalSliders, OffenseTactic } from '../../../types';
import { SIM_CONFIG } from '../config/constants';
import { PlaymakingResult } from './types';

export function calculatePlaymakingStats(
    p: Player,
    mp: number,
    fga: number,
    sliders: TacticalSliders,
    offTactic: OffenseTactic, 
    isAceTarget: boolean,
    stopper?: Player
): PlaymakingResult {
    const C = SIM_CONFIG.STATS;

    // 1. Assist Weight (Potential)
    const plmAttr = (p.passAcc * 0.4 + p.passVision * 0.4 + p.passIq * 0.2);
    const assistWeight = plmAttr * (mp / 48) * C.AST_BASE_FACTOR;

    // 2. Turnovers (Direct Event)
    const usageProxy = (fga + (assistWeight / 3)); 
    
    // Base Risks
    // High ball movement (Pass heavy) slightly increases intercept risk but opens floor
    // Pressure Risk comes from Defense Intensity Slider
    const passRisk = sliders.ballMovement * 0.01;
    const pressureRisk = sliders.defIntensity * 0.015;

    // [New] Full Court Press Risk
    // Adds direct turnover probability based on press intensity
    // Level 1: 0%, Level 10: 5.4% flat increase
    const pressRisk = (sliders.fullCourtPress - 1) * 0.006; 
    
    // Attribute Mitigation
    const tovAttr = (100 - p.handling) * 0.06 + (100 - p.passIq) * 0.04;
    
    // Combine Factors
    let tovBase = (usageProxy * C.TOV_USAGE_FACTOR) + tovAttr; 

    // [New] Haste Malus for Turnovers
    if (sliders.pace >= 7) {
        if (p.passAcc < 82) {
            let pacePenalty = 0; 
            if (sliders.pace === 7) pacePenalty = 5;
            else if (sliders.pace === 8) pacePenalty = 6;
            else if (sliders.pace === 9) pacePenalty = 8;
            else if (sliders.pace === 10) pacePenalty = 10;
            
            tovBase += (usageProxy * (pacePenalty / 100));
        }
    }

    if (offTactic === 'SevenSeconds') {
        tovBase += (usageProxy * 0.05);
    }

    // Apply Press Risk here
    const finalRiskFactor = 0.05 + passRisk + pressureRisk + pressRisk;
    
    // Final Calculation with randomness
    let tov = Math.round((tovBase + (usageProxy * finalRiskFactor)) * (mp / 48) * (Math.random() * 0.5 + 0.7));

    // Ace Stopper Impact on Turnovers
    if (isAceTarget && stopper) {
        const stealRating = stopper.steal || 50;
        const tovIncrease = (stealRating / 100) * 0.40;
        tov = Math.round(tov * (1.0 + tovIncrease));
    }

    // [Normalization] Turnover Cap
    // Prevent catastrophic turnover games (e.g. 30 TOs) which lead to < 60pts
    // Hard cap per player per game context roughly 7-8
    if (tov > 7) tov = 7 + (Math.random() > 0.5 ? 1 : 0);

    return { tov, assistWeight };
}
