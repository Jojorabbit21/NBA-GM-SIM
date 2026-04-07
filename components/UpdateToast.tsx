
import React from 'react';
import { Info } from 'lucide-react';

interface UpdateToastProps {
    onRefresh: () => void;
    onDismiss: () => void;
}

export const UpdateToast: React.FC<UpdateToastProps> = ({ onRefresh, onDismiss }) => {
    return (
        <div className="fixed bottom-6 right-6 z-[9999] w-[360px] animate-in slide-in-from-bottom-4 fade-in duration-300">
            <div
                className="bg-surface-card border border-status-info-strong rounded-2xl p-4 flex flex-col gap-5"
                style={{ boxShadow: '0 20px 25px -5px rgba(0,0,0,0.10), 0 10px 10px -5px rgba(0,0,0,0.04)' }}
            >
                {/* 아이콘 + 텍스트 */}
                <div className="flex items-start gap-3">
                    <div
                        className="shrink-0 p-2 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: 'rgba(14,165,233,0.2)' }}
                    >
                        <Info size={18} className="text-status-info-text" />
                    </div>
                    <div className="flex flex-col gap-2 min-w-0">
                        <p className="text-sm font-bold text-status-info-text leading-5">
                            새 버전이 있습니다
                        </p>
                        <p className="text-sm font-medium text-text-primary leading-5">
                            더 나은 경험을 위해 업데이트하세요.
                        </p>
                    </div>
                </div>

                {/* 버튼 그룹 */}
                <div className="flex justify-end gap-2.5">
                    <button
                        onClick={onDismiss}
                        className="px-3 py-1.5 text-[10px] font-semibold text-text-primary border border-border-default rounded-md transition-colors hover:border-border-emphasis"
                    >
                        나중에
                    </button>
                    <button
                        onClick={onRefresh}
                        className="px-3 py-1.5 text-[10px] font-semibold text-white border border-cta-border rounded-md transition-all hover:brightness-110"
                        style={{ background: 'linear-gradient(to bottom, #4F46E5, #3730A3)' }}
                    >
                        새로고침
                    </button>
                </div>
            </div>
        </div>
    );
};
