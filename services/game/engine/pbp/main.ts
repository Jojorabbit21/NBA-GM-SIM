import { Team, GameTactics, SimulationResult, PlayerBoxScore, PbpLog, DepthChart } from '../../../../types';
import { GameState, LivePlayer, TeamState } from './pbpTypes';
import { calculatePlayerArchetypes } from './archetypeSystem';
import { resolvePossession } from './flowEngine';
import { checkSubstitutions, executeSubstitutions } from './substitutionSystem';
import { distributeAssists } from '../playmakingSystem';
import { distributeRebounds } from '../defenseSystem';
import { calculateIncrementalFatigue } from '../fatigueSystem';
import { calculateAceStopperImpact } from '../aceStopperSystem';
import { calculateFoulStats } from '../foulSystem';

// Helper to init LivePlayer
function createLivePlayer(p: any, isStarter: boolean): LivePlayer {
    const attr = {
        ins: p.ins, out: p.out, mid: p.midRange, ft: p.ft, threeVal: (p.threeCorner+p.three45+p.threeTop)/3,
        speed: p.speed, agility: p.agility, strength: p.strength, vertical: p.vertical,
        stamina: p.stamina, durability: p.durability, hustle: p.hustle,
        height: p.height, weight: p.weight,
        handling: p.handling, hands: p.hands, pas: p.passAcc, passAcc: p.passAcc, passVision: p.passVision, passIq: p.passIq,
        shotIq: p.shotIq, offConsist: p.offConsist,
        postPlay: p.postPlay, drFoul: p.drawFoul,
        def: p.def, intDef: p.intDef, perDef: p.perDef, blk: p.blk, stl: p.steal,
        helpDefIq: p.helpDefIq, defConsist: p.defConsist, foulTendency: 50,
        reb: p.reb
    };
    
    // [CRITICAL FIX] Use condition ?? 100
    const condition = p.condition !== undefined ? p.condition : 100;

    return {
        playerId: p.id,
        playerName: p.name,
        pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
        fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
        rimM: 0, rimA: 0, midM: 0, midA: 0, pf: 0, plusMinus: 0,
        mp: 0, g: 1, gs: isStarter ? 1 : 0,
        
        currentCondition: condition,
        position: p.position,
        ovr: p.ovr,
        isStarter,
        health: p.health || 'Healthy',
        lastSubInTime: 720, // Start of Q1
        conditionAtSubIn: condition,
        isShutdown: false,
        needsDeepRecovery: false,
        archetypes: calculatePlayerArchetypes(attr, condition),
        attr,
        
        zone_rim_m: 0, zone_rim_a: 0,
        zone_paint_m: 0, zone_paint_a: 0,
        zone_mid_l_m: 0, zone_mid_l_a: 0,
        zone_mid_c_m: 0, zone_mid_c_a: 0,
        zone_mid_r_m: 0, zone_mid_r_a: 0,
        zone_c3_l_m: 0, zone_c3_l_a: 0,
        zone_c3_r_m: 0, zone_c3_r_a: 0,
        zone_atb3_l_m: 0, zone_atb3_l_a: 0,
        zone_atb3_c_m: 0, zone_atb3_c_a: 0,
        zone_atb3_r_m: 0, zone_atb3_r_a: 0
    };
}

