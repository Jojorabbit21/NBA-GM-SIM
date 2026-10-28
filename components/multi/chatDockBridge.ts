// chatDockBridge.ts — 리그 채팅 독(LeagueChatDock)과 모바일 상단 바 수신함 버튼 사이의 작은 다리. [2026-10-27 모바일 셸]
// 독은 LeagueLayout에 한 번만 마운트되고 안 읽은 수(채팅+DM+알림)를 자기 훅으로 센다. 폰 상단 바는 그 수를 배지로
// 보여주고 탭하면 독을 열어야 하는데, 같은 구독 훅을 두 번 마운트하면 채널이 중복되므로 모듈 전역 스토어로 넘긴다.
// (docs/ui/mobile-design-system.md §9-8: 채팅 진입 = 상단 바 수신함 아이콘 하나, 하단 탭에 넣지 않음)
import { useEffect, useState } from 'react';

type Listener = () => void;

let unread = 0;
const unreadListeners = new Set<Listener>();
const openListeners = new Set<Listener>();

/** 독이 자기 안 읽은 합계를 올려 둔다(독만 호출). */
export function publishChatDockUnread(n: number): void {
    if (n === unread) return;
    unread = n;
    unreadListeners.forEach(l => l());
}

/** 상단 바 등 바깥에서 독 열기를 요청한다. 독이 마운트돼 있지 않으면 아무 일도 없다. */
export function requestOpenChatDock(): void {
    openListeners.forEach(l => l());
}

/** 독이 열기 요청을 구독한다(독만 호출). 해제 함수를 돌려준다. */
export function subscribeChatDockOpen(listener: Listener): () => void {
    openListeners.add(listener);
    return () => { openListeners.delete(listener); };
}

/** 안 읽은 합계를 읽는 훅 — 독이 없으면 0. */
export function useChatDockUnread(): number {
    const [n, setN] = useState(unread);
    useEffect(() => {
        const l = () => setN(unread);
        unreadListeners.add(l);
        l();
        return () => { unreadListeners.delete(l); };
    }, []);
    return n;
}
