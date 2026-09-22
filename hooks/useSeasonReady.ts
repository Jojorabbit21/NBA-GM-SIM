import { useEffect, useState } from 'react';
import { countGames } from '../services/multi/gameQueries';

/**
 * 드래프트 완료 후 서버 finalizeDraft()가 시즌 일정(games 행)을 넣었는지 폴링한다.
 * [2026-09-22] MultiDraftView의 DraftCompletedScreen(별도 로더 화면)에서 훅으로 분리 — 이제 드래프트
 * 화면에 그대로 머무르며(리캡 가능) 헤더에만 진행 상태를 표시하고, games가 생기기 전엔 시즌 이동을 막는다.
 *
 * - 완료 신호 = games 행 ≥ 1 (leagues.status는 finalize "시작" 직후 in_progress로 바뀌어 신호로 부적합 — 2026-07-29 버그)
 * - progress는 실측이 아니라 경과 시간 근사(95% 상한 점근선), 완료 시 100으로 스냅
 * - 3초 × 30회 = 90초 넘으면 timedOut
 */
export interface SeasonReadyState {
    ready:    boolean;
    progress: number;   // 0~100
    timedOut: boolean;
}

const MAX_POLL_ATTEMPTS = 30;
const POLL_INTERVAL_MS  = 3000;

export function useSeasonReady(roomId: string | null | undefined, enabled: boolean): SeasonReadyState {
    const [ready,    setReady]    = useState(false);
    const [timedOut, setTimedOut] = useState(false);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        if (!enabled || !roomId) return;
        let cancelled = false;
        let attempts  = 0;
        let timerId:  ReturnType<typeof setTimeout>;

        const poll = async () => {
            if (cancelled) return;
            attempts += 1;
            const elapsedSec = attempts * (POLL_INTERVAL_MS / 1000);
            setProgress(Math.min(95, Math.round(100 * (1 - Math.exp(-elapsedSec / 8)))));

            if (attempts > MAX_POLL_ATTEMPTS) { setTimedOut(true); return; }

            const n = await countGames(roomId);
            if (cancelled) return;
            if (n > 0) { setProgress(100); setReady(true); }
            else timerId = setTimeout(poll, POLL_INTERVAL_MS);
        };

        poll();
        return () => { cancelled = true; clearTimeout(timerId); };
    }, [roomId, enabled]);

    return { ready, progress, timedOut };
}
