
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Team, GameTactics, DepthChart, SimulationResult, PbpLog } from '../types';
import { useLiveGame, PauseReason, GameSpeed } from '../hooks/useLiveGame';
import { LivePlayer, ShotEvent } from '../services/game/engine/pbp/pbpTypes';
import { TEAM_DATA } from '../data/teamData';
import { TacticsSlidersPanel } from '../components/dashboard/tactics/TacticsSlidersPanel';
import { RotationGanttChart } from '../components/dashboard/RotationGanttChart';
import { COURT_WIDTH, COURT_HEIGHT, HOOP_X_LEFT, HOOP_Y_CENTER } from '../utils/courtCoordinates';
import { UserPlus, UserMinus, Clock } from 'lucide-react';
import { calculateWinProbability } from '../utils/simulationMath';
import { calculatePlayerOvr } from '../utils/constants';

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

type ActiveTab = 'court' | 'rotation' | 'tactics';

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


const POSITION_ORDER: Record<string, number> = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 };

function sortByPosition(players: LivePlayer[]): LivePlayer[] {
    return [...players].sort((a, b) =>
        (POSITION_ORDER[a.position] ?? 5) - (POSITION_ORDER[b.position] ?? 5)
    );
}

// 공통 grid 템플릿: 이름|P|STM|MP|PTS|REB|AST|STL|BLK|TOV|PF|FG|3P
// FG/3P는 두 자리수 합산(10-18 등)이므로 다른 컬럼보다 넓게
const PLAYER_GRID = 'minmax(0,80px) repeat(10, 0.75fr) repeat(2, 1.15fr)';

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
            <span className="text-xs font-semibold text-slate-200 truncate">{(() => {
                const s = player.recentShots;
                const len = s?.length ?? 0;
                if (len >= 3 && s.slice(-3).every(Boolean)) return '🔥 ';
                if (len >= 4 && s.slice(-4).every(v => !v)) return '❄️ ';
                return '';
            })()}{player.playerName}</span>
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
    const hlTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    const sortedOnCourt = useMemo(() => sortByPosition(onCourt), [onCourt]);
    const sortedBench   = useMemo(() => sortByPosition(bench),   [bench]);

    // 스탯 변화 감지 → 하이라이트 (각 키별 독립 타이머)
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

            for (const h of newHighlights) {
                if (hlTimersRef.current[h]) clearTimeout(hlTimersRef.current[h]);
                hlTimersRef.current[h] = setTimeout(() => {
                    setHighlightedStats(s => {
                        const next = new Set(s);
                        next.delete(h);
                        return next;
                    });
                    delete hlTimersRef.current[h];
                }, 500);
            }
        }
    }, [onCourt, bench]);

    // 언마운트 시 모든 타이머 정리
    useEffect(() => {
        return () => {
            Object.values(hlTimersRef.current).forEach(clearTimeout);
        };
    }, []);

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
        <div className="flex flex-col min-h-0 overflow-hidden shrink">
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
                            <span className="text-xs text-right" />
                            <span className="text-xs font-mono text-white text-right">{teamTotal.pts}</span>
                            <span className="text-xs font-mono text-slate-300 text-right">{teamTotal.reb}</span>
                            <span className="text-xs font-mono text-slate-300 text-right">{teamTotal.ast}</span>
                            <span className="text-xs font-mono text-slate-400 text-right">{teamTotal.stl}</span>
                            <span className="text-xs font-mono text-slate-400 text-right">{teamTotal.blk}</span>
                            <span className="text-xs font-mono text-slate-400 text-right">{teamTotal.tov}</span>
                            <span className="text-xs font-mono text-slate-400 text-right">{teamTotal.pf}</span>
                            <span className="text-xs font-mono text-slate-400 text-right">{teamTotal.fga > 0 ? (teamTotal.fgm / teamTotal.fga).toFixed(3).replace(/^0/, '') : '.000'}</span>
                            <span className="text-xs font-mono text-slate-400 text-right">{teamTotal.p3a > 0 ? (teamTotal.p3m / teamTotal.p3a).toFixed(3).replace(/^0/, '') : '.000'}</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Team Stats Compare (NBA app TEAM STATS style dual-bar chart)
// ─────────────────────────────────────────────────────────────

