
import React, { useState, useMemo } from 'react';
import { RefreshCw, FlaskConical } from 'lucide-react';
import { Team, Player } from '../types';
import { POSITION_WEIGHTS, PositionType } from '../utils/overallWeights';
import { PageHeader } from '../components/common/PageHeader';
import { calculatePlayerOvr } from '../utils/constants';

interface OvrCalculatorViewProps {
  teams: Team[];
  freeAgents?: Player[];
}

const WEIGHT_LABELS: Record<string, string> = {
    closeShot: '근거리', midRange: '중거리', threeAvg: '3점평균', ft: '자유투', shotIq: '샷IQ', offConsist: '공격기복',
    layup: '레이업', dunk: '덩크', postPlay: '포스트', drawFoul: '파울유도', hands: '핸즈',
    intDef: '내곽수비', perDef: '외곽수비', steal: '스틸', blk: '블록', helpDefIq: '헬프수비', passPerc: '패스차단', defConsist: '수비기복',
    offReb: '공격리바', defReb: '수비리바',
    speed: '스피드', agility: '민첩성', strength: '힘', vertical: '점프력', stamina: '지구력', hustle: '허슬', durability: '내구도',
    passAcc: '패스정확', handling: '핸들링', spdBall: '볼스피드', passVision: '시야', passIq: '패스IQ',
    intangibles: '무형자산', potential: '잠재력', height: '신장(cm)'
};

const WEIGHT_GROUPS = [
    { label: 'SHOOTING', keys: ['closeShot', 'midRange', 'threeAvg', 'ft', 'shotIq', 'offConsist'] },
    { label: 'INSIDE', keys: ['layup', 'dunk', 'postPlay', 'drawFoul', 'hands'] },
    { label: 'DEFENSE', keys: ['intDef', 'perDef', 'steal', 'blk', 'helpDefIq', 'passPerc', 'defConsist'] },
    { label: 'ATHLETIC', keys: ['speed', 'agility', 'strength', 'vertical', 'stamina', 'hustle', 'durability'] },
    { label: 'PLAYMAKING', keys: ['passAcc', 'handling', 'spdBall', 'passVision', 'passIq'] },
    { label: 'REB & ETC', keys: ['offReb', 'defReb', 'intangibles', 'potential', 'height'] },
];

