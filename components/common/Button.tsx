import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * 공용 버튼 — 2026-10-12 재정의(docs/plan/ui-buttons.md).
 * 멀티 세션 `<button>` 268개 분포에서 역산한 기본값: `rounded-lg` · `text-sm font-semibold` · 높이 32px.
 * 아이콘 전용은 IconButton, 선택 토글은 SegmentedControl을 쓴다(여기에 prop을 쌓지 않는다).
 */
export type ButtonVariant =
    | 'primary'     // 주 동작: 제안·저장·입장·서명
    | 'secondary'   // 보조: 취소·초기화·전체 보기
    | 'ghost'       // 배경 없음, hover 시 옅은 배경
    | 'link'        // 텍스트만(← 뒤로, 더보기). underline 옵션으로 이동 링크 구분
    | 'danger'      // 방출 확정·거절·삭제
    | 'dangerSoft'  // 탈퇴·강퇴처럼 덜 강조된 위험 동작
    | 'success'     // 수락·확정
    | 'warning'     // 주의가 필요한 확정
    | 'cta';        // 주황 그라디언트 — 드래프트 룸 입장·리그 참가 등 화면당 1개

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type ButtonShape = 'md' | 'lg' | 'xl' | 'full';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    shape?: ButtonShape;
    isLoading?: boolean;
    loadingText?: string;
    /** 좌측 아이콘 */
    icon?: React.ReactNode;
    /** 우측 아이콘(예: ChevronDown) */
    iconRight?: React.ReactNode;
    fullWidth?: boolean;
    /** variant="link" 전용 — 본문 속 이동 링크(팀명·선수명)는 true, 동작 버튼(뒤로·더보기)은 기본 false */
    underline?: boolean;
}

// 높이 24 / 28 / 32 / 36 / 40 — 실사용 패딩 상위 조합(2/0.5, 2.5/1, 3/1.5, 4/2, 5/2.5)과 일치
const SIZE: Record<ButtonSize, string> = {
    xs: 'h-6 px-2 text-xs font-semibold gap-1',
    sm: 'h-7 px-2.5 text-xs font-semibold gap-1',
    md: 'h-8 px-3 text-sm font-semibold gap-1.5',
    lg: 'h-9 px-4 text-sm font-semibold gap-1.5',
    xl: 'h-10 px-5 text-base font-semibold gap-2',
};
// link는 패딩·높이 없이 글자만
const LINK_SIZE: Record<ButtonSize, string> = {
    xs: 'text-xs font-semibold gap-1', sm: 'text-xs font-semibold gap-1', md: 'text-sm font-semibold gap-1.5',
    lg: 'text-sm font-semibold gap-1.5', xl: 'text-base font-semibold gap-2',
};
const SHAPE: Record<ButtonShape, string> = { md: 'rounded-md', lg: 'rounded-lg', xl: 'rounded-xl', full: 'rounded-full' };
const VARIANT: Record<ButtonVariant, string> = {
    primary:    'bg-indigo-600 hover:bg-indigo-500 text-white',
    secondary:  'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white',
    ghost:      'bg-transparent hover:bg-white/5 text-slate-400 hover:text-white',
    link:       'bg-transparent text-slate-400 hover:text-white',
    danger:     'bg-red-600 hover:bg-red-500 text-white',
    dangerSoft: 'bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300',
    success:    'bg-emerald-600 hover:bg-emerald-500 text-white',
    warning:    'bg-amber-500 hover:bg-amber-400 text-slate-950',
    cta:        'bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-semibold',
};

export const Button: React.FC<ButtonProps> = ({
    children,
    variant = 'primary',
    size = 'md',
    shape = 'lg',
    isLoading = false,
    loadingText,
    icon,
    iconRight,
    fullWidth = false,
    underline = false,
    className = '',
    disabled,
    type = 'button',
    ...props
}) => {
    const isLink = variant === 'link';
    const cls = [
        'inline-flex items-center justify-center whitespace-nowrap transition-colors',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        isLink ? LINK_SIZE[size] : `${SIZE[size]} ${SHAPE[shape]}`,
        VARIANT[variant],
        isLink && underline ? 'text-indigo-400 hover:text-indigo-300 hover:underline' : '',
        fullWidth ? 'w-full' : '',
        className,
    ].filter(Boolean).join(' ');
    const spinner = size === 'xs' || size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';

    return (
        <button type={type} className={cls} disabled={isLoading || disabled} {...props}>
            {isLoading ? (
                <>
                    <Loader2 className={`animate-spin ${spinner}`} />
                    {loadingText || children}
                </>
            ) : (
                <>
                    {icon}
                    {children}
                    {iconRight}
                </>
            )}
        </button>
    );
};
