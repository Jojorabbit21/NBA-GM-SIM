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
