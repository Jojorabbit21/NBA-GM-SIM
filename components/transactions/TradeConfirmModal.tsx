
import React from 'react';
import { Briefcase, X, Info, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Player, Team } from '../../types';
import { getOvrBadgeStyle } from '../SharedComponents';

const TAX_LEVEL = 170;
const FIRST_APRON = 178;
const SECOND_APRON = 189;

const getCapStatus = (cap: number) => {
  if (cap >= SECOND_APRON) return { 
      label: '2차 에이프런 초과', 
      msg: '로스터 구성 및 트레이드에 강력한 제약이 발생합니다.', 
      color: 'text-red-500', 
      bg: 'bg-red-500/10', 
      border: 'border-red-500/50',
      bar: 'bg-red-500',
      iconBg: 'bg-red-500/20'
  };
  if (cap >= FIRST_APRON) return { 
      label: '1차 에이프런 초과', 
      msg: '샐러리 유동성이 감소하며 영입 제약이 적용됩니다.', 
      color: 'text-orange-500', 
      bg: 'bg-orange-500/10', 
      border: 'border-orange-500/50',
      bar: 'bg-orange-500',
      iconBg: 'bg-orange-500/20'
  };
  if (cap >= TAX_LEVEL) return { 
      label: '사치세 납부 대상', 
      msg: '사치세 구간입니다. 구단 운영 비용이 증가할 수 있습니다.', 
      color: 'text-amber-400', 
      bg: 'bg-amber-400/10', 
      border: 'border-amber-400/50',
      bar: 'bg-amber-400',
      iconBg: 'bg-amber-400/20'
  };
  return { 
      label: '샐러리캡 여유', 
      msg: '구단 샐러리가 건강하며 추가적인 전력 보강이 가능합니다.', 
      color: 'text-emerald-400', 
      bg: 'bg-emerald-500/10', 
      border: 'border-emerald-400/50',
      bar: 'bg-emerald-400',
      iconBg: 'bg-emerald-500/20'
  };
};

const getVisualPercentage = (cap: number) => {
  if (cap < TAX_LEVEL) return (cap / TAX_LEVEL) * 25;
  if (cap < FIRST_APRON) return 25 + ((cap - TAX_LEVEL) / (FIRST_APRON - TAX_LEVEL)) * 25;
  if (cap < SECOND_APRON) return 50 + ((cap - FIRST_APRON) / (SECOND_APRON - FIRST_APRON)) * 25;
  return 75 + Math.min(25, ((cap - SECOND_APRON) / 30) * 25);
};

interface TradeConfirmModalProps {
  userAssets: Player[];
  targetAssets: Player[];
  userTeam: Team;
  targetTeam: Team;
  onConfirm: () => void;
  onCancel: () => void;
}

