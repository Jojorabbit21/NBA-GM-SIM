
import { Player, TacticalSliders } from '../../../types';
import { SIM_CONFIG } from '../config/constants';
import { PlaymakingResult, PlayerSimContext } from './types';

// --------------------------------------------------------------------------------
//  INDIVIDUAL PLAYMAKING WEIGHT (Potential)
// --------------------------------------------------------------------------------
export function calculatePlaymakingStats(
    p: Player, 
    mp: number,
    fga: number,
    tactics: { offense: string[] },
    sliders: TacticalSliders,
    isAceTarget: boolean,
    stopper?: Player, 
    perfDrop: number = 0
): PlaymakingResult {
    const C = SIM_CONFIG.STATS;

    // 1. Assist Weight (Potential to create)
    // 패스 능력 + 시야 + IQ + 볼 핸들링(소유 시간)
    // Not actual assists, but a score used to distribute team assists later
    const astAttr = (p.passAcc * 0.2 + p.passVision * 0.4 + p.passIq * 0.2 + p.handling * 0.2) * (1 - perfDrop);
    
    let assistWeight = astAttr * (mp / 48);
    
    // Positional & Usage Bias
    // Point Guards naturally have the ball more
    if (p.position === 'PG') assistWeight *= 2.0;
    if (p.position === 'SG') assistWeight *= 1.2;
    
    // Tactical Bonus
    if (tactics.offense.includes('SevenSeconds') || tactics.offense.includes('PaceAndSpace')) {
        assistWeight *= 1.15; // More passing in these systems
    } else if (tactics.offense.includes('PerimeterFocus')) {
        // High PnR usage for handlers
        if (p.position === 'PG' || p.handling > 80) assistWeight *= 1.3;
    }

    // 2. Turnovers (Direct Event)
    // Usage proxy uses FGA + AstWeight to estimate ball handling load
    const usageProxy = (fga + (assistWeight / 3)); 
    const tovAttr = (100 - p.handling) * 0.02 + (100 - p.passIq) * 0.02;
    const tovBase = (usageProxy * C.TOV_USAGE_FACTOR) + (tovAttr * 0.05); 
    let tov = Math.round(tovBase * (mp / 48) * (Math.random() * 0.5 + 0.7));

    // Ace Stopper Impact on Turnovers
    if (isAceTarget && stopper) {
        const stealRating = stopper.steal || 50;
        const tovIncrease = (stealRating / 100) * 0.40;
        tov = Math.round(tov * (1.0 + tovIncrease));
    }

    return { tov, assistWeight };
}

// --------------------------------------------------------------------------------
//  DISTRIBUTE ASSISTS (Post-Simulation Phase)
//  Logic: Assists <= FGM. Ratio depends on Tactics & Team IQ.
// --------------------------------------------------------------------------------
export function distributeAssists(
    teamPlayers: PlayerSimContext[],
    teamFGM: number,
    tactics: { offense: string[] }
) {
    if (teamFGM === 0) {
        teamPlayers.forEach(p => p.stats.ast = 0);
        return;
    }

    // 1. Determine Assist Ratio (AST%) based on Tactics & Team IQ
    // NBA Average AST% is around 55-65%
    let baseAstRatio = 0.58;

    // Tactical Adjustments
    const offTactic = tactics.offense[0] || 'Balance';
    switch (offTactic) {
        case 'SevenSeconds': // Run & Gun, lots of open looks
        case 'PaceAndSpace': // Drive & Kick
            baseAstRatio += 0.10; 
            break;
        case 'PerimeterFocus': // PnR heavy
            baseAstRatio += 0.05;
            break;
        case 'PostFocus': // Dump to post, often unassisted or 1-on-1
            baseAstRatio -= 0.05;
            break;
        case 'Grind': // Iso heavy, slow pace
            baseAstRatio -= 0.10;
            break;
        case 'Balance':
        default:
            break;
    }

    // Team IQ Modifier
    // Calculate average Pass IQ of players with significant minutes (>10)
    const activePlaymakers = teamPlayers.filter(p => p.stats.mp > 10);
    const avgPassIQ = activePlaymakers.reduce((sum, p) => sum + p.stats.passIq, 0) / (activePlaymakers.length || 1);
    
    // IQ Impact: +/- 5% based on 75 average
    const iqMod = (avgPassIQ - 75) * 0.002;
    baseAstRatio += iqMod;

    // Clamp Ratio (Min 30%, Max 85% - extremely rare to have 100% assisted goals)
    const finalAstRatio = Math.max(0.30, Math.min(0.85, baseAstRatio));

    // 2. Calculate Total Team Assists
    const teamTotalAssists = Math.round(teamFGM * finalAstRatio);

    // 3. Distribute to Players
    const teamTotalWeight = teamPlayers.reduce((sum, p) => sum + p.stats.assistWeight, 0);

    teamPlayers.forEach(p => {
        if (teamTotalWeight > 0) {
            const share = p.stats.assistWeight / teamTotalWeight;
            // Variance to prevent static distribution every game
            const variance = 0.9 + (Math.random() * 0.2); 
            p.stats.ast = Math.round(teamTotalAssists * share * variance);
        } else {
            p.stats.ast = 0;
        }
    });

    // Sanity Check: Ensure total assists don't exceed FGM due to rounding/variance
    const checkSum = teamPlayers.reduce((sum, p) => sum + p.stats.ast, 0);
    if (checkSum > teamFGM) {
        // Reduce from players with most assists until valid
        let diff = checkSum - teamFGM;
        const sorted = [...teamPlayers].sort((a, b) => b.stats.ast - a.stats.ast);
        let i = 0;
        while (diff > 0) {
            if (sorted[i].stats.ast > 0) {
                sorted[i].stats.ast--;
                diff--;
            }
            i = (i + 1) % sorted.length;
        }
    }
}
