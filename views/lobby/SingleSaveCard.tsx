
import React from 'react';
import { ChevronRight, Plus, Play } from 'lucide-react';
import type { SaveSummary, OffseasonPhase } from '../../types/app';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

interface SingleSaveCardProps {
    summary:    SaveSummary | null;
    teamName?:  string;
    teamLogo?:  string;
    onContinue: () => void;
    onNewGame:  () => void;
}

function phaseLabel(phase: OffseasonPhase): string {
    if (phase === null)           return '정규시즌';
    if (phase === 'POST_FINALS')  return '오프시즌';
    if (phase === 'POST_LOTTERY') return '드래프트 준비';
    if (phase === 'POST_DRAFT')   return 'FA 개장 전';
    if (phase === 'FA_OPEN')      return 'FA 시장';
    if (phase === 'PRE_SEASON')   return '프리시즌';
    return '진행 중';
}

export const SingleSaveCard: React.FC<SingleSaveCardProps> = ({
    summary, teamName, teamLogo, onContinue, onNewGame,
}) => {
    // ── 신규 유저 ─────────────────────────────────────────
    if (!summary) {
        return (
            <button
                onClick={onNewGame}
                className="group relative overflow-hidden rounded-2xl p-6 text-left transition-all active:scale-[0.98] bg-gradient-to-br from-indigo-600 to-violet-700 hover:from-indigo-500 hover:to-violet-600 shadow-lg hover:shadow-indigo-500/30"
            >
                {/* 배경 glow */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.08),transparent_60%)]" />

                <div className="relative space-y-4">
                    {/* 라벨 */}
                    <p className="text-xs font-bold text-indigo-200 uppercase tracking-wider">싱글플레이</p>

                    {/* 아이콘 */}
                    <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center">
                        <Plus size={22} className="text-white" />
                    </div>

                    {/* 타이틀 */}
                    <div>
                        <h2 className="text-xl font-black text-white ko-tight">새 시즌 시작</h2>
                        <p className="text-sm text-indigo-200 mt-1 ko-normal leading-relaxed">
                            단장이 되어 구단을 운영하고<br />
                            챔피언십을 향해 나아가세요.
                        </p>
                    </div>

                    {/* CTA */}
                    <div className="flex items-center gap-2 text-sm font-bold text-white mt-2">
                        시작하기
                        <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                </div>
            </button>
        );
    }

    // ── 기존 유저 ─────────────────────────────────────────
    const seasonLabel = summary.currentSeason
        ? `${summary.currentSeason} · Y${summary.seasonNumber}`
        : `Season ${summary.seasonNumber}`;

    return (
        <button
            onClick={onContinue}
            className="group relative overflow-hidden rounded-2xl p-6 text-left transition-all active:scale-[0.98] bg-gradient-to-br from-indigo-600 to-violet-700 hover:from-indigo-500 hover:to-violet-600 shadow-lg hover:shadow-indigo-500/30"
        >
            {/* 배경 glow */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.08),transparent_60%)]" />

            <div className="relative space-y-4">
                {/* 라벨 */}
                <p className="text-xs font-bold text-indigo-200 uppercase tracking-wider">싱글플레이</p>

                {/* 팀 로고 */}
                <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center overflow-hidden">
                    {teamLogo ? (
                        <img src={teamLogo} alt={teamName ?? ''} className="w-10 h-10 object-contain" />
                    ) : (
                        <span className="text-white text-lg font-black">{(teamName ?? '?')[0]}</span>
                    )}
                </div>

                {/* 팀 이름 + 시즌 */}
                <div>
                    <h2 className="text-xl font-black text-white ko-tight leading-tight">
                        {teamName ?? '내 구단'}
                    </h2>
                    <p className="text-xs text-indigo-200 mt-0.5">{seasonLabel}</p>
                </div>

                {/* W-L + 컨텍스트 */}
                <div className="flex items-center gap-3 bg-black/20 rounded-xl px-3 py-2">
                    <span className="text-lg font-black text-white tabular-nums">
                        {summary.wins} - {summary.losses}
                    </span>
                    <span className="text-xs text-indigo-200 ko-normal">{phaseLabel(summary.offseasonPhase)}</span>
                    <span className="ml-auto text-[10px] text-indigo-300/70 ko-normal">
                        {formatRelativeTime(summary.updatedAt)} 저장
                    </span>
                </div>

                {/* CTA */}
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Play size={14} fill="white" />
                    이어하기
                    <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
            </div>
        </button>
    );
};
