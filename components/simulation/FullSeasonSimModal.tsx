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
        {/* 배경 블러 오버레이 — 클릭 차단 */}
        <div className="fixed inset-0 z-[1999] backdrop-blur-[3px] bg-slate-950/50" />

        <div
            className="fixed top-0 left-0 right-0 z-[2000] overflow-hidden shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-1px_rgba(0,0,0,0.06)]"
            style={{ backgroundColor: '#1e293b', height: '35px' }}
        >
            {/* 에메랄드 프로그레스 바 */}
            <div
                className="absolute left-0 top-0 h-full"
                style={{
                    width: `${pct}%`,
                    backgroundColor: '#059669',
                    transition: 'width 0.3s ease',
                }}
            />

            {/* shimmer 오버레이 */}
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
                <span
                    className="font-bold text-white shrink-0 whitespace-nowrap"
                    style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif", fontSize: '16px', lineHeight: '24px' }}
                >
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
