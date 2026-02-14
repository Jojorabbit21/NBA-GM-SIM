
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

    // [FIX] Initialize Rotation History for Starters
    // 선발 선수들의 시작 시간(0분)을 기록하여 1쿼터 차트가 누락되지 않도록 함
    [state.home, state.away].forEach(team => {
        team.onCourt.forEach(p => {
            if (!state.rotationHistory[p.playerId]) {
                state.rotationHistory[p.playerId] = [];
            }
            state.rotationHistory[p.playerId].push({ in: 0, out: 0 });
        });
    });

    // 2. Game Loop (4 Quarters)
    for (let q = 1; q <= 4; q++) {
        state.quarter = q;
        state.gameClock = 720;
        state.shotClock = 24; // Reset at quarter start
        
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
            const offTeam = state.possession === 'home' ? state.home : state.away;
            
            // B. Simulate Possession Outcome (FIRST to determine PlayType)
            // We need to simulate first to know if it's a Transition play or not for time calc
            // But we need time calc to update clock.
            // Compromise: We calculate potential play result, get playType, then calc time, then apply.
            // Actually, simulatePossession generates the result object.
            
            const result = simulatePossession(state);
            
            // A. Determine Pace & Time Taken (Now with PlayType context)
            const timeTaken = calculatePossessionTime(
                state, 
                offTeam.tactics.sliders, 
                offTeam.tactics.offenseTactics[0],
                result.playType
            );
            
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

            // G. Handle Possession Change & Shot Clock
            // [Offensive Rebound Logic]
            // If the result was a miss AND the rebounder is on the offensive team, maintain possession.
            let isOffReb = false;
            
            if (result.type === 'miss' && result.rebounder) {
                // Check if rebounder belongs to the current offensive team
                // We compare player IDs within the current offTeam's onCourt array
                const rebounderId = result.rebounder.playerId;
                if (offTeam.onCourt.some(p => p.playerId === rebounderId)) {
                    isOffReb = true;
                }
            }

            if (isOffReb) {
                // Offensive Rebound: Keep Possession, Reset Shot Clock to 14
                // No change to state.possession
                state.shotClock = 14; 
                // The loop continues with the same team attacking, representing a putback or kick-out
            } else {
                // Standard Possession Change (Score, Def Rebound, Turnover, etc.)
                state.possession = state.possession === 'home' ? 'away' : 'home';
                state.shotClock = 24;
            }
        }
    }

    // [FIX] Finalize Rotation Segments
    // 경기 종료 시점까지 코트에 있는 선수들의 'out' 시간을 기록하여 그래프를 닫아줌
    const GAME_END_SEC = 48 * 60;
    [state.home, state.away].forEach(team => {
        team.onCourt.forEach(p => {
             const hist = state.rotationHistory[p.playerId];
             if (hist && hist.length > 0) {
                 hist[hist.length - 1].out = GAME_END_SEC;
             }
        });
    });

    // 3. Finalize & Map Results
    const mapToBox = (teamState: TeamState) => {
        return [...teamState.onCourt, ...teamState.bench].map(p => {
            // [New] Calculate average matchup effect
            let avgEffect = 0;
            if (p.matchupEffectCount > 0) {
                avgEffect = Math.round(p.matchupEffectSum / p.matchupEffectCount);
            }

            return {
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
                // [New] Pass through match up data
                isAceTarget: p.matchupEffectCount > 0,
                matchupEffect: avgEffect,
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
            };
        });
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
