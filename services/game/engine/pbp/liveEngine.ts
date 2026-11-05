
import { Team, GameTactics, DepthChart, SimulationResult, PbpLog, RosterUpdate, BoxDelta, BoxTick } from '../../../../types';
import { LeagueCoachingData } from '../../../../types/coaching';
import { SimSettings, DEFAULT_SIM_SETTINGS } from '../../../../types/simSettings';
import { GameState, TeamState, LivePlayer, ClutchContext, PossessionResult, isOut } from './pbpTypes';
import { initTeamState } from './initializer';
import { updateOnCourtStates } from './stateUpdater';
import { simulatePossession } from './possessionHandler';
import { checkSubstitutionsV2, SubRequestV2, buildEjectionSubRequest } from './substitutionSystem';
import { checkAndApplyRotation, prepareOvertimeRotation, forceSubstitution, transferSchedule, checkTemporaryReturns, benchWithOverride, handleFillerExit, executeGarbageSubstitution, updateGarbageTime } from './rotationLogic';
import { assignCourtSlots, snapshotSlots } from './slotAssignment';
import { formatTime, calculatePossessionTime } from './timeEngine';
import { applyPossessionResult, dampenHotCold, resetHotCold, regionOf } from './statsMappers';
import { trackTeamMisc, emptyTeamMisc } from './teamMisc';
import { getClockManagementCommentary, getGarbageTimeCommentary } from '../commentary/textGenerator';
import { decideFoulStrategy, type FoulStrategyPlan } from './foulStrategy';
import { decideEndOfPeriodShot, type EndShotPlan } from './endOfPeriodShot';
import { calculateRecovery } from '../fatigueSystem';
import { SIM_CONFIG } from '../../config/constants';
import { computeCourtPositions } from './handlers/courtPositions';
import { startTimeoutPeriod, recordTimeoutTaken, decideTimeout } from './timeoutPolicy';
import { applyTacticSchedule } from './tacticSchedule';
import { elapsedGameSec, scheduleMinute, periodLengthSec, periodStartSec, isOvertimePeriod, teamFoulLimit, overtimeEnabled, shouldPlayOvertime, isDecisivePossession, resolveJumpBall, REGULATION_PERIODS, periodLabel } from './periodRules';
import { updatePlusMinus } from './handlers/statUtils';
import { eulReul } from '../commentary/josa';

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

