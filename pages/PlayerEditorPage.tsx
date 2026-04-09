import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchPlayers, fetchPlayerById, updateBaseAttributes, MetaPlayerRow } from '../services/admin/playerAdminService';

const ADMIN_USER_ID = 'd2f6a469-9182-4dac-a098-278e6e758c79';

// ── DB 키 정의 ─────────────────────────────────────────────────────────────────

const STAT_SECTIONS = [
    {
        label: '인사이드',
        keys: [
            { key: 'close', label: '훅/플로터' },
            { key: 'lay',   label: '레이업' },
            { key: 'dnk',   label: '덩크' },
            { key: 'post',  label: '포스트 플레이' },
            { key: 'draw',  label: '파울 유도' },
            { key: 'hands', label: '볼 간수' },
        ],
    },
    {
        label: '아웃사이드',
        keys: [
            { key: 'mid',   label: '미드레인지' },
            { key: '3c',    label: '코너 3점' },
            { key: '3_45',  label: '윙 3점' },
            { key: '3t',    label: '탑 3점' },
            { key: 'ft',    label: '자유투' },
            { key: 'siq',   label: '슈팅 IQ' },
            { key: 'ocon',  label: '공격 일관성' },
        ],
    },
    {
        label: '패스 & 플레이메이킹',
        keys: [
            { key: 'pacc',  label: '패스 정확도' },
            { key: 'handl', label: '볼 핸들링' },
            { key: 'spwb',  label: '드리블 속도' },
            { key: 'pvis',  label: '패스 시야' },
            { key: 'piq',   label: '패스 지능' },
            { key: 'obm',   label: '오프볼 무브먼트' },
        ],
    },
    {
        label: '수비',
        keys: [
            { key: 'idef',  label: '인사이드 수비' },
            { key: 'pdef',  label: '퍼리미터 수비' },
            { key: 'stl',   label: '스틸' },
            { key: 'blk',   label: '블락' },
            { key: 'hdef',  label: '도움 수비 지능' },
            { key: 'pper',  label: '패스 경로 예측' },
            { key: 'dcon',  label: '수비 일관성' },
        ],
    },
    {
        label: '리바운드',
        keys: [
            { key: 'oreb',  label: '공격 리바운드' },
            { key: 'dreb',  label: '수비 리바운드' },
            { key: 'box',   label: '박스아웃' },
        ],
    },
    {
        label: '운동 능력',
        keys: [
            { key: 'spd',   label: '속도' },
            { key: 'agi',   label: '민첩성' },
            { key: 'str',   label: '근력' },
            { key: 'vert',  label: '점프력' },
            { key: 'sta',   label: '지구력' },
            { key: 'hus',   label: '허슬' },
            { key: 'dur',   label: '내구도' },
        ],
    },
    {
        label: '특수 & 무형',
        keys: [
            { key: 'intangibles', label: '무형 (IQ/리더십/클러치)' },
        ],
    },
];

function getColor(v: number | undefined): string {
    if (v === undefined || v === null) return 'text-slate-500';
    if (v >= 90) return 'text-fuchsia-400';
    if (v >= 80) return 'text-emerald-400';
    if (v >= 70) return 'text-amber-400';
    return 'text-slate-400';
}

// ── PlayerEditorPage ──────────────────────────────────────────────────────────

