
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Loader2, AlertCircle } from 'lucide-react';
import { useCurrentLeague } from '../../../hooks/useCurrentLeague';
import { joinLeague } from '../../../services/multi/leagueService';
import { useGame } from '../../../hooks/useGameContext';

import { TIER_LABEL } from './leagueConstants';

const LeagueLobbyView: React.FC = () => {
    const navigate     = useNavigate();
    const { session }  = useGame();
    const { league, room, members, isLoading, error, reload } = useCurrentLeague();

    const [joining,   setJoining]   = React.useState(false);
    const [joinError, setJoinError] = React.useState<string | null>(null);

    const userId   = session?.user?.id ?? null;
    const isMember = members.some(m => m.user_id === userId);

    const handleJoin = async () => {
        if (!league || !userId) return;
        setJoining(true);
        setJoinError(null);
        const { error: err } = await joinLeague(league.id, userId);
        setJoining(false);
        if (err) { setJoinError(err); return; }
        reload();
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 size={24} className="animate-spin text-indigo-400" />
            </div>
        );
    }

    if (error || !league) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-3">
                <AlertCircle size={24} className="text-red-400" />
                <p className="text-slate-400 text-sm ko-normal">{error ?? '리그를 불러올 수 없습니다.'}</p>
                <button onClick={() => navigate('/multi')} className="text-indigo-400 text-sm hover:underline">
                    리그 목록으로 돌아가기
                </button>
            </div>
        );
    }

    const memberCount = room?.max_players ?? league.max_teams;
    const joinedCount = members.length;

    return (
        <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">

            {/* 뒤로가기 */}
            <button
                onClick={() => navigate('/multi')}
                className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
            >
                <ArrowLeft size={14} />
                <span className="ko-normal">리그 목록</span>
            </button>

            {/* 리그 헤더 */}
            <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl px-6 py-5 space-y-2">
                <div className="flex items-center gap-2">
                    <h1 className="text-xl font-black text-white ko-tight">{league.name}</h1>
                    {league.tier && (
                        <span className="text-[10px] font-bold text-indigo-300 bg-indigo-500/20 px-1.5 py-0.5 rounded">
                            {TIER_LABEL[league.tier] ?? league.tier}
                        </span>
                    )}
                </div>
                <p className="text-sm text-slate-400 ko-normal">
                    시즌 {league.season_number} · 최대 {league.max_teams}팀
                </p>

                {/* 참가 현황 바 */}
                <div className="mt-3">
                    <div className="flex justify-between text-xs text-slate-500 mb-1 ko-normal">
                        <span>참가 현황</span>
                        <span>{joinedCount} / {memberCount}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
                        <div
                            className="h-full bg-indigo-500 rounded-full transition-all"
                            style={{ width: `${(joinedCount / memberCount) * 100}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* 참가 버튼 */}
            {!isMember ? (
                <div className="space-y-2">
                    {joinError && (
                        <p className="text-red-400 text-xs ko-normal">{joinError}</p>
                    )}
                    <button
                        onClick={handleJoin}
                        disabled={joining || league.status !== 'recruiting'}
                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl py-3 text-sm font-bold text-white transition-colors"
                    >
                        {joining
                            ? <><Loader2 size={14} className="animate-spin" /> 참가 중…</>
                            : <><Users size={14} /> 리그 참가하기</>
                        }
                    </button>
                </div>
            ) : (
                <div className="bg-indigo-600/10 border border-indigo-500/30 rounded-xl px-4 py-3 text-sm text-indigo-300 ko-normal text-center">
                    참가 완료 — 드래프트 시작을 기다리는 중입니다.
                </div>
            )}

            {/* 참가자 목록 */}
            <div className="space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">참가자</p>
                {members.length === 0 ? (
                    <p className="text-sm text-slate-500 ko-normal">아직 참가자가 없습니다.</p>
                ) : (
                    <div className="space-y-2">
                        {members.map(m => (
                            <div
                                key={m.user_id}
                                className="flex items-center gap-3 bg-slate-800/40 rounded-xl px-4 py-2.5"
                            >
                                <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                                    {m.is_ai ? 'AI' : m.user_id.slice(0, 2).toUpperCase()}
                                </div>
                                <span className="text-sm text-slate-300 ko-normal">
                                    {m.is_ai ? `AI GM` : m.team_id ?? '팀 미배정'}
                                </span>
                                {m.user_id === userId && (
                                    <span className="ml-auto text-[10px] font-bold text-indigo-400 bg-indigo-500/20 px-1.5 py-0.5 rounded">나</span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default LeagueLobbyView;
