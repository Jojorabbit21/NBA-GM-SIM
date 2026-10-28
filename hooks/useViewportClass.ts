// useViewportClass.ts — 셸 분기용 뷰포트 등급. [2026-10-27 모바일 셸]
// docs/ui/mobile-design-system.md §2·§8: phone(<768, Tailwind md 미만) = 상단 바 + 하단 탭 바,
// tablet(768~1023) = 상단 바 + 좌측 레일 72, desktop(≥1024, lg) = 현행 사이드바 40 + 헤더 + 스트립 75.
// Tailwind 기본 브레이크포인트를 그대로 쓴다(커스텀 추가 금지 — 반응형 접두사 209곳이 기본값 기준).
import { useEffect, useState } from 'react';

export type ViewportClass = 'phone' | 'tablet' | 'desktop';

const PHONE_MAX = '(max-width: 767px)';
const TABLET_MAX = '(max-width: 1023px)';

function read(): ViewportClass {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'desktop';
    if (window.matchMedia(PHONE_MAX).matches) return 'phone';
    if (window.matchMedia(TABLET_MAX).matches) return 'tablet';
    return 'desktop';
}

export function useViewportClass(): ViewportClass {
    const [vc, setVc] = useState<ViewportClass>(read);
    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const a = window.matchMedia(PHONE_MAX);
        const b = window.matchMedia(TABLET_MAX);
        const on = () => setVc(read());
        on();
        a.addEventListener('change', on);
        b.addEventListener('change', on);
        return () => { a.removeEventListener('change', on); b.removeEventListener('change', on); };
    }, []);
    return vc;
}

export function useIsPhone(): boolean {
    return useViewportClass() === 'phone';
}
