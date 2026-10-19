import React, { useMemo } from 'react';
import { resolveVirtualDayRow, type VirtualDayRow } from '../utils/leagueTimeline';

// 가상 하루(19:00 → 다음 날 03:00)의 위치를 하늘색 막대 + 막대 위에 겹친 흰 세로선 하나로 보여주고, 선 위에 가상 시각을 시 단위 작은 글씨로 적는다.
// 막대에는 지점 8개(0 AM, 3 AM, 7 PM ... 12 AM)가 등간격으로 놓이고, 선은 두 구간에서만 움직인다.
//   - 저녁: 가상 시작(19:00) → 가상 자정   =  7 PM 지점 → 12 AM 지점
//   - 자정 이후: 가상 자정 → 가상 종료(03:00) =  0 AM 지점 → 3 AM 지점
// 03:00 이후 다음 저녁까지는 3 AM 지점에 머문다. 날짜가 바뀌는 순간(가상 자정)에 선이 맨 앞으로 돌아가므로
// 22:00/22:30 경기가 다음 날짜에 걸려 끝나는 구간이 막대로 읽힌다. 위치는 호출부가 넘기는 시각(서버 보정)이
// 바뀔 때만 갱신되고 애니메이션은 없다.

/** 지점 색(왼쪽부터). 목업(가상 하루 바 아티팩트)에서 확정한 기본값. */
const POINT_COLORS = ['#0b1030', '#243064', '#e8895a', '#b0568a', '#4b3a8c', '#1c2352', '#141b45', '#0b1030'];
const SEGMENTS = POINT_COLORS.length - 1;   // 7
const EVENING_FIRST_POINT = 2;              // 7 PM 지점 인덱스
const EVENING_LAST_POINT = SEGMENTS;        // 12 AM 지점 인덱스(오른쪽 끝)
const NIGHT_LAST_POINT = 1;                 // 3 AM 지점 인덱스

const TRACK_BACKGROUND = `linear-gradient(90deg, ${POINT_COLORS.map((c, i) => `${c} ${((i / SEGMENTS) * 100).toFixed(2)}%`).join(', ')})`;

export interface VirtualDayMark {
    /** 막대 위 선 위치(0~1) */
    pos: number;
    /** 가상 시계(0~1439분, 자정 기준) */
    clockMin: number;
}

/** 현재 시각 → 막대 위 선 위치와 가상 시계. 시즌 시작 전은 7 PM, 창이 끝난 뒤는 3 AM. */
export function virtualDayMark(timeline: VirtualDayRow[], nowMs: number): VirtualDayMark {
    const row = resolveVirtualDayRow(timeline, nowMs);
    if (!row) return { pos: EVENING_FIRST_POINT / SEGMENTS, clockMin: 19 * 60 };
    const start = new Date(row.realStartAt).getTime();
    const midnight = new Date(row.realMidnightAt).getTime();
    const end = new Date(row.realEndAt).getTime();
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

    if (nowMs < midnight) {
        const f = midnight > start ? clamp01((nowMs - start) / (midnight - start)) : 0;
        return {
            pos: (EVENING_FIRST_POINT + f * (EVENING_LAST_POINT - EVENING_FIRST_POINT)) / SEGMENTS,
            clockMin: 19 * 60 + f * 300,
        };
    }
    const f = end > midnight ? clamp01((nowMs - midnight) / (end - midnight)) : 1;
    return { pos: (f * NIGHT_LAST_POINT) / SEGMENTS, clockMin: f * 180 };
}

/** 가상 시계(분) → "9 PM". 시 단위로 내림한다. */
function formatClock(clockMin: number): string {
    const h24 = Math.floor(clockMin / 60) % 24;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12} ${h24 < 12 ? 'AM' : 'PM'}`;
}

interface Props {
    timeline: VirtualDayRow[];
    /** 서버 보정 시각(ms). 호출부에서 15초 버킷으로 넘기면 그 간격으로만 위치가 바뀐다. */
    nowMs: number;
}

export const VirtualDayArc: React.FC<Props> = React.memo(({ timeline, nowMs }) => {
    const { pos, clockMin } = useMemo(() => virtualDayMark(timeline, nowMs), [timeline, nowMs]);
    const label = formatClock(clockMin);

    return (
        <div
            className="relative shrink-0 ml-3"
            style={{ width: 84, height: 26 }}
            role="img"
            aria-label={`가상 하루 진행, 가상 시각 ${label}`}
        >
            {/* 가상 시각 — 선 위, 양 끝에서는 막대 밖으로 나가지 않게 가운데 기준 위치를 안쪽으로 제한 */}
            <span
                className="absolute top-0 text-[10px] leading-[11px] text-white/80 tabular-nums whitespace-nowrap"
                style={{ left: `clamp(16px, ${pos * 100}%, calc(100% - 16px))`, transform: 'translateX(-50%)' }}
            >
                {label}
            </span>
            <div
                className="absolute left-0 right-0 rounded-full"
                style={{ top: 14, height: 8, background: TRACK_BACKGROUND, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.28)' }}
            />
            {/* 현재 위치 — 막대 위에 겹친 흰 세로선(막대보다 위아래로 2px씩 길게) */}
            <span
                className="absolute w-[2px] rounded-full bg-white"
                style={{ top: 12, height: 12, left: `${pos * 100}%`, transform: 'translateX(-50%)', boxShadow: '0 0 4px rgba(255,255,255,0.8)' }}
            />
        </div>
    );
});
VirtualDayArc.displayName = 'VirtualDayArc';
