
import { Team, SimulationResult, GameTactics, Player, PlayerBoxScore, TacticalSnapshot } from '../../../../types';
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
    
    // Mark Starters
    starters.forEach(p => {
        p.gs = 1;
        p.isStarter = true;
    });

    // Determine Bench
    bench = roster.filter(p => !starters.find(s => s.playerId === p.playerId));
    bench.forEach(p => p.isStarter = false);

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

// [New] Rotation Tracker Helper
const updateRotationHistory = (state: GameState, duration: number) => {
    const activePlayers = [...state.home.onCourt, ...state.away.onCourt];
    
    // Current ABSOLUTE start time of this segment (seconds from game start)
    // Quarter 1: 0~720, Q2: 720~1440, etc.
    const quarterOffset = (state.quarter - 1) * 720;
    const currentSegmentStart = quarterOffset + (720 - state.gameClock);
    const currentSegmentEnd = currentSegmentStart + duration;

    activePlayers.forEach(p => {
        if (!state.rotationHistory[p.playerId]) {
            state.rotationHistory[p.playerId] = [];
        }
        
        const history = state.rotationHistory[p.playerId];
        const lastSeg = history[history.length - 1];

        // Merge contiguous segments to reduce array size
        // Tolerance of 1s for floating point drift
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
        isAwayB2B,
        rotationHistory: {}
    };

    console.group(`🏀 Starting Simulation: ${homeTeam.name} vs ${awayTeam.name}`);

    // 2. Game Loop
    while (state.quarter <= 4) {
        // 2-1. Pre-Possession: Check Substitutions & Quarter End
        if (state.gameClock <= 0) {
            state.logs.push({
                quarter: state.quarter, timeRemaining: '0:00', teamId: '', type: 'info',
                text: `--- ${state.quarter}쿼터 종료 (${state.home.score} : ${state.away.score}) ---`
            });

            // [Recovery] Break Time Recovery Logic
            const recoveryAmount = state.quarter === 2 ? 10 : 3; // Boosted recovery
            
            const recoverTeam = (t: TeamState) => {
                [...t.onCourt, ...t.bench].forEach(p => {
                    p.currentCondition = Math.min(100, p.currentCondition + recoveryAmount);
                });
            };
            recoverTeam(state.home);
            recoverTeam(state.away);

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
        const defendingTeam = state.possession === 'home' ? state.away : state.home;
        
        // Score & Plus/Minus
        let pointsScored = 0;
        if ((result.type === 'score' || result.type === 'freethrow') && result.points) {
            pointsScored = result.points;
            activeTeam.score += pointsScored;

            // [New] Update Plus/Minus for players currently on court
            activeTeam.onCourt.forEach(p => p.plusMinus += pointsScored);
            defendingTeam.onCourt.forEach(p => p.plusMinus -= pointsScored);
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
                // Approximate FT logic
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
                     // Regular FT
                     result.player.pts += result.points!;
                     result.player.ftm += result.points!;
                     result.player.fta += result.attempts!;
                }
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

        // [New] Update Rotation History (BEFORE subtracting time)
        updateRotationHistory(state, result.timeTaken);

        // 2-4. Update Time & Fatigue
        state.gameClock -= result.timeTaken;
        state.isDeadBall = result.isDeadBall || false;
        
        // [New] Check for Mandatory Rotation AFTER Score
        if (result.type === 'score' || result.type === 'freethrow') {
            const homeNeedsSub = isRotationNeeded(state.home, state);
            const awayNeedsSub = isRotationNeeded(state.away, state);
            
            if (homeNeedsSub || awayNeedsSub) {
                state.isDeadBall = true;
                // Add log only if it's not a normal quarter end
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

        // [Fatigue Application]
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

                // Handle In-Game Injury
                if (injuryOccurred) {
                    state.logs.push({
                        quarter: state.quarter,
                        timeRemaining: formatTime(Math.max(0, state.gameClock)),
                        teamId: t.id,
                        type: 'info',
                        text: `🚑 [부상] ${p.playerName} 선수가 고통을 호소하며 코트에 쓰러졌습니다. (${injuryDetails?.type})`
                    });
                    p.currentCondition = 0; // Force sub out
                    if (injuryDetails?.health) {
                        p.health = injuryDetails.health; 
                    }
                    state.isDeadBall = true; 
                }
            });
        };

        applyFatigueToTeam(state.home, state.isHomeB2B);
        applyFatigueToTeam(state.away, state.isAwayB2B);
        
        // Bench Recovery (Slow regeneration while sitting)
        const benchRecovery = (result.timeTaken / 60) * 1.0;
        state.home.bench.forEach(p => p.currentCondition = Math.min(100, p.currentCondition + benchRecovery));
        state.away.bench.forEach(p => p.currentCondition = Math.min(100, p.currentCondition + benchRecovery));

        // Add Log
        state.logs.push({
            quarter: state.quarter,
            timeRemaining: formatTime(Math.max(0, state.gameClock)),
            teamId: activeTeam.id,
            type: result.type,
            text: `[${state.home.score}-${state.away.score}] ${result.logText}`
        });

        // --- DEVELOPER CONSOLE LOG (Fix 4) ---
        // Format: [Q1 11:45] 0-0 | Balance > Iso | Actor: Player (H:80, S:70) | Result: score
        const timeStr = formatTime(Math.max(0, state.gameClock));
        const tacticName = activeTeam.tactics.offenseTactics[0] || 'Balance';
        const playName = result.playType || 'Unknown';
        const actorName = result.player ? result.player.playerName : 'None';
        const archInfo = result.player ? `(H:${result.player.archetypes.handler.toFixed(0)}, S:${result.player.archetypes.spacer.toFixed(0)}, D:${result.player.archetypes.driver.toFixed(0)})` : '';
        const resType = result.type.toUpperCase();
        
        console.log(`[Q${state.quarter} ${timeStr}] ${state.home.score}-${state.away.score} | ${tacticName} > ${playName} | Actor: ${actorName} ${archInfo} | Result: ${resType}`);

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
            const defendingTeam = state.possession === 'home' ? state.away : state.home;
            
            if ((result.type === 'score' || result.type === 'freethrow') && result.points) {
                activeTeam.score += result.points;
                // Update Plus/Minus in OT
                activeTeam.onCourt.forEach(p => p.plusMinus += result.points!);
                defendingTeam.onCourt.forEach(p => p.plusMinus -= result.points!);
                
                // [New] Update Rotation in OT (Append to end of 48min)
                // OT adds time beyond 2880
                updateRotationHistory(state, result.timeTaken);
            }
            state.logs.push({ quarter: 4, timeRemaining: 'SD', teamId: activeTeam.id, type: result.type, text: `[서든데스] ${result.logText}` });
            if (result.nextPossession !== 'keep') state.possession = result.nextPossession as any;
        }
    }

    console.groupEnd(); // End Simulation Group

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

    // Helper to Map Full Tactics to Snapshot
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
        // [Fix 1] Explicitly map current TeamState tactics to snapshot format
        homeTactics: mapToSnapshot(state.home.tactics), 
        awayTactics: mapToSnapshot(state.away.tactics),
        pbpLogs: state.logs,
        // [New] Pass Rotation Data
        rotationData: state.rotationHistory
    };
}