const COMPARE_STATS = [
    { key: 'pts', label: 'PTS', fmt: (v: number) => String(v) },
    { key: 'fgPct', label: 'FG%', fmt: (v: number) => v.toFixed(1) },
    { key: 'p3Pct', label: '3P%', fmt: (v: number) => v.toFixed(1) },
    { key: 'oreb', label: 'OREB', fmt: (v: number) => String(v) },
    { key: 'reb', label: 'REB', fmt: (v: number) => String(v) },
    { key: 'ast', label: 'AST', fmt: (v: number) => String(v) },
    { key: 'stl', label: 'STL', fmt: (v: number) => String(v) },
    { key: 'blk', label: 'BLK', fmt: (v: number) => String(v) },
    { key: 'tov', label: 'TOV', fmt: (v: number) => String(v) },
    { key: 'pf', label: 'PF', fmt: (v: number) => String(v) },
] as const;

const TeamStatsCompare: React.FC<{
    homeBox: { pts: number; reb: number; offReb: number; ast: number; stl: number; blk: number; tov: number; pf: number; fgm: number; fga: number; p3m: number; p3a: number }[];
    awayBox: { pts: number; reb: number; offReb: number; ast: number; stl: number; blk: number; tov: number; pf: number; fgm: number; fga: number; p3m: number; p3a: number }[];
    homeColor: string;
    awayColor: string;
}> = ({ homeBox, awayBox, homeColor, awayColor }) => {
    type BoxRow = { pts: number; reb: number; offReb: number; ast: number; stl: number; blk: number; tov: number; pf: number; fgm: number; fga: number; p3m: number; p3a: number };
    const stats = useMemo(() => {
        const sum = (arr: BoxRow[], key: keyof BoxRow) =>
            arr.reduce((s, p) => s + (p[key] ?? 0), 0);

        const hFgm = sum(homeBox, 'fgm'), hFga = sum(homeBox, 'fga');
        const aFgm = sum(awayBox, 'fgm'), aFga = sum(awayBox, 'fga');
        const hP3m = sum(homeBox, 'p3m'), hP3a = sum(homeBox, 'p3a');
        const aP3m = sum(awayBox, 'p3m'), aP3a = sum(awayBox, 'p3a');

        return {
            pts:   { h: sum(homeBox, 'pts'), a: sum(awayBox, 'pts') },
            fgPct: { h: hFga > 0 ? (hFgm / hFga) * 100 : 0, a: aFga > 0 ? (aFgm / aFga) * 100 : 0 },
            p3Pct: { h: hP3a > 0 ? (hP3m / hP3a) * 100 : 0, a: aP3a > 0 ? (aP3m / aP3a) * 100 : 0 },
            oreb:  { h: sum(homeBox, 'offReb'), a: sum(awayBox, 'offReb') },
            reb:   { h: sum(homeBox, 'reb'), a: sum(awayBox, 'reb') },
            ast:   { h: sum(homeBox, 'ast'), a: sum(awayBox, 'ast') },
            stl:   { h: sum(homeBox, 'stl'), a: sum(awayBox, 'stl') },
            blk:   { h: sum(homeBox, 'blk'), a: sum(awayBox, 'blk') },
            tov:   { h: sum(homeBox, 'tov'), a: sum(awayBox, 'tov') },
            pf:    { h: sum(homeBox, 'pf'), a: sum(awayBox, 'pf') },
        };
    }, [homeBox, awayBox]);

    return (
        <div className="shrink-0 px-2 py-2">
            <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5 px-1">팀 스탯</p>
            <div className="flex flex-col gap-1">
                {COMPARE_STATS.map(({ key, label, fmt }) => {
                    const { h, a } = stats[key as keyof typeof stats];
                    const total = h + a;
                    const hPct = total > 0 ? (h / total) * 100 : 50;
                    const aPct = total > 0 ? (a / total) * 100 : 50;
                    const hWins = h > a;
                    const aWins = a > h;
                    const bothZero = h === 0 && a === 0;

                    return (
                        <div key={key} className="grid grid-cols-[1fr_32px_36px_32px_1fr] items-center gap-1">
                            {/* Away bar (grows right-to-left) */}
                            <div className="h-3 flex justify-end rounded-sm overflow-hidden bg-slate-800/50">
                                {!bothZero && (
                                    <div
                                        className="h-full rounded-sm transition-all duration-300"
                                        style={{ width: `${aPct}%`, backgroundColor: awayColor }}
                                    />
                                )}
                            </div>
                            {/* Away value */}
                            <span className={`text-[10px] font-mono text-right text-white ${aWins ? 'font-bold' : ''}`}>
                                {fmt(a)}
                            </span>
                            {/* Label */}
                            <span className="text-[9px] font-bold text-slate-400 text-center uppercase">{label}</span>
                            {/* Home value */}
                            <span className={`text-[10px] font-mono text-left text-white ${hWins ? 'font-bold' : ''}`}>
                                {fmt(h)}
                            </span>
                            {/* Home bar (grows left-to-right) */}
                            <div className="h-3 flex justify-start rounded-sm overflow-hidden bg-slate-800/50">
                                {!bothZero && (
                                    <div
                                        className="h-full rounded-sm transition-all duration-300"
                                        style={{ width: `${hPct}%`, backgroundColor: homeColor }}
                                    />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Quarter Scores Table
// ─────────────────────────────────────────────────────────────

const QuarterScores: React.FC<{
    allLogs: PbpLog[];
    homeTeamId: string;
    currentQuarter: number;
    homeTeamCode: string;
    awayTeamCode: string;
}> = ({ allLogs, homeTeamId, currentQuarter, homeTeamCode, awayTeamCode }) => {
    const scores = useMemo(() => {
        const home = [0, 0, 0, 0];
        const away = [0, 0, 0, 0];

        for (const log of allLogs) {
            if (log.type === 'score' || log.type === 'freethrow') {
                const pts = log.points ?? 0;
                const qi = Math.min(3, log.quarter - 1); // 0-indexed
                if (log.teamId === homeTeamId) home[qi] += pts;
                else away[qi] += pts;
            }
        }
        return { home, away };
    }, [allLogs, homeTeamId]);

    const hTotal = scores.home.reduce((a, b) => a + b, 0);
    const aTotal = scores.away.reduce((a, b) => a + b, 0);

    const cellClass = (qi: number) => {
        if (qi + 1 > currentQuarter) return 'text-slate-600';
        if (qi + 1 === currentQuarter) return 'text-white font-bold';
        return 'text-slate-400';
    };

    return (
        <div className="shrink-0 px-2 py-2 border-t border-slate-800/50">
            <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5 px-1">쿼터별 득점</p>
            <table className="w-full text-[10px] font-mono border border-slate-700/60 rounded overflow-hidden">
                <thead>
                    <tr className="text-[9px] text-slate-600 uppercase bg-slate-900/60">
                        <th className="text-left px-1.5 py-1 font-semibold w-12 border-r border-slate-700/60"></th>
                        {[1, 2, 3, 4].map(q => (
                            <th key={q} className="text-center px-1.5 py-1 font-semibold w-8 border-r border-slate-700/60">{q}</th>
                        ))}
                        <th className="text-center px-1.5 py-1 font-semibold w-8">T</th>
                    </tr>
                </thead>
                <tbody>
                    <tr className="border-t border-slate-700/60">
                        <td className="text-left px-1.5 py-1 text-slate-500 font-bold border-r border-slate-700/60">{awayTeamCode}</td>
                        {scores.away.map((v, i) => (
                            <td key={i} className={`text-center px-1.5 py-1 border-r border-slate-700/60 ${cellClass(i)}`}>
                                {i + 1 > currentQuarter ? '—' : v}
                            </td>
                        ))}
                        <td className="text-center px-1.5 py-1 text-white font-bold">{aTotal}</td>
                    </tr>
                    <tr className="border-t border-slate-700/60">
                        <td className="text-left px-1.5 py-1 text-slate-500 font-bold border-r border-slate-700/60">{homeTeamCode}</td>
                        {scores.home.map((v, i) => (
                            <td key={i} className={`text-center px-1.5 py-1 border-r border-slate-700/60 ${cellClass(i)}`}>
                                {i + 1 > currentQuarter ? '—' : v}
                            </td>
                        ))}
                        <td className="text-center px-1.5 py-1 text-white font-bold">{hTotal}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Compact Win Probability Graph (sidebar)
// ─────────────────────────────────────────────────────────────

const getSmoothPath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
    let d = `M ${points[0].x},${points[0].y}`;
    const smoothing = 0.2;
    const line = (p0: { x: number; y: number }, p1: { x: number; y: number }) => ({
        length: Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2),
        angle: Math.atan2(p1.y - p0.y, p1.x - p0.x),
    });
    const cp = (cur: { x: number; y: number }, prev: { x: number; y: number } | undefined, next: { x: number; y: number } | undefined, rev: boolean) => {
        const p = prev || cur, n = next || cur;
        const o = line(p, n);
        const a = o.angle + (rev ? Math.PI : 0);
        const l = o.length * smoothing;
        return { x: cur.x + Math.cos(a) * l, y: cur.y + Math.sin(a) * l };
    };
    for (let i = 0; i < points.length - 1; i++) {
        const c1 = cp(points[i], points[i - 1], points[i + 1], false);
        const c2 = cp(points[i + 1], points[i], points[i + 2], true);
        d += ` C ${c1.x},${c1.y} ${c2.x},${c2.y} ${points[i + 1].x},${points[i + 1].y}`;
    }
    return d;
};

const CompactWPGraph: React.FC<{
    allLogs: PbpLog[];
    homeTeamId: string;
    currentMinute: number;
    homeColor: string;
    awayColor: string;
    homeLogo: string;
    awayLogo: string;
}> = ({ allLogs, homeTeamId, currentMinute, homeColor, awayColor, homeLogo, awayLogo }) => {
    const W = 100, H = 50, MID = 25, TOTAL = 48;

    // 스냅샷을 ref에 누적 — currentMinute 변경 시에만 새 점 추가
    const snapsRef = useRef<{ wp: number }[]>([{ wp: 50 }]);

    useEffect(() => {
        const targetMinute = currentMinute + 1; // currentMinute 0 → 분 1 스냅샷
        if (targetMinute <= 0 || targetMinute > 48) return;

        // 빠른 속도에서 currentMinute가 여러 분을 건너뛸 수 있으므로
        // 누락된 모든 중간 분의 스냅샷을 한번에 채움
        while (snapsRef.current.length <= targetMinute) {
            const m = snapsRef.current.length; // 추가할 분 번호
            let hScore = 0, aScore = 0;
            const mSec = m * 60;
            for (const log of allLogs) {
                const [mm, ss] = log.timeRemaining.split(':').map(Number);
                const elapsed = ((log.quarter - 1) * 720) + (720 - (mm * 60 + ss));
                if (elapsed > mSec) break;
                if (log.type === 'score' || log.type === 'freethrow') {
                    const pts = log.points ?? 0;
                    if (log.teamId === homeTeamId) hScore += pts; else aScore += pts;
                }
            }
            snapsRef.current.push({ wp: calculateWinProbability(hScore, aScore, m) });
        }
    }, [currentMinute]); // eslint-disable-line react-hooks/exhaustive-deps

    const { points, fillPath, pathData, currentWP, endX, endY } = useMemo(() => {
        const snaps = snapsRef.current;
        const pts = snaps.map((d, i) => ({ x: (i / TOTAL) * W, y: (d.wp / 100) * H }));
        const pd = getSmoothPath(pts);
        const sX = pts[0].x, sY = pts[0].y;
        const eX = pts[pts.length - 1].x, eY = pts[pts.length - 1].y;
        let cc = '';
        const ci = pd.indexOf('C');
        if (ci !== -1) cc = pd.substring(ci);
        const fp = `M 0,${MID} L ${sX},${sY} ${cc} L ${eX},${MID} Z`;
        return { points: pts, fillPath: fp, pathData: pd, currentWP: snaps[snaps.length - 1].wp, endX: eX, endY: eY };
    }, [currentMinute]); // eslint-disable-line react-hooks/exhaustive-deps

    const homeProb = Math.round(currentWP);
    const awayProb = 100 - homeProb;

    return (
        <div className="flex-1 min-h-0 flex flex-col px-3 py-3">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                    <img src={awayLogo} className="w-4 h-4 object-contain" alt="" />
                    <span className="text-xs font-black oswald text-white">{awayProb}%</span>
                </div>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">실시간 승리확률</p>
                <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black oswald text-white">{homeProb}%</span>
                    <img src={homeLogo} className="w-4 h-4 object-contain" alt="" />
                </div>
            </div>
            {/* Graph */}
            <div className="flex-1 min-h-0 w-full relative overflow-hidden">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="lwpGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={H}>
                            <stop offset="0" stopColor={awayColor} stopOpacity="0.4" />
                            <stop offset="0.5" stopColor={awayColor} stopOpacity="0" />
                            <stop offset="0.5" stopColor={homeColor} stopOpacity="0" />
                            <stop offset="1" stopColor={homeColor} stopOpacity="0.4" />
                        </linearGradient>
                    </defs>
                    <rect width="100%" height="100%" fill="#0f172a" opacity="0.6" />
                    <line x1="25" y1="0" x2="25" y2={H} stroke="#1e293b" strokeWidth="0.3" strokeDasharray="0.8 0.8" />
                    <line x1="50" y1="0" x2="50" y2={H} stroke="#334155" strokeWidth="0.4" strokeDasharray="0.8 0.8" />
                    <line x1="75" y1="0" x2="75" y2={H} stroke="#1e293b" strokeWidth="0.3" strokeDasharray="0.8 0.8" />
                    <line x1="0" y1={MID} x2={W} y2={MID} stroke="#475569" strokeWidth="0.3" strokeDasharray="0.8 0.8" />
                    <path d={fillPath} fill="url(#lwpGrad)" stroke="none" />
                    <path d={pathData} fill="none" stroke="#e2e8f0" strokeWidth="0.7" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </svg>
                {points.length > 1 && (
                    <div
                        className="absolute w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_6px_white] -translate-x-1/2 -translate-y-1/2 transition-all duration-100"
                        style={{ left: `${endX}%`, top: `${(endY / H) * 100}%` }}
                    >
                        <div className="absolute inset-0 bg-white/50 rounded-full animate-ping" />
                    </div>
                )}
            </div>
            {/* X-Axis */}
            <div className="shrink-0 flex mt-1 text-[8px] font-bold text-slate-600 uppercase tracking-wider relative h-3">
                <span className="absolute left-[12.5%] -translate-x-1/2">1Q</span>
                <span className="absolute left-[37.5%] -translate-x-1/2">2Q</span>
                <span className="absolute left-[62.5%] -translate-x-1/2">3Q</span>
                <span className="absolute left-[87.5%] -translate-x-1/2">4Q</span>
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

    // SVG court at 940x500 scale (10x of 94x50 ft). Shot coords are in 94x50 → multiply by 10.
    const S = 10;

    return (
        <div className="w-full" style={{ aspectRatio: '940/500' }}>
            <svg viewBox="0 0 940 500" className="w-full h-full">
                {/* Court Background */}
                <rect width="940" height="500" fill="rgb(221,200,173)" />
                {/* Paint Fills */}
                <rect y="170" width="190" height="160" fill="rgb(195,172,145)" />
                <rect x="750" y="170" width="190" height="160" fill="rgb(195,172,145)" />

                {/* ── Court Lines ── */}
                <g fill="none" stroke="#4a3728" strokeWidth="2" strokeMiterlimit="10">
                    {/* Left 3-Point Line */}
                    <path d="M0,30h140s150,55,150,220-150,220,-150,220H0" />
                    {/* Left Paint (open on baseline) */}
                    <polyline points="0,170 190,170 190,330 0,330" />
                    {/* Left FT Lane Lines */}
                    <line x1="190" y1="310" y2="310" />
                    <line y1="190" x2="190" y2="190" />
                    {/* Left FT Circle (solid half) */}
                    <path d="M190,190c33.14,0,60,26.86,60,60s-26.86,60-60,60" />
                    {/* Left FT Circle (dashed half) */}
                    <path d="M190,310c-1.6,0-3.18-.06-4.75-.19" />
                    <path d="M177.77,308.75c-27.27-5.65-47.77-29.81-47.77-58.75s22.39-55.27,51.49-59.4" strokeDasharray="9.58 7.56" />
                    <path d="M185.25,190.19c1.57-.12,3.15-.19,4.75-.19" />
                    {/* Left Corner 3 Lines */}
                    <line x1="280" y1="480" x2="280" y2="500" />
                    <line x1="280" x2="280" y2="20" />
                    {/* Left Restricted Area */}
                    <path d="M40,290h12.5c22.09,0,40-17.91,40-40s-17.91-40-40-40h-12.5" />
                    {/* Left Lane Tick Marks */}
                    <line x1="145" y1="310" x2="145" y2="318" />
                    <line x1="115" y1="310" x2="115" y2="318" />
                    <line x1="85" y1="310" x2="85" y2="318" />
                    <line x1="70" y1="310" x2="70" y2="318" />
                    <line x1="145" y1="182" x2="145" y2="190" />
                    <line x1="115" y1="182" x2="115" y2="190" />
                    <line x1="85" y1="182" x2="85" y2="190" />
                    <line x1="70" y1="182" x2="70" y2="190" />
                    {/* Left Backboard */}
                    <line x1="40" y1="222" x2="40" y2="278" stroke="#333" />
                    {/* Left Basket */}
                    <circle cx="48" cy="250" r="7.5" stroke="#e65100" />

                    {/* Center Line */}
                    <line x1="470" x2="470" y2="500" />
                    {/* Center Circle */}
                    <circle cx="470" cy="250" r="60" />
                    <circle cx="470" cy="250" r="20" />

                    {/* Right 3-Point Line */}
                    <path d="M940,470h-140s-150,-55,-150,-220,150,-220,150,-220h140" />
                    {/* Right Paint (open on baseline) */}
                    <polyline points="940,330 750,330 750,170 940,170" />
                    {/* Right FT Lane Lines */}
                    <line x1="750" y1="190" x2="940" y2="190" />
                    <line x1="940" y1="310" x2="750" y2="310" />
                    {/* Right FT Circle (solid half) */}
                    <path d="M750,310c-33.14,0-60-26.86-60-60s26.86-60,60-60" />
                    {/* Right FT Circle (dashed half) */}
                    <path d="M750,190c1.6,0,3.18.06,4.75.19" />
                    <path d="M762.23,191.25c27.27,5.65,47.77,29.81,47.77,58.75s-22.39,55.27-51.49,59.4" strokeDasharray="9.58 7.56" />
                    <path d="M754.75,309.81c-1.57.12-3.15.19-4.75.19" />
                    {/* Right Corner 3 Lines */}
                    <line x1="660" y1="20" x2="660" />
                    <line x1="660" y1="500" x2="660" y2="480" />
                    {/* Right Restricted Area */}
                    <path d="M900,210h-12.5c-22.09,0-40,17.91-40,40s17.91,40,40,40h12.5" />
                    {/* Right Lane Tick Marks */}
                    <line x1="795" y1="190" x2="795" y2="182" />
                    <line x1="825" y1="190" x2="825" y2="182" />
                    <line x1="855" y1="190" x2="855" y2="182" />
                    <line x1="870" y1="190" x2="870" y2="182" />
                    <line x1="795" y1="318" x2="795" y2="310" />
                    <line x1="825" y1="318" x2="825" y2="310" />
                    <line x1="855" y1="318" x2="855" y2="310" />
                    <line x1="870" y1="318" x2="870" y2="310" />
                    {/* Right Backboard */}
                    <line x1="900" y1="278" x2="900" y2="222" stroke="#333" />
                    {/* Right Basket */}
                    <circle cx="892" cy="250" r="7.5" stroke="#e65100" />
                </g>

                {/* Shot Dots (coords in 94x50, scaled to 940x500) */}
                {displayShots.map((shot, i) => {
                    const color = shot.isHome ? homeColor : awayColor;
                    return (
                        <g key={`${shot.id}-${i}`}>
                            {shot.isMake ? (
                                <circle cx={shot.x * S} cy={shot.y * S} r={6.5} fill={color} stroke="white" strokeWidth="1" opacity="0.9" />
                            ) : (
                                <g transform={`translate(${shot.x * S}, ${shot.y * S})`} opacity="0.5">
                                    <line x1="-5" y1="-5" x2="5" y2="5" stroke={color} strokeWidth="2.5" />
                                    <line x1="-5" y1="5" x2="5" y2="-5" stroke={color} strokeWidth="2.5" />
                                </g>
                            )}
                        </g>
                    );
                })}
            </svg>
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
        displayState, callTimeout, applyTactics, applyRotationMap,
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

    // Rotation chart derived data
    const userDepthChart = isUserHome ? homeDepthChart : awayDepthChart;
    const userHealthySorted = useMemo(() =>
        userTeam.roster
            .filter(p => p.health !== 'Injured')
            .sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)),
        [userTeam.roster]
    );
    const canEditRotation = pauseReason === 'quarterEnd' || pauseReason === 'halftime' || pauseReason === 'timeout';
    const handleRotationUpdate = useCallback((t: GameTactics) => {
        applyRotationMap(t.rotationMap);
    }, [applyRotationMap]);
    const handleViewPlayerNoop = useCallback(() => {}, []);

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
                            {/* 하단 패널: 사용자팀이면 팀스탯비교+리더+쿼터점수, 상대팀이면 WP 그래프 */}
                            <div className="flex-1 min-h-[160px] border-t border-slate-800 flex flex-col overflow-y-auto" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                                {!isUserHome ? (
                                    <>
                                        <QuarterScores
                                            allLogs={allLogs}
                                            homeTeamId={homeTeam.id}
                                            currentQuarter={quarter}
                                            homeTeamCode={homeTeam.id.toUpperCase()}
                                            awayTeamCode={awayTeam.id.toUpperCase()}
                                        />
                                        <TeamStatsCompare
                                            homeBox={homeBox}
                                            awayBox={awayBox}
                                            homeColor={homeData?.colors.primary ?? '#6366f1'}
                                            awayColor={awayData?.colors.primary ?? '#6366f1'}
                                        />
                                    </>
                                ) : (
                                    <CompactWPGraph
                                        allLogs={allLogs}
                                        homeTeamId={homeTeam.id}
                                        currentMinute={currentMinute}
                                        homeColor={homeData?.colors.primary ?? '#6366f1'}
                                        awayColor={awayData?.colors.primary ?? '#6366f1'}
                                        homeLogo={homeTeam.logo}
                                        awayLogo={awayTeam.logo}
                                    />
                                )}
                            </div>
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
                                <div className="shrink-0 px-3 pt-2 pb-1.5 bg-slate-900 border-b border-slate-800">
                                    <div className="flex items-center gap-3">
                                        <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                                            플레이-바이-플레이
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
                                                    <div key={i} className={`flex items-center justify-center py-2.5 border-y border-slate-800 ${i % 2 === 0 ? 'bg-slate-800/40' : 'bg-slate-800/20'}`}>
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
                                                        <div key={i} className={`flex items-start py-2 px-3 gap-3 ${i % 2 === 0 ? 'bg-slate-800/30' : ''}`}>
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

                                            const bgClass = i % 2 === 0 ? 'bg-slate-800/30' : '';

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
                            {/* 하단 패널: 사용자팀이면 팀스탯비교+리더+쿼터점수, 상대팀이면 WP 그래프 */}
                            <div className="flex-1 min-h-[160px] border-t border-slate-800 flex flex-col overflow-y-auto" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                                {isUserHome ? (
                                    <>
                                        <QuarterScores
                                            allLogs={allLogs}
                                            homeTeamId={homeTeam.id}
                                            currentQuarter={quarter}
                                            homeTeamCode={homeTeam.id.toUpperCase()}
                                            awayTeamCode={awayTeam.id.toUpperCase()}
                                        />
                                        <TeamStatsCompare
                                            homeBox={homeBox}
                                            awayBox={awayBox}
                                            homeColor={homeData?.colors.primary ?? '#6366f1'}
                                            awayColor={awayData?.colors.primary ?? '#6366f1'}
                                        />
                                    </>
                                ) : (
                                    <CompactWPGraph
                                        allLogs={allLogs}
                                        homeTeamId={homeTeam.id}
                                        currentMinute={currentMinute}
                                        homeColor={homeData?.colors.primary ?? '#6366f1'}
                                        awayColor={awayData?.colors.primary ?? '#6366f1'}
                                        homeLogo={homeTeam.logo}
                                        awayLogo={awayTeam.logo}
                                    />
                                )}
                            </div>
                        </div>
                    </>
                )}

                {/* ── 로테이션 탭 ── */}
                {activeTab === 'rotation' && (
                    <div className="flex-1 overflow-hidden">
                        <RotationGanttChart
                            team={userTeam}
                            tactics={liveTactics}
                            depthChart={userDepthChart || null}
                            healthySorted={userHealthySorted}
                            onUpdateTactics={handleRotationUpdate}
                            onViewPlayer={handleViewPlayerNoop}
                            liveMode
                            currentMinute={currentMinute}
                            lockedBefore={currentMinute}
                            readOnly={!canEditRotation}
                        />
                    </div>
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
