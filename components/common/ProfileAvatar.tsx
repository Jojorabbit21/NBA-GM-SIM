import React from 'react';
import { User } from 'lucide-react';
import { avatarBgClass, avatarInitial, avatarLogoUrl } from '../../utils/avatarColors';

/** 프로필 아이콘 — 닉네임 첫 글자 + 선택한 배경색(profiles.avatar_color, utils/avatarColors.ts). [2026-11-05] */
export const ProfileAvatar: React.FC<{
    nickname?: string | null;
    email?: string | null;
    colorKey?: string | null;
    /** 직접 입력한 아바타 글자(profiles.avatar_text) — 없으면 닉네임 첫 글자 */
    text?: string | null;
    /** 고른 로고 키(profiles.avatar_logo) — 있으면 글자 대신 로고(배경색은 그대로 colorKey) */
    logo?: string | null;
    /** 지름(px) */
    size?: number;
    className?: string;
}> = ({ nickname, email, colorKey, text, logo, size = 24, className = '' }) => {
    const initial = avatarInitial(nickname, email, text);
    const logoUrl = avatarLogoUrl(logo);
    if (logoUrl) {
        return (
            <span className={`inline-flex items-center justify-center rounded-full shrink-0 select-none ${avatarBgClass(colorKey)} ${className}`} style={{ width: size, height: size }}>
                <img src={logoUrl} alt="" draggable={false} className="w-[76%] h-[76%] object-contain" />
            </span>
        );
    }
    return (
        <span
            className={`inline-flex items-center justify-center rounded-full text-white font-black shrink-0 select-none ${avatarBgClass(colorKey)} ${className}`}
            style={{ width: size, height: size, fontSize: Math.round(size * (initial.length > 1 ? 0.36 : 0.46)) }}
        >
            {initial || <User size={Math.round(size * 0.55)} />}
        </span>
    );
};
