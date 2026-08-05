
import type { Game } from '../../../types';

// [2026-08-04] MultiScheduleView.tsx에 로컬(비export)로 있던 날짜 헬퍼를 공용화 —
// MultiGamePbpView.tsx의 날짜 셀렉터 스트립에서도 동일 로직이 필요해짐. kstDateKey()의
// 자정 보정 로직은 두 화면에서 반드시 같은 결과를 내야 하므로(하나만 로컬로 복붙하면
// 시즌 재구성 시 미묘하게 어긋날 위험) 이 파일 하나로 합쳐서 양쪽에서 import한다.

export function fmtDayLabel(dateKey: string): string {
    const dt = new Date(dateKey + 'T00:00:00');
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${dt.getMonth() + 1}월 ${dt.getDate()}일 (${days[dt.getDay()]})`;
}

// g.date는 슬롯(game_seq) 기반 달력 계산값이라 sim_real_start_at의 시각 오프셋에 따라
// 실제 KST 자정 경계와 어긋날 수 있다(예: 23:40 다음 슬롯이 00:10인데도 g.date가 그대로).
// "시간" 컬럼과 항상 같은 진실(scheduledAt의 KST 환산)을 기준으로 삼아야 자정을 넘는 경기가
// 정확한 다음날 날짜로 표시된다.
export function kstDateKey(g: Game): string {
    if (g.scheduledAt) {
        const kst = new Date(new Date(g.scheduledAt).getTime() + 9 * 3_600_000);
        const y = kst.getUTCFullYear();
        const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
        const d = String(kst.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return g.date.slice(0, 10);
}

export function fmtDateShort(g: Game): string {
    const dt = new Date(kstDateKey(g) + 'T00:00:00');
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

// scheduledAt (UTC ISO) → KST 시각 문자열. game_seq 방식은 normalize 후 호출하므로 항상 scheduledAt 있음.
export function fmtTime(g: Game): string {
    if (g.scheduledAt) {
        const kst = new Date(new Date(g.scheduledAt).getTime() + 9 * 3_600_000);
        const h = kst.getUTCHours().toString().padStart(2, '0');
        const m = kst.getUTCMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
    }
    if (g.time) return g.time;
    return '—';
}

export interface DayGroup { dateKey: string; label: string; games: Game[] }

// games는 반드시 scheduledAt(또는 date) 기준 오름차순 정렬된 상태로 넘겨야 한다 — 순차 비교로만
// 그룹을 묶으므로(정렬 안 된 입력은 같은 날짜가 여러 그룹으로 쪼개질 수 있음).
export function groupByDay(games: Game[]): DayGroup[] {
    const groups: DayGroup[] = [];
    for (const g of games) {
        const dateKey = kstDateKey(g);
        const last = groups[groups.length - 1];
        if (last && last.dateKey === dateKey) {
            last.games.push(g);
        } else {
            groups.push({ dateKey, label: fmtDayLabel(dateKey), games: [g] });
        }
    }
    return groups;
}
