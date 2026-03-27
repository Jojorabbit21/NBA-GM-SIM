
import React from 'react';

interface SkeletonLoaderProps {
    progress?: number; // 0~100
    message?: string;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ progress = 0, message }) => {
    return (
        <>
            <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

            {/* 검은 배경 */}
            <div className="fixed inset-0 bg-black z-40" />

            {/* Loading Banner — 상단 프로그레스 바 (35px) */}
            <div
                className="fixed top-0 left-0 right-0 z-50 overflow-hidden shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-1px_rgba(0,0,0,0.06)]"
                style={{ backgroundColor: '#1e293b', height: '35px' }}
            >
                {/* Layer 1: 에메랄드 프로그레스 바 */}
                <div
                    className="absolute left-0 top-0 h-full"
                    style={{
                        width: `${progress}%`,
                        backgroundColor: '#059669',
                        transition: 'width 0.3s ease',
                    }}
                />

                {/* Layer 2: shimmer 오버레이 */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 60%, transparent 100%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 1.8s ease-in-out infinite',
                    }}
                />

                {/* Layer 3: 텍스트 */}
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
                    {message && (
                        <span
                            className="font-bold text-white shrink-0"
                            style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif", fontSize: '16px', lineHeight: '24px', fontWeight: 700 }}
                        >
                            {message}
                        </span>
                    )}
                </div>
            </div>
        </>
    );
};

/** 컨텐츠 영역 로딩 플레이스홀더 (Suspense fallback용) */
export const ContentSkeleton: React.FC = () => (
    <div className="flex-1 bg-black" />
);

export default SkeletonLoader;
