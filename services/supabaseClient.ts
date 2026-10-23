
import { createClient, navigatorLock } from '@supabase/supabase-js';
import type { LockFunc } from '@supabase/supabase-js';

// 1. 환경 변수 로드 (Vite/CRA 호환성을 위해 process.env와 import.meta.env 모두 체크)
// 주의: 번들러가 빌드 타임에 문자열을 치환할 수 있도록 'process.env.변수명'을 직접 사용해야 합니다.
const envUrl = process.env.REACT_APP_SUPABASE_URL || (import.meta as any).env?.REACT_APP_SUPABASE_URL;
const envKey = process.env.REACT_APP_SUPABASE_ANON_KEY || (import.meta as any).env?.REACT_APP_SUPABASE_ANON_KEY;

// 2. 유효성 검사 및 디버깅
// URL은 https://로 시작해야 하고, Key는 일정 길이 이상이어야 정상으로 간주
const isUrlValid = envUrl && envUrl.startsWith('http');
const isKeyValid = envKey && envKey.length > 20;

export const isSupabaseConfigured = !!(isUrlValid && isKeyValid);

if (!isSupabaseConfigured) {
    console.error('🚨 [Supabase Error] 환경 변수가 올바르게 로드되지 않았습니다.');
    console.log('Current URL Status:', isUrlValid ? 'OK' : 'Missing/Invalid', envUrl);
    console.log('Current Key Status:', isKeyValid ? 'OK' : 'Missing/Invalid');
    console.warn('💡 Tip: .env 파일을 수정했다면 반드시 개발 서버를 재시작(npm start)해야 적용됩니다.');
} else {
    // console.log('✅ Supabase Client Initialized'); // 로그 노이즈 감소를 위해 주석 처리
}

// 3. 클라이언트 생성 및 상수 Export
// 환경 변수가 없을 경우 앱이 멈추는 것을 방지하기 위해 더미 값을 넣지만, 실제 네트워크 요청은 실패하게 됩니다.
export const supabaseUrl = isUrlValid ? envUrl! : 'https://placeholder.supabase.co';
export const supabaseKey = isKeyValid ? envKey! : 'placeholder-key';

// [2026-10-23] Mobile browsers freeze background tabs while supabase-js holds the cross-tab auth lock
// (token refresh / visibility recovery). On resume every request waited 10s on that stuck lock and then
// failed ("Acquiring an exclusive Navigator LockManager lock ... timed out"), so pages showed
// "league not found". Try the normal navigator lock first; only when a blocking acquire times out,
// run without the lock. Immediate-try calls (acquireTimeout === 0, the auto-refresh tick) keep failing
// fast as before so a second refresh never runs alongside one already in progress.
const navigatorLockWithFallback: LockFunc = async (name, acquireTimeout, fn) => {
    if (!globalThis.navigator?.locks) return fn();
    // navigatorLock maps any AbortError to a timeout error, including one thrown from inside fn —
    // only fall back when fn never started, otherwise fn would run twice.
    let started = false;
    try {
        return await navigatorLock(name, acquireTimeout, () => { started = true; return fn(); });
    } catch (e: any) {
        if (e?.isAcquireTimeout && acquireTimeout !== 0 && !started) {
            console.warn(`[supabase auth] lock "${name}" not acquired in ${acquireTimeout}ms, proceeding without it`);
            return fn();
        }
        throw e;
    }
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        lock: navigatorLockWithFallback,
    },
    global: {
        headers: {
            'apikey': supabaseKey
        }
    }
});
