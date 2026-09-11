
import React, { useEffect, useState } from 'react';
import { ChevronDown, Loader2, Trophy } from 'lucide-react';
import { supabase } from '../../services/supabaseClient';

interface MultiplayerHistoryProps {
    userId: string;
}

interface LeagueRow {
    league_id: string | null;
    league_name: string;
    season_number: number | null;
    tier: string | null;
    wins: number | null;
    losses: number | null;
    playoff_wins: number | null;
    playoff_losses: number | null;
    final_rank: number | null;
    team_count: number | null;
    playoff_result: string | null;
    completed_at: string | null;
}

interface TournamentRow {
    placement: number | null;
    game_wins: number | null;
    game_losses: number | null;
    tournament_archives: {
        name: string;
        team_count: number | null;
        completed_at: string | null;
    } | null;
}

/** 리그/토너먼트 통산 이력을 한 줄씩 합친 표시용 항목 — completed_at 기준 최신순으로 정렬해 보여준다. */
interface HistoryEntry {
    key: string;
    kind: 'league' | 'tournament';
    name: string;
    completedAt: string | null;
    finalRank: number | null;
    teamCount: number | null;
    isChampion: boolean;
    wins: number;
    losses: number;
}

const winPct = (wins: number, losses: number) => {
    const total = wins + losses;
    return total === 0 ? '0.00' : ((wins / total) * 100).toFixed(2);
};

const StatRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="flex items-center justify-between gap-2 py-1.5">
        <span className="text-xs text-slate-400 ko-normal">{label}</span>
        <span className="text-sm font-bold text-white tabular-nums">{value}</span>
    </div>
);

