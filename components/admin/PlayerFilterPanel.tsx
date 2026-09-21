// PlayerFilterPanel.tsx — 어드민 선수/카드 검색 필터 패널(소속 팀 / 포지션 / 커리어 연도 / 능력치 범위).
// [2026-09-21] 카드 관리 탭(선수 검색, DB RPC)과 카드 컬렉션 탭(컬렉션 내 카드, 클라이언트 필터)이 같은 UI를 쓴다.
// 상태는 부모가 소유하고 이 컴포넌트는 표시/편집만 한다.
import React, { useEffect, useState } from 'react';
import { SlidersHorizontal, Plus, X } from 'lucide-react';
import { ATTR_GROUPS, ATTR_KR_LABEL } from '../../data/attributeConfig';
import { TEAM_DATA } from '../../data/teamData';
import { CARD_EXTRA_TEAMS } from '../../data/cardTeams';
import { fetchCareerTeamCodes, type AttrRangeFilter, type CareerTeamCode } from '../../services/admin/playerAdminService';

export interface PlayerFilterState {
    /** base_team_id. ''=전체, '__none__'=소속 없음 */
    team: string;
    position: string;
    careerFrom: string;
    careerTo: string;
    /** [2026-09-21] 커리어 기록 내 소속팀 코드(career_history[].team, 예 'LAL'). ''=전체 */
    careerTeam: string;
    attrs: AttrRangeFilter[];
}

export const EMPTY_PLAYER_FILTERS: PlayerFilterState = { team: '', position: '', careerFrom: '', careerTo: '', careerTeam: '', attrs: [] };

export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
/** 팀 약어(id 대문자) — 드롭다운 정렬/표시 기준(요청: 영문 약어 A→Z) */
export const teamAbbr = (id: string) => id.toUpperCase();
export const TEAM_OPTIONS = Object.values(TEAM_DATA).sort((a, b) => teamAbbr(a.id).localeCompare(teamAbbr(b.id)));
export const EXTRA_TEAM_OPTIONS = [...CARD_EXTRA_TEAMS].sort((a, b) => a.abbr.localeCompare(b.abbr));

/** 커리어 팀 코드(bbref 식) → 현재 우리 팀 id — 드롭다운 라벨에 팀명을 덧붙이기 위한 참고 매핑(정확 일치 검색과 무관) */
const CAREER_CODE_TO_TEAM: Record<string, string> = {
    ATL: 'atl', BOS: 'bos', BRK: 'bkn', BKN: 'bkn', NJN: 'bkn', CHA: 'cha', CHO: 'cha', CHH: 'cha', CHI: 'chi', CLE: 'cle',
    DAL: 'dal', DEN: 'den', DET: 'det', GSW: 'gs', HOU: 'hou', IND: 'ind', LAC: 'law', LAL: 'lam', MEM: 'mem', VAN: 'mem',
    MIA: 'mia', MIL: 'mil', MIN: 'min', NOP: 'no', NOH: 'no', NOK: 'no', NYK: 'nyk', OKC: 'okc', SEA: 'okc', ORL: 'orl',
    PHI: 'phi', PHO: 'phx', POR: 'por', SAC: 'sac', SAS: 'sa', TOR: 'tor', UTA: 'uta', WAS: 'was', WSB: 'was',
};
export function careerCodeLabel(code: string): string {
    const id = CAREER_CODE_TO_TEAM[code];
    const t = id ? TEAM_DATA[id] : undefined;
    return t ? `${code} · ${t.city} ${t.name}` : code;
}

// 코드 목록은 모듈 캐시(한 세션에 한 번만 조회)
let careerCodesCache: CareerTeamCode[] | null = null;
let careerCodesPromise: Promise<CareerTeamCode[]> | null = null;
function loadCareerCodes(): Promise<CareerTeamCode[]> {
    if (careerCodesCache) return Promise.resolve(careerCodesCache);
    if (!careerCodesPromise) {
        careerCodesPromise = fetchCareerTeamCodes().then(rows => { careerCodesCache = rows; return rows; }).catch(() => []);
    }
    return careerCodesPromise;
}
/** 검색 필터용 능력치 키(카테고리 평균 제외 — DB base_attributes에 36개 개별 능력치만 있음) */
export const FILTER_ATTR_KEYS = ATTR_GROUPS.flatMap(g => g.keys.slice(1));

