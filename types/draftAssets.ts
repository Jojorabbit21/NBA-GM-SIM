
/** 픽 보호 조건 (트레이드된 픽에 붙는 조건) */
export interface PickProtection {
    type: 'top' | 'lottery' | 'none';
    threshold?: number;       // type='top'일 때: Top-X 보호 (예: 5 = Top 5 protected)
    fallbackSeason?: number;  // 보호 발동 시 전달되는 대체 시즌 (없으면 2라운드 픽으로 전환)
    fallbackRound?: 1 | 2;    // 보호 발동 시 대체 라운드
}

/** 픽 스왑 권리 */
export interface SwapRight {
    beneficiaryTeamId: string;  // 스왑 권리를 가진 팀
    originTeamId: string;       // 비교 대상 팀 (원래 픽 소유팀)
}

/** 단일 드래프트 픽 자산 */
export interface DraftPickAsset {
    season: number;             // 2025, 2026, ... 2031
    round: 1 | 2;
    originalTeamId: string;     // 원래 소유팀 (이 팀의 전적 기준으로 순번 결정)
    currentTeamId: string;      // 현재 보유팀
    // 향후 트레이드 대비 필드
    protection?: PickProtection;  // 보호 조건 (트레이드된 픽에만 적용)
    swapRight?: SwapRight;        // 스왑 권리 (있으면 beneficiary가 더 좋은 픽 선택 가능)
    tradedDate?: string;          // 트레이드된 날짜 (거래 이력 추적용)
}

/**
 * 리그 전체 픽 소유 현황 — currentTeamId 기준으로 그룹핑
 * 각 팀이 현재 보유 중인 DraftPickAsset[] 배열
 *
 * Stepien Rule (향후 트레이드 검증 시 사용):
 * - 연속 두 해의 1라운드 픽을 모두 트레이드할 수 없음
 * - 매 홀수 연도에 최소 하나의 1라운드 픽 보유 필요
 */
export type LeaguePickAssets = Record<string, DraftPickAsset[]>;

// ── resolveDraftOrder 결과 타입 ──

/** 최종 드래프트 오더의 개별 픽 */
export interface ResolvedPick {
    pickNumber: number;       // 1~60
    round: 1 | 2;
    originalTeamId: string;   // 이 슬롯을 결정한 팀 (전적 기준)
    currentTeamId: string;    // 실제 지명권자
    note?: string;            // 변동사항 ("OKC 소유 (트레이드)" 등)
}

/** 보호 조건 판정 결과 */
export interface ProtectionResult {
    round: 1 | 2;
    originalTeamId: string;
    currentTeamId: string;
    slot: number;
    protection: PickProtection;
    triggered: boolean;
    fallbackAction?: string;  // "2027 1R로 이관" 등
}

/** 스왑 권리 실행 결과 */
export interface SwapResult {
    round: 1 | 2;
    beneficiaryTeamId: string;
    originTeamId: string;
    beneficiarySlot: number;
    originSlot: number;
    swapped: boolean;
}

/** resolveDraftOrder() 전체 결과 */
export interface ResolvedDraftOrder {
    picks: ResolvedPick[];           // 60개
    protectionResults: ProtectionResult[];
    swapResults: SwapResult[];
    updatedPickAssets: LeaguePickAssets;  // fallback 이관 반영된 새 자산
}
