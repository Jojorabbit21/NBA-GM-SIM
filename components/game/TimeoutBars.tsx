import React from 'react';
import type { PbpLog } from '../../types';

export const TEAM_TIMEOUTS_TOTAL = 7;

/** 경기 로그에서 팀별 마지막 잔여 타임아웃 수를 구한다(타임아웃을 한 번도 안 쓴 팀은 TEAM_TIMEOUTS_TOTAL). */
export function getTimeoutsLeftFromLogs(logs: PbpLog[] | undefined, teamId: string): number {
    if (!logs) return TEAM_TIMEOUTS_TOTAL;
    for (let i = logs.length - 1; i >= 0; i--) {
        const l = logs[i];
        if (l.timeoutsLeft != null && l.teamId === teamId) return l.timeoutsLeft;
    }
    return TEAM_TIMEOUTS_TOTAL;
}

/** 납작한 바 7개 — 잔여 타임아웃은 주황, 사용한 타임아웃은 슬레이트. */
export const TimeoutBars: React.FC<{ left: number; className?: string; /** 바 한 개의 너비 클래스 (기본 w-6 = 24px) */ barWidth?: string }> = ({ left, className = '', barWidth = 'w-6' }) => (
    <div className={`flex gap-1 ${className}`} role="img" aria-label={`잔여 타임아웃 ${left}회`}>
        {Array.from({ length: TEAM_TIMEOUTS_TOTAL }).map((_, i) => (
            <span key={i} className={`${barWidth} h-1.5 rounded-sm ${i < left ? 'bg-orange-500' : 'bg-slate-700'}`} />
        ))}
    </div>
);
