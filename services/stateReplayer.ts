
import { Team, Game, Transaction, PlayerBoxScore } from '../types';
import { INITIAL_STATS } from '../utils/constants';
import { updateTeamTacticHistory } from '../utils/tacticUtils';

/**
 * Replays history to reconstruct the current game state.
 */
export const replayGameState = (
    baseTeams: Team[],
    baseSchedule: Game[],
    transactions: any[],
    gameResults: any[],
    savedSimDate: string | null
) => {
    const teams: Team[] = JSON.parse(JSON.stringify(baseTeams));
    let schedule: Game[] = JSON.parse(JSON.stringify(baseSchedule));
    
    const teamMap = new Map<string, Team>();
    teams.forEach(t => teamMap.set(t.id, t));

    const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    sortedTransactions.forEach((tx) => {
        if (tx.type === 'Trade' && tx.details) {
            applyTrade(teams, tx);
        } else if (tx.type === 'InjuryUpdate' && tx.details) {
            applyInjuryUpdate(teams, tx);
        }
    });

    const sortedResults = [...gameResults].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    sortedResults.forEach((res) => {
        const gameIdx = schedule.findIndex(g => g.id === res.game_id);
        if (gameIdx !== -1) {
            schedule[gameIdx].played = true;
            schedule[gameIdx].homeScore = res.home_score;
            schedule[gameIdx].awayScore = res.away_score;
        } else if (res.is_playoff) {
            schedule.push({
                id: res.game_id,
                homeTeamId: res.home_team_id,
                awayTeamId: res.away_team_id,
                date: res.date,
                homeScore: res.home_score,
                awayScore: res.away_score,
                played: true,
                isPlayoff: true,
                seriesId: res.series_id
            });
        }

        const homeTeam = teamMap.get(res.home_team_id);
        const awayTeam = teamMap.get(res.away_team_id);
        
        if (homeTeam && awayTeam) {
            const homeWon = res.home_score > res.away_score;
            if (homeWon) {
                homeTeam.wins++;
                awayTeam.losses++;
            } else {
                homeTeam.losses++;
                awayTeam.wins++;
            }

            if (res.tactics && res.box_score) {
                 homeTeam.tacticHistory = updateTeamTacticHistory(homeTeam, res.box_score.home, res.box_score.away, res.tactics.home || {}, homeWon);
                 awayTeam.tacticHistory = updateTeamTacticHistory(awayTeam, res.box_score.away, res.box_score.home, res.tactics.away || {}, !homeWon);
            }
        }

        if (res.box_score) {
            if (res.box_score.home) applyBoxScore(teamMap, res.home_team_id, res.box_score.home);
            if (res.box_score.away) applyBoxScore(teamMap, res.away_team_id, res.box_score.away);
        }
    });

    return {
        teams,
        schedule,
        currentSimDate: savedSimDate || '2025-10-20'
    };
};

function applyBoxScore(teamMap: Map<string, Team>, teamId: string, box: PlayerBoxScore[]) {
    const team = teamMap.get(teamId);
    if (!team) return;

    box.forEach(statLine => {
        const player = team.roster.find(p => p.id === statLine.playerId);
        if (player) {
            if (!player.stats) player.stats = INITIAL_STATS();
            player.stats.g += 1;
            player.stats.gs += (statLine.gs || 0);
            player.stats.mp += (statLine.mp || 0);
            player.stats.pts += (statLine.pts || 0);
            player.stats.reb += (statLine.reb || 0);
            player.stats.offReb += (statLine.offReb || 0);
            player.stats.defReb += (statLine.defReb || 0);
            player.stats.ast += (statLine.ast || 0);
            player.stats.stl += (statLine.stl || 0);
            player.stats.blk += (statLine.blk || 0);
            player.stats.tov += (statLine.tov || 0);
            player.stats.fgm += (statLine.fgm || 0);
            player.stats.fga += (statLine.fga || 0);
            player.stats.p3m += (statLine.p3m || 0);
            player.stats.p3a += (statLine.p3a || 0);
            player.stats.ftm += (statLine.ftm || 0);
            player.stats.fta += (statLine.fta || 0);
            player.stats.pf += (statLine.pf || 0);
            player.stats.plusMinus += (statLine.plusMinus || 0);

            // [Fix] Aggregate Zone Stats
            Object.keys(statLine).forEach(key => {
                if (key.startsWith('zone_') && typeof (statLine as any)[key] === 'number') {
                    player.stats[key] = (player.stats[key] || 0) + ((statLine as any)[key] || 0);
                }
            });
        }
    });
}

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
