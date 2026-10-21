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
    /** DM이면 받는 사람(전체 채팅은 null) — [2026-10-21] DM */
    recipient_id?: string | null;
    /** DM 대화 키 'dm:{작은uid}:{큰uid}'(전체 채팅은 null) */
    conv_key?: string | null;
    /** 누군가 신고한 메시지(신고자·사유는 내려오지 않음) — 신고 버튼 비활성용 */
    reported?: boolean;
}

const COLUMNS = 'id, room_id, user_id, team_id, team_abbr, team_name, author, body, created_at, recipient_id, conv_key, reported';

export const chatTopic = (roomId: string): string => `league-chat:${roomId}`;
/** 내 DM 받은편지함 채널 — 대화마다 채널을 만들지 않고 사람마다 1개 */
export const dmTopic = (roomId: string, userId: string): string => `league-dm:${roomId}:${userId}`;
/** 서버 dm_conv_key()와 같은 규칙 — A→B, B→A가 같은 대화 */
export const dmConvKey = (a: string, b: string): string => (a < b ? `dm:${a}:${b}` : `dm:${b}:${a}`);

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
    | 'rate_limited' | 'invalid_body' | 'not_a_member' | 'not_authenticated' | 'dm_not_supported'
    | 'invalid_recipient' | 'already_reported' | 'own_message' | 'invalid_reasons' | 'not_found' | 'invalid_conversation'
    | 'unknown';

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

const KNOWN_CODES: ChatErrorCode[] = [
    'rate_limited', 'invalid_body', 'not_a_member', 'not_authenticated', 'dm_not_supported',
    'invalid_recipient', 'already_reported', 'own_message', 'invalid_reasons', 'not_found', 'invalid_conversation',
];

/** 사용자에게 보여줄 한국어 문구 */
export function chatErrorMessage(e: unknown): string {
    if (e instanceof ChatSendError) {
        switch (e.code) {
            case 'rate_limited':     return `메시지를 너무 빠르게 보내고 있어요. ${e.waitSec ?? 5}초 뒤에 다시 보낼 수 있어요.`;
            case 'invalid_body':     return `메시지는 1~${CHAT_MAX_BODY}자로 입력해 주세요.`;
            case 'not_a_member':     return '이 리그의 참가자만 채팅할 수 있어요.';
            case 'not_authenticated': return '로그인이 필요해요.';
            case 'invalid_recipient': return '이 참가자에게는 메시지를 보낼 수 없어요.';
            default: break;
        }
    }
    return '전송하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

function toChatError(error: { message: string; details?: string | null }): ChatSendError {
    const code = KNOWN_CODES.find(c => c === error.message) ?? 'unknown';
    const wait = code === 'rate_limited' ? parseInt(error.details ?? '', 10) : NaN;
    return new ChatSendError(code, Number.isFinite(wait) ? wait : undefined);
}

/**
 * RPC 전송. recipientId가 있으면 DM. 실패는 ChatSendError(코드 + 남은 초)로 던진다. 서버 예외 메시지가 곧 코드다.
 * 서버 레이트 리밋(10초 10건)은 전체 채팅 + DM을 합산한다.
 */
export async function sendChatMessage(roomId: string, body: string, recipientId?: string | null): Promise<ChatMessage> {
    const { data, error } = await supabase.rpc('send_chat_message', {
        p_room_id: roomId, p_body: body, p_recipient_id: recipientId ?? null,
    });
    if (error) throw toChatError(error);
    return data as ChatMessage;
}

// ── DM (2026-10-21) ─────────────────────────────────────────────────────────────
// DDL·RPC 전문: migrations/league_chat_dm.sql. 대화방 테이블 없음 — conv_key로 묶는다.

export interface DmConversation {
    conv_key: string;
    peer_id: string;
    peer_name: string;
    peer_team_id: string | null;
    peer_team_abbr: string | null;
    peer_team_name: string | null;
    last_id: number;
    last_at: string;
    unread: number;
    /** "나에게서만 삭제" 기준 — 이 id 이하 메시지는 내 화면에서 숨긴다 */
    cleared_before_id: number;
}

export interface DmCandidate {
    user_id: string;
    nickname: string;
    team_id: string | null;
    team_abbr: string | null;
    team_name: string | null;
}

/** 내 DM 대화 목록(마지막 메시지 최신순, 내가 삭제한 뒤 새 메시지가 없는 대화는 빠짐) */
export async function listDmConversations(roomId: string): Promise<DmConversation[]> {
    const { data, error } = await supabase.rpc('list_dm_conversations', { p_room_id: roomId });
    if (error) throw toChatError(error);
    return ((data ?? []) as DmConversation[]).map(c => ({ ...c, last_id: Number(c.last_id), cleared_before_id: Number(c.cleared_before_id) }));
}

/** 새 대화 상대 후보 — 같은 방의 사람 참가자(나·AI 팀 제외, 관전자는 애초에 멤버가 아님) */
export async function listDmCandidates(roomId: string): Promise<DmCandidate[]> {
    const { data, error } = await supabase.rpc('list_dm_candidates', { p_room_id: roomId });
    if (error) throw toChatError(error);
    return (data ?? []) as DmCandidate[];
}

/** DM 메시지를 **오래된 순**으로. afterId(삭제 기준) 이하 제외, beforeId가 있으면 그보다 오래된 페이지 */
export async function fetchDmMessages(
    roomId: string, convKey: string, afterId: number, beforeId?: number, limit: number = CHAT_PAGE_SIZE,
): Promise<ChatMessage[]> {
    let q = supabase
        .from('league_chat_messages')
        .select(COLUMNS)
        .eq('room_id', roomId)
        .eq('conv_key', convKey)
        .gt('id', afterId)
        .order('id', { ascending: false })
        .limit(limit);
    if (beforeId != null) q = q.lt('id', beforeId);
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as ChatMessage[]).reverse();
}

