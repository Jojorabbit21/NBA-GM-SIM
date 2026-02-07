
import { Team, GameTactics, SimulationResult, DepthChart, PlayerBoxScore, PlayType } from '../../../../types';
import { GameState, TeamState } from './pbpTypes';
import { calculatePossessionTime, formatTime } from './timeEngine';
import { initTeamState } from './initializer';
import { resolvePlayAction, PlayContext } from './playTypes';
import { calculateHitRate, flattenPlayer } from './flowEngine';
import { OFFENSE_STRATEGY_CONFIG } from './strategyMap';
import { calculateFoulStats } from '../foulSystem';
import { calculatePlaymakingStats } from '../playmakingSystem';
// [New Modules]
import { resolveRebound } from './reboundLogic';
import { checkAndApplyRotation, forceSubstitution } from './rotationLogic';
import { calculateIncrementalFatigue, recoverBenchPlayers } from '../fatigueSystem';

// Helper: Weighted Random Selection for Play Types
function selectPlayType(tacticName: string = 'Balance'): PlayType {
    const config = OFFENSE_STRATEGY_CONFIG[tacticName as keyof typeof OFFENSE_STRATEGY_CONFIG] || OFFENSE_STRATEGY_CONFIG['Balance'];
    const dist = config.playDistribution;
    
    const rand = Math.random();
    let cumulative = 0;
    
    for (const [type, weight] of Object.entries(dist)) {
        cumulative += weight;
        if (rand < cumulative) return type as PlayType;
    }
    return 'Iso';
}

