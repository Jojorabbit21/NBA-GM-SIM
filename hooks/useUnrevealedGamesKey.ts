// useUnrevealedGamesKey.ts — "시뮬됐지만 아직 공개 전인 경기" 집합이 바뀔 때만 바뀌는 문자열 키. [2026-11-07]
//
// 서버는 경기를 시작 0~60초 전에 시뮬해 결과(부상·출장정지 등)를 room_player_state에 바로 쓴다. 부상 배지·부상 이력은
// buildActiveInjurySeverityMap(nowMs)로 공개 전 경기분을 가리는데, 그 판정이 무거운 react-query select(buildLeagueTeams)
// 안에 있는 화면이 있어 15초 시계를 의존성으로 넣으면 15초마다 리그 전체를 다시 계산한다. 이 키는 경기가 새로 시뮬되거나
// (schedule 갱신) 공개 시각이 지날 때만 바뀌므로 의존성으로 넣고, 계산 안에서는 getServerNow()를 nowMs로 쓰면 된다.
// 다음 공개 시각에 맞춰 타이머 한 번만 건다(주기 리렌더 없음).
import { useEffect, useMemo, useState } from 'react';
import { getServerNow } from '../utils/serverClock';
import { replayLengthMsFor } from '../views/multi/season/multiGameReveal';

type KeyGame = { id: string; played: boolean; scheduledAt?: string; otPeriods?: number | null };

export function useUnrevealedGamesKey(schedule: KeyGame[] | undefined): string {
    const [now, setNow] = useState(() => getServerNow());

    const { key, nextRevealAt } = useMemo(() => {
        const ids: string[] = [];
        let next = Infinity;
        for (const g of schedule ?? []) {
            if (!g.played || !g.scheduledAt) continue;   // scheduledAt 없는 구 리그 경기는 isFinal이 played로 폴백 — 숨김 대상 아님
            const revealAt = Date.parse(g.scheduledAt) + replayLengthMsFor(g.otPeriods);
            if (revealAt <= now) continue;
            ids.push(g.id);
            if (revealAt < next) next = revealAt;
        }
        return { key: ids.sort().join(','), nextRevealAt: next };
    }, [schedule, now]);

    useEffect(() => {
        if (!Number.isFinite(nextRevealAt)) return;
        const t = setTimeout(() => setNow(getServerNow()), Math.max(0, nextRevealAt - getServerNow()) + 500);
        return () => clearTimeout(t);
    }, [nextRevealAt]);

    return key;
}
