
import { GameState, TeamState } from './pbpTypes';
import { SubRequest } from './substitutionSystem';
import { formatTime } from './timeEngine';

export function applySubstitutions(state: GameState, teamState: TeamState, subs: SubRequest[]) {
    subs.forEach(sub => {
        const outIdx = teamState.onCourt.findIndex(p => p.playerId === sub.outPlayer.playerId);
        const inIdx = teamState.bench.findIndex(p => p.playerId === sub.inPlayer.playerId);
        
        if (outIdx !== -1 && inIdx !== -1) {
            const outP = teamState.onCourt[outIdx];
            const inP = teamState.bench[inIdx];
            
            // Swap in arrays
            teamState.onCourt.splice(outIdx, 1);
            teamState.bench.push(outP);
            
            teamState.onCourt.push(inP);
            teamState.bench.splice(inIdx, 1);
            
            // Calculate absolute game time for logs (e.g., 0 to 2880)
            const gameTimeSeconds = ((state.quarter - 1) * 720) + (720 - state.gameClock);
            
            // Close "Out" Player's segment
            if (!state.rotationHistory[outP.playerId]) state.rotationHistory[outP.playerId] = [];
            const outLog = state.rotationHistory[outP.playerId];
            if (outLog && outLog.length > 0) {
                outLog[outLog.length - 1].out = gameTimeSeconds;
            }
            
            // Start "In" Player's segment
            if (!state.rotationHistory[inP.playerId]) state.rotationHistory[inP.playerId] = [];
            state.rotationHistory[inP.playerId].push({ in: gameTimeSeconds, out: gameTimeSeconds }); // 'out' will be updated later
            
            // Update Player State
            inP.lastSubInTime = state.gameClock;
            inP.conditionAtSubIn = inP.currentCondition;
            
            // Log Event
            state.logs.push({
                quarter: state.quarter,
                timeRemaining: formatTime(state.gameClock),
                teamId: teamState.id,
                text: `교체: ${outP.playerName} (Out) / ${inP.playerName} (In) - ${sub.reason}`,
                type: 'info'
            });
        }
    });
}