const PlayerEditorPage: React.FC<{ userId?: string }> = ({ userId }) => {
    const navigate = useNavigate();
    const isAdmin = userId === ADMIN_USER_ID;

    const [query, setQuery] = useState('');
    const [results, setResults] = useState<MetaPlayerRow[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [selected, setSelected] = useState<MetaPlayerRow | null>(null);
    const [draft, setDraft] = useState<Record<string, any>>({});
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<string | null>(null);
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setQuery(v);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(async () => {
            try {
                setResults(await searchPlayers(v));
                setShowDropdown(true);
            } catch { setResults([]); }
        }, 200);
    }, []);

    const handleFocus = useCallback(async () => {
        if (results.length === 0) {
            try { setResults(await searchPlayers('')); } catch { /* noop */ }
        }
        setShowDropdown(true);
    }, [results.length]);

    const handleSelect = useCallback(async (row: MetaPlayerRow) => {
        const fresh = await fetchPlayerById(row.id);
        if (!fresh) return;
        setSelected(fresh);
        setDraft(JSON.parse(JSON.stringify(fresh.base_attributes)));
        setShowDropdown(false);
        setQuery(row.name);
        setSaveMsg(null);
    }, []);

    const setField = useCallback((key: string, raw: string) => {
        const num = Number(raw);
        setDraft(prev => ({ ...prev, [key]: isNaN(num) ? raw : num }));
    }, []);

    const setContractYear = useCallback((idx: number, raw: string) => {
        const num = Number(raw.replace(/,/g, ''));
        setDraft(prev => {
            const contract = { ...(prev.contract ?? {}), years: [...(prev.contract?.years ?? [])] };
            contract.years[idx] = isNaN(num) ? 0 : num;
            const cur = contract.currentYear ?? 0;
            const newSalary = contract.years[cur] ?? prev.salary;
            return { ...prev, contract, salary: newSalary };
        });
    }, []);

    const addContractYear = useCallback(() => {
        setDraft(prev => {
            const years = [...(prev.contract?.years ?? [])];
            years.push(0);
            return { ...prev, contract: { ...(prev.contract ?? {}), years } };
        });
    }, []);

    const removeContractYear = useCallback((idx: number) => {
        setDraft(prev => {
            const years = [...(prev.contract?.years ?? [])];
            years.splice(idx, 1);
            const contract = { ...(prev.contract ?? {}), years };
            if ((contract.currentYear ?? 0) >= years.length) {
                contract.currentYear = Math.max(0, years.length - 1);
            }
            const cur = contract.currentYear ?? 0;
            const newSalary = years[cur] ?? prev.salary;
            return { ...prev, contract, salary: newSalary };
        });
    }, []);

    const setContractField = useCallback((key: string, val: any) => {
        setDraft(prev => ({
            ...prev,
            contract: { ...(prev.contract ?? {}), [key]: val },
        }));
    }, []);

    const setCoField = useCallback((key: string, raw: string) => {
        setDraft(prev => {
            const co: Record<string, any> = { ...(prev.custom_overrides ?? {}) };
            if (raw === '' || raw === '-') {
                delete co[key];
            } else {
                const num = Number(raw);
                co[key] = isNaN(num) ? raw : num;
            }
            return { ...prev, custom_overrides: co };
        });
    }, []);

    const handleSave = useCallback(async () => {
        if (!selected) return;
        setSaving(true);
        setSaveMsg(null);
        try {
            await updateBaseAttributes(selected.id, draft);
            const fresh = await fetchPlayerById(selected.id);
            if (fresh) {
                setSelected(fresh);
                setDraft(JSON.parse(JSON.stringify(fresh.base_attributes)));
            }
            setSaveMsg('✓ 저장 완료');
        } catch (e: any) {
            setSaveMsg(`✗ 저장 실패: ${e.message}`);
        } finally {
            setSaving(false);
        }
    }, [selected, draft]);

    if (!isAdmin) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
                관리자 계정으로 로그인하세요.
            </div>
        );
    }

    const co: Record<string, any> = draft.custom_overrides ?? {};

    const renderStatSection = (section: typeof STAT_SECTIONS[0]) => (
        <Section key={section.label} label={section.label}>
            <table className="w-full text-sm border-collapse">
                <thead>
                    <tr className="text-slate-400 text-xs border-b border-slate-700">
                        <th className="text-left py-1 pr-3 font-normal">능력치</th>
                        <th className="text-center py-1 pr-2 font-normal text-slate-500 w-10">키</th>
                        <th className="text-center py-1 px-1 font-normal w-16">base</th>
                        <th className="text-center py-1 px-1 font-normal w-16 text-indigo-400">CO</th>
                        <th className="text-center py-1 px-1 font-normal w-12 text-slate-500">적용</th>
                    </tr>
                </thead>
                <tbody>
                    {section.keys.map(({ key, label }) => {
                        const baseVal = draft[key] as number | undefined;
                        const coVal   = co[key]   as number | undefined;
                        const applied = coVal !== undefined ? coVal : baseVal;
                        return (
                            <tr key={key} className="border-b border-slate-800 hover:bg-slate-800/30">
                                <td className="py-1 pr-3 text-slate-300 text-xs">{label}</td>
                                <td className="py-1 pr-2 text-center text-slate-500 text-xs font-mono">{key}</td>
                                <td className="py-1 px-1">
                                    <input
                                        type="number"
                                        min={0} max={99}
                                        className="w-full bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-center text-white text-xs focus:outline-none focus:border-slate-500"
                                        value={baseVal ?? ''}
                                        onChange={e => setField(key, e.target.value)}
                                    />
                                </td>
                                <td className="py-1 px-1">
                                    <input
                                        type="number"
                                        min={0} max={99}
                                        placeholder="—"
                                        className="w-full bg-slate-900 border border-indigo-800/50 rounded px-1 py-0.5 text-center text-indigo-300 text-xs focus:outline-none focus:border-indigo-500 placeholder-slate-600"
                                        value={coVal ?? ''}
                                        onChange={e => setCoField(key, e.target.value)}
                                    />
                                </td>
                                <td className={`py-1 px-1 text-center font-mono text-xs font-bold ${getColor(applied)}`}>
                                    {applied ?? '—'}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </Section>
    );

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 pretendard p-4 md:p-6">
            {/* 헤더 */}
            <div className="flex items-center gap-4 mb-6">
                <button
                    onClick={() => navigate(-1)}
                    className="text-slate-400 hover:text-white text-sm"
                >← 뒤로</button>
                <h1 className="text-lg font-bold text-white">선수 능력치 편집기</h1>
            </div>

            {/* 검색 */}
            <div className="relative mb-6 max-w-sm">
                <input
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    placeholder="선수 이름 검색 (비워두면 전체 목록)..."
                    value={query}
                    onChange={handleSearch}
                    onFocus={handleFocus}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                />
                {showDropdown && results.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-20 bg-slate-800 border border-slate-700 rounded-lg mt-1 max-h-60 overflow-y-auto shadow-xl">
                        {results.map(r => (
                            <button
                                key={r.id}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700 flex justify-between items-center"
                                onClick={() => handleSelect(r)}
                            >
                                <span className="text-white">{r.name}</span>
                                <span className="text-slate-400 text-xs">{r.position} · {r.base_attributes?.team ?? '—'}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {!selected && (
                <p className="text-slate-500 text-sm">선수를 검색해서 선택하세요.</p>
            )}

            {selected && (
                <>
                    {/* 선수 헤더 */}
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <span className="text-xl font-bold text-white">{selected.name}</span>
                            <span className="ml-3 text-slate-400 text-sm">
                                {draft.position ?? selected.position} · {draft.age ?? '—'}세 · {draft.team ?? '—'}
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            {saveMsg && (
                                <span className={`text-sm ${saveMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {saveMsg}
                                </span>
                            )}
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
                            >
                                {saving ? '저장 중...' : '적용'}
                            </button>
                        </div>
                    </div>

                    {/* ── 2컬럼 그리드 레이아웃 ── */}
                    <div className="grid grid-cols-2 gap-x-8 items-start">

                        {/* Row 1: 인적 정보 | 계약 정보 */}
                        <Section label="인적 정보">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="text-slate-400 text-xs border-b border-slate-700">
                                        <th className="text-left py-1 pr-4 font-normal w-24">필드</th>
                                        <th className="text-left py-1 pr-4 font-normal">값</th>
                                        <th className="text-left py-1 font-normal text-slate-500">비고</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        { key: 'age',       label: '나이',      note: '세' },
                                        { key: 'height',    label: '키',        note: 'cm' },
                                        { key: 'weight',    label: '몸무게',    note: 'kg' },
                                        { key: 'position',  label: '포지션',    note: 'PG/SG/SF/PF/C' },
                                        { key: 'team',      label: '팀',        note: '' },
                                        { key: 'potential', label: 'Potential', note: '25~99' },
                                    ].map(({ key, label, note }) => (
                                        <tr key={key} className="border-b border-slate-800 hover:bg-slate-800/30">
                                            <td className="py-1 pr-4 text-slate-400">{label}</td>
                                            <td className="py-1 pr-4">
                                                <input
                                                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                                                    value={draft[key] ?? ''}
                                                    onChange={e => setField(key, e.target.value)}
                                                />
                                            </td>
                                            <td className="py-1 text-slate-500 text-xs">{note}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Section>

                        <ContractSection
                            draft={draft}
                            onSetField={setField}
                            onSetContractYear={setContractYear}
                            onAddYear={addContractYear}
                            onRemoveYear={removeContractYear}
                            onSetContractField={setContractField}
                        />

                        {/* Row 2: 인사이드 | 아웃사이드 */}
                        {renderStatSection(STAT_SECTIONS[0])}
                        {renderStatSection(STAT_SECTIONS[1])}

                        {/* Row 3: 패스&플레이메이킹 | 수비 */}
                        {renderStatSection(STAT_SECTIONS[2])}
                        {renderStatSection(STAT_SECTIONS[3])}

                        {/* Row 4: 리바운드 + 특수&무형 | 운동 능력 */}
                        <div>
                            {renderStatSection(STAT_SECTIONS[4])}
                            {renderStatSection(STAT_SECTIONS[6])}
                        </div>
                        {renderStatSection(STAT_SECTIONS[5])}

                    </div>

                    {/* 저장 버튼 (하단) */}
                    <div className="mt-8 flex justify-end gap-3">
                        {saveMsg && (
                            <span className={`text-sm self-center ${saveMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>
                                {saveMsg}
                            </span>
                        )}
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-colors"
                        >
                            {saving ? '저장 중...' : '적용'}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

// ── 계약 섹션 ──────────────────────────────────────────────────────────────────
interface ContractSectionProps {
    draft: Record<string, any>;
    onSetField: (key: string, val: string) => void;
    onSetContractYear: (idx: number, val: string) => void;
    onAddYear: () => void;
    onRemoveYear: (idx: number) => void;
    onSetContractField: (key: string, val: any) => void;
}

function formatSalary(n: number | undefined): string {
    if (n === undefined || n === null || isNaN(n)) return '';
    return n.toLocaleString('en-US');
}

const ContractSection: React.FC<ContractSectionProps> = ({
    draft, onSetField, onSetContractYear, onAddYear, onRemoveYear, onSetContractField,
}) => {
    const contract: Record<string, any> = draft.contract ?? {};
    const years: number[] = contract.years ?? [];
    const currentYear: number = contract.currentYear ?? 0;
    const contractType: string = contract.type ?? 'veteran';
    const noTrade: boolean = !!contract.noTrade;
    const option = contract.option ?? null;

    const startYear = 2025;

    return (
        <Section label="계약 정보">
            {/* 계약 타입 + 옵션 */}
            <div className="flex flex-wrap gap-4 mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-xs w-20">계약 타입</span>
                    <select
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                        value={contractType}
                        onChange={e => onSetContractField('type', e.target.value)}
                    >
                        {['veteran','rookie','max','extension','min','two-way','10-day'].map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-xs w-20">현재 시즌</span>
                    <input
                        type="number"
                        min={0}
                        max={Math.max(0, years.length - 1)}
                        className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-white text-sm text-center focus:outline-none focus:border-indigo-500"
                        value={currentYear}
                        onChange={e => onSetContractField('currentYear', Number(e.target.value))}
                    />
                    <span className="text-slate-500 text-xs">(0부터, 현재=활성 시즌 인덱스)</span>
                </div>
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={noTrade}
                            onChange={e => onSetContractField('noTrade', e.target.checked ? true : undefined)}
                            className="accent-indigo-500"
                        />
                        <span className="text-slate-300 text-xs">NTC (No-Trade Clause)</span>
                    </label>
                </div>
            </div>

            {/* 옵션 */}
            <div className="flex flex-wrap gap-4 mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-xs w-20">옵션 타입</span>
                    <select
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                        value={option?.type ?? 'none'}
                        onChange={e => {
                            const v = e.target.value;
                            if (v === 'none') onSetContractField('option', undefined);
                            else onSetContractField('option', { ...option, type: v });
                        }}
                    >
                        <option value="none">없음</option>
                        <option value="player">Player Option</option>
                        <option value="team">Team Option</option>
                    </select>
                </div>
                {option && (
                    <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-xs w-24">옵션 적용 년도</span>
                        <input
                            type="number"
                            min={0}
                            max={Math.max(0, years.length - 1)}
                            className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-white text-sm text-center focus:outline-none focus:border-indigo-500"
                            value={option.year ?? 0}
                            onChange={e => onSetContractField('option', { ...option, year: Number(e.target.value) })}
                        />
                        <span className="text-slate-500 text-xs">(인덱스 기준)</span>
                    </div>
                )}
            </div>

            {/* 년도별 연봉 */}
            <table className="w-full text-sm border-collapse mb-3">
                <thead>
                    <tr className="text-slate-400 text-xs border-b border-slate-700">
                        <th className="text-left py-1 pr-4 font-normal w-12">년도</th>
                        <th className="text-left py-1 pr-4 font-normal w-28">시즌</th>
                        <th className="text-left py-1 pr-4 font-normal">연봉 (달러)</th>
                        <th className="text-left py-1 font-normal w-20 text-slate-500">$ 단위</th>
                        <th className="py-1 w-8"></th>
                    </tr>
                </thead>
                <tbody>
                    {years.map((sal, idx) => {
                        const isCurrent = idx === currentYear;
                        const isOpt = option && option.year === idx;
                        return (
                            <tr key={idx} className={`border-b border-slate-800 ${isCurrent ? 'bg-indigo-950/40' : 'hover:bg-slate-800/30'}`}>
                                <td className="py-1 pr-4">
                                    <span className={`font-mono text-xs ${isCurrent ? 'text-indigo-300 font-bold' : 'text-slate-400'}`}>
                                        Y{idx + 1}
                                        {isCurrent && <span className="ml-1 text-indigo-400">●</span>}
                                    </span>
                                </td>
                                <td className="py-1 pr-4 text-slate-400 text-xs">
                                    {startYear + idx}–{(startYear + idx + 1).toString().slice(2)}
                                    {isOpt && (
                                        <span className="ml-1 text-amber-400 text-[10px]">
                                            [{option.type === 'player' ? 'PO' : 'TO'}]
                                        </span>
                                    )}
                                </td>
                                <td className="py-1 pr-4">
                                    <input
                                        type="text"
                                        className={`w-full bg-slate-800 border rounded px-2 py-0.5 text-sm text-right focus:outline-none ${
                                            isCurrent
                                                ? 'border-indigo-600 text-indigo-200 focus:border-indigo-400'
                                                : 'border-slate-700 text-white focus:border-slate-500'
                                        }`}
                                        value={formatSalary(sal)}
                                        onChange={e => onSetContractYear(idx, e.target.value)}
                                    />
                                </td>
                                <td className="py-1 pr-4 text-slate-500 text-xs font-mono">
                                    {sal ? `$${(sal / 1_000_000).toFixed(2)}M` : '—'}
                                </td>
                                <td className="py-1 text-center">
                                    <button
                                        onClick={() => onRemoveYear(idx)}
                                        className="text-slate-600 hover:text-red-400 text-xs px-1"
                                        title="이 년도 삭제"
                                    >✕</button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            <div className="flex items-center gap-4">
                <button
                    onClick={onAddYear}
                    className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-800 rounded px-3 py-1"
                >
                    + 년도 추가
                </button>
                <span className="text-slate-500 text-xs">
                    총 {years.length}년 계약 · 현재 Y{currentYear + 1} ({startYear + currentYear}–{(startYear + currentYear + 1).toString().slice(2)})
                    · 잔여 {years.length - currentYear}년
                </span>
            </div>

            {/* 루트 salary 동기화 표시 */}
            <div className="mt-3 flex items-center gap-2">
                <span className="text-slate-400 text-xs w-20">루트 salary</span>
                <input
                    type="text"
                    className="w-44 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-white text-sm text-right focus:outline-none focus:border-indigo-500"
                    value={formatSalary(draft.salary)}
                    onChange={e => onSetField('salary', e.target.value.replace(/,/g, ''))}
                />
                <span className="text-slate-500 text-xs">(현재 시즌 Y{currentYear + 1}과 자동 동기화)</span>
            </div>
        </Section>
    );
};

// ── 섹션 래퍼 ──────────────────────────────────────────────────────────────────
const Section: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="mb-6">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-800 pb-1">
            {label}
        </h3>
        {children}
    </div>
);

export default PlayerEditorPage;
