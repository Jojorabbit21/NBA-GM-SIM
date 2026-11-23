
import { useRef, useState, useCallback, useEffect } from 'react';
import { Team, GameTactics, DepthChart, SimulationResult, PbpLog, PlayerBoxScore } from '../types';
import type { RotationData } from '../types/engine';
import { SimSettings } from '../types/simSettings';
import { HeadCoachPreferences } from '../types/coaching';
import { GameState, LivePlayer, ShotEvent, CourtSnapshot } from '../services/game/engine/pbp/pbpTypes';
import {
    createGameState,
    stepPossession,
    extractSimResult,
    applyTimeout,
    applyManualSubstitution,
} from '../services/game/engine/pbp/liveEngine';
import { formatTime } from '../services/game/engine/pbp/timeEngine';
import { canCallTimeout } from '../services/game/engine/pbp/timeoutPolicy';
import { elapsedGameSec, scheduleMinute } from '../services/game/engine/pbp/periodRules';
import { countOvertimePeriods, normalizePeriod } from '../utils/periodLabel';

// ─────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────

// 'manual' = 사용자가 일시정지 버튼으로 멈춘 상태(2026-11-23). 타임아웃·쿼터 휴식과 달리 선수 교체·로테이션·전술 변경이 전부 잠긴다
// (아래 applyTactics/applyRotationMap/makeSubstitution이 막고, 화면도 같은 값으로 편집 UI를 잠근다). 자동 재개 카운트다운 없음 — 재개 버튼으로만 풀림.
export type PauseReason = 'timeout' | 'quarterEnd' | 'halftime' | 'gameEnd' | 'manual';

export type GameSpeed = 0.5 | 1 | 1.5 | 3 | 6; // 포세션 간격 배수

/** 포세션당 ms (1x = 1200ms) */
const BASE_INTERVAL_MS = 1200;

export interface LiveDisplayState {
    homeScore: number;
    awayScore: number;
    quarter: number;
    gameClock: number;          // seconds
    recentLogs: PbpLog[];       // 최근 30개
    allLogs: PbpLog[];          // 전체 누적
    pauseReason: PauseReason | null;
    isGameEnd: boolean;
    /** [2026-11-23] 지금까지의 출전 구간(선수별 in/out 초) — 코트에 있는 선수의 마지막 구간은 현재 경기 시각으로 닫아서 넘긴다(로테이션 차트 표시용) */
    rotationData: RotationData;
    timeoutsLeft: { home: number; away: number };
    // [2026-11-04] 지금 타임아웃을 부를 수 있는지 — 라이브볼(리바운드·스틸 직후)엔 공을 가진 팀만 (NBA Rule 5 VI.4)
    timeoutCallable: { home: boolean; away: boolean };
    /** [2026-11-23] 사용자 타임아웃 예약 중 — 지금 부를 수 없을 때(라이브볼 상대 공·정지 중) 버튼을 누르면 다음에 부를 수 있는 첫 순간(데드볼 또는 우리 공)에 자동 발동 */
    timeoutReserved: boolean;
    homeOnCourt: LivePlayer[];
    awayOnCourt: LivePlayer[];
    homeBench: LivePlayer[];
    awayBench: LivePlayer[];
    activeRun: {
        teamId: string;
        teamPts: number;        // 런 팀의 에포크 득점
        oppPts: number;         // 상대 팀의 에포크 득점
        durationSec: number;    // diff ≥ 8 이후 경과초
    } | null;
    speed: GameSpeed;
    // 탭 바 전용 데이터
    shotEvents: ShotEvent[];
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
    homeFouls: number;          // 현재 쿼터 팀 파울
    awayFouls: number;
    userTactics: GameTactics;   // 유저 팀 현재 전술 (전술 탭 초기값)
    avgPossessionTime: { home: number; away: number }; // 평균 포세션 소모 시간 (초)
    courtSnapshot: CourtSnapshot | null; // 코트 위 선수 위치 스냅샷
}

