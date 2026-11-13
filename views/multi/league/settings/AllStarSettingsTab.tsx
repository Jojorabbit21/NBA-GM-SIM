/**
 * AllStarSettingsTab — 세션 설정 "올스타" 탭 (메인리그, 어드민 전용).
 *
 * [2026-11-13] 올스타·라이징스타·3점 컨테스트·덩크 컨테스트 on/off + 키데이트(팬 투표 시작·마감, 브레이크 안 행사일).
 *  - 브레이크(정규시즌 경기 없는 날) 위치는 일정 생성 규칙대로 고정 — 행사 3개는 그 안의 서로 다른 날에서만 고른다.
 *  - 일정 생성 전(모집·드래프트)에 올스타를 끄면 브레이크 없이 일정이 만들어지고, 그 시즌은 다시 켤 수 없다.
 *  - 그 시즌 팬 투표가 시작되면 전부 잠긴다(DB 트리거 trg_leagues_allstar_lock).
 * 저장은 update_league_allstar_settings RPC 한 번(타임라인이 있으면 브레이크 날짜 라벨·실제 발동 시각도 함께 갱신).
 * 판정 규칙은 utils/allStarSettings.ts.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Star, Save } from 'lucide-react';
import { InlineNotice } from '../../../../components/common/InlineNotice';
import { Button } from '../../../../components/common/Button';
import type { LeagueRow } from '../../../../services/multi/roomQueries';
import { updateLeagueAllStarSettings } from '../../../../services/multi/leagueService';
import { useLeagueContext } from '../LeagueLayout';
import { useSeasonContext } from '../../season/seasonContext';
import { useCurrentVirtualDate } from '../../../../hooks/useCurrentVirtualDate';
import { getAllStarKeyDates } from '../../../../utils/allStarSelection';
import type { AllStarOffsets } from '../../../../utils/seasonCalendar';
import {
    isAllStarSettingsLocked, currentAllStarOffsets, allStarBreakBounds, offsetToDate, dateToOffset, validateAllStarOffsets,
} from '../../../../utils/allStarSettings';

interface Props {
    league: LeagueRow;
    onLeagueSaved: () => void;
}

const mmdd = (date: string) => date.slice(5).replace('-', '.');

const Toggle: React.FC<{ label: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }> = ({ label, checked, disabled, onChange }) => (
    <label className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${disabled ? 'opacity-50' : 'cursor-pointer'} ${
        checked ? 'bg-indigo-600/20 border border-indigo-600/50' : 'bg-slate-900/60 border border-transparent hover:border-slate-600'
    }`}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)}
            className="w-4 h-4 rounded accent-indigo-500 cursor-pointer disabled:cursor-not-allowed" />
        <span className={`text-xs font-bold ${checked ? 'text-white' : 'text-slate-400'}`}>{label}</span>
    </label>
);

const DateRow: React.FC<{ label: string; value: string; min?: string; max?: string; disabled: boolean; onChange: (v: string) => void }> = ({ label, value, min, max, disabled, onChange }) => (
    <div className="flex items-center justify-between gap-3 px-1">
        <span className="text-xs font-bold text-slate-300">{label}</span>
        <input type="date" value={value} min={min} max={max} disabled={disabled}
            onChange={e => e.target.value && onChange(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50" />
    </div>
);

const ValueRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="flex items-center justify-between gap-3 px-1 py-1">
        <span className="text-xs font-bold text-slate-300">{label}</span>
        <span className="text-sm text-slate-400 tabular-nums">{value}</span>
    </div>
);

export const AllStarSettingsTab: React.FC<Props> = ({ league, onLeagueSaved }) => {
    const { timeline } = useLeagueContext();
    const { schedule } = useSeasonContext();
    const currentVirtualDate = useCurrentVirtualDate(schedule, league.type, league.sim_real_start_at, league.games_per_real_day, timeline);

    const isMainLeague = league.type === 'main_league';
    const scheduleBuilt = league.status === 'in_progress' || league.status === 'finished';
    const locked = isAllStarSettingsLocked(league, currentVirtualDate);
    const year = league.virtual_season_year ?? new Date().getFullYear();
    // 올스타를 끈 채 일정을 만든 시즌 — 브레이크가 없어 다시 켤 수 없다.
    const noBreakSeason = !getAllStarKeyDates(year, league.season_calendar).hasBreak;
    const bounds = useMemo(() => allStarBreakBounds(league), [league]);

    const saved = useMemo(() => ({
        allStar: league.allstar_enabled !== false,
        rising: league.rising_stars_enabled !== false,
        three: league.three_point_contest_enabled !== false,
        dunk: league.dunk_contest_enabled !== false,
        offsets: currentAllStarOffsets(league),
    }), [league]);

    const [allStar, setAllStar] = useState(saved.allStar);
    const [rising, setRising] = useState(saved.rising);
    const [three, setThree] = useState(saved.three);
    const [dunk, setDunk] = useState(saved.dunk);
    const [offsets, setOffsets] = useState<AllStarOffsets>(saved.offsets);
    useEffect(() => {
        setAllStar(saved.allStar); setRising(saved.rising); setThree(saved.three); setDunk(saved.dunk); setOffsets(saved.offsets);
    }, [saved]);

    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const offsetsDirty = (Object.keys(offsets) as (keyof AllStarOffsets)[]).some(k => offsets[k] !== saved.offsets[k]);
    const dirty = offsetsDirty || allStar !== saved.allStar || rising !== saved.rising || three !== saved.three || dunk !== saved.dunk;
    const errors = useMemo(
        () => [
            ...(noBreakSeason && allStar ? ['올스타 브레이크 없이 일정이 만들어진 시즌이라 켤 수 없습니다.'] : []),
            ...(offsetsDirty ? validateAllStarOffsets(offsets, bounds, scheduleBuilt ? currentVirtualDate : null) : []),
        ],
        [noBreakSeason, allStar, offsetsDirty, offsets, bounds, scheduleBuilt, currentVirtualDate],
    );

    const setDate = (key: keyof AllStarOffsets) => (date: string) => setOffsets(o => ({ ...o, [key]: dateToOffset(bounds.breakStart, date) }));
    const dateOf = (key: keyof AllStarOffsets) => offsetToDate(bounds.breakStart, offsets[key]);
    const voteStart = dateOf('voteStart');
    const voteEnd = dateOf('voteEnd');
    const voteWindow = offsets.voteEnd - offsets.voteStart;
    // getAllStarKeyDates().allStarVoteInterimDates와 같은 식(투표 기간 1/4·2/4·3/4 지점)
    const interimDates = [1, 2, 3].map(q => offsetToDate(voteStart, Math.round(voteWindow * q / 4)));
    const eventMin = offsetToDate(bounds.breakStart, 1);
    const eventMax = offsetToDate(bounds.breakEnd, -1);
    // 일정 생성 전에 끄면 브레이크가 사라진다 — 브레이크 값에 그대로 보여 준다.
    const breakRemoved = noBreakSeason || (!scheduleBuilt && !allStar);

    const handleSave = async () => {
        setSaving(true); setMsg(null);
        const { error } = await updateLeagueAllStarSettings(league.id, {
            allStarEnabled: allStar, risingStarsEnabled: rising, threePointContestEnabled: three, dunkContestEnabled: dunk, offsets,
        });
        setSaving(false);
        if (error) { setMsg({ ok: false, text: error }); return; }
        setMsg({ ok: true, text: '저장했습니다.' });
        onLeagueSaved();
    };

    if (!isMainLeague) {
        return <InlineNotice tone="info">올스타는 메인리그에서만 설정합니다.</InlineNotice>;
    }

    const disabled = locked || saving;
    const eventsDisabled = disabled || !allStar || breakRemoved;

    return (
        <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-5">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Star size={14} className="text-indigo-400" />
                올스타
            </h2>
            {locked && <InlineNotice tone="warning">올스타 투표가 시작되어 올스타 설정을 바꿀 수 없습니다.</InlineNotice>}
            {!locked && noBreakSeason && <InlineNotice tone="warning">올스타 브레이크 없이 일정이 만들어진 시즌이라 올스타를 켤 수 없습니다.</InlineNotice>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Toggle label="올스타" checked={allStar} disabled={disabled || (noBreakSeason && !allStar)} onChange={setAllStar} />
                <Toggle label="라이징스타 챌린지" checked={allStar && rising} disabled={disabled || !allStar} onChange={setRising} />
                <Toggle label="3점 컨테스트" checked={allStar && three} disabled={disabled || !allStar} onChange={setThree} />
                <Toggle label="덩크 컨테스트" checked={allStar && dunk} disabled={disabled || !allStar} onChange={setDunk} />
            </div>

            <div className="bg-slate-900/60 rounded-xl p-4 space-y-2">
                <DateRow label="팬 투표 시작" value={voteStart} min={bounds.regularStart} max={offsetToDate(bounds.breakStart, -2)}
                    disabled={eventsDisabled} onChange={setDate('voteStart')} />
                <ValueRow label="중간 집계 발표" value={interimDates.map(mmdd).join(' · ')} />
                <DateRow label="팬 투표 마감 · 명단 발표" value={voteEnd} min={bounds.regularStart} max={offsetToDate(bounds.breakStart, -1)}
                    disabled={eventsDisabled} onChange={setDate('voteEnd')} />
                <ValueRow label="올스타 브레이크" value={breakRemoved ? '없음' : `${mmdd(bounds.breakStart)} ~ ${mmdd(bounds.breakEnd)}`} />
                <DateRow label="라이징스타 챌린지" value={dateOf('rising')} min={eventMin} max={eventMax}
                    disabled={eventsDisabled || !rising} onChange={setDate('rising')} />
                <DateRow label="3점 · 덩크 컨테스트" value={dateOf('contests')} min={eventMin} max={eventMax}
                    disabled={eventsDisabled || (!three && !dunk)} onChange={setDate('contests')} />
                <DateRow label="올스타 본경기" value={dateOf('main')} min={eventMin} max={eventMax}
                    disabled={eventsDisabled} onChange={setDate('main')} />
            </div>

            {dirty && errors.length > 0 && <InlineNotice tone="warning" size="sm">{errors[0]}</InlineNotice>}

            <div className="flex items-center gap-3">
                <Button variant="primary" size="sm" onClick={handleSave} disabled={locked || !dirty || errors.length > 0}
                    isLoading={saving} icon={<Save size={12} />}>
                    저장
                </Button>
                {msg && <InlineNotice tone={msg.ok ? 'success' : 'danger'} size="sm">{msg.text}</InlineNotice>}
            </div>
        </section>
    );
};
