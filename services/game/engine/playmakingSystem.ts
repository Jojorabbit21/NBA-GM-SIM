
import { Player, TacticalSliders } from '../../../types';
import { SIM_CONFIG } from '../config/constants';
import { PlaymakingResult } from './types';

export function calculatePlaymakingStats(
    p: Player,
    mp: number,
    fga: number,
    sliders: TacticalSliders,
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

    // [New] Haste Penalty for Turnovers
    // Higher pace significantly increases turnover chance for low-playmaking players
    if (sliders.pace > 6) {
        // [Balance Patch] Increased multiplier from 0.1 to 0.2
        // Pace 10 => (10-5)*0.2 = 1.0 (+100% Base TOV) -> Doubles Turnovers
        const paceMod = (sliders.pace - 5) * 0.2; 
        
        // Mitigation by Playmaking Skill (Handling + PassIQ)
        // High skill players can handle speed better.
        const skill = (p.handling + p.passIq) / 2;
        const mitigation = Math.max(0, (skill - 70) * 0.015); // Skill 90 -> -30% impact
        
        const finalMod = Math.max(0, paceMod - mitigation);
        tovBase *= (1.0 + finalMod);
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
