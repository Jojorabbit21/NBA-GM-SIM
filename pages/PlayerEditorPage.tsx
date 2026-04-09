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
            { key: 'lock',        label: '락다운 수비' },
        ],
    },
];

const CO_KEYS = [
    'close','lay','dnk','post','draw','hands',
    'mid','3c','3_45','3t','ft','siq','ocon',
    'pacc','handl','spwb','pvis','piq','obm',
    'idef','pdef','stl','blk','hdef','pper','dcon',
    'oreb','dreb','box',
    'spd','agi','str','vert','sta','hus','dur',
    'intangibles','lock','ovr',
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
    // 편집 중인 base_attributes 전체 (deep copy)
    const [draft, setDraft] = useState<Record<string, any>>({});
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<string | null>(null);
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 검색 — 빈 값이면 전체 목록
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

    // 포커스 시 전체 목록 로드
    const handleFocus = useCallback(async () => {
        if (results.length === 0) {
            try { setResults(await searchPlayers('')); } catch { /* noop */ }
        }
        setShowDropdown(true);
    }, [results.length]);

    // 선수 선택
    const handleSelect = useCallback(async (row: MetaPlayerRow) => {
        const fresh = await fetchPlayerById(row.id);
        if (!fresh) return;
        setSelected(fresh);
        setDraft(JSON.parse(JSON.stringify(fresh.base_attributes)));
        setShowDropdown(false);
        setQuery(row.name);
        setSaveMsg(null);
    }, []);

    // 루트 필드 (스탯 + 메타 포함) 변경
    const setField = useCallback((key: string, raw: string) => {
        const num = Number(raw);
        setDraft(prev => ({ ...prev, [key]: isNaN(num) ? raw : num }));
    }, []);

    // custom_overrides 필드 변경 (빈 값이면 키 제거)
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

    // 저장
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

                    {/* ── 메타 정보 ── */}
                    <Section label="인적 정보 & 계약">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="text-slate-400 text-xs border-b border-slate-700">
                                    <th className="text-left py-1 pr-4 font-normal w-40">필드</th>
                                    <th className="text-left py-1 pr-4 font-normal w-36">값</th>
                                    <th className="text-left py-1 font-normal text-slate-500">비고</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    { key: 'age',           label: '나이',        note: '세' },
                                    { key: 'height',        label: '키',          note: 'cm' },
                                    { key: 'weight',        label: '몸무게',       note: 'kg' },
                                    { key: 'position',      label: '포지션',       note: 'PG/SG/SF/PF/C' },
                                    { key: 'team',          label: '팀',          note: '' },
                                    { key: 'salary',        label: '연봉',         note: '달러' },
                                    { key: 'contractyears', label: '계약 잔여',    note: '년' },
                                    { key: 'potential',     label: 'Potential',   note: '25~99' },
                                    { key: 'archetype',     label: '아키타입',     note: '' },
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

                    {/* ── 능력치 섹션들 ── */}
                    {STAT_SECTIONS.map(section => (
                        <Section key={section.label} label={section.label}>
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="text-slate-400 text-xs border-b border-slate-700">
                                        <th className="text-left py-1 pr-4 font-normal w-44">능력치</th>
                                        <th className="text-left py-1 pr-2 font-normal w-8 text-center text-slate-500">키</th>
                                        <th className="text-center py-1 px-2 font-normal w-24">base</th>
                                        <th className="text-center py-1 px-2 font-normal w-24 text-indigo-400">CO</th>
                                        <th className="text-center py-1 px-2 font-normal w-16 text-slate-500">적용값</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {section.keys.map(({ key, label }) => {
                                        const baseVal = draft[key] as number | undefined;
                                        const coVal   = co[key]   as number | undefined;
                                        const applied = coVal !== undefined ? coVal : baseVal;
                                        return (
                                            <tr key={key} className="border-b border-slate-800 hover:bg-slate-800/30">
                                                <td className="py-1 pr-4 text-slate-300">{label}</td>
                                                <td className="py-1 pr-2 text-center text-slate-500 text-xs font-mono">{key}</td>
                                                {/* base */}
                                                <td className="py-1 px-2">
                                                    <input
                                                        type="number"
                                                        min={0} max={99}
                                                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-center text-white text-sm focus:outline-none focus:border-slate-500"
                                                        value={baseVal ?? ''}
                                                        onChange={e => setField(key, e.target.value)}
                                                    />
                                                </td>
                                                {/* custom_overrides */}
                                                <td className="py-1 px-2">
                                                    <input
                                                        type="number"
                                                        min={0} max={99}
                                                        placeholder="—"
                                                        className="w-full bg-slate-900 border border-indigo-800/50 rounded px-2 py-0.5 text-center text-indigo-300 text-sm focus:outline-none focus:border-indigo-500 placeholder-slate-600"
                                                        value={coVal ?? ''}
                                                        onChange={e => setCoField(key, e.target.value)}
                                                    />
                                                </td>
                                                {/* 적용값 (읽기 전용) */}
                                                <td className={`py-1 px-2 text-center font-mono text-sm font-bold ${getColor(applied)}`}>
                                                    {applied ?? '—'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </Section>
                    ))}

                    {/* ── custom_overrides 전용 키 (ovr, lock 등 위 섹션에 없는 것) ── */}
                    <Section label="custom_overrides 전용 키">
                        <p className="text-slate-500 text-xs mb-2">base_attributes에는 없고 custom_overrides에만 있는 키 (전성기 OVR 고정 등)</p>
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="text-slate-400 text-xs border-b border-slate-700">
                                    <th className="text-left py-1 pr-4 font-normal w-32">키</th>
                                    <th className="text-left py-1 font-normal w-24 text-indigo-400">CO 값</th>
                                </tr>
                            </thead>
                            <tbody>
                                {['ovr'].map(key => (
                                    <tr key={key} className="border-b border-slate-800 hover:bg-slate-800/30">
                                        <td className="py-1 pr-4 text-slate-300 font-mono text-xs">{key}</td>
                                        <td className="py-1">
                                            <input
                                                type="number"
                                                min={0} max={99}
                                                placeholder="—"
                                                className="w-24 bg-slate-900 border border-indigo-800/50 rounded px-2 py-0.5 text-center text-indigo-300 text-sm focus:outline-none focus:border-indigo-500 placeholder-slate-600"
                                                value={co['ovr'] ?? ''}
                                                onChange={e => setCoField('ovr', e.target.value)}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Section>

                    {/* 저장 버튼 (하단 고정) */}
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
