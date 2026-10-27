
import { Team, GameTactics, DepthChart, SimulationResult, PbpLog, RosterUpdate, BoxDelta, BoxTick } from '../../types.ts';
import { LeagueCoachingData } from '../../types/coaching.ts';
import { SimSettings, DEFAULT_SIM_SETTINGS } from '../../types/simSettings.ts';
import { GameState, TeamState, LivePlayer, ClutchContext, PossessionResult, isOut } from './pbpTypes.ts';
import { initTeamState } from './initializer.ts';
import { updateOnCourtStates } from './stateUpdater.ts';
import { simulatePossession } from './possessionHandler.ts';
import { checkSubstitutionsV2, SubRequestV2 } from './substitutionSystem.ts';
import { checkAndApplyRotation, prepareOvertimeRotation, forceSubstitution, transferSchedule, checkTemporaryReturns, benchWithOverride, handleFillerExit, executeGarbageSubstitution, updateGarbageTime } from './rotationLogic.ts';
import { assignCourtSlots, snapshotSlots } from './slotAssignment.ts';
import { formatTime, calculatePossessionTime } from './timeEngine.ts';
import { applyPossessionResult, dampenHotCold, resetHotCold } from './statsMappers.ts';
import { calculateRecovery } from '../fatigueSystem.ts';
import { SIM_CONFIG } from '../../game/config/constants.ts';
import { computeCourtPositions } from './handlers/courtPositions.ts';
import { startTimeoutPeriod, recordTimeoutTaken, decideTimeout } from './timeoutPolicy.ts';
import { applyTacticSchedule } from './tacticSchedule.ts';
import { elapsedGameSec, scheduleMinute, periodLengthSec, periodStartSec, isOvertimePeriod, teamFoulLimit, overtimeEnabled, shouldPlayOvertime, isDecisivePossession, resolveJumpBall, REGULATION_PERIODS, periodLabel } from './periodRules.ts';
import { updatePlusMinus } from './handlers/statUtils.ts';

// ─────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────

