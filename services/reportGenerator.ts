
import React from 'react';
import { Team, Player, Transaction, PlayoffSeries, Game, SeasonReviewContent, PlayoffStageReviewContent, OwnerLetterContent, SeriesPlayerStat, RegSeasonChampionContent, PlayoffChampionContent, ScoutReportContent, ScoutReportPlayerEntry } from '../types';
import { TEAM_DATA } from '../data/teamData';
import { ATTR_KR_LABEL } from '../data/attributeConfig';
import { calculatePlayerOvr } from '../utils/constants';
import { sendMessage } from './messageService';
import { createTiebreakerComparator } from '../utils/tiebreaker';
import { computeStandingsStats } from '../utils/standingsStats';
import { ROUND_NAMES } from '../utils/playoffLogic';
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
export function computeAllTeamsStats(teams: Team[], schedule: Game[]) {
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
export function buildRosterStats(team: Team) {
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

// --- Playoff Owner Letter ---
const PLAYOFF_OWNER_LETTER_TEMPLATES: Record<string, { title: string; msgs: string[]; color: string; borderColor: string; bg: string }> = {
    champion: {
        title: "우리가 해냈습니다!",
        msgs: [
            "축하합니다! 리그 정상에 올랐습니다. 이 순간을 얼마나 기다려왔는지 모릅니다. 제가 이 구단을 인수한 이래로 단 하루도 이 꿈을 잊은 적이 없었습니다. 정규시즌의 긴 여정을 견뎌냈고, 플레이오프의 살인적인 강도를 이겨냈으며, 마침내 파이널에서 우승 트로피를 들어올렸습니다. 당신이 이 팀에 해준 모든 것에 진심으로 감사드립니다. 선수단 구성부터 전술 운영, 그리고 위기의 순간마다 보여준 냉철한 판단력까지 — 모든 것이 오늘의 영광으로 이어졌습니다. 이 기쁨을 온 도시와 함께 나누겠습니다. 팬들이 거리로 쏟아져 나올 겁니다. 퍼레이드 준비는 제가 하겠습니다. 역사적인 순간입니다!",
            "우승입니다! 이 한마디를 하기 위해 우리 모두가 얼마나 긴 시간을 달려왔습니까. 정규시즌 82경기의 피로, 부상자 명단의 불안, 트레이드 데드라인의 고민 — 그 모든 과정이 결국 이 트로피로 보상받았습니다. 당신의 결단력이 없었다면 불가능했을 겁니다. 핵심 선수들을 지키면서도 팀의 균형을 맞추고, 포스트시즌에서는 매 시리즈마다 최적의 전술을 찾아냈습니다. 팬들에게 최고의 선물을 안겨줬습니다. 이 도시가 챔피언의 도시가 되었습니다. 다운타운 퍼레이드 일정은 제가 직접 챙기겠습니다. 오늘 밤은 마음껏 축하합시다!",
            "드디어 해냈습니다! 챔피언의 자리에 올라섰습니다. 솔직히 말씀드리면, 플레이오프 중간중간 불안한 순간이 없지 않았습니다. 하지만 당신은 매번 정확한 판단을 내렸고, 선수들은 그 믿음에 보답했습니다. 이 팀을 이끌어준 당신의 리더십에 경의를 표합니다. 로스터 한 명 한 명이 자신의 역할을 완벽히 수행했고, 그것이 곧 당신의 안목이었습니다. 구단 역사에 가장 빛나는 한 페이지가 새겨졌습니다. 함께 역사를 써내려갔습니다. 이 감격을 오래도록 기억합시다.",
        ],
        color: "text-amber-400", borderColor: "border-amber-500/50", bg: "bg-amber-500/5"
    },
    finalist: {
        title: "아쉬운 준우승입니다",
        msgs: [
            "파이널까지 올라간 것은 정말 대단한 성과입니다. 리그 30개 팀 중 마지막 둘 안에 들었다는 것 자체가 이 팀의 수준을 증명합니다. 하지만 솔직히, 우승컵을 눈앞에 두고 놓친 것이 너무나 아쉽습니다. 그 마지막 한 걸음이 왜 이렇게 무거웠는지... 선수들의 표정을 보면 저도 가슴이 먹먹합니다. 그래도 이 경험은 값진 자산입니다. 파이널의 압박감, 상대의 수준, 그리고 우승에 필요한 마지막 디테일이 무엇인지 우리 모두가 체감했습니다. 오프시즌에 그 마지막 퍼즐 한 조각을 찾아주세요. 다음 시즌에는 반드시 우승 트로피를 이 도시에 가져옵시다.",
            "준우승이라는 결과가 쓰라립니다. 여기까지 오는 과정에서 보여준 투지와 집중력은 정말 감탄할 만했습니다. 하지만 결국 마지막 순간에 상대가 한 수 위였습니다. 그 차이가 무엇이었는지 냉정하게 돌아봐야 합니다. 로스터 깊이인지, 전술적 대응인지, 아니면 빅 모먼트에서의 경험 차이인지. 이 팀이 리그 최고 수준이라는 것은 이미 증명했습니다. 부족한 건 딱 하나, 우승 경험뿐입니다. 오프시즌에 핵심 전력을 유지하면서 약점을 보완해주세요. 우리는 이미 정상 바로 아래에 있습니다. 한 계단만 더 올라가면 됩니다.",
        ],
        color: "text-blue-400", borderColor: "border-blue-500/50", bg: "bg-blue-500/5"
    },
    conf_finals: {
        title: "컨퍼런스 결승 진출, 훌륭합니다",
        msgs: [
            "컨퍼런스 결승까지 올라간 것은 결코 쉬운 일이 아닙니다. 리그에서 최종 4강에 남았다는 것은 이 팀이 진정한 컨텐더라는 뜻입니다. 우승 문턱에서 멈춘 것이 아쉽지만, 이번 플레이오프에서 우리 선수들이 보여준 경기력은 분명 인상적이었습니다. 특히 이전 라운드들을 돌파하는 과정에서의 정신력은 높이 평가합니다. 다만 컨퍼런스 결승에서 드러난 약점들은 오프시즌에 반드시 보완해야 합니다. 이 팀의 잠재력은 충분히 확인했습니다. 핵심 전력을 유지하면서 전략적인 보강이 이뤄진다면, 다음 시즌에는 파이널 무대에 설 수 있다고 확신합니다.",
            "아쉽게 멈췄지만, 컨퍼런스 결승까지 온 이 여정 자체가 자랑스럽습니다. 정규시즌의 성과를 포스트시즌에서도 이어갔고, 두 차례의 시리즈를 돌파하며 팀의 저력을 증명했습니다. 물론 결승에서의 패배는 뼈아프지만, 패인을 정확히 분석한다면 이것이 성장의 발판이 될 것입니다. 우리에게 부족했던 것이 선수층의 깊이인지, 빅매치 경험인지, 아니면 전술적 다양성인지 — 오프시즌 동안 철저히 파악해주세요. 이 경험을 바탕으로 한 단계 더 올라갈 수 있다고 확신합니다.",
        ],
        color: "text-blue-400", borderColor: "border-blue-500/50", bg: "bg-blue-500/5"
    },
    semis: {
        title: "2라운드 진출, 좋은 시즌이었습니다",
        msgs: [
            "2라운드 진출은 이 팀이 올바른 방향으로 가고 있다는 확실한 증거입니다. 정규시즌을 좋은 성적으로 마치고, 1라운드를 돌파한 뒤 2라운드 무대에 올랐습니다. 비록 여기서 멈추었지만, 지난 시즌과 비교하면 분명한 진전입니다. 다만 이 수준에 만족해서는 안 됩니다. 2라운드에서 우리를 꺾은 상대와의 차이가 무엇이었는지 면밀히 분석해야 합니다. 여기서 멈추지 말고, 오프시즌에 더 강해져서 돌아옵시다. 우리 팬들은 더 높은 무대를 원하고 있고, 이 팀은 그 기대에 부응할 자격이 있습니다.",
            "2라운드까지 올라온 것은 충분히 칭찬받을 만한 성과입니다. 선수들이 매 경기 최선을 다했다는 건 누구나 인정할 겁니다. 하지만 우리의 최종 목표는 우승이고, 아직 거기에 도달하지 못했습니다. 2라운드에서 드러난 한계를 직시해야 합니다. 경기 후반부의 체력 관리, 핵심 선수 의존도, 벤치 전력의 안정성 — 이런 부분들을 점검해주세요. 부족한 부분을 보완해서 다음 시즌에는 컨퍼런스 결승, 나아가 파이널까지 돌파할 수 있는 팀을 만들어주길 기대합니다.",
        ],
        color: "text-slate-300", borderColor: "border-slate-500/50", bg: "bg-slate-500/5"
    },
    first_round: {
        title: "플레이오프 경험을 쌓았습니다",
        msgs: [
            "1라운드에서 탈락한 것은 물론 아쉽습니다. 하지만 플레이오프 무대에 선 것 자체가 이 팀의 성장을 보여줍니다. 정규시즌 82경기를 버텨내고 포스트시즌 티켓을 따낸 것은 분명한 성과입니다. 다만 포스트시즌의 강도는 정규시즌과는 차원이 다릅니다. 1라운드에서 느낀 그 차이를 잊지 마세요. 상대의 집중력, 전술적 대응, 매 포제션의 무게감 — 이런 것들을 정규시즌에서는 경험하기 어렵습니다. 이번 경험을 바탕으로 오프시즌에 더 강한 팀을 만들어주세요. 다음 시즌에는 1라운드를 돌파하는 것을 첫 번째 목표로 삼읍시다.",
            "플레이오프 첫 관문을 넘지 못했습니다. 결과만 보면 아쉬운 시즌이지만, 큰 그림에서 보면 의미 있는 한 해였습니다. 포스트시즌이 얼마나 치열한 무대인지 온몸으로 체감했을 겁니다. 정규시즌에서 통하던 전략이 플레이오프에서는 먹히지 않는 경우가 있었을 것이고, 선수들의 멘탈과 체력 관리가 얼마나 중요한지도 느꼈을 겁니다. 이 모든 것이 앞으로의 밑거름입니다. 오프시즌 보강에 집중하되, 무리한 올인보다는 팀의 기반을 단단히 다지는 방향으로 나아가주세요.",
        ],
        color: "text-orange-400", borderColor: "border-orange-500/50", bg: "bg-orange-500/5"
    },
    playin: {
        title: "플레이인에서 멈췄습니다",
        msgs: [
            "플레이인에서 탈락했습니다. 본선 무대에 오르지 못한 것이 뼈아프게 아쉽습니다. 정규시즌 내내 플레이오프 진출을 향해 달려왔는데, 마지막 관문에서 무너졌습니다. 플레이인이라는 기회가 주어졌음에도 그것을 살리지 못한 점은 심각하게 반성해야 합니다. 단 한두 경기의 결과로 시즌이 끝나는 것이 플레이인의 잔혹함이지만, 그만큼 정규시즌에서 더 높은 순위를 확보하는 것이 중요합니다. 오프시즌에 전력을 보강해서 내년에는 플레이인이 아닌 직행 티켓으로 포스트시즌에 진출합시다.",
            "플레이인이라는 마지막 기회를 살리지 못했습니다. 솔직히 말해 이 정도 전력이면 충분히 가능했다고 봅니다. 큰 무대에서의 집중력과 경험이 부족했던 것이 패인이었습니다. 정규시즌 순위가 좀 더 높았다면 이런 상황 자체가 없었을 텐데, 결국 스스로 어려운 길을 만든 셈입니다. 이번 탈락을 교훈 삼아, 다음 시즌에는 정규시즌 성적을 확실히 끌어올려서 플레이오프 직행 자리를 확보합시다. 오프시즌 계획을 체계적으로 세워주세요. 아직 이 팀의 잠재력은 충분합니다.",
        ],
        color: "text-orange-400", borderColor: "border-orange-500/50", bg: "bg-orange-500/5"
    },
};

function getPlayoffOwnerLetterKey(result: 'WON' | 'LOST', round: number): string {
    if (result === 'WON' && round === 4) return 'champion';
    if (result === 'LOST') {
        if (round === 4) return 'finalist';
        if (round === 3) return 'conf_finals';
        if (round === 2) return 'semis';
        if (round === 1) return 'first_round';
        return 'playin';
    }
    return 'first_round';
}

export const buildPlayoffOwnerLetterContent = (
    team: Team, result: 'WON' | 'LOST', round: number
): OwnerLetterContent => {
    const key = getPlayoffOwnerLetterKey(result, round);
    const template = PLAYOFF_OWNER_LETTER_TEMPLATES[key];
    const msg = template.msgs[Math.floor(Math.random() * template.msgs.length)];

    return {
        ownerName: TEAM_DATA[team.id]?.owner || "The Ownership Group",
        title: template.title,
        msg,
        mood: { color: template.color, borderColor: template.borderColor, bg: template.bg },
        confRank: 0,
        wins: team.wins,
        losses: team.losses,
    };
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
// --- Season Start Owner Welcome Letter ---

const SEASON_START_LETTER_TEMPLATES = [
    "새 시즌이 시작됩니다. 우리 팀의 새로운 단장으로 당신을 맞이하게 되어 기쁩니다. 선수단 운영과 전술 구성을 전적으로 맡기겠습니다. 좋은 시즌이 되길 기대합니다.",
    "새 시즌을 앞두고 이렇게 인사드립니다. 앞으로 팀의 모든 결정은 당신의 손에 달려 있습니다. 로스터 구성, 전술 운영, 트레이드까지 — 당신의 판단을 믿겠습니다. 좋은 결과를 기대하고 있습니다.",
    "환영합니다. 우리 구단의 새로운 단장으로 함께하게 되어 영광입니다. 팬들과 구단 모두 새 시즌에 대한 기대가 큽니다. 최고의 시즌을 만들어 주세요.",
    "새 시즌, 새로운 시작입니다. 이 팀을 이끌어줄 적임자로 당신을 선택했습니다. 선수단을 점검하고, 전술을 세우고, 승리를 향해 나아가 주세요. 행운을 빕니다.",
];

export const buildSeasonStartOwnerLetter = (teamId: string): OwnerLetterContent => {
    const msg = SEASON_START_LETTER_TEMPLATES[Math.floor(Math.random() * SEASON_START_LETTER_TEMPLATES.length)];
    return {
        ownerName: TEAM_DATA[teamId]?.owner || "The Ownership Group",
        title: "새 시즌을 시작합니다",
        msg,
        mood: { color: "text-indigo-400", borderColor: "border-indigo-500/50", bg: "bg-indigo-500/5" },
        confRank: 0,
        wins: 0,
        losses: 0,
    };
};

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

/**
 * Finals MVP 선정: 우승 팀 선수 중 시리즈 스코어 최고 선수를 반환.
 * 스코어: PPG×2.5 + RPG×1.2 + APG×1.8 + SPG + BPG×0.8 - TOV×0.8 + TS%×15 + ±/game×0.5
 */
export const selectFinalsMvp = (
    gameResults: { home_team_id: string; away_team_id: string; box_score: any }[],
    winnerTeamId: string
): { mvp: SeriesPlayerStat; leaderboard: SeriesPlayerStat[] } | null => {
    const winnerStats = aggregateSeriesBoxScores(gameResults, winnerTeamId);
    if (winnerStats.length === 0) return null;

    const calcScore = (p: SeriesPlayerStat): number => {
        const gp = p.gp || 1;
        const ppg = p.pts / gp, rpg = p.reb / gp, apg = p.ast / gp;
        const spg = p.stl / gp, bpg = p.blk / gp, tovpg = p.tov / gp;
        const tsa = 2 * (p.fga + 0.44 * p.fta);
        const tsPct = tsa > 0 ? p.pts / tsa : 0;
        const pmPerGame = p.plusMinus / gp;
        return ppg * 2.5 + rpg * 1.2 + apg * 1.8 + spg + bpg * 0.8 - tovpg * 0.8 + tsPct * 15 + pmPerGame * 0.5;
    };

    const scored = winnerStats.map(p => ({ ...p, _score: calcScore(p) }));
    scored.sort((a, b) => b._score - a._score);

    // strip internal _score before returning
    const leaderboard: SeriesPlayerStat[] = scored.map(({ _score, ...rest }) => rest);

    return { mvp: leaderboard[0], leaderboard };
};

// --- Regular Season Champion Report ---
export const buildRegSeasonChampionContent = (
    teams: Team[],
    schedule: Game[]
): RegSeasonChampionContent => {
    const comparator = createTiebreakerComparator(teams, schedule);
    const sorted = [...teams].sort(comparator);
    const champion = sorted[0];
    const totalGames = champion.wins + champion.losses || 82;
    const pct = (champion.wins / totalGames).toFixed(3).replace(/^0/, '');

    return {
        championTeamId: champion.id,
        championTeamName: champion.name,
        wins: champion.wins,
        losses: champion.losses,
        pct,
        conference: champion.conference,
        allTeamsStats: computeAllTeamsStats(teams, schedule),
        rosterStats: buildRosterStats(champion),
    };
};

/** 플레이오프 우승팀 보고서 콘텐츠 (playoffStats 기반) */
export const buildPlayoffChampionContent = (
    championTeam: Team,
    teams: Team[],
    schedule: Game[],
    playoffSeries: PlayoffSeries[]
): PlayoffChampionContent => {
    // 플레이오프 승패 집계
    let pWins = 0, pLosses = 0;
    for (const s of playoffSeries) {
        if (s.higherSeedId === championTeam.id) {
            pWins += s.higherSeedWins;
            pLosses += s.lowerSeedWins;
        } else if (s.lowerSeedId === championTeam.id) {
            pWins += s.lowerSeedWins;
            pLosses += s.higherSeedWins;
        }
    }

    return {
        championTeamId: championTeam.id,
        championTeamName: championTeam.name,
        playoffWins: pWins,
        playoffLosses: pLosses,
        conference: championTeam.conference,
        allTeamsStats: computePlayoffTeamsStats(teams, schedule),
        rosterStats: buildPlayoffRosterStats(championTeam),
    };
};

/** 플레이오프 참여 팀 스탯 (playoffStats 기반) */
function computePlayoffTeamsStats(teams: Team[], schedule: Game[]) {
    const playoffSchedule = schedule.filter(g => g.played && g.isPlayoff);
    const playoffTeamIds = new Set<string>();
    playoffSchedule.forEach(g => { playoffTeamIds.add(g.homeTeamId); playoffTeamIds.add(g.awayTeamId); });

    const playoffTeams = teams.filter(t => playoffTeamIds.has(t.id));

    return playoffTeams.map(t => {
        const teamGames = playoffSchedule.filter(g => g.homeTeamId === t.id || g.awayTeamId === t.id);
        const gp = teamGames.length || 1;

        const tot = t.roster.reduce((a: any, p) => {
            const s = p.playoffStats;
            if (!s) return a;
            a.reb += s.reb; a.offReb += (s.offReb || 0); a.defReb += (s.defReb || 0);
            a.ast += s.ast; a.stl += s.stl; a.blk += s.blk; a.tov += s.tov; a.pf += (s.pf || 0);
            a.fgm += s.fgm; a.fga += s.fga; a.p3m += s.p3m; a.p3a += s.p3a; a.ftm += s.ftm; a.fta += s.fta;
            return a;
        }, { reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0 });

        let totalPts = 0, totalPa = 0;
        teamGames.forEach(g => {
            const isH = g.homeTeamId === t.id;
            totalPts += isH ? (g.homeScore ?? 0) : (g.awayScore ?? 0);
            totalPa += isH ? (g.awayScore ?? 0) : (g.homeScore ?? 0);
        });

        const wins = teamGames.filter(g => {
            const isH = g.homeTeamId === t.id;
            return isH ? (g.homeScore ?? 0) > (g.awayScore ?? 0) : (g.awayScore ?? 0) > (g.homeScore ?? 0);
        }).length;
        const losses = gp - wins;

        const tsa = tot.fga + 0.44 * tot.fta;
        const tPoss = tot.fga + 0.44 * tot.fta + tot.tov - tot.offReb;
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
            'stl%': tPoss > 0 ? tot.stl / tPoss : 0,
            ortg: tPoss > 0 ? (totalPts / tPoss) * 100 : 0,
            drtg: tPoss > 0 ? (totalPa / tPoss) * 100 : 0,
            nrtg: tPoss > 0 ? ((totalPts - totalPa) / tPoss) * 100 : 0,
            poss: tPoss / gp,
            pace: tPoss / gp,
        };
        return { teamId: t.id, teamName: t.name, wins, losses, stats };
    });
}

/** 우승팀 로스터 플레이오프 Traditional 스탯 */
function buildPlayoffRosterStats(team: Team) {
    return team.roster
        .filter(p => p.playoffStats && p.playoffStats.g > 0)
        .map(p => {
            const s = p.playoffStats!; const g = s.g;
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

// --- Scout Report (월간 성장/퇴화 보고서) ---

export function buildScoutReportContent(
    roster: Player[],
    teamId: string,
    teamName: string,
    periodStart: string,
    periodEnd: string,
    monthLabel: string,
): ScoutReportContent {
    const players: ScoutReportPlayerEntry[] = [];

    for (const player of roster) {
        const log = player.changeLog;
        if (!log || log.length === 0) continue;

        // 해당 월의 이벤트만 필터
        const monthEvents = log.filter(e => e.date >= periodStart && e.date <= periodEnd);
        if (monthEvents.length === 0) continue;

        // 능력치별 delta 합산
        const deltaMap = new Map<string, number>();
        for (const ev of monthEvents) {
            deltaMap.set(ev.attribute, (deltaMap.get(ev.attribute) || 0) + ev.delta);
        }

        // 상쇄되어 0이 된 능력치 제거
        const changes: ScoutReportPlayerEntry['changes'] = [];
        let netDelta = 0;
        for (const [attr, totalDelta] of deltaMap) {
            if (totalDelta === 0) continue;
            changes.push({
                attribute: attr,
                attributeKr: ATTR_KR_LABEL[attr] || attr,
                totalDelta,
            });
            netDelta += totalDelta;
        }

        if (changes.length === 0) continue;

        // |totalDelta| 내림차순 정렬
        changes.sort((a, b) => Math.abs(b.totalDelta) - Math.abs(a.totalDelta));

        players.push({
            playerId: player.id,
            playerName: player.name,
            position: player.position,
            age: player.age,
            ovr: calculatePlayerOvr(player),
            changes,
            netDelta,
        });
    }

    // |netDelta| 내림차순
    players.sort((a, b) => Math.abs(b.netDelta) - Math.abs(a.netDelta));

    return {
        monthLabel,
        periodStart,
        periodEnd,
        teamId,
        teamName,
        players,
        hasAnyChanges: players.length > 0,
    };
}

export async function maybeSendScoutReport(
    teams: Team[],
    myTeamId: string,
    userId: string,
    closingDate: string,
    refreshUnreadCount?: () => void,
): Promise<void> {
    const myTeam = teams.find(t => t.id === myTeamId);
    if (!myTeam) return;

    const d = new Date(closingDate);
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-indexed

    const periodStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const periodEnd = closingDate;
    const monthLabel = `${year}년 ${month + 1}월`;

    const content = buildScoutReportContent(
        myTeam.roster, myTeam.id, myTeam.name,
        periodStart, periodEnd, monthLabel,
    );

    if (!content.hasAnyChanges) return;

    await sendMessage(
        userId, myTeamId, closingDate,
        'SCOUT_REPORT',
        `[스카우트 보고서] ${monthLabel}`,
        content,
    );
    refreshUnreadCount?.();
}
