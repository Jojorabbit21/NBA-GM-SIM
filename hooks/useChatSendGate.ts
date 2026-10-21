// useChatSendGate.ts — 채팅 전송 앞단의 도배 방지(쿨다운·도배 잠금·서버 거절 잠금). 계획: docs/plan/league-chat-plan.md
//
// [2026-10-21] DM 추가로 useLeagueChat에서 분리. 전체 채팅(useLeagueChat)과 DM(useLeagueDm)이 **같은 인스턴스**를 받는다 —
// 서버 한도(유저당 10초 10건)가 두 경로를 합산하므로 앞단 잠금도 하나로 공유해야 정상 클라이언트가 서버 한도에 닿지 않는다.
// 값은 chatService 상수(CHAT_COOLDOWN_MS / CHAT_FLOOD_*). 잠금은 메모리에만(새로고침하면 풀림 — 서버 한도가 최후 방어선).

import { useCallback, useEffect, useRef, useState } from 'react';
import { CHAT_COOLDOWN_MS, CHAT_FLOOD_LOCK_MS, shouldFloodLock } from '../services/multi/chatService';

export interface ChatSendGate {
    /** 쿨다운·잠금·도배 판정을 통과하면 전송 시각을 기록하고 true */
    admit: () => boolean;
    /** ms 동안 입력 잠금(서버 rate_limited 응답 시 남은 초만큼) */
    lockFor: (ms: number) => void;
    /** 전송 버튼 잠깐 비활성(0.5초 쿨다운) */
    cooling: boolean;
    /** 도배 잠금 남은 초(0이면 잠금 아님) */
    lockRemainingSec: number;
}

export function useChatSendGate(roomId: string | null | undefined): ChatSendGate {
    const [cooling, setCooling] = useState(false);
    const [lockUntil, setLockUntil] = useState(0);
    const [now, setNow] = useState(() => Date.now());
    const sentAtRef = useRef<number[]>([]);
    const cooldownUntilRef = useRef(0);
    const lockUntilRef = useRef(0);

    // 룸이 바뀌면 초기화
    useEffect(() => {
        setLockUntil(0);
        lockUntilRef.current = 0;
        cooldownUntilRef.current = 0;
        sentAtRef.current = [];
    }, [roomId]);

    const lockFor = useCallback((ms: number) => {
        const until = Date.now() + ms;
        if (until <= lockUntilRef.current) return;
        lockUntilRef.current = until;
        setLockUntil(until);
        setNow(Date.now());
    }, []);

    // 잠금 중에만 0.25초 간격으로 남은 초를 갱신
    useEffect(() => {
        if (lockUntil <= Date.now()) return;
        const id = window.setInterval(() => {
            const t = Date.now();
            setNow(t);
            if (t >= lockUntil) window.clearInterval(id);
        }, 250);
        return () => window.clearInterval(id);
    }, [lockUntil]);

    const admit = useCallback((): boolean => {
        const t = Date.now();
        if (t < lockUntilRef.current || t < cooldownUntilRef.current) return false;
        const next = [...sentAtRef.current.filter(s => t - s < 60_000), t];
        sentAtRef.current = next;
        cooldownUntilRef.current = t + CHAT_COOLDOWN_MS;
        setCooling(true);
        window.setTimeout(() => setCooling(false), CHAT_COOLDOWN_MS);
        if (shouldFloodLock(next, t)) {
            lockFor(CHAT_FLOOD_LOCK_MS);
            sentAtRef.current = [];
        }
        return true;
    }, [lockFor]);

    const lockRemainingSec = lockUntil > now ? Math.ceil((lockUntil - now) / 1000) : 0;

    return { admit, lockFor, cooling, lockRemainingSec };
}
