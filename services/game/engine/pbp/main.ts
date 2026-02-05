
import { Team, SimulationResult, GameTactics, Player, PlayerBoxScore, TacticalSnapshot, DepthChart } from '../../../../types';
import { GameState, LivePlayer, TeamState } from './pbpTypes';
import { resolvePossession } from './flowEngine';
import { handleSubstitutions, isRotationNeeded } from './substitutionSystem';
import { formatTime } from './timeEngine';
import { generateAutoTactics } from '../../tactics/tacticGenerator';
import { calculatePlayerOvr } from '../../../../utils/constants';
import { calculateIncrementalFatigue } from '../fatigueSystem'; 
import { calculatePlayerArchetypes } from './archetypeSystem';

// --- Initialization Helpers ---

const initLivePlayer = (p: Player): LivePlayer => {
    // Prepare extended attribute object
    const threeAvg = (p.threeCorner + p.three45 + p.threeTop) / 3;

    const attr = {
        // General
        ins: p.ins || 70, 
        out: p.out || 70, 
        mid: p.midRange || 70,
        ft: p.ft || 75,
        threeVal: threeAvg || 70,

        // Physical
        speed: p.speed || 70,
        agility: p.agility || 70,
        strength: p.strength || 60,
        vertical: p.vertical || 60,
        stamina: p.stamina || 80,
        durability: p.durability || 80,
        hustle: p.hustle || 70,
        height: p.height || 200,
        weight: p.weight || 100,

        // Skill
        handling: p.handling || 70,
        hands: p.hands || 70,
        pas: p.passAcc || 70,
        passAcc: p.passAcc || 70,
        passVision: p.passVision || 70,
        passIq: p.passIq || 70,
        shotIq: p.shotIq || 70,
        offConsist: p.offConsist || 70,
        postPlay: p.postPlay || 70,
        drFoul: p.drawFoul || 50,
        
        // Defense
        def: p.def || 70,
        intDef: p.intDef || 70,
        perDef: p.perDef || 70,
        blk: p.blk || 50,
        stl: p.steal || 50,
        helpDefIq: p.helpDefIq || 70,
        defConsist: p.defConsist || 70,
        passPerc: p.passPerc || 70,
        foulTendency: 50,

        // Rebound
        reb: p.reb || 70
    };

    return {
        playerId: p.id,
        playerName: p.name,
        position: p.position,
        ovr: calculatePlayerOvr(p),
        currentCondition: p.condition ?? 100,
        isStarter: false, 
        health: p.health, 
        
        // [New] Init with full quarter time
        lastSubInTime: 720,
        conditionAtSubIn: p.condition ?? 100, // [New]
        isShutdown: false, // [New]
        needsDeepRecovery: false, // [New]

        // Initial Archetype Calculation
        archetypes: calculatePlayerArchetypes(attr, p.condition ?? 100),

        attr: attr,

        // Box Score Init
        pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
        fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
        rimM: 0, rimA: 0, midM: 0, midA: 0,
        mp: 0, g: 1, gs: 0, pf: 0,
        plusMinus: 0 // Initialize plusMinus
    };
};

const initTeamState = (team: Team, tactics?: GameTactics, depthChart?: DepthChart | null): TeamState => {
    const finalTactics = tactics || generateAutoTactics(team);
    const roster = team.roster.map(initLivePlayer);
    
    let starters: LivePlayer[] = [];
    let bench: LivePlayer[] = [];

    // [Update] Prioritize Depth Chart for starters if available, otherwise Tactics
    let starterIds: string[] = [];

    if (depthChart) {
        // Extract starters from Depth Chart (Index 0 of each position)
        const posKeys: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];
        posKeys.forEach(pos => {
            const pid = depthChart[pos][0];
            if (pid) starterIds.push(pid);
        });
    } else if (finalTactics.starters) {
        starterIds = Object.values(finalTactics.starters).filter(id => id);
    }

    // Populate Starters
    starters = roster.filter(p => starterIds.includes(p.playerId));

    // Fill gaps if missing (e.g. injuries or incomplete config)
    if (starters.length < 5) {
        const missingCount = 5 - starters.length;
        const remaining = roster.filter(p => !starterIds.includes(p.playerId));
        // Sort by OVR desc
        remaining.sort((a, b) => b.ovr - a.ovr);
        starters = [...starters, ...remaining.slice(0, missingCount)];
    }
    
    // Mark Starters
    starters.forEach(p => {
        p.gs = 1;
        p.isStarter = true;
    });

    // Determine Bench
    bench = roster.filter(p => !starters.find(s => s.playerId === p.playerId));
    bench.forEach(p => p.isStarter = false);

    // [New] Generate Fallback Depth Chart if missing
    // This ensures the substitution system always has a structure to work with
    const finalDepthChart = depthChart || generateDefaultDepthChart(starters, bench);

    return {
        id: team.id,
        name: team.name,
        score: 0,
        tactics: finalTactics,
        depthChart: finalDepthChart, // [New]
        onCourt: starters,
        bench: bench,
        timeouts: 7,
        fouls: 0,
        bonus: false
    };
};

