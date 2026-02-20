
import React, { useState, useMemo } from 'react';
import { Team } from '../types';
import { Loader2, Trophy } from 'lucide-react';
import { StandingTable } from '../components/simulation/StandingTable';
import { DIVISION_KOREAN } from '../data/mappings';
import { PageHeader } from '../components/common/PageHeader';

interface StandingsViewProps {
  teams: Team[];
  onTeamClick: (id: string) => void;
}

export const StandingsView: React.FC<StandingsViewProps> = ({ teams, onTeamClick }) => {
  const [mode, setMode] = useState<'Conference' | 'Division'>('Conference');

  const divisions = ['Atlantic', 'Central', 'Southeast', 'Northwest', 'Pacific', 'Southwest'];
  
  // Calculate Playoff Status
  const teamStatusMap = useMemo(() => {
    const map: Record<string, 'clinched_playoff' | 'clinched_playin' | 'eliminated' | null> = {};
    ['East', 'West'].forEach(conf => {
        const confTeams = teams.filter(t => t.conference === conf);
        const sorted = [...confTeams].sort((a, b) => {
            const aPct = (a.wins + a.losses === 0) ? 0 : a.wins / (a.wins + a.losses);
            const bPct = (b.wins + b.losses === 0) ? 0 : b.wins / (b.wins + b.losses);
            return bPct - aPct || b.wins - a.wins;
        });

        const rank7 = sorted[6]; // 7th place (First Play-in spot from top, or first out of Playoffs)
        const rank10 = sorted[9]; // 10th place (Last Play-in spot)
        const rank11 = sorted[10]; // 11th place (First Eliminated spot)

        sorted.forEach(t => {
            const remaining = 82 - (t.wins + t.losses);
            const maxWins = t.wins + remaining;

            // Eliminated: Cannot reach 10th place's current wins
            if (rank10 && maxWins < rank10.wins) {
                map[t.id] = 'eliminated';
                return;
            }

            // Clinched Playoff (Top 6): Wins > 7th place's Max Wins
            if (rank7) {
                const rank7Max = rank7.wins + (82 - (rank7.wins + rank7.losses));
                if (t.wins > rank7Max) {
                    map[t.id] = 'clinched_playoff';
                    return;
                }
            }

            // Clinched Play-in (Top 10): Wins > 11th place's Max Wins
            // Note: If already clinched playoff, this is skipped due to return above
            if (rank11) {
                const rank11Max = rank11.wins + (82 - (rank11.wins + rank11.losses));
                if (t.wins > rank11Max) {
                    map[t.id] = 'clinched_playin';
                    return;
                }
            }
        });
    });
    return map;
  }, [teams]);

  if (!teams || teams.length === 0) return (
    <div className="flex h-[400px] items-center justify-center">
      <Loader2 size={40} className="text-indigo-500 animate-spin" />
    </div>
  );

  return (
    <div>
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
          <StandingTable 
            teamList={teams} 
            title="정규시즌 통합 순위" 
            highlightColor="emerald" 
            onTeamClick={onTeamClick} 
            teamStatusMap={teamStatusMap}
          />

          <StandingTable 
            teamList={teams.filter(t => t.conference === 'East')} 
            title="동부 컨퍼런스" 
            isConference={true}
            highlightColor="blue"
            onTeamClick={onTeamClick}
            teamStatusMap={teamStatusMap}
          />

          <StandingTable 
            teamList={teams.filter(t => t.conference === 'West')} 
            title="서부 컨퍼런스" 
            isConference={true}
            highlightColor="red"
            onTeamClick={onTeamClick}
            teamStatusMap={teamStatusMap}
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
                teamStatusMap={teamStatusMap}
              />
            ))}
          </div>

          <div className="flex justify-center mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
            <div className="bg-slate-900/80 border border-slate-800 rounded-full px-8 py-3 flex flex-wrap items-center gap-6 lg:gap-8 shadow-xl backdrop-blur-sm">
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
