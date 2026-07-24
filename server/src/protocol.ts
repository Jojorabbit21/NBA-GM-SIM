/**
 * WebSocket 메시지 프로토콜 — 델타 전송 기반
 *
 * 브라우저 WS는 커스텀 헤더 불가 → 연결 직후 첫 메시지로 인증.
 * 이후 cursor + 새 픽 1개만 델타 전송 (기존 40KB/픽 → ~200B).
 */

// ── 공용 서브타입 ──────────────────────────────────────────────────────────────

export interface PickOrderEntry {
    userId: string;
    teamId: string;
    isAi?: boolean;
}

export interface DraftPickEntry {
    pickIndex: number;
    round: number;
    slot: number;
    userId: string;
    teamId: string;
    playerId: string;
    playerName: string;
    position: string;
    ovr: number;
    pickedAt: string;
}

export interface DraftCursor {
    /** waiting: 로터리 완료, 예정 시각 전(입장은 가능하나 픽/타이머 없음) */
    status: 'waiting' | 'active' | 'paused' | 'completed';
    currentPickIndex: number;
    /** waiting 상태에서는 아직 픽이 시작되지 않았으므로 null */
    currentPickStartedAt: string | null;
    pausedAt?: string;
}

export interface DraftConfig {
    format: 'snake' | 'linear';
    totalRounds: number;
    pickDurationSec: number;
    teamCount: number;
    poolIds: string[];
    pickOrder: PickOrderEntry[];
    /** 올타임 풀 포함 여부 — true면 풀 선수의 OVR을 custom_overrides 반영해 계산한다. */
    applyCustomOverrides?: boolean;
}

export interface DraftPoolPlayer {
    id: string;
    name: string;
    position: string;
    salary: number;
    base_attributes: Record<string, unknown>;
}

// ── 클라이언트 → 서버 ─────────────────────────────────────────────────────────

/** 연결 직후 첫 메시지 — JWT 인증 + 방 입장 */
export interface AuthMsg {
    type: 'auth';
    roomId: string;
    token: string;
}

/** 유저 픽 제출 */
export interface SubmitPickMsg {
    type: 'submitPick';
    playerId: string;
}

/** 어드민 액션 (pause/resume/reset-timer/skip-turn/autocomplete/rollback) */
export interface AdminMsg {
    type: 'admin';
    action: 'pause' | 'resume' | 'reset-timer' | 'skip-turn' | 'autocomplete' | 'rollback';
    params?: { targetPickIndex?: number };
}

/** Heartbeat */
export interface PingMsg {
    type: 'ping';
}

export type ClientMsg = AuthMsg | SubmitPickMsg | AdminMsg | PingMsg;

// ── 서버 → 클라이언트 ─────────────────────────────────────────────────────────

/** 초기 스냅샷 — 연결 후 1회만 전송. 풀 포함. */
export interface SnapshotMsg {
    type: 'snapshot';
    config: DraftConfig;
    cursor: DraftCursor;
    picks: DraftPickEntry[];
    pool: DraftPoolPlayer[];
}

/** 픽 델타 — cursor + 새 픽 1개만 (기존 40KB → ~200B) */
export interface PickMsg {
    type: 'pick';
    pick: DraftPickEntry;
    cursor: DraftCursor;
}

/** cursor만 변경 (pause/resume/reset-timer) */
export interface CursorMsg {
    type: 'cursor';
    cursor: DraftCursor;
}

/** 픽 제출 성공 ack (제출자에게만) */
export interface AckMsg {
    type: 'ack';
    playerId: string;
}

/** 에러 (제출자 또는 어드민에게만) */
export interface ErrorMsg {
    type: 'error';
    code: 'unauthorized' | 'not_your_turn' | 'already_drafted' | 'draft_not_active' | 'not_admin' | 'internal';
    message?: string;
}

/** Heartbeat 응답 */
export interface PongMsg {
    type: 'pong';
}

export type ServerMsg = SnapshotMsg | PickMsg | CursorMsg | AckMsg | ErrorMsg | PongMsg;

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

export function encode(msg: ServerMsg): string {
    return JSON.stringify(msg);
}

export function decode(raw: string | Buffer): ClientMsg | null {
    try {
        return JSON.parse(raw.toString()) as ClientMsg;
    } catch {
        return null;
    }
}
