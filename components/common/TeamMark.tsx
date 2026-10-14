
import React from 'react';
import { TeamLogo, type TeamLogoSize } from './TeamLogo';
import { getReadableTextColor } from '../../utils/colorContrast';

export type TeamMarkVariant = 'logo' | 'badge';

/** variant="badge"일 때 필요한 색상/약어. colorPrimary가 없으면 배지를 그릴 수 없어 로고로 대체한다. */
export interface TeamBadgeStyle {
    abbr?: string | null;
    colorPrimary?: string | null;
    colorText?: string | null;
}

interface TeamMarkProps {
    teamId: string;
    teamName?: string;
    /** 'logo'(기본) = public/logos/teams/ 로고 이미지, 'badge' = 팀 컬러 사각 배지(약어 텍스트) */
    variant?: TeamMarkVariant;
    size?: TeamLogoSize;
    className?: string;
    badge?: TeamBadgeStyle;
    /** 로고일 때 drop-shadow 여부(기본 false — 표/목록용). TeamLogo 기본값과 다름에 주의. */
    shadow?: boolean;
}

// 배지 크기 — TeamLogoSize와 같은 키를 쓰되 배지는 가로로 긴 직사각형.
const BADGE_SIZE_CLASS: Record<TeamLogoSize, string> = {
    xs: 'w-7 h-5 text-[9px]',
    sm: 'w-9 h-6 text-[10px]',
    md: 'w-11 h-7 text-xs',
    lg: 'w-14 h-9 text-sm',
    xl: 'w-9 h-9 text-sm',       // 홈 경기 카드 — 옆의 text-3xl 약어와 높이를 맞춘 정사각형
    '2xl': 'w-14 h-14 text-base',
    '3xl': 'w-20 h-20 text-lg',
    custom: '',
};

/**
 * 팀 표시 공용 컴포넌트 — 로고 이미지와 팀 컬러 배지 중 하나를 **명시적으로** 고른다.
 * [2026-10-12] 예전엔 `badge` prop의 유무로 "실제 로고 켜기"를 뜻하는 등 의미가 뒤집혀 있었고,
 * TeamBadge는 colorPrimary 유무로 암묵적으로 분기했다. 이제 variant 하나로 결정한다.
 *
 *   <TeamMark teamId="atl" />                                  → 로고
 *   <TeamMark teamId="atl" variant="badge" badge={{ abbr, colorPrimary }} /> → 색 배지
 */
export const TeamMark: React.FC<TeamMarkProps> = ({
    teamId, teamName, variant = 'logo', size = 'md', className = '', badge, shadow = false,
}) => {
    if (variant === 'badge' && badge?.colorPrimary) {
        return (
            <div
                className={`shrink-0 rounded flex items-center justify-center font-black ${BADGE_SIZE_CLASS[size]} ${className}`}
                style={{ backgroundColor: badge.colorPrimary, color: badge.colorText ?? getReadableTextColor(badge.colorPrimary) }}
                title={teamName}
            >
                {(badge.abbr ?? teamId).slice(0, 3).toUpperCase()}
            </div>
        );
    }
    return <TeamLogo teamId={teamId} teamName={teamName} size={size} className={`shrink-0 ${className}`} shadow={shadow} />;
};
