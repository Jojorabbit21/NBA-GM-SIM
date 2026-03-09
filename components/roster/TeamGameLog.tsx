
import React, { useState, useMemo } from 'react';
import { Team, Game } from '../../types';
import { TeamLogo } from '../common/TeamLogo';
import { fetchFullGameResult } from '../../services/queries';
import { Loader2 } from 'lucide-react';

interface TeamGameLogProps {
    team: Team;
    schedule: Game[];
    allTeams: Team[];
    onViewGameResult: (result: any) => void;
    userId?: string;
}

export const TeamGameLog: React.FC<TeamGameLogProps> = ({ team, schedule, allTeams, onViewGameResult, userId }) => {
    const [fetchingGameId, setFetchingGameId] = useState<string | null>(null);

    // Filter played games for this team, sorted by date descending
    const teamGames = useMemo(() => {
        return schedule
            .filter(g => g.played && (g.homeTeamId === team.id || g.awayTeamId === team.id))
            .sort((a, b) => b.date.localeCompare(a.date));
    }, [schedule, team.id]);

    // Compute team season stats
    const seasonStats = useMemo(() => {
        const gamesPlayed = teamGames.length;
        if (gamesPlayed === 0) return null;

        // PPG / PA from game scores
        let totalPts = 0, totalPa = 0;
        teamGames.forEach(g => {
            const isHome = g.homeTeamId === team.id;
            totalPts += isHome ? (g.homeScore ?? 0) : (g.awayScore ?? 0);
            totalPa += isHome ? (g.awayScore ?? 0) : (g.homeScore ?? 0);
        });

        // Aggregate from player.stats
        let reb = 0, ast = 0, stl = 0, blk = 0, tov = 0;
        let fgm = 0, fga = 0, p3m = 0, p3a = 0, ftm = 0, fta = 0;
        team.roster.forEach(p => {
            const s = p.stats;
            reb += s.reb; ast += s.ast; stl += s.stl; blk += s.blk; tov += s.tov;
            fgm += s.fgm; fga += s.fga; p3m += s.p3m; p3a += s.p3a; ftm += s.ftm; fta += s.fta;
        });

        return {
            g: gamesPlayed,
            ppg: (totalPts / gamesPlayed).toFixed(1),
            papg: (totalPa / gamesPlayed).toFixed(1),
            rpg: (reb / gamesPlayed).toFixed(1),
            apg: (ast / gamesPlayed).toFixed(1),
            spg: (stl / gamesPlayed).toFixed(1),
            bpg: (blk / gamesPlayed).toFixed(1),
            topg: (tov / gamesPlayed).toFixed(1),
            fgPct: fga > 0 ? ((fgm / fga) * 100).toFixed(1) : '0.0',
            threePct: p3a > 0 ? ((p3m / p3a) * 100).toFixed(1) : '0.0',
            ftPct: fta > 0 ? ((ftm / fta) * 100).toFixed(1) : '0.0',
        };
    }, [teamGames, team.roster]);

    const handleGameClick = async (gameId: string) => {
        if (fetchingGameId || !userId) return;
        setFetchingGameId(gameId);
        try {
            const raw = await fetchFullGameResult(gameId, userId);
            if (!raw) return;
            const homeTeam = allTeams.find(t => t.id === raw.home_team_id);
            const awayTeam = allTeams.find(t => t.id === raw.away_team_id);
            if (!homeTeam || !awayTeam) return;
            onViewGameResult({
                home: homeTeam, away: awayTeam,
                homeScore: raw.home_score, awayScore: raw.away_score,
                homeBox: raw.box_score?.home || [], awayBox: raw.box_score?.away || [],
                homeTactics: raw.tactics?.home, awayTactics: raw.tactics?.away,
                pbpLogs: raw.pbp_logs || [], pbpShotEvents: raw.shot_events || [],
                rotationData: raw.rotation_data,
                otherGames: [], date: raw.date, recap: []
            });
        } finally {
            setFetchingGameId(null);
        }
    };

    const statItems = seasonStats ? [
        { label: 'W-L', value: `${team.wins}-${team.losses}` },
        { label: 'PPG', value: seasonStats.ppg },
        { label: 'OPP', value: seasonStats.papg },
        { label: 'RPG', value: seasonStats.rpg },
        { label: 'APG', value: seasonStats.apg },
        { label: 'SPG', value: seasonStats.spg },
        { label: 'BPG', value: seasonStats.bpg },
        { label: 'TOPG', value: seasonStats.topg },
        { label: 'FG%', value: seasonStats.fgPct + '%' },
        { label: '3P%', value: seasonStats.threePct + '%' },
        { label: 'FT%', value: seasonStats.ftPct + '%' },
    ] : [];

    if (teamGames.length === 0) {
        return (
            <div className="h-full flex items-center justify-center">
                <span className="text-slate-500 font-bold uppercase tracking-widest text-sm">경기 기록이 없습니다.</span>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Season Stats Summary */}
            <div className="flex-shrink-0 px-6 py-4 border-b border-slate-800">
                <div className="flex items-center gap-3 mb-3">
                    <TeamLogo teamId={team.id} size="md" />
                    <div>
                        <span className="text-sm font-black text-white uppercase oswald tracking-wide">{team.city} {team.name}</span>
                        <span className="text-xs text-slate-500 font-bold ml-3">{team.wins}-{team.losses}</span>
                    </div>
                </div>
                <div className="grid grid-cols-11 gap-1">
                    {statItems.map(s => (
                        <div key={s.label} className="bg-slate-900 rounded-xl px-2 py-2 text-center border border-slate-800/50">
                            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">{s.label}</div>
                            <div className="text-sm font-black text-white oswald tabular-nums">{s.value}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Game Log Table */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                <table className="w-full">
                    <thead className="bg-slate-950 sticky top-0 z-10">
                        <tr className="h-9 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            <th className="px-4 text-left w-28">Date</th>
                            <th className="px-4 text-left">Opponent</th>
                            <th className="px-3 text-center w-14">H/A</th>
                            <th className="px-3 text-center w-16">Result</th>
                            <th className="px-4 text-center w-28">Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        {teamGames.map(g => {
                            const isHome = g.homeTeamId === team.id;
                            const oppId = isHome ? g.awayTeamId : g.homeTeamId;
                            const oppTeam = allTeams.find(t => t.id === oppId);
                            const myScore = isHome ? g.homeScore! : g.awayScore!;
                            const oppScore = isHome ? g.awayScore! : g.homeScore!;
                            const isWin = myScore > oppScore;
                            const isFetching = fetchingGameId === g.id;

                            return (
                                <tr
                                    key={g.id}
                                    onClick={() => handleGameClick(g.id)}
                                    className="h-10 border-b border-slate-800/30 hover:bg-slate-800/50 cursor-pointer transition-colors group"
                                >
                                    <td className="px-4 text-xs font-medium text-slate-400 tabular-nums">
                                        {g.date.slice(5).replace('-', '/')}
                                    </td>
                                    <td className="px-4">
                                        <div className="flex items-center gap-2.5">
                                            <TeamLogo teamId={oppId} size="sm" />
                                            <span className="text-xs font-semibold text-slate-300 uppercase truncate group-hover:text-white transition-colors">
                                                {oppTeam?.name || oppId}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-3 text-center">
                                        <span className={`text-[10px] font-black uppercase ${isHome ? 'text-indigo-400' : 'text-slate-500'}`}>
                                            {isHome ? 'HOME' : 'AWAY'}
                                        </span>
                                    </td>
                                    <td className="px-3 text-center">
                                        <span className={`text-xs font-black ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {isWin ? 'W' : 'L'}
                                        </span>
                                    </td>
                                    <td className="px-4 text-center">
                                        {isFetching ? (
                                            <Loader2 size={14} className="animate-spin text-indigo-400 mx-auto" />
                                        ) : (
                                            <span className={`text-sm font-black oswald tabular-nums ${isWin ? 'text-emerald-300' : 'text-red-300'}`}>
                                                {myScore} - {oppScore}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
