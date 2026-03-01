
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HelpCircle } from 'lucide-react';

// Reusable Slider Component
// Uses local state during drag so only this component re-renders while dragging.
// Commits to parent (onChange) only on mouseup/keyup — preventing App-level re-renders at 60fps.
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
    valueLabel?: (val: number) => string
}> = ({ label, value, onChange, min = 1, max = 10, leftLabel, rightLabel, tooltip, fillColor = '#6366f1', valueLabel }) => {
  const [localValue, setLocalValue] = useState(value);
  const localValueRef = useRef(value);

  // Sync from parent when parent changes externally (코치 위임, 초기화, 프리셋 불러오기)
  useEffect(() => {
    if (localValueRef.current !== value) {
      localValueRef.current = value;
      setLocalValue(value);
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value);
    localValueRef.current = v;
    setLocalValue(v);
  };

  // Commit to parent only when drag/key interaction ends
  const handleCommit = useCallback(() => {
    onChange(localValueRef.current);
  }, [onChange]);

  const percentage = ((localValue - min) / (max - min)) * 100;

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
        <span className="text-[13px] font-black text-white font-mono">{valueLabel ? valueLabel(localValue) : localValue}</span>
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
