
import React from 'react';
import { GameTactics, TacticalSliders, Player } from '../../../types';
import { TacticsDataPanel } from './TacticsDataPanel';
import { PlayTypePPP } from './charts/PlayTypePPP';
import { SliderControl } from '../../common/SliderControl';
import { SliderGroupNotes } from '../../common/SliderGroupNotes';
import { DefensiveStats } from '../../../utils/defensiveStats';
import { DEFAULT_SLIDERS } from '../../../services/game/config/tacticPresets';
import {
    OFFENSE_SLIDER_GROUPS, DEFENSE_SLIDER_GROUPS, TACTICS_SLIDER_NOTES,
    type SliderGroupConfig, type SliderItemConfig,
} from './tacticsSliderConfig';

interface TacticsSlidersPanelProps {
    tactics: GameTactics;
    onUpdateTactics: (t: GameTactics) => void;
    roster: Player[];
    defensiveStats?: DefensiveStats;
    slidersOnly?: boolean;
    hideRadar?: boolean;
    hideZoneChart?: boolean;
    /** true면 데이터차트(레이더/존히트맵) 대신 "공격 슬라이더 / 수비 슬라이더 / 플레이타입
     *  그래프" 3열(4:4:2) 레이아웃으로 렌더. MultiTacticsView.tsx 전용 — 기본 false로
     *  싱글플레이어/관리자 에디터는 기존 7:5 그리드 그대로. */
    offenseDefenseSplit?: boolean;
}

/** 슬라이더 그룹 묶음 한 열(그룹 사이 구분선). split 레이아웃은 열 오른쪽에 경계선. */
const SliderColumn: React.FC<{
    groups: SliderGroupConfig[];
    sliders: TacticalSliders;
    onChange: (item: SliderItemConfig, value: number) => void;
    bordered?: boolean;
}> = ({ groups, sliders, onChange, bordered = false }) => (
    <div className={`flex flex-col gap-2 ${bordered ? 'lg:pr-6 lg:border-r lg:border-slate-800' : ''}`}>
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
                        tooltip={item.note}
                    />
                ))}
            </React.Fragment>
        ))}
    </div>
);

export const TacticsSlidersPanel: React.FC<TacticsSlidersPanelProps> = ({ tactics, onUpdateTactics, roster, defensiveStats, slidersOnly, hideRadar, hideZoneChart, offenseDefenseSplit }) => {

    const sliders = { ...DEFAULT_SLIDERS, ...tactics.sliders };

    // mirrorKeys(지역 방어 → zoneUsage)는 한 번의 onUpdateTactics로 같이 갱신한다 — 예전엔 updateSlider를
    // 연달아 두 번 불러 두 번째 호출이 첫 번째 변경을 덮어쓸 수 있었다(감사 A2).
    const updateSlider = (item: SliderItemConfig, val: number) => {
        const next: TacticalSliders = { ...sliders, [item.key]: val };
        for (const k of item.mirrorKeys ?? []) next[k] = val;
        onUpdateTactics({ ...tactics, sliders: next });
    };

    if (offenseDefenseSplit) {
        return (
            <div className="flex flex-col gap-6">
                {/* 공격 슬라이더 / 수비 슬라이더 / 플레이타입 그래프 3열(4:4:2) 배치.
                    bare fr 트랙은 기본 minmax(auto, Nfr)이라 3열(막대+라벨로 min-content가
                    넓은 PlayTypePPP)의 콘텐츠 폭이 비율을 밀어내 실측 시 500:500:437처럼
                    거의 균등하게 나오는 문제가 있었음 — minmax(0, Nfr)로 콘텐츠 최소폭을
                    무시하고 순수 비율대로 나뉘게 강제. */}
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,4fr)_minmax(0,4fr)_minmax(0,2fr)] gap-8">
                    <SliderColumn groups={OFFENSE_SLIDER_GROUPS} sliders={sliders} onChange={updateSlider} bordered />
                    <SliderColumn groups={DEFENSE_SLIDER_GROUPS} sliders={sliders} onChange={updateSlider} bordered />
                    <PlayTypePPP sliders={sliders} />
                </div>
                {/* [2026-10-18] 멀티 전술 화면은 슬라이더별 설명을 라벨 옆 ? 클릭 툴팁(SliderControl tooltip)으로 옮겨
                    하단 설명 표(SliderGroupNotes)를 뺐다. 싱글/어드민(비-split) 레이아웃은 표 유지. */}
            </div>
        );
    }

    return (
        <div className={slidersOnly ? undefined : "grid grid-cols-1 lg:grid-cols-12 gap-8"}>

            {/* Left: Data Charts (7/12) — slidersOnly 모드에서는 숨김 */}
            {!slidersOnly && (
            <div className="lg:col-span-7 lg:pr-6 lg:border-r lg:border-slate-800">
                <TacticsDataPanel sliders={sliders} roster={roster} defensiveStats={defensiveStats} hideRadar={hideRadar} hideZoneChart={hideZoneChart} />
            </div>
            )}

            {/* Right: All Sliders (5/12) — offense + defense stacked */}
            <div className={slidersOnly ? "flex flex-col gap-1" : "lg:col-span-5 lg:pl-2 flex flex-col gap-1"}>

                {/* ── 공격(좌) / 수비(우) 2열 배치: 공격 철학·슈팅 전략을 좌측에, 온볼·오프볼 수비를 우측에 세로로 쌓음 ── */}
                <div className="grid grid-cols-2 gap-x-6">
                    <SliderColumn groups={OFFENSE_SLIDER_GROUPS} sliders={sliders} onChange={updateSlider} />
                    <SliderColumn groups={DEFENSE_SLIDER_GROUPS} sliders={sliders} onChange={updateSlider} />
                </div>

                {/* ── 슬라이더 설명 (전체 통합) ── */}
                <SliderGroupNotes notes={TACTICS_SLIDER_NOTES} />

            </div>

        </div>
    );
};
