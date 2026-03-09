import { useState, useEffect, useCallback } from 'react';

const CHECK_INTERVAL = 5 * 60 * 1000; // 5분

declare const __BUILD_VERSION__: string;

export function useUpdateChecker() {
    const [updateAvailable, setUpdateAvailable] = useState(false);

    const checkForUpdate = useCallback(async () => {
        if (import.meta.env.DEV) return;

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
            if (document.visibilityState === 'visible') {
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

    return updateAvailable;
}
