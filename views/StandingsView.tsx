
import React, { useState, useMemo } from 'react';
import { Team } from '../types';
import { Loader2, Trophy } from 'lucide-react';
import { StandingTable } from '../components/standings/StandingTable';
import { DIVISION_KOREAN } from '../data/mappings';
import { PageHeader } from '../components/common/PageHeader';

interface StandingsViewProps {
  teams: Team[];
  onTeamClick: (id: string) => void;
}

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
      <PageHeader 
        title="리그 순위표" 
        icon={<Trophy size={24} />}
        actions={
            <div className="flex p-1 bg-slate-900 rounded-2xl border border-slate-800">
                {(['Conference', 'Division'] as const).map(m => (
                    <button key={m} onClick={() => setMode(m)} className={`px-10 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${mode === m ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'text-slate-500 hover:text-slate-300'}`}>
                        {m === 'Conference' ? '컨퍼런스 & 전체' : '디비전 상세'}
                    </button>
                ))}
            </div>
        }
      />

      {mode === 'Conference' && (
        <div className="grid grid-cols-1 2xl:grid-cols-3 gap-8 items-start animate-in slide-in-from-bottom-4 duration-500">
          <StandingTable teamList={teams} title="정규시즌 통합 순위" highlightColor="emerald" onTeamClick={onTeamClick} />

          <StandingTable 
            teamList={teams.filter(t => t.conference === 'East')} 
            title="동부 컨퍼런스" 
            isConference={true}
            highlightColor="blue"
            onTeamClick={onTeamClick}
          />

          <StandingTable 
            teamList={teams.filter(t => t.conference === 'West')} 
            title="서부 컨퍼런스" 
            isConference={true}
            highlightColor="red"
            onTeamClick={onTeamClick}
          />
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
