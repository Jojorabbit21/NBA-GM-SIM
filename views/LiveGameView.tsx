
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Team, GameTactics, DepthChart, SimulationResult, PbpLog } from '../types';
import { useLiveGame, PauseReason, GameSpeed } from '../hooks/useLiveGame';
import { LivePlayer } from '../services/game/engine/pbp/pbpTypes';
import { TEAM_DATA } from '../data/teamData';

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

interface LiveGameViewProps {
    homeTeam: Team;
    awayTeam: Team;
    userTeamId: string;
    userTactics: GameTactics;
    isHomeB2B?: boolean;
    isAwayB2B?: boolean;
    homeDepthChart?: DepthChart | null;
    awayDepthChart?: DepthChart | null;
    onGameEnd: (result: SimulationResult) => void;
}

// ─────────────────────────────────────────────────────────────
// Util
// ─────────────────────────────────────────────────────────────

function formatClock(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDuration(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function logTypeClass(type: PbpLog['type']): string {
    switch (type) {
        case 'score':    return 'text-emerald-400';
        case 'miss':     return 'text-slate-400';
        case 'block':    return 'text-blue-400';
        case 'turnover': return 'text-red-400';
        case 'foul':     return 'text-amber-400';
        case 'freethrow':return 'text-cyan-400';
        default:         return 'text-slate-500';
    }
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

const ConditionBar: React.FC<{ value: number }> = ({ value }) => {
    const color = value >= 70 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-500' : 'bg-red-500';
    return (
        <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
        </div>
    );
};

const PlayerCard: React.FC<{ player: LivePlayer; isUser: boolean; onSub?: (id: string) => void }> = ({
    player, isUser, onSub
}) => (
    <div className="bg-slate-800 rounded-xl p-2.5 border border-slate-700 text-xs">
        <div className="flex justify-between items-center mb-1">
            <span className="font-semibold text-slate-200 truncate max-w-[80px]">{player.playerName}</span>
            <span className="text-slate-400">{player.position}</span>
        </div>
        <div className="flex justify-between text-slate-400 mb-1.5">
            <span>OVR <span className="text-indigo-400 font-bold">{player.ovr}</span></span>
            <span>PF <span className={player.pf >= 5 ? 'text-red-400' : 'text-slate-300'}>{player.pf}</span></span>
            <span>{Math.round(player.currentCondition)}%</span>
        </div>
        <ConditionBar value={player.currentCondition} />
        {isUser && onSub && (
            <button
                onClick={() => onSub(player.playerId)}
                className="mt-1.5 w-full text-[10px] py-0.5 rounded bg-slate-700 hover:bg-indigo-600 text-slate-300 hover:text-white transition-colors"
            >
                교체
            </button>
        )}
    </div>
);

// ─────────────────────────────────────────────────────────────
// Substitution Modal
// ─────────────────────────────────────────────────────────────

const SubModal: React.FC<{
    outPlayer: LivePlayer;
    bench: LivePlayer[];
    onSub: (inId: string) => void;
    onClose: () => void;
}> = ({ outPlayer, bench, onSub, onClose }) => (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-200 mb-3">
                <span className="text-red-400">{outPlayer.playerName}</span> OUT → 교체 선수 선택
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
                {bench.filter(p => p.health === 'Healthy' && p.pf < 6).map(p => (
                    <button
                        key={p.playerId}
                        onClick={() => { onSub(p.playerId); onClose(); }}
                        className="w-full flex justify-between items-center p-2.5 rounded-xl bg-slate-800 hover:bg-indigo-700 border border-slate-700 text-xs transition-colors"
                    >
                        <div className="text-left">
                            <span className="text-slate-200 font-semibold">{p.playerName}</span>
                            <span className="text-slate-500 ml-2">{p.position}</span>
                        </div>
                        <div className="text-right">
                            <span className="text-indigo-400 font-bold">OVR {p.ovr}</span>
                            <span className="text-slate-400 ml-2">{Math.round(p.currentCondition)}%</span>
                        </div>
                    </button>
                ))}
                {bench.filter(p => p.health === 'Healthy' && p.pf < 6).length === 0 && (
                    <p className="text-slate-500 text-xs text-center py-4">가용 선수 없음</p>
                )}
            </div>
            <button onClick={onClose} className="mt-3 w-full py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs transition-colors">
                취소
            </button>
        </div>
    </div>
);

// ─────────────────────────────────────────────────────────────
// Pause Overlay
// ─────────────────────────────────────────────────────────────

const PauseOverlay: React.FC<{
    reason: PauseReason;
    quarter: number;
    gameClock: number;
    homeTeamName: string;
    awayTeamName: string;
    timeoutsLeft: number;
    userOnCourt: LivePlayer[];
    userBench: LivePlayer[];
    onSub: (outId: string, inId: string) => void;
    onResume: () => void;
}> = ({ reason, quarter, gameClock, homeTeamName, awayTeamName, timeoutsLeft, userOnCourt, userBench, onSub, onResume }) => {
    const [pendingOut, setPendingOut] = useState<string | null>(null);

    const titleMap: Record<PauseReason, string> = {
        timeout: `⏸ 타임아웃 — Q${quarter} ${formatClock(gameClock)}`,
        quarterEnd: `Q${quarter} 종료`,
        halftime: '하프타임',
        gameEnd: '경기 종료',
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-40">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-[420px] space-y-4">
                <div className="text-center">
                    <h2 className="text-lg font-bold text-white">{titleMap[reason]}</h2>
                    {reason === 'timeout' && (
                        <p className="text-slate-400 text-xs mt-1">타임아웃 잔여: <span className="text-amber-400 font-bold">{timeoutsLeft}회</span></p>
                    )}
                </div>

                {/* 선수 교체 */}
                <div>
                    <p className="text-xs text-slate-400 mb-2 font-semibold">코트 위 선수 (교체 선택)</p>
                    <div className="space-y-1.5">
                        {userOnCourt.map(p => (
                            <div key={p.playerId} className="flex justify-between items-center p-2 rounded-xl bg-slate-800 border border-slate-700">
                                <div className="text-xs">
                                    <span className="text-slate-200 font-semibold">{p.playerName}</span>
                                    <span className="text-slate-500 ml-2">{p.position}</span>
                                    <span className="text-slate-400 ml-2">체력 {Math.round(p.currentCondition)}%</span>
                                </div>
                                <button
                                    onClick={() => setPendingOut(p.playerId)}
                                    className="text-[10px] px-2 py-1 rounded-lg bg-slate-700 hover:bg-indigo-600 text-slate-300 hover:text-white transition-colors"
                                >
                                    교체
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {reason !== 'gameEnd' && (
                    <button
                        onClick={onResume}
                        className="w-full py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-colors"
                    >
                        ▶ 경기 재개
                    </button>
                )}

                {pendingOut && (
                    <SubModal
                        outPlayer={userOnCourt.find(p => p.playerId === pendingOut)!}
                        bench={userBench}
                        onSub={(inId) => { onSub(pendingOut, inId); setPendingOut(null); }}
                        onClose={() => setPendingOut(null)}
                    />
                )}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Main View
// ─────────────────────────────────────────────────────────────

export const LiveGameView: React.FC<LiveGameViewProps> = ({
    homeTeam, awayTeam, userTeamId, userTactics,
    isHomeB2B, isAwayB2B, homeDepthChart, awayDepthChart, onGameEnd,
}) => {
    const {
        displayState, callTimeout, applyTactics: _applyTactics,
        makeSubstitution, resume, getResult,
        userOnCourt, userBench, setSpeed,
    } = useLiveGame(
        homeTeam, awayTeam, userTeamId, userTactics,
        isHomeB2B, isAwayB2B, homeDepthChart, awayDepthChart
    );

    const {
        homeScore, awayScore, quarter, gameClock,
        allLogs, pauseReason, isGameEnd,
        timeoutsLeft, homeOnCourt, awayOnCourt, activeRun, speed,
    } = displayState;

    const logContainerRef = useRef<HTMLDivElement>(null);
    const isAtBottomRef = useRef(true);
    const [subOutId, setSubOutId] = useState<string | null>(null);
    const isUserHome = homeTeam.id === userTeamId;

    const homeData = TEAM_DATA[homeTeam.id];
    const awayData = TEAM_DATA[awayTeam.id];

    // 경기 종료 처리
    useEffect(() => {
        if (isGameEnd) {
            const result = getResult();
            if (result) {
                // 2초 딜레이 후 콜백 (종료 overlay 보이게)
                const timer = setTimeout(() => onGameEnd(result), 2500);
                return () => clearTimeout(timer);
            }
        }
    }, [isGameEnd, getResult, onGameEnd]);

    // 스크롤 위치 추적 — 유저가 위로 올렸으면 자동 스크롤 중단
    const handleLogScroll = useCallback(() => {
        const el = logContainerRef.current;
        if (!el) return;
        isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    }, []);

    // PBP 로그 자동 스크롤 — scrollTop 직접 제어 (scrollIntoView는 페이지 전체를 스크롤함)
    useEffect(() => {
        if (isAtBottomRef.current) {
            const el = logContainerRef.current;
            if (el) el.scrollTop = el.scrollHeight;
        }
    }, [allLogs.length]);

    const quarterLabel = quarter <= 4 ? `Q${quarter}` : 'Final';
    const isUserTeam = (teamId: string) => teamId === userTeamId;

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">

            {/* ── 헤더 Row 1: 스코어보드 ── */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800">
                {/* 원정팀 */}
                <div className="flex items-center gap-2 w-1/3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: awayData?.colors.primary || '#334155', color: awayData?.colors.text || '#fff' }}>
                        {awayTeam.id.toUpperCase().slice(0, 3)}
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-400">{awayData?.city}</p>
                        <p className="text-sm font-bold">{awayData?.name || awayTeam.name}</p>
                    </div>
                    <span className="text-3xl font-black ml-2">{awayScore}</span>
                </div>

                {/* 중앙: 쿼터 + 시계 */}
                <div className="flex flex-col items-center">
                    <span className="text-xs text-slate-400 font-semibold">{quarterLabel}</span>
                    <span className="text-2xl font-black tabular-nums">{formatClock(gameClock)}</span>
                </div>

                {/* 홈팀 */}
                <div className="flex items-center justify-end gap-2 w-1/3">
                    <span className="text-3xl font-black mr-2">{homeScore}</span>
                    <div className="text-right">
                        <p className="text-[10px] text-slate-400">{homeData?.city}</p>
                        <p className="text-sm font-bold">{homeData?.name || homeTeam.name}</p>
                    </div>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: homeData?.colors.primary || '#334155', color: homeData?.colors.text || '#fff' }}>
                        {homeTeam.id.toUpperCase().slice(0, 3)}
                    </div>
                </div>
            </div>

            {/* ── 헤더 Row 2: 메타 정보 ── */}
            <div className="flex items-center justify-between px-4 py-1.5 bg-slate-900 border-b border-slate-800 text-xs">
                {/* 원정팀 메타 */}
                <div className="flex items-center gap-3 text-slate-400">
                    <span>TO {timeoutsLeft.away}회</span>
                    <span>파울 —</span>
                </div>

                {/* 런 인디케이터 + 속도 */}
                <div className="flex items-center gap-4">
                    {activeRun && (() => {
                        const runTeam = activeRun.teamId === homeTeam.id ? homeData : awayData;
                        const diff = activeRun.teamPts - activeRun.oppPts;
                        const showTimer = diff >= 8;
                        return (
                            <span className="font-bold" style={{ color: runTeam?.colors.primary || '#6366f1' }}>
                                🔥 {runTeam?.name || activeRun.teamId.toUpperCase()} {activeRun.teamPts}-{activeRun.oppPts}
                                {showTimer && ` · ${formatDuration(activeRun.durationSec)}`}
                            </span>
                        );
                    })()}

                    {/* 속도 토글 */}
                    <div className="flex gap-1">
                        {([1, 2, 4] as GameSpeed[]).map(s => (
                            <button
                                key={s}
                                onClick={() => setSpeed(s)}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${speed === s ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                            >
                                {s}x
                            </button>
                        ))}
                    </div>

                    {/* 타임아웃 버튼 */}
                    {isUserTeam(homeTeam.id) || isUserTeam(awayTeam.id) ? (
                        <button
                            onClick={callTimeout}
                            disabled={pauseReason !== null || (isUserTeam(homeTeam.id) ? timeoutsLeft.home : timeoutsLeft.away) <= 0}
                            className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-[10px] font-bold transition-colors"
                        >
                            ⏸ 타임아웃 ({isUserTeam(homeTeam.id) ? timeoutsLeft.home : timeoutsLeft.away})
                        </button>
                    ) : null}
                </div>

                {/* 홈팀 메타 */}
                <div className="flex items-center gap-3 text-slate-400 justify-end">
                    <span>파울 —</span>
                    <span>TO {timeoutsLeft.home}회</span>
                </div>
            </div>

            {/* ── 바디: 3컬럼 ── */}
            <div className="flex flex-1 overflow-hidden">

                {/* LEFT: 원정팀 OnCourt */}
                <div className="w-1/4 p-3 border-r border-slate-800 overflow-y-auto space-y-2 bg-slate-950">
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">
                        {awayData?.name || awayTeam.name} — 코트
                    </p>
                    {awayOnCourt.map(p => (
                        <PlayerCard
                            key={p.playerId}
                            player={p}
                            isUser={!isUserHome}
                            onSub={!isUserHome ? (id) => setSubOutId(id) : undefined}
                        />
                    ))}
                </div>

                {/* CENTER: PBP 로그 */}
                <div className="flex-1 flex flex-col bg-slate-950">
                    {/* PBP 로그 */}
                    <div
                        ref={logContainerRef}
                        onScroll={handleLogScroll}
                        className="flex-1 overflow-y-auto p-3 space-y-0.5"
                    >
                        <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2">Play-by-Play</p>
                        {allLogs.map((log, i) => (
                            <div key={i} className="flex gap-2 text-xs py-0.5">
                                <span className="text-slate-600 shrink-0 tabular-nums w-16">
                                    Q{log.quarter} {log.timeRemaining}
                                </span>
                                <span className={logTypeClass(log.type)}>
                                    {log.text}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* RIGHT: 홈팀 OnCourt */}
                <div className="w-1/4 p-3 border-l border-slate-800 overflow-y-auto space-y-2 bg-slate-950">
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">
                        {homeData?.name || homeTeam.name} — 코트
                    </p>
                    {homeOnCourt.map(p => (
                        <PlayerCard
                            key={p.playerId}
                            player={p}
                            isUser={isUserHome}
                            onSub={isUserHome ? (id) => setSubOutId(id) : undefined}
                        />
                    ))}
                </div>
            </div>

            {/* ── Pause Overlay ── */}
            {pauseReason && pauseReason !== 'gameEnd' && (
                <PauseOverlay
                    reason={pauseReason}
                    quarter={quarter}
                    gameClock={gameClock}
                    homeTeamName={homeData?.name || homeTeam.name}
                    awayTeamName={awayData?.name || awayTeam.name}
                    timeoutsLeft={isUserHome ? timeoutsLeft.home : timeoutsLeft.away}
                    userOnCourt={userOnCourt}
                    userBench={userBench}
                    onSub={makeSubstitution}
                    onResume={resume}
                />
            )}

            {isGameEnd && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 text-center">
                        <p className="text-2xl font-black text-white mb-2">경기 종료</p>
                        <p className="text-4xl font-black">
                            <span style={{ color: awayData?.colors.primary || '#6366f1' }}>{awayScore}</span>
                            <span className="text-slate-400 mx-3">–</span>
                            <span style={{ color: homeData?.colors.primary || '#6366f1' }}>{homeScore}</span>
                        </p>
                        <p className="text-slate-400 text-sm mt-3">결과 화면으로 이동 중...</p>
                    </div>
                </div>
            )}

            {/* 인라인 교체 Modal (경기 중) */}
            {subOutId && (
                <SubModal
                    outPlayer={userOnCourt.find(p => p.playerId === subOutId)!}
                    bench={userBench}
                    onSub={(inId) => { makeSubstitution(subOutId, inId); setSubOutId(null); }}
                    onClose={() => setSubOutId(null)}
                />
            )}
        </div>
    );
};
