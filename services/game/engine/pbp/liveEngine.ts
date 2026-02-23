
import { Team, GameTactics, DepthChart, SimulationResult, PbpLog, RosterUpdate } from '../../../../types';
import { GameState, TeamState, LivePlayer, MomentumState } from './pbpTypes';
import { initTeamState } from './initializer';
import { updateOnCourtStates } from './stateUpdater';
import { simulatePossession } from './possessionHandler';
import { checkSubstitutions } from './substitutionSystem';
import { checkAndApplyRotation, forceSubstitution, transferSchedule } from './rotationLogic';
import { formatTime, calculatePossessionTime } from './timeEngine';
import { applyPossessionResult } from './statsMappers';

// ─────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────

export interface StepResult {
    result: ReturnType<typeof simulatePossession> | null; // null for quarter transitions / game end
    isQuarterEnd: boolean;  // gameClock가 0에 도달한 직후 (훅이 쿼터 휴식 위해 pause)
    isGameEnd: boolean;     // quarter > 4
    newLogs: PbpLog[];      // 이번 step에서 생성된 로그들
}

// ─────────────────────────────────────────────────────────────
// Momentum Helpers (내부 + liveEngine 외부 호출용 export)
// ─────────────────────────────────────────────────────────────

/**
 * 득점 후 에포크 포인트 누적 및 activeRun 판정.
 * 에포크 방향 역전 시 자동 리셋.
 */
export function updateMomentum(
    state: GameState,
    scoringTeamId: string,
    points: number,
    currentTotalSec: number
): void {
    const m = state.momentum;

    if (scoringTeamId === state.home.id) {
        m.homeEpochPts += points;
    } else {
        m.awayEpochPts += points;
    }

    const diff = m.homeEpochPts - m.awayEpochPts;

    // 에포크 방향 역전 (상대가 현재 에포크 리드) 또는 동점 → 리셋
    const homeIsRunning = m.activeRun?.teamId === state.home.id;
    const awayIsRunning = m.activeRun?.teamId === state.away.id;
    if ((homeIsRunning && diff < 0) || (awayIsRunning && diff > 0) || diff === 0) {
        m.homeEpochPts = 0;
        m.awayEpochPts = 0;
        m.epochStartTotalSec = currentTotalSec;
        m.activeRun = null;
        return;
    }

    // 새 런 선언 (처음 ±8 도달 시)
    if (!m.activeRun) {
        if (diff >= 8)  m.activeRun = { teamId: state.home.id, startTotalSec: currentTotalSec };
        if (diff <= -8) m.activeRun = { teamId: state.away.id, startTotalSec: currentTotalSec };
    }
}

/**
 * 모멘텀 완전 초기화 (타임아웃/쿼터 경계).
 */
export function resetMomentum(state: GameState, currentTotalSec: number): void {
    state.momentum = {
        homeEpochPts: 0,
        awayEpochPts: 0,
        epochStartTotalSec: currentTotalSec,
        activeRun: null,
    };
}

// ─────────────────────────────────────────────────────────────
// ① GameState 초기화
// ─────────────────────────────────────────────────────────────

export function createGameState(
    homeTeam: Team,
    awayTeam: Team,
    userTeamId: string | null,
    userTactics?: GameTactics,
    isHomeB2B: boolean = false,
    isAwayB2B: boolean = false,
    homeDepthChart?: DepthChart | null,
    awayDepthChart?: DepthChart | null
): GameState {
    const hTactics = (userTeamId === homeTeam.id && userTactics) ? userTactics : undefined;
    const aTactics = (userTeamId === awayTeam.id && userTactics) ? userTactics : undefined;

    const state: GameState = {
        home: initTeamState(homeTeam, hTactics, homeDepthChart),
        away: initTeamState(awayTeam, aTactics, awayDepthChart),
        quarter: 1,
        gameClock: 720,
        shotClock: 24,
        possession: 'home',
        isDeadBall: false,
        logs: [],
        isHomeB2B,
        isAwayB2B,
        rotationHistory: {},
        shotEvents: [],
        injuries: [],
        momentum: {
            homeEpochPts: 0,
            awayEpochPts: 0,
            epochStartTotalSec: 0,
            activeRun: null,
        },
    };

    // 선발 선수 rotation history 초기화
    [state.home, state.away].forEach(team => {
        team.onCourt.forEach(p => {
            if (!state.rotationHistory[p.playerId]) {
                state.rotationHistory[p.playerId] = [];
            }
            state.rotationHistory[p.playerId].push({ in: 0, out: 0 });
        });
    });

    // Q1 시작 로그
    state.logs.push({
        quarter: 1,
        timeRemaining: '12:00',
        teamId: 'SYSTEM',
        text: '경기 시작 (Tip-off)',
        type: 'info',
    });

    return state;
}

