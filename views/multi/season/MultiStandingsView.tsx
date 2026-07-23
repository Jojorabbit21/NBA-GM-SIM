
import React, { useState, useMemo } from 'react';
import { Loader2, Network } from 'lucide-react';
import { useLeagueContext } from '../league/LeagueLayout';
import { useMultiGameData } from '../../../hooks/useMultiGameData';
import { useGame } from '../../../hooks/useGameContext';
import { computeMultiStandingsStats } from './multiSeasonUtils';
import type { MultiStandingsRecord } from './multiSeasonUtils';
import { isFinal, resolveRealAt } from './multiGameReveal';
import { useServerClock } from '../../../utils/serverClock';
import TournamentBracketView from './TournamentBracketView';
import {
    Table, TableHead, TableBody, TableRow,
    TableHeaderCell, TableCell,
} from '../../../components/common/Table';
import { TeamLogo } from '../../../components/common/TeamLogo';

// ── 스탠딩 테이블 (main_league 전용) ─────────────────────────────────────────

const COLS = [
    { key: 'rank',   label: '#',    width: 44,  align: 'center' as const, sortable: false },
    { key: 'team',   label: 'TEAM', width: 200, align: 'left'   as const, sortable: false },
    { key: 'wins',   label: 'W',    width: 48,  align: 'center' as const, sortable: true  },
    { key: 'losses', label: 'L',    width: 48,  align: 'center' as const, sortable: true  },
    { key: 'pct',    label: 'PCT',  width: 60,  align: 'center' as const, sortable: true  },
    { key: 'gb',     label: 'GB',   width: 52,  align: 'center' as const, sortable: false },
    { key: 'home',   label: 'HOME', width: 64,  align: 'center' as const, sortable: true  },
    { key: 'away',   label: 'AWAY', width: 64,  align: 'center' as const, sortable: true  },
    { key: 'ppg',    label: 'PPG',  width: 58,  align: 'center' as const, sortable: true  },
    { key: 'oppg',   label: 'OPPG', width: 58,  align: 'center' as const, sortable: true  },
    { key: 'diff',   label: 'DIFF', width: 58,  align: 'center' as const, sortable: true  },
    { key: 'streak', label: 'STRK', width: 56,  align: 'center' as const, sortable: true  },
    { key: 'l10',    label: 'L10',  width: 56,  align: 'center' as const, sortable: true  },
];

const fmtRecord = (r: { w: number; l: number }) => `${r.w}-${r.l}`;
const fmtPct    = (v: number) => v.toFixed(3).replace(/^0/, '');
const fmtPpg    = (v: number) => v > 0 ? v.toFixed(1) : '-';
const fmtDiff   = (v: number) => v === 0 ? '0.0' : (v > 0 ? '+' : '') + v.toFixed(1);

function getSortValue(rec: MultiStandingsRecord, key: string): number {
    switch (key) {
        case 'wins':   return rec.wins;
        case 'losses': return rec.losses;
        case 'pct':    return rec.pct;
        case 'home':   return rec.home.w / Math.max(1, rec.home.w + rec.home.l);
        case 'away':   return rec.away.w / Math.max(1, rec.away.w + rec.away.l);
        case 'ppg':    return rec.ppg;
        case 'oppg':   return rec.oppg;
        case 'diff':   return rec.diff;
        case 'streak': {
            const n = parseInt(rec.streak.slice(1)) || 0;
            return rec.streak.startsWith('W') ? n : -n;
        }
        case 'l10':    return rec.l10.w;
        default:       return 0;
    }
}

function getCellValue(rec: MultiStandingsRecord, key: string, gb: string): string {
    switch (key) {
        case 'wins':   return String(rec.wins);
        case 'losses': return String(rec.losses);
        case 'pct':    return fmtPct(rec.pct);
        case 'gb':     return gb;
        case 'home':   return fmtRecord(rec.home);
        case 'away':   return fmtRecord(rec.away);
        case 'ppg':    return fmtPpg(rec.ppg);
        case 'oppg':   return fmtPpg(rec.oppg);
        case 'diff':   return fmtDiff(rec.diff);
        case 'streak': return rec.streak;
        case 'l10':    return fmtRecord(rec.l10);
        default:       return '';
    }
}