export const TradeConfirmModal: React.FC<TradeConfirmModalProps> = ({ 
  userAssets, targetAssets, userTeam, targetTeam, onConfirm, onCancel 
}) => {
  const userSalaryOut = userAssets.reduce((sum, p) => sum + p.salary, 0);
  const userSalaryIn = targetAssets.reduce((sum, p) => sum + p.salary, 0);
  const salaryDiff = userSalaryIn - userSalaryOut;
  const currentTotalCap = (userTeam?.roster || []).reduce((sum, p) => sum + p.salary, 0);
  const postTradeTotalCap = currentTotalCap - userSalaryOut + userSalaryIn;
  
  const status = getCapStatus(postTradeTotalCap);
  const visualWidth = getVisualPercentage(postTradeTotalCap);

  return (
    <div className="fixed inset-0 bg-slate-950/95 z-[200] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-5xl shadow-2xl flex flex-col overflow-hidden max-h-[95vh] ko-normal">
        <div className="px-8 py-6 border-b border-slate-800 bg-slate-800/40 flex justify-between items-center">
          <h3 className="text-2xl font-black uppercase text-white flex items-center gap-3 oswald tracking-tight">
            <Briefcase className="text-indigo-400" size={28} /> 최종 결정 전 확인
          </h3>
          <button onClick={onCancel} className="p-2 hover:bg-slate-700 rounded-full text-slate-400 transition-colors"><X size={24} /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 space-y-8">
            <div className="bg-slate-950/40 border border-slate-800 rounded-3xl overflow-hidden shadow-lg">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-900/50 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
                            <th className="py-4 px-6">유형</th>
                            <th className="py-4 px-2">구단</th>
                            <th className="py-4 px-2">선수</th>
                            <th className="py-4 px-2 text-center">OVR</th>
                            <th className="py-4 px-2 text-center">POS</th>
                            <th className="py-4 px-6 text-right">샐러리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {userAssets.map(p => (
                            <tr key={p.id} className="border-b border-slate-800/30 hover:bg-red-500/5 transition-colors group">
                                <td className="py-3 px-6"><span className="px-2 py-0.5 bg-red-500/10 text-red-500 text-[9px] font-black rounded uppercase">OUT</span></td>
                                <td className="py-3 px-2 text-xs font-bold text-slate-400">{userTeam.name}</td>
                                <td className="py-3 px-2 text-sm font-black text-slate-200">{p.name}</td>
                                <td className="py-3 px-2 text-center"><div className={getOvrBadgeStyle(p.ovr) + " !w-7 !h-7 !text-sm"}>{p.ovr}</div></td>
                                <td className="py-3 px-2 text-center text-[10px] font-bold text-slate-500">{p.position}</td>
                                <td className="py-3 px-6 text-right font-mono text-xs font-black text-red-400">-${p.salary.toFixed(1)}M</td>
                            </tr>
                        ))}
                        {targetAssets.map(p => (
                            <tr key={p.id} className="border-b border-slate-800/30 hover:bg-emerald-500/5 transition-colors group">
                                <td className="py-3 px-6"><span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[9px] font-black rounded uppercase">IN</span></td>
                                <td className="py-3 px-2 text-xs font-bold text-slate-400">{targetTeam.name}</td>
                                <td className="py-3 px-2 text-sm font-black text-slate-200">{p.name}</td>
                                <td className="py-3 px-2 text-center"><div className={getOvrBadgeStyle(p.ovr) + " !w-7 !h-7 !text-sm"}>{p.ovr}</div></td>
                                <td className="py-3 px-2 text-center text-[10px] font-bold text-slate-500">{p.position}</td>
                                <td className="py-3 px-6 text-right font-mono text-xs font-black text-emerald-400">+${p.salary.toFixed(1)}M</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="bg-slate-900/80 font-black">
                            <td colSpan={5} className="py-4 px-6 text-xs text-slate-400 uppercase tracking-widest">총 자산 변동 합계</td>
                            <td className={`py-4 px-6 text-right font-mono text-base ${salaryDiff >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                {salaryDiff > 0 ? '+' : ''}{salaryDiff.toFixed(1)}M
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <div className="space-y-6">
                <div className="flex items-center gap-2 text-slate-400 uppercase font-black text-[10px] tracking-widest">
                    <AlertCircle size={14} /> 샐러리 캡 예측 및 상태 분석
                </div>
                <div className="space-y-2">
                    <div className="relative h-4 w-full bg-slate-800/50 rounded-full overflow-hidden border border-slate-700/50">
                        <div className={`h-full transition-all duration-1000 ease-out shadow-[0_0_20px_rgba(0,0,0,0.5)] ${status.bar}`} style={{ width: `${visualWidth}%` }} />
                        <div className="absolute inset-0 flex pointer-events-none">
                            <div className="flex-1 border-r border-slate-700/50 relative"></div>
                            <div className="flex-1 border-r border-slate-700/50 relative"></div>
                            <div className="flex-1 border-r border-slate-700/50 relative"></div>
                            <div className="flex-1"></div>
                        </div>
                    </div>
                    <div className="flex text-[9px] font-black text-slate-500 uppercase tracking-widest">
                        <div className="flex-1 text-center">Healthy</div>
                        <div className="flex-1 text-center border-l border-slate-800">Luxury Tax</div>
                        <div className="flex-1 text-center border-l border-slate-800">1st Apron</div>
                        <div className="flex-1 text-center border-l border-slate-800">2nd Apron</div>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className={`md:col-span-3 p-5 rounded-3xl border ${status.bg} ${status.border} flex items-center gap-4`}>
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${status.iconBg}`}>
                           <Info className={status.color} size={24} />
                        </div>
                        <div>
                           <div className={`text-sm font-black uppercase tracking-tight mb-0.5 ${status.color}`}>{status.label}</div>
                           <p className="text-xs text-slate-400 font-bold">{status.msg}</p>
                        </div>
                    </div>
                    <div className="bg-slate-950/60 border border-slate-800 p-5 rounded-3xl flex flex-col justify-center items-center text-center">
                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">최종 샐러리 합계</div>
                        <div className="text-3xl font-black text-white oswald leading-none">${postTradeTotalCap.toFixed(1)}<span className="text-sm text-slate-500 ml-0.5">M</span></div>
                    </div>
                </div>
            </div>
        </div>

        <div className="p-8 flex justify-end gap-6 bg-slate-900 border-t border-slate-800">
          <button onClick={onCancel} className="px-10 py-4 rounded-2xl font-black text-slate-400 hover:bg-slate-800 uppercase text-xs tracking-widest transition-all">협상 취소</button>
          <button onClick={onConfirm} className="px-12 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-[0_10px_40px_rgba(79,70,229,0.4)] transition-all active:scale-95 flex items-center gap-4 text-lg">
             <CheckCircle2 size={24} /> 트레이드 실행
          </button>
        </div>
      </div>
    </div>
  );
};
