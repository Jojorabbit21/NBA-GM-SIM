// PersonalDraftSettingsTab.tsx — 세션 설정 "드래프트" 탭의 개인 팩 드래프트 버전 (Phase 6).
// leagues.personal_draft_format이 있는 토너먼트에서 LeagueSettingsView가 기존 공유풀 드래프트
// 섹션 대신 이 탭을 렌더한다. 자체 저장 버튼을 가지며(ScheduleSettingsTab과 같은 패턴), 저장 시
// buildPersonalDraftFormat()으로 라운드별 후보 목록을 다시 확정해 통째로 덮어쓴다.
//
// 잠금 규칙: 한 팀이라도 개인 드래프트를 시작했으면(personal_draft_progress 행 존재) 포맷/풀 범위는
// 더 이상 바꿀 수 없다 — RPC가 매 호출마다 저장된 포맷을 읽으므로 중간에 바꾸면 진행 중인 팀의
// 라운드 구성이 어긋난다. 토너먼트 시작 일시/경기 간격/경기 포맷은 계속 편집 가능.
import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Lock, Save, Trophy } from 'lucide-react';
import type { LeagueRow, RoomRow } from '../../../../services/multi/roomQueries';
import { updateLeagueSettings } from '../../../../services/multi/leagueService';
import { supabase } from '../../../../services/supabaseClient';
import { DraftPoolSettings } from '../../../../components/multi/DraftPoolSettings';
import { PersonalDraftFormatEditor } from '../../../../components/multi/PersonalDraftFormatEditor';
import {
    buildPersonalDraftFormat, computeRosterSize,
    type PersonalDraftRoundInput,
} from '../../../../services/multi/personalDraftFormat';
import { KST_OFFSET_MS } from '../../../../utils/kstTime';

interface Props {
    league: LeagueRow;
    room: RoomRow | null;
    isInProgress: boolean;
    onSaved: () => void;
}

const MATCH_FORMATS = ['best_of_1', 'best_of_3', 'best_of_5', 'best_of_7'] as const;
const MATCH_LABEL: Record<(typeof MATCH_FORMATS)[number], string> = { best_of_1: '단판', best_of_3: 'Bo3', best_of_5: 'Bo5', best_of_7: 'Bo7' };

function toInputValue(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 16);
}
function toIso(local: string): string | null {
    if (!local) return null;
    return new Date(new Date(`${local}:00Z`).getTime() - KST_OFFSET_MS).toISOString();
}
/** 저장된 포맷에서 편집용 입력(eligiblePlayerIds 제외)만 뽑는다. */
function toRoundInputs(league: LeagueRow): PersonalDraftRoundInput[] {
    return (league.personal_draft_format?.rounds ?? []).map(r => ({
        round: r.round, poolSize: r.poolSize, picks: r.picks,
        ovrMin: r.ovrMin, ovrMax: r.ovrMax,
        draftYearMin: r.draftYearMin ?? null, draftYearMax: r.draftYearMax ?? null,
    }));
}

