import type { Player } from './player';

// FA valuation role (7 market roles for salary estimation)
export type FARole =
    | 'lead_guard'
    | 'combo_guard'
    | '3and_d'
    | 'shot_creator'
    | 'stretch_big'
    | 'rim_big'
    | 'floor_big';

// Contract signing slot types
export type SigningType =
    | 'cap_space'    // 팀 페이롤 < 캡 (기본 상태)
    | 'non_tax_mle'  // Non-Taxpayer MLE ($14.104M, 1차 에이프런 미만)
    | 'tax_mle'      // Taxpayer MLE ($5.685M, 1~2차 에이프런 사이)
    | 'bird_full'    // Full Bird Rights (teamTenure >= 3)
    | 'bird_early'   // Early Bird Rights (teamTenure == 2)
    | 'bird_non'     // Non-Bird Rights (teamTenure == 1)
    | 'vet_min';     // 베테랑 미니멈 (항상 가능)

// Per-role league supply/demand metrics
export interface MarketCondition {
    roleSupply: number;   // FA 후보 중 해당 롤 선수 수
    roleDemand: number;   // 해당 롤이 부족한 팀 수 (리그 하위 25%)
    ratio: number;        // demand / supply
}

// FA salary demand result (per player)
export interface FADemandResult {
    askingSalary: number;     // 협상 시작가 (openingAsk)
    walkAwaySalary: number;   // 이 이하면 무조건 거절
    targetSalary: number;     // 내부 목표가
    askingYears: number;
    marketValueScore: number;
    faRole: FARole;
}

export interface FAUserOffer {
    years: number;
    salary: number;
    offeredAt: string;
}

export interface FAMarketEntry {
    playerId: string;
    prevTeamId?: string;   // FA 등록 직전 소속팀 ID (Bird Rights 판정용)

    // 선수 요구 조건 (FA 시장 개막 시 계산, 고정)
    askingYears: number;
    askingSalary: number;     // openingAsk (협상 시작가)
    walkAwaySalary: number;   // 최저 수락선
    marketValueScore: number; // 내부 평가 점수 (표시용)
    faRole: FARole;

    // 경쟁 상황 (표시용)
    interestedTeamIds: string[];

    // 유저 오퍼
    userOffer?: FAUserOffer;

    // 상태
    status: 'available' | 'signed' | 'withdrawn';
    signedTeamId?: string;
    signedYears?: number;
    signedSalary?: number;
}

export interface LeagueFAMarket {
    openDate: string;
    closeDate: string;
    entries: FAMarketEntry[];
    usedMLE: Record<string, boolean>;  // teamId → MLE 사용 여부
    players?: Player[];                // FA 후보 전체 선수 객체 (faPlayerMap 구성용)
}
