import React, { useId } from 'react';

// 홈·프로필·상점 화면 전용 아이콘 (2026-11-18 홈 리디자인). 사용자 지시로 Lucide 를 쓰지 않고 직접 그린다.
// 양식은 인게임 내비 아이콘(components/nav/navIcons)과 같은 2톤 채움(#62748E / #CAD5E2).

/** 뒤로 가기 화살표 — 제목 글자와 같은 굵기로 나란히 놓는다 */
export const BackChevron: React.FC<{ size?: number }> = ({ size = 18 }) => (
    <svg width={size * 11 / 18} height={size} viewBox="0 0 11 18" aria-hidden="true">
        <path d="M9 2 2.5 9 9 16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" />
    </svg>
);

/** 상점 — 농구공이 담긴 카트. 솔기 선은 공 모양으로 잘라내 밖으로 나가지 않는다 */
export const ShopCartIcon: React.FC<{ size?: number }> = ({ size = 24 }) => {
    const clipId = `shop-ball-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
            <defs><clipPath id={clipId}><circle cx="13.6" cy="7" r="4.9" /></clipPath></defs>
            <circle cx="13.6" cy="7" r="4.9" fill="#E8853A" />
            <g clipPath={`url(#${clipId})`} fill="none" stroke="#7A3E12" strokeWidth="0.8">
                <path d="M13.6 1v12" />
                <path d="M7.6 7h12" />
                <path d="M9.4 1.4c2.3 3 2.3 8.2 0 11.2" />
                <path d="M17.8 1.4c-2.3 3-2.3 8.2 0 11.2" />
            </g>
            <path d="M1.8 3.4h2.3c.5 0 .9.3 1 .8L6.3 9.6" fill="none" stroke="#62748E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5.4 9h16.2a.8.8 0 0 1 .8 1l-1.7 6.6a1.4 1.4 0 0 1-1.4 1.1H8.5a1.4 1.4 0 0 1-1.4-1.1L5 9.5a.4.4 0 0 1 .4-.5Z" fill="#CAD5E2" />
            <circle cx="9.6" cy="20.6" r="1.7" fill="#62748E" />
            <circle cx="17.6" cy="20.6" r="1.7" fill="#62748E" />
        </svg>
    );
};

/** 닫기 X */
export const CloseX: React.FC<{ size?: number }> = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
        <path d="M3 3l12 12M15 3L3 15" fill="none" stroke="#CAD5E2" strokeWidth="2.4" strokeLinecap="square" />
    </svg>
);

/** 이름 변경 — 연필 */
export const PencilIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
        <path d="M1 13l.8-3.6L9.6 1.6a1.4 1.4 0 0 1 2 0l.8.8a1.4 1.4 0 0 1 0 2L4.6 12.2Z" fill="#CAD5E2" />
        <path d="M8.6 2.6l2.8 2.8" stroke="#62748E" strokeWidth="1.4" />
    </svg>
);

/** 페인트 상품 — 롤러. 스펀지 위쪽에 그 색 페인트가 묻어 흘러내린다(color = 상품 data.color) */
export const PaintRollerIcon: React.FC<{ color: string; size?: number }> = ({ color, size = 24 }) => {
    const clipId = `roller-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    return (
        <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
            <defs><clipPath id={clipId}><rect x="14" y="20" width="74" height="42" rx="9" /></clipPath></defs>
            <g transform="rotate(20 60 64)">
                {/* 손잡이 · 철심 */}
                <path d="M88 41h17v37H60v12" fill="none" stroke="#CAD5E2" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="50.5" y="86" width="19" height="33" rx="7" fill="#62748E" />
                <rect x="50.5" y="86" width="19" height="8" rx="4" fill="#7C8CA3" />
                {/* 스펀지 */}
                <rect x="14" y="20" width="74" height="42" rx="9" fill="#AEB7C4" />
                <g clipPath={`url(#${clipId})`}>
                    <path d="M10 14h82v24c-1 9-10 9-11 0-1-6-8-6-9 0-1 16-12 16-13 2-1-7-9-7-10 0-1 11-11 11-12 0-1-6-8-6-9 0-1 12-11 12-12 0-1-5-5-6-6-2Z" fill={color} />
                    <path d="M14 26h74" stroke="#fff" strokeOpacity="0.28" strokeWidth="4" strokeLinecap="round" />
                    <rect x="14" y="54" width="74" height="8" fill="#000" fillOpacity="0.12" />
                </g>
                <ellipse cx="88" cy="41" rx="6" ry="21" fill="#8792A3" />
                <circle cx="88" cy="41" r="3.2" fill="#3F4A5C" />
            </g>
        </svg>
    );
};

/** 저장 — 체크 */
export const CheckIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true">
        <path d="M2 7.4l3.4 3.4L12 3.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />
    </svg>
);

/** 보조 버튼 — 평소엔 짙은 슬레이트, 올리면 주 동작 색(인디고). 홈·상점·프로필의 목록 동작에 공용 */
export const HOVER_ACCENT_BTN = 'bg-slate-800 border border-slate-700 text-slate-200 hover:bg-indigo-600 hover:border-indigo-600 hover:text-white active:bg-indigo-600 active:border-indigo-600 active:text-white transition-colors';
