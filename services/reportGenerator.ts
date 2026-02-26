
import React from 'react';
import { Team, Player, Transaction, PlayoffSeries, Game } from '../types';
import { TEAM_DATA } from '../data/teamData';
import { calculatePlayerOvr } from '../utils/constants';
import { Trophy, Crown, Medal, Star, Activity } from 'lucide-react';

// --- Types ---
export interface SeasonReport {
    confRank: number;
    leagueRank: number;
    totalGames: number;
    winPct: number;
    winPctStr: string;
    mvp: Player | null;
    seasonTrades: Transaction[];
    teamStats: any;
    leagueRanks: Record<string, { value: number, rank: number }>;
    ownerMood: { title: string, msg: string, color: string, borderColor: string, bg: string };
    ownerName: string;
}

export interface PlayoffReport {
    status: {
        title: string;
        desc: string;
        color: string;
        bg: string;
        border: string;
        icon: React.ReactNode;
    };
    totalWins: number;
    totalLosses: number;
    winPctStr: string;
    teamStats: any;
    mvp: Player | null;
    seriesLogs: {
        series: PlayoffSeries;
        opponent?: Team;
        roundName: string;
        games: Game[];
        result: string;
        score: string;
    }[];
    ownerName: string;
}

// --- Season Report Generator ---
export const generateSeasonReport = (team: Team, allTeams: Team[], transactions: Transaction[]): SeasonReport => {
    // 1. Ranks
    const confTeams = allTeams.filter(t => t.conference === team.conference).sort((a, b) => b.wins - a.wins);
    const confRank = confTeams.findIndex(t => t.id === team.id) + 1;
    const leagueRank = [...allTeams].sort((a, b) => b.wins - a.wins).findIndex(t => t.id === team.id) + 1;
    
    const totalGames = team.wins + team.losses || 82;
    const winPct = team.wins / totalGames;
    const winPctStr = winPct.toFixed(3).replace(/^0/, ''); 

    // 2. Team MVP
    const sortedByPts = [...team.roster].sort((a, b) => {
        const pA = a.stats.g > 0 ? a.stats.pts / a.stats.g : 0;
        const pB = b.stats.g > 0 ? b.stats.pts / b.stats.g : 0;
        return pB - pA;
    });
    const mvp = sortedByPts[0] || null;

    // 3. Trades
    const seasonTrades = transactions
        .filter(t => t && t.teamId === team.id && t.type === 'Trade')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // 4. League Stats Aggregation
    const getTeamAggregates = (t: Team) => {
        const g = t.wins + t.losses || 1;
        const totals = t.roster.reduce((acc, p) => ({
            pts: acc.pts + p.stats.pts,
            reb: acc.reb + p.stats.reb,
            ast: acc.ast + p.stats.ast,
            stl: acc.stl + p.stats.stl,
            blk: acc.blk + p.stats.blk,
            tov: acc.tov + p.stats.tov,
            fgm: acc.fgm + p.stats.fgm,
            fga: acc.fga + p.stats.fga,
            p3m: acc.p3m + p.stats.p3m,
            p3a: acc.p3a + p.stats.p3a,
            ftm: acc.ftm + p.stats.ftm,
            fta: acc.fta + p.stats.fta,
        }), { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0 });

        const tsa = totals.fga + 0.44 * totals.fta;
        
        return {
            id: t.id,
            pts: totals.pts / g,
            reb: totals.reb / g,
            ast: totals.ast / g,
            stl: totals.stl / g,
            blk: totals.blk / g,
            tov: totals.tov / g,
            fgPct: totals.fga > 0 ? totals.fgm / totals.fga : 0,
            p3Pct: totals.p3a > 0 ? totals.p3m / totals.p3a : 0,
            ftPct: totals.fta > 0 ? totals.ftm / totals.fta : 0,
            tsPct: tsa > 0 ? totals.pts / (2 * tsa) : 0,
        };
    };

    const allTeamStats = allTeams.map(getTeamAggregates);
    const myTeamStats = allTeamStats.find(s => s.id === team.id)!;

    const getLeagueRank = (key: keyof typeof myTeamStats, asc: boolean = false) => {
        const sorted = [...allTeamStats].sort((a, b) => {
            const valA = a[key] as number;
            const valB = b[key] as number;
            return asc ? valA - valB : valB - valA;
        });
        return sorted.findIndex(s => s.id === team.id) + 1;
    };

    const leagueRanks = {
        pts: { value: myTeamStats.pts, rank: getLeagueRank('pts') },
        reb: { value: myTeamStats.reb, rank: getLeagueRank('reb') },
        ast: { value: myTeamStats.ast, rank: getLeagueRank('ast') },
        stl: { value: myTeamStats.stl, rank: getLeagueRank('stl') },
        blk: { value: myTeamStats.blk, rank: getLeagueRank('blk') },
        tov: { value: myTeamStats.tov, rank: getLeagueRank('tov', true) },
        fgPct: { value: myTeamStats.fgPct, rank: getLeagueRank('fgPct') },
        p3Pct: { value: myTeamStats.p3Pct, rank: getLeagueRank('p3Pct') },
        ftPct: { value: myTeamStats.ftPct, rank: getLeagueRank('ftPct') },
        tsPct: { value: myTeamStats.tsPct, rank: getLeagueRank('tsPct') },
    };

    // 5. Owner Mood
    let ownerMood;
    if (winPct >= 0.65) {
        ownerMood = { 
            title: "압도적인 성과", 
            msg: "환상적입니다! 리그 최고의 팀을 만들었군요. 팬들과 보드진 모두 당신을 찬양하고 있습니다. 내년에도 이 기세를 이어가야 합니다.", 
            color: "text-amber-400", borderColor: "border-amber-500/50", bg: "bg-amber-500/5"
        };
    } else if (winPct >= 0.5) {
        ownerMood = { 
            title: "준수한 시즌", 
            msg: "플레이오프 경쟁력을 입증했습니다. 하지만 진정한 컨텐더가 되기 위해선 한 단계 더 도약해야 합니다. 오프시즌 보강에 힘써주세요.", 
            color: "text-blue-400", borderColor: "border-blue-500/50", bg: "bg-blue-500/5"
        };
    } else if (winPct >= 0.35) {
        ownerMood = { 
            title: "실망스러운 결과", 
            msg: "솔직히 말해 기대 이하입니다. 리빌딩 과정이라 믿고 싶지만, 팬들의 인내심이 바닥나고 있습니다. 변화가 필요합니다.", 
            color: "text-orange-400", borderColor: "border-orange-500/50", bg: "bg-orange-500/5"
        };
    } else {
        ownerMood = { 
            title: "최악의 시즌", 
            msg: "이런 성적을 위해 당신을 고용한 게 아닙니다. 당장 획기적인 변화가 없다면, 내년엔 이 자리에 없을 겁니다. 각오하십시오.", 
            color: "text-red-500", borderColor: "border-red-500/50", bg: "bg-red-500/5"
        };
    }

    return {
        confRank,
        leagueRank,
        totalGames,
        winPct,
        winPctStr,
        mvp,
        seasonTrades,
        teamStats: myTeamStats,
        leagueRanks,
        ownerMood,
        ownerName: TEAM_DATA[team.id]?.owner || "The Ownership Group"
    };
};

