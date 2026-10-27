/**
 * 일정 생성기 v2 — 날짜 배정(매치업 → 날짜). [2026-10-23] docs/plan/schedule-generator-v2.md §5
 *
 * 목표값은 실측 10시즌 분석(docs/research/nba-schedule-patterns.md §9, 2021-22~2025-26 기준).
 * 이동 거리는 고려하지 않는다(사용자 결정).
 *
 * 단계
 *  1. 같은 경기장 2연전 묶기 — 같은 홈에서 2경기 이상 열리는 컨퍼런스 내 상대 쌍을 시즌 약 37쌍 골라
 *     2경기짜리 한 단위(간격 이틀 85% / 연속일 15%)로 묶는다. 이후 단위째로 배치·이동.
 *  2. 날짜 틀 — 고정일(개막일 2경기, 크리스마스 5경기, 마지막 금 15경기·토 0경기·일 15경기),
 *     휴무일(추수감사절, 크리스마스 이브, 올스타 브레이크), 나머지 날은 요일 가중치로 목표 경기 수.
 *  3. 고정일 경기 예약 — 마지막 금·일은 30팀이 한 번씩 나오는 15경기 조합, 크리스마스·개막일은 서로 다른 팀.
 *  4. 초기 배치 — 단위마다 가장 비어 있는 날(하드 제약 위반·B2B 최소)에 넣는다.
 *  5. 다듬기 — 담금질(simulated annealing). 단위를 다른 날로 옮기거나 두 경기 날짜를 맞바꾸고,
 *     벌점 합이 줄면(또는 온도에 따라 가끔 늘어도) 받아들인다. 시드 RNG라 결정론적.
 *
 * 하드 제약: 한 팀 하루 2경기 금지(구조적으로 불가), 3-in-3·4-in-5(큰 벌점으로 제거, 최종 검증).
 *
 * utils/scheduleOptimizer.ts와 미러 — 로직을 바꿀 땐 양쪽 다 같이 고칠 것(의존성 없는 순수 모듈).
 */

export interface OptMatchup {
    homeTeamId: string;
    awayTeamId: string;
}

export interface OptimizerInput {
    matchups: OptMatchup[];
    teamIds: string[];
    teamConference: Record<string, string>;
    seasonStart: string;
    regularSeasonEnd: string;
    allStarStart: string;
    allStarEnd: string;
    rng: () => number;
    /** 담금질 반복 횟수(기본 SA_ITERATIONS). 하네스에서 속도/품질 비교용. */
    iterations?: number;
}

export interface OptimizerStats {
    hardViolations: number;
    cost: number;
    seriesUnits: number;
}

// ── 목표값 (실측, 현재 시대) ──────────────────────────────────────────────────

/** 요일별 경기 비중(일~토, getDay 순서) — 실측 월 14.9 / 화 11.0 / 수 18.3 / 목 10.5 / 금 17.5 / 토 13.6 / 일 14.1 % */
const DOW_WEIGHT = [14.1, 14.9, 11.0, 18.3, 10.5, 17.5, 13.6];
/** 같은 요일 안에서도 날마다 경기 수가 흔들린다 — 실측 p10~p90 폭 ≈ ±1.28σ → σ ≈ 2.6경기.
 *  다른 벌점과 맞물려 실현 분포가 목표보다 좁아지므로 조금 크게 잡는다(하네스로 실측 분포에 맞춤). */
const DAY_TARGET_SD = 3.6;
const DAY_TARGET_MIN = 1;
const DAY_TARGET_MAX = 14;
const OPENING_DAY_GAMES = 2;
const CHRISTMAS_GAMES = 5;
/** 같은 경기장 2연전 — 시즌 30~44쌍, 팀당 최대 5회 */
const SERIES_MIN = 30;
const SERIES_MAX = 44;
const SERIES_PER_TEAM_MAX = 5;
const SERIES_GAP2_PROB = 0.85;

