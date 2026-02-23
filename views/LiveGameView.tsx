
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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

const POSITION_ORDER: Record<string, number> = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 };

function sortByPosition(players: LivePlayer[]): LivePlayer[] {
    return [...players].sort((a, b) =>
        (POSITION_ORDER[a.position] ?? 5) - (POSITION_ORDER[b.position] ?? 5)
    );
}

// 공통 grid 템플릿: 이름|P|STM|MP|PTS|REB|AST|STL|BLK|TOV|PF|FG%|3P%
const PLAYER_GRID = 'minmax(0,80px) repeat(12, 1fr)';

// ─────────────────────────────────────────────────────────────
// PlayerRow (on-court + bench 공통)
// ─────────────────────────────────────────────────────────────

interface PlayerRowProps {
    player: LivePlayer;
    dimmed?: boolean;
    draggable?: boolean;
    isDropTarget?: boolean;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDragLeave?: () => void;
    onDrop?: (e: React.DragEvent) => void;
}

const PlayerRow: React.FC<PlayerRowProps> = ({
    player, dimmed = false, draggable = false, isDropTarget = false,
    onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
}) => {
    const stamina = Math.round(player.currentCondition ?? 100);
    const staminaColor = stamina > 60 ? 'text-emerald-400' : stamina > 30 ? 'text-amber-400' : 'text-red-400';
    const fgPct = player.fga > 0 ? Math.round(player.fgm / player.fga * 100) : null;
    const p3Pct = player.p3a > 0 ? Math.round(player.p3m / player.p3a * 100) : null;
    const mp = Math.round(player.mp ?? 0);

    return (
        <div
            draggable={draggable}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`grid items-center gap-x-0.5 px-2 py-1 transition-colors select-none
                ${dimmed ? 'opacity-60' : ''}
                ${draggable ? 'cursor-grab active:cursor-grabbing hover:bg-slate-800/50' : 'hover:bg-slate-800/30'}
                ${isDropTarget ? 'bg-indigo-800/40 ring-1 ring-inset ring-indigo-500/60' : ''}`}
            style={{ gridTemplateColumns: PLAYER_GRID }}
        >
            <span className="text-xs font-semibold text-slate-200 truncate">{player.playerName}</span>
            <span className="text-xs text-slate-500 text-center font-mono">{player.position}</span>
            <span className={`text-xs font-mono font-bold text-right ${staminaColor}`}>{stamina}%</span>
            <span className="text-xs font-mono text-slate-400 text-right">{mp}</span>
            <span className="text-xs font-mono text-white text-right">{player.pts ?? 0}</span>
            <span className="text-xs font-mono text-slate-300 text-right">{player.reb ?? 0}</span>
            <span className="text-xs font-mono text-slate-300 text-right">{player.ast ?? 0}</span>
            <span className="text-xs font-mono text-slate-400 text-right">{player.stl ?? 0}</span>
            <span className="text-xs font-mono text-slate-400 text-right">{player.blk ?? 0}</span>
            <span className="text-xs font-mono text-slate-400 text-right">{player.tov ?? 0}</span>
            <span className={`text-xs font-mono text-right ${(player.pf ?? 0) >= 5 ? 'text-red-400' : 'text-slate-400'}`}>{player.pf ?? 0}</span>
            <span className="text-xs font-mono text-slate-400 text-right">{fgPct !== null ? `${fgPct}%` : '—'}</span>
            <span className="text-xs font-mono text-slate-400 text-right">{p3Pct !== null ? `${p3Pct}%` : '—'}</span>
        </div>
    );
};

const PlayerRowHeader: React.FC<{ label?: string }> = ({ label = '선수' }) => (
    <div
        className="grid gap-x-0.5 px-2 py-1 text-[10px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-800 shrink-0"
        style={{ gridTemplateColumns: PLAYER_GRID }}
    >
        <span>{label}</span>
        <span className="text-center">P</span>
        <span className="text-right">STM</span>
        <span className="text-right">MP</span>
        <span className="text-right">PTS</span>
        <span className="text-right">REB</span>
        <span className="text-right">AST</span>
        <span className="text-right">STL</span>
        <span className="text-right">BLK</span>
        <span className="text-right">TOV</span>
        <span className="text-right">PF</span>
        <span className="text-right">FG%</span>
        <span className="text-right">3P%</span>
    </div>
);

