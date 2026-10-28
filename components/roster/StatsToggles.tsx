// StatsToggles.tsx — 선수 기록 표 공통 토글 2종: 정규/플레이오프 · 색상 스케일(히트맵). [2026-10-27]
// 데스크톱 RosterStatsStack과 폰 PhoneRosterStats가 같은 상태 의미·같은 모양을 쓰도록 분리(사용자 지시: "데스크톱/모바일 공통").
// 모양은 리더보드 툴바(LeaderboardToolbar.tsx)의 컨테이너형 토글(slate-950 박스 + 36px + 인디고 스위치) 그대로, size="sm"은 폰용 28px.
import React from 'react';
import type { SeasonType } from '../../hooks/useLeaderboardData';

type Size = 'md' | 'sm';

const Switch: React.FC<{ on: boolean }> = ({ on }) => (
    <div className={`w-8 h-4 rounded-full relative transition-colors duration-300 shrink-0 ${on ? 'bg-indigo-600' : 'bg-slate-800'}`}>
        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300 shadow-sm ${on ? 'right-0.5' : 'left-0.5'}`} />
    </div>
);

const boxClass = (size: Size) =>
    `flex items-center justify-between gap-3 ${size === 'sm' ? 'h-7 px-2.5' : 'h-[36px] px-3'} bg-slate-950 rounded-lg border border-slate-800 shadow-sm cursor-pointer select-none hover:border-slate-700 transition-colors`;
const labelClass = (size: Size, active: boolean) => `${size === 'sm' ? 'text-xs' : 'text-sm'} font-bold transition-colors whitespace-nowrap ${active ? 'text-indigo-400' : 'text-slate-500'}`;

/** 색상 스케일(히트맵) on/off */
export const HeatmapToggle: React.FC<{ value: boolean; onChange: (v: boolean) => void; size?: Size }> = ({ value, onChange, size = 'md' }) => (
    <div role="switch" aria-checked={value} tabIndex={0} className={boxClass(size)} onClick={() => onChange(!value)} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(!value); } }} title="스탯 분포 색상 표시">
        <span className={labelClass(size, value)}>색상 스케일</span>
        <Switch on={value} />
    </div>
);

/** 정규 시즌 ↔ 플레이오프 */
export const SeasonTypeToggle: React.FC<{ value: SeasonType; onChange: (v: SeasonType) => void; size?: Size }> = ({ value, onChange, size = 'md' }) => {
    const playoff = value === 'playoff';
    const toggle = () => onChange(playoff ? 'regular' : 'playoff');
    return (
        <div role="switch" aria-checked={playoff} aria-label="정규 시즌 / 플레이오프" tabIndex={0} className={boxClass(size)} onClick={toggle} onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } }}>
            <span className={labelClass(size, !playoff)}>정규</span>
            <Switch on={playoff} />
            <span className={labelClass(size, playoff)}>플레이오프</span>
        </div>
    );
};
