import React from 'react';
import { BatchProgress } from '../../hooks/useFullSeasonSim';

interface Props {
    progress: BatchProgress;
    onCancel: () => void;
}

export const FullSeasonSimModal: React.FC<Props> = ({ progress, onCancel }) => {
    const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

    const formatDate = (iso: string) => {
        const d = new Date(iso + 'T00:00:00');
        return `${d.getMonth() + 1}월 ${d.getDate()}일`;
    };

    const label = progress.phase === 'saving'
        ? '결과 저장 중...'
        : progress.opponentName
            ? `${formatDate(progress.currentDate)}  vs ${progress.opponentName}  경기 시뮬레이션 중`
            : `${formatDate(progress.currentDate)}  경기 시뮬레이션 중`;

    return (
        <>
        {/* 배경 블러 오버레이 — 클릭 차단 */}
        <div className="fixed inset-0 z-[1999] backdrop-blur-[3px] bg-slate-950/50" />

        <div className="fixed top-0 left-0 right-0 z-[2000] bg-slate-950 border-b border-slate-800 overflow-hidden shadow-2xl" style={{ height: '48px' }}>

            {/* 배경 프로그레스 fill (반투명 인디고) */}
            <div
                className="absolute left-0 top-0 h-full bg-indigo-600/20 transition-all duration-300"
                style={{ width: `${pct}%` }}
            />

            {/* 하단 씬 라인 프로그레스 */}
            <div
                className="absolute bottom-0 left-0 h-[2px] bg-indigo-500 transition-all duration-300"
                style={{ width: `${pct}%` }}
            />

            {/* 프로그레스 엣지 글로우 */}
            {pct > 0 && pct < 100 && (
                <div
                    className="absolute bottom-0 w-[3px] h-[2px] bg-indigo-300 transition-all duration-300"
                    style={{
                        left: `calc(${pct}% - 1px)`,
                        boxShadow: '0 0 8px 2px rgba(99,102,241,0.8)',
                    }}
                />
            )}

            {/* 콘텐츠 */}
            <div className="absolute inset-0 flex items-center justify-between px-6">
                <div className="flex items-center gap-3 min-w-0">
                    {/* 활성 인디케이터 */}
                    <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-indigo-400 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.7)]" />
                    <span className="font-black ko-tight text-white text-sm whitespace-nowrap truncate">
                        {label}
                    </span>
                </div>

                <div className="flex items-center gap-4 shrink-0 pl-4">
                    {/* 퍼센트 표시 */}
                    <span className="font-mono font-black text-indigo-400 text-sm tabular-nums">
                        {Math.round(pct)}%
                    </span>

                    {progress.phase === 'simulating' && (
                        <button
                            onClick={onCancel}
                            className="text-xs font-black text-slate-400 hover:text-white transition-colors"
                        >
                            취소
                        </button>
                    )}
                </div>
            </div>
        </div>
        </>
    );
};
