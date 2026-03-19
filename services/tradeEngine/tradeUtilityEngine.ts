
import { Player } from '../../types';
import { getOVRThreshold } from '../../utils/ovrUtils';
import type { DraftPickAsset } from '../../types/draftAssets';
import type { TeamTradeState, TradeGoalType } from '../../types/trade';
import type { GMProfile } from '../../types/gm';
import { getPlayerValueToTeam } from './tradeValue';
import { getPickValueToGM } from './pickValueEngine';
import { determineFARole } from '../fa/faValuation';
import type { Team } from '../../types';

export interface TradeUtilityResult {
    utility: number;       // 종합 유틸리티 (+ = 이익, - = 손해)
    incomingValue: number; // 받는 자산 팀별 가치 합계
    outgoingValue: number; // 내보내는 자산 팀별 가치 합계
    goalBonus: number;     // 목표 달성 보너스
    regretCost: number;    // 후회 비용
    detail: string[];      // 분석 메시지
}

export interface AcceptScoreResult {
    score: number;
    shouldAccept: boolean;
    detail: string[];
}

// direction별 허용 손실폭 (최소 utility 기준)
const PHASE_UTILITY_THRESHOLD: Record<string, number> = {
    winNow: -0.08,    // 8% 손해까지 허용
    buyer: -0.02,
    standPat: 0.04,   // 4% 이상 개선만 수락
    seller: -0.12,
    tanking: -0.15,
};

/**
 * 트레이드 유틸리티 계산.
 * incoming - outgoing + 목표달성보너스 - RegretCost
 */
export function calculateTradeUtility(
    incomingPlayers: Player[],
    incomingPicks: DraftPickAsset[],
    outgoingPlayers: Player[],
    outgoingPicks: DraftPickAsset[],
    teamState: TeamTradeState,
    gmProfile: GMProfile,
    allTeams: Team[],
    currentDate: string,
    goal?: TradeGoalType,
): TradeUtilityResult {
    const detail: string[] = [];

    // 받는 자산 가치
    const incomingPlayerVal = incomingPlayers.reduce(
        (sum, p) => sum + getPlayerValueToTeam(p, teamState, gmProfile), 0
    );
    const incomingPickVal = incomingPicks.reduce(
        (sum, pk) => sum + getPickValueToGM(pk, allTeams, currentDate, gmProfile, teamState), 0
    );
    const incomingValue = incomingPlayerVal + incomingPickVal;

    // 내보내는 자산 가치 (팀별 기준 — 우리 팀에서 얼마나 아까운지)
    const outgoingPlayerVal = outgoingPlayers.reduce(
        (sum, p) => sum + getPlayerValueToTeam(p, teamState, gmProfile), 0
    );
    const outgoingPickVal = outgoingPicks.reduce(
        (sum, pk) => sum + getPickValueToGM(pk, allTeams, currentDate, gmProfile, teamState), 0
    );
    const outgoingValue = outgoingPlayerVal + outgoingPickVal;

    // 목표 달성 보너스 (+20% of incomingValue if goal fulfilled)
    let goalBonus = 0;
    if (goal) {
        const goalFulfilled = checkGoalFulfillment(incomingPlayers, goal, teamState);
        if (goalFulfilled) {
            goalBonus = incomingValue * 0.20;
            detail.push(`목표 달성 (${goal}) +20% 보너스`);
        }
    }

    // RegretCost
    const regretCost = calculateRegretCost(outgoingPlayers, outgoingPicks, teamState, gmProfile, detail);

    const rawDiff = outgoingValue > 0 ? (incomingValue - outgoingValue) / outgoingValue : 0;
    const utility = rawDiff + (outgoingValue > 0 ? goalBonus / outgoingValue : 0)
        - (outgoingValue > 0 ? regretCost / outgoingValue : 0);

    return { utility, incomingValue, outgoingValue, goalBonus, regretCost, detail };
}

/**
 * 유저가 보낸 제안을 CPU가 수락할지 판단.
 */
