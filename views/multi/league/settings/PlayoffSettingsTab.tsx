/**
 * PlayoffSettingsTab — 세션 설정 "플레이오프" 탭 (메인리그, 어드민 전용).
 *
 * [2026-10-24] 플레이오프 형식(컨퍼런스별 진출 팀 수, 플레이인, 일반 라운드·파이널 시리즈 길이, 경기 간격)을
 * 대진표가 만들어지기 전까지 바꿀 수 있다. 예전엔 "리그" 탭에 진출 팀 수·플레이인만 있었고 시리즈 길이는
 * 메인리그에서 고를 수 없었다.
 *
 * 리그 타임라인(league_virtual_days)은 생성 시점 형식의 최악 일수만 확보하므로, 형식이 바뀌면
 * utils/leagueTimeline.ts planPlayoffTimelineChange()로 모자란 날짜를 기존 격자 뒤에 이어 붙이거나(시간대가 차면
 * 다음 날 창으로, 실제 종료일도 함께 연장) 남는 뒷날짜를 줄인다. 저장은 apply_league_playoff_format RPC 한 번.
 * 타임라인이 아직 없는 리그(드래프트 전)는 설정만 저장하고, 시즌 전체 기간이 시간대에 들어가는지만 검증한다.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, Save } from 'lucide-react';
import { InlineNotice } from '../../../../components/common/InlineNotice';
import { Button } from '../../../../components/common/Button';
import type { LeagueRow } from '../../../../services/multi/roomQueries';
import { applyLeaguePlayoffFormat } from '../../../../services/multi/leagueService';
import { useLeagueContext } from '../LeagueLayout';
import { getAllStarKeyDates } from '../../../../utils/allStarSelection';
import { resolveSeasonCalendar } from '../../../../utils/seasonCalendar';
import {
    buildVirtualCalendar, computeTimelineFeasibility, planPlayoffTimelineChange, playoffTargetWins,
    DEFAULT_DAY_LENGTH_MIN, DEFAULT_WINDOW_START_MIN, DEFAULT_REPLAY_MIN,
    type PlayoffCalendarSpec,
} from '../../../../utils/leagueTimeline';

type MatchFormat = 'best_of_1' | 'best_of_3' | 'best_of_5' | 'best_of_7';
const FORMAT_OPTIONS: { value: MatchFormat; label: string }[] = [
    { value: 'best_of_1', label: '단판' },
    { value: 'best_of_3', label: '3전 2선승' },
    { value: 'best_of_5', label: '5전 3선승' },
    { value: 'best_of_7', label: '7전 4선승' },
];
const DEFAULT_FORMAT: MatchFormat = 'best_of_7';
const asFormat = (v: string | null | undefined): MatchFormat =>
    (FORMAT_OPTIONS.some(o => o.value === v) ? v : DEFAULT_FORMAT) as MatchFormat;

const kstFmt = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const fmtKst = (iso: string) => kstFmt.format(new Date(iso));

function Choice({ active, onClick, disabled, children }: { active: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${active ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'}`}>
            {children}
        </button>
    );
}

interface Props {
    league: LeagueRow;
    onLeagueSaved: () => void;
}

export const PlayoffSettingsTab: React.FC<Props> = ({ league, onLeagueSaved }) => {
    const { timeline } = useLeagueContext();
    const isMainLeague = league.type === 'main_league';
    const locked = !!league.bracket_data;
    const hasTimeline = timeline.length > 0;

    const saved = useMemo(() => ({
        teams: league.playoff_team_count ?? 8,
        playIn: league.play_in_enabled ?? true,
        format: asFormat(league.match_format),
        finals: asFormat(league.finals_match_format ?? league.match_format),
        interval: (league.playoff_game_interval_days ?? 1) === 2 ? 2 : 1,
    }), [league.playoff_team_count, league.play_in_enabled, league.match_format, league.finals_match_format, league.playoff_game_interval_days]);

    const [teams, setTeams] = useState(saved.teams);
    const [playIn, setPlayIn] = useState(saved.playIn);
    const [format, setFormat] = useState<MatchFormat>(saved.format);
    const [finals, setFinals] = useState<MatchFormat>(saved.finals);
    const [interval, setIntervalDays] = useState<1 | 2>(saved.interval as 1 | 2);
    useEffect(() => {
        setTeams(saved.teams); setPlayIn(saved.playIn); setFormat(saved.format); setFinals(saved.finals); setIntervalDays(saved.interval as 1 | 2);
    }, [saved]);

    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const dirty = teams !== saved.teams || playIn !== saved.playIn || format !== saved.format || finals !== saved.finals || interval !== saved.interval;

    // [2026-10-26] 포스트시즌 휴식일은 리그 저장 달력 값(이전 리그 0) — 이미 깔린 타임라인과 같은 규칙으로 일수를 센다.
    const restDays = resolveSeasonCalendar(league.virtual_season_year ?? new Date().getFullYear(), league.season_calendar).postseasonRestDays;
    const spec: PlayoffCalendarSpec = {
        intervalDays: interval, playInEnabled: playIn, teamsPerConference: teams,
        targetWins: playoffTargetWins(format), finalsTargetWins: playoffTargetWins(finals),
        restDays,
    };
    const dayLengthMin = league.day_length_min ?? DEFAULT_DAY_LENGTH_MIN;
    const windowStartMin = league.daily_window_start_min ?? DEFAULT_WINDOW_START_MIN;

    // 타임라인 있음 → 덧붙이기/줄이기 계획, 없음 → 시즌 전체가 시간대에 들어가는지 검증
    const plan = useMemo(
        () => (hasTimeline ? planPlayoffTimelineChange(timeline, spec, { dayLengthMin, windowStartMin }) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [hasTimeline, timeline, interval, playIn, teams, format, finals, dayLengthMin, windowStartMin],
    );
    const preFeasibility = useMemo(() => {
        if (hasTimeline || !league.real_start_date || !league.real_end_date) return null;
        const year = league.virtual_season_year ?? new Date().getFullYear();
        const cal = resolveSeasonCalendar(year, league.season_calendar);
        const days = buildVirtualCalendar({
            virtualSeasonYear: year, regularStart: cal.regularStart, regularEnd: cal.regularEnd,
            keyDates: getAllStarKeyDates(year, league.season_calendar), playoff: spec,
        }).length;
        return computeTimelineFeasibility({
            realStartDate: league.real_start_date, realEndDate: league.real_end_date, dayLengthMin, windowStartMin,
            virtualDayCount: days, replayMin: league.replay_minutes ?? DEFAULT_REPLAY_MIN,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasTimeline, league, interval, playIn, teams, format, finals, dayLengthMin, windowStartMin]);
    const blocked = !!preFeasibility && !preFeasibility.feasible;

    const handleSave = async () => {
        setSaving(true); setMsg(null);
        const { appended, trimmed, error } = await applyLeaguePlayoffFormat(
            league.id,
            {
                match_format: format,
                finals_match_format: finals !== format ? finals : null,
                playoff_team_count: teams,
                play_in_enabled: playIn,
                playoff_game_interval_days: interval,
            },
            (plan?.appendRows ?? []).map(r => ({
                virtual_date: r.date, day_index: r.dayIndex,
                real_start_at: r.realStartAt, real_midnight_at: r.realMidnightAt, real_end_at: r.realEndAt,
            })),
            plan?.trimFromDate ?? null,
            plan?.newRealEndDate ?? null,
        );
        setSaving(false);
        if (error) { setMsg({ ok: false, text: error }); return; }
        setMsg({
            ok: true,
            text: appended ? `저장했습니다. 플레이오프 날짜 ${appended}일을 덧붙였습니다.`
                : trimmed ? `저장했습니다. 남는 플레이오프 날짜 ${trimmed}일을 줄였습니다.`
                : '저장했습니다.',
        });
        onLeagueSaved();
    };

    if (!isMainLeague) {
        return <InlineNotice tone="info">플레이오프 형식은 메인리그에서만 설정합니다. 토너먼트 경기 포맷은 "드래프트" 탭에 있습니다.</InlineNotice>;
    }

    const appendFirst = plan?.appendRows[0];
    const appendLast = plan?.appendRows[plan.appendRows.length - 1];

    return (
        <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Trophy size={14} className="text-indigo-400" />
                플레이오프 형식
            </h2>
            {locked
                ? <InlineNotice tone="warning">플레이오프 대진표가 이미 만들어져 형식을 바꿀 수 없습니다.</InlineNotice>
                : <p className="text-xs text-slate-500 ko-normal">정규시즌이 끝나고 대진표가 만들어지기 전까지 바꿀 수 있습니다. 필요한 날짜가 늘어나면 일정 뒤에 자동으로 덧붙입니다.</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">일반 라운드 시리즈</label>
                    <div className="flex flex-wrap gap-2">
                        {FORMAT_OPTIONS.map(o => <Choice key={o.value} active={format === o.value} disabled={locked} onClick={() => setFormat(o.value)}>{o.label}</Choice>)}
                    </div>
                </div>
                <div>
                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">파이널 시리즈</label>
                    <div className="flex flex-wrap gap-2">
                        {FORMAT_OPTIONS.map(o => <Choice key={o.value} active={finals === o.value} disabled={locked} onClick={() => setFinals(o.value)}>{o.label}</Choice>)}
                    </div>
                </div>
                <div>
                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">경기 간격 (가상 일)</label>
                    <div className="flex gap-2">
                        <Choice active={interval === 1} disabled={locked} onClick={() => setIntervalDays(1)}>매일</Choice>
                        <Choice active={interval === 2} disabled={locked} onClick={() => setIntervalDays(2)}>격일</Choice>
                    </div>
                    <p className="text-[11px] text-slate-600 ko-normal mt-1">시리즈 안 경기와 라운드 사이 간격입니다.</p>
                </div>
                <div>
                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">컨퍼런스별 진출 팀 수</label>
                    <input type="number" min={2} max={16} step={1} value={teams} disabled={locked}
                        onChange={e => setTeams(Math.min(16, Math.max(2, Math.round(Number(e.target.value) || 0))))}
                        className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-indigo-500 disabled:opacity-50" />
                    <p className="text-[11px] text-slate-600 ko-normal mt-1">동부·서부 각각의 진출 팀 수(리그 전체가 아님).</p>
                </div>
            </div>

            <label className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${locked ? 'opacity-50' : 'cursor-pointer'} ${playIn ? 'bg-indigo-600/20 border border-indigo-600/50' : 'bg-slate-900/60 border border-transparent hover:border-slate-600'}`}>
                <input type="checkbox" checked={playIn} disabled={locked} onChange={e => setPlayIn(e.target.checked)} className="w-4 h-4 rounded accent-indigo-500 cursor-pointer" />
                <div className="flex-1 min-w-0">
                    <span className={`text-xs font-bold ${playIn ? 'text-white' : 'text-slate-400'}`}>플레이인 토너먼트</span>
                    <span className="ml-2 text-xs text-slate-500 ko-normal">
                        켜면 상위 {Math.max(0, teams - 2)}팀은 자동 진출, 나머지 4팀이 미니 토너먼트로 마지막 2자리를 다툽니다. 끄면 상위 {teams}팀이 곧바로 진출합니다.
                    </span>
                </div>
            </label>

            {/* ── 일정 영향 ── */}
            <div className="bg-slate-900/60 rounded-xl p-4 space-y-1.5 text-xs text-slate-300 ko-normal">
                {plan ? (
                    <>
                        <div>플레이오프 최대 일수(모든 시리즈가 끝까지 갈 때): <b className="text-white">{plan.required}일</b> · 지금 확보: {plan.current}일</div>
                        {plan.appendRows.length > 0 && appendFirst && appendLast && (
                            <div className="text-amber-300">
                                {plan.appendRows.length}일을 덧붙입니다 — 가상 {appendFirst.date} ~ {appendLast.date}, 실제 {fmtKst(appendFirst.realStartAt)} ~ {fmtKst(appendLast.realEndAt)}.
                                {plan.newRealEndDate && plan.newRealEndDate !== league.real_end_date && <> 리그 종료일이 {plan.newRealEndDate}로 늘어납니다.</>}
                            </div>
                        )}
                        {plan.trimFromDate && (
                            <div className="text-slate-400">
                                남는 {plan.current - plan.required}일(가상 {plan.trimFromDate}부터)을 줄입니다.{plan.newRealEndDate && <> 리그 종료일 {plan.newRealEndDate}.</>}
                            </div>
                        )}
                        {!plan.appendRows.length && !plan.trimFromDate && <div className="text-slate-500">일정 변경 없음</div>}
                    </>
                ) : preFeasibility ? (
                    preFeasibility.feasible
                        ? <div>드래프트가 끝나면 이 형식으로 일정이 만들어집니다. 시간대 안에 들어갑니다(실제 하루에 가상 {preFeasibility.perDay}일).</div>
                        : <div className="text-red-300">이 형식은 지금 기간·시간대에 들어가지 않습니다: {preFeasibility.reasons.join(' / ')} — "일정" 탭에서 종료일이나 하루 길이를 먼저 바꾸세요.</div>
                ) : (
                    <div className="text-slate-500">드래프트가 끝나면 이 형식으로 일정이 만들어집니다.</div>
                )}
            </div>

            <div className="flex items-center gap-3">
                <Button variant="primary" size="sm" onClick={handleSave} disabled={locked || !dirty || blocked}
                    isLoading={saving} icon={<Save size={12} />}>
                    저장
                </Button>
                {msg && <InlineNotice tone={msg.ok ? 'success' : 'danger'} size="sm">{msg.text}</InlineNotice>}
            </div>
        </section>
    );
};
