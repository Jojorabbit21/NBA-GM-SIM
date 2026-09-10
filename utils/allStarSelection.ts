/**
 * 멀티플레이어 올스타 선발 로직 + 관련 키데이트.
 *
 * ## 스타터(선발 5명 — 가드 2 + 프론트코트 3) — 팬 투표, 누적 시뮬레이션
 * [2026-09-08 재설계] 올스타는 사실상 인기투표라는 전제로 설계:
 *   appeal = 인기도×0.6 + 시즌 성적(정규화)×0.25 + 브레이크아웃 보너스
 *   브레이크아웃 보너스 = max(0, 성적정규화 - 인기도) × 0.5
 *     → 인지도는 낮은데 성적이 그걸 크게 앞지르는 "떠오르는 스타"에게 추가 가산.
 * 득표수는 컨퍼런스당 TOTAL_VOTERS_PER_CONFERENCE(400만, 현실적인 시청자 스케일 근사치)를
 * 각 포지션 그룹(가드/프론트코트) 내에서 appeal 기반 멱함수 가중치로 나눠 갖는 방식으로
 * 계산한다 — 개별 유권자 400만 명을 실제로 반복 시뮬레이션하는 대신 "기대 득표수"를 직접
 * 계산(연산량 문제 + 대수의 법칙으로 어차피 수렴하는 값이라 개별 시뮬레이션이 무의미).
 * voteProgress(0~1, 투표 시작 대비 경과 비율)를 넘기면 그 시점까지 누적된 득표수를 그대로
 * 재현 가능하게 돌려주므로, 중간 발표(2~3회)마다 DB에 별도 스냅샷을 저장할 필요 없이
 * 그때그때 다시 계산해서 보여줄 수 있다.
 *
 * ## 리저브(후보 7명 — 가드 2 + 프론트코트 3 + 와일드카드 2) — 코치 투표, 성적 기반
 * 스타터(팬 투표 최종 결과) 제외 풀에서 awardVoting.ts의 scoreAllNBA로 100인 투표
 * 시뮬레이션 — 실제로도 코치는 인기가 아니라 실력으로 리저브를 뽑으므로 이 부분엔
 * 인기도를 섞지 않는다.
 *
 * server/src/shared/multi/allStarSelection.ts와 미러 — 로직을 바꿀 땐 양쪽 다 같이 고칠 것.
 */

import type { Team, Player } from '../types';
import type { PlayerPopularity } from '../types/player';
import {
    buildCandidates, positionGroup, voterNoise, scoreAllNBA,
    type AwardCandidate, type AwardStatLine,
} from './awardVoting';

// ══════════════════════════════════════════════════════════════════════════
// 키데이트
// ══════════════════════════════════════════════════════════════════════════

export interface AllStarKeyDates {
    allStarVoteStart: string;
    /** 중간 결과 발표일 3회 — 투표 기간의 1/4·2/4·3/4 지점(뉴스 발행용). */
    allStarVoteInterimDates: string[];
    allStarVoteEnd: string;
    /** 스타터/리저브 확정 발표일 — 투표 마감과 동일 시점(마감 즉시 집계해 바로 발표). */
    allStarSelectionDate: string;
    allStarStart: string;
    allStarEnd: string;
    /** [2026-09-08] 3점 챌린지 실제 이벤트(슈팅 시뮬레이션) 실행일 — 참가 명단 발표일
     *  (allStarStart)과 분리(사용자 확인 — allStarStart+2일, 실제 NBA "토요일 나이트"
     *  포지션과 동일하게 본경기보다 앞서 열리도록). 참가 명단 발표(allstar_three_point_contest
     *  뉴스)는 여전히 allStarStart에 나가고, 이 날짜는 향후 실제 슈팅 시뮬레이션 로직이
     *  붙을 때 트리거로 쓰기 위해 미리 계산해두는 값(현재는 시뮬레이션 자체가 미구현). */
    allStarThreePointContestDate: string;
    /** [2026-09-09] 덩크 컨테스트 실제 이벤트 실행일 — 실제 NBA도 3점 챌린지와 같은
     *  "올스타 토요일 나이트"에 함께 열리므로 allStarThreePointContestDate와 동일하게
     *  allStarStart+2일로 맞춤. 참가 명단 발표(allstar_dunk_contest 뉴스)는 여전히
     *  allStarStart에 나가고, 이 날짜는 서신 본문 안내 문구용 + 향후 실제 덩크 시뮬레이션
     *  로직이 붙을 때 트리거로 쓰기 위해 미리 계산해둔다(현재는 시뮬레이션 자체가 미구현). */
    allStarDunkContestDate: string;
    /** [2026-09-08] 라이징스타 챌린지 실제 경기 실행일 — 사용자 확인, 실제 NBA 순서(금:
     *  라이징스타 → 토:3점/덩크 → 일:본경기)를 그대로 따라 allStarStart+1일(3점 챌린지보다
     *  하루 앞섬). 현재는 실제 5v5 시뮬레이션이 미구현이라 서신 본문 안내 문구용으로만 쓰임. */
    allStarRisingStarsDate: string;
    /** [2026-09-08] 올스타 본경기 실제 실행일 — 사용자 확인, allStarStart+3일(3점 챌린지
     *  다음날, 실제 NBA "일요일" 포지션). 현재는 본경기 시뮬레이션 자체가 미구현이라 서신
     *  본문 안내 문구용으로만 쓰임. */
    allStarMainGameDate: string;
}

