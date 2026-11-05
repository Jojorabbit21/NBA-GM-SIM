// avatarColors.ts — 프로필 아이콘(닉네임 첫 글자) 배경색 팔레트 (2026-11-05)
//
// profiles.avatar_color에 키(예: 'indigo')를 저장하고 화면에서 이 표로 클래스를 고른다. NULL·모르는 키는 기본색.
// Tailwind가 클래스를 정적 스캔하므로 클래스명은 완전한 리터럴로 둔다. DB 쪽 검증: migrations/profiles_avatar_color.sql
// (소문자 1~16자) — 키를 추가할 때 이 형식을 지킬 것.

export interface AvatarColor { key: string; label: string; bg: string; }

export const AVATAR_COLORS: AvatarColor[] = [
    { key: 'indigo',  label: '인디고', bg: 'bg-indigo-600' },
    { key: 'blue',    label: '블루',   bg: 'bg-blue-600' },
    { key: 'sky',     label: '스카이', bg: 'bg-sky-600' },
    { key: 'teal',    label: '틸',     bg: 'bg-teal-600' },
    { key: 'emerald', label: '에메랄드', bg: 'bg-emerald-600' },
    { key: 'amber',   label: '앰버',   bg: 'bg-amber-600' },
    { key: 'orange',  label: '오렌지', bg: 'bg-orange-600' },
    { key: 'rose',    label: '로즈',   bg: 'bg-rose-600' },
    { key: 'fuchsia', label: '푸크시아', bg: 'bg-fuchsia-600' },
    { key: 'violet',  label: '바이올렛', bg: 'bg-violet-600' },
];

export const DEFAULT_AVATAR_COLOR = 'indigo';

export function avatarBgClass(key: string | null | undefined): string {
    return (AVATAR_COLORS.find(c => c.key === key) ?? AVATAR_COLORS[0]).bg;
}

/** 닉네임 첫 글자(없으면 이메일 첫 글자, 둘 다 없으면 빈 문자열) — 영문은 대문자 */
export function avatarInitial(nickname: string | null | undefined, email?: string | null): string {
    return (nickname?.trim() || email?.trim() || '').charAt(0).toUpperCase();
}
