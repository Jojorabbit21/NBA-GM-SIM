
import { Team, GameTactics, DepthChart, SimulationResult, RosterUpdate } from '../../../../types';
import { TeamState, GameState, LivePlayer } from './pbpTypes';
import { initTeamState } from './initializer';
import { updateOnCourtStates } from './stateUpdater';
import { simulatePossession } from './possessionHandler';
import { checkSubstitutions } from './substitutionSystem';
import { checkAndApplyRotation, forceSubstitution } from './rotationLogic';
import { formatTime, calculatePossessionTime } from './timeEngine';
import { applyPossessionResult } from './statsMappers'; 

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
    
    // 1. Initialize State
    // User Tactics override if available and applicable
    const hTactics = (userTeamId === homeTeam.id && userTactics) ? userTactics : undefined;
    const aTactics = (userTeamId === awayTeam.id && userTactics) ? userTactics : undefined;

    const state: GameState = {
        home: initTeamState(homeTeam, hTactics, homeDepthChart),
        away: initTeamState(awayTeam, aTactics, awayDepthChart),
        quarter: 1,
        gameClock: 720, // 12 mins
        shotClock: 24,
        possession: 'home', // Jump ball logic simplified to home first
        isDeadBall: false,
        logs: [],
        isHomeB2B,
        isAwayB2B,
        rotationHistory: {},
        shotEvents: [],
        injuries: []
    };

    // 2. Game Loop (4 Quarters)
    for (let q = 1; q <= 4; q++) {
        state.quarter = q;
        state.gameClock = 720;
        
        // Reset Team Foul Counts at quarter start
        state.home.fouls = 0;
        state.away.fouls = 0;
        
        // Log Quarter Start
        state.logs.push({
            quarter: q,
            timeRemaining: '12:00',
            teamId: 'SYSTEM',
            text: q === 1 ? '경기 시작 (Tip-off)' : `${q}쿼터 시작`,
            type: 'info'
        });

        while (state.gameClock > 0) {
            // A. Determine Pace & Time Taken
            const offTeam = state.possession === 'home' ? state.home : state.away;
            const defTeam = state.possession === 'home' ? state.away : state.home;
            
            const timeTaken = calculatePossessionTime(state, offTeam.tactics.sliders, offTeam.tactics.offenseTactics[0]);
            
            // B. Simulate Possession Outcome
            const result = simulatePossession(state);
            
            // C. Apply Result (Stats, Score, Logs)
            applyPossessionResult(state, result);
            
            // D. Update Game Clock
            state.gameClock = Math.max(0, state.gameClock - timeTaken);
            
            // E. Update Fatigue & Minutes
            updateOnCourtStates(state, timeTaken);

            // F. Process Substitutions
            // 1. Check for forced subs (Injury, Foul Out)
            // 2. Check for Fatigue Shutdown
            // 3. Check for Rotation Schedule (User defined)
            
            const currentTotalSec = ((state.quarter - 1) * 720) + (720 - state.gameClock);
            
            // Apply Manual Rotation Map (Strict)
            checkAndApplyRotation(state, state.home, currentTotalSec);
            checkAndApplyRotation(state, state.away, currentTotalSec);

            // Check Emergency Subs (Injury/Fouls/Extreme Fatigue)
            const hSubs = checkSubstitutions(state, state.home);
            const aSubs = checkSubstitutions(state, state.away);
            
            hSubs.forEach(req => forceSubstitution(state, state.home, req.outPlayer, req.reason));
            aSubs.forEach(req => forceSubstitution(state, state.away, req.outPlayer, req.reason));

            // Switch Possession
            state.possession = state.possession === 'home' ? 'away' : 'home';
        }
    }

    // 3. Finalize & Map Results
    const mapToBox = (teamState: TeamState) => {
        return [...teamState.onCourt, ...teamState.bench].map(p => ({
            playerId: p.playerId,
            playerName: p.playerName,
            pts: p.pts, reb: p.reb, offReb: p.offReb, defReb: p.defReb,
            ast: p.ast, stl: p.stl, blk: p.blk, tov: p.tov,
            fgm: p.fgm, fga: p.fga, p3m: p.p3m, p3a: p.p3a, ftm: p.ftm, fta: p.fta,
            rimM: p.rimM, rimA: p.rimA, midM: p.midM, midA: p.midA,
            mp: parseFloat(p.mp.toFixed(1)),
            g: p.mp > 0 ? 1 : 0,
            gs: p.gs,
            pf: p.pf,
            plusMinus: p.plusMinus,
            condition: parseFloat(p.currentCondition.toFixed(1)),
            isStopper: teamState.tactics.stopperId === p.playerId,
            // Additional fields for detailed boxscore
            zoneData: {
                zone_rim_m: p.zone_rim_m, zone_rim_a: p.zone_rim_a,
                zone_paint_m: p.zone_paint_m, zone_paint_a: p.zone_paint_a,
                zone_mid_l_m: p.zone_mid_l_m, zone_mid_l_a: p.zone_mid_l_a,
                zone_mid_c_m: p.zone_mid_c_m, zone_mid_c_a: p.zone_mid_c_a,
                zone_mid_r_m: p.zone_mid_r_m, zone_mid_r_a: p.zone_mid_r_a,
                zone_c3_l_m: p.zone_c3_l_m, zone_c3_l_a: p.zone_c3_l_a,
                zone_c3_r_m: p.zone_c3_r_m, zone_c3_r_a: p.zone_c3_r_a,
                zone_atb3_l_m: p.zone_atb3_l_m, zone_atb3_l_a: p.zone_atb3_l_a,
                zone_atb3_c_m: p.zone_atb3_c_m, zone_atb3_c_a: p.zone_atb3_c_a,
                zone_atb3_r_m: p.zone_atb3_r_m, zone_atb3_r_a: p.zone_atb3_r_a,
            }
        }));
    };

    const mapTactics = (t: GameTactics) => ({
        offense: t.offenseTactics[0],
        defense: t.defenseTactics.find(d => d !== 'AceStopper') || t.defenseTactics[0],
        stopperId: t.stopperId,
        pace: t.sliders.pace,
        sliders: t.sliders
    });

    // Collect Roster Updates (Injuries & Fatigue)
    const rosterUpdates: Record<string, RosterUpdate> = {};
    [state.home, state.away].forEach(team => {
        [...team.onCourt, ...team.bench].forEach((p: LivePlayer) => {
            // Always record condition for everyone involved in the game
            rosterUpdates[p.playerId] = {
                condition: parseFloat(p.currentCondition.toFixed(1))
            };

            if (p.health !== 'Healthy') {
                rosterUpdates[p.playerId].health = p.health;
                rosterUpdates[p.playerId].injuryType = p.injuryType;
                rosterUpdates[p.playerId].returnDate = p.returnDate;
            }
        });
    });

    return {
        homeScore: state.home.score,
        awayScore: state.away.score,
        homeBox: mapToBox(state.home),
        awayBox: mapToBox(state.away),
        homeTactics: mapTactics(state.home.tactics),
        awayTactics: mapTactics(state.away.tactics),
        rosterUpdates: rosterUpdates,
        pbpLogs: state.logs,
        rotationData: state.rotationHistory,
        pbpShotEvents: state.shotEvents,
        injuries: state.injuries
    };
}