export interface UseLiveGameReturn {
    displayState: LiveDisplayState;
    // 유저 액션
    callTimeout: () => void;     // [2026-11-23] 지금 부를 수 있으면 즉시, 아니면 예약 — 예약 중 다시 부르면 취소
    applyTactics: (newSliders: GameTactics['sliders']) => void;
    applyRotationMap: (newMap: Record<string, boolean[]>) => void;
    makeSubstitution: (outId: string, inId: string) => void;
    resume: () => void;
    pause: () => void;           // 사용자 일시정지(pauseReason 'manual') — 편집 잠금
    // 경기 종료 후
    getResult: () => SimulationResult | null;
    // OnCourt / Bench (교체 UI용 — 유저 팀만)
    userOnCourt: LivePlayer[];
    userBench: LivePlayer[];
    // 속도 조절
    setSpeed: (s: GameSpeed) => void;
    // 경기 끝까지 즉시 진행
    skipToEnd: () => void;
    // 코치 위임
    isDelegated: boolean;
    canDelegate: boolean;
    delegateToCoach: () => void;
    takeBackControl: () => void;
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export function useLiveGame(
    homeTeam: Team,
    awayTeam: Team,
    userTeamId: string | null,
    userTactics: GameTactics | null | undefined,
    isHomeB2B: boolean = false,
    isAwayB2B: boolean = false,
    homeDepthChart?: DepthChart | null,
    awayDepthChart?: DepthChart | null,
    tendencySeed?: string,
    simSettings?: SimSettings,
    coachPrefs?: HeadCoachPreferences | null,
    awayUserTactics?: GameTactics | null,
): UseLiveGameReturn {

    // ── GameState는 ref로 보유 (리렌더 방지) ──
    const gameStateRef = useRef<GameState>(
        createGameState(homeTeam, awayTeam, userTeamId, userTactics,
            isHomeB2B, isAwayB2B, homeDepthChart, awayDepthChart, tendencySeed, simSettings,
            undefined, awayUserTactics ?? undefined)
    );

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // [2026-11-23] 사용자 타임아웃 예약 — 매 포제션 종료 후 canCallTimeout이면 발동(아래 startInterval). 쿼터 종료·하프타임·다른 타임아웃으로
    //   경기가 먼저 멈추면 횟수를 쓰지 않고 해제(이미 멈춰 같은 효과), 위임·경기 종료까지 진행에서도 해제.
    const timeoutReservedRef = useRef(false);
    const pauseReasonRef = useRef<PauseReason | null>(null);
    const isGameEndRef  = useRef(false);
    const speedRef = useRef<GameSpeed>(1);

    // 위임 관련 refs/state
    const [isDelegated, setIsDelegated] = useState(false);
    const delegationBaseSlidersRef = useRef<GameTactics['sliders'] | null>(null);
    const applyCoachTacticsRef = useRef<() => void>(() => {});

    const [displayState, setDisplayState] = useState<LiveDisplayState>(() =>
        _buildDisplay(gameStateRef.current, null, false, 1, userTeamId, false)
    );

    // ── 디스플레이 동기화 헬퍼 ──
    const syncDisplay = useCallback(() => {
        setDisplayState(_buildDisplay(
            gameStateRef.current,
            pauseReasonRef.current,
            isGameEndRef.current,
            speedRef.current,
            userTeamId,
            timeoutReservedRef.current,
        ));
    }, [userTeamId]);

    // ── Interval 시작/중단 ──
    const startInterval = useCallback(() => {
        if (intervalRef.current) clearInterval(intervalRef.current);

        intervalRef.current = setInterval(() => {
            const state = gameStateRef.current;
            const step = stepPossession(state);

            if (step.isGameEnd) {
                clearInterval(intervalRef.current!);
                intervalRef.current = null;
                pauseReasonRef.current = 'gameEnd';
                isGameEndRef.current  = true;
                syncDisplay();
                return;
            }

            if (step.isQuarterEnd) {
                clearInterval(intervalRef.current!);
                intervalRef.current = null;
                // isQuarterEnd 시점의 state.quarter는 아직 전환 전 쿼터 번호
                // Q2 마지막 포세션 → state.quarter=2 → 하프타임
                const reason: PauseReason =
                    state.quarter === 2 ? 'halftime' : 'quarterEnd';
                pauseReasonRef.current = reason;
                timeoutReservedRef.current = false;   // 쿼터 휴식으로 이미 멈춤 — 예약 해제(횟수 미사용)
                // 위임 중이면 쿼터/하프타임 전환 시 코치 전술 재평가
                if (state.isUserDelegated) {
                    applyCoachTacticsRef.current();
                }
                syncDisplay();
                return;
            }

            // AI 타임아웃 (엔진에서 효과 적용 완료, UI는 일시정지만)
            if (step.isTimeout) {
                clearInterval(intervalRef.current!);
                intervalRef.current = null;
                pauseReasonRef.current = 'timeout';
                timeoutReservedRef.current = false;   // 상대·의무 타임아웃으로 이미 멈춤 — 예약 해제(횟수 미사용)
                syncDisplay();
                return;
            }

            // [2026-11-23] 사용자 타임아웃 예약 발동 — 이번 포제션이 데드볼로 끝났거나 우리 팀이 공을 잡았으면(canCallTimeout) 지금 부른다
            if (timeoutReservedRef.current && userTeamId && !state.isUserDelegated) {
                const userTeam = state.home.id === userTeamId ? state.home : state.away;
                if (userTeam.timeouts <= 0) {
                    timeoutReservedRef.current = false;
                } else if (canCallTimeout(state, userTeam.id)) {
                    clearInterval(intervalRef.current!);
                    intervalRef.current = null;
                    timeoutReservedRef.current = false;
                    applyTimeout(state, userTeam.id, true);
                    pauseReasonRef.current = 'timeout';
                    syncDisplay();
                    return;
                }
            }

            syncDisplay();
        }, BASE_INTERVAL_MS / speedRef.current);
    }, [syncDisplay]);

    // ── 마운트 시 즉시 시작 (의도적 빈 deps: startInterval은 intervalRef를 통해 항상 최신 syncDisplay를 참조) ──
    useEffect(() => {
        startInterval();
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ────────────────────────────────────────────────────────
    // 코치 위임 액션
    // ────────────────────────────────────────────────────────

    // 위임 시작 시점에 저장한 기준 슬라이더를 바탕으로 코치 성향 40% 블렌딩
    // (blendWithCoach logic 인라인 — tacticGenerator.ts:53-85 참조)
    const applyCoachTactics = useCallback(() => {
        if (!userTeamId || !coachPrefs || !delegationBaseSlidersRef.current) return;
        const state = gameStateRef.current;
        const userTeam = state.home.id === userTeamId ? state.home : state.away;
        const base = delegationBaseSlidersRef.current;
        const W = 0.4;
        const clamp = (v: number) => Math.max(1, Math.min(10, v));
        const lerp = (a: number, b: number) => clamp(Math.round(a * (1 - W) + b * W));

        userTeam.tactics.sliders = {
            ...base,
            ballMovement:   lerp(base.ballMovement,   coachPrefs.offenseIdentity),
            pace:           lerp(base.pace,           coachPrefs.tempo),
            offReb:         lerp(base.offReb,         11 - coachPrefs.tempo),
            insideOut:      lerp(base.insideOut,      coachPrefs.scoringFocus),
            shot_3pt:       lerp(base.shot_3pt,       coachPrefs.scoringFocus),
            shot_rim:       lerp(base.shot_rim,       11 - coachPrefs.scoringFocus),
            pnrFreq:        lerp(base.pnrFreq,        coachPrefs.pnrEmphasis),
            defIntensity:   lerp(base.defIntensity,   coachPrefs.defenseStyle),
            fullCourtPress: lerp(base.fullCourtPress, coachPrefs.defenseStyle),
            helpDef:        lerp(base.helpDef,        coachPrefs.helpScheme),
            switchFreq:     lerp(base.switchFreq,     coachPrefs.helpScheme),
            zoneFreq:       lerp(base.zoneFreq,       coachPrefs.zonePreference),
            zoneUsage:      lerp(base.zoneUsage,      coachPrefs.zonePreference),
        };

        state.logs.push({
            quarter: state.quarter,
            timeRemaining: formatTime(state.gameClock),
            teamId: userTeam.id,
            text: `코치가 전술을 조정했습니다`,
            type: 'info',
        });
    }, [userTeamId, coachPrefs]);

    // applyCoachTactics를 ref에 동기화 (startInterval stale closure 방지)
    applyCoachTacticsRef.current = applyCoachTactics;

    const delegateToCoach = useCallback(() => {
        if (!userTeamId || !coachPrefs) return;
        const state = gameStateRef.current;
        const userTeam = state.home.id === userTeamId ? state.home : state.away;
        // 현재 슬라이더를 기준값으로 스냅샷 저장
        delegationBaseSlidersRef.current = { ...userTeam.tactics.sliders };
        state.isUserDelegated = true;
        timeoutReservedRef.current = false;   // 위임하면 타임아웃은 AI 코치가 판단 — 사용자 예약 해제
        setIsDelegated(true);
        applyCoachTacticsRef.current();
        syncDisplay();
    }, [userTeamId, coachPrefs, syncDisplay]);

    const takeBackControl = useCallback(() => {
        const state = gameStateRef.current;
        state.isUserDelegated = false;
        setIsDelegated(false);
        state.logs.push({
            quarter: state.quarter,
            timeRemaining: formatTime(state.gameClock),
            teamId: userTeamId ?? 'SYSTEM',
            text: `직접 지휘로 복귀`,
            type: 'info',
        });
        syncDisplay();
    }, [userTeamId, syncDisplay]);

    // ────────────────────────────────────────────────────────
    // 유저 액션
    // ────────────────────────────────────────────────────────

    const callTimeout = useCallback(() => {
        if (!userTeamId) return; // spectate mode
        const state = gameStateRef.current;
        if (state.isUserDelegated) return; // 위임 중
        if (isGameEndRef.current) return;
        // [2026-11-23] 예약 중에 다시 누르면 취소
        if (timeoutReservedRef.current) {
            timeoutReservedRef.current = false;
            syncDisplay();
            return;
        }
        const userTeam = state.home.id === userTeamId ? state.home : state.away;
        if (userTeam.timeouts <= 0) return;
        // 지금 부를 수 없으면(라이브볼 중 상대 공 — NBA Rule 5 VI.4, 또는 이미 정지 중) 예약 → 다음 데드볼·우리 공에 발동
        if (!canCallTimeout(state, userTeam.id) || pauseReasonRef.current !== null) {
            timeoutReservedRef.current = true;
            syncDisplay();
            return;
        }

        clearInterval(intervalRef.current!);
        intervalRef.current = null;

        // 엔진이 모든 효과 처리 (타임아웃 차감, 모멘텀 리셋, 핫/콜드 반감, 로그)
        applyTimeout(state, userTeam.id, true);

        pauseReasonRef.current = 'timeout';
        syncDisplay();
    }, [userTeamId, syncDisplay]);

    const applyTactics = useCallback((newSliders: GameTactics['sliders']) => {
        if (!userTeamId) return; // spectate mode
        if (pauseReasonRef.current === 'manual') return; // 사용자 일시정지 중 — 전술 변경 불가
        const state = gameStateRef.current;
        if (state.isUserDelegated) return; // 위임 중
        const userTeam = state.home.id === userTeamId ? state.home : state.away;
        // sliders만 교체 — rotationMap 보존 필수
        userTeam.tactics.sliders = { ...newSliders };
        syncDisplay();
    }, [userTeamId, syncDisplay]);

    const applyRotationMap = useCallback((newMap: Record<string, boolean[]>) => {
        if (!userTeamId) return; // spectate mode
        if (pauseReasonRef.current === 'manual') return; // 사용자 일시정지 중 — 로테이션 변경 불가
        const state = gameStateRef.current;
        if (state.isUserDelegated) return; // 위임 중
        const userTeam = state.home.id === userTeamId ? state.home : state.away;
        userTeam.tactics.rotationMap = { ...newMap };

        // originalRotationMap도 미래 분만 갱신 (파울 트러블 복구 시 유저 의도 반영)
        const currentMinute = scheduleMinute(state);   // [2026-10-26] 연장 = 43+k
        Object.entries(newMap).forEach(([pid, schedule]) => {
            if (!state.originalRotationMap[pid])
                state.originalRotationMap[pid] = Array(48).fill(false);
            for (let i = currentMinute; i < 48; i++)
                state.originalRotationMap[pid][i] = schedule[i];
        });

        syncDisplay();
    }, [userTeamId, syncDisplay]);

    const makeSubstitution = useCallback((outId: string, inId: string) => {
        if (!userTeamId) return; // spectate mode
        if (pauseReasonRef.current === 'manual') return; // 사용자 일시정지 중 — 선수 교체 불가
        if (gameStateRef.current.isUserDelegated) return; // 위임 중
        applyManualSubstitution(gameStateRef.current, userTeamId, outId, inId);
        syncDisplay();
    }, [userTeamId, syncDisplay]);

    const resume = useCallback(() => {
        if (isGameEndRef.current) return;
        pauseReasonRef.current = null;
        startInterval();
        syncDisplay();   // 재개 상태를 다음 틱까지 기다리지 않고 즉시 화면에 반영(일시정지 버튼 반응성)
    }, [startInterval, syncDisplay]);

    const pause = useCallback(() => {
        if (isGameEndRef.current) return;
        if (pauseReasonRef.current !== null) return; // 이미 정지 중(타임아웃·쿼터 휴식 포함)
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        pauseReasonRef.current = 'manual';
        syncDisplay();
    }, [syncDisplay]);

    const getResult = useCallback((): SimulationResult | null => {
        if (!isGameEndRef.current) return null;
        return extractSimResult(gameStateRef.current);
    }, []);

    const setSpeed = useCallback((s: GameSpeed) => {
        speedRef.current = s;
        // 실행 중이라면 interval 재시작
        if (intervalRef.current) {
            startInterval();
        }
        syncDisplay();
    }, [startInterval, syncDisplay]);

    const skipToEnd = useCallback(() => {
        if (isGameEndRef.current) return;
        // 타이머 중단
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        // 모든 포세션을 동기적으로 실행
        const state = gameStateRef.current;
        const MAX_POSSESSIONS = 10000; // 무한루프 방지
        for (let i = 0; i < MAX_POSSESSIONS; i++) {
            const step = stepPossession(state);
            if (step.isGameEnd) break;
            // 쿼터 전환/타임아웃 pause 없이 계속 진행
        }
        pauseReasonRef.current = 'gameEnd';
        isGameEndRef.current = true;
        timeoutReservedRef.current = false;
        syncDisplay();
    }, [syncDisplay]);

    // ────────────────────────────────────────────────────────
    // Derived values
    // ────────────────────────────────────────────────────────

    const state = gameStateRef.current;
    const userTeam = state.home.id === userTeamId ? state.home : state.away;

    return {
        displayState,
        callTimeout,
        applyTactics,
        applyRotationMap,
        makeSubstitution,
        resume,
        pause,
        getResult,
        userOnCourt: userTeam.onCourt,
        userBench: userTeam.bench,
        setSpeed,
        skipToEnd,
        isDelegated,
        canDelegate: !!coachPrefs,
        delegateToCoach,
        takeBackControl,
    };
}

// ─────────────────────────────────────────────────────────────
// 내부 유틸
// ─────────────────────────────────────────────────────────────

function _buildDisplay(
    state: GameState,
    pauseReason: PauseReason | null,
    isGameEnd: boolean,
    speed: GameSpeed,
    userTeamId: string | null,
    timeoutReserved: boolean,
): LiveDisplayState {
    const m = state.momentum;
    const currentTotalSec = elapsedGameSec(state);

    let activeRun: LiveDisplayState['activeRun'] = null;
    if (m.activeRun) {
        const isHome = m.activeRun.teamId === state.home.id;
        const teamPts = isHome ? m.homeEpochPts : m.awayEpochPts;
        const oppPts  = isHome ? m.awayEpochPts : m.homeEpochPts;
        const durationSec = Math.max(0, currentTotalSec - m.activeRun.startTotalSec);
        activeRun = { teamId: m.activeRun.teamId, teamPts, oppPts, durationSec };
    }

    const userTeam = state.home.id === userTeamId ? state.home : state.away;

    // 출전 구간 스냅숏 — 엔진 rotationHistory는 코트 위 선수의 마지막 구간 out이 아직 0/-1(진행 중)이라 현재 시각으로 닫는다
    const onCourtIds = new Set([...state.home.onCourt, ...state.away.onCourt].map(p => p.playerId));
    const rotationData: RotationData = {};
    for (const [pid, segs] of Object.entries(state.rotationHistory)) {
        rotationData[pid] = segs.map((seg, i) =>
            i === segs.length - 1 && onCourtIds.has(pid) && !isGameEnd ? { ...seg, out: currentTotalSec } : seg);
    }

    return {
        homeScore: state.home.score,
        awayScore: state.away.score,
        // [2026-10-26] 연장 중엔 5·6 그대로(OT1·OT2), 옛 방식 경기 종료 후의 5쿼터만 4로 접는다
        quarter: normalizePeriod(state.quarter, countOvertimePeriods(state.logs)),
        gameClock: state.gameClock,
        recentLogs: state.logs.slice(-30),
        allLogs: [...state.logs],
        pauseReason,
        isGameEnd,
        rotationData,
        timeoutReserved,
        timeoutsLeft: { home: state.home.timeouts, away: state.away.timeouts },
        timeoutCallable: { home: canCallTimeout(state, state.home.id), away: canCallTimeout(state, state.away.id) },
        homeOnCourt: [...state.home.onCourt],
        awayOnCourt: [...state.away.onCourt],
        homeBench: [...state.home.bench] as LivePlayer[],
        awayBench: [...state.away.bench] as LivePlayer[],
        activeRun,
        speed,
        shotEvents: [...state.shotEvents],
        homeBox: [...state.home.onCourt, ...state.home.bench] as PlayerBoxScore[],
        awayBox: [...state.away.onCourt, ...state.away.bench] as PlayerBoxScore[],
        homeFouls: state.home.fouls,
        awayFouls: state.away.fouls,
        // 엔진이 rotationMap을 in-place 변이(transferSchedule, benchWithOverride 등)하므로
        // 새 참조를 생성해야 React.memo가 변경을 감지하여 UI에 반영됨
        userTactics: {
            ...userTeam.tactics,
            rotationMap: { ...userTeam.tactics.rotationMap },
        },
        avgPossessionTime: {
            home: state.possessionTimeAccum.home.count > 0
                ? state.possessionTimeAccum.home.total / state.possessionTimeAccum.home.count
                : 0,
            away: state.possessionTimeAccum.away.count > 0
                ? state.possessionTimeAccum.away.total / state.possessionTimeAccum.away.count
                : 0,
        },
        courtSnapshot: state.courtSnapshot,
    };
}

