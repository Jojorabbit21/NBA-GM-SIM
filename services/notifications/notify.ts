// notify.ts — 알림 발행 도우미. 호출부는 `notify.error('문구')` 한 줄이면 된다.
// [2026-10-02] docs/plan/toast-notification-center-plan.md 1단계.
//   - error: persistent 기본, 링크를 안 주면 현재 주소를 자동 기록(나중에 다른 화면에서 봐도 돌아올 수 있게)
//   - warning/info/success: transient(8초) 기본
//   - league: transient 기본, 호출부가 roomId/leagueEvent/dedupeKey를 넘긴다
// 서버 응답 오류를 한국어로 바꾸는 기존 함수(mapTradeOfferError 등)는 그대로 두고, 그 결과를 여기로 넘기면 된다.

import { pushNotification, type AppNotification, type NotificationInput, type NotificationKind } from './notificationStore';

type Options = Omit<NotificationInput, 'kind' | 'message'>;

function currentLocationLink(): NotificationInput['link'] | undefined {
    try {
        if (typeof window === 'undefined') return undefined;
        return { to: window.location.pathname + window.location.search };
    } catch {
        return undefined;
    }
}

function make(kind: NotificationKind, message: unknown, opts: Options = {}): AppNotification | null {
    const link = opts.link ?? (kind === 'error' ? currentLocationLink() : undefined);
    return pushNotification({ ...opts, kind, message, link });
}

export const notify = {
    error:   (message: unknown, opts?: Options) => make('error', message, opts),
    warning: (message: unknown, opts?: Options) => make('warning', message, opts),
    info:    (message: unknown, opts?: Options) => make('info', message, opts),
    success: (message: unknown, opts?: Options) => make('success', message, opts),
    league:  (message: unknown, opts?: Options) => make('league', message, opts),
};

// 개발 빌드 전용 디버그 손잡이 — 콘솔에서 `__notify.error('테스트')`로 토스트를 띄워볼 수 있다.
// 지난번처럼 임시 트리거 코드를 넣었다 빼는 일을 없애기 위한 것. 프로덕션 번들에는 들어가지 않는다.
const IS_DEV: boolean = (() => { try { return Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV); } catch { return false; } })();
if (IS_DEV && typeof window !== 'undefined') {
    (window as unknown as { __notify?: typeof notify }).__notify = notify;
}
