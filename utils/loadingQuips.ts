/**
 * 리그 진입 로딩 화면(components/multi/LeagueLoadingScreen.tsx) 스피너 아래에 띄우는 재치 문구.
 * [2026-10-06] 실제 작업 내용과 무관하게 2초마다 무작위(직전과 다르게) 교체. 사용자 확정 5종.
 */
export const LOADING_QUIPS: readonly string[] = [
    '코트 바닥 닦는 중',
    '벤치 데우는 중',
    '구단주 설득하는 중',
    '그물 수리하는 중',
    '농구공에 바람 넣는 중',
];

export const LOADING_QUIP_INTERVAL_MS = 2000;

/** 직전 인덱스와 다른 인덱스를 고른다(문구가 2개 이상일 때). */
export function nextQuipIndex(prev: number, length: number = LOADING_QUIPS.length): number {
    if (length <= 1) return 0;
    let i = prev;
    while (i === prev) i = Math.floor(Math.random() * length);
    return i;
}
