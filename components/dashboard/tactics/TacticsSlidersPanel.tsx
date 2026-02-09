
import React from 'react';
import { Sliders, HelpCircle } from 'lucide-react';
import { TacticalSliders } from '../../../types';

interface TacticsSlidersPanelProps {
    sliders: TacticalSliders;
    onUpdateSliders: (sliders: TacticalSliders) => void;
}

const SliderControl: React.FC<{ label: string, value: number, onChange: (val: number) => void, min?: number, max?: number, leftLabel?: string, rightLabel?: string, tooltip?: string }> = ({ label, value, onChange, min=1, max=10, leftLabel, rightLabel, tooltip }) => (
  <div className="space-y-2 group/slider w-full">
    <div className="flex justify-between items-end">
      <div className="flex items-center gap-1.5 relative">
        <span className="text-xs font-black text-slate-400 uppercase tracking-tight cursor-help">{label}</span>
        {tooltip && (
            <div className="relative group/tooltip">
                <HelpCircle size={12} className="text-slate-600 hover:text-indigo-400 transition-colors cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-slate-900 border border-slate-700 text-slate-300 text-[10px] p-2.5 rounded-xl shadow-2xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-50 font-medium break-keep leading-relaxed text-center">
                    {tooltip}
                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900 border-b border-r border-slate-700 rotate-45"></div>
                </div>
            </div>
        )}
      </div>
      <span className="text-sm font-black text-indigo-400 font-mono">{value}</span>
    </div>
    <div className="relative flex items-center h-6">
       <input 
         type="range" 
         min={min} 
         max={max} 
         value={value} 
         onChange={(e) => onChange(parseInt(e.target.value))} 
         className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
       />
    </div>
    <div className="flex justify-between text-[10px] font-bold text-slate-600 uppercase tracking-tighter">
       <span>{leftLabel || 'Low'}</span>
       <span>{rightLabel || 'High'}</span>
    </div>
  </div>
);

export const TacticsSlidersPanel: React.FC<TacticsSlidersPanelProps> = ({ sliders, onUpdateSliders }) => {
    return (
        <div className="flex flex-col gap-8 bg-slate-950/20 p-6 pt-6 rounded-2xl border border-slate-800/50 h-full">
            <div className="flex items-center gap-3 text-indigo-400 px-1 mb-2">
                <Sliders size={24} />
                <span className="font-black text-sm uppercase tracking-widest oswald">디테일 전술 조정</span>
            </div>

            <SliderControl 
                label="공격 페이스" 
                value={sliders.pace} 
                onChange={v => onUpdateSliders({ ...sliders, pace: v })}
                leftLabel="슬로우 템포" rightLabel="런앤건" 
                tooltip="수치가 높을수록 빠른 공수 전환과 얼리 오펜스를 시도하지만, 턴오버 위험과 체력 소모가 커집니다." 
            />
            <SliderControl 
                label="수비 강도" 
                value={sliders.defIntensity} 
                onChange={v => onUpdateSliders({ ...sliders, defIntensity: v })}
                leftLabel="안정적 수비" rightLabel="강한 압박" 
                tooltip="수치가 높을수록 상대 야투 억제와 스틸 시도가 늘어나지만, 파울 트러블 위험이 커집니다." 
            />
            <div className="w-full h-px bg-slate-800/50 my-2"></div>
            <SliderControl 
                label="공격 리바운드" value={sliders.offReb} 
                onChange={v => onUpdateSliders({ ...sliders, offReb: v })}
                leftLabel="백코트 우선" rightLabel="적극 참여" 
            />
            <SliderControl 
                label="수비 리바운드" value={sliders.defReb} 
                onChange={v => onUpdateSliders({ ...sliders, defReb: v })}
                leftLabel="속공 준비" rightLabel="박스아웃" 
            />
            <div className="w-full h-px bg-slate-800/50 my-2"></div>
            <SliderControl 
                label="풀 코트 프레스" value={sliders.fullCourtPress} 
                onChange={v => onUpdateSliders({ ...sliders, fullCourtPress: v })}
                leftLabel="거의 안함" rightLabel="항상 수행" 
            />
            <SliderControl 
                label="존 디펜스 빈도" value={sliders.zoneUsage} 
                onChange={v => onUpdateSliders({ ...sliders, zoneUsage: v })}
                leftLabel="대인 방어" rightLabel="지역 방어" 
            />
        </div>
    );
};
