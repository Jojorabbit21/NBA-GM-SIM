/**
 * JWT 검증 — Supabase auth.getUser() 사용.
 *
 * 로컬 jose 검증(HS256)은 프로젝트가 RS256을 사용하는 경우 실패.
 * auth.getUser()는 알고리즘에 무관하게 확실히 동작.
 * 단점: 네트워크 왕복 1회 (~100ms). start-draft/WS auth는 빈도가 낮으므로 허용.
 */
import { supabase } from './supabaseAdmin';

/**
 * Supabase access token을 검증하고 userId(sub)를 반환.
 * 실패 시 null 반환 (throw 안 함).
 */
export async function verifyToken(token: string): Promise<string | null> {
    if (!token) return null;
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user?.id) {
            console.warn('[auth] getUser failed:', error?.message);
            return null;
        }
        return user.id;
    } catch (e) {
        console.warn('[auth] verifyToken error:', (e as Error).message);
        return null;
    }
}

/**
 * 전역 어드민 여부 — profiles.is_admin 단일 출처(DB의 is_global_admin()과 동일 판별
 * 기준, migrations/dynamic_global_admin_refactor.sql) 조회. 예전엔 하드코딩된
 * UUID(d2f6a469-...)를 각 파일마다 비교했는데, 이 함수 하나로 대체 — 이후 어드민을
 * 동적으로 추가/해제(profiles.is_admin 갱신)해도 서버 코드는 손댈 필요 없음.
 * 이 서버는 service_role 클라이언트를 쓰므로 RLS와 무관하게 직접 조회한다.
 */
export async function isGlobalAdmin(userId: string | null | undefined): Promise<boolean> {
    if (!userId) return false;
    const { data, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', userId)
        .maybeSingle();
    if (error || !data) return false;
    return data.is_admin === true;
}
