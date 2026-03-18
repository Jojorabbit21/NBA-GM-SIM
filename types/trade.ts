
import { Player } from './player';
import { PickProtection } from './draftAssets';
import type { FARole } from './fa';
import type { TeamDirection } from './gm';

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
// CPU 트레이드 엔진 — 팀 상태 & 목표 타입
// ──────────────────────────────────────────────

/** 트레이드 목표 유형 — CPU 단장이 이번 거래에서 무엇을 원하는가 */
export type TradeGoalType =
    | 'STAR_UPGRADE'       // 스타 1명 확보
    | 'STARTER_UPGRADE'    // 주전 1자리 업그레이드
    | 'ROLE_ADD'           // 특정 FA롤 보강
    | 'DEPTH_ADD'          // 뎁스 보강
    | 'FUTURE_ASSETS'      // 미래 자산 확보 (픽/유망주)
    | 'SALARY_RELIEF'      // 연봉 정리
    | 'SURPLUS_CLEAR'      // 중복 자원 방출
    | 'EXPIRING_LEVERAGE'; // 만기 계약 활용

/** 팀 트레이드 상태 — 즉석 계산, 저장 안 함 */
export interface TeamTradeState {
    phase: TeamDirection;
    strengthNow: number;        // 현재 로스터 OVR 기반 전력 (0~100)
    strengthFuture: number;     // 미래 전력 (젊은 자산 가중)
    timelineAge: number;        // 주전 8인 가중 평균 나이
    financialPressure: number;  // 페이롤 압박 (0~1, 1 = 럭셔리택스 초과)
    winPct: number;             // 시즌 승률
    needs: Partial<Record<FARole, number>>;  // 롤별 필요도 (0~1)
    surpluses: Record<string, number>;       // 포지션별 과잉 선수 수
    picksOwnedScore: number;    // 보유 픽 가치 합계
    openRosterFlex: number;     // 로스터 빈자리 (15 - roster.length)
    tradeGoal?: TradeGoalType;  // 이번 사이클 목표
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
