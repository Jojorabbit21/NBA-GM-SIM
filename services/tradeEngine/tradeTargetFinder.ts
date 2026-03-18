
import { Player, Team } from '../../types';
import type { TeamTradeState, TradeGoalType } from '../../types/trade';
import type { GMProfile, LeagueGMProfiles } from '../../types/gm';
import { calculatePlayerOvr } from '../../utils/constants';
import { getPlayerValueToTeam } from './tradeValue';
import { getPlayerAvailability } from './assetAvailability';
import { determineFARole } from '../fa/faValuation';

export interface TradeTarget {
    sellerTeamId: string;
    player: Player;
    valueToTeam: number;       // 구매자 팀 기준 선수 가치
    availability: number;      // 판매자 팀의 판매 의향 (0~1)
    compatibilityScore: number; // 양방향 니즈 충족도 (구매자 니즈 + 판매자가 구매자 자산 필요)
}

const AVAILABILITY_THRESHOLD = 0.20;
const MAX_TARGETS = 5;

/**
 * 구매자 팀의 목표에 맞는 타깃 선수를 리그 전체에서 탐색.
 *
 * 탐색 순서 (초안 §8):
 * 1. 목표 기반 후보 필터 (goal, OVR, role 조건)
 * 2. 판매 가능성 (availability >= threshold) 필터
 * 3. 구매자-판매자 호환성 계산
 * 4. 상위 MAX_TARGETS 반환
 */
export function findTradeTargets(
    buyerTeam: Team,
    buyerState: TeamTradeState,
    buyerProfile: GMProfile,
    goal: TradeGoalType,
    allTeams: Team[],
    allProfiles: LeagueGMProfiles,
    allStates: Record<string, TeamTradeState>,
): TradeTarget[] {
    const targets: TradeTarget[] = [];

    for (const sellerTeam of allTeams) {
        // 자기 팀 제외
        if (sellerTeam.id === buyerTeam.id) continue;

        const sellerProfile = allProfiles[sellerTeam.id];
        const sellerState = allStates[sellerTeam.id];
        if (!sellerProfile || !sellerState) continue;

        for (const player of sellerTeam.roster) {
            // 1. 목표 기반 필터
            if (!matchesGoal(player, goal, buyerState, buyerProfile)) continue;

            // 2. 판매 가능성 체크
            const availability = getPlayerAvailability(player, sellerTeam, sellerState, sellerProfile);
            if (availability < AVAILABILITY_THRESHOLD) continue;

            // 3. 구매자 팀 기준 가치
            const valueToTeam = getPlayerValueToTeam(player, buyerState, buyerProfile);
            if (valueToTeam <= 0) continue;

            // 4. 호환성 — 판매자가 구매자 자산을 얼마나 필요로 하는지
            const compatibility = estimateCompatibility(buyerTeam, buyerState, sellerState);

            targets.push({
                sellerTeamId: sellerTeam.id,
                player,
                valueToTeam,
                availability,
                compatibilityScore: availability * 0.5 + compatibility * 0.3 + (valueToTeam / 50000) * 0.2,
            });
        }
    }

    // 호환성 점수 내림차순 정렬 → 상위 MAX_TARGETS만
    return targets
        .sort((a, b) => b.compatibilityScore - a.compatibilityScore)
        .slice(0, MAX_TARGETS);
}

// ── 내부 헬퍼 ──

function matchesGoal(
    player: Player,
    goal: TradeGoalType,
    buyerState: TeamTradeState,
    buyerProfile: GMProfile,
): boolean {
    const ovr = calculatePlayerOvr(player);
    const role = determineFARole(player);
    const roleNeed = buyerState.needs[role] ?? 0;
    const sliders = buyerProfile.sliders;

    switch (goal) {
        case 'STAR_UPGRADE':
            return ovr >= 85 && sliders.starWillingness >= 5;

        case 'STARTER_UPGRADE':
            return ovr >= 78;

        case 'ROLE_ADD': {
            // 가장 시급한 롤 선수
            const urgentRole = Object.entries(buyerState.needs)
                .filter(([, n]) => n >= 0.5)
                .sort(([, a], [, b]) => b - a)[0]?.[0];
            return urgentRole ? role === urgentRole : roleNeed >= 0.4;
        }

        case 'DEPTH_ADD':
            return ovr >= 68 && roleNeed >= 0.2;

        case 'FUTURE_ASSETS':
            // 미래 자산 목표일 때는 픽을 원하므로 선수 타깃은 젊은 선수 위주
            return player.age <= 24 && ovr >= 65;

        case 'EXPIRING_LEVERAGE':
            // 만기 계약 선수로 상대 팀의 자원 수집
            return ovr >= 72 && player.contractYears <= 2;

        case 'SALARY_RELIEF':
            // 연봉 정리 — 받는 선수는 저렴하면서 쓸만해야
            return ovr >= 68 && player.salary < 12_000_000;

        case 'SURPLUS_CLEAR':
            // 중복 포지션 정리 — 상대가 원하는 선수 탐색 (구매자 관점에선 뭐든 ok)
            return ovr >= 68;

        default:
            return ovr >= 70;
    }
}

function estimateCompatibility(
    buyerTeam: Team,
    buyerState: TeamTradeState,
    sellerState: TeamTradeState,
): number {
    // 판매자가 구매자 팀의 자산(잉여 자원)을 필요로 하는지 추정
    // 구매자의 surplus 포지션이 판매자의 needs 롤과 겹치면 호환성 증가
    let score = 0;

    // 구매자 잉여 포지션이 있고, 판매자도 그쪽 필요도가 있으면
    const posSurpluses = Object.entries(buyerState.surpluses).filter(([, v]) => v >= 1);
    if (posSurpluses.length > 0) score += 0.3;

    // 판매자가 seller/tanking이면 기본 호환성 높음 (미래 자산 원함)
    if (sellerState.phase === 'seller' || sellerState.phase === 'tanking') {
        score += 0.4;
    }

    // 구매자가 winNow, 판매자가 rebuilder → 전통적인 윈나우↔리빌딩 매칭
    if (buyerState.phase === 'winNow' &&
        (sellerState.phase === 'seller' || sellerState.phase === 'tanking')) {
        score += 0.3;
    }

    return Math.min(1, score);
}
