
import { useRef, useState, useCallback, useEffect } from 'react';
import { Team, GameTactics, DepthChart, SimulationResult, PbpLog, PlayerBoxScore } from '../types';
import { GameState, LivePlayer, ShotEvent } from '../services/game/engine/pbp/pbpTypes';
import {
    createGameState,
    stepPossession,
    extractSimResult,
    resetMomentum,
    applyManualSubstitution,
} from '../services/game/engine/pbp/liveEngine';

// ─────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────

export type PauseReason = 'timeout' | 'quarterEnd' | 'halftime' | 'gameEnd';

export type GameSpeed = 1 | 2 | 4; // 포세션 간격 배수

/** 포세션당 ms (1x = 600ms) */
const BASE_INTERVAL_MS = 600;

export interface LiveDisplayState {
    homeScore: number;
    awayScore: number;
    quarter: number;
    gameClock: number;          // seconds
    recentLogs: PbpLog[];       // 최근 30개
    allLogs: PbpLog[];          // 전체 누적
    pauseReason: PauseReason | null;
    isGameEnd: boolean;
    timeoutsLeft: { home: number; away: number };
    homeOnCourt: LivePlayer[];
    awayOnCourt: LivePlayer[];
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
}

export interface UseLiveGameReturn {
    displayState: LiveDisplayState;
    // 유저 액션
    callTimeout: () => void;
    applyTactics: (newSliders: GameTactics['sliders']) => void;
    makeSubstitution: (outId: string, inId: string) => void;
    resume: () => void;
    // 경기 종료 후
    getResult: () => SimulationResult | null;
    // OnCourt / Bench (교체 UI용 — 유저 팀만)
    userOnCourt: LivePlayer[];
    userBench: LivePlayer[];
    // 속도 조절
    setSpeed: (s: GameSpeed) => void;
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export function useLiveGame(
    homeTeam: Team,
    awayTeam: Team,
    userTeamId: string,
    userTactics: GameTactics,
    isHomeB2B: boolean = false,
    isAwayB2B: boolean = false,
    homeDepthChart?: DepthChart | null,
    awayDepthChart?: DepthChart | null
): UseLiveGameReturn {

    // ── GameState는 ref로 보유 (리렌더 방지) ──
    const gameStateRef = useRef<GameState>(
        createGameState(homeTeam, awayTeam, userTeamId, userTactics,
            isHomeB2B, isAwayB2B, homeDepthChart, awayDepthChart)
    );

    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pauseReasonRef = useRef<PauseReason | null>(null);
    const isGameEndRef  = useRef(false);
    const speedRef = useRef<GameSpeed>(1);

    const [displayState, setDisplayState] = useState<LiveDisplayState>(() =>
        _buildDisplay(gameStateRef.current, null, false, 1, userTeamId)
    );

    // ── 디스플레이 동기화 헬퍼 ──
    const syncDisplay = useCallback(() => {
        setDisplayState(_buildDisplay(
            gameStateRef.current,
            pauseReasonRef.current,
            isGameEndRef.current,
            speedRef.current,
            userTeamId
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
                syncDisplay();
                return;
            }

            syncDisplay();
        }, BASE_INTERVAL_MS / speedRef.current);
    }, [syncDisplay]);

    // ── 마운트 시 즉시 시작 ──
    useEffect(() => {
        startInterval();
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ────────────────────────────────────────────────────────
    // 유저 액션
    // ────────────────────────────────────────────────────────

    const callTimeout = useCallback(() => {
        const state = gameStateRef.current;
        const userTeam = state.home.id === userTeamId ? state.home : state.away;
        if (userTeam.timeouts <= 0) return;
        if (pauseReasonRef.current !== null) return; // 이미 pause 중

        clearInterval(intervalRef.current!);
        intervalRef.current = null;

        userTeam.timeouts -= 1;

        // 모멘텀 초기화 (타임아웃의 핵심 전략 가치)
        const currentTotalSec = ((state.quarter - 1) * 720) + (720 - state.gameClock);
        resetMomentum(state, currentTotalSec);

        state.logs.push({
            quarter: state.quarter,
            timeRemaining: _formatTime(state.gameClock),
            teamId: userTeam.id,
            text: `⏸ 타임아웃 선언 (잔여: ${userTeam.timeouts}회)`,
            type: 'info',
        });

        pauseReasonRef.current = 'timeout';
        syncDisplay();
    }, [userTeamId, syncDisplay]);

    const applyTactics = useCallback((newSliders: GameTactics['sliders']) => {
        const state = gameStateRef.current;
        const userTeam = state.home.id === userTeamId ? state.home : state.away;
        // sliders만 교체 — rotationMap 보존 필수
        userTeam.tactics.sliders = { ...newSliders };
        syncDisplay();
    }, [userTeamId, syncDisplay]);

    const makeSubstitution = useCallback((outId: string, inId: string) => {
        applyManualSubstitution(gameStateRef.current, userTeamId, outId, inId);
        syncDisplay();
    }, [userTeamId, syncDisplay]);

    const resume = useCallback(() => {
        if (isGameEndRef.current) return;
        pauseReasonRef.current = null;
        startInterval();
    }, [startInterval]);

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

    // ────────────────────────────────────────────────────────
    // Derived values
    // ────────────────────────────────────────────────────────

    const state = gameStateRef.current;
    const userTeam = state.home.id === userTeamId ? state.home : state.away;

    return {
        displayState,
        callTimeout,
        applyTactics,
        makeSubstitution,
        resume,
        getResult,
        userOnCourt: userTeam.onCourt,
        userBench: userTeam.bench,
        setSpeed,
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
    userTeamId: string
): LiveDisplayState {
    const m = state.momentum;
    const currentTotalSec = ((state.quarter - 1) * 720) + (720 - state.gameClock);

    let activeRun: LiveDisplayState['activeRun'] = null;
    if (m.activeRun) {
        const isHome = m.activeRun.teamId === state.home.id;
        const teamPts = isHome ? m.homeEpochPts : m.awayEpochPts;
        const oppPts  = isHome ? m.awayEpochPts : m.homeEpochPts;
        const durationSec = Math.max(0, currentTotalSec - m.activeRun.startTotalSec);
        activeRun = { teamId: m.activeRun.teamId, teamPts, oppPts, durationSec };
    }

    const userTeam = state.home.id === userTeamId ? state.home : state.away;

    return {
        homeScore: state.home.score,
        awayScore: state.away.score,
        quarter: state.quarter > 4 ? 4 : state.quarter,
        gameClock: state.gameClock,
        recentLogs: state.logs.slice(-30),
        allLogs: [...state.logs],
        pauseReason,
        isGameEnd,
        timeoutsLeft: { home: state.home.timeouts, away: state.away.timeouts },
        homeOnCourt: [...state.home.onCourt],
        awayOnCourt: [...state.away.onCourt],
        activeRun,
        speed,
        shotEvents: [...state.shotEvents],
        homeBox: [...state.home.onCourt, ...state.home.bench] as PlayerBoxScore[],
        awayBox: [...state.away.onCourt, ...state.away.bench] as PlayerBoxScore[],
        homeFouls: state.home.fouls,
        awayFouls: state.away.fouls,
        userTactics: userTeam.tactics,
    };
}

function _formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}
