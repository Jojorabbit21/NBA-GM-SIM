
import React from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import type { SaveSummary, OffseasonPhase } from '../../types/app';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

interface SingleSaveCardProps {
    summary:   SaveSummary | null;
    teamName?: string;
    teamLogo?: string;
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
    // 세이브 없음 — 신규 유저
    if (!summary) {
        return (
            <button
                onClick={onNewGame}
                className="group w-72 bg-indigo-500/8 border border-indigo-500/30 rounded-3xl p-8 text-left transition-all hover:bg-indigo-500/15 hover:border-indigo-500/50 hover:shadow-[0_0_40px_rgba(99,102,241,0.15)] active:scale-[0.98] shrink-0"
            >
                <div className="space-y-4">
                    <div className="w-12 h-12 rounded-full border-2 border-dashed border-indigo-500/40 flex items-center justify-center group-hover:border-indigo-400/60 transition-colors">
                        <Plus size={22} className="text-indigo-500/60 group-hover:text-indigo-400 transition-colors" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-indigo-300 ko-tight">새 시즌 시작</h2>
                        <p className="text-xs text-slate-400 mt-1.5 leading-relaxed ko-normal">
                            단장이 되어 구단을 운영하고
                            <br />
                            첫 챔피언십을 향해 나아가세요.
                        </p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity pt-1">
                        시작하기 <ChevronRight size={14} />
                    </div>
                </div>
            </button>
        );
    }

    // 세이브 있음 — 기존 유저
    const seasonLabel = summary.currentSeason
        ? `${summary.currentSeason} · Y${summary.seasonNumber}`
        : `Season ${summary.seasonNumber}`;

    return (
        <button
            onClick={onContinue}
            className="group w-72 bg-indigo-500/8 border border-indigo-500/30 rounded-3xl p-8 text-left transition-all hover:bg-indigo-500/15 hover:border-indigo-500/50 hover:shadow-[0_0_40px_rgba(99,102,241,0.15)] active:scale-[0.98] shrink-0"
        >
            <div className="space-y-4">
                {/* 팀 로고 */}
                <div className="w-12 h-12">
                    {teamLogo ? (
                        <img src={teamLogo} alt={teamName ?? ''} className="w-full h-full object-contain" />
                    ) : (
                        <div className="w-full h-full rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 text-lg font-black">
                            {(teamName ?? '?')[0]}
                        </div>
                    )}
                </div>

                {/* 팀 이름 + 시즌 */}
                <div>
                    <h2 className="text-base font-black text-white ko-tight leading-tight">
                        {teamName ?? '내 구단'}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">{seasonLabel}</p>
                </div>

                {/* 구분선 + W-L + 컨텍스트 */}
                <div className="border-t border-slate-700/50 pt-3 space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-white tabular-nums">
                            {summary.wins} - {summary.losses}
                        </span>
                        <span className="text-xs text-slate-400 ko-normal">{phaseLabel(summary.offseasonPhase)}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 ko-normal">
                        {formatRelativeTime(summary.updatedAt)} 저장됨
                    </p>
                </div>

                {/* Continue 화살표 */}
                <div className="flex items-center gap-1 text-xs text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    이어하기 <ChevronRight size={14} />
                </div>
            </div>
        </button>
    );
};
