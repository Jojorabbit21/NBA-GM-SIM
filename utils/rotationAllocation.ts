// rotationAllocation.ts — 뎁스 차트 기반 로테이션 자동 배분·검증 로직. [2026-10-13]
// DepthRotationBoard(멀티 뎁스 탭)와 RotationGanttChart(어드민 편집·싱글·라이브)가 각자 들고 있던
// 배분 옵션 3종·48분 맵 생성(computeRotationMap)·분당 코트 인원 검증·분 합계 색 규칙을 한 곳으로 모았다
// (docs/plan/ui-audit/09-tactics.md A8/후보 12). 두 화면 중 한쪽만 고치는 회귀를 막기 위한 공유 모듈.
import type { DepthChart, Player } from '../types';

export type RotationAllocationMode = 'Overwork' | 'Balanced' | 'Socialist';

export const ROTATION_ALLOCATION_OPTIONS: { mode: RotationAllocationMode; label: string; sub: string }[] = [
    { mode: 'Overwork',  label: '주전 혹사 (기본)', sub: '주전 36분 / 벤치 12분' },
    { mode: 'Balanced',  label: '균형 분배',        sub: '주전 26분 / 벤치 18분 / 써드 4분' },
    { mode: 'Socialist', label: '공산 농구',        sub: '주전 20분 / 벤치 16분 / 써드 12분' },
];

export const ROTATION_POSITIONS: (keyof DepthChart)[] = ['PG', 'SG', 'SF', 'PF', 'C'];

/** 48분 전부 벤치인 새 배열 */
export const EMPTY_48 = (): boolean[] => Array(48).fill(false);

/**
 * 뎁스 차트(포지션별 주전/벤치/써드)와 배분 모드로 선수별 48분 출전 맵을 만든다.
 * 로스터 전원을 0분으로 깔고 슬롯에 있는 선수만 구간을 채운다. 벤치/써드가 비어 있으면 그 구간은 주전이 이어서 뛴다.
 */
export function computeRotationMap(
    chart: DepthChart,
    mode: RotationAllocationMode,
    roster: Player[],
): Record<string, boolean[]> {
    const newMap: Record<string, boolean[]> = {};
    roster.forEach(p => { newMap[p.id] = EMPTY_48(); });
    const fill = (id: string, s: number, e: number) => {
        if (!newMap[id]) newMap[id] = EMPTY_48();
        for (let i = s - 1; i < e; i++) newMap[id][i] = true;
    };
    ROTATION_POSITIONS.forEach(pos => {
        const [sid, bid, tid] = chart[pos];
        if (mode === 'Overwork') {
            if (sid) { fill(sid,1,12); fill(sid,19,24); fill(sid,25,36); fill(sid,43,48); }
            if (bid) { fill(bid,13,18); fill(bid,37,42); }
            else if (sid) { fill(sid,13,18); fill(sid,37,42); }
        } else if (mode === 'Balanced') {
            if (sid) { fill(sid,1,8); fill(sid,21,24); fill(sid,25,32); fill(sid,43,48); }
            if (bid) { fill(bid,9,12); fill(bid,17,20); fill(bid,33,36); fill(bid,37,42); }
            if (tid) { fill(tid,13,16); } else if (sid) { fill(sid,13,16); }
            if (sid && !bid) { fill(sid,9,12); fill(sid,17,20); fill(sid,33,36); fill(sid,37,42); }
        } else {
            if (sid) { fill(sid,1,6); fill(sid,21,24); fill(sid,25,30); fill(sid,45,48); }
            if (bid) { fill(bid,7,10); fill(bid,13,16); fill(bid,31,34); fill(bid,37,40); }
            if (tid) { fill(tid,11,12); fill(tid,17,20); fill(tid,35,36); fill(tid,41,44); }
            else {
                if (sid) { fill(sid,17,20); fill(sid,41,44); }
                if (bid) { fill(bid,11,12); fill(bid,35,36); }
                else if (sid) { fill(sid,11,12); fill(sid,35,36); }
            }
            if (sid && !bid) { fill(sid,7,10); fill(sid,13,16); fill(sid,31,34); fill(sid,37,40); }
        }
    });
    return newMap;
}

export interface RotationValidation {
    /** 분별 코트 위 인원(0~47) */
    minuteCounts: number[];
    /** 42분 초과 선수 이름 */
    over42: string[];
    /** 코트 인원이 5명 미만인 분 인덱스 */
    under5Minutes: number[];
    /** 코트 인원이 5명 초과인 분 인덱스 */
    over5Minutes: number[];
}

/** 로테이션 맵 검증 — 분당 코트 인원과 혹사(42분 초과) 선수 */
export function computeRotationValidation(
    rotationMap: Record<string, boolean[]> | undefined,
    roster: Player[],
): RotationValidation {
    const minuteCounts = Array<number>(48).fill(0);
    const over42: string[] = [];
    Object.entries(rotationMap || {}).forEach(([pid, map]) => {
        if (map.filter(Boolean).length > 42) over42.push(roster.find(p => p.id === pid)?.name || pid);
        map.forEach((active, i) => { if (active) minuteCounts[i]++; });
    });
    const under5Minutes: number[] = [];
    const over5Minutes: number[] = [];
    minuteCounts.forEach((c, i) => {
        if (c < 5) under5Minutes.push(i);
        if (c > 5) over5Minutes.push(i);
    });
    return { minuteCounts, over42, under5Minutes, over5Minutes };
}

/** 선수 분 합계 글자색 — 0 회색 / 42 초과 빨강 / 34 초과 주황 / 20 초과 인디고 / 그 외 초록 */
export function getMinutesColor(mins: number): string {
    if (mins === 0) return 'text-slate-600';
    if (mins > 42) return 'text-red-500';
    if (mins > 34) return 'text-amber-500';
    if (mins > 20) return 'text-indigo-400';
    return 'text-emerald-400';
}
