import React, { useState, useMemo } from 'react';
import { Settings2, User, ChevronRight, RefreshCw, FlaskConical, Info, ArrowUp, ArrowDown, Target, Zap, Shield, Activity, Share2, Brain } from 'lucide-react';
import { Team, Player } from '../types';
import { OvrBadge } from '../components/SharedComponents';
import { POSITION_WEIGHTS, PositionType } from '../utils/overallWeights';

interface OvrCalculatorViewProps {
  teams: Team[];
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
    { label: '슈팅 & 득점 효율', icon: <Target size={14} />, keys: ['closeShot', 'midRange', 'threeAvg', 'ft', 'shotIq', 'offConsist'], color: 'text-orange-400' },
    { label: '인사이드 툴', icon: <Zap size={14} />, keys: ['layup', 'dunk', 'postPlay', 'drawFoul', 'hands'], color: 'text-yellow-400' },
    { label: '수비력', icon: <Shield size={14} />, keys: ['intDef', 'perDef', 'steal', 'blk', 'helpDefIq', 'passPerc', 'defConsist'], color: 'text-indigo-400' },
    { label: '신체 능력', icon: <Activity size={14} />, keys: ['speed', 'agility', 'strength', 'vertical', 'stamina', 'hustle', 'durability'], color: 'text-emerald-400' },
    { label: '플레이메이킹', icon: <Share2 size={14} />, keys: ['passAcc', 'handling', 'spdBall', 'passVision', 'passIq'], color: 'text-blue-400' },
    { label: '리바운드 & 기타', icon: <Brain size={14} />, keys: ['offReb', 'defReb', 'intangibles', 'potential', 'height'], color: 'text-fuchsia-400' },
];

