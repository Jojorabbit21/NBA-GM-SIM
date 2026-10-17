// useNotificationList.ts — 전역 알림 저장소(notificationStore)의 history를 "알림 목록"으로 읽는 훅.
// [2026-10-17] 리그 채팅 위젯의 알림 탭이 쓴다. 토스트 팝업 대신 이 목록이 알림을 보여준다.
// unread = history 중 createdAt > readUpTo(알림 탭을 마지막으로 본 시각, 메모리 전용).

import { useMemo, useSyncExternalStore } from 'react';
import {
    clearNotifications, getSnapshot, markAllRead, removeFromHistory, subscribe,
    type AppNotification,
} from '../services/notifications/notificationStore';

export interface NotificationListState {
    /** 새것 → 오래된 것 순(최대 MAX_HISTORY건) */
    items: AppNotification[];
    readUpTo: number;
    unread: number;
    markAllRead: () => void;
    remove: (id: string) => void;
    clear: () => void;
}

export function useNotificationList(): NotificationListState {
    const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const unread = useMemo(
        () => snap.history.reduce((n, h) => (h.createdAt > snap.readUpTo ? n + 1 : n), 0),
        [snap.history, snap.readUpTo],
    );
    return { items: snap.history, readUpTo: snap.readUpTo, unread, markAllRead, remove: removeFromHistory, clear: clearNotifications };
}
