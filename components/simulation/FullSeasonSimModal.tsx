/**
 * 시즌 전체 시뮬레이션 프로그레스 모달 (테스트 전용)
 */

import React from 'react';
import { BatchProgress } from '../../hooks/useFullSeasonSim';

interface Props {
    progress: BatchProgress;
    onCancel: () => void;
}

export const FullSeasonSimModal: React.FC<Props> = ({ progress, onCancel }) => {
    const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

    const phaseText = progress.phase === 'saving'
        ? '결과 저장 중...'
        : progress.phase === 'done'
            ? '완료!'
            : '경기 시뮬레이션 중...';

    return (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center z-[2000]">
            <div className="bg-slate-900 border border-slate-700/50 rounded-3xl p-10 max-w-md w-full mx-4 shadow-2xl">
                {/* Title */}
                <h2 className="text-xl font-black text-slate-100 text-center mb-6 uppercase tracking-wide">
                    시즌 시뮬레이션
                </h2>

                {/* Progress bar */}
                <div className="w-full bg-slate-800 rounded-full h-3 mb-3 overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${Math.max(1, pct)}%` }}
                    />
                </div>

                {/* Progress text */}
                <div className="flex justify-between items-center mb-2 text-sm">
                    <span className="text-slate-400 font-bold">
                        {progress.current} / {progress.total}
                    </span>
                    <span className="text-slate-400 font-bold">
                        {Math.round(pct)}%
                    </span>
                </div>

                {/* Date */}
                <p className="text-center text-slate-500 text-xs mb-6">
                    {progress.currentDate} {phaseText}
                </p>

                {/* Cancel button */}
                {progress.phase === 'simulating' && (
                    <div className="flex justify-center">
                        <button
                            onClick={onCancel}
                            className="px-6 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold transition-all"
                        >
                            취소
                        </button>
                    </div>
                )}

                {progress.phase === 'done' && (
                    <p className="text-center text-indigo-400 text-sm font-bold animate-pulse">
                        시뮬레이션 완료!
                    </p>
                )}
            </div>
        </div>
    );
};
