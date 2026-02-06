import { Team, GameTactics, DepthChart, SimulationResult, PlayerBoxScore, PbpLog, RotationData, Player } from '../../../../types';
import { GameState, TeamState, LivePlayer } from './pbpTypes';
import { resolvePossession } from './flowEngine';
import { processTeamRotation } from './substitutionSystem';
import { calculateIncrementalFatigue } from '../fatigueSystem';
import { calculatePlayerArchetypes } from './archetypeSystem';
import { INITIAL_STATS } from '../../../../utils/constants';

// --- Initialization Helpers ---

function initializeLivePlayer(p: Player, isStarter: boolean): LivePlayer {
    // Basic stats init
    const stats: any = { ...INITIAL_STATS() };
    
    // Attribute Mapping for Engine
    const attr = {
        ins: p.ins, out: p.out, mid: p.midRange,
        ft: p.ft, threeVal: (p.threeCorner + p.three45 + p.threeTop) / 3,
        speed: p.speed, agility: p.agility, strength: p.strength, vertical: p.vertical,
        stamina: p.stamina, durability: p.durability, hustle: p.hustle,
        height: p.height, weight: p.weight,
        handling: p.handling, hands: p.hands, pas: p.passAcc, passAcc: p.passAcc,
        passVision: p.passVision, passIq: p.passIq,
        shotIq: p.shotIq, offConsist: p.offConsist,
        postPlay: p.postPlay,
        def: p.def, intDef: p.intDef, perDef: p.perDef,
        blk: p.blk, stl: p.steal,
        helpDefIq: p.helpDefIq, defConsist: p.defConsist,
        drFoul: p.drawFoul, foulTendency: 50,
        reb: p.reb
    };

    const condition = p.condition !== undefined ? p.condition : 100;

    return {
        playerId: p.id,
        playerName: p.name,
        // Box Score stats
        pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
        fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
        offReb: 0, defReb: 0, pf: 0,
        mp: 0, gs: isStarter ? 1 : 0, g: 0, plusMinus: 0,
        
        // Detailed Shooting
        rimM: 0, rimA: 0, midM: 0, midA: 0,
        zone_rim_m: 0, zone_rim_a: 0, zone_paint_m: 0, zone_paint_a: 0,
        zone_mid_l_m: 0, zone_mid_l_a: 0, zone_mid_c_m: 0, zone_mid_c_a: 0, zone_mid_r_m: 0, zone_mid_r_a: 0,
        zone_c3_l_m: 0, zone_c3_l_a: 0, zone_c3_r_m: 0, zone_c3_r_a: 0,
        zone_atb3_l_m: 0, zone_atb3_l_a: 0, zone_atb3_c_m: 0, zone_atb3_c_a: 0, zone_atb3_r_m: 0, zone_atb3_r_a: 0,

        // Live State
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
        attr
    };
}

