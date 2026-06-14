
/**
 * serverClock — 클라이언트 로컬 시계와 서버 시계의 오차를 보정.
 *
 * 멀티플레이어 경기 표시 상태(scheduled/live/final)는 `scheduledAt` + 현재 시각으로
 * 클라이언트가 결정론적으로 계산한다. 로컬 시계가 서버와 어긋나 있으면 같은 시점에
 * 다른 유저가 다른 화면을 보게 되므로, 앱 진입 시 1회 서버 시각을 조회해
 * `offset = serverNow - localNow`를 구해두고 이후 `Date.now() + offset`으로 보정한다.
 *
 * RPC 호출/응답에 걸리는 왕복 시간(RTT)을 절반으로 나눠 보정 시점을 추정한다
 * (NTP 방식의 단순화 버전). RPC가 실패하면 offset=0 (로컬 시계 폴백) 유지.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

let clockOffsetMs = 0;
let syncPromise: Promise<void> | null = null;

async function syncServerClock(): Promise<void> {
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
        try {
            const t0 = Date.now();
            const { data, error } = await supabase.rpc('server_now');
            const t1 = Date.now();
            if (!error && data) {
                const serverMs      = new Date(data as string).getTime();
                const localMidpoint = t0 + (t1 - t0) / 2;
                clockOffsetMs = serverMs - localMidpoint;
            }
        } catch {
            // 네트워크 오류 등: offset=0 유지 (로컬 시계 폴백)
        }
    })();
    return syncPromise;
}

/** 서버 보정이 적용된 현재 시각(ms). 보정 전에는 로컬 시계와 동일(offset=0). */
export function getServerNow(): number {
    return Date.now() + clockOffsetMs;
}

/**
 * 1초 간격으로 갱신되는 서버 보정 시각(ms) 훅.
 * 마운트 시 1회 서버 시각을 동기화한 뒤 즉시 반영한다.
 */
export function useServerClock(): number {
    const [serverNow, setServerNow] = useState(() => getServerNow());

    useEffect(() => {
        let cancelled = false;
        syncServerClock().then(() => {
            if (!cancelled) setServerNow(getServerNow());
        });
        const id = setInterval(() => setServerNow(getServerNow()), 1000);
        return () => { cancelled = true; clearInterval(id); };
    }, []);

    return serverNow;
}
