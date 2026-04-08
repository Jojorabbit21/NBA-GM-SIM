
/**
 * 멀티플레이어 드래프트 상태 — rooms.draft_state JSONB에 저장된다.
 *
 * 불변 필드 (start-draft 시 1회 세팅):
 *   format, totalRounds, pickDurationSec, teamCount, poolIds, pickOrder
 * 변경 필드 (픽마다 갱신):
 *   status, currentPickIndex, currentPickStartedAt, picks, draftedIds
 */

export interface PickOrderEntry {
    userId: string;
    teamId: string;
}

export interface DraftPickEntry {
    pickIndex: number;      // 0-based 전역 인덱스
    round: number;          // 1-based
    slot: number;           // 라운드 내 1-based 순번
    userId: string;
    teamId: string;
    playerId: string;
    playerName: string;
    position: string;
    ovr: number;
    pickedAt: string;       // ISO timestamp
}

export interface MultiDraftState {
    // ── 불변 설정 ────────────────────────────────────────────────────────────
    format:          'snake';
    totalRounds:     number;          // 10
    pickDurationSec: number;          // 30
    teamCount:       number;
    poolIds:         string[];        // 드래프트 가능한 meta_players.id 전체

    // snake 픽 순서 (미리 계산, teamCount × totalRounds 개)
    pickOrder: PickOrderEntry[];

    // ── 진행 상태 ────────────────────────────────────────────────────────────
    status:               'pending' | 'active' | 'completed';
    currentPickIndex:     number;     // 0-based
    currentPickStartedAt: string;     // ISO — 타이머 기준

    // ── 결과 ─────────────────────────────────────────────────────────────────
    picks:      DraftPickEntry[];
    draftedIds: string[];             // 빠른 중복 검사용
}

/** useLeagueDraft가 반환하는 드래프트 풀 선수 (display 전용) */
export interface DraftPoolPlayer {
    id:       string;
    name:     string;
    position: string;
    ovr:      number;
    salary:   number;
}
