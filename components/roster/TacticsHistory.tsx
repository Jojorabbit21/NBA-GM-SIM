
import React from 'react';
import { Target, Shield, ClipboardList, ShieldAlert } from 'lucide-react';
import { Team, TacticStatRecord } from '../../types';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';

const TacticTable: React.FC<{ data: Record<string, TacticStatRecord> }> = ({ data }) => {
    const sorted = (Object.entries(data) as [string, TacticStatRecord][])
        .filter(([key]) => key !== 'AceStopper')
        .sort((a, b) => b[1].games - a[1].games);

    if (sorted.length === 0) return null;

    return (
        <div className="bg-slate-900/40 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <Table>
                <TableHead>
                    <TableHeaderCell align="left" className="px-6 w-40 sticky left-0 bg-slate-950 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">Tactic</TableHeaderCell>
                    <TableHeaderCell align="right" className="w-12">GP</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-16">W-L</TableHeaderCell>
                    <TableHeaderCell align="right" className="w-16">Win%</TableHeaderCell>
                    <TableHeaderCell align="right" className="w-16">PTS</TableHeaderCell>
                    <TableHeaderCell align="right" className="w-16">PA</TableHeaderCell>
                    <TableHeaderCell align="right" className="w-16">FG%</TableHeaderCell>
                    <TableHeaderCell align="right" className="w-16">3P%</TableHeaderCell>
                    <TableHeaderCell align="right" className="w-16">RIM%</TableHeaderCell>
                </TableHead>
                <TableBody>
                    {sorted.map(([key, stats]) => {
                        const s = stats as TacticStatRecord;
                        const winPct = (s.wins / s.games * 100).toFixed(1);
                        const avgPts = (s.ptsFor / s.games).toFixed(1);
                        const avgPa = (s.ptsAgainst / s.games).toFixed(1);
                        const fgPct = s.fga > 0 ? ((s.fgm / s.fga) * 100).toFixed(1) + '%' : '0.0%';
                        const p3Pct = s.p3a > 0 ? ((s.p3m / s.p3a) * 100).toFixed(1) + '%' : '0.0%';
                        const rimPct = s.rimA > 0 ? ((s.rimM / s.rimA) * 100).toFixed(1) + '%' : '0.0%';

                        return (
                            <TableRow key={key}>
                                <TableCell className="px-6 font-bold text-slate-300 text-xs sticky left-0 bg-slate-900 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">
                                    {key}
                                </TableCell>
                                <TableCell variant="stat" value={s.games} className="text-slate-400" />
                                <TableCell align="center" className="font-mono text-sm text-slate-300">{s.wins}-{s.games - s.wins}</TableCell>
                                <TableCell align="right" className={`font-mono text-sm font-bold ${Number(winPct) >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{winPct}%</TableCell>
                                <TableCell variant="stat" value={avgPts} className="text-white" />
                                <TableCell variant="stat" value={avgPa} className="text-slate-400" />
                                <TableCell variant="stat" value={fgPct} className="text-slate-300" />
                                <TableCell variant="stat" value={p3Pct} className="text-slate-300" />
                                <TableCell variant="stat" value={rimPct} className="text-slate-300" />
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
};

const StopperTacticTable: React.FC<{ stats?: TacticStatRecord }> = ({ stats }) => {
    if (!stats || stats.games === 0) return null;

    const winPct = (stats.wins / stats.games * 100).toFixed(1);
    const avgAcePts = (stats.ptsAgainst / stats.games).toFixed(1);
    const aceFgPct = stats.fga > 0 ? ((stats.fgm / stats.fga) * 100).toFixed(1) + '%' : '0.0%';
    const ace3pPct = stats.p3a > 0 ? ((stats.p3m / stats.p3a) * 100).toFixed(1) + '%' : '0.0%';
    const avgImpact = (stats.aceImpact! / stats.games).toFixed(1);

    return (
        <div className="bg-slate-900/40 border border-slate-800 rounded-3xl overflow-hidden shadow-xl animate-in slide-in-from-top-2 duration-500">
            <Table>
                <TableHead>
                    <TableHeaderCell align="left" className="px-6 w-40 sticky left-0 bg-slate-900 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">Tactic</TableHeaderCell>
                    <TableHeaderCell align="right" className="w-12">GP</TableHeaderCell>
                    <TableHeaderCell align="center" className="w-16">W-L</TableHeaderCell>
                    <TableHeaderCell align="right" className="w-16">Win%</TableHeaderCell>
                    <TableHeaderCell align="right" className="w-24">Opp Ace PPG</TableHeaderCell>
                    <TableHeaderCell align="right" className="w-24">Opp Ace FG%</TableHeaderCell>
                    <TableHeaderCell align="right" className="w-24">Opp Ace 3P%</TableHeaderCell>
                    <TableHeaderCell align="right" className="w-24 pr-6">Eff. Impact</TableHeaderCell>
                </TableHead>
                <TableBody>
                    <TableRow>
                        <TableCell className="px-6 font-bold text-slate-300 text-xs sticky left-0 bg-slate-900 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">에이스 스토퍼</TableCell>
                        <TableCell variant="stat" value={stats.games} className="text-slate-400" />
                        <TableCell align="center" className="font-mono text-sm text-slate-300">{stats.wins}-{stats.games - stats.wins}</TableCell>
                        <TableCell align="right" className={`font-mono text-sm font-bold ${Number(winPct) >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>{winPct}%</TableCell>
                        <TableCell variant="stat" value={avgAcePts} className="text-white" />
                        <TableCell variant="stat" value={aceFgPct} className="text-slate-200" />
                        <TableCell variant="stat" value={ace3pPct} className="text-slate-200" />
                        <TableCell align="right" className={`pr-6 font-mono text-sm font-black ${Number(avgImpact) < 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {Number(avgImpact) > 0 ? '+' : ''}{avgImpact}%
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>
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

  const offenseStats = team.tacticHistory.offense || {};
  const defenseStats = team.tacticHistory.defense || {};
  const stopperStats = defenseStats['AceStopper'];

  const hasOffense = Object.keys(offenseStats).length > 0;
  const hasDefense = Object.keys(defenseStats).filter(k => k !== 'AceStopper').length > 0;
  const hasStopper = stopperStats && stopperStats.games > 0;

  if (!hasOffense && !hasDefense && !hasStopper) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-slate-500">
        <ClipboardList size={48} className="mb-4 opacity-20" />
        <p className="text-lg font-black uppercase tracking-widest">No Stats Recorded</p>
        <p className="text-xs font-bold mt-2">경기를 진행하여 전술 데이터를 수집하십시오.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-14 min-h-[400px]">
      {/* Offensive Section */}
      {hasOffense && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 border-l-4 border-orange-500 pl-4">
            <Target size={24} className="text-orange-400" />
            <div>
              <h4 className="text-xl font-black uppercase text-slate-100 tracking-wider oswald">Offensive Systems Efficiency</h4>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Team Performance by Strategy</p>
            </div>
          </div>
          <TacticTable data={offenseStats} />
        </div>
      )}

      {/* Defensive Section */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 border-l-4 border-blue-500 pl-4">
          <Shield size={24} className="text-blue-400" />
          <div>
            <h4 className="text-xl font-black uppercase text-slate-100 tracking-wider oswald">Defensive Systems Efficiency</h4>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Overall Team Defensive Impact</p>
          </div>
        </div>

        <div className="space-y-4">
          {hasDefense && <TacticTable data={defenseStats} />}

          {/* Ace Stopper Table */}
          {hasStopper && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pl-1">
                <ShieldAlert size={16} className="text-red-400" />
                <span className="text-xs font-black text-red-400 uppercase tracking-widest">에이스 스토퍼 기록</span>
              </div>
              <StopperTacticTable stats={stopperStats} />
            </div>
          )}

          {!hasDefense && !hasStopper && (
              <div className="text-center text-slate-500 py-8 font-bold text-sm bg-slate-900/30 rounded-2xl border border-slate-800">
                  기록된 수비 전술 데이터가 없습니다.
              </div>
          )}
        </div>
      </div>
    </div>
  );
};
