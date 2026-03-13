/**
 * NBA 시즌 일정 자동생성 알고리즘
 *
 * NBA 실제 경기 배분 공식 (전통 방식, 82경기):
 * - 같은 디비전 4팀 × 4경기 (2H/2A) = 16
 * - 같은 컨퍼런스 비디비전 Group A: 6팀 × 4경기 (2H/2A) = 24
 * - 같은 컨퍼런스 비디비전 Group B: 4팀 × 3경기 = 12
 * - 다른 컨퍼런스 15팀 × 2경기 (1H/1A) = 30
 * - 합계: 82
 *
 * 독립 모듈 — 기존 코드 연동 없이 단독 실행 가능.
 * 멀티시즌 작업 시 연동 예정.
 */

import { Game } from '../types/game';
import { TEAM_DATA, TeamStaticData } from '../data/teamData';

// ── 설정 인터페이스 ──

export interface ScheduleConfig {
    seasonYear: number;          // 2025 → "2025-26 시즌"
    seasonStart: string;         // '2025-10-21' (ISO date)
    regularSeasonEnd: string;    // '2026-04-12'
    allStarStart: string;        // '2026-02-13'
    allStarEnd: string;          // '2026-02-18'
    seed?: number;               // 기본값: seasonYear
}

// ── 내부 타입 ──

interface Matchup {
    homeTeamId: string;
    awayTeamId: string;
}

// ── Seeded PRNG (Mulberry32) ──

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

// ── 날짜 유틸 ──

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

// ── 팀 그룹핑 ──

