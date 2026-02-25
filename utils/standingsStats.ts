
import { Team, Game } from '../types';

export interface StandingsRecord {
    teamId: string;
    wins: number;
    losses: number;
    pct: number;
    home: { w: number; l: number };
    away: { w: number; l: number };
    div: { w: number; l: number };
    conf: { w: number; l: number };
    ppg: number;
    oppg: number;
    diff: number;
    streak: string;   // "W3", "L2", etc.
    l10: { w: number; l: number };
}

/**
 * Compute extended standings stats for all teams from schedule data.
 * Returns a map of teamId → StandingsRecord.
 */
export function computeStandingsStats(
    teams: Team[],
    schedule: Game[]
): Record<string, StandingsRecord> {
    const teamMap = new Map(teams.map(t => [t.id, t]));
    const result: Record<string, StandingsRecord> = {};

    // Initialize
    for (const t of teams) {
        result[t.id] = {
            teamId: t.id,
            wins: t.wins,
            losses: t.losses,
            pct: (t.wins + t.losses) > 0 ? t.wins / (t.wins + t.losses) : 0,
            home: { w: 0, l: 0 },
            away: { w: 0, l: 0 },
            div: { w: 0, l: 0 },
            conf: { w: 0, l: 0 },
            ppg: 0,
            oppg: 0,
            diff: 0,
            streak: '-',
            l10: { w: 0, l: 0 },
        };
    }

    // Per-team game lists for streak/L10
    const teamGames: Record<string, { date: string; won: boolean; pts: number; opp: number }[]> = {};
    for (const t of teams) teamGames[t.id] = [];

    // Process played regular-season games
    const playedGames = schedule.filter(g => g.played && !g.isPlayoff);

    for (const g of playedGames) {
        const homeTeam = teamMap.get(g.homeTeamId);
        const awayTeam = teamMap.get(g.awayTeamId);
        if (!homeTeam || !awayTeam) continue;

        const hs = g.homeScore ?? 0;
        const as = g.awayScore ?? 0;
        const homeWon = hs > as;

        const homeRec = result[g.homeTeamId];
        const awayRec = result[g.awayTeamId];
        if (!homeRec || !awayRec) continue;

        // HOME / AWAY
        if (homeWon) {
            homeRec.home.w++;
            awayRec.away.l++;
        } else {
            homeRec.home.l++;
            awayRec.away.w++;
        }

        // DIV
        if (homeTeam.division === awayTeam.division) {
            if (homeWon) { homeRec.div.w++; awayRec.div.l++; }
            else { homeRec.div.l++; awayRec.div.w++; }
        }

        // CONF
        if (homeTeam.conference === awayTeam.conference) {
            if (homeWon) { homeRec.conf.w++; awayRec.conf.l++; }
            else { homeRec.conf.l++; awayRec.conf.w++; }
        }

        // Game log for streak & L10
        teamGames[g.homeTeamId].push({ date: g.date, won: homeWon, pts: hs, opp: as });
        teamGames[g.awayTeamId].push({ date: g.date, won: !homeWon, pts: as, opp: hs });
    }

    // Compute PPG, OPPG, DIFF, Streak, L10
    for (const t of teams) {
        const games = teamGames[t.id];
        if (games.length === 0) continue;

        const totalPts = games.reduce((s, g) => s + g.pts, 0);
        const totalOpp = games.reduce((s, g) => s + g.opp, 0);
        const rec = result[t.id];

        rec.ppg = totalPts / games.length;
        rec.oppg = totalOpp / games.length;
        rec.diff = rec.ppg - rec.oppg;

        // Sort by date descending for streak & L10
        games.sort((a, b) => b.date.localeCompare(a.date));

        // Streak
        let streakCount = 1;
        const streakType = games[0].won ? 'W' : 'L';
        for (let i = 1; i < games.length; i++) {
            if (games[i].won === games[0].won) streakCount++;
            else break;
        }
        rec.streak = `${streakType}${streakCount}`;

        // L10
        const last10 = games.slice(0, 10);
        rec.l10 = {
            w: last10.filter(g => g.won).length,
            l: last10.filter(g => !g.won).length,
        };
    }

    return result;
}
