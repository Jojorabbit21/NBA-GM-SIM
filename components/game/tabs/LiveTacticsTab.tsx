import React, { useCallback } from 'react';
import { GameTactics, TacticalSliders } from '../../../types';
import { SliderControl } from '../../common/SliderControl';
import { SliderNoteContent } from '../../dashboard/tactics/SliderNoteContent';
import { DEFAULT_SLIDERS } from '../../../services/game/config/tacticPresets';
import { OFFENSE_SLIDER_GROUPS, DEFENSE_SLIDER_GROUPS, type SliderGroupConfig, type SliderItemConfig } from '../../dashboard/tactics/tacticsSliderConfig';

// [2026-11-23] 라이브 경기 "전술 설정" 탭 — 멀티 전술 화면(TacticsSlidersPanel split 레이아웃)과 같은 슬라이더 구성·문구를 쓴다:
// 공격(공격 철학·슈팅 전략) | 수비(온볼·오프볼) 2열, 슬라이더 설명은 라벨 옆 ? 툴팁(SliderNoteContent). 하단 설명 표 없음.
// 예전에 이 탭 하단에 있던 팀 스탯 비교는 "경기 기록" 탭, 하프코트 샷 차트는 "샷 차트" 탭으로 옮겼고 플레이타입 PPP 표는 삭제했다.

interface LiveTacticsTabProps {
    userTactics: GameTactics;
    onApplyTactics: (sliders: GameTactics['sliders']) => void;
    /** 코치 위임·일시정지 중 — 슬라이더 인터랙션 차단 */
    disabled?: boolean;
    /** disabled일 때 상단 안내 문구 — 기본은 코치 위임 중 */
    disabledMessage?: string;
}

const SliderColumn: React.FC<{
    groups: SliderGroupConfig[];
    sliders: TacticalSliders;
    onChange: (item: SliderItemConfig, value: number) => void;
    bordered?: boolean;
}> = ({ groups, sliders, onChange, bordered = false }) => (
    <div className={`flex flex-col gap-2 ${bordered ? 'lg:pr-8 lg:border-r lg:border-slate-800' : ''}`}>
        {groups.map((g, gi) => (
            <React.Fragment key={g.title}>
                {gi > 0 && <div className="h-px bg-slate-700 my-4" />}
                <h4 className="text-base font-black text-white">{g.title}</h4>
                {g.items.map(item => (
                    <SliderControl
                        key={item.key}
                        label={item.label}
                        value={sliders[item.key]}
                        onChange={v => onChange(item, v)}
                        steps={item.steps}
                        tooltip={<SliderNoteContent lines={item.note} />}
                    />
                ))}
            </React.Fragment>
        ))}
    </div>
);

export const LiveTacticsTab: React.FC<LiveTacticsTabProps> = ({
    userTactics, onApplyTactics, disabled = false, disabledMessage = '코치 지휘 중 — 전술 변경이 잠겨 있습니다',
}) => {
    const sliders = { ...DEFAULT_SLIDERS, ...userTactics.sliders };

    // mirrorKeys(지역 방어 → zoneUsage)는 한 번에 같이 갱신 — TacticsSlidersPanel과 같은 규칙
    const updateSlider = useCallback((item: SliderItemConfig, val: number) => {
        const next: TacticalSliders = { ...sliders, [item.key]: val };
        for (const k of item.mirrorKeys ?? []) next[k] = val;
        onApplyTactics(next);
    }, [sliders, onApplyTactics]);

    return (
        <div className="p-8 flex flex-col gap-6">
            {disabled && (
                <div className="px-3 py-1.5 bg-amber-600/15 border-l-2 border-amber-500 text-amber-300 text-xs">
                    {disabledMessage}
                </div>
            )}
            <div className={`grid grid-cols-1 lg:grid-cols-2 gap-8${disabled ? ' pointer-events-none opacity-60' : ''}`}>
                <SliderColumn groups={OFFENSE_SLIDER_GROUPS} sliders={sliders} onChange={updateSlider} bordered />
                <SliderColumn groups={DEFENSE_SLIDER_GROUPS} sliders={sliders} onChange={updateSlider} />
            </div>
        </div>
    );
};
