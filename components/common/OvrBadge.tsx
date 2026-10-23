// OvrBadge.tsx — OVR 배지.
// [2026-09-20] 12구간 → 6단계 티어로 단순화 + "OVR 배지 티어 랩" 아티팩트에서 확정한 디자인 이식.
// [2026-10-14] "OVR 배지 조정 랩"(https://claude.ai/artifact/9w7PVdoASaQM4yybo6tkcy) 확정값으로 전 티어·크기별 글자·서체 교체.
// [2026-10-16] 2K식 12단계 체계로 재설계 — "레이팅 배지 스튜디오"(https://claude.ai/artifact/AEs4fF5nfRYiCriSM2ZoAk)
//   에서 확정한 값을 그대로 이식. 숫자 서체는 TeX Gyre Heros(HerosBadge, index.css의 @font-face).
// [2026-10-17] 스튜디오 재확정 — 골드~갤럭시 오팔 8개 등급 색 교체(구간·크기·서체는 불변). Before는 dev-log 2026-10-17 항목.
//   이전 6단계(레전드/다이아/골드/실버/브론즈/아이언)의 값은 docs/history/dev-log.md 2026-10-16 항목에 Before로 보존.
//
// 등급 (시작 값 이상 ~ 다음 등급 시작 값 미만, 위에서 아래 = 높은 등급 먼저):
//   99+ 임페리얼 / 97 갤럭시 오팔 / 95 핑크 다이아몬드 / 92 다이아몬드 / 90 아메시스트 / 87 루비 /
//   84 사파이어 / 80 에메랄드 / 75 골드 / 70 실버 / 1 브론즈 / 0 오닉스
// 값이 100 이상(카드 전용 manual_ovr)이면 정사각형은 유지하고 글자만 한 단계 줄인다.
// 색상값은 스튜디오 JSON과 1:1 — 바꿀 때는 스튜디오에서 먼저 확인.
import React from 'react';

interface OvrBadgeProps {
    value: number;
    /** card: 개인 팩 드래프트 카드 전용 60px(목업 확정값).
     *  table[2026-10-13]: 표 셀 안 28px(글자 text-xs) — 로스터 4개 표가 `size="sm" className="!w-7 !h-7 !text-xs !shadow-none"`로
     *  강제하던 크기를 정식화. 셀 안에선 글로우/베벨 그림자를 쓰지 않는다(예전 `!shadow-none`과 동일 외형). */
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'card' | 'table' | 'header';
    className?: string;
    /** size가 정하는 폰트 크기만 개별적으로 덮어쓰고 싶을 때(예: 드래프트 화면처럼 배지
     * 크기(w/h)는 sm 그대로 두되 글자만 키우고 싶은 경우) — 지정하지 않으면 기존처럼
     * size에 묶인 기본 폰트 크기를 그대로 사용(다른 호출부는 영향 없음). */
    textClassName?: string;
}

interface TierStyle {
    /** CSS background 전체 문자열(그라디언트) */
    background: string;
    textColor: string;
    /** null이면 외곽 글로우 없음 */
    glowColor: string | null;
}

// 채우기: 스튜디오 fill=linear는 위→아래 2색 세로 그라디언트(c3 무시). 3색 대각선(fill=tri, grad3)은 현재 쓰는 등급 없음.
const grad2 = (c1: string, c2: string) => `linear-gradient(${c1},${c2})`;
// [2026-10-23] 임페리얼/갤럭시 오팔이 grad2로 바뀌어 미사용 — 스튜디오에서 fill=tri로 되돌릴 때를 위해 보존.
export const grad3 = (c1: string, c2: string, c3: string) =>
    `linear-gradient(rgba(75,168,255,.1),rgba(0,0,0,.7)),linear-gradient(to bottom left,${c1},${c2},${c3})`;

