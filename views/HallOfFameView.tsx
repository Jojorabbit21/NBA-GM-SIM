
import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Crown, Eye, Loader2 } from 'lucide-react';
import { fetchHallOfFameEntries, HallOfFameEntry } from '../services/hallOfFameService';
import { RosterSnapshotPlayer } from '../utils/hallOfFameScorer';
import { TeamLogo } from '../components/common/TeamLogo';
import { OvrBadge } from '../components/common/OvrBadge';
import { Modal } from '../components/common/Modal';
import { TEAM_DATA } from '../data/teamData';

interface HallOfFameViewProps {
    currentUserId?: string;
    onBack: () => void;
}

// --- Playoff tier → 한국어 텍스트 ---
const PLAYOFF_TEXT: Record<string, string> = {
    'BPL CHAMPIONS':        '파이널 우승',
    'BPL Finalist':         '파이널 준우승',
    'Conference Finalist':  '컨퍼런스 파이널 탈락',
    'Semi-Finalist':        '세미파이널 탈락',
    'Playoff Participant':  '1라운드 탈락',
    'Playoff Qualification':'플레이인 탈락',
};

// --- Rank decoration ---
function getRankStyle(rank: number): { color: string; icon?: React.ReactNode } {
    if (rank === 1) return { color: 'text-amber-400', icon: <Crown size={16} className="text-amber-400 fill-amber-400" /> };
    if (rank === 2) return { color: 'text-slate-300' };
    if (rank === 3) return { color: 'text-amber-700' };
    return { color: 'text-slate-500' };
}

