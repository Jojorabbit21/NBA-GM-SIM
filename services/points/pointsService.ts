/**
 * pointsService — 포인트(재화) 조회·구매 클라이언트. 계획: docs/plan/points-system-plan.md
 *
 * 읽기는 RLS 로 본인 행만 보이는 테이블 SELECT, 쓰기는 RPC 단일 경로(purchase_item)다.
 * 포인트 지급(grant_points)은 서버 전용이라 클라이언트 함수가 없다.
 * DDL·RPC 전문: migrations/add_points_infra.sql
 */
import { supabase } from '../supabaseClient';
import { actionFailure } from '../notifications/actionErrorCatalog';
import type { LedgerRow, PurchaseResult, ShopItemRow, UserItemRow, WalletRow } from '../../types/points';

export const LEDGER_PAGE_SIZE = 50;

/** 원장 source → 표시 문구. 모르는 값은 그대로 노출하지 않고 '기타'. */
export const POINT_SOURCE_LABEL: Record<string, string> = {
    season_daily:     '경기 정산',
    season_milestone: '시즌 마일스톤',
    achievement:      '도전 과제',
    admin:            '운영 지급',
    purchase:         '구매',
    refund:           '환불',
};
export const pointSourceLabel = (source: string) => POINT_SOURCE_LABEL[source] ?? '기타';

/** 재화 단위 표기 — 이름은 BP (2026-11-08 확정) */
export const POINTS_UNIT = 'BP';
export const formatPoints = (n: number) => `${n.toLocaleString('ko-KR')} ${POINTS_UNIT}`;

/** 포인트 아이콘(금화+농구공 솔기, 3D 음영 SVG). 14px 이상에서 사용 — 2026-11-08 */
export const POINTS_ICON_URL = '/images/points-coin.svg';

/** 지갑이 아직 없는 유저(한 번도 지급받지 않음)는 0 으로 본다. */
export async function fetchWallet(userId: string): Promise<WalletRow> {
    const { data, error } = await supabase
        .from('user_wallets')
        .select('user_id, balance, lifetime_earned, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
    if (error) throw error;
    return (data as WalletRow | null) ?? { user_id: userId, balance: 0, lifetime_earned: 0, updated_at: '' };
}

/** 최신순. beforeId 를 주면 그 id 보다 오래된 행부터(페이지네이션). */
export async function fetchLedger(userId: string, beforeId?: number, limit = LEDGER_PAGE_SIZE): Promise<LedgerRow[]> {
    let q = supabase
        .from('point_ledger')
        .select('id, user_id, delta, balance_after, source, ref_type, ref_id, meta, created_at')
        .eq('user_id', userId)
        .order('id', { ascending: false })
        .limit(limit);
    if (beforeId != null) q = q.lt('id', beforeId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as LedgerRow[];
}

export async function fetchShopItems(): Promise<ShopItemRow[]> {
    const { data, error } = await supabase
        .from('shop_items')
        .select('id, item_type, name, price, rarity, stackable, data, is_active, sort')
        .eq('is_active', true)
        .order('sort', { ascending: true })
        .order('id', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ShopItemRow[];
}

export async function fetchOwnedItems(userId: string): Promise<UserItemRow[]> {
    const { data, error } = await supabase
        .from('user_items')
        .select('user_id, item_id, quantity, source, acquired_at')
        .eq('user_id', userId);
    if (error) throw error;
    return (data ?? []) as UserItemRow[];
}

/** 서버 예외 메시지(= 코드) → 사용자 문구. */
function purchaseErrorMessage(error: { message?: string }): string {
    const msg = error.message ?? '';
    if (msg.includes('insufficient_points')) return '포인트가 부족합니다.';
    if (msg.includes('already_owned'))       return '이미 보유한 아이템입니다.';
    if (msg.includes('item_not_found'))      return '판매하지 않는 아이템입니다.';
    return actionFailure(error, '구매');
}

export async function purchaseItem(
    userId: string,
    itemId: string,
): Promise<{ data: PurchaseResult | null; error: string | null }> {
    const { data, error } = await supabase.rpc('purchase_item', { p_user_id: userId, p_item_id: itemId });
    if (error) return { data: null, error: purchaseErrorMessage(error) };
    return { data: data as PurchaseResult, error: null };
}
