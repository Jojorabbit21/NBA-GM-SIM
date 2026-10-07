// errorCollector.ts — 전역 오류 수집기. 데이터 조회 실패(React Query), 브라우저 전역 예외/거부된 Promise,
// 오프라인 전환을 한 곳에서 받아 notify.error/warning으로 올린다.
// [2026-10-02] docs/plan/toast-notification-center-plan.md 4단계(§2-2, §5-1, §5-2, 예외 그룹 1·2).
//
// 규칙:
//   - 같은 메시지는 DEDUPE_WINDOW_MS(30초) 안에서 한 번만 발행(폴링 실패·렌더 루프 폭주 방지).
//   - 알림 시스템 자신(services/notifications/*)에서 난 예외는 다시 알림으로 올리지 않는다(루프 방지) — console만.
//   - 앱 번들 밖(확장 프로그램 chrome-extension:// 등)에서 난 window error는 무시.
//   - 오프라인(§5-1): offline 이벤트에 "연결이 끊겼습니다" persistent 1개(dedupeKey 'offline'), 오프라인 동안의
//     조회 실패는 전부 억제, online 복귀 시 그 알림을 닫고 "연결이 복구됐습니다" transient로 교체.
//   - 401/JWT 만료(§5-2): 즉시 알리지 않고 AUTH_HOLD_MS(20초) 보류. 보류 중 같은 쿼리(queryHash)가 성공하면 취소
//     (토큰 자동 갱신 틈으로 판단). 20초 안에 성공이 없으면 그때 1회 알림 — 세션 사망이면 기존 리다이렉트
//     (liveGameService.handlePossibleDeadSession)가 먼저 처리하므로 실제로는 거의 올라오지 않는다.
//   - React Query의 재시도(retry 1)가 끝난 최종 실패만 onError로 오므로 중간 실패는 애초에 안 들어온다.
//   - [2026-10-06] 리그 부트스트랩 게이트 대상 쿼리(bootstrapQueryKeys.ts)는 토스트 제외 — 게이트가 직접 처리.

import { notify } from './notify';
import { normalizeMessage, removeNotification, pushNotification, getSnapshot } from './notificationStore';
import { formatQueryErrorMessage } from './queryErrorCatalog';
import { isBootstrapQueryKey } from './bootstrapQueryKeys';

const DEDUPE_WINDOW_MS = 30_000;
const AUTH_HOLD_MS = 20_000;

const recentByMessage = new Map<string, number>();
function isDuplicate(message: string, now = Date.now()): boolean {
    const last = recentByMessage.get(message);
    if (last != null && now - last < DEDUPE_WINDOW_MS) return true;
    recentByMessage.set(message, now);
    if (recentByMessage.size > 200) {   // 무한 증가 방지
        for (const [k, t] of recentByMessage) if (now - t > DEDUPE_WINDOW_MS) recentByMessage.delete(k);
    }
    return false;
}

/** 같은 문구의 window 오류는 복원된 과거 토스트까지 포함해 하나로 — 메시지 해시를 dedupeKey로. */
function messageKey(prefix: string, message: string): string {
    let h = 0;
    for (let i = 0; i < message.length; i++) h = (h * 31 + message.charCodeAt(i)) | 0;
    return `${prefix}:${h}`;
}

function isFromNotificationModule(err: unknown): boolean {
    const stack = (err as { stack?: unknown })?.stack;
    return typeof stack === 'string' && stack.includes('/services/notifications/');
}

/** Supabase/PostgREST/Auth의 401·JWT 만료 계열 판정. */
export function isAuthExpiryError(err: unknown): boolean {
    const o = (err ?? {}) as { status?: unknown; code?: unknown; message?: unknown };
    if (o.status === 401) return true;
    if (o.code === 'PGRST301') return true;
    const msg = normalizeMessage(err).toLowerCase();
    return /jwt|unauthorized|401|token.*(expired|invalid)/.test(msg);
}

// ── 오프라인 ──────────────────────────────────────────────────────────────
let offline = false;
let offlineNotificationId: string | null = null;

function goOffline() {
    if (offline) return;
    offline = true;
    const n = pushNotification({
        kind: 'warning', title: '연결 끊김', message: '네트워크 연결이 끊겼습니다. 복구되면 자동으로 알려드립니다.',
        persistent: true, dedupeKey: 'offline', source: 'network',
    });
    offlineNotificationId = n?.id ?? null;
}
function goOnline() {
    if (!offline) return;
    offline = false;
    if (offlineNotificationId) removeNotification(offlineNotificationId);
    else for (const v of getSnapshot().visible) if (v.dedupeKey === 'offline') removeNotification(v.id);
    offlineNotificationId = null;
    notify.success('네트워크 연결이 복구됐습니다.', { source: 'network', dedupeKey: 'online', persistent: false });
}
export function isOffline(): boolean { return offline; }