// ─────────────────────────────────────────────────────────────
// ② 포세션 1회 처리 (쿼터 경계 포함)
// ─────────────────────────────────────────────────────────────

export function stepPossession(state: GameState): StepResult {
    // ── A. 쿼터 전환 처리 (이전 스텝에서 gameClock가 0이 됐을 때 진입) ──
    // resume 후 첫 call: 새 쿼터 셋업만 하고 B로 fall-through → 첫 포세션까지 한 번에 실행
    // (hook이 isQuarterEnd를 감지해 pause → resume → 이 경로 진입 순서)
    if (state.gameClock <= 0) {
        state.quarter++;

        // 게임 종료
        if (state.quarter > 4) {
            return _handleGameEnd(state);
        }

        // 새 쿼터 셋업 (fall-through: 아래 B에서 첫 포세션 실행)
        state.gameClock = 720;
        state.shotClock = 24;
        state.home.fouls = 0;
        state.away.fouls = 0;

        const transitionTotalSec = (state.quarter - 1) * 720;
        resetMomentum(state, transitionTotalSec);

        state.logs.push({
            quarter: state.quarter,
            timeRemaining: '12:00',
            teamId: 'SYSTEM',
            text: state.quarter === 3 ? '하프타임 종료 — 3쿼터 시작' : `${state.quarter}쿼터 시작`,
            type: 'info',
        });
        // return하지 않고 B로 진행 → 새 쿼터의 첫 포세션을 이 step에서 실행
    }

    // ── B. 정상 포세션 실행 ──
    const offTeam = state.possession === 'home' ? state.home : state.away;
    const logsBefore = state.logs.length;

    const result = simulatePossession(state);
    const timeTaken = calculatePossessionTime(state, offTeam.tactics.sliders, result.playType);

    // 득점 추적 (momentum 업데이트용 — FT 포함)
    const scoreBefore = { home: state.home.score, away: state.away.score };

    applyPossessionResult(state, result);

    // 득점 후 momentum 업데이트
    const currentTotalSecAfter = ((state.quarter - 1) * 720) + (720 - Math.max(0, state.gameClock - timeTaken));
    const homeScored = state.home.score - scoreBefore.home;
    const awayScored = state.away.score - scoreBefore.away;
    if (homeScored > 0) updateMomentum(state, state.home.id, homeScored, currentTotalSecAfter);
    if (awayScored > 0) updateMomentum(state, state.away.id, awayScored, currentTotalSecAfter);

    state.gameClock = Math.max(0, state.gameClock - timeTaken);
    updateOnCourtStates(state, timeTaken);

    const currentTotalSec = ((state.quarter - 1) * 720) + (720 - state.gameClock);

    checkAndApplyRotation(state, state.home, currentTotalSec);
    checkAndApplyRotation(state, state.away, currentTotalSec);

    const hSubs = checkSubstitutions(state, state.home);
    const aSubs = checkSubstitutions(state, state.away);
    hSubs.forEach(req => forceSubstitution(state, state.home, req.outPlayer, req.reason));
    aSubs.forEach(req => forceSubstitution(state, state.away, req.outPlayer, req.reason));

    // 포세션 전환
    let isOffReb = false;
    if (result.type === 'miss' && result.rebounder) {
        if (offTeam.onCourt.some(p => p.playerId === result.rebounder!.playerId)) {
            isOffReb = true;
        }
    }
    if (isOffReb) {
        state.shotClock = 14;
    } else {
        state.possession = state.possession === 'home' ? 'away' : 'home';
        state.shotClock = 24;
    }

    const newLogs = state.logs.slice(logsBefore);

    // 각 로그에 현재 스코어 스냅샷 기록 (포세션 결과 적용 후)
    { const sh = state.home.score, sa = state.away.score;
      newLogs.forEach(log => { log.homeScore = sh; log.awayScore = sa; }); }

    if (state.gameClock <= 0) {
        // Q4 종료 = 즉시 게임 종료 (30초 타이머 없음)
        if (state.quarter >= 4) {
            state.quarter = 5;
            const gameEndResult = _handleGameEnd(state);
            return {
                result: gameEndResult.result,
                isQuarterEnd: false,
                isGameEnd: true,
                newLogs: [...newLogs, ...gameEndResult.newLogs],
            };
        }
        return { result, isQuarterEnd: true, isGameEnd: false, newLogs };
    }

    return { result, isQuarterEnd: false, isGameEnd: false, newLogs };
}

