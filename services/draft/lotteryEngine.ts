/**
 * NBA 드래프트 로터리 엔진
 *
 * NBA 2019+ 로터리 확률 시스템 구현.
 * 14개 비플레이오프 팀에 역순위 가중 확률을 부여하고,
 * 상위 4픽을 가중 랜덤 추첨, 나머지는 역순위 배정.
 *
 * 순수 함수 — React/DB 의존 없음.
 */

import { Team, Game, PlayoffSeries } from '../../types';
import { createTiebreakerComparator } from '../../utils/tiebreaker';

// ═══════════════════════════════════════════════════════════════
// 타입
// ═══════════════════════════════════════════════════════════════

export interface LotteryTeamEntry {
    teamId: string;
    wins: number;
    losses: number;
    winPct: number;
    preLotteryRank: number;   // 1=최악 ~ 14=최고 (로터리 팀 중)
    lotteryWeight: number;    // 140, 140, ..., 5
    odds: number;             // 0~1 확률 (lotteryWeight / 1000)
}

export interface PickMovement {
    teamId: string;
    preLotteryPosition: number;  // 원래 예상 순위 (1~30)
    finalPosition: number;       // 실제 순위 (1~30)
    jumped: boolean;             // top-4 추첨으로 상승했는지
}

export interface LotteryResult {
    finalOrder: string[];              // 30팀 드래프트 순서 (index 0 = 1픽)
    lotteryTeams: LotteryTeamEntry[];  // 14팀 확률 정보
    playoffTeamIds: string[];          // 16팀 ID (15~30픽)
    pickMovements: PickMovement[];     // 순위 변동 정보 (UI용)
    top4Drawn: string[];               // 추첨으로 결정된 상위 4팀
    viewed?: boolean;                  // 유저가 로터리 추첨 화면을 확인했는지 여부
}

// ═══════════════════════════════════════════════════════════════
// 상수
// ═══════════════════════════════════════════════════════════════

/** NBA 2019+ 로터리 가중치 (1000 조합, index 0 = 최악 팀) */
const LOTTERY_WEIGHTS = [140, 140, 140, 125, 105, 90, 75, 60, 45, 30, 20, 15, 10, 5];

const LOTTERY_POOL_SIZE = 1000;
const LOTTERY_DRAWS = 4;       // 상위 4픽 추첨
const LOTTERY_TEAM_COUNT = 14;

// ═══════════════════════════════════════════════════════════════
// 메인 함수
// ═══════════════════════════════════════════════════════════════

/**
 * 로터리 엔진 메인 진입점.
 * teams의 wins/losses, playoffSeries 기반으로 30팀 드래프트 순서를 결정한다.
 */
export function runLotteryEngine(
    teams: Team[],
    schedule: Game[],
    playoffSeries: PlayoffSeries[]
): LotteryResult {
    // 1. 로터리 팀 / 플레이오프 팀 분리
    const { lotteryTeams, playoffTeams } = identifyLotteryTeams(teams, playoffSeries);

    // 2. 로터리 팀에 확률 배정
    const entries = assignLotteryOdds(lotteryTeams, teams, schedule);

    // 3. 상위 4픽 추첨
    const top4 = drawLotteryPicks(entries);

    // 4. 5~14픽 역순위 배정
    const remaining = assignRemainingLotteryPicks(top4, entries);

    // 5. 15~30픽 플레이오프 팀 순서
    const playoffOrder = orderPlayoffTeams(playoffTeams, playoffSeries, teams, schedule);

    // 6. 최종 순서 조합
    const finalOrder = [...top4, ...remaining, ...playoffOrder];

    // 7. 순위 변동 정보 계산
    const preLotteryOrder = entries.map(e => e.teamId);
    const pickMovements = computePickMovements(preLotteryOrder, playoffOrder, finalOrder, top4);

    return {
        finalOrder,
        lotteryTeams: entries,
        playoffTeamIds: playoffOrder,
        pickMovements,
        top4Drawn: top4,
    };
}

// ═══════════════════════════════════════════════════════════════
// 내부 함수
// ═══════════════════════════════════════════════════════════════

