
import { Player } from './player';
import { PickProtection } from './draftAssets';

// ──────────────────────────────────────────────
// 기본 참조 타입
// ──────────────────────────────────────────────

/** 트레이드 details 내 선수 참조 */
export interface TradePlayerRef {
    playerId: string;
    playerName: string;
}

/** 트레이드 details 내 픽 참조 (간단) */
export interface TradePickRef {
    season: number;
    round: 1 | 2;
    originalTeamId: string;     // 이 팀의 전적 기준으로 순번 결정
    protection?: string;        // 사람이 읽을 수 있는 보호 조건 요약 (예: "Top 5 protected")
}

/** 트레이드 실행에 필요한 확장 픽 참조 */
export interface PersistentPickRef extends TradePickRef {
    currentTeamId: string;      // 현재 보유팀 (실행 시 필요)
    protectionDetail?: PickProtection; // 상세 보호 조건
}

// ──────────────────────────────────────────────
// 트랜잭션
// ──────────────────────────────────────────────

/** 트레이드 Transaction의 details 타입 — 선수 + 픽 패키지 딜 지원 */
export interface TradeDetails {
    counterpartTeamId: string;  // 상대 팀 ID
    players?: {
        sent: TradePlayerRef[];
        received: TradePlayerRef[];
    };
    picks?: {
        sent: PersistentPickRef[];
        received: PersistentPickRef[];
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

// ──────────────────────────────────────────────
// 트레이드 블록 (영속)
// ──────────────────────────────────────────────

/** 트레이드 블록에 올린 개별 항목 */
export interface TradeBlockEntry {
    type: 'player' | 'pick';
    playerId?: string;           // type === 'player'
    pick?: TradePickRef;         // type === 'pick'
    addedDate: string;           // 블록에 올린 시뮬 날짜
}

/** 팀별 트레이드 블록 */
export interface TeamTradeBlock {
    teamId: string;
    entries: TradeBlockEntry[];
    lastEvaluated?: string;      // CPU 평가 쓰로틀용
}

/** 리그 전체 트레이드 블록 — teamId → block */
export type LeagueTradeBlocks = Record<string, TeamTradeBlock>;

// ──────────────────────────────────────────────
// 영속적 트레이드 오퍼
// ──────────────────────────────────────────────

export type TradeOfferStatus = 'pending' | 'accepted' | 'rejected' | 'countered' | 'expired';

/** 저장되는 트레이드 오퍼 (세션 간 영속) */
export interface PersistentTradeOffer {
    id: string;
    fromTeamId: string;          // 오퍼를 보낸 팀
    toTeamId: string;            // 오퍼를 받은 팀
    createdDate: string;         // 생성 시뮬 날짜
    expiresDate: string;         // 만료 시뮬 날짜 (+7일)
    status: TradeOfferStatus;
    // fromTeam이 보내는 자산
    offeredPlayers: TradePlayerRef[];
    offeredPicks: PersistentPickRef[];
    // fromTeam이 받고 싶은 자산
    requestedPlayers: TradePlayerRef[];
    requestedPicks: PersistentPickRef[];
    // 카운터 오퍼 연결
    parentOfferId?: string;
    analysis?: string[];         // CPU 분석 메시지
}

/** 리그 전체 활성 오퍼 */
export interface LeagueTradeOffers {
    offers: PersistentTradeOffer[];
}

// ──────────────────────────────────────────────
// 레거시 호환 (기존 offerGenerator/counterGenerator용)
// ──────────────────────────────────────────────

export interface TradeOffer {
    teamId: string;
    teamName: string;
    players: Player[];
    diffValue: number;
    analysis?: string[];
}
