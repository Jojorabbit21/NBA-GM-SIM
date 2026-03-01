
import React from 'react';
import { GameTactics, TacticalSliders, Player } from '../../../types';
import { TacticsDataPanel } from './TacticsDataPanel';
import { SliderControl } from '../../common/SliderControl';
import { DefensiveStats } from '../../../utils/defensiveStats';
import { DEFAULT_SLIDERS } from '../../../services/game/config/tacticPresets';
import { SLIDER_STEPS } from '../../../services/game/config/sliderSteps';

// pnrDefense는 엔진이 0-2를 직접 사용하므로 별도 steps 정의
const PNR_STEPS = [
    { value: 0, label: '드랍' },
    { value: 1, label: '헷지' },
    { value: 2, label: '블리츠' },
];

interface TacticsSlidersPanelProps {
    tactics: GameTactics;
    onUpdateTactics: (t: GameTactics) => void;
    roster: Player[];
    defensiveStats?: DefensiveStats;
}

export const TacticsSlidersPanel: React.FC<TacticsSlidersPanelProps> = ({ tactics, onUpdateTactics, roster, defensiveStats }) => {

    const sliders = { ...DEFAULT_SLIDERS, ...tactics.sliders };

    const updateSlider = (key: keyof TacticalSliders, val: number) => {
        onUpdateTactics({ ...tactics, sliders: { ...sliders, [key]: val } });
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* Left: Data Charts (7/12) */}
            <div className="lg:col-span-7 lg:pr-6 lg:border-r lg:border-slate-800">
                <TacticsDataPanel sliders={sliders} roster={roster} defensiveStats={defensiveStats} />
            </div>

            {/* Right: All Sliders (5/12) — offense + defense stacked */}
            <div className="lg:col-span-5 lg:pl-2 flex flex-col gap-1">

                {/* ── OFFENSE ── */}
                <div className="grid grid-cols-2 gap-x-6">
                    {/* Left col: 게임 운영 + 슈팅 전략 */}
                    <div className="flex flex-col gap-1">
                        <h4 className="text-sm font-black text-white uppercase tracking-widest">게임 운영</h4>
                        <SliderControl label="게임 템포" value={sliders.pace} onChange={v => updateSlider('pace', v)}
                            steps={SLIDER_STEPS.pace} tooltip="빠를수록 빠른 공수전환과 얼리 오펜스를 시도합니다." fillColor="#f97316" />
                        <SliderControl label="볼 회전" value={sliders.ballMovement} onChange={v => updateSlider('ballMovement', v)}
                            steps={SLIDER_STEPS.ballMovement} tooltip="패스 위주일수록 오픈 찬스를 찾지만, 턴오버 위험도 증가합니다." fillColor="#f97316" />
                        <SliderControl label="공격 리바운드" value={sliders.offReb} onChange={v => updateSlider('offReb', v)}
                            steps={SLIDER_STEPS.offReb} tooltip="적극 가담할수록 세컨드찬스가 늘지만, 상대 속공에 취약해집니다." fillColor="#f97316" />

                        <div className="h-px bg-slate-800 my-2" />

                        <h4 className="text-sm font-black text-white uppercase tracking-widest">슈팅 전략</h4>
                        <SliderControl label="3점 슛 빈도" value={sliders.shot_3pt} onChange={v => updateSlider('shot_3pt', v)}
                            steps={SLIDER_STEPS.shot_3pt} tooltip="팀의 3점 시도 빈도를 결정합니다." fillColor="#10b981" />
                        <SliderControl label="골밑 공격 빈도" value={sliders.shot_rim} onChange={v => updateSlider('shot_rim', v)}
                            steps={SLIDER_STEPS.shot_rim} tooltip="가장 효율적인 슛 구역으로, 드라이브/컷 능력과 연계됩니다." fillColor="#10b981" />
                        <SliderControl label="중거리 슛 빈도" value={sliders.shot_mid} onChange={v => updateSlider('shot_mid', v)}
                            steps={SLIDER_STEPS.shot_mid} tooltip="중거리 슛은 효율이 낮습니다. 엘리트 미드레인지 슈터가 없다면 소극적으로 유지하세요." fillColor="#10b981" />
                    </div>

                    {/* Right col: 공격 루트 비중 */}
                    <div className="flex flex-col gap-1">
                        <h4 className="text-sm font-black text-white uppercase tracking-widest">공격 루트 비중</h4>
                        <SliderControl label="픽앤롤 (P&R)" value={sliders.play_pnr} onChange={v => updateSlider('play_pnr', v)}
                            steps={SLIDER_STEPS.play_pnr} tooltip="핸들러+스크리너 콤보가 좋을수록 효과적입니다. 현대 농구의 핵심 공격 패턴." fillColor="#3b82f6" />
                        <SliderControl label="아이솔레이션 (Iso)" value={sliders.play_iso} onChange={v => updateSlider('play_iso', v)}
                            steps={SLIDER_STEPS.play_iso} tooltip="진짜 ISO 스코어러가 없다면 소극적으로 유지하세요." fillColor="#3b82f6" />
                        <SliderControl label="포스트업 (Post)" value={sliders.play_post} onChange={v => updateSlider('play_post', v)}
                            steps={SLIDER_STEPS.play_post} tooltip="도미넌트 포스트맨이 있을 때만 적극적으로 설정하세요." fillColor="#3b82f6" />
                        <SliderControl label="캐치 앤 슛 (Spot Up)" value={sliders.play_cns} onChange={v => updateSlider('play_cns', v)}
                            steps={SLIDER_STEPS.play_cns} tooltip="팀 전체의 스패이싱 능력에 따라 설정하세요." fillColor="#3b82f6" />
                        <SliderControl label="컷인 & 돌파 (Cut)" value={sliders.play_drive} onChange={v => updateSlider('play_drive', v)}
                            steps={SLIDER_STEPS.play_drive} tooltip="드라이브/컷 능력이 좋은 선수가 있을수록 효과적입니다." fillColor="#3b82f6" />
                    </div>
                </div>

                {/* ── Divider ── */}
                <div className="h-px bg-slate-700 my-4" />

                {/* ── DEFENSE ── */}
                <div className="grid grid-cols-2 gap-x-6">
                    {/* Left col: 온볼 수비 */}
                    <div className="flex flex-col gap-1">
                        <h4 className="text-sm font-black text-white uppercase tracking-widest">온볼 수비</h4>
                        <SliderControl label="수비 압박 강도" value={sliders.defIntensity} onChange={v => updateSlider('defIntensity', v)}
                            steps={SLIDER_STEPS.defIntensity} tooltip="타이트할수록 스틸 시도가 늘어나지만, 파울 트러블 위험이 커집니다." fillColor="#6366f1" />
                        <SliderControl label="스위치 수비" value={sliders.switchFreq} onChange={v => updateSlider('switchFreq', v)}
                            steps={SLIDER_STEPS.switchFreq} tooltip="스크린 대처 방식입니다. 스위치할수록 미스매치 위험이 있지만 오픈 찬스는 줄어듭니다." fillColor="#6366f1" />
                        <SliderControl label="픽앤롤 수비" value={sliders.pnrDefense} onChange={v => updateSlider('pnrDefense', v)}
                            steps={PNR_STEPS}
                            tooltip="드랍: 빅맨이 뒤로 빠져 림 보호(미드레인지 허용). 헷지: 빅맨이 순간 나와 핸들러 지연 후 복귀. 블리츠: 빅맨이 볼 핸들러를 더블팀(턴오버 유발, 킥아웃 3점 허용)."
                            fillColor="#6366f1" />
                        <SliderControl label="풀코트 프레스" value={sliders.fullCourtPress} onChange={v => updateSlider('fullCourtPress', v)}
                            steps={SLIDER_STEPS.fullCourtPress} tooltip="체력을 급격히 소모하며 턴오버를 유발합니다. 가드 스태미나/스피드가 높을 때만 효과적." fillColor="#6366f1" />
                    </div>

                    {/* Right col: 오프볼 수비 */}
                    <div className="flex flex-col gap-1">
                        <h4 className="text-sm font-black text-white uppercase tracking-widest">오프볼 수비</h4>
                        <SliderControl label="헬프 수비" value={sliders.helpDef} onChange={v => updateSlider('helpDef', v)}
                            steps={SLIDER_STEPS.helpDef} tooltip="적극 지원할수록 페인트존 보호가 강해지지만, 외곽 3점슛을 허용할 위험이 커집니다." fillColor="#d946ef" />
                        <SliderControl label="지역 방어" value={sliders.zoneFreq} onChange={v => { updateSlider('zoneFreq', v); updateSlider('zoneUsage', v); }}
                            steps={SLIDER_STEPS.zoneFreq} tooltip="내선 수비력(블락+인사이드수비)이 강한 팀에게 유리합니다." fillColor="#d946ef" />
                        <SliderControl label="수비 리바운드" value={sliders.defReb} onChange={v => updateSlider('defReb', v)}
                            steps={SLIDER_STEPS.defReb} tooltip="박스아웃할수록 세컨드찬스를 줄이지만, 속공 전환이 느려집니다." fillColor="#d946ef" />
                    </div>
                </div>

            </div>

        </div>
    );
};
