
import React, { useState, useMemo } from 'react';
import { Team } from '../types';
import { Loader2, Trophy } from 'lucide-react';
import { StandingTable } from '../components/simulation/StandingTable';
import { DIVISION_KOREAN } from '../data/mappings';

interface StandingsViewProps {
  teams: Team[];
  onTeamClick: (id: string) => void;
}

export const StandingsView: React.FC<StandingsViewProps> = ({ teams, onTeamClick }) => {
  const [mode, setMode] = useState<'Conference' | 'Division'>('Conference');

  const divisions = ['Atlantic', 'Central', 'Southeast', 'Northwest', 'Pacific', 'Southwest'];
  
  // Calculate Playoff Status
  // 각 팀의 승수와 잔여 경기를 기반으로 플레이오프 진출/탈락 여부를 계산합니다.
  const teamStatusMap = useMemo(() => {
    const map: Record<string, 'clinched_playoff' | 'clinched_playin' | 'eliminated' | null> = {};
    ['East', 'West'].forEach(conf => {
        const confTeams = teams.filter(t => t.conference === conf);
        // 승률 순으로 정렬 (승률이 같으면 승수 우선)
        const sorted = [...confTeams].sort((a, b) => {
            const aPct = (a.wins + a.losses === 0) ? 0 : a.wins / (a.wins + a.losses);
            const bPct = (b.wins + b.losses === 0) ? 0 : b.wins / (b.wins + b.losses);
            return bPct - aPct || b.wins - a.wins;
        });

        const rank7 = sorted[6]; // 7위 (플레이오프 직행 실패, 플레이인 상위 시드)
        const rank10 = sorted[9]; // 10위 (플레이인 막차)
        const rank11 = sorted[10]; // 11위 (플레이인 탈락, 시즌 아웃)

        sorted.forEach(t => {
            const remaining = 82 - (t.wins + t.losses); // 잔여 경기 수
            const maxWins = t.wins + remaining; // 해당 팀이 달성 가능한 최대 승수

            // 1. 시즌 탈락 (Eliminated)
            // 해당 팀이 전승을 거둬도 현재 10위 팀의 승수를 넘을 수 없는 경우
            if (rank10 && maxWins < rank10.wins) {
                map[t.id] = 'eliminated';
                return;
            }

            // 2. 플레이오프 직행 확정 (Clinched Playoff - Top 6)
            // 현재 7위 팀이 남은 경기를 전승해도 해당 팀의 현재 승수를 넘을 수 없는 경우
            if (rank7) {
                const rank7Max = rank7.wins + (82 - (rank7.wins + rank7.losses));
                if (t.wins > rank7Max) {
                    map[t.id] = 'clinched_playoff';
                    return;
                }
            }

            // 3. 플레이인 진출 확정 (Clinched Play-in - Top 10)
            // 현재 11위 팀이 남은 경기를 전승해도 해당 팀의 현재 승수를 넘을 수 없는 경우
            // (이미 플레이오프를 확정지은 팀은 위에서 return 되므로 제외됨)
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
    <div className="flex flex-col h-full animate-in fade-in duration-500 overflow-hidden">
      {/* Header Bar */}
      <div className="flex-shrink-0 px-6 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
              <Trophy size={16} className="text-slate-500" />
              <span className="text-xs font-black text-slate-300 uppercase tracking-widest">리그 순위표</span>
          </div>
          <div className="flex p-1 bg-slate-900 rounded-xl border border-slate-800">
              {(['Conference', 'Division'] as const).map(m => (
                  <button key={m} onClick={() => setMode(m)} className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${mode === m ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40 ring-1 ring-indigo-500/50' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}>
                      {m === 'Conference' ? '컨퍼런스 & 전체' : '디비전'}
                  </button>
              ))}
          </div>
      </div>

      {/* Content — scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6">
        {mode === 'Conference' && (
          <div className="grid grid-cols-1 2xl:grid-cols-3 gap-6 items-start animate-in slide-in-from-bottom-4 duration-500">
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
          <div className="space-y-6">
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

            <div className="flex justify-center py-4 animate-in fade-in duration-500">
              <div className="bg-slate-900/80 border border-slate-800 rounded-full px-8 py-3 flex flex-wrap items-center gap-6 lg:gap-8">
                  <div className="flex items-center gap-2">
                      <span className="text-sm">🔒</span>
                      <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">플레이오프 확정</span>
                  </div>
                  <div className="flex items-center gap-2">
                      <span className="text-sm">🎟️</span>
                      <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">플레이인 진출</span>
                  </div>
                  <div className="flex items-center gap-2">
                      <span className="text-sm">❌</span>
                      <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">시즌 탈락</span>
                  </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
