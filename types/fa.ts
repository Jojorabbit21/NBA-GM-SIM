import type { Player, PlayerContract } from './player';

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
    | 'bae'          // Bi-Annual Exception (~$4.516M, 비납세자, 2시즌에 1번)
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
    prevTeamTenure?: number; // Bird Rights 판정용 — teamTenure 리셋 전 값 (계약 만료 선수)
    isBuyout?: boolean;    // 방출(waive/buyout/stretch) 출신 여부 — 에이프런 영입 제한 적용

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

    // RFA 관련
    isRFA?: boolean;           // 1라운드 루키 QO 텐더 시 true
    qualifyingOffer?: number;  // QO 텐더 금액
    originalTeamId?: string;  // RFA 원소속팀 ID (매칭 권한 판정용)

    // 상태
    status: 'available' | 'pending_match' | 'signed' | 'withdrawn';
    signedTeamId?: string;
    signedYears?: number;
    signedSalary?: number;
}

// 오퍼시트 — RFA 원소속팀 매칭 대기 중인 계약
export interface PendingOfferSheet {
    id: string;
    playerId: string;
    offeringTeamId: string;     // 오퍼시트를 제출한 팀
    originalTeamId: string;     // 매칭 권한을 가진 원소속팀
    salary: number;
    years: number;
    contract: PlayerContract;
    signingType: SigningType;
    submittedDate: string;
    matchDeadline: string;      // submittedDate + 3일
}

export interface LeagueFAMarket {
    openDate: string;
    closeDate: string;
    entries: FAMarketEntry[];
    usedMLE: Record<string, boolean>;  // teamId → MLE 사용 여부
    players?: Player[];                // FA 후보 전체 선수 객체 (faPlayerMap 구성용)
    pendingOfferSheets?: PendingOfferSheet[];  // 매칭 대기 중인 RFA 오퍼시트
}
