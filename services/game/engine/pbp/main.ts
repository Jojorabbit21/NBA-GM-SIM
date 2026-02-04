
import { Team, SimulationResult, GameTactics, Player, PlayerBoxScore } from '../../../../types';
import { GameState, LivePlayer, TeamState } from './pbpTypes';
import { resolvePossession } from './flowEngine';
import { handleSubstitutions } from './substitutionSystem';
import { formatTime } from './timeEngine';
import { generateAutoTactics } from '../../tactics/tacticGenerator';
import { calculatePlayerOvr } from '../../../../utils/constants';

// --- Initialization Helpers ---

const initLivePlayer = (p: Player): LivePlayer => ({
    playerId: p.id,
    playerName: p.name,
    position: p.position,
    ovr: calculatePlayerOvr(p),
    currentCondition: p.condition || 100,
    // Attributes for engine
    attr: {
        ins: p.ins || 70, out: p.out || 70, ft: p.ft || 75,
        drFoul: p.drawFoul || 50,
        def: p.def || 70, blk: p.blk || 50, stl: p.steal || 50, foulTendency: 50,
        reb: p.reb || 70,
        pas: p.passAcc || 70,
        stamina: p.stamina || 80
    },
    // Box Score Init
    pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
    fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
    rimM: 0, rimA: 0, midM: 0, midA: 0,
    mp: 0, g: 1, gs: 0, pf: 0
});

const initTeamState = (team: Team, tactics?: GameTactics): TeamState => {
    // 1. Determine Starters based on Tactics or Best OVR
    const finalTactics = tactics || generateAutoTactics(team);
    const roster = team.roster.map(initLivePlayer);
    
    let starters: LivePlayer[] = [];
    let bench: LivePlayer[] = [];

    if (finalTactics.starters) {
        // Map configured starters
        const starterIds = Object.values(finalTactics.starters).filter(id => id);
        starters = roster.filter(p => starterIds.includes(p.playerId));
        
        // Fill gaps if missing (e.g., injuries or incomplete setup)
        if (starters.length < 5) {
            const missingCount = 5 - starters.length;
            const remaining = roster.filter(p => !starterIds.includes(p.playerId));
            // Sort by OVR desc
            remaining.sort((a, b) => b.ovr - a.ovr);
            starters = [...starters, ...remaining.slice(0, missingCount)];
        }
    } else {
        // Fallback: Top 5 OVR
        const sorted = [...roster].sort((a, b) => b.ovr - a.ovr);
        starters = sorted.slice(0, 5);
    }
    
    // Determine Bench
    bench = roster.filter(p => !starters.find(s => s.playerId === p.playerId));

    // Mark GS
    starters.forEach(p => p.gs = 1);

    return {
        id: team.id,
        name: team.name,
        score: 0,
        tactics: finalTactics,
        onCourt: starters,
        bench: bench,
        timeouts: 7,
        fouls: 0,
        bonus: false
    };
};

// --- Main Engine ---

