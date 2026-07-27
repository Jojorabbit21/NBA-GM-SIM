
import React from 'react';

interface SliderNote {
    label: string;
    text: string;
}

/** 슬라이더 그룹 하단에 배치하는 슬라이더별 설명 목록 (개별 슬라이더 툴팁 대체) */
export const SliderGroupNotes: React.FC<{ notes: SliderNote[] }> = ({ notes }) => (
    <div className="mt-1.5 pt-1.5 border-t border-slate-800/60 space-y-1">
        {notes.map(({ label, text }) => (
            <p key={label} className="text-[12px] text-slate-300 leading-relaxed break-keep">
                <span className="text-white font-semibold">{label}</span> — {text}
            </p>
        ))}
    </div>
);
