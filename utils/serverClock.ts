
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
 * 라이브 경기 화면(MultiGamePbpView.tsx)처럼 초 단위 갱신이 실제로 보여야 하는 곳에서만
 * 쓸 것 — "경기 공개 10분 딜레이" 판정처럼 초 단위 정밀도가 필요 없는 계산에 이 훅을
 * 그대로 쓰면 그 계산을 매초 다시 돌리게 돼 낭비가 크다. 그런 경우엔 아래
 * useServerClockBucket()을 대신 쓸 것.
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

/**
 * [2026-09-07] 홈 화면 위젯들(HomeStandingsSection 등)이 "경기 공개 10분 딜레이"/"오늘 날짜"
 * 판정에만 쓰는데도 useServerClock()을 그대로 써서, 그 판정에 의존하는 useMemo(팀 전적/
 * 리더보드 정렬 등, 시즌 전체 스케줄 순회)가 실제로 매초 다시 계산되고 있었다(React
 * DevTools로 실측 확인). 이 값들은 초 단위 정밀도가 전혀 필요 없어서 — 내부적으로는
 * 여전히 1초마다 체크하지만, bucketMs(기본 15초, MultiHeader.tsx의 dateBucket과 동일
 * 값) 경계를 넘을 때만 실제로 setState를 호출한다. React는 setState에 동일한 값이
 * 들어오면 리렌더 자체를 건너뛰므로, 이 훅을 쓰는 컴포넌트는 매초가 아니라 bucketMs마다만
 * 리렌더된다 — 라이브 갱신이 실제로 필요한 화면은 계속 useServerClock()을 써야 함.
 */
export function useServerClockBucket(bucketMs: number = 15000): number {
    const snapToBucket = (t: number) => Math.floor(t / bucketMs) * bucketMs;
    const [snapped, setSnapped] = useState(() => snapToBucket(getServerNow()));

    useEffect(() => {
        let cancelled = false;
        syncServerClock().then(() => {
            if (!cancelled) setSnapped(snapToBucket(getServerNow()));
        });
        const id = setInterval(() => {
            setSnapped(prev => {
                const next = snapToBucket(getServerNow());
                return next === prev ? prev : next;
            });
        }, 1000);
        return () => { cancelled = true; clearInterval(id); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bucketMs]);

    return snapped;
}
