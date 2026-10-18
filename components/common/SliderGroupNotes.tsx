
import React from 'react';

interface SliderNote {
    label: string;
    /** 문자열 또는 줄 배열(전술 슬라이더 설명은 [2026-10-18]부터 줄 배열 — 줄마다 한 줄로 표시) */
    text: string | string[];
    category?: string;
}

/** 슬라이더 그룹 하단에 배치하는 슬라이더별 설명 테이블 (개별 슬라이더 툴팁 대체, 항상 펼쳐짐).
 *  notes에 category가 있으면 그룹 헤더 행(예: "공격"/"수비")을 자동으로 끼워 넣는다. */
export const SliderGroupNotes: React.FC<{ notes: SliderNote[] }> = ({ notes }) => {
    let lastCategory: string | undefined;
    let rowIndexInCategory = 0;

    const rows = notes.flatMap((note, i) => {
        const isNewCategory = !!note.category && note.category !== lastCategory;
        if (isNewCategory) {
            lastCategory = note.category;
            rowIndexInCategory = 0;
        } else {
            rowIndexInCategory++;
        }

        const nextNote = notes[i + 1];
        const isLastInCategory = !nextNote || nextNote.category !== note.category;
        const showBorderB = i < notes.length - 1 && !isLastInCategory;

        const els: React.ReactNode[] = [];
        if (isNewCategory) {
            els.push(
                <tr key={`cat-${note.category}`} className="bg-slate-600/50">
                    <td colSpan={2} className="px-2 py-2.5 text-sm font-bold text-slate-200 border-b border-slate-800">
                        {note.category}
                    </td>
                </tr>
            );
        }
        els.push(
            <tr key={note.label} className={rowIndexInCategory % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/10'}>
                <td className={`align-top w-24 px-2 py-1.5 font-semibold text-slate-200 bg-slate-600/25 border-r border-slate-800 whitespace-nowrap ${showBorderB ? 'border-b border-slate-800' : ''}`}>
                    {note.label}
                </td>
                <td className={`align-top px-2 py-1.5 text-slate-200 break-keep ${showBorderB ? 'border-b border-slate-800' : ''}`}>
                    {Array.isArray(note.text)
                        ? note.text.map((line, li) => <div key={li}>{line}</div>)
                        : note.text}
                </td>
            </tr>
        );
        return els;
    });

    return (
        <div className="mt-1.5 pt-[10px] border-t border-slate-800/60">
            <div className="text-sm font-semibold text-slate-400">
                각 슬라이더의 역할 설명
            </div>

            <div className="mt-[10px] overflow-hidden rounded-lg border border-slate-700">
                <table className="w-full text-sm leading-relaxed border-collapse">
                    <tbody>
                        {rows}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
