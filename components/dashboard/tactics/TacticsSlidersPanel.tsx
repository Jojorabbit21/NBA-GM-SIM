
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { HelpCircle, ChevronDown, Target, Shield, ShieldAlert } from 'lucide-react';
import { GameTactics, TacticalSliders, Player } from '../../../types';
import { calculatePlayerOvr } from '../../../utils/constants';

interface TacticsSlidersPanelProps {
    tactics: GameTactics;
    onUpdateTactics: (t: GameTactics) => void;
    roster: Player[];
}

// Reusable Slider Component
// Uses local state during drag so only this component re-renders while dragging.
// Commits to parent (onUpdateTactics) only on mouseup/keyup — preventing App-level re-renders at 60fps.
const SliderControl: React.FC<{
    label: string,
    value: number,
    onChange: (val: number) => void,
    min?: number,
    max?: number,
    leftLabel?: string,
    rightLabel?: string,
    tooltip?: string,
    colorClass?: string
}> = ({ label, value, onChange, min = 1, max = 10, leftLabel, rightLabel, tooltip, colorClass = "accent-indigo-500" }) => {
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

  return (
    <div className="space-y-2 w-full py-2">
      <div className="flex justify-between items-end">
        <div className="flex items-center gap-1.5 relative group/tooltip">
          <span className="text-xs font-bold text-slate-300 tracking-tight cursor-help">{label}</span>
          {tooltip && (
              <>
                  <HelpCircle size={12} className="text-slate-600 hover:text-indigo-400 transition-colors cursor-help" />
                  <div className="absolute bottom-full left-0 mb-2 w-48 bg-slate-900 border border-slate-700 text-slate-300 text-[10px] p-2 rounded-lg shadow-xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-50 font-medium break-keep leading-relaxed">
                      {tooltip}
                  </div>
              </>
          )}
        </div>
        <span className="text-sm font-black text-white font-mono">{localValue}</span>
      </div>
      <div className="relative flex items-center h-6">
         <input
           type="range"
           min={min}
           max={max}
           value={localValue}
           onChange={handleChange}
           onMouseUp={handleCommit}
           onKeyUp={handleCommit}
           className={`w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer hover:bg-slate-700 focus:outline-none ${colorClass}`}
         />
      </div>
      <div className="flex justify-between text-[10px] font-bold text-slate-500 tracking-tighter">
         <span>{leftLabel}</span>
         <span>{rightLabel}</span>
      </div>
    </div>
  );
};

