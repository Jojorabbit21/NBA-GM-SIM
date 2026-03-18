// FA valuation role (7 market roles for salary estimation)
export type FARole =
    | 'lead_guard'
    | 'combo_guard'
    | '3and_d'
    | 'shot_creator'
    | 'stretch_big'
    | 'rim_big'
    | 'floor_big';

export interface FAUserOffer {
    years: number;
    salary: number;
    offeredAt: string;
}

export interface FAMarketEntry {
    playerId: string;

    // 선수 요구 조건 (FA 시장 개막 시 계산, 고정)
    askingYears: number;
    askingSalary: number;  // per year

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
}