/**
 * 로터리 팀(14팀)과 플레이오프 팀(16팀)을 분리한다.
 *
 * 플레이오프 팀 = playoffSeries에서 round >= 1에 등장한 팀.
 * 플레이인(round 0) 패자 = 로터리 팀에 포함.
 *
 * Fallback: playoffSeries가 비어있으면 전 팀 로터리 처리.
 */
function identifyLotteryTeams(
    teams: Team[],
    playoffSeries: PlayoffSeries[]
): { lotteryTeams: Team[]; playoffTeams: Team[] } {
    // 플레이오프 시리즈가 없으면 전 팀 로터리
    if (!playoffSeries || playoffSeries.length === 0) {
        return { lotteryTeams: [...teams], playoffTeams: [] };
    }

    // round >= 1 시리즈에 등장한 팀 ID 수집
    const playoffTeamIds = new Set<string>();
    for (const series of playoffSeries) {
        if (series.round >= 1) {
            playoffTeamIds.add(series.higherSeedId);
            playoffTeamIds.add(series.lowerSeedId);
        }
    }

    const lotteryTeams: Team[] = [];
    const playoffTeams: Team[] = [];

    for (const team of teams) {
        if (playoffTeamIds.has(team.id)) {
            playoffTeams.push(team);
        } else {
            lotteryTeams.push(team);
        }
    }

    return { lotteryTeams, playoffTeams };
}

/**
 * 로터리 팀에 NBA 2019+ 확률을 배정한다.
 * 역순위 정렬 (최악 → 최고) 후 가중치 매핑.
 *
 * 전 팀 0-0인 경우 균등 가중치 적용.
 */
function assignLotteryOdds(
    lotteryTeams: Team[],
    allTeams: Team[],
    schedule: Game[]
): LotteryTeamEntry[] {
    const allZero = lotteryTeams.every(t => t.wins === 0 && t.losses === 0);

    // 타이브레이커 비교기 (좋은 팀이 앞으로 정렬됨)
    const comparator = createTiebreakerComparator(allTeams, schedule);

    // 역순위 정렬: 최악 팀이 index 0 → 최고 팀이 마지막
    const sorted = [...lotteryTeams].sort((a, b) => {
        if (allZero) return 0; // 전부 0-0이면 순서 무관
        return -comparator(a, b); // 반전: 나쁜 팀이 앞으로
    });

    // 팀 수가 14보다 적거나 많은 경우 대응
    const teamCount = sorted.length;

    const rawWeights = sorted.map((_, i) => {
        if (allZero || teamCount !== LOTTERY_TEAM_COUNT) {
            // 균등 배분 (나머지 무시 — 아래에서 정규화)
            return Math.floor(LOTTERY_POOL_SIZE / teamCount);
        }
        return LOTTERY_WEIGHTS[i];
    });

    // 실제 가중치 합계 기준으로 odds를 1.0으로 정규화
    const totalWeight = rawWeights.reduce((sum, w) => sum + w, 0);

    return sorted.map((team, i) => {
        const total = team.wins + team.losses;
        const winPct = total > 0 ? team.wins / total : 0;
        const weight = rawWeights[i];

        return {
            teamId: team.id,
            wins: team.wins,
            losses: team.losses,
            winPct,
            preLotteryRank: i + 1,
            lotteryWeight: weight,
            odds: totalWeight > 0 ? weight / totalWeight : 1 / teamCount,
        };
    });
}

/**
 * 가중 랜덤으로 상위 4픽을 추첨한다.
 * 1000개 슬롯 배열 → 비복원 추출 4회.
 */
function drawLotteryPicks(entries: LotteryTeamEntry[]): string[] {
    // 가중 풀 생성
    let pool: string[] = [];
    for (const entry of entries) {
        for (let i = 0; i < entry.lotteryWeight; i++) {
            pool.push(entry.teamId);
        }
    }

    const drawn: string[] = [];

    for (let pick = 0; pick < LOTTERY_DRAWS && pool.length > 0; pick++) {
        const idx = Math.floor(Math.random() * pool.length);
        const teamId = pool[idx];
        drawn.push(teamId);
        // 해당 팀의 모든 슬롯 제거 (비복원)
        pool = pool.filter(id => id !== teamId);
    }

    return drawn;
}