// Helper: Generate simple depth chart based on OVR
function generateDefaultDepthChart(starters: LivePlayer[], bench: LivePlayer[]): DepthChart {
    const dc: DepthChart = { PG: [], SG: [], SF: [], PF: [], C: [] };
    const posMap: Record<string, string> = {}; // PlayerID -> POS

    // 1. Assign Starters
    starters.forEach(p => {
        // Simplified position mapping (Complex logic might be needed for multi-pos)
        let pos = p.position.split('/')[0] as keyof DepthChart;
        if (!dc[pos]) pos = 'SF'; // Fallback
        if (dc[pos].length === 0) {
            dc[pos][0] = p.playerId;
            posMap[p.playerId] = pos;
        }
    });

    // 2. Assign Bench by OVR
    const sortedBench = [...bench].sort((a, b) => b.ovr - a.ovr);
    
    sortedBench.forEach(p => {
        let pos = p.position.split('/')[0] as keyof DepthChart;
        if (!dc[pos]) pos = 'SF';
        
        // Find first empty slot (Index 1 or 2)
        if (!dc[pos][1]) dc[pos][1] = p.playerId;
        else if (!dc[pos][2]) dc[pos][2] = p.playerId;
        else {
            // Spillover: Try secondary position or generic
            // For now, ignore spillover in default chart
        }
    });

    // Ensure array structure is [string|null, string|null, string|null]
    (['PG', 'SG', 'SF', 'PF', 'C'] as const).forEach(pos => {
        while(dc[pos].length < 3) dc[pos].push(null);
    });

    return dc;
}

// [New] Rotation Tracker Helper
const updateRotationHistory = (state: GameState, duration: number) => {
    const activePlayers = [...state.home.onCourt, ...state.away.onCourt];
    
    const quarterOffset = (state.quarter - 1) * 720;
    const currentSegmentStart = quarterOffset + (720 - state.gameClock);
    const currentSegmentEnd = currentSegmentStart + duration;

    activePlayers.forEach(p => {
        if (!state.rotationHistory[p.playerId]) {
            state.rotationHistory[p.playerId] = [];
        }
        
        const history = state.rotationHistory[p.playerId];
        const lastSeg = history[history.length - 1];

        if (lastSeg && Math.abs(lastSeg.out - currentSegmentStart) <= 1) {
            lastSeg.out = currentSegmentEnd;
        } else {
            history.push({ in: currentSegmentStart, out: currentSegmentEnd });
        }
    });
};

// --- Main Engine ---