const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// 유저의 멀티플레이 통산 전적 — 프로필 모듈 하단에 표시.
// [2026-09-10] archiveLeagueSeason()(server/src/shared/leagueSeasonArchiver.ts) 신설로
// league_user_history가 main_league 시즌 종료 시 실제로 채워지게 됨 — 이전엔 아카이버가
// 없어 리그 쪽 수치가 항상 0이었음. tournament_archives.league_type으로 main_league
// 플레이오프 브라켓(archiveTournament 공용 경로)을 "토너먼트" 집계에서 제외한다.
export const MultiplayerHistory: React.FC<MultiplayerHistoryProps> = ({ userId }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [collapsed, setCollapsed] = useState(false);
    const [league, setLeague] = useState({
        regularSeasonTitles: 0, playoffTitles: 0,
        regularSeasonWins: 0, regularSeasonLosses: 0,
        playoffWins: 0, playoffLosses: 0,
        bestWins: 0, bestLosses: 0, hasBest: false,
    });
    const [tournament, setTournament] = useState({ titles: 0, finalsAppearances: 0, wins: 0, losses: 0 });
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [showAllHistory, setShowAllHistory] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);

        Promise.all([
            supabase.from('league_user_history')
                .select('league_id, league_name, season_number, tier, wins, losses, playoff_wins, playoff_losses, final_rank, team_count, playoff_result, completed_at')
                .eq('user_id', userId),
            // league_type='tournament'만 — main_league 플레이오프 브라켓은 archiveTournament를
            // 공유 경로로 쓰지만 "리그" 섹션에서 이미 집계되므로 여기서 중복 집계되지 않게 제외.
            supabase.from('tournament_team_records')
                .select('placement, game_wins, game_losses, tournament_archives!inner(name, team_count, completed_at, league_type)')
                .eq('user_id', userId)
                .eq('tournament_archives.league_type', 'tournament'),
        ]).then(([leagueRes, tourRes]) => {
            if (cancelled) return;

            const leagueRows = (leagueRes.data ?? []) as LeagueRow[];
            let regularSeasonWins = 0, regularSeasonLosses = 0;
            let playoffWins = 0, playoffLosses = 0;
            let regularSeasonTitles = 0, playoffTitles = 0;
            let bestWins = 0, bestLosses = 0, hasBest = false;
            const leagueEntries: HistoryEntry[] = [];
            leagueRows.forEach((row, i) => {
                const w = row.wins ?? 0, l = row.losses ?? 0;
                const pw = row.playoff_wins ?? 0, pl = row.playoff_losses ?? 0;
                regularSeasonWins += w;
                regularSeasonLosses += l;
                playoffWins += pw;
                playoffLosses += pl;
                if (row.final_rank === 1) regularSeasonTitles += 1;
                if (row.playoff_result === 'champion') playoffTitles += 1;
                if (!hasBest || w > bestWins) { bestWins = w; bestLosses = l; hasBest = true; }

                leagueEntries.push({
                    key: `league-${row.league_id ?? i}`,
                    kind: 'league',
                    name: row.league_name || '리그',
                    completedAt: row.completed_at,
                    finalRank: row.final_rank,
                    teamCount: row.team_count,
                    isChampion: row.playoff_result === 'champion',
                    wins: w + pw,
                    losses: l + pl,
                });
            });
            setLeague({
                regularSeasonTitles, playoffTitles,
                regularSeasonWins, regularSeasonLosses,
                playoffWins, playoffLosses,
                bestWins, bestLosses, hasBest,
            });

            const tourRows = (tourRes.data ?? []) as unknown as TournamentRow[];
            let titles = 0, finalsAppearances = 0, wins = 0, losses = 0;
            const tourEntries: HistoryEntry[] = [];
            tourRows.forEach((row, i) => {
                if (row.placement === 1) titles += 1;
                if (row.placement === 1 || row.placement === 2) finalsAppearances += 1;
                const w = row.game_wins ?? 0, l = row.game_losses ?? 0;
                wins += w;
                losses += l;

                tourEntries.push({
                    key: `tournament-${i}`,
                    kind: 'tournament',
                    name: row.tournament_archives?.name ?? '토너먼트',
                    completedAt: row.tournament_archives?.completed_at ?? null,
                    finalRank: row.placement,
                    teamCount: row.tournament_archives?.team_count ?? null,
                    isChampion: row.placement === 1,
                    wins: w,
                    losses: l,
                });
            });
            setTournament({ titles, finalsAppearances, wins, losses });

            const merged = [...leagueEntries, ...tourEntries].sort((a, b) => {
                if (!a.completedAt) return 1;
                if (!b.completedAt) return -1;
                return new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime();
            });
            setHistory(merged);
        }).finally(() => { if (!cancelled) setIsLoading(false); });

        return () => { cancelled = true; };
    }, [userId]);

    if (isLoading) {
        return (
            <div className="flex justify-center py-4">
                <Loader2 size={16} className="animate-spin text-slate-600" />
            </div>
        );
    }

    const visibleHistory = showAllHistory ? history : history.slice(0, 5);

    return (
        <div className="space-y-3 shrink-0">
            <button
                onClick={() => setCollapsed(v => !v)}
                className="w-full flex items-center justify-between text-left"
            >
                <span className="text-base font-bold text-white ko-tight">멀티플레이 전적</span>
                <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
                />
            </button>

            {!collapsed && (
                <>
                    <div className="space-y-1">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">리그</p>
                        <div className="divide-y divide-slate-700/50">
                            <StatRow label="정규시즌 우승" value={`${league.regularSeasonTitles}회`} />
                            <StatRow label="플레이오프 우승" value={`${league.playoffTitles}회`} />
                            <StatRow
                                label="정규시즌 통산"
                                value={`${league.regularSeasonWins}W-${league.regularSeasonLosses}L (${winPct(league.regularSeasonWins, league.regularSeasonLosses)}%)`}
                            />
                            <StatRow
                                label="플레이오프 통산"
                                value={`${league.playoffWins}W-${league.playoffLosses}L (${winPct(league.playoffWins, league.playoffLosses)}%)`}
                            />
                            <StatRow
                                label="최고 기록"
                                value={league.hasBest ? `${league.bestWins}W-${league.bestLosses}L` : '—'}
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">토너먼트</p>
                        <div className="divide-y divide-slate-700/50">
                            <StatRow label="우승" value={`${tournament.titles}회`} />
                            <StatRow label="파이널 진출" value={`${tournament.finalsAppearances}회`} />
                            <StatRow
                                label="통산"
                                value={`${tournament.wins}W-${tournament.losses}L (${winPct(tournament.wins, tournament.losses)}%)`}
                            />
                        </div>
                    </div>

                    {history.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">참가 이력</p>
                            <div className="divide-y divide-slate-700/50">
                                {visibleHistory.map(entry => (
                                    <div key={entry.key} className="flex items-center justify-between gap-2 py-1.5">
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-white truncate flex items-center gap-1">
                                                {entry.isChampion && <Trophy size={11} className="text-amber-400 shrink-0" />}
                                                {entry.name}
                                            </p>
                                            <p className="text-[11px] text-slate-500">{formatDate(entry.completedAt)}</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-xs font-bold text-white tabular-nums">
                                                {entry.teamCount ? `${entry.teamCount}팀 중 ${entry.finalRank}등` : `${entry.finalRank}등`}
                                            </p>
                                            <p className="text-[11px] text-slate-500 tabular-nums">{entry.wins}승 {entry.losses}패</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {history.length > 5 && (
                                <button
                                    onClick={() => setShowAllHistory(v => !v)}
                                    className="text-[11px] text-slate-500 hover:text-white transition-colors pt-1"
                                >
                                    {showAllHistory ? '접기' : `더 보기 (${history.length - 5}개)`}
                                </button>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
