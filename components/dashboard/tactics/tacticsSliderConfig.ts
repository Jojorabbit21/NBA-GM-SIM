// tacticsSliderConfig.ts — 팀 전술 슬라이더 15개의 그룹/라벨/스텝/설명 단일 소스. [2026-10-13]
// TacticsSlidersPanel이 split/비-split 두 레이아웃에 SliderControl 15개와 설명 15개를 각각 복붙하던 것을
// 설정 배열로 바꿨다(docs/plan/ui-audit/09-tactics.md 후보 1). 라벨·설명을 고치려면 여기 한 곳만.
import type { TacticalSliders } from '../../../types';
import { SLIDER_STEPS } from '../../../services/game/config/sliderSteps';

type SliderStepList = (typeof SLIDER_STEPS)[string];

// pnrDefense는 엔진이 0-2를 직접 사용하므로 별도 steps 정의
export const PNR_STEPS: SliderStepList = [
    { value: 0, label: '드랍' },
    { value: 1, label: '헷지' },
    { value: 2, label: '블리츠' },
];

export interface SliderItemConfig {
    key: keyof TacticalSliders;
    label: string;
    steps: SliderStepList;
    /** 슬라이더 설명 — 줄 단위. '+ '/'- '로 시작하는 줄은 툴팁에서 초록 +/빨강 −(장단점)으로 표시(SliderNoteContent),
     *  설명 표(SliderGroupNotes)에선 줄마다 한 줄씩. [2026-10-18] 문자열 → 줄 배열 */
    note: string[];
    /** 같은 값으로 함께 갱신할 키 — 지역 방어(zoneFreq)는 엔진의 zoneUsage도 같이 움직인다 */
    mirrorKeys?: (keyof TacticalSliders)[];
}

export interface SliderGroupConfig {
    title: string;
    category: '공격' | '수비';
    items: SliderItemConfig[];
}

export const OFFENSE_SLIDER_GROUPS: SliderGroupConfig[] = [
    {
        title: '공격 철학', category: '공격', items: [
            { key: 'pace', label: '페이스', steps: SLIDER_STEPS.pace, note: [
                    '포제션의 속도를 조절합니다.',
                    '상대방의 백코트가 느리거나, 팀에 발이 빠른 선수 또는 좋은 아웃렛 패서가 있다면 유용합니다.',
                    '하지만 페이스가 빠를수록 체력 소모가 심해지며, 턴오버가 증가합니다.',
                    '+ 높을수록 더 많은 트랜지션 공격 시도',
                    '+ 높을수록 백코트가 느린 상대에게 효과적',
                    '- 높을수록 더 많은 체력 소모',
                    '- 높을수록 더 많은 잠재적 턴오버',
                ] },
            { key: 'ballMovement', label: '볼 회전', steps: SLIDER_STEPS.ballMovement, note: [
                    '한 번의 공격에서 패스를 얼마나 많이 돌릴 것인지를 조절합니다.',
                    '+ 높을수록 더 많은 핸드오프, 캐치앤슛, 컷인 액션 시도',
                    '- 낮을수록 더 많은 아이솔레이션, 포스트업 액션 시도',
                ] },
            { key: 'offReb', label: '공격 리바운드', steps: SLIDER_STEPS.offReb, note: [
                    '얼마나 많은 선수들이 공격 리바운드 경합에 참여할지를 조절합니다.',
                    '높을수록 많은 선수들이 공격 리바운드 경합에 참여하지만, 백코트가 느려집니다.',
                    '+ 높을수록 더 많은 선수들이 경합에 참여',
                    '- 높을수록 경합 실패 시 상대방의 속공 성공률 증가',
                ] },
            { key: 'insideOut', label: '공격 포인트', steps: SLIDER_STEPS.insideOut, note: [
                    '공격의 전체적인 경향성을 결정합니다.',
                    '+ 높을수록 외곽 공격을 더 많이 시도',
                    '+ 낮을수록 페인트존 공격을 더 많이 시도',
                ] },
            { key: 'pnrFreq', label: '픽앤롤 빈도', steps: SLIDER_STEPS.pnrFreq, note: [
                    '픽앤롤은 핸들러가 직접 처리하거나, 스크리너가 해결하거나, 또는 픽앤팝으로 이어집니다.',
                    '이는 다른 공격 슬라이더의 값에 의해 결정됩니다.',
                    '예를 들어 픽앤롤 빈도를 높게 설정하고 공격 포인트를 아웃사이드로 설정하면',
                    '스크리너는 쇄도하지 않고 빠져나와 3점을 던질 확률이 증가합니다.',
                ] },
        ],
    },
    {
        title: '슈팅 전략', category: '공격', items: [
            { key: 'shot_3pt', label: '3점 슛 빈도', steps: SLIDER_STEPS.shot_3pt, note: [
                    '팀의 3점 시도 빈도를 결정합니다.',
                ] },
            { key: 'shot_rim', label: '골밑 공격 빈도', steps: SLIDER_STEPS.shot_rim, note: [
                    '가장 효율적인 슛 구역으로, 드라이브/컷 능력과 연계됩니다.',
                ] },
            { key: 'shot_mid', label: '미드레인지 빈도', steps: SLIDER_STEPS.shot_mid, note: [
                    '중거리 슛은 효율이 낮습니다. 엘리트 미드레인지 슈터가 없다면 소극적으로 유지하세요.',
                ] },
        ],
    },
];

