import React from 'react';

/** 전술 슬라이더 설명(줄 배열) 렌더 — 툴팁용. [2026-10-18]
 *  '+ ' 로 시작하는 줄 = 초록 +(장점), '- ' 로 시작하는 줄 = 빨강 −(단점), 그 외 = 설명 문단.
 *  설명 문단 뒤 첫 +/- 줄 앞에는 간격을 둬서 "설명 → 효과 목록"으로 읽히게 한다. */
export const SliderNoteContent: React.FC<{ lines: string[] }> = ({ lines }) => (
    <div className="flex flex-col gap-1">
        {lines.map((raw, i) => {
            const line = raw.trim();
            const sign = line.startsWith('+') ? '+' : line.startsWith('-') ? '-' : null;
            if (!sign) return <p key={i} className="m-0">{line}</p>;
            const prevIsBullet = i > 0 && /^[+-]/.test(lines[i - 1].trim());
            const plus = sign === '+';
            return (
                <div key={i} className={`flex gap-1.5 ${i > 0 && !prevIsBullet ? 'mt-1.5' : ''}`}>
                    <span aria-hidden="true" className={`shrink-0 w-3 text-center font-bold ${plus ? 'text-emerald-400' : 'text-red-400'}`}>{plus ? '+' : '−'}</span>
                    <span className="sr-only">{plus ? '장점: ' : '단점: '}</span>
                    <span>{line.slice(1).trim()}</span>
                </div>
            );
        })}
    </div>
);
