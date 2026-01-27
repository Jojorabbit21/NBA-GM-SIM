
import React from 'react';
import { Target, Shield, ClipboardList } from 'lucide-react';
import { Team, TacticStatRecord, OffenseTactic, DefenseTactic } from '../../types';

const OFFENSE_TACTIC_INFO: Record<OffenseTactic, { label: string, desc: string }> = {
  'Balance': { label: '밸런스 오펜스', desc: '모든 공격 루트의 조화' },
  'PaceAndSpace': { label: '페이스 & 스페이스', desc: '공간 창출 및 캐치앤슛' },
  'PerimeterFocus': { label: '퍼리미터 포커스', desc: '픽앤롤 및 외곽 아이솔레이션' },
  'PostFocus': { label: '포스트 포커스', desc: '빅맨의 골밑 장악' },
  'Grind': { label: '그라인드', desc: '저득점 강제 및 에이스 집중' },
  'SevenSeconds': { label: '세븐 세컨즈', desc: '7초 이내 빠른 공격' }
};

const DEFENSE_TACTIC_INFO: Record<DefenseTactic, { label: string, desc: string }> = {
  'ManToManPerimeter': { label: '맨투맨', desc: '대인 방어 및 외곽 억제' },
  'ZoneDefense': { label: '지역 방어', desc: '지역 방어 및 골밑 보호' },
  'AceStopper': { label: '에이스 스토퍼', desc: '상대 주득점원 집중 견제' }
};

const TacticTable: React.FC<{ data: Record<string, TacticStatRecord>, labels: any }> = ({ data, labels }) => {
    const sorted = (Object.entries(data) as [string, TacticStatRecord][]).sort((a, b) => b[1].games - a[1].games);
    if (sorted.length === 0) return <div className="text-center text-slate-500 py-8 font-bold text-sm">아직 기록된 데이터가 없습니다.</div>;

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                    <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 bg-slate-950/30">
                        <th className="py-3 px-4 w-40 sticky left-0 bg-slate-950 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">Tactic Name</th>
                        <th className="py-3 px-2 text-right w-12">GP</th>
                        <th className="py-3 px-2 text-center w-16">W-L</th>
                        <th className="py-3 px-2 text-right w-16">Win%</th>
                        <th className="py-3 px-2 text-right w-16">PTS</th>
                        <th className="py-3 px-2 text-right w-16">PA</th>
                        <th className="py-3 px-2 text-right w-16">FG%</th>
                        <th className="py-3 px-2 text-right w-16">3P%</th>
                        <th className="py-3 px-2 text-right w-16">RIM%</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                    {sorted.map(([key, stats]) => {
                        const s = stats as TacticStatRecord;
                        const winPct = (s.wins / s.games * 100).toFixed(1);
                        const avgPts = (s.ptsFor / s.games).toFixed(1);
                        const avgPa = (s.ptsAgainst / s.games).toFixed(1);
                        const fgPct = s.fga > 0 ? ((s.fgm / s.fga) * 100).toFixed(1) + '%' : '0.0%';
                        const p3Pct = s.p3a > 0 ? ((s.p3m / s.p3a) * 100).toFixed(1) + '%' : '0.0%';
                        const rimPct = s.rimA > 0 ? ((s.rimM / s.rimA) * 100).toFixed(1) + '%' : '0.0%';

                        return (
                            <tr key={key} className="hover:bg-white/5 transition-colors">
                                <td className="py-3 px-4 font-bold text-slate-300 text-xs sticky left-0 bg-slate-900 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">{labels[key]?.label || key}</td>
                                <td className="py-3 px-2 text-right font-mono text-sm text-slate-400">{s.games}</td>
                                <td className="py-3 px-2 text-center font-mono text-sm text-slate-300">{s.wins}-{s.games - s.wins}</td>
                                <td className={`py-3 px-2 text-right font-mono text-sm font-bold ${Number(winPct) >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{winPct}%</td>
                                <td className="py-3 px-2 text-right font-mono text-sm text-white">{avgPts}</td>
                                <td className="py-3 px-2 text-right font-mono text-sm text-slate-400">{avgPa}</td>
                                <td className="py-3 px-2 text-right font-mono text-sm text-slate-300">{fgPct}</td>
                                <td className="py-3 px-2 text-right font-mono text-sm text-slate-300">{p3Pct}</td>
                                <td className="py-3 px-2 text-right font-mono text-sm text-slate-300">{rimPct}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export const TacticsHistory: React.FC<{ team: Team }> = ({ team }) => {
  if (!team.tacticHistory) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-slate-500">
        <ClipboardList size={48} className="mb-4 opacity-20" />
        <p className="text-lg font-black uppercase tracking-widest">No Tactical Data</p>
        <p className="text-xs font-bold mt-2">아직 기록된 전술 데이터가 없습니다.</p>
      </div>
    );
  }

  const generalDefenseStats = Object.fromEntries(
    Object.entries(team.tacticHistory.defense || {}).filter(([key]) => key !== 'AceStopper')
  ) as Record<string, TacticStatRecord>;

  return (
    <div className="flex flex-col gap-10 min-h-[400px]">
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2 px-2">
          <Target size={20} className="text-orange-400" />
          <h4 className="text-sm font-black uppercase text-slate-300 tracking-widest">Offensive Tactics Efficiency</h4>
        </div>
        <TacticTable data={team.tacticHistory.offense || {}} labels={OFFENSE_TACTIC_INFO} />
      </div>
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2 px-2">
          <Shield size={20} className="text-blue-400" />
          <h4 className="text-sm font-black uppercase text-slate-300 tracking-widest">Defensive Tactics Efficiency</h4>
        </div>
        <TacticTable data={generalDefenseStats} labels={DEFENSE_TACTIC_INFO} />
      </div>
    </div>
  );
};
