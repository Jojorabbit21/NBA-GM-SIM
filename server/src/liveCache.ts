/**
 * liveCache.ts — /live-game, /live-games 읽기 전용 엔드포인트용 짧은 캐시.
 *
 * [2026-10-20] 배경: 클라이언트가 접속자 × 화면당 5초 간격으로 이 엔드포인트를 폴링하는데, 요청 하나가
 * (1) Supabase Auth getUser (2) room_members 조회 (3) game_pbp 큰 JSONB 조회 — 세 번의 외부 왕복을 매번 했다.
 * DB가 느려지면(2026-10-20 12:24~12:33, 13:08~13:13 KST) 이 요청들이 전부 쌓여 Bun 기본 idleTimeout(10초)에
 * 연결이 끊겼고, Fly 프록시가 502를 만들어 브라우저에는 CORS 에러로 보였다. 방 단위로 결과를 몇 초 공유하면
 * 접속자 수와 무관하게 DB 호출이 방당 초당 ~0.3회로 줄고, DB가 잠깐 멈춰도 직전 결과로 버틴다.
 *
 * 쓰기·어드민 엔드포인트는 이 캐시를 쓰지 않는다(토큰 폐기가 즉시 반영돼야 하므로 verifyToken 그대로 사용).
 */
import { verifyToken } from './auth';

const TOKEN_TTL_MS = 60_000;
const TOKEN_FAIL_TTL_MS = 5_000;
const ACCESS_TTL_MS = 60_000;
const ACCESS_DENY_TTL_MS = 10_000;
const MAX_ENTRIES = 500;

function prune<V>(map: Map<string, V>): void {
    if (map.size <= MAX_ENTRIES) return;
    // Map은 삽입 순서를 유지 — 가장 오래된 항목부터 절반을 버린다.
    let n = Math.floor(map.size / 2);
    for (const k of map.keys()) { if (n-- <= 0) break; map.delete(k); }
}

// ── 토큰 검증 캐시 (읽기 전용 엔드포인트 한정) ────────────────────────────────────

const tokenCache = new Map<string, { userId: string | null; expiresAt: number }>();

/** JWT payload의 exp(ms). 해석 실패 시 null. */
function jwtExpMs(token: string): number | null {
    try {
        const payload = token.split('.')[1];
        if (!payload) return null;
        const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
        return typeof json.exp === 'number' ? json.exp * 1000 : null;
    } catch { return null; }
}

/** verifyToken의 캐시판 — 성공은 min(60초, 토큰 만료까지), 실패는 5초만 기억한다. */
export async function verifyTokenCached(token: string): Promise<string | null> {
    if (!token) return null;
    const now = Date.now();
    const hit = tokenCache.get(token);
    if (hit && hit.expiresAt > now) return hit.userId;

    const userId = await verifyToken(token);
    if (userId) {
        const exp = jwtExpMs(token);
        const ttl = Math.min(TOKEN_TTL_MS, exp != null ? Math.max(0, exp - now) : TOKEN_TTL_MS);
        if (ttl > 0) tokenCache.set(token, { userId, expiresAt: now + ttl });
    } else {
        tokenCache.set(token, { userId: null, expiresAt: now + TOKEN_FAIL_TTL_MS });
    }
    prune(tokenCache);
    return userId;
}

// ── 방 읽기 권한 캐시 ────────────────────────────────────────────────────────────

const accessCache = new Map<string, { ok: boolean; expiresAt: number }>();

/**
 * check는 DB 오류 시 throw해야 한다(false로 삼키면 정상 유저가 403을 받는다). 허용은 60초, 거부는 10초 기억.
 */
export async function canReadRoomCached(userId: string, roomId: string, check: () => Promise<boolean>): Promise<boolean> {
    const key = `${userId}:${roomId}`;
    const now = Date.now();
    const hit = accessCache.get(key);
    if (hit && hit.expiresAt > now) return hit.ok;
    const ok = await check();
    accessCache.set(key, { ok, expiresAt: now + (ok ? ACCESS_TTL_MS : ACCESS_DENY_TTL_MS) });
    prune(accessCache);
    return ok;
}

// ── 단일 비행(single-flight) + stale-if-error 캐시 ───────────────────────────────

interface Entry<V> { value?: V; at: number; inflight?: Promise<V> }

/**
 * 같은 key의 동시 요청은 한 번의 load만 실행해 공유하고, 결과를 ttlMs 동안 재사용한다.
 * load가 실패하면 staleMs 이내의 직전 성공 값을 대신 돌려주고(없으면 throw) — DB가 잠깐 멈춰도 화면이 안 끊긴다.
 */
export function createSharedLoader<V>(ttlMs: number, staleMs: number) {
    const entries = new Map<string, Entry<V>>();
    return async (key: string, load: () => Promise<V>): Promise<V> => {
        const now = Date.now();
        let e = entries.get(key);
        if (e && e.value !== undefined && now - e.at < ttlMs) return e.value;
        if (e?.inflight) return e.inflight;

        if (!e) { e = { at: 0 }; entries.set(key, e); prune(entries); }
        const entry = e;
        entry.inflight = load()
            .then(v => { entry.value = v; entry.at = Date.now(); return v; })
            .catch(err => {
                if (entry.value !== undefined && Date.now() - entry.at < staleMs) return entry.value;
                throw err;
            })
            .finally(() => { entry.inflight = undefined; });
        return entry.inflight;
    };
}

/** DB 조회에 붙이는 상한 — 이보다 오래 걸리면 abort해서 Bun idleTimeout(10초)에 연결이 끊기기 전에 직접 실패 처리. */
export const LIVE_QUERY_TIMEOUT_MS = 7_000;
