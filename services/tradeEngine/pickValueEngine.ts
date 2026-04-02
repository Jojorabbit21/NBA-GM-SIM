
import { DraftPickAsset } from '../../types/draftAssets';
import { Team } from '../../types';
import { TRADE_CONFIG as C } from './tradeConfig';
import type { GMProfile } from '../../types/gm';
import type { TeamTradeState } from '../../types/trade';

/**
 * 팀의 예상 드래프트 순위를 투영 (승률 기반).
 * 승률이 낮을수록 높은 순위(좋은 픽).
 * 반환: 1~30 (1 = 최고 순위)
 */
function projectDraftSlot(originalTeamId: string, teams: Team[]): number {
    const team = teams.find(t => t.id === originalTeamId);
    if (!team) return 15; // 팀을 찾지 못하면 중간 순위

    const totalGames = (team.wins || 0) + (team.losses || 0);
    const winPct = totalGames > 0 ? (team.wins || 0) / totalGames : 0.5;

    // 승률로 순위 계산 — 승률이 낮을수록 좋은 순위
    // 승률 0.0 → 슬롯 1, 승률 1.0 → 슬롯 30
    const slot = Math.round(1 + winPct * 29);
    return Math.max(1, Math.min(30, slot));
}

/**
 * 현재 시뮬 날짜부터 픽 시즌까지의 연도 거리 계산.
 * NBA 드래프트는 6월에 개최되므로, 시즌 시작(10월) 이후에는 다음 해 드래프트가 현재 시즌.
 * 예: 2025-10-20 → 현재 드래프트 시즌 = 2026
 */
function getYearsAway(pickSeason: number, currentDate: string): number {
    const d = new Date(currentDate);
    const currentYear = d.getFullYear();
    const currentMonth = d.getMonth() + 1; // 1-12
    // 드래프트(6월) 이전이면 올해 드래프트가 현재 시즌, 이후면 내년 드래프트가 현재 시즌
    const currentDraftSeason = currentMonth >= 7 ? currentYear + 1 : currentYear;
    return Math.max(0, pickSeason - currentDraftSeason);
}

/**
 * 단일 드래프트 픽의 트레이드 가치를 계산.
 *
 * 공식:
 * 1. 슬롯 가치: 팀 승률로 예상 순위 → SLOT_VALUE_CURVE
 * 2. 라운드 보정: 2라운드는 ROUND_2_DISCOUNT 적용
 * 3. 연도 할인: YEAR_DISCOUNT_RATE ^ yearsAway
 * 4. 보호 할인: conveyance 확률 기반 기대값
 * 5. 스왑 보너스: 스왑 권리는 추가 가치
 * 6. PLAYER_VALUE_SCALE로 선수 가치와 동일 스케일로 변환
 */