// --- Playoff Report Generator ---
export const generatePlayoffReport = (team: Team, allTeams: Team[], playoffSeries: PlayoffSeries[], schedule: Game[]): PlayoffReport => {
    // 1. Analyze Status
    const mySeries = playoffSeries
          .filter(s => s.higherSeedId === team.id || s.lowerSeedId === team.id)
          .sort((a, b) => b.round - a.round);

    const lastSeries = mySeries.length > 0 ? mySeries[0] : null;
    
    let status = {
        title: "Playoff Qualification",
        desc: "팀이 플레이오프에 진출했습니다.",
        color: "text-blue-400",
        bg: "bg-gradient-to-r from-blue-900/40 to-slate-900",
        border: "border-blue-500/30",
        icon: React.createElement(Trophy, { size: 32, className: "text-blue-400" })
    };

    if (lastSeries) {
        const isWinner = lastSeries.winnerId === team.id;
        const isFinished = lastSeries.finished;
        
        if (lastSeries.round === 4) { // BPL Finals
            if (isWinner && isFinished) {
                status = {
                    title: "BPL CHAMPIONS", 
                    desc: "세계 최고의 자리에 올랐습니다! 역사에 남을 우승입니다.", 
                    color: "text-yellow-400", 
                    bg: "bg-gradient-to-r from-yellow-900/40 to-slate-900",
                    border: "border-yellow-500/50",
                    icon: React.createElement(Crown, { size: 40, className: "text-yellow-400 fill-yellow-400 animate-pulse" })
                };
            } else if (isFinished) {
                status = { 
                    title: "BPL Finalist", 
                    desc: "아쉬운 준우승이지만, 위대한 여정이었습니다.", 
                    color: "text-slate-200", 
                    bg: "bg-gradient-to-r from-slate-800 to-slate-900",
                    border: "border-slate-400/50",
                    icon: React.createElement(Medal, { size: 40, className: "text-slate-300" })
                };
            }
        } else if (lastSeries.round === 3) { // Conf Finals
            if (!isWinner && isFinished) {
                status = { 
                    title: "Conference Finalist", 
                    desc: "컨퍼런스 결승 진출. 우승 문턱에서 멈췄습니다.", 
                    color: "text-indigo-400", 
                    bg: "bg-gradient-to-r from-indigo-900/40 to-slate-900",
                    border: "border-indigo-500/30",
                    icon: React.createElement(Trophy, { size: 40, className: "text-indigo-400" })
                };
            }
        } else if (lastSeries.round === 2) { // Semis
            if (!isWinner && isFinished) {
                status = { 
                    title: "Semi-Finalist", 
                    desc: "컨퍼런스 4강 진출. 다음 시즌이 기대됩니다.", 
                    color: "text-emerald-400", 
                    bg: "bg-gradient-to-r from-emerald-900/40 to-slate-900",
                    border: "border-emerald-500/30",
                    icon: React.createElement(Star, { size: 40, className: "text-emerald-400" })
                };
            }
        } else if (lastSeries.round === 1) { // Round 1
            if (!isWinner && isFinished) {
                status = { 
                    title: "Playoff Participant", 
                    desc: "플레이오프 1라운드 진출. 소중한 경험을 쌓았습니다.", 
                    color: "text-slate-400", 
                    bg: "bg-gradient-to-r from-slate-900 to-slate-950",
                    border: "border-slate-600/30",
                    icon: React.createElement(Activity, { size: 40, className: "text-slate-400" })
                };
            }
        }
    }

    // 2. Playoff Stats
    let totalGames = 0;
    const totals = team.roster.reduce((acc, p) => {
        const s = p.playoffStats || { g: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fga: 0, fgm: 0, fta: 0, ftm: 0, p3a: 0, p3m: 0 };
        if (s.g > totalGames) totalGames = s.g; 
        return {
            pts: acc.pts + s.pts,
            reb: acc.reb + s.reb,
            ast: acc.ast + s.ast,
            stl: acc.stl + s.stl,
            blk: acc.blk + s.blk,
            tov: acc.tov + s.tov,
            fgm: acc.fgm + s.fgm,
            fga: acc.fga + s.fga,
            p3m: acc.p3m + s.p3m,
            p3a: acc.p3a + s.p3a,
            ftm: acc.ftm + s.ftm,
            fta: acc.fta + s.fta,
        };
    }, { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0 });

    if (totalGames === 0) totalGames = 1;
    const tsa = totals.fga + 0.44 * totals.fta;
    
    const teamStats = {
        pts: totals.pts / totalGames,
        reb: totals.reb / totalGames,
        ast: totals.ast / totalGames,
        stl: totals.stl / totalGames,
        blk: totals.blk / totalGames,
        tov: totals.tov / totalGames,
        fgPct: totals.fga > 0 ? totals.fgm / totals.fga : 0,
        p3Pct: totals.p3a > 0 ? totals.p3m / totals.p3a : 0,
        ftPct: totals.fta > 0 ? totals.ftm / totals.fta : 0,
        tsPct: tsa > 0 ? totals.pts / (2 * tsa) : 0,
        games: totalGames
    };

    // 3. Playoff MVP
    const sortedByPlayoffPts = [...team.roster].sort((a, b) => {
        const sA = a.playoffStats || { g: 0, pts: 0 };
        const sB = b.playoffStats || { g: 0, pts: 0 };
        const pA = sA.g > 0 ? sA.pts / sA.g : 0;
        const pB = sB.g > 0 ? sB.pts / sB.g : 0;
        return pB - pA;
    });
    const mvp = sortedByPlayoffPts[0];

    // 4. Record
    let wins = 0;
    let losses = 0;
    mySeries.forEach(s => {
        if (s.higherSeedId === team.id) { wins += s.higherSeedWins; losses += s.lowerSeedWins; } 
        else { wins += s.lowerSeedWins; losses += s.higherSeedWins; }
    });
    const winPct = (wins + losses) > 0 ? wins / (wins + losses) : 0;
    const winPctStr = winPct.toFixed(3).replace(/^0/, '');

    // 5. Series Logs
    const seriesLogs = [...mySeries].sort((a, b) => a.round - b.round).map(s => {
        const opponentId = s.higherSeedId === team.id ? s.lowerSeedId : s.higherSeedId;
        const opponent = allTeams.find(t => t.id === opponentId);
        const roundName = s.round === 0 ? "Play-In" : s.round === 4 ? "BPL Finals" : s.round === 3 ? "Conf. Finals" : s.round === 2 ? "Semis" : "Round 1";
        
        const games = schedule
            .filter(g => g.seriesId === s.id && g.played)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const result = s.finished ? (s.winnerId === team.id ? "WON" : "LOST") : "IN PROGRESS";
        
        const score = s.higherSeedId === team.id 
            ? `${s.higherSeedWins}-${s.lowerSeedWins}`
            : `${s.lowerSeedWins}-${s.higherSeedWins}`;

        return { series: s, opponent, roundName, games, result, score };
    });

    return {
        status,
        totalWins: wins,
        totalLosses: losses,
        winPctStr,
        teamStats,
        mvp,
        seriesLogs,
        ownerName: TEAM_DATA[team.id]?.owner || "The Ownership Group"
    };
};