export interface StepResult {
    result: ReturnType<typeof simulatePossession> | null; // null for quarter transitions / game end
    isQuarterEnd: boolean;  // gameClock가 0에 도달한 직후 (훅이 쿼터 휴식 위해 pause)
    isGameEnd: boolean;     // quarter > 4
    isTimeout: boolean;     // AI 타임아웃 발동 (UI는 일시정지)
    timeoutTeamId?: string; // 타임아웃 선언 팀 ID
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

// ─────────────────────────────────────────────────────────────
// 박스스코어 점진 공개 — 포세션 단위 델타 타임라인
// ─────────────────────────────────────────────────────────────

const BOX_DELTA_KEYS: (keyof BoxDelta)[] = ['pts', 'reb', 'offReb', 'ast', 'stl', 'blk', 'tov', 'pf', 'fgm', 'fga', 'p3m', 'p3a', 'ftm', 'fta'];

function snapshotBoxStats(p: LivePlayer): BoxDelta {
    return {
        pts: p.pts, reb: p.reb, offReb: p.offReb, ast: p.ast, stl: p.stl,
        blk: p.blk, tov: p.tov, pf: p.pf,
        fgm: p.fgm, fga: p.fga, p3m: p.p3m, p3a: p.p3a,
        ftm: p.ftm, fta: p.fta,
    };
}

function diffBoxStats(cur: BoxDelta, prev: BoxDelta | undefined): BoxDelta | null {
    const out: BoxDelta = {};
    let changed = false;
    for (const key of BOX_DELTA_KEYS) {
        const c = cur[key] ?? 0;
        const p = prev?.[key] ?? 0;
        if (c !== p) { out[key] = c - p; changed = true; }
    }
    return changed ? out : null;
}

/**
 * 포세션 1회 종료 시점의 박스스코어 변화분을 타임라인에 기록.
 * prevBoxSnap과의 diff이므로 and-1/보너스FT/테크니컬 등 모든 코드 경로의 누적을 자동 포착.
 */
const CONDITION_TICK_STEP = 5;

function recordBoxTick(state: GameState, currentTotalSec: number, timeTaken: number, result: PossessionResult): void {
    const onIds = [...state.home.onCourt, ...state.away.onCourt].map(p => p.playerId);
    const allPlayers = [
        ...state.home.onCourt, ...state.home.bench,
        ...state.away.onCourt, ...state.away.bench,
    ];

    const d: Record<string, BoxDelta> = {};
    // [2026-10-17] 체력 변화 — 라이브 중계 체력 배지용. 5 단위로 양자화(배지는 단계·불투명도만 표시, 단계 경계 60/80이 5의 배수)해
    // 첫 틱엔 전원, 이후 값이 바뀐 선수만 기록한다. 정수 단위 대비 box_timeline 증가분 약 1/4.5(경기당 +19KB 수준).
    const prevCond = (state.prevCondSnap ??= {});
    const c: Record<string, number> = {};
    for (const p of allPlayers) {
        const cur = snapshotBoxStats(p);
        const delta = diffBoxStats(cur, state.prevBoxSnap[p.playerId]);
        if (delta) d[p.playerId] = delta;
        state.prevBoxSnap[p.playerId] = cur;
        const cond = Math.round(p.currentCondition / CONDITION_TICK_STEP) * CONDITION_TICK_STEP;
        if (prevCond[p.playerId] !== cond) { c[p.playerId] = cond; prevCond[p.playerId] = cond; }
    }

    // FG 시도 결과 (핫/콜드 스트릭 재구성용) — score/miss일 때만 기록
    let shot: BoxTick['shot'];
    if (result.type === 'score' || result.type === 'miss') {
        shot = { p: result.actor.playerId, m: result.type === 'score' };
    }

    state.boxTimeline.push({ t: currentTotalSec, on: onIds, off: state.possession, mp: timeTaken / 60, d, ...(shot ? { shot } : {}), ...(Object.keys(c).length ? { c } : {}) });
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

/** 양 팀 전 선수 체력 회복 (Stamina + Durability 반영) */
function recoverAllPlayers(state: GameState, baseAmount: number): void {
    for (const team of [state.home, state.away]) {
        for (const p of [...team.onCourt, ...team.bench]) {
            if (p.currentCondition < 100) {
                const recovery = calculateRecovery(p, baseAmount);
                p.currentCondition = Math.min(100, p.currentCondition + recovery);
                if (p.isShutdown && p.currentCondition > 70) {
                    p.isShutdown = false;
                }
            }
        }
    }
}

/**
 * 타임아웃 효과 적용 (모멘텀 리셋 + 핫/콜드 반감 + 타임아웃 차감 + 체력 회복 + 로그)
 * useLiveGame(유저 타임아웃)과 엔진 내부(AI 타임아웃) 모두에서 호출.
 */
export function applyTimeout(
    state: GameState,
    teamId: string,
    isUserCall: boolean = false,
    kind: 'team' | 'mandatory' = 'team',
): void {
    const team = state.home.id === teamId ? state.home : state.away;
    if (team.timeouts <= 0) return;

    team.timeouts -= 1;
    // [2026-10-22] 의무 타임아웃 슬롯/간격 기록 + 4Q 막판 2회 상한 (의무도 7회에서 차감 — 위에서 이미 차감됨)
    recordTimeoutTaken(state, team.id);

    // 모멘텀 초기화
    const currentTotalSec = elapsedGameSec(state);
    resetMomentum(state, currentTotalSec);

    // 핫/콜드 스트릭 반감 (양팀)
    dampenHotCold(state.home);
    dampenHotCold(state.away);

    // 체력 회복 (타임아웃 휴식)
    recoverAllPlayers(state, SIM_CONFIG.FATIGUE.TIMEOUT_RECOVERY);

    // 로그
    const text = kind === 'mandatory'
        ? `의무 타임아웃 (잔여: ${team.timeouts}회)`
        : isUserCall
            ? `⏸ 타임아웃 선언 (잔여: ${team.timeouts}회)`
            : `타임아웃 (잔여: ${team.timeouts}회)`;
    state.logs.push({
        quarter: state.quarter,
        timeRemaining: formatTime(state.gameClock),
        teamId: team.id,
        text,
        type: 'timeout', // [2026-08-02] 전용 타입 부여 (client 미러 참조)
        timeoutsLeft: team.timeouts, // 멀티플레이어 리플레이에서 잔여 타임아웃 표시용
        timeoutKind: kind,
    });
}

/**
 * 상대 8pt+ 런을 맞고 있는 팀 ID (없으면 null).
 * [2026-10-22] 타임아웃 발동 여부는 timeoutPolicy.decideTimeout 이 보유량/의무/전략까지 종합해 결정 —
 * 여기서는 기존 런 판정만 제공. 유저 팀 스킵 판단도 정책 쪽(isAutoTeam)으로 이동.
 */
function detectRunVictimId(state: GameState): string | null {
    const m = state.momentum;
    if (!m.activeRun) return null;

    const runTeamId = m.activeRun.teamId;
    const victimTeam = runTeamId === state.home.id ? state.away : state.home;

    const runEpochPts = runTeamId === state.home.id ? m.homeEpochPts : m.awayEpochPts;
    const victimEpochPts = victimTeam.id === state.home.id ? m.homeEpochPts : m.awayEpochPts;

    return runEpochPts - victimEpochPts >= 8 ? victimTeam.id : null;
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
    awayDepthChart?: DepthChart | null,
    tendencySeed?: string,
    simSettings?: SimSettings,
    coachingData?: LeagueCoachingData | null,
    awayUserTactics?: GameTactics,
    preserveDraftOrder = false,
): GameState {
    const hTactics = awayUserTactics
        ? userTactics
        : (userTeamId === homeTeam.id && userTactics) ? userTactics : undefined;
    const aTactics = awayUserTactics ?? ((userTeamId === awayTeam.id && userTactics) ? userTactics : undefined);

    const state: GameState = {
        home: initTeamState(homeTeam, hTactics, homeDepthChart, tendencySeed, simSettings?.archetypesEnabled, coachingData, simSettings?.leagueContext, preserveDraftOrder),
        away: initTeamState(awayTeam, aTactics, awayDepthChart, tendencySeed, simSettings?.archetypesEnabled, coachingData, simSettings?.leagueContext, preserveDraftOrder),
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
        playTypeStats: {},  // [2026-10-18] 멀티 PPP — statsMappers.recordPlayTypeStat
        injuries: [],
        suspensions: [],
        momentum: {
            homeEpochPts: 0,
            awayEpochPts: 0,
            epochStartTotalSec: 0,
            activeRun: null,
        },
        userTeamId,
        // Server batch sim has no human calling timeouts, so treat both teams as AI-controlled.
        isUserDelegated: simSettings?.autoTimeoutAllTeams ?? false,
        originalRotationMap: {},
        activeOverrides: [],
        possessionTimeAccum: {
            home: { total: 0, count: 0 },
            away: { total: 0, count: 0 },
        },
        courtSnapshot: null,
        simSettings: simSettings ?? DEFAULT_SIM_SETTINGS,
        boxTimeline: [],
        prevBoxSnap: {},
        lastEntryWasDefReb: false,
        lastEntryWasSteal: false,
        timeoutPeriod: { slots: 0, firstTeamId: null, lateCapApplied: false },
        lastTimeoutSec: { home: -9999, away: -9999 },
    };

    // 원본 로테이션 맵 deep copy (경기 중 절대 수정 안함)
    [state.home, state.away].forEach(team => {
        if (team.tactics.rotationMap) {
            Object.entries(team.tactics.rotationMap).forEach(([pid, schedule]) => {
                state.originalRotationMap[pid] = [...schedule];
            });
        }
    });

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
    // [2026-10-26] 팁오프 점프볼 — 연장전 스위치(overtimeEnabled)와 함께 켜진다. 꺼져 있으면 기존대로 홈 공격으로 시작.
    // [2026-10-27] 연장 스위치와 무관하게 항상 실시(사용자 결정) — 꺼진 리그는 홈팀이 늘 선공해 경기당 약 +0.6점을 얻었다.
    applyJumpBall(state);

    return state;
}

/** [2026-10-26] 점프볼(경기 시작·연장 시작) — 센터 신장·점프력으로 공격권 결정 + 로그 (periodRules.resolveJumpBall) */
function applyJumpBall(state: GameState): void {
    const jb = resolveJumpBall(state);
    state.possession = jb.winner;
    const winnerTeam = jb.winner === 'home' ? state.home : state.away;
    const won  = jb.winner === 'home' ? jb.homeJumper : jb.awayJumper;
    const lost = jb.winner === 'home' ? jb.awayJumper : jb.homeJumper;
    // [2026-10-26] 센터 서클 점프볼 — 누가 나섰고 누가 따냈는지, 어느 팀 공격으로 시작하는지
    const homeJ = jb.homeJumper?.playerName, awayJ = jb.awayJumper?.playerName;
    const opening = state.quarter === 1 ? '경기를 시작합니다' : `${periodLabel(state.quarter)}을 시작합니다`;
    state.logs.push({
        quarter: state.quarter,
        timeRemaining: formatTime(state.gameClock),
        teamId: winnerTeam.id,
        text: won && lost
            ? `점프볼 — ${awayJ} vs ${homeJ}. ${won.playerName}, 높이 뛰어올라 공을 쳐냅니다! ${winnerTeam.name}의 공격으로 ${opening}.`
            : `점프볼 — ${winnerTeam.name}의 공격으로 ${opening}.`,
        type: 'info',
    });
}

/**
 * [2026-10-26] 결승 공격 — 득점으로 끝날 때까지 포세션을 다시 굴린다(minHitRate 1.0, 최대 8회). simulatePossession은
 * 샷클락·포세션 시간 미리 뽑기·프레스 플래그만 바꾸고 기록은 applyPossessionResult에서 하므로 샷클락만 되돌린다.
 * 8회 모두 득점이 아니면 null(호출부가 일반 포세션으로 진행 → 그래도 동점이면 _handleGameEnd 폴백).
 */
function simulateDecisivePossession(state: GameState, clutchContext?: ClutchContext): PossessionResult | null {
    const shotClock = state.shotClock;
    for (let i = 0; i < 8; i++) {
        state.shotClock = shotClock;
        const r = simulatePossession(state, { minHitRate: 1.0, clutchContext });
        if (r.type === 'score') return r;
    }
    state.shotClock = shotClock;
    return null;
}

/** [2026-10-26] 4쿼터 이후 리드 변화 추적 — 동점이 되면 지우고, 동점/열세에서 리드를 잡은 득점을 기록(위닝샷 후보). */
function trackGoAhead(state: GameState, result: PossessionResult, before: { home: number; away: number }): void {
    if (state.quarter < REGULATION_PERIODS) return;
    const h = state.home.score, a = state.away.score;
    if (h === a) { state.lastGoAhead = null; return; }
    const side: 'home' | 'away' = h > a ? 'home' : 'away';
    const scored = side === 'home' ? h > before.home : a > before.away;
    const ledBefore = side === 'home' ? before.home > before.away : before.away > before.home;
    if (scored && !ledBefore) {
        state.lastGoAhead = { side, playerName: result.actor.playerName, quarter: state.quarter, gameClock: state.gameClock };
    }
}

/**
 * [2026-10-26] 피리어드가 끝난 포세션(시계 0) 직후 해설.
 * - 0:00 야투 성공 = 버저비터: 1~3쿼터 "N쿼터(전반)를 마칩니다", 마지막 피리어드 동점 → 연장으로 끌고 감, 역전/리드 → 위닝샷
 * - 피리어드 종료 안내: "1쿼터 종료"/"전반 종료"/"3쿼터 종료", 4쿼터·1차 연장 동점 → "N차 연장으로 갑니다".
 *   경기가 그대로 끝나는 마지막 피리어드는 안내 없이 _handleGameEnd의 경기 종료 로그로 마무리.
 */
function pushPeriodEndCommentary(state: GameState, result: PossessionResult, before: { home: number; away: number }): void {
    const q = state.quarter;
    const label = q === 2 ? '전반' : periodLabel(q);
    const homeGain = state.home.score - before.home, awayGain = state.away.score - before.away;
    const scorerSide: 'home' | 'away' | null = result.type === 'score' && (homeGain > 0 || awayGain > 0)
        ? (homeGain > 0 ? 'home' : 'away') : null;
    const tied = state.home.score === state.away.score;
    const finalStretch = q >= REGULATION_PERIODS;
    const goesOvertime = shouldPlayOvertime(state);
    const nextOt = q - REGULATION_PERIODS + 1;   // 다음 연장 차수
    const push = (teamId: string, text: string) => state.logs.push({ quarter: q, timeRemaining: '0:00', teamId, text, type: 'info' });

    if (scorerSide) {
        const team = state[scorerSide];
        const name = result.actor.playerName;
        const scorerLeads = scorerSide === 'home' ? state.home.score > state.away.score : state.away.score > state.home.score;
        const ledBefore = scorerSide === 'home' ? before.home > before.away : before.away > before.home;
        if (!finalStretch) {
            // 1~3쿼터는 마지막 공격이 남은 시간을 다 쓰는 구조라 0:00 득점이 흔하다(쿼터의 ~37%) — 3점만 버저비터로 부른다
            if (result.zone === '3PT') push(team.id, `버저비터! ${name}, 종료 버저와 함께 3점슛을 꽂으며 ${label}${q === 2 ? '을' : '를'} 마칩니다.`);
        } else if (tied) {
            push(team.id, goesOvertime
                ? `버저비터! ${name}, 종료 버저와 함께 동점을 만들어 경기를 ${nextOt}차 연장으로 끌고 갑니다!`
                : `버저비터! ${name}, 종료 버저와 함께 동점을 만듭니다!`);
        } else if (scorerLeads && !ledBefore) {
            push(team.id, `버저비터 위닝샷! ${name}, 종료 버저와 함께 승부를 결정짓습니다!`);
            if (state.lastGoAhead) state.lastGoAhead.buzzer = true;
        }
    }

    if (!finalStretch) {
        push('SYSTEM', `${label} 종료`);
    } else if (goesOvertime) {
        push('SYSTEM', `${periodLabel(q)} 종료 — 동점! ${nextOt}차 연장으로 갑니다.`);
    } else if (tied) {
        push('SYSTEM', `${periodLabel(q)} 종료 — 동점!`);
    }
}

/** [2026-10-26] 경기 종료 직전 — 마지막 피리어드에서 24초 이내에 잡은 리드를 끝까지 지켰으면 위닝샷 해설 */
function pushWinningShotCommentary(state: GameState): void {
    const g = state.lastGoAhead;
    if (!g || g.buzzer) return;
    const winner: 'home' | 'away' | null = state.home.score > state.away.score ? 'home' : state.away.score > state.home.score ? 'away' : null;
    const lastPeriod = overtimeEnabled(state) ? state.quarter : REGULATION_PERIODS;
    if (winner !== g.side || g.quarter !== lastPeriod || g.gameClock > 24) return;
    state.logs.push({
        quarter: state.quarter,
        timeRemaining: '0:00',
        teamId: state[g.side].id,
        text: `위닝샷 — 종료 ${formatTime(g.gameClock)} 전 ${g.playerName}의 결승 득점이 그대로 승부를 갈랐습니다.`,
        type: 'info',
    });
}

// ─────────────────────────────────────────────────────────────
// 교체 실행 라우터 (임시/영구 분기)
// ─────────────────────────────────────────────────────────────

function executeSubstitution(
    state: GameState, team: TeamState, req: SubRequestV2, currentMinute: number
): void {
    if (req.exitType === 'temporary' && (req.benchReason === 'foul_trouble' || req.benchReason === 'shutdown')) {
        benchWithOverride(state, team, req.outPlayer, req.benchReason, currentMinute, req.returnMinute ?? null);
    } else {
        // 영구 퇴장 전 filler 체인 체크
        handleFillerExit(state, team, req.outPlayer, currentMinute);
        forceSubstitution(state, team, req.outPlayer, req.reason, req.benchReason ?? undefined);
    }
}

// ─────────────────────────────────────────────────────────────
// ② 포세션 1회 처리 (쿼터 경계 포함)
// ─────────────────────────────────────────────────────────────

export function stepPossession(state: GameState): StepResult {
    // ── A. 쿼터 전환 처리 (이전 스텝에서 gameClock가 0이 됐을 때 진입) ──
    // resume 후 첫 call: 새 쿼터 셋업만 하고 B로 fall-through → 첫 포세션까지 한 번에 실행
    // (hook이 isQuarterEnd를 감지해 pause → resume → 이 경로 진입 순서)
    if (state.gameClock <= 0) {
        const goOvertime = shouldPlayOvertime(state);   // [2026-10-26] 증가 전 피리어드 기준(4쿼터·1차 연장 종료 동점)
        state.quarter++;

        // 게임 종료
        if (state.quarter > REGULATION_PERIODS && !goOvertime) {
            return _handleGameEnd(state);
        }

        // 새 쿼터 셋업 (fall-through: 아래 B에서 첫 포세션 실행) — 연장은 5분
        state.gameClock = periodLengthSec(state.quarter);
        state.shotClock = 24;
        state.home.fouls = 0;
        state.away.fouls = 0;
        startTimeoutPeriod(state); // [2026-10-22] 의무 타임아웃 슬롯 리셋 + 4Q 진입 시 보유 4회 상한

        const transitionTotalSec = periodStartSec(state.quarter);
        resetMomentum(state, transitionTotalSec);

        // Hot/Cold Streak: 하프타임 완전 리셋, 쿼터 전환 반감
        // 체력 회복: 하프타임은 더 많이, 쿼터 휴식은 적당히
        const C = SIM_CONFIG.FATIGUE;
        if (state.quarter === 3) {
            resetHotCold(state.home);
            resetHotCold(state.away);
            recoverAllPlayers(state, C.HALFTIME_RECOVERY);
        } else {
            dampenHotCold(state.home);
            dampenHotCold(state.away);
            recoverAllPlayers(state, C.QUARTER_BREAK_RECOVERY);
        }

        state.logs.push({
            quarter: state.quarter,
            timeRemaining: formatTime(state.gameClock),
            teamId: 'SYSTEM',
            text: isOvertimePeriod(state.quarter) ? `${periodLabel(state.quarter)} 시작`
                : state.quarter === 3 ? '하프타임 종료 — 3쿼터 시작' : `${state.quarter}쿼터 시작`,
            type: 'info',
        });
        // [2026-10-26] 연장은 선발 5명으로 시작(표 43~47칸 재구성 후 바로 투입) → 점프볼
        //   (체력 회복·팀파울/모멘텀 리셋·Hot/Cold 반감은 위 쿼터 휴식과 동일)
        if (isOvertimePeriod(state.quarter)) {
            for (const team of [state.home, state.away]) {
                prepareOvertimeRotation(state, team);
                checkAndApplyRotation(state, team, elapsedGameSec(state));
            }
            applyJumpBall(state);
        }
        // return하지 않고 B로 진행 → 새 쿼터의 첫 포세션을 이 step에서 실행
    }

    // ── B. 정상 포세션 실행 ──
    const offTeam = state.possession === 'home' ? state.home : state.away;
    const logsBefore = state.logs.length;

    // 클러치 컨텍스트 계산
    const scoreDiff = Math.abs(state.home.score - state.away.score);
    const isQ4Plus = state.quarter >= 4;
    const isClutch = isQ4Plus && state.gameClock <= 300 && scoreDiff <= 10;
    const isSuperClutch = isQ4Plus && state.gameClock <= 120 && scoreDiff <= 5;

    let clutchContext: ClutchContext | undefined;
    if (isClutch) {
        const trailingTeamSide = state.home.score < state.away.score ? 'home'
            : state.home.score > state.away.score ? 'away'
            : null;
        // 절박도: 시간이 적을수록, 점수차가 클수록 높음 (0~1)
        const timeUrgency = 1 - (state.gameClock / 300); // 300초→0, 0초→1
        const scorePressure = Math.min(1, scoreDiff / 10); // 0점차→0, 10점차→1
        const desperation = Math.min(1, timeUrgency * 0.6 + scorePressure * 0.4);

        clutchContext = { isClutch, isSuperClutch, trailingTeamSide, scoreDiff, desperation };
    }

    // [2026-10-23] 시간별 전술 세트 — 포세션 시작 시점의 분/클러치 여부로 양 팀 슬라이더 교체(세트 없는 팀은 no-op)
    const possStartMinute = scheduleMinute(state);   // [2026-10-26] 연장 k분째 = 4쿼터 마지막 5분(43+k)
    applyTacticSchedule(state.home, possStartMinute, isClutch);
    applyTacticSchedule(state.away, possStartMinute, isClutch);

    // [2026-10-26] 마지막 연장 동점·24초 이내 공격 = 결승 공격(시간을 끝까지 쓰고 반드시 득점)
    const decisive = isDecisivePossession(state);
    const result = (decisive ? simulateDecisivePossession(state, clutchContext) : null) ?? simulatePossession(state, { clutchContext });
    state.courtSnapshot = computeCourtPositions(result, state.home.id);
    // [2026-10-07] 테크니컬 파울은 데드볼 중 발생하는 독립 이벤트 — 시간 차감 없이(중단 시점 그대로) 자유투만
    // 처리하고 같은 팀 공격을 재개한다. 평균 샷클락 소모 통계에서도 제외. 플래그런트는 플레이 중 발생하므로
    // 시간은 정상 소모(아래 retainPossession에서 샷클락만 14초로).
    const isTechnical = result.type === 'technicalFoul';
    // [2026-10-18] 샷클락 바이올레이션은 남은 샷클락을 전부 소모해야 함 — 일반 포세션 공식(8~23초)을 쓰면
    // 수비 리바운드 8초 뒤 "24초 바이올레이션" 같은 모순 로그가 찍혔음.
    // [2026-10-23] 보너스 전(수비팀 팀파울 4개 미만 → 이번 파울로 4개 이하) 비슈팅 파울은 공격권 유지 —
    // 이전엔 공격권이 넘어가 "기록되지 않는 턴오버"로 작동했다(팀당 경기당 ~3회). 파울은 공격 도중에
    // 일어나므로 포세션 시간의 25~75%만 소모하고, 샷클락은 아래 retainPossession에서 max(14, 잔여)로.
    // fouls는 applyPossessionResult(commitFoul) 전이라 증가 전 값이다.
    const fouledTeam = state.possession === 'home' ? state.away : state.home;
    const isNonBonusFoul = result.type === 'foul' && fouledTeam.fouls < teamFoulLimit(state.quarter);   // [2026-10-26] 연장은 3
    let timeTaken = decisive ? state.gameClock
        : isTechnical ? 0
        : result.type === 'shotClockViolation' ? Math.min(state.shotClock, state.gameClock)
        // [2026-10-23] simulatePossession이 미리 뽑은 값이 있으면 그대로(프레스 시간·샷클락 막판 페널티와 일치), 없으면 기존 계산
        : state.preSampledPossessionTime !== undefined ? Math.min(state.gameClock, state.preSampledPossessionTime)
        : calculatePossessionTime(state, offTeam.tactics.sliders, result.playType);
    if (isNonBonusFoul) timeTaken = Math.max(1, Math.round(timeTaken * (0.25 + Math.random() * 0.5)));

    // 포세션 시간 누적 (평균 샷클락 소모 추적) — 보너스 전 파울은 포세션이 이어지므로 시간만 더하고 횟수는 제외
    if (!isTechnical) {
        const sideAccum = state.possession === 'home' ? state.possessionTimeAccum.home : state.possessionTimeAccum.away;
        sideAccum.total += timeTaken;
        if (!isNonBonusFoul) sideAccum.count += 1;
    }

    // 시간 차감을 로그 기록 전에 수행 (PBP 로그에 포세션 소요 후 시간이 찍히도록)
    state.gameClock = Math.max(0, state.gameClock - timeTaken);
    updateOnCourtStates(state, timeTaken);

    // 득점 추적 (momentum 업데이트용 — FT 포함)
    const scoreBefore = { home: state.home.score, away: state.away.score };

    // [2026-10-27] 득점 처리 전에 생긴 줄(시간 경과 중 부상 등 직접 push)은 처리 전 스코어로(client 미러 참조)
    for (let i = logsBefore; i < state.logs.length; i++) {
        const log = state.logs[i];
        if (log.homeScore === undefined) { log.homeScore = state.home.score; log.awayScore = state.away.score; }
    }
    const ftReb = applyPossessionResult(state, result);   // 마지막 자유투 실패 후 리바운드('off'|'def'), 없으면 null
    const ftOffReb = ftReb === 'off';

    // [2026-10-27] 공격 리바운드 판정은 교체(아래 2~4번) 전에 — 교체가 리바운더를 벤치로 보내면 onCourt 검사가 실패해
    // 공격권이 상대에게 넘어갔다. 자유투 실패 후 공격 리바운드(ftOffReb, statsMappers 판정)도 포함 — 이전엔 miss만 봤다.
    const isOffReb = ftOffReb
        || (result.type === 'miss' && !!result.rebounder
            && offTeam.onCourt.some(p => p.playerId === result.rebounder!.playerId));

    // 득점 후 momentum 업데이트
    const currentTotalSecAfter = elapsedGameSec(state);
    const homeScored = state.home.score - scoreBefore.home;
    const awayScored = state.away.score - scoreBefore.away;
    if (homeScored > 0) updateMomentum(state, state.home.id, homeScored, currentTotalSecAfter);
    if (awayScored > 0) updateMomentum(state, state.away.id, awayScored, currentTotalSecAfter);
    trackGoAhead(state, result, scoreBefore);   // [2026-10-26] 위닝샷 해설용

    // 이번 포세션에서 새로 생성된 득점 로그에 런 상태 스탬프 (멀티플레이어 리플레이용 — PBP 저장 시 영구 보존됨)
    if (state.momentum.activeRun) {
        const runTeamId  = state.momentum.activeRun.teamId;
        const runHomePts = state.momentum.homeEpochPts;
        const runAwayPts = state.momentum.awayEpochPts;
        for (let i = logsBefore; i < state.logs.length; i++) {
            const log = state.logs[i];
            if (log.type === 'score' || log.type === 'freethrow') {
                log.runTeamId  = runTeamId;
                log.runHomePts = runHomePts;
                log.runAwayPts = runAwayPts;
            }
        }
    }

    const currentTotalSec = elapsedGameSec(state);
    const currentMinute = scheduleMinute(state);

    // 박스스코어 점진 공개용 델타 타임라인 기록 (교체 전 코트 라인업 기준)
    recordBoxTick(state, currentTotalSec, timeTaken, result);

    // ★ 1. 임시 벤치 선수 복귀 체크 (맵 복원 → 이후 체크에 반영)
    checkTemporaryReturns(state, state.home, currentMinute);
    checkTemporaryReturns(state, state.away, currentMinute);

    // [2026-10-27] 교체는 데드볼에서만(client 미러 참조) — 라이브볼(야투 실패·마지막 자유투 실패 후 리바운드, 스틸)로 끝난 포세션은
    //   아래 1-b~4번(가비지 판정·긴급 교체·정기 로테이션)을 다음 데드볼(야투 성공·파울·바이올레이션·데드볼 턴오버·타임아웃·쿼터 종료)까지 보류.
    //   부상·퇴장으로 뛸 수 없는 선수가 코트에 있으면 경기가 멈춘 것으로 보고 즉시 처리. 로테이션 표는 분 단위라 다음 데드볼에서 따라잡는다.
    const isLiveBall = state.gameClock > 0
        && (result.type === 'miss' || (result.type === 'turnover' && !!result.isSteal) || ftReb !== null);
    const hasStoppage = [state.home, state.away].some(t => t.onCourt.some(p => (p.health === 'Injured' && p.injuredThisGame) || isOut(p)));
    const subsDeferred = isLiveBall && !hasStoppage;
    const runSubstitutions = () => {
        // 1-b. [2026-10-26] 가비지 타임 발동/해제 — 4Q 남은 시간 대비 점수 차(rotationLogic.updateGarbageTime).
        //      [2026-10-27] 발동 시 즉시 일괄 교체하므로 데드볼 보류 대상에 포함.
        //      발동 시 로테이션 표 전체를 가비지 라인업으로 덮어쓰고, 해제 시 원래 표로 복원(실제 투입은 아래 4번).
        updateGarbageTime(state, state.home);
        updateGarbageTime(state, state.away);

        // 2. 긴급 교체 체크 (V2: 퇴장/부상/파울트러블/탈진)
        //    ★ 반드시 rotation 전에 실행 — 퇴장 시 승계 로직(applyRotationSuccession)으로
        //      맵을 갱신해야 rotation 체크가 올바른 라인업을 구성함.
        //      (이전: rotation이 먼저 실행되어 pf≥6 선수를 fallback으로 처리 → 승계 미실행 버그)
        const hSubs = checkSubstitutionsV2(state, state.home, currentMinute);
        const aSubs = checkSubstitutionsV2(state, state.away, currentMinute);

        // 3. 교체 실행 (가비지타임 일괄 / 임시·영구 분기)
        const hGarbage = hSubs.filter(r => r.benchReason === 'garbage');
        const aGarbage = aSubs.filter(r => r.benchReason === 'garbage');
        if (hGarbage.length > 0) executeGarbageSubstitution(state, state.home, hGarbage.map(r => r.outPlayer));
        if (aGarbage.length > 0) executeGarbageSubstitution(state, state.away, aGarbage.map(r => r.outPlayer));
        hSubs.filter(r => r.benchReason !== 'garbage').forEach(req => executeSubstitution(state, state.home, req, currentMinute));
        aSubs.filter(r => r.benchReason !== 'garbage').forEach(req => executeSubstitution(state, state.away, req, currentMinute));

        // 4. 정기 로테이션 (맵 기반 교체) — 승계 후 갱신된 맵 기반으로 정확한 라인업 구성
        checkAndApplyRotation(state, state.home, currentTotalSec);
        checkAndApplyRotation(state, state.away, currentTotalSec);
    };
    if (!subsDeferred) runSubstitutions();

    // 포세션 전환 (isOffReb는 교체 전에 위에서 판정)
    // 공격권 유지 케이스: 오펜시브 리바운드, 테크니컬 파울, 플래그런트 파울, 보너스 전 비슈팅 파울
    const retainPossession = isOffReb
        || result.type === 'technicalFoul'
        || result.type === 'flagrantFoul'
        || isNonBonusFoul;

    if (retainPossession) {
        // [2026-10-07] 오펜시브 리바운드 14 / 플래그런트 14(프런트코트 인바운드 규정) / 테크니컬은 중단 시점 샷클락 유지
        // [2026-10-23] 보너스 전 비슈팅 파울: 잔여 샷클락이 14초 미만이면 14초로(NBA 킥볼/수비 파울 규정)
        if (isOffReb) state.shotClock = 14;
        else if (result.type === 'flagrantFoul') state.shotClock = 14;
        else if (isNonBonusFoul) state.shotClock = Math.max(14, state.shotClock - timeTaken);
        // technicalFoul: state.shotClock 그대로
        state.lastEntryWasDefReb = false;
        state.lastEntryWasSteal = false;
        state.lastEntryWasOffReb = isOffReb;
        state.lastEntryWasFlagrant = result.type === 'flagrantFoul';
    } else {
        state.lastEntryWasOffReb = false;
        state.lastEntryWasFlagrant = false;
        // [New 2026-07] 수비 리바운드로 공격권이 넘어간 경우만 true — defReb 속공 트레이드오프용
        state.lastEntryWasDefReb = result.type === 'miss' && !isOffReb;
        // [2026-10-24] 라이브볼 스틸(프레스 트랩 스틸 포함)로 공격권이 넘어간 경우 — 다음 포세션 속공 연결(SIM_CONFIG.STEAL_TRANSITION)
        state.lastEntryWasSteal = result.type === 'turnover' && !!result.isSteal;
        state.possession = state.possession === 'home' ? 'away' : 'home';
        state.shotClock = 24;
    }

    // [2026-10-26] 피리어드 종료 해설 — 버저비터(동점·위닝샷 포함)와 "N쿼터 종료/전반 종료/연장 돌입" 안내.
    // 경기가 끝나는 경우의 마무리(위닝샷·경기 종료)는 _handleGameEnd.
    if (state.gameClock <= 0) pushPeriodEndCommentary(state, result, scoreBefore);

    const newLogs = state.logs.slice(logsBefore);

    // 각 로그에 현재 스코어 스냅샷 기록 (포세션 결과 적용 후)
    { const sh = state.home.score, sa = state.away.score;
      // [2026-10-27] addLog가 만든 줄은 생성 시점 스코어를 이미 가짐 — 비어 있는 줄(교체·해설 등 직접 push)만 채운다(client 미러 참조)
      newLogs.forEach(log => { if (log.homeScore === undefined) { log.homeScore = sh; log.awayScore = sa; } }); }

    if (state.gameClock <= 0) {
        // Q4 종료 = 즉시 게임 종료 (30초 타이머 없음)
        if (state.quarter >= REGULATION_PERIODS) {
            // [2026-10-26] 연장전 켜짐 + 동점 + 연장 횟수 남음 → 피리어드 종료로 반환(다음 step의 A 블록이 연장 시작)
            if (shouldPlayOvertime(state)) return { result, isQuarterEnd: true, isGameEnd: false, isTimeout: false, newLogs };
            if (!overtimeEnabled(state)) state.quarter = 5;   // 기존: 버저비터·종료 로그를 5쿼터로 기록(연장전 켜지면 마지막 피리어드 그대로)
            const gameEndResult = _handleGameEnd(state);
            return {
                result: gameEndResult.result,
                isQuarterEnd: false,
                isGameEnd: true,
                isTimeout: false,
                newLogs: [...newLogs, ...gameEndResult.newLogs],
            };
        }
        return { result, isQuarterEnd: true, isGameEnd: false, isTimeout: false, newLogs };
    }

    // 타임아웃 체크 (포세션 완료 후, 쿼터 중간에만) — 런 대응/초과분 소진/4Q 전략/의무를 정책 모듈이 통합 판단.
    // 의무 타임아웃도 일반 타임아웃과 동일하게 isTimeout=true (라이브 UI 일시정지).
    const timeoutDecision = decideTimeout(state, detectRunVictimId(state));
    if (timeoutDecision) {
        applyTimeout(state, timeoutDecision.teamId, false, timeoutDecision.mandatory ? 'mandatory' : 'team');
        if (subsDeferred) runSubstitutions();   // [2026-10-27] 타임아웃 = 데드볼 → 보류된 교체 처리
        // 타임아웃 로그 포함하여 전체 newLogs 재수집
        const allNewLogs = state.logs.slice(logsBefore);
        const sh = state.home.score, sa = state.away.score;
        // [2026-10-27] `!log.homeScore`는 홈 0점 줄을 빈 줄로 오인해 덮어썼음 → undefined만 채움(client 미러 참조)
        allNewLogs.forEach(log => { if (log.homeScore === undefined) { log.homeScore = sh; log.awayScore = sa; } });
        return { result, isQuarterEnd: false, isGameEnd: false, isTimeout: true, timeoutTeamId: timeoutDecision.teamId, newLogs: allNewLogs };
    }

    return { result, isQuarterEnd: false, isGameEnd: false, isTimeout: false, newLogs };
}

// ─────────────────────────────────────────────────────────────
// 게임 종료 처리 (버저비터 포함)
// ─────────────────────────────────────────────────────────────

/**
 * [2026-07-29] 버저비터 포제션이 깨끗한 'score'로 안 끝났을 때(미스/턴오버/파울 등) 표시할
 * PBP 문구를 결과 타입에 맞게 고른다. 실제로 무슨 상황이었는지와 무관하게 승부는 반드시
 * 갈라야 하므로(NBA는 동점 종료가 없음) 1점을 부여하되, 최소한 그럴듯한 상황 묘사를 남긴다.
 */
function buildBuzzerFallbackMessage(result: PossessionResult): string {
    const name = result.actor.playerName;
    switch (result.type) {
        case 'miss':
            return `${name}의 슛이 빗나갔지만, 흘러나온 볼을 다시 잡아 극적으로 집어넣습니다!`;
        case 'foul':
        case 'offensiveFoul':
            return `혼전 속 파울 상황에서도 ${name}의 팀이 침착하게 추가 득점을 챙깁니다.`;
        case 'turnover':
            return `공을 놓칠 뻔한 위기에서도, ${name}의 팀이 혼전 끝에 극적으로 득점을 만들어냅니다.`;
        default:
            return `극도의 혼전 속에서 ${name}의 팀이 마지막 순간 득점을 만들어냅니다.`;
    }
}

function _handleGameEnd(state: GameState): StepResult {
    const logsBefore = state.logs.length;

    // [2026-10-26] 연장전 켜짐: 마지막 연장이 그래도 동점으로 끝남(결승 공격이 성립하지 않은 드문 경우) — 공격권 팀이
    // 0:00 직후 결승 공격(득점까지 재시도), 그래도 실패하면 자유투 1개 성공으로 기록(득점·FTM·FTA·+/− 정합).
    if (overtimeEnabled(state) && state.home.score === state.away.score) {
        const shootTeam = state.possession === 'home' ? state.home : state.away;
        const defTeam   = state.possession === 'home' ? state.away : state.home;
        const forced = simulateDecisivePossession(state);
        if (forced) {
            const before = { home: state.home.score, away: state.away.score };
            applyPossessionResult(state, forced);
            pushPeriodEndCommentary(state, forced, before);
        } else {
            const shooter = simulatePossession(state).actor;
            shooter.fta += 1; shooter.ftm += 1; shooter.pts += 1;
            shootTeam.score += 1;
            updatePlusMinus(shootTeam, defTeam, 1);
            state.logs.push({
                quarter: state.quarter,
                timeRemaining: '0:00',
                teamId: shootTeam.id,
                text: `${shooter.playerName}, 버저와 함께 얻어낸 자유투를 침착하게 성공시킵니다!`,
                type: 'freethrow',
                points: 1,
            });
        }
    }

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
            // [Fix 2026-07-29] 기존엔 팀 스코어에만 조용히 +1 해서 박스스코어 합계·PBP 로그가
            // 최종 스코어와 어긋나는 버그가 있었음(스케쥴 화면은 정상 스코어, 리뷰 화면은 박스스코어
            // 합계라 1점 적게 표시). 득점자 pts에도 반영하고, 결과 타입에 맞는 로그를 남긴다.
            const buzzTeam = buzzIsHome ? state.home : state.away;
            buzzResult.actor.pts += 1;
            buzzTeam.score += 1;
            state.logs.push({
                quarter: state.quarter,
                timeRemaining: '0:00',
                teamId: buzzTeam.id,
                text: buildBuzzerFallbackMessage(buzzResult),
                type: 'score',
                points: 1,
            });
        }

        state.possession = savedPossession;
    }

