import type React from 'react';

/**
 * 한글 등 IME 조합 중에 발생한 키 이벤트인지 — Enter로 제출/선택하는 입력창에서 이 경우는 무시해야 한다.
 * 조합 중 Enter는 keydown이 두 번 오고(조합 중 1회 + 조합 종료 후 1회), 조합 중 것을 처리하면 마지막 글자가
 * 빠진 값으로 제출되거나 두 번 실행된다. (2026-10-19, 선수 비교 검색 오선택 버그에서 공용화)
 */
export const isImeComposing = (e: React.KeyboardEvent): boolean =>
    e.nativeEvent.isComposing || e.keyCode === 229;
