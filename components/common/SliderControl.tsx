
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
//   - 티커: 각 step 레이블을 트랙 하단에 균등 배치
export const SliderControl: React.FC<{
    label: string,
    value: number,
    onChange: (val: number) => void,
    min?: number,
    max?: number,
    subLabel?: string,       // 보조 레이블 (우측). 미지정 시 현재 값/단계 레이블 자동 표시
    tooltip?: string,
    steps?: SliderStep[],
    readOnly?: boolean,      // Read-only Bar 타입 (코치 성향 등)
    leftLabel?: string,      // Read-only 타입의 좌측 끝 레이블
    rightLabel?: string,     // Read-only 타입의 우측 끝 레이블
}> = ({ label, value, onChange, min: propMin, max: propMax, subLabel, tooltip, steps, readOnly, leftLabel, rightLabel }) => {

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

  // 보조 레이블: 명시된 경우 그대로, 아니면 자동
  const autoSubLabel = steps
    ? steps[Math.max(0, Math.min(steps.length - 1, localValue))]?.label ?? ''
    : String(localValue);
  const displaySubLabel = subLabel ?? autoSubLabel;

  // Read-only bar 전용 렌더
  if (readOnly) {
    const pct = Math.max(0, Math.min(100, ((value - (propMin ?? 1)) / ((propMax ?? 10) - (propMin ?? 1))) * 100));
    return (
      <div className="space-y-1.5 w-full py-1">
        <div className="flex justify-between items-end">
          <span className="text-xs font-semibold text-white">{label}</span>
        </div>
        <div className="h-1.5 rounded-[4px] overflow-hidden" style={{ backgroundColor: '#27272A' }}>
          <div className="h-full rounded-[4px]" style={{ width: `${pct}%`, backgroundColor: '#4f46e5' }} />
        </div>
        {(leftLabel || rightLabel) && (
          <div className="flex justify-between">
            {leftLabel  && <span className="text-[10px] font-medium text-[#A1A1AA]">{leftLabel}</span>}
            {rightLabel && <span className="text-[10px] font-medium text-[#A1A1AA]">{rightLabel}</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5 w-full py-1">
      {/* 레이블 행 */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-1.5 relative group/tooltip">
          <span className="text-xs font-semibold text-white">{label}</span>
          {tooltip && (
            <>
              <HelpCircle size={12} className="text-[#71717A] hover:text-[#6366f1] transition-colors cursor-help" />
              <div className="absolute bottom-full left-0 mb-2 w-48 bg-[#27272A] border border-[#3F3F46] text-[#A1A1AA] text-[11px] p-2 rounded-lg shadow-xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-50 font-medium break-keep leading-relaxed">
                {tooltip}
              </div>
            </>
          )}
        </div>
        <span className="text-xs font-semibold text-[#A1A1AA]">{displaySubLabel}</span>
      </div>

      {/* 트랙 행 */}
      <div className="relative flex items-center h-5">
        <input
          type="range"
          min={min}
          max={max}
          value={localValue}
          onChange={handleChange}
          onMouseUp={handleCommit}
          onKeyUp={handleCommit}
          className="w-full h-1.5 rounded-[4px] appearance-none cursor-pointer focus:outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer"
          style={{ background: `linear-gradient(to right, #4f46e5 ${percentage}%, #27272A ${percentage}%)` }}
        />
      </div>

      {/* 티커 행 (Step 전용) */}
      {steps && steps.length > 0 && (
        <div className="flex justify-between">
          {steps.map((step, i) => (
            <span
              key={i}
              className="text-[10px] font-medium text-[#A5B4FC]"
              style={{
                textAlign: i === 0 ? 'left' : i === steps.length - 1 ? 'right' : 'center',
              }}
            >
              {step.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
