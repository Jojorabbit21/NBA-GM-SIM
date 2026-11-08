/**
 * 포인트(재화) 클라이언트 타입 — 서버 미러: server/src/shared/points/types.ts
 * Rarity·PointSource 를 바꾸면 양쪽 모두 수정. DDL: migrations/add_points_infra.sql
 */

export type Rarity = 'common' | 'rare' | 'unique' | 'epic';

export type PointSource =
    | 'season_daily'
    | 'season_milestone'
    | 'achievement'
    | 'admin'
    | 'purchase'
    | 'refund';

export interface WalletRow {
    user_id: string;
    balance: number;
    lifetime_earned: number;
    updated_at: string;
}

export interface LedgerRow {
    id: number;
    user_id: string;
    delta: number;
    balance_after: number;
    source: PointSource | string;
    ref_type: string | null;
    ref_id: string | null;
    meta: Record<string, unknown>;
    created_at: string;
}

export interface ShopItemRow {
    id: string;
    item_type: string;
    name: string;
    price: number;
    rarity: Rarity;
    stackable: boolean;
    data: Record<string, unknown>;
    is_active: boolean;
    sort: number;
}

export interface UserItemRow {
    user_id: string;
    item_id: string;
    quantity: number;
    source: string;
    acquired_at: string;
}

export interface PurchaseResult {
    item_id: string;
    balance: number;
}
