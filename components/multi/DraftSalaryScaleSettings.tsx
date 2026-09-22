import React, { useMemo } from 'react';
import {
    type ContractMode, type DraftSalaryScale,
    DEFAULT_DRAFT_SALARY_SCALE, DRAFT_SALARY_PCT_MAX,
    resolveDraftSalaryPct, summarizeTeamPayrollPct, validateDraftSalaryScale, draftSalaryAmount,
} from '../../services/contracts/draftSalaryScale';
import { formatMoney } from '../../utils/formatMoney';

// 드래프트 계약 생성 규칙 편집기 — 리그 생성(CreateLeagueModal)과 리그 설정(LeagueSettingsView) 공용.
// [2026-09-22] 규칙: services/contracts/draftSalaryScale.ts 상단 주석 참고. 이 컴포넌트는 표시/편집만 하고
// 계산은 전부 그 모듈에 위임한다(서버 finalize와 같은 함수 → 화면의 "초기 페이롤 N%"가 실제 생성값과 일치).

interface Props {
    contractMode: ContractMode;
    onContractModeChange: (v: ContractMode) => void;
    scale: DraftSalaryScale;
    onScaleChange: (v: DraftSalaryScale) => void;
    totalRounds: number;
    teamCount: number;
    /** 리그 캡 금액(달러) — 표의 %를 금액으로도 보여주기 위함. */
    salaryCap: number;
    /** 캡 대비 비율(%) 임계값 — 초기 페이롤이 넘으면 경고. */
    taxPct?: number; apron1Pct?: number; apron2Pct?: number;
    /** 드래프트 시작 후엔 읽기 전용(이미 적용됨). */
    readOnly?: boolean;
    /** 드래프트 연도 하한 — 레전드 포함 범위(<2010)면 alternative를 권장 문구로 안내. */
    draftYearMin?: number;
}

const inputCls = 'w-16 bg-slate-950/60 border border-slate-700 rounded px-2 py-1 text-xs text-white text-right focus:outline-none focus:border-indigo-500 disabled:opacity-50';

