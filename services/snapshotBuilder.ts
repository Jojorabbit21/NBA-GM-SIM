
import { Team, Game, ReplaySnapshot, PlayerStats } from '../types';
import { reapplyAttrDeltas } from './playerDevelopment/playerAging';

export const CURRENT_SNAPSHOT_VERSION = 4;

/**
 * Build a replay snapshot from the current in-memory state.
 * Called after game results are applied so teams already have accumulated stats.
 */
export const buildReplaySnapshot = (
    teams: Team[],
    schedule: Game[],
    counts: { games: number; playoffs: number; transactions: number }
): ReplaySnapshot => {
    // teams_data: per-team wins/losses, tacticHistory, per-player stats
    const teams_data: ReplaySnapshot['teams_data'] = {};
    for (const team of teams) {
        const roster_stats: Record<string, { stats?: PlayerStats; playoffStats?: PlayerStats; growthState?: any }> = {};
        for (const player of team.roster) {
            const hasStats = player.stats || player.playoffStats;
            const hasGrowth = player.fractionalGrowth && Object.keys(player.fractionalGrowth).length > 0;
            const hasAttrDeltas = player.attrDeltas && Object.keys(player.attrDeltas).length > 0;
            const hasChangeLog = player.changeLog && player.changeLog.length > 0;
            const hasSeasonStart = player.seasonStartAttributes && Object.keys(player.seasonStartAttributes).length > 0;
            const hasInjuryHistory = player.injuryHistory && player.injuryHistory.length > 0;
            const hasAwards = player.awards && player.awards.length > 0;
            const hasContract = !!player.contract;
            const hasArchetypeState = !!player.archetypeState;
            const hasAnyGrowthData = hasGrowth || hasAttrDeltas || hasChangeLog || hasSeasonStart;

            if (hasStats || hasAnyGrowthData || hasInjuryHistory || hasAwards || hasContract || hasArchetypeState) {
                const entry: any = {};
                if (player.stats) entry.stats = player.stats;
                if (player.playoffStats) entry.playoffStats = player.playoffStats;
                if (hasAnyGrowthData) {
                    entry.growthState = {
                        ...(hasGrowth && { fractionalGrowth: player.fractionalGrowth }),
                        ...(hasAttrDeltas && { attrDeltas: player.attrDeltas }),
                        ...(hasChangeLog && { changeLog: player.changeLog }),
                        ...(hasSeasonStart && { seasonStartAttributes: player.seasonStartAttributes }),
                    };
                }
                if (hasInjuryHistory) entry.injuryHistory = player.injuryHistory;
                if (hasAwards) entry.awards = player.awards;
                if (hasContract) entry.contract = player.contract;
                if (hasArchetypeState) entry.archetypeState = player.archetypeState;
                roster_stats[player.id] = entry;
            }
        }
        teams_data[team.id] = {
            wins: team.wins,
            losses: team.losses,
            tacticHistory: team.tacticHistory,
            roster_stats,
        };
    }

    // schedule_results: played games with scores + team aggregates
    const schedule_results: ReplaySnapshot['schedule_results'] = {};
    const playoff_schedule: ReplaySnapshot['playoff_schedule'] = [];

    const pending_playoff_games: ReplaySnapshot['pending_playoff_games'] = [];

    for (const game of schedule) {
        // 미진행 플레이오프 경기 저장 (날짜 보존)
        if (game.isPlayoff && !game.played) {
            pending_playoff_games!.push({
                id: game.id,
                homeTeamId: game.homeTeamId,
                awayTeamId: game.awayTeamId,
                date: game.date,
                seriesId: game.seriesId,
            });
            continue;
        }

        if (!game.played) continue;

        if (game.isPlayoff) {
            playoff_schedule.push({
                id: game.id,
                homeTeamId: game.homeTeamId,
                awayTeamId: game.awayTeamId,
                date: game.date,
                homeScore: game.homeScore!,
                awayScore: game.awayScore!,
                seriesId: game.seriesId,
            });
        }

        const entry: ReplaySnapshot['schedule_results'][string] = {
            homeScore: game.homeScore!,
            awayScore: game.awayScore!,
        };
        if ((game as any).homeStats) entry.homeStats = (game as any).homeStats;
        if ((game as any).awayStats) entry.awayStats = (game as any).awayStats;
        schedule_results[game.id] = entry;
    }

    return {
        version: CURRENT_SNAPSHOT_VERSION,
        game_count: counts.games,
        playoff_game_count: counts.playoffs,
        transaction_count: counts.transactions,
        teams_data,
        schedule_results,
        playoff_schedule,
        pending_playoff_games,
    };
};

/**
 * Hydrate game state from a snapshot instead of replaying all game results.
 * Transactions are still applied for roster composition (trades/injuries).
 */
