import React, { useState, useCallback, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
    fetchArchetypeConfig, saveArchetypeConfig,
    fetchTagConfig, saveTagConfig,
    invalidateArchetypeCache, invalidateTagCache,
} from '../services/admin/gameConfigService';
import type {
    ArchetypeGateConfig, ArchetypeGate,
    ArchetypeWeightConfig, ArchetypeWeights,
    ArchetypeLabelConfig, ArchetypePositionConfig,
    TagConfigList, TagConfigEntry, TagConditionExpr, TagClause,
} from '../types/gameConfig';
import type { ArchetypeModuleScores } from '../types/archetype';

const ADMIN_USER_ID = 'd2f6a469-9182-4dac-a098-278e6e758c79';

type EditorContext = { userId?: string };

const DEFAULT_LABELS: ArchetypeLabelConfig = {
    PRIMARY_CREATOR_GUARD: 'Primary Creator',  SCORING_COMBO_GUARD: 'Dual Guard',
    MOVEMENT_SHOOTER: 'Outside Shooter',       PERIMETER_3D: 'Perimeter 3&D',
    TWO_WAY_WING: 'Two-Way Wing',              SLASHING_WING: 'Slashing Wing',
    SHOT_CREATOR_WING: 'Shot Creator',         CONNECTOR_FORWARD: 'Connector Fwd',
    AERIAL_WING: 'Aerial Wing',                POST_SCORING_WING: 'Post Scoring W',
    WING_PROTECTOR: 'Wing Protector',          POST_SCORING_BIG: 'Post Scoring B',
    RIM_RUNNER_BIG: 'Rim Runner',              STRETCH_BIG: 'Stretch Big',
    RIM_PROTECTOR_ANCHOR: 'Rim Protector',     PLAYMAKING_BIG: 'Playmaking Big',
    FLOOR_GENERAL_GUARD: 'Floor General',      SCORING_POINT_GUARD: 'Pure Scorer',
    DEFENSIVE_GUARD: 'Defensive Guard',        THREE_LEVEL_SCORER: '3-Level Scorer',
    LOCKDOWN_WING: 'Lockdown Wing',            SWITCHABLE_ANCHOR: 'Switchable Anc',
    TWO_WAY_BIG: 'Two-Way Big',                REBOUNDING_BIG: 'Rebounding Big',
    ISOLATION_SCORER: 'Midrange Menace',       ELBOW_OPERATOR: 'Elbow Operator',
    ELITE_GUARD: 'Elite Guard',                LOCKDOWN_SHOOTER: 'Lockdown Shot',
};

const ALL_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
type Position = typeof ALL_POSITIONS[number];
const POS_WEIGHT: Record<string, number> = { PG: 1, SG: 2, SF: 3, PF: 4, C: 5 };

function posGravity(positions: string[]): number {
    if (positions.length === 0) return 99;
    return positions.reduce((s, p) => s + (POS_WEIGHT[p] ?? 3), 0) / positions.length;
}

// 포지션 열 너비 (px) — sticky left 누적 계산에 사용
const POS_COL_W = 32;
const NAME_COL_LEFT = ALL_POSITIONS.length * POS_COL_W; // 160px
const NAME_COL_W = 148;

const ALL_MODULES: (keyof ArchetypeModuleScores)[] = [
    'shotCreation', 'playmaking', 'spotUpShooting', 'postCraft', 'rimFinishing',
    'poaDefense', 'teamDefense', 'rimProtection', 'rebounding', 'offballAttack', 'motorAvailability',
];

const MODULE_SHORT: Record<string, string> = {
    shotCreation:     '슛 생성',
    playmaking:       '플레이메이킹',
    spotUpShooting:   '스팟업',
    postCraft:        '포스트',
    rimFinishing:     '림 피니시',
    poaDefense:       '온볼 수비',
    teamDefense:      '팀 수비',
    rimProtection:    '림 보호',
    rebounding:       '리바운드',
    offballAttack:    '오프볼',
    motorAvailability: '체력',
};