export const OvrCalculatorView: React.FC<OvrCalculatorViewProps> = ({ teams, freeAgents = [] }) => {
  const [selectedPos, setSelectedPos] = useState<PositionType>('PG');
  const [weights, setWeights] = useState<Record<string, number>>(POSITION_WEIGHTS['PG']);
  const [sortConfig, setSortConfig] = useState<{ key: 'newOvr' | 'oldOvr' | 'delta', dir: 'asc' | 'desc' }>({ key: 'newOvr', dir: 'desc' });

  const players = useMemo(() => {
    const rostered = teams.flatMap(t => t.roster.filter(p => p.position.includes(selectedPos)));
    const fa = freeAgents.filter(p => p.position.includes(selectedPos));
    return [...rostered, ...fa];
  }, [teams, freeAgents, selectedPos]);

  const calculateNewOvr = (p: Player, currentWeights: Record<string, number>) => {
    const tC = p.threeCorner ?? 0;
    const t45 = p.three45 ?? 0;
    const tTop = p.threeTop ?? 0;
    const pThreeAvg = (tC + t45 + tTop) / 3;

    const attrs: Record<string, number> = {
        closeShot: p.closeShot, midRange: p.midRange, threeAvg: pThreeAvg, ft: p.ft, shotIq: p.shotIq, offConsist: p.offConsist,
        layup: p.layup, dunk: p.dunk, postPlay: p.postPlay, drawFoul: p.drawFoul, hands: p.hands,
        intDef: p.intDef, perDef: p.perDef, steal: p.steal, blk: p.blk, helpDefIq: p.helpDefIq, passPerc: p.passPerc, defConsist: p.defConsist,
        offReb: p.offReb, defReb: p.defReb,
        speed: p.speed, agility: p.agility, strength: p.strength, vertical: p.vertical, stamina: p.stamina, hustle: p.hustle, durability: p.durability,
        passAcc: p.passAcc, handling: p.handling, spdBall: p.spdBall, passVision: p.passVision, passIq: p.passIq,
        intangibles: p.intangibles, potential: p.potential, height: p.height
    };

    let totalVal = 0;
    let totalWeight = 0;

    Object.keys(currentWeights).forEach(key => {
        const w = currentWeights[key];
        const val = attrs[key] ?? 0;
        totalVal += val * w;
        totalWeight += w;
    });

    const rawAvg = totalWeight > 0 ? totalVal / totalWeight : 50;
    return Math.min(99, Math.max(40, Math.round(rawAvg * 0.6 + 40)));
  };

  const tableData = useMemo(() => {
    const data = players.map(p => {
        const newOvr = calculateNewOvr(p, weights);
        const oldOvr = calculatePlayerOvr(p);
        return { id: p.id, name: p.name, team: p.teamId, oldOvr, newOvr, delta: newOvr - oldOvr };
    });

    return data.sort((a, b) => {
        const factor = sortConfig.dir === 'desc' ? 1 : -1;
        return ((a[sortConfig.key] as number) - (b[sortConfig.key] as number)) * factor;
    });
  }, [players, weights, sortConfig]);

  const handleWeightChange = (key: string, val: string) => {
    const num = parseInt(val) || 0;
    setWeights(prev => ({ ...prev, [key]: num }));
  };

  const resetWeights = () => setWeights(POSITION_WEIGHTS[selectedPos]);

  const handlePosChange = (pos: PositionType) => {
    setSelectedPos(pos);
    setWeights(POSITION_WEIGHTS[pos]);
  };

  const toggleSort = (key: 'newOvr' | 'oldOvr' | 'delta') => {
      setSortConfig(prev => ({
          key,
          dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc'
      }));
  };

  const sortArrow = (key: 'newOvr' | 'oldOvr' | 'delta') =>
      sortConfig.key === key ? (sortConfig.dir === 'desc' ? ' ▼' : ' ▲') : '';

  const ovrColor = (v: number) =>
      v >= 85 ? 'text-amber-400' : v >= 75 ? 'text-emerald-400' : v >= 65 ? 'text-sky-400' : 'text-slate-400';

  const deltaColor = (d: number) =>
      d > 0 ? 'text-emerald-400' : d < 0 ? 'text-red-400' : 'text-slate-600';

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] animate-in fade-in duration-500 ko-normal gap-3 overflow-hidden">
      <PageHeader
        title="OVR 실험실"
        icon={<FlaskConical size={24} />}
        actions={
            <div className="flex items-center gap-3">
                <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-800">
                    {(['PG', 'SG', 'SF', 'PF', 'C'] as PositionType[]).map(pos => (
                        <button
                            key={pos}
                            onClick={() => handlePosChange(pos)}
                            className={`px-4 py-1.5 rounded-md text-xs font-black transition-all ${selectedPos === pos ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            {pos}
                        </button>
                    ))}
                </div>
                <button onClick={resetWeights} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5 border border-slate-700 transition-all">
                    <RefreshCw size={11} /> 기본값 복원
                </button>
            </div>
        }
      />

      <div className="flex-1 grid grid-cols-12 gap-3 min-h-0">
        {/* Weight Grid */}
        <div className="col-span-4 xl:col-span-3 overflow-y-auto custom-scrollbar border border-slate-800 rounded-lg bg-slate-950">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-950 border-b border-slate-800">
                <th className="text-left px-2 py-1.5 text-slate-500 font-black uppercase tracking-wider text-[9px]">Attribute</th>
                <th className="text-center px-2 py-1.5 text-slate-500 font-black uppercase tracking-wider text-[9px] w-16">Weight</th>
              </tr>
            </thead>
            <tbody>
              {WEIGHT_GROUPS.map(group => (
                <React.Fragment key={group.label}>
                  <tr className="bg-slate-900/80">
                    <td colSpan={2} className="px-2 py-1 text-[9px] font-black uppercase tracking-widest text-indigo-400 border-t border-slate-800">
                      {group.label}
                    </td>
                  </tr>
                  {group.keys.map(key => (
                    weights[key] !== undefined && (
                      <tr key={key} className="border-b border-slate-800/50 hover:bg-slate-900/50">
                        <td className="px-2 py-0.5 text-slate-400 font-medium truncate" title={key}>
                          {WEIGHT_LABELS[key] || key}
                        </td>
                        <td className="px-1 py-0.5 text-center">
                          <input
                            type="number"
                            value={weights[key]}
                            onChange={e => handleWeightChange(key, e.target.value)}
                            className="w-full bg-transparent border border-slate-800 rounded px-1 py-0.5 text-[11px] font-bold text-white text-center focus:outline-none focus:border-indigo-500 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </td>
                      </tr>
                    )
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Player Results Grid */}
        <div className="col-span-8 xl:col-span-9 overflow-y-auto custom-scrollbar border border-slate-800 rounded-lg bg-slate-950">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-950 border-b border-slate-800">
                <th className="text-center px-2 py-1.5 text-slate-500 font-black uppercase tracking-wider text-[9px] w-8">#</th>
                <th className="text-left px-2 py-1.5 text-slate-500 font-black uppercase tracking-wider text-[9px]">Player</th>
                <th className="text-center px-2 py-1.5 text-slate-500 font-black uppercase tracking-wider text-[9px] w-16 cursor-pointer hover:text-slate-300 select-none" onClick={() => toggleSort('oldOvr')}>
                  Base{sortArrow('oldOvr')}
                </th>
                <th className="text-center px-2 py-1.5 text-indigo-400 font-black uppercase tracking-wider text-[9px] w-16 cursor-pointer hover:text-indigo-300 select-none bg-indigo-500/5" onClick={() => toggleSort('newOvr')}>
                  New{sortArrow('newOvr')}
                </th>
                <th className="text-center px-2 py-1.5 text-slate-500 font-black uppercase tracking-wider text-[9px] w-14 cursor-pointer hover:text-slate-300 select-none" onClick={() => toggleSort('delta')}>
                  +/-{sortArrow('delta')}
                </th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((p, i) => (
                <tr key={p.id} className="border-b border-slate-800/50 hover:bg-slate-900/50 transition-colors">
                  <td className="text-center px-2 py-1 text-slate-600 font-medium">{i + 1}</td>
                  <td className="px-2 py-1 text-slate-300 font-bold truncate max-w-0">{p.name}</td>
                  <td className={`text-center px-2 py-1 font-bold ${ovrColor(p.oldOvr)} opacity-60`}>{p.oldOvr}</td>
                  <td className={`text-center px-2 py-1 font-black ${ovrColor(p.newOvr)} bg-indigo-500/5`}>{p.newOvr}</td>
                  <td className={`text-center px-2 py-1 font-bold ${deltaColor(p.delta)}`}>
                    {p.delta > 0 ? `+${p.delta}` : p.delta === 0 ? '-' : p.delta}
                  </td>
                </tr>
              ))}
              {tableData.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-600 text-xs">해당 포지션의 선수가 없습니다</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
