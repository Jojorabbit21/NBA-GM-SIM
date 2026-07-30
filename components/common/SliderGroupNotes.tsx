
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface SliderNote {
    label: string;
    text: string;
}

/** 슬라이더 그룹 하단에 배치하는 슬라이더별 설명 테이블 (개별 슬라이더 툴팁 대체, 접기/펼치기 가능) */
export const SliderGroupNotes: React.FC<{ notes: SliderNote[] }> = ({ notes }) => {
    const [open, setOpen] = useState(false);

    return (
        <div className="mt-1.5 pt-1.5 border-t border-slate-800/60">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between text-[11px] font-semibold text-slate-400 hover:text-slate-200 transition-colors py-0.5"
            >
                <span>슬라이더 설명 {open ? '접기' : `보기 (${notes.length})`}</span>
                <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="mt-1 overflow-hidden rounded-lg border border-slate-800/60">
                    <table className="w-full text-[12px] leading-relaxed border-collapse">
                        <tbody>
                            {notes.map(({ label, text }, i) => (
                                <tr key={label} className={i % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/10'}>
                                    <td className="align-top w-24 px-2 py-1.5 font-semibold text-white border-r border-slate-800/60 whitespace-nowrap">
                                        {label}
                                    </td>
                                    <td className="align-top px-2 py-1.5 text-slate-300 break-keep">
                                        {text}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
