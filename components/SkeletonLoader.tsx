
import React, { useState, useEffect } from 'react';
import { TEAM_DATA } from '../data/teamData';
import { SIDEBAR_ICON_COLORS } from '../utils/teamTheme';

const shimmerStyle: React.CSSProperties = {
    backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 60%, transparent 100%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.8s ease-in-out infinite',
};

const Bone: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style }) => (
    <div className={`bg-slate-800 rounded-lg ${className}`} style={{ ...shimmerStyle, ...style }} />
);

const ThemedBone: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style }) => (
    <div className={`rounded-lg ${className}`} style={{ ...shimmerStyle, backgroundColor: 'rgba(255,255,255,0.08)', ...style }} />
);

function getLastTeamData() {
    const teamId = localStorage.getItem('lastTeamId');
    if (!teamId) return null;
    const teamStatic = TEAM_DATA[teamId];
    if (!teamStatic) return null;
    return { teamId, teamStatic };
}

interface SkeletonLoaderProps {
    progress?: number; // 0~100
    message?: string;
}

const NAV_ICON_COUNT = 11;

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ progress = 0, message }) => {
    const data = getLastTeamData();
    const sidebarBg = data?.teamStatic?.colors?.primary ?? '#0f172a';
    const iconColor = data ? (SIDEBAR_ICON_COLORS[data.teamId] ?? 'rgba(255,255,255,0.35)') : 'rgba(255,255,255,0.35)';

    // 스켈레톤은 800ms 후에 페이드인 — 로더 shimmer가 먼저 안정된 뒤 표시
    const [showSkeleton, setShowSkeleton] = useState(false);
    useEffect(() => {
        const id = setTimeout(() => setShowSkeleton(true), 800);
        return () => clearTimeout(id);
    }, []);

    return (
        <>
            <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
            {/* 스켈레톤 UI — 800ms 후 페이드인 */}
            <div
                className="flex h-screen bg-slate-950 overflow-hidden text-slate-200"
                style={{ opacity: showSkeleton ? 1 : 0, transition: 'opacity 0.4s ease' }}
            >

                {/* Sidebar — w-20, 아이콘 전용 */}
                <aside
                    className="w-20 shrink-0 flex flex-col h-screen relative overflow-hidden"
                    style={{
                        backgroundColor: sidebarBg,
                        borderRight: '1px solid rgba(255,255,255,0.2)',
                    }}
                >
                    {/* 그라디언트 오버레이 */}
                    <div
                        className="absolute inset-0 pointer-events-none z-0"
                        style={{ background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.12) 100%)' }}
                    />

                    {/* Nav 아이콘 */}
                    <nav className="flex-1 flex flex-col gap-2 px-5 pt-4 pb-2 relative z-10">
                        {Array.from({ length: NAV_ICON_COUNT }).map((_, i) => (
                            <div
                                key={i}
                                className="w-full flex items-center justify-center p-2"
                            >
                                <div
                                    className="w-6 h-6 rounded"
                                    style={{ backgroundColor: iconColor, opacity: 0.3, ...shimmerStyle }}
                                />
                            </div>
                        ))}
                    </nav>

                    {/* 하단 프로필/설정 */}
                    <div
                        className="flex flex-col gap-6 px-5 py-6 shrink-0 relative z-10"
                        style={{ background: 'rgba(0,0,0,0.15)' }}
                    >
                        <div className="w-full flex items-center justify-center p-2">
                            <div className="w-6 h-6 rounded-full" style={{ backgroundColor: iconColor, opacity: 0.3, ...shimmerStyle }} />
                        </div>
                        <div className="w-full flex items-center justify-center p-2">
                            <div className="w-6 h-6 rounded" style={{ backgroundColor: iconColor, opacity: 0.3, ...shimmerStyle }} />
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 flex flex-col overflow-hidden relative">

                    {/* DashboardHeader 스켈레톤 — h-[100px] */}
                    <div
                        className="w-full flex items-center h-[100px] shrink-0 relative"
                        style={{ backgroundColor: '#0f172a', borderBottom: '2px solid #334155' }}
                    >
                        {/* 왼쪽: 팀 로고 + 팀명 */}
                        <div className="flex items-center gap-4 pl-8 flex-1 min-w-0">
                            <div className="w-[60px] h-[60px] rounded-full shrink-0" style={{ ...shimmerStyle, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                            <div className="flex flex-col gap-2">
                                <Bone className="h-6 w-44" />
                                <Bone className="h-4 w-28" />
                            </div>
                        </div>

                        {/* 가운데: 검색창 */}
                        <div className="absolute left-1/2 -translate-x-1/2">
                            <Bone className="h-10 w-64 !rounded-xl" />
                        </div>

                        {/* 오른쪽: 데이트 스키퍼 + 버튼 */}
                        <div className="flex items-center gap-3 pr-4 shrink-0">
                            <Bone className="h-[60px] w-[260px] !rounded-lg" />
                            <div className="flex flex-col gap-2">
                                <Bone className="h-9 w-[177px] !rounded-lg" />
                                <Bone className="h-6 w-[177px] !rounded" />
                            </div>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 p-8 space-y-6 overflow-hidden">
                        <Bone className="h-48 w-full !rounded-3xl" />
                        <div className="grid grid-cols-2 gap-6">
                            <Bone className="h-36 !rounded-3xl" />
                            <Bone className="h-36 !rounded-3xl" />
                        </div>
                    </div>

                </main>
            </div>

            {/* 배경 블러 오버레이 — 피그마: backdrop-blur-[6px] bg-[rgba(15,23,42,0.7)] */}
            <div className="fixed inset-0 z-40 backdrop-blur-[6px] bg-[rgba(15,23,42,0.7)]" />

            {/* Loading Banner — 피그마 LoadingIndicator (35px 단일 바) */}
            {/* bg: blue-gray/800 = #1e293b, shadow: /shadow/md */}
            <div
                className="fixed top-0 left-0 right-0 z-50 overflow-hidden shadow-[0px_4px_6px_-1px_rgba(0,0,0,0.1),0px_2px_4px_-1px_rgba(0,0,0,0.06)]"
                style={{ backgroundColor: '#1e293b', height: '35px' }}
            >
                {/* Layer 1: 에메랄드 프로그레스 바 (emerald/600 = #059669) */}
                <div
                    className="absolute left-0 top-0 h-full"
                    style={{
                        width: `${progress}%`,
                        backgroundColor: '#059669',
                        transition: 'width 0.3s ease',
                    }}
                />

                {/* Layer 2: 텍스처 shimmer 오버레이 */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 60%, transparent 100%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 1.8s ease-in-out infinite',
                    }}
                />

                {/* Layer 3: 텍스트 — left-[31px], Inter Bold 16px / lh 24px, gap 16px */}
                <div
                    className="absolute inset-0 flex items-center gap-[16px] whitespace-nowrap"
                    style={{ left: '31px' }}
                >
                    {/* 진행률 텍스트 */}
                    <span
                        className="font-bold text-white shrink-0"
                        style={{
                            fontFamily: "'Inter', 'Noto Sans KR', sans-serif",
                            fontSize: '16px',
                            lineHeight: '24px',
                            fontWeight: 700,
                        }}
                    >
                        로딩 중... {progress}%
                    </span>
                    {/* 메시지 텍스트 (Loading / Simulating 타입에서만 표시) */}
                    {message && (
                        <span
                            className="font-bold text-white shrink-0"
                            style={{
                                fontFamily: "'Inter', 'Noto Sans KR', sans-serif",
                                fontSize: '16px',
                                lineHeight: '24px',
                                fontWeight: 700,
                            }}
                        >
                            {message}
                        </span>
                    )}
                </div>
            </div>
        </>
    );
};

/** 컨텐츠 영역만의 스켈레톤 (Suspense fallback용) */
export const ContentSkeleton: React.FC = () => (
    <>
        <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
        <div className="flex-1 p-8 space-y-6">
            <Bone className="h-48 w-full !rounded-3xl" />
            <div className="grid grid-cols-2 gap-6">
                <Bone className="h-36 !rounded-3xl" />
                <Bone className="h-36 !rounded-3xl" />
            </div>
        </div>
    </>
);

export default SkeletonLoader;
