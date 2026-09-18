
/**
 * ScheduleSettingsTab — 세션 설정 "일정" 탭 (어드민 전용).
 *
 * [2026-09-18] 고정 길이 가상 하루(Fixed-Day) 타임라인 구조(docs/plan/fixed-day-schedule-plan.md) 기준:
 *  1. 하루 길이(20~40분) / 실제 종료일 / 일일 시뮬 시간대 시작 시각을 수정하고, 그 설정으로 "아직
 *     시작하지 않은 가상 날짜"를 오늘부터 다시 깔았을 때의 결과를 미리보기한다.
 *  2. "남은 날짜 재배치"를 누르면 utils/leagueTimeline.ts(서버 미러)로 계산한 새 타임라인 행 +
 *     미실행 경기의 새 scheduled_at/game_seq + 설정값을 apply_league_reschedule RPC로 한 트랜잭션에
 *     반영한다. 재배치는 지금 시각 + 5분 이후 슬롯부터 시작하고, 이미 시작된 가상 날짜는 건드리지 않는다.
 *  3. 전체 일정표는 실제 날짜 → 가상 날짜(타임라인 행) → 경기 3단 구조. 각 가상 날짜 행에 실제
 *     시작/자정(날짜 전환)/종료 시각을 보여주고, 경기별로 실제 시뮬 시각을 수동 편집할 수 있다
 *     (AdminSimView와 같은 updateGameScheduledAt 경로).
 *
 * 타임라인이 없는 리그(이 구조 이전에 만든 메인리그, 토너먼트)는 재배치 없이 경기별 수동 편집만 지원한다.
 * 표시 시각은 전부 KST 벽시계 기준. 가상 캘린더 날짜/시간(game_date/game_time)은 절대 수정하지 않는다.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    CalendarDays, Clock, Loader2, Pencil, Check, X, RefreshCw, AlertTriangle, ChevronDown, ChevronRight, Save, Wand2, Play, FastForward,
} from 'lucide-react';
import type { Game } from '../../../../types';
import type { LeagueRow, RoomRow, LeagueTeamRow } from '../../../../services/multi/roomQueries';
import { loadSchedule } from '../../../../services/multi/gameQueries';
import {
    updateGameScheduledAt, updateLeagueSettings, applyLeagueReschedule, adminTimeJump, simGameOverride,
    type RescheduleDayInput, type RescheduleGameInput, type RescheduleSettingsInput,
} from '../../../../services/multi/leagueService';
import { getAllStarKeyDates } from '../../../../utils/allStarSelection';
import { useGame } from '../../../../hooks/useGameContext';
import {
    buildLeagueTimeline, computeTimelineFeasibility, assignRealTimes, resolveVirtualDate, allStarScheduleFromTimeline,
    msToKstDateStr, addDaysToDateStr, daysBetweenDateStr, minToHHMM, hhmmToMin,
    MIN_DAY_LENGTH_MIN, MAX_DAY_LENGTH_MIN, DEFAULT_DAY_LENGTH_MIN, DEFAULT_WINDOW_START_MIN, DEFAULT_REPLAY_MIN,
    REPLAY_MINUTE_OPTIONS, lateGameClampsAt,
    type VirtualDayRow, type VirtualDayKind, type TimedGameLike,
} from '../../../../utils/leagueTimeline';
import { KST_OFFSET_MS, kstDateStr, kstTimeStr } from '../../../../utils/kstTime';
import { getGameDisplayState } from '../../season/multiGameReveal';
import { useServerClockBucket, getServerNow } from '../../../../utils/serverClock';
import { useLeagueContext } from '../LeagueLayout';

// ── 상수 ──────────────────────────────────────────────────────────────────────

/** "지금부터 재배치"할 때 첫 슬롯까지 두는 최소 여유 — 스케줄러(30초 폴링 + 60초 선행 시뮬)가
 *  저장 직후 첫 경기를 곧바로 과거로 판정하지 않도록. */
const RESCHEDULE_LEAD_MS = 5 * 60_000;
/** 시간 점프 뒤 대상일 이후 첫 가상 날짜가 시작하기까지의 여유 — 스케줄러 선행 계산(60초) + 화면 전환 시간. */
const JUMP_GAP_MS = 2 * 60_000;
/** 강제 진행 진행률 표시용 폴링 주기/최대 시간. */
const JUMP_POLL_MS = 5_000;
const JUMP_POLL_MAX_MS = 15 * 60_000;
/** 경기당 시뮬 계산 시간 추정치(초) — fly 로그 실측 1.5~1.7초. */
const SIM_SECONDS_PER_GAME = 1.7;
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
const KIND_LABEL: Record<VirtualDayKind, string> = {
    regular: '정규', allstar_announce: '올스타 발표', allstar_rising: '라이징스타', allstar_contests: '3점·덩크',
    allstar_main: '올스타 본경기', allstar_break: '브레이크', playoff: '플레이오프',
};

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