const B2B_MIN = 13;
const B2B_MAX = 16;
const B2B_TARGET = 13.0;
/** 휴식일(경기 사이 빈 날) 비율 — B2B는 위 범위로 따로 다루고 2일·3일·4일+만 맞춘다.
 *  [2026-10-26] 컵 대회가 없으므로 컵 대회 이전 시즌(2021-22·2022-23) 전체 분포 기준:
 *  0일 17.2 / 1일 64.6 / 2일 15.3 / 3일 2.56 / 4일+ 0.39 %. (컵 시대 수치는 12월 녹아웃 공백이 섞여 4일+가 부풀어 있다) */
const REST2_TARGET = 0.153 * 81;
const REST3_TARGET = 0.0256 * 81;
/** 4일+ 휴식은 팀당 시즌 0~1회 — 횟수마다 선형 벌점 + 하루 길어질 때마다 추가 */
const REST4P_FREE = 0;
const LONG_REST_DAYS = 6;
const RUN_SOFT_MAX = 8;
const ROAD_RUNS_TARGET = 18;
const RUNS_5PLUS_MAX = 2;
const OPP_MIN_GAP = 7;
const FIRST41_HOME_MIN = 17;
const FIRST41_HOME_MAX = 24;

// 벌점 가중치
const W_HARD = 500;
const W_B2B_OUT = 40;
const W_B2B_IN = 4;
const W_5IN7 = 8;
const W_REST2 = 3;
const W_REST3 = 8;
const W_REST4P = 12;
const W_LONG_REST = 50;
const W_RUN_LONG = 60;
const W_RUNS_5PLUS = 15;
const W_ROAD_RUNS = 2;
const W_OPP_GAP = 8;
const W_FIRST41 = 20;
const W_OPENING_B2B = 200;
const W_LATE_DEBUT = 400;
const W_XMAS_B2B = 300;
const W_DAY = 3;

const SA_ITERATIONS = 400_000;
const SA_T0 = 30;
const SA_T1 = 0.05;

// ── 날짜 유틸 ────────────────────────────────────────────────────────────────

function fmt(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return fmt(d);
}

function dayDiff(a: string, b: string): number {
    return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000);
}

function dow(dateStr: string): number {
    return new Date(dateStr + 'T12:00:00').getDay();
}

/** 11월 넷째 목요일 */
function thanksgiving(year: number): string {
    const d = new Date(year, 10, 1, 12);
    d.setDate(1 + ((4 - d.getDay() + 7) % 7) + 21);
    return fmt(d);
}

