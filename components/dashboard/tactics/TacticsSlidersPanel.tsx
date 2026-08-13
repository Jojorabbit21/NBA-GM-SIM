
import React from 'react';
import { GameTactics, TacticalSliders, Player } from '../../../types';
import { TacticsDataPanel } from './TacticsDataPanel';
import { SliderControl } from '../../common/SliderControl';
import { SliderGroupNotes } from '../../common/SliderGroupNotes';
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
    slidersOnly?: boolean;
    hideRadar?: boolean;
}

export const TacticsSlidersPanel: React.FC<TacticsSlidersPanelProps> = ({ tactics, onUpdateTactics, roster, defensiveStats, slidersOnly, hideRadar }) => {

    const sliders = { ...DEFAULT_SLIDERS, ...tactics.sliders };

    const updateSlider = (key: keyof TacticalSliders, val: number) => {
        onUpdateTactics({ ...tactics, sliders: { ...sliders, [key]: val } });
    };

    return (
        <div className={slidersOnly ? undefined : "grid grid-cols-1 lg:grid-cols-12 gap-8"}>

            {/* Left: Data Charts (7/12) — slidersOnly 모드에서는 숨김 */}
            {!slidersOnly && (
            <div className="lg:col-span-7 lg:pr-6 lg:border-r lg:border-slate-800">
                <TacticsDataPanel sliders={sliders} roster={roster} defensiveStats={defensiveStats} hideRadar={hideRadar} />
            </div>
            )}

            {/* Right: All Sliders (5/12) — offense + defense stacked */}
            <div className={slidersOnly ? "flex flex-col gap-1" : "lg:col-span-5 lg:pl-2 flex flex-col gap-1"}>

                {/* ── OFFENSE ── */}
                <div className="grid grid-cols-2 gap-x-6">
                    {/* Left col: 공격 철학 (게임 운영 + 코칭 철학 통합) */}
                    <div className="flex flex-col gap-1">
                        <h4 className="text-sm font-black text-white uppercase tracking-widest">공격 철학</h4>
                        <SliderControl label="페이스" value={sliders.pace} onChange={v => updateSlider('pace', v)}
                            steps={SLIDER_STEPS.pace} />
                        <SliderControl label="볼 회전" value={sliders.ballMovement} onChange={v => updateSlider('ballMovement', v)}
                            steps={SLIDER_STEPS.ballMovement} />
                        <SliderControl label="공격 리바운드" value={sliders.offReb} onChange={v => updateSlider('offReb', v)}
                            steps={SLIDER_STEPS.offReb} />
                        <SliderControl label="공격 포인트" value={sliders.insideOut} onChange={v => updateSlider('insideOut', v)}
                            steps={SLIDER_STEPS.insideOut} />
                        <SliderControl label="픽앤롤 빈도" value={sliders.pnrFreq} onChange={v => updateSlider('pnrFreq', v)}
                            steps={SLIDER_STEPS.pnrFreq} />
                    </div>

                    {/* Right col: 슈팅 전략 (구 코칭 철학 자리) */}
                    <div className="flex flex-col gap-1">
                        <h4 className="text-sm font-black text-white uppercase tracking-widest">슈팅 전략</h4>
                        <SliderControl label="3점 슛 빈도" value={sliders.shot_3pt} onChange={v => updateSlider('shot_3pt', v)}
                            steps={SLIDER_STEPS.shot_3pt} />
                        <SliderControl label="골밑 공격 빈도" value={sliders.shot_rim} onChange={v => updateSlider('shot_rim', v)}
                            steps={SLIDER_STEPS.shot_rim} />
                        <SliderControl label="미드레인지 빈도" value={sliders.shot_mid} onChange={v => updateSlider('shot_mid', v)}
                            steps={SLIDER_STEPS.shot_mid} />
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
                            steps={SLIDER_STEPS.defIntensity} />
                        <SliderControl label="스위치 수비" value={sliders.switchFreq} onChange={v => updateSlider('switchFreq', v)}
                            steps={SLIDER_STEPS.switchFreq} />
                        <SliderControl label="픽앤롤 수비" value={sliders.pnrDefense} onChange={v => updateSlider('pnrDefense', v)}
                            steps={PNR_STEPS} />
                        <SliderControl label="풀코트 프레스" value={sliders.fullCourtPress} onChange={v => updateSlider('fullCourtPress', v)}
                            steps={SLIDER_STEPS.fullCourtPress} />
                    </div>

                    {/* Right col: 오프볼 수비 */}
                    <div className="flex flex-col gap-1">
                        <h4 className="text-sm font-black text-white uppercase tracking-widest">오프볼 수비</h4>
                        <SliderControl label="헬프 수비" value={sliders.helpDef} onChange={v => updateSlider('helpDef', v)}
                            steps={SLIDER_STEPS.helpDef} />
                        <SliderControl label="지역 방어" value={sliders.zoneFreq} onChange={v => { updateSlider('zoneFreq', v); updateSlider('zoneUsage', v); }}
                            steps={SLIDER_STEPS.zoneFreq} />
                        <SliderControl label="수비 리바운드" value={sliders.defReb} onChange={v => updateSlider('defReb', v)}
                            steps={SLIDER_STEPS.defReb} />
                    </div>
                </div>

                {/* ── 슬라이더 설명 (전체 통합) ── */}
                <SliderGroupNotes notes={[
                    { label: '페이스', text: '낮을수록 더 많은 샷클락을 소모합니다. 높을수록 트랜지션 공격의 빈도가 늘어나지만 더 많은 체력을 소모하며 턴오버 확률이 증가합니다. 발이 빠른 드라이버나 좋은 패서가 있다면 트랜지션이 유효할 수 있습니다.' },
                    { label: '볼 회전', text: '낮을수록 코트 위에서 가장 뛰어난 선수에게 공격 기회를 몰아주어 더 많은 아이솔레이션과 포스트업을 시도하게 되며 팀의 전체적인 어시스트가 줄어들 수 있습니다. 반대로 높을수록 핸드오프 액션, 캐치앤슛, 컷인 등 패스 플레이를 더 많이 시도합니다.' },
                    { label: '공격 리바운드', text: '낮을수록 공격 리바운드 경합에 적은 선수가 참여하고 빠르게 백코트를 시도합니다. 높을수록 더 많은 선수들이 공격 리바운드를 잡기 위해 달려들게 되지만 만약 공격 리바운드를 잡는데 실패한다면 상대방의 속공에 당할 확률이 높아집니다.' },
                    { label: '공격 포인트', text: '코트의 어느 부분을 공략할지를 결정합니다. 낮을수록 골밑과 가까운 쪽의 공격을 더 많이 시도하며 반대로 높을수록 외곽 공격의 비중이 높아집니다. 강력한 빅맨이 있다면 슬라이더를 낮게, 뛰어난 가드가 있다면 슬라이더를 높게 유지하는 것이 도움이 될 수 있습니다.' },
                    { label: '픽앤롤 빈도', text: '픽앤롤을 얼마나 자주 실행할지를 결정합니다. 픽앤롤은 롤/팝/핸들러로 나뉘며 이것의 비중은 다른 공격 슬라이더들에 의해 결정됩니다. 예를 들어 픽앤롤 빈도를 높게 설정하고 공격 포인트를 높게 설정하면 스크리너는 림으로 쇄도하지 않고 픽앤팝을 더 많이 시도합니다.' },
                    { label: '3점 슛 빈도', text: '팀의 3점 시도 빈도를 결정합니다.' },
                    { label: '골밑 공격 빈도', text: '가장 효율적인 슛 구역으로, 드라이브/컷 능력과 연계됩니다.' },
                    { label: '미드레인지 빈도', text: '중거리 슛은 효율이 낮습니다. 엘리트 미드레인지 슈터가 없다면 소극적으로 유지하세요.' },
                    { label: '수비 압박 강도', text: '아크 내에서의 수비 강도를 결정합니다. 낮을수록 파울 확률은 감소하지만 상대방의 득점 확률이 소폭 상승합니다. 반대로 높게 설정하면 파울 확률과 체력 소모가 증가하지만 상대방의 득점 확률을 감소시킬 수 있습니다. 팀의 전체적인 수비 능력에 따라 설정하세요.' },
                    { label: '스위치 수비', text: '픽앤롤, 핸드오프 등의 스크린 액션에서 어떻게 스위치하여 수비할지를 결정합니다. 낮을수록 스위치 하지 않고, 파이트쓰루하여 원래의 매치업을 따라갑니다. 상대의 스크린이 좋다면 효율이 떨어집니다. 반대로 높을수록 스위치를 더 자주 하게 되고 미스매치가 발생할 확률이 높아집니다. 체격, 속도 등에 따라 미스매치의 효율은 변동됩니다. 코트 위의 선수들이 사이즈가 좋고 수비 능력이 우수하다면 스위치 수비를 하는 것이 이득일 수 있습니다.' },
                    { label: '픽앤롤 수비', text: '픽앤롤 수비는 수비 상황에서 빅맨의 움직임을 결정하는 슬라이더로 드랍, 헤지, 블리츠 세 가지로 나뉩니다. 드랍은 수비자 빅맨이 스크리너를 내버려두고 골밑으로 움직이며 상대방 스크리너의 골밑 공격 성공률이 감소할 수 있지만 핸들러의 성공률은 오히려 증가합니다. 헤지는 잠시동안 핸들러에게 더블팀을 간 후 롤맨을 따라 골밑으로 이동하는 움직임으로 균형 잡힌 수비 방법입니다. 블리츠는 쇄도하는 스크리너를 버리고 핸들러에게 더블팀을 가는 방식으로 롤맨의 공격 성공률이 대폭 증가하지만 핸들러의 턴오버를 유발할 수 있습니다. 발이 느린 빅맨이라면 오히려 역효과가 날 수도 있습니다.' },
                    { label: '풀코트 프레스', text: '풀코트 프레스는 수비 압박 강도와 다르게 상대방 베이스라인부터의 압박 강도를 조절합니다. 낮을수록 수비의 시작점이 우리 진영과 가까워집니다. 따라서 상대방이 더 적은 턴오버를 기록하게 되지만 체력을 보존할 수 있습니다. 반대로 높을수록 상대방의 진영부터 강하게 압박을 시작하고, 상대방 핸들러의 턴오버를 유발해 공을 스틸할 수 있는 확률이 발생합니다. 대신 슬라이더를 높게 설정할수록 앞선 수비수의 체력 부담이 가중됩니다.' },
                    { label: '헬프 수비', text: '헬프 수비는 상대방 공격자가 슛을 던질 때의 도움 수비 전략을 조절합니다. 낮을수록 모든 선수들은 헬프 수비를 가지 않고 자신의 자리를 지킵니다. 반대로 높을수록 가장 지근거리에 있는 수비수의 도움 수비 확률이 올라갑니다. 도움 수비자에게는 스틸, 블락 보너스가 주어지고 상대방의 야투 성공 확률이 감소할 수 있습니다. 하지만 도움 수비자가 파울을 기록할 확률이 증가하고, 체력 소모가 가중됩니다.' },
                    { label: '지역 방어', text: '팀의 수비 기조를 맨투맨 커버리지로 설정할지, 존 디펜스로 설정할지를 정할 수 있습니다. 낮을수록 지역에 국한되지 않고 선수들은 본인의 매치업 상대를 따라다니며 수비합니다. 더 많은 체력 소모를 요구하지만, 턴오버나 스틸 확률을 증가시킵니다. 또한 상대방의 드라이브 앤 킥, 컷, 캐치앤슛 등의 액션의 성공률이 감소합니다. 반대로 높을수록 선수들은 자신의 수비 지역을 고수하며 골밑을 틀어막는 방식으로 상대의 포스트업같은 정적인 액션의 성공률을 감소시킬 수 있으나 반대로 컷, 드라이브 앤 킥같은 동적인 액션에 취약해집니다.' },
                    { label: '수비 리바운드', text: '수비 리바운드에 얼마나 많은 인원을 참여시킬지를 결정합니다. 슬라이더가 낮게 설정될수록 리바운드 상황에서 최소한의 인원만 남기고 상대방의 진영으로 넘어갑니다. 팀에 드리블이 뛰어나거나 아웃렛 패스에 능한 선수가 있다면 트랜지션 액션의 성공률이 증가합니다. 반대로 슬라이더가 높을수록 강력한 박스아웃을 시도하며, 더 많은 선수가 리바운드 경합에 참여합니다.' },
                ]} />

            </div>

        </div>
    );
};
