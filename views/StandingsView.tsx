
import React, { useState, useCallback, useMemo } from 'react';
import { Team } from '../types';
import { Loader2 } from 'lucide-react';

interface StandingsViewProps {
  teams: Team[];
  onTeamClick: (id: string) => void;
}

const DIVISION_KOREAN: Record<string, string> = {
  'Atlantic': '애틀랜틱 디비전',
  'Central': '센트럴 디비전',
  'Southeast': '사우스이스트 디비전',
  'Northwest': '노스웨스트 디비전',
  'Pacific': '퍼시픽 디비전',
  'Southwest': '사우스웨스트 디비전'
};

export const StandingsView: React.FC<StandingsViewProps> = ({ teams, onTeamClick }) => {
  const [mode, setMode] = useState<'Conference' | 'Division'>('Conference');

  const divisions = ['Atlantic', 'Central', 'Southeast', 'Northwest', 'Pacific', 'Southwest'];
  const conferences = ['East', 'West'];

  // Calculate Conference Ranks for Emoji Logic
  const confRankMap = useMemo(() => {
    const map: Record<string, number> = {};
    ['East', 'West'].forEach(conf => {
        const confTeams = teams.filter(t => t.conference === conf);
        const sorted = [...confTeams].sort((a, b) => {
            const aPct = (a.wins + a.losses === 0) ? 0 : a.wins / (a.wins + a.losses);
            const bPct = (b.wins + b.losses === 0) ? 0 : b.wins / (b.wins + b.losses);
            return bPct - aPct || b.wins - a.wins;
        });
        sorted.forEach((t, i) => map[t.id] = i + 1);
    });
    return map;
  }, [teams]);

  const getFilteredAndSortedTeams = useCallback((teamList: Team[]) => {
    if (!teamList || teamList.length === 0) return [];
    return [...teamList].sort((a, b) => {
      const aPct = (a.wins + a.losses === 0) ? 0 : a.wins / (a.wins + a.losses);
      const bPct = (b.wins + b.losses === 0) ? 0 : b.wins / (b.wins + b.losses);
      return bPct - aPct || b.wins - a.wins;
    });
  }, []);

  const calculateGB = (team: Team, leader: Team) => {
    if (!leader || !team || team.id === leader.id) return '-';
    return (((leader.wins - leader.losses) - (team.wins - team.losses)) / 2).toFixed(1);
  };

  const StandingTable: React.FC<{ teamList: Team[], title: string, isConference?: boolean, highlightColor?: string }> = ({ teamList, title, isConference = false, highlightColor = 'indigo' }) => {
    const sorted = getFilteredAndSortedTeams(teamList);
    const leader = sorted.length > 0 ? sorted[0] : null;
    
    return (
      // [Optimization] bg-slate-900/60 -> bg-slate-900/90
      <div className="bg-slate-900/90 rounded-[1.5rem] border border-slate-800 overflow-hidden shadow-xl flex flex-col">
        <div className="bg-slate-800/40 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
           <h3 className={`text-lg font-black oswald uppercase tracking-wider text-${highlightColor}-400`}>{title}</h3>
           <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{teamList.length} TEAMS</span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-800/50">
                <th className="pl-6 pr-2 py-3 w-12">#</th>
                <th className="px-2 py-3">Team</th>
                <th className="px-2 py-3 text-center w-10">W</th>
                <th className="px-2 py-3 text-center w-10">L</th>
                <th className="px-2 py-3 text-center w-16">PCT</th>
                <th className="pl-2 pr-6 py-3 text-center w-14">GB</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length > 0 ? sorted.map((t, i) => {
                let statusEmoji = null;
                if (mode === 'Division') {
                    const rank = confRankMap[t.id];
                    if (i === 0) statusEmoji = '🏆'; // Division Winner
                    else if (rank <= 6) statusEmoji = '🔒'; // Playoff Guaranteed
                    else if (rank <= 10) statusEmoji = '🎟️'; // Play-In
                    else statusEmoji = '❌'; // Eliminated
                }

                return (
                <React.Fragment key={t.id}>
                  <tr 
                    className={`
                      hover:bg-slate-800/20 transition-all border-b border-slate-800/30 group
                      ${isConference && i >= 0 && i <= 5 ? 'bg-indigo-900/10' : ''}
                      ${isConference && i >= 6 && i <= 9 ? 'bg-fuchsia-900/10' : ''}
                    `}
                  >
                    <td className="pl-6 pr-2 py-3 font-semibold text-slate-400 text-base group-hover:text-slate-100">{i + 1}</td>
                    <td className="px-2 py-3 cursor-pointer" onClick={() => onTeamClick(t.id)}>
                      <div className="flex items-center gap-2 max-w-[180px] group-hover:translate-x-1 transition-transform">
                        <img src={t.logo} className="w-6 h-6 object-contain" alt="" />
                        <span className="font-bold text-slate-100 text-sm truncate group-hover:text-indigo-400 transition-colors">{t.name}</span>
                        {statusEmoji && <span className="text-xs ml-1 filter drop-shadow-md select-none">{statusEmoji}</span>}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center font-semibold text-sm text-white">{t.wins}</td>
                    <td className="px-2 py-3 text-center font-semibold text-sm text-slate-500">{t.losses}</td>
                    <td className="px-2 py-3 text-center font-semibold text-slate-400 text-[11px]">{(t.wins + t.losses === 0 ? 0 : t.wins / (t.wins + t.losses)).toFixed(3).replace(/^0/, '')}</td>
                    <td className={`pl-2 pr-6 py-3 text-center font-semibold text-sm ${i === 0 ? 'text-slate-500' : `text-${highlightColor}-400/80`}`}>{leader ? calculateGB(t, leader) : '-'}</td>
                  </tr>
                  
                  {/* Playoff Guarantee Separator (Between 6th and 7th) */}
                  {isConference && i === 5 && (
                    <tr className="border-b border-slate-800/50">
                      <td colSpan={6} className="p-0">
                        <div className="flex items-center justify-center relative h-8 bg-slate-900/50">
                          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-slate-800"></div>
                          <span className="relative z-10 px-4 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-slate-950 border border-emerald-500/30 rounded-full shadow-sm">
                            Playoffs Guaranteed
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Play-In Cutoff Separator (Between 10th and 11th) */}
                  {isConference && i === 9 && (
                    <tr className="border-b border-slate-800/50">
                      <td colSpan={6} className="p-0">
                        <div className="flex items-center justify-center relative h-8 bg-slate-900/50">
                          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-slate-800"></div>
                          <span className="relative z-10 px-4 py-1 text-[10px] font-black uppercase tracking-widest text-amber-400 bg-slate-950 border border-amber-500/30 rounded-full shadow-sm">
                            Play-In Cutoff
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
              }) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-600 text-xs font-black uppercase tracking-widest">
                    No data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (!teams || teams.length === 0) return (
    <div className="flex h-[400px] items-center justify-center">
      <Loader2 size={40} className="text-indigo-500 animate-spin" />
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pretendard pb-12">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 border-b border-slate-800 pb-8">
        <div>
          <h2 className="text-5xl font-black ko-tight uppercase tracking-tight text-slate-100">리그 순위표</h2>
        </div>
        <div className="flex p-1 bg-slate-900 rounded-2xl border border-slate-800">
          {(['Conference', 'Division'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} className={`px-10 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${mode === m ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'text-slate-500 hover:text-slate-300'}`}>
              {m === 'Conference' ? '컨퍼런스 & 전체' : '디비전 상세'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'Conference' && (
        <div className="grid grid-cols-1 2xl:grid-cols-3 gap-8 items-start animate-in slide-in-from-bottom-4 duration-500">
          <div className="space-y-4">
            <div className="flex items-center gap-4 px-2">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Total League Rank</h4>
                <div className="h-[1px] flex-1 bg-gradient-to-r from-slate-800 to-transparent"></div>
            </div>
            <StandingTable teamList={teams} title="정규시즌 통합 순위" highlightColor="emerald" />
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4 px-2">
                <h4 className="text-[10px] font-black text-blue-500/50 uppercase tracking-[0.3em]">Eastern Conference</h4>
                <div className="h-[1px] flex-1 bg-gradient-to-r from-slate-800 to-transparent"></div>
            </div>
            <StandingTable 
              teamList={teams.filter(t => t.conference === 'East')} 
              title="동부 컨퍼런스" 
              isConference={true}
              highlightColor="blue"
            />
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4 px-2">
                <h4 className="text-[10px] font-black text-red-500/50 uppercase tracking-[0.3em]">Western Conference</h4>
                <div className="h-[1px] flex-1 bg-gradient-to-r from-slate-800 to-transparent"></div>
            </div>
            <StandingTable 
              teamList={teams.filter(t => t.conference === 'West')} 
              title="서부 컨퍼런스" 
              isConference={true}
              highlightColor="red"
            />
          </div>
        </div>
      )}

      {mode === 'Division' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 items-start animate-in slide-in-from-bottom-4 duration-500">
            {divisions.map(div => (
              <StandingTable 
                key={div} 
                teamList={teams.filter(t => t.division === div)} 
                title={DIVISION_KOREAN[div] || div} 
              />
            ))}
          </div>

          <div className="flex justify-center mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
            <div className="bg-slate-900/80 border border-slate-800 rounded-full px-8 py-3 flex flex-wrap items-center gap-6 lg:gap-8 shadow-xl backdrop-blur-sm">
                <div className="flex items-center gap-2">
                    <span className="text-sm filter drop-shadow-md">🏆</span>
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">디비전 우승</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm filter drop-shadow-md">🔒</span>
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">플레이오프 확정</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm filter drop-shadow-md">🎟️</span>
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">플레이인 진출</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm filter drop-shadow-md">❌</span>
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">시즌 탈락</span>
                </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