/** 내 대화별 삭제 기준(없으면 0) — 목록에서 빠진(삭제한) 대화를 새 대화로 다시 열 때 예전 메시지를 숨기려고 */
export async function fetchDmClearedId(roomId: string, convKey: string): Promise<number> {
    const { data, error } = await supabase
        .from('league_dm_state')
        .select('cleared_before_id')
        .eq('room_id', roomId)
        .eq('conv_key', convKey)
        .maybeSingle();
    if (error) throw error;
    return Number((data as { cleared_before_id?: number } | null)?.cleared_before_id ?? 0);
}

export async function markDmRead(roomId: string, convKey: string, lastId: number): Promise<void> {
    const { error } = await supabase.rpc('mark_dm_read', { p_room_id: roomId, p_conv_key: convKey, p_last_id: lastId });
    if (error) throw toChatError(error);
}

/** 대화 삭제 — 나에게서만(지금까지의 메시지를 내 목록·화면에서 숨김, 상대 대화는 그대로) */
export async function clearDmConversation(roomId: string, convKey: string): Promise<void> {
    const { error } = await supabase.rpc('clear_dm_conversation', { p_room_id: roomId, p_conv_key: convKey });
    if (error) throw toChatError(error);
}

// ── 메시지 신고 (2026-10-21) ────────────────────────────────────────────────────

export type ChatReportReason = 'abuse' | 'spam' | 'gambling' | 'promotion' | 'money_request' | 'obscene' | 'other';

/** 표시 순서 = 서버 check 제약의 7종 */
export const CHAT_REPORT_REASONS: Array<{ code: ChatReportReason; label: string }> = [
    { code: 'abuse', label: '욕설' },
    { code: 'spam', label: '도배' },
    { code: 'gambling', label: '사행성' },
    { code: 'promotion', label: '홍보' },
    { code: 'money_request', label: '금전 요구' },
    { code: 'obscene', label: '문란' },
    { code: 'other', label: '기타' },
];

/** 신고(메시지당 1회, 사유 다중 선택). 처리는 일어나지 않고 기록만 남는다. */
export async function reportChatMessage(messageId: number, reasons: ChatReportReason[]): Promise<void> {
    const { error } = await supabase.rpc('report_chat_message', { p_message_id: messageId, p_reasons: reasons });
    if (error) throw toChatError(error);
}

export function reportErrorMessage(e: unknown): string {
    if (e instanceof ChatSendError) {
        switch (e.code) {
            case 'already_reported': return '이미 신고된 메시지예요.';
            case 'own_message':      return '내 메시지는 신고할 수 없어요.';
            case 'invalid_reasons':  return '신고 사유를 하나 이상 골라 주세요.';
            case 'not_found':        return '메시지를 찾을 수 없어요.';
            default: break;
        }
    }
    return '신고하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

/**
 * 전송 본문 정리 — 서버 `sanitize_chat_body`(migrations/league_chat_messages.sql)의 미러. 서버가 최종 판정이고,
 * 이 함수는 보내기 전에 같은 결과를 미리 보여주려는 것(임시 말풍선이 서버 저장 결과와 같아지도록).
 * 규칙: CRLF → LF / 보이지 않는 문자·텍스트 방향 제어 문자 제거 / 줄바꿈 연속은 하나로 / 앞뒤 공백·줄바꿈 제거 /
 * **줄바꿈은 최대 1번**(두 번째부터는 공백으로 바꿈 → 최대 2줄).
 */
export function sanitizeChatBody(raw: string): string {
    const t = raw
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0001-\u0008\u000B-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, '')
        .replace(/\s*\n\s*/g, '\n')
        .replace(/^[ \n\t]+|[ \n\t]+$/g, '');
    const i = t.indexOf('\n');
    return i < 0 ? t : t.slice(0, i + 1) + t.slice(i + 1).replace(/\n/g, ' ');
}

/** 입력창에 타이핑·붙여넣는 도중용 — 줄바꿈이 둘 이상이 되지 않게만 막는다(앞뒤 공백은 건드리지 않음). */
export function limitDraftNewlines(value: string): string {
    const v = value.replace(/\r\n?/g, '\n');
    const i = v.indexOf('\n');
    return i < 0 ? v : v.slice(0, i + 1) + v.slice(i + 1).replace(/\n/g, ' ');
}

/** 클라이언트 도배 잠금 판정(순수 함수). 전송 시각(ms) 목록에 now를 더했을 때 잠가야 하면 true. */
export function shouldFloodLock(sentAt: number[], now: number): boolean {
    const recent = sentAt.filter(t => now - t < CHAT_FLOOD_WINDOW_MS);
    return recent.length >= CHAT_FLOOD_COUNT;
}