export const DEFENSE_SLIDER_GROUPS: SliderGroupConfig[] = [
    {
        title: '온볼 수비', category: '수비', items: [
            { key: 'defIntensity', label: '수비 압박 강도', steps: SLIDER_STEPS.defIntensity, note: [
                    '아크 내에서의 수비 압박 강도를 조절합니다.',
                    '+ 높을수록 상대방 야투 성공률 감소',
                    '+ 낮을수록 체력 소모 감소',
                    '+ 낮을수록 파울 확률 감소',
                    '- 낮을수록 상대방 야투 성공률 증가',
                    '- 높을수록 체력 소모 증가',
                    '- 높을수록 파울 확률 증가',
                ] },
            { key: 'switchFreq', label: '스위치 수비', steps: SLIDER_STEPS.switchFreq, note: [
                    '픽앤롤, 핸드오프 등의 스크린 액션에서의 수비 방법을 결정합니다.',
                    '낮을수록 파이트쓰루하여 매치업을 유지합니다. 대신 스크리너의 스크린 기술이 좋다면 효율이 감소합니다.',
                    '반대로 높을수록 스위치 수비를 자주 실행하지만 미스매치가 발생할 확률이 높아집니다.',
                    '체격, 속도 등에 따라 미스매치가 미치는 영향은 달라집니다.',
                ] },
            { key: 'pnrDefense', label: '픽앤롤 수비', steps: PNR_STEPS, note: [
                    '드랍 : 사용시 상대 스크리너의 골밑 공격 효율이 감소합니다. 하지만 핸들러의 공격 성공률은 증가합니다.',
                    '헷지 : 사용시 빅맨이 핸들러에게 더블팀 후 스크리너를 따라갑니다. 균형잡힌 수비 방식입니다.',
                    '블리츠 : 사용시 핸들러에게 강한 더블팀을 적용하여 핸들러를 봉쇄합니다. 다만 스크리너의 공격 성공률이 증가합니다. 또한 빅맨의 기동력이 느리다면 오히려 역효과가 일어날 수 있습니다.',
                ] },
            { key: 'fullCourtPress', label: '풀코트 프레스', steps: SLIDER_STEPS.fullCourtPress, note: [
                    '풀코트 프레스는 상대방 베이스라인에서 우리 진영까지 넘어오는 동안의 수비 강도를 조절합니다.',
                    '+ 높을수록 상대방의 체력 소모 유도',
                    '+ 높을수록 상대방 턴오버 확률 증가',
                    '- 높을수록 퍼리미터 수비수들의 체력 소모 증가',
                    '+ 낮을수록 퍼리미터 수비수들의 체력 소모 감소',
                ] },
        ],
    },
    {
        title: '오프볼 수비', category: '수비', items: [
            { key: 'helpDef', label: '헬프 수비', steps: SLIDER_STEPS.helpDef, note: [
                    '헬프 수비는 슈터에게 어떻게 도움 수비를 갈 것인지를 결정합니다.',
                    '헬프 디펜더에게 스틸, 블락 보너스가 주어지고 슈터의 야투 성공률이 감소할 수 있습니다.',
                    '+ 높을수록 도움 수비 성공 확률 증가',
                    '- 높을수록 수비 파울 확률 증가',
                    '- 높을수록 체력 소모 증가',
                ] },
            { key: 'zoneFreq', label: '지역 방어', steps: SLIDER_STEPS.zoneFreq, mirrorKeys: ['zoneUsage'], note: [
                    '수비 기조를 지역 방어와 맨투맨 사이에서 결정합니다.',
                    '지역 방어 사용시 제한구역과 페인트존의 수비 성공률이 증가하지만 외곽 공격이나 컷, 드라이브 앤 킥 등의 동적인 액션에 취약해집니다.',
                    '반대로 맨투맨 사용시 지역에 국한되지 않고 움직이며 수비합니다. 더 많은 체력이 소모되지만, 턴오버와 스틸 확률을 증가시킵니다.',
                    '+ 높을수록 제한구역과 페인트존 수비 성공률 증가',
                    '- 높을수록 3점 수비 성공률 감소',
                    '- 높을수록 상대의 컷, 드라이브 앤 킥 액션 성공률 증가',
                    '+ 낮을수록 상대방의 전체적인 야투 성공률 감소',
                    '+ 낮을수록 상대방의 턴오버 증가 및 스틸 확률 보너스',
                    '- 낮을수록 체력 소모 증가',
                ] },
            { key: 'defReb', label: '수비 리바운드', steps: SLIDER_STEPS.defReb, note: [
                    '수비 리바운드에 얼마나 많은 인원을 참여시킬지 결정합니다.',
                    '페이스를 높게 설정해도 수비 리바운드를 높게 설정하면 속공의 효율이 감소할 수 있습니다.',
                    '+ 낮을수록 트랜지션 액션의 비율 증가',
                    '+ 낮을수록 상대방 진영으로 넘어가는 시간 감소',
                    '- 낮을수록 상대방에게 공격 리바운드를 뺏길 가능성 증가',
                ] },
        ],
    },
];

/** 설명 표(SliderGroupNotes) 입력 — 그룹 순서 그대로 공격 8 + 수비 7 */
export const TACTICS_SLIDER_NOTES = [...OFFENSE_SLIDER_GROUPS, ...DEFENSE_SLIDER_GROUPS].flatMap(g =>
    g.items.map(item => ({ category: g.category, label: item.label, text: item.note })),
);
