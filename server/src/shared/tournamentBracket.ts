
/**
 * tournamentBracket.ts — 토너먼트 브라켓 생성 순수 로직
 * Deno Edge Function과 클라이언트가 공용으로 사용.
 * DB/React 의존 없음.
 */

// ── 타입 ──────────────────────────────────────────────────────────────────────

export interface TournamentTeam {
    team_slug: string;
    id: string;
}

export interface PlayoffSeries {
    id: string;
    round: number;
    conference: 'BPL';
    higherSeedId: string;
    lowerSeedId:  string;
    higherSeedWins: number;
    lowerSeedWins:  number;
    finished: boolean;
    targetWins: number;
    winnerId?: string;
}

export interface TournamentGame {
    id: string;
    homeTeamId: string;
    awayTeamId: string;
    date: string;
    game_seq: number; // 순차 슬롯: real_at = sim_real_start_at + (game_seq / games_per_real_day) * 86400000
    played: boolean;
    isPlayoff: boolean;
    seriesId?: string;
}

const DEFAULT_INTERVAL_MIN = 30;

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

function nextPow2(n: number): number {
    let p = 1;
    while (p < n) p <<= 1;
    return p;
}

function stringToHash(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

function seededShuffle<T extends { team_slug: string }>(arr: T[], seed: string): T[] {
    return [...arr].sort((a, b) => {
        const ha = stringToHash(seed + a.team_slug) % 10000;
        const hb = stringToHash(seed + b.team_slug) % 10000;
        return ha - hb;
    });
}

export function targetWinsFromFormat(matchFormat: string | null): number {
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

/** 라운드별 최대 경기 수 (파이널 라운드는 finalsTargetWins 사용). */
function maxGamesForRound(round: number, totalRounds: number, targetWins: number, finalsTargetWins: number): number {
    const tw = isFinalRound(round, totalRounds) ? finalsTargetWins : targetWins;
    return tw * 2 - 1;
}

/**
 * 라운드별 시작 슬롯을 사전 계산한다 (인덱스 1부터 사용, 0은 미사용).
 * 라운드 r은 항상 라운드 r-1의 "최대 경기 수" 만큼 지난 슬롯에서 시작 —
 * 실제 경기 결과와 무관하게 고정되므로, 일부 시리즈가 조기에 끝나도 다음 라운드는
 * 이전 라운드 전체 슬롯이 지난 뒤 모든 매치가 동시에 시작된다.
 */
function computeRoundBaseSlots(totalRounds: number, targetWins: number, finalsTargetWins: number): number[] {
    const base: number[] = [0];
    let slot = 0;
    for (let round = 1; round <= totalRounds; round++) {
        base[round] = slot;
        slot += maxGamesForRound(round, totalRounds, targetWins, finalsTargetWins);
    }
    return base;
}

function offsetDate(base: string, days: number): string {
    const [y, m, d] = base.split('-').map(Number);
    const date = new Date(y, m - 1, d + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** slot(=game_seq) → 대략적인 달력 날짜 (스케줄 리스트 날짜별 그룹핑용 — 실제 시각은 game_seq+games_per_real_day로 별도 계산됨). */
function slotToDate(startDate: string, slot: number, intervalMinutes: number): string {
    return offsetDate(startDate, Math.floor((slot * intervalMinutes) / 1440));
}

// ── 시리즈 전체 게임 사전 생성 ─────────────────────────────────────────────────

/**
 * 팀이 확정된 시리즈의 최대 경기를 모두 미리 생성한다. 한 경기씩 순차 슬롯(startSlot, startSlot+1, ...)에
 * 배치되며, 슬롯 간 실제 시간 간격은 intervalMinutes(games_per_real_day로 환산)로 결정된다.
 * 시리즈가 일찍 끝나면 남은 게임은 played: false인 채로 방치된다.
 */
function generateAllSeriesGames(
    seriesId: string,
    higherSeedId: string,
    lowerSeedId: string,
    targetWins: number,
    startDate: string,
    startSlot: number,
    intervalMinutes: number,
): TournamentGame[] {
    const maxGames = targetWins * 2 - 1;
    const games: TournamentGame[] = [];
    for (let gameNum = 1; gameNum <= maxGames; gameNum++) {
        const slot       = startSlot + (gameNum - 1);
        const higherHome = (gameNum % 2) === 1;
        games.push({
            id:          `${seriesId}_G${gameNum}`,
            homeTeamId:  higherHome ? higherSeedId : lowerSeedId,
            awayTeamId:  higherHome ? lowerSeedId  : higherSeedId,
            date:        slotToDate(startDate, slot, intervalMinutes),
            game_seq:    slot,
            played:      false,
            isPlayoff:   true,
            seriesId,
        });
    }
    return games;
}

// ── Single Elimination ────────────────────────────────────────────────────────

function initSingleElim(
    teams: TournamentTeam[],
    targetWins: number,
    finalsTargetWins: number,
    seed: string,
    startDate: string,
    intervalMinutes: number,
): { series: PlayoffSeries[]; schedule: TournamentGame[] } {
    const shuffled = seededShuffle(teams, seed + ':seeding');
    const size = nextPow2(shuffled.length);
    const slots: (TournamentTeam | null)[] = [
        ...shuffled,
        ...Array(size - shuffled.length).fill(null),
    ];

    const series: PlayoffSeries[] = [];
    const schedule: TournamentGame[] = [];
    const totalRounds = Math.log2(size);
    const roundBaseSlots = computeRoundBaseSlots(totalRounds, targetWins, finalsTargetWins);

    // R1: 모든 매치의 게임을 같은 슬롯(라운드 시작 슬롯 + 게임번호-1)에 동시 배치
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

            // 최대 경기 수 전부 생성 (일찍 끝나면 나머지는 played: false로 방치)
            const games = generateAllSeriesGames(
                seriesId, teamA.team_slug, teamB.team_slug, targetWins, startDate, roundBaseSlots[1], intervalMinutes,
            );
            schedule.push(...games);
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

    // BYE 자동 진출 팀을 R2에 즉시 배치 (R2 시작 슬롯은 라운드 단위로 고정됨)
    advanceTournamentState(series, schedule, targetWins, finalsTargetWins, startDate, intervalMinutes);

    return { series, schedule };
}

// ── Round Robin ───────────────────────────────────────────────────────────────

function initRoundRobin(
    teams: TournamentTeam[],
    startDate: string,
    intervalMinutes: number,
): { series: PlayoffSeries[]; schedule: TournamentGame[] } {
    const schedule: TournamentGame[] = [];
    const n = teams.length;
    const isOdd = n % 2 !== 0;

    const padded: (TournamentTeam | null)[] = isOdd ? [...teams, null] : [...teams];
    const m = padded.length;

    const fixed = padded[0];
    const rotating = padded.slice(1);
    let nextSlot = 0;

    for (let r = 0; r < m - 1; r++) {
        const roundTeams: (TournamentTeam | null)[] = [fixed, ...rotating];

        for (let i = 0; i < m / 2; i++) {
            const a = roundTeams[i];
            const b = roundTeams[m - 1 - i];
            if (!a || !b) continue;

            const homeTeam = r % 2 === 0 ? a : b;
            const awayTeam = r % 2 === 0 ? b : a;
            const slot = nextSlot++;

            schedule.push({
                id:          `RR_R${r + 1}_${a.team_slug}_vs_${b.team_slug}`,
                homeTeamId:  homeTeam.team_slug,
                awayTeamId:  awayTeam.team_slug,
                date:        slotToDate(startDate, slot, intervalMinutes),
                game_seq:    slot,
                played:      false,
                isPlayoff:   false,
            });
        }

        rotating.unshift(rotating.pop()!);
    }

    return { series: [], schedule };
}

// ── 상태 전진 ─────────────────────────────────────────────────────────────────

/**
 * 완료된 시리즈 승자를 다음 라운드 TBD 슬롯에 채워 넣는다.
 * 양쪽 슬롯이 모두 결정되면 해당 라운드 전체 경기를, 지금까지 배정된 슬롯 바로 다음부터
 * 이어서(한 경기씩 순차) 생성한다.
 */
export function advanceTournamentState(
    series: PlayoffSeries[],
    schedule: TournamentGame[],
    targetWins: number,
    finalsTargetWins: number,
    startDate: string,
    intervalMinutes: number = DEFAULT_INTERVAL_MIN,
): void {
    const byId: Record<string, PlayoffSeries> = Object.fromEntries(series.map(s => [s.id, s]));
    const maxRound = series.reduce((mx, s) => Math.max(mx, s.round), 0);
    const roundBaseSlots = computeRoundBaseSlots(maxRound, targetWins, finalsTargetWins);

    for (let round = 1; round < maxRound; round++) {
        for (const s of series) {
            if (s.round !== round || !s.finished || !s.winnerId) continue;

            const mIdx  = parseInt(s.id.split('_M')[1], 10);
            const nextId = `T_R${round + 1}_M${Math.floor(mIdx / 2)}`;
            const next   = byId[nextId];
            if (!next || next.finished) continue;

            if (mIdx % 2 === 0) next.higherSeedId = s.winnerId;
            else                next.lowerSeedId  = s.winnerId;

            // 양쪽 팀 확정 → 전체 경기 생성 — 시작 슬롯은 다음 라운드 고정 슬롯(모든 매치 동시 시작)
            if (next.higherSeedId !== 'TBD' && next.lowerSeedId !== 'TBD') {
                const alreadyExists = schedule.some(g => g.seriesId === nextId);
                if (!alreadyExists) {
                    const startSlot = roundBaseSlots[round + 1];
                    schedule.push(...generateAllSeriesGames(
                        nextId, next.higherSeedId, next.lowerSeedId, next.targetWins, startDate, startSlot, intervalMinutes,
                    ));
                }
            }
        }
    }
}

// ── 메인 API ──────────────────────────────────────────────────────────────────

export function buildTournamentBracket(
    teams: TournamentTeam[],
    tournamentFormat: string | null,
    matchFormat: string | null,
    finalsMatchFormat: string | null,
    tendencySeed: string,
    startDate: string,
    intervalMinutes: number = DEFAULT_INTERVAL_MIN,
): { series: PlayoffSeries[]; schedule: TournamentGame[] } {
    const targetWins       = targetWinsFromFormat(matchFormat);
    const finalsTargetWins = targetWinsFromFormat(finalsMatchFormat ?? matchFormat);
    if (tournamentFormat === 'round_robin') {
        return initRoundRobin(teams, startDate, intervalMinutes);
    }
    return initSingleElim(teams, targetWins, finalsTargetWins, tendencySeed, startDate, intervalMinutes);
}