const LeagueStandingsTable: React.FC<{
    leagueTeams: ReturnType<typeof useLeagueContext>['leagueTeams'];
    schedule: ReturnType<typeof useMultiGameData>['schedule'];
    myTeamId: string | null;
    leagueName?: string;
    seasonNumber?: number;
    serverNowMs: number;
}> = ({ leagueTeams, schedule, myTeamId, leagueName, seasonNumber, serverNowMs }) => {
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
        key: 'pct', direction: 'desc',
    });

    const slugs   = useMemo(() => leagueTeams.map(t => t.team_slug), [leagueTeams]);
    const statsMap = useMemo(
        () => computeMultiStandingsStats(slugs, schedule, serverNowMs),
        [slugs, schedule, serverNowMs],
    );

    const sorted = useMemo(() => {
        return [...leagueTeams].sort((a, b) => {
            const ra = statsMap[a.team_slug];
            const rb = statsMap[b.team_slug];
            if (!ra || !rb) return 0;
            const va = getSortValue(ra, sortConfig.key);
            const vb = getSortValue(rb, sortConfig.key);
            const diff = sortConfig.direction === 'desc' ? vb - va : va - vb;
            if (diff !== 0) return diff;
            // secondary: pct desc, then wins desc
            const pctDiff = rb.pct - ra.pct;
            if (pctDiff !== 0) return pctDiff;
            return rb.wins - ra.wins;
        });
    }, [leagueTeams, statsMap, sortConfig]);

    const handleSort = (key: string) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
        }));
    };

    const leaderRec = statsMap[sorted[0]?.team_slug];

    const gamesPlayed = schedule.filter(g => g.played && isFinal(g, serverNowMs)).length;
    const totalGames  = schedule.length;

    return (
        <div className="flex flex-col h-full">
            <div className="px-4 py-3 shrink-0">
                <h1 className="text-lg font-black text-white ko-tight">리그 순위</h1>
                <p className="text-xs text-slate-500 ko-normal mt-0.5">
                    {leagueName ?? ''} &nbsp;·&nbsp; {seasonNumber}시즌 &nbsp;·&nbsp; 진행 {gamesPlayed}/{totalGames}경기
                </p>
            </div>

            <div className="flex-1 min-h-0">
                <Table
                    style={{ tableLayout: 'fixed', minWidth: '100%' }}
                    fullHeight={true}
                    className="!rounded-none !border-x-0 !border-t-0"
                >
                    <colgroup>
                        {COLS.map(c => <col key={c.key} style={{ width: c.width }} />)}
                    </colgroup>
                    <TableHead noRow>
                        <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest h-10">
                            {COLS.map(c => (
                                <TableHeaderCell
                                    key={c.key}
                                    align={c.align}
                                    width={c.width}
                                    className={`border-r border-slate-800 bg-slate-950 ${c.key === 'team' ? 'pl-4' : ''}`}
                                    sortable={c.sortable}
                                    onSort={c.sortable ? () => handleSort(c.key) : undefined}
                                    sortDirection={sortConfig.key === c.key ? sortConfig.direction : null}
                                >
                                    {c.label}
                                </TableHeaderCell>
                            ))}
                        </tr>
                    </TableHead>
                    <TableBody>
                        {sorted.map((t, i) => {
                            const rec = statsMap[t.team_slug];
                            const isMe = t.team_slug === myTeamId;
                            const gb = i === 0 || !leaderRec
                                ? '-'
                                : (((leaderRec.wins - leaderRec.losses) - (rec.wins - rec.losses)) / 2).toFixed(1);

                            return (
                                <TableRow key={t.id} className={isMe ? 'bg-indigo-900/20' : ''}>
                                    {/* Rank */}
                                    <TableCell
                                        align="center"
                                        className={`font-mono text-xs tabular-nums border-r border-slate-800/30 ${isMe ? 'text-indigo-400 font-bold' : 'text-white'}`}
                                    >
                                        {i + 1}
                                    </TableCell>

                                    {/* Team */}
                                    <TableCell className="pl-4 border-r border-slate-800/30">
                                        <div className="flex items-center gap-2.5">
                                            <TeamLogo teamId={t.team_slug} size="sm" />
                                            <span className={`text-xs truncate ${isMe ? 'text-white font-bold' : 'text-slate-200'}`}>
                                                {t.team_name}
                                            </span>
                                            {t.is_ai && (
                                                <span className="text-[10px] text-slate-600 font-normal">AI</span>
                                            )}
                                            {isMe && (
                                                <span className="text-[10px] text-indigo-400 font-bold ko-normal">내 팀</span>
                                            )}
                                        </div>
                                    </TableCell>

                                    {/* Data columns */}
                                    {COLS.slice(2).map(c => {
                                        const val = getCellValue(rec, c.key, gb);
                                        let colorClass = 'text-white';
                                        if (c.key === 'diff') {
                                            colorClass = rec.diff > 0 ? 'text-emerald-400' : rec.diff < 0 ? 'text-red-400' : 'text-slate-500';
                                        } else if (c.key === 'streak') {
                                            colorClass = rec.streak.startsWith('W') ? 'text-emerald-400' : rec.streak.startsWith('L') ? 'text-red-400' : 'text-slate-500';
                                        } else if (c.key === 'l10') {
                                            colorClass = rec.l10.w > rec.l10.l ? 'text-emerald-400' : rec.l10.l > rec.l10.w ? 'text-red-400' : 'text-white';
                                        }
                                        return (
                                            <TableCell
                                                key={c.key}
                                                align="center"
                                                className={`font-mono text-xs tabular-nums ${colorClass} border-r border-slate-800/30`}
                                            >
                                                {val}
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
};

// ── 토너먼트 브라켓 ───────────────────────────────────────────────────────────

const TournamentBracket: React.FC<{
    bracketData: unknown | null;
    schedule: ReturnType<typeof useMultiGameData>['schedule'];
    myTeamId: string | null;
}> = ({ bracketData, schedule, myTeamId }) => {
    const { leagueTeams } = useLeagueContext();
    const bracket = bracketData as { series: ReturnType<typeof useMultiGameData>['playoffSeries'] } | null;
    const series = bracket?.series ?? [];

    if (!series.length) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-slate-200 pretendard">
                <Network size={40} className="text-slate-600" />
                <div className="text-center">
                    <h2 className="text-lg font-black text-slate-300 ko-tight">토너먼트 브라켓</h2>
                    <p className="text-sm text-slate-500 ko-normal mt-1">브라켓 데이터가 아직 없습니다.</p>
                </div>
            </div>
        );
    }

    return (
        <TournamentBracketView
            series={series}
            schedule={schedule}
            leagueTeams={leagueTeams}
            myTeamId={myTeamId}
        />
    );
};

// ── 메인 뷰 ──────────────────────────────────────────────────────────────────

const MultiStandingsView: React.FC = () => {
    const { league, room, leagueTeams, isLoading: leagueLoading } = useLeagueContext();
    const { session } = useGame();
    const {
        isLoading: gameLoading, schedule, myTeamId,
    } = useMultiGameData(session, room?.id ?? null);
    const serverNow = useServerClock();

    const isLoading = leagueLoading || gameLoading;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={28} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    const isTournament = league?.type === 'tournament';

    if (isTournament) {
        // schedule은 서버가 game_seq(압축 인덱스)로만 채워 저장 — scheduledAt이 없으면
        // multiGameReveal의 isStarted/isFinal이 played 값에만 의존해 경기가 항상
        // 'scheduled'로 묶여버린다. MultiScheduleView와 동일하게 여기서도 정규화한다.
        const simStart = league?.sim_real_start_at ?? null;
        const gprd     = league?.games_per_real_day ?? 5;
        const normalizedSchedule = schedule.map(g => ({
            ...g,
            scheduledAt: resolveRealAt(g, simStart, gprd) ?? g.scheduledAt,
        }));

        return (
            <TournamentBracket
                bracketData={league?.bracket_data ?? null}
                schedule={normalizedSchedule}
                myTeamId={myTeamId}
            />
        );
    }

    return (
        <LeagueStandingsTable
            leagueTeams={leagueTeams}
            schedule={schedule}
            myTeamId={myTeamId}
            leagueName={league?.name}
            seasonNumber={league?.season_number}
            serverNowMs={serverNow}
        />
    );
};

export default MultiStandingsView;
