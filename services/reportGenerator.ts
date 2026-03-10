
import React from 'react';
import { Team, Player, Transaction, PlayoffSeries, Game, SeasonReviewContent, PlayoffStageReviewContent, OwnerLetterContent, SeriesPlayerStat } from '../types';
import { TEAM_DATA } from '../data/teamData';
import { calculatePlayerOvr } from '../utils/constants';
import { createTiebreakerComparator } from '../utils/tiebreaker';
import { computeStandingsStats } from '../utils/standingsStats';
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
export const generateSeasonReport = (team: Team, allTeams: Team[], transactions: Transaction[], schedule?: Game[]): SeasonReport => {
    // 1. Ranks (with tiebreakers if schedule available)
    const comparator = schedule
        ? createTiebreakerComparator(allTeams, schedule)
        : (a: Team, b: Team) => b.wins - a.wins;
    const confTeams = allTeams.filter(t => t.conference === team.conference).sort(comparator);
    const confRank = confTeams.findIndex(t => t.id === team.id) + 1;
    const leagueRank = [...allTeams].sort(comparator).findIndex(t => t.id === team.id) + 1;
    
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

// --- Inbox Message Content Builders (JSON-serializable) ---

/** 전 팀 스탯 계산 (useLeaderboardData 팀 모드 로직 추출) */
function computeAllTeamsStats(teams: Team[], schedule: Game[]) {
    const filteredSchedule = schedule.filter(g => g.played && !g.isPlayoff);

    // Pass 1: raw totals
    const allRawTotals = new Map<string, any>();
    const allGameCounts = new Map<string, number>();
    teams.forEach(t => {
        const gp = filteredSchedule.filter(g => g.homeTeamId === t.id || g.awayTeamId === t.id).length || 1;
        allGameCounts.set(t.id, gp);
        const tot = t.roster.reduce((a: any, p) => {
            const s = p.stats;
            a.reb += s.reb; a.offReb += (s.offReb || 0); a.defReb += (s.defReb || 0);
            a.ast += s.ast; a.stl += s.stl; a.blk += s.blk; a.tov += s.tov; a.pf += (s.pf || 0);
            a.fgm += s.fgm; a.fga += s.fga; a.p3m += s.p3m; a.p3a += s.p3a; a.ftm += s.ftm; a.fta += s.fta;
            return a;
        }, { reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0 });
        allRawTotals.set(t.id, tot);
    });

    // Pass 2: per-team stats with opponent approximation
    return teams.map(t => {
        const teamGames = filteredSchedule.filter(g => g.homeTeamId === t.id || g.awayTeamId === t.id);
        const gp = teamGames.length || 1;
        const tot = allRawTotals.get(t.id)!;
        let totalPts = 0, totalPa = 0;
        let oppFgm = 0, oppFga = 0, opp3pm = 0, opp3pa = 0, oppFtm = 0, oppFta = 0;
        let oppReb = 0, oppOreb = 0, oppDreb = 0, oppAst = 0, oppStl = 0, oppBlk = 0, oppTov = 0, oppPf = 0;
        const oppAccum = new Map<string, number>();
        teamGames.forEach(g => {
            const isH = g.homeTeamId === t.id;
            totalPts += isH ? g.homeScore : g.awayScore;
            totalPa += isH ? g.awayScore : g.homeScore;
            const oppBox = isH ? (g as any).awayStats : (g as any).homeStats;
            if (oppBox) {
                oppFgm += oppBox.fgm || 0; oppFga += oppBox.fga || 0; opp3pm += oppBox.p3m || 0; opp3pa += oppBox.p3a || 0;
                oppFtm += oppBox.ftm || 0; oppFta += oppBox.fta || 0; oppReb += oppBox.reb || 0; oppOreb += oppBox.offReb || 0;
                oppDreb += oppBox.defReb || 0; oppAst += oppBox.ast || 0; oppStl += oppBox.stl || 0; oppBlk += oppBox.blk || 0;
                oppTov += oppBox.tov || 0; oppPf += oppBox.pf || 0;
            } else {
                const oppId = isH ? g.awayTeamId : g.homeTeamId;
                oppAccum.set(oppId, (oppAccum.get(oppId) || 0) + 1);
            }
        });
        oppAccum.forEach((cnt, oppId) => {
            const oT = allRawTotals.get(oppId); const oG = allGameCounts.get(oppId) || 1;
            if (oT) {
                const s = cnt / oG;
                oppFgm += oT.fgm * s; oppFga += oT.fga * s; opp3pm += oT.p3m * s; opp3pa += oT.p3a * s;
                oppFtm += oT.ftm * s; oppFta += oT.fta * s; oppReb += oT.reb * s; oppOreb += oT.offReb * s;
                oppDreb += oT.defReb * s; oppAst += oT.ast * s; oppStl += oT.stl * s; oppBlk += oT.blk * s;
                oppTov += oT.tov * s; oppPf += oT.pf * s;
            }
        });
        const tsa = tot.fga + 0.44 * tot.fta;
        const tPoss = tot.fga + 0.44 * tot.fta + tot.tov - tot.offReb;
        const oPoss = oppFga + 0.44 * oppFta + oppTov - oppOreb;
        const o2pa = oppFga - opp3pa;
        const stats: Record<string, number> = {
            pts: totalPts / gp, pa: totalPa / gp, oreb: tot.offReb / gp, dreb: tot.defReb / gp,
            reb: tot.reb / gp, ast: tot.ast / gp, stl: tot.stl / gp, blk: tot.blk / gp, tov: tot.tov / gp,
            fgm: tot.fgm / gp, fga: tot.fga / gp, 'fg%': tot.fga > 0 ? tot.fgm / tot.fga : 0,
            p3m: tot.p3m / gp, p3a: tot.p3a / gp, '3p%': tot.p3a > 0 ? tot.p3m / tot.p3a : 0,
            ftm: tot.ftm / gp, fta: tot.fta / gp, 'ft%': tot.fta > 0 ? tot.ftm / tot.fta : 0,
            'ts%': tsa > 0 ? totalPts / (2 * tsa) : 0, pm: (totalPts - totalPa) / gp,
            'efg%': tot.fga > 0 ? (tot.fgm + 0.5 * tot.p3m) / tot.fga : 0,
            'tov%': tPoss > 0 ? tot.tov / tPoss : 0,
            'ast%': tot.fgm > 0 ? tot.ast / tot.fgm : 0,
            'stl%': oPoss > 0 ? tot.stl / oPoss : 0,
            'blk%': o2pa > 0 ? tot.blk / o2pa : 0,
            '3par': tot.fga > 0 ? tot.p3a / tot.fga : 0,
            ftr: tot.fga > 0 ? tot.fta / tot.fga : 0,
            ortg: tPoss > 0 ? (totalPts / tPoss) * 100 : 0,
            drtg: oPoss > 0 ? (totalPa / oPoss) * 100 : 0,
            nrtg: (tPoss > 0 && oPoss > 0) ? ((totalPts / tPoss) - (totalPa / oPoss)) * 100 : 0,
            poss: tPoss / gp,
            pace: oPoss > 0 ? (tPoss + oPoss) / (2 * gp) : tPoss / gp,
            opp_pts: totalPa / gp, 'opp_fg%': oppFga > 0 ? oppFgm / oppFga : 0,
            'opp_3p%': opp3pa > 0 ? opp3pm / opp3pa : 0,
            opp_ast: oppAst / gp, opp_reb: oppReb / gp, opp_oreb: oppOreb / gp,
            opp_stl: oppStl / gp, opp_blk: oppBlk / gp, opp_tov: oppTov / gp, opp_pf: oppPf / gp,
        };
        return { teamId: t.id, teamName: t.name, wins: t.wins, losses: t.losses, stats };
    });
}

/** 스탠딩 컨텍스트 (유저 팀 ± 2팀) */
function buildStandingsContext(team: Team, allTeams: Team[], schedule: Game[]) {
    const statsMap = computeStandingsStats(allTeams, schedule);
    const comparator = createTiebreakerComparator(allTeams, schedule);
    const sorted = [...allTeams].sort(comparator);
    const myIdx = sorted.findIndex(t => t.id === team.id);
    const leader = sorted[0];
    const leaderRec = statsMap[leader?.id];
    const fmtRec = (r: { w: number; l: number }) => `${r.w}-${r.l}`;
    const start = Math.max(0, myIdx - 2);
    const end = Math.min(sorted.length, myIdx + 3);
    return sorted.slice(start, end).map((t, i) => {
        const rec = statsMap[t.id];
        const rank = start + i + 1;
        let gb = '-';
        if (leaderRec && t.id !== leader.id) {
            gb = (((leaderRec.wins - leaderRec.losses) - (rec.wins - rec.losses)) / 2).toFixed(1);
        }
        return {
            teamId: t.id, teamName: `${t.city} ${t.name}`, rank, wins: rec.wins, losses: rec.losses,
            pct: rec.pct.toFixed(3).replace(/^0/, ''), gb,
            home: fmtRec(rec.home), away: fmtRec(rec.away), conf: fmtRec(rec.conf),
            ppg: rec.ppg > 0 ? rec.ppg.toFixed(1) : '-', oppg: rec.oppg > 0 ? rec.oppg.toFixed(1) : '-',
            diff: rec.diff === 0 ? '0.0' : (rec.diff > 0 ? '+' : '') + rec.diff.toFixed(1),
            streak: rec.streak, l10: fmtRec(rec.l10), isUserTeam: t.id === team.id,
        };
    });
}

/** 로스터 선수 Traditional 스탯 */
function buildRosterStats(team: Team) {
    return team.roster
        .filter(p => p.stats.g > 0)
        .map(p => {
            const s = p.stats; const g = s.g;
            return {
                id: p.id, name: p.name, position: p.position, ovr: calculatePlayerOvr(p),
                g, mpg: +(s.mp / g).toFixed(1),
                pts: +(s.pts / g).toFixed(1), oreb: +((s.offReb || 0) / g).toFixed(1),
                dreb: +((s.defReb || 0) / g).toFixed(1), reb: +(s.reb / g).toFixed(1),
                ast: +(s.ast / g).toFixed(1), stl: +(s.stl / g).toFixed(1),
                blk: +(s.blk / g).toFixed(1), tov: +(s.tov / g).toFixed(1),
                pf: +((s.pf || 0) / g).toFixed(1),
                fgm: +(s.fgm / g).toFixed(1), fga: +(s.fga / g).toFixed(1),
                fgPct: s.fga > 0 ? +(s.fgm / s.fga).toFixed(3) : 0,
                p3m: +(s.p3m / g).toFixed(1), p3a: +(s.p3a / g).toFixed(1),
                p3Pct: s.p3a > 0 ? +(s.p3m / s.p3a).toFixed(3) : 0,
                ftm: +(s.ftm / g).toFixed(1), fta: +(s.fta / g).toFixed(1),
                ftPct: s.fta > 0 ? +(s.ftm / s.fta).toFixed(3) : 0,
                pm: +((s.plusMinus || 0) / g).toFixed(1),
            };
        })
        .sort((a, b) => b.pts - a.pts);
}

export const buildSeasonReviewContent = (
    team: Team, allTeams: Team[], transactions: Transaction[], schedule?: Game[]
): SeasonReviewContent => {
    const report = generateSeasonReport(team, allTeams, transactions, schedule);
    const mvpPlayer = report.mvp;
    const g = mvpPlayer && mvpPlayer.stats.g > 0 ? mvpPlayer.stats.g : 1;

    const base: SeasonReviewContent = {
        wins: team.wins,
        losses: team.losses,
        winPct: report.winPct,
        winPctStr: report.winPctStr,
        leagueRank: report.leagueRank,
        confRank: report.confRank,
        conference: team.conference || '',
        isPlayoffBound: report.winPct >= 0.5,
        teamStats: report.teamStats,
        leagueRanks: report.leagueRanks,
        mvp: mvpPlayer ? {
            id: mvpPlayer.id,
            name: mvpPlayer.name,
            position: mvpPlayer.position,
            age: mvpPlayer.age,
            ppg: +(mvpPlayer.stats.pts / g).toFixed(1),
            rpg: +(mvpPlayer.stats.reb / g).toFixed(1),
            apg: +(mvpPlayer.stats.ast / g).toFixed(1),
            ovr: calculatePlayerOvr(mvpPlayer),
        } : null,
        trades: report.seasonTrades.map(t => ({
            date: t.date,
            partnerId: t.details?.partnerTeamId || '',
            partnerName: t.details?.partnerTeamName || 'Unknown',
            acquired: (t.details?.acquired || []).map(p => ({ id: p.id, name: p.name, ovr: calculatePlayerOvr(allTeams.flatMap(tm => tm.roster).find(r => r.id === p.id) as Player) || 0 })),
            departed: (t.details?.traded || []).map(p => ({ id: p.id, name: p.name, ovr: calculatePlayerOvr(allTeams.flatMap(tm => tm.roster).find(r => r.id === p.id) as Player) || 0 })),
        })),
        ownerMood: report.ownerMood,
        ownerName: report.ownerName,
    };

    // 추가 데이터: standings, allTeamsStats, rosterStats
    if (schedule && schedule.length > 0) {
        base.standingsContext = buildStandingsContext(team, allTeams, schedule);
        base.allTeamsStats = computeAllTeamsStats(allTeams, schedule);
        base.rosterStats = buildRosterStats(team);
    }

    return base;
};

// --- Owner Letter Generator ---

const OWNER_LETTER_TEMPLATES: { title: string; msgs: string[]; color: string; borderColor: string; bg: string }[] = [
    // Tier 0: confRank 1-3 (최상위 컨텐더)
    {
        title: "놀라운 시즌이었습니다",
        msgs: [
            "컨퍼런스 정상에 우리 팀이 서 있습니다. 당신이 이뤄낸 성과에 진심으로 감사드립니다. 이제 플레이오프에서 우승컵을 들어올릴 차례입니다. 온 도시가 당신을 응원하고 있습니다.",
            "이 정도 성적이라면 누가 봐도 리그 최정상급입니다. 선수단 운영, 전술, 모든 면에서 탁월했습니다. 포스트시즌에서도 이 기세를 이어가 주세요. 우승만이 남았습니다.",
            "솔직히 시즌 초에는 이 정도까지 기대하지 않았습니다. 하지만 당신은 해냈습니다. 팬들의 열기가 최고조입니다. 플레이오프에서 역사를 써 주세요.",
            "완벽에 가까운 시즌을 보내주셨습니다. 보드진 전원이 만족하고 있습니다. 남은 건 우승뿐입니다. 마지막까지 집중해 주십시오.",
        ],
        color: "text-amber-400", borderColor: "border-amber-500/50", bg: "bg-amber-500/5"
    },
    // Tier 1: confRank 4-8 (플레이오프 팀)
    {
        title: "좋은 시즌이었습니다",
        msgs: [
            "플레이오프 진출을 확정지었군요. 정규시즌 내내 안정적인 경쟁력을 보여줬습니다. 하지만 진정한 컨텐더가 되려면 한 단계 더 올라가야 합니다. 포스트시즌에서의 성과를 기대하겠습니다.",
            "준수한 성적입니다. 플레이오프 자체가 목표는 아니었겠지만, 이 팀이 성장하고 있다는 건 분명합니다. 오프시즌에 핵심 보강이 이뤄진다면 내년엔 더 높은 곳을 바라볼 수 있을 겁니다.",
            "플레이오프 티켓을 손에 넣었습니다. 나쁘지 않은 시즌이지만, 솔직히 우리 팬들은 더 많은 것을 원하고 있습니다. 포스트시즌에서 깜짝 선전을 기대합니다.",
        ],
        color: "text-blue-400", borderColor: "border-blue-500/50", bg: "bg-blue-500/5"
    },
    // Tier 2: confRank 9-11 (버블/로터리)
    {
        title: "아쉬운 시즌이었습니다",
        msgs: [
            "플레이오프 문턱에서 멈춘 건 정말 뼈아픕니다. 가능성은 보였지만 결과가 따라주지 않았습니다. 오프시즌 동안 무엇이 부족했는지 냉정하게 분석해 주세요.",
            "기대에 못 미치는 시즌이었습니다. 팬들의 실망감이 느껴집니다. 리빌딩이 필요한 건지, 아니면 한두 명의 보강으로 해결될 문제인지 판단을 내려야 할 때입니다.",
            "솔직히 말해 올 시즌은 실패입니다. 플레이오프에 가지 못하는 팀에 이 구단의 이름을 걸 수 없습니다. 큰 그림을 다시 그려주세요. 아직 기회는 있습니다.",
        ],
        color: "text-orange-400", borderColor: "border-orange-500/50", bg: "bg-orange-500/5"
    },
    // Tier 3: confRank 12-15 (최하위)
    {
        title: "받아들이기 힘든 시즌입니다",
        msgs: [
            "이런 성적을 보고 가만히 있을 수 없습니다. 팬들은 떠나고 있고, 스폰서들은 문의를 줄이고 있습니다. 드래프트와 오프시즌을 통해 반드시 팀을 재건해야 합니다. 각오하고 임해 주십시오.",
            "최악의 시즌입니다. 리빌딩 과정이라 해도 이 정도 성적은 용납하기 어렵습니다. 당장 획기적인 변화가 필요합니다. 내년에도 이런 결과라면 저도 결단을 내릴 수밖에 없습니다.",
            "한 시즌을 통째로 날렸습니다. 선수단 구성부터 전술까지 모든 것을 재점검해야 합니다. 드래프트 픽이라도 좋은 걸 확보했길 바랍니다. 더 이상의 변명은 듣고 싶지 않습니다.",
            "구단 역사상 최악의 시즌 중 하나입니다. 팬들에게 면목이 없습니다. 오프시즌에 팀을 완전히 뜯어고쳐 주세요. 이게 마지막 기회라고 생각하십시오.",
        ],
        color: "text-red-500", borderColor: "border-red-500/50", bg: "bg-red-500/5"
    },
];

function getOwnerLetterTier(confRank: number): number {
    if (confRank <= 3) return 0;
    if (confRank <= 8) return 1;
    if (confRank <= 11) return 2;
    return 3;
}

export const buildOwnerLetterContent = (
    team: Team, allTeams: Team[], schedule?: Game[]
): OwnerLetterContent => {
    const comparator = schedule
        ? createTiebreakerComparator(allTeams, schedule)
        : (a: Team, b: Team) => b.wins - a.wins;
    const confTeams = allTeams.filter(t => t.conference === team.conference).sort(comparator);
    const confRank = confTeams.findIndex(t => t.id === team.id) + 1;

    const tier = getOwnerLetterTier(confRank);
    const template = OWNER_LETTER_TEMPLATES[tier];
    const msg = template.msgs[Math.floor(Math.random() * template.msgs.length)];

    return {
        ownerName: TEAM_DATA[team.id]?.owner || "The Ownership Group",
        title: template.title,
        msg,
        mood: { color: template.color, borderColor: template.borderColor, bg: template.bg },
        confRank,
        wins: team.wins,
        losses: team.losses,
    };
};

const ROUND_NAMES: Record<number, string> = {
    0: '플레이인', 1: '1라운드', 2: '세미파이널', 3: '컨퍼런스 파이널', 4: '파이널'
};

const getOwnerMessageForStage = (result: 'WON' | 'LOST', round: number, isFinalStage: boolean): string => {
    if (result === 'WON' && round === 4) {
        return "우리가 해냈습니다! 리그 정상에 올랐습니다. 이 기쁨을 온 도시와 함께 나누겠습니다. 역사적인 순간입니다!";
    }
    if (result === 'WON') {
        return "훌륭한 승리입니다. 다음 라운드도 반드시 돌파하겠다는 각오로 준비해주세요. 우리는 아직 끝나지 않았습니다.";
    }
    if (round === 4) {
        return "아쉬운 준우승입니다. 하지만 여기까지 온 것만으로도 대단한 성과입니다. 다음 시즌에는 반드시 우승컵을 들어올립시다.";
    }
    if (round >= 3) {
        return "컨퍼런스 결승까지 왔지만 아쉽게 멈췄습니다. 우승 문턱에서의 경험을 발판으로 삼아야 합니다.";
    }
    return "시리즈에서 패배했습니다. 결과를 겸허히 받아들이고, 다음 시즌을 위한 전략을 재정비합시다.";
};

const getFinalStatus = (result: 'WON' | 'LOST', round: number): { title: string; desc: string } | undefined => {
    if (result === 'WON' && round === 4) return { title: 'BPL CHAMPIONS', desc: '세계 최고의 자리에 올랐습니다!' };
    if (result === 'LOST') {
        if (round === 4) return { title: 'BPL Finalist', desc: '아쉬운 준우승이지만, 위대한 여정이었습니다.' };
        if (round === 3) return { title: 'Conference Finalist', desc: '컨퍼런스 결승 진출. 우승 문턱에서 멈췄습니다.' };
        if (round === 2) return { title: 'Semi-Finalist', desc: '컨퍼런스 4강 진출. 다음 시즌이 기대됩니다.' };
        if (round === 1) return { title: 'Playoff Participant', desc: '플레이오프 1라운드 진출. 소중한 경험을 쌓았습니다.' };
    }
    return undefined;
};

export const buildPlayoffStageContent = (
    team: Team,
    allTeams: Team[],
    series: PlayoffSeries,
    schedule: Game[],
    allPlayoffSeries: PlayoffSeries[]
): PlayoffStageReviewContent => {
    const opponentId = series.higherSeedId === team.id ? series.lowerSeedId : series.higherSeedId;
    const opponent = allTeams.find(t => t.id === opponentId);
    const confPrefix = series.round < 4 && series.conference !== 'BPL'
        ? (series.conference === 'East' ? '동부 ' : '서부 ')
        : '';
    const roundName = confPrefix + (ROUND_NAMES[series.round] || `${series.round}라운드`);

    const isWinner = series.winnerId === team.id;
    const result: 'WON' | 'LOST' = isWinner ? 'WON' : 'LOST';
    const myWins = series.higherSeedId === team.id ? series.higherSeedWins : series.lowerSeedWins;
    const myLosses = series.higherSeedId === team.id ? series.lowerSeedWins : series.higherSeedWins;

    const seriesGames = schedule
        .filter(g => g.seriesId === series.id && g.played)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const games = seriesGames.map((g, idx) => {
        const isHome = g.homeTeamId === team.id;
        const myScore = isHome ? (g.homeScore || 0) : (g.awayScore || 0);
        const oppScore = isHome ? (g.awayScore || 0) : (g.homeScore || 0);
        return { gameNum: idx + 1, isHome, myScore, oppScore, isWin: myScore > oppScore, gameId: g.id };
    });

    // Is this the final stage? (lost, or won round 4)
    const isFinalStage = result === 'LOST' || (result === 'WON' && series.round === 4);

    return {
        round: series.round,
        roundName,
        myTeamId: team.id,
        myTeamName: team.name,
        opponentId,
        opponentName: opponent?.name || 'Unknown',
        result,
        seriesScore: `${myWins}-${myLosses}`,
        myWins,
        myLosses,
        games,
        isFinalStage,
        finalStatus: isFinalStage ? getFinalStatus(result, series.round) : undefined,
        ownerName: TEAM_DATA[team.id]?.owner || "The Ownership Group",
        ownerMessage: getOwnerMessageForStage(result, series.round, isFinalStage),
    };
};

/**
 * Aggregate box scores from multiple playoff games into per-player series totals.
 * gameResults: rows from user_playoffs_results with box_score: { home: PlayerBoxScore[], away: PlayerBoxScore[] }
 */
export const aggregateSeriesBoxScores = (
    gameResults: { home_team_id: string; away_team_id: string; box_score: any }[],
    myTeamId: string
): SeriesPlayerStat[] => {
    const map = new Map<string, SeriesPlayerStat>();

    for (const g of gameResults) {
        const bs = g.box_score;
        if (!bs) continue;
        const isHome = g.home_team_id === myTeamId;
        const myBox: any[] = isHome ? (bs.home || []) : (bs.away || []);

        for (const p of myBox) {
            const existing = map.get(p.playerId);
            if (existing) {
                existing.gp += 1;
                existing.mp += p.mp || 0;
                existing.pts += p.pts || 0;
                existing.reb += p.reb || 0;
                existing.ast += p.ast || 0;
                existing.stl += p.stl || 0;
                existing.blk += p.blk || 0;
                existing.tov += p.tov || 0;
                existing.fgm += p.fgm || 0;
                existing.fga += p.fga || 0;
                existing.p3m += p.p3m || 0;
                existing.p3a += p.p3a || 0;
                existing.ftm += p.ftm || 0;
                existing.fta += p.fta || 0;
                existing.pf += p.pf || 0;
                existing.plusMinus += p.plusMinus || 0;
            } else {
                map.set(p.playerId, {
                    playerId: p.playerId,
                    playerName: p.playerName,
                    gp: 1,
                    mp: p.mp || 0,
                    pts: p.pts || 0,
                    reb: p.reb || 0,
                    ast: p.ast || 0,
                    stl: p.stl || 0,
                    blk: p.blk || 0,
                    tov: p.tov || 0,
                    fgm: p.fgm || 0,
                    fga: p.fga || 0,
                    p3m: p.p3m || 0,
                    p3a: p.p3a || 0,
                    ftm: p.ftm || 0,
                    fta: p.fta || 0,
                    pf: p.pf || 0,
                    plusMinus: p.plusMinus || 0,
                });
            }
        }
    }

    return Array.from(map.values()).sort((a, b) => b.pts - a.pts);
};
