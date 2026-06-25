
interface Game {
    id: string;
    homeTeamId: string;
    awayTeamId: string;
    date: string;
    game_seq: number;
    homeScore?: number;
    awayScore?: number;
    played: boolean;
    isPlayoff?: boolean;
    seriesId?: string;
}

interface PlayoffSeries {
    id: string;
    round: number;
    conference: 'East' | 'West' | 'BPL';
    higherSeedId: string;
    lowerSeedId: string;
    higherSeedWins: number;
    lowerSeedWins: number;
    finished: boolean;
    targetWins: number;
    winnerId?: string;
}

// Inlined from services/multi/roomQueries.ts
export interface LeagueTeamRow {
    id: string;
    room_id: string;
    team_slug: string;
    team_name: string;
    team_abbr: string;
    color_primary: string;
    color_secondary: string;
    conference: string | null;
    user_id: string | null;
    is_ai: boolean;
    draft_order: number | null;
    roster: string[];
    created_at: string;
}

// Inlined from utils/hiddenTendencies.ts
function stringToHash(str: string): number {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

// ── 상수 ──────────────────────────────────────────────────────────────────────

const ROUND_GAP_DAYS = 3;

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

function nextPow2(n: number): number {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
}

function targetWinsFromFormat(matchFormat: string | null): number {
    switch (matchFormat) {
        case 'best_of_3': return 2;
        case 'best_of_5': return 3;
        case 'best_of_7': return 4;
        default:          return 1;
    }
}

function isFinalRound(round: number, totalRounds: number): boolean {
    return round === totalRounds;
}

function seededShuffle<T>(arr: T[], seed: string): T[] {
    const result = [...arr];
    // mulberry32 PRNG seeded from stringToHash — produces uniform Fisher-Yates shuffle
    let s = stringToHash(seed) >>> 0;
    const rand = (): number => {
        s += 0x6D2B79F5;
        let x = s;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 0x100000000;
    };
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

function offsetDate(base: string, days: number): string {
    const [y, m, d] = base.split('-').map(Number);
    const date = new Date(y, m - 1, d + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function roundStartDay(round: number, targetWins: number): number {
    const maxLastGameOffset = (targetWins * 2 - 2) * 2;
    return (round - 1) * (maxLastGameOffset + ROUND_GAP_DAYS);
}

// ── 시리즈 전체 게임 사전 생성 ─────────────────────────────────────────────────

function generateAllSeriesGames(
    seriesId: string,
    round: number,
    higherSeedId: string,
    lowerSeedId: string,
    targetWins: number,
    startDate: string,
): Game[] {
    const maxGames = targetWins * 2 - 1;
    const games: Game[] = [];
    for (let gameNum = 1; gameNum <= maxGames; gameNum++) {
        const dayOffset  = roundStartDay(round, targetWins) + (gameNum - 1) * 2;
        const higherHome = (gameNum % 2) === 1;
        games.push({
            id:         `${seriesId}_G${gameNum}`,
            homeTeamId: higherHome ? higherSeedId : lowerSeedId,
            awayTeamId: higherHome ? lowerSeedId  : higherSeedId,
            date:       offsetDate(startDate, dayOffset),
            game_seq:   dayOffset,
            played:     false,
            isPlayoff:  true,
            seriesId,
        });
    }
    return games;
}

// ── Single Elimination ────────────────────────────────────────────────────────

function initSingleElim(
    teams: LeagueTeamRow[],
    targetWins: number,
    finalsTargetWins: number,
    seed: string,
    startDate: string,
): { series: PlayoffSeries[]; schedule: Game[] } {
    const shuffled = seededShuffle(teams, seed + ':seeding');
    const size = nextPow2(shuffled.length);
    const slots: (LeagueTeamRow | null)[] = [
        ...shuffled,
        ...Array(size - shuffled.length).fill(null),
    ];

    const series: PlayoffSeries[] = [];
    const schedule: Game[] = [];
    const totalRounds = Math.log2(size);

    for (let i = 0; i < size; i += 2) {
        const teamA = slots[i];
        const teamB = slots[i + 1];
        const matchIdx = i / 2;
        const seriesId = `T_R1_M${matchIdx}`;

        if (!teamA) continue;

        if (!teamB) {
            series.push({
                id: seriesId,
                round: 1,
                conference: 'BPL',
                higherSeedId: teamA.team_slug,
                lowerSeedId:  'BYE',
                higherSeedWins: targetWins,
                lowerSeedWins:  0,
                finished: true,
                targetWins,
                winnerId: teamA.team_slug,
            });
        } else {
            series.push({
                id: seriesId,
                round: 1,
                conference: 'BPL',
                higherSeedId: teamA.team_slug,
                lowerSeedId:  teamB.team_slug,
                higherSeedWins: 0,
                lowerSeedWins:  0,
                finished: false,
                targetWins,
            });

            schedule.push(...generateAllSeriesGames(
                seriesId, 1, teamA.team_slug, teamB.team_slug, targetWins, startDate,
            ));
        }
    }

    for (let round = 2; round <= totalRounds; round++) {
        const matchesInRound = size / Math.pow(2, round);
        const tw = isFinalRound(round, totalRounds) ? finalsTargetWins : targetWins;
        for (let m = 0; m < matchesInRound; m++) {
            series.push({
                id: `T_R${round}_M${m}`,
                round,
                conference: 'BPL',
                higherSeedId: 'TBD',
                lowerSeedId:  'TBD',
                higherSeedWins: 0,
                lowerSeedWins:  0,
                finished: false,
                targetWins: tw,
            });
        }
    }

    advanceTournamentState(series, schedule, targetWins, startDate);

    return { series, schedule };
}

// ── Round Robin ───────────────────────────────────────────────────────────────

function initRoundRobin(
    teams: LeagueTeamRow[],
    startDate: string,
): { series: PlayoffSeries[]; schedule: Game[] } {
    const schedule: Game[] = [];
    const n = teams.length;
    const isOdd = n % 2 !== 0;

    const padded: (LeagueTeamRow | null)[] = isOdd ? [...teams, null] : [...teams];
    const m = padded.length;

    const fixed = padded[0];
    const rotating = padded.slice(1);

    for (let r = 0; r < m - 1; r++) {
        const roundTeams: (LeagueTeamRow | null)[] = [fixed, ...rotating];

        for (let i = 0; i < m / 2; i++) {
            const a = roundTeams[i];
            const b = roundTeams[m - 1 - i];
            if (!a || !b) continue;

            const homeTeam = r % 2 === 0 ? a : b;
            const awayTeam = r % 2 === 0 ? b : a;

            schedule.push({
                id:         `RR_R${r + 1}_${a.team_slug}_vs_${b.team_slug}`,
                homeTeamId: homeTeam.team_slug,
                awayTeamId: awayTeam.team_slug,
                date:       offsetDate(startDate, r),
                game_seq:   r,
                played:     false,
                isPlayoff:  false,
            });
        }

        rotating.unshift(rotating.pop()!);
    }

    return { series: [], schedule };
}

// ── 상태 전진 ─────────────────────────────────────────────────────────────────

export function advanceTournamentState(
    series: PlayoffSeries[],
    schedule: Game[],
    targetWins: number,
    startDate: string,
): void {
    const byId = Object.fromEntries(series.map(s => [s.id, s]));
    const maxRound = series.reduce((mx, s) => Math.max(mx, s.round), 0);

    for (let round = 1; round < maxRound; round++) {
        for (const s of series) {
            if (s.round !== round || !s.finished || !s.winnerId) continue;

            const mIdx   = parseInt(s.id.split('_M')[1], 10);
            const nextId = `T_R${round + 1}_M${Math.floor(mIdx / 2)}`;
            const next   = byId[nextId];
            if (!next || next.finished) continue;

            if (mIdx % 2 === 0) next.higherSeedId = s.winnerId;
            else                next.lowerSeedId  = s.winnerId;

            if (next.higherSeedId !== 'TBD' && next.lowerSeedId !== 'TBD') {
                const alreadyExists = schedule.some(g => g.seriesId === nextId);
                if (!alreadyExists) {
                    schedule.push(...generateAllSeriesGames(
                        nextId, round + 1, next.higherSeedId, next.lowerSeedId, next.targetWins, startDate,
                    ));
                }
            }
        }
    }
}

// ── 메인 API ──────────────────────────────────────────────────────────────────

export interface TournamentBracketResult {
    series: PlayoffSeries[];
    schedule: Game[];
}

export function initializeTournamentBracket(
    teams: LeagueTeamRow[],
    tournamentFormat: string | null,
    matchFormat: string | null,
    finalsMatchFormat: string | null,
    tendencySeed: string,
    startDate: string,
): TournamentBracketResult {
    const targetWins       = targetWinsFromFormat(matchFormat);
    const finalsTargetWins = targetWinsFromFormat(finalsMatchFormat ?? matchFormat);

    if (tournamentFormat === 'round_robin') {
        return initRoundRobin(teams, startDate);
    }

    return initSingleElim(teams, targetWins, finalsTargetWins, tendencySeed, startDate);
}