// ─────────────────────────────────────────────────────────────
// 게임 종료 처리 (버저비터 포함)
// ─────────────────────────────────────────────────────────────

function _handleGameEnd(state: GameState): StepResult {
    const logsBefore = state.logs.length;

    // 동점 → 버저비터 포세션
    if (state.home.score === state.away.score) {
        // 50/50으로 공격팀 결정
        const buzzIsHome = Math.random() < 0.5;
        const savedPossession = state.possession;
        state.possession = buzzIsHome ? 'home' : 'away';

        // hitRate 하한선 0.75로 버저비터 시도
        const buzzResult = simulatePossession(state, { minHitRate: 0.75 });

        if (buzzResult.type === 'score') {
            // 자연스러운 버저비터 — PBP 로그 포함
            applyPossessionResult(state, buzzResult);
        } else {
            // 미스(~25%) → silent +1pt (로그 없음, 우연처럼 보임)
            const buzzTeam = buzzIsHome ? state.home : state.away;
            buzzTeam.score += 1;
        }

        state.possession = savedPossession;
    }

    // Rotation History 닫기
    const GAME_END_SEC = 48 * 60;
    [state.home, state.away].forEach(team => {
        team.onCourt.forEach(p => {
            const hist = state.rotationHistory[p.playerId];
            if (hist && hist.length > 0) hist[hist.length - 1].out = GAME_END_SEC;
        });
    });

    const newLogs = state.logs.slice(logsBefore);
    { const sh = state.home.score, sa = state.away.score;
      newLogs.forEach(log => { log.homeScore = sh; log.awayScore = sa; }); }
    return { result: null, isQuarterEnd: false, isGameEnd: true, newLogs };
}

// ─────────────────────────────────────────────────────────────
// ③ 최종 결과 추출
// ─────────────────────────────────────────────────────────────

export function extractSimResult(state: GameState): SimulationResult {
    const mapToBox = (teamState: TeamState) => {
        return [...teamState.onCourt, ...teamState.bench].map(p => {
            let avgEffect = 0;
            if (p.matchupEffectCount > 0) {
                avgEffect = Math.round(p.matchupEffectSum / p.matchupEffectCount);
            }
            return {
                playerId: p.playerId,
                playerName: p.playerName,
                pts: p.pts, reb: p.reb, offReb: p.offReb, defReb: p.defReb,
                ast: p.ast, stl: p.stl, blk: p.blk, tov: p.tov,
                fgm: p.fgm, fga: p.fga, p3m: p.p3m, p3a: p.p3a, ftm: p.ftm, fta: p.fta,
                rimM: p.rimM, rimA: p.rimA, midM: p.midM, midA: p.midA,
                mp: parseFloat(p.mp.toFixed(1)),
                g: p.mp > 0 ? 1 : 0,
                gs: p.gs,
                pf: p.pf,
                plusMinus: p.plusMinus,
                condition: parseFloat(p.currentCondition.toFixed(1)),
                isStopper: teamState.tactics.stopperId === p.playerId,
                isAceTarget: p.matchupEffectCount > 0,
                matchupEffect: avgEffect,
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
                },
            };
        });
    };

    const mapTactics = (t: GameTactics) => ({
        stopperId: t.stopperId,
        pace: t.sliders.pace,
        sliders: t.sliders,
    });

    const rosterUpdates: Record<string, RosterUpdate> = {};
    [state.home, state.away].forEach(team => {
        [...team.onCourt, ...team.bench].forEach((p: LivePlayer) => {
            rosterUpdates[p.playerId] = {
                condition: parseFloat(p.currentCondition.toFixed(1)),
            };
            if (p.health !== 'Healthy') {
                rosterUpdates[p.playerId].health = p.health;
                rosterUpdates[p.playerId].injuryType = p.injuryType;
                rosterUpdates[p.playerId].returnDate = p.returnDate;
            }
        });
    });

    return {
        homeScore: state.home.score,
        awayScore: state.away.score,
        homeBox: mapToBox(state.home),
        awayBox: mapToBox(state.away),
        homeTactics: mapTactics(state.home.tactics),
        awayTactics: mapTactics(state.away.tactics),
        rosterUpdates,
        pbpLogs: state.logs,
        rotationData: state.rotationHistory,
        pbpShotEvents: state.shotEvents,
        injuries: state.injuries,
    };
}