export function getPickTradeValue(
    pick: DraftPickAsset,
    teams: Team[],
    currentDate: string = '2025-10-20'
): number {
    const PV = C.PICK_VALUE;
    const projectedSlot = projectDraftSlot(pick.originalTeamId, teams);

    // 1. 슬롯 기본 가치
    let slotValue = PV.SLOT_VALUE_CURVE[projectedSlot - 1] ?? 0.10;

    // 2. 라운드 보정
    if (pick.round === 2) {
        slotValue *= PV.ROUND_2_DISCOUNT;
    }

    // 3. 연도 할인
    const yearsAway = getYearsAway(pick.season, currentDate);
    const yearDiscount = Math.pow(PV.YEAR_DISCOUNT_RATE, yearsAway);
    let value = slotValue * yearDiscount;

    // 4. 보호 할인
    if (pick.protection && pick.protection.type === 'top' && pick.protection.threshold) {
        const threshold = pick.protection.threshold;
        // 예상 순위가 보호 범위에 가까울수록 conveyance 확률 낮음
        let conveyanceProb: number;
        if (projectedSlot <= threshold) {
            // 예상 순위가 보호 범위 안 → conveyance 확률 낮음
            conveyanceProb = Math.max(0.1, 1 - (threshold - projectedSlot + 1) / 30);
        } else {
            // 예상 순위가 보호 범위 밖 → conveyance 확률 높음
            const margin = projectedSlot - threshold;
            conveyanceProb = Math.min(0.95, PV.PROTECTED_CONVEYANCE_BASE + margin * 0.05);
        }

        // fallback 가치 계산 (보호 발동 시 대체 픽)
        // 폴백 픽은 별도 슬롯을 계산해야 함 — 보호 발동 시 미래에 전달되므로 팀 상황이 달라질 수 있어 중간값(15) 사용
        let fallbackValue = 0;
        if (pick.protection.fallbackSeason) {
            const fallbackYears = getYearsAway(pick.protection.fallbackSeason, currentDate);
            const fallbackRound = pick.protection.fallbackRound ?? 2;
            const fallbackSlotIdx = fallbackRound === 1 ? 14 : 25; // 1R 폴백: 중간(15위), 2R 폴백: 후순위
            const fallbackSlot = PV.SLOT_VALUE_CURVE[fallbackSlotIdx] ?? 0.10;
            fallbackValue = fallbackSlot
                * (fallbackRound === 2 ? PV.ROUND_2_DISCOUNT : 1)
                * Math.pow(PV.YEAR_DISCOUNT_RATE, fallbackYears);
        }

        value = value * conveyanceProb + fallbackValue * (1 - conveyanceProb);
    }

    // lottery 보호도 적용
    if (pick.protection && pick.protection.type === 'lottery') {
        // 로터리 보호: 1-14순위 보호
        if (projectedSlot <= 14) {
            // 로터리 팀이면 conveyance 확률 매우 낮음
            value *= 0.3;
        } else {
            value *= 0.85;
        }
    }

    // 5. 스왑 권리 보너스
    if (pick.swapRight) {
        const beneficiarySlot = projectDraftSlot(pick.swapRight.beneficiaryTeamId, teams);
        const originSlot = projectDraftSlot(pick.swapRight.originTeamId, teams);
        // 스왑 권리의 가치 = 더 좋은 순위를 선택할 수 있는 기대 이득
        if (originSlot < beneficiarySlot) {
            // origin 팀이 더 나쁜 성적(좋은 픽) → 스왑 가치 있음
            const slotDiff = beneficiarySlot - originSlot;
            value += slotDiff * PV.SWAP_SPREAD_BONUS * yearDiscount;
        }
    }

    // 6. 선수 가치 스케일 변환
    return Math.max(1, Math.floor(value * PV.PLAYER_VALUE_SCALE));
}

/**
 * GM 성격과 팀 상태를 반영한 픽 가치.
 * 유스편향 높을수록 픽 선호, 픽방출 높을수록 픽 낮게 평가, 컨텐더는 미래 픽 할인.
 */
export function getPickValueToGM(
    pick: DraftPickAsset,
    teams: Team[],
    currentDate: string,
    gmProfile: GMProfile,
    teamState: TeamTradeState,
): number {
    const baseValue = getPickTradeValue(pick, teams, currentDate);
    const sliders = gmProfile.sliders;

    let modifier = 1.0;

    // 유스 편향: 픽 선호 증가 (최대 +20%)
    modifier += (sliders.youthBias / 10) * 0.20;

    // 픽 방출: 픽 가치 하락 (최대 -15%)
    modifier -= (sliders.pickWillingness / 10) * 0.15;

    // 컨텐더는 미래 픽 할인 (당장이 중요)
    if (teamState.phase === 'winNow') modifier *= 0.75;
    else if (teamState.phase === 'buyer') modifier *= 0.90;

    // 리빌더는 미래 픽 프리미엄
    if (teamState.phase === 'tanking') modifier *= 1.20;
    else if (teamState.phase === 'seller') modifier *= 1.10;

    return Math.max(1, Math.floor(baseValue * Math.max(0.3, modifier)));
}

/**
 * 복수 픽의 패키지 가치를 계산 (가치 내림차순, 체감 가중치 적용).
 */
export function calculatePickPackageValue(
    picks: DraftPickAsset[],
    teams: Team[],
    currentDate?: string
): number {
    const values = picks
        .map(p => getPickTradeValue(p, teams, currentDate))
        .sort((a, b) => b - a);

    const weights = C.DEPTH.PACKAGE_WEIGHTS;
    let total = 0;
    values.forEach((v, idx) => {
        const weight = idx < weights.length ? weights[idx] : 0.05;
        total += v * weight;
    });

    return total;
}
