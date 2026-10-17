/**
 * chatService — 리그 세션 채팅(league_chat_messages). 계획: docs/plan/league-chat-plan.md
 *
 * 저장은 테이블, 실시간 전달은 비공개 Broadcast 채널(`league-chat:{room_id}`)이다.
 * 쓰기는 RPC send_chat_message 단일 경로(테이블 직접 INSERT 권한 없음) — RPC가 멤버 검증·길이·서버 레이트 리밋을 한다.
 * 서버 DDL 전문: migrations/league_chat_messages.sql.
 */
import { supabase } from '../supabaseClient';

// ── 상수(도배 방지 값은 여기 한 곳에서만 조정) ──────────────────────────────
export const CHAT_MAX_BODY = 500;
export const CHAT_PAGE_SIZE = 50;
/** 전송 직후 전송 버튼만 잠깐 비활성(안내 문구 없음) */
export const CHAT_COOLDOWN_MS = 500;
/** 도배 잠금: FLOOD_WINDOW 안에 FLOOD_COUNT건을 보내면 FLOOD_LOCK 동안 입력 잠금. 서버 한도(10초 10건)보다 느슨하게 앞단에서 걸러낸다 */
export const CHAT_FLOOD_COUNT = 5;
export const CHAT_FLOOD_WINDOW_MS = 3000;
export const CHAT_FLOOD_LOCK_MS = 5000;

export interface ChatMessage {
    id: number;
    room_id: string;
    user_id: string;
    team_id: string | null;
    team_abbr: string | null;
    team_name: string | null;
    author: string;
    body: string;
    created_at: string;
}

const COLUMNS = 'id, room_id, user_id, team_id, team_abbr, team_name, author, body, created_at';

export const chatTopic = (roomId: string): string => `league-chat:${roomId}`;

/**
 * 최근 메시지를 **오래된 순**으로 돌려준다. beforeId가 있으면 그보다 오래된 페이지(위로 스크롤 시).
 * recipient_id가 있는 행(훗날 DM)은 리그 전체 채팅에 섞이지 않도록 제외한다.
 */
export async function fetchChatMessages(roomId: string, beforeId?: number, limit: number = CHAT_PAGE_SIZE): Promise<ChatMessage[]> {
    let q = supabase
        .from('league_chat_messages')
        .select(COLUMNS)
        .eq('room_id', roomId)
        .is('recipient_id', null)
        .order('id', { ascending: false })
        .limit(limit);
    if (beforeId != null) q = q.lt('id', beforeId);
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as ChatMessage[]).reverse();
}

export type ChatErrorCode =
    | 'rate_limited' | 'invalid_body' | 'not_a_member' | 'not_authenticated' | 'dm_not_supported' | 'unknown';

export class ChatSendError extends Error {
    code: ChatErrorCode;
    /** rate_limited일 때 서버가 알려준 남은 초 */
    waitSec?: number;
    constructor(code: ChatErrorCode, waitSec?: number) {
        super(code);
        this.code = code;
        this.waitSec = waitSec;
    }
}

const KNOWN_CODES: ChatErrorCode[] = ['rate_limited', 'invalid_body', 'not_a_member', 'not_authenticated', 'dm_not_supported'];

/** 사용자에게 보여줄 한국어 문구 */
export function chatErrorMessage(e: unknown): string {
    if (e instanceof ChatSendError) {
        switch (e.code) {
            case 'rate_limited':     return `메시지를 너무 빠르게 보내고 있어요. ${e.waitSec ?? 5}초 뒤에 다시 보낼 수 있어요.`;
            case 'invalid_body':     return `메시지는 1~${CHAT_MAX_BODY}자로 입력해 주세요.`;
            case 'not_a_member':     return '이 리그의 참가자만 채팅할 수 있어요.';
            case 'not_authenticated': return '로그인이 필요해요.';
            default: break;
        }
    }
    return '전송하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

/** RPC 전송. 실패는 ChatSendError(코드 + 남은 초)로 던진다. 서버 예외 메시지가 곧 코드다. */
export async function sendChatMessage(roomId: string, body: string): Promise<ChatMessage> {
    const { data, error } = await supabase.rpc('send_chat_message', { p_room_id: roomId, p_body: body });
    if (error) {
        const code = KNOWN_CODES.find(c => c === error.message) ?? 'unknown';
        const wait = code === 'rate_limited' ? parseInt(error.details ?? '', 10) : NaN;
        throw new ChatSendError(code, Number.isFinite(wait) ? wait : undefined);
    }
    return data as ChatMessage;
}

/** 클라이언트 도배 잠금 판정(순수 함수). 전송 시각(ms) 목록에 now를 더했을 때 잠가야 하면 true. */
export function shouldFloodLock(sentAt: number[], now: number): boolean {
    const recent = sentAt.filter(t => now - t < CHAT_FLOOD_WINDOW_MS);
    return recent.length >= CHAT_FLOOD_COUNT;
}
