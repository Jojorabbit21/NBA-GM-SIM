import { Team, GameTactics, DepthChart, SimulationResult, PlayerBoxScore, RosterUpdate, PbpLog } from '../../../../types';
import { GameState, TeamState, LivePlayer, PossessionResult } from './pbpTypes';
import { resolvePossession } from './flowEngine';
import { checkSubstitutions } from './substitutionSystem';
import { calculateIncrementalFatigue } from '../fatigueSystem';
import { calculatePlayerArchetypes } from './archetypeSystem';
import { formatTime } from './timeEngine';
import { generateAutoTactics } from '../tactics/tacticGenerator'; 
import { calculateOvr } from '../../../../utils/ovrUtils';

// Constants
const QUARTER_LENGTH = 720; // 12 mins

// Helper to map Player to LivePlayer
function createLivePlayer(p: any, isStarter: boolean): LivePlayer {
    const attr = {
        ins: p.ins, out: p.out, mid: p.midRange,
        ft: p.ft, threeVal: (p.threeCorner + p.three45 + p.threeTop) / 3,
        speed: p.speed, agility: p.agility, strength: p.strength, vertical: p.vertical,
        stamina: p.stamina, durability: p.durability, hustle: p.hustle,
        height: p.height, weight: p.weight,
        handling: p.handling, hands: p.hands,
        pas: p.passAcc, passAcc: p.passAcc, passVision: p.passVision, passIq: p.passIq,
        shotIq: p.shotIq, offConsist: p.offConsist,
        postPlay: p.postPlay,
        def: p.def, intDef: p.intDef, perDef: p.perDef,
        blk: p.blk, stl: p.steal,
        helpDefIq: p.helpDefIq, defConsist: p.defConsist,
        drFoul: p.drawFoul, foulTendency: 50, // Default
        reb: p.reb
    };

    const condition = p.condition ?? 100;
    
    return {
        playerId: p.id,
        playerName: p.name,
        pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
        fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
        rimM: 0, rimA: 0, midM: 0, midA: 0, pf: 0, plusMinus: 0,
        mp: 0, g: 1, gs: isStarter ? 1 : 0,
        
        currentCondition: condition,
        position: p.position,
        ovr: calculateOvr(p, p.position),
        isStarter,
        health: p.health,
        
        lastSubInTime: 0, // Will be set on court init
        conditionAtSubIn: condition,
        isShutdown: false,
        needsDeepRecovery: false,
        
        archetypes: calculatePlayerArchetypes(attr, condition),
        attr,
        
        // Zone stats init
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

function initTeamState(team: Team, depthChart: DepthChart | null | undefined, tactics?: GameTactics): TeamState {
    const finalTactics = tactics || generateAutoTactics(team);
    const starters = Object.values(finalTactics.starters);
    
    // Sort roster to ensure consistent processing
    const roster = [...team.roster];
    
    const livePlayers = roster.map(p => createLivePlayer(p, starters.includes(p.id)));
    
    const onCourt = livePlayers.filter(p => starters.includes(p.playerId));
    // Fill if missing starters (e.g. injuries)
    if (onCourt.length < 5) {
        const remaining = livePlayers.filter(p => !starters.includes(p.playerId));
        const needed = 5 - onCourt.length;
        onCourt.push(...remaining.slice(0, needed));
    }
    const bench = livePlayers.filter(p => !onCourt.includes(p));

    return {
        id: team.id,
        name: team.name,
        score: 0,
        tactics: finalTactics,
        depthChart: depthChart || undefined,
        onCourt,
        bench,
        timeouts: 7,
        fouls: 0,
        bonus: false
    };
}

function getAbsoluteTime(quarter: number, clock: number): number {
    // Quarter 1: 0-720
    // Quarter 2: 720-1440
    // Quarter 3: 1440-2160
    // Quarter 4: 2160-2880
    const qOffset = (quarter - 1) * QUARTER_LENGTH;
    return qOffset + (QUARTER_LENGTH - clock);
}

function processSubstitutions(state: GameState, team: TeamState) {
    const requests = checkSubstitutions(state, team);
    
    requests.forEach(req => {
        const outIdx = team.onCourt.findIndex(p => p.playerId === req.outPlayer.playerId);
        const inIdx = team.bench.findIndex(p => p.playerId === req.inPlayer.playerId);
        
        if (outIdx !== -1 && inIdx !== -1) {
            const outP = team.onCourt[outIdx];
            const inP = team.bench[inIdx];
            
            // Rotation Tracking update
            const currentTime = getAbsoluteTime(state.quarter, state.gameClock);
            
            // Close segment for outP
            const outHist = state.rotationHistory[outP.playerId];
            if (outHist && outHist.length > 0) {
                outHist[outHist.length - 1].out = currentTime;
            }
            
            // Open segment for inP
            if (!state.rotationHistory[inP.playerId]) state.rotationHistory[inP.playerId] = [];
            state.rotationHistory[inP.playerId].push({ in: currentTime, out: currentTime }); // out will update
            
            // Update LivePlayer State
            inP.lastSubInTime = state.gameClock;
            inP.conditionAtSubIn = inP.currentCondition;
            
            // Swap
            team.onCourt[outIdx] = inP;
            team.bench[inIdx] = outP;
            
            state.logs.push({
                quarter: state.quarter,
                timeRemaining: formatTime(state.gameClock),
                teamId: team.id,
                text: `교체: ${outP.playerName} out, ${inP.playerName} in (${req.reason})`,
                type: 'info'
            });
        }
    });
}

function isGameOver(state: GameState): boolean {
    if (state.quarter < 4) return false;
    if (state.gameClock > 0) return false;
    if (state.home.score !== state.away.score) return true;
    return false; // OT logic not implemented yet for simplicity
}

function handleQuarterEnd(state: GameState) {
    state.quarter++;
    state.gameClock = QUARTER_LENGTH;
    state.home.fouls = 0;
    state.away.fouls = 0;
    state.home.timeouts = Math.max(state.home.timeouts, 2); // Reset logic simplified
    state.away.timeouts = Math.max(state.away.timeouts, 2);
    
    // Close all rotation segments for quarter end
    const currentTime = getAbsoluteTime(state.quarter - 1, 0); // End of prev quarter
    [...state.home.onCourt, ...state.away.onCourt].forEach(p => {
        const hist = state.rotationHistory[p.playerId];
        if (hist && hist.length > 0) {
            hist[hist.length - 1].out = currentTime;
        }
    });
    
    // Open new segments for next quarter (if not game over)
    if (!isGameOver(state)) {
        const nextTime = getAbsoluteTime(state.quarter, QUARTER_LENGTH);
        [...state.home.onCourt, ...state.away.onCourt].forEach(p => {
            if (!state.rotationHistory[p.playerId]) state.rotationHistory[p.playerId] = [];
            state.rotationHistory[p.playerId].push({ in: nextTime, out: nextTime });
        });
        
        state.logs.push({
            quarter: state.quarter - 1,
            timeRemaining: '0:00',
            teamId: 'system',
            text: `${state.quarter-1}쿼터 종료. [${state.away.score} - ${state.home.score}]`,
            type: 'info'
        });
    }
}

function aggregateResults(state: GameState): SimulationResult {
    const homeBox: PlayerBoxScore[] = [...state.home.onCourt, ...state.home.bench].map(p => toPlayerBoxScore(p));
    const awayBox: PlayerBoxScore[] = [...state.away.onCourt, ...state.away.bench].map(p => toPlayerBoxScore(p));
    
    const rosterUpdates: RosterUpdate = {};
    const collectUpdates = (team: TeamState) => {
        [...team.onCourt, ...team.bench].forEach(p => {
            rosterUpdates[p.playerId] = {
                condition: p.currentCondition,
                health: p.health,
            };
        });
    };
    collectUpdates(state.home);
    collectUpdates(state.away);

    return {
        homeScore: state.home.score,
        awayScore: state.away.score,
        homeBox,
        awayBox,
        rosterUpdates,
        homeTactics: { 
            offense: state.home.tactics.offenseTactics[0], 
            defense: state.home.tactics.defenseTactics[0],
            pace: state.home.tactics.sliders.pace,
            stopperId: state.home.tactics.stopperId,
            sliders: state.home.tactics.sliders
        },
        awayTactics: { 
            offense: state.away.tactics.offenseTactics[0], 
            defense: state.away.tactics.defenseTactics[0],
            pace: state.away.tactics.sliders.pace,
            stopperId: state.away.tactics.stopperId,
            sliders: state.away.tactics.sliders
        },
        pbpLogs: state.logs,
        rotationData: state.rotationHistory
    };
}

function toPlayerBoxScore(p: LivePlayer): PlayerBoxScore {
    return {
        playerId: p.playerId,
        playerName: p.playerName,
        pts: p.pts, reb: p.reb, offReb: p.offReb, defReb: p.defReb,
        ast: p.ast, stl: p.stl, blk: p.blk, tov: p.tov, pf: p.pf,
        fgm: p.fgm, fga: p.fga, p3m: p.p3m, p3a: p.p3a, ftm: p.ftm, fta: p.fta,
        rimM: p.rimM, rimA: p.rimA, midM: p.midM, midA: p.midA,
        mp: p.mp, g: p.g, gs: p.gs, plusMinus: p.plusMinus,
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
            zone_atb3_r_m: p.zone_atb3_r_m, zone_atb3_r_a: p.zone_atb3_r_a
        }
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
    const state: GameState = {
        home: initTeamState(homeTeam, homeDepthChart, userTeamId === homeTeam.id ? userTactics : undefined),
        away: initTeamState(awayTeam, awayDepthChart, userTeamId === awayTeam.id ? userTactics : undefined),
        quarter: 1,
        gameClock: QUARTER_LENGTH,
        shotClock: 24,
        possession: 'home',
        isDeadBall: false,
        logs: [],
        isHomeB2B,
        isAwayB2B,
        rotationHistory: {}
    };

    // Initialize Rotation History
    [...state.home.onCourt, ...state.away.onCourt].forEach(p => {
        state.rotationHistory[p.playerId] = [{ in: 0, out: 0 }];
        p.lastSubInTime = QUARTER_LENGTH; // Correctly init for Q1 start logic
    });

    state.logs.push({
        quarter: 1,
        timeRemaining: '12:00',
        teamId: 'system',
        text: '경기 시작 Tip-off',
        type: 'info'
    });

    // Game Loop
    while (!isGameOver(state)) {
        // A. Quarter Management
        if (state.gameClock <= 0) {
            handleQuarterEnd(state);
            if (isGameOver(state)) break;
        }

        // B. Substitutions
        if (state.isDeadBall || state.gameClock % 60 === 0) {
            processSubstitutions(state, state.home);
            processSubstitutions(state, state.away);
        }

        // C. Resolve Possession
        const result: PossessionResult = resolvePossession(state);
        
        // Update Game Clock
        state.gameClock -= result.timeTaken;
        if (state.gameClock < 0) state.gameClock = 0; 

        // Update Rotation History
        const currentTimeAbsolute = getAbsoluteTime(state.quarter, state.gameClock);
        [state.home, state.away].forEach(t => {
            t.onCourt.forEach(p => {
                const history = state.rotationHistory[p.playerId];
                if (history && history.length > 0) {
                    history[history.length - 1].out = currentTimeAbsolute;
                }
            });
        });

        // Apply Time & Fatigue
        const timeInMinutes = result.timeTaken / 60;
        [state.home, state.away].forEach(t => {
            t.onCourt.forEach(p => {
                p.mp += timeInMinutes;
                
                const isB2B = t.id === state.home.id ? state.isHomeB2B : state.isAwayB2B;
                const oppTeam = t.id === state.home.id ? state.away : state.home;
                const isStopper = t.tactics.stopperId === p.playerId;
                
                const fatigueRes = calculateIncrementalFatigue(
                    p, 
                    result.timeTaken, 
                    t.tactics.sliders, 
                    isB2B, 
                    isStopper
                );
                
                p.currentCondition = Math.max(0, p.currentCondition - fatigueRes.drain);
            });
        });

        // D. Apply Results
        const offTeam = state.possession === 'home' ? state.home : state.away;
        
        // Logs
        if (result.logText) {
            state.logs.push({
                quarter: state.quarter,
                timeRemaining: formatTime(state.gameClock),
                teamId: offTeam.id,
                text: result.logText,
                type: result.type
            });
        }

        // Stats
        if (result.player) {
            const p = result.player;
            if (result.type === 'score') {
                const pts = result.points || 2;
                p.pts += pts;
                p.fgm++;
                p.fga++;
                if (pts === 3) {
                    p.p3m++;
                    p.p3a++;
                }
                
                offTeam.score += pts;
                
                // +/- Update
                offTeam.onCourt.forEach(pl => pl.plusMinus += pts);
                (offTeam.id === state.home.id ? state.away : state.home).onCourt.forEach(pl => pl.plusMinus -= pts);

                if (result.shotZoneId) {
                    const zoneMKey = `${result.shotZoneId}_m` as keyof LivePlayer;
                    const zoneAKey = `${result.shotZoneId}_a` as keyof LivePlayer;
                    if (typeof p[zoneMKey] === 'number') (p as any)[zoneMKey]++;
                    if (typeof p[zoneAKey] === 'number') (p as any)[zoneAKey]++;
                }

            } else if (result.type === 'miss') {
                p.fga++;
                if (result.logText.includes('3점')) p.p3a++;
                
                if (result.shotZoneId) {
                    const zoneAKey = `${result.shotZoneId}_a` as keyof LivePlayer;
                    if (typeof p[zoneAKey] === 'number') (p as any)[zoneAKey]++;
                }

                if (result.rebounder) {
                    result.rebounder.reb++;
                    const isOffReb = offTeam.onCourt.some(x => x.playerId === result.rebounder?.playerId);
                    if (isOffReb) {
                        result.rebounder.offReb++;
                    } else {
                        result.rebounder.defReb++;
                    }
                }
            } else if (result.type === 'turnover') {
                p.tov++;
                if (result.secondaryPlayer) {
                    result.secondaryPlayer.stl++;
                }
            }
            
            if (result.type === 'score' && result.secondaryPlayer) {
                result.secondaryPlayer.ast++;
            }
        }

        // Transition
        if (result.nextPossession === 'home') state.possession = 'home';
        else if (result.nextPossession === 'away') state.possession = 'away';
        
        state.isDeadBall = result.isDeadBall || result.type === 'score' || result.type === 'turnover' || result.type === 'foul';
    }

    return aggregateResults(state);
}