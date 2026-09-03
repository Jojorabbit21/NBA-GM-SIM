import type { InjuryHistoryEntry } from '../types/player';

// 부상 등급(GRADE1~5) 도입(2026-09) 이전에는 severity가 'Minor'|'Major'|'Season-Ending'
// 3단계였고, FA 밸류에이션/익스텐션 엔진(services/fa/*.ts)이 그 3단계 의미로 판정하고
// 있었다. 등급 체계가 5단계로 바뀌면서 옛 판정이 조용히 안 맞게 되는 걸 막기 위한 매핑 —
// 구 Minor(17종)=GRADE1~2, 구 Major(13종 중 손목인대부상 제외)=GRADE3~4로 갈라졌고,
// 구 Season-Ending(4종)=GRADE5.

/** severity 문자열에서 등급 숫자만 추출(Grade3→3). Suspension/알 수 없는 값은 0. */
export function injuryGradeNumber(severity: InjuryHistoryEntry['severity']): number {
    const m = /^Grade(\d)$/.exec(severity);
    return m ? Number(m[1]) : 0;
}

/** 구 'Season-Ending' 대응 — 최고 중증(시즌아웃급)만. */
export function isSeasonEndingGrade(severity: InjuryHistoryEntry['severity']): boolean {
    return severity === 'Grade5';
}

/** 구 'Major' 대응 — 옛 Major 목록이 갈라진 GRADE3~4. */
export function isMajorTierGrade(severity: InjuryHistoryEntry['severity']): boolean {
    return severity === 'Grade3' || severity === 'Grade4';
}

/** 구 "severity !== 'Minor'" 대응 — 옛 Minor(경증)는 GRADE1~2였으므로 그 나머지. */
export function isNonMinorGrade(severity: InjuryHistoryEntry['severity']): boolean {
    return injuryGradeNumber(severity) >= 3;
}
