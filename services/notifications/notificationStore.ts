// notificationStore.ts — 전역 알림(토스트) 저장소. React/라우터 비의존 순수 모듈.
// [2026-10-02] docs/plan/toast-notification-center-plan.md 1단계. ZenGM(src/ui/util/notify.ts +
// Notifications.tsx)의 규칙을 그대로 옮기되 상태를 컴포넌트가 아니라 모듈 저장소에 둔다 —
// 그래야 React Query 전역 실패 훅, window 전역 예외, Supabase Realtime 콜백처럼 React 바깥에서
// 발행해도 되고, 표시 컴포넌트가 마운트되기 전 알림도 큐잉 없이 자연히 보관된다.
//
// 표시 규칙(ZenGM 동일):
//   - 화면에는 최대 MAX_VISIBLE(5)개. 넘치면 persistent는 보존하고 transient 중 오래된 것부터 제거.
//     persistent만 MAX_VISIBLE-1을 넘으면 가장 오래된 persistent도 밀어내 새 알림 자리 1칸을 항상 확보.
//   - 같은 dedupeKey가 다시 오면 기존 것을 새것으로 교체(트레이드 제안 배지 훅이 사이드바·헤더에서
//     동시 마운트돼 채널이 2개 열리는 중복 발행을 여기서 흡수 — 훅을 어디서 몇 번 쓰든 안전).
//   - transient는 document.hidden이면 표시하지 않음(탭을 다시 열었을 때 수십 개가 쏟아지지 않게).
//   - [계획 §5-3] 라이브 중계 화면(/season/game/)을 보는 중엔 kind 'league'의 transient를 폐기(스포일러).
// 표시 상한과 별개로 최근 MAX_HISTORY(50)건을 history에 보관(추후 "전체 보기" 확장용).
// 영속화(5단계): kind 'error'이고 persistent인 알림만 localStorage(STORAGE_KEY)에 미러. 최근 MAX_PERSISTED건·7일.
// 리그 알림은 원본이 DB(뉴스피드/메시지함)라 저장하지 않는다. 다른 탭과 동기화하지 않는다(마지막에 쓴 탭이 이김).
// 모든 읽기/쓰기는 try/catch(사생활 모드·용량 초과·차단) — 실패하면 메모리 전용으로 동작한다.
// React Query 캐시 키(nba-gm-sim-query-cache)와 분리된 키라 용량 초과 사고가 서로 번지지 않는다.

export type NotificationKind = 'error' | 'warning' | 'info' | 'success' | 'league';

export interface NotificationLink {
    /** react-router 경로(절대 경로, 쿼리 포함 가능). */
    to: string;
    label?: string;
}

export interface AppNotification {
    id: string;
    kind: NotificationKind;
    title?: string;
    /** 순수 텍스트. HTML은 절대 렌더하지 않는다(서버 문자열 불신). */
    message: string;
    /** 발생 화면으로 이동. 현재 경로와 같으면 표시 컴포넌트가 버튼을 숨긴다. */
    link?: NotificationLink;
    /** 발생 지점 태그('trade.respond', 'query:multiSearchPool' 등) — 디버깅/필터용. */
    source?: string;
    /** true면 수동 닫기만, false면 TRANSIENT_TIMEOUT_MS 후 자동 소멸. */
    persistent: boolean;
    createdAt: number;
    /** 같은 키의 알림이 다시 오면 기존 것을 교체. */
    dedupeKey?: string;
    /** 리그 알림이면 어느 룸의 어떤 이벤트인지 — 룸 전환 시 정리(clearByRoom)와 링크 분기용. */
    roomId?: string;
    leagueEvent?: { eventId: number | string; type: string };
}

export type NotificationInput = Omit<AppNotification, 'id' | 'createdAt' | 'persistent' | 'message'> & {
    /** 문자열이 아니어도 됨(Error, Supabase 오류 객체 등) — normalizeMessage()가 정규화. */
    message: unknown;
    persistent?: boolean;
    createdAt?: number;
};

export const MAX_VISIBLE = 5;
export const MAX_HISTORY = 50;
export const TRANSIENT_TIMEOUT_MS = 8_000;
export const MESSAGE_MAX_CHARS = 300;
/** 라이브 중계 화면 판정 — 전역 플래그 대신 라우트 경로(계획 §5-3). */
const LIVE_GAME_PATH_FRAGMENT = '/season/game/';

