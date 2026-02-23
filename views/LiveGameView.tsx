
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Team, GameTactics, DepthChart, SimulationResult, PbpLog, PlayerBoxScore } from '../types';
import { useLiveGame, PauseReason, GameSpeed } from '../hooks/useLiveGame';
import { LivePlayer, ShotEvent } from '../services/game/engine/pbp/pbpTypes';
import { TEAM_DATA } from '../data/teamData';
import { BoxScoreTable, GameStatLeaders } from '../components/game/BoxScoreTable';
import { TacticsSlidersPanel } from '../components/dashboard/tactics/TacticsSlidersPanel';
import { COURT_WIDTH, COURT_HEIGHT, HOOP_X_LEFT, HOOP_Y_CENTER } from '../utils/courtCoordinates';

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

type ActiveTab = 'court' | 'boxscore' | 'shotchart' | 'rotation' | 'tactics';

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
        case 'score':     return 'text-emerald-400';
        case 'miss':      return 'text-slate-400';
        case 'block':     return 'text-blue-400';
        case 'turnover':  return 'text-red-400';
        case 'foul':      return 'text-amber-400';
        case 'freethrow': return 'text-cyan-400';
        default:          return 'text-slate-500';
    }
}

function computeLeaders(homeBox: PlayerBoxScore[], awayBox: PlayerBoxScore[]): GameStatLeaders {
    const all = [...homeBox, ...awayBox];
    if (all.length === 0) return { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0 };
    return {
        pts: Math.max(...all.map(p => p.pts)),
        reb: Math.max(...all.map(p => p.reb)),
        ast: Math.max(...all.map(p => p.ast)),
        stl: Math.max(...all.map(p => p.stl)),
        blk: Math.max(...all.map(p => p.blk)),
        tov: Math.max(...all.map(p => p.tov)),
    };
}

// ─────────────────────────────────────────────────────────────
// OnCourt Row (테이블 행 형식)
// ─────────────────────────────────────────────────────────────

const OnCourtRow: React.FC<{
    player: LivePlayer;
    isUser: boolean;
    onSub?: (id: string) => void;
}> = ({ player, isUser, onSub }) => {
    const stamina = Math.round(player.currentCondition);
    const staminaColor = stamina > 60 ? 'text-emerald-400'
                       : stamina > 30 ? 'text-amber-400'
                       : 'text-red-400';

    return (
        <div
            className={`grid items-center gap-x-2 px-3 py-1.5 transition-colors
                ${isUser && onSub ? 'cursor-pointer hover:bg-slate-800/60 active:bg-slate-700/60' : 'hover:bg-slate-800/30'}`}
            style={{ gridTemplateColumns: '1fr auto auto auto auto auto' }}
            onClick={isUser && onSub ? () => onSub(player.playerId) : undefined}
        >
            <span className="text-xs font-bold text-slate-200 truncate">{player.playerName}</span>
            <span className="text-[10px] text-slate-500 w-6 text-center font-mono">{player.position}</span>
            <span className={`text-[10px] font-mono font-bold w-9 text-right ${staminaColor}`}>
                {stamina}%
            </span>
            <span className="text-[10px] font-mono text-white w-6 text-right">{player.pts ?? 0}</span>
            <span className="text-[10px] font-mono text-slate-400 w-6 text-right">{player.reb ?? 0}</span>
            <span className="text-[10px] font-mono text-slate-400 w-6 text-right">{player.ast ?? 0}</span>
        </div>
    );
};

