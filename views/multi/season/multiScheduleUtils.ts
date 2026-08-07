
import type { Game } from '../../../types';
import { resolveRealAt } from './multiGameReveal';

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
//
// [2026-08-06] preferVirtual — 메인리그(main_league) 정규시즌 경기는 date/time이
// scheduledAt과 무관한 "가상 NBA 캘린더" 값(예: 2027년 10월 24일)이라 사용자에게는
// 반드시 이 값을 보여줘야 한다(실제 실행 시각인 scheduledAt은 노출 금지). 반면 토너먼트와
// 메인리그 플레이오프(isPlayoff=true, 시드 기반으로 새로 생성됨)는 date/time이 scheduledAt과
// 같은 실제 시각에서 파생된 값이라 자정 경계 보정을 위해 scheduledAt을 그대로 우선한다.
// 호출부는 league.type === 'main_league' && !g.isPlayoff 조건으로 이 플래그를 넘겨야 한다.
export function kstDateKey(g: Game, preferVirtual = false): string {
    if (preferVirtual && !g.isPlayoff) {
        return g.date.slice(0, 10);
    }
    if (g.scheduledAt) {
        const kst = new Date(new Date(g.scheduledAt).getTime() + 9 * 3_600_000);
        const y = kst.getUTCFullYear();
        const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
        const d = String(kst.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return g.date.slice(0, 10);
}

export function fmtDateShort(g: Game, preferVirtual = false): string {
    const dt = new Date(kstDateKey(g, preferVirtual) + 'T00:00:00');
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

// scheduledAt (UTC ISO) → KST 시각 문자열. game_seq 방식은 normalize 후 호출하므로 항상 scheduledAt 있음.
// preferVirtual 조건은 kstDateKey와 동일(메인리그 정규시즌 경기만 가상 시각 우선).
export function fmtTime(g: Game, preferVirtual = false): string {
    if (preferVirtual && !g.isPlayoff) {
        return g.time ?? '—';
    }
    if (g.scheduledAt) {
        const kst = new Date(new Date(g.scheduledAt).getTime() + 9 * 3_600_000);
        const h = kst.getUTCHours().toString().padStart(2, '0');
        const m = kst.getUTCMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
    }
    if (g.time) return g.time;
    return '—';
}

/**
 * 메인리그(main_league) "현재 시뮬레이션 날짜"(가상 캘린더 기준) — 리그 전체 일정 중
 * 지금(nowMs)과 실제 방송 시각(scheduledAt)이 가장 가까운 경기를 찾아 그 경기의 가상
 * date를 반환한다. "오늘" 배지 판정(MultiScheduleView.tsx)과 헤더 표시(MultiHeader.tsx)가
 * 공유 — 각자 따로 계산하면 미묘하게 어긋날 위험이 있어 이 파일 하나로 합쳤다.
 */
export function findCurrentVirtualDate(
    games: Game[],
    simStart: string | null,
    gprd: number,
    nowMs: number,
): string | null {
    let bestDate: string | null = null;
    let bestDiff = Infinity;
    for (const g of games) {
        const resolvedAt = resolveRealAt(g, simStart, gprd);
        if (!resolvedAt) continue;
        const diff = Math.abs(new Date(resolvedAt).getTime() - nowMs);
        if (diff < bestDiff) { bestDiff = diff; bestDate = g.date; }
    }
    return bestDate;
}

// 카드 뷰의 날짜 컨트롤 바(저번달/저번주/화살표/데이트피커)용 날짜 산술 — 항상 로컬
// Y/M/D 컴포넌트로만 계산해서 toISOString() 같은 UTC 변환에 의한 날짜 밀림을 피한다.
function dateKeyToLocalDate(dateKey: string): Date {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d);
}
function localDateToKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
export function addDaysToKey(dateKey: string, days: number): string {
    const d = dateKeyToLocalDate(dateKey);
    d.setDate(d.getDate() + days);
    return localDateToKey(d);
}
export function addMonthsToKey(dateKey: string, months: number): string {
    const d = dateKeyToLocalDate(dateKey);
    d.setMonth(d.getMonth() + months);
    return localDateToKey(d);
}

// 날짜 컨트롤 바 중앙 라벨 — 가상 시즌 연도가 실제 연도와 다를 수 있어(예: 2027년) 연도까지 표기.
export function fmtFullDate(dateKey: string): string {
    const d = dateKeyToLocalDate(dateKey);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

export interface DayGroup { dateKey: string; label: string; games: Game[] }

// games는 반드시 scheduledAt(또는 date) 기준 오름차순 정렬된 상태로 넘겨야 한다 — 순차 비교로만
// 그룹을 묶으므로(정렬 안 된 입력은 같은 날짜가 여러 그룹으로 쪼개질 수 있음).
export function groupByDay(games: Game[], preferVirtual = false): DayGroup[] {
    const groups: DayGroup[] = [];
    for (const g of games) {
        const dateKey = kstDateKey(g, preferVirtual);
        const last = groups[groups.length - 1];
        if (last && last.dateKey === dateKey) {
            last.games.push(g);
        } else {
            groups.push({ dateKey, label: fmtDayLabel(dateKey), games: [g] });
        }
    }
    return groups;
}