function addDaysStr(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 팬 투표 기간(4주) — 실제 NBA도 크리스마스 무렵~2월 초까지 약 한 달간 투표를 받는다. */
const VOTE_WINDOW_DAYS = 28;

/** virtualSeasonYear(시즌 개막 연도) 기준 올스타 키데이트 전체. finalize.ts가 스케줄 생성
 *  시 쓰는 allStarStart/End(2월 13~18일)를 그대로 계산해주는 단일 소스이기도 하다 — 날짜를
 *  바꿀 땐 이 함수(및 서버 미러) 한 곳만 고치면 된다. */
export function getAllStarKeyDates(virtualSeasonYear: number): AllStarKeyDates {
    const allStarStart = `${virtualSeasonYear + 1}-02-13`;
    const allStarEnd = `${virtualSeasonYear + 1}-02-18`;
    const allStarSelectionDate = addDaysStr(allStarStart, -7);
    const allStarVoteEnd = allStarSelectionDate;
    const allStarVoteStart = addDaysStr(allStarVoteEnd, -VOTE_WINDOW_DAYS);
    const allStarVoteInterimDates = [1, 2, 3].map(q => addDaysStr(allStarVoteStart, Math.round(VOTE_WINDOW_DAYS * q / 4)));
    const allStarThreePointContestDate = addDaysStr(allStarStart, 2);
    const allStarDunkContestDate = addDaysStr(allStarStart, 2);
    const allStarRisingStarsDate = addDaysStr(allStarStart, 1);
    const allStarMainGameDate = addDaysStr(allStarStart, 3);
    return {
        allStarVoteStart, allStarVoteInterimDates, allStarVoteEnd, allStarSelectionDate, allStarStart, allStarEnd,
        allStarThreePointContestDate, allStarDunkContestDate, allStarRisingStarsDate, allStarMainGameDate,
    };
}

// ══════════════════════════════════════════════════════════════════════════
// 팬 투표(스타터) — 누적 득표 시뮬레이션
// ══════════════════════════════════════════════════════════════════════════

export interface AllStarVoteEntry {
    playerId: string; playerName: string; teamId: string; position: string; ovr: number;
    posGroup: 'G' | 'FC';
    votes: number;
    /** 0~1 — 같은 포지션 그룹(가드/프론트코트) 내 득표율. formatAwardPct 등 codebase 관례와
     *  동일하게 0~1 분수로 저장(표시할 때 ×100). */
    pct: number;
    /** 0~100, 표시용(local×0.3 + national×0.7 블렌드) */
    popularity: number;
    /** 성적이 인기도를 앞지르는 정도 — 클수록 "요즘 뜨는 중"인 브레이크아웃 후보. */
    breakoutBonus: number;
    statLine: AwardStatLine;
}

export interface ConferenceVoteLeaderboard {
    conference: 'East' | 'West';
    /** 득표순 정렬 — 상위 2명이 스타터 가드. */
    guards: AllStarVoteEntry[];
    /** 득표순 정렬 — 상위 3명이 스타터 프론트코트(포워드+센터). */
    frontcourt: AllStarVoteEntry[];
}

export interface AllStarVoteResult {
    east: ConferenceVoteLeaderboard;
    west: ConferenceVoteLeaderboard;
}

/** 컨퍼런스당 팬 투표 참여 시청자 수 근사치 — 리그 전체 팬덤 규모를 감안한 현실적인 스케일. */
const TOTAL_VOTERS_PER_CONFERENCE = 4_000_000;
const POPULARITY_WEIGHT = 0.6;
const PERFORMANCE_WEIGHT = 0.25;
const BREAKOUT_WEIGHT = 0.5;
/** 득표 쏠림 지수(멱함수) — 클수록 상위 후보가 득표를 훨씬 많이 가져가는 "스타 쏠림"을 재현. */
const SHARE_EXPONENT = 3;

function popularityScore(p: PlayerPopularity | undefined): number {
    if (!p) return 25; // 인기도 데이터 없는 생성 선수 폴백(무명 취급)
    return p.local * 0.3 + p.national * 0.7;
}

function buildPopularityMap(teams: Team[]): Map<string, PlayerPopularity | undefined> {
    const m = new Map<string, PlayerPopularity | undefined>();
    for (const team of teams) for (const p of team.roster) m.set(p.id, p.popularity);
    return m;
}

function computeGroupVotes(
    group: AwardCandidate[], popMap: Map<string, PlayerPopularity | undefined>,
    seed: string, category: string, voteProgress: number,
): AllStarVoteEntry[] {
    if (group.length === 0) return [];

    // 성적 정규화 기준(같은 그룹 내 min-max) — 인기도(0~100)와 같은 스케일로 맞춰야
    // 두 항을 의미 있게 더할 수 있다.
    const perfScores = group.map(c => scoreAllNBA(c, 0));
    const perfMin = Math.min(...perfScores);
    const perfMax = Math.max(...perfScores);

    const scored = group.map((c, i) => {
        const popularity = popularityScore(popMap.get(c.playerId));
        const perfNorm = perfMax > perfMin ? ((perfScores[i] - perfMin) / (perfMax - perfMin)) * 100 : 50;
        const breakoutBonus = Math.max(0, perfNorm - popularity) * BREAKOUT_WEIGHT;
        const noise = voterNoise(seed, 0, `${category}_${c.playerId}`);
        const appeal = Math.max(0.01, (popularity * POPULARITY_WEIGHT + perfNorm * PERFORMANCE_WEIGHT + breakoutBonus) * (1 + noise));
        return { c, popularity, breakoutBonus, weight: Math.pow(appeal, SHARE_EXPONENT) };
    });

    const totalWeight = scored.reduce((sum, x) => sum + x.weight, 0);

    const withVotes = scored.map(x => {
        const share = totalWeight > 0 ? x.weight / totalWeight : 1 / scored.length;
        // 체크포인트별 약간의 흔들림(득표 페이스가 매일 완전히 균일하진 않음) — 시드
        // 고정이라 같은 progress를 다시 넣으면 항상 같은 값이 재현된다.
        const paceJitter = 1 + voterNoise(seed, 1, `${category}_pace_${x.c.playerId}`) * 0.1;
        const votes = Math.max(0, Math.round(TOTAL_VOTERS_PER_CONFERENCE * voteProgress * share * paceJitter));
        return { x, votes };
    });

    // 득표율(pct)은 jitter가 반영된 실제 votes 기준으로 다시 계산 — 그룹 내 pct 합이
    // 항상 100%에 가깝게 나오도록(이론상 share가 아니라 표시되는 votes와 일치시킴).
    const totalVotes = withVotes.reduce((sum, w) => sum + w.votes, 0);

    return withVotes
        .map(({ x, votes }) => ({
            playerId: x.c.playerId, playerName: x.c.playerName, teamId: x.c.teamId,
            position: x.c.position, ovr: x.c.ovr,
            posGroup: (positionGroup(x.c.position) === 'Guard' ? 'G' : 'FC') as 'G' | 'FC',
            votes, pct: totalVotes > 0 ? votes / totalVotes : 0,
            popularity: Math.round(x.popularity), breakoutBonus: Math.round(x.breakoutBonus * 10) / 10,
            statLine: { ...x.c.statLine },
        }))
        .sort((a, b) => b.votes - a.votes);
}

function computeConferenceVotes(
    confTeams: Team[], conference: 'East' | 'West', seed: string, voteProgress: number,
): ConferenceVoteLeaderboard {
    const { candidates } = buildCandidates(confTeams);
    const popMap = buildPopularityMap(confTeams);
    const guards = candidates.filter(c => positionGroup(c.position) === 'Guard');
    const frontcourt = candidates.filter(c => positionGroup(c.position) !== 'Guard');
    return {
        conference,
        guards: computeGroupVotes(guards, popMap, seed, `${conference}_starter_g`, voteProgress),
        frontcourt: computeGroupVotes(frontcourt, popMap, seed, `${conference}_starter_fc`, voteProgress),
    };
}

/**
 * voteProgress(0~1, 투표 시작 대비 경과 비율)로 그 시점까지의 누적 득표 리더보드를 구한다
 * — "올스타 화면 투표 탑 리스트"가 그대로 쓸 수 있는 전체 순위(컨퍼런스별 가드/프론트코트
 * 각 그룹 전원, 득표순 정렬). seed를 고정하면 같은 progress에 대해 항상 같은 결과가 나와
 * 중간 발표 시점마다 DB에 스냅샷을 저장할 필요 없이 그때그때 재계산해 보여줄 수 있다.
 * progress=1.0이 투표 마감 최종 결과 — 스타터 확정에 쓰인다(아래 runAllStarSelection).
 */
export function runAllStarVote(teams: Team[], seed: string, voteProgress: number): AllStarVoteResult {
    const clamped = Math.max(0, Math.min(1, voteProgress));
    return {
        east: computeConferenceVotes(teams.filter(t => t.conference === 'East'), 'East', seed, clamped),
        west: computeConferenceVotes(teams.filter(t => t.conference === 'West'), 'West', seed, clamped),
    };
}

// ══════════════════════════════════════════════════════════════════════════
// 코치 투표(리저브) — 스타터 제외 풀, 성적 기반(인기도 미반영)
// ══════════════════════════════════════════════════════════════════════════

export interface AllStarPlayer {
    playerId: string; playerName: string; teamId: string; position: string; ovr: number;
    posGroup: 'G' | 'FC';
    slot: 'starter' | 'reserve';
    /** 스타터는 팬 득표수, 리저브/와일드카드는 코치 투표 포인트(득표수와 스케일이 다름). */
    votes: number;
    statLine: AwardStatLine;
}

export interface ConferenceAllStarRoster {
    conference: 'East' | 'West';
    /** 5명: 가드 2 + 프론트코트 3 */
    starters: AllStarPlayer[];
    /** 7명: 가드 2 + 프론트코트 3 + 와일드카드 2 */
    reserves: AllStarPlayer[];
}

export interface AllStarSelectionResult {
    east: ConferenceAllStarRoster;
    west: ConferenceAllStarRoster;
}

const RESERVE_VOTER_COUNT = 100;
const RESERVE_POINTS_GUARD = [3, 1];
const RESERVE_POINTS_FRONTCOURT = [3, 2, 1];
const WILDCARD_POINTS = [3, 1];

function scoreAndSort(group: AwardCandidate[], seed: string, voterId: number, category: string): { id: string; score: number }[] {
    return group
        .map(c => ({ id: c.playerId, score: scoreAllNBA(c, voterNoise(seed, voterId, `${category}_${c.playerId}`)) }))
        .sort((a, b) => b.score - a.score);
}

function tallyPositionVotes(
    guards: AwardCandidate[], frontcourt: AwardCandidate[], seed: string, category: string, voterCount: number,
): { guardPoints: Map<string, number>; fcPoints: Map<string, number> } {
    const guardPoints = new Map<string, number>();
    const fcPoints = new Map<string, number>();
    for (let v = 0; v < voterCount; v++) {
        const gSorted = scoreAndSort(guards, seed, v, `${category}_g`);
        const fcSorted = scoreAndSort(frontcourt, seed, v, `${category}_fc`);
        gSorted.slice(0, 2).forEach((s, i) => guardPoints.set(s.id, (guardPoints.get(s.id) ?? 0) + (RESERVE_POINTS_GUARD[i] ?? 0)));
        fcSorted.slice(0, 3).forEach((s, i) => fcPoints.set(s.id, (fcPoints.get(s.id) ?? 0) + (RESERVE_POINTS_FRONTCOURT[i] ?? 0)));
    }
    return { guardPoints, fcPoints };
}

function tallyWildcardVotes(pool: AwardCandidate[], seed: string, category: string, voterCount: number): Map<string, number> {
    const points = new Map<string, number>();
    for (let v = 0; v < voterCount; v++) {
        const sorted = scoreAndSort(pool, seed, v, category);
        sorted.slice(0, 2).forEach((s, i) => points.set(s.id, (points.get(s.id) ?? 0) + (WILDCARD_POINTS[i] ?? 0)));
    }
    return points;
}

function toAllStarPlayer(c: AwardCandidate, slot: 'starter' | 'reserve', votes: number): AllStarPlayer {
    return {
        playerId: c.playerId, playerName: c.playerName, teamId: c.teamId, position: c.position, ovr: c.ovr,
        posGroup: positionGroup(c.position) === 'Guard' ? 'G' : 'FC',
        slot, votes, statLine: { ...c.statLine },
    };
}

function pickTop(
    points: Map<string, number>, n: number, candidateMap: Map<string, AwardCandidate>, slot: 'starter' | 'reserve',
): AllStarPlayer[] {
    return Array.from(points.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([id, pts]) => toAllStarPlayer(candidateMap.get(id)!, slot, pts));
}

function selectConferenceReserves(
    confTeams: Team[], conference: 'East' | 'West', seed: string, starterIds: Set<string>,
): AllStarPlayer[] {
    const { candidates } = buildCandidates(confTeams);
    const candidateMap = new Map(candidates.map(c => [c.playerId, c]));
    const guards = candidates.filter(c => positionGroup(c.position) === 'Guard' && !starterIds.has(c.playerId));
    const frontcourt = candidates.filter(c => positionGroup(c.position) !== 'Guard' && !starterIds.has(c.playerId));

    const reserveVotes = tallyPositionVotes(guards, frontcourt, seed, `${conference}_reserve`, RESERVE_VOTER_COUNT);
    const positionReserveGuards = pickTop(reserveVotes.guardPoints, 2, candidateMap, 'reserve');
    const positionReserveFrontcourt = pickTop(reserveVotes.fcPoints, 3, candidateMap, 'reserve');
    const positionReserveIds = new Set([...positionReserveGuards, ...positionReserveFrontcourt].map(p => p.playerId));

    const wildcardPool = [...guards, ...frontcourt].filter(c => !positionReserveIds.has(c.playerId));
    const wildcardVotes = tallyWildcardVotes(wildcardPool, seed, `${conference}_wildcard`, RESERVE_VOTER_COUNT);
    const wildcardPicks = Array.from(wildcardVotes.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([id, pts]) => toAllStarPlayer(candidateMap.get(id)!, 'reserve', pts));

    return [...positionReserveGuards, ...positionReserveFrontcourt, ...wildcardPicks];
}

/**
 * 팬 투표(runAllStarVote, progress=1.0) 최종 결과로 스타터를 확정하고, 그 결과를 제외한
 * 풀에서 코치 투표(성적 기반, 인기도 미반영)로 후보 7명을 뽑는다. teams는 컨퍼런스 순위/
 * 전적이 반영된 리그 전체 로스터(Team[])여야 한다 — buildLeagueTeams()와 동일한 입력 요구사항.
 */
export function runAllStarSelection(teams: Team[], seed?: string): AllStarSelectionResult {
    const effectiveSeed = seed || String(Date.now());
    const voteResult = runAllStarVote(teams, effectiveSeed, 1.0);

    const buildRoster = (conference: 'East' | 'West', vote: ConferenceVoteLeaderboard): ConferenceAllStarRoster => {
        const starters: AllStarPlayer[] = [...vote.guards.slice(0, 2), ...vote.frontcourt.slice(0, 3)].map(e => ({
            playerId: e.playerId, playerName: e.playerName, teamId: e.teamId, position: e.position, ovr: e.ovr,
            posGroup: e.posGroup, slot: 'starter' as const, votes: e.votes, statLine: e.statLine,
        }));
        const starterIds = new Set(starters.map(p => p.playerId));
        const confTeams = teams.filter(t => t.conference === conference);
        const reserves = selectConferenceReserves(confTeams, conference, effectiveSeed, starterIds);
        return { conference, starters, reserves };
    };

    return {
        east: buildRoster('East', voteResult.east),
        west: buildRoster('West', voteResult.west),
    };
}

// ══════════════════════════════════════════════════════════════════════════
// 라이징스타 챌린지 — 투표 없음, 리그 전체 통합 성적 기준 선발
// ══════════════════════════════════════════════════════════════════════════
// [2026-09-08] 본올스타(스타터/리저브)와 달리 팬 투표가 필요 없다는 요청 — 컨퍼런스
// 구분 없이 리그 전체 YOS(연차)≤1(신인+2년차) 선수 중 scoreAllNBA(리저브 선발과 동일
// 스코어링, 인기도 미반영) 상위 20명을 뽑아 두 팀(10명씩)으로 나눈다. 팀 배정은 성적
// 순으로 정렬한 뒤 인덱스 홀짝으로 번갈아 배정 — 스네이크 드래프트와 동일한 효과로 두
// 팀의 평균 실력이 비슷해지도록 한다(1위 A팀, 2위 B팀, 3위 A팀... 순서).
//
// [2026-09-08 추가] 시즌 1인 리그처럼 아직 신인 드래프트가 한 번도 안 일어난 경우 YOS≤1
// 풀만으로는 20명을 못 채우는 경우가 실제로 나왔다("신인이 없으면 2년차에서 20명 뽑으면
// 되지 않나?" — 사용자 피드백). 그래서 YOS≤1 후보가 20명 미만이면 상한을 한 해씩
// (RISING_STARS_MAX_YOS_CEILING까지) 늘려가며 채운다 — "없으면 다음 연차에서" 요청을
// 일반화한 것. 상한 자체를 무한정 늘리지 않는 이유: 너무 늘리면 "라이징스타"라는 취지
// (젊은 선수 쇼케이스)에서 멀어지므로, 대략 신인 계약 기간(4년) 정도까지만 허용하고 그래도
// 부족하면 있는 인원만으로 진행한다(팀 인원이 10명 미만이 될 수 있음).
//
// [2026-09-08 추가] "팀A/팀B가 아니라 가장 뛰어난 두 루키를 주장으로 임명하고 그 성을
// 팀 이름으로 쓰고 싶다"는 요청 — 스네이크 배정(홀짝 교대)의 자연스러운 결과로 전체 1위는
// 항상 teamA[0], 전체 2위는 항상 teamB[0]이 되므로(각 팀에 배정되는 "첫 선수"가 곧 그 팀
// 내 최고 스코어러) 별도 드래프트 로직 없이 각 팀의 첫 배정자를 주장으로 지정하면 된다.
// 팀명은 주장의 표시 이름에서 마지막 공백 토큰(성)을 뽑아 구성 — DB 선수명이 전부 한국어
// 음역(예: "쿠퍼 플래그")이고 서양식 이름 음역 관례상 "이름 성" 순서로 저장돼 있어
// (feedback_db_player_names_korean.md), 마지막 토큰이 곧 성이 된다.

export interface RisingStarPlayer {
    playerId: string; playerName: string; teamId: string; position: string; ovr: number;
    posGroup: 'G' | 'FC';
    statLine: AwardStatLine;
    /** 그 팀 내 최고 스코어러(전체 1·2위) — 팀 주장. 표시용 팀 이름(teamAName/teamBName)의
     *  출처이기도 함. */
    isCaptain: boolean;
}

export interface RisingStarsResult {
    /** 10명 — teamA/teamB는 소속 실제 팀과 무관한 임의 라벨(컨퍼런스 구분 없음) */
    teamA: RisingStarPlayer[];
    teamB: RisingStarPlayer[];
    /** 각 팀 주장의 성(姓) — UI에서 "팀 " + 이 값으로 조합해 표시(예: "팀 플래그"). 후보가
     *  전혀 없는 극단적인 경우(팀이 비어있음) 대비 기본값 'A'/'B'로 폴백. */
    teamAName: string;
    teamBName: string;
}

/** "쿠퍼 플래그" → "플래그" — 서양식 이름의 한국어 음역은 "이름 성" 순서로 저장되므로
 *  마지막 공백 토큰이 성. 토큰이 하나뿐이면(성이 따로 분리 안 되는 이름) 전체를 그대로 씀. */
function extractSurname(fullName: string): string {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : fullName;
}

const RISING_STARS_ROSTER_SIZE = 10; // 팀당 인원
const RISING_STARS_TARGET_TOTAL = RISING_STARS_ROSTER_SIZE * 2; // 20명 — 이 인원을 채우는 게 목표
/** 0=신인, 1=2년차 — 기본 자격 상한. faValuation.ts/extensionEngine.ts가 쓰는
 *  "currentSeasonYear - draftYear" YOS 계산과 동일 공식이지만, 그쪽은 draftYear가 없는
 *  선수를 신인(0)으로 폴백하는 반면 여기선 반대로 자격 없음(false) 처리한다 — draftYear
 *  미상인 선수는 대개 올타임 레전드 등 명백한 비신인이라 신인으로 오분류하면 안 됨. */
const RISING_STARS_MAX_YOS = 1;
/** 기본 상한(YOS≤1)으로 20명을 못 채우면 이 값까지 한 해씩 상한을 늘려가며 재시도한다.
 *  4년차까지 허용하는 이유: 대략 신인 스케일 계약 기간과 맞춰 "아직 젊은 선수"라는 취지를
 *  넘어서지 않게 하기 위함 — 그래도 부족하면 그냥 있는 인원만으로 진행한다(20명 미만 가능). */
const RISING_STARS_MAX_YOS_CEILING = 4;

/**
 * teams는 컨퍼런스로 미리 나누지 말고 리그 전체(Team[])를 통째로 넘길 것 —
 * runAllStarSelection()과 달리 컨퍼런스 구분이 없는 이벤트라 buildCandidates()에도 전체를
 * 그대로 넘긴다. virtualSeasonYear는 getAllStarKeyDates()에 넘기는 값과 동일한 것을 쓸 것
 * (YOS 계산 기준 시즌).
 */
export function runRisingStarsSelection(teams: Team[], virtualSeasonYear: number, seed?: string): RisingStarsResult {
    const effectiveSeed = seed || String(Date.now());
    const { candidates, playerMap } = buildCandidates(teams);

    const eligibleUpToYos = (maxYos: number) => candidates.filter(c => {
        const draftYear = playerMap.get(c.playerId)?.draftYear;
        if (draftYear == null) return false;
        const yos = virtualSeasonYear - draftYear;
        return yos >= 0 && yos <= maxYos;
    });

    let maxYos = RISING_STARS_MAX_YOS;
    let eligible = eligibleUpToYos(maxYos);
    while (eligible.length < RISING_STARS_TARGET_TOTAL && maxYos < RISING_STARS_MAX_YOS_CEILING) {
        maxYos += 1;
        eligible = eligibleUpToYos(maxYos);
    }

    const ranked = eligible
        .map(c => ({ c, score: scoreAllNBA(c, voterNoise(effectiveSeed, 0, `risingstars_${c.playerId}`)) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, RISING_STARS_TARGET_TOTAL)
        .map(({ c }) => c);

    const toRisingStarPlayer = (c: AwardCandidate, isCaptain: boolean): RisingStarPlayer => ({
        playerId: c.playerId, playerName: c.playerName, teamId: c.teamId, position: c.position, ovr: c.ovr,
        posGroup: positionGroup(c.position) === 'Guard' ? 'G' : 'FC',
        statLine: { ...c.statLine },
        isCaptain,
    });

    const teamA: RisingStarPlayer[] = [];
    const teamB: RisingStarPlayer[] = [];
    ranked.forEach((c, i) => {
        const target = i % 2 === 0 ? teamA : teamB;
        target.push(toRisingStarPlayer(c, target.length === 0)); // 각 팀 첫 배정자 = 주장
    });

    return {
        teamA, teamB,
        teamAName: teamA[0] ? extractSurname(teamA[0].playerName) : 'A',
        teamBName: teamB[0] ? extractSurname(teamB[0].playerName) : 'B',
    };
}

// ══════════════════════════════════════════════════════════════════════════
// 3점 챌린지 — 투표 없음, 3점슛 능력치 기반 가중 랜덤 추첨
// ══════════════════════════════════════════════════════════════════════════
// [2026-09-08] docs/simulation/allstar-game-plan.md §7 계획대로 threeCorner/three45/
// threeTop(코너 3점/45도 3점/탑 3점, types/player.ts:232-234) 평균값을 "3점 슈팅 점수"로
// 삼는다. 참가 인원은 8명(사용자 확인 — 예선 8명 각 5랙 → 결선 상위 3명, 실제 NBA 현행 방식).
// 순수 top-8 컷이 아니라 "상위권 가중 랜덤 추첨"이 되도록 라이징스타 선발(scoreAllNBA +
// voterNoise)과 동일한 패턴을 재사용 — 3점 점수에 seed 기반 노이즈(±20%, voterNoise() 그대로)를
// 얹어 정렬한다. 매 시즌 100% 동일한 8명이 나오지 않으면서도 상위권일수록 뽑힐 확률이 높은
// "가중 랜덤" 효과를 별도 RNG 유틸(utils/rng.ts 등) 없이 이 파일이 이미 쓰던 인프라만으로 구현.
// buildCandidates()의 MIN_GAMES(41경기) 필터를 그대로 적용 — 시즌 초반 콜업된 벤치 선수가
// 3점 능력치만 높다고 뽑히는 걸 방지(본올스타/라이징스타와 동일한 최소 출전 기준).
//
// [2026-09-08 추가] "아키타입을 고려하는 게 어떨까? 돈치치/테이텀/어빙/조지 같은 이 정도
// 사이즈의 선수들은 보통 3점 챌린지에 잘 안 나간다"는 사용자 피드백 — 순수 3점 능력치
// 평균만으로는 볼 핸들링/아이솔레이션 중심 올라운더(예: PRIMARY_CREATOR_GUARD/
// SHOT_CREATOR_WING/ISOLATION_SCORER 계열, utils/ovrEngine.ts의 ARCHETYPE_LABEL 참고)가
// 슈터 특화 선수보다 높은 점수를 받는 경우가 많다. 사용자 확인(AskUserQuestion)으로
// "가중치 보너스" 방식 채택 — 하드 필터(자격 자체를 제한)가 아니라, 슈터 특화 아키타입이면
// 점수에 보너스 배율을 곱해 뽑힐 확률을 크게 높이되 완전히 배제하지는 않는다(예외적으로
// 3점 능력치가 압도적인 올라운더도 여전히 뽑힐 여지를 남김). player.archetype/
// secondaryArchetype은 calculateOvrWithArchetype()이 이미 채워둔 "해석된 라벨 문자열"
// (예: "Outside Shooter") — DB 라벨 오버라이드(getLabelConfigSync)가 있으면 이 문자열이
// 바뀔 수 있어 완벽히 안정적이진 않지만, 그런 오버라이드는 사실상 안 쓰이므로 실사용에는
// 문제없다.
const THREE_POINT_SHOOTER_ARCHETYPES = new Set([
    'Outside Shooter',   // MOVEMENT_SHOOTER
    'Perimeter 3&D',     // PERIMETER_3D
    'Lockdown Shooter',  // LOCKDOWN_SHOOTER
    'Stretch Big',       // STRETCH_BIG
]);
const THREE_POINT_ARCHETYPE_BONUS = 1.5; // 슈터 특화 아키타입(주/부 아키타입 중 하나라도 일치) 배율

export interface ThreePointContestParticipant {
    playerId: string; playerName: string; teamId: string; position: string; ovr: number;
    /** 3점 슈팅 점수(threeCorner/three45/threeTop 평균, 노이즈·아키타입 보너스 반영 전
     *  원점수) — 참고/표시용. */
    threePointRating: number;
}

const THREE_POINT_CONTEST_SIZE = 8; // 참가 인원(사용자 확인 — 실제 NBA 현행 방식)

/**
 * teams는 라이징스타와 동일하게 리그 전체(Team[])를 통째로 넘길 것 — 컨퍼런스 구분이
 * 없는 이벤트(실제 NBA 3점 챌린지도 컨퍼런스 무관 단일 대회).
 */
export function runThreePointContestSelection(teams: Team[], seed?: string): ThreePointContestParticipant[] {
    const effectiveSeed = seed || String(Date.now());
    const { candidates, playerMap } = buildCandidates(teams);

    const ranked = candidates
        .map(c => {
            const p = playerMap.get(c.playerId);
            const rating = p ? (p.threeCorner + p.three45 + p.threeTop) / 3 : 0;
            const noise = voterNoise(effectiveSeed, 0, `threept_${c.playerId}`);
            const isShooterArchetype = !!p && (
                THREE_POINT_SHOOTER_ARCHETYPES.has(p.archetype ?? '') ||
                THREE_POINT_SHOOTER_ARCHETYPES.has(p.secondaryArchetype ?? '')
            );
            const archetypeBonus = isShooterArchetype ? THREE_POINT_ARCHETYPE_BONUS : 1;
            return { c, rating, weightedScore: rating * (1 + noise) * archetypeBonus };
        })
        .sort((a, b) => b.weightedScore - a.weightedScore)
        .slice(0, THREE_POINT_CONTEST_SIZE);

    return ranked.map(({ c, rating }): ThreePointContestParticipant => ({
        playerId: c.playerId, playerName: c.playerName, teamId: c.teamId, position: c.position, ovr: c.ovr,
        threePointRating: Math.round(rating),
    }));
}

// ══════════════════════════════════════════════════════════════════════════
// 덩크 컨테스트 — 투표 없음, 덩크 능력치 기반 가중 랜덤 추첨 + 아키타입 가산점
// ══════════════════════════════════════════════════════════════════════════
// [2026-09-08] docs/simulation/allstar-game-plan.md §6 계획대로 dunk(덩크 능력치,
// types/player.ts:239) + vertical(수직 점프, types/player.ts:262) 평균값을 "덩크 점수"로
// 삼는다. 참가 인원은 4명(사용자 확인 — 예선 4명 각 2회 시도(최고점 합산) → 결승 상위 2명
// 2회 시도, 실제 NBA 최근 현행 방식). 3점 챌린지(runThreePointContestSelection)와 완전히
// 동일한 패턴 — 순수 top-4 컷이 아니라 seed 기반 노이즈(±20%, voterNoise())를 얹은 가중
// 랜덤 추첨이며, 여기에 더해 "덩크 콘테스트 역시 아키타입 가산점을 주도록 해"라는 사용자
// 요청으로 덩크 특화 아키타입(Aerial Wing/Rim Runner/Slashing Wing — utils/ovrEngine.ts의
// ARCHETYPE_LABEL 참고, 전부 림 어택/공중 마무리 계열)이면 점수에 1.5배 보너스를 곱한다
// (3점 챌린지와 동일 배율·동일 "하드 필터 아닌 가중치 보너스" 방식 — 3점 챌린지 작업 때
// 사용자가 이 방식을 선택했으므로 일관성 유지). player.archetype/secondaryArchetype은
// 해석된 라벨 문자열이라는 점, DB 라벨 오버라이드 시 매칭이 깨질 수 있다는 한계도 3점
// 챌린지와 동일(utils/allStarSelection.ts의 THREE_POINT_SHOOTER_ARCHETYPES 주석 참고).
// 후보 풀은 buildCandidates()의 MIN_GAMES(41경기) 필터 그대로 적용 — 계획서(§6)는 "올스타
// 선발 여부와 무관하게 리그 전체"라고 명시했으나, 실전 경기 경험이 거의 없는 선수가 뽑히는
// 걸 막기 위해 다른 부대 이벤트와 동일한 최소 출전 기준은 유지한다.
const DUNK_CONTEST_ARCHETYPES = new Set([
    'Aerial Wing',   // AERIAL_WING — 공중 마무리 특화, 가장 직접적인 덩크 컨테스트 적합군
    'Rim Runner',    // RIM_RUNNER_BIG — 로브·앨리웁 마무리형 빅맨
    'Slashing Wing',  // SLASHING_WING — 림 어택 중심 윙
]);
const DUNK_CONTEST_ARCHETYPE_BONUS = 1.5;

export interface DunkContestParticipant {
    playerId: string; playerName: string; teamId: string; position: string; ovr: number;
    /** 덩크 점수(dunk/vertical 평균, 노이즈·아키타입 보너스 반영 전 원점수) — 참고/표시용. */
    dunkRating: number;
}

const DUNK_CONTEST_SIZE = 4; // 참가 인원(사용자 확인 — 실제 NBA 최근 현행 방식)

/**
 * teams는 3점 챌린지/라이징스타와 동일하게 리그 전체(Team[])를 통째로 넘길 것 — 컨퍼런스
 * 구분이 없는 이벤트(실제 NBA 덩크 컨테스트도 컨퍼런스 무관 단일 대회).
 */
export function runDunkContestSelection(teams: Team[], seed?: string): DunkContestParticipant[] {
    const effectiveSeed = seed || String(Date.now());
    const { candidates, playerMap } = buildCandidates(teams);

    const ranked = candidates
        .map(c => {
            const p = playerMap.get(c.playerId);
            const rating = p ? (p.dunk + p.vertical) / 2 : 0;
            const noise = voterNoise(effectiveSeed, 0, `dunk_${c.playerId}`);
            const isDunkArchetype = !!p && (
                DUNK_CONTEST_ARCHETYPES.has(p.archetype ?? '') ||
                DUNK_CONTEST_ARCHETYPES.has(p.secondaryArchetype ?? '')
            );
            const archetypeBonus = isDunkArchetype ? DUNK_CONTEST_ARCHETYPE_BONUS : 1;
            return { c, rating, weightedScore: rating * (1 + noise) * archetypeBonus };
        })
        .sort((a, b) => b.weightedScore - a.weightedScore)
        .slice(0, DUNK_CONTEST_SIZE);

    return ranked.map(({ c, rating }): DunkContestParticipant => ({
        playerId: c.playerId, playerName: c.playerName, teamId: c.teamId, position: c.position, ovr: c.ovr,
        dunkRating: Math.round(rating),
    }));
}
