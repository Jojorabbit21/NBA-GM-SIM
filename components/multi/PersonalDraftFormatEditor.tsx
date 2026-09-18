// PersonalDraftFormatEditor.tsx — 토너먼트 "개인 팩 드래프트" 라운드별 포맷 편집기 (Phase 6).
// docs/plan/tournament-personal-pack-draft-plan.md — CreateLeagueModal(생성)과
// PersonalDraftSettingsTab(세션 설정) 양쪽에서 같은 컴포넌트를 쓴다. 상태는 부모가 소유하고
// 이 컴포넌트는 표시/편집만 담당. 글로벌 OVR/연도 범위는 기존 DraftPoolSettings가 편집하며
// 여기엔 검증 기준으로만 들어온다.
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Plus, Trash2, Wand2 } from 'lucide-react';
import {
    buildFixedDeclineCurve,
    buildPersonalDraftFormat,
    computeRosterSize,
    validatePersonalDraftInput,
    PERSONAL_DRAFT_POOL_SIZE_MAX,
    PERSONAL_DRAFT_ROSTER_MAX,
    PERSONAL_DRAFT_ROSTER_MIN,
    PERSONAL_DRAFT_ROSTER_WARN_BELOW,
    PERSONAL_DRAFT_ROUNDS_MAX,
    PICK_TIMER_SEC_DEFAULT,
    PICK_TIMER_SEC_MAX,
    PICK_TIMER_SEC_MIN,
    type PersonalDraftRoundInput,
} from '../../services/multi/personalDraftFormat';

interface Props {
    rounds: PersonalDraftRoundInput[];
    onRoundsChange: (rounds: PersonalDraftRoundInput[]) => void;
    pickTimerSec: number | null;
    onPickTimerSecChange: (v: number | null) => void;
    globalOvrMin: number;
    globalOvrMax: number;
    globalDraftYearMin: number;
    globalDraftYearMax: number;
    useCustomOverrides: boolean;
    /** 이미 드래프트를 시작한 팀이 있는 등 편집이 잠긴 경우. */
    disabled?: boolean;
}

const INPUT = 'bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white text-center focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed';
const SMALL_BTN = 'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

/** 기본 프리셋값 — 15라운드 × 1픽 = 15명 로스터, 창 폭 10, 라운드당 8장 노출. */
const PRESET_DEFAULTS = { totalRounds: 15, windowSize: 10, poolSize: 8, picks: 1 };

function renumber(rounds: PersonalDraftRoundInput[]): PersonalDraftRoundInput[] {
    return rounds.map((r, i) => ({ ...r, round: i + 1 }));
}

