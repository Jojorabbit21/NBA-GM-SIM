// TogglePill.tsx — 데스크톱 툴바의 토글 pill(뉴스피드 "빅 뉴스만"/"최신순·오래된순", 리더보드 "색상 스케일"/"정규시즌·플레이오프")을
// 폰 필터 시트 행 우측에 그대로 쓰기 위한 공용 복제. [2026-10-28] h-36 bg-slate-950 border, 라벨 text-sm bold indigo-400/slate-500, 스위치 w-8 h-4.
//   right가 있으면 양쪽 라벨(on=false 좌 활성 · on=true 우 활성), 없으면 단일 라벨(on이면 indigo).
import React from 'react';

export const TogglePill: React.FC<{ left: string; right?: string; on: boolean; onClick: () => void; title?: string }> = ({ left, right, on, onClick, title }) => (
    <button type="button" onClick={onClick} title={title} aria-pressed={on} className="flex items-center gap-3 h-9 bg-slate-950 rounded-lg border border-slate-800 shadow-sm px-3 select-none shrink-0">
        <span className={`text-sm font-bold whitespace-nowrap ${right ? (!on ? 'text-indigo-400' : 'text-slate-500') : (on ? 'text-indigo-400' : 'text-slate-500')}`}>{left}</span>
        <span className={`w-8 h-4 rounded-full relative transition-colors duration-300 ${on ? 'bg-indigo-600' : 'bg-slate-800'}`}>
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-300 shadow-sm ${on ? 'right-0.5' : 'left-0.5'}`} />
        </span>
        {right && <span className={`text-sm font-bold whitespace-nowrap ${on ? 'text-indigo-400' : 'text-slate-500'}`}>{right}</span>}
    </button>
);
