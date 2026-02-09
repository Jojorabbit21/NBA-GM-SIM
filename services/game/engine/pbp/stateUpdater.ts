
import { GameState, TeamState } from './pbpTypes';
import { calculateIncrementalFatigue } from '../fatigueSystem';
import { formatTime } from './timeEngine';

/**
 * Updates fatigue, injury checks, and minutes played for all players on court.
 */
export function updateOnCourtStates(state: GameState, timeTaken: number) {
    const teams = [state.home, state.away];
    
    teams.forEach(team => {
        const isB2B = team.id === state.home.id ? state.isHomeB2B : state.isAwayB2B;
        
        team.onCourt.forEach(p => {
            // 1. Update MP
            p.mp += timeTaken / 60;

            // 2. Fatigue Calculation
            // Check if Ace Stopper
            const isStopper = team.tactics.defenseTactics.includes('AceStopper') && 
                              team.tactics.stopperId === p.playerId;
            
            const fatigueRes = calculateIncrementalFatigue(
                p, 
                timeTaken, 
                team.tactics.sliders, 
                isB2B, 
                isStopper, 
                team.tactics.offenseTactics[0], 
                team.tactics.defenseTactics[0]
            );

            // Apply Drain
            p.currentCondition = Math.max(0, p.currentCondition - fatigueRes.drain);

            // 3. Injury Check
            if (fatigueRes.injuryOccurred && p.health === 'Healthy') {
                p.health = 'Injured';
                p.injuryType = 'General Soreness'; // Placeholder for specific injury generation
                p.returnDate = 'TBD';
                
                // Add Log
                state.logs.push({
                    quarter: state.quarter,
                    timeRemaining: formatTime(state.gameClock),
                    teamId: team.id,
                    text: `🚨 ${p.playerName} 선수가 고통을 호소하며 쓰러졌습니다.`,
                    type: 'info'
                });
            }
        });
    });
}