export const numOrNull = (v: string): number | null => (v.trim() === '' ? null : Number(v));

export function countActiveFilters(f: PlayerFilterState): number {
    return (f.team ? 1 : 0) + (f.position ? 1 : 0) + (f.careerFrom || f.careerTo ? 1 : 0) + (f.careerTeam ? 1 : 0)
        + f.attrs.filter(a => a.key && (a.min != null || a.max != null)).length;
}

/** 실제 선수 career_history 한 행의 요약(클라이언트 판정용) */
export interface CareerRow { year: number | null; team: string | null }

/** 클라이언트 측 필터 판정(카드 컬렉션 탭용). careerRows는 실제 선수의 시즌 행 목록(없으면 커리어 필터 시 제외). */
export function matchesPlayerFilters(
    f: PlayerFilterState,
    row: { base_team_id: string | null; position: string; base_attributes: Record<string, any> },
    careerRows: CareerRow[] | null | undefined,
): boolean {
    if (f.team) {
        if (f.team === '__none__') { if (row.base_team_id) return false; }
        else if (row.base_team_id !== f.team) return false;
    }
    if (f.position && row.position !== f.position) return false;
    const from = numOrNull(f.careerFrom), to = numOrNull(f.careerTo);
    const code = f.careerTeam.trim().toUpperCase();
    if (from != null || to != null || code) {
        // DB RPC와 같은 규칙: 연도 범위와 팀 코드가 같은 시즌 행에서 동시에 만족
        const ok = careerRows?.some(r =>
            ((from == null && to == null) || (r.year != null && r.year >= (from ?? 0) && r.year <= (to ?? 9999)))
            && (!code || (r.team ?? '').toUpperCase() === code));
        if (!ok) return false;
    }
    for (const a of f.attrs) {
        if (!a.key || (a.min == null && a.max == null)) continue;
        const v = Number(row.base_attributes?.[a.key]);
        if (!Number.isFinite(v)) return false;
        if (a.min != null && v < a.min) return false;
        if (a.max != null && v > a.max) return false;
    }
    return true;
}

const SELECT = 'bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500';
const NUM = 'bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white text-center focus:outline-none focus:border-indigo-500 placeholder:text-slate-600';

interface Props {
    value: PlayerFilterState;
    onChange: (next: PlayerFilterState) => void;
    open: boolean;
    onToggleOpen: () => void;
    /** 결과 수 표시(예: "결과 12명" / "12 / 40장") */
    resultLabel?: string;
}

