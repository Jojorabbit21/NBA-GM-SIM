// tacticSchedule.ts — 시간별 전술 세트(1번 / 2번 / 클러치). [2026-10-23]
// GameTactics.sliders = 1번, altSliders = 2번, clutchSliders = 클러치(clutchEnabled !== false일 때만 — initializer가 걸러서 TacticSets.clutch로 넘김).
// sliderSchedule = 48자 문자열('0'|'1'|'2'), 인덱스 = 경기 분. '0'=미지정. 엔진은 '2'만 2번, 나머지(미지정 포함)는 1번.
// 필드가 없으면 48분 전부 1번(기존 단일 전술).
// 클러치 판정은 엔진 isClutch(4Q 이후 ≤5:00, 점수차 ≤10)를 그대로 받는다 — 클러치가 타임라인보다 우선.
// 엔진(stepPossession)과 전술 화면이 함께 쓰는 순수 모듈 — 서버 미러: server/src/shared/engine/pbp/tacticSchedule.ts
import type { TacticalSliders } from '../../../../types';
import type { TeamState } from './pbpTypes';

export type TacticSetId = 'main' | 'alt' | 'clutch';
export type ScheduleSet = '0' | '1' | '2';

export const TACTIC_SCHEDULE_MINUTES = 48;

export interface TacticSets {
    main: TacticalSliders;
    alt?: TacticalSliders;
    clutch?: TacticalSliders;
}

/** 엔진이 해당 분에 쓸 세트. '2'가 아닌 값(미지정 '0'·누락·짧은 문자열 포함)은 전부 1번. */
export function scheduledSetAt(schedule: string | undefined, minute: number): '1' | '2' {
    return schedule?.[minute] === '2' ? '2' : '1';
}

/** 48칸 배열로 펼침(UI용). 필드 없음 = 전부 '1', 문자열이 짧으면 나머지는 '0'. */
export function parseSchedule(schedule: string | undefined): ScheduleSet[] {
    return Array.from({ length: TACTIC_SCHEDULE_MINUTES }, (_, m) => {
        if (schedule === undefined) return '1';
        const c = schedule[m];
        return c === '1' || c === '2' ? c : '0';
    });
}

/** 48칸 배열 → 저장 문자열. 전부 1번이면 undefined(필드 생략 = 기존 단일 전술과 동일). */
export function serializeSchedule(sets: ScheduleSet[]): string | undefined {
    const s = Array.from({ length: TACTIC_SCHEDULE_MINUTES }, (_, m) => (sets[m] === '1' || sets[m] === '2' ? sets[m] : '0')).join('');
    return /^1+$/.test(s) ? undefined : s;
}

/** 이번 포세션에 쓸 세트. 2번/클러치 슬라이더가 없으면 1번으로 폴백. */
export function resolveTacticSet(sets: TacticSets, schedule: string | undefined, minute: number, isClutch: boolean): TacticSetId {
    if (isClutch && sets.clutch) return 'clutch';
    if (sets.alt && scheduledSetAt(schedule, minute) === '2') return 'alt';
    return 'main';
}

/** 포세션 시작 시 호출 — team.tactics.sliders를 이번 포세션 세트로 교체.
 *  tacticSets가 없는 팀(AI·단일 전술)은 아무것도 하지 않는다. */
export function applyTacticSchedule(team: TeamState, minute: number, isClutch: boolean): void {
    const sets = team.tacticSets;
    if (!sets) return;
    const active = team.activeTacticSet ?? 'main';
    // 라이브 경기 중 슬라이더 편집(useLiveGame)은 tactics.sliders를 통째로 교체한다 — 지금 활성 세트에 반영해 둔다.
    sets[active] = team.tactics.sliders;
    const next = resolveTacticSet(sets, team.tactics.sliderSchedule, minute, isClutch);
    if (next === active) return;
    team.tactics.sliders = sets[next]!;
    team.activeTacticSet = next;
}