function shuffle<T>(arr: T[], rng: () => number): void {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

// ── 본체 ─────────────────────────────────────────────────────────────────────

type DayKind = 'open' | 'locked' | 'closed' | 'break';

export function assignDatesV2(input: OptimizerInput): { scheduled: { date: string; matchup: OptMatchup }[]; stats: OptimizerStats } {
    const { matchups, teamIds, teamConference, rng } = input;
    const T = teamIds.length;
    const teamIdx = new Map(teamIds.map((t, i) => [t, i]));
    const G = matchups.length;
    const gHome = matchups.map(m => teamIdx.get(m.homeTeamId)!);
    const gAway = matchups.map(m => teamIdx.get(m.awayTeamId)!);

    // ── 달력 ──
    const N = dayDiff(input.seasonStart, input.regularSeasonEnd) + 1;
    const dates: string[] = [];
    for (let i = 0; i < N; i++) dates.push(addDays(input.seasonStart, i));
    const kind: DayKind[] = dates.map(d => (d >= input.allStarStart && d <= input.allStarEnd ? 'break' : 'open'));
    const asbFirst = Math.max(0, dayDiff(input.seasonStart, input.allStarStart));
    const asbLast = Math.min(N - 1, dayDiff(input.seasonStart, input.allStarEnd));
    const dayOf = (dateStr: string) => { const i = dayDiff(input.seasonStart, dateStr); return i >= 0 && i < N ? i : -1; };
    const startYear = Number(input.seasonStart.slice(0, 4));
    const closeDay = (i: number) => { if (i >= 0 && kind[i] === 'open') kind[i] = 'closed'; };
    closeDay(dayOf(thanksgiving(startYear)));
    closeDay(dayOf(`${startYear}-12-24`));
    const xmasDay = dayOf(`${startYear}-12-25`);
    const lastDay = N - 1;
    closeDay(lastDay - 1);
    const lockedCount = new Map<number, number>();
    const lockDay = (i: number, n: number) => { if (i >= 0 && kind[i] === 'open') { kind[i] = 'locked'; lockedCount.set(i, n); } };
    lockDay(0, OPENING_DAY_GAMES);
    lockDay(xmasDay, CHRISTMAS_GAMES);
    lockDay(lastDay - 2, T / 2);
    lockDay(lastDay, T / 2);

    // ── 1. 2연전 묶기 ──
    // 쌍별로 같은 홈 경기 목록을 모아, 같은 홈 2경기 이상인 컨퍼런스 내 쌍만 후보.
    const byHostPair = new Map<string, number[]>();
    for (let g = 0; g < G; g++) {
        const key = `${gHome[g]}|${gAway[g]}`;
        if (!byHostPair.has(key)) byHostPair.set(key, []);
        byHostPair.get(key)!.push(g);
    }
    const candidates: number[][] = [];
    for (const [key, gs] of byHostPair) {
        const [h, a] = key.split('|').map(Number);
        if (gs.length >= 2 && teamConference[teamIds[h]] === teamConference[teamIds[a]]) candidates.push(gs);
    }
    candidates.sort((x, y) => x[0] - y[0]);
    shuffle(candidates, rng);
    const seriesTarget = SERIES_MIN + Math.floor(rng() * (SERIES_MAX - SERIES_MIN + 1));
    const seriesPerTeam = new Array(T).fill(0);
    const usedPair = new Set<string>();
    interface Unit { games: number[]; offsets: number[]; h: number; a: number; locked: boolean; start: number; }
    const units: Unit[] = [];
    const inUnit = new Array(G).fill(false);
    for (const gs of candidates) {
        if (units.length >= seriesTarget) break;
        const h = gHome[gs[0]], a = gAway[gs[0]];
        const pairKey = h < a ? `${h}|${a}` : `${a}|${h}`;
        if (usedPair.has(pairKey) || seriesPerTeam[h] >= SERIES_PER_TEAM_MAX || seriesPerTeam[a] >= SERIES_PER_TEAM_MAX) continue;
        usedPair.add(pairKey);
        seriesPerTeam[h]++; seriesPerTeam[a]++;
        const gap = rng() < SERIES_GAP2_PROB ? 2 : 1;
        units.push({ games: [gs[0], gs[1]], offsets: [0, gap], h, a, locked: false, start: -1 });
        inUnit[gs[0]] = inUnit[gs[1]] = true;
    }
    const seriesUnits = units.length;

    // ── 3. 고정일 예약 (2연전 아닌 단일 경기에서) ──
    const lockedGame = new Array(G).fill(false);
    const freeSingles = () => { const r: number[] = []; for (let g = 0; g < G; g++) if (!inUnit[g] && !lockedGame[g]) r.push(g); return r; };
    const lockGames = (gs: number[], day: number) => {
        for (const g of gs) {
            lockedGame[g] = true;
            units.push({ games: [g], offsets: [0], h: gHome[g], a: gAway[g], locked: true, start: day });
        }
    };
    /** 30팀이 한 번씩 나오는 15경기 — 컨퍼런스 내 경기 우선, 무작위 백트래킹. */
    const perfectMatching = (avoidPairs: Set<string>): number[] | null => {
        const pool = freeSingles();
        const byTeam: number[][] = Array.from({ length: T }, () => []);
        for (const g of pool) {
            const pk = gHome[g] < gAway[g] ? `${gHome[g]}|${gAway[g]}` : `${gAway[g]}|${gHome[g]}`;
            if (avoidPairs.has(pk)) continue;
            byTeam[gHome[g]].push(g); byTeam[gAway[g]].push(g);
        }
        for (const list of byTeam) {
            shuffle(list, rng);
            list.sort((x, y) => Number(teamConference[teamIds[gHome[y]]] === teamConference[teamIds[gAway[y]]])
                - Number(teamConference[teamIds[gHome[x]]] === teamConference[teamIds[gAway[x]]]));
        }
        const used = new Array(T).fill(false);
        const picked: number[] = [];
        let budget = 20_000;
        const dfs = (): boolean => {
            if (picked.length === T / 2) return true;
            if (--budget < 0) return false;
            let t = -1;
            for (let i = 0; i < T; i++) if (!used[i]) { t = i; break; }
            for (const g of byTeam[t]) {
                const o = gHome[g] === t ? gAway[g] : gHome[g];
                if (used[o]) continue;
                used[t] = used[o] = true; picked.push(g);
                if (dfs()) return true;
                used[t] = used[o] = false; picked.pop();
            }
            return false;
        };
        return dfs() ? picked : null;
    };
    const pairKeyOf = (g: number) => (gHome[g] < gAway[g] ? `${gHome[g]}|${gAway[g]}` : `${gAway[g]}|${gHome[g]}`);
    if (kind[lastDay] === 'locked') {
        const sunday = perfectMatching(new Set());
        if (sunday) {
            lockGames(sunday, lastDay);
            const friday = kind[lastDay - 2] === 'locked' ? perfectMatching(new Set(sunday.map(pairKeyOf))) : null;
            if (friday) lockGames(friday, lastDay - 2);
            else if (kind[lastDay - 2] === 'locked') { kind[lastDay - 2] = 'open'; lockedCount.delete(lastDay - 2); }
        } else {
            kind[lastDay] = 'open'; lockedCount.delete(lastDay);
            if (kind[lastDay - 2] === 'locked') { kind[lastDay - 2] = 'open'; lockedCount.delete(lastDay - 2); }
        }
    }
    const xmasTeams = new Set<number>();
    const lockDistinct = (day: number, n: number, teamSet?: Set<number>) => {
        if (day < 0 || kind[day] !== 'locked') return;
        const pool = freeSingles();
        shuffle(pool, rng);
        const used = new Set<number>();
        const picked: number[] = [];
        for (const g of pool) {
            if (picked.length >= n) break;
            if (used.has(gHome[g]) || used.has(gAway[g])) continue;
            used.add(gHome[g]); used.add(gAway[g]); picked.push(g);
        }
        lockGames(picked, day);
        if (teamSet) for (const t of used) teamSet.add(t);
    };
    lockDistinct(0, OPENING_DAY_GAMES);
    lockDistinct(xmasDay, CHRISTMAS_GAMES, xmasTeams);

    for (let g = 0; g < G; g++) {
        if (!inUnit[g] && !lockedGame[g]) units.push({ games: [g], offsets: [0], h: gHome[g], a: gAway[g], locked: false, start: -1 });
    }

    // ── 2. 날짜별 목표 경기 수 ──
    // 요일 평균(가중치 비례)에 날마다 정규분포 흔들림(σ=DAY_TARGET_SD)을 더하고, 합이 남은 경기 수가
    // 되도록 다시 맞춘다 — 평균에만 맞추면 "매일 7~8경기"로 평탄해져 실측의 들쭉날쭉함(1~15경기)이 사라진다.
    const lockedGames = units.filter(u => u.locked).length;
    const openGames = G - lockedGames;
    let weightSum = 0;
    for (let i = 0; i < N; i++) if (kind[i] === 'open') weightSum += DOW_WEIGHT[dow(dates[i])];
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
    const target = new Array(N).fill(0);
    let rawSum = 0;
    for (let i = 0; i < N; i++) {
        if (kind[i] === 'open') {
            const mean = DOW_WEIGHT[dow(dates[i])] * openGames / weightSum;
            target[i] = Math.min(DAY_TARGET_MAX, Math.max(DAY_TARGET_MIN, mean + DAY_TARGET_SD * gauss()));
            rawSum += target[i];
        } else if (kind[i] === 'locked') target[i] = lockedCount.get(i) ?? 0;
    }
    for (let i = 0; i < N; i++) if (kind[i] === 'open') target[i] *= openGames / rawSum;

    // ── 상태 ──
    // occ[t*N + d] = 그날 팀 t의 경기 인덱스(없으면 -1). cnt[d] = 그날 경기 수.
    const occ = new Int32Array(T * N).fill(-1);
    const cnt = new Int32Array(N);
    const gameDay = new Int32Array(G).fill(-1);
    const unitOfGame = new Int32Array(G).fill(-1);
    units.forEach((u, ui) => u.games.forEach(g => { unitOfGame[g] = ui; }));

    const place = (ui: number, start: number) => {
        const u = units[ui];
        u.start = start;
        u.games.forEach((g, k) => {
            const d = start + u.offsets[k];
            gameDay[g] = d; cnt[d]++;
            occ[gHome[g] * N + d] = g; occ[gAway[g] * N + d] = g;
        });
    };
    const unplace = (ui: number) => {
        const u = units[ui];
        u.games.forEach(g => {
            const d = gameDay[g];
            cnt[d]--; occ[gHome[g] * N + d] = -1; occ[gAway[g] * N + d] = -1; gameDay[g] = -1;
        });
        u.start = -1;
    };
    /** 단위를 start에 놓을 수 있나 — 모든 경기일이 open이고 두 팀 모두 비어 있어야 함 */
    const canPlace = (ui: number, start: number): boolean => {
        const u = units[ui];
        for (const off of u.offsets) {
            const d = start + off;
            if (d < 0 || d >= N || kind[d] !== 'open' || cnt[d] >= T / 2) return false;
            if (occ[u.h * N + d] !== -1 || occ[u.a * N + d] !== -1) return false;
        }
        return true;
    };

    // ── 벌점 ──
    const dayCost = (d: number) => (kind[d] === 'open' ? W_DAY * (cnt[d] - target[d]) ** 2 : 0);
    const teamCost = (t: number): number => {
        const base = t * N;
        let cost = 0, n = 0, b2b = 0, rest2 = 0, rest3 = 0, rest4p = 0, home41 = 0;
        let d1 = -99, d2 = -99, d3 = -99, d4 = -99;
        let runHome = -1, runLen = 0, roadRuns = 0, runs5 = 0;
        let firstDay = -1;
        const lastVsOpp = new Int32Array(T).fill(-1);
        const lastGameVsOpp = new Int32Array(T).fill(-1);
        for (let d = 0; d < N; d++) {
            const g = occ[base + d];
            if (g === -1) continue;
            if (firstDay < 0) firstDay = d;
            const isHome = gHome[g] === t ? 1 : 0;
            const opp = isHome ? gAway[g] : gHome[g];
            if (d1 >= 0) {
                const gap = d - d1 - 1;
                const crossesBreak = d1 < asbFirst && d > asbLast;
                if (gap === 0) {
                    b2b++;
                    if (d < 7) cost += W_OPENING_B2B;
                    if (xmasDay >= 0 && d1 === xmasDay && xmasTeams.has(t)) cost += W_XMAS_B2B;
                } else if (!crossesBreak) {
                    if (gap === 2) rest2++;
                    else if (gap === 3) rest3++;
                    else if (gap >= 4) { rest4p++; cost += W_REST4P * (gap - 4); }
                    if (gap >= LONG_REST_DAYS) cost += W_LONG_REST * (gap - LONG_REST_DAYS + 1);
                }
            }
            if (d2 >= 0 && d - d2 <= 2) cost += W_HARD;
            if (d3 >= 0 && d - d3 <= 4) cost += W_HARD;
            if (d4 >= 0 && d - d4 <= 6) cost += W_5IN7;
            const lv = lastVsOpp[opp];
            if (lv >= 0 && d - lv < OPP_MIN_GAP && unitOfGame[lastGameVsOpp[opp]] !== unitOfGame[g]) {
                cost += W_OPP_GAP * (OPP_MIN_GAP - (d - lv));
            }
            lastVsOpp[opp] = d; lastGameVsOpp[opp] = g;
            if (isHome === runHome) runLen++;
            else {
                if (runLen > RUN_SOFT_MAX) cost += W_RUN_LONG * (runLen - RUN_SOFT_MAX) ** 2;
                if (runLen >= 5) runs5++;
                runHome = isHome; runLen = 1;
                if (!isHome) roadRuns++;
            }
            if (n < 41) home41 += isHome;
            n++;
            d4 = d3; d3 = d2; d2 = d1; d1 = d;
        }
        if (runLen > RUN_SOFT_MAX) cost += W_RUN_LONG * (runLen - RUN_SOFT_MAX) ** 2;
        if (runLen >= 5) runs5++;
        if (b2b < B2B_MIN) cost += W_B2B_OUT * (B2B_MIN - b2b) ** 2;
        else if (b2b > B2B_MAX) cost += W_B2B_OUT * (b2b - B2B_MAX) ** 2;
        cost += W_B2B_IN * (b2b - B2B_TARGET) ** 2;
        cost += W_REST2 * (rest2 - REST2_TARGET) ** 2 + W_REST3 * (rest3 - REST3_TARGET) ** 2;
        if (rest4p > REST4P_FREE) cost += W_REST4P * (rest4p - REST4P_FREE);
        if (runs5 > RUNS_5PLUS_MAX) cost += W_RUNS_5PLUS * (runs5 - RUNS_5PLUS_MAX);
        cost += W_ROAD_RUNS * (roadRuns - ROAD_RUNS_TARGET) ** 2;
        if (home41 < FIRST41_HOME_MIN) cost += W_FIRST41 * (FIRST41_HOME_MIN - home41);
        else if (home41 > FIRST41_HOME_MAX) cost += W_FIRST41 * (home41 - FIRST41_HOME_MAX);
        if (firstDay > 2) cost += W_LATE_DEBUT * (firstDay - 2);
        return cost;
    };
    /** 하드 제약 위반 수(3-in-3 / 4-in-5) — 최종 검증·통계용 */
    const hardCount = (t: number): number => {
        let v = 0, d1 = -99, d2 = -99, d3 = -99;
        for (let d = 0; d < N; d++) {
            if (occ[t * N + d] === -1) continue;
            if (d2 >= 0 && d - d2 <= 2) v++;
            if (d3 >= 0 && d - d3 <= 4) v++;
            d3 = d2; d2 = d1; d1 = d;
        }
        return v;
    };

    // ── 4. 초기 배치 ──
    units.forEach((u, ui) => { if (u.locked) place(ui, u.start); });
    const order = units.map((_, i) => i).filter(i => !units[i].locked);
    shuffle(order, rng);
    order.sort((x, y) => units[y].games.length - units[x].games.length); // 2연전 먼저(안정 정렬)
    const localHard = (t: number, d: number): number => {
        // d에 경기를 추가했을 때 생기는 3-in-3 / 4-in-5 수 (주변 창만 확인)
        let v = 0;
        for (let s = d - 2; s <= d; s++) {
            let c = 0;
            for (let k = s; k < s + 3; k++) if (k >= 0 && k < N && (k === d || occ[t * N + k] !== -1)) c++;
            if (c >= 3) v++;
        }
        for (let s = d - 4; s <= d; s++) {
            let c = 0;
            for (let k = s; k < s + 5; k++) if (k >= 0 && k < N && (k === d || occ[t * N + k] !== -1)) c++;
            if (c >= 4) v++;
        }
        return v;
    };
    const adjacent = (t: number, d: number) => (d > 0 && occ[t * N + d - 1] !== -1 ? 1 : 0) + (d < N - 1 && occ[t * N + d + 1] !== -1 ? 1 : 0);
    for (const ui of order) {
        const u = units[ui];
        let best = -1, bestScore = Infinity;
        for (let s = 0; s < N; s++) {
            if (!canPlace(ui, s)) continue;
            let score = rng() * 0.5;
            for (const off of u.offsets) {
                const d = s + off;
                score += 1000 * (localHard(u.h, d) + localHard(u.a, d));
                score += 3 * (adjacent(u.h, d) + adjacent(u.a, d));
                score -= 2 * (target[d] - cnt[d]);
            }
            if (score < bestScore) { bestScore = score; best = s; }
        }
        if (best < 0) {
            // 둘 다 비어 있는 open 날이 없을 때(이론상 거의 없음) — 2연전이면 단일 경기로 풀어서 다시 시도
            for (let s = 0; s < N && best < 0; s++) if (canPlace(ui, s)) best = s;
        }
        if (best < 0 && u.games.length > 1) {
            const g2 = u.games.pop()!; u.offsets.pop();
            const nu = units.push({ games: [g2], offsets: [0], h: gHome[g2], a: gAway[g2], locked: false, start: -1 }) - 1;
            unitOfGame[g2] = nu;
            for (let s = 0; s < N && best < 0; s++) if (canPlace(ui, s)) best = s;
            let b2 = -1;
            for (let s = 0; s < N && b2 < 0; s++) if (s !== best && canPlace(nu, s)) b2 = s;
            if (b2 >= 0) place(nu, b2);
        }
        if (best >= 0) place(ui, best);
    }

    // ── 5. 다듬기 (담금질) ──
    const tc = new Float64Array(T);
    for (let t = 0; t < T; t++) tc[t] = teamCost(t);
    let total = 0;
    for (let t = 0; t < T; t++) total += tc[t];
    for (let d = 0; d < N; d++) total += dayCost(d);

    const movable = units.map((_, i) => i).filter(i => !units[i].locked && units[i].start >= 0);
    const singles = movable.filter(i => units[i].games.length === 1);
    const iterations = input.iterations ?? SA_ITERATIONS;
    const cooling = Math.pow(SA_T1 / SA_T0, 1 / Math.max(1, iterations));
    let temp = SA_T0;
    for (let it = 0; it < iterations; it++, temp *= cooling) {
        if (rng() < 0.7) {
            // 이동: 단위를 다른 날로 (절반은 ±10일 안, 절반은 전체 범위)
            const ui = movable[Math.floor(rng() * movable.length)];
            const u = units[ui];
            const from = u.start;
            const to = rng() < 0.5 ? from + (1 + Math.floor(rng() * 10)) * (rng() < 0.5 ? -1 : 1) : Math.floor(rng() * N);
            if (to === from) continue;
            const daysTouched = new Set<number>();
            u.offsets.forEach(o => { daysTouched.add(from + o); daysTouched.add(to + o); });
            let before = tc[u.h] + tc[u.a];
            for (const d of daysTouched) if (d >= 0 && d < N) before += dayCost(d);
            unplace(ui);
            if (!canPlace(ui, to)) { place(ui, from); continue; }
            place(ui, to);
            const nh = teamCost(u.h), na = teamCost(u.a);
            let after = nh + na;
            for (const d of daysTouched) if (d >= 0 && d < N) after += dayCost(d);
            const delta = after - before;
            if (delta <= 0 || rng() < Math.exp(-delta / temp)) {
                tc[u.h] = nh; tc[u.a] = na; total += delta;
            } else {
                unplace(ui); place(ui, from);
            }
        } else {
            // 맞바꾸기: 서로 다른 4팀의 단일 경기 두 개의 날짜 교환 (날짜별 경기 수 불변)
            const u1i = singles[Math.floor(rng() * singles.length)];
            const u2i = singles[Math.floor(rng() * singles.length)];
            const u1 = units[u1i], u2 = units[u2i];
            const d1 = u1.start, d2 = u2.start;
            if (d1 === d2 || u1.h === u2.h || u1.h === u2.a || u1.a === u2.h || u1.a === u2.a) continue;
            if (occ[u1.h * N + d2] !== -1 || occ[u1.a * N + d2] !== -1 || occ[u2.h * N + d1] !== -1 || occ[u2.a * N + d1] !== -1) continue;
            const ts = [u1.h, u1.a, u2.h, u2.a];
            const before = tc[ts[0]] + tc[ts[1]] + tc[ts[2]] + tc[ts[3]];
            unplace(u1i); unplace(u2i);
            place(u1i, d2); place(u2i, d1);
            const after4 = ts.map(teamCost);
            const delta = after4[0] + after4[1] + after4[2] + after4[3] - before;
            if (delta <= 0 || rng() < Math.exp(-delta / temp)) {
                ts.forEach((t, k) => { tc[t] = after4[k]; }); total += delta;
            } else {
                unplace(u1i); unplace(u2i);
                place(u1i, d1); place(u2i, d2);
            }
        }
    }

    let hardViolations = 0;
    for (let t = 0; t < T; t++) hardViolations += hardCount(t);
    const scheduled: { date: string; matchup: OptMatchup }[] = [];
    for (let g = 0; g < G; g++) if (gameDay[g] >= 0) scheduled.push({ date: dates[gameDay[g]], matchup: matchups[g] });
    return { scheduled, stats: { hardViolations, cost: Math.round(total), seriesUnits } };
}
