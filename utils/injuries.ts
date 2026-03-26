
// 부상 정보는 meta_players.base_attributes의 health/injuryType/returnDate 필드로 관리됩니다.
// dataMapper.ts가 DB에서 직접 읽으며, 아래 KNOWN_INJURIES는 레거시 fallback용으로만 유지합니다.
// 새 부상 선수 추가 시: Supabase meta_players.base_attributes에 직접 업데이트하세요.
export const KNOWN_INJURIES: Record<string, { type: string, returnDate: string }> = {};

/** 선수의 부상 상태를 건강으로 초기화 (커스텀 로스터 모드용) */
export const clearPlayerInjury = <T extends { health?: string; injuryType?: string; returnDate?: string }>(player: T): T => ({
    ...player,
    health: 'Healthy' as const,
    injuryType: undefined,
    returnDate: undefined,
});
