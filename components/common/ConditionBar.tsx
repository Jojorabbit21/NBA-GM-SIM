import React from 'react';

// 선수 체력(0~100) 3단계 세로 막대(배터리 칸) + 수치. 색 단계는 박스스코어 피로도 표시(BoxScoreTable)와 같은 emerald/amber/red 계열.
// 80 이상: 3칸(정상), 60~79: 2칸(피로 누적), 60 미만: 1칸(탈진 위험 — 20 이하면 경기 중 강제 교체).
// value가 null이면 아직 보여주면 안 되는 상태 — 아이콘 없이 hiddenLabel만 표시한다.

export type ConditionLevel = 1 | 2 | 3;

export function conditionLevel(value: number): ConditionLevel {
    if (value >= 80) return 3;
    if (value >= 60) return 2;
    return 1;
}

const LEVEL_TONE: Record<ConditionLevel, { bar: string; text: string }> = {
    3: { bar: 'bg-emerald-500', text: 'text-emerald-400' },
    2: { bar: 'bg-amber-500',   text: 'text-amber-400' },
    1: { bar: 'bg-red-500',     text: 'text-red-400' },
};

// 단계별 체력 구간 [하한, 상한) — 마지막으로 채워진 막대의 불투명도로 구간 안 위치를 표현한다.
const LEVEL_RANGE: Record<ConditionLevel, [number, number]> = { 3: [80, 100], 2: [60, 80], 1: [0, 60] };
const MIN_LAST_BAR_OPACITY = 0.35;   // 구간 하한일 때 — 더 낮추면 빈 칸(slate-700)과 헷갈림

/** 마지막 채워진 막대 불투명도: 구간 하한 0.35 → 상한 1.0 선형 (예: 80 → 0.35, 90 → 0.675, 100 → 1) */
export function lastBarOpacity(value: number, level: ConditionLevel): number {
    const [lo, hi] = LEVEL_RANGE[level];
    const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
    return MIN_LAST_BAR_OPACITY + (1 - MIN_LAST_BAR_OPACITY) * t;
}

/** 같은 높이의 세로 막대 3개를 가로로 붙인 3단계 표시. 채워진 막대는 단계 색(마지막 막대만 구간 내 위치만큼 불투명도), 나머지는 옅은 회색. */
// md: 표(text-sm) — 6×14px, 간격 2px / xs: 12px 글자 줄(라이브 중계 박스) — 3×10px, 간격 1px
const BAR_SIZE = {
    md: { wrap: 'gap-0.5', bar: 'w-1.5 h-3.5' },
    xs: { wrap: 'gap-px',  bar: 'w-[3px] h-2.5' },
} as const;

const LevelBars: React.FC<{ level: ConditionLevel; fillClass: string; lastOpacity: number; size: keyof typeof BAR_SIZE }> = ({ level, fillClass, lastOpacity, size }) => (
    <div className={`flex items-center shrink-0 ${BAR_SIZE[size].wrap}`} aria-hidden="true">
        {[0, 1, 2].map(i => (
            <span
                key={i}
                className={`${BAR_SIZE[size].bar} ${i < level ? fillClass : 'bg-slate-700'}`}
                style={i === level - 1 ? { opacity: lastOpacity } : undefined}
            />
        ))}
    </div>
);

interface ConditionBarProps {
    value: number | null;
    /** value가 null일 때 표시할 문구 */
    hiddenLabel?: string;
    /** hiddenLabel 호버 설명 */
    hiddenTitle?: string;
    /** 막대 3개 표시 여부(기본 true). false면 단계 색 수치(%)만 — 선수 프로필 정보 행 */
    showBars?: boolean;
    /** 수치(%) 표시 여부(기본 true). false면 막대만 — 뎁스차트. 수치는 호버 툴팁(title)으로 확인 */
    showValue?: boolean;
    /** 막대 크기 — md(기본, text-sm 표) / xs(text-xs 줄, 라이브 중계 박스) */
    size?: 'md' | 'xs';
}

export const ConditionBar: React.FC<ConditionBarProps> = ({ value, hiddenLabel = '—', hiddenTitle, showBars = true, showValue = true, size = 'md' }) => {
    if (value == null) {
        return <span className="text-xs text-slate-500" title={hiddenTitle}>{hiddenLabel}</span>;
    }
    const pct = Math.max(0, Math.min(100, value));
    const level = conditionLevel(pct);
    const tone = LEVEL_TONE[level];
    return (
        <div className="flex items-center justify-center gap-1" title={`체력 ${pct.toFixed(1)}%`}>
            {showBars && <LevelBars level={level} fillClass={tone.bar} lastOpacity={lastBarOpacity(pct, level)} size={size} />}
            {showValue && <span className={`text-left text-sm font-semibold tabular-nums whitespace-nowrap ${tone.text}`}>{Math.round(pct)}%</span>}
        </div>
    );
};
