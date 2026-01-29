
import { Player, TacticalSliders } from '../../../types';
import { SIM_CONFIG } from '../config/constants';
import { PlaymakingResult } from './types';

export function calculatePlaymakingStats(
    p: Player, 
    mp: number,
    fga: number,
    tactics: { offense: string[] },
    sliders: TacticalSliders,
    isAceTarget: boolean,
    stopper?: Player, // Opponent stopper player object
    perfDrop: number = 0
): PlaymakingResult {
    const C = SIM_CONFIG.STATS;

    // 1. Assists
    const astAttr = (p.passAcc * 0.3 + p.passVision * 0.4 + p.passIq * 0.2 + p.handling * 0.1) * (1 - perfDrop);
    let astBase = astAttr * (mp / 48) * C.AST_BASE_FACTOR;
    
    if (p.position === 'PG') astBase *= 1.4;
    if (p.position === 'SG') astBase *= 1.1;
    
    if (tactics.offense.includes('SevenSeconds') || tactics.offense.includes('PaceAndSpace')) {
        astBase *= 1.1;
    }
    const ast = Math.round(astBase * (Math.random() * 0.5 + 0.75));

    // 2. Turnovers
    // Usage proxy uses FGA + AST to estimate ball handling load
    const usageProxy = (fga + ast * 2 + 5);
    const tovAttr = (100 - p.handling) * 0.02 + (100 - p.passIq) * 0.02;
    const tovBase = (usageProxy * C.TOV_USAGE_FACTOR) + (tovAttr * 0.05); 
    let tov = Math.round(tovBase * (mp / 48) * (Math.random() * 0.5 + 0.7));

    // Ace Stopper Impact on Turnovers
    if (isAceTarget && stopper) {
        const stealRating = stopper.steal || 50;
        const tovIncrease = (stealRating / 100) * 0.40;
        tov = Math.round(tov * (1.0 + tovIncrease));
    }

    return { ast, tov };
}