/**
 * 5~14픽을 나머지 로터리 팀에 역순위로 배정한다.
 * preLotteryRank 오름차순 (최악 팀 → 최고 팀) 순서로 남은 슬롯 채움.
 */
function assignRemainingLotteryPicks(
    top4: string[],
    entries: LotteryTeamEntry[]
): string[] {
    const top4Set = new Set(top4);
    // preLotteryRank 오름차순 (최악 팀부터)
    return entries
        .filter(e => !top4Set.has(e.teamId))
        .sort((a, b) => a.preLotteryRank - b.preLotteryRank)
        .map(e => e.teamId);
}

/**
 * 플레이오프 팀을 드래프트 순서(15~30픽)로 정렬한다.
 *
 * 규칙:
 * - 조기 탈락 팀이 높은 픽 (15픽에 가까움)
 * - 같은 라운드에서 탈락한 팀끼리는 역순위 (나쁜 성적이 높은 픽)
 * - 챔피언 = 30픽 (최하위 픽)
 */
function orderPlayoffTeams(
    playoffTeams: Team[],
    playoffSeries: PlayoffSeries[],
    allTeams: Team[],
    schedule: Game[]
): string[] {
    if (playoffTeams.length === 0) return [];

    // 각 팀의 최고 도달 라운드 + 탈락 여부 계산
    const teamElimInfo = new Map<string, { maxRound: number; isChampion: boolean }>();

    for (const team of playoffTeams) {
        let maxRound = 0;
        let isChampion = false;

        for (const series of playoffSeries) {
            if (series.round < 1) continue;
            const isInSeries = series.higherSeedId === team.id || series.lowerSeedId === team.id;
            if (!isInSeries) continue;

            if (series.round > maxRound) maxRound = series.round;

            // 파이널(round 4) 우승자 판별
            if (series.round === 4 && series.finished && series.winnerId === team.id) {
                isChampion = true;
            }
        }

        teamElimInfo.set(team.id, { maxRound, isChampion });
    }

    // 타이브레이커 (역순위: 나쁜 팀이 앞)
    const comparator = createTiebreakerComparator(allTeams, schedule);

    return [...playoffTeams].sort((a, b) => {
        const infoA = teamElimInfo.get(a.id) || { maxRound: 0, isChampion: false };
        const infoB = teamElimInfo.get(b.id) || { maxRound: 0, isChampion: false };

        // 챔피언은 항상 마지막 (30픽)
        if (infoA.isChampion && !infoB.isChampion) return 1;
        if (!infoA.isChampion && infoB.isChampion) return -1;

        // 낮은 라운드에서 탈락한 팀이 앞 (높은 픽)
        if (infoA.maxRound !== infoB.maxRound) return infoA.maxRound - infoB.maxRound;

        // 같은 라운드: 역순위 (나쁜 성적이 앞)
        return -comparator(a, b);
    }).map(t => t.id);
}

/**
 * 순위 변동 정보를 계산한다 (UI 표시용).
 */
function computePickMovements(
    preLotteryOrder: string[],       // 로터리 팀 역순위 (1~14)
    playoffOrder: string[],          // 플레이오프 팀 (15~30)
    finalOrder: string[],            // 실제 최종 순서
    top4: string[]                   // 추첨 당첨 팀
): PickMovement[] {
    // 사전 순서: 로터리 역순위 + 플레이오프 순서
    const expectedOrder = [...preLotteryOrder, ...playoffOrder];
    const top4Set = new Set(top4);

    return finalOrder.map((teamId, finalIdx) => {
        const expectedIdx = expectedOrder.indexOf(teamId);
        const preLotteryPosition = expectedIdx + 1;
        const finalPosition = finalIdx + 1;

        return {
            teamId,
            preLotteryPosition,
            finalPosition,
            jumped: top4Set.has(teamId) && finalPosition < preLotteryPosition,
        };
    });
}
