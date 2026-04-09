import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchPlayers, fetchPlayerById, updateBaseAttributes, insertEditLog, fetchEditLog, EditLogEntry, MetaPlayerRow } from '../services/admin/playerAdminService';
import { resolveTeamId } from '../utils/constants';

const ADMIN_USER_ID = 'd2f6a469-9182-4dac-a098-278e6e758c79';

// ── 팀 목록 ──────────────────────────────────────────────────────────────────
const TEAM_OPTIONS = [
    { id: '',    label: '— FA / 없음 —' },
    { id: 'atl', label: 'ATL · 애틀랜타 파이어버즈' },
    { id: 'bos', label: 'BOS · 보스턴 세이지' },
    { id: 'bkn', label: 'BKN · 브루클린 나이츠' },
    { id: 'cha', label: 'CHA · 샬럿 스팅어스' },
    { id: 'chi', label: 'CHI · 시카고 차저스' },
    { id: 'cle', label: 'CLE · 클리블랜드 랜서스' },
    { id: 'dal', label: 'DAL · 댈러스 머스탱스' },
    { id: 'den', label: 'DEN · 덴버 시프터스' },
    { id: 'det', label: 'DET · 디트로이트 스탈리온스' },
    { id: 'gs',  label: 'GS  · 골든스테이트 뱅가즈' },
    { id: 'hou', label: 'HOU · 휴스턴 이글스' },
    { id: 'ind', label: 'IND · 인디애나 레이서스' },
    { id: 'law', label: 'LAW · LA 와일드캣츠' },
    { id: 'lam', label: 'LAM · LA 미라지' },
    { id: 'mem', label: 'MEM · 멤피스 코디악스' },
    { id: 'mia', label: 'MIA · 마이애미 블레이즈' },
    { id: 'mil', label: 'MIL · 밀워키 스태그스' },
    { id: 'min', label: 'MIN · 미네소타 프로스트울브스' },
    { id: 'no',  label: 'NO  · 뉴올리언스 헤론스' },
    { id: 'nyk', label: 'NYK · 뉴욕 엠파이어' },
    { id: 'okc', label: 'OKC · 오클라호마시티 볼트' },
    { id: 'orl', label: 'ORL · 올랜도 미스틱스' },
    { id: 'phi', label: 'PHI · 필라델피아 리버티' },
    { id: 'phx', label: 'PHX · 피닉스 카이요티스' },
    { id: 'por', label: 'POR · 포틀랜드 파이오니어스' },
    { id: 'sac', label: 'SAC · 새크라멘토 모나크스' },
    { id: 'sa',  label: 'SA  · 샌안토니오 아웃로스' },
    { id: 'tor', label: 'TOR · 토론토 노스가드스' },
    { id: 'uta', label: 'UTA · 유타 하이랜더스' },
    { id: 'was', label: 'WAS · 워싱턴 아케인스' },
];