// ─────────────────────────────────────────────────────────────
// 수동 교체 (useLiveGame hook 전용)
// ─────────────────────────────────────────────────────────────

/**
 * 유저가 직접 선수를 교체할 때 호출.
 * rotationMap을 수정하고 물리적으로 onCourt ↔ bench 스왑.
 */
export function applyManualSubstitution(
    state: GameState,
    userTeamId: string,
    outId: string,
    inId: string
): void {
    const userTeam = state.home.id === userTeamId ? state.home : state.away;

    const outPlayer = userTeam.onCourt.find(p => p.playerId === outId);
    const inPlayer  = userTeam.bench.find(p => p.playerId === inId);
    if (!outPlayer || !inPlayer) return;

    const currentTotalSec = ((state.quarter - 1) * 720) + (720 - state.gameClock);
    const currentMinute   = Math.min(47, Math.floor(currentTotalSec / 60));
    const quarterEndMin   = state.quarter * 12; // Q1→12, Q2→24, Q3→36, Q4→48

    if (!userTeam.tactics.rotationMap) userTeam.tactics.rotationMap = {};

    // 1. outPlayer 잔여 슬롯 → inPlayer에 이전
    transferSchedule(userTeam, outId, inId, currentMinute);

    // 2. inPlayer 현재~쿼터끝 강제 true
    if (!userTeam.tactics.rotationMap[inId])
        userTeam.tactics.rotationMap[inId] = Array(48).fill(false);
    for (let m = currentMinute; m < quarterEndMin; m++)
        userTeam.tactics.rotationMap[inId][m] = true;

    // 3. outPlayer 현재~쿼터끝 false
    if (!userTeam.tactics.rotationMap[outId])
        userTeam.tactics.rotationMap[outId] = Array(48).fill(false);
    for (let m = currentMinute; m < quarterEndMin; m++)
        userTeam.tactics.rotationMap[outId][m] = false;

    // 4. 물리적 스왑
    const outIdx = userTeam.onCourt.indexOf(outPlayer);
    const inIdx  = userTeam.bench.indexOf(inPlayer);

    if (outIdx > -1 && inIdx > -1) {
        userTeam.onCourt.splice(outIdx, 1);
        userTeam.bench.push(outPlayer);

        userTeam.bench.splice(inIdx, 1);
        userTeam.onCourt.push(inPlayer);

        // rotation history 기록
        const histOut = state.rotationHistory[outPlayer.playerId];
        if (histOut && histOut.length > 0) histOut[histOut.length - 1].out = currentTotalSec;

        if (!state.rotationHistory[inPlayer.playerId]) state.rotationHistory[inPlayer.playerId] = [];
        state.rotationHistory[inPlayer.playerId].push({ in: currentTotalSec, out: currentTotalSec });

        state.logs.push({
            quarter: state.quarter,
            timeRemaining: formatTime(state.gameClock),
            teamId: userTeam.id,
            text: `교체: IN [${inPlayer.playerName}] OUT [${outPlayer.playerName}]`,
            type: 'info',
        });
    }
}
