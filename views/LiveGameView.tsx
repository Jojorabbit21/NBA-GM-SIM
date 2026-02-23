
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Team, GameTactics, DepthChart, SimulationResult, PbpLog, PlayerBoxScore } from '../types';
import { useLiveGame, PauseReason, GameSpeed } from '../hooks/useLiveGame';
import { LivePlayer, ShotEvent } from '../services/game/engine/pbp/pbpTypes';
import { TEAM_DATA } from '../data/teamData';
import { BoxScoreTable, GameStatLeaders } from '../components/game/BoxScoreTable';
import { TacticsSlidersPanel } from '../components/dashboard/tactics/TacticsSlidersPanel';
import { COURT_WIDTH, COURT_HEIGHT, HOOP_X_LEFT, HOOP_Y_CENTER } from '../utils/courtCoordinates';
import { UserPlus, UserMinus, Clock } from 'lucide-react';

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
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDuration(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
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

// 공통 grid 템플릿: 이름|P|STM|MP|PTS|REB|AST|STL|BLK|TOV|PF|FG|3P
const PLAYER_GRID = 'minmax(0,80px) repeat(12, 1fr)';

// stat key → column index (0-based from first stat column)
type StatKey = 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'tov' | 'pf' | 'fgm' | 'fga' | 'p3m' | 'p3a';
const TRACKED_STATS: StatKey[] = ['pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'pf', 'fgm', 'fga', 'p3m', 'p3a'];

function getStatSnapshot(p: LivePlayer): Record<StatKey, number> {
    return { pts: p.pts, reb: p.reb, ast: p.ast, stl: p.stl, blk: p.blk, tov: p.tov, pf: p.pf ?? 0, fgm: p.fgm, fga: p.fga, p3m: p.p3m, p3a: p.p3a };
}

// 셀 하이라이트 키: "playerId:statKey"
type HighlightKey = string;

// ─────────────────────────────────────────────────────────────
// PlayerRow (on-court + bench 공통)
// ─────────────────────────────────────────────────────────────

interface PlayerRowProps {
    player: LivePlayer;
    dimmed?: boolean;
    draggable?: boolean;
    isDropTarget?: boolean;
    highlightedStats?: Set<HighlightKey>;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    onDragOver?: (e: React.DragEvent) => void;
    onDragLeave?: () => void;
    onDrop?: (e: React.DragEvent) => void;
}

const hlBg = 'bg-amber-400/25';

const PlayerRow: React.FC<PlayerRowProps> = ({
    player, dimmed = false, draggable = false, isDropTarget = false,
    highlightedStats,
    onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
}) => {
    const stamina = Math.round(player.currentCondition ?? 100);
    const staminaColor = stamina > 60 ? 'text-emerald-400' : stamina > 30 ? 'text-amber-400' : 'text-red-400';
    const mp = Math.round(player.mp ?? 0);
    const hl = (stat: StatKey) => highlightedStats?.has(`${player.playerId}:${stat}`) ? hlBg : '';

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
            <span className={`text-xs font-mono text-white text-right transition-colors duration-300 ${hl('pts')}`}>{player.pts ?? 0}</span>
            <span className={`text-xs font-mono text-slate-300 text-right transition-colors duration-300 ${hl('reb')}`}>{player.reb ?? 0}</span>
            <span className={`text-xs font-mono text-slate-300 text-right transition-colors duration-300 ${hl('ast')}`}>{player.ast ?? 0}</span>
            <span className={`text-xs font-mono text-slate-400 text-right transition-colors duration-300 ${hl('stl')}`}>{player.stl ?? 0}</span>
            <span className={`text-xs font-mono text-slate-400 text-right transition-colors duration-300 ${hl('blk')}`}>{player.blk ?? 0}</span>
            <span className={`text-xs font-mono text-slate-400 text-right transition-colors duration-300 ${hl('tov')}`}>{player.tov ?? 0}</span>
            <span className={`text-xs font-mono text-right transition-colors duration-300 ${(player.pf ?? 0) >= 5 ? 'text-red-400' : 'text-slate-400'} ${hl('pf')}`}>{player.pf ?? 0}</span>
            <span className={`text-xs font-mono text-slate-400 text-right transition-colors duration-300 ${hl('fgm') || hl('fga')}`}>{player.fgm}-{player.fga}</span>
            <span className={`text-xs font-mono text-slate-400 text-right transition-colors duration-300 ${hl('p3m') || hl('p3a')}`}>{player.p3m}-{player.p3a}</span>
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
        <span className="text-right">FG</span>
        <span className="text-right">3P</span>
    </div>
);

// ─────────────────────────────────────────────────────────────
// OnCourt Panel (출전 중 + 벤치, 한 쪽 팀)
// ─────────────────────────────────────────────────────────────

interface OnCourtPanelProps {
    onCourt: LivePlayer[];
    bench: LivePlayer[];
    isUser: boolean;
    onSubstitute: (outId: string, inId: string) => void;
}

const OnCourtPanel: React.FC<OnCourtPanelProps> = ({
    onCourt, bench, isUser, onSubstitute,
}) => {
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    const [highlightedStats, setHighlightedStats] = useState<Set<HighlightKey>>(new Set());
    const prevStatsRef = useRef<Record<string, Record<StatKey, number>>>({});

    const sortedOnCourt = useMemo(() => sortByPosition(onCourt), [onCourt]);
    const sortedBench   = useMemo(() => sortByPosition(bench),   [bench]);

    // 스탯 변화 감지 → 하이라이트
    useEffect(() => {
        const allPlayers = [...onCourt, ...bench];
        const prev = prevStatsRef.current;
        const newHighlights: HighlightKey[] = [];

        for (const p of allPlayers) {
            const snap = getStatSnapshot(p);
            const old = prev[p.playerId];
            if (old) {
                for (const k of TRACKED_STATS) {
                    if (snap[k] !== old[k]) {
                        newHighlights.push(`${p.playerId}:${k}`);
                    }
                }
            }
            prev[p.playerId] = snap;
        }

        if (newHighlights.length > 0) {
            setHighlightedStats(s => {
                const next = new Set(s);
                for (const h of newHighlights) next.add(h);
                return next;
            });

            const timer = setTimeout(() => {
                setHighlightedStats(s => {
                    const next = new Set(s);
                    for (const h of newHighlights) next.delete(h);
                    return next;
                });
            }, 800);

            return () => clearTimeout(timer);
        }
    }, [onCourt, bench]);

    // 팀 합계 계산 (FG/3P는 합산)
    const teamTotal = useMemo(() => {
        const all = [...onCourt, ...bench];
        if (all.length === 0) return null;
        const sum = (fn: (p: LivePlayer) => number) => all.reduce((acc, p) => acc + fn(p), 0);
        return {
            mp: Math.round(sum(p => p.mp ?? 0)),
            pts: sum(p => p.pts),
            reb: sum(p => p.reb),
            ast: sum(p => p.ast),
            stl: sum(p => p.stl),
            blk: sum(p => p.blk),
            tov: sum(p => p.tov),
            pf: sum(p => p.pf ?? 0),
            fgm: sum(p => p.fgm),
            fga: sum(p => p.fga),
            p3m: sum(p => p.p3m),
            p3a: sum(p => p.p3a),
        };
    }, [onCourt, bench]);

    return (
        <div className="flex flex-col h-full overflow-hidden">
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
                        highlightedStats={highlightedStats}
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
                {/* 출전/휴식 구분선 */}
                <div className="border-t-2 border-slate-700/80 mt-1" />
                {/* 휴식 중 헤더 */}
                <div className="flex items-center gap-2 px-2 py-1 border-b border-slate-700/60">
                    <span className="text-[10px] text-slate-500 font-bold tracking-wider">휴식 중</span>
                    {isUser && (
                        <span className="text-[9px] text-slate-600 font-normal">← 드래그로 교체</span>
                    )}
                </div>
                {/* 벤치 선수 */}
                {sortedBench.map(p => (
                    <PlayerRow
                        key={p.playerId}
                        player={p}
                        highlightedStats={highlightedStats}
                        draggable={isUser}
                        onDragStart={isUser ? () => setDraggedId(p.playerId) : undefined}
                        onDragEnd={isUser ? () => { setDraggedId(null); setDropTargetId(null); } : undefined}
                    />
                ))}
                {/* 팀 합계 행 */}
                {teamTotal && (
                    <>
                        <div className="border-t border-slate-700/60" />
                        <div
                            className="grid items-center gap-x-0.5 px-2 py-1.5 bg-slate-800/40"
                            style={{ gridTemplateColumns: PLAYER_GRID }}
                        >
                            <span className="text-xs font-black text-slate-400 truncate">TEAM</span>
                            <span className="text-xs text-center" />
                            <span className="text-xs text-right" />
                            <span className="text-xs font-mono text-slate-400 text-right">{teamTotal.mp}</span>
                            <span className="text-xs font-mono text-white text-right">{teamTotal.pts}</span>
                            <span className="text-xs font-mono text-slate-300 text-right">{teamTotal.reb}</span>
                            <span className="text-xs font-mono text-slate-300 text-right">{teamTotal.ast}</span>
                            <span className="text-xs font-mono text-slate-400 text-right">{teamTotal.stl}</span>
                            <span className="text-xs font-mono text-slate-400 text-right">{teamTotal.blk}</span>
                            <span className="text-xs font-mono text-slate-400 text-right">{teamTotal.tov}</span>
                            <span className="text-xs font-mono text-slate-400 text-right">{teamTotal.pf}</span>
                            <span className="text-xs font-mono text-slate-400 text-right">{teamTotal.fgm}-{teamTotal.fga}</span>
                            <span className="text-xs font-mono text-slate-400 text-right">{teamTotal.p3m}-{teamTotal.p3a}</span>
                        </div>
                    </>
                )}
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
        makeSubstitution, resume, pause, getResult,
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
            <div className="relative bg-slate-900 border-b border-slate-800 py-5 px-[20%] shrink-0 overflow-hidden">

                {/* 원정 로고 — 왼쪽 극단, 크롭 */}
                <img
                    src={awayTeam.logo}
                    className="absolute left-[8%] top-1/2 -translate-y-1/2 w-28 h-28 object-contain opacity-20 pointer-events-none select-none"
                    alt=""
                />
                {/* 홈 로고 — 오른쪽 극단, 크롭 */}
                <img
                    src={homeTeam.logo}
                    className="absolute right-[8%] top-1/2 -translate-y-1/2 w-28 h-28 object-contain opacity-20 pointer-events-none select-none"
                    alt=""
                />

                {/* 3-column grid: Away(1fr) | Center(auto, 고정폭) | Home(1fr) */}
                <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center">

                    {/* Away: 팀명+로고 + 파울/TO | 점수 — 오른쪽 정렬 */}
                    <div className="flex items-center justify-end gap-3">
                        <div className="flex flex-col items-end gap-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <img src={awayTeam.logo} className="w-10 h-10 object-contain shrink-0" alt="" />
                                <span className="text-xl font-black uppercase tracking-wide whitespace-nowrap truncate">
                                    {awayData ? `${awayData.city} ${awayData.name}` : awayTeam.name}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                {awayFouls >= 5 ? (
                                    <span className="px-1.5 py-0 rounded text-[9px] font-black bg-amber-500 text-slate-900 leading-relaxed">BONUS</span>
                                ) : (
                                    <span>파울 <span className="text-white font-bold tabular-nums">{awayFouls}</span></span>
                                )}
                                <span className="flex gap-0.5">
                                    {Array.from({ length: 4 }).map((_, i) => (
                                        <span key={i} className={i < timeoutsLeft.away ? 'text-amber-400' : 'text-slate-700'}>●</span>
                                    ))}
                                </span>
                            </div>
                        </div>
                        <span className="text-5xl font-black oswald tabular-nums leading-none text-white w-[4ch] text-right shrink-0">{awayScore}</span>
                    </div>

                    {/* Center: 시계 + 런(조건부) — 고정 폭 */}
                    <div className="w-[280px] flex flex-col items-center justify-center mx-4">
                        {/* 시계 / 일시정지 */}
                        <div className="flex items-center justify-center gap-2">
                            {pauseReason && pauseReason !== 'gameEnd' ? (
                                <>
                                    <span className="text-2xl font-black oswald tabular-nums text-amber-400 leading-none">{pauseLabel}</span>
                                    <span className="text-2xl font-black oswald tabular-nums text-amber-400 leading-none w-[2ch] text-center">{pauseCountdown}</span>
                                    <button
                                        onClick={resume}
                                        className="px-2.5 py-0.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold transition-colors"
                                    >
                                        종료
                                    </button>
                                </>
                            ) : (
                                <>
                                    <span className="text-2xl font-black oswald tabular-nums text-white leading-none">{quarterLabel}</span>
                                    <span className="text-2xl font-black oswald tabular-nums text-white leading-none">{formatClock(gameClock)}</span>
                                </>
                            )}
                        </div>
                        {/* 런 인디케이터 — 없으면 완전히 숨김 */}
                        {activeRun && !pauseReason && (() => {
                            const diff = activeRun.teamPts - activeRun.oppPts;
                            const runTeamData = activeRun.teamId === homeTeam.id ? homeData : awayData;
                            return (
                                <div className="mt-1 text-center">
                                    <span className="text-[10px] font-bold text-white whitespace-nowrap">
                                        🔥 {runTeamData?.name?.slice(0, 3).toUpperCase() ?? activeRun.teamId.slice(0, 3).toUpperCase()}{' '}
                                        {activeRun.teamPts}-{activeRun.oppPts}
                                        {diff >= 8 && ` · ${formatDuration(activeRun.durationSec)}`}
                                    </span>
                                </div>
                            );
                        })()}
                    </div>

                    {/* Home: 점수 | 로고+팀명 + 파울/TO — 왼쪽 정렬 */}
                    <div className="flex items-center justify-start gap-3">
                        <span className="text-5xl font-black oswald tabular-nums leading-none text-white w-[4ch] text-left shrink-0">{homeScore}</span>
                        <div className="flex flex-col items-start gap-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <img src={homeTeam.logo} className="w-10 h-10 object-contain shrink-0" alt="" />
                                <span className="text-xl font-black uppercase tracking-wide whitespace-nowrap truncate">
                                    {homeData ? `${homeData.city} ${homeData.name}` : homeTeam.name}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                                <span className="flex gap-0.5">
                                    {Array.from({ length: 4 }).map((_, i) => (
                                        <span key={i} className={i < timeoutsLeft.home ? 'text-amber-400' : 'text-slate-700'}>●</span>
                                    ))}
                                </span>
                                {homeFouls >= 5 ? (
                                    <span className="px-1.5 py-0 rounded text-[9px] font-black bg-amber-500 text-slate-900 leading-relaxed">BONUS</span>
                                ) : (
                                    <span>파울 <span className="text-white font-bold tabular-nums">{homeFouls}</span></span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── 탭 바 (3등분: 유저측 컨트롤 | 탭 | 빈칸 또는 반대) ── */}
            <div className="grid grid-cols-3 items-center px-3 py-1.5 bg-slate-900 border-b border-slate-800 shrink-0">
                {/* 왼쪽 */}
                <div className={`flex items-center gap-2 ${isUserHome ? 'justify-start' : 'justify-start'}`}>
                    {!isUserHome && (
                        <>
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
                            <button
                                onClick={callTimeout}
                                disabled={pauseReason !== null || userTimeoutsLeft <= 0}
                                className="px-3 py-0.5 rounded-lg bg-amber-600 hover:bg-amber-500
                                           disabled:opacity-40 disabled:cursor-not-allowed
                                           text-white text-[10px] font-bold transition-colors"
                            >
                                타임아웃 ({userTimeoutsLeft})
                            </button>
                            <button
                                onClick={pauseReason ? resume : pause}
                                disabled={isGameEnd}
                                className="px-3 py-0.5 rounded-lg bg-slate-700 hover:bg-slate-600
                                           disabled:opacity-40 disabled:cursor-not-allowed
                                           text-slate-300 text-[10px] font-bold transition-colors"
                            >
                                {pauseReason ? '재개(개발용)' : '일시정지(개발용)'}
                            </button>
                        </>
                    )}
                </div>
                {/* 중앙: 탭 */}
                <div className="flex items-center justify-center gap-1">
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
                {/* 오른쪽 */}
                <div className={`flex items-center gap-2 ${isUserHome ? 'justify-end' : 'justify-end'}`}>
                    {isUserHome && (
                        <>
                            <button
                                onClick={pauseReason ? resume : pause}
                                disabled={isGameEnd}
                                className="px-3 py-0.5 rounded-lg bg-slate-700 hover:bg-slate-600
                                           disabled:opacity-40 disabled:cursor-not-allowed
                                           text-slate-300 text-[10px] font-bold transition-colors"
                            >
                                {pauseReason ? '재개(개발용)' : '일시정지(개발용)'}
                            </button>
                            <button
                                onClick={callTimeout}
                                disabled={pauseReason !== null || userTimeoutsLeft <= 0}
                                className="px-3 py-0.5 rounded-lg bg-amber-600 hover:bg-amber-500
                                           disabled:opacity-40 disabled:cursor-not-allowed
                                           text-white text-[10px] font-bold transition-colors"
                            >
                                타임아웃 ({userTimeoutsLeft})
                            </button>
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
                        </>
                    )}
                </div>
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
                                    <div className="flex items-center gap-3">
                                        <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
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
                                </div>
                                {/* 스크롤 로그 */}
                                <div
                                    className="flex-1 min-h-0 overflow-y-auto font-mono text-xs"
                                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
                                >
                                    <div className="divide-y divide-slate-800/50">
                                        {filteredLogs.map((log, i) => {
                                            const isHome = log.teamId === homeTeam.id;
                                            const isScore = log.type === 'score';
                                            const isFT = log.type === 'freethrow';
                                            const isFoul = log.type === 'foul';
                                            const isTurnover = log.type === 'turnover';
                                            const isBlock = log.type === 'block';
                                            const isInfo = log.type === 'info';
                                            const isFlowEvent = log.text.includes('경기 시작') || log.text.includes('종료') || log.text.includes('하프 타임');

                                            if (isFlowEvent) {
                                                return (
                                                    <div key={i} className="flex items-center justify-center py-2.5 bg-slate-800/40 border-y border-slate-800">
                                                        <div className="flex items-center gap-1.5 text-indigo-300 font-bold text-[10px] uppercase tracking-widest">
                                                            <Clock size={12} />
                                                            <span>{log.text}</span>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            // 교체 로그
                                            if (log.text.startsWith('교체:')) {
                                                const inMatch = log.text.match(/IN \[(.*?)\]/);
                                                const outMatch = log.text.match(/OUT \[(.*?)\]/);
                                                if (inMatch && outMatch) {
                                                    const inPlayers = inMatch[1].split(',').map(s => s.trim());
                                                    const outPlayers = outMatch[1].split(',').map(s => s.trim());
                                                    return (
                                                        <div key={i} className="flex items-start py-2 px-3 gap-3 hover:bg-white/5 transition-colors">
                                                            <div className="flex-shrink-0 w-5 text-slate-600 font-bold text-[10px] text-center pt-0.5">
                                                                {log.quarter}Q
                                                            </div>
                                                            <div className="flex-shrink-0 w-10 text-slate-500 font-bold text-[10px] text-center pt-0.5">
                                                                {log.timeRemaining || '-'}
                                                            </div>
                                                            <div className="flex-1 flex flex-col gap-0.5 text-[10px]">
                                                                <div className="flex items-center gap-1.5 text-emerald-400">
                                                                    <UserPlus size={11} />
                                                                    <span>IN:</span>
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {inPlayers.map((p, j) => <span key={j} className="font-bold">{p}</span>)}
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-1.5 text-red-400">
                                                                    <UserMinus size={11} />
                                                                    <span>OUT:</span>
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {outPlayers.map((p, j) => <span key={j} className="font-bold opacity-80">{p}</span>)}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                            }

                                            let textColor = 'text-slate-400';
                                            if (isInfo) textColor = 'text-slate-300';
                                            else if (isScore) textColor = 'text-slate-200';
                                            else if (isFT) textColor = 'text-cyan-400';
                                            else if (isFoul) textColor = 'text-orange-400';
                                            else if (isTurnover) textColor = 'text-red-400';
                                            else if (isBlock) textColor = 'text-blue-400';

                                            let bgClass = 'hover:bg-white/5 transition-colors';
                                            if (isInfo) bgClass = 'bg-slate-800/30';

                                            return (
                                                <div key={i} className={`flex items-center py-2 px-3 gap-3 ${bgClass}`}>
                                                    {/* 쿼터 */}
                                                    <div className="flex-shrink-0 w-5 text-slate-600 font-bold text-[10px] text-center">
                                                        {log.quarter}Q
                                                    </div>
                                                    {/* 시간 */}
                                                    <div className="flex-shrink-0 w-10 text-slate-500 font-bold text-[10px] text-center">
                                                        {log.timeRemaining || '-'}
                                                    </div>
                                                    {/* 원정 로고 */}
                                                    <div className="flex-shrink-0 w-5 flex justify-center">
                                                        <img src={awayTeam.logo} className={`w-4 h-4 object-contain ${!isHome ? 'opacity-100' : 'opacity-30 grayscale'}`} alt="" />
                                                    </div>
                                                    {/* 스코어 */}
                                                    <div className="flex-shrink-0 w-12 text-center">
                                                        {log.awayScore !== undefined && (
                                                            <div className="font-black text-slate-500 text-[10px] tracking-tight">
                                                                <span className={!isHome && (isScore || isFT) ? 'text-white' : ''}>{log.awayScore}</span>
                                                                <span className="mx-0.5 text-slate-700">:</span>
                                                                <span className={isHome && (isScore || isFT) ? 'text-white' : ''}>{log.homeScore}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {/* 홈 로고 */}
                                                    <div className="flex-shrink-0 w-5 flex justify-center">
                                                        <img src={homeTeam.logo} className={`w-4 h-4 object-contain ${isHome ? 'opacity-100' : 'opacity-30 grayscale'}`} alt="" />
                                                    </div>
                                                    {/* 메시지 */}
                                                    <div className={`flex-1 break-words leading-relaxed text-[10px] ${textColor}`}>
                                                        {log.text}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {filteredLogs.length === 0 && (
                                            <div className="py-10 text-center text-slate-600 text-xs">
                                                해당 쿼터의 기록이 없습니다.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT: 홈팀 */}
                        <div className="w-[30%] border-l border-slate-800 bg-slate-950 flex flex-col overflow-hidden">
                            <OnCourtPanel
                                onCourt={homeOnCourt}
                                bench={homeBench}
                                isUser={isUserHome}
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