    // [2026-10-26] 위닝샷 — 4쿼터 이후 마지막 리드 득점이 24초 이내였고 끝까지 지켜졌으면(버저비터는 이미 해설)
    pushWinningShotCommentary(state);

    // Rotation History 닫기
    const GAME_END_SEC = overtimeEnabled(state) ? elapsedGameSec(state) : 48 * 60;   // [2026-10-26] 연장 포함 실제 종료 시각
    [state.home, state.away].forEach(team => {
        team.onCourt.forEach(p => {
            const hist = state.rotationHistory[p.playerId];
            if (hist && hist.length > 0) hist[hist.length - 1].out = GAME_END_SEC;
        });
    });

    // [2026-08-04] client 미러 참고 — '경기 시작 (Tip-off)'과 대칭되는 종료 배너
    state.logs.push({
        quarter: state.quarter,
        timeRemaining: '0:00',
        teamId: 'SYSTEM',
        // [2026-10-26] 연장 경기는 몇 차 연장 승부였는지
        text: overtimeEnabled(state) && isOvertimePeriod(state.quarter) ? `경기 종료 (Final) — ${state.quarter - REGULATION_PERIODS}차 연장 승부` : '경기 종료 (Final)',
        type: 'info',
    });

    const newLogs = state.logs.slice(logsBefore);
    { const sh = state.home.score, sa = state.away.score;
      // [2026-10-27] addLog가 만든 줄은 생성 시점 스코어를 이미 가짐 — 비어 있는 줄(교체·해설 등 직접 push)만 채운다(client 미러 참조)
      newLogs.forEach(log => { if (log.homeScore === undefined) { log.homeScore = sh; log.awayScore = sa; } }); }
    return { result: null, isQuarterEnd: false, isGameEnd: true, isTimeout: false, newLogs };
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
                position: p.position,
                pts: p.pts, reb: p.reb, offReb: p.offReb, defReb: p.defReb,
                ast: p.ast, stl: p.stl, blk: p.blk, tov: p.tov, tovForced: p.tovForced,
                fgm: p.fgm, fga: p.fga, p3m: p.p3m, p3a: p.p3a, ftm: p.ftm, fta: p.fta,
                rimM: p.rimM, rimA: p.rimA, midM: p.midM, midA: p.midA,
                mp: parseFloat(p.mp.toFixed(1)),
                g: p.mp > 0 ? 1 : 0,
                gs: p.gs,
                pf: p.pf,
                techFouls: p.techFouls || 0,
                flagrantFouls: p.flagrantFouls || 0,
                plusMinus: p.plusMinus,
                contestedAttempted: p.contestedAttempted || 0,
                contestedMade: p.contestedMade || 0,
                defRimAttempted: p.defRimAttempted || 0,
                defRimMade: p.defRimMade || 0,
                defMidAttempted: p.defMidAttempted || 0,
                defMidMade: p.defMidMade || 0,
                defThreeAttempted: p.defThreeAttempted || 0,
                defThreeMade: p.defThreeMade || 0,
                defRAAttempted: p.defRAAttempted || 0,
                defRAMade: p.defRAMade || 0,
                defITPAttempted: p.defITPAttempted || 0,
                defITPMade: p.defITPMade || 0,
                defMIDAttempted: p.defMIDAttempted || 0,
                defMIDMade: p.defMIDMade || 0,
                defCNRAttempted: p.defCNRAttempted || 0,
                defCNRMade: p.defCNRMade || 0,
                defWINGAttempted: p.defWINGAttempted || 0,
                defWINGMade: p.defWINGMade || 0,
                defATBAttempted: p.defATBAttempted || 0,
                defATBMade: p.defATBMade || 0,
                condition: parseFloat(p.currentCondition.toFixed(1)),
                isStopper: teamState.tactics.stopperId === p.playerId,
                isAceTarget: p.matchupEffectCount > 0,
                matchupEffect: avgEffect,
                recentShots: p.recentShots,
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

