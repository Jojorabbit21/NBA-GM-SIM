/**
 * points.ts — 포인트 지급·차감의 서버 측 단일 진입점.
 * DB RPC grant_points 는 service_role 만 실행할 수 있어서 반드시 이 파일을 통해 부른다.
 * 계획: docs/plan/points-system-plan.md, DDL: migrations/add_points_infra.sql
 *
 * granted=false 는 "이미 반영된 키"라는 뜻(오류 아님) — 재시도·중복 실행에 안전하다.
 * 잔액 부족 등 실패는 { ok:false, error } 로 돌려주며 예외를 던지지 않는다(호출부가 시뮬 흐름을 끊지 않도록).
 */
import { supabase } from './supabaseAdmin.ts';
import type { GrantPointsParams, GrantPointsResult } from './shared/points/types.ts';

export async function grantPoints(p: GrantPointsParams): Promise<GrantPointsResult> {
    const { data, error } = await supabase.rpc('grant_points', {
        p_user_id:         p.userId,
        p_amount:          p.amount,
        p_source:          p.source,
        p_idempotency_key: p.idempotencyKey,
        p_ref_type:        p.refType ?? null,
        p_ref_id:          p.refId ?? null,
        p_meta:            p.meta ?? {},
    });
    if (error) {
        console.error(`[points] grant failed key=${p.idempotencyKey}: ${error.message}`);
        return { ok: false, error: error.message };
    }
    const r = data as { granted: boolean; balance: number; ledger_id?: number };
    return { ok: true, granted: r.granted, balance: r.balance, ledgerId: r.ledger_id };
}
