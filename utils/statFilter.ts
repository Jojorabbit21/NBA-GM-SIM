// 스탯/능력치 부등호 필터 공통 어휘 — 2026-10-12 신설.
// 리더보드(data/leaderboardConfig.ts), FA, 드래프트 풀이 각자 같은 Operator 타입과
// compareOperator()를 들고 있던 것을 한 곳으로 모았다. UI는 components/common/filters/StatFilterBar.tsx.
export type Operator = '>' | '<' | '>=' | '<=' | '=';
export const OPERATORS: Operator[] = ['>=', '<=', '>', '<', '='];

export function compareOperator(value: number, operator: Operator, target: number): boolean {
    switch (operator) {
        case '>=': return value >= target;
        case '<=': return value <= target;
        case '>':  return value > target;
        case '<':  return value < target;
        case '=':  return value === target;
    }
}
