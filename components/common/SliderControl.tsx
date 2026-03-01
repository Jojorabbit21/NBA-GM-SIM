
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { HelpCircle } from 'lucide-react';

interface SliderStep {
    value: number;
    label: string;
}

// Reusable Slider Component
// Uses local state during drag so only this component re-renders while dragging.
// Commits to parent (onChange) only on mouseup/keyup — preventing App-level re-renders at 60fps.
//
// steps 모드: steps prop이 제공되면 이산 단계로 동작.
//   - value prop은 엔진 값 (예: 2, 5, 9)
//   - 내부에서 가장 가까운 step index로 변환
//   - onChange는 엔진 값을 emit (예: steps[stepIndex].value)
//   - 라벨 표시: steps[stepIndex].label
export const SliderControl: React.FC<{
    label: string,
    value: number,
    onChange: (val: number) => void,
    min?: number,
    max?: number,
    leftLabel?: string,
    rightLabel?: string,
    tooltip?: string,
    fillColor?: string,
    steps?: SliderStep[],
}> = ({ label, value, onChange, min: propMin, max: propMax, leftLabel, rightLabel, tooltip, fillColor = '#6366f1', steps }) => {

  // steps 모드: 엔진 값 → step index 변환
  const engineToStep = useMemo(() => {
    if (!steps) return null;
    return (engineVal: number) => {
      let closest = 0;
      let minDist = Infinity;
      for (let i = 0; i < steps.length; i++) {
        const dist = Math.abs(steps[i].value - engineVal);
        if (dist < minDist) { minDist = dist; closest = i; }
      }
      return closest;
    };
  }, [steps]);

  const min = steps ? 0 : (propMin ?? 1);
  const max = steps ? steps.length - 1 : (propMax ?? 10);

  const initialLocal = steps && engineToStep ? engineToStep(value) : value;

  const [localValue, setLocalValue] = useState(initialLocal);
  const localValueRef = useRef(initialLocal);

  // Sync from parent when parent changes externally (코치 위임, 초기화, 프리셋 불러오기)
  useEffect(() => {
    const mapped = steps && engineToStep ? engineToStep(value) : value;
    if (localValueRef.current !== mapped) {
      localValueRef.current = mapped;
      setLocalValue(mapped);
    }
  }, [value, steps, engineToStep]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value);
    localValueRef.current = v;
    setLocalValue(v);
  };

  // Commit to parent only when drag/key interaction ends
  const handleCommit = useCallback(() => {
    const raw = localValueRef.current;
    if (steps) {
      const idx = Math.max(0, Math.min(steps.length - 1, raw));
      onChange(steps[idx].value);
    } else {
      onChange(raw);
    }
  }, [onChange, steps]);

  const percentage = ((localValue - min) / (max - min)) * 100;

  // Display label
  const displayLabel = steps
    ? steps[Math.max(0, Math.min(steps.length - 1, localValue))]?.label ?? ''
    : String(localValue);

  return (
    <div className="space-y-1.5 w-full py-1">
      <div className="flex justify-between items-end">
        <div className="flex items-center gap-1.5 relative group/tooltip">
          <span className="text-xs font-bold text-slate-300 tracking-tight cursor-help">{label}</span>
          {tooltip && (
              <>
                  <HelpCircle size={12} className="text-slate-600 hover:text-indigo-400 transition-colors cursor-help" />
                  <div className="absolute bottom-full left-0 mb-2 w-48 bg-slate-900 border border-slate-700 text-slate-300 text-[11px] p-2 rounded-lg shadow-xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-50 font-medium break-keep leading-relaxed">
                      {tooltip}
                  </div>
              </>
          )}
        </div>
        <span className="text-[13px] font-black text-white font-mono">{displayLabel}</span>
      </div>
      <div className="relative flex items-center h-5">
         <input
           type="range"
           min={min}
           max={max}
           value={localValue}
           onChange={handleChange}
           onMouseUp={handleCommit}
           onKeyUp={handleCommit}
           className="w-full h-1.5 rounded-lg appearance-none cursor-pointer focus:outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer"
           style={{ background: `linear-gradient(to right, ${fillColor} ${percentage}%, #1e293b ${percentage}%)` }}
         />
      </div>
    </div>
  );
};
