
import { Team, GameTactics, DepthChart, SimulationResult, PlayerBoxScore, TacticalSnapshot, RosterUpdate, PbpLog, RotationData } from '../../../../types';
import { GameState, TeamState, LivePlayer } from './pbpTypes';
import { initTeamState } from './initializer';
import { calculatePossessionTime, formatTime } from './timeEngine';
import { resolvePlayAction } from './playTypes';
import { calculateHitRate, flattenPlayer } from './flowEngine';
import { calculateIncrementalFatigue, recoverBenchPlayers } from '../fatigueSystem';
import { checkAndApplyRotation, forceSubstitution } from './rotationLogic';
import { calculateFoulStats } from '../foulSystem';
import { resolveRebound } from './reboundLogic';
import { OFFENSE_STRATEGY_CONFIG } from './strategyMap';

/**
 * [Fix] Full Implementation of runFullGameSimulation
 */
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
        home: initTeamState(homeTeam, homeTeam.id === userTeamId ? userTactics : undefined, homeDepthChart),
        away: initTeamState(awayTeam, awayTeam.id === userTeamId ? userTactics : undefined, awayDepthChart),
        quarter: 1,
        gameClock: 720,
        shotClock: 24,
        possession: Math.random() > 0.5 ? 'home' : 'away',
        isDeadBall: true,
        logs: [],
        isHomeB2B,
        isAwayB2B,
        rotationHistory: {}
    };

    // Initialize rotation history for all players
    [...state.home.onCourt, ...state.home.bench, ...state.away.onCourt, ...state.away.bench].forEach(p => {
        state.rotationHistory[p.playerId] = [];
    });
    // Record initial entry for starters
    state.home.onCourt.forEach(p => state.rotationHistory[p.playerId].push({ in: 0, out: 0 }));
    state.away.onCourt.forEach(p => state.rotationHistory[p.playerId].push({ in: 0, out: 0 }));

    // 2. Main Game Loop (4 Quarters)
    for (let q = 1; q <= 4; q++) {
        state.quarter = q;
        state.gameClock = 720;
        state.home.fouls = 0;
        state.away.fouls = 0;
        
        state.logs.push({ quarter: q, timeRemaining: "12:00", teamId: 'system', text: `--- ${q}쿼터 시작 ---`, type: 'info' });

        while (state.gameClock > 0) {
            const attTeam = state.possession === 'home' ? state.home : state.away;
            const defTeam = state.possession === 'home' ? state.away : state.home;

            // Check Rotation and apply substitutions from the chart
            const currentTotalSec = ((q - 1) * 720) + (720 - state.gameClock);
            checkAndApplyRotation(state, state.home, currentTotalSec);
            checkAndApplyRotation(state, state.away, currentTotalSec);

            // Calculate how much time this possession takes
            const timeTaken = calculatePossessionTime(state, attTeam.tactics.sliders, attTeam.tactics.offenseTactics[0]);
            state.gameClock -= timeTaken;
            if (state.gameClock < 0) state.gameClock = 0;

            // Update Fatigue, MP and check for injuries
            [state.home, state.away].forEach(team => {
                const isB2B = team.id === homeTeam.id ? isHomeB2B : isAwayB2B;
                team.onCourt.forEach(p => {
                    p.mp += timeTaken / 60;
                    const isStopper = team.tactics.defenseTactics.includes('AceStopper') && team.tactics.stopperId === p.playerId;
                    const fatigue = calculateIncrementalFatigue(p, timeTaken, team.tactics.sliders, isB2B, isStopper, team.tactics.offenseTactics[0], team.tactics.defenseTactics[0]);
                    p.currentCondition -= fatigue.drain;
                    if (fatigue.injuryOccurred) {
                        p.health = fatigue.injuryDetails.health;
                        p.injuryType = fatigue.injuryDetails.type;
                        state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: team.id, text: `🚨 부상 발생: ${p.playerName} (${p.injuryType})`, type: 'info' });
                        forceSubstitution(state, team, p, '부상');
                    }
                });
                recoverBenchPlayers(team.bench, timeTaken);
            });

            // Decide Play Type based on strategy
            const offTactic = attTeam.tactics.offenseTactics[0] || 'Balance';
            const strategy = OFFENSE_STRATEGY_CONFIG[offTactic];
            const dice = Math.random();
            let playType: any = 'Iso';
            let cumulative = 0;
            if (strategy && strategy.playDistribution) {
                for (const [pt, prob] of Object.entries(strategy.playDistribution)) {
                    cumulative += prob as number;
                    if (dice < cumulative) {
                        playType = pt;
                        break;
                    }
                }
            }

            // Setup Play Context
            const playContext = resolvePlayAction(attTeam, playType);
            const actor = playContext.actor;
            const onBallDefender = defTeam.onCourt[Math.floor(Math.random() * 5)]; 

            // Turnover Check
            const tovProb = 0.12 + (attTeam.tactics.sliders.pace - 5) * 0.01;
            if (Math.random() < tovProb) {
                actor.tov++;
                state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: attTeam.id, text: `${actor.playerName} 실책`, type: 'turnover' });
                state.possession = state.possession === 'home' ? 'away' : 'home';
                continue;
            }

            // Foul Check
            const foulData = calculateFoulStats(flattenPlayer(onBallDefender), 36, defTeam.tactics, attTeam.tactics, defTeam.tactics.sliders, flattenPlayer(actor));
            let foulProb = (foulData.foulScore / 22.5);
            if (playContext.preferredZone === 'Rim') foulProb *= 1.35;
            else if (playContext.preferredZone === 'Paint') foulProb *= 1.20;
            else if (playContext.preferredZone === '3PT') foulProb *= 1.05;

            if (actor.attr.drFoul >= 85) foulProb *= (1.0 + (actor.attr.drFoul - 85) * 0.02);
            if (defTeam.tactics.sliders.defIntensity > 7) foulProb *= 1.15;
            
            if (Math.random() < foulProb) {
                let actualFouler = onBallDefender;
                if (Math.random() < 0.20) actualFouler = defTeam.onCourt[Math.floor(Math.random() * 5)];
                actualFouler.pf++;
                defTeam.fouls++;
                const isBonus = defTeam.fouls >= 5;
                const shootingFoulBase = playContext.preferredZone === 'Rim' ? 0.75 : 0.25;
                const isShootingFoul = Math.random() < shootingFoulBase;
                
                if (isShootingFoul || isBonus) {
                    const ftCount = playContext.preferredZone === '3PT' && isShootingFoul ? 3 : 2;
                    let ftMade = 0;
                    for (let i=0; i<ftCount; i++) {
                        actor.fta++;
                        if (Math.random() < (actor.attr.ft / 100)) {
                            actor.ftm++; actor.pts++; attTeam.score++; ftMade++;
                        }
                    }
                    state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: attTeam.id, text: `${actualFouler.playerName} 파울 (자유투 ${ftMade}/${ftCount}) - ${actor.playerName}`, type: 'freethrow' });
                    if (ftMade > 0) {
                         attTeam.onCourt.forEach(p => p.plusMinus += ftMade);
                         defTeam.onCourt.forEach(p => p.plusMinus -= ftMade);
                    }
                } else {
                    state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: defTeam.id, text: `${actualFouler.playerName} 개인 반칙 (사이드라인 아웃)`, type: 'foul' });
                }
                if (actualFouler.pf >= 6) {
                    state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: defTeam.id, text: `🚨 ${actualFouler.playerName} 6반칙 퇴장!`, type: 'info' });
                    forceSubstitution(state, defTeam, actualFouler, '6반칙 퇴장');
                }
                state.possession = state.possession === 'home' ? 'away' : 'home';
                continue;
            }

            // Shot Resolution
            const hitRate = calculateHitRate(actor, onBallDefender, defTeam, playType, playContext.preferredZone, attTeam.tactics.sliders.pace, playContext.bonusHitRate, 1.0, 1.0);
            actor.fga++;
            if (playContext.preferredZone === '3PT') actor.p3a++;

            if (Math.random() < hitRate) {
                // Success
                const pts = playContext.preferredZone === '3PT' ? 3 : 2;
                actor.pts += pts;
                actor.fgm++;
                if (pts === 3) actor.p3m++;
                attTeam.score += pts;
                
                attTeam.onCourt.forEach(p => p.plusMinus += pts);
                defTeam.onCourt.forEach(p => p.plusMinus -= pts);

                state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: attTeam.id, text: `${actor.playerName} ${pts}점슛 성공`, type: 'score' });
                state.possession = state.possession === 'home' ? 'away' : 'home';
            } else {
                // Miss & Rebound
                state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: attTeam.id, text: `${actor.playerName} ${playContext.preferredZone === '3PT' ? '3점' : '2점'}슛 실패`, type: 'miss' });
                const rebResult = resolveRebound(state.home, state.away, actor.playerId);
                const rebPlayer = rebResult.player;
                if (rebResult.type === 'off') {
                    rebPlayer.offReb++; rebPlayer.reb++;
                    state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: rebPlayer.playerId === state.home.onCourt.some(p => p.playerId === rebPlayer.playerId) ? state.home.id : state.away.id, text: `${rebPlayer.playerName} 공격 리바운드`, type: 'info' });
                } else {
                    rebPlayer.defReb++; rebPlayer.reb++;
                    state.logs.push({ quarter: state.quarter, timeRemaining: formatTime(state.gameClock), teamId: rebPlayer.playerId === state.home.onCourt.some(p => p.playerId === rebPlayer.playerId) ? state.home.id : state.away.id, text: `${rebPlayer.playerName} 수비 리바운드`, type: 'info' });
                    state.possession = state.possession === 'home' ? 'away' : 'home';
                }
            }
        }
        state.logs.push({ quarter: q, timeRemaining: "0:00", teamId: 'system', text: `--- ${q}쿼터 종료 ---`, type: 'info' });
    }

    // Wrap up Minutes Played
    const finalTotalSec = 4 * 720;
    [state.home, state.away].forEach(team => {
        team.onCourt.forEach(p => {
            const hist = state.rotationHistory[p.playerId];
            if (hist && hist.length > 0) hist[hist.length - 1].out = finalTotalSec;
        });
    });

    // Construct Simulation Result
    const mapToBox = (lp: LivePlayer): PlayerBoxScore => ({
        playerId: lp.playerId,
        playerName: lp.playerName,
        pts: lp.pts,
        reb: lp.reb,
        offReb: lp.offReb,
        defReb: lp.defReb,
        ast: lp.ast,
        stl: lp.stl,
        blk: lp.blk,
        tov: lp.tov,
        fgm: lp.fgm,
        fga: lp.fga,
        p3m: lp.p3m,
        p3a: lp.p3a,
        ftm: lp.ftm,
        fta: lp.fta,
        rimM: lp.rimM,
        rimA: lp.rimA,
        midM: lp.midM,
        midA: lp.midA,
        mp: lp.mp,
        g: 1,
        gs: lp.gs,
        pf: lp.pf,
        plusMinus: lp.plusMinus,
        condition: lp.currentCondition
    });

    const rosterUpdates: Record<string, RosterUpdate> = {};
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
        homeBox: [...state.home.onCourt, ...state.home.bench].map(mapToBox),
        awayBox: [...state.away.onCourt, ...state.away.bench].map(mapToBox),
        homeTactics: { offense: state.home.tactics.offenseTactics[0], defense: state.home.tactics.defenseTactics[0], pace: state.home.tactics.sliders.pace, sliders: state.home.tactics.sliders },
        awayTactics: { offense: state.away.tactics.offenseTactics[0], defense: state.away.tactics.defenseTactics[0], pace: state.away.tactics.sliders.pace, sliders: state.away.tactics.sliders },
        rosterUpdates,
        pbpLogs: state.logs,
        rotationData: state.rotationHistory
    };
}
