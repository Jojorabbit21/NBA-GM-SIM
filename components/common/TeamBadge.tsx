
import React from 'react';
import { TeamLogo } from './TeamLogo';

interface TeamBadgeProps {
    teamId: string;
    teamName?: string;
    abbr?: string | null;
    colorPrimary?: string | null;
    colorSecondary?: string | null;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    className?: string;
}

const SIZE_CLASS: Record<NonNullable<TeamBadgeProps['size']>, string> = {
    xs: 'w-7 h-5 text-[9px]',
    sm: 'w-9 h-6 text-[10px]',
    md: 'w-11 h-7 text-xs',
    lg: 'w-14 h-9 text-sm',
};

const LOGO_SIZE: Record<NonNullable<TeamBadgeProps['size']>, 'sm' | 'md' | 'lg'> = {
    xs: 'sm', sm: 'sm', md: 'md', lg: 'lg',
};

/**
 * 팀 배지 — colorPrimary가 있으면(멀티플레이어 유저 커스텀 팀) 그 컬러의 직사각형 배지를
 * 그리고, 없으면(싱글플레이어 실제 NBA 팀) 기존 TeamLogo(실제 로고 이미지)를 그대로 사용한다.
 */
export const TeamBadge: React.FC<TeamBadgeProps> = ({
    teamId, teamName, abbr, colorPrimary, colorSecondary, size = 'sm', className = '',
}) => {
    if (!colorPrimary) {
        return <TeamLogo teamId={teamId} teamName={teamName} size={LOGO_SIZE[size]} className={className} />;
    }
    return (
        <div
            className={`shrink-0 rounded flex items-center justify-center font-black ${SIZE_CLASS[size]} ${className}`}
            style={{ backgroundColor: colorPrimary, color: colorSecondary ?? '#fff' }}
        >
            {(abbr ?? teamId).slice(0, 3).toUpperCase()}
        </div>
    );
};
