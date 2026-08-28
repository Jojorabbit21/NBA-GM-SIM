
import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface StatRankRow {
    key: string;
    label: string;
    value: number;
    leagueAvg: number;
    format?: 'number' | 'percent';
    rank: number;
    totalTeams: number;
}

function formatValue(val: number, format?: 'number' | 'percent'): string {
    if (format === 'percent') return (val * 100).toFixed(1) + '%';
    return val.toFixed(1);
}

function formatDiff(diff: number, format?: 'number' | 'percent'): string {
    const val = format === 'percent' ? diff * 100 : diff;
    const sign = val > 0 ? '+' : '';
    const suffix = format === 'percent' ? '%' : '';
    return `${sign}${val.toFixed(1)}${suffix}`;
}

// VisualShotChart.tsx의 랭크 색상 컨벤션과 동일(1~5위=fuchsia, 6~10=emerald, 11~30=blue)
function rankColor(rank: number): string {
    if (rank <= 5) return 'text-fuchsia-400';
    if (rank <= 10) return 'text-emerald-400';
    return 'text-blue-400';
}

export interface StatRankPage {
    title: string;
    rows: StatRankRow[];
}

/** 인사이트 탭 전용 — "스탯명 | 값 | 평균 | 리그 순위" 4열 컴팩트 위젯. 전부 좌측 정렬. 자체
 *  최대폭 제한은 없음(w-full) — 여러 개를 가로로 나열할 때 부모가 flex-1 등으로 폭을 나눠주는
 *  용도(전체 리더보드 테이블과는 별개).
 *
 *  `pages`가 2개 이상이면(예: 공격/수비) 상/하로 나눠 보여주는 대신, 헤더 좌우에 쉐브론 버튼을
 *  둬서 같은 자리에서 데이터만 스왑하는 방식으로 전환한다("< 공격 >" → "< 수비 >"). pages가
 *  1개면 쉐브론 없이 예전처럼 고정 제목만 표시. */
export const TeamStatRankList: React.FC<{ pages: StatRankPage[] }> = ({ pages }) => {
    const [pageIndex, setPageIndex] = useState(0);
    const page = pages[pageIndex];
    const hasMultiplePages = pages.length > 1;
    const goPrev = () => setPageIndex(i => (i - 1 + pages.length) % pages.length);
    const goNext = () => setPageIndex(i => (i + 1) % pages.length);

    return (
        <div className="w-full bg-slate-900/40 border border-slate-800 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
                {hasMultiplePages ? (
                    <>
                        <button onClick={goPrev} className="text-slate-500 hover:text-white transition-colors" aria-label="이전">
                            <ChevronLeft size={16} />
                        </button>
                        <h4 className="text-sm font-normal text-white uppercase tracking-widest">{page.title}</h4>
                        <button onClick={goNext} className="text-slate-500 hover:text-white transition-colors" aria-label="다음">
                            <ChevronRight size={16} />
                        </button>
                    </>
                ) : (
                    <h4 className="text-sm font-normal text-white uppercase tracking-widest">{page.title}</h4>
                )}
            </div>
            <div className="flex items-center gap-3 px-3 py-2 bg-slate-700/50 border-b border-slate-700">
                <span className="text-sm font-normal text-slate-300 uppercase tracking-wider flex-1 text-left">스탯</span>
                <span className="text-sm font-normal text-slate-300 uppercase tracking-wider flex-1 text-right">값</span>
                <span className="text-sm font-normal text-slate-300 uppercase tracking-wider flex-[2] text-right">평균</span>
                <span className="text-sm font-normal text-slate-300 uppercase tracking-wider flex-1 text-right">순위</span>
            </div>
            <div className="flex flex-col">
                {page.rows.map((row, i) => (
                    <div
                        key={row.key}
                        className={`flex items-center gap-3 px-3 py-2.5 ${i % 2 === 1 ? 'bg-slate-700/25' : ''} ${i < page.rows.length - 1 ? 'border-b border-slate-800/60' : ''}`}
                    >
                        <span className="text-sm font-normal text-slate-400 flex-1 text-left">{row.label}</span>
                        <span className="text-sm font-normal text-white tabular-nums flex-1 text-right">
                            {formatValue(row.value, row.format)}
                        </span>
                        <span className="text-sm font-normal text-slate-300 tabular-nums flex-[2] text-right">
                            {formatValue(row.leagueAvg, row.format)}
                            {(() => {
                                const diff = row.value - row.leagueAvg;
                                const diffColor = diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-slate-500';
                                return <span className={`ml-1 font-normal ${diffColor}`}>({formatDiff(diff, row.format)})</span>;
                            })()}
                        </span>
                        <span className={`text-sm font-normal tabular-nums flex-1 text-right ${rankColor(row.rank)}`}>
                            {row.rank}위
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};
