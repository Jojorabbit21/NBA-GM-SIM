
import React from 'react';

interface OvrBadgeProps {
    value: number;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
    /** size가 정하는 폰트 크기만 개별적으로 덮어쓰고 싶을 때(예: 드래프트 화면처럼 배지
     * 크기(w/h)는 sm 그대로 두되 글자만 키우고 싶은 경우) — 지정하지 않으면 기존처럼
     * size에 묶인 기본 폰트 크기를 그대로 사용(다른 76곳 호출부는 영향 없음). */
    textClassName?: string;
}

export const OvrBadge: React.FC<OvrBadgeProps> = ({ value, size = 'md', className = '', textClassName }) => {
    const baseStyles = "flex items-center justify-center font-black shadow-lg text-shadow-ovr transition-all leading-none";

    const boxStyles = {
        sm: "w-6 h-6 rounded",
        md: "w-8 h-8 rounded-md",
        lg: "w-11 h-11 rounded-lg",
        xl: "w-16 h-16 rounded-xl"
    };
    const defaultTextStyles = {
        sm: "text-[10px]",
        md: "text-sm",
        lg: "text-xl",
        xl: "text-3xl"
    };

    let colorStyles = "";
    if (value >= 97)       colorStyles = 'bg-gradient-to-br from-[#ec9eff] via-[#e438ff] to-[#6e14ff] text-white shadow-[0_0_20px_rgba(228,56,255,0.70),_0_0_40px_rgba(236,158,255,0.39),_0_0_0_1px_rgba(245,171,252,0.60)] border border-[rgba(236,158,255,0.70)] ring-1 ring-[rgba(245,171,252,0.60)]';
    else if (value >= 94)  colorStyles = 'bg-gradient-to-br from-[#855cff] via-[#6400c2] to-[#9000ff] text-white shadow-[0_0_12px_rgba(100,0,194,0.70)] border border-[rgba(133,92,255,0.70)]';
    else if (value >= 91)  colorStyles = 'bg-gradient-to-br from-[#e879f9] via-[#ab00c2] to-[#e000f5] text-white shadow-[0_0_12px_rgba(171,0,194,0.50)] border border-[rgba(232,121,249,0.40)]';
    else if (value >= 88)  colorStyles = 'bg-gradient-to-br from-[#f472b6] via-[#d20461] to-[#ff247b] text-white shadow-[0_0_12px_rgba(210,4,97,0.40)] border border-[rgba(244,114,182,0.40)]';
    else if (value >= 85)  colorStyles = 'bg-gradient-to-br from-[#fb7185] via-[#e11d48] to-[#ff1457] text-white shadow-[0_0_12px_rgba(225,29,72,0.30)] border border-[rgba(251,113,133,0.40)]';
    else if (value >= 82)  colorStyles = 'bg-gradient-to-br from-[#f87171] via-[#d31212] to-[#ff2929] text-white shadow-[0_0_12px_rgba(211,18,18,0.30)] border border-[rgba(248,113,113,0.40)]';
    else if (value >= 79)  colorStyles = 'bg-gradient-to-br from-[#fb923c] via-[#c34704] to-[#d15d10] text-white shadow-[0_0_12px_rgba(195,71,4,0.30)] border border-[rgba(251,146,60,0.30)]';
    else if (value >= 76)  colorStyles = 'bg-gradient-to-br from-[#f59e0b] via-[#b76201] to-[#e1893d] text-white shadow-[0_0_12px_rgba(183,98,1,0.20)] border border-[rgba(245,158,11,0.30)]';
    else if (value >= 73)  colorStyles = 'bg-gradient-to-br from-[#f59e0b] via-[#b45309] to-[#d4692b] text-white shadow-[0_0_12px_rgba(180,83,9,0.20)] border border-[rgba(245,158,11,0.27)]';
    else if (value >= 66)  colorStyles = 'bg-gradient-to-br from-[#976e53] via-[#745239] to-[#825d30] text-white shadow-[0_0_12px_rgba(116,82,57,0.16)] border border-[rgba(151,110,83,0.25)]';
    else if (value >= 60)  colorStyles = 'bg-gradient-to-br from-[#83644e] via-[#5a4e3f] to-[#66594d] text-white shadow-[0_0_12px_rgba(90,78,63,0.12)] border border-[rgba(131,100,78,0.22)]';
    else                   colorStyles = 'bg-gradient-to-br from-[#85807a] via-[#635e5a] to-[#71706f] text-white shadow-[0_0_12px_rgba(99,94,90,0.08)] border border-[rgba(133,128,122,0.18)]';

    return (
        <div className={`${baseStyles} ${boxStyles[size]} ${textClassName ?? defaultTextStyles[size]} ${colorStyles} ${className}`}>
            {value}
        </div>
    );
};
