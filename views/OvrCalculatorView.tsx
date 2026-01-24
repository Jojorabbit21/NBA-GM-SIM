
import React, { useState, useMemo } from 'react';
import { Settings2, User, ChevronRight, RefreshCw, FlaskConical, Info, ArrowUp, ArrowDown, Target, Zap, Shield, Activity, Share2, Brain } from 'lucide-react';
import { Team, Player } from '../types';
import { getOvrBadgeStyle } from '../components/SharedComponents';
import { calculatePlayerOvr } from '../utils/constants';

interface OvrCalculatorViewProps {
  teams: Team[];
}

type PositionType = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

const DEFAULT_WEIGHTS: Record<PositionType, Record<string, number>> = {
  PG: { closeShot: 10, midRange: 20, threeAvg: 25, ft: 10, shotIq: 45, offConsist: 25, layup: 25, dunk: 0, postPlay: 0, drawFoul: 0, hands: 40, intDef: 0, perDef: 0, steal: 0, blk: 0, helpDefIq: 0, passPerc: 0, defConsist: 0, offReb: 2, defReb: 0, speed: 10, agility: 10, strength: 0, vertical: 0, stamina: 15, hustle: 0, durability: 0, passAcc: 25, handling: 15, spdBall: 10, passVision: 25, passIq: 50, intangibles: 5, potential: 500, height: 0 },
  SG: { closeShot: 45, midRange: 45, threeAvg: 45, ft: 20, shotIq: 80, offConsist: 60, layup: 30, dunk: 0, postPlay: 0, drawFoul: 0, hands: 49, intDef: 0, perDef: 15, steal: 10, blk: 0, helpDefIq: 10, passPerc: 0, defConsist: 5, offReb: 1, defReb: 1, speed: 40, agility: 60, strength: 0, vertical: 0, stamina: 30, hustle: 0, durability: 0, passAcc: 20, handling: 25, spdBall: 20, passVision: 15, passIq: 40, intangibles: 5, potential: 500, height: 2 },
  SF: { closeShot: 35, midRange: 45, threeAvg: 45, ft: 20, shotIq: 60, offConsist: 50, layup: 40, dunk: 25, postPlay: 5, drawFoul: 10, hands: 40, intDef: 20, perDef: 70, steal: 25, blk: 20, helpDefIq: 30, passPerc: 20, defConsist: 40, offReb: 10, defReb: 20, speed: 50, agility: 50, strength: 20, vertical: 30, stamina: 40, hustle: 30, durability: 30, passAcc: 15, handling: 15, spdBall: 15, passVision: 15, passIq: 30, intangibles: 15, potential: 500, height: 6 },
  PF: { closeShot: 5, midRange: 1, threeAvg: 1, ft: 4, shotIq: 1, offConsist: 5, layup: 3, dunk: 4, postPlay: 4, drawFoul: 4, hands: 5, intDef: 6, perDef: 1, steal: 1, blk: 4, helpDefIq: 2, passPerc: 1, defConsist: 5, offReb: 4, defReb: 6, speed: 2, agility: 2, strength: 5, vertical: 5, stamina: 4, hustle: 4, durability: 5, passAcc: 1, handling: 1, spdBall: 1, passVision: 1, passIq: 1, intangibles: 15, potential: 12, height: 7 },
  C: { closeShot: 10, midRange: 2, threeAvg: 2, ft: 2, shotIq: 3, offConsist: 5, layup: 8, dunk: 10, postPlay: 10, drawFoul: 5, hands: 5, intDef: 12, perDef: 1, steal: 1, blk: 8, helpDefIq: 1, passPerc: 1, defConsist: 6, offReb: 8, defReb: 8, speed: 2, agility: 2, strength: 6, vertical: 8, stamina: 2, hustle: 1, durability: 6, passAcc: 1, handling: 1, spdBall: 1, passVision: 1, passIq: 1, intangibles: 15, potential: 10, height: 8 }
};

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
    { label: '슈팅 & 득점 효율', icon: <Target size={14} />, keys: ['closeShot', 'midRange', 'threeAvg', 'ft', 'shotIq', 'offConsist'], color: 'text-orange-400' },
    { label: '인사이드 툴', icon: <Zap size={14} />, keys: ['layup', 'dunk', 'postPlay', 'drawFoul', 'hands'], color: 'text-yellow-400' },
    { label: '수비력', icon: <Shield size={14} />, keys: ['intDef', 'perDef', 'steal', 'blk', 'helpDefIq', 'passPerc', 'defConsist'], color: 'text-indigo-400' },
    { label: '신체 능력', icon: <Activity size={14} />, keys: ['speed', 'agility', 'strength', 'vertical', 'stamina', 'hustle', 'durability'], color: 'text-emerald-400' },
    { label: '플레이메이킹', icon: <Share2 size={14} />, keys: ['passAcc', 'handling', 'spdBall', 'passVision', 'passIq'], color: 'text-blue-400' },
    { label: '리바운드 & 기타', icon: <Brain size={14} />, keys: ['offReb', 'defReb', 'intangibles', 'potential', 'height'], color: 'text-fuchsia-400' },
];

