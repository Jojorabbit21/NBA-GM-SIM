
import React from 'react';
import { TEAM_DATA } from '../data/teamData';
import { getTeamTheme } from '../utils/teamTheme';

const shimmerStyle: React.CSSProperties = {
    backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 60%, transparent 100%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.8s ease-in-out infinite',
};

const Bone: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style }) => (
    <div className={`bg-slate-800 rounded-lg ${className}`} style={{ ...shimmerStyle, ...style }} />
);

/** Bone variant that blends with a colored background */
const ThemedBone: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style }) => (
    <div className={`rounded-lg ${className}`} style={{ ...shimmerStyle, backgroundColor: 'rgba(255,255,255,0.08)', ...style }} />
);

function getLastTeamTheme() {
    const teamId = localStorage.getItem('lastTeamId');
    if (!teamId) return null;
    const teamStatic = TEAM_DATA[teamId];
    if (!teamStatic) return null;
    return getTeamTheme(teamId, teamStatic.colors);
}

interface SkeletonLoaderProps {
    progress?: number; // 0~100
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ progress = 0 }) => {
    const theme = getLastTeamTheme();

    return (
        <>
            <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
            <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-200">
                {/* Sidebar */}
                <aside className="w-72 border-r border-white/10 flex flex-col" style={{ backgroundColor: theme?.bg ?? '#0f172a' }}>
                    {/* Profile */}
                    <div className="px-6 py-3 border-b border-white/10 flex items-center gap-3 bg-black/10">
                        <div className="w-8 h-8 rounded-lg" style={{ ...shimmerStyle, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                        <ThemedBone className="h-3 w-28" />
                    </div>

                    {/* Team Profile */}
                    <div className="p-8 border-b border-white/10 flex items-center gap-5 bg-black/10">
                        <div className="w-16 h-16 rounded-full shrink-0" style={{ ...shimmerStyle, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                        <div className="space-y-2.5 flex-1">
                            <ThemedBone className="h-6 w-32" />
                            <ThemedBone className="h-3 w-20" />
                        </div>
                    </div>

                    {/* Nav Items */}
                    <nav className="flex-1 p-6 space-y-1.5">
                        {[140, 120, 100, 130, 90, 110, 120].map((w, i) => (
                            <div key={i} className="flex items-center gap-4 px-5 py-4">
                                <div className="w-5 h-5 rounded shrink-0" style={{ ...shimmerStyle, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                                <ThemedBone className="h-3.5" style={{ width: w }} />
                            </div>
                        ))}
                    </nav>

                    {/* Collapse Toggle */}
                    <div className="p-4 border-t border-white/10">
                        <div className="flex items-center gap-3 px-4 py-2.5">
                            <div className="w-5 h-5 rounded shrink-0" style={{ ...shimmerStyle, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                            <ThemedBone className="h-3 w-8" />
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 flex flex-col overflow-hidden relative">
                    {/* Header */}
                    <div
                        className="w-full border-b border-white/5 px-8 py-3 flex items-center gap-8 h-20 relative overflow-hidden"
                        style={{ backgroundColor: theme?.bg ?? 'rgba(15,23,42,0.5)' }}
                    >
                        <div className="absolute inset-0 bg-black/10 pointer-events-none" />
                        {/* Date + Status */}
                        <div className="flex-1 flex flex-col gap-2 relative z-10">
                            <ThemedBone className="h-3.5 w-36" />
                            <ThemedBone className="h-3.5 w-24" />
                        </div>

                        {/* Matchup */}
                        <div className="flex items-center gap-8 shrink-0 relative z-10">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full" style={{ ...shimmerStyle, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                                <div className="hidden sm:flex flex-col gap-1.5">
                                    <ThemedBone className="h-3 w-16" />
                                    <ThemedBone className="h-2.5 w-12" />
                                </div>
                                <ThemedBone className="!w-7 !h-7 !rounded-lg" />
                            </div>

                            <div className="flex flex-col items-center px-4 border-x border-white/5 min-w-[160px] gap-1.5">
                                <ThemedBone className="h-3 w-16" />
                                <ThemedBone className="h-3.5 w-24" />
                            </div>

                            <div className="flex items-center gap-3">
                                <ThemedBone className="!w-7 !h-7 !rounded-lg" />
                                <div className="hidden sm:flex flex-col items-end gap-1.5">
                                    <ThemedBone className="h-3 w-16" />
                                    <ThemedBone className="h-2.5 w-12" />
                                </div>
                                <div className="w-10 h-10 rounded-full" style={{ ...shimmerStyle, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                            </div>
                        </div>

                        {/* Right Buttons */}
                        <div className="flex-1 flex items-center justify-end gap-3 relative z-10">
                            <ThemedBone className="h-10 w-[180px] !rounded-xl" />
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 p-8 lg:p-12 space-y-6 overflow-hidden">
                        <Bone className="h-48 w-full !rounded-3xl" />
                        <div className="grid grid-cols-2 gap-6">
                            <Bone className="h-36 !rounded-3xl" />
                            <Bone className="h-36 !rounded-3xl" />
                        </div>
                    </div>

                    {/* Progress Modal — centered on viewport */}
                    <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
                        <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/50 rounded-3xl px-10 py-8 w-80 shadow-2xl pointer-events-auto">
                            <p className="text-sm font-bold text-slate-300 text-center mb-5 tracking-tight">
                                시뮬레이션 데이터 로딩 중 ...
                            </p>
                            {/* Progress Bar */}
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

/** 컨텐츠 영역만의 스켈레톤 (Suspense fallback용 — 사이드바/헤더는 이미 렌더링된 상태) */
export const ContentSkeleton: React.FC = () => (
    <>
        <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
        <div className="flex-1 p-8 lg:p-12 space-y-6">
            <Bone className="h-48 w-full !rounded-3xl" />
            <div className="grid grid-cols-2 gap-6">
                <Bone className="h-36 !rounded-3xl" />
                <Bone className="h-36 !rounded-3xl" />
            </div>
        </div>
    </>
);

export default SkeletonLoader;
