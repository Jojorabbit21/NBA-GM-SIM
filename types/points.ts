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

/** 코트 바닥 질감(상점 court_texture 상품 data.texture) — 렌더링은 components/multi/CourtPreview.tsx */
export type CourtTexture = 'plank' | 'herringbone' | 'parquet' | 'gloss';

/** [2026-11-18] 인벤토리 장착 칸 = shop_items.item_type. DDL: migrations/add_court_loadout.sql */
export type CourtSlot = 'court_floor' | 'court_palette' | 'court_texture' | 'court_rim';

export interface CourtLoadoutRow {
    user_id: string;
    slot: CourtSlot;
    item_id: string;
    updated_at: string;
}

/** 장착 결과로 정해진 코트 모습 — CourtPreview 에 그대로 넘긴다. 계산은 services/points/courtLoadout.ts */
export interface CourtStyle {
    background: string;
    /** 바닥 이미지(코트 전체 940×500 에 깔림). 없으면 background 단색 */
    floorImage?: string | null;
    three?: string;
    /** 없으면 페인트존을 칠하지 않는다(바닥이 그대로 보임) */
    paint?: string;
    line: string;
    rim?: string;
    backboard?: string;
    texture?: CourtTexture | null;
    /** 낡은 바닥 자국 겹(투명 이미지, 940×500 전체). 라인 위·림 아래 */
    wearImage?: string | null;
}

/** [2026-11-18] 플로어 재질 — 상점 플로어 카테고리의 하위 분류 */
export type FloorMaterial = 'wood' | 'urethane' | 'concrete';

export interface PurchaseResult {
    item_id: string;
    balance: number;
}
