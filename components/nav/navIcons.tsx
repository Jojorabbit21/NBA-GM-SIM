// navIcons.tsx — 사이드바·모바일 탭 바·태블릿 레일이 공유하는 내비 아이콘. [2026-10-27 모바일 셸]
// MultiSidebar.tsx에 있던 NavIcon/RosterIcon을 그대로 옮겼다(동작 변화 없음). public/images/sidenav/{name}.svg ↔
// {name}-selected.svg 쌍을 상태에 따라 스왑하고, 로스터(저지)는 선택 상태에서만 팀 테마 컬러를 입힌다.
import React from 'react';

export type SidenavIconName =
    | 'home' | 'news' | 'pool' | 'team' | 'tactics' | 'playoffs' | 'allstar' | 'standings' | 'race'
    | 'leaderboard' | 'schedule' | 'transactions' | 'free-agents' | 'compare';

export const NavIcon: React.FC<{ name: SidenavIconName; active: boolean; size?: number }> = ({ name, active, size = 28 }) => (
    <img
        src={`/images/sidenav/${name}${active ? '-selected' : ''}.svg`}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        draggable={false}
    />
);

// 로스터(저지) 아이콘 — team-selected.svg 원본 path 그대로, 선택 상태에서만
// 팀 테마 컬러를 입힌다: 유니폼 넓은 면(body)=primary, 칼라 테두리(collar)=secondary, 넘버(number)=text
// text를 넘버에 쓰면 secondary===primary인 팀(예: 세컨더리가 프라이머리와 동일한 배색)도
// 넘버가 묻히지 않는다 — 아티팩트로 30팀 전수 검증 후 반영.
const JERSEY_PATHS = {
    body: 'M4 10V20H20V10C18.3431 10 17 8.65685 17 7V4H14C14 5.10457 13.1046 6 12 6C10.8954 6 10 5.10457 10 4H7V7C7 8.65685 5.65685 10 4 10Z',
    collar: 'M10.5 4C10.5 4.82843 11.1716 5.5 12 5.5C12.8284 5.5 13.5 4.82843 13.5 4H17V6.87012C17.0003 8.52675 18.3433 9.87012 20 9.87012V10.8701C17.791 10.8701 16.0003 9.07903 16 6.87012V5H14.29C13.9041 5.88257 13.0249 6.5 12 6.5C10.9751 6.5 10.0959 5.88257 9.70996 5H8V6.87012C7.99974 9.07903 6.20898 10.8701 4 10.8701V9.87012C5.65669 9.87012 6.99974 8.52675 7 6.87012V4H10.5Z',
    number: 'M13 18H11.1548V11.7931H9V10.589C9.56872 10.5641 9.96682 10.5269 10.1943 10.4772C10.5566 10.3986 10.8515 10.2414 11.079 10.0055C11.2349 9.84414 11.3528 9.62897 11.4329 9.36C11.4792 9.19862 11.5024 9.07862 11.5024 9H13V18Z',
};
const JERSEY_DEFAULT_PRIMARY = '#62748E';
const JERSEY_DEFAULT_SECONDARY = '#CAD5E2';

export const RosterIcon: React.FC<{ active: boolean; primary?: string | null; secondary?: string | null; text?: string | null; size?: number }> = ({ active, primary, secondary, text, size = 28 }) => {
    if (!active) {
        return <img src="/images/sidenav/team.svg" alt="" width={size} height={size} style={{ width: size, height: size }} draggable={false} />;
    }
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="24" height="24" fill="#0F172A" />
            <path d={JERSEY_PATHS.body} fill={primary || JERSEY_DEFAULT_PRIMARY} />
            <path d={JERSEY_PATHS.collar} fill={secondary || JERSEY_DEFAULT_SECONDARY} />
            <path d={JERSEY_PATHS.number} fill={text || JERSEY_DEFAULT_SECONDARY} />
        </svg>
    );
};

// "더보기" — sidenav에 없어 같은 양식(2톤 채움, 24 캔버스 위 3줄)으로 신규. 비활성 #62748E/#CAD5E2, 활성 #009966/#00D492
// (sidenav 선택 아이콘의 두 색과 동일 — docs/ui/mobile-design-system.md §8-2).
export const MoreIcon: React.FC<{ active: boolean; size?: number }> = ({ active, size = 28 }) => {
    const a = active ? '#00D492' : '#CAD5E2';
    const b = active ? '#009966' : '#62748E';
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="4" y="5" width="16" height="3" rx="0.5" fill={b} />
            <rect x="4" y="10.5" width="16" height="3" rx="0.5" fill={a} />
            <rect x="4" y="16" width="11" height="3" rx="0.5" fill={a} />
        </svg>
    );
};