export const hydrateFromSnapshot = (
    baseTeams: Team[],
    baseSchedule: Game[],
    snapshot: ReplaySnapshot,
    transactions: any[]
): { teams: Team[]; schedule: Game[] } => {
    const teams: Team[] = JSON.parse(JSON.stringify(baseTeams));
    let schedule: Game[] = JSON.parse(JSON.stringify(baseSchedule));

    // 1. Apply transactions (trades/injuries) for roster composition
    const sortedTransactions = [...transactions].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    sortedTransactions.forEach((tx) => {
        if (tx.type === 'Trade' && tx.details) {
            applyTrade(teams, tx);
        } else if (tx.type === 'InjuryUpdate' && tx.details) {
            applyInjuryUpdate(teams, tx);
        }
    });

    // 2. Apply team-level data from snapshot
    const teamMap = new Map<string, Team>();
    teams.forEach(t => teamMap.set(t.id, t));

    for (const [teamId, data] of Object.entries(snapshot.teams_data)) {
        const team = teamMap.get(teamId);
        if (!team) continue;

        team.wins = data.wins;
        team.losses = data.losses;
        if (data.tacticHistory) team.tacticHistory = data.tacticHistory;

        // Apply per-player stats + growth state
        for (const [playerId, pData] of Object.entries(data.roster_stats)) {
            const player = team.roster.find(p => p.id === playerId);
            if (!player) continue;
            if (pData.stats) player.stats = pData.stats;
            if (pData.playoffStats) player.playoffStats = pData.playoffStats;
            if ((pData as any).growthState) {
                const gs = (pData as any).growthState;
                if (gs.fractionalGrowth) player.fractionalGrowth = gs.fractionalGrowth;
                if (gs.attrDeltas) player.attrDeltas = gs.attrDeltas;
                if (gs.changeLog) player.changeLog = gs.changeLog;
                if (gs.seasonStartAttributes) player.seasonStartAttributes = gs.seasonStartAttributes;
                if (gs.attrDeltas) reapplyAttrDeltas(player);
            }
            if ((pData as any).injuryHistory) player.injuryHistory = (pData as any).injuryHistory;
            if ((pData as any).awards) player.awards = (pData as any).awards;
            if ((pData as any).archetypeState) player.archetypeState = (pData as any).archetypeState;
            if ((pData as any).contract) {
                player.contract = (pData as any).contract;
                player.salary = player.contract!.years[player.contract!.currentYear];
                player.contractYears = player.contract!.years.length - player.contract!.currentYear;
            }
        }
    }

    // 3. Apply schedule results
    for (const [gameId, result] of Object.entries(snapshot.schedule_results)) {
        const idx = schedule.findIndex(g => g.id === gameId);
        if (idx !== -1) {
            schedule[idx].played = true;
            schedule[idx].homeScore = result.homeScore;
            schedule[idx].awayScore = result.awayScore;
            if (result.homeStats) (schedule[idx] as any).homeStats = result.homeStats;
            if (result.awayStats) (schedule[idx] as any).awayStats = result.awayStats;
        }
    }

    // 4. Append played playoff games to schedule
    for (const pg of snapshot.playoff_schedule) {
        if (!schedule.some(g => g.id === pg.id)) {
            schedule.push({
                id: pg.id,
                homeTeamId: pg.homeTeamId,
                awayTeamId: pg.awayTeamId,
                date: pg.date,
                homeScore: pg.homeScore,
                awayScore: pg.awayScore,
                played: true,
                isPlayoff: true,
                seriesId: pg.seriesId,
            });
        }
    }

    // 5. Append pending (unplayed) playoff games — 원래 날짜 그대로 복원
    if (snapshot.pending_playoff_games) {
        for (const pg of snapshot.pending_playoff_games) {
            if (!schedule.some(g => g.id === pg.id)) {
                schedule.push({
                    id: pg.id,
                    homeTeamId: pg.homeTeamId,
                    awayTeamId: pg.awayTeamId,
                    date: pg.date,
                    played: false,
                    isPlayoff: true,
                    seriesId: pg.seriesId,
                });
            }
        }
    }

    return { teams, schedule };
};

// --- Helpers (mirrored from stateReplayer.ts) ---

function applyTrade(teams: Team[], tx: any) {
    const { acquired, traded, partnerTeamId } = tx.details;
    const myTeamIdx = teams.findIndex(t => t.id === tx.team_id);
    const partnerIdx = teams.findIndex(t => t.id === partnerTeamId);

    if (myTeamIdx !== -1 && partnerIdx !== -1) {
        traded.forEach((p: any) => {
            const pIndex = teams[myTeamIdx].roster.findIndex(rp => rp.id === p.id);
            if (pIndex !== -1) {
                const [playerObj] = teams[myTeamIdx].roster.splice(pIndex, 1);
                teams[partnerIdx].roster.push(playerObj);
            }
        });
        acquired.forEach((p: any) => {
            const pIndex = teams[partnerIdx].roster.findIndex(rp => rp.id === p.id);
            if (pIndex !== -1) {
                const [playerObj] = teams[partnerIdx].roster.splice(pIndex, 1);
                teams[myTeamIdx].roster.push(playerObj);
            }
        });
    }
}

function applyInjuryUpdate(teams: Team[], tx: any) {
    const { playerId, health, injuryType, returnDate } = tx.details;
    for (const team of teams) {
        const player = team.roster.find(p => p.id === playerId);
        if (player) {
            player.health = health;
            if (health === 'Injured' || health === 'Day-to-Day') {
                player.injuryType = injuryType;
                player.returnDate = returnDate;
            } else {
                player.injuryType = undefined;
                player.returnDate = undefined;
            }
            return;
        }
    }
}