export const TacticsSlidersPanel: React.FC<TacticsSlidersPanelProps> = ({ tactics, onUpdateTactics, roster }) => {

    const { sliders, stopperId } = tactics;

    const updateSlider = (key: keyof TacticalSliders, val: number) => {
        onUpdateTactics({ ...tactics, sliders: { ...sliders, [key]: val } });
    };

    const handleStopperChange = (playerId: string) => {
        if (playerId) {
            onUpdateTactics({ ...tactics, stopperId: playerId });
        } else {
            onUpdateTactics({ ...tactics, stopperId: undefined });
        }
    };

    const sortedRoster = useMemo(() => [...roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)), [roster]);

    return (
        <div className="flex flex-col gap-12">

            {/* ── OFFENSE SECTION ── */}
            <div className="space-y-6">
                <div className="flex items-center gap-3 border-l-4 border-orange-500 pl-4">
                    <Target size={24} className="text-orange-400" />
                    <h3 className="text-xl font-black text-white uppercase tracking-widest oswald">Offense Settings</h3>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 bg-slate-900/50 p-6 rounded-3xl border border-slate-800">

                    {/* Col 1: 게임 운영 */}
                    <div className="space-y-6">
                        <h4 className="text-sm font-black text-orange-400 tracking-tight">게임 운영</h4>
                        <div className="flex flex-col gap-4">
                            <SliderControl
                                label="게임 템포" value={sliders.pace} onChange={v => updateSlider('pace', v)}
                                leftLabel="느림" rightLabel="빠름" tooltip="높을수록 빠른 공수전환과 얼리 오펜스를 시도합니다." colorClass="accent-orange-500"
                            />
                            <SliderControl
                                label="볼 회전" value={sliders.ballMovement} onChange={v => updateSlider('ballMovement', v)}
                                leftLabel="개인기" rightLabel="팀 패스" tooltip="높을수록 더 많은 패스를 돌려 오픈 찬스를 찾지만, 턴오버 위험도 증가합니다." colorClass="accent-orange-500"
                            />
                            <SliderControl
                                label="공격 리바운드" value={sliders.offReb} onChange={v => updateSlider('offReb', v)}
                                leftLabel="백코트" rightLabel="적극 가담" tooltip="높을수록 슛 이후 공격 리바운드에 가담하지만, 상대 속공에 취약해집니다." colorClass="accent-orange-500"
                            />
                        </div>
                    </div>

                    {/* Col 2: 슈팅 전략 */}
                    <div className="space-y-6 lg:border-l lg:border-slate-800 lg:pl-8">
                         <h4 className="text-sm font-black text-emerald-400 tracking-tight">슈팅 전략</h4>
                         <div className="flex flex-col gap-6">
                            <SliderControl
                                label="3점 슛 빈도" value={sliders.shot_3pt} onChange={v => updateSlider('shot_3pt', v)}
                                leftLabel="자제" rightLabel="난사" tooltip="팀의 3점 시도 빈도를 결정합니다. 팀 평균 3점 능력에 맞게 설정하세요." colorClass="accent-emerald-500"
                            />
                            <SliderControl
                                label="골밑 공격 빈도" value={sliders.shot_rim} onChange={v => updateSlider('shot_rim', v)}
                                leftLabel="자제" rightLabel="적극" tooltip="림 어택 빈도입니다. 가장 효율적인 슛 구역으로, 드라이브/컷 능력과 연계됩니다." colorClass="accent-emerald-500"
                            />
                            <SliderControl
                                label="중거리 슛 빈도" value={sliders.shot_mid} onChange={v => updateSlider('shot_mid', v)}
                                leftLabel="자제" rightLabel="적극" tooltip="중거리 슛은 효율이 낮습니다. 엘리트 미드레인지 슈터가 없다면 낮게 유지하세요." colorClass="accent-emerald-500"
                            />
                        </div>
                    </div>

                    {/* Col 3: 공격 루트 비중 */}
                    <div className="space-y-6 lg:border-l lg:border-slate-800 lg:pl-8">
                        <h4 className="text-sm font-black text-blue-400 tracking-tight">공격 루트 비중</h4>
                        <div className="flex flex-col gap-6">
                            <SliderControl label="픽앤롤 (P&R)" value={sliders.play_pnr} onChange={v => updateSlider('play_pnr', v)} leftLabel="낮음" rightLabel="높음" tooltip="핸들러+스크리너 콤보가 좋을수록 효과적입니다. 현대 NBA의 핵심 공격 패턴." colorClass="accent-blue-500" />
                            <SliderControl label="아이솔레이션 (Iso)" value={sliders.play_iso} onChange={v => updateSlider('play_iso', v)} leftLabel="낮음" rightLabel="높음" tooltip="진짜 ISO 스코어러가 없다면 낮게 유지하세요. 고임계값에서만 효율적." colorClass="accent-blue-500" />
                            <SliderControl label="포스트업 (Post)" value={sliders.play_post} onChange={v => updateSlider('play_post', v)} leftLabel="낮음" rightLabel="높음" tooltip="도미넌트 포스트맨이 있을 때만 높게 설정하세요. 현대 NBA에서 기본 효율 낮음." colorClass="accent-blue-500" />
                            <SliderControl label="캐치 앤 슛 (Spot Up)" value={sliders.play_cns} onChange={v => updateSlider('play_cns', v)} leftLabel="낮음" rightLabel="높음" tooltip="팀 전체의 스패이싱 능력에 따라 설정하세요." colorClass="accent-blue-500" />
                            <SliderControl label="컷인 & 돌파 (Cut)" value={sliders.play_drive} onChange={v => updateSlider('play_drive', v)} leftLabel="낮음" rightLabel="높음" tooltip="드라이브/컷 능력이 좋은 선수가 있을수록 효과적입니다." colorClass="accent-blue-500" />
                        </div>
                    </div>

                </div>
            </div>

            {/* ── DEFENSE SECTION ── */}
            <div className="space-y-6">
                <div className="flex items-center gap-3 border-l-4 border-indigo-500 pl-4">
                    <Shield size={24} className="text-indigo-400" />
                    <h3 className="text-xl font-black text-white uppercase tracking-widest oswald">Defense Settings</h3>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 bg-slate-900/50 p-6 rounded-3xl border border-slate-800">

                    {/* Col 1: 수비 스타일 */}
                    <div className="space-y-6">
                        <h4 className="text-sm font-black text-indigo-400 tracking-tight">수비 스타일</h4>
                        <div className="flex flex-col gap-6">
                            <SliderControl
                                label="수비 압박 강도" value={sliders.defIntensity} onChange={v => updateSlider('defIntensity', v)}
                                leftLabel="느슨하게" rightLabel="타이트" tooltip="높을수록 상대 야투 억제와 스틸 시도가 늘어나지만, 파울 트러블 위험이 커집니다." colorClass="accent-indigo-500"
                            />
                            <SliderControl
                                label="헬프 수비 빈도" value={sliders.helpDef} onChange={v => updateSlider('helpDef', v)}
                                leftLabel="대인 마크" rightLabel="적극 지원" tooltip="높을수록 페인트존 보호가 강해지지만, 외곽 3점슛을 허용할 위험이 커집니다." colorClass="accent-indigo-500"
                            />
                            <SliderControl
                                label="스위치 수비 빈도" value={sliders.switchFreq} onChange={v => updateSlider('switchFreq', v)}
                                leftLabel="따라가기" rightLabel="스위치" tooltip="스크린 대처 방식입니다. 높을수록 미스매치가 발생할 확률이 높지만 오픈 찬스는 줄어듭니다." colorClass="accent-indigo-500"
                            />
                        </div>
                    </div>

                    {/* Col 2: 수비 시스템 + AceStopper */}
                    <div className="space-y-6 lg:border-l lg:border-slate-800 lg:pl-8">

                        <div className="space-y-4">
                            <h4 className="text-sm font-black text-fuchsia-400 tracking-tight">수비 시스템</h4>
                            <div className="flex flex-col gap-6">
                                <SliderControl
                                    label="풀 코트 프레스" value={sliders.fullCourtPress} onChange={v => updateSlider('fullCourtPress', v)}
                                    leftLabel="안함" rightLabel="자주" tooltip="체력을 급격히 소모하며 턴오버를 유발합니다. 가드 스태미나/스피드가 높을 때만 효과적." colorClass="accent-fuchsia-500"
                                />
                                <SliderControl
                                    label="지역 방어 빈도" value={sliders.zoneFreq} onChange={v => { updateSlider('zoneFreq', v); updateSlider('zoneUsage', v); }}
                                    leftLabel="대인 방어" rightLabel="지역 방어" tooltip="내선 수비력(블락+인사이드수비)이 강한 팀에게 유리합니다. 외곽 수비력이 강하면 대인을 추천." colorClass="accent-fuchsia-500"
                                />
                            </div>
                        </div>

                        <div className="h-px bg-slate-800 my-4"></div>

                        <div className="space-y-2">
                             <label className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center gap-1.5">
                                <ShieldAlert size={12} /> 에이스 스토퍼 (Ace Stopper)
                            </label>
                            <div className="relative group">
                                <select
                                    value={stopperId || ""}
                                    onChange={(e) => handleStopperChange(e.target.value)}
                                    disabled={sliders.zoneFreq >= 8}
                                    className={`w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-xs font-bold text-white focus:outline-none focus:border-indigo-500 appearance-none shadow-inner transition-all ${sliders.zoneFreq >= 8 ? 'opacity-50 cursor-not-allowed text-slate-500' : 'cursor-pointer hover:border-slate-500'}`}
                                >
                                    {sliders.zoneFreq >= 8 ? (
                                        <option value="">지역 방어 사용 중 (지정 불가)</option>
                                    ) : (
                                        <option value="">지정 안함 (팀 수비 모드)</option>
                                    )}

                                    {sliders.zoneFreq < 8 && sortedRoster.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} ({p.position}) - OVR {calculatePlayerOvr(p)}</option>
                                    ))}
                                </select>
                                {!stopperId && sliders.zoneFreq < 8 && <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" size={16} />}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};