// ─────────────────────────────────────────────────────────────
// OnCourt Panel (출전 중 + 벤치, 한 쪽 팀)
// ─────────────────────────────────────────────────────────────

interface OnCourtPanelProps {
    onCourt: LivePlayer[];
    bench: LivePlayer[];
    isUser: boolean;
    primaryColor: string;
    textColor: string;
    teamName: string;
    teamLogo: string;
    isHome: boolean;
    onSubstitute: (outId: string, inId: string) => void;
}

const OnCourtPanel: React.FC<OnCourtPanelProps> = ({
    onCourt, bench, isUser, primaryColor, textColor, teamName: _teamName, teamLogo, isHome, onSubstitute,
}) => {
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);

    const sortedOnCourt = useMemo(() => sortByPosition(onCourt), [onCourt]);
    const sortedBench   = useMemo(() => sortByPosition(bench),   [bench]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* 헤더 */}
            <div
                className={`shrink-0 px-3 py-2.5 border-b border-slate-800 flex items-center gap-2 ${isHome ? 'flex-row-reverse' : ''}`}
                style={{ backgroundColor: primaryColor }}
            >
                <img src={teamLogo} className="w-6 h-6 object-contain shrink-0" alt="" />
                <span className="text-xs font-black uppercase tracking-wider" style={{ color: textColor }}>
                    On Court
                </span>
            </div>
            <PlayerRowHeader label="현재 뛰는 중" />
            {/* 스크롤 영역 */}
            <div
                className="flex-1 min-h-0 overflow-y-auto"
                style={{ scrollbarWidth: 'none' } as React.CSSProperties}
            >
                {/* 코트 선수 */}
                {sortedOnCourt.map(p => (
                    <PlayerRow
                        key={p.playerId}
                        player={p}
                        isDropTarget={isUser && draggedId !== null && dropTargetId === p.playerId}
                        onDragOver={isUser ? (e) => { e.preventDefault(); setDropTargetId(p.playerId); } : undefined}
                        onDragLeave={isUser ? () => setDropTargetId(null) : undefined}
                        onDrop={isUser ? (e) => {
                            e.preventDefault();
                            if (draggedId) onSubstitute(p.playerId, draggedId);
                            setDraggedId(null);
                            setDropTargetId(null);
                        } : undefined}
                    />
                ))}
                {/* 벤치 구분선 */}
                <div className="flex items-center gap-2 px-2 py-0.5 mt-0.5 border-t border-slate-800/60">
                    <span className="text-[10px] text-slate-600 font-bold tracking-wider">휴식 중</span>
                    {isUser && (
                        <span className="text-[9px] text-slate-700 font-normal">← 드래그로 교체</span>
                    )}
                </div>
                {/* 벤치 선수 */}
                {sortedBench.map(p => (
                    <PlayerRow
                        key={p.playerId}
                        player={p}
                        dimmed
                        draggable={isUser}
                        onDragStart={isUser ? () => setDraggedId(p.playerId) : undefined}
                        onDragEnd={isUser ? () => { setDraggedId(null); setDropTargetId(null); } : undefined}
                    />
                ))}
            </div>
        </div>
    );
};

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

