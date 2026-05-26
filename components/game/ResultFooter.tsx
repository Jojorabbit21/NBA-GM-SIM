
import React from 'react';
import { ChevronRight, RotateCcw } from 'lucide-react';

interface ResultFooterProps {
    onFinish: () => void;
    finishLabel?: string;
    onReplay?: () => void;
}

export const ResultFooter: React.FC<ResultFooterProps> = ({ onFinish, finishLabel, onReplay }) => {
    return (
        <div className="fixed bottom-0 left-0 right-0 p-6 bg-slate-950/80 backdrop-blur-md border-t border-slate-800 flex justify-center gap-3 z-50">
            {onReplay && (
                <button
                    onClick={onReplay}
                    className="px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl font-black text-lg shadow-lg transition-all active:scale-95 flex items-center gap-3"
                >
                    <RotateCcw size={20} /> 다시 플레이
                </button>
            )}
            <button
                onClick={onFinish}
                className="px-12 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-lg shadow-[0_10px_30px_rgba(79,70,229,0.4)] transition-all active:scale-95 flex items-center gap-4"
            >
                {finishLabel ?? '라커룸으로 이동'} <ChevronRight />
            </button>
        </div>
    );
};
