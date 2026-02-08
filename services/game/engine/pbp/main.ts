
import { Team, GameTactics, SimulationResult, DepthChart, PlayerBoxScore, PlayType } from '../../../../types';
import { GameState, TeamState } from './pbpTypes';
import { calculatePossessionTime, formatTime } from './timeEngine';
import { initTeamState } from './initializer';
import { resolvePlayAction, PlayContext } from './playTypes';
import { calculateHitRate, flattenPlayer } from './flowEngine';
import { OFFENSE_STRATEGY_CONFIG } from './strategyMap';
import { calculateFoulStats } from '../foulSystem';
import { calculatePlaymakingStats } from '../playmakingSystem';
import { resolveRebound } from './reboundLogic';
import { checkAndApplyRotation, forceSubstitution } from './rotationLogic';
import { calculateIncrementalFatigue, recoverBenchPlayers } from '../fatigueSystem';

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
        if (rand < 0.15) return 'zone_c3_l';
        if (rand < 0.30) return 'zone_c3_r';
        if (rand < 0.55) return 'zone_atb3_l';
        if (rand < 0.80) return 'zone_atb3_r';
        return 'zone_atb3_c';
    }
    return 'zone_paint';
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

    while (state.quarter <= 4 || state.home.score === state.away.score) {
        const totalElapsedSec = ((state.quarter - 1) * 720) + (720 - state.gameClock);
        checkAndApplyRotation(state, state.home, totalElapsedSec);
        checkAndApplyRotation(state, state.away, totalElapsedSec);

        const attTeam = state.possession === 'home' ? state.home : state.away;
        const defTeam = state.possession === 'home' ? state.away : state.home;
        
        const tacticName = attTeam.tactics.offenseTactics[0];
        const playType = selectPlayType(tacticName);
        const playContext: PlayContext = resolvePlayAction(attTeam, playType);
        const { actor, secondaryActor, preferredZone, shotType, bonusHitRate } = playContext;
        
        const onBallDefender = defTeam.onCourt.find(p => p.position === actor.position) || defTeam.onCourt[Math.floor(Math.random()*5)];
        const timeTaken = calculatePossessionTime(state, attTeam.tactics.sliders, tacticName);
        state.gameClock -= timeTaken;
        state.shotClock -= timeTaken;
        
        const applyTeamFatigue = (team: TeamState, isB2B: boolean) => {
            team.onCourt.forEach(p => {
                p.mp += (timeTaken / 60);
                const isStopper = team.tactics.stopperId === p.playerId;
                const fatigueRes = calculateIncrementalFatigue(p, timeTaken, team.tactics.sliders, isB2B, isStopper, team.tactics.offenseTactics[0], team.tactics.defenseTactics[0]);
                p.currentCondition = Math.max(0, p.currentCondition - fatigueRes.drain);
                if (fatigueRes.injuryOccurred && fatigueRes.injuryDetails) {
                    p.health = fatigueRes.injuryDetails.health;
                    p.injuryType = fatigueRes.injuryDetails.type;
                    state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: team.id, text: `🚑 ${p.playerName} 부상 발생! (${p.injuryType})`, type: 'info' });
                    forceSubstitution(state, team, p, '부상');
                }
            });
            recoverBenchPlayers(team.bench, timeTaken);
        };
        
        applyTeamFatigue(state.home, state.isHomeB2B);
        applyTeamFatigue(state.away, state.isAwayB2B);

        // 1. Turnover Check
        const plmStats = calculatePlaymakingStats(flattenPlayer(actor), actor.mp, actor.fga, attTeam.tactics.sliders, false);
        const tovChance = 0.12 + (plmStats.tov * 0.05); 
        if (Math.random() < tovChance) {
            actor.tov++;
            const stealChance = (onBallDefender.attr.stl + onBallDefender.attr.perDef) / 1000;
            if (Math.random() < (stealChance * 4)) {
                onBallDefender.stl++;
                state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: defTeam.id, text: `${onBallDefender.playerName} 스틸! (${actor.playerName} 턴오버)`, type: 'turnover' });
            } else {
                state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: attTeam.id, text: `${actor.playerName} 턴오버 (패스 미스/라인 크로스)`, type: 'turnover' });
            }
            state.possession = state.possession === 'home' ? 'away' : 'home';
            state.shotClock = 24;
            continue;
        }

        // 2. Foul Check (Holistic Team Logic)
        const foulStats = calculateFoulStats(flattenPlayer(onBallDefender), 36, defTeam.tactics, attTeam.tactics, defTeam.tactics.sliders, flattenPlayer(actor));
        
        // Final Probability adjustment based on PreferredZone
        let foulWeight = 1.0;
        if (preferredZone === 'Rim') foulWeight = 1.25;
        else if (preferredZone === 'Paint') foulWeight = 1.15;
        else if (preferredZone === '3PT') foulWeight = 1.05;

        // Elite Draw Foul Logic (90+)
        const eliteDrawFoul = actor.attr.drFoul >= 90;
        if (eliteDrawFoul && (preferredZone === '3PT' || playType === 'Iso')) {
            foulWeight *= 1.15; 
        }

        const foulProb = (foulStats.pf / 70) * foulWeight; // Increased base by using 70 divisor instead of 75
        
        if (Math.random() < foulProb) {
            // Pick a fouler: 75% On-ball, 25% Team Noise (Illegal screen, help foul)
            let actualFouler = onBallDefender;
            if (Math.random() < 0.25) {
                actualFouler = defTeam.onCourt[Math.floor(Math.random() * 5)];
            }

            actualFouler.pf++;
            defTeam.fouls++;
            
            const isBonus = defTeam.fouls >= 5;
            // Shooting foul logic: much higher for Rim attacks
            const shootingFoulBase = preferredZone === 'Rim' ? 0.7 : 0.3;
            const isShootingFoul = Math.random() < shootingFoulBase;
            
            if (isShootingFoul || isBonus) {
                const ftCount = preferredZone === '3PT' && isShootingFoul ? 3 : 2;
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
                const andOneText = (isShootingFoul && eliteDrawFoul && Math.random() < 0.1) ? " (앤드원 유도!)" : "";
                state.logs.push({
                    quarter: state.quarter,
                    timeRemaining: formatTime(state.gameClock),
                    teamId: attTeam.id,
                    text: `${actualFouler.playerName} 파울 (자유투 ${ftMade}/${ftCount})${andOneText} - ${actor.playerName}`,
                    type: 'freethrow'
                });
                if (ftMade > 0) {
                     attTeam.onCourt.forEach(p => p.plusMinus += ftMade);
                     defTeam.onCourt.forEach(p => p.plusMinus -= ftMade);
                }
            } else {
                state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: defTeam.id, text: `${actualFouler.playerName} 파울 (사이드 아웃)`, type: 'foul' });
                state.shotClock = 14;
                continue;
            }
            
            if (actualFouler.pf >= 6) {
                state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: defTeam.id, text: `🚨 ${actualFouler.playerName} 6반칙 퇴장!`, type: 'info' });
                forceSubstitution(state, defTeam, actualFouler, '6반칙 퇴장');
            }
            
            state.possession = state.possession === 'home' ? 'away' : 'home';
            state.shotClock = 24;
            continue;
        }

        // 3. Shot Execution
        const hitChance = calculateHitRate(actor, onBallDefender, defTeam, playType, preferredZone, attTeam.tactics.sliders.pace, bonusHitRate, 1.0, 1.0);
        const blockChance = (onBallDefender.attr.blk + onBallDefender.attr.vertical + onBallDefender.attr.height - 300) * 0.0005;
        if (Math.random() < Math.max(0.01, blockChance) && preferredZone !== '3PT') {
            onBallDefender.blk++;
            actor.fga++;
            state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: defTeam.id, text: `${onBallDefender.playerName} 강력한 블록! (${actor.playerName} 슛 실패)`, type: 'block' });
             if (Math.random() > 0.5) state.possession = state.possession === 'home' ? 'away' : 'home';
             else state.shotClock = 14;
             continue;
        }

        const specificZone = resolveSpecificZone(preferredZone);
        (actor as any)[specificZone + '_a'] = ((actor as any)[specificZone + '_a'] || 0) + 1;

        const isMake = Math.random() < hitChance;
        const isThree = preferredZone === '3PT';
        const points = isThree ? 3 : 2;

        if (isMake) {
            actor.pts += points;
            attTeam.score += points;
            actor.fgm++;
            actor.fga++;
            if (isThree) { actor.p3m++; actor.p3a++; }
            (actor as any)[specificZone + '_m'] = ((actor as any)[specificZone + '_m'] || 0) + 1;
            attTeam.onCourt.forEach(p => p.plusMinus += points);
            defTeam.onCourt.forEach(p => p.plusMinus -= points);

            if (secondaryActor && secondaryActor.playerId !== actor.playerId) {
                const astChance = (playType === 'CatchShoot' || playType === 'PnR_Roll' || playType === 'Cut') ? 0.9 : 0.4;
                if (Math.random() < astChance) secondaryActor.ast++;
            }
            
            const assistText = (secondaryActor && secondaryActor.playerId !== actor.playerId) ? ` (Ast: ${secondaryActor.playerName})` : '';
            let shotDesc = '점프슛';
            if (isThree) shotDesc = '3점슛';
            else if (shotType === 'Dunk') shotDesc = '덩크';
            else if (shotType === 'Layup') shotDesc = '레이업';
            else if (shotType === 'Hook') shotDesc = '훅슛';
            else if (shotType === 'Pullup') shotDesc = '풀업 점퍼';
            else if (shotType === 'CatchShoot') shotDesc = '캐치앤슛';

            state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: attTeam.id, text: `${actor.playerName} ${shotDesc} 성공${assistText}`, type: 'score', points: points as 2|3 });
            state.possession = state.possession === 'home' ? 'away' : 'home';
            state.shotClock = 24;
        } else {
            actor.fga++;
            if (isThree) actor.p3a++;
            let shotDesc = '점프슛';
            if (isThree) shotDesc = '3점슛';
            else if (shotType === 'Dunk') shotDesc = '덩크';
            else if (shotType === 'Layup') shotDesc = '레이업';
            else if (shotType === 'Hook') shotDesc = '훅슛';
            else if (shotType === 'Pullup') shotDesc = '풀업 점퍼';
            else if (shotType === 'CatchShoot') shotDesc = '캐치앤슛';
            state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: attTeam.id, text: `${actor.playerName} ${shotDesc} 실패`, type: 'miss' });

            const rebResult = resolveRebound(state.home, state.away, actor.playerId);
            const rebounder = rebResult.player;
            rebounder.reb++;
            if (rebResult.type === 'off') {
                rebounder.offReb++;
                state.shotClock = 14;
                state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: attTeam.id, text: `${rebounder.playerName} 공격 리바운드!`, type: 'info' });
            } else {
                rebounder.defReb++;
                state.possession = state.possession === 'home' ? 'away' : 'home';
                state.shotClock = 24;
                state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: defTeam.id, text: `${rebounder.playerName} 리바운드`, type: 'info' });
            }
        }

        if (state.gameClock <= 0) {
            state.quarter++;
            state.gameClock = 720;
            state.home.fouls = 0;
            state.away.fouls = 0;
            state.home.timeouts = Math.max(2, state.home.timeouts);
            state.away.timeouts = Math.max(2, state.away.timeouts);
            state.logs.push({ quarter: state.quarter - 1, timeRemaining: '0:00', teamId: 'system', text: `${state.quarter - 1}쿼터 종료 [ ${state.home.score} : ${state.away.score} ]`, type: 'info' });
            if (state.quarter > 4 && state.home.score !== state.away.score) break;
            if (state.quarter > 4) {
                 state.gameClock = 300;
                 state.logs.push({ quarter: state.quarter, timeRemaining: '5:00', teamId: 'system', text: `--- 연장전 시작 ---`, type: 'info' });
            }
        }
    }

    const finalTotalSec = ((state.quarter - 1) * 720) + (720 - state.gameClock);
    const closeFinalSegments = (team: TeamState) => {
        team.onCourt.forEach(p => {
            const hist = state.rotationHistory[p.playerId];
            if (hist && hist.length > 0) hist[hist.length - 1].out = finalTotalSec;
        });
    };
    closeFinalSegments(state.home);
    closeFinalSegments(state.away);

    const rosterUpdates: Record<string, any> = {};
    const collectUpdates = (team: TeamState) => {
        [...team.onCourt, ...team.bench].forEach(p => {
             if (p.currentCondition !== p.startCondition || p.health !== 'Healthy') {
                 rosterUpdates[p.playerId] = { condition: p.currentCondition, health: p.health, injuryType: p.injuryType, returnDate: p.returnDate };
             }
        });
    };
    collectUpdates(state.home);
    collectUpdates(state.away);

    const mapBox = (teamState: TeamState): PlayerBoxScore[] => {
        return [...teamState.onCourt, ...teamState.bench].map(p => ({
            playerId: p.playerId, playerName: p.playerName, pts: p.pts, reb: p.reb, offReb: p.offReb, defReb: p.defReb, ast: p.ast, stl: p.stl, blk: p.blk, tov: p.tov, fgm: p.fgm, fga: p.fga, p3m: p.p3m, p3a: p.p3a, ftm: p.ftm, fta: p.fta, rimM: p.rimM, rimA: p.rimA, midM: p.midM, midA: p.midA, mp: p.mp, g: 1, gs: p.gs, pf: p.pf, plusMinus: p.plusMinus, condition: p.currentCondition, isStopper: p.isStopper,
            zoneData: {
                zone_rim_m: p.zone_rim_m, zone_rim_a: p.zone_rim_a, zone_paint_m: p.zone_paint_m, zone_paint_a: p.zone_paint_a, zone_mid_l_m: p.zone_mid_l_m, zone_mid_l_a: p.zone_mid_l_a, zone_mid_c_m: p.zone_mid_c_m, zone_mid_c_a: p.zone_mid_c_a, zone_mid_r_m: p.zone_mid_r_m, zone_mid_r_a: p.zone_mid_r_a, zone_c3_l_m: p.zone_c3_l_m, zone_c3_l_a: p.zone_c3_l_a, zone_c3_r_m: p.zone_c3_r_m, zone_c3_r_a: p.zone_c3_r_a, zone_atb3_l_m: p.zone_atb3_l_m, zone_atb3_l_a: p.zone_atb3_l_a, zone_atb3_c_m: p.zone_atb3_c_m, zone_atb3_c_a: p.zone_atb3_c_a, zone_atb3_r_m: p.zone_atb3_r_m, zone_atb3_r_a: p.zone_atb3_r_a,
            }
        }));
    };

    return { homeScore: state.home.score, awayScore: state.away.score, homeBox: mapBox(state.home), awayBox: mapBox(state.away), homeTactics: state.home.tactics, awayTactics: state.away.tactics, rosterUpdates: rosterUpdates, pbpLogs: state.logs, rotationData: state.rotationHistory };
}