export const HallOfFameView: React.FC<HallOfFameViewProps> = ({ currentUserId, onBack }) => {
    const [entries, setEntries] = useState<HallOfFameEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [rosterModal, setRosterModal] = useState<{ entry: HallOfFameEntry } | null>(null);

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        fetchHallOfFameEntries().then(data => {
            if (!cancelled) {
                setEntries(data);
                setIsLoading(false);
            }
        });
        return () => { cancelled = true; };
    }, []);

    const rosterSnapshot = useMemo(() => {
        if (!rosterModal) return [];
        return (rosterModal.entry.roster_snapshot as RosterSnapshotPlayer[]).sort((a, b) => b.ovr - a.ovr);
    }, [rosterModal]);

    return (
        <div className="h-screen overflow-y-auto bg-slate-950 custom-scrollbar animate-in fade-in duration-500">
            <div className="grid grid-cols-12 min-h-full">
                {/* 좌측 빈 영역 */}
                <div className="col-span-3" />

                {/* 중앙 콘텐츠 */}
                <div className="col-span-6 bg-slate-900 py-12 space-y-8">
                    {/* Header */}
                    <div className="flex items-center gap-4 px-6">
                        <button
                            onClick={onBack}
                            className="p-2.5 rounded-2xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all active:scale-95"
                        >
                            <ArrowLeft size={22} />
                        </button>
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">2025-26 시즌</p>
                            <h1 className="text-3xl font-black text-white ko-tight">명예의 전당</h1>
                        </div>
                    </div>

                    {/* Loading */}
                    {isLoading && (
                        <div className="flex items-center justify-center py-32">
                            <Loader2 size={32} className="text-indigo-400 animate-spin" />
                        </div>
                    )}

                    {/* Empty State */}
                    {!isLoading && entries.length === 0 && (
                        <div className="text-center py-32">
                            <p className="text-lg font-bold text-slate-500 ko-tight">아직 등록된 기록이 없습니다</p>
                            <p className="text-sm text-slate-600 mt-2 ko-normal">시즌과 플레이오프를 완주한 후 기록을 제출해보세요</p>
                        </div>
                    )}

                    {/* Rankings Table */}
                    {!isLoading && entries.length > 0 && (
                        <div className="border-t border-slate-800 overflow-hidden">
                            {/* Table Header */}
                            <div className="grid grid-cols-[56px_1fr_1fr_100px_140px_160px_80px] px-6 py-3 border-b border-slate-800 bg-slate-950">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">#</span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Team</span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">GM</span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Score</span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Record</span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Playoffs</span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">로스터</span>
                            </div>

                            {/* Table Body */}
                            {entries.map((entry, idx) => {
                                const rank = idx + 1;
                                const rankStyle = getRankStyle(rank);
                                const isMe = entry.user_id === currentUserId;
                                const teamStatic = TEAM_DATA[entry.team_id];
                                const teamName = teamStatic ? `${teamStatic.city} ${teamStatic.name}` : entry.team_id.toUpperCase();
                                const playoffTier = entry.score_breakdown?.details?.playoff_tier || 'Playoff Qualification';
                                const playoffLabel = PLAYOFF_TEXT[playoffTier] || playoffTier;
                                const wins = entry.score_breakdown?.details?.wins ?? 0;
                                const losses = entry.score_breakdown?.details?.losses ?? 0;
                                const leagueRank = entry.score_breakdown?.details?.league_rank ?? 0;

                                return (
                                    <div
                                        key={entry.id}
                                        className={`grid grid-cols-[56px_1fr_1fr_100px_140px_160px_80px] px-6 py-4 items-center border-b border-slate-800/50 transition-colors ${
                                            isMe
                                                ? 'bg-indigo-500/10'
                                                : rank === 1
                                                    ? 'bg-amber-500/5'
                                                    : 'hover:bg-slate-800/50'
                                        }`}
                                    >
                                        {/* Rank */}
                                        <div className="flex items-center gap-1.5">
                                            {rankStyle.icon}
                                            <span className={`text-base font-black oswald ${rankStyle.color}`}>{rank}</span>
                                        </div>

                                        {/* Team */}
                                        <div className="flex items-center gap-3 min-w-0">
                                            <TeamLogo teamId={entry.team_id} size="sm" />
                                            <span className="text-base font-bold text-white truncate ko-tight">{teamName}</span>
                                        </div>

                                        {/* GM */}
                                        <div className="flex items-center min-w-0">
                                            <span className={`text-base truncate ${isMe ? 'font-bold text-indigo-300' : 'text-slate-400'}`}>
                                                {isMe ? '나' : (entry.user_email || '익명')}
                                            </span>
                                        </div>

                                        {/* Score */}
                                        <div className="text-center">
                                            <span className={`text-base font-black oswald ${rank <= 3 ? 'text-white' : 'text-slate-200'}`}>
                                                {entry.total_score}
                                            </span>
                                        </div>

                                        {/* Record */}
                                        <div className="text-center">
                                            <span className="text-base font-bold text-slate-300 tabular-nums">
                                                #{leagueRank} ({wins}-{losses})
                                            </span>
                                        </div>

                                        {/* Playoffs */}
                                        <div className="text-center">
                                            <span className="text-base font-bold text-slate-300">{playoffLabel}</span>
                                        </div>

                                        {/* Roster */}
                                        <div className="text-center">
                                            <button
                                                onClick={() => setRosterModal({ entry })}
                                                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition-all active:scale-95"
                                                title="로스터 보기"
                                            >
                                                <Eye size={16} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* 우측 빈 영역 */}
                <div className="col-span-3" />
            </div>

            {/* Roster Modal */}
            <Modal
                isOpen={!!rosterModal}
                onClose={() => setRosterModal(null)}
                size="lg"
                title={
                    rosterModal && (
                        <div className="flex items-center gap-3">
                            <TeamLogo teamId={rosterModal.entry.team_id} size="sm" />
                            <span className="font-black text-white oswald uppercase tracking-wide">
                                {TEAM_DATA[rosterModal.entry.team_id]?.name || rosterModal.entry.team_id} 로스터
                            </span>
                            <span className="ml-3 text-sm font-bold text-slate-400">
                                Score: {rosterModal.entry.total_score}
                            </span>
                            <span className="text-sm font-bold text-slate-500 font-mono">
                                {rosterModal.entry.score_breakdown?.details?.wins}-{rosterModal.entry.score_breakdown?.details?.losses}
                            </span>
                        </div>
                    )
                }
            >
                <div className="p-6">
                    {/* Roster Table */}
                    <div className="space-y-0">
                        {/* Header */}
                        <div className="grid grid-cols-[40px_1fr_60px_60px_80px_80px_80px] px-4 py-2 border-b border-slate-800">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">#</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Name</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Pos</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">OVR</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">PPG</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">RPG</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">APG</span>
                        </div>

                        {/* Rows */}
                        {rosterSnapshot.map((p, idx) => (
                            <div
                                key={p.id}
                                className="grid grid-cols-[40px_1fr_60px_60px_80px_80px_80px] px-4 py-3 items-center border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                            >
                                <span className="text-xs font-bold text-slate-600">{idx + 1}</span>
                                <span className="text-sm font-bold text-white truncate">{p.name}</span>
                                <span className="text-xs font-bold text-slate-400 text-center uppercase">{p.position}</span>
                                <div className="flex justify-center">
                                    <OvrBadge value={p.ovr} size="sm" />
                                </div>
                                <span className="text-sm font-bold text-slate-200 text-center font-mono tabular-nums">{p.stats.ppg}</span>
                                <span className="text-sm font-bold text-slate-200 text-center font-mono tabular-nums">{p.stats.rpg}</span>
                                <span className="text-sm font-bold text-slate-200 text-center font-mono tabular-nums">{p.stats.apg}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </Modal>
        </div>
    );
};
