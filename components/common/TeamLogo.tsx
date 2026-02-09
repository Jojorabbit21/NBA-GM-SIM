
import React from 'react';
import { getTeamLogoUrl } from '../../utils/constants';

interface TeamLogoProps {
    teamId: string;
    teamName?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'custom';
    className?: string;
    faded?: boolean;
    style?: React.CSSProperties;
}

export const TeamLogo: React.FC<TeamLogoProps> = ({ 
    teamId, 
    teamName = '', 
    size = 'md', 
    className = '',
    faded = false,
    style
}) => {
    const sizeClass = {
        xs: "w-4 h-4",
        sm: "w-6 h-6",
        md: "w-8 h-8",
        lg: "w-12 h-12",
        xl: "w-16 h-16",
        '2xl': "w-24 h-24",
        '3xl': "w-32 h-32",
        'custom': "" // No default size, controlled by className
    };

    const logoUrl = getTeamLogoUrl(teamId);

    return (
        <img 
            src={logoUrl} 
            alt={teamName}
            className={`${sizeClass[size]} object-contain drop-shadow-md transition-all ${faded ? 'opacity-50 grayscale' : ''} ${className}`}
            style={style}
            onError={(e) => {
                e.currentTarget.src = 'https://placehold.co/100x100?text=NBA'; // Fallback
            }}
        />
    );
};
