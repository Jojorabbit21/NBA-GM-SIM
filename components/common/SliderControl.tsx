
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { IconButton } from './IconButton';

interface SliderStep {
    value: number;
    label: string;
}

// Reusable Slider Component
// Uses local state during drag so only this component re-renders while dragging.
// Commits to parent (onChange) only on the native 'change' event (drag/key end) — preventing App-level re-renders at 60fps.
//
// steps 모드: steps prop이 제공되면 이산 단계로 동작.
// - value prop은 엔진 값 (예: 2, 5, 9)
// - 내부에서 가장 가까운 step index로 변환
// - onChange는 엔진 값을 emit (예: steps[stepIndex].value)
// - 티커: 각 step 레이블을 트랙 하단에 균등 배치
// ── 설명 툴팁 배치(좌우 + 위아래) ───────────────────────────────────────────────
const TIP_GAP = 8;          // 아이콘과 패널 사이
const TIP_VIEWPORT_MARGIN = 8; // 패널과 화면 좌우 끝 사이 최소 여백
const TIP_MIN_WIDTH = 160;  // 양쪽 다 좁아도 이 폭은 확보(줄바꿈)

/** 패널 폭 w와 아이콘 좌우 위치로 열 방향·최대 폭을 정한다(순수 함수 — 테스트용 export). [2026-10-18]
 *  오른쪽에 들어가면 right, 아니고 왼쪽에 들어가면 left, 둘 다 안 되면 넓은 쪽 + maxWidth(그 공간, 최소 160). */
export function fitTooltipSide(w: number, anchorLeft: number, anchorRight: number, viewportW: number):
    { side: 'right' | 'left'; maxWidth?: number } {
  const spaceRight = viewportW - anchorRight - TIP_GAP - TIP_VIEWPORT_MARGIN;
  const spaceLeft = anchorLeft - TIP_GAP - TIP_VIEWPORT_MARGIN;
  if (w <= spaceRight) return { side: 'right' };
  if (w <= spaceLeft) return { side: 'left' };
  return spaceRight >= spaceLeft
    ? { side: 'right', maxWidth: Math.max(spaceRight, TIP_MIN_WIDTH) }
    : { side: 'left', maxWidth: Math.max(spaceLeft, TIP_MIN_WIDTH) };
}

/** 패널 높이 h와 아이콘 위아래 위치, 보이는 영역(가장 가까운 스크롤 컨테이너 ∩ 뷰포트)으로 세로 정렬을 정한다. [2026-10-18]
 *  'top' = 패널 윗변을 아이콘 윗변에(아래로 펼침, 기본), 'bottom' = 패널 아랫변을 아이콘 아랫변에(위로 펼침).
 *  아래로 펼쳐 보이는 영역을 넘으면 스크롤 컨테이너 높이가 늘어나므로, 아래가 모자라고 위에 들어가면 bottom. 둘 다 모자라면 넓은 쪽. */
export function fitTooltipVertical(h: number, anchorTop: number, anchorBottom: number, boundTop: number, boundBottom: number):
    'top' | 'bottom' {
  const spaceDown = boundBottom - anchorTop - TIP_VIEWPORT_MARGIN;
  const spaceUp = anchorBottom - boundTop - TIP_VIEWPORT_MARGIN;
  if (h <= spaceDown) return 'top';
  if (h <= spaceUp) return 'bottom';
  return spaceDown >= spaceUp ? 'top' : 'bottom';
}

/** el의 가장 가까운 세로 스크롤 컨테이너와 뷰포트가 겹치는 세로 범위 */
function visibleVerticalBounds(el: HTMLElement): { top: number; bottom: number } {
  let top = 0;
  let bottom = window.innerHeight;
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === 'auto' || oy === 'scroll') {
      const r = p.getBoundingClientRect();
      top = Math.max(top, r.top);
      bottom = Math.min(bottom, r.bottom);
      break;
    }
  }
  return { top, bottom };
}

