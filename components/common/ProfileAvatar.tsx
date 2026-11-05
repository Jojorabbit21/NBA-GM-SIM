import React from 'react';
import { User } from 'lucide-react';
import { avatarBgClass, avatarInitial } from '../../utils/avatarColors';

/** 프로필 아이콘 — 닉네임 첫 글자 + 선택한 배경색(profiles.avatar_color, utils/avatarColors.ts). [2026-11-05] */
export const ProfileAvatar: React.FC<{
    nickname?: string | null;
    email?: string | null;
    colorKey?: string | null;
    /** 지름(px) */
    size?: number;
    className?: string;
}> = ({ nickname, email, colorKey, size = 24, className = '' }) => {
    const initial = avatarInitial(nickname, email);
    return (
        <span
            className={`inline-flex items-center justify-center rounded-full text-white font-black shrink-0 select-none ${avatarBgClass(colorKey)} ${className}`}
            style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
        >
            {initial || <User size={Math.round(size * 0.55)} />}
        </span>
    );
};
