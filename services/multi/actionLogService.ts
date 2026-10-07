/**
 * actionLogService — 리그 세션 감사 로그(league_action_logs) 조회 (어드민 전용).
 *
 * [2026-10-05] 사용자들이 세션 안에서 내린 결정(영입/방출/트레이드 제안·응답/트레이드 블록/
 * 트레이드 요청/드래프트 지명/리그 설정 변경/어드민 조작)을 한 테이블에 쌓고 세션 설정 "로그" 탭에서
 * 본다. 기록 자체는 전부 DB 트리거·RPC(migrations/add_league_action_logs.sql)가 하므로 클라이언트는
 * 읽기만 한다. RLS가 글로벌 어드민/리그 어드민에게만 SELECT를 허용하므로 일반 유저가 호출하면 빈 배열.
 */
import { supabase } from '../supabaseClient';

export type ActionLogActorRole = 'user' | 'league_admin' | 'global_admin' | 'system';

export interface ActionLogRow {
    id: number;
    room_id: string;
    league_id: string;
    actor_user_id: string | null;
    actor_role: ActionLogActorRole;
    actor_email: string | null;
    actor_nickname: string | null;
    team_id: string | null;
    action: string;
    target_player_ids: string[];
    target_team_ids: string[];
    details: Record<string, unknown>;
    sim_date: string | null;
    created_at: string;
}

/** 액션 코드 → 한국어 라벨. 알 수 없는 코드는 원문 그대로 보여준다. */
export const ACTION_LABELS: Record<string, string> = {
    fa_sign:                '선수 영입',
    waive:                  '선수 방출',
    trade_offer_create:     '트레이드 제안',
    trade_offer_accept:     '트레이드 수락',
    trade_offer_reject:     '트레이드 거절',
    trade_offer_cancel:     '트레이드 제안 취소',
    trade_offer_expire:     '트레이드 제안 만료',
    trade_offer_invalidate: '트레이드 제안 무효화',
    trade_block_set:        '트레이드 블록 등록',
    trade_block_unset:      '트레이드 블록 해제',
    trade_request_update:   '트레이드 요청 수정',
    team_reassign:          '팀 담당자 변경',
    draft_pick:             '드래프트 지명',
    league_settings_update: '리그 설정 변경',
    admin_trade:            '어드민 트레이드',
    admin_time_jump:        '어드민 시간 점프',
    admin_tactics_update:   '어드민 전술 수정',
    admin_trade_failed:     '어드민 트레이드 실패',
};

/** 필터 UI용 카테고리 묶음. */
export const ACTION_CATEGORIES: { id: string; label: string; actions: string[] }[] = [
    { id: 'roster',   label: '영입/방출',   actions: ['fa_sign', 'waive'] },
    { id: 'trade',    label: '트레이드',    actions: ['trade_offer_create', 'trade_offer_accept', 'trade_offer_reject', 'trade_offer_cancel', 'trade_offer_expire', 'trade_offer_invalidate', 'admin_trade', 'admin_trade_failed'] },
    { id: 'block',    label: '블록/요청',   actions: ['trade_block_set', 'trade_block_unset', 'trade_request_update'] },
    { id: 'draft',    label: '드래프트',    actions: ['draft_pick'] },
    { id: 'settings', label: '설정/운영',   actions: ['league_settings_update', 'team_reassign', 'admin_time_jump', 'admin_tactics_update'] },
];

export const ROLE_LABELS: Record<ActionLogActorRole, string> = {
    user: '유저', league_admin: '리그 어드민', global_admin: '글로벌 어드민', system: '시스템',
};

export const ACTION_LOG_PAGE_SIZE = 50;

export interface ActionLogQuery {
    roomId: string;
    /** 비어 있으면 전체. */
    actions?: string[];
    teamId?: string | null;
    actorUserId?: string | null;
    /** 커서: 이 id보다 작은(=더 오래된) 행만. */
    beforeId?: number | null;
    limit?: number;
}

export const listActionLogs = async (q: ActionLogQuery): Promise<{ rows: ActionLogRow[]; error: string | null }> => {
    const limit = q.limit ?? ACTION_LOG_PAGE_SIZE;
    let query = supabase
        .from('league_action_logs')
        .select('*')
        .eq('room_id', q.roomId)
        .order('id', { ascending: false })
        .limit(limit);
    if (q.actions && q.actions.length > 0) query = query.in('action', q.actions);
    if (q.teamId) query = query.or(`team_id.eq.${q.teamId},target_team_ids.cs.{${q.teamId}}`);
    if (q.actorUserId) query = query.eq('actor_user_id', q.actorUserId);
    if (q.beforeId) query = query.lt('id', q.beforeId);
    const { data, error } = await query;
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []) as ActionLogRow[], error: null };
};