export const PlayerFilterPanel: React.FC<Props> = ({ value: f, onChange, open, onToggleOpen, resultLabel }) => {
    const active = countActiveFilters(f);
    const [careerCodes, setCareerCodes] = useState<CareerTeamCode[]>(careerCodesCache ?? []);
    useEffect(() => { if (open && !careerCodesCache) loadCareerCodes().then(setCareerCodes); }, [open]);
    const set = (patch: Partial<PlayerFilterState>) => onChange({ ...f, ...patch });
    const setAttr = (i: number, patch: Partial<AttrRangeFilter>) => set({ attrs: f.attrs.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

    return (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl">
            <button type="button" onClick={onToggleOpen}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-300 hover:text-white transition-colors">
                <span className="flex items-center gap-1.5 font-bold">
                    <SlidersHorizontal size={12} />검색 필터
                    {active > 0 && <span className="px-1.5 py-0.5 rounded-full bg-indigo-600 text-white text-[10px]">{active}</span>}
                </span>
                <span className="text-slate-500">{open ? '접기' : '펼치기'}</span>
            </button>
            {open && (
                <div className="px-3 pb-3 space-y-2.5 border-t border-slate-800">
                    <div className="grid grid-cols-2 gap-2 pt-2.5">
                        <div>
                            <label className="text-[11px] text-slate-500 ko-normal block mb-1">소속 팀</label>
                            <select value={f.team} onChange={e => set({ team: e.target.value })} className={`${SELECT} w-full`}>
                                <option value="">전체</option>
                                <option value="__none__">소속 없음(은퇴/레전드)</option>
                                {TEAM_OPTIONS.map(t => <option key={t.id} value={t.id}>{teamAbbr(t.id)} · {t.city} {t.name}</option>)}
                                {EXTRA_TEAM_OPTIONS.length > 0 && (
                                    <optgroup label="확장 팀">
                                        {EXTRA_TEAM_OPTIONS.map(t => <option key={t.id} value={t.id}>{t.abbr} · {t.city} {t.name}</option>)}
                                    </optgroup>
                                )}
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="text-[11px] text-slate-500 ko-normal block mb-1">커리어 소속팀 <span className="text-slate-600">(기록상 한 시즌이라도 뛴 팀 · 실제 팀 코드)</span></label>
                            <select value={f.careerTeam} onChange={e => set({ careerTeam: e.target.value })} className={`${SELECT} w-full`}>
                                <option value="">전체</option>
                                {careerCodes.map(c => <option key={c.code} value={c.code}>{careerCodeLabel(c.code)} ({c.players}명)</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[11px] text-slate-500 ko-normal block mb-1">포지션</label>
                            <select value={f.position} onChange={e => set({ position: e.target.value })} className={`${SELECT} w-full`}>
                                <option value="">전체</option>
                                {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-[11px] text-slate-500 ko-normal block mb-1">커리어 연도 <span className="text-slate-600">(그 사이 시즌을 뛴 선수 · 커리어 소속팀과 함께 쓰면 그 팀에서 그 연도에)</span></label>
                        <div className="flex items-center gap-1.5">
                            <input type="number" min={1946} max={2030} placeholder="예: 2000" value={f.careerFrom} onChange={e => set({ careerFrom: e.target.value })} className={`${NUM} w-full`} />
                            <span className="text-xs text-slate-500">~</span>
                            <input type="number" min={1946} max={2030} placeholder="예: 2010" value={f.careerTo} onChange={e => set({ careerTo: e.target.value })} className={`${NUM} w-full`} />
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] text-slate-500 ko-normal">능력치 <span className="text-slate-600">(모두 만족)</span></label>
                            <button type="button" onClick={() => set({ attrs: [...f.attrs, { key: FILTER_ATTR_KEYS[0], min: 80, max: null }] })}
                                className="flex items-center gap-1 text-[11px] text-indigo-300 hover:text-white transition-colors">
                                <Plus size={11} />조건 추가
                            </button>
                        </div>
                        {f.attrs.length === 0 ? (
                            <p className="text-[11px] text-slate-600 ko-normal">조건 없음</p>
                        ) : (
                            <div className="space-y-1.5">
                                {f.attrs.map((a, i) => (
                                    <div key={i} className="flex items-center gap-1.5">
                                        <select value={a.key} onChange={e => setAttr(i, { key: e.target.value })} className={`${SELECT} flex-1 min-w-0`}>
                                            {FILTER_ATTR_KEYS.map(k => <option key={k} value={k}>{ATTR_KR_LABEL[k] ?? k}</option>)}
                                        </select>
                                        <input type="number" min={0} max={99} placeholder="최소" value={a.min ?? ''} onChange={e => setAttr(i, { min: numOrNull(e.target.value) })} className={`${NUM} w-14`} />
                                        <span className="text-xs text-slate-500">~</span>
                                        <input type="number" min={0} max={99} placeholder="최대" value={a.max ?? ''} onChange={e => setAttr(i, { max: numOrNull(e.target.value) })} className={`${NUM} w-14`} />
                                        <button type="button" onClick={() => set({ attrs: f.attrs.filter((_, j) => j !== i) })} aria-label="조건 삭제"
                                            className="p-1 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0">
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-slate-500 tabular-nums">{resultLabel ?? ''}</span>
                        <button type="button" onClick={() => onChange(EMPTY_PLAYER_FILTERS)} disabled={active === 0}
                            className="text-[11px] text-slate-400 hover:text-white disabled:opacity-40 transition-colors">필터 초기화</button>
                    </div>
                </div>
            )}
        </div>
    );
};
