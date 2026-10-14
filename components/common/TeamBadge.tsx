
import React from 'react';
import { TeamMark } from './TeamMark';

interface TeamBadgeProps {
    teamId: string;
    teamName?: string;
    abbr?: string | null;
    colorPrimary?: string | null;
    /** @deprecated 렌더에 쓰이지 않음 — 호출부 호환용으로만 남김 */
    colorSecondary?: string | null;
    colorText?: string | null;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}

// 배지가 로고로 대체될 때의 로고 크기(기존 동작 유지: 배지 xs/sm → 로고 24px 등).
const LOGO_SIZE: Record<NonNullable<TeamBadgeProps['size']>, 'sm' | 'md' | 'lg'> = {
    xs: 'sm', sm: 'sm', md: 'md', lg: 'lg', xl: 'lg',
};

/**
 * 팀 컬러 배지 — `TeamMark variant="badge"`의 얇은 래퍼. [2026-10-12] 로고/배지 선택은
 * TeamMark로 일원화했고, 이 컴포넌트는 기존 호출부(홈/뉴스피드/리더보드/선수 상세) 호환용.
 * colorPrimary가 없으면 TeamMark가 로고로 대체한다(예전 동작과 동일).
 * 새 코드에서는 TeamMark를 직접 쓰고 variant를 명시할 것.
 */
export const TeamBadge: React.FC<TeamBadgeProps> = ({
    teamId, teamName, abbr, colorPrimary, colorText, size = 'sm', className = '',
}) => (
    <TeamMark
        teamId={teamId}
        teamName={teamName}
        variant="badge"
        size={colorPrimary ? size : LOGO_SIZE[size]}
        className={className}
        badge={{ abbr, colorPrimary, colorText }}
        shadow
    />
);