interface StoreState {
    visible: AppNotification[];   // 오래된 것 → 새것 순(아래에서 위로 쌓이는 표시와 일치)
    history: AppNotification[];   // 새것 → 오래된 것 순
}

// vite/client 타입 선언이 tsconfig에 없어 import.meta.env를 직접 참조하면 tsc가 실패한다 — 안전 접근.
const IS_DEV: boolean = (() => { try { return Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV); } catch { return false; } })();

export const STORAGE_KEY = 'nba-gm-sim-notifications';
const STORAGE_VERSION = 1;
const MAX_PERSISTED = 50;
const PERSIST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let state: StoreState = { visible: [], history: [] };
const listeners = new Set<() => void>();
let seq = 0;

function isPersistable(n: AppNotification): boolean {
    return n.kind === 'error' && n.persistent;
}

function saveMirror(): void {
    try {
        if (typeof window === 'undefined') return;
        const items = state.history.filter(isPersistable).slice(0, MAX_PERSISTED)
            .map(n => ({ id: n.id, kind: n.kind, title: n.title, message: n.message, link: n.link, source: n.source,
                         persistent: n.persistent, createdAt: n.createdAt, dedupeKey: n.dedupeKey,
                         // 화면에 아직 떠 있는지 — 복원 시 닫은 것은 다시 띄우지 않기 위해
                         visible: state.visible.some(v => v.id === n.id) }));
        if (items.length === 0) { window.localStorage.removeItem(STORAGE_KEY); return; }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: STORAGE_VERSION, items }));
    } catch (e) {
        // QuotaExceeded 등 — 가장 오래된 절반을 버리고 1회 재시도, 그래도 실패하면 미러 포기
        try {
            const items = state.history.filter(isPersistable).slice(0, Math.floor(MAX_PERSISTED / 2));
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: STORAGE_VERSION, items: items.map(n => ({ ...n, leagueEvent: undefined, visible: state.visible.some(v => v.id === n.id) })) }));
        } catch { /* 메모리 전용으로 계속 */ }
    }
}

