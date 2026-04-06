
import React, { useState, useEffect } from 'react';
import { LOADING_MESSAGES } from '../data/uiConstants';

interface LoaderProps {
    progress?: number; // 0~100. undefined이면 progress bar 미표시
    message?: string;
}

const Loader: React.FC<LoaderProps> = ({ progress, message }) => {
    const [currentText, setCurrentText] = useState(() => {
        if (message) return message;
        return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
    });

    useEffect(() => {
        if (message) {
            setCurrentText(message);
            return;
        }
        const interval = setInterval(() => {
            setCurrentText(prev => {
                let nextIndex;
                do {
                    nextIndex = Math.floor(Math.random() * LOADING_MESSAGES.length);
                } while (LOADING_MESSAGES[nextIndex] === prev && LOADING_MESSAGES.length > 1);
                return LOADING_MESSAGES[nextIndex];
            });
        }, 800);
        return () => clearInterval(interval);
    }, [message]);

    return (
        <>
            <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

            {/* 검은 배경 */}
            <div className="fixed inset-0 bg-black z-40" />

            {/* Progress Bar — progress prop이 있을 때만 표시 */}
            {progress !== undefined && (
                <div
                    className="fixed top-0 left-0 right-0 z-50 overflow-hidden shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-1px_rgba(0,0,0,0.06)]"
                    style={{ backgroundColor: '#1e293b', height: '35px' }}
                >
                    <div
                        className="absolute left-0 top-0 h-full"
                        style={{
                            width: `${progress}%`,
                            backgroundColor: '#059669',
                            transition: 'width 0.3s ease',
                        }}
                    />
                    <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 60%, transparent 100%)',
                            backgroundSize: '200% 100%',
                            animation: 'shimmer 1.8s ease-in-out infinite',
                        }}
                    />
                    <div
                        className="absolute inset-0 flex items-center gap-[16px] whitespace-nowrap"
                        style={{ left: '31px' }}
                    >
                        <span
                            className="font-bold text-white shrink-0"
                            style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif", fontSize: '16px', lineHeight: '24px', fontWeight: 700 }}
                        >
                            로딩 중... {progress}%
                        </span>
                        {currentText && (
                            <span
                                className="font-bold text-white shrink-0"
                                style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif", fontSize: '16px', lineHeight: '24px', fontWeight: 700 }}
                            >
                                {currentText}
                            </span>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default Loader;

/** 콘텐츠 영역 로딩 플레이스홀더 (Suspense fallback용) */
export const ContentLoader: React.FC = () => (
    <div className="flex-1 bg-black" />
);

/** Supabase 서버 연결 실패 시 표시되는 에러 화면 */
export const DatabaseErrorView: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
    <div className="fixed inset-0 bg-slate-950 flex flex-col items-center justify-center z-[1000] gap-6">
        <p className="text-2xl font-black pretendard text-red-400">서버 연결에 실패했습니다</p>
        <p className="text-slate-400 text-sm">Supabase 서비스에 접근할 수 없습니다. 잠시 후 다시 시도해주세요.</p>
        <button
            onClick={onRetry}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl transition-all"
        >
            다시 시도
        </button>
    </div>
);
