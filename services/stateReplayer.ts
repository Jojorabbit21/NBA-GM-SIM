
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
            // Attach team-level aggregates to the schedule Game object
            // so that useLeaderboardData can use exact opponent stats
            const idx = schedule.findIndex(g => g.id === res.game_id);
            if (idx !== -1) {
                if (res.box_score.home) (schedule[idx] as any).homeStats = sumTeamBoxScore(res.box_score.home);
                if (res.box_score.away) (schedule[idx] as any).awayStats = sumTeamBoxScore(res.box_score.away);
            }

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

function sumTeamBoxScore(box: PlayerBoxScore[]) {
    return box.reduce((acc: Record<string, number>, s) => {
        acc.fgm    += (s.fgm    || 0);
        acc.fga    += (s.fga    || 0);
        acc.p3m    += (s.p3m    || 0);
        acc.p3a    += (s.p3a    || 0);
        acc.ftm    += (s.ftm    || 0);
        acc.fta    += (s.fta    || 0);
        acc.reb    += (s.reb    || 0);
        acc.offReb += (s.offReb || 0);
        acc.defReb += (s.defReb || 0);
        acc.ast    += (s.ast    || 0);
        acc.stl    += (s.stl    || 0);
        acc.blk    += (s.blk    || 0);
        acc.tov    += (s.tov    || 0);
        acc.pf     += (s.pf     || 0);
        acc.techFouls += (s.techFouls || 0);
        acc.flagrantFouls += (s.flagrantFouls || 0);
        // Zone stats (flat keys from statLine + nested zoneData)
        Object.keys(s).forEach(key => {
            if (key.startsWith('zone_') && typeof (s as any)[key] === 'number') {
                acc[key] = (acc[key] || 0) + ((s as any)[key] || 0);
            }
        });
        if (s.zoneData) {
            Object.keys(s.zoneData).forEach(key => {
                if (typeof (s.zoneData as any)[key] === 'number') {
                    acc[key] = (acc[key] || 0) + (s.zoneData as any)[key];
                }
            });
        }
        return acc;
    }, { fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, techFouls: 0, flagrantFouls: 0 });
}

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
            player.stats.techFouls += (statLine.techFouls || 0);
            player.stats.flagrantFouls += (statLine.flagrantFouls || 0);
            player.stats.plusMinus += (statLine.plusMinus || 0);

            // [Fix] Aggregate Zone Stats (Flat Legacy Keys)
            Object.keys(statLine).forEach(key => {
                if (key.startsWith('zone_') && typeof (statLine as any)[key] === 'number') {
                    player.stats[key] = (player.stats[key] || 0) + ((statLine as any)[key] || 0);
                }
            });

            // [Fix] Aggregate Zone Stats (Nested zoneData Object from New Engine)
            if (statLine.zoneData) {
                Object.keys(statLine.zoneData).forEach(key => {
                    const val = (statLine.zoneData as any)[key];
                    if (typeof val === 'number') {
                        player.stats[key] = (player.stats[key] || 0) + val;
                    }
                });
            }
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