function labelToKey(label: string): string {
    return label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

const INPUT_CLS = 'w-full bg-transparent rounded px-1 py-0.5 text-[11px] text-center text-slate-300 focus:outline-none focus:bg-slate-800/60 placeholder-slate-700 transition-colors';
const CHECKBOX_STYLE: React.CSSProperties = { colorScheme: 'dark' };
const TH_CLS = 'py-3 px-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center whitespace-nowrap';
const TD_CLS = 'py-1.5 px-1 text-center';
const ROW_CLS = 'hover:bg-white/[0.025] transition-colors';
const STICKY_BG = 'bg-[#0a0c12]';

// ─── TagConfigPanel ───────────────────────────────────────────────────────────

const ALL_MODULES_KEYS = [
    'rimFinishing','postCraft','spotUpShooting','shotCreation','playmaking',
    'offballAttack','poaDefense','teamDefense','rimProtection','rebounding','motorAvailability',
];
const ALL_RATING_KEYS = [
    'drawFoul','durability','stamina','offConsist','defConsist',
    'speed','strength','vertical','agility','intangibles','hustle',
];
const TAILWIND_COLORS = [
    'slate','gray','zinc','stone','red','orange','amber','yellow',
    'lime','green','emerald','teal','cyan','sky','blue','indigo',
    'violet','purple','fuchsia','pink','rose',
];

function clauseLabel(c: TagClause): string {
    return `${c.fieldType === 'module' ? 'mod' : 'rat'}.${c.field} ${c.op} ${c.value}`;
}
function conditionSummary(cond: TagConditionExpr): string {
    if (cond.type === 'single')   return clauseLabel(cond.clause);
    if (cond.type === 'all_of')   return cond.clauses.map(clauseLabel).join(' AND ');
    if (cond.type === 'or_first') return `(${cond.orClauses.map(clauseLabel).join(' OR ')}) AND ${cond.andClauses.map(clauseLabel).join(' AND ')}`;
    return '—';
}

function makeDefaultClause(): TagClause {
    return { fieldType: 'module', field: 'rimFinishing', op: '>=', value: 85 };
}

function switchConditionType(cond: TagConditionExpr, newType: TagConditionExpr['type']): TagConditionExpr {
    if (newType === 'single') {
        const clause = cond.type === 'single' ? cond.clause : cond.type === 'all_of' ? cond.clauses[0] : cond.orClauses[0];
        return { type: 'single', clause: clause ?? makeDefaultClause() };
    }
    if (newType === 'all_of') {
        const clauses = cond.type === 'single' ? [cond.clause] : cond.type === 'all_of' ? cond.clauses : [...cond.orClauses, ...cond.andClauses];
        return { type: 'all_of', clauses: clauses.length > 0 ? clauses : [makeDefaultClause()] };
    }
    // or_first
    const all = cond.type === 'single' ? [cond.clause] : cond.type === 'all_of' ? cond.clauses : [...cond.orClauses, ...cond.andClauses];
    return { type: 'or_first', orClauses: all.slice(0, 1).length ? all.slice(0, 1) : [makeDefaultClause()], andClauses: all.slice(1) };
}

const SEL_CLS = 'bg-slate-900 border border-slate-700 rounded text-[11px] text-slate-300 focus:outline-none focus:border-violet-400 px-1 py-0.5';
const INP_CLS = 'bg-transparent border-b border-slate-700 text-[11px] text-slate-200 focus:outline-none focus:border-violet-400 py-0.5';

// ─── ClauseEditor ─────────────────────────────────────────────────────────────

const ClauseEditor: React.FC<{
    clause: TagClause;
    onChange: (c: TagClause) => void;
    onRemove?: () => void;
}> = ({ clause, onChange, onRemove }) => (
    <div className="flex items-center gap-2 flex-wrap">
        <select
            value={clause.fieldType}
            onChange={e => onChange({ ...clause, fieldType: e.target.value as any, field: e.target.value === 'module' ? ALL_MODULES_KEYS[0] : ALL_RATING_KEYS[0] })}
            className={SEL_CLS}
        >
            <option value="module">모듈</option>
            <option value="rating">레이팅</option>
        </select>
        <select value={clause.field} onChange={e => onChange({ ...clause, field: e.target.value })} className={SEL_CLS}>
            {(clause.fieldType === 'module' ? ALL_MODULES_KEYS : ALL_RATING_KEYS).map(k => (
                <option key={k} value={k}>{k}</option>
            ))}
        </select>
        <select value={clause.op} onChange={e => onChange({ ...clause, op: e.target.value as any })} className={SEL_CLS}>
            <option value=">=">≥</option>
            <option value="<=">≤</option>
        </select>
        <input
            type="number" value={clause.value}
            onChange={e => onChange({ ...clause, value: Number(e.target.value) })}
            className={`${INP_CLS} w-14 text-center`}
        />
        {onRemove && (
            <button onClick={onRemove} className="text-slate-500 hover:text-red-400 text-xs transition-colors leading-none">✕</button>
        )}
    </div>
);

// ─── ConditionEditor ──────────────────────────────────────────────────────────

const ConditionEditor: React.FC<{
    cond: TagConditionExpr;
    onChange: (c: TagConditionExpr) => void;
}> = ({ cond, onChange }) => (
    <div className="space-y-2.5">
        {/* 조건 유형 선택 */}
        <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 shrink-0">조건 유형</span>
            <select value={cond.type} onChange={e => onChange(switchConditionType(cond, e.target.value as any))} className={SEL_CLS}>
                <option value="single">단일 조건</option>
                <option value="all_of">전체 AND</option>
                <option value="or_first">OR + AND</option>
            </select>
        </div>

        {/* single */}
        {cond.type === 'single' && (
            <ClauseEditor clause={cond.clause} onChange={clause => onChange({ type: 'single', clause })} />
        )}

        {/* all_of */}
        {cond.type === 'all_of' && (
            <div className="space-y-1.5">
                {cond.clauses.map((clause, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <span className={`text-[10px] w-8 text-right shrink-0 ${i === 0 ? 'text-transparent' : 'text-sky-500'}`}>AND</span>
                        <ClauseEditor
                            clause={clause}
                            onChange={c => onChange({ type: 'all_of', clauses: cond.clauses.map((x, j) => j === i ? c : x) })}
                            onRemove={cond.clauses.length > 1 ? () => onChange({ type: 'all_of', clauses: cond.clauses.filter((_, j) => j !== i) }) : undefined}
                        />
                    </div>
                ))}
                <button
                    onClick={() => onChange({ type: 'all_of', clauses: [...cond.clauses, makeDefaultClause()] })}
                    className="ml-10 text-[11px] text-violet-400 hover:text-violet-300 transition-colors"
                >
                    + 조건 추가
                </button>
            </div>
        )}

        {/* or_first */}
        {cond.type === 'or_first' && (
            <div className="space-y-3">
                {/* OR 그룹 */}
                <div className="space-y-1.5">
                    <span className="text-[10px] text-orange-400/80 font-semibold uppercase tracking-wider">OR 그룹 — 하나라도 만족</span>
                    {cond.orClauses.map((clause, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <span className={`text-[10px] w-8 text-right shrink-0 ${i === 0 ? 'text-transparent' : 'text-orange-500'}`}>OR</span>
                            <ClauseEditor
                                clause={clause}
                                onChange={c => onChange({ ...cond, orClauses: cond.orClauses.map((x, j) => j === i ? c : x) })}
                                onRemove={cond.orClauses.length > 1 ? () => onChange({ ...cond, orClauses: cond.orClauses.filter((_, j) => j !== i) }) : undefined}
                            />
                        </div>
                    ))}
                    <button
                        onClick={() => onChange({ ...cond, orClauses: [...cond.orClauses, makeDefaultClause()] })}
                        className="ml-10 text-[11px] text-orange-400 hover:text-orange-300 transition-colors"
                    >
                        + OR 조건 추가
                    </button>
                </div>
                {/* AND 그룹 */}
                <div className="space-y-1.5">
                    <span className="text-[10px] text-sky-400/80 font-semibold uppercase tracking-wider">AND 그룹 — 모두 만족</span>
                    {cond.andClauses.length === 0 && (
                        <p className="ml-10 text-[11px] text-slate-600 italic">없음</p>
                    )}
                    {cond.andClauses.map((clause, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <span className={`text-[10px] w-8 text-right shrink-0 ${i === 0 ? 'text-transparent' : 'text-sky-500'}`}>AND</span>
                            <ClauseEditor
                                clause={clause}
                                onChange={c => onChange({ ...cond, andClauses: cond.andClauses.map((x, j) => j === i ? c : x) })}
                                onRemove={() => onChange({ ...cond, andClauses: cond.andClauses.filter((_, j) => j !== i) })}
                            />
                        </div>
                    ))}
                    <button
                        onClick={() => onChange({ ...cond, andClauses: [...cond.andClauses, makeDefaultClause()] })}
                        className="ml-10 text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
                    >
                        + AND 조건 추가
                    </button>
                </div>
            </div>
        )}
    </div>
);

// ─── TagConfigPanel ───────────────────────────────────────────────────────────

const TagConfigPanel: React.FC<{ tags: TagConfigList; onChange: (t: TagConfigList) => void }> = ({ tags, onChange }) => {
    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
    const [newId, setNewId] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [newColor, setNewColor] = useState('slate');
    const [newFieldType, setNewFieldType] = useState<'module' | 'rating'>('module');
    const [newField, setNewField] = useState('rimFinishing');
    const [newOp, setNewOp] = useState<'>=' | '<='>('>=');
    const [newValue, setNewValue] = useState(85);
    const [newBonus, setNewBonus] = useState(0.5);
    const [addError, setAddError] = useState<string | null>(null);

    const update = (idx: number, patch: Partial<TagConfigEntry>) =>
        onChange(tags.map((t, i) => i === idx ? { ...t, ...patch } : t));
    const remove = (idx: number) => {
        if (expandedIdx === idx) setExpandedIdx(null);
        else if (expandedIdx !== null && expandedIdx > idx) setExpandedIdx(expandedIdx - 1);
        onChange(tags.filter((_, i) => i !== idx));
    };
    const addTag = () => {
        const id = newId.trim() || newLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
        if (!id) { setAddError('ID를 입력하세요'); return; }
        if (!newLabel.trim()) { setAddError('이름을 입력하세요'); return; }
        if (tags.find(t => t.id === id)) { setAddError('이미 존재하는 ID입니다'); return; }
        onChange([...tags, {
            id, label: newLabel.trim(), color: newColor,
            condition: { type: 'single', clause: { fieldType: newFieldType, field: newField, op: newOp, value: newValue } },
            ovrBonus: newBonus,
        }]);
        setNewId(''); setNewLabel(''); setNewColor('slate');
        setNewFieldType('module'); setNewField('rimFinishing'); setNewOp('>='); setNewValue(85); setNewBonus(0.5);
        setAddError(null);
    };

    return (
        <div className="mt-2">
            <div className="rounded-xl ring-1 ring-slate-700/50 overflow-hidden">
                <table className="min-w-full divide-y divide-slate-700/50 text-sm">
                    <thead className="bg-slate-900/90">
                        <tr>
                            {['ID', '이름', '색상', '조건', 'OVR 보너스', ''].map(h => (
                                <th key={h} className={TH_CLS}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className={`divide-y divide-slate-800/60 ${STICKY_BG}`}>
                        {tags.map((tag, idx) => (
                            <React.Fragment key={idx}>
                                <tr className={ROW_CLS}>
                                    <td className="py-1.5 px-2">
                                        <input type="text" value={tag.id}
                                            onChange={e => update(idx, { id: e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, '_') })}
                                            className={`${INP_CLS} w-full font-mono text-[10px] text-slate-300`} />
                                    </td>
                                    <td className="py-1.5 px-2">
                                        <input type="text" value={tag.label}
                                            onChange={e => update(idx, { label: e.target.value })}
                                            className={`${INP_CLS} w-full`} />
                                    </td>
                                    <td className="py-1.5 px-2">
                                        <select value={tag.color} onChange={e => update(idx, { color: e.target.value })} className={SEL_CLS}>
                                            {TAILWIND_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </td>
                                    <td className="py-1.5 px-2">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] text-slate-400 font-mono truncate max-w-[180px]">
                                                {conditionSummary(tag.condition)}
                                            </span>
                                            <button
                                                onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                                                className={`text-[10px] px-1.5 py-0.5 rounded transition-colors shrink-0 ${
                                                    expandedIdx === idx
                                                        ? 'bg-violet-600/30 text-violet-300'
                                                        : 'bg-slate-800 text-slate-400 hover:text-violet-300'
                                                }`}
                                            >
                                                {expandedIdx === idx ? '닫기' : '편집'}
                                            </button>
                                        </div>
                                    </td>
                                    <td className="py-1.5 px-2">
                                        <input type="number" step={0.05} value={tag.ovrBonus}
                                            onChange={e => update(idx, { ovrBonus: parseFloat(e.target.value) || 0 })}
                                            className={`${INP_CLS} w-16 text-center`} />
                                    </td>
                                    <td className="py-1.5 px-2 text-center">
                                        <button onClick={() => remove(idx)}
                                            className="text-[10px] px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/25 hover:text-red-300 transition-colors">
                                            삭제
                                        </button>
                                    </td>
                                </tr>
                                {expandedIdx === idx && (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-4 bg-slate-900/60 border-t border-slate-700/40">
                                            <ConditionEditor
                                                cond={tag.condition}
                                                onChange={newCond => update(idx, { condition: newCond })}
                                            />
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
            {/* 태그 추가 폼 */}
            <div className="mt-4 pt-3 border-t border-slate-800/60">
                <div className="flex items-center gap-3 flex-wrap">
                    <input placeholder="ID (자동생성)" value={newId}
                        onChange={e => { setNewId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')); setAddError(null); }}
                        className={`${INP_CLS} w-32 placeholder-slate-600`} />
                    <input placeholder="이름" value={newLabel}
                        onChange={e => { setNewLabel(e.target.value); setAddError(null); }}
                        className={`${INP_CLS} w-32 placeholder-slate-600`} />
                    <select value={newColor} onChange={e => setNewColor(e.target.value)} className={SEL_CLS}>
                        {TAILWIND_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={newFieldType} onChange={e => setNewFieldType(e.target.value as any)} className={SEL_CLS}>
                        <option value="module">모듈</option>
                        <option value="rating">레이팅</option>
                    </select>
                    <select value={newField} onChange={e => setNewField(e.target.value)} className={SEL_CLS}>
                        {(newFieldType === 'module' ? ALL_MODULES_KEYS : ALL_RATING_KEYS).map(k => (
                            <option key={k} value={k}>{k}</option>
                        ))}
                    </select>
                    <select value={newOp} onChange={e => setNewOp(e.target.value as any)} className={SEL_CLS}>
                        <option value=">=">≥</option>
                        <option value="<=">≤</option>
                    </select>
                    <input type="number" value={newValue} onChange={e => setNewValue(Number(e.target.value))}
                        className={`${INP_CLS} w-14 text-center`} placeholder="임계값" />
                    <span className="text-[11px] text-slate-500">OVR 보너스</span>
                    <input type="number" step={0.05} value={newBonus} onChange={e => setNewBonus(parseFloat(e.target.value) || 0)}
                        className={`${INP_CLS} w-14 text-center`} />
                    <button onClick={addTag} disabled={!newLabel.trim()}
                        className="text-xs text-white bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 px-3 py-1.5 rounded-md transition-colors shrink-0">
                        + 추가
                    </button>
                    {addError && <span className="text-[11px] text-red-400">{addError}</span>}
                </div>
            </div>
        </div>
    );
};

const ArchetypeConfigPage: React.FC = () => {
    const { userId } = useOutletContext<EditorContext>();
    const isAdmin = userId === ADMIN_USER_ID;

    const [tab, setTab] = useState<'gates' | 'weights' | 'tags'>('gates');
    const [tagConfig, setTagConfig] = useState<TagConfigList>([]);
    const [gateConfig, setGateConfig] = useState<ArchetypeGateConfig>({});
    const [weightConfig, setWeightConfig] = useState<ArchetypeWeightConfig>({});
    const [labelConfig, setLabelConfig] = useState<ArchetypeLabelConfig>({ ...DEFAULT_LABELS });
    const [positionConfig, setPositionConfig] = useState<ArchetypePositionConfig>({});
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const [newLabel, setNewLabel] = useState('');
    const [newKey, setNewKey] = useState('');
    const [newPositions, setNewPositions] = useState<Position[]>([]);
    const [addError, setAddError] = useState<string | null>(null);

    useEffect(() => {
        invalidateArchetypeCache();
        invalidateTagCache();
        Promise.all([
            fetchArchetypeConfig(),
            fetchTagConfig(),
        ]).then(([arch, tags]) => {
            setGateConfig(arch.gates);
            setWeightConfig(arch.weights);
            if (Object.keys(arch.labels).length > 0) setLabelConfig(arch.labels);
            setPositionConfig(arch.positions);
            setTagConfig(tags);
        }).catch(console.error)
          .finally(() => setLoading(false));
    }, []);

    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            await Promise.all([
                saveArchetypeConfig({ gates: gateConfig, weights: weightConfig, labels: labelConfig, positions: positionConfig }),
                saveTagConfig(tagConfig),
            ]);
            setSaveMsg('저장됨');
            setTimeout(() => setSaveMsg(null), 2000);
        } catch {
            setSaveMsg('저장 실패');
        } finally {
            setSaving(false);
        }
    }, [gateConfig, weightConfig, labelConfig, positionConfig, tagConfig]);

    const handleDelete = useCallback((upperKey: string) => {
        const lowerKey = upperKey.toLowerCase() as keyof ArchetypeGateConfig;
        setLabelConfig(prev => { const n = { ...prev }; delete n[upperKey]; return n; });
        setGateConfig(prev => { const n = { ...prev }; delete n[lowerKey]; return n; });
        setWeightConfig(prev => { const n = { ...prev }; delete n[lowerKey]; return n; });
        setPositionConfig(prev => { const n = { ...prev }; delete n[upperKey]; return n; });
    }, []);

    const handleAdd = useCallback(() => {
        const key = newKey.trim() || labelToKey(newLabel);
        const label = newLabel.trim();
        if (!label) { setAddError('이름을 입력하세요'); return; }
        if (!key) { setAddError('키를 확인하세요'); return; }
        if (newPositions.length === 0) { setAddError('포지션을 하나 이상 선택하세요'); return; }
        if (labelConfig[key] !== undefined) { setAddError('이미 존재하는 키입니다'); return; }
        setLabelConfig(prev => ({ ...prev, [key]: label }));
        setPositionConfig(prev => ({ ...prev, [key]: newPositions }));
        setNewLabel(''); setNewKey(''); setNewPositions([]); setAddError(null);
    }, [newLabel, newKey, newPositions, labelConfig]);

    const togglePosition = useCallback((upperKey: string, pos: string) => {
        setPositionConfig(prev => {
            const cur = prev[upperKey] ?? [];
            const next = cur.includes(pos) ? cur.filter(p => p !== pos) : [...cur, pos];
            return { ...prev, [upperKey]: next };
        });
    }, []);

    if (!isAdmin) return (
        <div className="flex items-center justify-center h-64">
            <p className="text-slate-500 text-sm">접근 권한이 없습니다.</p>
        </div>
    );

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <p className="text-slate-500 text-sm">불러오는 중...</p>
        </div>
    );

    const archetypeEntries = (Object.entries(labelConfig) as [string, string][])
        .sort(([aKey], [bKey]) =>
            posGravity(positionConfig[aKey] ?? []) - posGravity(positionConfig[bKey] ?? [])
        );

    return (
        <div>
            {/* 탭 바 */}
            <div className="flex items-center gap-1 mb-4">
                {(['gates', 'weights', 'tags'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`text-xs px-4 py-1.5 rounded-md transition-colors ${
                            tab === t ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white border border-slate-700'
                        }`}
                    >
                        {t === 'gates' ? '게이트 기준' : t === 'weights' ? '가중치' : '태그'}
                    </button>
                ))}
                <span className="ml-3 text-[11px] text-slate-500">
                    {tab === 'gates'
                        ? '모듈 최솟값 미달 시 해당 아키타입 후보에서 제외'
                        : tab === 'weights'
                        ? '가중치 합계 1.0 기준 — 합계가 클수록 점수 인플레'
                        : '태그 조건 달성 시 표시 + OVR 보너스 적용'}
                </span>
            </div>

            {/* ── 아키타입 테이블 (gates / weights 탭) ── */}
            {tab !== 'tags' && <div className="overflow-x-auto rounded-xl ring-1 ring-slate-700/50">
                <table className="min-w-full divide-y divide-slate-700/50 text-sm" style={{ tableLayout: 'fixed', width: '100%' }}>
                    <thead className="bg-slate-900/90">
                        <tr>
                            {/* 포지션 열 헤더 */}
                            {ALL_POSITIONS.map((pos, i) => (
                                <th
                                    key={pos}
                                    className={`${TH_CLS} sticky z-10 bg-slate-900/90`}
                                    style={{ width: POS_COL_W, left: i * POS_COL_W }}
                                >
                                    {pos}
                                </th>
                            ))}
                            {/* 아키타입 이름 열 헤더 */}
                            <th
                                className={`${TH_CLS} text-left sticky z-10 bg-slate-900/90 border-r border-slate-700/40`}
                                style={{ left: NAME_COL_LEFT, width: NAME_COL_W }}
                            >
                                아키타입
                            </th>
                            {/* 모듈 열 헤더 */}
                            {ALL_MODULES.map(mod => (
                                <th key={mod} className={TH_CLS} style={{ width: '7%' }}>{MODULE_SHORT[mod]}</th>
                            ))}
                            {tab === 'weights' && (
                                <th className={`${TH_CLS} text-slate-500`} style={{ width: '6%' }}>합계</th>
                            )}
                            <th style={{ width: 48 }} />
                        </tr>
                    </thead>
                    <tbody className={`divide-y divide-slate-800/60 ${STICKY_BG}`}>
                        {archetypeEntries.map(([upperKey, label]) => {
                            const key = upperKey.toLowerCase() as keyof ArchetypeGateConfig;
                            const positions = positionConfig[upperKey] ?? [];

                            const positionCells = ALL_POSITIONS.map((pos, i) => (
                                <td
                                    key={pos}
                                    className={`py-2 text-center sticky z-10 ${STICKY_BG}`}
                                    style={{ left: i * POS_COL_W, width: POS_COL_W }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={positions.includes(pos)}
                                        onChange={() => togglePosition(upperKey, pos)}
                                        className="accent-violet-500 cursor-pointer"
                                        style={CHECKBOX_STYLE}
                                    />
                                </td>
                            ));

                            const nameCell = (
                                <td
                                    className={`py-1.5 px-2 sticky z-10 border-r border-slate-700/40 ${STICKY_BG}`}
                                    style={{ left: NAME_COL_LEFT, width: NAME_COL_W }}
                                >
                                    <input
                                        type="text"
                                        value={label}
                                        onChange={e => setLabelConfig(prev => ({ ...prev, [upperKey]: e.target.value }))}
                                        className="w-full bg-transparent rounded px-1 py-0.5 text-[11px] text-slate-200 focus:outline-none focus:bg-slate-800/60 transition-colors"
                                    />
                                </td>
                            );

                            const deleteCell = (
                                <td className="py-1.5 text-center" style={{ width: 48 }}>
                                    <button
                                        onClick={() => handleDelete(upperKey)}
                                        className="text-[10px] px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/25 hover:text-red-300 transition-colors leading-none"
                                    >
                                        삭제
                                    </button>
                                </td>
                            );

                            if (tab === 'gates') {
                                const gate = gateConfig[key] ?? {};
                                return (
                                    <tr key={key} className={ROW_CLS}>
                                        {positionCells}
                                        {nameCell}
                                        {ALL_MODULES.map(mod => (
                                            <td key={mod} className={TD_CLS}>
                                                <input
                                                    type="number" min={0} max={99} placeholder="—"
                                                    value={(gate as any)[mod] ?? ''}
                                                    onChange={e => {
                                                        const num = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                                                        setGateConfig(prev => {
                                                            const prevGate: ArchetypeGate = { ...(prev[key] ?? {}) };
                                                            if (num === undefined) delete (prevGate as any)[mod];
                                                            else (prevGate as any)[mod] = num;
                                                            const next = { ...prev };
                                                            if (Object.keys(prevGate).length === 0) delete next[key];
                                                            else next[key] = prevGate;
                                                            return next;
                                                        });
                                                    }}
                                                    className={INPUT_CLS}
                                                />
                                            </td>
                                        ))}
                                        {deleteCell}
                                    </tr>
                                );
                            } else {
                                const weights: ArchetypeWeights = weightConfig[key] ?? {};
                                const total = Object.values(weights).reduce((s, v) => s + (v as number), 0);
                                const totalColor =
                                    Math.abs(total - 1) < 0.01 ? 'text-emerald-400'
                                    : total > 1.05             ? 'text-red-400'
                                    : total > 0                ? 'text-amber-400'
                                                               : 'text-slate-600';
                                return (
                                    <tr key={key} className={ROW_CLS}>
                                        {positionCells}
                                        {nameCell}
                                        {ALL_MODULES.map(mod => (
                                            <td key={mod} className={TD_CLS}>
                                                <input
                                                    type="number" min={0} max={1} step={0.01} placeholder="—"
                                                    value={(weights as any)[mod] ?? ''}
                                                    onChange={e => {
                                                        const num = e.target.value === '' ? undefined : parseFloat(e.target.value);
                                                        setWeightConfig(prev => {
                                                            const prevW: ArchetypeWeights = { ...(prev[key] ?? {}) };
                                                            if (num === undefined) delete (prevW as any)[mod];
                                                            else (prevW as any)[mod] = num;
                                                            const next = { ...prev };
                                                            if (Object.keys(prevW).length === 0) delete next[key];
                                                            else next[key] = prevW;
                                                            return next;
                                                        });
                                                    }}
                                                    className={INPUT_CLS}
                                                />
                                            </td>
                                        ))}
                                        <td className={`py-1.5 text-[11px] font-medium text-center ${totalColor}`}>
                                            {total > 0 ? total.toFixed(2) : '—'}
                                        </td>
                                        {deleteCell}
                                    </tr>
                                );
                            }
                        })}
                    </tbody>
                </table>
            </div>}

            {/* 아키타입 추가 폼 (gates/weights 탭) */}
            {tab !== 'tags' && <div className="mt-4 pt-3 border-t border-slate-800/60">
                <div className="flex items-center gap-3 flex-wrap">
                    <input
                        type="text"
                        placeholder="이름 (예: Stretch Four)"
                        value={newLabel}
                        onChange={e => { setNewLabel(e.target.value); setNewKey(labelToKey(e.target.value)); setAddError(null); }}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        className="bg-transparent border-b border-slate-700 text-[12px] text-white focus:outline-none focus:border-violet-400 py-0.5 w-44 placeholder-slate-600"
                    />
                    <input
                        type="text"
                        placeholder="키 (자동생성)"
                        value={newKey}
                        onChange={e => { setNewKey(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '')); setAddError(null); }}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        className="bg-transparent border-b border-slate-700 text-[11px] text-slate-400 font-mono focus:outline-none focus:border-violet-400 py-0.5 w-40 placeholder-slate-600"
                    />
                    <div className="flex items-center gap-2">
                        {ALL_POSITIONS.map(pos => (
                            <label key={pos} className="flex items-center gap-1 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={newPositions.includes(pos)}
                                    onChange={() => {
                                        setNewPositions(prev =>
                                            prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos]
                                        );
                                        setAddError(null);
                                    }}
                                    className="accent-violet-500 cursor-pointer"
                                    style={CHECKBOX_STYLE}
                                />
                                <span className="text-[11px] text-slate-400">{pos}</span>
                            </label>
                        ))}
                    </div>
                    <button
                        onClick={handleAdd}
                        disabled={!newLabel.trim()}
                        className="text-xs text-white bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 px-3 py-1.5 rounded-md transition-colors shrink-0"
                    >
                        + 추가
                    </button>
                    {addError && <span className="text-[11px] text-red-400">{addError}</span>}
                </div>
            </div>}

            {/* ── 태그 탭 ── */}
            {tab === 'tags' && <TagConfigPanel tags={tagConfig} onChange={setTagConfig} />}

            {/* 저장 버튼 */}
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-800">
                {saveMsg && (
                    <span className={`text-xs ${saveMsg === '저장됨' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {saveMsg}
                    </span>
                )}
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="ml-auto text-xs text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-5 py-2 rounded-lg transition-colors"
                >
                    {saving ? '저장 중...' : '저장'}
                </button>
            </div>
        </div>
    );
};

export default ArchetypeConfigPage;
