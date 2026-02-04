import { Team, SimulationResult, GameTactics, Player, PlayerBoxScore } from '../../../../types';
import { GameState, LivePlayer, TeamState } from './pbpTypes';
import { resolvePossession } from './flowEngine';
import { formatTime } from './timeEngine';
import { generateAutoTactics } from '../../tactics/tacticGenerator';
import { INITIAL_STATS } from '../../../../utils/constants';

// --- Initialization Helpers ---

const initLivePlayer = (p: Player): LivePlayer => ({
    playerId: p.id,
    playerName: p.name,
    position: p.position,
    ovr: p.ovr,
    currentCondition: p.condition || 100,
    // Box Score Init
    pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
    fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
    rimM: 0, rimA: 0, midM: 0, midA: 0,
    mp: 0, g: 1, gs: 0, pf: 0
});

const initTeamState = (team: Team, tactics?: GameTactics): TeamState => {
    const finalTactics = tactics || generateAutoTactics(team);
    // Simple starter selection: First 5 healthy
    const healthy = team.roster.filter(p => p.health !== 'Injured');
    const starters = healthy.slice(0, 5).map(initLivePlayer);
    const bench = healthy.slice(5).map(initLivePlayer);
    
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
        fouls: 0
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
        possession: 'home', // Jumpball logic omitted for simplicity, default home
        isDeadBall: false,
        logs: [],
        isHomeB2B,
        isAwayB2B
    };

    // 2. Game Loop (Regular 4 Quarters)
    while (state.quarter <= 4) {
        // 2-1. Check Quarter End
        if (state.gameClock <= 0) {
            state.logs.push({
                quarter: state.quarter, timeRemaining: '0:00', teamId: '', type: 'info',
                text: `--- ${state.quarter}쿼터 종료 (${state.home.score} : ${state.away.score}) ---`
            });

            state.quarter++;
            if (state.quarter > 4) break; // End of Regulation

            // Prepare next quarter
            state.gameClock = 720; 
            state.home.fouls = 0;
            state.away.fouls = 0;
        }

        // 2-2. Simulate Possession
        const result = resolvePossession(state);
        
        // 2-3. Apply Results (Score, Stats, Time)
        const activeTeam = state.possession === 'home' ? state.home : state.away;
        
        if (result.type === 'score' && result.points) {
            activeTeam.score += result.points;
        }
        
        // Update Player Stats
        if (result.player) {
            if (result.type === 'score') {
                result.player.pts += result.points!;
                result.player.fgm++;
                result.player.fga++;
                if (result.points === 3) { result.player.p3m++; result.player.p3a++; }
            } else if (result.type === 'miss') {
                result.player.fga++;
                if (result.logText.includes('3점')) result.player.p3a++;
            } else if (result.type === 'turnover') {
                result.player.tov++;
            }
        }
        
        if (result.secondaryPlayer) {
             if (result.type === 'score') result.secondaryPlayer.ast++;
             if (result.type === 'turnover') result.secondaryPlayer.stl++;
        }
        
        if (result.rebounder) {
            result.rebounder.reb++;
            const isHomeRebounder = state.home.onCourt.some(p => p.playerId === result.rebounder!.playerId);
            // If rebounder team == possession team (after shot miss), it's offensive
            // But wait, resolvePossession determines outcome. 
            // In flowEngine: 
            // - If Miss -> Next Possession logic handles off reb assignment.
            // Let's rely on flowEngine logic or simplifed check:
            // The activeTeam is the shooter's team. 
            if ((activeTeam.id === state.home.id && isHomeRebounder) || (activeTeam.id === state.away.id && !isHomeRebounder)) {
                 result.rebounder.offReb++;
            } else {
                 result.rebounder.defReb++;
            }
        }

        // Time Update
        state.gameClock -= result.timeTaken;
        
        // Add Log
        state.logs.push({
            quarter: state.quarter,
            timeRemaining: formatTime(Math.max(0, state.gameClock)),
            teamId: activeTeam.id,
            type: result.type,
            text: `[${state.home.score}-${state.away.score}] ${result.logText}`
        });

        // Minutes
        state.home.onCourt.forEach(p => p.mp += result.timeTaken / 60);
        state.away.onCourt.forEach(p => p.mp += result.timeTaken / 60);

        // Switch Possession
        if (result.nextPossession !== 'keep') {
            state.possession = result.nextPossession;
        }
    }

    // 3. Sudden Death (If Tied)
    // No OT, just run possessions until score changes.
    if (state.home.score === state.away.score) {
        state.logs.push({
            quarter: 4, timeRemaining: '0:00', teamId: '', type: 'info',
            text: `!!! 정규 시간 종료 동점 (${state.home.score} : ${state.away.score}) - 서든데스(Game Winning Shot) 진행 !!!`
        });

        // Loop until score changes
        while (state.home.score === state.away.score) {
            // Force 12 seconds per possession in sudden death for stat simplicity
            const sdTimeTaken = 12; 
            
            const result = resolvePossession(state);
            const activeTeam = state.possession === 'home' ? state.home : state.away;

            // Apply Score
            if (result.type === 'score' && result.points) {
                activeTeam.score += result.points;
            }

            // Apply Stats (Minimal set for SD)
            if (result.player) {
                if (result.type === 'score') { result.player.pts += result.points!; result.player.fgm++; result.player.fga++; }
                else if (result.type === 'miss') { result.player.fga++; }
                else if (result.type === 'turnover') { result.player.tov++; }
            }

            // Log
            state.logs.push({
                quarter: 4,
                timeRemaining: 'SD', // Sudden Death
                teamId: activeTeam.id,
                type: result.type,
                text: `[서든데스] ${result.logText}`
            });
            
            // If score changed, loop will exit naturally.
            // If not, switch possession and continue.
            if (result.nextPossession !== 'keep') {
                state.possession = result.nextPossession;
            }
        }
    }

    // 4. Finalize & Return
    return {
        homeScore: state.home.score,
        awayScore: state.away.score,
        homeBox: [...state.home.onCourt, ...state.home.bench],
        awayBox: [...state.away.onCourt, ...state.away.bench],
        rosterUpdates: {}, 
        homeTactics: { offense: 'Balance', defense: 'ManToManPerimeter' },
        awayTactics: { offense: 'Balance', defense: 'ManToManPerimeter' },
        pbpLogs: state.logs
    };
}