function initializeTeamState(team: Team, tactics: GameTactics | undefined, depthChart: DepthChart | null | undefined): TeamState {
    // Default tactics if missing
    const activeTactics = tactics || {
        offenseTactics: ['Balance'],
        defenseTactics: ['ManToManPerimeter'],
        sliders: { pace: 5, offReb: 5, defIntensity: 5, defReb: 5, fullCourtPress: 1, zoneUsage: 2, rotationFlexibility: 5 },
        starters: { PG: '', SG: '', SF: '', PF: '', C: '' },
        minutesLimits: {}
    };

    // Identify Starters
    const starterIds = new Set(Object.values(activeTactics.starters).filter(id => id !== ''));
    
    // Sort roster: Healthy first, then OVR
    const roster = [...team.roster].sort((a, b) => {
        if (a.health === 'Injured' && b.health !== 'Injured') return 1;
        if (a.health !== 'Injured' && b.health === 'Injured') return -1;
        return b.ovr - a.ovr;
    });

    const liveRoster = roster.map(p => initializeLivePlayer(p, starterIds.has(p.id)));
    
    // Separate OnCourt vs Bench
    const onCourt: LivePlayer[] = [];
    const bench: LivePlayer[] = [];

    // Fill OnCourt based on starterIds or Top 5
    // Order matters for positions: PG, SG, SF, PF, C
    const posOrder = ['PG', 'SG', 'SF', 'PF', 'C'];
    const filledIds = new Set<string>();

    posOrder.forEach(pos => {
        const id = activeTactics.starters[pos as keyof typeof activeTactics.starters];
        const p = liveRoster.find(lp => lp.playerId === id);
        if (p && !filledIds.has(p.playerId)) {
            onCourt.push(p);
            filledIds.add(p.playerId);
        }
    });

    // Fill remaining spots if starters invalid
    liveRoster.forEach(p => {
        if (!filledIds.has(p.playerId) && onCourt.length < 5 && p.health !== 'Injured') {
            onCourt.push(p);
            filledIds.add(p.playerId);
        } else if (!filledIds.has(p.playerId)) {
            bench.push(p);
        }
    });

    return {
        id: team.id,
        name: team.name,
        score: 0,
        tactics: activeTactics,
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
    const homeState = initializeTeamState(homeTeam, userTeamId === homeTeam.id ? userTactics : undefined, homeDepthChart);
    const awayState = initializeTeamState(awayTeam, userTeamId === awayTeam.id ? userTactics : undefined, awayDepthChart);

    const state: GameState = {
        home: homeState,
        away: awayState,
        quarter: 1,
        gameClock: 720, // 12 mins
        shotClock: 24,
        possession: 'home', // Jump ball logic omitted for simplicity, assume Home starts
        isDeadBall: false,
        logs: [],
        isHomeB2B,
        isAwayB2B,
        rotationHistory: {}
    };

    // Init Rotation History for Starters
    [...homeState.onCourt, ...awayState.onCourt].forEach(p => {
        if (!state.rotationHistory[p.playerId]) state.rotationHistory[p.playerId] = [];
    });

    // --- GAME LOOP ---
    let isGameOver = false;
    
    while (!isGameOver) {
        
        // Quarter Management
        if (state.gameClock <= 0) {
            if (state.quarter >= 4 && state.home.score !== state.away.score) {
                isGameOver = true;
                break;
            } else {
                // Next Quarter / OT
                state.quarter++;
                state.gameClock = (state.quarter > 4) ? 300 : 720; // 5 mins for OT
                
                // Reset Foul Counts
                state.home.fouls = 0;
                state.away.fouls = 0;
                state.home.bonus = false;
                state.away.bonus = false;

                // Reset Stint Baselines (Time reset, but fatigue persists)
                const resetStint = (t: TeamState) => {
                    t.onCourt.forEach(p => {
                        p.lastSubInTime = state.gameClock;
                        // Condition delta is persistent across quarter breaks to prevent spamming starters
                    });
                };
                resetStint(state.home);
                resetStint(state.away);
                
                state.isDeadBall = true;
                state.logs.push({ 
                    quarter: state.quarter, timeRemaining: '12:00', teamId: '', 
                    text: `${state.quarter > 4 ? '연장전' : state.quarter + '쿼터'} 시작`, type: 'info' 
                });
            }
        }

        // Substitution Check (Dead Ball or Timeout)
        processTeamRotation(state.home, state);
        processTeamRotation(state.away, state);

        // Resolve Possession
        const result = resolvePossession(state);
        
        // Update Time
        state.gameClock -= result.timeTaken;
        if (state.gameClock < 0) state.gameClock = 0;

        // Apply Result
        const attTeam = state.possession === 'home' ? state.home : state.away;
        const defTeam = state.possession === 'home' ? state.away : state.home;

        // Logging
        state.logs.push({
            quarter: state.quarter,
            timeRemaining: `${Math.floor(state.gameClock / 60)}:${(state.gameClock % 60).toString().padStart(2, '0')}`,
            teamId: attTeam.id,
            text: `[${attTeam.score}-${defTeam.score}] ${result.logText}`,
            type: result.type
        });

        // --- STATS UPDATE LOGIC ---
        
        // 1. Team Score & DeadBall Status
        if (result.type === 'score') {
            attTeam.score += (result.points || 0);
            
            // Plus/Minus
            attTeam.onCourt.forEach(p => p.plusMinus += result.points!);
            defTeam.onCourt.forEach(p => p.plusMinus -= result.points!);
            
            state.isDeadBall = true;
        } else if (result.type === 'turnover' || result.type === 'miss') {
            state.isDeadBall = false; 
        } else if (result.type === 'foul') {
            defTeam.fouls++;
            // Bonus logic simplified
            state.isDeadBall = true;
        }

        // 2. Player Stats Accumulation
        if (result.player) {
            const p = result.player;
            if (result.type === 'score') {
                p.pts += result.points!;
                p.fgm++; p.fga++;
                if (result.points === 3) { 
                    p.p3m++; p.p3a++; 
                }
                
                // Detailed Shooting Stats (Zone) - Make
                if (result.shotZoneId) {
                    const zM = `${result.shotZoneId}_m` as keyof LivePlayer;
                    const zA = `${result.shotZoneId}_a` as keyof LivePlayer;
                    if (typeof p[zM] === 'number') (p[zM] as number)++;
                    if (typeof p[zA] === 'number') (p[zA] as number)++;
                }

            } else if (result.type === 'miss') {
                p.fga++;
                // 3PT attempt check
                if (result.shotZoneId && (result.shotZoneId.includes('c3') || result.shotZoneId.includes('atb3'))) {
                     p.p3a++;
                } else if (result.logText.includes('3점')) {
                     p.p3a++;
                }
                
                // Detailed Shooting Stats (Zone) - Attempt
                if (result.shotZoneId) {
                    const zA = `${result.shotZoneId}_a` as keyof LivePlayer;
                    if (typeof p[zA] === 'number') (p[zA] as number)++;
                }

            } else if (result.type === 'turnover') {
                p.tov++;
            } else if (result.type === 'freethrow') {
                if (result.points) {
                    p.pts += result.points;
                    p.ftm += result.points;
                }
                if (result.attempts) {
                    p.fta += result.attempts;
                }
            }
        }

        // Secondary Stats (Assist, Steal, Block, Foul)
        if (result.secondaryPlayer) {
            if (result.type === 'score') result.secondaryPlayer.ast++;
            if (result.type === 'turnover') result.secondaryPlayer.stl++;
            if (result.type === 'miss' && result.logText.includes('블록')) result.secondaryPlayer.blk++; 
            if (result.type === 'foul') result.secondaryPlayer.pf++;
        }

        // Rebound
        if (result.rebounder) {
            result.rebounder.reb++;
            const rebounderTeam = state.home.onCourt.includes(result.rebounder) ? 'home' : 'away';
            // Determine OFF vs DEF rebound
            // Note: state.possession is currently the attacking team (shooter's team)
            if (rebounderTeam === state.possession) result.rebounder.offReb++; 
            else result.rebounder.defReb++;
        }

        // Apply Fatigue to ALL players on court
        const applyFatigue = (t: TeamState, isB2B: boolean) => {
            t.onCourt.forEach(p => {
                p.mp += (result.timeTaken / 60); // Add minutes
                const fatigue = calculateIncrementalFatigue(
                    p, 
                    result.timeTaken, 
                    t.tactics.sliders, 
                    isB2B, 
                    t.tactics.stopperId === p.playerId
                );
                p.currentCondition = Math.max(0, p.currentCondition - fatigue.drain);
                
                if (fatigue.injuryOccurred && p.health === 'Healthy') {
                    p.health = fatigue.injuryDetails.health; 
                    state.logs.push({ 
                        quarter: state.quarter, timeRemaining: '0:00', teamId: t.id, 
                        text: `🚑 ${p.playerName} 부상 발생! (${fatigue.injuryDetails.type})`, type: 'info' 
                    });
                }
            });
        };
        applyFatigue(state.home, state.isHomeB2B);
        applyFatigue(state.away, state.isAwayB2B);

        // Switch Possession
        if (result.nextPossession === 'home') state.possession = 'home';
        else if (result.nextPossession === 'away') state.possession = 'away';
    }

    // --- End of Game Processing ---
    
    // Package Zone Data for persistence (flattened props -> object)
    const packageZoneData = (p: LivePlayer) => {
        if (!p.zoneData) {
            p.zoneData = {
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
            };
        }
    };

    const finalHomeBox = [...state.home.onCourt, ...state.home.bench];
    const finalAwayBox = [...state.away.onCourt, ...state.away.bench];
    
    finalHomeBox.forEach(packageZoneData);
    finalAwayBox.forEach(packageZoneData);
    
    const rosterUpdates: any = {};
    [...finalHomeBox, ...finalAwayBox].forEach(p => {
        rosterUpdates[p.playerId] = { 
            condition: p.currentCondition,
            health: p.health
        };
    });

    return {
        homeScore: state.home.score,
        awayScore: state.away.score,
        homeBox: finalHomeBox,
        awayBox: finalAwayBox,
        rosterUpdates,
        // [Fix] Include sliders in tactics snapshot so UI can render them
        homeTactics: { 
            offense: state.home.tactics.offenseTactics[0], 
            defense: state.home.tactics.defenseTactics[0],
            sliders: state.home.tactics.sliders
        },
        awayTactics: { 
            offense: state.away.tactics.offenseTactics[0], 
            defense: state.away.tactics.defenseTactics[0],
            sliders: state.away.tactics.sliders
        },
        pbpLogs: state.logs,
        rotationData: state.rotationHistory
    };
}