function fmtKstDateTime(iso: string | undefined | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return `${kstDateStr(d)} ${kstTimeStr(d)}`;
}
function fmtKstTime(iso: string | undefined | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : kstTimeStr(d);
}
function fmtDateLabel(dateKey: string): string {
    const [y, m, d] = dateKey.split('-').map(Number);
    const wd = WEEKDAY_KO[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} (${wd})`;
}
function fmtVirtualShort(dateKey: string): string {
    const [y, m, d] = dateKey.split('-').map(Number);
    const wd = WEEKDAY_KO[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    return `${m}/${d} (${wd})`;
}
function fmtMinutes(min: number): string {
    if (min >= 60) {
        const h = Math.floor(min / 60), m = Math.round(min % 60);
        return m ? `${h}시간 ${m}분` : `${h}시간`;
    }
    const whole = Math.floor(min), sec = Math.round((min - whole) * 60);
    if (whole === 0) return `${sec}초`;
    return sec ? `${whole}분 ${sec}초` : `${whole}분`;
}
function toInputValue(iso: string | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 16);
}
function kstLocalToIso(local: string): string {
    return new Date(new Date(`${local}:00Z`).getTime() - KST_OFFSET_MS).toISOString();
}

// ── 재배치 계획 ───────────────────────────────────────────────────────────────

interface ReschedulePlan {
    fromVirtualDate: string;
    newRows: VirtualDayRow[];              // 다시 깐 행(가상 날짜 오름차순)
    mergedRows: VirtualDayRow[];           // 유지 행 + 새 행(realStartAt 오름차순)
    nextAtById: Map<string, string>;
    dayInputs: RescheduleDayInput[];
    gameInputs: RescheduleGameInput[];
    settings: RescheduleSettingsInput;
    stats: {
        relaidDays: number; keptDays: number; relaidGames: number;
        realDaysBudget: number; perDay: number; windowMin: number; windowEndMin: number;
        firstAt: string | null; lastAt: string | null; lastRealDate: string | null; overshootDays: number;
        feasible: boolean; reasons: string[];
    };
}

function buildReschedulePlan(
    timeline: VirtualDayRow[], schedule: Game[],
    dayLengthMin: number, windowStartMin: number, realEndDate: string, replayMin: number, nowMs: number,
): ReschedulePlan | null {
    if (!timeline.length) return null;
    const notBefore = nowMs + RESCHEDULE_LEAD_MS;
    const splitIdx = timeline.findIndex(r => new Date(r.realStartAt).getTime() > notBefore);
    if (splitIdx < 0) return null; // 남은 가상 날짜 없음
    const kept = timeline.slice(0, splitIdx);
    const toRelay = timeline.slice(splitIdx);

    const todayKst = msToKstDateStr(nowMs);
    const endDate = realEndDate >= todayKst ? realEndDate : todayKst;
    const feas = computeTimelineFeasibility({
        realStartDate: todayKst, realEndDate: endDate, dayLengthMin, windowStartMin, virtualDayCount: toRelay.length, replayMin,
    });
    const newRows = buildLeagueTimeline(
        toRelay.map(r => ({ date: r.date, kind: r.kind })),
        { realStartDate: todayKst, dayLengthMin, windowStartMin, perDay: feas.perDay, notBeforeMs: notBefore, firstDayIndex: toRelay[0].dayIndex },
    );
    const mergedRows = [...kept, ...newRows].sort((a, b) => a.realStartAt.localeCompare(b.realStartAt));

    const relayDates = new Set(newRows.map(r => r.date));
    const targets = schedule.filter(g => !g.played && relayDates.has(g.date.slice(0, 10)));
    const maxKeptSeq = schedule.reduce((m, g) => (!relayDates.has(g.date.slice(0, 10)) && g.game_seq != null && g.game_seq > m ? g.game_seq : m), -1);
    const { games: timed } = assignRealTimes(
        targets.map((g): TimedGameLike => ({ id: g.id, date: g.date.slice(0, 10), time: g.time, game_seq: g.game_seq, seriesId: g.seriesId })),
        newRows, dayLengthMin, replayMin, { renumberSeq: true, renumberFrom: maxKeptSeq + 1 },
    );
    const nextAtById = new Map<string, string>();
    const gameInputs: RescheduleGameInput[] = [];
    for (const g of timed) {
        if (!g.scheduledAt) continue;
        nextAtById.set(g.id, g.scheduledAt);
        gameInputs.push({ game_id: g.id, scheduled_at: g.scheduledAt, game_seq: g.game_seq });
    }

    const lastRow = newRows[newRows.length - 1];
    const lastRealDate = lastRow ? msToKstDateStr(new Date(lastRow.realEndAt).getTime()) : null;
    const overshootDays = lastRealDate && lastRealDate > endDate ? daysBetweenDateStr(endDate, lastRealDate) : 0;
    const allStar = allStarScheduleFromTimeline(mergedRows);

    return {
        fromVirtualDate: toRelay[0].date,
        newRows, mergedRows, nextAtById,
        dayInputs: newRows.map(r => ({
            virtual_date: r.date, day_index: r.dayIndex, kind: r.kind,
            real_start_at: r.realStartAt, real_midnight_at: r.realMidnightAt, real_end_at: r.realEndAt,
        })),
        gameInputs,
        settings: {
            day_length_min: dayLengthMin,
            real_end_date: endDate,
            daily_window_start_min: windowStartMin,
            daily_window_end_min: Math.min(1440, feas.windowEndMin),
            replay_minutes: replayMin,
            ...(allStar ? { allstar_schedule: allStar } : {}),
        },
        stats: {
            relaidDays: newRows.length, keptDays: kept.length, relaidGames: gameInputs.length,
            realDaysBudget: feas.realDays, perDay: feas.perDay, windowMin: feas.windowMin, windowEndMin: feas.windowEndMin,
            firstAt: newRows[0]?.realStartAt ?? null, lastAt: lastRow?.realEndAt ?? null, lastRealDate, overshootDays,
            feasible: feas.feasible, reasons: feas.reasons,
        },
    };
}

// ── 강제 진행(시간 점프) 계획 ──────────────────────────────────────────────────
// [2026-09-18 3단계] 대상 가상 날짜까지를 "지금" 끝난 것으로 만든다(docs/plan/fixed-day-schedule-plan.md §6).
//  - 대상일 이하 행/경기: 서버 RPC가 Δ = 대상일 real_end_at − now 만큼 과거로 이동(여기선 개수만 센다).
//  - 대상일 이후 행/경기: 균일 이동은 창 밖(심야)으로 밀리므로, 지금 + JUMP_GAP_MS 이후 슬롯부터 창 격자에 다시
//    깐다. 모드 '앞당기기'는 하루당 가상 일수를 그대로(리그가 일찍 끝남), '종료일 유지'는 종료일에 맞춰 다시 계산.

type JumpMode = 'shift' | 'keep_end';

interface JumpPlan {
    targetDate: string;
    daysToPass: number;          // 대상일 이하 & 아직 안 끝난 가상 일수
    gamesToProcess: number;      // 대상일 이하 미실행 경기(스케줄러가 처리할 백로그)
    liveNow: number;             // 지금 라이브 중(점프 순간 종료 화면으로 전환)
    newRows: VirtualDayRow[];
    dayInputs: RescheduleDayInput[];
    gameInputs: RescheduleGameInput[];
    perDay: number; feasible: boolean; reasons: string[];
    firstFutureAt: string | null; lastEndAt: string | null; newEndDate: string | null;
    newToday: string;
    crossesAllStarVoteEnd: boolean; crossesAllStar: boolean; crossesRegularSeasonEnd: boolean;
    estimatedSeconds: number;
}

function buildJumpPlan(
    timeline: VirtualDayRow[], schedule: Game[], league: LeagueRow,
    targetDate: string, mode: JumpMode, nowMs: number,
): JumpPlan | { error: string } {
    const targetRow = timeline.find(r => r.date === targetDate);
    if (!targetRow) return { error: '타임라인에 없는 가상 날짜입니다.' };
    if (new Date(targetRow.realEndAt).getTime() <= nowMs) return { error: '이미 지난 가상 날짜입니다.' };

    const D = league.day_length_min ?? DEFAULT_DAY_LENGTH_MIN;
    const windowStartMin = league.daily_window_start_min ?? DEFAULT_WINDOW_START_MIN;
    const replayMin = league.replay_minutes ?? DEFAULT_REPLAY_MIN;
    const todayKst = msToKstDateStr(nowMs);
    const futureRows = timeline.filter(r => r.date > targetDate);

    // 현재 격자의 하루당 가상 일수(가장 많이 담긴 실제 날짜 기준)
    const perRealDay = new Map<string, number>();
    for (const r of timeline) { const k = msToKstDateStr(new Date(r.realStartAt).getTime()); perRealDay.set(k, (perRealDay.get(k) ?? 0) + 1); }
    const currentPerDay = Math.max(1, ...perRealDay.values());

    let perDay = currentPerDay, feasible = true, reasons: string[] = [];
    if (mode === 'keep_end' && futureRows.length) {
        const endDate = league.real_end_date && league.real_end_date >= todayKst ? league.real_end_date : todayKst;
        const feas = computeTimelineFeasibility({ realStartDate: todayKst, realEndDate: endDate, dayLengthMin: D, windowStartMin, virtualDayCount: futureRows.length, replayMin });
        perDay = feas.perDay; feasible = feas.feasible; reasons = feas.reasons;
    }
    const newRows = futureRows.length
        ? buildLeagueTimeline(futureRows.map(r => ({ date: r.date, kind: r.kind })), {
            realStartDate: todayKst, dayLengthMin: D, windowStartMin, perDay, notBeforeMs: nowMs + JUMP_GAP_MS, firstDayIndex: futureRows[0].dayIndex,
        })
        : [];
    const futureDates = new Set(newRows.map(r => r.date));
    const futureTargets = schedule.filter(g => !g.played && futureDates.has(g.date.slice(0, 10)));
    const maxKeptSeq = schedule.reduce((m, g) => (!futureDates.has(g.date.slice(0, 10)) && g.game_seq != null && g.game_seq > m ? g.game_seq : m), -1);
    const { games: timed } = assignRealTimes(
        futureTargets.map((g): TimedGameLike => ({ id: g.id, date: g.date.slice(0, 10), time: g.time, game_seq: g.game_seq, seriesId: g.seriesId })),
        newRows, D, replayMin, { renumberSeq: true, renumberFrom: maxKeptSeq + 1 },
    );
    const gameInputs: RescheduleGameInput[] = timed.filter(g => g.scheduledAt).map(g => ({ game_id: g.id, scheduled_at: g.scheduledAt!, game_seq: g.game_seq }));

    const gamesToProcess = schedule.filter(g => !g.played && g.date.slice(0, 10) <= targetDate).length;
    const liveNow = schedule.filter(g => getGameDisplayState(g, nowMs) === 'live').length;
    const daysToPass = timeline.filter(r => r.date <= targetDate && new Date(r.realEndAt).getTime() > nowMs).length;
    const lastRow = newRows[newRows.length - 1];
    const todayVirtual = resolveVirtualDate(timeline, nowMs) ?? targetDate;
    const year = league.virtual_season_year ?? new Date().getFullYear();
    const keyDates = getAllStarKeyDates(year);
    const regularSeasonEnd = `${year + 1}-04-13`;

    return {
        targetDate, daysToPass, gamesToProcess, liveNow, newRows,
        dayInputs: newRows.map(r => ({ virtual_date: r.date, day_index: r.dayIndex, kind: r.kind, real_start_at: r.realStartAt, real_midnight_at: r.realMidnightAt, real_end_at: r.realEndAt })),
        gameInputs, perDay, feasible, reasons,
        firstFutureAt: newRows[0]?.realStartAt ?? null,
        lastEndAt: lastRow?.realEndAt ?? null,
        newEndDate: lastRow ? msToKstDateStr(new Date(lastRow.realEndAt).getTime()) : null,
        newToday: addDaysToDateStr(targetDate, 1),
        crossesAllStarVoteEnd: todayVirtual < keyDates.allStarVoteEnd && targetDate >= keyDates.allStarVoteEnd,
        crossesAllStar: todayVirtual <= keyDates.allStarMainGameDate && targetDate >= keyDates.allStarStart,
        crossesRegularSeasonEnd: todayVirtual <= regularSeasonEnd && targetDate >= regularSeasonEnd,
        estimatedSeconds: Math.round(gamesToProcess * SIM_SECONDS_PER_GAME) + (todayVirtual <= regularSeasonEnd && targetDate >= regularSeasonEnd ? 60 : 0),
    };
}

// ── 컴포넌트 ──────────────────────────────────────────────────────────────────

interface Props {
    league: LeagueRow;
    room: RoomRow | null;
    leagueTeams: LeagueTeamRow[];
    onLeagueSaved: () => void;
}

export const ScheduleSettingsTab: React.FC<Props> = ({ league, room, leagueTeams, onLeagueSaved }) => {
    const { timeline } = useLeagueContext();
    const { session } = useGame();
    const isMainLeague = league.type === 'main_league';
    const hasTimeline = timeline.length > 0;
    const serverNow = useServerClockBucket();

    // ── 스케줄 로드 ───────────────────────────────────────────────────────────
    const [schedule, setSchedule] = useState<Game[]>([]);
    const [loading, setLoading]   = useState(true);
    const refresh = useCallback(async () => {
        if (!room?.id) return;
        setLoading(true);
        setSchedule(await loadSchedule(room.id));
        setLoading(false);
    }, [room?.id]);
    useEffect(() => { refresh(); }, [refresh]);

    const teamName = useMemo(() => {
        const m = new Map<string, string>();
        for (const t of leagueTeams) m.set(t.team_slug, t.team_name || t.team_slug.toUpperCase());
        return (slug: string) => m.get(slug) ?? slug.toUpperCase();
    }, [leagueTeams]);

    // ── 설정 폼 ───────────────────────────────────────────────────────────────
    const savedDayLength = league.day_length_min ?? DEFAULT_DAY_LENGTH_MIN;
    const savedWindowStart = league.daily_window_start_min ?? DEFAULT_WINDOW_START_MIN;
    const savedEndDate = league.real_end_date ?? (timeline.length ? msToKstDateStr(new Date(timeline[timeline.length - 1].realEndAt).getTime()) : msToKstDateStr(Date.now()));
    const savedReplay = league.replay_minutes ?? DEFAULT_REPLAY_MIN;
    const [dayLength, setDayLength]     = useState(savedDayLength);
    const [windowStart, setWindowStart] = useState(minToHHMM(savedWindowStart));
    const [endDate, setEndDate]         = useState(savedEndDate);
    const [replayMin, setReplayMin]     = useState(savedReplay);
    useEffect(() => { setDayLength(savedDayLength); setWindowStart(minToHHMM(savedWindowStart)); setEndDate(savedEndDate); setReplayMin(savedReplay); }, [savedDayLength, savedWindowStart, savedEndDate, savedReplay]);
    const windowStartMin = hhmmToMin(windowStart, DEFAULT_WINDOW_START_MIN);
    const settingsDirty = dayLength !== savedDayLength || windowStartMin !== savedWindowStart || endDate !== savedEndDate || replayMin !== savedReplay;
    const lateGameClamped = lateGameClampsAt(dayLength, replayMin);

    const [savingSettings, setSavingSettings] = useState(false);
    const [settingsMsg, setSettingsMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const handleSaveSettingsOnly = async () => {
        setSavingSettings(true); setSettingsMsg(null);
        const { error } = await updateLeagueSettings({ leagueId: league.id, dayLengthMin: dayLength, dailyWindowStartMin: windowStartMin, realEndDate: endDate, replayMinutes: replayMin });
        setSavingSettings(false);
        if (error) { setSettingsMsg({ ok: false, text: error }); return; }
        setSettingsMsg({ ok: true, text: replayMin !== savedReplay
            ? '설정을 저장했습니다. 리플레이 길이는 즉시 모든 화면의 결과 공개 시점에 반영됩니다(서버는 최대 1분 지연). 타임라인과 경기 시각은 그대로이며, 늦은 경기의 클램프를 다시 맞추려면 "남은 날짜 재배치"를 실행하세요.'
            : '설정을 저장했습니다. 타임라인과 경기 시각은 그대로이며 "남은 날짜 재배치"를 눌러야 반영됩니다.' });
        onLeagueSaved();
    };

    // ── 현재 타임라인 요약 ────────────────────────────────────────────────────
    const todayVirtual = hasTimeline ? resolveVirtualDate(timeline, serverNow) : null;
    const currentSummary = useMemo(() => {
        if (!hasTimeline) return null;
        const byRealDay = new Map<string, number>();
        for (const r of timeline) {
            const k = msToKstDateStr(new Date(r.realStartAt).getTime());
            byRealDay.set(k, (byRealDay.get(k) ?? 0) + 1);
        }
        const perDay = Math.max(...byRealDay.values());
        const first = timeline[0], last = timeline[timeline.length - 1];
        return {
            virtualDays: timeline.length, realDays: byRealDay.size, perDay,
            windowMin: perDay * savedDayLength,
            firstAt: first.realStartAt, lastAt: last.realEndAt,
            regularDays: timeline.filter(r => r.kind === 'regular').length,
            playoffDays: timeline.filter(r => r.kind === 'playoff').length,
        };
    }, [timeline, hasTimeline, savedDayLength]);

    // ── 미리보기 / 재배치 ─────────────────────────────────────────────────────
    const [previewOn, setPreviewOn] = useState(false);
    const [previewAnchorMs, setPreviewAnchorMs] = useState(() => getServerNow());
    const plan = useMemo(() => {
        if (!previewOn || !hasTimeline) return null;
        return buildReschedulePlan(timeline, schedule, dayLength, windowStartMin, endDate, replayMin, previewAnchorMs);
    }, [previewOn, hasTimeline, timeline, schedule, dayLength, windowStartMin, endDate, replayMin, previewAnchorMs]);
    const togglePreview = () => { if (!previewOn) setPreviewAnchorMs(getServerNow()); setPreviewOn(v => !v); };

    const [applying, setApplying] = useState(false);
    const [applyMsg, setApplyMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const handleApply = async () => {
        if (!hasTimeline) return;
        const fresh = buildReschedulePlan(timeline, schedule, dayLength, windowStartMin, endDate, replayMin, getServerNow());
        if (!fresh) { setApplyMsg({ ok: false, text: '재배치할 남은 가상 날짜가 없습니다.' }); return; }
        if (!fresh.stats.feasible) { setApplyMsg({ ok: false, text: `이 설정으로는 배치할 수 없습니다: ${fresh.stats.reasons.join(' ')}` }); return; }
        const s = fresh.stats;
        const ok = window.confirm(
            `가상 날짜 ${s.relaidDays}일(${fresh.fromVirtualDate}부터)과 미실행 경기 ${s.relaidGames}경기의 시각을 다시 배정합니다.\n` +
            `• 하루 길이 ${dayLength}분 · 실제 하루에 가상 ${s.perDay}일 · 시간대 ${minToHHMM(windowStartMin)}~${minToHHMM(Math.min(1440, s.windowEndMin))}\n` +
            `• 첫 슬롯 ${fmtKstDateTime(s.firstAt)} → 마지막 ${fmtKstDateTime(s.lastAt)}${s.overshootDays ? ` (종료일보다 ${s.overshootDays}일 초과)` : ''}\n\n` +
            `모든 참가자에게 즉시 반영되며 되돌릴 수 없습니다. 진행할까요?`,
        );
        if (!ok) return;
        setApplying(true); setApplyMsg(null);
        const { days, games, error } = await applyLeagueReschedule(league.id, fresh.fromVirtualDate, fresh.dayInputs, fresh.gameInputs, fresh.settings);
        setApplying(false);
        if (error) { setApplyMsg({ ok: false, text: `재배치 실패: ${error}` }); return; }
        setApplyMsg({ ok: true, text: `가상 날짜 ${days}일, 경기 ${games}건의 시각을 다시 배정했습니다.` });
        setPreviewOn(false);
        onLeagueSaved();
        await refresh();
    };

    // ── 단건 편집 ─────────────────────────────────────────────────────────────
    const [editErr, setEditErr] = useState<string | null>(null);
    const handleEditOne = useCallback(async (gameId: string, local: string): Promise<boolean> => {
        if (!room?.id || !local) return false;
        const iso = kstLocalToIso(local);
        if (new Date(iso).getTime() <= getServerNow()) {
            if (!window.confirm('과거 시각입니다. 저장하면 이 경기는 곧바로 시뮬레이션됩니다. 진행할까요?')) return false;
        }
        const { error } = await updateGameScheduledAt(room.id, gameId, iso);
        if (error) { setEditErr(error); return false; }
        setEditErr(null);
        await refresh();
        return true;
    }, [room?.id, refresh]);

    // ── 단건 즉시 시작 (기존 /sim-override — 지금 계산 + 지금부터 리플레이) ─────
    const handleStartNow = useCallback(async (game: Game) => {
        if (!room?.id) return;
        if (!window.confirm(`${game.awayTeamId.toUpperCase()} @ ${game.homeTeamId.toUpperCase()} 경기를 지금 바로 시작할까요? 예정 시각과 무관하게 즉시 계산되고 지금부터 리플레이가 재생됩니다.`)) return;
        const res = await simGameOverride(room.id, game.id, session?.access_token);
        if (!res.ok) { setEditErr(res.error ?? '즉시 시작 실패'); return; }
        setEditErr(null);
        await refresh();
    }, [room?.id, session?.access_token, refresh]);

    // ── 강제 진행(시간 점프) ──────────────────────────────────────────────────
    const todayVirtualForJump = hasTimeline ? resolveVirtualDate(timeline, serverNow) : null;
    const lastVirtualDate = timeline.length ? timeline[timeline.length - 1].date : null;
    const [jumpTargetKind, setJumpTargetKind] = useState<'today' | 'date'>('today');
    const [jumpDate, setJumpDate] = useState('');
    const [jumpMode, setJumpMode] = useState<JumpMode>('shift');
    const [jumping, setJumping] = useState(false);
    const [jumpMsg, setJumpMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [processingSince, setProcessingSince] = useState<number | null>(null);
    const jumpTargetDate = jumpTargetKind === 'today' ? todayVirtualForJump : (jumpDate || null);
    const jumpPlan = useMemo(() => {
        if (!hasTimeline || !jumpTargetDate) return null;
        return buildJumpPlan(timeline, schedule, league, jumpTargetDate, jumpMode, serverNow);
    }, [hasTimeline, timeline, schedule, league, jumpTargetDate, jumpMode, serverNow]);
    const jumpPlanOk = jumpPlan && !('error' in jumpPlan) ? jumpPlan : null;

    const handleJump = async () => {
        if (!hasTimeline || !jumpTargetDate) return;
        const fresh = buildJumpPlan(timeline, schedule, league, jumpTargetDate, jumpMode, getServerNow());
        if ('error' in fresh) { setJumpMsg({ ok: false, text: fresh.error }); return; }
        if (!fresh.feasible) { setJumpMsg({ ok: false, text: `종료일 유지가 불가능합니다: ${fresh.reasons.join(' ')} 앞당기기 모드를 쓰거나 종료일을 늦추세요.` }); return; }
        const lines = [
            `가상 ${fmtVirtualShort(fresh.targetDate)}까지 강제 진행합니다.`,
            `• 지나가는 가상 일수 ${fresh.daysToPass}일 · 계산될 경기 ${fresh.gamesToProcess}경기 (약 ${Math.max(1, Math.round(fresh.estimatedSeconds / 60))}분 소요)`,
            `• 진행 후 현재 날짜: ${fmtVirtualShort(fresh.newToday)} · 다음 경기일 첫 슬롯 ${fmtKstDateTime(fresh.firstFutureAt)}`,
            `• 남은 일정 종료: ${fmtKstDateTime(fresh.lastEndAt)} (${jumpMode === 'shift' ? '앞당기기' : '종료일 유지'})`,
            fresh.liveNow ? `• 지금 라이브 중인 ${fresh.liveNow}경기는 즉시 종료 화면으로 바뀝니다.` : '',
            fresh.crossesAllStarVoteEnd ? '• 올스타 투표 마감 스냅샷이 생략되어 올스타 본경기가 실행되지 않을 수 있습니다.' : '',
            fresh.crossesRegularSeasonEnd ? '• 정규시즌 종료 처리와 플레이오프 생성이 자동으로 이어집니다(라운드마다 30초 이상 추가).' : '',
            '',
            '모든 참가자에게 즉시 반영되며 되돌릴 수 없습니다. 진행할까요?',
        ].filter(l => l !== '');
        if (!window.confirm(lines.join('\n'))) return;
        setJumping(true); setJumpMsg(null);
        const res = await adminTimeJump(league.id, fresh.targetDate, fresh.dayInputs, fresh.gameInputs, {
            mode: jumpMode, client_now: new Date().toISOString(), games_to_process: fresh.gamesToProcess, days_to_pass: fresh.daysToPass,
        });
        setJumping(false);
        if (res.error) { setJumpMsg({ ok: false, text: `강제 진행 실패: ${res.error}` }); return; }
        setJumpMsg({ ok: true, text: `가상 ${fmtVirtualShort(fresh.targetDate)}까지 이동했습니다(Δ ${Math.round(res.deltaSeconds / 60)}분). 대상일 이하 ${res.rowsShifted}일·경기 ${res.gamesShifted}건 이동, 라이브 ${res.gamesLiveFinalized}건 종료, 이후 ${res.rowsRelaid}일 재배치. 스케줄러가 백로그를 처리하는 동안 아래 진행 상황을 확인하세요.` });
        onLeagueSaved();
        await refresh();
        setProcessingSince(Date.now());
    };

    // 점프 뒤 백로그 처리 진행 표시 — 예정 시각이 지난 미실행 경기 수가 0이 될 때까지 5초마다 재조회.
    const dueUnplayed = useMemo(() => schedule.filter(g => !g.played && g.scheduledAt && new Date(g.scheduledAt).getTime() <= serverNow).length, [schedule, serverNow]);
    useEffect(() => {
        if (processingSince == null) return;
        const id = setInterval(() => { refresh(); }, JUMP_POLL_MS);
        return () => clearInterval(id);
    }, [processingSince, refresh]);
    useEffect(() => {
        if (processingSince == null) return;
        if (dueUnplayed === 0 || Date.now() - processingSince > JUMP_POLL_MAX_MS) setProcessingSince(null);
    }, [dueUnplayed, processingSince]);

    // ── 표 데이터: 실제 날짜 → 가상 날짜 행 → 경기 ───────────────────────────
    const [teamFilter, setTeamFilter]     = useState('all');
    const [unplayedOnly, setUnplayedOnly] = useState(false);
    const [openReal, setOpenReal]         = useState<Set<string> | null>(null);
    const [openVirtual, setOpenVirtual]   = useState<Set<string>>(new Set());

    const gamesByDate = useMemo(() => {
        const m = new Map<string, Game[]>();
        for (const g of schedule) {
            if (teamFilter !== 'all' && g.homeTeamId !== teamFilter && g.awayTeamId !== teamFilter) continue;
            if (unplayedOnly && g.played) continue;
            const k = g.date.slice(0, 10);
            const arr = m.get(k) ?? [];
            arr.push(g);
            m.set(k, arr);
        }
        for (const arr of m.values()) arr.sort((a, b) => (a.scheduledAt ?? '9').localeCompare(b.scheduledAt ?? '9') || (a.time ?? '').localeCompare(b.time ?? ''));
        return m;
    }, [schedule, teamFilter, unplayedOnly]);

    interface VirtualDayView { row: VirtualDayRow; games: Game[]; previewStart?: string }
    interface RealDayView { key: string; days: VirtualDayView[]; firstAt: string; lastAt: string; gameCount: number; vFrom: string; vTo: string }
    const realDays = useMemo<RealDayView[]>(() => {
        // 타임라인이 없는 리그: 경기의 scheduledAt KST 날짜로 가상 행을 흉내 낸다(재배치 불가, 편집만).
        const rows: VirtualDayRow[] = hasTimeline ? timeline : (() => {
            const seen = new Map<string, VirtualDayRow>();
            for (const g of schedule) {
                if (!g.scheduledAt) continue;
                const d = g.date.slice(0, 10);
                if (!seen.has(d)) seen.set(d, { date: d, kind: g.isPlayoff ? 'playoff' : 'regular', dayIndex: seen.size, realStartAt: g.scheduledAt, realMidnightAt: g.scheduledAt, realEndAt: g.scheduledAt });
                else if (g.scheduledAt < seen.get(d)!.realStartAt) seen.get(d)!.realStartAt = g.scheduledAt;
            }
            return [...seen.values()].sort((a, b) => a.realStartAt.localeCompare(b.realStartAt));
        })();
        const filterActive = teamFilter !== 'all' || unplayedOnly;
        const groups: RealDayView[] = [];
        for (const row of rows) {
            const games = gamesByDate.get(row.date) ?? [];
            if (filterActive && games.length === 0) continue;
            const key = msToKstDateStr(new Date(row.realStartAt).getTime());
            let last = groups[groups.length - 1];
            if (!last || last.key !== key) {
                last = { key, days: [], firstAt: row.realStartAt, lastAt: row.realEndAt, gameCount: 0, vFrom: row.date, vTo: row.date };
                groups.push(last);
            }
            const previewStart = plan?.newRows.find(r => r.date === row.date)?.realStartAt;
            last.days.push({ row, games, previewStart });
            last.lastAt = row.realEndAt; last.vTo = row.date; last.gameCount += games.length;
        }
        return groups;
    }, [hasTimeline, timeline, schedule, gamesByDate, teamFilter, unplayedOnly, plan]);

    const todayKey = msToKstDateStr(serverNow);
    const defaultOpenReal = useMemo(() => {
        const set = new Set<string>();
        const idx = realDays.findIndex(d => d.key >= todayKey);
        if (idx >= 0) set.add(realDays[idx].key);
        else if (realDays.length) set.add(realDays[realDays.length - 1].key);
        return set;
    }, [realDays, todayKey]);
    const effectiveOpenReal = openReal ?? defaultOpenReal;
    const toggleReal = (k: string) => { const n = new Set(effectiveOpenReal); n.has(k) ? n.delete(k) : n.add(k); setOpenReal(n); };
    const toggleVirtual = (k: string) => setOpenVirtual(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

    if (!room) return null;

    const totalGames   = schedule.filter(g => !g.isAllstar).length;
    const playedGames  = schedule.filter(g => g.played && !g.isAllstar).length;

    return (
        <div className="space-y-6">
            {/* ── 설정 + 요약 ─────────────────────────────────────────────── */}
            {isMainLeague && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-4">
                        <h2 className="text-sm font-bold text-white flex items-center gap-2">
                            <CalendarDays size={14} className="text-indigo-400" />
                            타임라인 설정
                        </h2>
                        {!hasTimeline && (
                            <p className="text-xs text-amber-400 ko-normal leading-relaxed">
                                이 리그는 고정 길이 가상 하루 타임라인이 없는 구 구조라 재배치를 지원하지 않습니다. 아래 일정표에서 경기별 시각만 수정할 수 있습니다.
                            </p>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs text-slate-400 ko-normal block mb-1">가상 하루 길이 (분) <span className="text-slate-600">{MIN_DAY_LENGTH_MIN}–{MAX_DAY_LENGTH_MIN}</span></label>
                                <input type="number" min={MIN_DAY_LENGTH_MIN} max={MAX_DAY_LENGTH_MIN} step={1} value={dayLength} disabled={!hasTimeline}
                                    onChange={e => setDayLength(Math.min(MAX_DAY_LENGTH_MIN, Math.max(MIN_DAY_LENGTH_MIN, Number(e.target.value) || MIN_DAY_LENGTH_MIN)))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50" />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 ko-normal block mb-1">시뮬 시간대 시작 (KST)</label>
                                <input type="time" value={windowStart} disabled={!hasTimeline} onChange={e => setWindowStart(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50" />
                            </div>
                            <div className="col-span-2">
                                <label className="text-xs text-slate-400 ko-normal block mb-1">경기 리플레이 길이 (결과 공개 지연)</label>
                                <div className="flex gap-2 flex-wrap">
                                    {REPLAY_MINUTE_OPTIONS.map(m => (
                                        <button key={m} type="button" disabled={!hasTimeline} onClick={() => setReplayMin(m)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${replayMin === m ? 'bg-indigo-600 text-white' : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'}`}>
                                            {m}분
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs text-slate-600 ko-normal mt-1">
                                    한 경기가 재생되는 시간이자 결과가 숨겨지는 시간. 저장 즉시 모든 화면의 공개 시점에 반영됩니다.
                                    {lateGameClamped && <span className="text-amber-400"> 이 조합에서는 22:00·22:30 경기 시작이 하루 안에 끝나도록 앞당겨집니다.</span>}
                                </p>
                            </div>
                            <div className="col-span-2">
                                <label className="text-xs text-slate-400 ko-normal block mb-1">실제 종료일 (KST)</label>
                                <input type="date" value={endDate} min={todayKey} disabled={!hasTimeline} onChange={e => setEndDate(e.target.value || savedEndDate)}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50" />
                                <p className="text-xs text-slate-600 ko-normal mt-1">
                                    시작일({league.real_start_date ?? '—'})과 플레이오프 경기 간격({league.playoff_game_interval_days === 2 ? '격일' : '매일'})은 생성 시에만 정할 수 있습니다. 일일 시뮬 시간대 길이는 기간과 하루 길이에서 계산됩니다.
                                </p>
                            </div>
                        </div>

                        {currentSummary && (
                            <div className="bg-slate-900/60 rounded-xl px-4 py-3 space-y-1.5">
                                <Row label="가상 일수" value={`${currentSummary.virtualDays}일 (정규 ${currentSummary.regularDays} · 플레이오프 ${currentSummary.playoffDays})`} />
                                <Row label="실제 일수 / 하루당 가상 일수" value={`${currentSummary.realDays}일 / ${currentSummary.perDay}일`} />
                                <Row label="일일 시뮬 시간대" value={`${minToHHMM(savedWindowStart)} ~ ${minToHHMM(Math.min(1440, savedWindowStart + currentSummary.windowMin))} (${fmtMinutes(currentSummary.windowMin)})`} />
                                <Row label="가상 하루 / 리플레이" value={`${savedDayLength}분 / ${savedReplay}분`} />
                                <Row label="시작 ~ 종료" value={`${fmtKstDateTime(currentSummary.firstAt)} ~ ${fmtKstDateTime(currentSummary.lastAt)}`} />
                                <Row label="현재 가상 날짜" value={todayVirtual ? fmtVirtualShort(todayVirtual) : '—'} />
                                <Row label="정규시즌 경기" value={`${totalGames}경기 (완료 ${playedGames})`} />
                            </div>
                        )}

                        <div className="flex items-center gap-2 flex-wrap">
                            <button onClick={handleSaveSettingsOnly} disabled={!hasTimeline || !settingsDirty || savingSettings}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-white transition-colors">
                                {savingSettings ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}설정만 저장
                            </button>
                            <button onClick={togglePreview} disabled={!hasTimeline || loading}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-40 ${previewOn ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}>
                                <Wand2 size={12} />{previewOn ? '미리보기 끄기' : '재배치 미리보기'}
                            </button>
                            <button onClick={handleApply} disabled={!hasTimeline || applying || loading}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-white transition-colors">
                                {applying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}설정 저장 + 남은 날짜 재배치
                            </button>
                        </div>
                        {settingsMsg && <p className={`text-xs ko-normal ${settingsMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{settingsMsg.text}</p>}
                        {applyMsg && <p className={`text-xs ko-normal ${applyMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{applyMsg.text}</p>}
                    </section>

                    <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-3">
                        <h2 className="text-sm font-bold text-white flex items-center gap-2">
                            <Clock size={14} className="text-amber-400" />
                            재배치 미리보기
                        </h2>
                        {!previewOn && (
                            <p className="text-xs text-slate-500 ko-normal leading-relaxed">
                                "재배치 미리보기"를 켜면 아직 시작하지 않은 가상 날짜를 위 설정으로 지금(+5분)부터 다시 깔았을 때의 결과가 여기와 아래 일정표(재배치 후 열)에 표시됩니다. 이미 시작된 가상 날짜와 실행된 경기는 건드리지 않습니다.
                            </p>
                        )}
                        {previewOn && !plan && <p className="text-xs text-slate-500 ko-normal">재배치할 남은 가상 날짜가 없습니다.</p>}
                        {previewOn && plan && (
                            <div className="space-y-1.5">
                                <Row label="유지 / 재배치" value={`가상 ${plan.stats.keptDays}일 유지 · ${plan.stats.relaidDays}일 재배치 (${fmtVirtualShort(plan.fromVirtualDate)}부터)`} />
                                <Row label="대상 경기" value={`${plan.stats.relaidGames}경기`} />
                                <Row label="실제 일수 예산" value={`오늘 ~ ${endDate} = ${plan.stats.realDaysBudget}일`} />
                                <Row label="하루당 가상 일수" value={`${plan.stats.perDay}일`} />
                                <Row label="일일 시뮬 시간대" value={`${minToHHMM(windowStartMin)} ~ ${minToHHMM(Math.min(1440, plan.stats.windowEndMin))} (${fmtMinutes(plan.stats.windowMin)})`} changed={!plan.stats.feasible} />
                                <Row label="같은 날짜 안 슬롯 간격(30가상분)" value={fmtMinutes(dayLength * 30 / 480)} />
                                <Row label="첫 슬롯" value={fmtKstDateTime(plan.stats.firstAt)} />
                                <Row label="마지막 종료" value={fmtKstDateTime(plan.stats.lastAt)} changed={plan.stats.overshootDays > 0} />
                                {!plan.stats.feasible && (
                                    <p className="flex items-start gap-1.5 text-xs text-red-400 ko-normal mt-1">
                                        <AlertTriangle size={12} className="mt-0.5 shrink-0" />{plan.stats.reasons.join(' ')} 종료일을 늦추거나 하루 길이를 줄이거나 시작 시각을 앞당기세요.
                                    </p>
                                )}
                                {plan.stats.feasible && plan.stats.overshootDays > 0 && (
                                    <p className="flex items-start gap-1.5 text-xs text-amber-400 ko-normal mt-1">
                                        <AlertTriangle size={12} className="mt-0.5 shrink-0" />오늘 이미 지난 슬롯을 건너뛰어 마지막 날이 종료일보다 {plan.stats.overshootDays}일 늦어집니다.
                                    </p>
                                )}
                                {plan.settings.allstar_schedule && (
                                    <p className="text-xs text-slate-500 ko-normal mt-1">올스타 이벤트 실제 시각도 함께 갱신 — 본경기 {fmtKstDateTime(plan.settings.allstar_schedule.mainGameAt)}</p>
                                )}
                            </div>
                        )}
                    </section>
                </div>
            )}

            {/* ── 강제 진행(시간 점프) ─────────────────────────────────────── */}
            {isMainLeague && hasTimeline && (
                <section className="bg-slate-800/60 border border-amber-500/20 rounded-2xl p-6 space-y-4">
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                        <FastForward size={14} className="text-amber-400" />
                        강제 진행 (시간 점프)
                        <span className="text-xs font-normal text-slate-500 ko-normal ml-1">대상 가상 날짜까지를 지금 끝난 것으로 만들고, 그 이후 일정은 지금부터 다시 배치</span>
                    </h2>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-slate-400 ko-normal block mb-1.5">대상</label>
                                <div className="flex flex-wrap items-center gap-2">
                                    <button type="button" onClick={() => setJumpTargetKind('today')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${jumpTargetKind === 'today' ? 'bg-amber-500/20 border border-amber-500/40 text-amber-200' : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'}`}>
                                        현재 가상 날짜{todayVirtualForJump ? `(${fmtVirtualShort(todayVirtualForJump)})` : ''}까지
                                    </button>
                                    <button type="button" onClick={() => setJumpTargetKind('date')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${jumpTargetKind === 'date' ? 'bg-amber-500/20 border border-amber-500/40 text-amber-200' : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'}`}>
                                        특정 날짜까지
                                    </button>
                                    {jumpTargetKind === 'date' && (
                                        <input type="date" value={jumpDate} min={todayVirtualForJump ?? undefined} max={lastVirtualDate ?? undefined}
                                            onChange={e => setJumpDate(e.target.value)}
                                            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500" />
                                    )}
                                </div>
                                <p className="text-xs text-slate-600 ko-normal mt-1">가상 캘린더 날짜 기준. 그 날짜의 경기까지 전부 계산·공개되고, 다음 날짜가 "현재"가 됩니다.</p>
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 ko-normal block mb-1.5">이후 일정</label>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setJumpMode('shift')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${jumpMode === 'shift' ? 'bg-indigo-600 text-white' : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'}`}>앞당기기</button>
                                    <button type="button" onClick={() => setJumpMode('keep_end')}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${jumpMode === 'keep_end' ? 'bg-indigo-600 text-white' : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'}`}>종료일 유지</button>
                                </div>
                                <p className="text-xs text-slate-600 ko-normal mt-1">앞당기기: 하루당 가상 일수를 유지해 리그가 그만큼 일찍 끝납니다. 종료일 유지: 남은 날짜를 원래 종료일까지 다시 펼칩니다(하루가 여유로워짐).</p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <button onClick={handleJump} disabled={!jumpPlanOk || jumping || processingSince != null}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-white transition-colors">
                                    {jumping ? <Loader2 size={12} className="animate-spin" /> : <FastForward size={12} />}강제 진행 실행
                                </button>
                                {processingSince != null && (
                                    <span className="flex items-center gap-1.5 text-xs text-amber-300 ko-normal"><Loader2 size={12} className="animate-spin" />스케줄러 처리 중 — 예정 시각이 지난 미실행 경기 {dueUnplayed}건</span>
                                )}
                            </div>
                            {jumpMsg && <p className={`text-xs ko-normal ${jumpMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{jumpMsg.text}</p>}
                        </div>
                        <div className="bg-slate-900/60 rounded-xl px-4 py-3 space-y-1.5">
                            {!jumpTargetDate && <p className="text-xs text-slate-500 ko-normal">대상 날짜를 고르면 영향 요약이 표시됩니다.</p>}
                            {jumpPlan && 'error' in jumpPlan && <p className="text-xs text-red-400 ko-normal">{jumpPlan.error}</p>}
                            {jumpPlanOk && (
                                <>
                                    <Row label="지나가는 가상 일수" value={`${jumpPlanOk.daysToPass}일 (${fmtVirtualShort(jumpPlanOk.targetDate)}까지)`} />
                                    <Row label="계산될 경기 / 예상 소요" value={`${jumpPlanOk.gamesToProcess}경기 / 약 ${Math.max(1, Math.round(jumpPlanOk.estimatedSeconds / 60))}분`} />
                                    <Row label="지금 라이브 중" value={`${jumpPlanOk.liveNow}경기 → 즉시 종료`} changed={jumpPlanOk.liveNow > 0} />
                                    <Row label="진행 후 현재 날짜" value={fmtVirtualShort(jumpPlanOk.newToday)} />
                                    <Row label="다음 경기일 첫 슬롯" value={fmtKstDateTime(jumpPlanOk.firstFutureAt)} />
                                    <Row label="이후 하루당 가상 일수" value={`${jumpPlanOk.perDay}일`} />
                                    <Row label="남은 일정 종료" value={`${fmtKstDateTime(jumpPlanOk.lastEndAt)}${jumpPlanOk.newEndDate ? ` (${jumpPlanOk.newEndDate})` : ''}`} changed={jumpMode === 'shift'} />
                                    {!jumpPlanOk.feasible && (
                                        <p className="flex items-start gap-1.5 text-xs text-red-400 ko-normal mt-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" />종료일 유지 불가: {jumpPlanOk.reasons.join(' ')}</p>
                                    )}
                                    {jumpPlanOk.crossesAllStarVoteEnd && (
                                        <p className="flex items-start gap-1.5 text-xs text-amber-400 ko-normal mt-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" />올스타 투표 마감일을 건너뜁니다 — 하루 1회 집계되는 투표 스냅샷이 생략되어 올스타 본경기가 실행되지 않을 수 있습니다.</p>
                                    )}
                                    {jumpPlanOk.crossesAllStar && !jumpPlanOk.crossesAllStarVoteEnd && (
                                        <p className="flex items-start gap-1.5 text-xs text-slate-400 ko-normal mt-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" />올스타 이벤트 4종이 스케줄러의 다음 tick부터 연달아 실행됩니다.</p>
                                    )}
                                    {jumpPlanOk.crossesRegularSeasonEnd && (
                                        <p className="flex items-start gap-1.5 text-xs text-slate-400 ko-normal mt-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" />정규시즌 종료 → 플레이오프 생성이 자동으로 이어집니다. 라운드마다 다음 라운드 생성이 필요해 30초 이상씩 더 걸립니다.</p>
                                    )}
                                    <p className="text-xs text-slate-600 ko-normal mt-1">월초 파워랭킹처럼 하루 1회 실행되는 작업은 건너뛴 날짜만큼 생략됩니다. 실행 전 타임라인 스냅샷이 리그 기록(time_jump_log)에 남습니다.</p>
                                </>
                            )}
                        </div>
                    </div>
                </section>
            )}

            {/* ── 전체 일정표 ─────────────────────────────────────────────── */}
            <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-700/40 flex items-center gap-3 flex-wrap">
                    <h2 className="text-sm font-bold text-white flex items-center gap-2 mr-auto">
                        <CalendarDays size={14} className="text-slate-400" />
                        전체 일정
                        <span className="text-xs font-normal text-slate-500 ml-1">실제 {realDays.length}일 · 시각은 KST</span>
                    </h2>
                    <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500">
                        <option value="all">모든 팀</option>
                        {[...leagueTeams].sort((a, b) => a.team_name.localeCompare(b.team_name)).map(t => (
                            <option key={t.team_slug} value={t.team_slug}>{t.team_name}</option>
                        ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-slate-400 ko-normal cursor-pointer">
                        <input type="checkbox" checked={unplayedOnly} onChange={e => setUnplayedOnly(e.target.checked)} className="w-3.5 h-3.5 rounded accent-indigo-500" />
                        미실행만
                    </label>
                    <button onClick={() => setOpenReal(new Set(realDays.map(d => d.key)))} className="text-xs text-slate-400 hover:text-white transition-colors">전체 펼치기</button>
                    <button onClick={() => { setOpenReal(new Set()); setOpenVirtual(new Set()); }} className="text-xs text-slate-400 hover:text-white transition-colors">전체 접기</button>
                    <button onClick={refresh} disabled={loading} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-40">
                        <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />새로고침
                    </button>
                </div>
                {editErr && <p className="px-5 py-2 text-xs text-red-400 ko-normal border-b border-slate-700/40">{editErr}</p>}

                {loading && !schedule.length ? (
                    <div className="flex items-center justify-center py-16 text-slate-500 text-sm"><Loader2 size={16} className="animate-spin mr-2" />일정 불러오는 중…</div>
                ) : realDays.length === 0 ? (
                    <div className="py-16 text-center text-slate-500 text-sm ko-normal">표시할 일정이 없습니다.</div>
                ) : (
                    <div className="divide-y divide-slate-700/40">
                        {realDays.map(day => {
                            const open = effectiveOpenReal.has(day.key);
                            const isToday = day.key === todayKey;
                            return (
                                <div key={day.key}>
                                    <button onClick={() => toggleReal(day.key)}
                                        className={`w-full flex items-center gap-3 px-5 py-2.5 text-left hover:bg-slate-800/80 transition-colors ${isToday ? 'bg-indigo-500/10' : ''}`}>
                                        {open ? <ChevronDown size={14} className="text-slate-500 shrink-0" /> : <ChevronRight size={14} className="text-slate-500 shrink-0" />}
                                        <span className="text-sm font-bold text-white font-mono">{fmtDateLabel(day.key)}</span>
                                        {isToday && <span className="text-[10px] font-bold text-indigo-300 bg-indigo-500/20 px-1.5 py-0.5 rounded">오늘</span>}
                                        <span className="text-xs text-slate-400 font-mono">{fmtKstTime(day.firstAt)} ~ {fmtKstTime(day.lastAt)}</span>
                                        <span className="text-xs text-slate-500 ko-normal">가상 {day.days.length}일 · {day.gameCount}경기</span>
                                        <span className="text-xs text-slate-500 font-mono ml-auto">{fmtVirtualShort(day.vFrom)}{day.vTo !== day.vFrom ? ` ~ ${fmtVirtualShort(day.vTo)}` : ''}</span>
                                    </button>
                                    {open && (
                                        <div className="border-t border-slate-700/40">
                                            <div className="grid grid-cols-[110px_90px_1fr_1fr_1fr_80px_100px] gap-2 px-5 py-1.5 text-[11px] text-slate-500">
                                                <span>가상 날짜</span><span>종류</span><span>실제 시작</span><span>가상 자정(전환)</span><span>실제 종료</span><span>경기</span>
                                                <span className={plan ? 'text-amber-400/80' : ''}>{plan ? '재배치 후' : ''}</span>
                                            </div>
                                            {day.days.map(vd => {
                                                const vOpen = openVirtual.has(vd.row.date);
                                                const isCurrentVirtual = vd.row.date === todayVirtual;
                                                const kindLabel = vd.row.kind === 'regular' && vd.games.length === 0 && !unplayedOnly && teamFilter === 'all' ? '휴식' : KIND_LABEL[vd.row.kind];
                                                return (
                                                    <div key={vd.row.date}>
                                                        <button onClick={() => toggleVirtual(vd.row.date)}
                                                            className={`w-full grid grid-cols-[110px_90px_1fr_1fr_1fr_80px_100px] gap-2 px-5 py-1.5 text-xs text-left hover:bg-slate-800/60 border-t border-slate-800/60 ${isCurrentVirtual ? 'bg-amber-500/5' : ''}`}>
                                                            <span className="font-mono text-slate-200 flex items-center gap-1">
                                                                {vd.games.length > 0 ? (vOpen ? <ChevronDown size={11} className="text-slate-500" /> : <ChevronRight size={11} className="text-slate-500" />) : <span className="w-[11px]" />}
                                                                {fmtVirtualShort(vd.row.date)}
                                                                {isCurrentVirtual && <span className="text-[9px] font-bold text-amber-300 bg-amber-500/20 px-1 rounded">현재</span>}
                                                            </span>
                                                            <span className={`ko-normal ${vd.row.kind.startsWith('allstar') ? 'text-amber-400' : vd.row.kind === 'playoff' ? 'text-indigo-300' : 'text-slate-400'}`}>{kindLabel}</span>
                                                            <span className="font-mono text-slate-300">{fmtKstTime(vd.row.realStartAt)}</span>
                                                            <span className="font-mono text-slate-500">{hasTimeline ? fmtKstTime(vd.row.realMidnightAt) : '—'}</span>
                                                            <span className="font-mono text-slate-500">{hasTimeline ? fmtKstTime(vd.row.realEndAt) : '—'}</span>
                                                            <span className="text-slate-400">{vd.games.length ? `${vd.games.length}경기` : '—'}</span>
                                                            <span className={`font-mono ${vd.previewStart && vd.previewStart !== vd.row.realStartAt ? 'text-amber-300' : 'text-slate-600'}`}>{vd.previewStart ? fmtKstDateTime(vd.previewStart) : ''}</span>
                                                        </button>
                                                        {vOpen && vd.games.length > 0 && (
                                                            <table className="w-full text-xs bg-slate-900/40">
                                                                <tbody>
                                                                    {vd.games.map(g => (
                                                                        <GameRow key={g.id} game={g} showPreview={!!plan} nextAt={plan?.nextAtById.get(g.id)} serverNow={serverNow} teamName={teamName} onEdit={handleEditOne} onStartNow={handleStartNow} />
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
};

// ── 부품 ──────────────────────────────────────────────────────────────────────

const Row: React.FC<{ label: string; value: string; changed?: boolean }> = ({ label, value, changed }) => (
    <div className="flex justify-between gap-3 text-xs">
        <span className="text-slate-500 ko-normal shrink-0">{label}</span>
        <span className={`font-mono text-right ${changed ? 'text-amber-300' : 'text-slate-300'}`}>{value}</span>
    </div>
);

interface GameRowProps {
    game: Game;
    showPreview: boolean;
    nextAt?: string;
    serverNow: number;
    teamName: (slug: string) => string;
    onEdit: (gameId: string, local: string) => Promise<boolean>;
    /** [3단계] 한 경기 즉시 시작(기존 /sim-override) — 예정 시각 무시, 지금 계산 + 지금부터 리플레이. */
    onStartNow?: (game: Game) => void;
}

const GameRow: React.FC<GameRowProps> = ({ game, showPreview, nextAt, serverNow, teamName, onEdit, onStartNow }) => {
    const state = getGameDisplayState(game, serverNow);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft]     = useState('');
    const [saving, setSaving]   = useState(false);
    const changed = nextAt !== undefined && nextAt !== game.scheduledAt;

    const startEdit = () => { setDraft(toInputValue(game.scheduledAt)); setEditing(true); };
    const save = async () => { setSaving(true); const ok = await onEdit(game.id, draft); setSaving(false); if (ok) setEditing(false); };

    const statusEl = state === 'final'
        ? <span className="text-slate-400 font-mono">종료 {game.homeScore != null ? `${game.awayScore}-${game.homeScore}` : ''}</span>
        : state === 'live' ? <span className="text-red-400 font-bold">LIVE</span>
        : game.played ? <span className="text-amber-400">시뮬 완료·공개 대기</span>
        : <span className="text-slate-500">예정</span>;

    return (
        <tr className={`border-t border-slate-800/60 ${game.played ? 'opacity-70' : ''}`}>
            <td className="pl-10 pr-2 py-1.5 font-mono text-slate-300 w-40">
                {editing ? (
                    <div className="flex items-center gap-1">
                        <input type="datetime-local" step="60" value={draft} onChange={e => setDraft(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-white focus:outline-none focus:border-indigo-500" />
                        <button onClick={save} disabled={saving || !draft} className="w-5 h-5 flex items-center justify-center rounded bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/40 disabled:opacity-30">
                            {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                        </button>
                        <button onClick={() => setEditing(false)} disabled={saving} className="w-5 h-5 flex items-center justify-center rounded bg-slate-800 text-slate-400 hover:bg-slate-700"><X size={10} /></button>
                    </div>
                ) : (
                    <span>{game.scheduledAt ? fmtKstTime(game.scheduledAt) : <span className="text-slate-600">미정</span>}<span className="text-slate-600 ml-2">{game.time ?? ''}</span></span>
                )}
            </td>
            {showPreview && <td className={`px-2 py-1.5 font-mono w-36 ${changed ? 'text-amber-300' : 'text-slate-600'}`}>{nextAt ? fmtKstDateTime(nextAt) : '—'}</td>}
            <td className="px-2 py-1.5 text-slate-200 ko-normal">
                {teamName(game.awayTeamId)} <span className="text-slate-600">@</span> {teamName(game.homeTeamId)}
                {game.isPlayoff && <span className="ml-1 text-[10px] text-indigo-400">PO</span>}{game.isAllstar && <span className="ml-1 text-[10px] text-amber-400">AS</span>}
            </td>
            <td className="px-2 py-1.5 w-32">{statusEl}</td>
            <td className="px-5 py-1.5 text-right w-16 whitespace-nowrap">
                {!game.played && !editing && (
                    <>
                        <button onClick={startEdit} className="w-5 h-5 inline-flex items-center justify-center text-slate-600 hover:text-indigo-400 transition-colors" title="시뮬 시각 수정"><Pencil size={10} /></button>
                        {onStartNow && (
                            <button onClick={() => onStartNow(game)} className="w-5 h-5 inline-flex items-center justify-center text-slate-600 hover:text-amber-400 transition-colors ml-1" title="지금 바로 시작"><Play size={10} /></button>
                        )}
                    </>
                )}
            </td>
        </tr>
    );
};

export default ScheduleSettingsTab;
