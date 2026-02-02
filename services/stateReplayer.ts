
import { Team, Game, Transaction, PlayerBoxScore } from '../types';
import { INITIAL_STATS } from '../utils/constants';

/**
 * Replays history to reconstruct the current game state.
 * This function is PURE. It does not depend on React or Supabase.
 */
export const replayGameState = (
    baseTeams: Team[],
    baseSchedule: Game[],
    transactions: any[],
    gameResults: any[],
    savedSimDate: string | null
) => {
    // 1. Deep Copy Base Data
    const teams: Team[] = JSON.parse(JSON.stringify(baseTeams));
    let schedule: Game[] = JSON.parse(JSON.stringify(baseSchedule));
    
    // Determine the latest date from history or save
    let calculatedDate = savedSimDate || '2025-10-20';

    // 2. Replay Transactions (Trades)
    transactions.forEach((tx) => {
        if (tx.type === 'Trade' && tx.details) {
            applyTrade(teams, tx);
        }
        // Update date if transaction is newer
        if (tx.date > calculatedDate) calculatedDate = tx.date;
    });

    // 3. Replay Game Results
    // Create Map for O(1) Lookup
    const teamMap = new Map<string, Team>();
    teams.forEach(t => teamMap.set(t.id, t));

    gameResults.forEach((res) => {
        // A. Update Schedule Status
        const gameIdx = schedule.findIndex(g => g.id === res.game_id);
        if (gameIdx !== -1) {
            schedule[gameIdx].played = true;
            schedule[gameIdx].homeScore = res.home_score;
            schedule[gameIdx].awayScore = res.away_score;
        } else if (res.is_playoff) {
            // Dynamically add playoff games if not in base schedule
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

        // B. Update Standings (Wins/Losses)
        const homeTeam = teamMap.get(res.home_team_id);
        const awayTeam = teamMap.get(res.away_team_id);
        
        if (homeTeam && awayTeam) {
            if (res.home_score > res.away_score) {
                homeTeam.wins++;
                awayTeam.losses++;
            } else {
                homeTeam.losses++;
                awayTeam.wins++;
            }
        }

        // C. Aggregate Player Stats
        if (res.box_score) {
            if (res.box_score.home) applyBoxScore(teamMap, res.home_team_id, res.box_score.home);
            if (res.box_score.away) applyBoxScore(teamMap, res.away_team_id, res.box_score.away);
        }

        // Update Date
        if (res.date > calculatedDate) calculatedDate = res.date;
    });

    return {
        teams,
        schedule,
        currentSimDate: calculatedDate
    };
};

// --- Helper Functions ---

function applyTrade(teams: Team[], tx: any) {
    const { acquired, traded, partnerTeamId } = tx.details;
    const myTeamIdx = teams.findIndex(t => t.id === tx.team_id);
    const partnerIdx = teams.findIndex(t => t.id === partnerTeamId);

    if (myTeamIdx !== -1 && partnerIdx !== -1) {
        // Move Traded Players (My -> Partner)
        traded.forEach((p: any) => {
            const pIndex = teams[myTeamIdx].roster.findIndex(rp => rp.id === p.id);
            if (pIndex !== -1) {
                const [playerObj] = teams[myTeamIdx].roster.splice(pIndex, 1);
                teams[partnerIdx].roster.push(playerObj);
            }
        });
        // Move Acquired Players (Partner -> My)
        acquired.forEach((p: any) => {
            const pIndex = teams[partnerIdx].roster.findIndex(rp => rp.id === p.id);
            if (pIndex !== -1) {
                const [playerObj] = teams[partnerIdx].roster.splice(pIndex, 1);
                teams[myTeamIdx].roster.push(playerObj);
            }
        });
    }
}

function applyBoxScore(teamMap: Map<string, Team>, teamId: string, box: PlayerBoxScore[]) {
    const team = teamMap.get(teamId);
    if (!team) return;

    box.forEach(statLine => {
        const player = team.roster.find(p => p.id === statLine.playerId);
        if (player) {
            if (!player.stats) player.stats = INITIAL_STATS();
            
            // Stats Accumulation
            player.stats.g += 1;
            player.stats.gs += statLine.gs || 0;
            player.stats.mp += statLine.mp || 0;
            player.stats.pts += statLine.pts || 0;
            player.stats.reb += statLine.reb || 0;
            player.stats.offReb += statLine.offReb || 0;
            player.stats.defReb += statLine.defReb || 0;
            player.stats.ast += statLine.ast || 0;
            player.stats.stl += statLine.stl || 0;
            player.stats.blk += statLine.blk || 0;
            player.stats.tov += statLine.tov || 0;
            player.stats.fgm += statLine.fgm || 0;
            player.stats.fga += statLine.fga || 0;
            player.stats.p3m += statLine.p3m || 0;
            player.stats.p3a += statLine.p3a || 0;
            player.stats.ftm += statLine.ftm || 0;
            player.stats.fta += statLine.fta || 0;

            // [FIX] Add Missing Detailed Shooting Stats & Fouls
            player.stats.rimM += statLine.rimM || 0;
            player.stats.rimA += statLine.rimA || 0;
            player.stats.midM += statLine.midM || 0;
            player.stats.midA += statLine.midA || 0;
            player.stats.pf += statLine.pf || 0;
        }
    });
}
