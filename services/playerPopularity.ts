
import type { Player, PlayerPopularity } from '../types/player';
import type { PlayerBoxScore } from '../types/engine';
import { stringToHash, seededRandom } from '../utils/hiddenTendencies';

// ─────────────────────────────────────────────────────────────
// Player Popularity System
// localPopularity  → 관중/MD 재정에 직결
// nationalPopularity → 스폰서십/MD 보정
// ─────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

/**
 * 선수 인기도 초기값 생성 (fallback — DB에 없는 생성 선수용)
 * OVR 기반 자동 계산. meta_players 선수는 DB base_attributes.popularity에서 직접 로드됨.
 */
export function generateInitialPopularity(player: Player): PlayerPopularity {
    const baseSeed = stringToHash(player.id + player.name);
    const rand = (offset: number) => Math.floor(seededRandom(baseSeed + offset) * 11) - 5;

    const ovr = player.ovr;
    const tenure = player.teamTenure ?? 0;
    const hasAwards = (player.awards?.length ?? 0) > 0;
    const isRookie = player.age <= 22 && tenure === 0;

    const tenureBonus   = Math.min(tenure * 2, 12);
    const awardsBonus   = hasAwards ? 8 : 0;
    const rookiePenalty = isRookie ? -8 : 0;

    const local = clamp(
        (ovr - 50) + tenureBonus + awardsBonus + rookiePenalty + rand(2),
        5, 80
    );
    const national = clamp(
        Math.round(local * 0.45) + awardsBonus + rand(3),
        0, 70
    );

    return { local, national };
}

/**
 * 경기 후 인기도 업데이트
 * 호출: processGameDevelopment() 직후 (userGameService / cpuGameService / batchSeasonService)
 */
export function updatePopularityFromGame(
    players: Player[],
    boxScores: PlayerBoxScore[],
    isPlayoff: boolean,
    isVsTopTeam: boolean, // 상위 8팀 상대 여부
): void {
    const boxMap = new Map(boxScores.map(b => [b.playerId, b]));

    for (const player of players) {
        const box = boxMap.get(player.id);
        if (!box) continue;

        // 초기값이 없으면 생성
        if (!player.popularity) {
            player.popularity = generateInitialPopularity(player);
        }

        const { pts, reb, ast, fga, fgm, mp } = box;

        // 출전하지 않은 선수는 건너뜀
        if (mp < 1) continue;

        let localDelta = 0;
        let nationalDelta = 0;

        // 이벤트 판정
        const isDoubleDouble =
            (pts >= 10 && reb >= 10) ||
            (pts >= 10 && ast >= 10) ||
            (reb >= 10 && ast >= 10);
        const isTripleDouble = pts >= 10 && reb >= 10 && ast >= 10;
        const fgPct = fga >= 5 ? fgm / fga : 1;
        const isBadGame = pts < 8 && fga >= 5 && fgPct < 0.30;

        if (pts >= 30) {
            localDelta += 0.5;
            nationalDelta += 0.3;
        }
        if (isTripleDouble) {
            localDelta += 0.5;
            nationalDelta += 0.3;
        } else if (isDoubleDouble) {
            localDelta += 0.3;
            nationalDelta += 0.1;
        }
        if (isBadGame) {
            localDelta -= 0.2;
            nationalDelta -= 0.1;
        }

        // Multiplier 적용
        let multiplier = 1.0;
        if (isPlayoff) multiplier *= 2.0;
        if (isVsTopTeam) multiplier *= 1.5;

        if (localDelta > 0) localDelta *= multiplier;
        if (nationalDelta > 0) nationalDelta *= multiplier;
        // 부정적 delta는 multiplier 미적용 (패배 페널티 과도 방지)

        // Ceiling 감쇠: 값이 높을수록 상승 느리게
        if (localDelta > 0) {
            localDelta *= (1 - player.popularity.local / 130);
        }
        if (nationalDelta > 0) {
            nationalDelta *= (1 - player.popularity.national / 130);
        }

        player.popularity.local    = clamp(player.popularity.local    + localDelta,    0, 100);
        player.popularity.national = clamp(player.popularity.national + nationalDelta, 0, 100);
    }
}

/**
 * 오프시즌 인기도 자연 감소
 * 호출: processOffseason() 내부
 */
export function decayPopularityOffseason(player: Player): void {
    if (!player.popularity) return;

    const hasRecentAward = (player.awards?.length ?? 0) > 0;
    const localDecay    = hasRecentAward ? 1 : 3;
    const nationalDecay = hasRecentAward ? 1 : 2;

    player.popularity.local    = Math.max(5,  player.popularity.local    - localDecay);
    player.popularity.national = Math.max(0,  player.popularity.national - nationalDecay);
}

/**
 * 팀 로스터의 localPopularity 가중 합성치 (관중 보정용)
 * top1×0.45 + top2×0.25 + top3×0.15 + top4~8 평균×0.15
 */
export function getTeamLocalStarPower(roster: Player[]): number {
    const sorted = roster
        .map(p => p.popularity?.local ?? 0)
        .sort((a, b) => b - a);

    const top1 = sorted[0] ?? 0;
    const top2 = sorted[1] ?? 0;
    const top3 = sorted[2] ?? 0;
    const rest = sorted.slice(3, 8);
    const restAvg = rest.length > 0
        ? rest.reduce((s, v) => s + v, 0) / rest.length
        : 0;

    return top1 * 0.45 + top2 * 0.25 + top3 * 0.15 + restAvg * 0.15;
}

/**
 * 팀 로스터의 national 60+ 선수 수 기반 스폰서십 보너스 (0~0.15)
 */
export function getNationalPopBonus(roster: Player[]): number {
    const count60 = roster.filter(p => (p.popularity?.national ?? 0) >= 60).length;
    return Math.min(count60 * 0.03, 0.15);
}

// ─────────────────────────────────────────────────────────────
// 인기도 라벨 (PlayerDetailView 등 UI 표시용)
// ─────────────────────────────────────────────────────────────

/**
 * local 인기도 값(0~100) → 연고지 팬덤 수준 라벨
 */
export function getLocalPopularityLabel(value: number): string {
    if (value >= 90) return '팀 아이콘';
    if (value >= 80) return '홈팀 스타';
    if (value >= 70) return '연고지 인기 선수';
    if (value >= 60) return '팬들에게 사랑받음';
    if (value >= 50) return '팬들에게 알려짐';
    if (value >= 40) return '어느 정도 인지됨';
    if (value >= 30) return '팀 팬에게 알려짐';
    if (value >= 20) return '인지도 형성 중';
    if (value >= 10) return '거의 알려지지 않음';
    return '신인 수준';
}

/**
 * national 인기도 값(0~100) → 전국/글로벌 인지도 라벨
 */
export function getNationalPopularityLabel(value: number): string {
    if (value >= 90) return '슈퍼스타';
    if (value >= 80) return '전국적으로 유명함';
    if (value >= 70) return '적당히 유명함';
    if (value >= 60) return '인기 선수';
    if (value >= 50) return '어느 정도 알려짐';
    if (value >= 40) return '팬층 있음';
    if (value >= 30) return '일부에게 알려짐';
    if (value >= 20) return '인지도 낮음';
    if (value >= 10) return '거의 무명';
    return '무명';
}
