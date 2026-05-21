
import type { Game, PlayoffSeries } from '../../types/game';
import type { LeagueTeamRow } from './roomQueries';
import { stringToHash } from '../../utils/hiddenTendencies';

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
    return [...arr].sort((a, b) => {
        const ha = (stringToHash(seed + String((a as any).id ?? (a as any).team_slug)) % 10000);
        const hb = (stringToHash(seed + String((b as any).id ?? (b as any).team_slug)) % 10000);
        return ha - hb;
    });
}

function offsetDate(base: string, days: number): string {
    const [y, m, d] = base.split('-').map(Number);
    const date = new Date(y, m - 1, d + days); // local midnight, no UTC shift
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// KST 시간대 슬롯: 10, 12, 14, 16, 18, 20시 (UTC 1, 3, 5, 7, 9, 11시)
const KST_SLOT_UTC_HOURS = [1, 3, 5, 7, 9, 11];

function matchIdxFromSeriesId(seriesId: string): number {
    const m = seriesId.match(/_M(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
}

function dayToScheduledAt(startDate: string, dayOffset: number, utcHour: number): string {
    const [y, m, d] = startDate.split('-').map(Number);
    const baseMs = Date.UTC(y, m - 1, d, utcHour, 0, 0, 0);
    return new Date(baseMs + dayOffset * 86_400_000).toISOString();
}

function roundStartDay(round: number, targetWins: number): number {
    const maxLastGameOffset = (targetWins * 2 - 2) * 2;
    return (round - 1) * (maxLastGameOffset + ROUND_GAP_DAYS);
}

function extractRound(seriesId: string): number {
    const m = seriesId.match(/T_R(\d+)_/);
    return m ? parseInt(m[1], 10) : 1;
}

// ── 시리즈 전체 게임 사전 생성 ─────────────────────────────────────────────────

function generateAllSeriesGames(
    seriesId: string,
    round: number,
    higherSeedId: string,
    lowerSeedId: string,
    targetWins: number,
    startDate: string,
    startUtcHour = 1,
): Game[] {
    const maxGames = targetWins * 2 - 1;
    const slotOffset = startUtcHour - KST_SLOT_UTC_HOURS[0];
    const utcHour  = KST_SLOT_UTC_HOURS[matchIdxFromSeriesId(seriesId) % KST_SLOT_UTC_HOURS.length] + slotOffset;
    const games: Game[] = [];
    for (let gameNum = 1; gameNum <= maxGames; gameNum++) {
        const dayOffset  = roundStartDay(round, targetWins) + (gameNum - 1) * 2;
        const higherHome = (gameNum % 2) === 1;
        games.push({
            id:          `${seriesId}_G${gameNum}`,
            homeTeamId:  higherHome ? higherSeedId : lowerSeedId,
            awayTeamId:  higherHome ? lowerSeedId  : higherSeedId,
            date:        offsetDate(startDate, dayOffset),
            scheduledAt: dayToScheduledAt(startDate, dayOffset, utcHour),
            played:      false,
            isPlayoff:   true,
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
    startUtcHour = 1,
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

    // R1: 모든 가능한 게임을 미리 생성
    for (let i = 0; i < size; i += 2) {
        const teamA = slots[i];
        const teamB = slots[i + 1];
        const matchIdx = i / 2;
        const seriesId = `T_R1_M${matchIdx}`;

        if (!teamA) continue;

        if (!teamB) {
            // BYE: 즉시 자동 진출, 경기 없음
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
                seriesId, 1, teamA.team_slug, teamB.team_slug, targetWins, startDate, startUtcHour,
            ));
        }
    }

    // R2 이상: TBD 플레이스홀더 (파이널 라운드는 finalsTargetWins 사용)
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

    advanceTournamentState(series, schedule, targetWins, startDate, startUtcHour);

    return { series, schedule };
}

// ── Round Robin ───────────────────────────────────────────────────────────────

function initRoundRobin(
    teams: LeagueTeamRow[],
    startDate: string,
    startUtcHour = 1,
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
                id:          `RR_R${r + 1}_${a.team_slug}_vs_${b.team_slug}`,
                homeTeamId:  homeTeam.team_slug,
                awayTeamId:  awayTeam.team_slug,
                date:        offsetDate(startDate, r),
                scheduledAt: dayToScheduledAt(startDate, r, startUtcHour),
                played:      false,
                isPlayoff:   false,
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
    startUtcHour = 1,
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
                        nextId, round + 1, next.higherSeedId, next.lowerSeedId, next.targetWins, startDate, startUtcHour,
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
    startUtcHour = 1,
): TournamentBracketResult {
    const targetWins       = targetWinsFromFormat(matchFormat);
    const finalsTargetWins = targetWinsFromFormat(finalsMatchFormat ?? matchFormat);

    if (tournamentFormat === 'round_robin') {
        return initRoundRobin(teams, startDate, startUtcHour);
    }

    return initSingleElim(teams, targetWins, finalsTargetWins, tendencySeed, startDate, startUtcHour);
}