function recordBoxTick(state: GameState, currentTotalSec: number, timeTaken: number, result: PossessionResult, miscDelta: BoxTick['m'] | null = null): void {
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

    state.boxTimeline.push({ t: currentTotalSec, on: onIds, off: state.possession, mp: timeTaken / 60, d, ...(shot ? { shot } : {}), ...(miscDelta ? { m: miscDelta } : {}), ...(Object.keys(c).length ? { c } : {}) });
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

    // [2026-11-04] 재개 위치 — NBA Rule 5 VII.4: 중단된 지점에서 가장 가까운 곳(라이브볼이었으면 사이드라인)에서 인바운드 (server 미러 참조).
    //   공격 리바운드·프런트코트 인바운드 후면 프런트코트, 그 외(수비 리바운드·스틸·득점 후 등 새 공격권)는 백코트.
    //   Rule 5 VI.7: 4쿼터·연장 마지막 2분에 백코트에서 공을 가진 공격 팀이 부른 타임아웃은 프런트코트 28피트 해시마크로 전진(advanced).
    //   어느 경우든 세트 인바운드라 수비가 정돈됨 → 속공·풋백 없음(직전 라이브볼 진입 효과 소멸).
    const holderId = state.possession === 'home' ? state.home.id : state.away.id;
    const inFrontcourt = state.inbound?.spot === 'frontcourt' || state.lastEntryWasOffReb === true || state.lastEntryWasFlagrant === true;
    const lastTwoMin = state.quarter >= REGULATION_PERIODS && state.gameClock <= 120;
    const advance = !inFrontcourt && kind === 'team' && team.id === holderId && lastTwoMin;
    state.inbound = { spot: inFrontcourt || advance ? 'frontcourt' : 'backcourt', advanced: advance || undefined };
    state.lastEntryWasDefReb = false;
    state.lastEntryWasSteal = false;
    state.lastEntryPlayerId = undefined;
    state.lastOffRebClose = false;
    state.lastPossessionLiveBall = false;

    // 로그
    // [2026-11-05] 어느 팀의 타임아웃인지 앞에 표시(지역명 — 클락 운영 안내 줄과 같은 regionOf) (server 미러 참조)
    const who = regionOf(team);
    const text = (kind === 'mandatory'
        ? `${who} 의무 타임아웃 (잔여: ${team.timeouts}회)`
        : isUserCall
            ? `⏸ ${who} 타임아웃 선언 (잔여: ${team.timeouts}회)`
            : `${who} 타임아웃 (잔여: ${team.timeouts}회)`)
        + (advance ? ' — 프런트코트에서 인바운드' : '');   // [2026-11-04] 마지막 2분 전진 옵션
    state.logs.push({
        quarter: state.quarter,
        timeRemaining: formatTime(state.gameClock),
        teamId: team.id,
        text,
        type: 'timeout', // [2026-08-02] 이전엔 'info' + timeoutsLeft 필드로만 구분 — 인사이트 차트
                          // 포제션 마커(타임아웃 점)가 type으로 바로 필터링할 수 있도록 전용 타입 부여
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
    // [2026-10-27] 연장 스위치와 무관하게 항상 실시(사용자 결정) — 꺼진 리그는 홈팀이 늘 선공해 경기당 약 +0.6점을 얻었다. (server 미러와 동일)
    applyJumpBall(state);

    return state;
}

/** [2026-10-26] 점프볼(경기 시작·연장 시작) — 센터 신장·점프력으로 공격권 결정 + 로그 (periodRules.resolveJumpBall) */
function applyJumpBall(state: GameState): void {
    const jb = resolveJumpBall(state);
    state.possession = jb.winner;
    // [2026-11-04] 경기 첫 점프볼 승자 — 4쿼터 공격권, 진 팀은 2·3쿼터 공격권 (NBA Rule 6, server 미러 참조)
    if (state.quarter === 1) state.openingTipWinner = jb.winner;
    const winnerTeam = jb.winner === 'home' ? state.home : state.away;
    const won  = jb.winner === 'home' ? jb.homeJumper : jb.awayJumper;
    const lost = jb.winner === 'home' ? jb.awayJumper : jb.homeJumper;
    // [2026-10-26] 센터 서클 점프볼 — 누가 나섰고 누가 따냈는지, 어느 팀 공격으로 시작하는지
    const homeJ = jb.homeJumper?.playerName, awayJ = jb.awayJumper?.playerName;
    const opening = state.quarter === 1 ? '경기를 시작합니다' : `${eulReul(periodLabel(state.quarter))} 시작합니다`;
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
    // [2026-11-05] 팀 줄(버저비터 해설)은 플레이 표시(event 'highlight'), SYSTEM 줄(N쿼터 종료)은 안내
    const push = (teamId: string, text: string) => state.logs.push({ quarter: q, timeRemaining: '0:00', teamId, text, type: 'info', ...(teamId !== 'SYSTEM' ? { event: 'highlight' as const } : {}) });

    if (scorerSide) {
        const team = state[scorerSide];
        const name = result.actor.playerName;
        const scorerLeads = scorerSide === 'home' ? state.home.score > state.away.score : state.away.score > state.home.score;
        const ledBefore = scorerSide === 'home' ? before.home > before.away : before.away > before.home;
        if (!finalStretch) {
            // 1~3쿼터는 마지막 공격이 남은 시간을 다 쓰는 구조라 0:00 득점이 흔하다(쿼터의 ~37%) — 3점만 버저비터로 부른다
            if (result.zone === '3PT' && !result.isHeave) push(team.id, `버저비터! ${name}, 종료 버저와 함께 3점슛을 꽂으며 ${label}${q === 2 ? '을' : '를'} 마칩니다.`);
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
        event: 'highlight',   // [2026-11-05] 위닝샷 해설 = 플레이
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
        // req.benchReason은 이 분기에서 'injury' | 'foul_out' | null만 온다(foul_trouble/shutdown은
        // 위 분기에서 처리, garbage는 executeGarbageSubstitution으로 별도 처리되어 여기 안 옴).
        forceSubstitution(state, team, req.outPlayer, req.reason, req.benchReason ?? undefined);
    }
}

// ─────────────────────────────────────────────────────────────
// ② 포세션 1회 처리 (쿼터 경계 포함)
// ─────────────────────────────────────────────────────────────

/** [2026-11-05] 고의 파울 결과(파울 작전) — 비슈팅 파울로 처리(팀 파울·보너스 자유투·보너스 전 사이드 인바운드는 기존 경로) (server 미러 참조) */
function buildIntentionalFoulResult(state: GameState, plan: FoulStrategyPlan): PossessionResult {
    const offTeam = state.possession === 'home' ? state.home : state.away;
    const defTeam = offTeam === state.home ? state.away : state.home;
    return {
        type: 'foul', offTeam, defTeam, actor: plan.target, defender: plan.fouler, points: 0, isAndOne: false,
        isSwitch: false, isZone: false, isIntentional: true, intentionalKind: plan.kind, intentionalTime: plan.time,
    } as PossessionResult;
}

/** [2026-11-05] 드리블 아웃 결과 — 슛·기록 없이 남은 시간 소멸. 공을 쥐는 선수 = 코트 위 최고 핸들러 (server 미러 참조) */
function buildDribbleOutResult(state: GameState): PossessionResult {
    const offTeam = state.possession === 'home' ? state.home : state.away;
    const defTeam = offTeam === state.home ? state.away : state.home;
    const handler = [...offTeam.onCourt].sort((a, b) => b.archetypes.handler - a.archetypes.handler)[0];
    return {
        type: 'clockExpire', offTeam, defTeam, actor: handler, points: 0, isAndOne: false,
        isSwitch: false, isZone: false, expireSeconds: Math.ceil(state.gameClock), expireKind: 'dribbleOut',
    } as PossessionResult;
}

/** [2026-11-05] 피리어드 막판 히브 결과 — 3점 시도, 리바운드 없음(버저), 성공 확률은 endOfPeriodShot (server 미러 참조) */
function buildHeaveResult(state: GameState, plan: Extract<EndShotPlan, { kind: 'heave' }>): PossessionResult {
    const offTeam = state.possession === 'home' ? state.home : state.away;
    const defTeam = offTeam === state.home ? state.away : state.home;
    const made = Math.random() < plan.hitProb;
    return {
        type: made ? 'score' : 'miss', offTeam, defTeam, actor: plan.shooter, points: made ? 3 : 0, isAndOne: false,
        isSwitch: false, isZone: false, zone: '3PT', subZone: 'zone_atb3_c', shotType: 'Pullup',
        isHeave: true, heaveFt: plan.distanceFt,
    } as PossessionResult;
}

/** [2026-11-05] 백코트 1초 — 인바운드 받는 사이 시간 만료(슛 없음) (server 미러 참조) */
function buildInboundExpireResult(state: GameState): PossessionResult {
    const offTeam = state.possession === 'home' ? state.home : state.away;
    const defTeam = offTeam === state.home ? state.away : state.home;
    const handler = [...offTeam.onCourt].sort((a, b) => b.archetypes.handler - a.archetypes.handler)[0];
    return {
        type: 'clockExpire', offTeam, defTeam, actor: handler, points: 0, isAndOne: false,
        isSwitch: false, isZone: false, expireSeconds: Math.ceil(state.gameClock), expireKind: 'inbound',
    } as PossessionResult;
}

/**
 * [2026-11-05] A-9-4 — 같은 데드볼(같은 팀·피리어드·시각)의 연달아 붙은 교체 줄에서 들어왔다 바로 나간(또는 나갔다 바로 들어온)
 * 선수가 있으면 실제 변화만 남긴 한 줄로 합친다. 예: 6반칙 퇴장 교체 직후 가비지 일괄 교체가 그 대체 선수를 다시 빼는 경우.
 * 사이에 플레이 줄(자유투 등)이 있으면 그 선수가 실제로 뛴 것이라 합치지 않는다(가비지 타임 안내 줄(garbageEvent)만 건너뜀). 합친 줄은 사유 표기를 뺀다. (server 미러 참조)
 */
const SUB_LOG_RE = /^교체: IN \[(.*?)\] OUT \[(.*?)\]/;
function mergeSubChurnLogs(state: GameState, from: number): void {
    const logs = state.logs;
    const isSub = (k: number) => SUB_LOG_RE.test(logs[k].text);
    for (let i = Math.max(0, from); i < logs.length; i++) {
        if (!isSub(i)) continue;
        // 같은 팀·시각의 교체 줄 묶음 — 사이의 "가비지 타임" 안내 줄만 건너뛴다(플레이 줄이 끼면 실제로 뛴 것)
        const idx = [i];
        for (let k = i + 1; k < logs.length; k++) {
            if (logs[k].quarter !== logs[i].quarter || logs[k].timeRemaining !== logs[i].timeRemaining) break;
            if (isSub(k)) { if (logs[k].teamId !== logs[i].teamId) break; idx.push(k); continue; }
            if (!logs[k].garbageEvent) break;
        }
        if (idx.length < 2) continue;
        const ins: string[] = [], outs: string[] = [];
        let churn = false;
        for (const k of idx) {
            const m = logs[k].text.match(SUB_LOG_RE)!;
            const kIn = m[1].split(',').map(t => t.trim()).filter(Boolean);
            const kOut = m[2].split(',').map(t => t.trim()).filter(Boolean);
            for (const n of kOut) { const at = ins.indexOf(n); if (at >= 0) { ins.splice(at, 1); churn = true; } else outs.push(n); }
            for (const n of kIn) { const at = outs.indexOf(n); if (at >= 0) { outs.splice(at, 1); churn = true; } else ins.push(n); }
        }
        if (!churn) continue;
        // 마지막 교체 줄 자리에 합친 한 줄(안내 줄 뒤), 나머지 교체 줄은 제거
        const last = idx[idx.length - 1];
        if (ins.length > 0 && outs.length > 0) logs[last] = { ...logs[last], text: `교체: IN [${ins.join(', ')}] OUT [${outs.join(', ')}]` };
        else idx.push(last);
        for (const k of idx.slice(0, -1).sort((x, y) => y - x)) logs.splice(k, 1);
        i -= 1;   // 같은 자리부터 다시(다른 팀 묶음)
    }
}

/**
 * [2026-11-05] 양 팀이 같은 순간 가비지 타임에 들어가거나(또는 함께 해제) 각자 안내 줄을 찍으면, 두 줄을 양 팀 공통 한 줄(SYSTEM)로
 * 합쳐 일괄 교체 줄들 앞에 둔다. 전: 안내(A) → 교체(A) → 안내(B) → 교체(B) / 후: 안내(공통) → 교체(A) → 교체(B) (server 미러 참조)
 */
function mergeGarbageNotices(state: GameState, from: number): void {
    const logs = state.logs;
    for (const kind of ['start', 'end'] as const) {
        const idx: number[] = [];
        for (let i = from; i < logs.length; i++) if (logs[i].garbageEvent === kind) idx.push(i);
        if (idx.length !== 2 || logs[idx[0]].teamId === logs[idx[1]].teamId) continue;
        const lead = Math.abs(state.home.score - state.away.score);
        const first = logs[idx[0]];
        logs.splice(idx[1], 1);
        logs.splice(idx[0], 1, { ...first, teamId: 'SYSTEM', text: getGarbageTimeCommentary(kind, lead) });
    }
}

/** [2026-11-05] 쿼터 사이 라인업 정리 중 생긴 교체 줄·"복귀 준비" 줄 제거(그 외 안내 줄은 유지) */
function silenceLineupLogs(state: GameState, from: number): void {
    state.logs.push(...state.logs.splice(from).filter(l => !l.text.startsWith('교체:') && !l.text.includes('복귀 준비')));
}

/** 데드볼 교체 한 사이클 — 가비지 판정 → 긴급 교체(퇴장·부상·파울 트러블·탈진) → 정기 로테이션.
 *  [2026-11-05] stepPossession 클로저에서 분리 — 쿼터 사이 라인업(A 블록)도 같은 사이클을 쓴다. */
function runSubstitutionCycle(state: GameState, currentMinute: number, currentTotalSec: number): void {
    // 1-b. [2026-10-26] 가비지 타임 발동/해제 — 4Q 남은 시간 대비 점수 차(rotationLogic.updateGarbageTime).
    //      [2026-10-27] 발동 시 즉시 일괄 교체하므로 데드볼 보류 대상에 포함.
    //      발동 시 로테이션 표 전체를 가비지 라인업으로 덮어쓰고, 해제 시 원래 표로 복원(실제 투입은 아래 4번).
    const garbageLogStart = state.logs.length;
    updateGarbageTime(state, state.home);
    updateGarbageTime(state, state.away);
    mergeGarbageNotices(state, garbageLogStart);

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
}

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
        state.miscTracker = undefined;   // [2026-11-05] 피리어드 시작은 새 공격권 — 직전 피리어드의 턴오버·공격 리바운드 상태를 잇지 않는다(teamMisc.ts)

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

        // [2026-11-04] 쿼터 시작 공격권 — NBA Rule 6: 경기 첫 점프볼 승자가 4쿼터, 상대가 2·3쿼터를 엔드라인 인바운드로 시작 (server 미러 참조).
        //   이전엔 직전 쿼터 마지막 공격 결과를 그대로 이어가 2~4쿼터 시작의 ~52%가 규정과 달랐다. 연장은 아래 점프볼.
        //   점프볼 승자 정보가 없는 상태(배포 전에 시작된 라이브 경기)는 기존처럼 이어간다.
        if (!isOvertimePeriod(state.quarter) && state.openingTipWinner) {
            const tip = state.openingTipWinner;
            state.possession = state.quarter === 4 ? tip : (tip === 'home' ? 'away' : 'home');
        }
        // [2026-11-04] 피리어드 시작 = 데드볼 인바운드 — 직전 쿼터의 수비 리바운드·스틸·공격 리바운드 진입 상태를 비워
        //   쿼터 첫 공격이 속공·풋백으로 이어지지 않게 한다(이전엔 경기당 ~0.4회 쿼터 첫 공격 속공)
        state.lastEntryWasDefReb = false;
        state.lastEntryWasSteal = false;
        state.lastEntryWasOffReb = false;
        state.lastEntryWasFlagrant = false;
        state.lastEntryPlayerId = undefined;
        state.lastOffRebounderId = undefined;
        state.lastOffRebClose = undefined;
        state.inbound = isOvertimePeriod(state.quarter) ? undefined : { spot: 'backcourt' };   // 연장은 점프볼(라이브볼) 시작
        state.lastPossessionLiveBall = false;
        state.clockModeLogged = undefined;
        const periodStartTeam = state.possession === 'home' ? state.home : state.away;
        state.logs.push({
            quarter: state.quarter,
            timeRemaining: formatTime(state.gameClock),
            teamId: 'SYSTEM',
            // [2026-11-04] 정규 쿼터는 공격 팀 표시 — "2쿼터 시작 (시카고 차저스 공격)". 연장은 점프볼 로그가 공격 팀을 알린다.
            text: isOvertimePeriod(state.quarter) ? `${periodLabel(state.quarter)} 시작`
                : `${state.quarter === 3 ? '하프타임 종료 — 3쿼터 시작' : `${state.quarter}쿼터 시작`} (${periodStartTeam.name} 공격)`,
            type: 'info',
        });
        const lineupLogStart = state.logs.length;   // [2026-11-05] 연장 선발 투입도 교체 줄을 남기지 않는다(쿼터 사이 라인업과 같은 원칙)
        // [2026-10-26] 연장은 선발 5명으로 시작(표 43~47칸 재구성 후 바로 투입) → 점프볼
        //   (체력 회복·팀파울/모멘텀 리셋·Hot/Cold 반감은 위 쿼터 휴식과 동일)
        if (isOvertimePeriod(state.quarter)) {
            for (const team of [state.home, state.away]) {
                prepareOvertimeRotation(state, team);
                checkAndApplyRotation(state, team, elapsedGameSec(state));
            }
            applyJumpBall(state);
        }
        silenceLineupLogs(state, lineupLogStart);
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
    // [2026-11-05] 드리블 아웃 — 4Q·연장, 샷클락이 꺼진 구간(남은 시간 ≤ 샷클락)에서 앞선 팀은 슛 없이 남은 시간을 흘려보낸다 (server 미러 참조).
    //   지는 팀의 고의 파울(시간 멈추기)은 아직 없음(별도 과제) — 그래서 리드 폭과 무관하게 경기가 그대로 끝난다.
    const offLeadNow = state.possession === 'home' ? state.home.score - state.away.score : state.away.score - state.home.score;
    // [2026-11-05] 파울 작전·역파울 작전(foulStrategy) — 드리블 아웃보다 먼저: 지는 팀은 시계를 세우려 공을 잡은 선수에게 바로 파울 (server 미러 참조)
    const foulPlan = !decisive ? decideFoulStrategy(state) : null;
    const dribbleOut = !decisive && !foulPlan && state.quarter >= REGULATION_PERIODS && state.gameClock > 0 && state.gameClock <= state.shotClock && offLeadNow >= 1;
    state.clockMode = undefined;   // [2026-11-05] timeEngine이 이번 포세션에 적용한 상황 규칙 — 아래에서 안내 줄로 사용
    // [2026-11-05] 피리어드 막판 슛(endOfPeriodShot) — 샷클락 꺼진 6초 이하: 히브·인바운드 중 시간 만료는 여기서 결과를 만들고,
    //   밀고 올라가기(Transition)·프런트코트 캐치앤슛은 플레이를 고정해 simulatePossession에 넘긴다 (server 미러 참조)
    const endShot = !decisive && !foulPlan && !dribbleOut ? decideEndOfPeriodShot(state) : null;
    if (endShot && (endShot.kind === 'rush' || endShot.kind === 'catchShoot')) {
        state.forcedPlayType = endShot.kind === 'rush' ? 'Transition' : 'CatchShoot';
        state.endShotRush = true;
    }
    const result = foulPlan ? buildIntentionalFoulResult(state, foulPlan)
        : dribbleOut ? buildDribbleOutResult(state)
        : endShot?.kind === 'heave' ? buildHeaveResult(state, endShot)
        : endShot?.kind === 'expire' ? buildInboundExpireResult(state)
        : (decisive ? simulateDecisivePossession(state, clutchContext) : null) ?? simulatePossession(state, { clutchContext });
    state.forcedPlayType = undefined;
    state.endShotRush = undefined;
    // [2026-11-05] 막판 밀고 올라가기가 데드볼 인바운드(타임아웃·득점·파울 후)에서 시작됐으면 속공이 아님 — 문구용 표시(수비 리바운드·스틸 직후는 실제 속공) (server 미러 참조)
    if (endShot?.kind === 'rush' && result.playType === 'Transition' && !state.lastEntryWasDefReb && !state.lastEntryWasSteal) result.isEndRush = true;
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
    // fouls는 applyPossessionResult(commitFoul) 전이라 증가 전 값이다. (server 미러와 동일)
    const fouledTeam = state.possession === 'home' ? state.away : state.home;
    const isNonBonusFoul = result.type === 'foul' && fouledTeam.fouls < teamFoulLimit(state.quarter);   // [2026-10-26] 연장은 3
    let timeTaken = decisive ? state.gameClock
        : result.type === 'clockExpire' || result.isHeave ? state.gameClock   // [2026-11-05] 드리블 아웃·인바운드 만료·버저 히브 = 남은 시간 전부
        : result.isIntentional ? Math.min(state.gameClock, result.intentionalTime ?? 2)   // [2026-11-05] 고의 파울 = 인바운드~파울 1~4초
        : isTechnical ? 0
        : result.type === 'shotClockViolation' ? Math.min(state.shotClock, state.gameClock)
        // [2026-10-23] simulatePossession이 미리 뽑은 값이 있으면 그대로(프레스 시간·샷클락 막판 페널티와 일치), 없으면 기존 계산
        : state.preSampledPossessionTime !== undefined ? Math.min(state.gameClock, state.preSampledPossessionTime)
        : calculatePossessionTime(state, offTeam.tactics.sliders, result.playType);
    if (isNonBonusFoul && !result.isIntentional) timeTaken = Math.max(1, Math.round(timeTaken * (0.25 + Math.random() * 0.5)));

    // [2026-11-05] 상황별 클락 운영(2-for-1·마지막 공격·샷클락 끝까지·서두르기·시간 끌기) — 별도 안내 줄 대신 이번 공격의 플레이 줄 앞에
    //   운영 문장을 이어 붙여 한 줄로("브루클린, 리드를 지키며 샷클락을 길게 씁니다. 케빈 듀란트, …", 사용자 결정 — 구어체, 아래 applyPossessionResult 뒤). 같은 공격권 안의 같은 운영(비보너스 파울·공격 리바운드로 이어진 공격)은 한 번만 (server 미러 참조)
    const clockMode = state.clockMode;
    state.clockMode = undefined;
    let clockTag: string | undefined;
    const clockKey = clockMode ? `${offTeam.id}:${clockMode}` : undefined;
    // 시간을 쓰는 운영(마지막 공격·샷클락 끝까지·시간 끌기)인데 속공으로 끝난 공격은 문장이 모순이라 붙이지 않음
    const slowClock = clockMode === 'lastShot' || clockMode === 'fullClock' || clockMode === 'milk' || clockMode === 'milkMax';
    if (clockMode && !decisive && !isTechnical && !result.isIntentional && result.type !== 'clockExpire' && state.clockModeLogged !== clockKey
        && !(slowClock && result.playType === 'Transition')) {
        clockTag = getClockManagementCommentary(clockMode, regionOf(offTeam));   // 실제로 붙인 경우에만 clockModeLogged 기록(아래) — 파울로 끊긴 공격은 다음 공격에
    }
    const clockTagFrom = state.logs.length;
    // [2026-11-05] 파울 작전 시작 안내 줄은 삭제(사용자 결정) — 고의 파울 줄 자체가 상황을 설명한다

    // 포세션 시간 누적 (평균 샷클락 소모 추적) — 보너스 전 파울은 포세션이 이어지므로 시간만 더하고 횟수는 제외
    if (!isTechnical) {
        const sideAccum = state.possession === 'home' ? state.possessionTimeAccum.home : state.possessionTimeAccum.away;
        sideAccum.total += timeTaken;
        if (!isNonBonusFoul) sideAccum.count += 1;
    }

    // 시간 차감을 로그 기록 전에 수행 (PBP 로그에 포세션 소요 후 시간이 찍히도록)
    state.gameClock = Math.max(0, state.gameClock - timeTaken);
    // [2026-11-05] 부상 줄은 시간 경과 중에 생기지만, 플레이 줄(슛·파울·자유투) 뒤·교체 줄 앞에 찍히도록 잠시 빼 두었다가
    //   applyPossessionResult 직후 플레이 후 스코어로 다시 붙인다 (server 미러와 동일)
    const injuryLogStart = state.logs.length;
    updateOnCourtStates(state, timeTaken);
    const injuryLogs = state.logs.splice(injuryLogStart);

    // 득점 추적 (momentum 업데이트용 — FT 포함)
    const scoreBefore = { home: state.home.score, away: state.away.score };

    // [2026-10-27] 득점 처리 전에 생긴 줄(직접 push한 줄, 부상 줄은 위에서 따로 뺌)은 처리 전 스코어로(server 미러와 동일)
    for (let i = logsBefore; i < state.logs.length; i++) {
        const log = state.logs[i];
        if (log.homeScore === undefined) { log.homeScore = state.home.score; log.awayScore = state.away.score; }
    }
    // [2026-11-05] 실격(6반칙·퇴장) 선수는 파울 줄 직후·자유투 전에 바로 교체(NBA Rule 3 I.1·V.9) — 교체 선수가 자유투 리바운드 후보 (server 미러 참조)
    const replaceDisqualified = (team: TeamState, player: LivePlayer) => {
        if (!isOut(player) || !team.onCourt.some(p => p.playerId === player.playerId)) return;
        const before = state.logs.length;
        executeSubstitution(state, team, buildEjectionSubRequest(player), scheduleMinute(state));
        for (let i = before; i < state.logs.length; i++) {
            const log = state.logs[i];
            if (log.homeScore === undefined) { log.homeScore = state.home.score; log.awayScore = state.away.score; }
        }
    };
    const ftReb = applyPossessionResult(state, result, replaceDisqualified);   // 마지막 자유투 실패 후 리바운드('off'|'def'), 없으면 null
    const playLogsEnd = state.logs.length;
    if (clockTag) {   // 이번 공격 팀의 첫 결과 줄(득점·슛 실패·턴오버)에 운영 표시 — 슈팅 파울·고의 파울로 끊긴 공격은 붙이지 않음
        for (let i = clockTagFrom; i < playLogsEnd; i++) {
            const l = state.logs[i];
            if (l.teamId === offTeam.id && (l.type === 'score' || l.type === 'miss' || l.type === 'turnover')) {
                l.text = `${clockTag} ${l.text}`;
                state.clockModeLogged = clockKey;
                break;
            }
        }
    }   // [2026-11-05] 피리어드 종료 해설을 끼워 넣을 자리 — 플레이 줄 바로 뒤(부상·교체 줄 앞)
    for (const log of injuryLogs) {
        log.homeScore = state.home.score; log.awayScore = state.away.score;
        state.logs.push(log);
    }
    const ftOffReb = ftReb === 'off';

    // [2026-10-27] 공격 리바운드 판정은 교체(아래 2~4번) 전에 — 교체가 리바운더를 벤치로 보내면 onCourt 검사가 실패해
    // 공격권이 상대에게 넘어갔다. 자유투 실패 후 공격 리바운드(ftOffReb, statsMappers 판정)도 포함 — 이전엔 miss만 봤다. (server 미러와 동일)
    const isOffReb = ftOffReb
        || (result.type === 'miss' && !!result.rebounder
            && offTeam.onCourt.some(p => p.playerId === result.rebounder!.playerId));

    // 포세션 전환 판정 (isOffReb는 교체 전에 판정) — [2026-11-05] 팀 미스크 득점 집계·박스 틱 기록이 먼저 필요해 득점 처리 직후로 올림
    // 공격권 유지 케이스: 오펜시브 리바운드, 테크니컬 파울, 플래그런트 파울, 보너스 전 비슈팅 파울
    const retainPossession = isOffReb
        || result.type === 'technicalFoul'
        || result.type === 'flagrantFoul'
        || result.type === 'fight'   // [2026-11-05] 싸움 — 공을 가진 팀이 공격권 유지(NBA Rule 12A VI.3), 이전엔 상대에게 넘어갔다 (server 미러 참조)
        || isNonBonusFoul;

    // [2026-11-05] 팀 미스크 득점 4종 누적(teamMisc.ts) — 공격권 전환 전에 호출해 이번 결과의 진입 상태(턴오버 직후·공격 리바운드 이후)로 판정.
    //   반환 델타는 박스 틱(m)에 실어 라이브 중계가 시점별로 점진 공개하게 한다.
    const miscDelta = trackTeamMisc(state, result, scoreBefore, isOffReb, retainPossession);

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
    recordBoxTick(state, currentTotalSec, timeTaken, result, miscDelta);

    // ★ 1. 임시 벤치 선수 복귀 체크 (맵 복원 → 이후 체크에 반영)
    const subLogStart = state.logs.length;   // [2026-11-05] 피리어드 종료 시 아래 교체 줄을 지우는 기준
    checkTemporaryReturns(state, state.home, currentMinute);
    checkTemporaryReturns(state, state.away, currentMinute);

    // [2026-10-27] 교체는 데드볼에서만(server 미러와 동일) — 라이브볼(야투 실패·마지막 자유투 실패 후 리바운드, 스틸)로 끝난 포세션은
    //   아래 1-b~4번(가비지 판정·긴급 교체·정기 로테이션)을 다음 데드볼(야투 성공·파울·바이올레이션·데드볼 턴오버·타임아웃·쿼터 종료)까지 보류.
    //   부상·퇴장으로 뛸 수 없는 선수가 코트에 있으면 경기가 멈춘 것으로 보고 즉시 처리. 로테이션 표는 분 단위라 다음 데드볼에서 따라잡는다.
    const isLiveBall = state.gameClock > 0
        && (result.type === 'miss' || (result.type === 'turnover' && !!result.isSteal) || ftReb !== null);
    const hasStoppage = [state.home, state.away].some(t => t.onCourt.some(p => (p.health === 'Injured' && p.injuredThisGame) || isOut(p)));
    const subsDeferred = isLiveBall && !hasStoppage;
    state.lastPossessionLiveBall = isLiveBall;   // [2026-11-04] 타임아웃 요청 자격·의무 타임아웃 보류 판정용 (timeoutPolicy.canCallTimeout, server 미러 참조)
    const runSubstitutions = () => runSubstitutionCycle(state, currentMinute, currentTotalSec);
    if (!subsDeferred) runSubstitutions();
    // [2026-11-05] 피리어드가 끝난 0:00의 교체 = 쿼터 사이 라인업 — 다음 피리어드 첫 칸 선수를 코트에 세우되(휴식 중 화면도 그 라인업)
    //   교체 줄·"복귀 준비" 줄은 남기지 않는다(사용자 결정: 그 시간에 뛸 선수가 코트에 있을 뿐, 교체로 기록하지 않음) (server 미러 참조)
    if (state.gameClock <= 0) silenceLineupLogs(state, subLogStart);

    if (retainPossession) {
        // [2026-11-04] 재개 위치(세트 인바운드, server 미러 참조) — 공격 리바운드는 라이브볼이라 해당 없음. 테크니컬은 중단 지점(이번 공격의 진입 기준),
        //   플래그런트는 프런트코트(샷클락 14와 같은 전제), 비보너스 파울은 파울 지점(프레스 파울 = 백코트, 그 외 하프코트 = 프런트코트)
        const wasFrontcourt = state.inbound?.spot === 'frontcourt' || state.lastEntryWasOffReb === true || state.lastEntryWasFlagrant === true;
        state.inbound = isOffReb ? undefined
            : result.type === 'technicalFoul' ? { spot: wasFrontcourt ? 'frontcourt' : 'backcourt' }
            : result.type === 'flagrantFoul' ? { spot: 'frontcourt' }
            : result.type === 'fight' ? { spot: 'frontcourt' }   // 공격 도중(하프코트) 중단 — 사이드라인, 자유투 라인 연장선보다 엔드라인 쪽은 아님(Rule 12A VI.3)
            : { spot: result.pressEvent || result.isIntentional ? 'backcourt' : 'frontcourt' };   // [2026-11-05] 고의 파울은 인바운드 직후(백코트)
        // [2026-10-07] 오펜시브 리바운드 14 / 플래그런트 14(프런트코트 인바운드 규정) / 테크니컬은 중단 시점 샷클락 유지
        // [2026-10-23] 보너스 전 비슈팅 파울: 잔여 샷클락이 14초 미만이면 14초로(NBA 킥볼/수비 파울 규정)
        if (isOffReb) state.shotClock = 14;
        else if (result.type === 'flagrantFoul') state.shotClock = 14;
        else if (isNonBonusFoul || result.type === 'fight') state.shotClock = Math.max(14, state.shotClock - timeTaken);   // [2026-11-05] 싸움 = 수비 팀 테크니컬 규정(Rule 7 IV.5.c: 중단 시점 유지, 14초 미만이면 14초)
        // technicalFoul: state.shotClock 그대로
        state.lastEntryWasDefReb = false;
        state.lastEntryWasSteal = false;
        state.lastEntryPlayerId = undefined;
        state.lastEntryWasOffReb = isOffReb;
        // [2026-11-04] 공격 리바운더·근거리 여부(statsMappers.pendingOffReb) → 다음 포세션 풋백 판정·슈터 (server 미러 참조)
        state.lastOffRebounderId = isOffReb ? state.pendingOffReb?.playerId : undefined;
        state.lastOffRebClose = isOffReb ? !!state.pendingOffReb?.close : undefined;
        state.lastEntryWasFlagrant = result.type === 'flagrantFoul';
    } else {
        state.lastEntryWasOffReb = false;
        state.lastOffRebounderId = undefined;
        state.inbound = undefined;   // [2026-11-04] 공격권 전환 = 라이브볼(리바운드·스틸) 또는 일반 데드볼(득점·자유투·턴오버) 진입
        state.clockModeLogged = undefined;
        state.lastOffRebClose = undefined;
        state.lastEntryWasFlagrant = false;
        // [New 2026-07] 수비 리바운드로 공격권이 넘어간 경우만 true — defReb 속공 트레이드오프용
        state.lastEntryWasDefReb = result.type === 'miss' && !isOffReb;
        // [2026-10-24] 라이브볼 스틸(프레스 트랩 스틸 포함)로 공격권이 넘어간 경우 — 다음 포세션 속공 연결(SIM_CONFIG.STEAL_TRANSITION)
        state.lastEntryWasSteal = result.type === 'turnover' && !!result.isSteal;
        // [2026-10-28] 수비 리바운더 / 스틸러(스틸 턴오버의 defender) — 다음 포세션 속공 분기용
        state.lastEntryPlayerId = state.lastEntryWasDefReb ? result.rebounder?.playerId
            : state.lastEntryWasSteal ? result.defender?.playerId : undefined;
        state.possession = state.possession === 'home' ? 'away' : 'home';
        state.shotClock = 24;
    }

    // [2026-10-26] 피리어드 종료 해설 — 버저비터(동점·위닝샷 포함)와 "N쿼터 종료/전반 종료/연장 돌입" 안내.
    // 경기가 끝나는 경우의 마무리(위닝샷·경기 종료)는 _handleGameEnd.
    // [2026-11-05] A-9-3 — 해설은 lastGoAhead 갱신 뒤라 여기서 만들지만, 줄은 플레이 줄 바로 뒤로 옮긴다
    //   (전: 득점 → 교체 → 버저비터 / 후: 득점 → 버저비터·쿼터 종료 → 부상·교체) (server 미러와 동일)
    if (state.gameClock <= 0) {
        const commentaryStart = state.logs.length;
        pushPeriodEndCommentary(state, result, scoreBefore);
        state.logs.splice(playLogsEnd, 0, ...state.logs.splice(commentaryStart));
    }

    mergeSubChurnLogs(state, logsBefore);
    const newLogs = state.logs.slice(logsBefore);

    // 각 로그에 현재 스코어 스냅샷 기록 (포세션 결과 적용 후)
    { const sh = state.home.score, sa = state.away.score;
      // [2026-10-27] addLog가 만든 줄은 생성 시점 스코어를 이미 가짐 — 비어 있는 줄(교체·해설 등 직접 push)만 채운다(server 미러와 동일)
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
    // [2026-11-05] 파울 작전 자유투가 끝나 파울한(지는) 팀이 공을 받았으면 즉시 타임아웃 후보(timeoutPolicy.decideFoulGameTimeout) (server 미러 참조)
    {
        const fouling = result.defTeam;
        const other = fouling === state.home ? state.away : state.home;
        state.foulGameTimeoutTeamId = (result.isIntentional && !retainPossession
            && state.gameClock <= SIM_CONFIG.FOUL_STRATEGY.TIMEOUT_AFTER_FT_CLOCK && fouling.score < other.score) ? fouling.id : undefined;
    }
    const timeoutDecision = decideTimeout(state, detectRunVictimId(state));
    state.foulGameTimeoutTeamId = undefined;
    if (timeoutDecision) {
        const timeoutLogStart = state.logs.length;
        applyTimeout(state, timeoutDecision.teamId, false, timeoutDecision.mandatory ? 'mandatory' : 'team');
        // [2026-11-05] 같은 데드볼에서 이미 찍힌 교체·가비지·복귀 안내 줄보다 타임아웃 줄을 앞으로(타임아웃을 부른 뒤 교체하는 흐름) (server 미러 참조)
        if (!subsDeferred && timeoutLogStart > subLogStart) {
            state.logs.splice(subLogStart, 0, ...state.logs.splice(timeoutLogStart));
        }
        if (subsDeferred) runSubstitutions();   // [2026-10-27] 타임아웃 = 데드볼 → 보류된 교체 처리
        // 타임아웃 로그 포함하여 전체 newLogs 재수집
        mergeSubChurnLogs(state, logsBefore);
        const allNewLogs = state.logs.slice(logsBefore);
        const sh = state.home.score, sa = state.away.score;
        // [2026-10-27] `!log.homeScore`는 홈 0점 줄을 빈 줄로 오인해 덮어썼음 → undefined만 채움(server 미러와 동일)
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

    // Rotation History 닫기
    const GAME_END_SEC = overtimeEnabled(state) ? elapsedGameSec(state) : 48 * 60;   // [2026-10-26] 연장 포함 실제 종료 시각
    [state.home, state.away].forEach(team => {
        team.onCourt.forEach(p => {
            const hist = state.rotationHistory[p.playerId];
            if (hist && hist.length > 0) hist[hist.length - 1].out = GAME_END_SEC;
        });
    });

    // [2026-10-26] 위닝샷 — 4쿼터 이후 마지막 리드 득점이 24초 이내였고 끝까지 지켜졌으면(버저비터는 이미 해설)
    pushWinningShotCommentary(state);

    // [2026-08-04] '경기 시작 (Tip-off)'과 대칭되는 종료 배너 — 이전엔 이 로그가 없어서
    // PBP 마지막 줄이 항상 마지막 포제션 커멘터리로 끝나고 별도 종료 안내가 없었음.
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
      // [2026-10-27] addLog가 만든 줄은 생성 시점 스코어를 이미 가짐 — 비어 있는 줄(교체·해설 등 직접 push)만 채운다(server 미러와 동일)
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
                ...(p.scrClean ? { scrClean: p.scrClean } : {}),
                ...(p.scrPartial ? { scrPartial: p.scrPartial } : {}),
                ...(p.scrFail ? { scrFail: p.scrFail } : {}),
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
        teamMisc: state.teamMisc ?? emptyTeamMisc(),   // [2026-11-05] 팀 미스크 득점 4종 (teamMisc.ts)
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