function fmtClock(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const PersonalDraftFormatEditor: React.FC<Props> = ({
    rounds, onRoundsChange,
    pickTimerSec, onPickTimerSecChange,
    globalOvrMin, globalOvrMax, globalDraftYearMin, globalDraftYearMax,
    useCustomOverrides,
    disabled = false,
}) => {
    const [preset, setPreset] = useState(PRESET_DEFAULTS);
    // 마지막으로 "사용"했던 타이머 값 — 체크 해제 후 다시 켤 때 복원.
    const [lastTimer, setLastTimer] = useState<number>(pickTimerSec ?? PICK_TIMER_SEC_DEFAULT);
    useEffect(() => { if (pickTimerSec != null) setLastTimer(pickTimerSec); }, [pickTimerSec]);

    // 후보 인원 확인(비동기, meta_players 조회) — 입력이 바뀌면 결과 무효화.
    const [eligibleCounts, setEligibleCounts] = useState<number[] | null>(null);
    const [checking, setChecking]             = useState(false);
    const [checkErr, setCheckErr]             = useState<string | null>(null);
    useEffect(() => { setEligibleCounts(null); setCheckErr(null); }, [rounds, globalOvrMin, globalOvrMax, globalDraftYearMin, globalDraftYearMax, useCustomOverrides]);

    const rosterSize = useMemo(() => computeRosterSize(rounds), [rounds]);
    const syncError = useMemo(() => validatePersonalDraftInput({
        pickTimerSec, globalOvrMin, globalOvrMax, globalDraftYearMin, globalDraftYearMax, rounds,
    }), [pickTimerSec, globalOvrMin, globalOvrMax, globalDraftYearMin, globalDraftYearMax, rounds]);
    const rosterWarn = !syncError && rosterSize < PERSONAL_DRAFT_ROSTER_WARN_BELOW;

    const update = (idx: number, patch: Partial<PersonalDraftRoundInput>) => {
        onRoundsChange(rounds.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    };
    const remove = (idx: number) => onRoundsChange(renumber(rounds.filter((_, i) => i !== idx)));
    const add = () => {
        if (rounds.length >= PERSONAL_DRAFT_ROUNDS_MAX) return;
        const last = rounds[rounds.length - 1];
        onRoundsChange(renumber([
            ...rounds,
            last
                ? { ...last, draftYearMin: last.draftYearMin, draftYearMax: last.draftYearMax }
                : { round: 1, poolSize: PRESET_DEFAULTS.poolSize, picks: 1, ovrMin: globalOvrMin, ovrMax: globalOvrMax, draftYearMin: null, draftYearMax: null },
        ]));
    };
    const applyPreset = () => {
        onRoundsChange(buildFixedDeclineCurve(globalOvrMin, globalOvrMax, preset));
    };

    const numOrNull = (v: string): number | null => (v.trim() === '' ? null : Number(v));

    const runCheck = async () => {
        setChecking(true); setCheckErr(null); setEligibleCounts(null);
        try {
            const res = await buildPersonalDraftFormat({
                pickTimerSec, globalOvrMin, globalOvrMax, globalDraftYearMin, globalDraftYearMax, useCustomOverrides, rounds,
            });
            if (res.ok === false) { setCheckErr(res.error); return; }
            setEligibleCounts(res.format.rounds.map(r => r.eligiblePlayerIds.length));
        } catch (e) {
            setCheckErr(e instanceof Error ? e.message : '후보 조회에 실패했습니다.');
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* ── 픽 제한시간 ── */}
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                pickTimerSec != null ? 'bg-indigo-600/20 border border-indigo-600/50' : 'bg-slate-900/60 border border-transparent'
            }`}>
                <input
                    type="checkbox"
                    checked={pickTimerSec != null}
                    disabled={disabled}
                    onChange={e => onPickTimerSecChange(e.target.checked ? lastTimer : null)}
                    className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                    <span className={`text-xs font-bold ${pickTimerSec != null ? 'text-white' : 'text-slate-400'}`}>라운드별 픽 제한시간</span>
                    <p className="text-[11px] text-slate-600 ko-normal mt-0.5">
                        시간이 지나면 서버가 팩에서 오버롤이 가장 높은 카드를 자동 지명합니다. 끄면 제한 없이 기다립니다.
                    </p>
                </div>
                {pickTimerSec != null && (
                    <div className="flex items-center gap-1.5 shrink-0">
                        <input
                            type="number"
                            min={PICK_TIMER_SEC_MIN}
                            max={PICK_TIMER_SEC_MAX}
                            step={5}
                            value={pickTimerSec}
                            disabled={disabled}
                            onChange={e => onPickTimerSecChange(Math.round(Number(e.target.value) || 0))}
                            onBlur={() => onPickTimerSecChange(Math.min(PICK_TIMER_SEC_MAX, Math.max(PICK_TIMER_SEC_MIN, pickTimerSec)))}
                            className={`${INPUT} w-20`}
                        />
                        <span className="text-xs text-slate-500">초</span>
                        <span className="text-xs text-slate-400 tabular-nums w-11 text-right">{fmtClock(Math.max(0, pickTimerSec))}</span>
                    </div>
                )}
            </div>

            {/* ── 프리셋 + 라운드 추가 ── */}
            <div className="flex flex-wrap items-end gap-2">
                <div className="flex items-end gap-1.5 flex-wrap">
                    {([
                        ['라운드', 'totalRounds', 1, PERSONAL_DRAFT_ROUNDS_MAX],
                        ['창 폭', 'windowSize', 1, 99],
                        ['노출', 'poolSize', 1, PERSONAL_DRAFT_POOL_SIZE_MAX],
                        ['픽', 'picks', 1, PERSONAL_DRAFT_POOL_SIZE_MAX],
                    ] as const).map(([label, key, min, max]) => (
                        <label key={key} className="flex flex-col gap-1">
                            <span className="text-[10px] text-slate-500 ko-normal">{label}</span>
                            <input
                                type="number"
                                min={min}
                                max={max}
                                value={preset[key]}
                                disabled={disabled}
                                onChange={e => setPreset(p => ({ ...p, [key]: Math.min(max, Math.max(min, Math.round(Number(e.target.value) || min))) }))}
                                className={`${INPUT} w-14`}
                            />
                        </label>
                    ))}
                    <button type="button" onClick={applyPreset} disabled={disabled} className={`${SMALL_BTN} bg-indigo-600/20 border border-indigo-600/40 text-indigo-300 hover:bg-indigo-600/30`}>
                        <Wand2 size={11} />
                        하락 커브 프리셋 적용
                    </button>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <button type="button" onClick={add} disabled={disabled || rounds.length >= PERSONAL_DRAFT_ROUNDS_MAX} className={`${SMALL_BTN} bg-slate-800 text-slate-300 hover:text-white`}>
                        <Plus size={11} />
                        라운드 추가
                    </button>
                    <button type="button" onClick={runCheck} disabled={disabled || checking || !!syncError} className={`${SMALL_BTN} bg-slate-800 text-slate-300 hover:text-white`}>
                        {checking ? <Loader2 size={11} className="animate-spin" /> : null}
                        후보 인원 확인
                    </button>
                </div>
            </div>
            <p className="text-[11px] text-slate-600 ko-normal -mt-2">
                프리셋은 글로벌 OVR 범위({globalOvrMin}~{globalOvrMax}) 안에서 1라운드가 가장 높은 창, 마지막 라운드가 가장 낮은 창이 되도록 등간격으로 내려 깝니다. 적용 후 표에서 라운드별로 자유롭게 고칠 수 있습니다.
            </p>

            {/* ── 라운드 테이블 ── */}
            <div className="overflow-x-auto rounded-xl border border-slate-700/60">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-800/60 text-[11px] text-slate-400">
                            <th className="px-2 py-2 text-left font-bold w-14">라운드</th>
                            <th className="px-2 py-2 text-center font-bold">OVR 범위</th>
                            <th className="px-2 py-2 text-center font-bold">지명 연도 <span className="text-slate-600 font-normal">(빈칸=전체)</span></th>
                            <th className="px-2 py-2 text-center font-bold w-20">노출 카드</th>
                            <th className="px-2 py-2 text-center font-bold w-16">픽 수</th>
                            {eligibleCounts && <th className="px-2 py-2 text-center font-bold w-16">후보</th>}
                            <th className="px-2 py-2 w-9" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {rounds.map((r, idx) => {
                            const count = eligibleCounts?.[idx];
                            const short = count != null && count < r.poolSize;
                            return (
                                <tr key={idx} className={short ? 'bg-red-950/30' : ''}>
                                    <td className="px-2 py-1.5 text-xs font-bold text-slate-300 whitespace-nowrap">{r.round}라운드</td>
                                    <td className="px-2 py-1.5">
                                        <div className="flex items-center justify-center gap-1">
                                            <input type="number" min={globalOvrMin} max={globalOvrMax} value={r.ovrMin} disabled={disabled}
                                                onChange={e => update(idx, { ovrMin: Number(e.target.value) })} className={`${INPUT} w-16`} />
                                            <span className="text-xs text-slate-500">~</span>
                                            <input type="number" min={globalOvrMin} max={globalOvrMax} value={r.ovrMax} disabled={disabled}
                                                onChange={e => update(idx, { ovrMax: Number(e.target.value) })} className={`${INPUT} w-16`} />
                                        </div>
                                    </td>
                                    <td className="px-2 py-1.5">
                                        <div className="flex items-center justify-center gap-1">
                                            <input type="number" min={globalDraftYearMin} max={globalDraftYearMax} placeholder={String(globalDraftYearMin)}
                                                value={r.draftYearMin ?? ''} disabled={disabled}
                                                onChange={e => update(idx, { draftYearMin: numOrNull(e.target.value) })} className={`${INPUT} w-20 placeholder:text-slate-600`} />
                                            <span className="text-xs text-slate-500">~</span>
                                            <input type="number" min={globalDraftYearMin} max={globalDraftYearMax} placeholder={String(globalDraftYearMax)}
                                                value={r.draftYearMax ?? ''} disabled={disabled}
                                                onChange={e => update(idx, { draftYearMax: numOrNull(e.target.value) })} className={`${INPUT} w-20 placeholder:text-slate-600`} />
                                        </div>
                                    </td>
                                    <td className="px-2 py-1.5 text-center">
                                        <input type="number" min={1} max={PERSONAL_DRAFT_POOL_SIZE_MAX} value={r.poolSize} disabled={disabled}
                                            onChange={e => update(idx, { poolSize: Number(e.target.value) })} className={`${INPUT} w-16`} />
                                    </td>
                                    <td className="px-2 py-1.5 text-center">
                                        <input type="number" min={1} max={r.poolSize} value={r.picks} disabled={disabled}
                                            onChange={e => update(idx, { picks: Number(e.target.value) })} className={`${INPUT} w-14`} />
                                    </td>
                                    {eligibleCounts && (
                                        <td className={`px-2 py-1.5 text-center text-xs font-bold tabular-nums ${short ? 'text-red-400' : 'text-emerald-400'}`}>
                                            {count ?? '—'}
                                        </td>
                                    )}
                                    <td className="px-1 py-1.5 text-center">
                                        <button type="button" onClick={() => remove(idx)} disabled={disabled || rounds.length <= 1}
                                            aria-label={`${r.round}라운드 삭제`}
                                            className="p-1 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                                            <Trash2 size={13} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* ── 요약 + 검증 ── */}
            <div className={`rounded-xl px-3 py-2.5 space-y-1.5 ${
                syncError || checkErr ? 'bg-red-950/40 border border-red-700/50' : rosterWarn ? 'bg-amber-950/30 border border-amber-700/40' : 'bg-slate-800/60'
            }`}>
                <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 ko-normal">총 로스터 <span className="text-slate-600">(라운드별 픽 수 합계, {PERSONAL_DRAFT_ROSTER_MIN}~{PERSONAL_DRAFT_ROSTER_MAX}명)</span></span>
                    <span className={`text-sm font-black ${syncError ? 'text-red-400' : 'text-white'}`}>{rosterSize}명 <span className="text-xs font-normal text-slate-500">/ {rounds.length}라운드</span></span>
                </div>
                {syncError && (
                    <p className="flex items-start gap-1.5 text-xs text-red-400 ko-normal"><AlertTriangle size={12} className="shrink-0 mt-0.5" /><span>{syncError}</span></p>
                )}
                {!syncError && checkErr && (
                    <p className="flex items-start gap-1.5 text-xs text-red-400 ko-normal"><AlertTriangle size={12} className="shrink-0 mt-0.5" /><span>{checkErr}</span></p>
                )}
                {!syncError && !checkErr && rosterWarn && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-400 ko-normal"><AlertTriangle size={12} className="shrink-0 mt-0.5" /><span>로스터가 {PERSONAL_DRAFT_ROSTER_WARN_BELOW}명 미만이면 로테이션 여유가 거의 없습니다. 저장은 가능합니다.</span></p>
                )}
                {!syncError && !checkErr && eligibleCounts && (
                    <p className="text-xs text-emerald-400 ko-normal">모든 라운드에 노출 카드 수 이상의 후보가 있습니다. 저장 시 이 후보 목록이 고정됩니다.</p>
                )}
                {!syncError && !checkErr && !eligibleCounts && (
                    <p className="text-[11px] text-slate-600 ko-normal">저장 시 라운드별 후보 인원을 다시 검사하며, 어느 라운드든 노출 카드 수보다 후보가 적으면 저장이 거부됩니다. 이미 지명한 선수는 다음 라운드 팩에서 제외되므로, 범위가 겹치는 라운드는 후보를 넉넉히 잡아주세요.</p>
                )}
            </div>
        </div>
    );
};
