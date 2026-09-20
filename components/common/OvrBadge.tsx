// OvrBadge.tsx — OVR 배지.
// [2026-09-20] 12구간 → 6단계 티어로 단순화 + "OVR 배지 티어 랩" 아티팩트에서 확정한 디자인 이식.
//   100+  레전드   : 흑금속 배경(0°) + 금색 메탈릭 그라디언트 글자 + 금색 보더 + 베벨 + 글로우
//   90~99 다이아몬드: 아이스 시안 3스톱(0°)
//   80~89 골드     : 5스톱 메탈릭 골드(135°)
//   70~79 실버     : 매끈한 3스톱 은색(135°)
//   60~69 브론즈   : 매끈한 3스톱 구리색(135°)
//   0~59  아이언   : 매끈한 3스톱 철회색(135°)
// 값이 100 이상(카드 전용 manual_ovr)이면 정사각형은 유지하고 글자만 한 단계 줄인다.
// 색상값은 랩 JSON(docs/history/dev-log.md 2026-09-20 항목)과 1:1 — 바꿀 때는 랩에서 먼저 확인.
import React from 'react';

interface OvrBadgeProps {
    value: number;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
    /** size가 정하는 폰트 크기만 개별적으로 덮어쓰고 싶을 때(예: 드래프트 화면처럼 배지
     * 크기(w/h)는 sm 그대로 두되 글자만 키우고 싶은 경우) — 지정하지 않으면 기존처럼
     * size에 묶인 기본 폰트 크기를 그대로 사용(다른 호출부는 영향 없음). */
    textClassName?: string;
}

interface TierStyle {
    /** CSS linear-gradient 전체 문자열 */
    background: string;
    border: string;
    borderWidth: number;
    /** 'solid'면 textColor, 'metallic'이면 textStops(180°, 0/30/55/100%)로 글자를 채운다 */
    textMode: 'solid' | 'metallic';
    textColor: string;
    textStops: [string, string, string, string];
    /** 0이면 외곽 글로우 없음 */
    glowSize: number;
    glowColor: string;
    glowAlpha: number;
    /** 0~1. 안쪽 좌상단 하이라이트 + 우하단 음영 */
    bevel: number;
}

const TIERS: { min: number; style: TierStyle }[] = [
    { min: 100, style: {
        background: 'linear-gradient(0deg,#3a3a3a 0%,#050505 50%,#262626 100%)',
        border: '#ffc400', borderWidth: 1,
        textMode: 'metallic', textColor: '#f5d061', textStops: ['#fff6c8', '#f5d061', '#b8860b', '#f9e08a'],
        glowSize: 10, glowColor: '#d4af37', glowAlpha: 0.55, bevel: 0.4,
    } },
    { min: 90, style: {
        background: 'linear-gradient(0deg,#a5f3fc 0%,#0891b2 50%,#67e8f9 100%)',
        border: '#cffafe', borderWidth: 1.5,
        textMode: 'solid', textColor: '#ffffff', textStops: ['#ffffff', '#cffafe', '#67e8f9', '#ffffff'],
        glowSize: 0, glowColor: '#22d3ee', glowAlpha: 0.55, bevel: 0,
    } },
    { min: 80, style: {
        background: 'linear-gradient(135deg,#fff1b8 0%,#f5c542 28%,#b7791f 52%,#fbd56b 72%,#9a6612 100%)',
        border: '#fcd34d', borderWidth: 1.5,
        textMode: 'solid', textColor: '#ffffff', textStops: ['#fff6c8', '#f5d061', '#b8860b', '#f9e08a'],
        glowSize: 0, glowColor: '#f59e0b', glowAlpha: 0.45, bevel: 0,
    } },
    { min: 70, style: {
        background: 'linear-gradient(135deg,#e2e8f0 0%,#94a3b8 55%,#64748b 100%)',
        border: '#cbd5e1', borderWidth: 1.5,
        textMode: 'solid', textColor: '#ffffff', textStops: ['#ffffff', '#e2e8f0', '#94a3b8', '#f8fafc'],
        glowSize: 0, glowColor: '#cbd5e1', glowAlpha: 0.35, bevel: 0,
    } },
    { min: 60, style: {
        background: 'linear-gradient(135deg,#d99a5e 0%,#8a4d17 55%,#6b3a10 100%)',
        border: '#c8823f', borderWidth: 1.5,
        textMode: 'solid', textColor: '#ffffff', textStops: ['#fbe3c9', '#d99a5e', '#8a4d17', '#f0c294'],
        glowSize: 0, glowColor: '#b4712f', glowAlpha: 0.35, bevel: 0,
    } },
    { min: 0, style: {
        background: 'linear-gradient(135deg,#6b7280 0%,#374151 55%,#1f2937 100%)',
        border: '#6b7280', borderWidth: 1,
        textMode: 'solid', textColor: '#e5e7eb', textStops: ['#f3f4f6', '#9ca3af', '#4b5563', '#d1d5db'],
        glowSize: 0, glowColor: '#6b7280', glowAlpha: 0.25, bevel: 0,
    } },
];

