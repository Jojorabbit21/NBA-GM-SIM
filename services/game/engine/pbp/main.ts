
import { Team, GameTactics, SimulationResult, DepthChart } from '../../../../types';
import { GameState, TeamState, LivePlayer } from './pbpTypes';
import { calculatePossessionTime, formatTime } from './timeEngine';
import { resolvePlayAction } from './playTypes';
import { calculateIncrementalFatigue } from '../fatigueSystem';
import { checkSubstitutions } from './substitutionSystem';
import { calculatePlayerArchetypes } from './archetypeSystem';
import { calculateShootingStats } from '../shootingSystem';
import { calculateDefenseStats, distributeRebounds, getOpponentDefensiveMetrics } from '../defenseSystem';
import { calculateFoulStats } from '../foulSystem';
import { INITIAL_STATS } from '../../../../utils/constants';

// Initialize Team State for Simulation
function initTeamState(team: Team, tactics: GameTactics | undefined, depthChart?: DepthChart | null): TeamState {
    // Default tactics if undefined
    const safeTactics: GameTactics = tactics || {
        offenseTactics: ['Balance'],
        defenseTactics: ['ManToManPerimeter'],
        sliders: { pace: 5, offReb: 5, defIntensity: 5, defReb: 5, fullCourtPress: 1, zoneUsage: 2, rotationFlexibility: 5 },
        starters: { PG: '', SG: '', SF: '', PF: '', C: '' },
        minutesLimits: {}
    };

    // Sort Roster by OVR to auto-fill empty slots
    const sortedRoster = [...team.roster].sort((a, b) => b.ovr - a.ovr);
    
    // Map Roster to LivePlayer
    const liveRoster: LivePlayer[] = sortedRoster.map(p => {
        const threeAvg = (p.threeCorner + p.three45 + p.threeTop) / 3;
        
        // Prepare Attributes map for Engine use
        const attr = {
            ins: p.ins, out: p.out, mid: p.midRange, ft: p.ft, threeVal: threeAvg,
            speed: p.speed, agility: p.agility, strength: p.strength, vertical: p.vertical,
            stamina: p.stamina, durability: p.durability, hustle: p.hustle,
            height: p.height, weight: p.weight,
            handling: p.handling, hands: p.hands, pas: p.passAcc, passAcc: p.passAcc,
            passVision: p.passVision, passIq: p.passIq, shotIq: p.shotIq, offConsist: p.offConsist,
            postPlay: p.postPlay,
            def: p.def, intDef: p.intDef, perDef: p.perDef, blk: p.blk, stl: p.steal,
            helpDefIq: p.helpDefIq, defConsist: p.defConsist, drFoul: p.drawFoul, foulTendency: 50,
            reb: p.reb
        };

        const currentCondition = p.condition !== undefined ? p.condition : 100;

        return {
            playerId: p.id,
            playerName: p.name,
            // Box Score Init
            pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
            fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
            rimM: 0, rimA: 0, midM: 0, midA: 0,
            pf: 0, plusMinus: 0, mp: 0, g: 1, gs: 0,
            zoneData: { ...INITIAL_STATS() }, // Initialize Zone Stats
            
            // Live Props
            currentCondition,
            startCondition: currentCondition, // [New] Track starting condition
            position: p.position,
            ovr: p.ovr,
            isStarter: false, // Set later
            health: p.health || 'Healthy',
            injuryType: p.injuryType,
            returnDate: p.returnDate,
            
            lastSubInTime: 0,
            conditionAtSubIn: currentCondition,
            isShutdown: false,
            needsDeepRecovery: false,
            
            attr,
            archetypes: calculatePlayerArchetypes(attr, currentCondition), // Initial calc

            // Zone Accumulators (Initialize to 0)
            zone_rim_m: 0, zone_rim_a: 0, zone_paint_m: 0, zone_paint_a: 0,
            zone_mid_l_m: 0, zone_mid_l_a: 0, zone_mid_c_m: 0, zone_mid_c_a: 0, zone_mid_r_m: 0, zone_mid_r_a: 0,
            zone_c3_l_m: 0, zone_c3_l_a: 0, zone_c3_r_m: 0, zone_c3_r_a: 0,
            zone_atb3_l_m: 0, zone_atb3_l_a: 0, zone_atb3_c_m: 0, zone_atb3_c_a: 0, zone_atb3_r_m: 0, zone_atb3_r_a: 0
        };
    });

    // Determine Starters
    const onCourt: LivePlayer[] = [];
    const bench: LivePlayer[] = [];
    const starterIds = Object.values(safeTactics.starters).filter(id => id !== '');
    
    // Auto-fill if missing starters
    if (starterIds.length < 5) {
        const needed = 5 - starterIds.length;
        const available = liveRoster.filter(p => !starterIds.includes(p.playerId));
        for (let i = 0; i < needed; i++) {
            if (available[i]) starterIds.push(available[i].playerId);
        }
    }

    liveRoster.forEach(p => {
        if (starterIds.includes(p.playerId) && onCourt.length < 5) {
            p.isStarter = true;
            p.gs = 1;
            p.lastSubInTime = 720; // Q1 Start (12 mins)
            onCourt.push(p);
        } else {
            bench.push(p);
        }
    });

    // Fallback if still not 5 (e.g. tiny roster)
    while (onCourt.length < 5 && bench.length > 0) {
        const p = bench.shift()!;
        p.isStarter = true;
        p.gs = 1;
        p.lastSubInTime = 720;
        onCourt.push(p);
    }

    return {
        id: team.id,
        name: team.name,
        score: 0,
        tactics: safeTactics,
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
    
    // 1. Setup State
    const homeTactics = userTeamId === homeTeam.id && userTactics ? userTactics : undefined; // AI uses auto-gen or existing in map
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
        // Process Substitutions (Dead ball or Timeout logic abstracted)
        // Check every possession change roughly
        
        // --- Substitution Logic (Simplified for block simulation) ---
        // For accurate PbP, we should check subs at intervals or dead balls.
        // Here we run sub checks every possession to be safe.
        const homeSubs = checkSubstitutions(state, state.home);
        const awaySubs = checkSubstitutions(state, state.away);
        
        const executeSubs = (teamState: TeamState, subs: any[]) => {
            subs.forEach(sub => {
                const outIdx = teamState.onCourt.findIndex(p => p.playerId === sub.outPlayer.playerId);
                const inIdx = teamState.bench.findIndex(p => p.playerId === sub.inPlayer.playerId);
                
                if (outIdx !== -1 && inIdx !== -1) {
                    const outP = teamState.onCourt[outIdx];
                    const inP = teamState.bench[inIdx];
                    
                    // Swap
                    teamState.onCourt.splice(outIdx, 1);
                    teamState.bench.push(outP);
                    
                    teamState.onCourt.push(inP);
                    teamState.bench.splice(inIdx, 1);
                    
                    // Log Rotation
                    const gameTimeSeconds = ((state.quarter - 1) * 720) + (720 - state.gameClock);
                    
                    // Close Out Player's segment
                    const outLog = state.rotationHistory[outP.playerId];
                    if (outLog && outLog.length > 0) {
                        outLog[outLog.length - 1].out = gameTimeSeconds;
                    }
                    
                    // Start In Player's segment
                    if (!state.rotationHistory[inP.playerId]) state.rotationHistory[inP.playerId] = [];
                    state.rotationHistory[inP.playerId].push({ in: gameTimeSeconds, out: gameTimeSeconds }); // out updated later
                    
                    // Update Player State
                    inP.lastSubInTime = state.gameClock;
                    inP.conditionAtSubIn = inP.currentCondition;
                    
                    state.logs.push({
                        quarter: state.quarter,
                        timeRemaining: formatTime(state.gameClock),
                        teamId: teamState.id,
                        text: `교체: ${outP.playerName} (Out) / ${inP.playerName} (In) - ${sub.reason}`,
                        type: 'info'
                    });
                }
            });
        };
        
        executeSubs(state.home, homeSubs);
        executeSubs(state.away, awaySubs);

        // --- Play Execution ---
        const attTeam = state.possession === 'home' ? state.home : state.away;
        const defTeam = state.possession === 'home' ? state.away : state.home;
        
        // Determine Play Type based on tactics
        // For simplicity in this fix, we use 'Balance' logic if undefined
        const offTactic = attTeam.tactics.offenseTactics[0] || 'Balance';
        const defTactic = defTeam.tactics.defenseTactics[0] || 'ManToManPerimeter';
        
        // Calculate Time
        const timeTaken = calculatePossessionTime(state, attTeam.tactics.sliders, offTactic);
        
        // Execute Action (Abstracted - We use a simple randomized result for this fix to ensure it runs)
        // In full engine, resolvePlayAction + flowEngine logic would run.
        // Here we simulate the result directly to ensure stats accumulation works.
        
        // Select Actor
        const actor = attTeam.onCourt[Math.floor(Math.random() * attTeam.onCourt.length)];
        
        // Apply Time & Fatigue
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
        });

        // Resolve Score/Miss/Turnover
        // We use the detailed shooting system for stats, but here we just increment simulation state.
        // Important: `calculateShootingStats` is purely statistical. We need to apply the result to the LivePlayer.
        
        // Simulate Play Result (Simplified for robustness)
        const roll = Math.random();
        
        if (roll < 0.14) {
            // Turnover
            actor.tov++;
            attTeam.score += 0; // No points
            state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: attTeam.id, text: `${actor.playerName} 턴오버`, type: 'turnover' });
        } else {
            // [NEW] Check for Foul before Shot (approx 15% of non-TOV possessions result in shooting foul)
            const isFoul = Math.random() < 0.15; // 15% Foul Rate
            
            if (isFoul) {
                // Defensive Foul
                const fouler = defTeam.onCourt[Math.floor(Math.random() * 5)];
                fouler.pf++;
                
                // FT Calculation
                const ftChance = actor.attr.ft / 100;
                const isAndOne = Math.random() < 0.15; // 15% Chance of And-1
                let ftCount = 2;
                
                if (isAndOne) {
                    // Count Bucket + 1 FT
                    actor.fgm++; actor.fga++;
                    actor.pts += 2;
                    attTeam.score += 2;
                    // [Fix] Update +/- for the bucket
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
                        // [Fix] Update +/- for each FT made
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
                // Normal Shot Attempt (No Foul)
                const is3PT = Math.random() < 0.35;
                // Use shooting system to determine make/miss probability
                // For now, simple weighted roll based on attr
                const shotRating = is3PT ? actor.attr.threeVal : actor.attr.ins;
                const makeChance = (shotRating / 200) + 0.1; // roughly 45-55%
                const isMake = Math.random() < makeChance;
                
                if (is3PT) {
                    actor.p3a++; actor.fga++;
                    if (isMake) {
                        actor.p3m++; actor.fgm++; actor.pts += 3;
                        attTeam.score += 3;
                        // [Fix] Update +/-
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
                        // [Fix] Update +/-
                        updatePlusMinus(attTeam, defTeam, 2);

                        state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: attTeam.id, text: `${actor.playerName} 2점슛 성공`, type: 'score' });
                    } else {
                        state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: attTeam.id, text: `${actor.playerName} 2점슛 실패`, type: 'miss' });
                    }
                }

                // Rebound if miss
                if (!isMake) {
                    // [Balance Patch] Transition Defense Breakdown
                    // If Defending Team (defTeam) uses High Pace or SevenSeconds, their DRB% drops.
                    let drbChance = 0.75;
                    if (defTeam.tactics.sliders.pace > 7) {
                        drbChance -= 0.15; // High pace teams rush out, leaving glass exposed
                    }
                    if (defTeam.tactics.offenseTactics.includes('SevenSeconds')) {
                        drbChance -= 0.10; 
                    }

                    const rebTeam = Math.random() < drbChance ? defTeam : attTeam;
                    
                    const rebounder = rebTeam.onCourt[Math.floor(Math.random() * 5)];
                    rebounder.reb++;
                    if (rebTeam === attTeam) rebounder.offReb++; else rebounder.defReb++;
                } else {
                    // Assist check
                    if (Math.random() < 0.6) {
                        const assister = attTeam.onCourt.filter(p => p.playerId !== actor.playerId)[Math.floor(Math.random() * 4)];
                        if (assister) assister.ast++;
                    }
                }
            }
        }

        // Advance Clocks
        state.gameClock -= timeTaken;
        state.home.onCourt.forEach(p => p.mp += (timeTaken/60));
        state.away.onCourt.forEach(p => p.mp += (timeTaken/60));

        // Quarter End Check
        if (state.gameClock <= 0) {
            state.quarter++;
            state.gameClock = 720;
            if (state.quarter > 4 && state.home.score !== state.away.score) break; // End Game
            if (state.quarter > 4) state.gameClock = 300; // OT is 5 mins
        } else {
            // Switch Possession
            state.possession = state.possession === 'home' ? 'away' : 'home';
        }
    }

    // Finalize Rotation Logs (Close out final segments)
    const finalTimeSeconds = ((state.quarter > 4 ? 4 : state.quarter) * 720) + (state.quarter > 4 ? (state.quarter - 4) * 300 : 0);
    [state.home, state.away].forEach(t => {
        t.onCourt.forEach(p => {
            const log = state.rotationHistory[p.playerId];
            if (log && log.length > 0) {
                log[log.length - 1].out = finalTimeSeconds;
            }
        });
    });

    // Prepare Result
    // Map LivePlayer back to PlayerBoxScore
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
        fatigue: Math.round(p.startCondition - p.currentCondition), // [New] Calculate Used Fatigue
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
