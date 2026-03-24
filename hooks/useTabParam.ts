import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * URL query param으로 탭 상태를 동기화하는 훅.
 * 기본 탭은 URL에서 파라미터를 제거해 깔끔하게 유지.
 * replace: true — 탭 전환이 브라우저 히스토리를 쌓지 않음.
 *
 * @example
 * const [activeTab, setTab] = useTabParam<MyTab>('roster');
 * // /roster        → activeTab = 'roster'
 * // /roster?tab=stats → activeTab = 'stats'
 */
export function useTabParam<T extends string>(defaultTab: T, key = 'tab') {
    const [searchParams, setSearchParams] = useSearchParams();
    const raw = searchParams.get(key);
    const activeTab: T = (raw as T) ?? defaultTab;

    const setTab = useCallback(
        (tab: T) => {
            setSearchParams(
                prev => {
                    const next = new URLSearchParams(prev);
                    if (tab === defaultTab) {
                        next.delete(key);
                    } else {
                        next.set(key, tab);
                    }
                    return next;
                },
                { replace: true },
            );
        },
        [defaultTab, key, setSearchParams],
    );

    return [activeTab, setTab] as const;
}