export const OvrCalculatorView: React.FC<OvrCalculatorViewProps> = ({ teams }) => {
  const [selectedPos, setSelectedPos] = useState<PositionType>('PG');
  const [weights, setWeights] = useState<Record<string, number>>(POSITION_WEIGHTS['PG']);
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

    let totalScore = 0;
    let totalWeight = 0;

    for (const [key, weight] of Object.entries(currentWeights)) {
        let val = attrs[key];
        // Fallback same as ovrUtils
        if (val === undefined || val === null || isNaN(val)) val = 70;
        totalScore += val * weight;
        totalWeight += weight;
    }

    return totalWeight > 0 ? Math.max(40, Math.round(totalScore / totalWeight)) : 70;
  };

  const calculatedPlayers = useMemo(() => {
      return players.map(p => {
          const oldOvr = p.ovr;
          const newOvr = calculateNewOvr(p, weights);
          return { ...p, oldOvr, newOvr, delta: newOvr - oldOvr };
      }).sort((a, b) => {
          const valA = a[sortConfig.key];
          const valB = b[sortConfig.key];
          return sortConfig.dir === 'asc' ? valA - valB : valB - valA;
      });
  }, [players, weights, sortConfig]);

  const handleWeightChange = (key: string, val: number) => {
      setWeights(prev => ({ ...prev, [key]: val }));
  };

  const handlePosChange = (pos: PositionType) => {
      setSelectedPos(pos);
      setWeights(POSITION_WEIGHTS[pos]);
  };

  const resetWeights = () => {
      setWeights(POSITION_WEIGHTS[selectedPos]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] gap-6 animate-in fade-in duration-500 ko-normal">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-slate-800 pb-6 flex-shrink-0">
            <div>
                <h2 className="text-4xl font-black ko-tight text-slate-100 uppercase tracking-tight flex items-center gap-3">
                    <FlaskConical className="text-indigo-500" size={32} />
                    OVR Simulator
                </h2>
                <p className="text-slate-500 text-sm font-bold mt-1">포지션별 가중치 조정을 통한 오버롤 시뮬레이션</p>
            </div>
            <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                {(['PG', 'SG', 'SF', 'PF', 'C'] as PositionType[]).map(pos => (
                    <button 
                        key={pos}
                        onClick={() => handlePosChange(pos)}
                        className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${selectedPos === pos ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        {pos}
                    </button>
                ))}
            </div>
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 overflow-hidden">
            {/* Control Panel */}
            <div className="lg:col-span-4 bg-slate-900/90 border border-slate-800 rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Settings2 size={18} className="text-slate-400" />
                        <span className="text-xs font-black uppercase text-slate-400 tracking-widest">Weight Configuration</span>
                    </div>
                    <button onClick={resetWeights} className="p-2 hover:bg-slate-800 rounded-full text-slate-500 hover:text-indigo-400 transition-colors" title="Reset to Defaults">
                        <RefreshCw size={16} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                    {WEIGHT_GROUPS.map((group, idx) => (
                        <div key={idx} className="space-y-3">
                            <div className={`flex items-center gap-2 text-xs font-black uppercase tracking-wider ${group.color}`}>
                                {group.icon} {group.label}
                            </div>
                            <div className="grid grid-cols-1 gap-3">
                                {group.keys.map(key => (
                                    <div key={key} className="flex items-center justify-between bg-slate-950/40 p-3 rounded-xl border border-slate-800/50">
                                        <span className="text-[11px] font-bold text-slate-400 w-24">{WEIGHT_LABELS[key] || key}</span>
                                        <div className="flex items-center gap-3 flex-1">
                                            <input 
                                                type="range" 
                                                min="0" max="50" 
                                                value={weights[key] || 0} 
                                                onChange={(e) => handleWeightChange(key, parseInt(e.target.value))}
                                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400"
                                            />
                                            <span className="text-xs font-mono font-black text-white w-6 text-right">{weights[key] || 0}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Results Panel */}
            <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <User size={18} className="text-slate-400" />
                        <span className="text-xs font-black uppercase text-slate-400 tracking-widest">Calculated Roster ({calculatedPlayers.length})</span>
                    </div>
                    <div className="flex gap-2">
                        {(['newOvr', 'oldOvr', 'delta'] as const).map(key => (
                            <button 
                                key={key}
                                onClick={() => setSortConfig({ key, dir: sortConfig.key === key && sortConfig.dir === 'desc' ? 'asc' : 'desc' })}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border transition-all ${sortConfig.key === key ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50' : 'bg-slate-950 text-slate-500 border-slate-800'}`}
                            >
                                {key === 'newOvr' ? 'New OVR' : key === 'oldOvr' ? 'Current OVR' : 'Diff'}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-slate-950/95 z-10 shadow-sm">
                            <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
                                <th className="py-4 px-6 pl-8 w-16 text-center">Rank</th>
                                <th className="py-4 px-4">Player</th>
                                <th className="py-4 px-4 text-center">POS</th>
                                <th className="py-4 px-4 text-center">Current</th>
                                <th className="py-4 px-4 text-center">Simulated</th>
                                <th className="py-4 px-6 text-right pr-8">Diff</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {calculatedPlayers.map((p, i) => (
                                <tr key={p.id} className="hover:bg-white/5 transition-colors group">
                                    <td className="py-3 px-6 pl-8 text-center text-sm font-bold text-slate-600">{i + 1}</td>
                                    <td className="py-3 px-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-black text-slate-200 group-hover:text-white">{p.name}</span>
                                            {/* We don't have team info here easily without joining, keeping it simple */}
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-center text-xs font-bold text-slate-500">{p.position}</td>
                                    <td className="py-3 px-4 text-center">
                                        <div className="flex justify-center">
                                            <OvrBadge ovr={p.oldOvr} className="!w-8 !h-8 !text-sm grayscale opacity-60" />
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <div className="flex justify-center">
                                            <OvrBadge ovr={p.newOvr} className="!w-9 !h-9 !text-base" />
                                        </div>
                                    </td>
                                    <td className="py-3 px-6 pr-8 text-right">
                                        <div className={`flex items-center justify-end gap-1 font-black ${p.delta > 0 ? 'text-emerald-400' : p.delta < 0 ? 'text-red-400' : 'text-slate-600'}`}>
                                            {p.delta > 0 ? <ArrowUp size={14} /> : p.delta < 0 ? <ArrowDown size={14} /> : null}
                                            {p.delta > 0 ? '+' : ''}{p.delta}
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