import { useEffect, useCallback } from 'react';
import { setUpdateAvailable } from '../services/notifications/updateNoticeStore';

// [2026-10-29] 5분 → 30분, 백그라운드 탭은 건너뜀, 탭 복귀 체크는 직전 체크 후 5분 이상일 때만 —
// /version.json 요청이 전부 Vercel Edge Request로 집계돼 Hobby 한도(월 1M) 초과 원인 중 하나였다.
const CHECK_INTERVAL = 30 * 60 * 1000; // 30분
const MIN_GAP = 5 * 60 * 1000;          // 탭 복귀 시 최소 간격
let lastCheckedAt = 0;

declare const __BUILD_VERSION__: string;

// 새 버전이 감지되면 updateNoticeStore에 기록한다. 표시는 UpdateToast(단독)·LeagueChatDock(리그 안)이 store를 구독해 결정.
export function useUpdateChecker(): void {
    const checkForUpdate = useCallback(async () => {
        if (import.meta.env.DEV) return;
        if (document.visibilityState !== 'visible') return;
        lastCheckedAt = Date.now();

        try {
            const res = await fetch('/version.json', {
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache' },
            });
            if (!res.ok) return;
            const data = await res.json();
            if (data.v && data.v !== __BUILD_VERSION__) {
                setUpdateAvailable(true);
            }
        } catch {
            // 네트워크 오류 무시
        }
    }, []);

    useEffect(() => {
        // 첫 체크는 30초 후 (페이지 로드 직후 부담 방지)
        const initialTimeout = setTimeout(checkForUpdate, 30_000);
        const interval = setInterval(checkForUpdate, CHECK_INTERVAL);

        // 탭 복귀 시에도 체크
        const handleVisibility = () => {
            if (document.visibilityState === 'visible' && Date.now() - lastCheckedAt >= MIN_GAP) {
                checkForUpdate();
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            clearTimeout(initialTimeout);
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [checkForUpdate]);

}
