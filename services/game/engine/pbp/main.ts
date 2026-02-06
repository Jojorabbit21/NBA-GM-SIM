
import { Team, GameTactics, SimulationResult, DepthChart } from '../../../../types';
import { GameState, TeamState } from './pbpTypes';
import { calculatePossessionTime, formatTime } from './timeEngine';
import { calculateIncrementalFatigue, recoverBenchPlayers } from '../fatigueSystem';
import { checkSubstitutions } from './substitutionSystem';
import { applySubstitutions } from './rotationLogic';
import { initTeamState } from './initializer';

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
    
    // 1. Setup State using Initializer Module
    const homeTactics = userTeamId === homeTeam.id && userTactics ? userTactics : undefined; 
    const awayTactics = userTeamId === awayTeam.id && userTactics ? userTactics : undefined;

    const state: GameState = {
        home: initTeamState(homeTeam, homeTactics, homeDepthChart),
        away: initTeamState(awayTeam, awayTactics, awayDepthChart),
        quarter: 1,
        gameClock: 720, // 12 mins in seconds
        shotClock: 24,
        possession: 'home', // Jumpball simplified
        isDeadBall: false,
        logs: [],
        isHomeB2B,
        isAwayB2B,
        rotationHistory: {}
    };

    // Initialize Rotation History Logs
    [...state.home.onCourt, ...state.home.bench, ...state.away.onCourt, ...state.away.bench].forEach(p => {
        state.rotationHistory[p.playerId] = [];
        if (p.isStarter) {
            state.rotationHistory[p.playerId].push({ in: 0, out: 0 }); // Will update out later
        }
    });
    
    // [Helper] Update +/- for all players on court
    const updatePlusMinus = (scoringTeam: TeamState, concedingTeam: TeamState, points: number) => {
        scoringTeam.onCourt.forEach(p => p.plusMinus += points);
        concedingTeam.onCourt.forEach(p => p.plusMinus -= points);
    };

    // 2. Game Loop
    while (state.quarter <= 4 || state.home.score === state.away.score) {
        
        // --- 2.1 Substitution Phase ---
        // Determine subs
        const homeSubs = checkSubstitutions(state, state.home);
        const awaySubs = checkSubstitutions(state, state.away);
        
        // Apply subs (using Rotation Logic Module)
        applySubstitutions(state, state.home, homeSubs);
        applySubstitutions(state, state.away, awaySubs);

        // --- 2.2 Play Execution Phase ---
        const attTeam = state.possession === 'home' ? state.home : state.away;
        const defTeam = state.possession === 'home' ? state.away : state.home;
        
        // Determine Tactics
        const offTactic = attTeam.tactics.offenseTactics[0] || 'Balance';
        const defTactic = defTeam.tactics.defenseTactics[0] || 'ManToManPerimeter';
        
        // Calculate Time
        const timeTaken = calculatePossessionTime(state, attTeam.tactics.sliders, offTactic);
        
        // Select Actor
        const actor = attTeam.onCourt[Math.floor(Math.random() * attTeam.onCourt.length)];
        
        // --- 2.3 Fatigue & Recovery Phase ---
        // Apply Fatigue to On-Court Players
        [state.home, state.away].forEach(t => {
            t.onCourt.forEach(p => {
                const isB2B = t.id === state.home.id ? state.isHomeB2B : state.isAwayB2B;
                const isStopper = t.tactics.stopperId === p.playerId;
                
                const fatigueRes = calculateIncrementalFatigue(
                    p, 
                    timeTaken, 
                    t.tactics.sliders, 
                    isB2B, 
                    isStopper,
                    t.tactics.offenseTactics[0],
                    t.tactics.defenseTactics[0]
                );
                
                p.currentCondition = Math.max(0, p.currentCondition - fatigueRes.drain);
                
                // Handle In-Game Injury
                if (fatigueRes.injuryOccurred && p.health === 'Healthy') {
                    p.health = fatigueRes.injuryDetails?.health || 'Day-to-Day';
                    p.injuryType = fatigueRes.injuryDetails?.type;
                    
                    state.logs.push({
                        quarter: state.quarter,
                        timeRemaining: formatTime(state.gameClock),
                        teamId: t.id,
                        text: `[부상] ${p.playerName} - ${p.injuryType}`,
                        type: 'info'
                    });
                }
            });
            
            // Apply Recovery to Bench Players (using Fatigue System Module)
            recoverBenchPlayers(t.bench, timeTaken);
        });

        // --- 2.4 Event Resolution Phase (Inline for now to avoid over-engineering) ---
        // Simulate Play Result (Simplified for robustness)
        const roll = Math.random();
        
        if (roll < 0.14) {
            // Turnover
            actor.tov++;
            state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: attTeam.id, text: `${actor.playerName} 턴오버`, type: 'turnover' });
        } else {
            // Check for Foul
            const isFoul = Math.random() < 0.15; 
            
            if (isFoul) {
                // Defensive Foul
                const fouler = defTeam.onCourt[Math.floor(Math.random() * 5)];
                fouler.pf++;
                
                // FT Calculation
                const ftChance = actor.attr.ft / 100;
                const isAndOne = Math.random() < 0.15; 
                let ftCount = 2;
                
                if (isAndOne) {
                    actor.fgm++; actor.fga++;
                    actor.pts += 2;
                    attTeam.score += 2;
                    updatePlusMinus(attTeam, defTeam, 2);

                    ftCount = 1;
                    state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: attTeam.id, text: `${actor.playerName} 득점 (앤드원!)`, type: 'score' });
                } else {
                    state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: defTeam.id, text: `파울: ${fouler.playerName}`, type: 'foul' });
                }

                // Shoot Free Throws
                let ftMade = 0;
                for (let i=0; i<ftCount; i++) {
                    if (Math.random() < ftChance) {
                        ftMade++;
                        actor.ftm++;
                        updatePlusMinus(attTeam, defTeam, 1);
                    }
                    actor.fta++;
                }
                
                actor.pts += ftMade;
                attTeam.score += ftMade;
                
                if (ftMade > 0) {
                     state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: attTeam.id, text: `${actor.playerName} 자유투 ${ftMade}/${ftCount} 성공`, type: 'freethrow' });
                }

            } else {
                // Normal Shot
                const is3PT = Math.random() < 0.35;
                const shotRating = is3PT ? actor.attr.threeVal : actor.attr.ins;
                const makeChance = (shotRating / 200) + 0.1; 
                const isMake = Math.random() < makeChance;
                
                if (is3PT) {
                    actor.p3a++; actor.fga++;
                    if (isMake) {
                        actor.p3m++; actor.fgm++; actor.pts += 3;
                        attTeam.score += 3;
                        updatePlusMinus(attTeam, defTeam, 3);
                        state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: attTeam.id, text: `${actor.playerName} 3점슛 성공`, type: 'score' });
                    } else {
                        state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: attTeam.id, text: `${actor.playerName} 3점슛 실패`, type: 'miss' });
                    }
                } else {
                    actor.fga++;
                    if (isMake) {
                        actor.fgm++; actor.pts += 2;
                        attTeam.score += 2;
                        updatePlusMinus(attTeam, defTeam, 2);
                        state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: attTeam.id, text: `${actor.playerName} 2점슛 성공`, type: 'score' });
                    } else {
                        state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: attTeam.id, text: `${actor.playerName} 2점슛 실패`, type: 'miss' });
                    }
                }

                // Rebound
                if (!isMake) {
                    let drbChance = 0.75;
                    if (defTeam.tactics.sliders.pace > 7) drbChance -= 0.15;
                    if (defTeam.tactics.offenseTactics.includes('SevenSeconds')) drbChance -= 0.10; 

                    const rebTeam = Math.random() < drbChance ? defTeam : attTeam;
                    
                    const rebounder = rebTeam.onCourt[Math.floor(Math.random() * 5)];
                    rebounder.reb++;
                    if (rebTeam === attTeam) rebounder.offReb++; else rebounder.defReb++;
                } else {
                    // Assist
                    if (Math.random() < 0.6) {
                        const assister = attTeam.onCourt.filter(p => p.playerId !== actor.playerId)[Math.floor(Math.random() * 4)];
                        if (assister) assister.ast++;
                    }
                }
            }
        }

        // --- 2.5 Clock Management Phase ---
        state.gameClock -= timeTaken;
        state.home.onCourt.forEach(p => p.mp += (timeTaken/60));
        state.away.onCourt.forEach(p => p.mp += (timeTaken/60));

        // Quarter End Check
        if (state.gameClock <= 0) {
            state.quarter++;
            state.gameClock = 720;
            
            // Reset Stint Timers for players on court (Critical for Rotation Logic)
            [state.home.onCourt, state.away.onCourt].flat().forEach(p => {
                p.lastSubInTime = 720;
                p.conditionAtSubIn = p.currentCondition;
            });
            
            if (state.quarter > 4 && state.home.score !== state.away.score) break; // End Game
            if (state.quarter > 4) state.gameClock = 300; // OT is 5 mins
        } else {
            // Switch Possession
            state.possession = state.possession === 'home' ? 'away' : 'home';
        }
    }

    // 3. Finalize Rotation Logs
    const finalTimeSeconds = ((state.quarter > 4 ? 4 : state.quarter) * 720) + (state.quarter > 4 ? (state.quarter - 4) * 300 : 0);
    [state.home, state.away].forEach(t => {
        t.onCourt.forEach(p => {
            const log = state.rotationHistory[p.playerId];
            if (log && log.length > 0) {
                log[log.length - 1].out = finalTimeSeconds;
            }
        });
    });

    // 4. Prepare Result
    const mapBox = (teamState: TeamState) => [...teamState.onCourt, ...teamState.bench].map(p => ({
        playerId: p.playerId,
        playerName: p.playerName,
        pts: p.pts, reb: p.reb, offReb: p.offReb, defReb: p.defReb,
        ast: p.ast, stl: p.stl, blk: p.blk, tov: p.tov,
        fgm: p.fgm, fga: p.fga, p3m: p.p3m, p3a: p.p3a, ftm: p.ftm, fta: p.fta,
        rimM: p.rimM, rimA: p.rimA, midM: p.midM, midA: p.midA,
        zoneData: p.zoneData,
        mp: p.mp, g: 1, gs: p.gs, pf: p.pf,
        plusMinus: p.plusMinus,
        condition: Math.round(p.currentCondition),
        fatigue: Math.round(p.startCondition - p.currentCondition),
        isStopper: teamState.tactics.stopperId === p.playerId
    }));

    const rosterUpdates: Record<string, any> = {};
    [...state.home.onCourt, ...state.home.bench, ...state.away.onCourt, ...state.away.bench].forEach(p => {
        rosterUpdates[p.playerId] = {
            condition: p.currentCondition,
            health: p.health,
            injuryType: p.injuryType,
            returnDate: p.returnDate
        };
    });

    return {
        homeScore: state.home.score,
        awayScore: state.away.score,
        homeBox: mapBox(state.home),
        awayBox: mapBox(state.away),
        homeTactics: { 
            offense: state.home.tactics.offenseTactics[0], 
            defense: state.home.tactics.defenseTactics[0], 
            pace: state.home.tactics.sliders.pace, 
            sliders: state.home.tactics.sliders 
        },
        awayTactics: { 
            offense: state.away.tactics.offenseTactics[0], 
            defense: state.away.tactics.defenseTactics[0], 
            pace: state.away.tactics.sliders.pace, 
            sliders: state.away.tactics.sliders
        },
        rosterUpdates,
        pbpLogs: state.logs,
        rotationData: state.rotationHistory
    };
}
