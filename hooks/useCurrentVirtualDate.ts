
import { useMemo } from 'react';
import { findCurrentVirtualDate } from '../views/multi/season/multiScheduleUtils';
import { useServerClockBucket } from '../utils/serverClock';
import type { Game } from '../types';
import type { VirtualDayRow } from '../utils/leagueTimeline';

/**
 * 메인리그(main_league) 세션의 "현재 시뮬레이션 날짜"(가상 NBA 캘린더 기준) — MultiHeader.tsx가
 * 원래 각자 구현하던 것과 동일 알고리즘을 공용 훅으로 분리(사이드바/올스타 화면 등 다른
 * 컴포넌트도 같은 값이 필요해짐 — 로직이 갈라지면 화면마다 "오늘"이 미묘하게 어긋날 위험).
 *
 * 15초 버킷으로 재계산 빈도를 낮춘다 — 스케줄 전체(1000경기 이상)를 매초 스캔하면 프레임
 * 드랍의 원인이 된다(MultiHeader.tsx의 기존 dateBucket 최적화와 동일 이유).
 */
export function useCurrentVirtualDate(
    schedule: Game[],
    leagueType: string | undefined,
    simStart: string | null | undefined,
    gprd: number | undefined,
    /** [2026-09-18] 고정 길이 가상 하루 타임라인(useLeagueContext().timeline). */
    timeline?: VirtualDayRow[] | null,
): string | null {
    // [2026-09-18] 로컬 Date.now() 1초 틱 → 서버 보정 15초 버킷(MultiHeader 등 다른 화면과 동일 시계).
    const serverNow = useServerClockBucket();

    return useMemo(() => {
        if (leagueType !== 'main_league') return null;
        if (!timeline?.length && !simStart) return null;
        return findCurrentVirtualDate(schedule, simStart ?? null, gprd ?? 5, serverNow, timeline);
    }, [leagueType, schedule, simStart, gprd, serverNow, timeline]);
}
