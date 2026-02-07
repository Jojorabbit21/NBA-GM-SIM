
import { TeamState, LivePlayer } from './pbpTypes';

// Helper: Determine Rebounder based on Position & Stats
export function resolveRebound(homeTeam: TeamState, awayTeam: TeamState, shooterId: string): { player: LivePlayer, type: 'off' | 'def' } {
    // 1. Collect all candidates
    const allPlayers = [...homeTeam.onCourt, ...awayTeam.onCourt];
    
    // 2. Calculate Rebound Score for each
    // Score = RebAttr * 0.6 + Vert * 0.2 + Height * 0.2 + Random Factor
    const candidates = allPlayers.map(p => {
        // Penalty for shooter (harder to get own rebound usually)
        const shooterPenalty = p.playerId === shooterId ? 0.3 : 1.0;
        
        // Position bias (Bigs are closer to rim)
        let posBonus = 1.0;
        if (p.position === 'C') posBonus = 1.3;
        else if (p.position === 'PF') posBonus = 1.2;
        
        const score = (
            (p.attr.reb * 0.6) + 
            (p.attr.vertical * 0.2) + 
            ((p.attr.height - 180) * 0.5) // Height weight
        ) * posBonus * shooterPenalty * Math.random();
        
        return { p, score };
    });

    // 3. Sort by Score
    candidates.sort((a, b) => b.score - a.score);
    const winner = candidates[0].p;

    // 4. Determine Type
    // If winner belongs to the team that shot (Shooter's team), it's Offensive
    const isHomeShooter = homeTeam.onCourt.some(p => p.playerId === shooterId);
    const isHomeWinner = homeTeam.onCourt.some(p => p.playerId === winner.playerId);
    
    const type = (isHomeShooter === isHomeWinner) ? 'off' : 'def';
    
    return { player: winner, type };
}
