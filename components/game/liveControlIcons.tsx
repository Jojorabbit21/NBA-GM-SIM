import React from 'react';

// [2026-11-23] 라이브 경기 컨트롤(속도 셀렉터) 아이콘 — 채움(fill) 모양, currentColor라 셀렉터의 활성/비활성 글자색을 그대로 따른다.
// 새 UI는 Lucide를 쓰지 않는 규칙에 따라 직접 그린 SVG(16 캔버스).

/** 일시정지 — 굵은 두 막대 */
export const PauseFillIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <rect x="3" y="2.5" width="3.6" height="11" rx="1" />
        <rect x="9.4" y="2.5" width="3.6" height="11" rx="1" />
    </svg>
);

/** 경기 종료까지 — 삼각형 둘 + 끝 막대(빨리감기 후 끝으로) */
export const SkipToEndFillIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M1.5 3.2a.9.9 0 0 1 1.4-.75L8.2 6.3a.9.9 0 0 1 0 1.4L2.9 11.55A.9.9 0 0 1 1.5 10.8z" transform="translate(0 .6)" />
        <path d="M7 3.2a.9.9 0 0 1 1.4-.75l5.3 3.85a.9.9 0 0 1 0 1.4L8.4 11.55A.9.9 0 0 1 7 10.8z" transform="translate(0 .6)" />
        <rect x="13.2" y="3" width="2" height="10" rx=".8" />
    </svg>
);

/** 재생 — 채운 오른쪽 삼각형 */
export const PlayFillIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M4.2 2.9a1 1 0 0 1 1.5-.86l7.1 4.6a1 1 0 0 1 0 1.68l-7.1 4.6a1 1 0 0 1-1.5-.86z" />
    </svg>
);
