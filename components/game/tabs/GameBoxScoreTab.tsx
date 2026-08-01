
import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { Team, PlayerBoxScore, Game } from '../../../types';
import { BoxScoreTable, GameStatLeaders } from '../BoxScoreTable';

interface GameBoxScoreTabProps {
    homeTeam: Team;
    awayTeam: Team;
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
    mvpId: string;
    leaders: GameStatLeaders;
    otherGames?: Game[];
    teams: Team[]; // For looking up other games' team logos
    onSelectGame?: (gameId: string) => void; // [New]
    /** 제공되면 원형 로고 대신 사각형 색상 배지 렌더링(멀티플레이어 전용 스타일) */
    homeBadge?: { color: string; abbr: string };
    awayBadge?: { color: string; abbr: string };
    /** true면 두 팀 테이블을 상하 대신 좌우로 분할 배치(멀티플레이어 전용, 기본값 false=기존 상하 배치 유지) */
    splitLayout?: boolean;
}

export const GameBoxScoreTab: React.FC<GameBoxScoreTabProps> = ({
    homeTeam, awayTeam, homeBox, awayBox, mvpId, leaders, otherGames, teams, onSelectGame, homeBadge, awayBadge, splitLayout
}) => {
    
    const getTeamInfo = (id: string) => teams.find(t => t.id === id);

    // Filter out players who didn't play (DNP)
    const activeHomeBox = useMemo(() => homeBox.filter(p => p.mp > 0), [homeBox]);
    const activeAwayBox = useMemo(() => awayBox.filter(p => p.mp > 0), [awayBox]);

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Box Scores Container - 기본은 상하 배치, splitLayout이면 좌우 분할(각자 독립 가로 스크롤,
                컨테이너 해체 — 갭 없이 바디를 꽉 채움) */}
            <div className={splitLayout
                ? "grid grid-cols-1 lg:grid-cols-2 gap-0"
                : "flex flex-col gap-0"
            }>
                {/* Away Team Box Score */}
                <div className={splitLayout ? "overflow-x-auto" : undefined}>
                    <BoxScoreTable
                        team={awayTeam}
                        box={activeAwayBox}
                        isFirst
                        mvpId={mvpId}
                        leaders={leaders}
                        badge={awayBadge}
                        standalone={splitLayout}
                    />
                </div>

                {/* Home Team Box Score */}
                <div className={splitLayout ? "overflow-x-auto" : undefined}>
                    <BoxScoreTable
                        team={homeTeam}
                        box={activeHomeBox}
                        mvpId={mvpId}
                        leaders={leaders}
                        badge={homeBadge}
                        standalone={splitLayout}
                    />
                </div>
            </div>
            
            {/* Around the League */}
            {otherGames && otherGames.length > 0 && (
                <div className="mt-8 pt-8 border-t border-slate-800/50">
                    <h3 className="text-sm font-black uppercase text-slate-500 tracking-widest mb-4 flex items-center gap-2">
                        <Activity size={16} /> 타구장 경기 결과
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {otherGames.map(g => {
                            const h = getTeamInfo(g.homeTeamId);
                            const a = getTeamInfo(g.awayTeamId);
                            if (!h || !a) return null;
                            
                            const hScore = g.homeScore || 0;
                            const aScore = g.awayScore || 0;
                            const hWin = hScore > aScore;
                            
                            return (
                                <button 
                                    key={g.id} 
                                    onClick={() => onSelectGame && onSelectGame(g.id)}
                                    className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 flex flex-col gap-2 hover:bg-slate-800 transition-all hover:border-slate-600 cursor-pointer active:scale-95 group"
                                >
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <img src={a.logo} className="w-5 h-5 object-contain opacity-80" alt="" />
                                            <span className={`text-xs font-bold uppercase group-hover:text-white transition-colors ${!hWin ? 'text-white' : 'text-slate-500'}`}>{a.name}</span>
                                        </div>
                                        <span className={`text-sm font-black ${!hWin ? 'text-emerald-400' : 'text-slate-600'}`}>{aScore}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <img src={h.logo} className="w-5 h-5 object-contain opacity-80" alt="" />
                                            <span className={`text-xs font-bold uppercase group-hover:text-white transition-colors ${hWin ? 'text-white' : 'text-slate-500'}`}>{h.name}</span>
                                        </div>
                                        <span className={`text-sm font-black ${hWin ? 'text-emerald-400' : 'text-slate-600'}`}>{hScore}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
