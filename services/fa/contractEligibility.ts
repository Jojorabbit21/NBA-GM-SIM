/**
 * NBA CBA 특별 맥스 계약 자격 판별
 *
 * - 슈퍼맥스 (Designated Veteran Player Extension): YOS 7~9, 직전 3시즌 수상
 * - 데릭 로즈 룰 (Designated Rookie Scale Extension): YOS 0~6, 루키 3시즌 내 수상
 *
 * 수상 이력 소스:
 *   player.career_history[].awards — BBRef 기반 과거 이력
 *   player.awards[]                — 시뮬레이션 내 수상 (2025-26~)
 */

import type { Player, PlayerAwardEntry, PlayerAwardType } from '../../types/player';

// ── 상수 ──

const QUALIFYING_AWARD_TYPES: Set<PlayerAwardType> = new Set([
    'MVP', 'DPOY', 'ALL_NBA_1', 'ALL_NBA_2', 'ALL_NBA_3',
]);

// ── 헬퍼 ──

function seasonLabel(startYear: number): string {
    return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

/** career_history + awards 양쪽에서 수상 이력 통합 */
function getAllAwards(player: Player): PlayerAwardEntry[] {
    const historical = (player.career_history ?? []).flatMap(s => s.awards ?? []);
    const simulated  = player.awards ?? [];
    return [...historical, ...simulated];
}

// ── 공개 API ──

/**
 * 슈퍼맥스 자격 여부
 * 조건: 직전 3시즌 중 1회 이상 MVP / DPOY / All-NBA 1~3팀
 * 적용 범위: Extension 전용 (자체팀 Bird Rights)
 */
export function isSuperMaxEligible(player: Player, currentSeasonYear: number): boolean {
    const recentLabels = new Set([
        seasonLabel(currentSeasonYear - 1),
        seasonLabel(currentSeasonYear - 2),
        seasonLabel(currentSeasonYear - 3),
    ]);
    return getAllAwards(player).some(
        a => recentLabels.has(a.season) && QUALIFYING_AWARD_TYPES.has(a.type),
    );
}

/**
 * 데릭 로즈 룰 자격 여부
 * 조건: 루키 계약 첫 3시즌(draftYear, +1, +2) 내 MVP / DPOY / All-NBA 1~3팀
 * 적용 범위: Extension + FA 서명 (어느 팀이든 제시 가능)
 */
export function isRoseRuleEligible(player: Player): boolean {
    const draftYear = player.draftYear;
    if (!draftYear) return false;
    const firstThree = new Set([
        seasonLabel(draftYear),
        seasonLabel(draftYear + 1),
        seasonLabel(draftYear + 2),
    ]);
    return getAllAwards(player).some(
        a => firstThree.has(a.season) && QUALIFYING_AWARD_TYPES.has(a.type),
    );
}

export type MaxCapReason = 'supermax' | 'rose_rule' | 'standard';

export interface MaxCapResult {
    pct: number;
    reason: MaxCapReason;
}

/**
 * 선수의 CBA 최대 캡% 산출
 * @param yos  - Years of Service (currentSeasonYear - draftYear)
 * @param isExtension - true면 슈퍼맥스 적용 가능 (자체팀 extension)
 */
export function getMaxCapPct(
    player: Player,
    yos: number,
    currentSeasonYear: number,
    isExtension = false,
): MaxCapResult {
    // 슈퍼맥스: YOS 7~9, Extension 전용
    if (isExtension && yos >= 7 && yos <= 9 && isSuperMaxEligible(player, currentSeasonYear)) {
        return { pct: 0.35, reason: 'supermax' };
    }
    // 데릭 로즈 룰: YOS 0~6, 어느 팀이든 가능
    if (yos < 7 && isRoseRuleEligible(player)) {
        return { pct: 0.30, reason: 'rose_rule' };
    }
    // 표준 CBA
    const pct = yos >= 10 ? 0.35 : yos >= 7 ? 0.30 : 0.25;
    return { pct, reason: 'standard' };
}
