
import { Game } from '../types';

/** zone_rim_m, zone_rim_a 등 10개 zone × m/a = 20개 키 */
export type ZoneStatsMap = Record<string, number>;

export interface DefensiveStats {
    gamesPlayed: number;
    // 우리팀 (긍정적)
    teamStlPerGame: number;
    teamBlkPerGame: number;
    teamDrbPerGame: number;
    oppTovPerGame: number;       // 상대 턴오버 (우리가 유발)
    // 상대팀 허용 (부정적)
    oppPtsPerGame: number;
    oppFgPct: number;
    oppThreePct: number;
    // 우리팀 (부정적)
    teamPfPerGame: number;
    // 우리팀 슈팅 스탯
    teamFgmPerGame: number;
    teamFgaPerGame: number;
    teamP3mPerGame: number;
    teamP3aPerGame: number;
    teamFtmPerGame: number;
    teamFtaPerGame: number;
    teamTsPct: number;           // TS% = PTS / (2 * (FGA + 0.44 * FTA)) * 100
    // 상대팀 zone 슈팅 (우리 상대 경기에서만 누적)
    oppZoneStats: ZoneStatsMap;
}

interface TeamBoxStats {
    fgm: number; fga: number; p3m: number; p3a: number;
    ftm: number; fta: number; reb: number; offReb: number;
    defReb: number; ast: number; stl: number; blk: number;
    tov: number; pf: number;
    [key: string]: number; // zone_* 키 허용
}

export function computeDefensiveStats(schedule: Game[], userTeamId: string): DefensiveStats {
    const played = schedule.filter(g => g.played && (g.homeTeamId === userTeamId || g.awayTeamId === userTeamId));
    const n = played.length;

    if (n === 0) {
        return {
            gamesPlayed: 0,
            teamStlPerGame: 0, teamBlkPerGame: 0, teamDrbPerGame: 0, oppTovPerGame: 0,
            oppPtsPerGame: 0, oppFgPct: 0, oppThreePct: 0, teamPfPerGame: 0,
            teamFgmPerGame: 0, teamFgaPerGame: 0, teamP3mPerGame: 0, teamP3aPerGame: 0,
            teamFtmPerGame: 0, teamFtaPerGame: 0, teamTsPct: 0,
            oppZoneStats: {},
        };
    }

    let teamStl = 0, teamBlk = 0, teamDrb = 0, teamPf = 0;
    let teamFgm = 0, teamFga = 0, teamP3m = 0, teamP3a = 0, teamFtm = 0, teamFta = 0, teamPts = 0;
    let oppPts = 0, oppFgm = 0, oppFga = 0, opp3m = 0, opp3a = 0, oppTov = 0;
    const oppZoneStats: ZoneStatsMap = {};

    for (const g of played) {
        const isHome = g.homeTeamId === userTeamId;
        const myStats: TeamBoxStats | undefined = isHome ? (g as any).homeStats : (g as any).awayStats;
        const oppStats: TeamBoxStats | undefined = isHome ? (g as any).awayStats : (g as any).homeStats;
        const oppScore = isHome ? g.awayScore : g.homeScore;

        if (myStats) {
            teamStl += myStats.stl;
            teamBlk += myStats.blk;
            teamDrb += myStats.defReb;
            teamPf += myStats.pf;
            teamFgm += myStats.fgm;
            teamFga += myStats.fga;
            teamP3m += myStats.p3m;
            teamP3a += myStats.p3a;
            teamFtm += myStats.ftm;
            teamFta += myStats.fta;
        }

        const myScore = isHome ? g.homeScore : g.awayScore;
        if (myScore != null) {
            teamPts += myScore;
        }

        if (oppStats) {
            oppFgm += oppStats.fgm;
            oppFga += oppStats.fga;
            opp3m += oppStats.p3m;
            opp3a += oppStats.p3a;
            oppTov += oppStats.tov;
            // 상대 zone 슈팅 누적
            Object.keys(oppStats).forEach(key => {
                if (key.startsWith('zone_') && typeof oppStats[key] === 'number') {
                    oppZoneStats[key] = (oppZoneStats[key] || 0) + oppStats[key];
                }
            });
        }

        if (oppScore != null) {
            oppPts += oppScore;
        }
    }

    const tsa = teamFga + 0.44 * teamFta; // True Shooting Attempts
    return {
        gamesPlayed: n,
        teamStlPerGame: teamStl / n,
        teamBlkPerGame: teamBlk / n,
        teamDrbPerGame: teamDrb / n,
        oppTovPerGame: oppTov / n,
        oppPtsPerGame: oppPts / n,
        oppFgPct: oppFga > 0 ? (oppFgm / oppFga) * 100 : 0,
        oppThreePct: opp3a > 0 ? (opp3m / opp3a) * 100 : 0,
        teamPfPerGame: teamPf / n,
        teamFgmPerGame: teamFgm / n,
        teamFgaPerGame: teamFga / n,
        teamP3mPerGame: teamP3m / n,
        teamP3aPerGame: teamP3a / n,
        teamFtmPerGame: teamFtm / n,
        teamFtaPerGame: teamFta / n,
        teamTsPct: tsa > 0 ? (teamPts / (2 * tsa)) * 100 : 0,
        oppZoneStats,
    };
}