// min 내림차순 — 위에서부터 value >= min 첫 항목이 해당 등급.
const TIERS: { min: number; style: TierStyle }[] = [
    { min: 99, style: { background: grad2('#ffdd00', '#ff004c'), textColor: '#ffffff', glowColor: '#b3005f' } },          // 임페리얼 (스튜디오 fill=linear → c3 미사용)
    { min: 97, style: { background: grad2('#0ab6ff', '#7000fa'), textColor: '#ffffff', glowColor: '#2e03c9' } },          // 갤럭시 오팔 (동일)
    { min: 95, style: { background: grad2('#1153ee', '#0a33ae'), textColor: '#ffffff', glowColor: null } },               // 핑크 다이아몬드
    { min: 92, style: { background: grad2('#e01a70', '#b30024'), textColor: '#ffffff', glowColor: null } },               // 다이아몬드
    { min: 90, style: { background: grad2('#ff0fd3', '#a23a02'), textColor: '#ffffff', glowColor: null } },               // 아메시스트
    { min: 87, style: { background: grad2('#0be0dc', '#007d80'), textColor: '#ffffff', glowColor: null } },               // 루비
    { min: 84, style: { background: grad2('#01cb73', '#0f6148'), textColor: '#ffffff', glowColor: null } },               // 사파이어
    { min: 80, style: { background: grad2('#00a814', '#006609'), textColor: '#ffffff', glowColor: null } },               // 에메랄드
    { min: 75, style: { background: grad2('#cca000', '#b37100'), textColor: '#ffffff', glowColor: null } },               // 골드
    { min: 70, style: { background: grad2('#bfbfbf', '#6b6b6b'), textColor: '#ffffff', glowColor: null } },               // 실버
    { min: 1,  style: { background: grad2('#e07015', '#ae540f'), textColor: '#ffffff', glowColor: null } },               // 브론즈
    { min: 0,  style: { background: grad2('#565656', '#232323'), textColor: '#ffffff', glowColor: null } },               // 오닉스
];

export function getOvrTierStyle(value: number): TierStyle {
    for (const t of TIERS) if (value >= t.min) return t.style;
    return TIERS[TIERS.length - 1].style;
}

const BOX: Record<NonNullable<OvrBadgeProps['size']>, { cls: string }> = {
    sm: { cls: 'w-6 h-6 rounded' },
    md: { cls: 'w-8 h-8 rounded-md' },
    lg: { cls: 'w-11 h-11 rounded-lg' },
    xl: { cls: 'w-16 h-16 rounded-xl' },
    card: { cls: 'w-[60px] h-[60px] rounded-xl' },
    table: { cls: 'w-7 h-7 rounded' },
    // header[2026-10-13]: 선수 상세 프로필 헤더(이름 옆 40px) — 예전 `size="lg" className="!w-10 !h-10 !text-2xl"` 정식화
    header: { cls: 'w-10 h-10 rounded-lg' },
};
const TEXT: Record<NonNullable<OvrBadgeProps['size']>, string> = {
    sm: 'text-[15px]', table: 'text-[17px]', md: 'text-[19px]', header: 'text-[23px]', lg: 'text-[25px]', card: 'text-[35px]', xl: 'text-[37px]',
};
// 세 자리(100+)는 같은 정사각형 안에 들어가도록 한 단계 작게
const TEXT_THREE_DIGIT: Record<NonNullable<OvrBadgeProps['size']>, string> = {
    sm: 'text-[11px]', table: 'text-[13px]', md: 'text-[15px]', header: 'text-[19px]', lg: 'text-[20px]', card: 'text-[28px]', xl: 'text-[30px]',
};
// [2026-10-16] 숫자 서체 — TeX Gyre Heros Bold(HerosBadge, index.css @font-face). 스튜디오 확정값은 굵기 900이지만
// 이 서체는 700이 최대라 700으로 고정(900 요청 시 브라우저가 가짜 볼드를 덧입히는 것을 막기 위함). 자간은 기본값.
const DIGIT_FONT: React.CSSProperties = { fontFamily: "'HerosBadge', 'Helvetica Neue', Helvetica, Arial, sans-serif", fontWeight: 700 };
// 스튜디오 확정값: 글자 위쪽에만 옅게 깔리는 그림자(2K 원본과 동일)
const TEXT_SHADOW = '0 -1px 0 rgba(0,0,0,.25)';

export const OvrBadge: React.FC<OvrBadgeProps> = ({ value, size = 'md', className = '', textClassName }) => {
    const tier = getOvrTierStyle(value);
    const box = BOX[size];
    const isThreeDigit = value >= 100;
    const textCls = textClassName ?? (isThreeDigit ? TEXT_THREE_DIGIT[size] : TEXT[size]);

    const boxStyle: React.CSSProperties = {
        background: tier.background,
        // 표 셀 안에서는 글로우를 쓰지 않는다(예전 `!shadow-none`과 동일 외형)
        boxShadow: tier.glowColor && size !== 'table' ? `0 0 10px ${tier.glowColor}` : undefined,
    };

    return (
        <div
            className={`flex items-center justify-center leading-none ${box.cls} ${textCls} ${className}`}
            style={boxStyle}
        >
            <span className="leading-none" style={{ ...DIGIT_FONT, color: tier.textColor, textShadow: TEXT_SHADOW }}>{value}</span>
        </div>
    );
};