export function getOvrTierStyle(value: number): TierStyle {
    for (const t of TIERS) if (value >= t.min) return t.style;
    return TIERS[TIERS.length - 1].style;
}

function hexToRgb(hex: string): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return '255,255,255';
    const n = parseInt(m[1], 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

const BOX: Record<NonNullable<OvrBadgeProps['size']>, { cls: string; px: number }> = {
    sm: { cls: 'w-6 h-6 rounded',      px: 24 },
    md: { cls: 'w-8 h-8 rounded-md',   px: 32 },
    lg: { cls: 'w-11 h-11 rounded-lg', px: 44 },
    xl: { cls: 'w-16 h-16 rounded-xl', px: 64 },
};
const TEXT: Record<NonNullable<OvrBadgeProps['size']>, string> = {
    sm: 'text-[10px]', md: 'text-sm', lg: 'text-xl', xl: 'text-3xl',
};
// 세 자리(100+)는 같은 정사각형 안에 들어가도록 한 단계 작게
const TEXT_THREE_DIGIT: Record<NonNullable<OvrBadgeProps['size']>, string> = {
    sm: 'text-[9px]', md: 'text-xs', lg: 'text-base', xl: 'text-2xl',
};

export const OvrBadge: React.FC<OvrBadgeProps> = ({ value, size = 'md', className = '', textClassName }) => {
    const tier = getOvrTierStyle(value);
    const box = BOX[size];
    const isThreeDigit = value >= 100;
    const textCls = textClassName ?? (isThreeDigit ? TEXT_THREE_DIGIT[size] : TEXT[size]);

    const shadows: string[] = ['inset 0 0 0 1px rgba(255,255,255,.12)'];
    if (tier.glowSize > 0) shadows.unshift(`0 0 ${tier.glowSize}px rgba(${hexToRgb(tier.glowColor)},${tier.glowAlpha})`);
    if (tier.bevel > 0) {
        // 베벨 두께는 배지 크기에 비례(44px일 때 2px)
        const d = Math.max(1, Math.round(box.px / 22));
        shadows.push(`inset ${d}px ${d}px ${d}px rgba(255,255,255,${(0.55 * tier.bevel).toFixed(2)})`);
        shadows.push(`inset -${d}px -${d}px ${d}px rgba(0,0,0,${(0.85 * tier.bevel).toFixed(2)})`);
    }

    const boxStyle: React.CSSProperties = {
        background: tier.background,
        border: `${tier.borderWidth}px solid ${tier.border}`,
        boxShadow: shadows.join(', '),
    };

    const textStyle: React.CSSProperties = tier.textMode === 'metallic'
        ? {
            background: `linear-gradient(180deg,${tier.textStops[0]} 0%,${tier.textStops[1]} 30%,${tier.textStops[2]} 55%,${tier.textStops[3]} 100%)`,
            WebkitBackgroundClip: 'text', backgroundClip: 'text',
            color: 'transparent', WebkitTextFillColor: 'transparent',
            // 투명 글자 뒤로 비치는 text-shadow 대신 drop-shadow
            textShadow: 'none', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.8))',
        }
        : { color: tier.textColor };

    return (
        <div
            className={`flex items-center justify-center font-black leading-none ${box.cls} ${textCls} ${tier.textMode === 'solid' ? 'text-shadow-ovr' : ''} ${className}`}
            style={boxStyle}
        >
            <span className="leading-none" style={textStyle}>{value}</span>
        </div>
    );
};
