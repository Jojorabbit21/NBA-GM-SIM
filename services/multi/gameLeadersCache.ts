
// 종료된 경기의 PTS/REB/AST 리더를 localStorage에 영구 캐싱.
// game_pbp row는 시뮬레이션 완료 시 1회 upsert된 뒤 갱신되지 않으므로(관리자 수동
// 재시뮬레이션 제외), 한 번 조회한 리더는 다시 조회할 필요가 없다.
// 설계 배경: docs/plan/schedule-leaders-cache-plan.md

export interface StatLeader { name: string; value: number; position?: string }
export interface GameLeaders { pts?: StatLeader; reb?: StatLeader; ast?: StatLeader }

const keyFor = (roomId: string) => `nbagm:gameLeaders:${roomId}`;

export function loadGameLeadersCache(roomId: string): Record<string, GameLeaders> {
    try {
        const raw = localStorage.getItem(keyFor(roomId));
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {}; // 손상된 캐시는 빈 값으로 폴백 — 다음 조회에서 자연 복구
    }
}

export function mergeGameLeadersCache(
    roomId: string,
    updates: Record<string, GameLeaders>,
): Record<string, GameLeaders> {
    const merged = { ...loadGameLeadersCache(roomId), ...updates };
    try { localStorage.setItem(keyFor(roomId), JSON.stringify(merged)); } catch { /* 용량 초과 등 무시 */ }
    return merged;
}

// 토너먼트 리셋 시 호출 — 게임 ID가 T_R{round}_M{matchIndex} 형태로 위치 기반이라
// 리셋 후 같은 room.id로 새 토너먼트를 시작하면 예전과 동일한 game_id가 재사용된다.
export function clearGameLeadersCache(roomId: string): void {
    try { localStorage.removeItem(keyFor(roomId)); } catch { /* ignore */ }
}
