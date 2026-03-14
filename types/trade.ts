
import { Player } from './player';

/** 트레이드 details 내 선수 참조 */
export interface TradePlayerRef {
    playerId: string;
    playerName: string;
}

/** 트레이드 details 내 픽 참조 */
export interface TradePickRef {
    season: number;
    round: 1 | 2;
    originalTeamId: string;     // 이 팀의 전적 기준으로 순번 결정
    protection?: string;        // 사람이 읽을 수 있는 보호 조건 요약 (예: "Top 5 protected")
}

/** 트레이드 Transaction의 details 타입 — 선수 + 픽 패키지 딜 지원 */
export interface TradeDetails {
    counterpartTeamId: string;  // 상대 팀 ID
    players?: {
        sent: TradePlayerRef[];
        received: TradePlayerRef[];
    };
    picks?: {
        sent: TradePickRef[];
        received: TradePickRef[];
    };
}

export interface Transaction {
    id: string;
    date: string;
    type: 'Trade' | 'Sign' | 'Release' | 'InjuryUpdate';
    teamId: string;
    description: string;
    details?: TradeDetails | any;
}

export interface TradeOffer {
    teamId: string;
    teamName: string;
    players: Player[];
    diffValue: number;
    analysis?: string[];
}
