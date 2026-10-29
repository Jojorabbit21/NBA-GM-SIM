// trainingPresets.ts — 트레이닝 세션: 상대 팀 전술 프리셋 + 횟수 상수 [2026-10-29]
// 설계: docs/plan/practice-scrimmage-plan.md 3절. 프리셋을 고르면 해당 슬라이더 8개를 통째로 덮어쓴다.
// 공격 값 = 서버 AI 감독 C4의 BASE_PRESETS/SPECIAL_PRESETS(server/src/shared/game/tactics/aiCoach/offensePresets.ts)와 같다.
// C4 커밋 후 서버·클라 공용 상수로 분리 예정(계획 P0) — 그 전까지 값을 바꿀 땐 두 곳을 같이 고칠 것.
import type { TacticalSliders } from '../../types';

/** 휴식일 하루에 쓸 수 있는 트레이닝 세션 수(이월 없음) */
export const TRAINING_SESSIONS_PER_REST_DAY = 3;

type OffenseKey = 'pace' | 'ballMovement' | 'offReb' | 'insideOut' | 'pnrFreq' | 'shot_3pt' | 'shot_mid' | 'shot_rim';
type DefenseKey = 'defIntensity' | 'helpDef' | 'switchFreq' | 'defReb' | 'zoneFreq' | 'zoneUsage' | 'pnrDefense' | 'fullCourtPress';

export type TrainingOffensePresetId = 'AUTO' | 'POST' | 'ROLL' | 'HANDLER' | 'SHOOTER' | 'SLASHER' | 'HUB' | 'PNR_DUO' | 'TWIN_TOWERS';
export type TrainingDefensePresetId = 'MAN_BASE' | 'MAN_PRESSURE' | 'SWITCH' | 'DROP' | 'ZONE' | 'FULL_PRESS';

export interface TrainingOffensePreset {
    id: TrainingOffensePresetId;
    label: string;
    /** null = 자동(서버 AI 감독이 상대 로스터로 결정) */
    sliders: Pick<TacticalSliders, OffenseKey> | null;
}

export interface TrainingDefensePreset {
    id: TrainingDefensePresetId;
    label: string;
    sliders: Pick<TacticalSliders, DefenseKey>;
}

const off = (pace: number, ballMovement: number, offReb: number, insideOut: number, pnrFreq: number, shot_3pt: number, shot_mid: number, shot_rim: number) =>
    ({ pace, ballMovement, offReb, insideOut, pnrFreq, shot_3pt, shot_mid, shot_rim });
const def = (defIntensity: number, helpDef: number, switchFreq: number, defReb: number, zoneFreq: number, zoneUsage: number, pnrDefense: number, fullCourtPress: number) =>
    ({ defIntensity, helpDef, switchFreq, defReb, zoneFreq, zoneUsage, pnrDefense, fullCourtPress });

export const TRAINING_OFFENSE_PRESETS: TrainingOffensePreset[] = [
    { id: 'AUTO',        label: '자동',        sliders: null },
    { id: 'POST',        label: '포스트업',    sliders: off(4, 4, 9, 2, 4, 5, 5, 8) },
    { id: 'ROLL',        label: '픽앤롤 빅',   sliders: off(5, 5, 6, 4, 8, 5, 4, 7) },
    { id: 'HANDLER',     label: '핸들러',      sliders: off(5, 4, 6, 5, 7, 6, 5, 7) },
    { id: 'SHOOTER',     label: '슈팅',        sliders: off(5, 5, 5, 6, 5, 6, 5, 5) },
    { id: 'SLASHER',     label: '돌파·속공',   sliders: off(7, 5, 6, 3, 5, 4, 5, 8) },
    { id: 'HUB',         label: '볼 무브먼트', sliders: off(4, 8, 6, 4, 4, 6, 5, 6) },
    { id: 'PNR_DUO',     label: 'PnR 듀오',    sliders: off(5, 4, 5, 4, 9, 6, 4, 7) },
    { id: 'TWIN_TOWERS', label: '트윈 타워',   sliders: off(3, 5, 8, 2, 3, 3, 5, 8) },
];

// 맨투맨 기본이 DEFAULT_SLIDERS가 아닌 이유: DEFAULT_SLIDERS는 zoneFreq 5(공격권 약 40% 지역방어)라 중립이 아니다(ai-coach-plan 2-12).
export const TRAINING_DEFENSE_PRESETS: TrainingDefensePreset[] = [
    { id: 'MAN_BASE',     label: '맨투맨 기본',   sliders: def(5, 5, 5, 5, 1, 5, 1, 1) },
    { id: 'MAN_PRESSURE', label: '압박 맨투맨',   sliders: def(8, 5, 4, 5, 1, 5, 2, 3) },
    { id: 'SWITCH',       label: '스위치',        sliders: def(6, 4, 9, 6, 1, 5, 1, 1) },
    { id: 'DROP',         label: '림 앵커 드롭',  sliders: def(4, 8, 2, 7, 1, 5, 0, 1) },
    { id: 'ZONE',         label: '지역방어',      sliders: def(5, 6, 3, 6, 9, 8, 1, 1) },
    { id: 'FULL_PRESS',   label: '풀코트 프레스', sliders: def(7, 5, 5, 5, 1, 5, 2, 9) },
];

export const DEFAULT_TRAINING_OFFENSE: TrainingOffensePresetId = 'AUTO';
export const DEFAULT_TRAINING_DEFENSE: TrainingDefensePresetId = 'MAN_BASE';
