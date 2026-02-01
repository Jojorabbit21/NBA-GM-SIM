
import React, { useState, useMemo } from 'react';
import { Team } from '../types';
import { Loader2 } from 'lucide-react';
import { StandingTable } from '../components/standings/StandingTable';

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
            <StandingTable teamList={teams} title="정규시즌 통합 순위" highlightColor="emerald" onTeamClick={onTeamClick} />
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
              onTeamClick={onTeamClick}
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
              onTeamClick={onTeamClick}
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
                onTeamClick={onTeamClick}
                mode="Division"
                confRankMap={confRankMap}
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
