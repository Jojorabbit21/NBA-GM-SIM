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
            ? `${formatDate(progress.currentDate)}  vs ${progress.opponentName}  경기 시뮬레이션 중...`
            : `${formatDate(progress.currentDate)}  경기 시뮬레이션 중...`;

    return (
        <>
            <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

            {/* 배경 블러 오버레이 — 클릭 차단 */}
            <div className="fixed inset-0 z-[1999] backdrop-blur-[3px] bg-slate-950/50" />

            <div
                className="fixed top-0 left-0 right-0 z-[2000] overflow-hidden"
                style={{
                    backgroundColor: '#18181B',
                    height: '35px',
                    boxShadow: '0px 4px 6px -1px rgba(0,0,0,0.1), 0px 2px 4px -1px rgba(0,0,0,0.06)',
                }}
            >
                {/* 프로그레스 바 (그라디언트 + 우측 border + glow) */}
                <div
                    className="absolute left-0 top-0 h-full"
                    style={{
                        width: `${pct}%`,
                        background: 'linear-gradient(to right, rgba(16,185,129,0.1), rgba(16,185,129,0.5))',
                        borderRight: '2px solid #34D399',
                        boxShadow: '0 0 10px 0 #34D399',
                        transition: 'width 0.3s ease',
                    }}
                />

                {/* Shimmer 텍스처 */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 60%, transparent 100%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 1.8s ease-in-out infinite',
                    }}
                />

                {/* 텍스트 + 취소 버튼 */}
                <div className="absolute inset-0 flex items-center justify-between" style={{ paddingLeft: '31px', paddingRight: '12px' }}>
                    <span className="font-bold text-white shrink-0 whitespace-nowrap" style={{ fontSize: '16px', lineHeight: '24px' }}>
                        {label}
                    </span>

                    {progress.phase === 'simulating' && (
                        <button
                            onClick={onCancel}
                            className="shrink-0 text-slate-400 hover:text-white transition-colors text-xs font-bold"
                        >
                            취소
                        </button>
                    )}
                </div>
            </div>
        </>
    );
};
