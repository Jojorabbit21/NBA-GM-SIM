
import { useState, useEffect, useMemo } from 'react';
import { findCurrentVirtualDate } from '../views/multi/season/multiScheduleUtils';
import type { Game } from '../types';

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
): string | null {
    const [nowMs, setNowMs] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);
    const dateBucket = Math.floor(nowMs / 15000);

    return useMemo(() => {
        if (leagueType !== 'main_league' || !simStart) return null;
        return findCurrentVirtualDate(schedule, simStart, gprd ?? 5, dateBucket * 15000);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leagueType, schedule, simStart, gprd, dateBucket]);
}