const POSITION_OPTIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

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
            { key: 'potential',   label: 'Potential (잠재력)' },
            { key: 'intangibles', label: '무형 (IQ/리더십/클러치)' },
        ],
    },
];

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
    const [editLog, setEditLog] = useState<EditLogEntry[]>([]);
    const originalAttrsRef = useRef<Record<string, any>>({});
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
        const [fresh, log] = await Promise.all([
            fetchPlayerById(row.id),
            fetchEditLog(row.id).catch(() => [] as EditLogEntry[]),
        ]);
        if (!fresh) return;
        setSelected(fresh);
        const attrs = JSON.parse(JSON.stringify(fresh.base_attributes));
        if (attrs.team) {
            const slug = resolveTeamId(attrs.team);
            attrs.team = slug !== 'unknown' ? slug : '';
        }
        originalAttrsRef.current = JSON.parse(JSON.stringify(attrs));
        setDraft(attrs);
        setEditLog(log);
        setShowDropdown(false);
        setQuery(row.name);
        setSaveMsg(null);
    }, []);

    const setField = useCallback((key: string, raw: string) => {
        const num = Number(raw);
        setDraft(prev => ({ ...prev, [key]: isNaN(num) ? raw : num }));
    }, []);

    // ── base contract ──────────────────────────────────────────────────────
    const setContractYear = useCallback((idx: number, raw: string) => {
        const num = Number(raw.replace(/,/g, ''));
        setDraft(prev => {
            const contract = { ...(prev.contract ?? {}), years: [...(prev.contract?.years ?? [])] };
            contract.years[idx] = isNaN(num) ? 0 : num;
            const cur = contract.currentYear ?? 0;
            return { ...prev, contract, salary: contract.years[cur] ?? prev.salary };
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
            if ((contract.currentYear ?? 0) >= years.length)
                contract.currentYear = Math.max(0, years.length - 1);
            return { ...prev, contract, salary: years[contract.currentYear ?? 0] ?? prev.salary };
        });
    }, []);

    const setContractField = useCallback((key: string, val: any) => {
        setDraft(prev => ({ ...prev, contract: { ...(prev.contract ?? {}), [key]: val } }));
    }, []);

    // ── CO contract ────────────────────────────────────────────────────────
    const initCoContract = useCallback(() => {
        setDraft(prev => ({
            ...prev,
            custom_overrides: {
                ...(prev.custom_overrides ?? {}),
                contract: JSON.parse(JSON.stringify(prev.contract ?? {})),
            },
        }));
    }, []);

    const clearCoContract = useCallback(() => {
        setDraft(prev => {
            const co = { ...(prev.custom_overrides ?? {}) };
            delete co.contract;
            delete co.salary;
            return { ...prev, custom_overrides: co };
        });
    }, []);

    const setCoContractYear = useCallback((idx: number, raw: string) => {
        const num = Number(raw.replace(/,/g, ''));
        setDraft(prev => {
            const coC = { ...(prev.custom_overrides?.contract ?? {}), years: [...(prev.custom_overrides?.contract?.years ?? [])] };
            coC.years[idx] = isNaN(num) ? 0 : num;
            const cur = coC.currentYear ?? 0;
            const coSalary = coC.years[cur];
            return {
                ...prev,
                custom_overrides: {
                    ...(prev.custom_overrides ?? {}),
                    contract: coC,
                    ...(coSalary !== undefined ? { salary: coSalary } : {}),
                },
            };
        });
    }, []);

    const addCoContractYear = useCallback(() => {
        setDraft(prev => {
            const years = [...(prev.custom_overrides?.contract?.years ?? [])];
            years.push(0);
            return {
                ...prev,
                custom_overrides: {
                    ...(prev.custom_overrides ?? {}),
                    contract: { ...(prev.custom_overrides?.contract ?? {}), years },
                },
            };
        });
    }, []);

    const removeCoContractYear = useCallback((idx: number) => {
        setDraft(prev => {
            const years = [...(prev.custom_overrides?.contract?.years ?? [])];
            years.splice(idx, 1);
            const coC = { ...(prev.custom_overrides?.contract ?? {}), years };
            if ((coC.currentYear ?? 0) >= years.length)
                coC.currentYear = Math.max(0, years.length - 1);
            return {
                ...prev,
                custom_overrides: { ...(prev.custom_overrides ?? {}), contract: coC },
            };
        });
    }, []);

    const setCoContractField = useCallback((key: string, val: any) => {
        setDraft(prev => ({
            ...prev,
            custom_overrides: {
                ...(prev.custom_overrides ?? {}),
                contract: { ...(prev.custom_overrides?.contract ?? {}), [key]: val },
            },
        }));
    }, []);

    // ── CO stat 필드 ───────────────────────────────────────────────────────
    const setCoField = useCallback((key: string, raw: string) => {
        setDraft(prev => {
            const co: Record<string, any> = { ...(prev.custom_overrides ?? {}) };
            if (raw === '' || raw === '-') delete co[key];
            else { const num = Number(raw); co[key] = isNaN(num) ? raw : num; }
            return { ...prev, custom_overrides: co };
        });
    }, []);

    const handleSave = useCallback(async () => {
        if (!selected) return;
        setSaving(true);
        setSaveMsg(null);
        try {
            const diff = computeDiff(originalAttrsRef.current, draft);
            await updateBaseAttributes(selected.id, draft);
            if (Object.keys(diff).length > 0) {
                const entry = await insertEditLog(selected.id, selected.name, diff);
                if (entry) setEditLog(prev => [entry, ...prev]);
            }
            originalAttrsRef.current = JSON.parse(JSON.stringify(draft));
            const fresh = await fetchPlayerById(selected.id);
            if (fresh) setSelected(fresh);
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
                        <th className="text-center py-1 px-1 font-normal w-16">CO</th>
                    </tr>
                </thead>
                <tbody>
                    {section.keys.map(({ key, label }) => {
                        const baseVal = draft[key] as number | undefined;
                        const coVal   = co[key]   as number | undefined;
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
                                        className="w-full bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-center text-white text-xs focus:outline-none focus:border-slate-500 placeholder-slate-600"
                                        value={coVal ?? ''}
                                        onChange={e => setCoField(key, e.target.value)}
                                    />
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
                <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white text-sm">
                    ← 뒤로
                </button>
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
                    <div className="absolute top-full left-0 right-0 z-20 bg-slate-800 border border-slate-700 rounded-lg mt-1 overflow-y-auto overscroll-contain shadow-xl" style={{ maxHeight: '224px' }}>
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

            {!selected && <p className="text-slate-500 text-sm">선수를 검색해서 선택하세요.</p>}

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

                    {/* ── 인적 정보 — 풀 너비 ── */}
                    <Section label="인적 정보">
                        <div className="grid grid-cols-3 gap-x-6">
                            {[
                                { key: 'age',    label: '나이',   note: '세' },
                                { key: 'num',    label: '등번호', note: '' },
                                { key: 'height', label: '키',     note: 'cm' },
                                { key: 'weight', label: '몸무게', note: 'kg' },
                            ].map(({ key, label, note }) => (
                                <div key={key} className="flex items-center gap-2 mb-2">
                                    <span className="text-slate-400 text-xs w-14 shrink-0">{label}</span>
                                    <input
                                        className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                                        value={draft[key] ?? ''}
                                        onChange={e => setField(key, e.target.value)}
                                    />
                                    {note && <span className="text-slate-500 text-xs w-6 shrink-0">{note}</span>}
                                </div>
                            ))}
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-slate-400 text-xs w-14 shrink-0">포지션</span>
                                <select
                                    className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                                    value={draft.position ?? ''}
                                    onChange={e => setField('position', e.target.value)}
                                >
                                    <option value="">— 선택 —</option>
                                    {POSITION_OPTIONS.map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center gap-2 mb-2 col-span-2">
                                <span className="text-slate-400 text-xs w-14 shrink-0">팀</span>
                                <select
                                    className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                                    value={draft.team ?? ''}
                                    onChange={e => setField('team', e.target.value)}
                                >
                                    {TEAM_OPTIONS.map(t => (
                                        <option key={t.id} value={t.id}>{t.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </Section>

                    {/* ── 2컬럼 그리드 ── */}
                    <div className="grid grid-cols-2 gap-x-8 items-start">

                        {/* Row 1: Base 계약 | CO 계약 */}
                        <Section label="Base 계약">
                            <ContractForm
                                contract={draft.contract ?? {}}
                                salary={draft.salary}
                                onSetContractYear={setContractYear}
                                onAddYear={addContractYear}
                                onRemoveYear={removeContractYear}
                                onSetContractField={setContractField}
                                onSetSalary={v => setField('salary', v)}
                                startYear={2025}
                            />
                        </Section>
                        <Section label="CO 계약">
                            {draft.custom_overrides?.contract !== undefined && (
                                <div className="flex justify-end mb-2">
                                    <button
                                        onClick={clearCoContract}
                                        className="text-xs text-red-500 hover:text-red-400 border border-red-900 rounded px-2 py-0.5"
                                    >
                                        CO 계약 삭제
                                    </button>
                                </div>
                            )}
                            <ContractForm
                                contract={draft.custom_overrides?.contract ?? {}}
                                salary={draft.custom_overrides?.salary}
                                onSetContractYear={setCoContractYear}
                                onAddYear={addCoContractYear}
                                onRemoveYear={removeCoContractYear}
                                onSetContractField={setCoContractField}
                                onSetSalary={v => setCoField('salary', v)}
                                startYear={2025}
                            />
                        </Section>

                        {/* Row 3: 인사이드 | 아웃사이드 */}
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

                    {/* 편집 이력 */}
                    <div className="mt-10 border-t border-slate-800 pt-6">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">편집 이력</h3>
                        {editLog.length === 0 ? (
                            <p className="text-slate-600 text-xs">저장된 편집 이력이 없습니다.</p>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {editLog.map(entry => (
                                    <div key={entry.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                                        <div className="text-xs text-slate-500 mb-2">
                                            {new Date(entry.edited_at).toLocaleString('ko-KR')}
                                        </div>
                                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                                            {Object.entries(entry.changes).map(([key, { before, after }]) => (
                                                <span key={key} className="text-xs font-mono">
                                                    <span className="text-slate-400">{key}</span>
                                                    {' '}
                                                    <span className="text-red-400">{JSON.stringify(before) ?? '없음'}</span>
                                                    <span className="text-slate-600"> → </span>
                                                    <span className="text-emerald-400">{JSON.stringify(after) ?? '없음'}</span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

function computeDiff(
    before: Record<string, any>,
    after: Record<string, any>
): Record<string, { before: any; after: any }> {
    const changes: Record<string, { before: any; after: any }> = {};
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of allKeys) {
        if (key === 'custom_overrides') continue;
        if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
            changes[key] = { before: before[key], after: after[key] };
        }
    }
    const bco: Record<string, any> = before.custom_overrides ?? {};
    const aco: Record<string, any> = after.custom_overrides ?? {};
    const coKeys = new Set([...Object.keys(bco), ...Object.keys(aco)]);
    for (const k of coKeys) {
        if (JSON.stringify(bco[k]) !== JSON.stringify(aco[k])) {
            changes[`co.${k}`] = { before: bco[k], after: aco[k] };
        }
    }
    return changes;
}

function formatSalary(n: number | undefined): string {
    if (n === undefined || n === null || isNaN(n)) return '';
    return n.toLocaleString('en-US');
}

// ── 계약 폼 (Base / CO 공용) ───────────────────────────────────────────────────
interface ContractFormProps {
    contract: Record<string, any>;
    salary: number | undefined;
    onSetContractYear: (idx: number, val: string) => void;
    onAddYear: () => void;
    onRemoveYear: (idx: number) => void;
    onSetContractField: (key: string, val: any) => void;
    onSetSalary: (val: string) => void;
    startYear: number;
}

const ContractForm: React.FC<ContractFormProps> = ({
    contract, salary,
    onSetContractYear, onAddYear, onRemoveYear, onSetContractField, onSetSalary,
    startYear,
}) => {
    const years: number[] = contract.years ?? [];
    const currentYear: number = contract.currentYear ?? 0;
    const contractType: string = contract.type ?? 'veteran';
    const noTrade: boolean = !!contract.noTrade;
    const option = contract.option ?? null;

    return (
        <>
            {/* 계약 타입 + 현재 시즌 + NTC */}
            <div className="flex flex-wrap gap-3 mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-xs w-20">계약 타입</span>
                    <select
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-white text-xs focus:outline-none focus:border-indigo-500"
                        value={contractType}
                        onChange={e => onSetContractField('type', e.target.value)}
                    >
                        {['veteran','rookie','max','extension','min','two-way','10-day'].map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-xs">현재 시즌</span>
                    <input
                        type="number" min={0} max={Math.max(0, years.length - 1)}
                        className="w-12 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-white text-xs text-center focus:outline-none focus:border-indigo-500"
                        value={currentYear}
                        onChange={e => onSetContractField('currentYear', Number(e.target.value))}
                    />
                    <span className="text-slate-600 text-xs">(0부터)</span>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                        type="checkbox" checked={noTrade}
                        onChange={e => onSetContractField('noTrade', e.target.checked ? true : undefined)}
                        className="accent-indigo-500"
                    />
                    <span className="text-slate-300 text-xs">NTC</span>
                </label>
            </div>

            {/* 옵션 */}
            <div className="flex flex-wrap gap-3 mb-3">
                <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-xs w-20">옵션</span>
                    <select
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-white text-xs focus:outline-none focus:border-indigo-500"
                        value={option?.type ?? 'none'}
                        onChange={e => {
                            const v = e.target.value;
                            onSetContractField('option', v === 'none' ? undefined : { ...option, type: v });
                        }}
                    >
                        <option value="none">없음</option>
                        <option value="player">Player Option</option>
                        <option value="team">Team Option</option>
                    </select>
                </div>
                {option && (
                    <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-xs">옵션 년도</span>
                        <input
                            type="number" min={0} max={Math.max(0, years.length - 1)}
                            className="w-12 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-white text-xs text-center focus:outline-none focus:border-indigo-500"
                            value={option.year ?? 0}
                            onChange={e => onSetContractField('option', { ...option, year: Number(e.target.value) })}
                        />
                        <span className="text-slate-600 text-xs">(인덱스)</span>
                    </div>
                )}
            </div>

            {/* 년도별 연봉 */}
            <table className="w-full text-sm border-collapse mb-2">
                <thead>
                    <tr className="text-slate-400 text-xs border-b border-slate-700">
                        <th className="text-left py-1 pr-3 font-normal w-10">Y</th>
                        <th className="text-left py-1 pr-3 font-normal w-20">시즌</th>
                        <th className="text-left py-1 pr-3 font-normal">연봉</th>
                        <th className="text-left py-1 font-normal w-16 text-slate-500">$M</th>
                        <th className="py-1 w-6"></th>
                    </tr>
                </thead>
                <tbody>
                    {years.map((sal, idx) => {
                        const isCurrent = idx === currentYear;
                        const isOpt = option && option.year === idx;
                        return (
                            <tr key={idx} className={`border-b border-slate-800 ${isCurrent ? 'bg-indigo-950/40' : 'hover:bg-slate-800/30'}`}>
                                <td className="py-1 pr-3">
                                    <span className={`font-mono text-xs ${isCurrent ? 'text-indigo-300 font-bold' : 'text-slate-400'}`}>
                                        Y{idx + 1}{isCurrent && <span className="ml-0.5 text-indigo-400">●</span>}
                                    </span>
                                </td>
                                <td className="py-1 pr-3 text-slate-400 text-xs">
                                    {startYear + idx}–{(startYear + idx + 1).toString().slice(2)}
                                    {isOpt && <span className="ml-1 text-amber-400 text-[10px]">[{option.type === 'player' ? 'PO' : 'TO'}]</span>}
                                </td>
                                <td className="py-1 pr-3">
                                    <input
                                        type="text"
                                        className={`w-full bg-slate-800 border rounded px-2 py-0.5 text-xs text-right focus:outline-none ${
                                            isCurrent ? 'border-indigo-600 text-indigo-200 focus:border-indigo-400' : 'border-slate-700 text-white focus:border-slate-500'
                                        }`}
                                        value={formatSalary(sal)}
                                        onChange={e => onSetContractYear(idx, e.target.value)}
                                    />
                                </td>
                                <td className="py-1 pr-3 text-slate-500 text-xs font-mono">
                                    {sal ? `$${(sal / 1_000_000).toFixed(1)}M` : '—'}
                                </td>
                                <td className="py-1 text-center">
                                    <button onClick={() => onRemoveYear(idx)} className="text-slate-600 hover:text-red-400 text-xs px-1" title="삭제">✕</button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            <div className="flex items-center gap-4 mb-3">
                <button onClick={onAddYear} className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-800 rounded px-2 py-0.5">
                    + 년도 추가
                </button>
                <span className="text-slate-500 text-xs">
                    총 {years.length}년 · 잔여 {years.length - currentYear}년
                </span>
            </div>

            {/* 루트 salary */}
            <div className="flex items-center gap-2">
                <span className="text-slate-400 text-xs w-20">salary (루트)</span>
                <input
                    type="text"
                    className="w-36 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-white text-xs text-right focus:outline-none focus:border-indigo-500"
                    value={formatSalary(salary)}
                    onChange={e => onSetSalary(e.target.value.replace(/,/g, ''))}
                />
                <span className="text-slate-600 text-xs">(현재 Y{currentYear + 1}과 자동 동기화)</span>
            </div>
        </>
    );
};

// ── 섹션 래퍼 ──────────────────────────────────────────────────────────────────
const Section: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
    <div className={`mb-6 ${className ?? ''}`}>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 border-b border-slate-800 pb-1">
            {label}
        </h3>
        {children}
    </div>
);

export default PlayerEditorPage;