const OnCourtHeader: React.FC = () => (
    <div
        className="grid gap-x-2 px-3 py-1 text-[9px] font-bold text-slate-600 uppercase tracking-widest border-b border-slate-800"
        style={{ gridTemplateColumns: '1fr auto auto auto auto auto' }}
    >
        <span>선수</span>
        <span className="w-6 text-center">P</span>
        <span className="w-9 text-right">STM</span>
        <span className="w-6 text-right">PTS</span>
        <span className="w-6 text-right">REB</span>
        <span className="w-6 text-right">AST</span>
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
// Full Court Shot Chart
// ─────────────────────────────────────────────────────────────

function normalizeShotForDisplay(shot: ShotEvent, isHomeTeam: boolean): { x: number; y: number } {
    let { x, y } = shot;
    if (isHomeTeam) {
        if (x < COURT_WIDTH / 2) { x = COURT_WIDTH - x; y = COURT_HEIGHT - y; }
    } else {
        if (x > COURT_WIDTH / 2) { x = COURT_WIDTH - x; y = COURT_HEIGHT - y; }
    }
    return { x, y };
}

type ShotFilter = 'all' | 'home' | 'away';

const LiveShotChart: React.FC<{
    shotEvents: ShotEvent[];
    homeTeam: Team;
    awayTeam: Team;
}> = ({ shotEvents, homeTeam, awayTeam }) => {
    const [filter, setFilter] = useState<ShotFilter>('all');

    const homeData = TEAM_DATA[homeTeam.id];
    const awayData = TEAM_DATA[awayTeam.id];
    const homeColor = homeData?.colors.primary || '#6366f1';
    const awayColor = awayData?.colors.primary || '#f59e0b';

    const displayShots = shotEvents
        .filter(s => {
            if (filter === 'home') return s.teamId === homeTeam.id;
            if (filter === 'away') return s.teamId === awayTeam.id;
            return true;
        })
        .map(s => {
            const isHome = s.teamId === homeTeam.id;
            const norm = normalizeShotForDisplay(s, isHome);
            return { ...s, ...norm, isHome };
        });

    const LeftBasketLines = () => (
        <g fill="none" stroke="#334155" strokeWidth="0.5">
            <rect x="0" y={(COURT_HEIGHT - 16) / 2} width="19" height="16" />
            <path d={`M 19,${HOOP_Y_CENTER - 6} A 6 6 0 0 1 19,${HOOP_Y_CENTER + 6}`} />
            <line x1="0" y1="3" x2="14" y2="3" />
            <line x1="0" y1="47" x2="14" y2="47" />
            <path d="M 14,3 A 23.75 23.75 0 0 1 14,47" />
            <line x1="4" y1={HOOP_Y_CENTER - 3} x2="4" y2={HOOP_Y_CENTER + 3} stroke="white" strokeWidth="0.5" />
            <circle cx={HOOP_X_LEFT} cy={HOOP_Y_CENTER} r={0.75} stroke="white" />
            <path d={`M ${HOOP_X_LEFT},${HOOP_Y_CENTER - 4} A 4 4 0 0 1 ${HOOP_X_LEFT},${HOOP_Y_CENTER + 4}`} />
        </g>
    );

    const RightBasketLines = () => (
        <g fill="none" stroke="#334155" strokeWidth="0.5" transform={`scale(-1,1) translate(-${COURT_WIDTH},0)`}>
            <rect x="0" y={(COURT_HEIGHT - 16) / 2} width="19" height="16" />
            <path d={`M 19,${HOOP_Y_CENTER - 6} A 6 6 0 0 1 19,${HOOP_Y_CENTER + 6}`} />
            <line x1="0" y1="3" x2="14" y2="3" />
            <line x1="0" y1="47" x2="14" y2="47" />
            <path d="M 14,3 A 23.75 23.75 0 0 1 14,47" />
            <line x1="4" y1={HOOP_Y_CENTER - 3} x2="4" y2={HOOP_Y_CENTER + 3} stroke="white" strokeWidth="0.5" />
            <circle cx={HOOP_X_LEFT} cy={HOOP_Y_CENTER} r={0.75} stroke="white" />
            <path d={`M ${HOOP_X_LEFT},${HOOP_Y_CENTER - 4} A 4 4 0 0 1 ${HOOP_X_LEFT},${HOOP_Y_CENTER + 4}`} />
        </g>
    );

    return (
        <div className="flex flex-col h-full p-4 gap-3">
            <div className="flex items-center justify-between">
                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Shot Chart — Full Court</p>
                <div className="flex gap-1">
                    {([
                        { key: 'all', label: '전체' },
                        { key: 'away', label: awayData?.name || awayTeam.name },
                        { key: 'home', label: homeData?.name || homeTeam.name },
                    ] as { key: ShotFilter; label: string }[]).map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setFilter(key)}
                            className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                                filter === key ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center">
                <div className="relative w-full" style={{ maxHeight: '100%', aspectRatio: `${COURT_WIDTH}/${COURT_HEIGHT}` }}>
                    <svg
                        viewBox={`0 0 ${COURT_WIDTH} ${COURT_HEIGHT}`}
                        className="w-full h-full"
                        style={{ maxHeight: 'calc(100vh - 280px)' }}
                    >
                        <rect x="0" y="0" width={COURT_WIDTH} height={COURT_HEIGHT} fill="#0f172a" rx="1" />
                        <rect x="0" y="0" width={COURT_WIDTH} height={COURT_HEIGHT} fill="none" stroke="#334155" strokeWidth="0.5" />
                        <LeftBasketLines />
                        <RightBasketLines />
                        <line x1="47" y1="0" x2="47" y2={COURT_HEIGHT} stroke="#334155" strokeWidth="0.5" />
                        <circle cx="47" cy={HOOP_Y_CENTER} r="6" fill="none" stroke="#334155" strokeWidth="0.5" />
                        <circle cx="47" cy={HOOP_Y_CENTER} r="2" fill="none" stroke="#334155" strokeWidth="0.5" />
                        <text x="23.5" y="3.5" textAnchor="middle" fontSize="2" fill={awayColor} fontWeight="bold" opacity="0.7">
                            {awayData?.name || awayTeam.name}
                        </text>
                        <text x="70.5" y="3.5" textAnchor="middle" fontSize="2" fill={homeColor} fontWeight="bold" opacity="0.7">
                            {homeData?.name || homeTeam.name}
                        </text>
                        {displayShots.map((shot, i) => {
                            const color = shot.isHome ? homeColor : awayColor;
                            return (
                                <g key={`${shot.id}-${i}`}>
                                    {shot.isMake ? (
                                        <circle cx={shot.x} cy={shot.y} r={0.65} fill={color} stroke="white" strokeWidth="0.1" opacity="0.9" />
                                    ) : (
                                        <g transform={`translate(${shot.x}, ${shot.y})`} opacity="0.6">
                                            <line x1="-0.5" y1="-0.5" x2="0.5" y2="0.5" stroke="#cbd5e1" strokeWidth="0.25" />
                                            <line x1="-0.5" y1="0.5" x2="0.5" y2="-0.5" stroke="#cbd5e1" strokeWidth="0.25" />
                                        </g>
                                    )}
                                </g>
                            );
                        })}
                    </svg>
                </div>
            </div>

            <div className="flex items-center justify-center gap-6 text-[10px] font-bold text-slate-400">
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: awayColor }}></div>
                    <span>{awayData?.name || '원정'} 성공</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: homeColor }}></div>
                    <span>{homeData?.name || '홈'} 성공</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="text-slate-300 text-xs font-black">✕</span>
                    <span>미스</span>
                </div>
                <span className="text-slate-600">|</span>
                <span>총 {displayShots.length}샷 · 성공 {displayShots.filter(s => s.isMake).length}</span>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Box Score Tab
