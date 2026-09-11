
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, Loader2 } from 'lucide-react';
import { listLeaguesWithStats } from '../../services/multi/roomQueries';
import type { LeagueListEntry } from '../../services/multi/roomQueries';

interface MyLeaguesProps {
    userId: string;
}

const EnterButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button
        onClick={onClick}
        className="flex items-center gap-1 px-2.5 py-1.5 bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 rounded-lg text-xs font-bold text-white transition-all active:scale-[0.98] shrink-0"
    >
        <LogIn size={11} />
        <span className="ko-normal">입장하기</span>
    </button>
);

// 로그인한 유저가 이미 참가 중인 토너먼트/리그를 프로필 모듈 하단에 보여준다 — 우측
// InlineLeagueList(전체 목록)와 별개로, "내가 참여 중인 것"만 빠르게 골라 바로 입장할 수 있게 한다.
export const MyLeagues: React.FC<MyLeaguesProps> = ({ userId }) => {
    const navigate = useNavigate();
    const [entries,   setEntries]   = useState<LeagueListEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        listLeaguesWithStats(userId)
            .then(list => { if (!cancelled) setEntries(list.filter(e => e.isJoined)); })
            .finally(() => { if (!cancelled) setIsLoading(false); });
        return () => { cancelled = true; };
    }, [userId]);

    const enter = (leagueId: string, shortCode: string | null) => {
        navigate(`/multi/leagues/${shortCode ?? leagueId}/season`);
    };

    const tournaments = entries.filter(e => e.league.type === 'tournament');
    const leagues     = entries.filter(e => e.league.type === 'main_league');

    return (
        <div className="space-y-3">
            <p className="text-base font-bold text-white ko-tight">참여 중인 리그</p>

            {isLoading ? (
                <div className="flex justify-center py-4">
                    <Loader2 size={16} className="animate-spin text-slate-600" />
                </div>
            ) : entries.length === 0 ? (
                <p className="text-xs text-slate-500 ko-normal">참여 중인 세션이 없습니다.</p>
            ) : (
                <>
                    {tournaments.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">토너먼트</p>
                            <div className="divide-y divide-slate-700/50">
                                {tournaments.map(({ league }) => (
                                    <div key={league.id} className="flex items-center justify-between gap-2 py-2">
                                        <span className="text-sm font-bold text-white truncate">{league.name}</span>
                                        <EnterButton onClick={() => enter(league.id, league.short_code)} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {leagues.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">리그</p>
                            <div className="divide-y divide-slate-700/50">
                                {leagues.map(({ league }) => (
                                    <div key={league.id} className="flex items-center justify-between gap-2 py-2">
                                        <span className="text-sm font-bold text-white truncate">{league.name}</span>
                                        <EnterButton onClick={() => enter(league.id, league.short_code)} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
