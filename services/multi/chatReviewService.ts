/**
 * chatReviewService — 세션 설정 "채팅 검수" 탭(신고 내역·메시지 검색·앞뒤 보기). 계획: docs/plan/league-chat-plan.md 3-b/3-e
 *
 * 서버 RPC(migrations/league_chat_review.sql)가 호출자를 검사한다: 전역 어드민 또는 세션 오너만, 그 밖은 'forbidden'.
 * DM 열람 범위 — 전역 어드민은 전부, 세션 오너는 신고가 접수된 대화만(오너가 참가자라 이해충돌 방지).
 */
import { supabase } from '../supabaseClient';
import { CHAT_REPORT_REASONS, type ChatReportReason } from './chatService';

export const CHAT_REVIEW_PAGE_SIZE = 50;

export interface ChatReportRow {
    report_id: number;
    reported_at: string;
    reasons: ChatReportReason[];
    reporter_id: string;
    reporter_name: string;
    reporter_team: string | null;
    message_id: number;
    message_at: string;
    body: string;
    author_id: string;
    author_name: string;
    author_team: string | null;
    recipient_id: string | null;
    recipient_name: string | null;
    recipient_team: string | null;
    conv_key: string | null;
}

export interface ChatReviewMessage {
    id: number;
    created_at: string;
    body: string;
    author_id: string;
    author_name: string;
    author_team: string | null;
    recipient_id: string | null;
    recipient_name: string | null;
    recipient_team: string | null;
    conv_key: string | null;
    reported: boolean;
    /** 필터에 맞는 전체 건수(페이지네이션용, 모든 행에 같은 값) */
    total_count: number;
}

export type ChatReviewChannel = 'all' | 'public' | 'dm';

export interface ChatSearchParams {
    query?: string;
    channel?: ChatReviewChannel;
    userId?: string | null;
    convKey?: string | null;
    /** 1부터 */
    page?: number;
    pageSize?: number;
}

const REASON_LABEL = new Map(CHAT_REPORT_REASONS.map(r => [r.code, r.label]));
export const reportReasonLabel = (code: string): string => REASON_LABEL.get(code as ChatReportReason) ?? code;

export async function listChatReports(roomId: string, beforeId?: number | null): Promise<ChatReportRow[]> {
    const { data, error } = await supabase.rpc('list_chat_reports', {
        p_room_id: roomId, p_before_id: beforeId ?? null, p_limit: CHAT_REVIEW_PAGE_SIZE,
    });
    if (error) throw error;
    return ((data ?? []) as ChatReportRow[]).map(r => ({ ...r, report_id: Number(r.report_id), message_id: Number(r.message_id) }));
}

/** 필터 검색(최신순, 페이지 단위). total = 필터에 맞는 전체 건수 */
export async function searchChatMessages(roomId: string, p: ChatSearchParams): Promise<{ rows: ChatReviewMessage[]; total: number }> {
    const pageSize = p.pageSize ?? CHAT_REVIEW_PAGE_SIZE;
    const { data, error } = await supabase.rpc('search_chat_messages', {
        p_room_id: roomId,
        p_query: p.query?.trim() || null,
        p_channel: p.channel ?? 'all',
        p_user_id: p.userId ?? null,
        p_conv_key: p.convKey ?? null,
        p_around_id: null,
        p_limit: pageSize,
        p_offset: (Math.max(1, p.page ?? 1) - 1) * pageSize,
    });
    if (error) throw error;
    const rows = ((data ?? []) as ChatReviewMessage[]).map(m => ({ ...m, id: Number(m.id), total_count: Number(m.total_count) }));
    return { rows, total: rows[0]?.total_count ?? 0 };
}

/** 그 메시지와 같은 채널(퍼블릭 또는 같은 DM 대화)에서 앞 30건 + 뒤 30건, 오래된 순 */
export async function fetchChatContext(roomId: string, messageId: number): Promise<ChatReviewMessage[]> {
    const { data, error } = await supabase.rpc('search_chat_messages', {
        p_room_id: roomId, p_around_id: messageId,
    });
    if (error) throw error;
    return ((data ?? []) as ChatReviewMessage[]).map(m => ({ ...m, id: Number(m.id), total_count: Number(m.total_count) }));
}

/** 사유 코드 목록 → "홍보, 금전 요구" */
export const reportReasonsText = (codes: string[]): string => codes.map(reportReasonLabel).join(', ');

/** 서버 오류 → 화면 문구 */
export function chatReviewErrorMessage(e: unknown): string {
    const msg = (e as { message?: string } | null)?.message;
    if (msg === 'forbidden') return '세션 오너와 전역 어드민만 볼 수 있어요.';
    if (msg === 'not_found') return '메시지를 찾을 수 없거나 볼 수 있는 범위가 아니에요.';
    return '불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
}
