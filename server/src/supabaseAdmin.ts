/**
 * Supabase service_role 클라이언트 싱글톤.
 * RLS를 우회하는 관리 권한 클라이언트.
 * 값은 절대 로그 출력 금지.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = Bun.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = Bun.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('[supabaseAdmin] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
});
