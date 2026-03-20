
import React from 'react';
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
}

const NAV_ICON_COUNT = 11;

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ progress = 0 }) => {
    const data = getLastTeamData();
    const sidebarBg = data?.teamStatic?.colors?.primary ?? '#0f172a';
    const iconColor = data ? (SIDEBAR_ICON_COLORS[data.teamId] ?? 'rgba(255,255,255,0.35)') : 'rgba(255,255,255,0.35)';

    return (
        <>
            <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
            <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-200">

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

                    {/* Progress Modal */}
                    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
                        <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/50 rounded-3xl px-10 py-8 w-80 shadow-2xl pointer-events-auto">
                            <p className="text-sm font-bold text-slate-300 text-center mb-5 tracking-tight">
                                시뮬레이션 데이터 로딩 중 ...
                            </p>
                            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-emerald-500"
                                    style={{
                                        width: `${progress}%`,
                                        boxShadow: '0 0 12px rgba(16,185,129,0.4)',
                                    }}
                                />
                            </div>
                            <p className="text-xs font-bold text-slate-500 text-center mt-3">
                                {progress}%
                            </p>
                        </div>
                    </div>
                </main>
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