// ─────────────────────────────────────────────────────────────

const LiveBoxScoreTab: React.FC<{
    homeTeam: Team;
    awayTeam: Team;
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
}> = ({ homeTeam, awayTeam, homeBox, awayBox }) => {
    const leaders = computeLeaders(homeBox, awayBox);
    const allBox = [...homeBox, ...awayBox];
    const mvpId = allBox.length > 0
        ? allBox.reduce((best, p) => p.pts > best.pts ? p : best, allBox[0]).playerId
        : undefined;

    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <BoxScoreTable team={awayTeam} box={awayBox} leaders={leaders} mvpId={mvpId} />
            <BoxScoreTable team={homeTeam} box={homeBox} leaders={leaders} mvpId={mvpId} isFirst />
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Rotation Tab (읽기 전용)
// ─────────────────────────────────────────────────────────────

const LiveRotationTab: React.FC<{
    userTactics: GameTactics;
    userTeam: Team;
    currentMinute: number;
    pauseReason: PauseReason | null;
}> = ({ userTactics, userTeam, currentMinute, pauseReason }) => {
    const rotMap = userTactics.rotationMap || {};
    const roster = userTeam.roster;
    const scheduledPlayers = roster.filter(p => rotMap[p.id]?.some(Boolean));
    const canEdit = pauseReason === 'quarterEnd' || pauseReason === 'halftime';
    const quarterBoundaries = [0, 12, 24, 36, 48];
    const quarterLabels = ['Q1', 'Q2', 'Q3', 'Q4'];

    return (
        <div className="flex-1 overflow-auto p-4">
            {canEdit ? (
                <div className="mb-3 px-3 py-2 bg-emerald-900/30 border border-emerald-700/40 rounded-xl text-xs text-emerald-400 font-semibold">
                    ✓ 쿼터 사이 — 로테이션 편집이 활성화됩니다 (다음 버전에서 구현 예정)
                </div>
            ) : (
                <div className="mb-3 px-3 py-2 bg-slate-800/50 border border-slate-700/40 rounded-xl text-xs text-slate-500 font-semibold">
                    경기 중 읽기 전용 — 쿼터 종료/하프타임 시 편집 가능
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="text-[10px] border-collapse w-full">
                    <thead>
                        <tr>
                            <th className="sticky left-0 bg-slate-950 text-slate-500 text-left px-2 py-1 font-semibold min-w-[100px]">선수</th>
                            {Array.from({ length: 48 }, (_, i) => {
                                const isQBoundary = quarterBoundaries.slice(1, -1).includes(i);
                                const isCurrentMin = i === currentMinute;
                                const qLabel = i % 12 === 0 ? quarterLabels[Math.floor(i / 12)] : null;
                                return (
                                    <th
                                        key={i}
                                        className={`w-4 h-6 text-center font-bold transition-colors ${
                                            isCurrentMin
                                                ? 'text-indigo-400 border-l border-r border-indigo-500'
                                                : isQBoundary
                                                ? 'border-l border-slate-600 text-slate-600'
                                                : 'text-slate-700'
                                        }`}
                                    >
                                        {qLabel || (i % 6 === 0 ? i : '')}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {scheduledPlayers.map(p => {
                            const schedule = rotMap[p.id] || Array(48).fill(false);
                            return (
                                <tr key={p.id} className="border-t border-slate-800/50">
                                    <td className="sticky left-0 bg-slate-950 px-2 py-0.5 text-slate-300 font-semibold truncate max-w-[100px]">
                                        {p.name}
                                    </td>
                                    {schedule.map((active: boolean, min: number) => {
                                        const isCurrentMin = min === currentMinute;
                                        return (
                                            <td
                                                key={min}
                                                className={`w-4 h-5 border border-slate-800/30 ${
                                                    isCurrentMin
                                                        ? active
                                                            ? 'bg-indigo-500 border-indigo-400'
                                                            : 'bg-slate-800 border-indigo-500'
                                                        : active
                                                        ? 'bg-indigo-600/60'
                                                        : 'bg-slate-900'
                                                }`}
                                            />
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Tactics Tab
// ─────────────────────────────────────────────────────────────

const LiveTacticsTab: React.FC<{
    userTactics: GameTactics;
    userTeam: Team;
    onApplyTactics: (sliders: GameTactics['sliders']) => void;
}> = ({ userTactics, userTeam, onApplyTactics }) => {
    const handleUpdate = useCallback((t: GameTactics) => {
        onApplyTactics(t.sliders);
    }, [onApplyTactics]);

    return (
        <div className="flex-1 overflow-y-auto p-4">
            <TacticsSlidersPanel
                tactics={userTactics}
                onUpdateTactics={handleUpdate}
                roster={userTeam.roster}
            />
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
        displayState, callTimeout, applyTactics,
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
        shotEvents, homeBox, awayBox, homeFouls, awayFouls, userTactics: liveTactics,
    } = displayState;

    const [activeTab, setActiveTab] = useState<ActiveTab>('court');
    const [subOutId, setSubOutId] = useState<string | null>(null);
    const [pauseCountdown, setPauseCountdown] = useState<number>(30);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const resumeRef = useRef(resume);

    // resume ref 최신 유지
    useEffect(() => { resumeRef.current = resume; });

    const isUserHome = homeTeam.id === userTeamId;
    const homeData = TEAM_DATA[homeTeam.id];
    const awayData = TEAM_DATA[awayTeam.id];

    const userTeam = isUserHome ? homeTeam : awayTeam;
    const userTimeoutsLeft = isUserHome ? timeoutsLeft.home : timeoutsLeft.away;

    const currentMinute = Math.min(47, Math.floor(((quarter - 1) * 720 + (720 - gameClock)) / 60));

    // 30초 카운트다운 (타임아웃/하프타임/쿼터 종료)
    useEffect(() => {
        if (countdownRef.current) clearInterval(countdownRef.current);

        if (pauseReason === null || isGameEnd) {
            setPauseCountdown(30);
            return;
        }

        setPauseCountdown(30);
        countdownRef.current = setInterval(() => {
            setPauseCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(countdownRef.current!);
                    countdownRef.current = null;
                    resumeRef.current();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (countdownRef.current) {
                clearInterval(countdownRef.current);
                countdownRef.current = null;
            }
        };
    }, [pauseReason, isGameEnd]);

    // 경기 종료 처리
    useEffect(() => {
        if (isGameEnd) {
            const result = getResult();
            if (result) {
                const timer = setTimeout(() => onGameEnd(result), 2500);
                return () => clearTimeout(timer);
            }
        }
    }, [isGameEnd, getResult, onGameEnd]);

    const quarterLabel = quarter <= 4 ? `Q${quarter}` : 'Final';
    const isUserTeam = (teamId: string) => teamId === userTeamId;

    const pauseLabel = pauseReason === 'halftime'   ? '하프타임'
                     : pauseReason === 'timeout'    ? '타임아웃'
                     : pauseReason === 'quarterEnd' ? `Q${quarter} 종료`
                     : '';

    const TABS: { key: ActiveTab; label: string }[] = [
        { key: 'court', label: '코트' },
        { key: 'boxscore', label: '박스스코어' },
        { key: 'shotchart', label: '샷차트' },
        { key: 'rotation', label: '로테이션' },
        { key: 'tactics', label: '전술 슬라이더' },
    ];

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">

            {/* ── 스코어버그 헤더 ── */}
            <div className="bg-slate-900 border-b border-slate-800 px-4 pt-3 pb-2 shrink-0">

                {/* 3분할 카드 그리드 */}
                <div className="grid gap-3 items-stretch mb-2" style={{ gridTemplateColumns: '1fr auto 1fr' }}>

                    {/* LEFT: 원정 카드 */}
                    <div
                        className="bg-slate-800/60 rounded-2xl px-4 py-2.5 border-l-4 flex flex-col gap-1"
                        style={{ borderLeftColor: awayData?.colors.primary || '#334155' }}
                    >
                        <div className="flex items-center gap-2">
                            {awayTeam.logo ? (
                                <img src={awayTeam.logo} className="w-7 h-7 object-contain" alt="" />
                            ) : (
                                <div
                                    className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black shrink-0"
                                    style={{ backgroundColor: awayData?.colors.primary || '#334155', color: awayData?.colors.text || '#fff' }}
                                >
                                    {awayTeam.id.slice(0, 3).toUpperCase()}
                                </div>
                            )}
                            <div>
                                <p className="text-[9px] text-slate-400 leading-none">{awayData?.city || ''}</p>
                                <p className="text-xs font-black uppercase tracking-wide leading-tight">{awayData?.name || awayTeam.name}</p>
                            </div>
                        </div>
                        <span className="text-4xl font-black tabular-nums leading-none">{awayScore}</span>
                        <div className="flex items-center gap-3 text-[10px] text-slate-400">
                            <span>파울 <span className="text-white font-bold">{awayFouls}</span></span>
                            <span className="flex gap-0.5">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <span key={i} className={i < timeoutsLeft.away ? 'text-indigo-400' : 'text-slate-700'}>●</span>
                                ))}
                            </span>
                        </div>
                    </div>

                    {/* CENTER: 시계 + 런 / 카운트다운 */}
                    <div className="flex flex-col items-center justify-center gap-1 min-w-[120px] px-2">
                        {pauseReason && pauseReason !== 'gameEnd' ? (
                            // 일시정지 상태: 카운트다운 표시
                            <>
                                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest leading-none">
                                    {pauseLabel}
                                </span>
                                <span className="text-3xl font-black tabular-nums text-amber-400 leading-none">
                                    {pauseCountdown}
                                </span>
                                <button
                                    onClick={resume}
                                    className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold transition-colors"
                                >
                                    종료
                                </button>
                            </>
                        ) : (
                            // 경기 중: 쿼터 + 시계 + 런
                            <>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                                    {quarterLabel}
                                </span>
                                <span className="text-3xl font-black tabular-nums text-white leading-none">
                                    {formatClock(gameClock)}
                                </span>
                                {activeRun ? (
                                    <div className="text-center leading-tight">
                                        <span
                                            className="text-[10px] font-black"
                                            style={{ color: (activeRun.teamId === homeTeam.id ? homeData : awayData)?.colors.primary }}
                                        >
                                            🔥 {(activeRun.teamId === homeTeam.id ? homeData?.name : awayData?.name)?.slice(0, 3).toUpperCase() ?? activeRun.teamId.slice(0, 3).toUpperCase()}
                                        </span>
                                        <span className="text-[10px] font-bold text-white">
                                            {' '}{activeRun.teamPts}-{activeRun.oppPts}
                                            {(activeRun.teamPts - activeRun.oppPts) >= 8 && ` · ${formatDuration(activeRun.durationSec)}`}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="h-4" />
                                )}
                            </>
                        )}
                    </div>

                    {/* RIGHT: 홈 카드 */}
                    <div
                        className="bg-slate-800/60 rounded-2xl px-4 py-2.5 border-r-4 flex flex-col gap-1 items-end"
                        style={{ borderRightColor: homeData?.colors.primary || '#334155' }}
                    >
                        <div className="flex items-center gap-2">
                            <div className="text-right">
                                <p className="text-[9px] text-slate-400 leading-none">{homeData?.city || ''}</p>
                                <p className="text-xs font-black uppercase tracking-wide leading-tight">{homeData?.name || homeTeam.name}</p>
                            </div>
                            {homeTeam.logo ? (
                                <img src={homeTeam.logo} className="w-7 h-7 object-contain" alt="" />
                            ) : (
                                <div
                                    className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-black shrink-0"
                                    style={{ backgroundColor: homeData?.colors.primary || '#334155', color: homeData?.colors.text || '#fff' }}
                                >
                                    {homeTeam.id.slice(0, 3).toUpperCase()}
                                </div>
                            )}
                        </div>
                        <span className="text-4xl font-black tabular-nums leading-none">{homeScore}</span>
                        <div className="flex items-center gap-3 text-[10px] text-slate-400">
                            <span className="flex gap-0.5">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <span key={i} className={i < timeoutsLeft.home ? 'text-indigo-400' : 'text-slate-700'}>●</span>
                                ))}
                            </span>
                            <span>파울 <span className="text-white font-bold">{homeFouls}</span></span>
                        </div>
                    </div>
                </div>

                {/* 컨트롤 바: 속도 + 타임아웃 */}
                <div className="flex items-center justify-center gap-4">
                    <div className="flex gap-1">
                        {([1, 2, 4] as GameSpeed[]).map(s => (
                            <button
                                key={s}
                                onClick={() => setSpeed(s)}
                                className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold transition-colors
                                    ${speed === s ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                            >
                                {s}x
                            </button>
                        ))}
                    </div>
                    {(isUserTeam(homeTeam.id) || isUserTeam(awayTeam.id)) && (
                        <button
                            onClick={callTimeout}
                            disabled={pauseReason !== null || userTimeoutsLeft <= 0}
                            className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500
                                       disabled:opacity-40 disabled:cursor-not-allowed
                                       text-white text-[10px] font-bold transition-colors"
                        >
                            ⏸ 타임아웃 ({userTimeoutsLeft})
                        </button>
                    )}
                </div>
            </div>

            {/* ── 탭 바 ── */}
            <div className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 border-b border-slate-800 shrink-0">
                {TABS.map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => setActiveTab(key)}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                            activeTab === key
                                ? 'bg-indigo-600 text-white'
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* ── Body ── */}
            <div className="flex flex-1 overflow-hidden">

                {/* ── 코트 탭 ── */}
                {activeTab === 'court' && (
                    <>
                        {/* LEFT: 원정팀 OnCourt */}
                        <div className="w-1/4 border-r border-slate-800 bg-slate-950 flex flex-col overflow-hidden">
                            <div className="px-3 py-2 border-b border-slate-800/50 shrink-0">
                                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                                    {awayData?.name || awayTeam.name} — 코트
                                </p>
                            </div>
                            <OnCourtHeader />
                            <div className="flex-1 overflow-y-auto">
                                {awayOnCourt.map(p => (
                                    <OnCourtRow
                                        key={p.playerId}
                                        player={p}
                                        isUser={!isUserHome}
                                        onSub={!isUserHome ? (id) => setSubOutId(id) : undefined}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* CENTER: PBP 로그 (역순 — 최신이 상단) */}
                        <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
                            <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
                                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2">
                                    Play-by-Play <span className="text-slate-700 font-normal normal-case">(최신 순)</span>
                                </p>
                                {allLogs.slice().reverse().map((log, i) => (
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
                        <div className="w-1/4 border-l border-slate-800 bg-slate-950 flex flex-col overflow-hidden">
                            <div className="px-3 py-2 border-b border-slate-800/50 shrink-0">
                                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                                    {homeData?.name || homeTeam.name} — 코트
                                </p>
                            </div>
                            <OnCourtHeader />
                            <div className="flex-1 overflow-y-auto">
                                {homeOnCourt.map(p => (
                                    <OnCourtRow
                                        key={p.playerId}
                                        player={p}
                                        isUser={isUserHome}
                                        onSub={isUserHome ? (id) => setSubOutId(id) : undefined}
                                    />
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {/* ── 박스스코어 탭 ── */}
                {activeTab === 'boxscore' && (
                    <LiveBoxScoreTab
                        homeTeam={homeTeam}
                        awayTeam={awayTeam}
                        homeBox={homeBox}
                        awayBox={awayBox}
                    />
                )}

                {/* ── 샷차트 탭 ── */}
                {activeTab === 'shotchart' && (
                    <LiveShotChart
                        shotEvents={shotEvents}
                        homeTeam={homeTeam}
                        awayTeam={awayTeam}
                    />
                )}

                {/* ── 로테이션 탭 ── */}
                {activeTab === 'rotation' && (
                    <LiveRotationTab
                        userTactics={liveTactics}
                        userTeam={userTeam}
                        currentMinute={currentMinute}
                        pauseReason={pauseReason}
                    />
                )}

                {/* ── 전술 탭 ── */}
                {activeTab === 'tactics' && (
                    <LiveTacticsTab
                        userTactics={liveTactics}
                        userTeam={userTeam}
                        onApplyTactics={applyTactics}
                    />
                )}
            </div>

            {/* ── 경기 종료 오버레이 ── */}
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

            {/* ── 교체 Modal ── */}
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