export const OvrCalculatorView: React.FC<OvrCalculatorViewProps> = ({ teams }) => {
  const [selectedPos, setSelectedPos] = useState<PositionType>('PG');
  const [weights, setWeights] = useState<Record<string, number>>(DEFAULT_WEIGHTS['PG']);
  const [sortConfig, setSortConfig] = useState<{ key: 'newOvr' | 'oldOvr' | 'delta', dir: 'asc' | 'desc' }>({ key: 'newOvr', dir: 'desc' });

  const players = useMemo(() => {
    return teams.flatMap(t => t.roster.filter(p => p.position.includes(selectedPos)));
  }, [teams, selectedPos]);

  // 로컬 계산 함수를 constants.tsx의 핵심 로직과 완전히 일치하도록 수정
  const calculateNewOvr = (p: Player, currentWeights: Record<string, number>) => {
    // 0값을 허용하는 threeAvg 계산
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
    return Math.min(99, Math.max(40, Math.round(rawAvg)));
  };

  const tableData = useMemo(() => {
    const data = players.map(p => {
        const newOvr = calculateNewOvr(p, weights);
        return {
            id: p.id,
            name: p.name,
            oldOvr: p.ovr,
            newOvr,
            delta: newOvr - p.ovr
        };
    });

    return data.sort((a, b) => {
        const factor = sortConfig.dir === 'desc' ? 1 : -1;
        if (sortConfig.key === 'delta') return (a.delta - b.delta) * factor;
        if (sortConfig.key === 'newOvr') return (a.newOvr - b.newOvr) * factor;
        if (sortConfig.key === 'oldOvr') return (a.oldOvr - b.oldOvr) * factor;
        return 0;
    });
  }, [players, weights, sortConfig]);

  const handleWeightChange = (key: string, val: string) => {
    const num = parseInt(val) || 0;
    setWeights(prev => ({ ...prev, [key]: num }));
  };

  const resetWeights = () => {
    setWeights(DEFAULT_WEIGHTS[selectedPos]);
  };

  const handlePosChange = (pos: PositionType) => {
    setSelectedPos(pos);
    setWeights(DEFAULT_WEIGHTS[pos]);
  };

  const toggleSort = (key: 'newOvr' | 'oldOvr' | 'delta') => {
      setSortConfig(prev => ({
          key,
          dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc'
      }));
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] animate-in fade-in duration-500 ko-normal gap-6 overflow-hidden">
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-slate-800 pb-6 flex-shrink-0">
        <div>
          <h2 className="text-4xl lg:text-5xl font-black ko-tight text-slate-100 uppercase tracking-tight flex items-center gap-4">
            <FlaskConical className="text-indigo-500" size={40} /> OVR 실험실
          </h2>
          <p className="text-slate-500 font-bold mt-1 uppercase text-sm">가중치 조절을 통한 포지션별 밸런스 테스트</p>
        </div>
        <div className="flex gap-4">
            <div className="flex bg-slate-900 rounded-2xl p-1.5 border border-slate-800 shadow-lg">
                {(['PG', 'SG', 'SF', 'PF', 'C'] as PositionType[]).map(pos => (
                    <button 
                        key={pos} 
                        onClick={() => handlePosChange(pos)}
                        className={`px-6 py-2.5 rounded-xl text-sm font-black transition-all ${selectedPos === pos ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        {pos}
                    </button>
                ))}
            </div>
            <button onClick={resetWeights} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 border border-slate-700 transition-all active:scale-95">
                <RefreshCw size={14} /> 기본값 복원
            </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
        <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-800 bg-slate-800/20 flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-400">
                    <Settings2 size={18} />
                    <span className="text-xs font-black uppercase tracking-widest">Weight Settings for {selectedPos}</span>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-950/20 space-y-8">
                {WEIGHT_GROUPS.map((group) => (
                    <div key={group.label} className="space-y-4">
                        <div className="flex items-center gap-2 border-l-2 border-indigo-500/50 pl-3">
                            <span className={group.color}>{group.icon}</span>
                            <h4 className={`text-xs font-black uppercase tracking-wider ${group.color}`}>{group.label}</h4>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-5 px-1">
                            {group.keys.map(key => (
                                weights[key] !== undefined && (
                                    <div key={key} className="space-y-1.5">
                                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-tighter block truncate" title={key}>
                                            {WEIGHT_LABELS[key] || key}
                                        </label>
                                        <input 
                                            type="number" 
                                            value={weights[key]} 
                                            onChange={e => handleWeightChange(key, e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-sm font-black text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                                        />
                                    </div>
                                )
                            ))}
                        </div>
                    </div>
                ))}

                <div className="mt-4 p-6 bg-indigo-500/5 border border-indigo-500/20 rounded-3xl flex items-start gap-4">
                    <Info size={20} className="text-indigo-400 mt-0.5 flex-shrink-0" />
                    <p className="text-[11px] font-medium text-slate-400 leading-relaxed">
                        가중치는 상대적인 값입니다. 모든 가중치의 합을 100으로 맞출 필요는 없습니다. 
                        특정 포지션에서 중요하게 생각하는 스탯의 숫자를 높여보세요. 
                        결과는 <span className="text-white font-bold">New OVR = Σ(스탯 * 가중치) / Σ가중치</span>로 산출됩니다.
                    </p>
                </div>
            </div>
        </div>

        <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-800 bg-slate-950/40 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <User size={18} className="text-slate-400" />
                    <span className="text-xs font-black uppercase text-slate-400 tracking-widest">{selectedPos} Players ({players.length})</span>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-950/10">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-slate-900 z-10 shadow-md">
                        <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
                            <th className="py-4 px-8">Player Name</th>
                            <th className="py-4 px-4 text-center cursor-pointer hover:text-white" onClick={() => toggleSort('oldOvr')}>Base OVR</th>
                            <th className="py-4 px-4 text-center cursor-pointer hover:text-white bg-indigo-600/10" onClick={() => toggleSort('newOvr')}>New OVR</th>
                            <th className="py-4 px-8 text-center cursor-pointer hover:text-white" onClick={() => toggleSort('delta')}>Change</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {tableData.map(p => (
                            <tr key={p.id} className="hover:bg-white/5 transition-colors group">
                                <td className="py-4 px-8">
                                    <span className="text-base font-black text-slate-200 group-hover:text-indigo-400 transition-colors">{p.name}</span>
                                </td>
                                <td className="py-4 px-4 text-center">
                                    <div className="flex justify-center items-center gap-2">
                                        <div className={getOvrBadgeStyle(p.oldOvr) + " !w-9 !h-9 !text-lg !mx-0 opacity-60"}>{p.oldOvr}</div>
                                    </div>
                                </td>
                                <td className="py-4 px-4 text-center bg-indigo-600/5">
                                    <div className="flex justify-center items-center gap-2">
                                        <div className={getOvrBadgeStyle(p.newOvr) + " !w-10 !h-10 !text-xl !mx-0"}>{p.newOvr}</div>
                                    </div>
                                </td>
                                <td className="py-4 px-8 text-center">
                                    <div className={`flex items-center justify-center gap-1.5 font-black text-sm ${p.newOvr > p.oldOvr ? 'text-emerald-400' : p.newOvr < p.oldOvr ? 'text-red-400' : 'text-slate-500'}`}>
                                        {p.newOvr > p.oldOvr ? <ArrowUp size={14} /> : p.newOvr < p.oldOvr ? <ArrowDown size={14} /> : null}
                                        {Math.abs(p.newOvr - p.oldOvr)}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
    </div>
  );
};
