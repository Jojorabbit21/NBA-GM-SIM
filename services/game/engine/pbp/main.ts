
import { Team, SimulationResult, GameTactics, Player, PlayerBoxScore } from '../../../../types';
import { GameState, LivePlayer, TeamState } from './pbpTypes';
import { resolvePossession } from './flowEngine';
import { handleSubstitutions, isRotationNeeded } from './substitutionSystem';
import { formatTime } from './timeEngine';
import { generateAutoTactics } from '../../tactics/tacticGenerator';
import { calculatePlayerOvr } from '../../../../utils/constants';
import { calculateIncrementalFatigue } from '../fatigueSystem'; 

// --- Initialization Helpers ---

const initLivePlayer = (p: Player): LivePlayer => ({
    playerId: p.id,
    playerName: p.name,
    position: p.position,
    ovr: calculatePlayerOvr(p),
    currentCondition: p.condition || 100,
    isStarter: false, 
    health: p.health, // [Fix] Initialize health properly
    // Attributes for engine
    attr: {
        ins: p.ins || 70, out: p.out || 70, ft: p.ft || 75,
        drFoul: p.drawFoul || 50,
        def: p.def || 70, blk: p.blk || 50, stl: p.steal || 50, foulTendency: 50,
        reb: p.reb || 70,
        pas: p.passAcc || 70,
        stamina: p.stamina || 80,
        durability: p.durability || 80 
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

        // 2-4. Update Time & Fatigue
        state.gameClock -= result.timeTaken;
        state.isDeadBall = result.isDeadBall || false;
        
        // [New] Check for Mandatory Rotation AFTER Score
        // In NBA, you can sub after made baskets if you call timeout, or if refs stop play.
        // We simulate this by checking if rotation is overdue based on timeline.
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
                
                // Call Module
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
                    // Force Substitution Logic to kick in
                    p.currentCondition = 0; // Force sub out
                    if (injuryDetails?.health) {
                        p.health = injuryDetails.health; // Update health status so subs logic ignores player
                    }
                    state.isDeadBall = true; // Ensure substitution happens next loop
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
    // [CRITICAL FIX] Ensure ALL players (including bench who didn't play) are included to sync fatigue
    const rosterUpdates: any = {};
    
    [...state.home.onCourt, ...state.home.bench].forEach(p => {
        rosterUpdates[p.playerId] = { 
            condition: Math.max(0, Math.round(p.currentCondition)),
            health: p.health // Sync health (if injured in-game)
        };
    });
    [...state.away.onCourt, ...state.away.bench].forEach(p => {
        rosterUpdates[p.playerId] = { 
            condition: Math.max(0, Math.round(p.currentCondition)),
            health: p.health
        };
    });

    // [DEBUG LOG] Print User Team Fatigue Report to Console
    if (userTeamId) {
        const userTeamState = state.home.id === userTeamId ? state.home : (state.away.id === userTeamId ? state.away : null);
        
        if (userTeamState) {
            const fatigueReport = [...userTeamState.onCourt, ...userTeamState.bench].map(p => ({
                Name: p.playerName,
                Position: p.position,
                "Minutes": p.mp.toFixed(1),
                "Condition": Math.round(p.currentCondition),
                "Health": p.health,
                "Status": p.isStarter ? 'Starter' : 'Bench'
            })).sort((a, b) => parseFloat(b.Minutes) - parseFloat(a.Minutes));

            console.group(`📊 [Post-Game Fatigue Report] ${userTeamState.name}`);
            console.table(fatigueReport);
            console.groupEnd();
        }
    }

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