export const SliderControl: React.FC<{
    label: string,
    value: number,
    onChange: (val: number) => void,
    min?: number,
    max?: number,
    subLabel?: string,       // 보조 레이블 (우측). 미지정 시 현재 값/단계 레이블 자동 표시
    tooltip?: React.ReactNode,   // 라벨 옆 ? 클릭 시 팝오버 내용(문자열 또는 노드)
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

  // [2026-10-18] 설명 툴팁 — hover 방식 → 라벨 옆 ? 아이콘 클릭으로 열고, X 버튼 또는 바깥 클릭으로 닫는다.
  // (readOnly 분기보다 먼저 선언 — 훅 순서 고정)
  const [tipOpen, setTipOpen] = useState(false);
  const tipRef = useRef<HTMLSpanElement>(null);      // 아이콘+패널 래퍼(= 아이콘 박스, 바깥 클릭 판정 기준)
  const tipPanelRef = useRef<HTMLDivElement>(null);
  // 열 때마다 기본 배치(오른쪽·윗변 정렬)로 그린 뒤 페인트 전에 2단계로 맞춘다 — 깜빡임 없음.
  // phase 0: 폭 측정 → 좌우(+필요 시 maxWidth) 결정 / phase 1: 그 폭으로 줄바꿈된 높이 측정 → 위아래 결정 / phase 2: 완료.
  // 가로를 먼저 정하는 이유: maxWidth로 좁아지면 높이가 늘어나 세로 판정이 달라진다.
  type TipPlace = { side: 'right' | 'left'; maxWidth?: number; vAlign: 'top' | 'bottom'; phase: 0 | 1 | 2 };
  const TIP_PLACE_INITIAL: TipPlace = { side: 'right', vAlign: 'top', phase: 0 };
  const [tipPlace, setTipPlace] = useState<TipPlace>(TIP_PLACE_INITIAL);
  useLayoutEffect(() => {
    if (!tipOpen || tipPlace.phase === 2) return;
    const panel = tipPanelRef.current;
    const anchor = tipRef.current;
    if (!panel || !anchor) return;
    const r = anchor.getBoundingClientRect(); // 래퍼 span = 아이콘 박스(absolute 패널은 크기에 안 들어감)
    if (tipPlace.phase === 0) {
      setTipPlace({ ...fitTooltipSide(panel.offsetWidth, r.left, r.right, window.innerWidth), vAlign: 'top', phase: 1 });
    } else {
      const b = visibleVerticalBounds(anchor);
      setTipPlace(prev => ({ ...prev, vAlign: fitTooltipVertical(panel.offsetHeight, r.top, r.bottom, b.top, b.bottom), phase: 2 }));
    }
  }, [tipOpen, tipPlace.phase]);
  useEffect(() => {
    if (!tipOpen) return;
    const handleDown = (e: MouseEvent) => {
      if (tipRef.current && !tipRef.current.contains(e.target as Node)) setTipOpen(false);
    };
    document.addEventListener('mousedown', handleDown);
    return () => document.removeEventListener('mousedown', handleDown);
  }, [tipOpen]);

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

  // 커밋은 네이티브 'change' 이벤트로 — 마우스/터치/펜/키보드 모두 조작이 끝날 때 한 번 발생하고, 놓는 위치(트랙 밖)와도
  // 무관하다. 예전엔 onMouseUp/onKeyUp만 달려 있어 패드 터치 드래그에선 커밋이 아예 안 됐다(핸들만 움직이고 부모 상태·
  // 저장 버튼 dirty는 그대로). React onChange는 'input' 이벤트라 ref에 직접 리스너를 단다.
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.addEventListener('change', handleCommit);
    return () => el.removeEventListener('change', handleCommit);
  }, [handleCommit]);

  const percentage = ((localValue - min) / (max - min)) * 100;

  // 값(채워진 비율)에 비례해 어두운 에메랄드(낮음)~밝은 에메랄드(높음)로 채움 색상 변화
  // (hue 160 — 이 앱 전반에서 "좋음/높음"을 나타내는 에메랄드 #10b981과 동일 계열)
  const fillColor = useMemo(() => {
    const lightness = 30 + (Math.max(0, Math.min(100, percentage)) / 100) * 33;
    return `hsl(160, 84%, ${lightness}%)`;
  }, [percentage]);

  // 네이티브 range 썸(핸들)은 트랙 전체 폭이 아니라 (트랙폭 - 썸폭) 구간 안에서만 움직이므로
  // 중심 위치가 항상 "썸 반폭 ~ 트랙폭 - 썸 반폭" 사이에 있다. 그런데 배경 그라데이션의 경계는
  // 단순 percentage%(트랙 전체 폭 기준)로 계산되어 있어서 이 둘이 어긋난다 — 중간값에서는 오차가
  // 작아 안 보이지만 0%/100%(1단계·9단계처럼 끝값 근처)에서는 썸 반폭(7px)만큼 크게 벌어져
  // 핸들이 채움 경계와 어긋나 보였다. calc()로 썸 폭을 보정해 실제 썸 중심 위치와 정확히 맞춘다.
  const THUMB_WIDTH_PX = 14; // w-3.5
  const trackBackground = useMemo(() => {
    const ratio = Math.max(0, Math.min(1, percentage / 100));
    const stop = `calc(${ratio} * (100% - ${THUMB_WIDTH_PX}px) + ${THUMB_WIDTH_PX / 2}px)`;
    return `linear-gradient(to right, ${fillColor} ${stop}, #1e293b ${stop})`;
  }, [fillColor, percentage]);

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
          <span className="text-sm font-semibold text-white">{label}</span>
        </div>
        <div className="h-1.5 rounded-[4px] overflow-hidden" style={{ backgroundColor: '#27272A' }}>
          <div className="h-full rounded-[4px]" style={{ width: `${pct}%`, backgroundColor: '#4f46e5' }} />
        </div>
        {(leftLabel || rightLabel) && (
          <div className="flex justify-between">
            {leftLabel  && <span className="text-sm font-medium text-[#A1A1AA]">{leftLabel}</span>}
            {rightLabel && <span className="text-sm font-medium text-[#A1A1AA]">{rightLabel}</span>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5 w-full py-1">
      {/* 레이블 행 */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-1">
          <span className="text-sm font-semibold text-white">{label}</span>
          {tooltip && (
            // 아이콘 + 패널을 한 래퍼(relative)에 묶어 패널을 아이콘 기준으로 배치. 바깥 클릭 판정도 이 래퍼 기준
            <span className="relative inline-flex" ref={tipRef}>
              <IconButton
                label={`${label} 설명`}
                size="xs"
                tone="ghost"
                shape="full"
                onClick={() => { setTipPlace(TIP_PLACE_INITIAL); setTipOpen(o => !o); }}
                aria-expanded={tipOpen}
                className={tipOpen ? '!text-indigo-400' : ''}
              >
                <HelpCircle size={14} />
              </IconButton>
              {/* [2026-10-18] 아이콘 오른쪽에 연다(패널 윗변 = 아이콘 윗변, 간격 8px). 오른쪽 공간이 모자라면 왼쪽으로(fitTooltipSide),
                  아래 공간이 모자라면 아랫변을 아이콘 아랫변에(fitTooltipVertical) — 위로 열면 첫 슬라이더에서 스크롤 컨테이너 위쪽에 잘린다.
                  배경 slate-900 + 흰 글자, 테두리 slate-600 / 8px, 레이어는 툴팁 전용 z-tooltip */}
              {tipOpen && (
                <div
                  ref={tipPanelRef}
                  role="dialog"
                  aria-label={`${label} 설명`}
                  className={`absolute ${tipPlace.vAlign === 'top' ? 'top-0' : 'bottom-0'} ${tipPlace.side === 'right' ? 'left-full ml-2' : 'right-full mr-2'} w-max max-w-[min(24rem,calc(100vw-2rem))] z-tooltip bg-slate-900 border border-slate-600 rounded-lg shadow-xl p-3 pr-9 text-sm text-white leading-relaxed break-keep`}
                  style={tipPlace.maxWidth !== undefined ? { maxWidth: tipPlace.maxWidth } : undefined}
                >
                  {tooltip}
                  <IconButton label="닫기" size="xs" tone="ghost" onClick={() => setTipOpen(false)} className="absolute top-2.5 right-2.5">
                    <X size={12} />
                  </IconButton>
                </div>
              )}
            </span>
          )}
        </div>
        <span className="text-sm font-semibold text-[#A1A1AA]">{displaySubLabel}</span>
      </div>

      {/* 트랙 행 — 바디/핸들 보더 라디우스를 rounded-full이 아닌 핸들 너비(w-3.5=14px)의
          절반인 7px로 통일 */}
      <div className="relative flex items-center h-8">
        <input
          type="range"
          min={min}
          max={max}
          value={localValue}
          ref={inputRef}
          onChange={handleChange}
          className="w-full h-8 rounded-[7px] appearance-none cursor-pointer focus:outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-8 [&::-webkit-slider-thumb]:rounded-[7px] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-8 [&::-moz-range-thumb]:rounded-[7px] [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer"
          style={{ background: trackBackground }}
        />
      </div>
    </div>
  );
};