// Helper: Determine Specific Zone based on Broad Zone (For Stat Tracking)
function resolveSpecificZone(broadZone: 'Rim' | 'Paint' | 'Mid' | '3PT'): string {
    const rand = Math.random();
    
    if (broadZone === 'Rim') return 'zone_rim';
    if (broadZone === 'Paint') return 'zone_paint';
    
    if (broadZone === 'Mid') {
        if (rand < 0.33) return 'zone_mid_l';
        if (rand < 0.66) return 'zone_mid_c';
        return 'zone_mid_r';
    }
    
    if (broadZone === '3PT') {
        // Corners have lower volume naturally than wings/top
        if (rand < 0.15) return 'zone_c3_l';
        if (rand < 0.30) return 'zone_c3_r';
        if (rand < 0.55) return 'zone_atb3_l'; // Above the break Left
        if (rand < 0.80) return 'zone_atb3_r'; // Above the break Right
        return 'zone_atb3_c'; // Top
    }
    
    return 'zone_paint'; // Fallback
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
    
    // [Fix] Ensure we preserve user tactics if present
    const homeT = userTeamId === homeTeam.id && userTactics ? userTactics : undefined; 
    const awayT = userTeamId === awayTeam.id && userTactics ? userTactics : undefined;

    const state: GameState = {
        home: initTeamState(homeTeam, homeT, homeDepthChart),
        away: initTeamState(awayTeam, awayT, awayDepthChart),
        quarter: 1,
        gameClock: 720,
        shotClock: 24,
        possession: 'home',
        isDeadBall: false,
        logs: [],
        isHomeB2B,
        isAwayB2B,
        rotationHistory: {}
    };

    // Initialize Rotation History
    [...state.home.onCourt, ...state.home.bench, ...state.away.onCourt, ...state.away.bench].forEach(p => {
        state.rotationHistory[p.playerId] = [];
    });

    const recordStarters = (team: TeamState) => {
        team.onCourt.forEach(p => {
            state.rotationHistory[p.playerId].push({ in: 0, out: 0 }); 
        });
    };
    recordStarters(state.home);
    recordStarters(state.away);

    // ==========================================================================================
    //  MAIN GAME LOOP
    // ==========================================================================================
    
    while (state.quarter <= 4 || state.home.score === state.away.score) {
        // 0. Time Management & Rotation
        const totalElapsedSec = ((state.quarter - 1) * 720) + (720 - state.gameClock);
        
        // Check standard rotation map (Moved to rotationLogic.ts)
        checkAndApplyRotation(state, state.home, totalElapsedSec);
        checkAndApplyRotation(state, state.away, totalElapsedSec);

        // Determine Sides
        const attTeam = state.possession === 'home' ? state.home : state.away;
        const defTeam = state.possession === 'home' ? state.away : state.home;
        
        // Determine Play
        const tacticName = attTeam.tactics.offenseTactics[0];
        const playType = selectPlayType(tacticName);
        const playContext: PlayContext = resolvePlayAction(attTeam, playType);
        
        const { actor, secondaryActor, preferredZone, shotType, bonusHitRate } = playContext;
        
        // Find Defender (Simple matchup based on position or random switch)
        // Ideally should check defensive assignments
        const defender = defTeam.onCourt.find(p => p.position === actor.position) || defTeam.onCourt[Math.floor(Math.random()*5)];
        
        const timeTaken = calculatePossessionTime(state, attTeam.tactics.sliders, tacticName);
        state.gameClock -= timeTaken;
        state.shotClock -= timeTaken; // Reset to 24 on possession change
        
        // --- [FIX] Fatigue & Minutes Application ---
        // Apply fatigue to everyone on court based on timeTaken
        const applyTeamFatigue = (team: TeamState, isB2B: boolean, isDefense: boolean) => {
            team.onCourt.forEach(p => {
                p.mp += (timeTaken / 60); // Update Minutes Played
                
                const isStopper = team.tactics.stopperId === p.playerId;
                const fatigueRes = calculateIncrementalFatigue(
                    p, 
                    timeTaken, 
                    team.tactics.sliders, 
                    isB2B, 
                    isStopper,
                    team.tactics.offenseTactics[0],
                    team.tactics.defenseTactics[0]
                );
                
                // Reduce condition
                p.currentCondition = Math.max(0, p.currentCondition - fatigueRes.drain);
                
                // Check Injury
                if (fatigueRes.injuryOccurred && fatigueRes.injuryDetails) {
                    p.health = fatigueRes.injuryDetails.health;
                    p.injuryType = fatigueRes.injuryDetails.type;
                    
                    state.logs.push({
                        quarter: state.quarter,
                        timeRemaining: formatTime(state.gameClock),
                        teamId: team.id,
                        text: `🚑 ${p.playerName} 부상 발생! (${p.injuryType})`,
                        type: 'info'
                    });
                    
                    // Force Sub
                    forceSubstitution(state, team, p, '부상');
                }
            });
            
            // Recover Bench
            recoverBenchPlayers(team.bench, timeTaken);
        };
        
        applyTeamFatigue(state.home, state.isHomeB2B, state.possession === 'away');
        applyTeamFatigue(state.away, state.isAwayB2B, state.possession === 'home');

        // 1. Turnover Check
        // Pass Acc, Handling vs Steal, Def Intensity
        const plmStats = calculatePlaymakingStats(flattenPlayer(actor), actor.mp, actor.fga, attTeam.tactics.sliders, false); // Simplify ace target for now
        
        // Base TOV Chance (approx 12-15% of possessions)
        const tovChance = 0.12 + (plmStats.tov * 0.05); 
        // Defender Steal Pressure
        const stealChance = (defender.attr.stl + defender.attr.perDef) / 1000;
        
        if (Math.random() < tovChance) {
            // Turnover occurred
            actor.tov++;
            
            // Was it a steal?
            if (Math.random() < (stealChance * 4)) { // 4x multiplier to make steaks happen reasonably
                defender.stl++;
                state.logs.push({
                    quarter: state.quarter,
                    timeRemaining: formatTime(state.gameClock),
                    teamId: defTeam.id,
                    text: `${defender.playerName} 스틸! (${actor.playerName} 턴오버)`,
                    type: 'turnover'
                });
            } else {
                state.logs.push({
                    quarter: state.quarter,
                    timeRemaining: formatTime(state.gameClock),
                    teamId: attTeam.id,
                    text: `${actor.playerName} 턴오버 (패스 미스/라인 크로스)`,
                    type: 'turnover'
                });
            }
            
            state.possession = state.possession === 'home' ? 'away' : 'home';
            state.shotClock = 24;
            continue; // End possession
        }

        // 2. Foul Check
        // Use foulSystem
        // [FIX] Calculate Foul Prob based on standardized 36 min rate, NOT current MP
        // calculateFoulStats returns projected fouls for `minutesPlanned`.
        // We pass 36 to get "Per 36" rate.
        const foulStats = calculateFoulStats(
            flattenPlayer(defender), 
            36, // Standardize to 36 mins for rate calculation
            defTeam.tactics, 
            attTeam.tactics, 
            defTeam.tactics.sliders,
            flattenPlayer(actor)
        );
        
        // [FIX] Convert per-36 rate to per-possession probability
        // Approx 75 defensive possessions per 36 mins (100 per 48)
        // e.g. 4.5 PF/36m -> 4.5 / 75 = 0.06 (6%) chance per possession
        const foulProb = (foulStats.pf / 75); 
        
        if (Math.random() < foulProb) {
            defender.pf++;
            defTeam.fouls++;
            
            let ftCount = 0;
            const isBonus = defTeam.fouls >= 5;
            const isShootingFoul = Math.random() < 0.3; // 30% shooting foul
            
            if (isShootingFoul || isBonus) {
                ftCount = preferredZone === '3PT' && isShootingFoul ? 3 : 2;
                let ftMade = 0;
                for (let i=0; i<ftCount; i++) {
                    actor.fta++;
                    if (Math.random() < (actor.attr.ft / 100)) {
                        actor.ftm++;
                        actor.pts++;
                        attTeam.score++;
                        ftMade++;
                    }
                }
                state.logs.push({
                    quarter: state.quarter,
                    timeRemaining: formatTime(state.gameClock),
                    teamId: attTeam.id,
                    text: `${defender.playerName} 파울 (자유투 ${ftMade}/${ftCount}) - ${actor.playerName}`,
                    type: 'freethrow'
                });
                
                // [FIX] Update Plus/Minus for FTs
                if (ftMade > 0) {
                     attTeam.onCourt.forEach(p => p.plusMinus += ftMade);
                     defTeam.onCourt.forEach(p => p.plusMinus -= ftMade);
                }

            } else {
                state.logs.push({
                    quarter: state.quarter,
                    timeRemaining: formatTime(state.gameClock),
                    teamId: defTeam.id,
                    text: `${defender.playerName} 퍼스널 파울 (사이드 아웃)`,
                    type: 'foul'
                });
                state.shotClock = 14; // Reset to 14 on non-shooting foul
                // Possession stays
                continue;
            }
            
            // Check Foul Out
            if (defender.pf >= 6) {
                state.logs.push({
                    quarter: state.quarter,
                    timeRemaining: formatTime(state.gameClock),
                    teamId: defTeam.id,
                    text: `🚨 ${defender.playerName} 6반칙 퇴장!`,
                    type: 'info'
                });
                // Force Sub
                forceSubstitution(state, defTeam, defender, '6반칙 퇴장');
            }
            
            state.possession = state.possession === 'home' ? 'away' : 'home';
            state.shotClock = 24;
            continue;
        }

        // 3. Shot Execution
        // Calculate Hit Rate
        // attEfficiency: Fit from tactics (1.0 default)
        // defEfficiency: Fit from tactics (1.0 default)
        const hitChance = calculateHitRate(
            actor, defender, defTeam, playType, preferredZone, 
            attTeam.tactics.sliders.pace, 
            bonusHitRate, 
            1.0, 1.0
        );

        // Block Check
        const blockChance = (defender.attr.blk + defender.attr.vertical + defender.attr.height - 300) * 0.0005;
        if (Math.random() < Math.max(0.01, blockChance) && preferredZone !== '3PT') {
            defender.blk++;
            actor.fga++;
            state.logs.push({
                quarter: state.quarter,
                timeRemaining: formatTime(state.gameClock),
                teamId: defTeam.id,
                text: `${defender.playerName} 강력한 블록! (${actor.playerName} 슛 실패)`,
                type: 'block'
            });
             // Block usually leads to rebound scramble, but simplify to def rebound for flow
             // Or keep possession? Let's say 50/50
             if (Math.random() > 0.5) {
                 state.possession = state.possession === 'home' ? 'away' : 'home';
             } else {
                 state.shotClock = 14;
             }
             continue;
        }

        // [FIX] Determine Specific Zone for detailed stats
        const specificZone = resolveSpecificZone(preferredZone);
        // Increment Attempt for that zone (Dynamic Key Access)
        const attKey = specificZone + '_a';
        (actor as any)[attKey] = ((actor as any)[attKey] || 0) + 1;

        const isMake = Math.random() < hitChance;
        const isThree = preferredZone === '3PT';
        const points = isThree ? 3 : 2;

        if (isMake) {
            // SCORING
            actor.pts += points;
            attTeam.score += points;
            actor.fgm++;
            actor.fga++;
            if (isThree) { actor.p3m++; actor.p3a++; }
            
            // [FIX] Increment Make for that zone
            const makeKey = specificZone + '_m';
            (actor as any)[makeKey] = ((actor as any)[makeKey] || 0) + 1;

            // [FIX] Apply Plus/Minus
            attTeam.onCourt.forEach(p => p.plusMinus += points);
            defTeam.onCourt.forEach(p => p.plusMinus -= points);

            // Assist Logic
            if (secondaryActor && secondaryActor.playerId !== actor.playerId) {
                // Chance of assist credit based on play type
                const astChance = (playType === 'CatchShoot' || playType === 'PnR_Roll' || playType === 'Cut') ? 0.9 : 0.4;
                if (Math.random() < astChance) {
                    secondaryActor.ast++;
                }
            }
            
            const assistText = (secondaryActor && secondaryActor.playerId !== actor.playerId) ? ` (Ast: ${secondaryActor.playerName})` : '';
            
            // [FIX] Map PlayType to Korean Description
            let shotDesc = '점프슛';
            if (isThree) shotDesc = '3점슛';
            else if (shotType === 'Dunk') shotDesc = '덩크';
            else if (shotType === 'Layup') shotDesc = '레이업';
            else if (shotType === 'Hook') shotDesc = '훅슛';
            else if (shotType === 'Pullup') shotDesc = '풀업 점퍼';
            else if (shotType === 'CatchShoot') shotDesc = '캐치앤슛';

            state.logs.push({ 
                quarter: state.quarter, 
                timeRemaining: formatTime(state.gameClock), 
                teamId: attTeam.id, 
                text: `${actor.playerName} ${shotDesc} 성공${assistText}`, 
                type: 'score',
                points: points as 2|3
            });
            
            state.possession = state.possession === 'home' ? 'away' : 'home';
            state.shotClock = 24;

        } else {
            // MISS -> REBOUND
            actor.fga++;
            if (isThree) actor.p3a++;
            
            // [FIX] Map PlayType to Korean Description for Miss
            let shotDesc = '점프슛';
            if (isThree) shotDesc = '3점슛';
            else if (shotType === 'Dunk') shotDesc = '덩크';
            else if (shotType === 'Layup') shotDesc = '레이업';
            else if (shotType === 'Hook') shotDesc = '훅슛';
            else if (shotType === 'Pullup') shotDesc = '풀업 점퍼';
            else if (shotType === 'CatchShoot') shotDesc = '캐치앤슛';
            
            state.logs.push({
                quarter: state.quarter,
                timeRemaining: formatTime(state.gameClock),
                teamId: attTeam.id,
                text: `${actor.playerName} ${shotDesc} 실패`,
                type: 'miss'
            });

            // [Refactor] Use separated rebound logic
            const rebResult = resolveRebound(state.home, state.away, actor.playerId);
            const rebounder = rebResult.player;
            
            rebounder.reb++;
            if (rebResult.type === 'off') {
                rebounder.offReb++;
                state.shotClock = 14; // Reset to 14 on ORB
                state.logs.push({
                    quarter: state.quarter,
                    timeRemaining: formatTime(state.gameClock),
                    teamId: attTeam.id,
                    text: `${rebounder.playerName} 공격 리바운드!`,
                    type: 'info'
                });
                // Possession keeps
            } else {
                rebounder.defReb++;
                state.possession = state.possession === 'home' ? 'away' : 'home';
                state.shotClock = 24;
                state.logs.push({
                    quarter: state.quarter,
                    timeRemaining: formatTime(state.gameClock),
                    teamId: defTeam.id,
                    text: `${rebounder.playerName} 리바운드`,
                    type: 'info'
                });
            }
        }

        // 4. Timeout Check (Momentum / Fatigue)
        // If score run > 8-0 or fatigue critical
        // Placeholder for logic

        // 5. Quarter End Check
        if (state.gameClock <= 0) {
            state.quarter++;
            state.gameClock = 720;
            state.home.fouls = 0; // Reset team fouls
            state.away.fouls = 0;
            state.home.timeouts = Math.max(2, state.home.timeouts); // Reset timeouts partially
            state.away.timeouts = Math.max(2, state.away.timeouts);
            
            state.logs.push({
                quarter: state.quarter - 1,
                timeRemaining: '0:00',
                teamId: 'system',
                text: `${state.quarter - 1}쿼터 종료 [ ${state.home.name} ${state.home.score} : ${state.away.score} ${state.away.name} ]`,
                type: 'info'
            });

            if (state.quarter > 4 && state.home.score !== state.away.score) break;
            if (state.quarter > 4) {
                 state.gameClock = 300; // OT is 5 mins
                 state.logs.push({
                    quarter: state.quarter,
                    timeRemaining: '5:00',
                    teamId: 'system',
                    text: `--- 연장전 시작 ---`,
                    type: 'info'
                });
            }
        }
    }

    // Close rotation segments for players still on court
    const finalTotalSec = ((state.quarter - 1) * 720) + (720 - state.gameClock);
    const closeFinalSegments = (team: TeamState) => {
        team.onCourt.forEach(p => {
            const hist = state.rotationHistory[p.playerId];
            if (hist && hist.length > 0) {
                hist[hist.length - 1].out = finalTotalSec;
            }
        });
    };
    closeFinalSegments(state.home);
    closeFinalSegments(state.away);

    // [New] Collect roster updates (Condition/Injury) to pass back to App State
    const rosterUpdates: Record<string, any> = {};
    const collectUpdates = (team: TeamState) => {
        [...team.onCourt, ...team.bench].forEach(p => {
             // Only send update if changed
             if (p.currentCondition !== p.startCondition || p.health !== 'Healthy') {
                 rosterUpdates[p.playerId] = {
                     condition: p.currentCondition,
                     health: p.health,
                     injuryType: p.injuryType,
                     returnDate: p.returnDate
                 };
             }
        });
    };
    collectUpdates(state.home);
    collectUpdates(state.away);

    const mapBox = (teamState: TeamState): PlayerBoxScore[] => {
        return [...teamState.onCourt, ...teamState.bench].map(p => ({
            playerId: p.playerId,
            playerName: p.playerName,
            pts: p.pts,
            reb: p.reb,
            offReb: p.offReb,
            defReb: p.defReb,
            ast: p.ast,
            stl: p.stl,
            blk: p.blk,
            tov: p.tov,
            fgm: p.fgm,
            fga: p.fga,
            p3m: p.p3m,
            p3a: p.p3a,
            ftm: p.ftm,
            fta: p.fta,
            rimM: p.rimM,
            rimA: p.rimA,
            midM: p.midM,
            midA: p.midA,
            mp: p.mp,
            g: 1,
            gs: p.gs,
            pf: p.pf,
            plusMinus: p.plusMinus,
            condition: p.currentCondition,
            isStopper: p.isStopper,
            // [FIX] Map Accumulated Zone Stats to ZoneData Object
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

    return {
        homeScore: state.home.score,
        awayScore: state.away.score,
        homeBox: mapBox(state.home),
        awayBox: mapBox(state.away),
        // [FIX] Return Actual Tactics used
        homeTactics: state.home.tactics,
        awayTactics: state.away.tactics,
        rosterUpdates: rosterUpdates,
        pbpLogs: state.logs,
        rotationData: state.rotationHistory
    };
}