export function runFullGameSimulation(
    homeTeam: Team, 
    awayTeam: Team, 
    userTeamId: string | null, 
    userTactics?: GameTactics,
    isHomeB2B: boolean = false,
    isAwayB2B: boolean = false,
    homeDepthChart?: DepthChart | null, // [New]
    awayDepthChart?: DepthChart | null  // [New]
): SimulationResult {
    
    // 1. Initialize State
    const isUserHome = userTeamId === homeTeam.id;
    const isUserAway = userTeamId === awayTeam.id;
    
    const state: GameState = {
        home: initTeamState(homeTeam, isUserHome ? userTactics : undefined, isUserHome ? homeDepthChart : undefined),
        away: initTeamState(awayTeam, isUserAway ? userTactics : undefined, isUserAway ? awayDepthChart : undefined),
        quarter: 1,
        gameClock: 720,
        shotClock: 24,
        possession: 'home', 
        isDeadBall: true, 
        logs: [],
        isHomeB2B,
        isAwayB2B,
        rotationHistory: {}
    };

    console.group(`🏀 Starting Simulation: ${homeTeam.name} vs ${awayTeam.name}`);

    // 2. Game Loop
    while (state.quarter <= 4) {
        if (state.gameClock <= 0) {
            state.logs.push({
                quarter: state.quarter, timeRemaining: '0:00', teamId: '', type: 'info',
                text: `--- ${state.quarter}쿼터 종료 (${state.home.score} : ${state.away.score}) ---`
            });

            if (state.quarter === 2) {
                const halftimeRecovery = 5; 
                const recoverTeam = (t: TeamState) => {
                    [...t.onCourt, ...t.bench].forEach(p => {
                        p.currentCondition = Math.min(100, p.currentCondition + halftimeRecovery);
                    });
                };
                recoverTeam(state.home);
                recoverTeam(state.away);
            }

            state.quarter++;
            if (state.quarter > 4) break; 

            state.gameClock = 720; 
            
            // [Fix] Reset Stint Timer & Energy Baseline for players on court at new quarter
            // This treats the new quarter as a "Fresh Stint" context, though condition remains drained.
            const resetStintBaseline = (t: TeamState) => {
                t.onCourt.forEach(p => {
                    p.lastSubInTime = 720;
                    p.conditionAtSubIn = p.currentCondition; // Reset delta reference
                });
            };
            resetStintBaseline(state.home);
            resetStintBaseline(state.away);

            state.home.fouls = 0; state.away.fouls = 0;
            state.isDeadBall = true;
        }

        if (state.isDeadBall) {
            handleSubstitutions(state);
            state.isDeadBall = false; 
        }

        const result = resolvePossession(state);
        
        const activeTeam = state.possession === 'home' ? state.home : state.away;
        const defendingTeam = state.possession === 'home' ? state.away : state.home;
        
        let pointsScored = 0;
        if ((result.type === 'score' || result.type === 'freethrow') && result.points) {
            pointsScored = result.points;
            activeTeam.score += pointsScored;
            activeTeam.onCourt.forEach(p => p.plusMinus += pointsScored);
            defendingTeam.onCourt.forEach(p => p.plusMinus -= pointsScored);
        }
        
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
                if (result.logText.includes('앤드원')) {
                     result.player.pts += result.points!;
                     result.player.fgm++; result.player.fga++; 
                     result.player.ftm += (result.points! - 2); 
                     result.player.fta += result.attempts!;
                     if (result.points! > result.attempts!) {
                         result.player.ftm += (result.points! - 2); 
                     } else {
                         result.player.ftm += result.points!; 
                     }
                } else {
                     result.player.pts += result.points!;
                     result.player.ftm += result.points!;
                     result.player.fta += result.attempts!;
                }
            }
        }
        
        if (result.secondaryPlayer) {
             if (result.type === 'score') result.secondaryPlayer.ast++;
             if (result.type === 'turnover') result.secondaryPlayer.stl++;
             if (result.type === 'block') result.secondaryPlayer.blk++;
             if (result.type === 'foul' || result.type === 'freethrow') result.secondaryPlayer.pf++;
        }
        
        if (result.rebounder) {
            result.rebounder.reb++;
            const rebounderTeam = state.home.onCourt.includes(result.rebounder) ? 'home' : 'away';
            if (rebounderTeam === state.possession) result.rebounder.offReb++;
            else result.rebounder.defReb++;
        }

        updateRotationHistory(state, result.timeTaken);

        state.gameClock -= result.timeTaken;
        state.isDeadBall = result.isDeadBall || false;
        
        if (result.type === 'score' || result.type === 'freethrow') {
            const homeNeedsSub = isRotationNeeded(state.home, state);
            const awayNeedsSub = isRotationNeeded(state.away, state);
            
            if (homeNeedsSub || awayNeedsSub) {
                state.isDeadBall = true;
                if (state.gameClock > 5) {
                    state.logs.push({
                        quarter: state.quarter,
                        timeRemaining: formatTime(Math.max(0, state.gameClock)),
                        teamId: homeNeedsSub ? state.home.id : state.away.id,
                        type: 'info',
                        text: `[작전 타임] 선수 교체를 위해 작전 타임을 요청합니다.`
                    });
                }
            }
        }

        const applyFatigueToTeam = (t: TeamState, isB2B: boolean) => {
            t.onCourt.forEach(p => {
                const isStopper = t.tactics.stopperId === p.playerId;
                const { drain, injuryOccurred, injuryDetails } = calculateIncrementalFatigue(
                    p, 
                    result.timeTaken, 
                    t.tactics.sliders, 
                    isB2B, 
                    isStopper
                );

                p.mp += result.timeTaken / 60;
                p.currentCondition -= drain;

                if (injuryOccurred) {
                    state.logs.push({
                        quarter: state.quarter,
                        timeRemaining: formatTime(Math.max(0, state.gameClock)),
                        teamId: t.id,
                        type: 'info',
                        text: `🚑 [부상] ${p.playerName} 선수가 고통을 호소하며 코트에 쓰러졌습니다. (${injuryDetails?.type})`
                    });
                    p.currentCondition = 0; 
                    if (injuryDetails?.health) {
                        p.health = injuryDetails.health; 
                    }
                    state.isDeadBall = true; 
                }
            });
        };

        applyFatigueToTeam(state.home, state.isHomeB2B);
        applyFatigueToTeam(state.away, state.isAwayB2B);
        
        const benchRecovery = (result.timeTaken / 60) * 0.2;
        state.home.bench.forEach(p => p.currentCondition = Math.min(100, p.currentCondition + benchRecovery));
        state.away.bench.forEach(p => p.currentCondition = Math.min(100, p.currentCondition + benchRecovery));

        state.logs.push({
            quarter: state.quarter,
            timeRemaining: formatTime(Math.max(0, state.gameClock)),
            teamId: activeTeam.id,
            type: result.type,
            text: `[${state.home.score}-${state.away.score}] ${result.logText}`
        });

        // Console Log (Dev)
        // const timeStr = formatTime(Math.max(0, state.gameClock));
        // console.log(`[Q${state.quarter} ${timeStr}] ${state.home.score}-${state.away.score} | ${result.type.toUpperCase()}`);

        if (result.nextPossession !== 'keep') {
            state.possession = result.nextPossession as 'home' | 'away';
        }
    }

    if (state.home.score === state.away.score) {
        state.logs.push({ quarter: 4, timeRemaining: '0:00', teamId: '', type: 'info', text: `!!! 정규 시간 종료 동점 (${state.home.score} : ${state.away.score}) - 서든데스 !!!` });
        while (state.home.score === state.away.score) {
            const result = resolvePossession(state);
            const activeTeam = state.possession === 'home' ? state.home : state.away;
            const defendingTeam = state.possession === 'home' ? state.away : state.home;
            
            if ((result.type === 'score' || result.type === 'freethrow') && result.points) {
                activeTeam.score += result.points;
                activeTeam.onCourt.forEach(p => p.plusMinus += result.points!);
                defendingTeam.onCourt.forEach(p => p.plusMinus -= result.points!);
                updateRotationHistory(state, result.timeTaken);
            }
            state.logs.push({ quarter: 4, timeRemaining: 'SD', teamId: activeTeam.id, type: result.type, text: `[서든데스] ${result.logText}` });
            if (result.nextPossession !== 'keep') state.possession = result.nextPossession as any;
        }
    }

    console.groupEnd(); 

    // 4. Finalize
    const finalHomeBox = [...state.home.onCourt, ...state.home.bench];
    const finalAwayBox = [...state.away.onCourt, ...state.away.bench];
    
    const rosterUpdates: any = {};
    
    [...state.home.onCourt, ...state.home.bench].forEach(p => {
        rosterUpdates[p.playerId] = { 
            condition: Math.max(0, Math.round(p.currentCondition)),
            health: p.health 
        };
    });
    [...state.away.onCourt, ...state.away.bench].forEach(p => {
        rosterUpdates[p.playerId] = { 
            condition: Math.max(0, Math.round(p.currentCondition)),
            health: p.health
        };
    });

    const mapToSnapshot = (t: GameTactics): TacticalSnapshot => ({
        offense: t.offenseTactics[0],
        defense: t.defenseTactics[0],
        pace: t.sliders.pace,
        stopperId: t.stopperId
    });

    return {
        homeScore: state.home.score,
        awayScore: state.away.score,
        homeBox: finalHomeBox,
        awayBox: finalAwayBox,
        rosterUpdates: rosterUpdates, 
        homeTactics: mapToSnapshot(state.home.tactics), 
        awayTactics: mapToSnapshot(state.away.tactics),
        pbpLogs: state.logs,
        rotationData: state.rotationHistory
    };
}
