/**
 * 포인트(재화) 공용 타입 — 계획: docs/plan/points-system-plan.md, DDL: migrations/add_points_infra.sql
 * 클라이언트 미러: types/points.ts (Rarity·PointSource를 바꾸면 둘 다 수정)
 */

/** 카드·상점 아이템·마일스톤이 공유하는 등급 어휘. DB shop_items.rarity CHECK 와 동일. */
export type Rarity = 'common' | 'rare' | 'unique' | 'epic';

/** point_ledger.source — DB 에는 CHECK 가 없으므로 새 출처는 여기에만 추가하면 된다. */
export type PointSource =
    | 'season_daily'
    | 'season_milestone'
    | 'achievement'
    | 'admin'
    | 'purchase'
    | 'refund';

export interface GrantPointsParams {
    userId: string;
    /** 양수 = 지급, 음수 = 차감 */
    amount: number;
    source: PointSource;
    /** 같은 키는 한 번만 반영된다. 유저·시즌·항목이 키에 모두 들어가야 한다. 예: `milestone:{league}:{season}:{user}:{id}` */
    idempotencyKey: string;
    refType?: string;
    refId?: string;
    meta?: Record<string, unknown>;
}

export type GrantPointsResult =
    | { ok: true; granted: boolean; balance: number; ledgerId?: number }
    | { ok: false; error: string };
