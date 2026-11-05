// offCourtInjuries.ts — 멀티 경기 사이 부상·결장 규칙 (2026-11-05, 순수 모듈)
//
// 경기 중에 생길 수 없는 질병·과사용·개인 사유 결장. 가상 자정마다 로스터 선수 전원을 대상으로 판정한다
// (DB 처리: server/src/offCourtInjuries.ts). 진단 지연 없이 즉시 공개.
// 사용자 결정: 선수당 시즌 평균 약 0.2회(개인 사유 포함), 종류 확장(질병·과사용) + 개인 사유 결장.
// 경기 중 부상 목록은 engine/injuryGrades.ts의 GRADE_CONFIG.

import { pickWeighted } from '../engine/injuryGrades.ts';

/** 선수당 시즌 평균 발생 횟수(rooms.sim_settings.injuryFrequency 1.0 기준). */
export const OFF_COURT_PER_SEASON = 0.2;
/** 정규시즌 가상 일수 근사 — 하루 확률 = OFF_COURT_PER_SEASON / 이 값. */
export const OFF_COURT_SEASON_DAYS = 170;

export type OffCourtCategory = 'illness' | 'chronic' | 'personal';

export interface OffCourtType {
    type: string;
    category: OffCourtCategory;
    /** 상대 빈도(합 100) */
    weight: number;
    /** 짧→긴 순 — 질병·과사용은 내구도 가중(pickWeighted), 개인 사유는 균등 */
    durations: string[];
}

export const OFF_COURT_TYPES: OffCourtType[] = [
    { type: '감기',         category: 'illness',  weight: 20, durations: ['1일', '2일', '3일'] },
    { type: '독감',         category: 'illness',  weight: 9,  durations: ['3일', '5일', '1주'] },
    { type: '식중독',       category: 'illness',  weight: 9,  durations: ['1일', '2일', '3일'] },
    { type: '편도선염',     category: 'illness',  weight: 5,  durations: ['3일', '5일', '1주'] },
    { type: '편두통',       category: 'illness',  weight: 5,  durations: ['1일', '2일'] },
    { type: '허리 경직',    category: 'chronic',  weight: 10, durations: ['1일', '3일', '1주'] },
    { type: '목 경직',      category: 'chronic',  weight: 6,  durations: ['1일', '3일', '1주'] },
    { type: '무릎 건염',    category: 'chronic',  weight: 6,  durations: ['1주', '2주'] },
    { type: '아킬레스건염', category: 'chronic',  weight: 4,  durations: ['1주', '2주', '3주'] },
    { type: '족저근막염',   category: 'chronic',  weight: 3,  durations: ['1주', '2주', '3주'] },
    { type: '가족 사정',    category: 'personal', weight: 15, durations: ['1일', '2일'] },
    { type: '자녀 출산',    category: 'personal', weight: 8,  durations: ['1일', '2일'] },
];

/** days일 동안 한 번 이상 발생할 확률(자정 처리가 밀려 여러 날을 한꺼번에 넘길 때 보정). */
export function offCourtChance(days: number, injuryFrequency: number): number {
    const daily = (OFF_COURT_PER_SEASON / OFF_COURT_SEASON_DAYS) * Math.max(0, injuryFrequency);
    return 1 - Math.pow(1 - Math.min(1, daily), Math.max(1, days));
}

export interface OffCourtPick {
    type: string;
    category: OffCourtCategory;
    duration: string;
    /** 1주 이하 Grade1, 그 이상 Grade2, 개인 사유는 'Personal'(부상 등급 아님) */
    severity: 'Grade1' | 'Grade2' | 'Personal';
}

export function pickOffCourtEvent(durability: number, rand: () => number = Math.random): OffCourtPick {
    const total = OFF_COURT_TYPES.reduce((a, t) => a + t.weight, 0);
    let roll = rand() * total;
    let picked = OFF_COURT_TYPES[OFF_COURT_TYPES.length - 1];
    for (const t of OFF_COURT_TYPES) {
        roll -= t.weight;
        if (roll <= 0) { picked = t; break; }
    }
    const duration = picked.category === 'personal'
        ? picked.durations[Math.floor(rand() * picked.durations.length)]
        : pickWeighted(picked.durations, durability);
    const severity = picked.category === 'personal' ? 'Personal' : /^[1-9]일$|^1주$/.test(duration) ? 'Grade1' : 'Grade2';
    return { type: picked.type, category: picked.category, duration, severity };
}