    // [2026-10-23] 스냅샷은 항상 1번 전술 — 경기 종료 시점 활성 세트(클러치·2번)가 아니라
    const mapTactics = (team: TeamState) => {
        const t = team.tactics;
        const main = team.tacticSets && team.activeTacticSet !== 'main' ? team.tacticSets.main : t.sliders;
        return { stopperId: t.stopperId, pace: main.pace, sliders: main };
    };

    const rosterUpdates: Record<string, RosterUpdate> = {};
    [state.home, state.away].forEach(team => {
        [...team.onCourt, ...team.bench].forEach((p: LivePlayer) => {
            rosterUpdates[p.playerId] = {
                condition: parseFloat(p.currentCondition.toFixed(1)),
            };
            // 경기 중 새로 부상당한 선수만 rosterUpdates에 포함 (기존 부상 returnDate 무한 연장 방지)
            if (p.health !== 'Healthy' && p.injuredThisGame) {
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
        homeTactics: mapTactics(state.home),
        awayTactics: mapTactics(state.away),
        rosterUpdates,
        pbpLogs: state.logs,
        rotationData: state.rotationHistory,
        pbpShotEvents: state.shotEvents,
        playTypeStats: state.playTypeStats,
        injuries: state.injuries,
        suspensions: state.suspensions,
        boxTimeline: state.boxTimeline,
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

    const currentTotalSec = elapsedGameSec(state);
    const currentMinute   = scheduleMinute(state);
    const quarterEndMin   = isOvertimePeriod(state.quarter) ? 48 : state.quarter * 12; // Q1→12 … Q4→48, 연장 = 표 43~47칸 끝까지

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
        const slotsBefore = snapshotSlots(userTeam);
        userTeam.onCourt.splice(outIdx, 1);
        userTeam.bench.push(outPlayer);

        userTeam.bench.splice(inIdx, 1);
        userTeam.onCourt.push(inPlayer);
        // [2026-10-22] 슬롯 재배정 — 1:1이면 나가는 선수 슬롯 승계(slotAssignment.ts)
        assignCourtSlots(userTeam, slotsBefore);

        // rotation history 기록
        const histOut = state.rotationHistory[outPlayer.playerId];
        if (histOut && histOut.length > 0) {
            histOut[histOut.length - 1].out = currentTotalSec;
            histOut[histOut.length - 1].outReason = 'manual';
        }

        if (!state.rotationHistory[inPlayer.playerId]) state.rotationHistory[inPlayer.playerId] = [];
        state.rotationHistory[inPlayer.playerId].push({ in: currentTotalSec, out: -1 });

        state.logs.push({
            quarter: state.quarter,
            timeRemaining: formatTime(state.gameClock),
            teamId: userTeam.id,
            text: `교체: IN [${inPlayer.playerName}] OUT [${outPlayer.playerName}]`,
            type: 'info',
        });
    }
}