export const DraftSalaryScaleSettings: React.FC<Props> = ({
    contractMode, onContractModeChange, scale, onScaleChange,
    totalRounds, teamCount, salaryCap, taxPct, apron1Pct, apron2Pct, readOnly = false, draftYearMin,
}) => {
    const rounds = Math.max(1, totalRounds);
    const validation = useMemo(
        () => validateDraftSalaryScale(scale, rounds, teamCount, { taxPct, apron1Pct, apron2Pct }),
        [scale, rounds, teamCount, taxPct, apron1Pct, apron2Pct],
    );
    const payrollFirst = summarizeTeamPayrollPct(scale, rounds, teamCount, 1);
    const payrollLast  = summarizeTeamPayrollPct(scale, rounds, teamCount, teamCount);
    const suggestAlternative = draftYearMin != null && draftYearMin < 2010 && contractMode === 'standard';

    const setRound = (idx: number, v: number) => {
        const next = [...scale.roundsPct];
        while (next.length < rounds - 1) next.push(next[next.length - 1] ?? 1);
        next[idx] = v;
        onScaleChange({ ...scale, roundsPct: next });
    };
    const num = (s: string) => { const n = parseFloat(s); return Number.isFinite(n) ? Math.max(0, Math.min(DRAFT_SALARY_PCT_MAX, n)) : 0; };

    return (
        <div className="space-y-3">
            {/* 모드 */}
            <div className="space-y-1.5">
                <div className="text-xs font-bold text-slate-300">드래프트 계약 생성</div>
                <div className="grid grid-cols-2 gap-2">
                    {([
                        { v: 'standard',    label: '실제 계약 기준 (standard)',  desc: '실제 계약 유지. 풀은 이번 시즌 유효 계약 보유자 + 당해 드래프트 클래스 신인으로 제한되고, 신인만 루키 스케일로 생성' },
                        { v: 'alternative', label: '대체 계약 (alternative)',    desc: '드래프트된 전원에게 아래 라운드 표로 1년 계약을 새로 부여. 레전드 포함 판타지 리그용' },
                    ] as { v: ContractMode; label: string; desc: string }[]).map(o => (
                        <button
                            key={o.v} type="button" disabled={readOnly}
                            onClick={() => onContractModeChange(o.v)}
                            className={`text-left px-3 py-2 rounded-xl border transition-colors disabled:cursor-not-allowed ${
                                contractMode === o.v ? 'bg-indigo-600/20 border-indigo-500/60' : 'bg-slate-900/60 border-transparent hover:border-slate-600'
                            }`}
                        >
                            <div className={`text-xs font-bold ${contractMode === o.v ? 'text-white' : 'text-slate-300'}`}>{o.label}</div>
                            <div className="text-xs text-slate-500 ko-normal mt-0.5">{o.desc}</div>
                        </button>
                    ))}
                </div>
                {suggestAlternative && (
                    <div className="text-xs text-amber-400 ko-normal">
                        드래프트 연도 하한이 {draftYearMin}년이라 실제 계약이 없는 은퇴 선수가 풀에 포함됩니다 — standard 모드에서는 이들이 풀에서 자동 제외됩니다. 레전드를 뽑게 하려면 alternative를 선택하세요.
                    </div>
                )}
            </div>

            {/* 표 — alternative에서만 적용되지만 standard에서도 보이게 두어 어드민이 차이를 이해할 수 있게 함 */}
            <div className={`space-y-2 ${contractMode === 'alternative' ? '' : 'opacity-50'}`}>
                <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-300">라운드별 연봉 (캡 대비 %)</div>
                    {!readOnly && (
                        <button type="button" onClick={() => onScaleChange({ ...DEFAULT_DRAFT_SALARY_SCALE, roundsPct: [...DEFAULT_DRAFT_SALARY_SCALE.roundsPct] })}
                            className="text-xs text-slate-400 hover:text-white underline underline-offset-2">기본값으로</button>
                    )}
                </div>

                <div className="rounded-xl bg-slate-900/60 border border-slate-700/40 divide-y divide-slate-800">
                    <div className="grid grid-cols-[3rem_1fr_5rem_7rem] gap-2 items-center px-3 py-2 text-xs">
                        <span className="text-slate-400 font-bold">R1</span>
                        <span className="text-slate-500 ko-normal">첫 픽 → 마지막 픽 선형 감소 (슬롯 기준, {teamCount}팀)</span>
                        <div className="flex items-center gap-1 justify-end">
                            <input type="number" step="0.1" min={0} max={DRAFT_SALARY_PCT_MAX} disabled={readOnly} className={inputCls}
                                value={scale.r1FirstPct} onChange={e => onScaleChange({ ...scale, r1FirstPct: num(e.target.value) })} />
                            <span className="text-slate-500">→</span>
                            <input type="number" step="0.1" min={0} max={DRAFT_SALARY_PCT_MAX} disabled={readOnly} className={inputCls}
                                value={scale.r1LastPct} onChange={e => onScaleChange({ ...scale, r1LastPct: num(e.target.value) })} />
                        </div>
                        <span className="text-right text-slate-300">{formatMoney(draftSalaryAmount(salaryCap, scale.r1FirstPct))} → {formatMoney(draftSalaryAmount(salaryCap, scale.r1LastPct))}</span>
                    </div>
                    {Array.from({ length: rounds - 1 }, (_, i) => i + 2).map(r => {
                        const pct = resolveDraftSalaryPct(scale, r, 1, teamCount);
                        return (
                            <div key={r} className="grid grid-cols-[3rem_1fr_5rem_7rem] gap-2 items-center px-3 py-1.5 text-xs">
                                <span className="text-slate-400 font-bold">R{r}</span>
                                <span className="text-slate-600 ko-normal">{r >= 11 ? '미니멈' : ''}</span>
                                <div className="flex justify-end">
                                    <input type="number" step="0.1" min={0} max={DRAFT_SALARY_PCT_MAX} disabled={readOnly} className={inputCls}
                                        value={pct} onChange={e => setRound(r - 2, num(e.target.value))} />
                                </div>
                                <span className="text-right text-slate-300">{formatMoney(draftSalaryAmount(salaryCap, pct))}</span>
                            </div>
                        );
                    })}
                </div>

                {/* 요약 + 경고 */}
                <div className="rounded-xl bg-slate-950/60 border border-slate-700/40 px-3 py-2 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="text-slate-400">팀 초기 페이롤 (스네이크, {rounds}라운드)</span>
                        <span className="font-bold text-white">
                            {payrollFirst.toFixed(1)}% ~ {payrollLast.toFixed(1)}%
                            <span className="text-slate-500 font-normal ml-2">({formatMoney(draftSalaryAmount(salaryCap, payrollLast))} ~ {formatMoney(draftSalaryAmount(salaryCap, payrollFirst))})</span>
                        </span>
                    </div>
                    {taxPct != null && <div className="text-slate-600">사치세선 {taxPct.toFixed(1)}%{apron1Pct != null ? ` · 1차 에이프런 ${apron1Pct.toFixed(1)}%` : ''}{apron2Pct != null ? ` · 2차 에이프런 ${apron2Pct.toFixed(1)}%` : ''}</div>}
                    {validation.errors.map((m, i) => <div key={`e${i}`} className="text-red-400">{m}</div>)}
                    {validation.warnings.map((m, i) => <div key={`w${i}`} className="text-amber-400">{m}</div>)}
                </div>
            </div>
        </div>
    );
};

export default DraftSalaryScaleSettings;
