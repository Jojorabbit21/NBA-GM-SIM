import React from 'react';
import { Info } from 'lucide-react';

interface UpdateToastProps {
    onRefresh: () => void;
    onDismiss: () => void;
}

export const UpdateToast: React.FC<UpdateToastProps> = ({ onRefresh, onDismiss }) => {
    return (
        <div className="fixed bottom-6 right-6 z-[9999] animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/50 p-5 w-[360px]">
                {/* Content */}
                <div className="flex items-start gap-3 mb-4">
                    <div className="shrink-0 mt-0.5 w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
                        <Info size={16} className="text-indigo-400" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-white ko-tight">
                            새로운 버전이 배포되었습니다
                        </p>
                        <p className="text-xs text-indigo-400 mt-1 ko-normal">
                            새로고침하여 최신 변경사항을 확인하세요.
                        </p>
                    </div>
                </div>

                {/* Buttons */}
                <div className="flex justify-end gap-2">
                    <button
                        onClick={onDismiss}
                        className="px-4 py-2 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
                    >
                        나중에
                    </button>
                    <button
                        onClick={onRefresh}
                        className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors"
                    >
                        새로고침
                    </button>
                </div>
            </div>
        </div>
    );
};
