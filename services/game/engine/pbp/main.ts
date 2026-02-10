
import { Team, GameTactics, DepthChart, SimulationResult, PlayerBoxScore, PbpLog, RotationData, TacticalSnapshot } from '../../../../types';
import { initTeamState } from './initializer';
import { calculatePossessionTime } from './timeEngine';
import { checkAndApplyRotation, forceSubstitution } from './rotationLogic';
import { simulatePossession } from './possessionHandler';
import { updateOnCourtStates } from './stateUpdater';
import { applyPossessionResult } from './statsMappers';
import { checkSubstitutions } from './substitutionSystem';
import { LivePlayer } from './pbpTypes';

export function runFullGameSimulation(
    homeTeam: Team,
    awayTeam: Team,
    userTeamId: string | null,
    userTactics?: GameTactics,
    isHomeB2B: boolean = false,
    isAwayB2B: boolean = false,
    homeDepthChart?: DepthChart | null,
    awayDepthChart?: DepthChart | null
): SimulationResult {
    
    // 1. Initialization Phase
    const state = {
        home: initTeamState(homeTeam, userTeamId === homeTeam.id ? userTactics : undefined, homeDepthChart),
        away: initTeamState(awayTeam, userTeamId === awayTeam.id ? userTactics : undefined, awayDepthChart),
        quarter: 1,
        gameClock: 720,
        shotClock: 24,
        possession: 'home' as 'home' | 'away',
        isDeadBall: false,
        logs: [] as PbpLog[],
        rotationHistory: {} as RotationData,
        isHomeB2B,
        isAwayB2B
    };

    // Initialize rotation history for ALL players (Bench included)
    [state.home, state.away].forEach(team => {
        const allPlayers = [...team.onCourt, ...team.bench];
        allPlayers.forEach(p => {
             if (!state.rotationHistory[p.playerId]) {
                 state.rotationHistory[p.playerId] = [];
             }
        });
        
        // Add start segment only for Starters
        team.onCourt.forEach(p => {
             state.rotationHistory[p.playerId].push({ in: 0, out: 0 });
        });
    });

    // Main Simulation Loop
    for (state.quarter = 1; state.quarter <= 4; state.quarter++) {
        state.gameClock = 720;
        state.possession = (state.quarter === 2 || state.quarter === 3) ? 'away' : 'home'; 
        
        // Reset Team Fouls each quarter
        state.home.fouls = 0;
        state.away.fouls = 0;

        while (state.gameClock > 0) {
            const offTeamState = state.possession === 'home' ? state.home : state.away;
            const timeTaken = calculatePossessionTime(state as any, offTeamState.tactics.sliders);
            
            state.gameClock -= timeTaken;
            if (state.gameClock < 0) state.gameClock = 0;

            updateOnCourtStates(state as any, timeTaken);
            checkAndApplyRotation(state as any, state.home, ((state.quarter - 1) * 720) + (720 - state.gameClock));
            checkAndApplyRotation(state as any, state.away, ((state.quarter - 1) * 720) + (720 - state.gameClock));
            
            // [Restored] Check and Execute Substitutions for Fouls/Injuries
            [state.home, state.away].forEach(team => {
                const subs = checkSubstitutions(state as any, team);
                subs.forEach(sub => {
                    forceSubstitution(state as any, team, sub.outPlayer, sub.reason);
                });
            });

            const result = simulatePossession(state as any);
            applyPossessionResult(state as any, result);

            let nextPossession = state.possession === 'home' ? 'away' : 'home';
            if (result.type === 'miss' && result.rebounder) {
                const isHomeRebound = state.home.onCourt.some(p => p.playerId === result.rebounder?.playerId);
                nextPossession = isHomeRebound ? 'home' : 'away';
            } else if (result.type === 'score' || result.type === 'turnover' || result.type === 'freethrow' || result.type === 'foul') {
                 if (result.type === 'foul') {
                     // Defensive foul: possession stays (mostly), unless bonus logic handled elsewhere
                     nextPossession = state.possession; 
                 } else {
                    nextPossession = state.possession === 'home' ? 'away' : 'home';
                 }
            }
            state.possession = nextPossession as 'home' | 'away';
        }
    }

    // [CTO Fix] No Overtime Rule: Break ties with a buzzer beater
    if (state.home.score === state.away.score) {
        // Simple heuristic: Home advantage (55%) vs Away (45%)
        const isHomeWinner = Math.random() < 0.55;
        const winnerTeam = isHomeWinner ? state.home : state.away;
        const loserTeam = isHomeWinner ? state.away : state.home;
        
        // Pick the "Hero" (Highest OVR on court)
        const hero = winnerTeam.onCourt.reduce((prev, current) => (prev.ovr > current.ovr) ? prev : current);
        
        // Add 2 points
        winnerTeam.score += 2;
        
        // Update Player Stats
        hero.pts += 2;
        hero.fgm += 1;
        hero.fga += 1;
        
        // Update Plus/Minus
        winnerTeam.onCourt.forEach(p => p.plusMinus += 2);
        loserTeam.onCourt.forEach(p => p.plusMinus -= 2);

        // Log the dramatic finish
        state.logs.push({
            quarter: 4,
            timeRemaining: '0:00',
            teamId: winnerTeam.id,
            text: `🚨 GAME WINNER! ${hero.playerName} 경기 종료 직전 버저비터 성공!`,
            type: 'score',
            points: 2
        });
    }

    const gameEndSec = 48 * 60;
    [state.home, state.away].forEach(team => {
        team.onCourt.forEach(p => {
            const hist = state.rotationHistory[p.playerId];
            if (hist && hist.length > 0) {
                hist[hist.length - 1].out = gameEndSec;
            }
        });
    });

    const mapToBox = (teamState: any): PlayerBoxScore[] => 
        [...teamState.onCourt, ...teamState.bench].map((p: LivePlayer) => ({
            ...p,
            condition: p.currentCondition,
        }));

    const mapTactics = (t: GameTactics): TacticalSnapshot => ({
        offense: t.offenseTactics[0],
        defense: t.defenseTactics[0],
        stopperId: t.stopperId,
        pace: t.sliders.pace,
        sliders: t.sliders
    });

    return {
        homeScore: state.home.score,
        awayScore: state.away.score,
        homeBox: mapToBox(state.home),
        awayBox: mapToBox(state.away),
        homeTactics: mapTactics(state.home.tactics),
        awayTactics: mapTactics(state.away.tactics),
        rosterUpdates: {},
        pbpLogs: state.logs,
        rotationData: state.rotationHistory
    };
}