export function runFullGameSimulation(
    homeTeam: Team, 
    awayTeam: Team, 
    userTeamId: string | null, 
    userTactics?: GameTactics,
    isHomeB2B: boolean = false,
    isAwayB2B: boolean = false
): SimulationResult {
    
    // 1. Initialize State
    const isUserHome = userTeamId === homeTeam.id;
    const isUserAway = userTeamId === awayTeam.id;
    
    const state: GameState = {
        home: initTeamState(homeTeam, isUserHome ? userTactics : undefined),
        away: initTeamState(awayTeam, isUserAway ? userTactics : undefined),
        quarter: 1,
        gameClock: 720,
        shotClock: 24,
        possession: 'home', 
        isDeadBall: true, // Start as dead ball
        logs: [],
        isHomeB2B,
        isAwayB2B
    };

    // 2. Game Loop
    while (state.quarter <= 4) {
        // 2-1. Pre-Possession: Check Substitutions & Quarter End
        if (state.gameClock <= 0) {
            state.logs.push({
                quarter: state.quarter, timeRemaining: '0:00', teamId: '', type: 'info',
                text: `--- ${state.quarter}쿼터 종료 (${state.home.score} : ${state.away.score}) ---`
            });

            state.quarter++;
            if (state.quarter > 4) break; 

            state.gameClock = 720; 
            state.home.fouls = 0; state.away.fouls = 0;
            state.isDeadBall = true;
        }

        // Substitutions (Only on Dead Ball)
        if (state.isDeadBall) {
            handleSubstitutions(state);
            state.isDeadBall = false; // Ball becomes live
        }

        // 2-2. Simulate Possession
        const result = resolvePossession(state);
        
        // 2-3. Apply Results
        const activeTeam = state.possession === 'home' ? state.home : state.away;
        
        // Score
        if ((result.type === 'score' || result.type === 'freethrow') && result.points) {
            activeTeam.score += result.points;
        }
        
        // Player Stats - Primary Actor
        if (result.player) {
            if (result.type === 'score') {
                result.player.pts += result.points!;
                result.player.fgm++; result.player.fga++;
                if (result.points === 3) { result.player.p3m++; result.player.p3a++; }
            } else if (result.type === 'miss') {
                result.player.fga++;
                if (result.logText.includes('3점')) result.player.p3a++;
            } else if (result.type === 'turnover') {
                result.player.tov++;
            } else if (result.type === 'freethrow') {
                // Approximate FT stats from points (e.g., 2 points = 2/2 or 2/3?) 
                // Simplified: Points = FTM. Attempts = Points + 0 or 1 random miss logic in flowEngine?
                // Let's assume flowEngine handles logic, but here we just add points.
                // NOTE: flowEngine logic for FTs needs to track attempts. 
                // For now, assume 100% or store attempts in result. 
                // *Correction*: Updated flowEngine to not track FTA explicitly in result struct efficiently yet.
                // We will rely on simple approximation here: 
                result.player.pts += result.points!;
                result.player.ftm += result.points!;
                result.player.fta += result.points!; // Assume made for now to fix 0/0 bug, improve later
            }
        }
        
        // Secondary Actor
        if (result.secondaryPlayer) {
             if (result.type === 'score') result.secondaryPlayer.ast++;
             if (result.type === 'turnover') result.secondaryPlayer.stl++;
             if (result.type === 'block') result.secondaryPlayer.blk++;
             if (result.type === 'foul' || result.type === 'freethrow') result.secondaryPlayer.pf++;
        }
        
        // Rebound
        if (result.rebounder) {
            result.rebounder.reb++;
            const rebounderTeam = state.home.onCourt.includes(result.rebounder) ? 'home' : 'away';
            // Offensive rebound if team matched possession (before switch)
            if (rebounderTeam === state.possession) result.rebounder.offReb++;
            else result.rebounder.defReb++;
        }

        // 2-4. Update Time & Fatigue
        state.gameClock -= result.timeTaken;
        state.isDeadBall = result.isDeadBall || false;
        
        // Fatigue Drain (Simple)
        const drain = (result.timeTaken / 60) * 0.5; // ~0.5 condition per minute
        state.home.onCourt.forEach(p => { p.mp += result.timeTaken / 60; p.currentCondition -= drain; });
        state.away.onCourt.forEach(p => { p.mp += result.timeTaken / 60; p.currentCondition -= drain; });
        
        // Bench Recovery
        state.home.bench.forEach(p => p.currentCondition = Math.min(100, p.currentCondition + (drain * 0.6)));
        state.away.bench.forEach(p => p.currentCondition = Math.min(100, p.currentCondition + (drain * 0.6)));

        // Add Log
        state.logs.push({
            quarter: state.quarter,
            timeRemaining: formatTime(Math.max(0, state.gameClock)),
            teamId: activeTeam.id,
            type: result.type,
            text: `[${state.home.score}-${state.away.score}] ${result.logText}`
        });

        // 2-5. Switch Possession
        if (result.nextPossession !== 'keep') {
            state.possession = result.nextPossession as 'home' | 'away';
        }
    }

    // 3. Sudden Death (If Tied)
    if (state.home.score === state.away.score) {
        state.logs.push({ quarter: 4, timeRemaining: '0:00', teamId: '', type: 'info', text: `!!! 정규 시간 종료 동점 (${state.home.score} : ${state.away.score}) - 서든데스 !!!` });
        while (state.home.score === state.away.score) {
            const result = resolvePossession(state);
            const activeTeam = state.possession === 'home' ? state.home : state.away;
            
            if ((result.type === 'score' || result.type === 'freethrow') && result.points) {
                activeTeam.score += result.points;
            }
            state.logs.push({ quarter: 4, timeRemaining: 'SD', teamId: activeTeam.id, type: result.type, text: `[서든데스] ${result.logText}` });
            if (result.nextPossession !== 'keep') state.possession = result.nextPossession as any;
        }
    }

    // 4. Finalize
    // Merge stats from onCourt and Bench
    const finalHomeBox = [...state.home.onCourt, ...state.home.bench];
    const finalAwayBox = [...state.away.onCourt, ...state.away.bench];
    
    // Prepare Roster Updates (Fatigue)
    const rosterUpdates: any = {};
    [...finalHomeBox, ...finalAwayBox].forEach(p => {
        rosterUpdates[p.playerId] = { condition: Math.round(p.currentCondition) };
    });

    return {
        homeScore: state.home.score,
        awayScore: state.away.score,
        homeBox: finalHomeBox,
        awayBox: finalAwayBox,
        rosterUpdates: rosterUpdates, 
        homeTactics: state.home.tactics, // Simplified return
        awayTactics: state.away.tactics,
        pbpLogs: state.logs
    };
}