interface TeamGroups {
    teamIds: string[];
    conferences: Record<string, string[]>;          // 'East' | 'West' → teamIds
    divisions: Record<string, string[]>;            // division name → teamIds
    teamConference: Record<string, string>;         // teamId → conference
    teamDivision: Record<string, string>;           // teamId → division
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

// ── Step 2: 매치업 생성 ──

function generateMatchups(
    groups: TeamGroups,
    rng: () => number
): Matchup[] {
    const matchups: Matchup[] = [];
    const { teamIds, conferences, divisions, teamConference, teamDivision } = groups;

    // 2-1. 디비전 경기: 4팀 × 4경기 (2H/2A)
    for (const divTeams of Object.values(divisions)) {
        for (let i = 0; i < divTeams.length; i++) {
            for (let j = i + 1; j < divTeams.length; j++) {
                // 2 home for i, 2 home for j
                matchups.push({ homeTeamId: divTeams[i], awayTeamId: divTeams[j] });
                matchups.push({ homeTeamId: divTeams[i], awayTeamId: divTeams[j] });
                matchups.push({ homeTeamId: divTeams[j], awayTeamId: divTeams[i] });
                matchups.push({ homeTeamId: divTeams[j], awayTeamId: divTeams[i] });
            }
        }
    }

    // 2-2. 같은 컨퍼런스, 다른 디비전 → Group A (4경기) / Group B (3경기)
    for (const conf of ['East', 'West']) {
        const confTeams = conferences[conf];
        const confDivisions = [...new Set(confTeams.map(t => teamDivision[t]))];

        // 비디비전 페어 수집
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

        // 각 팀의 비디비전 상대는 10팀. 그 중 6팀=4경기(Group A), 4팀=3경기(Group B)
        // 컨퍼런스당 45 페어 = Group A, 30 페어 = Group B
        //
        // 수학적으로 정확한 배정: 각 디비전 페어(5×5)에서 정확히 15 Group A 페어 선택.
        // 3개 디비전 조합 × 15 = 45 Group A → 각 팀 = 3+3 = 6 Group A 상대.
        // 방법: 순환 순열 3개로 3-regular bipartite subgraph 생성.
        const pairGameCount: Map<string, 4 | 3> = new Map();

        // 디비전 페어별로 Group A 배정
        for (let di = 0; di < confDivisions.length; di++) {
            for (let dj = di + 1; dj < confDivisions.length; dj++) {
                const dTeamsI = divisions[confDivisions[di]];
                const dTeamsJ = divisions[confDivisions[dj]];

                // 3개 순환 순열로 15 Group A 페어 결정
                // 순열 기본 오프셋을 seed로 변형
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

                // 모든 5×5 페어에 대해 Group A/B 결정
                for (const ti of dTeamsI) {
                    for (const tj of dTeamsJ) {
                        const key = ti < tj ? `${ti}-${tj}` : `${tj}-${ti}`;
                        if (groupAPairs.has(key)) {
                            pairGameCount.set(key, 4);
                        } else {
                            pairGameCount.set(key, 3);
                        }
                    }
                }
            }
        }

        // 매치업 추가
        for (const [ti, tj] of crossDivPairs) {
            const key = ti < tj ? `${ti}-${tj}` : `${tj}-${ti}`;
            const count = pairGameCount.get(key)!;

            if (count === 4) {
                // 2H/2A
                matchups.push({ homeTeamId: ti, awayTeamId: tj });
                matchups.push({ homeTeamId: ti, awayTeamId: tj });
                matchups.push({ homeTeamId: tj, awayTeamId: ti });
                matchups.push({ homeTeamId: tj, awayTeamId: ti });
            } else {
                // 3경기: seed로 누가 2홈인지 결정
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

    // 2-3. 인터컨퍼런스: 15 × 15 = 225 페어, 각 2경기 (1H/1A)
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

// ── H/A 밸런스 보정 ──

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

    // 반복 보정: 홈 초과 팀의 매치업을 스왑
    for (let pass = 0; pass < 50; pass++) {
        let balanced = true;
        for (const t of teamIds) {
            if (homeCount[t] !== 41) {
                balanced = false;
                break;
            }
        }
        if (balanced) break;

        for (let i = 0; i < matchups.length; i++) {
            const m = matchups[i];
            const h = m.homeTeamId;
            const a = m.awayTeamId;

            // 홈팀이 홈 초과 & 원정팀이 홈 부족 → 스왑
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

// ── Step 3: 날짜 배정 (Rest-First 알고리즘) ──
//
// 핵심 아이디어: 각 날짜에 대해 "쉰 팀" 우선 배정.
// 2-phase per day: Phase A (non-B2B만), Phase B (B2B 허용, 예산 내)

function assignDates(
    matchups: Matchup[],
    calendar: string[],
    teamIds: string[],
    rng: () => number
): { date: string; matchup: Matchup }[] {
    const totalGames = matchups.length;

    // 팀별 스케줄된 날짜 Set + 마지막 경기일
    const teamDates: Record<string, Set<string>> = {};
    const teamB2BCount: Record<string, number> = {};
    for (const t of teamIds) {
        teamDates[t] = new Set();
        teamB2BCount[t] = 0;
    }

    // 날짜 유틸 캐시
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

    // 매치업 풀
    const poolIndices = matchups.map((_, i) => i);
    seededShuffle(poolIndices, rng);
    const inPool = new Array(matchups.length).fill(true);
    let poolSize = matchups.length;

    const scheduled: { date: string; matchup: Matchup }[] = [];

    // B2B 목표: 팀당 12~15회
    const B2B_BUDGET = 15;

    for (let di = 0; di < calendar.length; di++) {
        const dateStr = calendar[di];
        const remaining = totalGames - scheduled.length;
        const remainingDays = calendar.length - di;
        const target = Math.round(remaining / remainingDays);
        const maxForDay = Math.min(15, target + 2);
        let scheduledToday = 0;

        // Phase A: non-B2B 매치업 먼저 (target-1 만큼 — 1자리를 B2B용으로 남겨둠)
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

        // Phase B: B2B 매치업 배정 (한 팀만 B2B, 예산 내)
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
                // non-B2B — Phase A에서 부족한 경우 여기서 채움
                teamDates[homeTeamId].add(dateStr);
                teamDates[awayTeamId].add(dateStr);
                scheduled.push({ date: dateStr, matchup: matchups[mi] });
                inPool[mi] = false;
                poolSize--;
                scheduledToday++;
                continue;
            }

            // B2B 매치업
            if (hB2B && aB2B) continue; // 양쪽 B2B 회피
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

    // Pass 2: 미배치 → B2B 예산 무시, 3-in-3만 방지
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

    // 미배치 경기가 남았으면 경고 (3-in-3을 허용하지 않음)

    return scheduled;
}

// ── Step 4: B2B 후처리 ──

function balanceBackToBacks(
    scheduled: { date: string; matchup: Matchup }[],
    calendar: string[],
    teamIds: string[]
): void {
    const MAX_B2B = 16;
    const dateSet = new Set(calendar);

    // 팀별 B2B 카운트 재계산
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

    // 날짜별 팀 사용 맵
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
            // 이 팀의 경기 중 B2B 파트인 것 찾기
            const teamGames = scheduled
                .map((s, idx) => ({ ...s, idx }))
                .filter(s => s.matchup.homeTeamId === team || s.matchup.awayTeamId === team)
                .sort((a, b) => a.date.localeCompare(b.date));

            for (let i = 1; i < teamGames.length; i++) {
                if (addDays(teamGames[i - 1].date, 1) !== teamGames[i].date) continue;

                // B2B 발견 — 두 번째 경기를 이동 시도
                const game = teamGames[i];
                const otherTeam = game.matchup.homeTeamId === team
                    ? game.matchup.awayTeamId : game.matchup.homeTeamId;

                // 1~3일 뒤로 이동 시도
                for (let shift = 1; shift <= 3; shift++) {
                    const newDate = addDays(game.date, shift);
                    if (!dateSet.has(newDate)) continue;
                    if (!dateTeamMap[newDate]) continue;
                    if (dateTeamMap[newDate].has(team)) continue;
                    if (dateTeamMap[newDate].has(otherTeam)) continue;
                    if (dateTeamMap[newDate].size >= 15) continue;

                    // 이동해도 새로운 3-in-3이 생기지 않는지 확인
                    const prev1 = addDays(newDate, -1);
                    const prev2 = addDays(newDate, -2);
                    const teamHasPrev1 = dateTeamMap[prev1]?.has(team);
                    const teamHasPrev2 = dateTeamMap[prev2]?.has(team);
                    if (teamHasPrev1 && teamHasPrev2) continue;
                    const otherHasPrev1 = dateTeamMap[prev1]?.has(otherTeam);
                    const otherHasPrev2 = dateTeamMap[prev2]?.has(otherTeam);
                    if (otherHasPrev1 && otherHasPrev2) continue;

                    // 이동 실행
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

// ── Step 5: 검증 ──

export interface ScheduleValidation {
    totalGames: number;
    valid: boolean;
    errors: string[];
    teamStats: Record<string, {
        total: number;
        home: number;
        away: number;
        b2b: number;
        divisionGames: number;
        confGames: number;
        interConfGames: number;
    }>;
}

export function validateSchedule(
    games: Game[],
    teamData: Record<string, TeamStaticData>
): ScheduleValidation {
    const errors: string[] = [];
    const teamIds = Object.keys(teamData);

    const teamStats: ScheduleValidation['teamStats'] = {};
    for (const t of teamIds) {
        teamStats[t] = { total: 0, home: 0, away: 0, b2b: 0, divisionGames: 0, confGames: 0, interConfGames: 0 };
    }

    // 카운트
    const teamDates: Record<string, string[]> = {};
    for (const t of teamIds) teamDates[t] = [];

    for (const g of games) {
        teamStats[g.homeTeamId].total++;
        teamStats[g.homeTeamId].home++;
        teamStats[g.awayTeamId].total++;
        teamStats[g.awayTeamId].away++;

        teamDates[g.homeTeamId].push(g.date);
        teamDates[g.awayTeamId].push(g.date);

        const hConf = teamData[g.homeTeamId]?.conference;
        const aConf = teamData[g.awayTeamId]?.conference;
        const hDiv = teamData[g.homeTeamId]?.division;
        const aDiv = teamData[g.awayTeamId]?.division;

        if (hConf === aConf) {
            if (hDiv === aDiv) {
                teamStats[g.homeTeamId].divisionGames++;
                teamStats[g.awayTeamId].divisionGames++;
            }
            teamStats[g.homeTeamId].confGames++;
            teamStats[g.awayTeamId].confGames++;
        } else {
            teamStats[g.homeTeamId].interConfGames++;
            teamStats[g.awayTeamId].interConfGames++;
        }
    }

    // B2B 계산
    for (const t of teamIds) {
        const dates = teamDates[t].sort();
        for (let i = 1; i < dates.length; i++) {
            if (addDays(dates[i - 1], 1) === dates[i]) {
                teamStats[t].b2b++;
            }
        }
    }

    // 검증
    if (games.length !== 1230) {
        errors.push(`총 경기 수: ${games.length} (expected 1230)`);
    }

    for (const t of teamIds) {
        const s = teamStats[t];
        if (s.total !== 82) errors.push(`${t}: 총 ${s.total}경기 (expected 82)`);
        if (s.home !== 41) errors.push(`${t}: 홈 ${s.home}경기 (expected 41)`);
        if (s.away !== 41) errors.push(`${t}: 원정 ${s.away}경기 (expected 41)`);
        if (s.divisionGames !== 16) errors.push(`${t}: 디비전 ${s.divisionGames}경기 (expected 16)`);
        if (s.interConfGames !== 30) errors.push(`${t}: 인터컨퍼런스 ${s.interConfGames}경기 (expected 30)`);
    }

    // 같은 날 2경기 체크
    for (const t of teamIds) {
        const dates = teamDates[t].sort();
        for (let i = 1; i < dates.length; i++) {
            if (dates[i] === dates[i - 1]) {
                errors.push(`${t}: 같은 날 2경기 (${dates[i]})`);
            }
        }
    }

    // 3-in-3 체크
    for (const t of teamIds) {
        const dates = teamDates[t].sort();
        for (let i = 2; i < dates.length; i++) {
            if (addDays(dates[i - 2], 1) === dates[i - 1] &&
                addDays(dates[i - 1], 1) === dates[i]) {
                errors.push(`${t}: 3-in-3 (${dates[i - 2]}, ${dates[i - 1]}, ${dates[i]})`);
            }
        }
    }

    return {
        totalGames: games.length,
        valid: errors.length === 0,
        errors,
        teamStats,
    };
}

// ── 메인 함수 ──

export function generateSeasonSchedule(
    config: ScheduleConfig,
    teamData: Record<string, TeamStaticData> = TEAM_DATA
): Game[] {
    const seed = config.seed ?? config.seasonYear;
    const rng = createRng(seed);

    // 1. 팀 그룹핑
    const groups = buildTeamGroups(teamData);

    // 2. 매치업 생성
    const matchups = generateMatchups(groups, rng);

    // 3. H/A 밸런스 보정
    balanceHomeAway(matchups, groups.teamIds, rng);

    // 4. 캘린더 구축
    const calendar = buildCalendar(config);

    // 5. 날짜 배정
    const scheduled = assignDates(matchups, calendar, groups.teamIds, rng);

    // 6. B2B 후처리
    balanceBackToBacks(scheduled, calendar, groups.teamIds);

    // 7. 날짜순 정렬 후 Game[] 변환
    scheduled.sort((a, b) => a.date.localeCompare(b.date));

    const games: Game[] = scheduled.map(s => ({
        id: `g_${s.matchup.homeTeamId}_${s.matchup.awayTeamId}_${s.date}`,
        homeTeamId: s.matchup.homeTeamId,
        awayTeamId: s.matchup.awayTeamId,
        date: s.date,
        played: false,
        isPlayoff: false,
    }));

    return games;
}