export const PersonalDraftSettingsTab: React.FC<Props> = ({ league, room, isInProgress, onSaved }) => {
    const [tournamentStartAt, setTournamentStartAt] = useState(() => toInputValue((league as any).tournament_start_at));
    // [2026-09-18] 참가/드래프트 마감 — 지나면 신규 참가 차단 + 미완료 참가자 자동 강퇴
    // (server/src/personalDraftDeadline.ts). null이면 마감 없음.
    const [deadlineEnabled, setDeadlineEnabled] = useState(() => league.draft_deadline_at != null);
    const [deadlineAt, setDeadlineAt] = useState(() => toInputValue(league.draft_deadline_at));
    const [intervalMin, setIntervalMin]   = useState(() => Math.round(1440 / Math.max(1, (league as any).games_per_real_day ?? 48)));
    const [matchFormat, setMatchFormat]   = useState(league.match_format ?? 'best_of_1');
    const [finalsMatchFormat, setFinalsMatchFormat] = useState(league.finals_match_format ?? league.match_format ?? 'best_of_1');
    const [ovrMin, setOvrMin]   = useState(league.draft_ovr_min ?? 0);
    const [ovrMax, setOvrMax]   = useState(league.draft_ovr_max ?? 99);
    const [yearMin, setYearMin] = useState(league.draft_year_min ?? 2001);
    const [yearMax, setYearMax] = useState(league.draft_year_max ?? 2025);
    const [useCustomOverrides, setUseCustomOverrides] = useState<boolean>((league as any).use_custom_overrides ?? false);
    const [rounds, setRounds]   = useState<PersonalDraftRoundInput[]>(() => toRoundInputs(league));
    const [timer, setTimer]     = useState<number | null>(league.personal_draft_format?.pickTimerSec ?? null);

    const [saving, setSaving]   = useState(false);
    const [saveOk, setSaveOk]   = useState(false);
    const [saveErr, setSaveErr] = useState<string | null>(null);

    // 진행 중인 팀 수 — 1 이상이면 포맷 잠금.
    const [startedCount, setStartedCount] = useState<number | null>(null);
    useEffect(() => {
        if (!room?.id) { setStartedCount(0); return; }
        let cancelled = false;
        (async () => {
            const { count } = await supabase
                .from('personal_draft_progress')
                .select('team_id', { count: 'exact', head: true })
                .eq('room_id', room.id);
            if (!cancelled) setStartedCount(count ?? 0);
        })();
        return () => { cancelled = true; };
    }, [room?.id]);
    const formatLocked = isInProgress || (startedCount ?? 0) > 0;

    const savedFormatKey = useMemo(() => JSON.stringify({
        rounds: toRoundInputs(league), timer: league.personal_draft_format?.pickTimerSec ?? null,
        ovrMin: league.draft_ovr_min ?? 0, ovrMax: league.draft_ovr_max ?? 99,
        yearMin: league.draft_year_min ?? 2001, yearMax: league.draft_year_max ?? 2025,
        useCustomOverrides: (league as any).use_custom_overrides ?? false,
    }), [league]);
    const currentFormatKey = JSON.stringify({ rounds, timer, ovrMin, ovrMax, yearMin, yearMax, useCustomOverrides });
    const formatDirty = currentFormatKey !== savedFormatKey;
    const savedDeadlineInputValue = toInputValue(league.draft_deadline_at);
    const scheduleDirty =
        tournamentStartAt !== toInputValue((league as any).tournament_start_at) ||
        deadlineEnabled !== (league.draft_deadline_at != null) ||
        (deadlineEnabled && deadlineAt !== savedDeadlineInputValue) ||
        intervalMin !== Math.round(1440 / Math.max(1, (league as any).games_per_real_day ?? 48)) ||
        matchFormat !== (league.match_format ?? 'best_of_1') ||
        finalsMatchFormat !== (league.finals_match_format ?? league.match_format ?? 'best_of_1');
    const dirty = scheduleDirty || (!formatLocked && formatDirty);

    const handleSave = async () => {
        setSaving(true); setSaveOk(false); setSaveErr(null);
        if (deadlineEnabled) {
            if (!deadlineAt) { setSaveErr('드래프트 마감 일시를 입력해주세요.'); setSaving(false); return; }
            const deadlineIso = toIso(deadlineAt);
            const startIso = toIso(tournamentStartAt);
            if (startIso && deadlineIso && new Date(deadlineIso).getTime() > new Date(startIso).getTime()) {
                setSaveErr('드래프트 마감 일시는 토너먼트 시작 일시보다 늦을 수 없습니다.'); setSaving(false); return;
            }
        }
        try {
            const base = {
                leagueId: league.id,
                tournamentStartAt: toIso(tournamentStartAt),
                draftDeadlineAt: deadlineEnabled ? toIso(deadlineAt) : null,
                gamesPerRealDay: Math.round(1440 / Math.max(1, intervalMin)),
                matchFormat,
                finalsMatchFormat: finalsMatchFormat !== matchFormat ? finalsMatchFormat : null,
            };
            if (formatLocked || !formatDirty) {
                const { error } = await updateLeagueSettings(base);
                if (error) throw new Error(error);
            } else {
                const built = await buildPersonalDraftFormat({
                    pickTimerSec: timer,
                    globalDraftYearMin: yearMin, globalDraftYearMax: yearMax,
                    globalOvrMin: ovrMin, globalOvrMax: ovrMax,
                    useCustomOverrides, rounds,
                });
                if (built.ok === false) throw new Error(built.error);
                const rosterSize = computeRosterSize(built.format.rounds);
                const { error } = await updateLeagueSettings({
                    ...base,
                    draftOvrMin: ovrMin, draftOvrMax: ovrMax,
                    draftYearMin: yearMin, draftYearMax: yearMax,
                    useCustomOverrides,
                    personalDraftFormat: built.format,
                    draftTotalRounds: rosterSize,
                    maxRosterSize: Math.min(20, Math.max(15, rosterSize)),
                });
                if (error) throw new Error(error);
            }
            setSaveOk(true);
            setTimeout(() => setSaveOk(false), 2000);
            onSaved();
        } catch (e) {
            setSaveErr(e instanceof Error ? e.message : '저장에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Trophy size={14} className="text-indigo-400" />
                    개인 팩 드래프트
                </h2>
                <div className="flex items-center gap-2">
                    {saveErr && <span className="text-xs text-red-400 ko-normal">{saveErr}</span>}
                    <button
                        onClick={handleSave}
                        disabled={!dirty || saving}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-white transition-colors"
                    >
                        {saving ? <><Loader2 size={12} className="animate-spin" />저장 중…</> : saveOk ? '저장됨 ✓' : <><Save size={12} />저장</>}
                    </button>
                </div>
            </div>

            {formatLocked && (
                <p className="flex items-start gap-1.5 text-xs text-amber-400 ko-normal bg-amber-950/30 border border-amber-700/40 rounded-xl px-3 py-2">
                    <Lock size={12} className="shrink-0 mt-0.5" />
                    <span>
                        {isInProgress
                            ? '토너먼트가 진행 중이라 드래프트 포맷은 잠겨 있습니다.'
                            : `${startedCount}팀이 이미 팩 드래프트를 시작해 라운드 구성·풀 범위·제한시간은 바꿀 수 없습니다. 시작 일시와 경기 포맷만 수정할 수 있습니다.`}
                    </span>
                </p>
            )}

            {/* ── 일정 / 경기 포맷 ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="text-xs text-slate-400 ko-normal block mb-1">토너먼트 시작 일시</label>
                    <input
                        type="datetime-local"
                        value={tournamentStartAt}
                        onChange={e => setTournamentStartAt(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                    <p className="text-xs text-slate-600 ko-normal mt-1">첫 경기 시작 시각. 참가자들은 그 전까지 각자 팩 드래프트를 마쳐야 합니다.</p>
                </div>
                <div>
                    <label className="text-xs text-slate-400 ko-normal block mb-1">경기 간격 (분) <span className="text-slate-600">15–180</span></label>
                    <input
                        type="number"
                        min={15}
                        max={180}
                        step={5}
                        value={intervalMin}
                        onChange={e => setIntervalMin(Math.min(180, Math.max(15, Number(e.target.value))))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                </div>
                <div>
                    <label className="flex items-center gap-2 mb-1 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={deadlineEnabled}
                            onChange={e => {
                                const on = e.target.checked;
                                setDeadlineEnabled(on);
                                if (on && !deadlineAt) setDeadlineAt(tournamentStartAt);
                            }}
                            className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                        />
                        <span className="text-xs text-slate-400 ko-normal">드래프트 마감 일시 설정</span>
                    </label>
                    {deadlineEnabled && (
                        <input
                            type="datetime-local"
                            value={deadlineAt}
                            max={tournamentStartAt}
                            onChange={e => setDeadlineAt(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                    )}
                    <p className="text-xs text-slate-600 ko-normal mt-1">
                        지나면 새 참가자 차단 + 미완료 참가자 자동 강퇴(빈 팀은 시작 시 AI가 채움).
                    </p>
                </div>
            </div>
            <div className="space-y-3">
                <div>
                    <label className="text-xs text-slate-400 ko-normal block mb-1.5">경기 포맷 (일반전)</label>
                    <div className="flex gap-2 flex-wrap">
                        {MATCH_FORMATS.map(f => (
                            <button key={f} onClick={() => setMatchFormat(f)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${matchFormat === f ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                                {MATCH_LABEL[f]}
                            </button>
                        ))}
                    </div>
                </div>
                {league.tournament_format === 'single_elim' && (
                    <div>
                        <label className="text-xs text-slate-400 ko-normal block mb-1.5">경기 포맷 (결승)</label>
                        <div className="flex gap-2 flex-wrap">
                            {MATCH_FORMATS.map(f => (
                                <button key={f} onClick={() => setFinalsMatchFormat(f)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${finalsMatchFormat === f ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                                    {MATCH_LABEL[f]}
                                </button>
                            ))}
                        </div>
                        {finalsMatchFormat === matchFormat && <p className="text-[11px] text-slate-600 ko-normal mt-1">일반전과 동일 포맷</p>}
                    </div>
                )}
            </div>

            {/* ── 글로벌 풀 범위 + 라운드 구성 ── */}
            <div className={`space-y-4 pt-4 border-t border-slate-700/40 ${formatLocked ? 'opacity-70 pointer-events-none' : ''}`}>
                <p className="text-xs text-slate-500 ko-normal flex items-center gap-1.5">
                    <AlertCircle size={12} className="shrink-0" />
                    아래 범위는 라운드별 하위 범위의 상한선입니다. 저장하면 라운드별 후보 목록이 다시 확정됩니다.
                </p>
                <DraftPoolSettings
                    ovrMin={ovrMin} onOvrMinChange={setOvrMin}
                    ovrMax={ovrMax} onOvrMaxChange={setOvrMax}
                    draftYearMin={yearMin} onDraftYearMinChange={setYearMin}
                    draftYearMax={yearMax} onDraftYearMaxChange={setYearMax}
                    draftFormat="snake" onDraftFormatChange={() => {}}
                    useCustomOverrides={useCustomOverrides} onUseCustomOverridesChange={setUseCustomOverrides}
                    hideDraftOrder
                />
                <PersonalDraftFormatEditor
                    rounds={rounds} onRoundsChange={setRounds}
                    pickTimerSec={timer} onPickTimerSecChange={setTimer}
                    globalOvrMin={ovrMin} globalOvrMax={ovrMax}
                    globalDraftYearMin={yearMin} globalDraftYearMax={yearMax}
                    useCustomOverrides={useCustomOverrides}
                    disabled={formatLocked}
                />
            </div>
        </section>
    );
};