/** 앱 시작 시 1회 — 저장된 에러 알림을 복원(닫지 않았던 것만 visible로). 깨진 데이터·구버전은 통째로 폐기. */
function loadMirror(): void {
    try {
        if (typeof window === 'undefined') return;
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as { v?: number; items?: Array<AppNotification & { visible?: boolean }> };
        if (!parsed || parsed.v !== STORAGE_VERSION || !Array.isArray(parsed.items)) { window.localStorage.removeItem(STORAGE_KEY); return; }
        const now = Date.now();
        const items = parsed.items
            .filter(n => n && typeof n.message === 'string' && n.message && typeof n.createdAt === 'number' && now - n.createdAt < PERSIST_TTL_MS)
            .map(n => ({ ...n, kind: 'error' as const, persistent: true, message: String(n.message), link: n.link && n.link.to ? n.link : undefined }));
        const history = items.map(({ visible: _v, ...n }) => n as AppNotification).slice(0, MAX_HISTORY);
        const visible = applyVisibleLimit(items.filter(n => n.visible).map(({ visible: _v, ...n }) => n as AppNotification).reverse());
        state = { visible, history };
    } catch {
        try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
}

function emit() {
    saveMirror();
    for (const l of listeners) {
        try { l(); } catch (e) { console.error('[notifications] listener error', e); }
    }
}

export function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

/** useSyncExternalStore용 — 참조가 바뀔 때만 리렌더되도록 state 객체 자체를 돌려준다. */
export function getSnapshot(): StoreState {
    return state;
}

function makeId(): string {
    seq += 1;
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch { /* 일부 비보안 컨텍스트에서 randomUUID 미지원 */ }
    return `n-${Date.now()}-${seq}`;
}

/**
 * 어떤 값이 와도 문자열로. 빈 결과면 ''(호출부는 그 경우 발행을 건너뜀).
 * 순서: 문자열 → Error.message → {message}/{error}/{details} 꼴 객체(Supabase PostgrestError 등) → 숫자/불리언 →
 * 그 외는 JSON 시도. 어떤 분기에서도 예외를 던지지 않는다.
 */
export function normalizeMessage(input: unknown): string {
    try {
        if (input == null) return '';
        if (typeof input === 'string') return input.trim();
        if (input instanceof Error) return (input.message || input.name || '').trim();
        if (typeof input === 'number' || typeof input === 'boolean') return String(input);
        if (typeof input === 'object') {
            const o = input as Record<string, unknown>;
            for (const k of ['message', 'error', 'details', 'hint', 'error_description']) {
                const v = o[k];
                if (typeof v === 'string' && v.trim()) return v.trim();
                if (v instanceof Error && v.message) return v.message.trim();
            }
            const json = JSON.stringify(input);
            return json && json !== '{}' ? json : '';
        }
        return String(input).trim();
    } catch {
        return '';
    }
}

function truncate(s: string): string {
    return s.length > MESSAGE_MAX_CHARS ? s.slice(0, MESSAGE_MAX_CHARS - 1) + '…' : s;
}

function isLiveGameRoute(): boolean {
    try { return typeof window !== 'undefined' && window.location.pathname.includes(LIVE_GAME_PATH_FRAGMENT); }
    catch { return false; }
}

/** ZenGM Notifications.tsx의 표시 상한 규칙. */
function applyVisibleLimit(list: AppNotification[]): AppNotification[] {
    let out = list;
    let numToDelete = out.length - MAX_VISIBLE;
    let numPersistentKept = 0;
    if (numToDelete > -1) {
        out = out.filter(n => {
            if (n.persistent) { numPersistentKept += 1; return true; }
            if (numToDelete > 0) { numToDelete -= 1; return false; }
            return true;
        });
    }
    if (numPersistentKept > MAX_VISIBLE - 1) {
        out = out.slice(numPersistentKept - (MAX_VISIBLE - 1));
    }
    return out;
}

/**
 * 알림 발행. 발행이 성립하면 AppNotification, 건너뛰면 null. 절대 throw하지 않는다(전역 예외 수집기가
 * 이 모듈의 예외를 다시 알림으로 올리는 루프 방지 — 내부 오류는 console에만).
 */
export function pushNotification(input: NotificationInput): AppNotification | null {
    try {
        const message = truncate(normalizeMessage(input.message));
        if (!message) {
            if (IS_DEV) console.warn('[notifications] 빈 메시지 발행 무시', input);
            return null;
        }
        const n: AppNotification = {
            id: makeId(),
            kind: input.kind,
            title: input.title,
            message,
            link: input.link && input.link.to ? input.link : undefined,
            source: input.source,
            persistent: input.persistent ?? (input.kind === 'error'),
            createdAt: input.createdAt ?? Date.now(),
            dedupeKey: input.dedupeKey,
            roomId: input.roomId,
            leagueEvent: input.leagueEvent,
        };

        // history는 표시 여부와 무관하게 항상 기록(요약/전체 보기용)
        const history = [n, ...state.history.filter(h => !n.dedupeKey || h.dedupeKey !== n.dedupeKey)].slice(0, MAX_HISTORY);

        let visible = state.visible;
        const hiddenTab = typeof document !== 'undefined' && document.hidden;
        const suppressed =
            (!n.persistent && hiddenTab) ||
            (!n.persistent && n.kind === 'league' && isLiveGameRoute());
        if (!suppressed) {
            if (n.dedupeKey) visible = visible.filter(v => v.dedupeKey !== n.dedupeKey);
            visible = applyVisibleLimit([...visible, n]);
        }
        state = { visible, history };
        emit();
        return n;
    } catch (e) {
        console.error('[notifications] pushNotification 실패', e);
        return null;
    }
}

export function removeNotification(id: string): void {
    if (!state.visible.some(n => n.id === id)) return;
    state = { ...state, visible: state.visible.filter(n => n.id !== id) };
    emit();
}

export function clearNotifications(): void {
    if (state.visible.length === 0 && state.history.length === 0) return;
    state = { visible: [], history: [] };
    emit();
}

/** [계획 §5-4] 룸 전환 시 이전 룸의 리그 알림만 제거(에러 등은 유지). roomId 생략 시 모든 리그 알림 제거. */
export function clearLeagueNotifications(roomId?: string): void {
    const keep = (n: AppNotification) => n.kind !== 'league' || (roomId != null && n.roomId !== roomId);
    const visible = state.visible.filter(keep);
    const history = state.history.filter(keep);
    if (visible.length === state.visible.length && history.length === state.history.length) return;
    state = { visible, history };
    emit();
}

/** 테스트/디버그용 — 저장소를 초기 상태로. */
export function __resetNotificationStore(): void {
    state = { visible: [], history: [] };
    emit();
}

// 모듈 로드 시 1회 복원 — 모든 함수 선언 뒤(호이스팅되지만 상수 초기화 순서 때문에 끝에 둔다).
loadMirror();
