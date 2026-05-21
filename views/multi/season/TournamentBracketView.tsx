
import React, { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import type { PlayoffSeries, Game } from '../../../types';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';
import { TeamLogo } from '../../../components/common/TeamLogo';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
    series: PlayoffSeries[];
    schedule: Game[];
    leagueTeams: LeagueTeamRow[];
    myTeamId: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRoundLabel(round: number, totalRounds: number): string {
    if (round === totalRounds) return '결승';
    if (round === totalRounds - 1 && totalRounds > 2) return '준결승';
    return `${round}라운드`;
}

function matchIndex(seriesId: string): number {
    const m = seriesId.split('_M')[1];
    return m !== undefined ? parseInt(m, 10) : 0;
}

// ── Team Slot ─────────────────────────────────────────────────────────────────

const TeamSlot: React.FC<{
    teamId: string;
    wins: number;
    showWins: boolean;
    isWinner: boolean;
    finished: boolean;
    isMe: boolean;
    leagueTeams: LeagueTeamRow[];
}> = ({ teamId, wins, showWins, isWinner, finished, isMe, leagueTeams }) => {
    if (teamId === 'BYE') return null;

    if (teamId === 'TBD') {
        return (
            <div className="flex items-center gap-2 px-2.5 py-[7px]">
                <div className="w-5 h-5 rounded bg-slate-700/50 flex-shrink-0" />
                <span className="text-[11px] font-bold text-slate-600 flex-1">TBD</span>
            </div>
        );
    }

    const team = leagueTeams.find(t => t.team_slug === teamId);
    const label = team?.team_abbr ?? teamId.toUpperCase();

    return (
        <div className={`flex items-center gap-2 px-2.5 py-[7px] ${isMe ? 'bg-indigo-900/20' : ''}`}>
            <TeamLogo teamId={teamId} size="sm" />
            <span className={`text-[11px] font-bold flex-1 truncate ${
                isWinner ? 'text-white' : finished ? 'text-slate-500' : isMe ? 'text-indigo-300' : 'text-slate-200'
            }`}>
                {label}
            </span>
            {showWins && (
                <span className={`text-[11px] font-black tabular-nums ${isWinner ? 'text-white' : 'text-slate-600'}`}>
                    {wins}
                </span>
            )}
        </div>
    );
};

// ── Match Card ────────────────────────────────────────────────────────────────

const MatchCard: React.FC<{
    series: PlayoffSeries;
    leagueTeams: LeagueTeamRow[];
    myTeamId: string | null;
    selected: boolean;
    onClick: () => void;
}> = ({ series, leagueTeams, myTeamId, selected, onClick }) => {
    const isBye = series.lowerSeedId === 'BYE';
    const showWins = series.targetWins > 1;

    if (isBye) {
        const team = leagueTeams.find(t => t.team_slug === series.higherSeedId);
        return (
            <div className="w-44 rounded-lg border border-slate-700/40 bg-slate-900 flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                    <TeamLogo teamId={series.higherSeedId} size="sm" />
                    <span className="text-[11px] font-bold text-emerald-400 truncate">
                        {team?.team_abbr ?? series.higherSeedId.toUpperCase()}
                    </span>
                </div>
                <span className="text-[9px] font-bold text-slate-600 ml-2 shrink-0">부전승</span>
            </div>
        );
    }

    return (
        <div
            className={`w-44 rounded-lg overflow-hidden border cursor-pointer transition-all select-none ${
                selected
                    ? 'border-indigo-500 ring-1 ring-indigo-500/30 bg-slate-800'
                    : 'border-slate-700/50 bg-slate-900 hover:border-slate-600'
            }`}
            onClick={onClick}
        >
            <TeamSlot
                teamId={series.higherSeedId}
                wins={series.higherSeedWins}
                showWins={showWins}
                isWinner={series.winnerId === series.higherSeedId}
                finished={series.finished}
                isMe={series.higherSeedId === myTeamId}
                leagueTeams={leagueTeams}
            />
            <div className="border-t border-slate-700/40" />
            <TeamSlot
                teamId={series.lowerSeedId}
                wins={series.lowerSeedWins}
                showWins={showWins}
                isWinner={series.winnerId === series.lowerSeedId}
                finished={series.finished}
                isMe={series.lowerSeedId === myTeamId}
                leagueTeams={leagueTeams}
            />
        </div>
    );
};

// ── Bracket Connector SVG ────────────────────────────────────────────────────
//
//  ─────┐
//       ├──
//  ─────┘

const BracketConnector: React.FC = () => (
    <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full h-full block"
    >
        <path
            d="M 0,25 H 50 V 75 H 0"
            fill="none"
            stroke="rgb(51,65,85)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
        />
        <path
            d="M 50,50 H 100"
            fill="none"
            stroke="rgb(51,65,85)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
        />
    </svg>
);

// ── Main Component ────────────────────────────────────────────────────────────

const MATCH_W = 176; // px — match card column width
const CONN_W  = 40;  // px — connector column width
const ROW_H   = 100; // px — one R1 match row height

const TournamentBracketView: React.FC<Props> = ({ series, schedule, leagueTeams, myTeamId }) => {
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const totalRounds = useMemo(
        () => series.reduce((max, s) => Math.max(max, s.round), 1),
        [series],
    );

    const r1Count = useMemo(
        () => series.filter(s => s.round === 1).length,
        [series],
    );

    // Group and sort series by round, then match index
    const byRound = useMemo(() => {
        const map = new Map<number, PlayoffSeries[]>();
        for (const s of series) {
            const arr = map.get(s.round) ?? [];
            arr.push(s);
            map.set(s.round, arr);
        }
        for (const [round, arr] of map) {
            map.set(round, [...arr].sort((a, b) => matchIndex(a.id) - matchIndex(b.id)));
        }
        return map;
    }, [series]);

    const selectedSeries = useMemo(
        () => series.find(s => s.id === selectedId),
        [series, selectedId],
    );

    const selectedGames = useMemo(() => {
        if (!selectedId) return [];
        return schedule
            .filter(g => g.seriesId === selectedId && g.played)
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [schedule, selectedId]);

    const higherTeam = selectedSeries
        ? leagueTeams.find(t => t.team_slug === selectedSeries.higherSeedId)
        : null;
    const lowerTeam = selectedSeries
        ? leagueTeams.find(t => t.team_slug === selectedSeries.lowerSeedId)
        : null;

    // ── Grid layout computation ─────────────────────────────────────────────
    // Each round r occupies column 2r-1 (1-indexed, odd columns).
    // Connector between round r and r+1 occupies column 2r (even columns).
    // For series at round r, match index m:
    //   rowStep = 2^(r-1)
    //   gridRow: m*rowStep+1 … (m+1)*rowStep
    // For connector between r and r+1, pair index m:
    //   rowStep = 2^(r-1)
    //   gridRow: 2m*rowStep+1 … (2m+2)*rowStep

    type GridSeries  = { key: string; series: PlayoffSeries; col: number; rowStart: number; rowSpan: number };
    type GridConn    = { key: string; col: number; rowStart: number; rowSpan: number };

    const gridSeries: GridSeries[] = useMemo(() => {
        const items: GridSeries[] = [];
        for (const [round, arr] of byRound) {
            const rowStep = Math.pow(2, round - 1);
            arr.forEach((s, m) => {
                items.push({
                    key: s.id,
                    series: s,
                    col: 2 * round - 1,
                    rowStart: m * rowStep + 1,
                    rowSpan: rowStep,
                });
            });
        }
        return items;
    }, [byRound]);

    const gridConns: GridConn[] = useMemo(() => {
        const items: GridConn[] = [];
        for (let r = 1; r < totalRounds; r++) {
            const rowStep = Math.pow(2, r - 1);
            const connCount = Math.pow(2, totalRounds - r - 1);
            for (let m = 0; m < connCount; m++) {
                items.push({
                    key: `conn-${r}-${m}`,
                    col: 2 * r,
                    rowStart: m * 2 * rowStep + 1,
                    rowSpan: 2 * rowStep,
                });
            }
        }
        return items;
    }, [totalRounds]);

    const gridCols = 2 * totalRounds - 1;
    const colTemplate = Array.from({ length: gridCols }, (_, i) =>
        i % 2 === 0 ? `${MATCH_W}px` : `${CONN_W}px`,
    ).join(' ');

    const toggle = (id: string) =>
        setSelectedId(prev => prev === id ? null : id);

    return (
        <div className="flex h-full animate-in fade-in duration-500">
            {/* ── Bracket ──────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-auto min-h-0">
                <div className="px-6 pt-5 pb-12 min-h-full inline-block min-w-full">

                    {/* Round headers */}
                    <div
                        className="mb-3 flex gap-0"
                        style={{ width: gridCols % 2 === 1
                            ? `${Math.ceil(gridCols / 2) * MATCH_W + Math.floor(gridCols / 2) * CONN_W}px`
                            : undefined
                        }}
                    >
                        {Array.from({ length: totalRounds }, (_, i) => i + 1).map(r => (
                            <React.Fragment key={r}>
                                <div
                                    className="text-center text-[10px] font-black text-slate-500 uppercase tracking-widest"
                                    style={{ width: MATCH_W, flexShrink: 0 }}
                                >
                                    {getRoundLabel(r, totalRounds)}
                                </div>
                                {r < totalRounds && <div style={{ width: CONN_W, flexShrink: 0 }} />}
                            </React.Fragment>
                        ))}
                    </div>

                    {/* Bracket grid */}
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: colTemplate,
                            gridTemplateRows: `repeat(${r1Count}, ${ROW_H}px)`,
                        }}
                    >
                        {gridSeries.map(({ key, series: s, col, rowStart, rowSpan }) => (
                            <div
                                key={key}
                                className="flex items-center"
                                style={{
                                    gridColumn: col,
                                    gridRow: `${rowStart} / ${rowStart + rowSpan}`,
                                }}
                            >
                                <MatchCard
                                    series={s}
                                    leagueTeams={leagueTeams}
                                    myTeamId={myTeamId}
                                    selected={selectedId === s.id}
                                    onClick={() => s.lowerSeedId !== 'BYE' && toggle(s.id)}
                                />
                            </div>
                        ))}

                        {gridConns.map(({ key, col, rowStart, rowSpan }) => (
                            <div
                                key={key}
                                style={{
                                    gridColumn: col,
                                    gridRow: `${rowStart} / ${rowStart + rowSpan}`,
                                }}
                            >
                                <BracketConnector />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── Side Panel ───────────────────────────────────────────────── */}
            {selectedSeries && (
                <div className="w-72 flex-shrink-0 border-l border-slate-800 bg-slate-900 flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="px-4 py-4 border-b border-slate-800 flex-shrink-0">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                {getRoundLabel(selectedSeries.round, totalRounds)}
                            </span>
                            <button
                                onClick={() => setSelectedId(null)}
                                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X size={13} className="text-slate-500" />
                            </button>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex flex-col items-center gap-1 shrink-0">
                                {higherTeam
                                    ? <TeamLogo teamId={higherTeam.team_slug} size="sm" />
                                    : <div className="w-6 h-6 rounded bg-slate-700" />
                                }
                                <span className="text-[10px] font-bold text-slate-400">
                                    {higherTeam?.team_abbr ?? 'TBD'}
                                </span>
                            </div>

                            <div className="flex-1 text-center">
                                <div className="text-2xl font-black text-white tabular-nums">
                                    {selectedSeries.higherSeedWins} — {selectedSeries.lowerSeedWins}
                                </div>
                                {selectedSeries.finished && selectedSeries.winnerId && (() => {
                                    const winner = leagueTeams.find(t => t.team_slug === selectedSeries.winnerId);
                                    return (
                                        <div className="text-[10px] font-bold text-emerald-400 mt-0.5">
                                            {winner?.team_abbr ?? selectedSeries.winnerId.toUpperCase()} 승리
                                        </div>
                                    );
                                })()}
                            </div>

                            <div className="flex flex-col items-center gap-1 shrink-0">
                                {lowerTeam
                                    ? <TeamLogo teamId={lowerTeam.team_slug} size="sm" />
                                    : <div className="w-6 h-6 rounded bg-slate-700" />
                                }
                                <span className="text-[10px] font-bold text-slate-400">
                                    {lowerTeam?.team_abbr ?? 'TBD'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Games */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {selectedGames.length === 0 ? (
                            <div className="flex items-center justify-center h-24">
                                <span className="text-xs font-bold text-slate-600">경기 결과 없음</span>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-800/50">
                                {selectedGames.map((g, i) => {
                                    const isMyGame = g.homeTeamId === myTeamId || g.awayTeamId === myTeamId;
                                    const myIsHome = g.homeTeamId === myTeamId;
                                    const myScore  = myIsHome ? g.homeScore : g.awayScore;
                                    const oppScore = myIsHome ? g.awayScore : g.homeScore;
                                    const isWin = isMyGame && (myScore ?? 0) > (oppScore ?? 0);
                                    return (
                                        <div key={g.id} className="flex items-center gap-2 px-4 py-3">
                                            <div className="flex items-center gap-1.5 w-14 shrink-0">
                                                <span className="text-xs font-bold text-slate-500">{i + 1}차전</span>
                                                {isMyGame && (
                                                    <span className={`text-[10px] font-black px-1 rounded ${
                                                        isWin ? 'text-emerald-400' : 'text-red-400'
                                                    }`}>
                                                        {isWin ? 'W' : 'L'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex-1 flex items-center justify-center gap-1.5">
                                                <span className="text-[11px] font-bold text-slate-400 uppercase">{g.homeTeamId}</span>
                                                <span className="text-xs font-mono text-slate-200 tabular-nums">{g.homeScore}–{g.awayScore}</span>
                                                <span className="text-[11px] font-bold text-slate-400 uppercase">{g.awayTeamId}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TournamentBracketView;
