/**
 * /admin 페이지 "사용자 관리" 탭 전용.
 * profiles 테이블 RLS(본인 행만 SELECT/UPDATE 허용, DELETE 정책 없음)로는 전체 유저
 * 조회·타인 수정·계정 삭제가 불가능해서, 서비스 롤 클라이언트를 쓰는 Fly.io 서버
 * (server/src/index.ts의 /admin/users*)를 거친다. 호출자가 고정 어드민 계정인지는
 * 서버에서 재검증한다.
 */
import { supabase } from '../supabaseClient';
import { FLY_SERVER } from '../multi/leagueService';

export interface AdminUserRow {
    id: string;
    email: string | null;
    nickname: string | null;
    first_name: string | null;
    last_name: string | null;
    birth_year: number | null;
    nationality: string | null;
    avatar_url: string | null;
    created_at: string;
    updated_at: string;
}

export type AdminUserEditableFields = Omit<AdminUserRow, 'id' | 'created_at' | 'updated_at'>;

async function authHeader(): Promise<Record<string, string>> {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export const adminListUsers = async (): Promise<{ data: AdminUserRow[]; error: string | null }> => {
    try {
        const res = await fetch(`${FLY_SERVER}/admin/users`, { headers: await authHeader() });
        const data = await res.json().catch(() => ({})) as any;
        if (!res.ok) return { data: [], error: data?.error ?? `HTTP ${res.status}` };
        return { data: data.users as AdminUserRow[], error: null };
    } catch (e: any) {
        return { data: [], error: e?.message ?? '사용자 목록 조회 실패' };
    }
};

export const adminUpdateUser = async (
    userId: string,
    fields: AdminUserEditableFields,
): Promise<{ data: AdminUserRow | null; error: string | null }> => {
    try {
        const res = await fetch(`${FLY_SERVER}/admin/users/update`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
            body:    JSON.stringify({ userId, ...fields }),
        });
        const data = await res.json().catch(() => ({})) as any;
        if (!res.ok) return { data: null, error: data?.error ?? `HTTP ${res.status}` };
        return { data: data.user as AdminUserRow, error: null };
    } catch (e: any) {
        return { data: null, error: e?.message ?? '사용자 정보 저장 실패' };
    }
};

export const adminDeleteUser = async (userId: string): Promise<{ error: string | null }> => {
    try {
        const res = await fetch(`${FLY_SERVER}/admin/users/delete`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
            body:    JSON.stringify({ userId }),
        });
        const data = await res.json().catch(() => ({})) as any;
        if (!res.ok) return { error: data?.error ?? `HTTP ${res.status}` };
        return { error: null };
    } catch (e: any) {
        return { error: e?.message ?? '사용자 삭제 실패' };
    }
};

// ─── 멀티플레이 전적 (홈 화면 MultiplayerHistory.tsx와 동일 소스 테이블) ─────────
// league_user_history / tournament_team_records 모두 tournament_team_records의
// UPDATE/DELETE RLS 정책이 아예 없어서 서비스 롤이 필요 — Fly 서버 경유로 통일.

export interface AdminLeagueHistoryRow {
    group_id: string;
    user_id: string;
    season_number: number;
    tier: string;
    league_id: string | null;
    league_name: string;
    team_count: number;
    wins: number;
    losses: number;
    playoff_wins: number;
    playoff_losses: number;
    final_rank: number | null;
    playoff_result: string | null;
    completed_at: string;
}

export interface AdminTournamentHistoryRow {
    id: string;
    archive_id: string;
    placement: number;
    final_round: number;
    series_wins: number;
    series_losses: number;
    game_wins: number;
    game_losses: number;
    pts_for: number;
    pts_against: number;
    tournament_archives: { name: string; team_count: number | null; completed_at: string | null } | null;
}

export type AdminLeagueHistoryEditable = Pick<AdminLeagueHistoryRow,
    'league_name' | 'team_count' | 'wins' | 'losses' | 'playoff_wins' | 'playoff_losses' | 'final_rank' | 'playoff_result'>;

export type AdminTournamentHistoryEditable = Pick<AdminTournamentHistoryRow,
    'placement' | 'final_round' | 'series_wins' | 'series_losses' | 'game_wins' | 'game_losses' | 'pts_for' | 'pts_against'>;

async function postJson(path: string, body: unknown): Promise<{ data: any; error: string | null }> {
    try {
        const res = await fetch(`${FLY_SERVER}${path}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
            body:    JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({})) as any;
        if (!res.ok) return { data: null, error: data?.error ?? `HTTP ${res.status}` };
        return { data, error: null };
    } catch (e: any) {
        return { data: null, error: e?.message ?? '요청 실패' };
    }
}

export const adminGetUserHistory = async (
    userId: string
): Promise<{ league: AdminLeagueHistoryRow[]; tournament: AdminTournamentHistoryRow[]; error: string | null }> => {
    try {
        const res = await fetch(`${FLY_SERVER}/admin/users/history?userId=${encodeURIComponent(userId)}`, {
            headers: await authHeader(),
        });
        const data = await res.json().catch(() => ({})) as any;
        if (!res.ok) return { league: [], tournament: [], error: data?.error ?? `HTTP ${res.status}` };
        return { league: data.league ?? [], tournament: data.tournament ?? [], error: null };
    } catch (e: any) {
        return { league: [], tournament: [], error: e?.message ?? '전적 조회 실패' };
    }
};

export const adminUpdateLeagueHistory = async (
    groupId: string, userId: string, seasonNumber: number, fields: AdminLeagueHistoryEditable
): Promise<{ error: string | null }> => {
    const { error } = await postJson('/admin/users/history/update', { kind: 'league', groupId, userId, seasonNumber, ...fields });
    return { error };
};

export const adminUpdateTournamentHistory = async (
    id: string, fields: AdminTournamentHistoryEditable
): Promise<{ error: string | null }> => {
    const { error } = await postJson('/admin/users/history/update', { kind: 'tournament', id, ...fields });
    return { error };
};

export const adminDeleteLeagueHistory = async (
    groupId: string, userId: string, seasonNumber: number
): Promise<{ error: string | null }> => {
    const { error } = await postJson('/admin/users/history/delete', { kind: 'league', groupId, userId, seasonNumber });
    return { error };
};

export const adminDeleteTournamentHistory = async (id: string): Promise<{ error: string | null }> => {
    const { error } = await postJson('/admin/users/history/delete', { kind: 'tournament', id });
    return { error };
};

export const adminResetUserHistory = async (userId: string): Promise<{ error: string | null }> => {
    const { error } = await postJson('/admin/users/history/reset', { userId });
    return { error };
};
