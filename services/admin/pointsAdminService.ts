/**
 * /admin 사용자 관리의 포인트 운영 — 유저별·전체 지급/회수, 지갑·원장 조회.
 * RPC(admin_grant_points / admin_grant_points_all)가 DB 안에서 is_global_admin() 을 확인하고,
 * user_wallets / point_ledger 는 전역 어드민에게 SELECT RLS 가 열려 있어 Fly 서버를 거치지 않는다.
 * DDL: migrations/add_points_infra.sql, migrations/add_points_admin_ops.sql
 */
import { supabase } from '../supabaseClient';
import { actionFailure } from '../notifications/actionErrorCatalog';
import type { LedgerRow, WalletRow } from '../../types/points';

export interface AdminGrantResult { granted: boolean; balance: number; }
export interface AdminGrantAllResult { batch_id: string; granted: number; skipped: number; total_delta: number; }

function grantErrorMessage(error: { message?: string }, what: string): string {
    const msg = error.message ?? '';
    if (msg.includes('insufficient_points')) return '잔액보다 많이 회수할 수 없습니다.';
    if (msg.includes('note_required'))       return '메모를 입력하세요.';
    if (msg.includes('invalid_amount'))      return '금액은 0이 아니어야 합니다.';
    return actionFailure(error, what);
}

/** amount 양수 = 지급, 음수 = 회수. 회수가 잔액을 넘으면 오류(자동 조정 없음). */
export const adminGrantPoints = async (
    userId: string, amount: number, note: string,
): Promise<{ data: AdminGrantResult | null; error: string | null }> => {
    const { data, error } = await supabase.rpc('admin_grant_points', { p_user_id: userId, p_amount: amount, p_note: note });
    if (error) return { data: null, error: grantErrorMessage(error, amount > 0 ? '지급' : '회수') };
    return { data: data as AdminGrantResult, error: null };
};

/** 전원 대상. 회수는 각자 잔액까지만 차감하고 잔액 0 은 건너뛴다(skipped). */
export const adminGrantPointsAll = async (
    amount: number, note: string,
): Promise<{ data: AdminGrantAllResult | null; error: string | null }> => {
    const { data, error } = await supabase.rpc('admin_grant_points_all', { p_amount: amount, p_note: note });
    if (error) return { data: null, error: grantErrorMessage(error, amount > 0 ? '전체 지급' : '전체 회수') };
    return { data: data as AdminGrantAllResult, error: null };
};

/** 전 유저 지갑(목록 "포인트" 열). 지갑 행이 없는 유저는 맵에 없음 → 0 으로 표시. */
export const adminFetchAllWallets = async (): Promise<Record<string, WalletRow>> => {
    const { data, error } = await supabase.from('user_wallets').select('user_id, balance, lifetime_earned, updated_at');
    if (error) throw error;
    const map: Record<string, WalletRow> = {};
    for (const row of (data ?? []) as WalletRow[]) map[row.user_id] = row;
    return map;
};

export const adminFetchWallet = async (userId: string): Promise<WalletRow> => {
    const { data, error } = await supabase
        .from('user_wallets').select('user_id, balance, lifetime_earned, updated_at').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return (data as WalletRow | null) ?? { user_id: userId, balance: 0, lifetime_earned: 0, updated_at: '' };
};

export const adminFetchLedger = async (userId: string, limit = 100): Promise<LedgerRow[]> => {
    const { data, error } = await supabase
        .from('point_ledger')
        .select('id, user_id, delta, balance_after, source, ref_type, ref_id, meta, created_at')
        .eq('user_id', userId)
        .order('id', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return (data ?? []) as LedgerRow[];
};