// ── 401 보류 ──────────────────────────────────────────────────────────────
const heldAuth = new Map<string, ReturnType<typeof setTimeout>>();   // queryHash → timer

/** React Query 성공 콜백에서 호출 — 같은 쿼리가 성공하면 보류 중인 401 알림을 취소. */
export function resolveHeldQueryError(queryHash: string): void {
    const t = heldAuth.get(queryHash);
    if (t) { clearTimeout(t); heldAuth.delete(queryHash); }
}

// ── 공개 API ──────────────────────────────────────────────────────────────
/** React Query `QueryCache.onError`에서 호출. */
export function reportQueryError(error: unknown, queryKey: readonly unknown[], queryHash: string): void {
    try {
        console.error('[QueryCache] Query failed:', queryKey, error);
        if (offline) return;
        if (isFromNotificationModule(error)) return;
        // [2026-10-06] 리그 부트스트랩 게이트가 받는 공통 쿼리는 게이트가 직접 처리(조용한 재시도 → 확정 실패 화면).
        // 진입 뒤의 백그라운드 재조회 실패는 화면이 이전 데이터를 그대로 쓰므로 토스트 없음.
        if (isBootstrapQueryKey(queryKey)) return;
        const source = `query:${String(queryKey[0] ?? '?')}`;
        // [2026-10-02] 사용자 지정 문구 — "{무엇}을 불러오지 못했습니다. {원인}". 영문 원문은 위 console.error에만.
        const { message } = formatQueryErrorMessage(queryKey, error);

        if (isAuthExpiryError(error)) {
            if (heldAuth.has(queryHash)) return;
            heldAuth.set(queryHash, setTimeout(() => {
                heldAuth.delete(queryHash);
                if (offline || isDuplicate(message)) return;
                notify.error('로그인 세션이 갱신되지 않아 데이터를 불러오지 못했습니다. 새로고침하거나 다시 로그인해 주세요.',
                    { source, dedupeKey: 'auth-expired', title: '세션 오류' });
            }, AUTH_HOLD_MS));
            return;
        }
        if (isDuplicate(message)) return;
        notify.error(message, { source, title: '데이터 조회 실패' });
    } catch (e) {
        console.error('[errorCollector] reportQueryError 실패', e);
    }
}

function isAppBundleSource(filename: unknown): boolean {
    if (typeof filename !== 'string' || !filename) return true;   // 출처 없음(인라인 등) → 앱으로 간주
    try { return filename.startsWith(window.location.origin) || filename.startsWith('/'); }
    catch { return true; }
}

let installed = false;
/** window error / unhandledrejection / online·offline 리스너 설치. 여러 번 불러도 한 번만 설치. */
export function installGlobalErrorHandlers(): void {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    window.addEventListener('error', (ev: ErrorEvent) => {
        try {
            if (!isAppBundleSource(ev.filename)) return;
            const err = ev.error ?? ev.message;
            if (isFromNotificationModule(err)) return;
            const raw = normalizeMessage(err);
            if (!raw || /ResizeObserver loop/i.test(raw)) return;   // 브라우저가 내는 무해한 경고
            // 스택은 토스트에 못 싣는다 — 어느 컴포넌트/파일에서 났는지는 콘솔에서 보도록 항상 남긴다.
            console.error('[window.error]', err, (err as { stack?: string })?.stack ?? `${ev.filename}:${ev.lineno}:${ev.colno}`);
            if (offline || isDuplicate(raw)) return;
            notify.error(raw, { source: 'window.error', title: '예기치 않은 오류', dedupeKey: messageKey('winerr', raw) });
        } catch (e) { console.error('[errorCollector] error 핸들러 실패', e); }
    });

    window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
        try {
            const reason = ev.reason;
            if (isFromNotificationModule(reason)) return;
            // React Query 취소(CancelledError)와 AbortError는 정상 흐름
            const name = (reason as { name?: unknown })?.name;
            if (name === 'CancelledError' || name === 'AbortError') return;
            const raw = normalizeMessage(reason);
            if (!raw) return;
            if (isAuthExpiryError(reason)) return;   // 조회 경로는 reportQueryError가, 세션 사망은 기존 리다이렉트가 담당
            console.error('[unhandledrejection]', reason, (reason as { stack?: string })?.stack);
            if (offline || isDuplicate(raw)) return;
            notify.error(raw, { source: 'unhandledrejection', title: '처리되지 않은 오류', dedupeKey: messageKey('rej', raw) });
        } catch (e) { console.error('[errorCollector] rejection 핸들러 실패', e); }
    });

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    try { if (navigator.onLine === false) goOffline(); } catch { /* ignore */ }
}