function initTeamState(team: Team, tactics?: GameTactics, depthChart?: DepthChart | null): TeamState {
    // Default tactics if missing
    const appliedTactics = tactics || {
        offenseTactics: ['Balance'],
        defenseTactics: ['ManToManPerimeter'],
        sliders: { pace: 5, offReb: 5, defIntensity: 5, defReb: 5, fullCourtPress: 1, zoneUsage: 1, rotationFlexibility: 5 },
        starters: { PG: '', SG: '', SF: '', PF: '', C: '' },
        minutesLimits: {}
    };

    // Determine starters
    const starterIds = Object.values(appliedTactics.starters).filter(Boolean);
    // Fallback if starters not set
    if (starterIds.length === 0) {
        const sorted = [...team.roster].sort((a, b) => b.ovr - a.ovr);
        for(let i=0; i<5 && i<sorted.length; i++) starterIds.push(sorted[i].id);
    }

    const onCourt: LivePlayer[] = [];
    const bench: LivePlayer[] = [];

    team.roster.forEach(p => {
        const isStarter = starterIds.includes(p.id);
        const live = createLivePlayer(p, isStarter);
        if (isStarter && onCourt.length < 5) onCourt.push(live);
        else bench.push(live);
    });

    // Handle edge case where roster < 5 or starters missing (shouldn't happen in valid DB)
    while (onCourt.length < 5 && bench.length > 0) {
        onCourt.push(bench.shift()!);
    }

    return {
        id: team.id,
        name: team.name,
        score: 0,
        tactics: appliedTactics,
        depthChart: depthChart || undefined,
        onCourt,
        bench,
        timeouts: 7,
        fouls: 0,
        bonus: false
    };
}

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
    const homeTactics = userTeamId === homeTeam.id && userTactics ? userTactics : undefined;
    const awayTactics = userTeamId === awayTeam.id && userTactics ? userTactics : undefined;

    // TODO: AI Tactics Generation if undefined (using generateAutoTactics) - handled in calling function or defaults

    const state: GameState = {
        home: initTeamState(homeTeam, homeTactics, homeDepthChart),
        away: initTeamState(awayTeam, awayTactics, awayDepthChart),
        quarter: 1,
        gameClock: 720,
        shotClock: 24,
        possession: 'home', // Jumpball logic simplified
        isDeadBall: false,
        logs: [],
        isHomeB2B,
        isAwayB2B,
        rotationHistory: {}
    };

    state.logs.push({ quarter: 1, timeRemaining: '12:00', teamId: '', text: '경기 시작', type: 'info' });

    let isGameOver = false;

    // 2. Game Loop
    while (!isGameOver) {
        // A. Quarter Management
        if (state.gameClock <= 0) {
            if (state.quarter >= 4 && state.home.score !== state.away.score) {
                isGameOver = true;
                state.logs.push({ 
                    quarter: state.quarter, timeRemaining: '0:00', teamId: '', 
                    text: `경기 종료 - 최종 스코어 ${state.home.score}:${state.away.score}`, type: 'info' 
                });
                
                // Final Rotation Flush
                [state.home, state.away].forEach(t => {
                    t.onCourt.forEach(p => {
                        const qLen = state.quarter > 4 ? 300 : 720;
                        const prevDuration = (Math.min(state.quarter, 5) - 1) * 720 + Math.max(0, state.quarter - 5) * 300;
                        const inRelative = qLen - p.lastSubInTime;
                        const outRelative = qLen;
                        
                        if (outRelative > inRelative) {
                            const segIn = prevDuration + inRelative;
                            const segOut = prevDuration + outRelative;
                            if (!state.rotationHistory[p.playerId]) state.rotationHistory[p.playerId] = [];
                            state.rotationHistory[p.playerId].push({ in: segIn, out: segOut });
                        }
                    });
                });

                break;
            } else {
                // End of Quarter Logic (Flush rotation, reset clock/fouls)
                [state.home, state.away].forEach(t => {
                    t.onCourt.forEach(p => {
                        const qLen = state.quarter > 4 ? 300 : 720;
                        const prevDuration = (Math.min(state.quarter, 5) - 1) * 720 + Math.max(0, state.quarter - 5) * 300;
                        const inRelative = qLen - p.lastSubInTime;
                        const outRelative = qLen;
                        
                        // [FIX] Flush segment for the quarter that just ended
                        if (outRelative > inRelative) {
                            const segIn = prevDuration + inRelative;
                            const segOut = prevDuration + outRelative;
                            if (!state.rotationHistory[p.playerId]) state.rotationHistory[p.playerId] = [];
                            state.rotationHistory[p.playerId].push({ in: segIn, out: segOut });
                        }
                        
                        // Reset for next quarter
                        p.lastSubInTime = (state.quarter >= 4) ? 300 : 720; // Next Q duration (OT is 5min)
                    });
                    t.fouls = 0;
                    t.bonus = false;
                });

                state.quarter++;
                state.gameClock = (state.quarter > 4) ? 300 : 720;
                state.isDeadBall = true;
                
                state.logs.push({ 
                    quarter: state.quarter, timeRemaining: (state.quarter > 4 ? '5:00' : '12:00'), teamId: '', 
                    text: `${state.quarter > 4 ? '연장전' : state.quarter + '쿼터'} 시작`, type: 'info' 
                });
            }
        }

        // B. Substitutions (Only during dead ball or if forced)
        // We check every possession for simulation simplicity, treating it as "next dead ball opportunity"
        // In real PBP, we'd check `isDeadBall`. Here we check frequently to simulate flow.
        const homeSubs = checkSubstitutions(state, state.home);
        if (homeSubs.length > 0) executeSubstitutions(state, state.home, homeSubs);
        
        const awaySubs = checkSubstitutions(state, state.away);
        if (awaySubs.length > 0) executeSubstitutions(state, state.away, awaySubs);

        // C. Resolve Possession
        const result = resolvePossession(state);
        
        // Update Game Clock
        state.gameClock -= result.timeTaken;
        if (state.gameClock < 0) state.gameClock = 0; // Clamp

        // D. Apply Results to Players & Teams
        const offTeam = state.possession === 'home' ? state.home : state.away;
        const defTeam = state.possession === 'home' ? state.away : state.home;

        // Apply Player Stats
        if (result.player) {
            const p = result.player;
            p.mp += (result.timeTaken / 60); // Approx
            
            // Incremental Fatigue
            const isB2B = state.possession === 'home' ? state.isHomeB2B : state.isAwayB2B;
            const stopperId = defTeam.tactics.stopperId;
            const isStopper = stopperId === p.playerId; // Wait, p is OFFENSIVE player here.
            
            // Apply fatigue to ALL players on court
            [state.home, state.away].forEach(t => {
                const isTeamB2B = t.id === state.home.id ? state.isHomeB2B : state.isAwayB2B;
                t.onCourt.forEach(cp => {
                    // This assumes timeTaken is ~14s. 
                    // To be precise, we accumulate minutes.
                    // But for condition, we decrement.
                    const isCPStopper = t.id !== offTeam.id && t.tactics.stopperId === cp.playerId;
                    const fatRes = calculateIncrementalFatigue(cp, result.timeTaken, t.tactics.sliders, isTeamB2B, isCPStopper);
                    cp.currentCondition = Math.max(0, cp.currentCondition - fatRes.drain);
                    
                    // Recover bench players
                    t.bench.forEach(bp => {
                        // Bench recovery: ~0.1 per minute? 
                        // Base recovery logic can be simple here.
                        if (bp.currentCondition < 100) {
                            bp.currentCondition = Math.min(100, bp.currentCondition + (result.timeTaken / 60) * 0.5);
                        }
                    });
                });
            });

            if (result.type === 'score') {
                offTeam.score += (result.points || 2);
                p.pts += (result.points || 2);
                p.fgm++; p.fga++;
                if (result.points === 3) { p.p3m++; p.p3a++; }
                else {
                    // Distribute 2PT (Rim vs Mid)
                    // Simplified: Logic inside resolvePossession should ideally return zone info.
                    // For now, assume based on points/type.
                    // result.shotZoneId helps tracking
                }
                
                // Update Zones based on `shotZoneId`
                if (result.shotZoneId) {
                    (p as any)[result.shotZoneId + '_m']++;
                    (p as any)[result.shotZoneId + '_a']++;
                }

                // Assist
                if (result.secondaryPlayer) {
                    result.secondaryPlayer.ast++;
                }
                
                // Plus/Minus
                offTeam.onCourt.forEach(op => op.plusMinus += (result.points || 2));
                defTeam.onCourt.forEach(dp => dp.plusMinus -= (result.points || 2));

            } else if (result.type === 'miss') {
                p.fga++;
                if (result.logText.includes('3점')) p.p3a++; // Rough check if zone not passed explicitly in `points` context
                
                if (result.shotZoneId) {
                    (p as any)[result.shotZoneId + '_a']++;
                }

                // Rebound
                if (result.rebounder) {
                    result.rebounder.reb++;
                    if (result.rebounder.playerId === p.playerId) result.rebounder.offReb++; // Own miss
                    else if (offTeam.onCourt.some(x => x.playerId === result.rebounder?.playerId)) result.rebounder.offReb++;
                    else result.rebounder.defReb++;
                }
            } else if (result.type === 'turnover') {
                p.tov++;
                if (result.secondaryPlayer) result.secondaryPlayer.stl++; // Steal
            } else if (result.type === 'foul') {
                // Handled in foulSystem if needed, or simplified here
            }
        }

        // Add Log
        if (result.logText) {
            state.logs.push({
                quarter: state.quarter,
                timeRemaining: `${Math.floor(state.gameClock/60)}:${String(state.gameClock%60).padStart(2,'0')}`,
                teamId: offTeam.id,
                text: result.logText,
                type: result.type
            });
        }

        // Switch Possession
        if (result.nextPossession !== 'keep' && result.nextPossession !== 'free_throw') {
            state.possession = result.nextPossession;
        }
    }

    // 3. Finalize & Return
    // Map LivePlayer to PlayerBoxScore
    const mapBox = (live: LivePlayer[]): PlayerBoxScore[] => live.map(p => ({
        playerId: p.playerId,
        playerName: p.playerName,
        pts: p.pts, reb: p.reb, offReb: p.offReb, defReb: p.defReb, ast: p.ast, stl: p.stl, blk: p.blk, tov: p.tov, pf: p.pf,
        fgm: p.fgm, fga: p.fga, p3m: p.p3m, p3a: p.p3a, ftm: p.ftm, fta: p.fta,
        rimM: p.zone_rim_m + p.zone_paint_m, rimA: p.zone_rim_a + p.zone_paint_a,
        midM: p.zone_mid_l_m + p.zone_mid_c_m + p.zone_mid_r_m, midA: p.zone_mid_l_a + p.zone_mid_c_a + p.zone_mid_r_a,
        mp: p.mp, g: 1, gs: p.isStarter ? 1 : 0, plusMinus: p.plusMinus,
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

    // Create Roster Updates (Condition & Injuries)
    const rosterUpdates: any = {};
    const processUpdates = (teamState: TeamState) => {
        [...teamState.onCourt, ...teamState.bench].forEach(p => {
            rosterUpdates[p.playerId] = {
                condition: p.currentCondition,
                health: p.health,
                // injuryType, returnDate handled if injury occurred
            };
        });
    };
    processUpdates(state.home);
    processUpdates(state.away);

    return {
        homeScore: state.home.score,
        awayScore: state.away.score,
        homeBox: mapBox([...state.home.onCourt, ...state.home.bench]),
        awayBox: mapBox([...state.away.onCourt, ...state.away.bench]),
        rosterUpdates,
        homeTactics: { offense: state.home.tactics.offenseTactics[0], defense: state.home.tactics.defenseTactics[0], pace: state.home.tactics.sliders.pace, sliders: state.home.tactics.sliders, stopperId: state.home.tactics.stopperId },
        awayTactics: { offense: state.away.tactics.offenseTactics[0], defense: state.away.tactics.defenseTactics[0], pace: state.away.tactics.sliders.pace, sliders: state.away.tactics.sliders, stopperId: state.away.tactics.stopperId },
        pbpLogs: state.logs,
        rotationData: state.rotationHistory
    };
}