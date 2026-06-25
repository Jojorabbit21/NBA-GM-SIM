
import { TEAM_DATA, TeamStaticData } from './teamData.ts';

interface Game {
    id: string;
    homeTeamId: string;
    awayTeamId: string;
    date: string;
    time?: string;
    game_seq?: number;
    homeScore?: number;
    awayScore?: number;
    played: boolean;
    isPlayoff?: boolean;
    seriesId?: string;
}

export interface ScheduleConfig {
    seasonYear: number;
    seasonStart: string;
    regularSeasonEnd: string;
    allStarStart: string;
    allStarEnd: string;
    seed?: number;
}

interface Matchup {
    homeTeamId: string;
    awayTeamId: string;
}

function createRng(seed: number): () => number {
    let s = seed | 0;
    return () => {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function seededShuffle<T>(arr: T[], rng: () => number): void {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

function toDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return toDateStr(d);
}

function buildCalendar(config: ScheduleConfig): string[] {
    const dates: string[] = [];
    const start = new Date(config.seasonStart + 'T12:00:00');
    const end = new Date(config.regularSeasonEnd + 'T12:00:00');
    const asStart = new Date(config.allStarStart + 'T12:00:00');
    const asEnd = new Date(config.allStarEnd + 'T12:00:00');

    const cur = new Date(start);
    while (cur <= end) {
        if (cur < asStart || cur > asEnd) {
            dates.push(toDateStr(cur));
        }
        cur.setDate(cur.getDate() + 1);
    }
    return dates;
}

interface TeamGroups {
    teamIds: string[];
    conferences: Record<string, string[]>;
    divisions: Record<string, string[]>;
    teamConference: Record<string, string>;
    teamDivision: Record<string, string>;
}

function buildTeamGroups(teamData: Record<string, TeamStaticData>): TeamGroups {
    const teamIds = Object.keys(teamData).sort();
    const conferences: Record<string, string[]> = { East: [], West: [] };
    const divisions: Record<string, string[]> = {};
    const teamConference: Record<string, string> = {};
    const teamDivision: Record<string, string> = {};

    for (const team of Object.values(teamData)) {
        conferences[team.conference].push(team.id);
        if (!divisions[team.division]) divisions[team.division] = [];
        divisions[team.division].push(team.id);
        teamConference[team.id] = team.conference;
        teamDivision[team.id] = team.division;
    }

    return { teamIds, conferences, divisions, teamConference, teamDivision };
}

function generateMatchups(groups: TeamGroups, rng: () => number): Matchup[] {
    const matchups: Matchup[] = [];
    const { conferences, divisions, teamDivision } = groups;

    for (const divTeams of Object.values(divisions)) {
        for (let i = 0; i < divTeams.length; i++) {
            for (let j = i + 1; j < divTeams.length; j++) {
                matchups.push({ homeTeamId: divTeams[i], awayTeamId: divTeams[j] });
                matchups.push({ homeTeamId: divTeams[i], awayTeamId: divTeams[j] });
                matchups.push({ homeTeamId: divTeams[j], awayTeamId: divTeams[i] });
                matchups.push({ homeTeamId: divTeams[j], awayTeamId: divTeams[i] });
            }
        }
    }

    for (const conf of ['East', 'West']) {
        const confTeams = conferences[conf];
        const confDivisions = [...new Set(confTeams.map((t: string) => teamDivision[t]))];

        const crossDivPairs: [string, string][] = [];
        for (let di = 0; di < confDivisions.length; di++) {
            for (let dj = di + 1; dj < confDivisions.length; dj++) {
                const dTeamsI = divisions[confDivisions[di]];
                const dTeamsJ = divisions[confDivisions[dj]];
                for (const ti of dTeamsI) {
                    for (const tj of dTeamsJ) {
                        crossDivPairs.push([ti, tj]);
                    }
                }
            }
        }

        const pairGameCount: Map<string, 4 | 3> = new Map();

        for (let di = 0; di < confDivisions.length; di++) {
            for (let dj = di + 1; dj < confDivisions.length; dj++) {
                const dTeamsI = divisions[confDivisions[di]];
                const dTeamsJ = divisions[confDivisions[dj]];

                const baseOffset = Math.floor(rng() * 5);
                const groupAPairs = new Set<string>();

                for (let perm = 0; perm < 3; perm++) {
                    for (let k = 0; k < 5; k++) {
                        const jIdx = (k + baseOffset + perm) % 5;
                        const ti = dTeamsI[k];
                        const tj = dTeamsJ[jIdx];
                        const key = ti < tj ? `${ti}-${tj}` : `${tj}-${ti}`;
                        groupAPairs.add(key);
                    }
                }

                for (const ti of dTeamsI) {
                    for (const tj of dTeamsJ) {
                        const key = ti < tj ? `${ti}-${tj}` : `${tj}-${ti}`;
                        pairGameCount.set(key, groupAPairs.has(key) ? 4 : 3);
                    }
                }
            }
        }

        for (const [ti, tj] of crossDivPairs) {
            const key = ti < tj ? `${ti}-${tj}` : `${tj}-${ti}`;
            const count = pairGameCount.get(key)!;

            if (count === 4) {
                matchups.push({ homeTeamId: ti, awayTeamId: tj });
                matchups.push({ homeTeamId: ti, awayTeamId: tj });
                matchups.push({ homeTeamId: tj, awayTeamId: ti });
                matchups.push({ homeTeamId: tj, awayTeamId: ti });
            } else {
                if (rng() < 0.5) {
                    matchups.push({ homeTeamId: ti, awayTeamId: tj });
                    matchups.push({ homeTeamId: ti, awayTeamId: tj });
                    matchups.push({ homeTeamId: tj, awayTeamId: ti });
                } else {
                    matchups.push({ homeTeamId: ti, awayTeamId: tj });
                    matchups.push({ homeTeamId: tj, awayTeamId: ti });
                    matchups.push({ homeTeamId: tj, awayTeamId: ti });
                }
            }
        }
    }

    const eastTeams = conferences['East'];
    const westTeams = conferences['West'];
    for (const e of eastTeams) {
        for (const w of westTeams) {
            matchups.push({ homeTeamId: e, awayTeamId: w });
            matchups.push({ homeTeamId: w, awayTeamId: e });
        }
    }

    return matchups;
}

function balanceHomeAway(matchups: Matchup[], teamIds: string[], rng: () => number): void {
    const homeCount: Record<string, number> = {};
    const awayCount: Record<string, number> = {};
    for (const t of teamIds) {
        homeCount[t] = 0;
        awayCount[t] = 0;
    }
    for (const m of matchups) {
        homeCount[m.homeTeamId]++;
        awayCount[m.awayTeamId]++;
    }

    for (let pass = 0; pass < 50; pass++) {
        let balanced = true;
        for (const t of teamIds) {
            if (homeCount[t] !== 41) { balanced = false; break; }
        }
        if (balanced) break;

        for (let i = 0; i < matchups.length; i++) {
            const m = matchups[i];
            const h = m.homeTeamId;
            const a = m.awayTeamId;
            if (homeCount[h] > 41 && homeCount[a] < 41) {
                matchups[i] = { homeTeamId: a, awayTeamId: h };
                homeCount[h]--;
                awayCount[a]--;
                homeCount[a]++;
                awayCount[h]++;
            }
        }
    }
}

function assignDates(
    matchups: Matchup[],
    calendar: string[],
    teamIds: string[],
    rng: () => number
): { date: string; matchup: Matchup }[] {
    const totalGames = matchups.length;

    const teamDates: Record<string, Set<string>> = {};
    const teamB2BCount: Record<string, number> = {};
    for (const t of teamIds) {
        teamDates[t] = new Set();
        teamB2BCount[t] = 0;
    }

    const dayCache: Record<string, { prev: string; prev2: string; next: string; next2: string }> = {};
    for (const d of calendar) {
        dayCache[d] = {
            prev: addDays(d, -1),
            prev2: addDays(d, -2),
            next: addDays(d, 1),
            next2: addDays(d, 2),
        };
    }

    function isAvailable(teamId: string, dateStr: string): boolean {
        return !teamDates[teamId].has(dateStr);
    }

    function wouldCause3in3(teamId: string, dateStr: string): boolean {
        const dc = dayCache[dateStr];
        const td = teamDates[teamId];
        if (td.has(dc.prev) && td.has(dc.prev2)) return true;
        if (td.has(dc.prev) && td.has(dc.next)) return true;
        if (td.has(dc.next) && td.has(dc.next2)) return true;
        return false;
    }

    function playedYesterday(teamId: string, dateStr: string): boolean {
        return teamDates[teamId].has(dayCache[dateStr].prev);
    }

    const poolIndices = matchups.map((_, i) => i);
    seededShuffle(poolIndices, rng);
    const inPool = new Array(matchups.length).fill(true);
    let poolSize = matchups.length;

    const scheduled: { date: string; matchup: Matchup }[] = [];
    const B2B_BUDGET = 15;

    for (let di = 0; di < calendar.length; di++) {
        const dateStr = calendar[di];
        const remaining = totalGames - scheduled.length;
        const remainingDays = calendar.length - di;
        const target = Math.round(remaining / remainingDays);
        const maxForDay = Math.min(15, target + 2);
        let scheduledToday = 0;

        const nonB2BTarget = Math.max(1, target - 1);
        for (let pi = 0; pi < poolIndices.length && scheduledToday < nonB2BTarget; pi++) {
            const mi = poolIndices[pi];
            if (!inPool[mi]) continue;
            const { homeTeamId, awayTeamId } = matchups[mi];
            if (!isAvailable(homeTeamId, dateStr)) continue;
            if (!isAvailable(awayTeamId, dateStr)) continue;
            if (wouldCause3in3(homeTeamId, dateStr)) continue;
            if (wouldCause3in3(awayTeamId, dateStr)) continue;
            if (playedYesterday(homeTeamId, dateStr)) continue;
            if (playedYesterday(awayTeamId, dateStr)) continue;
            teamDates[homeTeamId].add(dateStr);
            teamDates[awayTeamId].add(dateStr);
            scheduled.push({ date: dateStr, matchup: matchups[mi] });
            inPool[mi] = false;
            poolSize--;
            scheduledToday++;
        }

        for (let pi = 0; pi < poolIndices.length && scheduledToday < maxForDay; pi++) {
            const mi = poolIndices[pi];
            if (!inPool[mi]) continue;
            const { homeTeamId, awayTeamId } = matchups[mi];
            if (!isAvailable(homeTeamId, dateStr)) continue;
            if (!isAvailable(awayTeamId, dateStr)) continue;
            if (wouldCause3in3(homeTeamId, dateStr)) continue;
            if (wouldCause3in3(awayTeamId, dateStr)) continue;
            const hB2B = playedYesterday(homeTeamId, dateStr);
            const aB2B = playedYesterday(awayTeamId, dateStr);
            if (!hB2B && !aB2B) {
                teamDates[homeTeamId].add(dateStr);
                teamDates[awayTeamId].add(dateStr);
                scheduled.push({ date: dateStr, matchup: matchups[mi] });
                inPool[mi] = false;
                poolSize--;
                scheduledToday++;
                continue;
            }
            if (hB2B && aB2B) continue;
            if (hB2B && teamB2BCount[homeTeamId] >= B2B_BUDGET) continue;
            if (aB2B && teamB2BCount[awayTeamId] >= B2B_BUDGET) continue;
            teamDates[homeTeamId].add(dateStr);
            teamDates[awayTeamId].add(dateStr);
            if (hB2B) teamB2BCount[homeTeamId]++;
            if (aB2B) teamB2BCount[awayTeamId]++;
            scheduled.push({ date: dateStr, matchup: matchups[mi] });
            inPool[mi] = false;
            poolSize--;
            scheduledToday++;
        }
    }

    if (poolSize > 0) {
        for (let pi = 0; pi < poolIndices.length; pi++) {
            const mi = poolIndices[pi];
            if (!inPool[mi]) continue;
            const { homeTeamId, awayTeamId } = matchups[mi];
            for (const dateStr of calendar) {
                if (!isAvailable(homeTeamId, dateStr)) continue;
                if (!isAvailable(awayTeamId, dateStr)) continue;
                if (wouldCause3in3(homeTeamId, dateStr)) continue;
                if (wouldCause3in3(awayTeamId, dateStr)) continue;
                teamDates[homeTeamId].add(dateStr);
                teamDates[awayTeamId].add(dateStr);
                scheduled.push({ date: dateStr, matchup: matchups[mi] });
                inPool[mi] = false;
                poolSize--;
                break;
            }
        }
    }

    return scheduled;
}

function balanceBackToBacks(
    scheduled: { date: string; matchup: Matchup }[],
    calendar: string[],
    teamIds: string[]
): void {
    const MAX_B2B = 16;
    const dateSet = new Set(calendar);

    function recalcB2B(): Record<string, number> {
        const teamDates: Record<string, string[]> = {};
        for (const t of teamIds) teamDates[t] = [];
        for (const s of scheduled) {
            teamDates[s.matchup.homeTeamId].push(s.date);
            teamDates[s.matchup.awayTeamId].push(s.date);
        }
        const b2b: Record<string, number> = {};
        for (const t of teamIds) {
            const dates = teamDates[t].sort();
            let count = 0;
            for (let i = 1; i < dates.length; i++) {
                if (addDays(dates[i - 1], 1) === dates[i]) count++;
            }
            b2b[t] = count;
        }
        return b2b;
    }

    function buildDateTeamMap(): Record<string, Set<string>> {
        const map: Record<string, Set<string>> = {};
        for (const d of calendar) map[d] = new Set();
        for (const s of scheduled) {
            if (map[s.date]) {
                map[s.date].add(s.matchup.homeTeamId);
                map[s.date].add(s.matchup.awayTeamId);
            }
        }
        return map;
    }

    let b2bCounts = recalcB2B();
    let iterations = 0;
    const MAX_ITER = 200;

    while (iterations < MAX_ITER) {
        iterations++;
        const overTeams = teamIds.filter(t => b2bCounts[t] > MAX_B2B);
        if (overTeams.length === 0) break;

        const dateTeamMap = buildDateTeamMap();
        let moved = false;

        for (const team of overTeams) {
            const teamGames = scheduled
                .map((s, idx) => ({ ...s, idx }))
                .filter(s => s.matchup.homeTeamId === team || s.matchup.awayTeamId === team)
                .sort((a, b) => a.date.localeCompare(b.date));

            for (let i = 1; i < teamGames.length; i++) {
                if (addDays(teamGames[i - 1].date, 1) !== teamGames[i].date) continue;
                const game = teamGames[i];
                const otherTeam = game.matchup.homeTeamId === team
                    ? game.matchup.awayTeamId : game.matchup.homeTeamId;

                for (let shift = 1; shift <= 3; shift++) {
                    const newDate = addDays(game.date, shift);
                    if (!dateSet.has(newDate)) continue;
                    if (!dateTeamMap[newDate]) continue;
                    if (dateTeamMap[newDate].has(team)) continue;
                    if (dateTeamMap[newDate].has(otherTeam)) continue;
                    if (dateTeamMap[newDate].size >= 15) continue;
                    const prev1 = addDays(newDate, -1);
                    const prev2 = addDays(newDate, -2);
                    if (dateTeamMap[prev1]?.has(team) && dateTeamMap[prev2]?.has(team)) continue;
                    if (dateTeamMap[prev1]?.has(otherTeam) && dateTeamMap[prev2]?.has(otherTeam)) continue;
                    const oldDate = scheduled[game.idx].date;
                    dateTeamMap[oldDate].delete(team);
                    dateTeamMap[oldDate].delete(otherTeam);
                    dateTeamMap[newDate].add(team);
                    dateTeamMap[newDate].add(otherTeam);
                    scheduled[game.idx].date = newDate;
                    moved = true;
                    break;
                }
                if (moved) break;
            }
            if (moved) break;
        }

        if (!moved) break;
        b2bCounts = recalcB2B();
    }
}

const TEAM_TIME_SLOT: Record<string, string> = {
    atl: '19:30', bos: '19:30', bkn: '19:30', cha: '19:30',
    cle: '19:30', det: '19:30', ind: '19:30', mia: '19:30',
    nyk: '19:30', orl: '19:30', phi: '19:30', tor: '19:30', was: '19:30',
    chi: '20:00', dal: '20:00', hou: '20:00', mem: '20:00',
    mil: '20:00', min: '20:00', no: '20:00', okc: '20:00', sa: '20:00',
    den: '21:00', phx: '21:00', uta: '21:00',
    gs: '22:00', law: '22:00', lam: '22:00', por: '22:00', sac: '22:00',
};

const DEFAULT_TIME_SLOT = '19:30';
const TIME_SLOTS = ['19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00', '22:30'];
const MAX_GAMES_PER_SLOT = 3;

function assignGameTimes(games: Game[]): void {
    const byDate = new Map<string, Game[]>();
    for (const g of games) {
        if (!byDate.has(g.date)) byDate.set(g.date, []);
        byDate.get(g.date)!.push(g);
    }

    for (const dayGames of byDate.values()) {
        dayGames.sort((a, b) => {
            const ta = TEAM_TIME_SLOT[a.homeTeamId] ?? DEFAULT_TIME_SLOT;
            const tb = TEAM_TIME_SLOT[b.homeTeamId] ?? DEFAULT_TIME_SLOT;
            return ta.localeCompare(tb);
        });

        const slotCount = new Map<string, number>();
        for (const g of dayGames) {
            let slot = TEAM_TIME_SLOT[g.homeTeamId] ?? DEFAULT_TIME_SLOT;
            const count = slotCount.get(slot) ?? 0;
            if (count >= MAX_GAMES_PER_SLOT) {
                let idx = TIME_SLOTS.indexOf(slot);
                while (idx < TIME_SLOTS.length - 1) {
                    idx++;
                    const nextSlot = TIME_SLOTS[idx];
                    if ((slotCount.get(nextSlot) ?? 0) < MAX_GAMES_PER_SLOT) {
                        slot = nextSlot;
                        break;
                    }
                }
            }
            slotCount.set(slot, (slotCount.get(slot) ?? 0) + 1);
            g.time = slot;
        }
    }
}

export function generateSeasonSchedule(
    config: ScheduleConfig,
    teamData: Record<string, TeamStaticData> = TEAM_DATA
): Game[] {
    const seed = config.seed ?? config.seasonYear;
    const rng = createRng(seed);

    const groups = buildTeamGroups(teamData);
    const matchups = generateMatchups(groups, rng);
    balanceHomeAway(matchups, groups.teamIds, rng);
    const calendar = buildCalendar(config);
    const scheduled = assignDates(matchups, calendar, groups.teamIds, rng);
    balanceBackToBacks(scheduled, calendar, groups.teamIds);

    scheduled.sort((a, b) => a.date.localeCompare(b.date));

    const games: Game[] = scheduled.map(s => ({
        id: `g_${s.matchup.homeTeamId}_${s.matchup.awayTeamId}_${s.date}`,
        homeTeamId: s.matchup.homeTeamId,
        awayTeamId: s.matchup.awayTeamId,
        date: s.date,
        played: false,
        isPlayoff: false,
    }));

    assignGameTimes(games);

    return games;
}
