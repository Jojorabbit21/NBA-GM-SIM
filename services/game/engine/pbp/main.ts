
import { Team, GameTactics, SimulationResult, DepthChart, PlayerBoxScore, PlayType } from '../../../../types';
import { GameState, TeamState, LivePlayer } from './pbpTypes';
import { calculatePossessionTime, formatTime } from './timeEngine';
import { initTeamState } from './initializer';
import { resolvePlayAction, PlayContext } from './playTypes';
import { calculateHitRate, flattenPlayer } from './flowEngine';
import { OFFENSE_STRATEGY_CONFIG } from './strategyMap';
import { calculateFoulStats } from '../foulSystem';
import { calculatePlaymakingStats } from '../playmakingSystem';

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

// Helper: Determine Rebounder based on Position & Stats
function resolveRebound(homeTeam: TeamState, awayTeam: TeamState, shooterId: string): { player: LivePlayer, type: 'off' | 'def' } {
    // 1. Collect all candidates
    const allPlayers = [...homeTeam.onCourt, ...awayTeam.onCourt];
    
    // 2. Calculate Rebound Score for each
    // Score = RebAttr * 0.6 + Vert * 0.2 + Height * 0.2 + Random Factor
    const candidates = allPlayers.map(p => {
        // Penalty for shooter (harder to get own rebound usually)
        const shooterPenalty = p.playerId === shooterId ? 0.3 : 1.0;
        
        // Position bias (Bigs are closer to rim)
        let posBonus = 1.0;
        if (p.position === 'C') posBonus = 1.3;
        else if (p.position === 'PF') posBonus = 1.2;
        
        const score = (
            (p.attr.reb * 0.6) + 
            (p.attr.vertical * 0.2) + 
            ((p.attr.height - 180) * 0.5) // Height weight
        ) * posBonus * shooterPenalty * Math.random();
        
        return { p, score };
    });

    // 3. Sort by Score
    candidates.sort((a, b) => b.score - a.score);
    const winner = candidates[0].p;

    // 4. Determine Type
    // If winner belongs to the team that shot (Shooter's team), it's Offensive
    const isHomeShooter = homeTeam.onCourt.some(p => p.playerId === shooterId);
    const isHomeWinner = homeTeam.onCourt.some(p => p.playerId === winner.playerId);
    
    const type = (isHomeShooter === isHomeWinner) ? 'off' : 'def';
    
    return { player: winner, type };
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

    const checkManualRotation = (teamState: TeamState, currentTotalSec: number) => {
        const currentMinute = Math.min(47, Math.floor(currentTotalSec / 60));
        
        const scoreDiff = Math.abs(state.home.score - state.away.score);
        const isGarbageTime = state.quarter >= 4 && state.gameClock < 300 && scoreDiff > 20;

        let finalRequiredIds: string[] = [];

        if (isGarbageTime) {
            const garbageCandidates = new Set<string>();
            const allAvailable = [...teamState.onCourt, ...teamState.bench].filter(p => p.health === 'Healthy' && p.pf < 6);

            if (teamState.depthChart) {
                Object.values(teamState.depthChart).forEach(row => {
                    const thirdStringId = row[2]; 
                    if (thirdStringId && allAvailable.some(p => p.playerId === thirdStringId)) {
                        garbageCandidates.add(thirdStringId);
                    }
                });
            }
            allAvailable.sort((a, b) => a.ovr - b.ovr);

            for (const candId of garbageCandidates) {
                if (finalRequiredIds.length >= 5) break;
                finalRequiredIds.push(candId);
            }
            for (const p of allAvailable) {
                if (finalRequiredIds.length >= 5) break;
                if (!finalRequiredIds.includes(p.playerId)) finalRequiredIds.push(p.playerId);
            }

        } else {
            const map = teamState.tactics.rotationMap;
            if (!map || Object.keys(map).length === 0) return;

            const shouldBeOnIds = Object.entries(map).filter(([_, m]) => m[currentMinute]).map(([pid]) => pid);

            shouldBeOnIds.forEach(pid => {
                const p = [...teamState.onCourt, ...teamState.bench].find(lp => lp.playerId === pid);
                if (!p || p.health === 'Injured' || p.pf >= 6) {
                    const pos = p?.position || 'SF';
                    const row = teamState.depthChart?.[pos as keyof DepthChart] || [];
                    const nextId = row.find(id => {
                        if (!id || id === pid) return false;
                        const cand = [...teamState.onCourt, ...teamState.bench].find(lp => lp.playerId === id);
                        return cand && cand.health === 'Healthy' && cand.pf < 6;
                    });
                    if (nextId) finalRequiredIds.push(nextId);
                } else {
                    finalRequiredIds.push(pid);
                }
            });
        }

        if (finalRequiredIds.length > 0) {
            const currentOnCourtIds = teamState.onCourt.map(p => p.playerId);
            const needsUpdate = finalRequiredIds.some(id => !currentOnCourtIds.includes(id)) || currentOnCourtIds.some(id => !finalRequiredIds.includes(id));

            if (needsUpdate) {
                const toRemove = teamState.onCourt.filter(p => !finalRequiredIds.includes(p.playerId));
                const toAdd = teamState.bench.filter(p => finalRequiredIds.includes(p.playerId));

                toRemove.forEach(p => {
                    const idx = teamState.onCourt.indexOf(p);
                    if (idx > -1) {
                        teamState.onCourt.splice(idx, 1);
                        teamState.bench.push(p);
                        const hist = state.rotationHistory[p.playerId];
                        if (hist.length > 0) hist[hist.length - 1].out = currentTotalSec;
                    }
                });

                toAdd.forEach(p => {
                    const idx = teamState.bench.indexOf(p);
                    if (idx > -1) {
                        teamState.bench.splice(idx, 1);
                        teamState.onCourt.push(p);
                        state.rotationHistory[p.playerId].push({ in: currentTotalSec, out: currentTotalSec });
                    }
                });

                while (teamState.onCourt.length < 5 && teamState.bench.length > 0) {
                     const filler = teamState.bench.find(p => p.health === 'Healthy' && p.pf < 6) || teamState.bench[0];
                     const idx = teamState.bench.indexOf(filler);
                     teamState.bench.splice(idx, 1);
                     teamState.onCourt.push(filler);
                     state.rotationHistory[filler.playerId].push({ in: currentTotalSec, out: currentTotalSec });
                }
                
                state.logs.push({
                    quarter: state.quarter,
                    timeRemaining: formatTime(state.gameClock),
                    teamId: teamState.id,
                    text: `선수 교체 진행`,
                    type: 'info'
                });
            }
        }
    };

    // ==========================================================================================
    //  MAIN GAME LOOP
    // ==========================================================================================
    
    while (state.quarter <= 4 || state.home.score === state.away.score) {
        // 0. Time Management
        const totalElapsedSec = ((state.quarter - 1) * 720) + (720 - state.gameClock);
        checkManualRotation(state.home, totalElapsedSec);
        checkManualRotation(state.away, totalElapsedSec);

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
        
        // Increment Minutes
        state.home.onCourt.forEach(p => p.mp += (timeTaken/60));
        state.away.onCourt.forEach(p => p.mp += (timeTaken/60));

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
        const foulStats = calculateFoulStats(
            flattenPlayer(defender), 
            defender.mp, 
            defTeam.tactics, 
            attTeam.tactics, 
            defTeam.tactics.sliders,
            flattenPlayer(actor)
        );
        
        // Probability of foul in this possession based on projected fouls per 36
        // e.g. 4 PF/36m -> 4 / (36*60/15 sec poss) -> low chance per poss
        const foulProb = (foulStats.pf / 100) * 0.8; // Simplified probability
        
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
                checkManualRotation(defTeam, totalElapsedSec); // Force sub
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
            
            // Assist Logic
            if (secondaryActor && secondaryActor.playerId !== actor.playerId) {
                // Chance of assist credit based on play type
                const astChance = (playType === 'CatchShoot' || playType === 'PnR_Roll' || playType === 'Cut') ? 0.9 : 0.4;
                if (Math.random() < astChance) {
                    secondaryActor.ast++;
                }
            }
            
            const assistText = (secondaryActor && secondaryActor.playerId !== actor.playerId) ? ` (Ast: ${secondaryActor.playerName})` : '';
            const shotDesc = isThree ? '3점슛' : (shotType === 'Dunk' ? '덩크' : '점프슛');

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
            
            state.logs.push({
                quarter: state.quarter,
                timeRemaining: formatTime(state.gameClock),
                teamId: attTeam.id,
                text: `${actor.playerName} ${isThree ? '3점' : ''} 슛 실패`,
                type: 'miss'
            });

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
            zoneData: p.zoneData
        }));
    };

    return {
        homeScore: state.home.score,
        awayScore: state.away.score,
        homeBox: mapBox(state.home),
        awayBox: mapBox(state.away),
        homeTactics: {},
        awayTactics: {},
        rosterUpdates: {},
        pbpLogs: state.logs,
        rotationData: state.rotationHistory
    };
}
