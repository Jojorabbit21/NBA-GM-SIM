// updateNoticeStore.ts — "새 버전이 있습니다" 알림 상태 저장소. React/라우터 비의존 순수 모듈.
//
// 업데이트 알림은 이벤트가 아니라 상태다: 새 버전이 감지되면 새로고침할 때까지 available이 유지되고,
// 표시 위치만 상황에 따라 바뀐다.
//   - 리그 채팅 위젯(LeagueChatDock)이 마운트됨(dockMounted): 위젯이 닫혀 있으면 FAB 위 토스트,
//     열려 있으면 위젯 탭 아래 배너. "나중에"는 토스트만 숨기고(toastDismissed) 배너는 새로고침 전까지 남는다.
//   - 위젯이 없는 화면(로비·싱글플레이 등): App이 단독 토스트(UpdateToast)를 오른쪽 아래에 띄운다.
// 새로고침하면 페이지가 다시 로드되어 이 모듈 상태도 초기화된다(영속화하지 않음).

import { useSyncExternalStore } from 'react';

export interface UpdateNoticeState {
    available: boolean;
    toastDismissed: boolean;
    dockMounted: boolean;
}

let state: UpdateNoticeState = { available: false, toastDismissed: false, dockMounted: false };
const listeners = new Set<() => void>();

function set(patch: Partial<UpdateNoticeState>): void {
    const next = { ...state, ...patch };
    if (next.available === state.available && next.toastDismissed === state.toastDismissed && next.dockMounted === state.dockMounted) return;
    state = next;
    listeners.forEach(l => l());
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

function getSnapshot(): UpdateNoticeState {
    return state;
}

export function setUpdateAvailable(available: boolean): void {
    set({ available });
}

export function dismissUpdateToast(): void {
    set({ toastDismissed: true });
}

export function setUpdateDockMounted(dockMounted: boolean): void {
    set({ dockMounted });
}

export function useUpdateNotice(): UpdateNoticeState {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
