
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Clock, Circle } from 'lucide-react';
import { useLeagueContext } from '../league/LeagueLayout';
import { supabase } from '../../../services/supabaseClient';
import { calculateWinProbability } from '../../../utils/simulationMath';
import type { PbpLog, PlayerBoxScore, BoxTick, BoxDelta } from '../../../types/engine';
import type { Game, ShotEvent } from '../../../types';
import { useServerClock } from '../../../utils/serverClock';
import { REPLAY_DURATION_MS, getGameDisplayState } from './multiGameReveal';
import { MultiFullCourtChart } from './MultiFullCourtChart';

const TOTAL_GAME_SECONDS  = 2880;

// ─── Types ────────────────────────────────────────────────────────────────────

interface GamePbpRow {
    game_id:         string;
    home_team_id:    string;
    away_team_id:    string;
    home_score:      number;
    away_score:      number;
    game_start_time: string;
    events:          PbpLog[];
    shot_events:     ShotEvent[];
    home_box:        PlayerBoxScore[];
    away_box:        PlayerBoxScore[];
    box_timeline?:   BoxTick[];
}

interface TeamStats {
    pts: number; fgm: number; fga: number; p3m: number; p3a: number;
    ftm: number; fta: number; tov: number; blk: number; pf: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTimeRemaining(t: string): number {
    const [m, s] = t.split(':').map(n => parseInt(n, 10) || 0);
    return m * 60 + s;
}

function toGameSeconds(e: PbpLog): number {
    return (e.quarter - 1) * 720 + (720 - parseTimeRemaining(e.timeRemaining));
}

function fmtCountdown(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function computeTeamStats(logs: PbpLog[], shotEvents: ShotEvent[], teamId: string): TeamStats {
    const pts = logs
        .filter(l => (l.type === 'score' || l.type === 'freethrow') && l.teamId === teamId)
        .reduce((s, l) => s + (l.points ?? 0), 0);

    const teamShots = shotEvents.filter(s => s.teamId === teamId);
    const fgm  = teamShots.filter(s => s.isMake).length;
    const fga  = teamShots.length;
    const p3m  = teamShots.filter(s => s.zone === '3PT' && s.isMake).length;
    const p3a  = teamShots.filter(s => s.zone === '3PT').length;

    let ftm = 0, fta = 0;
    for (const l of logs) {
        if (l.type === 'freethrow' && l.teamId === teamId) {
            const m = l.text.match(/(\d+)\/(\d+)/);
            if (m) { ftm += parseInt(m[1]); fta += parseInt(m[2]); }
        }
    }

    const tov = logs.filter(l => l.type === 'turnover' && l.teamId === teamId).length;
    const blk = logs.filter(l => l.type === 'block'    && l.teamId === teamId).length;
    const pf  = logs.filter(l => l.type === 'foul'     && l.teamId === teamId).length;

    return { pts, fgm, fga, p3m, p3a, ftm, fta, tov, blk, pf };
}

// ─── Live Box Reconstruction (박스스코어 점진 공개) ────────────────────────────

function emptyBoxRow(playerId: string, playerName: string, position?: string): PlayerBoxScore {
    return {
        playerId, playerName, position,
        pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
        fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0,
        rimM: 0, rimA: 0, midM: 0, midA: 0,
        mp: 0, g: 0, gs: 0, pf: 0,
        techFouls: 0, flagrantFouls: 0, plusMinus: 0,
        contestedAttempted: 0, contestedMade: 0,
        defRimAttempted: 0, defRimMade: 0, defMidAttempted: 0, defMidMade: 0,
        defThreeAttempted: 0, defThreeMade: 0, defRAAttempted: 0, defRAMade: 0,
        defITPAttempted: 0, defITPMade: 0, defMIDAttempted: 0, defMIDMade: 0,
        defCNRAttempted: 0, defCNRMade: 0, defWINGAttempted: 0, defWINGMade: 0,
        defATBAttempted: 0, defATBMade: 0,
        condition: 100,
        recentShots: [],
    };
}

// box_timeline의 포세션별 델타를 elapsed 시점까지 누적해 PlayerBoxScore[]로 재구성.
// 식별자(playerName/position)는 referenceBox(home_box/away_box)에서 가져오되 스탯 필드는 사용하지 않음(스포일러 아님).
function buildLiveBox(timeline: BoxTick[], elapsed: number, referenceBox: PlayerBoxScore[]): PlayerBoxScore[] {
    const rows = new Map<string, PlayerBoxScore>();
    const recentShots = new Map<string, boolean[]>();
    for (const ref of referenceBox) {
        rows.set(ref.playerId, emptyBoxRow(ref.playerId, ref.playerName, ref.position));
        recentShots.set(ref.playerId, []);
    }

    // 핫/콜드 스트릭(recentShots) 쿼터 전환 보정 — 엔진의 dampenHotCold(Q2/Q4 진입)·resetHotCold(Q3=하프타임) 경계 재현
    let dampenedQ2 = false, resetQ3 = false, dampenedQ4 = false;

    for (const tick of timeline) {
        const replayMs = (tick.t / TOTAL_GAME_SECONDS) * REPLAY_DURATION_MS;
        if (replayMs > elapsed) break;

        if (!dampenedQ2 && tick.t >= 720) {
            for (const [pid, arr] of recentShots) recentShots.set(pid, arr.slice(-3));
            dampenedQ2 = true;
        }
        if (!resetQ3 && tick.t >= 1440) {
            for (const pid of recentShots.keys()) recentShots.set(pid, []);
            resetQ3 = true;
        }
        if (!dampenedQ4 && tick.t >= 2160) {
            for (const [pid, arr] of recentShots) recentShots.set(pid, arr.slice(-3));
            dampenedQ4 = true;
        }

        for (const pid of tick.on) {
            const row = rows.get(pid);
            if (row) row.mp += tick.mp;
        }
        for (const [pid, delta] of Object.entries(tick.d)) {
            const row = rows.get(pid);
            if (!row) continue;
            for (const [key, v] of Object.entries(delta) as [keyof BoxDelta, number][]) {
                row[key] = (row[key] ?? 0) + v;
            }
        }
        if (tick.shot && recentShots.has(tick.shot.p)) {
            const arr = recentShots.get(tick.shot.p)!;
            arr.push(tick.shot.m);
            if (arr.length > 5) arr.shift();
        }
    }

    for (const [pid, row] of rows) {
        row.recentShots = recentShots.get(pid);
    }

    return Array.from(rows.values());
}

// ─── QuarterScores ────────────────────────────────────────────────────────────

const QuarterScores: React.FC<{
    allLogs:        PbpLog[];
    homeTeamId:     string;
    currentQuarter: number;
    homeAbbr:       string;
    awayAbbr:       string;
}> = ({ allLogs, homeTeamId, currentQuarter, homeAbbr, awayAbbr }) => {
    const scores = useMemo(() => {
        const home = [0, 0, 0, 0];
        const away = [0, 0, 0, 0];
        for (const log of allLogs) {
            if (log.type === 'score' || log.type === 'freethrow') {
                const pts = log.points ?? 0;
                const qi  = Math.min(3, log.quarter - 1);
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
        <div className="shrink-0 border-b border-slate-700/60">
            <table className="w-full text-xs font-mono">
                <thead>
                    <tr className="text-xs text-slate-600 uppercase bg-slate-900/60">
                        <th className="text-left px-1.5 py-1 font-semibold w-12 border-r border-slate-700/60 text-slate-500 tracking-wider">쿼터별</th>
                        {[1, 2, 3, 4].map(q => (
                            <th key={q} className="text-center px-1.5 py-1 font-semibold w-8 border-r border-slate-700/60">{q}</th>
                        ))}
                        <th className="text-center px-1.5 py-1 font-semibold w-8">T</th>
                    </tr>
                </thead>
                <tbody>
                    <tr className="border-t border-slate-700/60">
                        <td className="text-left px-1.5 py-1 text-slate-500 font-bold border-r border-slate-700/60">{awayAbbr}</td>
                        {scores.away.map((v, i) => (
                            <td key={i} className={`text-center px-1.5 py-1 border-r border-slate-700/60 ${cellClass(i)}`}>
                                {i + 1 > currentQuarter ? '—' : v}
                            </td>
                        ))}
                        <td className="text-center px-1.5 py-1 text-white font-bold">{aTotal}</td>
                    </tr>
                    <tr className="border-t border-slate-700/60">
                        <td className="text-left px-1.5 py-1 text-slate-500 font-bold border-r border-slate-700/60">{homeAbbr}</td>
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

// ─── CompactWPGraph ───────────────────────────────────────────────────────────

const getSmoothPath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
    let d = `M ${points[0].x},${points[0].y}`;
    const smoothing = 0.2;
    const line = (p0: { x: number; y: number }, p1: { x: number; y: number }) => ({
        length: Math.sqrt((p1.x - p0.x) ** 2 + (p1.y - p0.y) ** 2),
        angle:  Math.atan2(p1.y - p0.y, p1.x - p0.x),
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
    allLogs:       PbpLog[];
    homeTeamId:    string;
    currentMinute: number;
    homeColor:     string;
    awayColor:     string;
    homeAbbr:      string;
    awayAbbr:      string;
}> = ({ allLogs, homeTeamId, currentMinute, homeColor, awayColor, homeAbbr, awayAbbr }) => {
    const W = 100, H = 50, MID = 25, TOTAL = 48;
    const snapsRef = useRef<{ wp: number }[]>([{ wp: 50 }]);

    useEffect(() => {
        const targetMinute = currentMinute + 1;
        if (targetMinute <= 0 || targetMinute > 48) return;
        while (snapsRef.current.length <= targetMinute) {
            const m = snapsRef.current.length;
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

    const { fillPath, pathData, currentWP, endX, endY } = useMemo(() => {
        const snaps = snapsRef.current;
        const pts   = snaps.map((d, i) => ({ x: (i / TOTAL) * W, y: (d.wp / 100) * H }));
        const pd    = getSmoothPath(pts);
        const sX = pts[0].x, sY = pts[0].y;
        const eX = pts[pts.length - 1].x, eY = pts[pts.length - 1].y;
        let cc = '';
        const ci = pd.indexOf('C');
        if (ci !== -1) cc = pd.substring(ci);
        const fp = `M 0,${MID} L ${sX},${sY} ${cc} L ${eX},${MID} Z`;
        return { fillPath: fp, pathData: pd, currentWP: snaps[snaps.length - 1].wp, endX: eX, endY: eY };
    }, [currentMinute]); // eslint-disable-line react-hooks/exhaustive-deps

    const homeProb = Math.round(currentWP);
    const awayProb = 100 - homeProb;

    return (
        <div className="flex-1 min-h-0 flex flex-col px-3 py-3">
            <div className="shrink-0 flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black text-slate-400">{awayAbbr}</span>
                    <span className="text-xs font-black text-white">{awayProb}%</span>
                </div>
                <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">승리확률</p>
                <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-white">{homeProb}%</span>
                    <span className="text-[10px] font-black text-slate-400">{homeAbbr}</span>
                </div>
            </div>
            <div className="flex-1 min-h-0 w-full relative overflow-hidden">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
                    <defs>
                        <linearGradient id="mwpGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={H}>
                            <stop offset="0"   stopColor={awayColor} stopOpacity="0.4" />
                            <stop offset="0.5" stopColor={awayColor} stopOpacity="0"   />
                            <stop offset="0.5" stopColor={homeColor} stopOpacity="0"   />
                            <stop offset="1"   stopColor={homeColor} stopOpacity="0.4" />
                        </linearGradient>
                    </defs>
                    <rect width="100%" height="100%" fill="#0f172a" opacity="0.6" />
                    <line x1="25" y1="0" x2="25" y2={H} stroke="#1e293b" strokeWidth="0.3" strokeDasharray="0.8 0.8" />
                    <line x1="50" y1="0" x2="50" y2={H} stroke="#334155" strokeWidth="0.4" strokeDasharray="0.8 0.8" />
                    <line x1="75" y1="0" x2="75" y2={H} stroke="#1e293b" strokeWidth="0.3" strokeDasharray="0.8 0.8" />
                    <line x1="0"  y1={MID} x2={W} y2={MID} stroke="#475569" strokeWidth="0.3" strokeDasharray="0.8 0.8" />
                    <path d={fillPath} fill="url(#mwpGrad)" stroke="none" />
                    <path d={pathData} fill="none" stroke="#e2e8f0" strokeWidth="0.7" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </svg>
                {snapsRef.current.length > 1 && (
                    <div
                        className="absolute w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_6px_white] -translate-x-1/2 -translate-y-1/2 transition-all duration-100"
                        style={{ left: `${endX}%`, top: `${(endY / H) * 100}%` }}
                    >
                        <div className="absolute inset-0 bg-white/50 rounded-full animate-ping" />
                    </div>
                )}
            </div>
            <div className="shrink-0 flex mt-1 text-xs font-bold text-slate-700 uppercase tracking-wider relative h-3">
                <span className="absolute left-[12.5%] -translate-x-1/2">1Q</span>
                <span className="absolute left-[37.5%] -translate-x-1/2">2Q</span>
                <span className="absolute left-[62.5%] -translate-x-1/2">3Q</span>
                <span className="absolute left-[87.5%] -translate-x-1/2">4Q</span>
            </div>
        </div>
    );
};

// ─── PlayerBoxPanel ───────────────────────────────────────────────────────────

const BOX_GRID = 'minmax(0,1fr) 26px 28px 32px 28px 28px 28px 28px 28px 32px 56px 48px';

const PlayerBoxPanel: React.FC<{
    players: PlayerBoxScore[];
    label:   string;
}> = ({ players, label }) => {
    const sorted = useMemo(
        () => [...players].sort((a, b) => (b.mp ?? 0) - (a.mp ?? 0)),
        [players],
    );

    const total = useMemo(() => {
        const s = (fn: (p: PlayerBoxScore) => number) => sorted.reduce((acc, p) => acc + fn(p), 0);
        return {
            pts: s(p => p.pts), reb: s(p => p.reb), ast: s(p => p.ast),
            stl: s(p => p.stl), blk: s(p => p.blk), tov: s(p => p.tov),
            pf:  s(p => p.pf),  fgm: s(p => p.fgm), fga: s(p => p.fga),
            p3m: s(p => p.p3m), p3a: s(p => p.p3a),
        };
    }, [sorted]);

    return (
        <div className="flex flex-col min-h-0 shrink-0">
            {/* 헤더 */}
            <div
                className="grid gap-x-0.5 px-2 py-2 text-xs font-bold uppercase tracking-wider border-b border-slate-700 bg-slate-800 text-slate-400 shrink-0"
                style={{ gridTemplateColumns: BOX_GRID }}
            >
                <span>{label}</span>
                <span className="text-center">P</span>
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
            {/* 선수 행 */}
            {sorted.map((p, i) => (
                <div
                    key={p.playerId}
                    className={`grid gap-x-0.5 px-2 py-1.5 items-center text-xs font-mono ${i % 2 === 0 ? 'bg-slate-800/20' : ''}`}
                    style={{ gridTemplateColumns: BOX_GRID }}
                >
                    <span className="font-sans text-xs text-slate-300 truncate flex items-center gap-1">
                        <span className="truncate">{p.playerName}</span>
                        {(() => {
                            const s = p.recentShots;
                            if (s && s.length >= 3 && s.slice(-3).every(Boolean)) return <span className="shrink-0">🔥</span>;
                            if (s && s.length >= 4 && s.slice(-4).every(v => !v)) return <span className="shrink-0">❄️</span>;
                            return null;
                        })()}
                    </span>
                    <span className="text-center text-slate-400 text-[10px]">{p.position ?? '-'}</span>
                    <span className="text-right text-slate-400">{Math.round(p.mp ?? 0)}</span>
                    <span className="text-right text-slate-300">{p.pts}</span>
                    <span className="text-right text-slate-300">{p.reb}</span>
                    <span className="text-right text-slate-300">{p.ast}</span>
                    <span className="text-right text-slate-300">{p.stl}</span>
                    <span className="text-right text-slate-300">{p.blk}</span>
                    <span className="text-right text-slate-300">{p.tov}</span>
                    <span className="text-right text-slate-300">{p.pf}</span>
                    <span className="text-right text-slate-300">{p.fgm}-{p.fga}</span>
                    <span className="text-right text-slate-300">{p.p3m}-{p.p3a}</span>
                </div>
            ))}
            {/* 팀 합계 */}
            <div
                className="grid gap-x-0.5 px-2 py-1.5 items-center border-t border-slate-700 bg-slate-800/60 text-slate-300 text-xs font-mono font-bold shrink-0"
                style={{ gridTemplateColumns: BOX_GRID }}
            >
                <span className="font-sans text-xs uppercase">TEAM</span>
                <span />
                <span className="text-right" />
                <span className="text-right">{total.pts}</span>
                <span className="text-right">{total.reb}</span>
                <span className="text-right">{total.ast}</span>
                <span className="text-right">{total.stl}</span>
                <span className="text-right">{total.blk}</span>
                <span className="text-right">{total.tov}</span>
                <span className="text-right">{total.pf}</span>
                <span className="text-right">{total.fga > 0 ? (total.fgm / total.fga * 100).toFixed(1) + '%' : '-'}</span>
                <span className="text-right">{total.p3a > 0 ? (total.p3m / total.p3a * 100).toFixed(1) + '%' : '-'}</span>
            </div>
        </div>
    );
};

// ─── BoxScorePlaceholder (live 구간 — 박스스코어 비공개) ────────────────────────

const BoxScorePlaceholder: React.FC<{ label: string }> = ({ label }) => (
    <div className="flex flex-col shrink-0">
        <div className="px-2 py-2 text-xs font-bold uppercase tracking-wider border-b border-slate-700 bg-slate-800 text-slate-400">
            {label}
        </div>
        <div className="py-10 text-center text-slate-600 text-xs ko-normal">
            박스스코어는 중계 종료 후 공개됩니다
        </div>
    </div>
);

// ─── TeamStatsCompare ─────────────────────────────────────────────────────────

const TEAM_STAT_ROWS = [
    { key: 'pts',   label: 'PTS', fmt: (v: number) => String(v)      },
    { key: 'fgPct', label: 'FG%', fmt: (v: number) => v.toFixed(1)   },
    { key: 'p3Pct', label: '3P%', fmt: (v: number) => v.toFixed(1)   },
    { key: 'ftPct', label: 'FT%', fmt: (v: number) => v.toFixed(1)   },
    { key: 'oreb',  label: 'OREB', fmt: (v: number) => String(v)     },
    { key: 'reb',   label: 'REB', fmt: (v: number) => String(v)      },
    { key: 'ast',   label: 'AST', fmt: (v: number) => String(v)      },
    { key: 'stl',   label: 'STL', fmt: (v: number) => String(v)      },
    { key: 'tov',   label: 'TOV', fmt: (v: number) => String(v)      },
    { key: 'blk',   label: 'BLK', fmt: (v: number) => String(v)      },
    { key: 'pf',    label: 'PF',  fmt: (v: number) => String(v)      },
] as const;

const TeamStatsCompare: React.FC<{
    home:      TeamStats;
    away:      TeamStats;
    homeBox:   PlayerBoxScore[];
    awayBox:   PlayerBoxScore[];
    homeColor: string;
    awayColor: string;
}> = ({ home, away, homeBox, awayBox, homeColor, awayColor }) => {
    const derived = useMemo(() => {
        const sum = (box: PlayerBoxScore[], fn: (p: PlayerBoxScore) => number) => box.reduce((s, p) => s + fn(p), 0);
        const mk = (s: TeamStats, box: PlayerBoxScore[]) => ({
            pts:   s.pts,
            fgPct: s.fga > 0 ? (s.fgm / s.fga) * 100 : 0,
            p3Pct: s.p3a > 0 ? (s.p3m / s.p3a) * 100 : 0,
            ftPct: s.fta > 0 ? (s.ftm / s.fta) * 100 : 0,
            oreb:  sum(box, p => p.offReb),
            reb:   sum(box, p => p.reb),
            ast:   sum(box, p => p.ast),
            stl:   sum(box, p => p.stl),
            tov:   s.tov,
            blk:   s.blk,
            pf:    s.pf,
        });
        return { home: mk(home, homeBox), away: mk(away, awayBox) };
    }, [home, away, homeBox, awayBox]);

    return (
        <div className="shrink-0 px-3 py-2 border-t border-slate-800">
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">팀 스탯</p>
            <div className="flex flex-col gap-1">
                {TEAM_STAT_ROWS.map(({ key, label, fmt }) => {
                    const h = derived.home[key];
                    const a = derived.away[key];
                    const total = h + a;
                    const hPct  = total > 0 ? (h / total) * 100 : 50;
                    const aPct  = total > 0 ? (a / total) * 100 : 50;
                    const bothZero = h === 0 && a === 0;
                    return (
                        <div key={key} className="grid grid-cols-[1fr_30px_36px_30px_1fr] items-center gap-1">
                            <div className="h-2.5 flex justify-end rounded-sm overflow-hidden bg-slate-900">
                                {!bothZero && <div className="h-full rounded-sm transition-all duration-300" style={{ width: `${aPct}%`, backgroundColor: awayColor }} />}
                            </div>
                            <span className={`text-[10px] font-mono text-right text-white ${a > h ? 'font-bold' : ''}`}>{fmt(a)}</span>
                            <span className="text-xs font-bold text-slate-500 text-center uppercase">{label}</span>
                            <span className={`text-[10px] font-mono text-left text-white ${h > a ? 'font-bold' : ''}`}>{fmt(h)}</span>
                            <div className="h-2.5 flex justify-start rounded-sm overflow-hidden bg-slate-900">
                                {!bothZero && <div className="h-full rounded-sm transition-all duration-300" style={{ width: `${hPct}%`, backgroundColor: homeColor }} />}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ─── Main ─────────────────────────────────────────────────────────────────────

const MultiGamePbpView: React.FC = () => {
    const { gameId }           = useParams<{ leagueId: string; gameId: string }>();
    const navigate              = useNavigate();
    const { room, leagueTeams } = useLeagueContext();

    const [gameData,      setGameData]      = useState<GamePbpRow | null>(null);
    const [isLoading,     setIsLoading]     = useState(true);
    const [error,         setError]         = useState<string | null>(null);
    // undefined: 미조회, null: 레거시(scheduledAt 없음), string: 정시
    const [scheduledAt,   setScheduledAt]   = useState<string | null | undefined>(undefined);
    const [quarterFilter, setQuarterFilter] = useState<0|1|2|3|4|5>(0);
    const prevVisibleCountRef = useRef(0);
    const serverNow = useServerClock();

    // scheduled/live/final 표시 상태. scheduledAt + serverNow만으로 결정되므로
    // 누가 언제 접속해도 동일한 시점에 동일한 상태가 나온다.
    const displayState = getGameDisplayState({ scheduledAt: scheduledAt ?? undefined }, serverNow);

    // rooms.schedule에서 scheduledAt 조회. game_pbp는 RLS로 정시 전 row가 숨겨지므로
    // scheduled 상태 판정에는 schedule 쪽 정보가 필요하다.
    useEffect(() => {
        if (!room?.id || !gameId) return;
        let cancelled = false;
        (async () => {
            const { data } = await supabase
                .from('rooms')
                .select('schedule')
                .eq('id', room.id)
                .single();
            if (cancelled) return;
            const schedule = (data?.schedule as Game[] | null) ?? [];
            const game = schedule.find(g => g.id === gameId);
            setScheduledAt(game?.scheduledAt ?? null);
        })();
        return () => { cancelled = true; };
    }, [room?.id, gameId]);

    // game_pbp 조회. displayState==='scheduled'이면 RLS가 row를 가려 항상 실패하므로 시도하지 않고,
    // gameData를 이미 확보했으면 재조회하지 않는다. live/final로 전환될 때마다(정시 진입/+10분)
    // displayState가 바뀌어 effect가 재실행되므로, 사전계산 지연으로 정시 직후 row가 아직 없던
    // 경우에도 자동으로 재시도되어 "먼저 들어온 유저만 에러 화면에 고정"되는 문제를 방지한다.
    useEffect(() => {
        if (!room?.id || !gameId) return;
        if (gameData) return;
        if (displayState === 'scheduled') return;
        let cancelled = false;
        (async () => {
            setIsLoading(true);
            const { data, error: err } = await supabase
                .from('game_pbp')
                .select('game_id,home_team_id,away_team_id,home_score,away_score,game_start_time,events,shot_events,home_box,away_box,box_timeline')
                .eq('room_id', room.id)
                .eq('game_id', gameId)
                .single();
            if (cancelled) return;
            if (err || !data) setError('경기 데이터를 준비하는 중입니다. 잠시 후 다시 시도해주세요.');
            else             { setGameData(data as GamePbpRow); setError(null); }
            setIsLoading(false);
        })();
        return () => { cancelled = true; };
    }, [room?.id, gameId, displayState, gameData]);

    // ── 시간 기반 필터 ──────────────────────────────────────────────────────────

    // live가 아니면(final/레거시) 항상 전체를 표시 — reveal 상태가 단일 진실 소스이므로
    // game_start_time 기반 elapsed와 displayState 간 엣지케이스 불일치를 방지한다.
    const visibleEvents = useMemo<PbpLog[]>(() => {
        if (!gameData) return [];
        const all = gameData.events as PbpLog[];
        if (displayState !== 'live') return all;
        const startMs = new Date(gameData.game_start_time).getTime();
        const elapsed = serverNow - startMs;
        return all.filter(e => {
            const replayMs = (toGameSeconds(e) / TOTAL_GAME_SECONDS) * REPLAY_DURATION_MS;
            return replayMs <= elapsed;
        });
    }, [gameData, serverNow, displayState]);

    const visibleShotEvents = useMemo<ShotEvent[]>(() => {
        if (!gameData) return [];
        const all = (gameData.shot_events ?? []) as ShotEvent[];
        if (displayState !== 'live') return all;
        const startMs = new Date(gameData.game_start_time).getTime();
        const elapsed = serverNow - startMs;
        return all.filter(s => {
            const secs    = (s.quarter - 1) * 720 + (720 - ((s as any).gameClock ?? 0));
            const replayMs = (secs / TOTAL_GAME_SECONDS) * REPLAY_DURATION_MS;
            return replayMs <= elapsed;
        });
    }, [gameData, serverNow, displayState]);

    useEffect(() => {
        if (!gameData || visibleEvents.length <= prevVisibleCountRef.current) return;
        const all = gameData.events as PbpLog[];
        const newEvents = visibleEvents.slice(prevVisibleCountRef.current);
        for (const e of newEvents) {
            const idx    = all.indexOf(e);
            const prev   = idx > 0 ? all[idx - 1] : null;
            const currMs = (toGameSeconds(e) / TOTAL_GAME_SECONDS) * REPLAY_DURATION_MS;
            const prevMs = prev ? (toGameSeconds(prev) / TOTAL_GAME_SECONDS) * REPLAY_DURATION_MS : 0;
            const gapSec = ((currMs - prevMs) / 1000).toFixed(2);
            console.log(`[PBP] Q${e.quarter} ${e.timeRemaining} | gap: ${gapSec}s | ${e.type}: ${e.text.slice(0, 60)}`);
        }
        prevVisibleCountRef.current = visibleEvents.length;
    }, [visibleEvents]); // eslint-disable-line react-hooks/exhaustive-deps

    const filteredLogs = useMemo<PbpLog[]>(() => {
        const base = quarterFilter === 0
            ? visibleEvents
            : visibleEvents.filter(l => l.quarter === quarterFilter);
        return base.filter(l => l.text.trim() !== '').slice().reverse();
    }, [visibleEvents, quarterFilter]);

    // ── 팀 정보 ────────────────────────────────────────────────────────────────

    const homeTeam = useMemo(() => leagueTeams.find(t => t.team_slug === gameData?.home_team_id), [leagueTeams, gameData]);
    const awayTeam = useMemo(() => leagueTeams.find(t => t.team_slug === gameData?.away_team_id), [leagueTeams, gameData]);

    const homeColor = homeTeam?.color_primary   ?? '#4f46e5';
    const homeText  = homeTeam?.color_secondary ?? '#fff';
    const awayColor = awayTeam?.color_primary   ?? '#0f172a';
    const awayText  = awayTeam?.color_secondary ?? '#fff';
    const homeAbbr  = homeTeam?.team_abbr ?? (gameData?.home_team_id.toUpperCase().slice(0, 3) ?? 'HOM');
    const awayAbbr  = awayTeam?.team_abbr ?? (gameData?.away_team_id.toUpperCase().slice(0, 3) ?? 'AWY');
    const homeName  = homeTeam?.team_name ?? gameData?.home_team_id ?? '';
    const awayName  = awayTeam?.team_name ?? gameData?.away_team_id ?? '';

    // ── 파생 상태 ──────────────────────────────────────────────────────────────

    const homeStats = useMemo(
        () => computeTeamStats(visibleEvents, visibleShotEvents, gameData?.home_team_id ?? ''),
        [visibleEvents, visibleShotEvents, gameData?.home_team_id],
    );
    const awayStats = useMemo(
        () => computeTeamStats(visibleEvents, visibleShotEvents, gameData?.away_team_id ?? ''),
        [visibleEvents, visibleShotEvents, gameData?.away_team_id],
    );

    // ── 박스스코어 점진 공개 (live 구간) ────────────────────────────────────────
    const hasBoxTimeline = (gameData?.box_timeline?.length ?? 0) > 0;

    const liveHomeBox = useMemo<PlayerBoxScore[]>(() => {
        if (!gameData || displayState !== 'live' || !hasBoxTimeline) return [];
        const startMs = new Date(gameData.game_start_time).getTime();
        return buildLiveBox(gameData.box_timeline ?? [], serverNow - startMs, gameData.home_box ?? []);
    }, [gameData, serverNow, displayState, hasBoxTimeline]);

    const liveAwayBox = useMemo<PlayerBoxScore[]>(() => {
        if (!gameData || displayState !== 'live' || !hasBoxTimeline) return [];
        const startMs = new Date(gameData.game_start_time).getTime();
        return buildLiveBox(gameData.box_timeline ?? [], serverNow - startMs, gameData.away_box ?? []);
    }, [gameData, serverNow, displayState, hasBoxTimeline]);

    const currentScore = useMemo(() => {
        const last = [...visibleEvents].reverse().find(e => e.homeScore != null);
        return last ? { home: last.homeScore ?? 0, away: last.awayScore ?? 0 } : { home: 0, away: 0 };
    }, [visibleEvents]);

    const currentQuarter = visibleEvents.length > 0 ? visibleEvents[visibleEvents.length - 1].quarter : 1;
    const currentMinute  = useMemo(() => {
        if (visibleEvents.length === 0) return 0;
        const last = visibleEvents[visibleEvents.length - 1];
        return Math.floor(toGameSeconds(last) / 60);
    }, [visibleEvents]);

    // isLive/showBox: reveal 상태 자체가 단일 진실 소스 — scheduledAt+10분 전이면 live, 이후 final.
    const isLive         = displayState === 'live';
    const showBox        = displayState === 'final';
    const maxSelectableQ = visibleEvents.length > 0 ? Math.max(...visibleEvents.map(e => e.quarter)) : 0;
    const maxQuarter     = Math.max(...((gameData?.events ?? []) as PbpLog[]).map(e => e.quarter), 4);
    const quarterLabel         = isLive ? `Q${currentQuarter}` : 'Final';
    const currentTimeRemaining = visibleEvents.length > 0 ? visibleEvents[visibleEvents.length - 1].timeRemaining : '';

    // ── Loading / Scheduled / Error ───────────────────────────────────────────

    if (isLoading || scheduledAt === undefined) {
        return (
            <div className="flex items-center justify-center h-full bg-slate-950">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    // scheduled: 정시 전 — PBP/결과를 전혀 노출하지 않고 카운트다운만 표시
    if (displayState === 'scheduled') {
        const startMs     = scheduledAt ? new Date(scheduledAt).getTime() : null;
        const remainingMs = startMs != null ? Math.max(0, startMs - serverNow) : null;
        const startLabel  = startMs != null
            ? new Date(startMs).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
            : '';
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3 bg-slate-950">
                <Clock size={32} className="text-indigo-400" />
                <p className="text-white text-lg font-black ko-tight">
                    {startLabel ? `${startLabel} 시작 예정` : '경기 시작 전'}
                </p>
                {remainingMs != null && (
                    <p className="text-slate-400 text-sm font-mono tabular-nums">
                        시작까지 {fmtCountdown(remainingMs)}
                    </p>
                )}
                <button onClick={() => navigate(-1)} className="text-indigo-400 text-sm ko-normal hover:underline mt-2">뒤로</button>
            </div>
        );
    }

    // live/final인데 game_pbp row가 아직 없는 경우 (사전계산 지연 등 예외 상황)
    if (error || !gameData) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 bg-slate-950">
                <p className="text-slate-400 text-sm ko-normal">{error ?? '경기 데이터를 준비하는 중입니다. 잠시 후 다시 시도해주세요.'}</p>
                <button onClick={() => navigate(-1)} className="text-indigo-400 text-sm ko-normal hover:underline">뒤로</button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-slate-950 text-white overflow-hidden">

            {/* ── 스코어버그 헤더 ── */}
            <div className="relative bg-slate-900 border-b border-slate-800 py-5 px-[10%] shrink-0 overflow-hidden">
                <div className="absolute inset-0 pointer-events-none" style={{
                    background: `linear-gradient(to right, ${awayColor}60, transparent 30%, transparent 70%, ${homeColor}60)`
                }} />

                <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center">
                    {/* Away */}
                    <div className="flex items-center justify-end gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-black shrink-0"
                                style={{ backgroundColor: awayColor, color: awayText }}>{awayAbbr.slice(0, 3)}</div>
                            <span className="text-xl font-black uppercase tracking-wide whitespace-nowrap truncate">{awayName}</span>
                        </div>
                        <span className="text-5xl font-black tabular-nums leading-none text-white w-[4ch] text-right shrink-0">{currentScore.away}</span>
                    </div>

                    {/* Center */}
                    <div className="w-[180px] flex flex-col items-center justify-center mx-4 gap-1">
                        <div className="flex items-center justify-center gap-2">
                            <span className="text-2xl font-black tabular-nums text-white leading-none">{quarterLabel}</span>
                            {isLive && currentTimeRemaining && (
                                <>
                                    <span className="text-slate-600 text-2xl leading-none font-light">|</span>
                                    <span className="text-2xl font-black tabular-nums text-slate-300 leading-none">{currentTimeRemaining}</span>
                                </>
                            )}
                        </div>
                        {isLive ? (
                            <span className="flex items-center gap-1 text-xs font-bold text-red-400">
                                <Circle size={6} className="fill-red-400 animate-pulse" />
                                LIVE
                            </span>
                        ) : (
                            <span className="text-xs text-slate-500 ko-normal">최종 결과</span>
                        )}
                    </div>

                    {/* Home */}
                    <div className="flex items-center justify-start gap-3">
                        <span className="text-5xl font-black tabular-nums leading-none text-white w-[4ch] text-left shrink-0">{currentScore.home}</span>
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xl font-black uppercase tracking-wide whitespace-nowrap truncate">{homeName}</span>
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-black shrink-0"
                                style={{ backgroundColor: homeColor, color: homeText }}>{homeAbbr.slice(0, 3)}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── 탭 바 ── */}
            <div className="relative flex items-center px-3 py-1.5 bg-slate-900 border-b border-slate-800 shrink-0 overflow-hidden">
                <div className="absolute inset-0 pointer-events-none" style={{
                    background: `linear-gradient(to right, ${awayColor}40, transparent 30%, transparent 70%, ${homeColor}40)`
                }} />
                <div className="relative z-10 flex-1 flex items-center">
                    <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-xs font-bold">
                        <ArrowLeft size={14} />
                        뒤로
                    </button>
                </div>
                <div className="relative z-10 flex items-center">
                    {isLive && (
                        <span className="flex items-center gap-1 text-xs font-bold text-red-400">
                            <Circle size={6} className="fill-red-400 animate-pulse" />
                            LIVE
                        </span>
                    )}
                </div>
            </div>

            {/* ── Body: LiveGameView와 동일한 3-column ── */}
            <div className="flex flex-1 overflow-hidden">

                {/* LEFT: 원정팀 박스스코어 + 하단 패널 */}
                <div className="w-[30%] border-r border-slate-800 bg-slate-950 flex flex-col overflow-hidden">
                    {showBox ? (
                        <PlayerBoxPanel
                            players={gameData.away_box ?? []}
                            label={awayAbbr}
                        />
                    ) : hasBoxTimeline ? (
                        <PlayerBoxPanel
                            players={liveAwayBox}
                            label={awayAbbr}
                        />
                    ) : (
                        <BoxScorePlaceholder label={awayAbbr} />
                    )}
                    <div className="flex-1 min-h-0 border-t border-slate-800 flex flex-col overflow-hidden">
                        <CompactWPGraph
                            allLogs={visibleEvents}
                            homeTeamId={gameData.home_team_id}
                            currentMinute={currentMinute}
                            homeColor={homeColor}
                            awayColor={awayColor}
                            homeAbbr={homeAbbr}
                            awayAbbr={awayAbbr}
                        />
                    </div>
                </div>

                {/* CENTER: 풀코트 샷차트(상단, aspect-ratio) + PBP 피드(하단) */}
                <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">

                    {/* 샷차트 */}
                    <div className="shrink-0 border-b border-slate-800">
                        <MultiFullCourtChart
                            homeTeamId={gameData.home_team_id}
                            homeColor={homeColor}
                            homeAbbr={homeAbbr}
                            awayTeamId={gameData.away_team_id}
                            awayColor={awayColor}
                            awayAbbr={awayAbbr}
                            shotEvents={visibleShotEvents}
                        />
                    </div>

                    {/* PBP 피드 */}
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        {/* 헤더 + 쿼터 필터 */}
                        <div className="shrink-0 px-3 pt-2 pb-1.5 bg-slate-800 border-b border-slate-700">
                            <div className="flex items-center gap-3">
                                <p className="text-xs text-slate-300 font-semibold uppercase tracking-wider">
                                    플레이-바이-플레이
                                </p>
                                <div className="flex gap-1">
                                    {([0, 1, 2, 3, 4, ...(maxQuarter > 4 ? Array.from({ length: maxQuarter - 4 }, (_, i) => i + 5) : [])] as number[]).map(q => (
                                        <button
                                            key={q}
                                            onClick={() => setQuarterFilter(q as 0|1|2|3|4|5)}
                                            disabled={q > maxSelectableQ && q !== 0}
                                            className={`px-2 py-0.5 rounded text-xs font-bold transition-colors
                                                disabled:opacity-30 disabled:cursor-not-allowed
                                                ${quarterFilter === q
                                                    ? 'bg-indigo-600 text-white'
                                                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                                }`}
                                        >
                                            {q === 0 ? '전체' : q <= 4 ? `${q}Q` : `OT${q - 4}`}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* PBP 스크롤 */}
                        <div
                            className="flex-1 min-h-0 overflow-y-auto font-mono text-xs"
                            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
                        >
                            <div className="divide-y divide-slate-800/50">
                                {filteredLogs.map((log, i) => {
                                    const isHome      = log.teamId === gameData.home_team_id;
                                    const isScore     = log.type === 'score';
                                    const isFT        = log.type === 'freethrow';
                                    const isFoul      = log.type === 'foul';
                                    const isTurnover  = log.type === 'turnover';
                                    const isBlock     = log.type === 'block';
                                    const isInfo      = log.type === 'info';
                                    const isInjury    = log.type === 'injury';
                                    const isFlowEvent = log.text.includes('경기 시작') || log.text.includes('종료') || log.text.includes('하프 타임');

                                    if (isFlowEvent) {
                                        return (
                                            <div key={i} className={`flex items-center justify-center py-2.5 border-y border-slate-800 ${i % 2 === 0 ? 'bg-slate-800/40' : 'bg-slate-800/20'}`}>
                                                <div className="flex items-center gap-1.5 text-indigo-300 font-bold text-xs uppercase tracking-widest">
                                                    <Clock size={12} />
                                                    <span>{log.text}</span>
                                                </div>
                                            </div>
                                        );
                                    }

                                    if (log.text.startsWith('교체:')) {
                                        const inMatch  = log.text.match(/IN \[(.*?)\]/);
                                        const outMatch = log.text.match(/OUT \[(.*?)\]/);
                                        if (inMatch && outMatch) {
                                            const inPlayers  = inMatch[1].split(',').map(s => s.trim());
                                            const outPlayers = outMatch[1].split(',').map(s => s.trim());
                                            const isSubHome  = log.teamId === gameData.home_team_id;
                                            return (
                                                <div key={i} className={`flex items-start py-2 px-3 gap-3 ${i % 2 === 0 ? 'bg-slate-800/30' : ''}`}>
                                                    <div className="flex-shrink-0 w-5 text-slate-600 font-bold text-xs text-center pt-0.5">{log.quarter}Q</div>
                                                    <div className="flex-shrink-0 w-10 text-slate-500 font-bold text-xs text-center pt-0.5">{log.timeRemaining || '-'}</div>
                                                    <div className="flex-shrink-0 w-8 text-right pt-0.5">
                                                        <span className={`text-xs font-bold ${!isSubHome ? 'text-slate-300' : 'text-slate-600'}`}>{awayAbbr}</span>
                                                    </div>
                                                    <div className="flex-shrink-0 w-12 text-center pt-0.5">
                                                        {log.awayScore !== undefined && (
                                                            <div className="font-black text-slate-500 text-xs tracking-tight">
                                                                <span>{log.awayScore}</span>
                                                                <span className="mx-0.5 text-slate-700">:</span>
                                                                <span>{log.homeScore}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-shrink-0 w-8 pt-0.5">
                                                        <span className={`text-xs font-bold ${isSubHome ? 'text-slate-300' : 'text-slate-600'}`}>{homeAbbr}</span>
                                                    </div>
                                                    <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                                                        <div className="flex items-baseline gap-1.5 leading-relaxed text-xs text-slate-300">
                                                            <span className="shrink-0 text-xs font-bold text-slate-500">IN</span>
                                                            <span>{inPlayers.join(', ')}</span>
                                                        </div>
                                                        <div className="flex items-baseline gap-1.5 leading-relaxed text-xs text-slate-500">
                                                            <span className="shrink-0 text-xs font-bold">OUT</span>
                                                            <span>{outPlayers.join(', ')}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }
                                    }

                                    let textColor = 'text-slate-400';
                                    if (isInjury)        textColor = 'text-red-400 font-bold';
                                    else if (isInfo)     textColor = 'text-slate-300';
                                    else if (isScore)    textColor = 'text-slate-200';
                                    else if (isFT)       textColor = 'text-cyan-400';
                                    else if (isFoul)     textColor = 'text-orange-400';
                                    else if (isTurnover) textColor = 'text-red-400';
                                    else if (isBlock)    textColor = 'text-blue-400';

                                    const bgClass = isInjury
                                        ? 'bg-red-900/20 border-y border-red-900/30'
                                        : i % 2 === 0 ? 'bg-slate-800/30' : '';

                                    return (
                                        <div key={i} className={`flex items-center py-2 px-3 gap-3 ${bgClass}`}>
                                            <div className="flex-shrink-0 w-5 text-slate-600 font-bold text-xs text-center">{log.quarter}Q</div>
                                            <div className="flex-shrink-0 w-10 text-slate-500 font-bold text-xs text-center">{log.timeRemaining || '-'}</div>
                                            <div className="flex-shrink-0 w-8 text-right">
                                                <span className={`text-xs font-bold ${!isHome ? 'text-slate-300' : 'text-slate-600'}`}>
                                                    {awayAbbr}
                                                </span>
                                            </div>
                                            <div className="flex-shrink-0 w-12 text-center">
                                                {log.awayScore !== undefined && (
                                                    <div className="font-black text-slate-500 text-xs tracking-tight">
                                                        <span className={!isHome && (isScore || isFT) ? 'text-white' : ''}>{log.awayScore}</span>
                                                        <span className="mx-0.5 text-slate-700">:</span>
                                                        <span className={isHome && (isScore || isFT) ? 'text-white' : ''}>{log.homeScore}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-shrink-0 w-8">
                                                <span className={`text-xs font-bold ${isHome ? 'text-slate-300' : 'text-slate-600'}`}>
                                                    {homeAbbr}
                                                </span>
                                            </div>
                                            <div className={`flex-1 break-words leading-relaxed text-xs ${textColor}`}>{log.text}</div>
                                        </div>
                                    );
                                })}

                                {filteredLogs.length === 0 && (
                                    <div className="py-10 text-center text-slate-600 text-xs ko-normal">
                                        {isLive ? '경기 시작 대기 중…' : '해당 쿼터의 기록이 없습니다.'}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT: 홈팀 박스스코어 + 팀스탯 */}
                <div className="w-[30%] border-l border-slate-800 bg-slate-950 flex flex-col overflow-hidden">
                    {showBox ? (
                        <PlayerBoxPanel
                            players={gameData.home_box ?? []}
                            label={homeAbbr}
                        />
                    ) : hasBoxTimeline ? (
                        <PlayerBoxPanel
                            players={liveHomeBox}
                            label={homeAbbr}
                        />
                    ) : (
                        <BoxScorePlaceholder label={homeAbbr} />
                    )}
                    <div className="flex-1 min-h-0 border-t border-slate-800 flex flex-col overflow-y-auto" style={{ scrollbarWidth: 'none' } as React.CSSProperties}>
                        <QuarterScores
                            allLogs={visibleEvents}
                            homeTeamId={gameData.home_team_id}
                            currentQuarter={currentQuarter}
                            homeAbbr={homeAbbr}
                            awayAbbr={awayAbbr}
                        />
                        <TeamStatsCompare
                            home={homeStats}
                            away={awayStats}
                            homeBox={showBox ? (gameData.home_box ?? []) : liveHomeBox}
                            awayBox={showBox ? (gameData.away_box ?? []) : liveAwayBox}
                            homeColor={homeColor}
                            awayColor={awayColor}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MultiGamePbpView;
