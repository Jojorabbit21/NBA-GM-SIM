
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Trophy, ChevronRight, Plus } from 'lucide-react';
import { listOpenLeagues } from '../../../services/multi/roomQueries';
import type { LeagueRow } from '../../../services/multi/roomQueries';
import { useGame } from '../../../hooks/useGameContext';

import { TIER_LABEL, STATUS_LABEL } from './leagueConstants';

const LeagueListView: React.FC = () => {
    const navigate = useNavigate();
    const { session } = useGame();
    const [leagues,   setLeagues]   = useState<LeagueRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        listOpenLeagues()
            .then(setLeagues)
            .finally(() => setIsLoading(false));
    }, []);

    return (
        <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">

            {/* 헤더 */}
            <div className="space-y-1">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">멀티플레이</p>
                <h1 className="text-2xl font-black text-white ko-tight">리그 목록</h1>
            </div>

            {/* 리그 카드 목록 */}
            {isLoading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="rounded-2xl bg-slate-800/40 animate-pulse h-24" />
                    ))}
                </div>
            ) : leagues.length === 0 ? (
                <div className="rounded-2xl bg-slate-800/40 border border-slate-700/40 p-8 text-center">
                    <p className="text-slate-400 ko-normal text-sm">참가 가능한 리그가 없습니다.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {leagues.map(league => (
                        <button
                            key={league.id}
                            onClick={() => navigate(`/multi/leagues/${league.id}/lobby`)}
                            className="group w-full flex items-center gap-4 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/40 hover:border-slate-600/60 rounded-2xl px-5 py-4 text-left transition-all"
                        >
                            {/* 아이콘 */}
                            <div className="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center shrink-0">
                                {league.type === 'tournament'
                                    ? <Trophy size={18} className="text-indigo-400" />
                                    : <Users  size={18} className="text-indigo-400" />
                                }
                            </div>

                            {/* 정보 */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <p className="font-bold text-white text-sm truncate">{league.name}</p>
                                    {league.tier && (
                                        <span className="shrink-0 text-[10px] font-bold text-indigo-300 bg-indigo-500/20 px-1.5 py-0.5 rounded">
                                            {TIER_LABEL[league.tier] ?? league.tier}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-400 ko-normal mt-0.5">
                                    {STATUS_LABEL[league.status] ?? league.status}
                                    {' · '}시즌 {league.season_number}
                                    {' · '}최대 {league.max_teams}팀
                                </p>
                            </div>

                            <ChevronRight
                                size={16}
                                className="text-slate-500 group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all shrink-0"
                            />
                        </button>
                    ))}
                </div>
            )}

            {/* 관리자 전용: 리그 생성 (임시 노출) */}
            {session && (
                <button
                    onClick={() => {/* M2에서 구현 */}}
                    className="w-full flex items-center justify-center gap-2 border border-dashed border-slate-700 hover:border-slate-500 rounded-2xl py-4 text-sm text-slate-500 hover:text-slate-300 transition-colors"
                >
                    <Plus size={14} />
                    <span className="ko-normal">새 리그 만들기 (운영자)</span>
                </button>
            )}
        </div>
    );
};

export default LeagueListView;
