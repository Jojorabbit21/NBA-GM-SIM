
import { Team, GameTactics, SimulationResult, DepthChart, PlayerBoxScore } from '../../../../types';
import { GameState, TeamState, LivePlayer } from './pbpTypes';
import { calculatePossessionTime, formatTime } from './timeEngine';
import { initTeamState } from './initializer';

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
    
    const homeT = userTeamId === homeTeam.id && userTactics ? userTactics : undefined; 
    const awayT = userTeamId === awayTeam.id && userTactics ? userTactics : undefined;

    const state: GameState = {
        home: initTeamState(homeTeam, homeT, homeDepthChart),
        away: initTeamState(awayTeam, awayT, awayDepthChart),
        quarter: 1,
        gameClock: 720,
        shotClock: 24,
        possession: 'home',
        isDeadBall: false,
        logs: [],
        isHomeB2B,
        isAwayB2B,
        rotationHistory: {}
    };

    // Initialize Rotation History
    [...state.home.onCourt, ...state.home.bench, ...state.away.onCourt, ...state.away.bench].forEach(p => {
        state.rotationHistory[p.playerId] = [];
    });

    const checkManualRotation = (teamState: TeamState, currentTotalSec: number) => {
        const currentMinute = Math.min(47, Math.floor(currentTotalSec / 60));
        const map = teamState.tactics.rotationMap;
        if (!map || Object.keys(map).length === 0) return;

        // Find who SHOULD be on court according to the map
        const shouldBeOnIds = Object.entries(map)
            .filter(([_, m]) => m[currentMinute])
            .map(([pid]) => pid);

        // [Next Man Up Logic]
        // If a required player is Injured or Fouled Out, their rotation is passed to the next available depth player
        const finalRequiredIds: string[] = [];
        shouldBeOnIds.forEach(pid => {
            const p = [...teamState.onCourt, ...teamState.bench].find(lp => lp.playerId === pid);
            if (!p || p.health === 'Injured' || p.pf >= 6) {
                // Find replacement from Depth Chart
                const pos = p?.position || 'SF';
                const row = teamState.depthChart?.[pos as keyof DepthChart] || [];
                const nextId = row.find(id => {
                    if (!id || id === pid) return false;
                    const cand = [...teamState.onCourt, ...teamState.bench].find(lp => lp.playerId === id);
                    return cand && cand.health === 'Healthy' && cand.pf < 6;
                });
                if (nextId) finalRequiredIds.push(nextId);
            } else {
                finalRequiredIds.push(pid);
            }
        });

        // Sync onCourt with finalRequiredIds
        const toRemove = teamState.onCourt.filter(p => !finalRequiredIds.includes(p.playerId));
        const toAdd = teamState.bench.filter(p => finalRequiredIds.includes(p.playerId));

        toRemove.forEach(p => {
            const idx = teamState.onCourt.indexOf(p);
            teamState.onCourt.splice(idx, 1);
            teamState.bench.push(p);
            const hist = state.rotationHistory[p.playerId];
            if (hist.length > 0) hist[hist.length - 1].out = currentTotalSec;
        });

        toAdd.forEach(p => {
            const idx = teamState.bench.indexOf(p);
            teamState.bench.splice(idx, 1);
            teamState.onCourt.push(p);
            state.rotationHistory[p.playerId].push({ in: currentTotalSec, out: currentTotalSec });
        });
    };

    // 2. Game Loop
    while (state.quarter <= 4 || state.home.score === state.away.score) {
        const totalElapsedSec = ((state.quarter - 1) * 720) + (720 - state.gameClock);
        
        // Manual Rotation Check (Check every 60 seconds or on possession start)
        checkManualRotation(state.home, totalElapsedSec);
        checkManualRotation(state.away, totalElapsedSec);

        const attTeam = state.possession === 'home' ? state.home : state.away;
        const defTeam = state.possession === 'home' ? state.away : state.home;
        
        const timeTaken = calculatePossessionTime(state, attTeam.tactics.sliders);
        const actor = attTeam.onCourt[Math.floor(Math.random() * attTeam.onCourt.length)] || attTeam.onCourt[0];
        if (!actor) break; // Emergency bail

        // Event Resolution (Simplified placeholder)
        const isMake = Math.random() < (actor.attr.ins / 200 + 0.2);
        if (isMake) {
            const pts = Math.random() < 0.3 ? 3 : 2;
            actor.pts += pts; attTeam.score += pts;
            actor.fgm++; actor.fga++;
            state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: attTeam.id, text: `${actor.playerName} 득점`, type: 'score' });
        } else {
            actor.fga++;
        }

        state.gameClock -= timeTaken;
        state.home.onCourt.forEach(p => p.mp += (timeTaken/60));
        state.away.onCourt.forEach(p => p.mp += (timeTaken/60));

        if (state.gameClock <= 0) {
            state.quarter++;
            state.gameClock = 720;
            if (state.quarter > 4 && state.home.score !== state.away.score) break;
        } else {
            state.possession = state.possession === 'home' ? 'away' : 'home';
        }
    }

    // [Fix] Map Box Score correctly to PlayerBoxScore interface
    const mapBox = (teamState: TeamState): PlayerBoxScore[] => {
        return [...teamState.onCourt, ...teamState.bench].map(p => ({
            playerId: p.playerId,
            playerName: p.playerName,
            pts: p.pts,
            reb: p.reb,
            offReb: p.offReb,
            defReb: p.defReb,
            ast: p.ast,
            stl: p.stl,
            blk: p.blk,
            tov: p.tov,
            fgm: p.fgm,
            fga: p.fga,
            p3m: p.p3m,
            p3a: p.p3a,
            ftm: p.ftm,
            fta: p.fta,
            rimM: p.rimM,
            rimA: p.rimA,
            midM: p.midM,
            midA: p.midA,
            mp: p.mp,
            g: 1,
            gs: p.gs,
            pf: p.pf,
            plusMinus: p.plusMinus,
            condition: p.currentCondition,
            isStopper: p.isStopper,
            zoneData: p.zoneData
        }));
    };

    return {
        homeScore: state.home.score,
        awayScore: state.away.score,
        homeBox: mapBox(state.home),
        awayBox: mapBox(state.away),
        homeTactics: {}, // Actual tactics should be snapshots of initial state
        awayTactics: {},
        rosterUpdates: {},
        pbpLogs: state.logs,
        rotationData: state.rotationHistory
    };
}
