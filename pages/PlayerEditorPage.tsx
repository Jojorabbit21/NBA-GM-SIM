import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchPlayers, fetchPlayerById, updateBaseAttributes, updateIncludeAlltime, insertEditLog, fetchEditLog, EditLogEntry, MetaPlayerRow } from '../services/admin/playerAdminService';
import { resolveTeamId } from '../utils/constants';
import { getLocalPopularityLabel, getNationalPopularityLabel } from '../services/playerPopularity';

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

// 인기도 드롭다운 옵션 (0~100, 10단위)
const POPULARITY_OPTIONS: { value: number; label: string }[] = [
    { value: 0,   label: '0 — 신인 수준' },
    { value: 10,  label: '10 — 거의 알려지지 않음' },
    { value: 20,  label: '20 — 인지도 형성 중' },
    { value: 30,  label: '30 — 팀 팬에게 알려짐' },
    { value: 40,  label: '40 — 어느 정도 인지됨' },
    { value: 50,  label: '50 — 팬들에게 알려짐' },
    { value: 60,  label: '60 — 팬들에게 사랑받음' },
    { value: 70,  label: '70 — 연고지 인기 선수' },
    { value: 80,  label: '80 — 홈팀 스타' },
    { value: 90,  label: '90 — 팀 아이콘' },
    { value: 100, label: '100 — 전설적 인기' },
];
const NATIONAL_POPULARITY_OPTIONS: { value: number; label: string }[] = [
    { value: 0,   label: '0 — 완전 무명' },
    { value: 10,  label: '10 — 거의 무명' },
    { value: 20,  label: '20 — 인지도 낮음' },
    { value: 30,  label: '30 — 일부에게 알려짐' },
    { value: 40,  label: '40 — 팬층 있음' },
    { value: 50,  label: '50 — 어느 정도 알려짐' },
    { value: 60,  label: '60 — 인기 선수' },
    { value: 70,  label: '70 — 적당히 유명함' },
    { value: 80,  label: '80 — 전국적으로 유명함' },
    { value: 90,  label: '90 — 슈퍼스타' },
    { value: 100, label: '100 — 글로벌 아이콘' },
];

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
    const [includeAlltime, setIncludeAlltimeState] = useState<boolean>(true);
    const [alltimeToggling, setAlltimeToggling] = useState(false);
    // 테이블 필터/페이지네이션
    const [filterTeam, setFilterTeam] = useState<string>('all');     // 'all'|'fa'|'rookie'|팀슬러그
    const [filterPos, setFilterPos] = useState<string>('all');       // 'all'|'PG'|'SG'|'SF'|'PF'|'C'
    const [filterAlltime, setFilterAlltime] = useState<string>('all'); // 'all'|'alltime_only'|'current_only'
    const [tablePage, setTablePage] = useState(0);
    const originalAttrsRef = useRef<Record<string, any>>({});
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 초기 진입 시 전체 목록 자동 로드
    useEffect(() => {
        if (isAdmin) {
            searchPlayers('').then(setResults).catch(() => {});
        }
    }, [isAdmin]);

    const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setQuery(v);
        setTablePage(0);
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

    // 테이블 필터 적용
    // draft_year = 2026 (numeric) 인 선수만 드래프트 클래스(신인)로 간주
    // 다른 연도(2010, 2013 등)는 실제 입단 연도이므로 신인 아님
    // 팀 기준: base_team_id (top-level 컬럼) — 시뮬레이터와 동일한 소스
    const DRAFT_CLASS_YEAR = 2026;
    const TABLE_PAGE_SIZE = 10;
    const filteredResults = useMemo(() => {
        return results.filter(r => {
            const isDraftClass = r.draft_year === DRAFT_CLASS_YEAR;
            // base_team_id를 resolveTeamId로 정규화 (시뮬레이터와 동일 경로)
            const rawTeam = (r.base_team_id ?? '').trim();
            const teamSlug = rawTeam ? resolveTeamId(rawTeam) : '';
            const isFa = !isDraftClass && (!rawTeam || teamSlug === 'unknown');

            if (filterTeam === 'fa') {
                if (!isFa) return false;
            } else if (filterTeam === 'rookie') {
                if (!isDraftClass) return false;
            } else if (filterTeam !== 'all') {
                if (isDraftClass || teamSlug !== filterTeam) return false;
            }

            if (filterPos !== 'all' && (r.position ?? r.base_attributes?.position) !== filterPos) return false;

            if (filterAlltime === 'alltime_only' && !r.include_alltime) return false;
            if (filterAlltime === 'current_only' && r.include_alltime) return false;

            return true;
        });
    }, [results, filterTeam, filterPos, filterAlltime]);

    const tablePageCount = Math.max(1, Math.ceil(filteredResults.length / TABLE_PAGE_SIZE));
    const tableRows = filteredResults.slice(tablePage * TABLE_PAGE_SIZE, (tablePage + 1) * TABLE_PAGE_SIZE);

    const handleFilterTeam    = useCallback((v: string) => { setFilterTeam(v);    setTablePage(0); }, []);
    const handleFilterPos     = useCallback((v: string) => { setFilterPos(v);     setTablePage(0); }, []);
    const handleFilterAlltime = useCallback((v: string) => { setFilterAlltime(v); setTablePage(0); }, []);

    const handleSelect = useCallback(async (row: MetaPlayerRow) => {
        const [fresh, log] = await Promise.all([
            fetchPlayerById(row.id),
            fetchEditLog(row.id).catch(() => [] as EditLogEntry[]),
        ]);
        if (!fresh) return;
        setSelected(fresh);
        setIncludeAlltimeState(fresh.include_alltime ?? true);
        const attrs = JSON.parse(JSON.stringify(fresh.base_attributes));
        if (attrs.team) {
            const slug = resolveTeamId(attrs.team);
            attrs.team = slug !== 'unknown' ? slug : '';
        }
        // base_attributes에 position/name이 없는 구형 선수는 테이블 컬럼 값으로 보완
        if (!attrs.position && fresh.position) attrs.position = fresh.position;
        if (!attrs.name && fresh.name) attrs.name = fresh.name;
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

    const clearSectionCo = useCallback((keys: string[]) => {
        setDraft(prev => {
            const co: Record<string, any> = { ...(prev.custom_overrides ?? {}) };
            keys.forEach(k => delete co[k]);
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

    const handleIncludeAlltimeToggle = useCallback(async (newVal: boolean) => {
        if (!selected) return;
        setAlltimeToggling(true);
        try {
            await updateIncludeAlltime(selected.id, newVal);
            setIncludeAlltimeState(newVal);
        } catch (e: any) {
            setSaveMsg(`✗ 드래프트 풀 설정 실패: ${e.message}`);
        } finally {
            setAlltimeToggling(false);
        }
    }, [selected]);

    if (!isAdmin) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
                관리자 계정으로 로그인하세요.
            </div>
        );
    }

    const co: Record<string, any> = draft.custom_overrides ?? {};

    const renderStatSection = (section: typeof STAT_SECTIONS[0]) => {
        const sectionKeys = section.keys.map(k => k.key);
        const hasSectionCo = sectionKeys.some(k => co[k] !== undefined);
        return (
        <Section key={section.label} label={section.label}>
            <table className="w-full text-sm border-collapse">
                <thead>
                    <tr className="text-slate-400 text-xs border-b border-slate-700">
                        <th className="text-left py-1 pr-3 font-normal">능력치</th>
                        <th className="text-center py-1 pr-2 font-normal text-slate-500 w-10">키</th>
                        <th className="text-center py-1 px-1 font-normal w-16">base</th>
                        <th className="text-center py-1 px-1 font-normal w-16">
                            <span className="flex items-center justify-center gap-1">
                                CO
                                {hasSectionCo && (
                                    <button
                                        onClick={() => clearSectionCo(sectionKeys)}
                                        className="text-[9px] text-slate-500 hover:text-red-400 border border-slate-700 hover:border-red-800 rounded px-1 leading-4 transition-colors"
                                        title="이 섹션 CO 값 전체 초기화"
                                    >
                                        ✕
                                    </button>
                                )}
                            </span>
                        </th>
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
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 pretendard p-4 md:p-6">
            {/* 헤더 */}
            <div className="flex items-center gap-4 mb-6">
                <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white text-sm">
                    ← 뒤로
                </button>
                <h1 className="text-lg font-bold text-white">선수 능력치 편집기</h1>
            </div>

            {/* 검색 + 테이블 */}
            <div className="mb-6">
                {/* 검색 인풋 */}
                <div className="relative mb-3 max-w-sm">
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

                {/* 필터 + 테이블 */}
                {results.length > 0 && (
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        {/* 필터 바 */}
                        <div className="flex items-center gap-3 px-3 py-1.5 border-b border-slate-800 flex-wrap">
                            <span className="text-xs text-slate-500 shrink-0">필터</span>
                            {/* 팀 필터 */}
                            <select
                                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                                value={filterTeam}
                                onChange={e => handleFilterTeam(e.target.value)}
                            >
                                <option value="all">전체 팀</option>
                                <option value="fa">FA</option>
                                <option value="rookie">신인(드래프트)</option>
                                {TEAM_OPTIONS.filter(t => t.id !== '').map(t => (
                                    <option key={t.id} value={t.id}>{t.label}</option>
                                ))}
                            </select>
                            {/* 포지션 필터 */}
                            <select
                                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                                value={filterPos}
                                onChange={e => handleFilterPos(e.target.value)}
                            >
                                <option value="all">전체 포지션</option>
                                {POSITION_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            {/* 올타임 풀 필터 */}
                            <select
                                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                                value={filterAlltime}
                                onChange={e => handleFilterAlltime(e.target.value)}
                            >
                                <option value="all">전체 풀</option>
                                <option value="alltime_only">올타임 포함만</option>
                                <option value="current_only">올타임 제외만</option>
                            </select>
                            <span className="ml-auto text-xs text-slate-500">
                                {filteredResults.length}명
                            </span>
                        </div>

                        {/* 선수 테이블 */}
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-slate-500 border-b border-slate-800 bg-slate-950/50">
                                    <th className="text-left px-3 py-1 font-normal">이름</th>
                                    <th className="text-center px-2 py-1 font-normal w-10">포지션</th>
                                    <th className="text-center px-2 py-1 font-normal w-16">팀</th>
                                    <th className="text-center px-2 py-1 font-normal w-10">나이</th>
                                    <th className="text-center px-2 py-1 font-normal w-12">OVR</th>
                                    <th className="text-center px-2 py-1 font-normal w-16">올타임</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tableRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="text-center py-6 text-slate-600">검색 결과 없음</td>
                                    </tr>
                                ) : tableRows.map(r => {
                                    const isSelected = selected?.id === r.id;
                                    const rawTeamVal = (r.base_team_id ?? '').trim();
                                    const isDraft = r.draft_year === DRAFT_CLASS_YEAR;
                                    const draftYear = r.draft_year;
                                    const teamSlugVal = rawTeamVal ? resolveTeamId(rawTeamVal) : '';
                                    const isFaRow = !isDraft && (!rawTeamVal || teamSlugVal === 'unknown');
                                    const teamLabel = isDraft
                                        ? `신인 '${draftYear}`
                                        : isFaRow
                                            ? 'FA'
                                            : (TEAM_OPTIONS.find(t => t.id === teamSlugVal)?.label.split(' · ')[0] ?? teamSlugVal.toUpperCase());
                                    return (
                                        <tr
                                            key={r.id}
                                            onClick={() => handleSelect(r)}
                                            className={`border-b border-slate-800 cursor-pointer transition-colors ${
                                                isSelected
                                                    ? 'bg-indigo-900/40 hover:bg-indigo-900/50'
                                                    : 'hover:bg-slate-800/60'
                                            }`}
                                        >
                                            <td className="px-3 py-0.5 text-white font-medium">{r.name}</td>
                                            <td className="px-2 py-0.5 text-center text-slate-400">{r.position}</td>
                                            <td className="px-2 py-0.5 text-center">
                                                <span className={`px-1 py-px rounded text-[10px] ${
                                                    isDraft
                                                        ? 'bg-amber-900/40 text-amber-400'
                                                        : isFaRow
                                                            ? 'bg-slate-800/50 text-slate-500'
                                                            : 'bg-slate-800 text-slate-300'
                                                }`}>
                                                    {teamLabel}
                                                </span>
                                            </td>
                                            <td className="px-2 py-0.5 text-center text-slate-400">{r.base_attributes?.age ?? '—'}</td>
                                            <td className="px-2 py-0.5 text-center font-bold text-white">{r.base_attributes?.ovr ?? '—'}</td>
                                            <td className="px-2 py-0.5 text-center">
                                                <span className={`text-[10px] ${r.include_alltime ? 'text-indigo-400' : 'text-slate-600'}`}>
                                                    {r.include_alltime ? '포함' : '제외'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {/* 페이지네이션 */}
                        {tablePageCount > 1 && (
                            <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-800">
                                <button
                                    disabled={tablePage === 0}
                                    onClick={() => setTablePage(p => p - 1)}
                                    className="px-3 py-1 text-xs text-slate-400 hover:text-white disabled:opacity-30 border border-slate-700 rounded hover:border-slate-500 transition-colors"
                                >
                                    ← 이전
                                </button>
                                <div className="flex items-center gap-1">
                                    {Array.from({ length: tablePageCount }, (_, i) => {
                                        if (tablePageCount <= 7 || Math.abs(i - tablePage) <= 2 || i === 0 || i === tablePageCount - 1) {
                                            return (
                                                <button
                                                    key={i}
                                                    onClick={() => setTablePage(i)}
                                                    className={`w-7 h-7 text-xs rounded transition-colors ${
                                                        i === tablePage
                                                            ? 'bg-indigo-600 text-white'
                                                            : 'text-slate-400 hover:text-white hover:bg-slate-700'
                                                    }`}
                                                >
                                                    {i + 1}
                                                </button>
                                            );
                                        }
                                        if (Math.abs(i - tablePage) === 3) {
                                            return <span key={i} className="text-slate-600 text-xs px-0.5">…</span>;
                                        }
                                        return null;
                                    })}
                                </div>
                                <button
                                    disabled={tablePage === tablePageCount - 1}
                                    onClick={() => setTablePage(p => p + 1)}
                                    className="px-3 py-1 text-xs text-slate-400 hover:text-white disabled:opacity-30 border border-slate-700 rounded hover:border-slate-500 transition-colors"
                                >
                                    다음 →
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {!selected && results.length === 0 && <p className="text-slate-500 text-sm">선수를 검색해서 선택하세요.</p>}

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

                    {/* ── 인적 정보 — base / CO ── */}
                    <Section label="인적 정보">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="text-slate-400 text-xs border-b border-slate-700">
                                    <th className="text-left py-1 pr-3 font-normal">필드</th>
                                    <th className="text-center py-1 pr-2 font-normal text-slate-500 w-10">키</th>
                                    <th className="text-center py-1 px-1 font-normal w-28">base</th>
                                    <th className="text-center py-1 px-1 font-normal w-28">CO</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* 숫자 필드 */}
                                {([
                                    { key: 'age',    label: '나이' },
                                    { key: 'num',    label: '등번호' },
                                    { key: 'height', label: '키 (cm)' },
                                    { key: 'weight', label: '몸무게 (kg)' },
                                ] as const).map(({ key, label }) => (
                                    <tr key={key} className="border-b border-slate-800 hover:bg-slate-800/30">
                                        <td className="py-1 pr-3 text-slate-300 text-xs">{label}</td>
                                        <td className="py-1 pr-2 text-center text-slate-500 text-xs font-mono">{key}</td>
                                        <td className="py-1 px-1">
                                            <input
                                                type="number"
                                                className="w-full bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-center text-white text-xs focus:outline-none focus:border-slate-500"
                                                value={draft[key] ?? ''}
                                                onChange={e => setField(key, e.target.value)}
                                            />
                                        </td>
                                        <td className="py-1 px-1">
                                            <input
                                                type="number"
                                                placeholder="—"
                                                className="w-full bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-center text-white text-xs focus:outline-none focus:border-slate-500 placeholder-slate-600"
                                                value={co[key] ?? ''}
                                                onChange={e => setCoField(key, e.target.value)}
                                            />
                                        </td>
                                    </tr>
                                ))}
                                {/* 포지션 */}
                                <tr className="border-b border-slate-800 hover:bg-slate-800/30">
                                    <td className="py-1 pr-3 text-slate-300 text-xs">포지션</td>
                                    <td className="py-1 pr-2 text-center text-slate-500 text-xs font-mono">position</td>
                                    <td className="py-1 px-1">
                                        <select
                                            className="w-full bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-white text-xs focus:outline-none focus:border-slate-500"
                                            value={draft.position ?? ''}
                                            onChange={e => setField('position', e.target.value)}
                                        >
                                            <option value="">— 선택 —</option>
                                            {POSITION_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </td>
                                    <td className="py-1 px-1">
                                        <select
                                            className="w-full bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-white text-xs focus:outline-none focus:border-slate-500"
                                            value={co.position ?? ''}
                                            onChange={e => setCoField('position', e.target.value)}
                                        >
                                            <option value="">— (base)</option>
                                            {POSITION_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </td>
                                </tr>
                                {/* 팀 */}
                                <tr className="border-b border-slate-800 hover:bg-slate-800/30">
                                    <td className="py-1 pr-3 text-slate-300 text-xs">팀</td>
                                    <td className="py-1 pr-2 text-center text-slate-500 text-xs font-mono">team</td>
                                    <td className="py-1 px-1">
                                        <select
                                            className="w-full bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-white text-xs focus:outline-none focus:border-slate-500"
                                            value={draft.team ?? ''}
                                            onChange={e => setField('team', e.target.value)}
                                        >
                                            {TEAM_OPTIONS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                        </select>
                                    </td>
                                    <td className="py-1 px-1">
                                        <select
                                            className="w-full bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-white text-xs focus:outline-none focus:border-slate-500"
                                            value={co.team ?? ''}
                                            onChange={e => setCoField('team', e.target.value)}
                                        >
                                            <option value="">— (base)</option>
                                            {TEAM_OPTIONS.filter(t => t.id !== '').map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                        </select>
                                    </td>
                                </tr>
                                {/* ── 인기도 ── */}
                                <tr className="border-b border-slate-700 bg-slate-900/40">
                                    <td colSpan={4} className="py-1.5 px-1 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                                        인기도 (0~100)
                                    </td>
                                </tr>
                                {/* 지역 인기 */}
                                <tr className="border-b border-slate-800 hover:bg-slate-800/30">
                                    <td className="py-1 pr-3 text-slate-300 text-xs">연고지 인기</td>
                                    <td className="py-1 pr-2 text-center text-slate-500 text-xs font-mono">pop.local</td>
                                    <td className="py-1 px-1">
                                        <select
                                            className="w-full bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-white text-xs focus:outline-none focus:border-slate-500"
                                            value={draft.popularity?.local ?? ''}
                                            onChange={e => {
                                                const v = Number(e.target.value);
                                                setDraft(prev => ({ ...prev, popularity: { ...(prev.popularity ?? {}), local: v } }));
                                            }}
                                        >
                                            <option value="">— 미설정 —</option>
                                            {POPULARITY_OPTIONS.map(o => (
                                                <option key={o.value} value={o.value}>{o.label}</option>
                                            ))}
                                        </select>
                                        {draft.popularity?.local !== undefined && (
                                            <div className="text-[9px] text-slate-500 mt-0.5 text-center">
                                                {getLocalPopularityLabel(draft.popularity.local)}
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-1 px-1">
                                        <select
                                            className="w-full bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-white text-xs focus:outline-none focus:border-slate-500"
                                            value={co.popularity?.local ?? ''}
                                            onChange={e => {
                                                const raw = e.target.value;
                                                setDraft(prev => {
                                                    const c: Record<string, any> = { ...(prev.custom_overrides ?? {}) };
                                                    if (raw === '') {
                                                        const pop = { ...(c.popularity ?? {}) };
                                                        delete pop.local;
                                                        if (Object.keys(pop).length === 0) delete c.popularity;
                                                        else c.popularity = pop;
                                                    } else {
                                                        c.popularity = { ...(c.popularity ?? {}), local: Number(raw) };
                                                    }
                                                    return { ...prev, custom_overrides: c };
                                                });
                                            }}
                                        >
                                            <option value="">— (base)</option>
                                            {POPULARITY_OPTIONS.map(o => (
                                                <option key={o.value} value={o.value}>{o.label}</option>
                                            ))}
                                        </select>
                                        {co.popularity?.local !== undefined && (
                                            <div className="text-[9px] text-indigo-400 mt-0.5 text-center">
                                                CO: {getLocalPopularityLabel(co.popularity.local)}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                                {/* 전국 인기 */}
                                <tr className="border-b border-slate-800 hover:bg-slate-800/30">
                                    <td className="py-1 pr-3 text-slate-300 text-xs">전국 인기</td>
                                    <td className="py-1 pr-2 text-center text-slate-500 text-xs font-mono">pop.national</td>
                                    <td className="py-1 px-1">
                                        <select
                                            className="w-full bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-white text-xs focus:outline-none focus:border-slate-500"
                                            value={draft.popularity?.national ?? ''}
                                            onChange={e => {
                                                const v = Number(e.target.value);
                                                setDraft(prev => ({ ...prev, popularity: { ...(prev.popularity ?? {}), national: v } }));
                                            }}
                                        >
                                            <option value="">— 미설정 —</option>
                                            {NATIONAL_POPULARITY_OPTIONS.map(o => (
                                                <option key={o.value} value={o.value}>{o.label}</option>
                                            ))}
                                        </select>
                                        {draft.popularity?.national !== undefined && (
                                            <div className="text-[9px] text-slate-500 mt-0.5 text-center">
                                                {getNationalPopularityLabel(draft.popularity.national)}
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-1 px-1">
                                        <select
                                            className="w-full bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-white text-xs focus:outline-none focus:border-slate-500"
                                            value={co.popularity?.national ?? ''}
                                            onChange={e => {
                                                const raw = e.target.value;
                                                setDraft(prev => {
                                                    const c: Record<string, any> = { ...(prev.custom_overrides ?? {}) };
                                                    if (raw === '') {
                                                        const pop = { ...(c.popularity ?? {}) };
                                                        delete pop.national;
                                                        if (Object.keys(pop).length === 0) delete c.popularity;
                                                        else c.popularity = pop;
                                                    } else {
                                                        c.popularity = { ...(c.popularity ?? {}), national: Number(raw) };
                                                    }
                                                    return { ...prev, custom_overrides: c };
                                                });
                                            }}
                                        >
                                            <option value="">— (base)</option>
                                            {NATIONAL_POPULARITY_OPTIONS.map(o => (
                                                <option key={o.value} value={o.value}>{o.label}</option>
                                            ))}
                                        </select>
                                        {co.popularity?.national !== undefined && (
                                            <div className="text-[9px] text-indigo-400 mt-0.5 text-center">
                                                CO: {getNationalPopularityLabel(co.popularity.national)}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                                {/* ── 드래프트 풀 포함 여부 ── */}
                                <tr className="border-b border-slate-700 bg-slate-900/40">
                                    <td colSpan={4} className="py-1.5 px-1 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                                        드래프트 풀
                                    </td>
                                </tr>
                                <tr className="hover:bg-slate-800/30">
                                    <td className="py-2 pr-3 text-slate-300 text-xs">올타임 드래프트 풀 포함</td>
                                    <td className="py-2 pr-2 text-center text-slate-500 text-xs font-mono">include_alltime</td>
                                    <td colSpan={2} className="py-2 px-1">
                                        <div className="flex items-center gap-3">
                                            <button
                                                disabled={alltimeToggling}
                                                onClick={() => handleIncludeAlltimeToggle(!includeAlltime)}
                                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${includeAlltime ? 'bg-indigo-600' : 'bg-slate-700'}`}
                                            >
                                                <span
                                                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${includeAlltime ? 'translate-x-4' : 'translate-x-0.5'}`}
                                                />
                                            </button>
                                            <span className={`text-xs ${includeAlltime ? 'text-indigo-400' : 'text-slate-500'}`}>
                                                {alltimeToggling ? '저장 중...' : includeAlltime ? '포함 (올타임 풀에 등장)' : '제외 (현역 풀에만 등장)'}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
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
                                startYear={2025 - ((draft.contract?.currentYear) ?? 0)}
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
                                startYear={2025 - ((draft.custom_overrides?.contract?.currentYear) ?? (draft.contract?.currentYear) ?? 0)}
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
