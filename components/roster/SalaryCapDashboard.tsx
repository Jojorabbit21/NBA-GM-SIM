
import React from 'react';
import { AlertCircle, Info } from 'lucide-react';
import { LEAGUE_FINANCIALS } from '../../utils/constants';

interface SalaryCapDashboardProps {
  currentTotalSalary: number;
}

const { TAX_LEVEL, FIRST_APRON, SECOND_APRON, SALARY_CAP } = LEAGUE_FINANCIALS;

const getCapStatus = (cap: number) => {
  if (cap >= SECOND_APRON) return { 
      label: '2차 에이프런 초과', 
      msg: '강력한 영입 제한 및 지명권 패널티가 적용되는 단계입니다.', 
      color: 'text-red-500', 
      bg: 'bg-red-500/10', 
      border: 'border-red-500/50',
      bar: 'bg-red-500',
      iconBg: 'bg-red-500/20'
  };
  if (cap >= FIRST_APRON) return { 
      label: '1차 에이프런 초과', 
      msg: '미드레벨 예외 조항 사용 제한 등 팀 운영 유동성이 제약됩니다.', 
      color: 'text-orange-500', 
      bg: 'bg-orange-500/10', 
      border: 'border-orange-500/50',
      bar: 'bg-orange-500',
      iconBg: 'bg-orange-500/20'
  };
  if (cap >= TAX_LEVEL) return { 
      label: '사치세 납부 구간', 
      msg: '샐러리 캡을 초과하여 구단 운영비 외 추가 세금이 부과됩니다.', 
      color: 'text-amber-400', 
      bg: 'bg-amber-400/10', 
      border: 'border-amber-400/50',
      bar: 'bg-amber-400',
      iconBg: 'bg-amber-400/20'
  };
  if (cap >= SALARY_CAP) return { 
      label: '샐러리 캡 초과', 
      msg: '사치세 라인 미만이지만, FA 영입 시 예외 조항 위주로 운영해야 합니다.', 
      color: 'text-blue-400', 
      bg: 'bg-blue-500/10', 
      border: 'border-blue-500/50',
      bar: 'bg-blue-400',
      iconBg: 'bg-blue-500/20'
  };
  return { 
      label: '캡 스페이스 여유', 
      msg: '공격적인 FA 영입 및 트레이드 흡수가 가능한 건강한 상태입니다.', 
      color: 'text-emerald-400', 
      bg: 'bg-emerald-500/10', 
      border: 'border-emerald-400/50',
      bar: 'bg-emerald-400',
      iconBg: 'bg-emerald-500/20'
  };
};

const getVisualPercentage = (cap: number) => {
  if (cap < SALARY_CAP) return (cap / SALARY_CAP) * 20;
  if (cap < TAX_LEVEL) return 20 + ((cap - SALARY_CAP) / (TAX_LEVEL - SALARY_CAP)) * 30;
  if (cap < FIRST_APRON) return 50 + ((cap - TAX_LEVEL) / (FIRST_APRON - TAX_LEVEL)) * 20;
  if (cap < SECOND_APRON) return 70 + ((cap - FIRST_APRON) / (SECOND_APRON - FIRST_APRON)) * 20;
  return 90 + Math.min(10, ((cap - SECOND_APRON) / 30) * 10);
};

export const SalaryCapDashboard: React.FC<SalaryCapDashboardProps> = ({ currentTotalSalary }) => {
  const capStatus = getCapStatus(currentTotalSalary);
  const visualPercentage = getVisualPercentage(currentTotalSalary);

  return (
    <div className="px-4 py-8 space-y-8 bg-slate-950/40 rounded-3xl border border-slate-800 animate-in fade-in slide-in-from-top-2 duration-500">
      <div className="flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-6 flex-1">
          <div className={`p-4 rounded-2xl border ${capStatus.bg} ${capStatus.border} shadow-lg`}>
            <AlertCircle className={capStatus.color} size={32} />
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline gap-3">
              <span className={`text-2xl font-black uppercase tracking-tight ${capStatus.color}`}>{capStatus.label}</span>
              <span className="text-sm font-bold text-slate-500">총 연봉: ${currentTotalSalary.toFixed(1)}M</span>
            </div>
            <p className="text-sm font-medium text-slate-400 max-w-2xl">{capStatus.msg}</p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="px-6 py-3 bg-slate-900 border border-slate-800 rounded-2xl text-center min-w-[120px]">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">CAP SPACE</div>
            <div className={`text-xl font-black oswald ${currentTotalSalary < SALARY_CAP ? 'text-emerald-400' : 'text-slate-600'}`}>
              {currentTotalSalary < SALARY_CAP ? `$${(SALARY_CAP - currentTotalSalary).toFixed(1)}M` : '-'}
            </div>
          </div>
          <div className="px-6 py-3 bg-slate-900 border border-slate-800 rounded-2xl text-center min-w-[120px]">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">TAX GAP</div>
            <div className={`text-xl font-black oswald ${currentTotalSalary < TAX_LEVEL ? 'text-blue-400' : 'text-red-500'}`}>
              {currentTotalSalary < TAX_LEVEL ? `$${(TAX_LEVEL - currentTotalSalary).toFixed(1)}M` : `+$${(currentTotalSalary - TAX_LEVEL).toFixed(1)}M`}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-2">
        <div className="relative h-5 w-full bg-slate-900 rounded-full border border-slate-800 overflow-hidden shadow-inner">
          <div className="absolute inset-0 flex h-full">
            <div className="flex-[20] bg-emerald-500/5 border-r border-slate-800/50"></div>
            <div className="flex-[30] bg-blue-500/5 border-r border-slate-800/50"></div>
            <div className="flex-[20] bg-amber-500/5 border-r border-slate-800/50"></div>
            <div className="flex-[20] bg-orange-500/5 border-r border-slate-800/50"></div>
            <div className="flex-[10] bg-red-500/5"></div>
          </div>
          <div 
            className={`h-full transition-all duration-1000 ease-out shadow-[0_0_20px_rgba(0,0,0,0.5)] relative z-10 ${capStatus.bar}`} 
            style={{ width: `${visualPercentage}%` }} 
          />
          <div 
            className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_10px_white] z-20"
            style={{ left: `${visualPercentage}%`, transform: 'translateX(-50%)' }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rotate-45"></div>
          </div>
        </div>
        <div className="flex text-[10px] font-black text-slate-500 uppercase tracking-widest relative h-8">
          <div className="absolute" style={{ left: '0%' }}>$0</div>
          <div className="absolute text-center" style={{ left: '20%', transform: 'translateX(-50%)' }}>
            <div className="text-slate-400 border-x border-slate-800 px-2">CAP: ${SALARY_CAP}M</div>
          </div>
          <div className="absolute text-center" style={{ left: '50%', transform: 'translateX(-50%)' }}>
            <div className="text-amber-500 border-x border-slate-800 px-2">TAX: ${TAX_LEVEL}M</div>
          </div>
          <div className="absolute text-center" style={{ left: '70%', transform: 'translateX(-50%)' }}>
            <div className="text-orange-500 border-x border-slate-800 px-2">APR1: ${FIRST_APRON}M</div>
          </div>
          <div className="absolute text-center" style={{ left: '90%', transform: 'translateX(-50%)' }}>
            <div className="text-red-500 border-x border-slate-800 px-2">APR2: ${SECOND_APRON}M</div>
          </div>
        </div>
      </div>
    </div>
  );
};