export function calculateAcceptScore(
    incomingPlayers: Player[],   // CPU가 받는 것 (유저가 보내는 것)
    incomingPicks: DraftPickAsset[],
    outgoingPlayers: Player[],   // CPU가 내보내는 것 (유저가 요청하는 것)
    outgoingPicks: DraftPickAsset[],
    teamState: TeamTradeState,
    gmProfile: GMProfile,
    allTeams: Team[],
    currentDate: string,
    goal?: TradeGoalType,
): AcceptScoreResult {
    const result = calculateTradeUtility(
        incomingPlayers, incomingPicks,
        outgoingPlayers, outgoingPicks,
        teamState, gmProfile, allTeams, currentDate, goal
    );

    const threshold = PHASE_UTILITY_THRESHOLD[teamState.phase] ?? 0;
    const shouldAccept = result.utility >= threshold;

    return {
        score: result.utility,
        shouldAccept,
        detail: result.detail,
    };
}

/**
 * 내보내는 자산에 대한 후회 비용.
 * 팀 입장에서 "아까운" 자산일수록 높음.
 */
export function calculateRegretCost(
    outgoingPlayers: Player[],
    outgoingPicks: DraftPickAsset[],
    teamState: TeamTradeState,
    gmProfile: GMProfile,
    detail: string[] = [],
): number {
    const sliders = gmProfile.sliders;
    let cost = 0;

    // 픽방출 낮음 + 1라운드 픽 방출
    const firstRoundPicks = outgoingPicks.filter(p => p.round === 1);
    if (firstRoundPicks.length > 0 && sliders.pickWillingness <= 4) {
        const penalty = firstRoundPicks.length * 500 * (5 - sliders.pickWillingness);
        cost += penalty;
        detail.push(`픽 보수적 GM — 1라운드 픽 방출 후회 비용`);
    }

    // 유스 편향 높음 + 어린 선수 방출
    if (sliders.youthBias >= 7) {
        for (const p of outgoingPlayers) {
            if (p.age <= 22) {
                cost += 1000 * (sliders.youthBias - 6);
                detail.push(`유스 편향 GM — ${p.name}(${p.age}세) 방출 후회`);
            }
        }
    }

    // 팀 유일 포지션 자원 방출
    for (const p of outgoingPlayers) {
        const posKey = p.position.split('/')[0];
        const remainingAfter = /* 대략적 추정 — 실제 로스터 접근 없이 surpluses로 판단 */
            Math.max(0, (teamState.surpluses[posKey] ?? 0));
        if (remainingAfter === 0 && (teamState.needs[determineFARole(p)] ?? 0) >= 0.5) {
            cost += 800;
            detail.push(`유일 ${posKey} 자원 방출 — 포지션 공백 우려`);
        }
    }

    // standPat + 데드라인 멀음 → "더 좋은 딜 기다릴 수 있다" 기회비용
    if (teamState.phase === 'standPat') {
        cost += 200;
    }

    return cost;
}

// ── 내부 헬퍼 ──

function checkGoalFulfillment(
    incoming: Player[],
    goal: TradeGoalType,
    teamState: TeamTradeState,
): boolean {
    switch (goal) {
        case 'STAR_UPGRADE':
            return incoming.some(p => p.ovr >= getOVRThreshold('STAR'));
        case 'STARTER_UPGRADE':
            return incoming.some(p => p.ovr >= getOVRThreshold('STARTER'));
        case 'ROLE_ADD': {
            const urgentRole = Object.entries(teamState.needs)
                .filter(([, n]) => n >= 0.5)
                .map(([r]) => r)[0];
            if (!urgentRole) return false;
            return incoming.some(p => determineFARole(p) === urgentRole);
        }
        case 'DEPTH_ADD':
            return incoming.length >= 1;
        case 'FUTURE_ASSETS':
            return false; // pick-based, player incoming 체크 아님
        default:
            return incoming.length > 0;
    }
}
