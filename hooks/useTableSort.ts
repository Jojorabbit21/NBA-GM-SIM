// useTableSort.ts — 표 열 정렬 상태 한 벌. [2026-10-13]
// 로스터 4개 표 + 경기 기록이 `sortConfig/handleSort` 3줄과 헤더마다
// `sortDirection={sortConfig.key === k ? sortConfig.direction : null}` 삼항(19회)을 복붙하던 것을 모았다
// (docs/plan/ui-audit/08-roster.md 후보 8). 같은 열을 다시 누르면 desc → asc 토글, 다른 열은 desc로 시작.
import React, { useCallback, useState } from 'react';

export type SortDirection = 'asc' | 'desc';
export interface SortConfig<K extends string | number = string> { key: K; direction: SortDirection }

/** TableHeaderCell에 그대로 스프레드하는 정렬 prop 묶음: `<TableHeaderCell {...sortProps('ovr')}>` */
export interface HeaderSortProps { sortable: true; onSort: () => void; sortDirection: SortDirection | null }

export interface TableSortApi<K extends string | number> {
    sortConfig: SortConfig<K>;
    setSortConfig: React.Dispatch<React.SetStateAction<SortConfig<K>>>;
    handleSort: (key: K) => void;
    sortProps: (key: K) => HeaderSortProps;
}

// 오버로드: 문자열 키는 리터럴('ovr')로 좁혀지지 않게 string으로 넓힌다(그래야 sortProps('height')가 통과).
// 숫자 인덱스 키(재정 탭 시즌 열)는 `useTableSort<number>(...)`로 명시.
export function useTableSort(initial: SortConfig<string>): TableSortApi<string>;
export function useTableSort<K extends string | number>(initial: SortConfig<K>): TableSortApi<K>;
export function useTableSort<K extends string | number>(initial: SortConfig<K>): TableSortApi<K> {
    const [sortConfig, setSortConfig] = useState<SortConfig<K>>(initial);
    const handleSort = useCallback((key: K) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
    }, []);
    const sortProps = useCallback((key: K): HeaderSortProps => ({
        sortable: true,
        onSort: () => handleSort(key),
        sortDirection: sortConfig.key === key ? sortConfig.direction : null,
    }), [sortConfig, handleSort]);
    return { sortConfig, setSortConfig, handleSort, sortProps };
}

/** 문자열은 localeCompare, 숫자는 뺄셈 — 로스터/능력치 표의 정렬 비교 블록(8줄×2) */
export function compareSortValues(a: number | string, b: number | string, direction: SortDirection): number {
    if (typeof a === 'string' && typeof b === 'string') {
        return direction === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
    }
    return direction === 'asc' ? (a as number) - (b as number) : (b as number) - (a as number);
}

/** 원본을 복사해 config대로 정렬한 새 배열 */
export function sortByConfig<T, K extends string | number>(
    items: readonly T[],
    config: SortConfig<K>,
    getValue: (item: T, key: K) => number | string,
): T[] {
    return [...items].sort((x, y) => compareSortValues(getValue(x, config.key), getValue(y, config.key), config.direction));
}