const LiveShotChart: React.FC<{
    shotEvents: ShotEvent[];
    homeTeam: Team;
    awayTeam: Team;
}> = ({ shotEvents, homeTeam, awayTeam }) => {
    const homeData = TEAM_DATA[homeTeam.id];
    const awayData = TEAM_DATA[awayTeam.id];
    const homeColor = homeData?.colors.primary || '#6366f1';
    const awayColor = awayData?.colors.primary || '#f59e0b';

    const displayShots = useMemo(() => shotEvents.map(s => {
        const isHome = s.teamId === homeTeam.id;
        const norm = normalizeShotForDisplay(s, isHome);
        return { ...s, ...norm, isHome };
    }), [shotEvents, homeTeam.id]);

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
        <div className="w-full" style={{ aspectRatio: `${COURT_WIDTH}/${COURT_HEIGHT}` }}>
            <svg viewBox={`0 0 ${COURT_WIDTH} ${COURT_HEIGHT}`} className="w-full h-full">
                <rect x="0" y="0" width={COURT_WIDTH} height={COURT_HEIGHT} fill="#020617" />
                <LeftBasketLines />
                <RightBasketLines />
                <line x1="47" y1="0" x2="47" y2={COURT_HEIGHT} stroke="#334155" strokeWidth="0.5" />
                <circle cx="47" cy={HOOP_Y_CENTER} r="6" fill="none" stroke="#334155" strokeWidth="0.5" />
                <circle cx="47" cy={HOOP_Y_CENTER} r="2" fill="none" stroke="#334155" strokeWidth="0.5" />
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
                {/* 홈팀 로고 (최상위 레이어) */}
                <image
                    href={homeTeam.logo}
                    x={COURT_WIDTH / 2 - 5}
                    y={COURT_HEIGHT / 2 - 5}
                    width="10"
                    height="10"
                    opacity="1"
                    preserveAspectRatio="xMidYMid meet"
                />
            </svg>
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
        setSpeed,
    } = useLiveGame(
        homeTeam, awayTeam, userTeamId, userTactics,
        isHomeB2B, isAwayB2B, homeDepthChart, awayDepthChart
    );

    const {
        homeScore, awayScore, quarter, gameClock,
        allLogs, pauseReason, isGameEnd,
        timeoutsLeft, homeOnCourt, awayOnCourt,
        homeBench, awayBench,
        activeRun, speed,
        shotEvents, homeBox, awayBox,
        homeFouls, awayFouls, userTactics: liveTactics,
    } = displayState;

    const [activeTab, setActiveTab] = useState<ActiveTab>('court');
    const [pbpQuarterFilter, setPbpQuarterFilter] = useState<0 | 1 | 2 | 3 | 4>(0);
    const [pauseCountdown, setPauseCountdown] = useState<number>(30);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const resumeRef = useRef(resume);

    useEffect(() => { resumeRef.current = resume; });

    const isUserHome = homeTeam.id === userTeamId;
    const homeData = TEAM_DATA[homeTeam.id];
    const awayData = TEAM_DATA[awayTeam.id];
    const userTeam = isUserHome ? homeTeam : awayTeam;
    const userTimeoutsLeft = isUserHome ? timeoutsLeft.home : timeoutsLeft.away;
    const currentMinute = Math.min(47, Math.floor(((quarter - 1) * 720 + (720 - gameClock)) / 60));
    const maxSelectableQ = (isGameEnd ? 4 : quarter) as 0 | 1 | 2 | 3 | 4;

    // 30초 카운트다운
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
            if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
        };
    }, [pauseReason, isGameEnd]);

    // 경기 종료 처리
    useEffect(() => {
        if (isGameEnd) {
            const result = getResult();
            if (result) onGameEnd(result);
        }
    }, [isGameEnd, getResult, onGameEnd]);

    const quarterLabel = quarter <= 4 ? `Q${quarter}` : 'Final';
    const isUserTeam = (teamId: string) => teamId === userTeamId;

    const pauseLabel = pauseReason === 'halftime'   ? '하프타임'
                     : pauseReason === 'timeout'    ? '타임아웃'
                     : pauseReason === 'quarterEnd' ? `Q${quarter} 종료`
                     : '';

    // PBP 필터링
    const filteredLogs = useMemo(() => {
        if (pbpQuarterFilter === 0) return allLogs.slice().reverse();
        return allLogs.filter(l => l.quarter === pbpQuarterFilter).slice().reverse();
    }, [allLogs, pbpQuarterFilter]);

    const TABS: { key: ActiveTab; label: string }[] = [
        { key: 'court',    label: '중계' },
        { key: 'boxscore', label: '박스스코어' },
        { key: 'shotchart',label: '샷차트' },
        { key: 'rotation', label: '로테이션' },
        { key: 'tactics',  label: '전술 슬라이더' },
    ];

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">

            {/* ── 스코어버그 헤더 ── */}
            <div className="bg-slate-900 border-b border-slate-800 py-2 shrink-0">
                <div className="flex flex-col items-center gap-1.5">

                    {/* Row 1: 원정 | 시계 | 홈 */}
                    <div className="flex items-center">

                        {/* Away */}
                        <div className="w-60 flex items-center justify-end gap-2 pr-4 border-r border-slate-700/60">
                            <div className="text-right leading-none min-w-0">
                                <p className="text-sm font-black uppercase tracking-wide whitespace-nowrap truncate">
                                    {awayData ? `${awayData.city} ${awayData.name}` : awayTeam.name}
                                </p>
                            </div>
                            <img src={awayTeam.logo} className="w-7 h-7 object-contain shrink-0" alt="" />
                            <span className="text-3xl font-black tabular-nums leading-none text-white shrink-0">{awayScore}</span>
                        </div>

                        {/* Center */}
                        <div className="w-44 flex flex-col items-center justify-center px-3">
                            {pauseReason && pauseReason !== 'gameEnd' ? (
                                <>
                                    <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest leading-none">{pauseLabel}</span>
                                    <span className="text-2xl font-black tabular-nums text-amber-400 leading-tight">{pauseCountdown}</span>
                                    <button
                                        onClick={resume}
                                        className="mt-0.5 px-2.5 py-0.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold transition-colors"
                                    >
                                        종료
                                    </button>
                                </>
                            ) : (
                                <>
                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none">{quarterLabel}</span>
                                    <span className="text-2xl font-black tabular-nums text-white leading-tight">{formatClock(gameClock)}</span>
                                </>
                            )}
                        </div>

                        {/* Home */}
                        <div className="w-60 flex items-center justify-start gap-2 pl-4 border-l border-slate-700/60">
                            <span className="text-3xl font-black tabular-nums leading-none text-white shrink-0">{homeScore}</span>
                            <img src={homeTeam.logo} className="w-7 h-7 object-contain shrink-0" alt="" />
                            <div className="leading-none min-w-0">
                                <p className="text-sm font-black uppercase tracking-wide whitespace-nowrap truncate">
                                    {homeData ? `${homeData.city} ${homeData.name}` : homeTeam.name}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Row 2: 파울+TO | 런 인디케이터 | TO+파울 */}
                    <div className="flex items-center">
                        <div className="w-60 flex items-center justify-end gap-2.5 pr-4 text-[10px] text-slate-400">
                            <span>파울 <span className="text-white font-bold">{awayFouls}</span></span>
                            <span className="flex gap-0.5">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <span key={i} className={i < timeoutsLeft.away ? 'text-indigo-400' : 'text-slate-700'}>●</span>
                                ))}
                            </span>
                        </div>

                        <div className="w-44 flex items-center justify-center px-3 min-h-[18px] overflow-hidden">
                            {activeRun && !pauseReason && (() => {
                                const diff = activeRun.teamPts - activeRun.oppPts;
                                const runTeamData = activeRun.teamId === homeTeam.id ? homeData : awayData;
                                return (
                                    <div className="flex items-center gap-1 whitespace-nowrap">
                                        <span className="text-[10px] font-black text-white">
                                            🔥 {runTeamData?.name?.slice(0, 3).toUpperCase() ?? activeRun.teamId.slice(0, 3).toUpperCase()}
                                        </span>
                                        <span className="text-[10px] font-bold text-white">
                                            {activeRun.teamPts}-{activeRun.oppPts}
                                            {diff >= 8 && ` · ${formatDuration(activeRun.durationSec)}`}
                                        </span>
                                    </div>
                                );
                            })()}
                        </div>

                        <div className="w-60 flex items-center justify-start gap-2.5 pl-4 text-[10px] text-slate-400">
                            <span className="flex gap-0.5">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <span key={i} className={i < timeoutsLeft.home ? 'text-indigo-400' : 'text-slate-700'}>●</span>
                                ))}
                            </span>
                            <span>파울 <span className="text-white font-bold">{homeFouls}</span></span>
                        </div>
                    </div>

                    {/* Row 3: 컨트롤 */}
                    <div className="flex items-center gap-3">
                        {/* 배속 버튼 그룹 */}
                        <div className="flex rounded-lg overflow-hidden border border-slate-700">
                            {([0.5, 1, 2, 4] as GameSpeed[]).map((s, idx) => (
                                <button
                                    key={s}
                                    onClick={() => setSpeed(s)}
                                    className={`px-2.5 py-0.5 text-[10px] font-bold transition-colors
                                        ${idx > 0 ? 'border-l border-slate-700' : ''}
                                        ${speed === s
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                                        }`}
                                >
                                    {s}x
                                </button>
                            ))}
                        </div>
                        {(isUserTeam(homeTeam.id) || isUserTeam(awayTeam.id)) && (
                            <button
                                onClick={callTimeout}
                                disabled={pauseReason !== null || userTimeoutsLeft <= 0}
                                className="px-3 py-0.5 rounded-lg bg-amber-600 hover:bg-amber-500
                                           disabled:opacity-40 disabled:cursor-not-allowed
                                           text-white text-[10px] font-bold transition-colors"
                            >
                                타임아웃 ({userTimeoutsLeft})
                            </button>
                        )}
                    </div>

                </div>
            </div>

            {/* ── 탭 바 ── */}
            <div className="flex items-center justify-center gap-1 px-3 py-1.5 bg-slate-900 border-b border-slate-800 shrink-0">
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

                {/* ── 중계 탭 ── */}
                {activeTab === 'court' && (
                    <>
                        {/* LEFT: 원정팀 */}
                        <div className="w-[30%] border-r border-slate-800 bg-slate-950 flex flex-col overflow-hidden">
                            <OnCourtPanel
                                onCourt={awayOnCourt}
                                bench={awayBench}
                                isUser={!isUserHome}
                                primaryColor={awayData?.colors.primary || '#6366f1'}
                                textColor={awayData?.colors.text || '#ffffff'}
                                teamName={awayData?.name || awayTeam.name}
                                teamLogo={awayTeam.logo}
                                isHome={false}
                                onSubstitute={makeSubstitution}
                            />
                        </div>

                        {/* CENTER: 샷차트(상단) + PBP 로그(하단) */}
                        <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
                            {/* 샷차트 */}
                            <div className="shrink-0 border-b border-slate-800">
                                <LiveShotChart
                                    shotEvents={shotEvents}
                                    homeTeam={homeTeam}
                                    awayTeam={awayTeam}
                                />
                            </div>

                            {/* PBP 로그 */}
                            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                                {/* 헤더 + 필터 */}
                                <div className="shrink-0 px-3 pt-2 pb-1.5 bg-slate-950 border-b border-slate-800/60">
                                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">
                                        Play-by-Play
                                    </p>
                                    <div className="flex gap-1">
                                        {([0, 1, 2, 3, 4] as const).map(q => (
                                            <button
                                                key={q}
                                                onClick={() => setPbpQuarterFilter(q)}
                                                disabled={q > maxSelectableQ}
                                                className={`px-2 py-0.5 rounded text-[9px] font-bold transition-colors
                                                    disabled:opacity-30 disabled:cursor-not-allowed
                                                    ${pbpQuarterFilter === q
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                                    }`}
                                            >
                                                {q === 0 ? '전체' : `${q}Q`}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {/* 스크롤 로그 */}
                                <div
                                    className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-0.5"
                                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
                                >
                                    {filteredLogs.map((log, i) => {
                                        const isScoreEvent = log.type === 'score' || log.type === 'freethrow';
                                        const awayScoreWhite = isScoreEvent && log.teamId === awayTeam.id;
                                        const homeScoreWhite = isScoreEvent && log.teamId === homeTeam.id;
                                        return (
                                            <div key={i} className="flex items-baseline gap-1.5 text-[10px] py-0.5">
                                                <span className="text-slate-600 shrink-0 tabular-nums w-14">
                                                    Q{log.quarter} {log.timeRemaining}
                                                </span>
                                                {log.awayScore !== undefined && (
                                                    <span className="shrink-0 tabular-nums text-[9px] w-10 text-right">
                                                        <span className={awayScoreWhite ? 'text-white font-bold' : 'text-slate-600'}>
                                                            {log.awayScore}
                                                        </span>
                                                        <span className="text-slate-700">-</span>
                                                        <span className={homeScoreWhite ? 'text-white font-bold' : 'text-slate-600'}>
                                                            {log.homeScore}
                                                        </span>
                                                    </span>
                                                )}
                                                <span className={`${logTypeClass(log.type)} min-w-0`}>
                                                    {log.text}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* RIGHT: 홈팀 */}
                        <div className="w-[30%] border-l border-slate-800 bg-slate-950 flex flex-col overflow-hidden">
                            <OnCourtPanel
                                onCourt={homeOnCourt}
                                bench={homeBench}
                                isUser={isUserHome}
                                primaryColor={homeData?.colors.primary || '#6366f1'}
                                textColor={homeData?.colors.text || '#ffffff'}
                                teamName={homeData?.name || homeTeam.name}
                                teamLogo={homeTeam.logo}
                                isHome={true}
                                onSubstitute={makeSubstitution}
                            />
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
                    <div className="flex-1 overflow-auto bg-slate-950 p-4 flex items-start justify-center">
                        <div style={{ width: '100%', maxWidth: '900px' }}>
                            <LiveShotChart
                                shotEvents={shotEvents}
                                homeTeam={homeTeam}
                                awayTeam={awayTeam}
                            />
                        </div>
                    </div>
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
        </div>
    );
};
