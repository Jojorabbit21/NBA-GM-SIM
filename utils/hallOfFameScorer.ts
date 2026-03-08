
import { Team, Player, Transaction, Game, PlayoffSeries } from '../types';
import { generateSeasonReport } from '../services/reportGenerator';
import { generatePlayoffReport } from '../services/reportGenerator';
import { computeStandingsStats } from './standingsStats';
import { calculatePlayerOvr } from './constants';

// --- Types ---
export interface HallOfFameScoreBreakdown {
    season_score: number;
    ptDiff_score: number;
    stat_score: number;
    playoff_score: number;
    details: {
        wins: number;
        losses: number;
        league_rank: number;
        conf_rank: number;
        pt_diff: number;
        playoff_tier: string;
        playoff_wins: number;
        playoff_losses: number;
    };
}

export interface RosterSnapshotPlayer {
    id: string;
    name: string;
    position: string;
    ovr: number;
    stats: { ppg: number; rpg: number; apg: number };
}

// --- Helpers ---
function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

export function maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    const masked = local.length > 1 ? local[0] + '***' : '***';
    return `${masked}@${domain}`;
}

// --- Roster Snapshot ---
export function createRosterSnapshot(team: Team): RosterSnapshotPlayer[] {
    return team.roster.map(p => {
        const g = p.stats.g || 1;
        return {
            id: p.id,
            name: p.name,
            position: p.position,
            ovr: calculatePlayerOvr(p),
            stats: {
                ppg: +(p.stats.pts / g).toFixed(1),
                rpg: +(p.stats.reb / g).toFixed(1),
                apg: +(p.stats.ast / g).toFixed(1),
            },
        };
    }).sort((a, b) => b.ovr - a.ovr);
}

// --- Score Calculation ---
export function calculateHallOfFameScore(
    team: Team,
    allTeams: Team[],
    transactions: Transaction[],
    schedule: Game[],
    playoffSeries: PlayoffSeries[]
): { totalScore: number; breakdown: HallOfFameScoreBreakdown } {
    // --- A. Regular Season Score (0~400) ---
    const seasonReport = generateSeasonReport(team, allTeams, transactions, schedule);
    const wins = team.wins;
    const losses = team.losses;
    const leagueRank = seasonReport.leagueRank;
    const confRank = seasonReport.confRank;

    const winsScore = (wins / 82) * 250;
    let leagueRankBonus = 0;
    if (leagueRank === 1) leagueRankBonus = 150;
    else if (leagueRank === 2) leagueRankBonus = 120;
    else if (leagueRank <= 5) leagueRankBonus = 90;
    else if (leagueRank <= 10) leagueRankBonus = 60;
    else if (leagueRank <= 15) leagueRankBonus = 30;

    const seasonScore = Math.round(winsScore + leagueRankBonus);

    // --- B. Point Differential Score (0~100) ---
    const standingsMap = computeStandingsStats(allTeams, schedule);
    const myStandings = standingsMap[team.id];
    const ptDiff = myStandings?.diff ?? 0;
    const cappedDiff = clamp(ptDiff, -10, 15);
    const ptDiffScore = Math.round(((cappedDiff + 10) / 25) * 100);

    // --- C. Team Stats Ranking Score (0~100) ---
    const leagueRanks = seasonReport.leagueRanks;
    const statWeights: { cat: keyof typeof leagueRanks; weight: number }[] = [
        { cat: 'pts',   weight: 0.25 },
        { cat: 'tsPct', weight: 0.25 },
        { cat: 'ast',   weight: 0.15 },
        { cat: 'reb',   weight: 0.15 },
        { cat: 'stl',   weight: 0.10 },
        { cat: 'blk',   weight: 0.10 },
    ];
    const rankToScore = (rank: number) => (30 - rank) / 29;
    const weightedRankScore = statWeights.reduce((sum, { cat, weight }) => sum + rankToScore(leagueRanks[cat].rank) * weight, 0);
    const statScore = Math.round(weightedRankScore * 100);

    // --- D. Playoff Score (0~400) ---
    const playoffReport = generatePlayoffReport(team, allTeams, playoffSeries, schedule);
    const playoffTier = playoffReport.status.title;
    const playoffWins = playoffReport.totalWins;
    const playoffLosses = playoffReport.totalLosses;

    let tierScore = 0;
    if (playoffTier === 'BPL CHAMPIONS') tierScore = 400;
    else if (playoffTier === 'BPL Finalist') tierScore = 320;
    else if (playoffTier === 'Conference Finalist') tierScore = 220;
    else if (playoffTier === 'Semi-Finalist') tierScore = 120;
    else if (playoffTier === 'Playoff Participant') tierScore = 50;
    else tierScore = 10; // Play-In 탈락 등

    const playoffScore = tierScore;

    // --- E. Total ---
    const totalScore = Math.round(seasonScore + ptDiffScore + statScore + playoffScore);

    return {
        totalScore,
        breakdown: {
            season_score: seasonScore,
            ptDiff_score: ptDiffScore,
            stat_score: statScore,
            playoff_score: playoffScore,
            details: {
                wins,
                losses,
                league_rank: leagueRank,
                conf_rank: confRank,
                pt_diff: +ptDiff.toFixed(1),
                playoff_tier: playoffTier,
                playoff_wins: playoffWins,
                playoff_losses: playoffLosses,
            },
        },
    };
}
