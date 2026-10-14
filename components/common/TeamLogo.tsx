
import React from 'react';
import { getTeamLogoUrl, TEAM_LOGO_FALLBACK_URL } from '../../utils/constants';

export type TeamLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'custom';

interface TeamLogoProps {
    teamId: string;
    teamName?: string;
    size?: TeamLogoSize;
    className?: string;
    faded?: boolean;
    /** drop-shadow 적용 여부(기본 true). 표 안의 작은 로고처럼 그림자가 거슬리는 곳은 false. */
    shadow?: boolean;
    style?: React.CSSProperties;
    draggable?: boolean;
}

export const TEAM_LOGO_SIZE_CLASS: Record<TeamLogoSize, string> = {
    xs: "w-4 h-4",
    sm: "w-6 h-6",
    md: "w-8 h-8",
    lg: "w-12 h-12",
    xl: "w-16 h-16",
    '2xl': "w-24 h-24",
    '3xl': "w-32 h-32",
    'custom': "", // No default size, controlled by className
};

/**
 * 팀 로고 이미지 — public/logos/teams/ 단일 소스. [2026-10-12] 예전의 "신규 세트 → 구버전 세트 →
 * placehold.co" 3단 폴백 체인(18개 파일에 복붙돼 있던 것)을 전부 이 컴포넌트로 흡수했다.
 * 로드 실패 시 폴백은 리그 로고(TEAM_LOGO_FALLBACK_URL) 한 번뿐이고, 폴백마저 실패해도
 * 다시 시도하지 않는다(data-fallback 가드).
 */
export const TeamLogo: React.FC<TeamLogoProps> = ({
    teamId,
    teamName = '',
    size = 'md',
    className = '',
    faded = false,
    shadow = true,
    style,
    draggable,
}) => {
    const logoUrl = getTeamLogoUrl(teamId);

    return (
        <img
            src={logoUrl}
            alt={teamName}
            className={[TEAM_LOGO_SIZE_CLASS[size], 'object-contain transition-all', shadow && 'drop-shadow-md', faded && 'opacity-50 grayscale', className].filter(Boolean).join(' ')}
            style={style}
            draggable={draggable}
            onError={(e) => {
                const img = e.currentTarget;
                if (img.dataset.fallback === 'done') return;
                img.dataset.fallback = 'done';
                img.src = TEAM_LOGO_FALLBACK_URL;
            }}
        />
    );
};
