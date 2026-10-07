import React, { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { ColorField } from '../components/multi/ColorField';
import { CourtPreview } from '../components/multi/CourtPreview';
import { HEX_COLOR_RE } from '../utils/colorContrast';
import {
    fetchCourtDefaults, saveCourtDefaults, fetchTeamCourtDefaults, saveTeamCourtDefaults,
    FALLBACK_COURT_COLORS, type CourtColors, type TeamCourtDefaults,
} from '../services/multi/courtDefaults';
import { TEAM_DATA } from '../data/teamData';
import { VIRTUAL_TEAMS } from '../data/virtualTeams';

const COURT_FIELDS: { key: keyof CourtColors; label: string }[] = [
    { key: 'background', label: '코트 배경' },
    { key: 'three',      label: '3점 라인 안쪽' },
    { key: 'paint',      label: '페인트존' },
    { key: 'line',       label: '라인' },
];

const GLOBAL = '__global__';

// 선택한 팀의 팀 컬러(실제 팀: TEAM_DATA, 가상 팀: VIRTUAL_TEAMS) — 중복 hex는 한 번만 표시
function getTeamColorChips(slug: string): { label: string; hex: string }[] {
    const real = TEAM_DATA[slug]?.colors;
    const virt = VIRTUAL_TEAMS.find(t => t.team_slug === slug);
    const raw = real
        ? [['Primary', real.primary], ['Secondary', real.secondary], ['Tertiary', real.tertiary], ['Text', real.text]]
        : virt
        ? [['Primary', virt.color_primary], ['Secondary', virt.color_secondary], ['Tertiary', virt.color_tertiary], ['Text', virt.color_text]]
        : [];
    const seen = new Set<string>();
    const out: { label: string; hex: string }[] = [];
    for (const [label, hex] of raw) {
        if (!hex || !HEX_COLOR_RE.test(hex) || seen.has(hex.toLowerCase())) continue;
        seen.add(hex.toLowerCase());
        out.push({ label: label as string, hex: hex.toUpperCase() });
    }
    return out;
}

// 하나의 코트 색상 편집 화면을 "기본(전역)"과 각 팀이 공용으로 쓴다 — 상단 드롭다운으로 대상 선택.
// 팀을 선택했을 때 개별 지정이 없으면 전역 기본값을 따르는 상태로 표시된다.
const AdminAppSettingsPage: React.FC = () => {
    const [globalColors, setGlobalColors] = useState<CourtColors>(FALLBACK_COURT_COLORS);
    const [teams,        setTeams]        = useState<TeamCourtDefaults>({});
    const [target,       setTarget]       = useState<string>(GLOBAL);
    const [loading,      setLoading]      = useState(true);
    const [saving,       setSaving]       = useState(false);
    const [err,          setErr]          = useState<string | null>(null);
    const [saved,        setSaved]        = useState(false);
    const [copiedHex,    setCopiedHex]    = useState<string | null>(null);

    useEffect(() => {
        Promise.all([fetchCourtDefaults(true), fetchTeamCourtDefaults()]).then(([g, t]) => {
            setGlobalColors(g); setTeams(t); setLoading(false);
        });
    }, []);

    const realTeams = Object.values(TEAM_DATA).map(t => ({ slug: t.id, label: `${t.city} ${t.name}` }));
    const virtualTeams = VIRTUAL_TEAMS.map(t => ({ slug: t.team_slug, label: t.team_name }));

    const isGlobal = target === GLOBAL;
    const custom = isGlobal ? undefined : teams[target];
    // 팀 선택 + 개별 지정 없음 → 읽기 전용(전역 값 표시)
    const editable = isGlobal || !!custom;
    const current: CourtColors = isGlobal ? globalColors : (custom ?? globalColors);

    const setField = (key: keyof CourtColors, v: string) => {
        if (isGlobal) setGlobalColors(c => ({ ...c, [key]: v }));
        else setTeams(t => ({ ...t, [target]: { ...(t[target] ?? globalColors), [key]: v } }));
    };

    const copyHex = async (hex: string) => {
        try {
            await navigator.clipboard.writeText(hex);
            setCopiedHex(hex);
            setTimeout(() => setCopiedHex(c => (c === hex ? null : c)), 1500);
        } catch {
            setErr('클립보드 복사에 실패했습니다');
        }
    };

    const changeTarget = (v: string) => { setTarget(v); setErr(null); setSaved(false); };

    const handleSave = async () => {
        for (const f of COURT_FIELDS) {
            if (!HEX_COLOR_RE.test(current[f.key])) { setErr(`${f.label} 색상은 #RRGGBB 형식이어야 합니다`); return; }
        }
        setSaving(true); setErr(null); setSaved(false);
        // 팀 모드: 맵 전체를 저장(개별 지정 해제 = 키 삭제 후 저장 포함)
        const { error } = isGlobal ? await saveCourtDefaults(globalColors) : await saveTeamCourtDefaults(teams);
        setSaving(false);
        if (error) { setErr(error); return; }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    if (loading) return <Loader2 size={18} className="animate-spin text-slate-400" />;

    const safe = (k: keyof CourtColors) => (HEX_COLOR_RE.test(current[k]) ? current[k] : FALLBACK_COURT_COLORS[k]);

    return (
        <div className="max-w-3xl space-y-4 pb-10">
            <div>
                <h2 className="text-sm font-bold text-white">기본 코트 색상</h2>
                <p className="text-xs text-slate-400 ko-normal mt-1 leading-relaxed">
                    "기본(전역)"은 모든 리그의 기본값이고, 팀을 선택하면 그 팀만의 기본값을 따로 지정할 수 있습니다.
                    지정하지 않은 팀은 전역 기본값을 따르고, 팀 설정에서 직접 색을 바꾼 팀은 그 값이 우선합니다. 저장 즉시 기존 팀에도 반영됩니다.
                </p>
            </div>

            <div className="flex items-center gap-3">
                <label className="text-xs text-slate-400 shrink-0">대상</label>
                <select
                    value={target}
                    onChange={e => changeTarget(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 min-w-[16rem]"
                >
                    <option value={GLOBAL}>기본 (전역)</option>
                    <optgroup label="팀">
                        {realTeams.map(t => (
                            <option key={t.slug} value={t.slug}>{t.label}{teams[t.slug] ? ' ●' : ''}</option>
                        ))}
                    </optgroup>
                    <optgroup label="가상 팀 (토너먼트용)">
                        {virtualTeams.map(t => (
                            <option key={t.slug} value={t.slug}>{t.label}{teams[t.slug] ? ' ●' : ''}</option>
                        ))}
                    </optgroup>
                </select>
                {!isGlobal && (
                    <span className={`text-xs ${custom ? 'text-indigo-300' : 'text-slate-500'}`}>
                        {custom ? '개별 지정됨' : '전역 기본값 사용 중'}
                    </span>
                )}
            </div>

            {!isGlobal && (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-400 shrink-0">팀 컬러</span>
                    {getTeamColorChips(target).map(c => (
                        <button
                            key={c.hex}
                            onClick={() => copyHex(c.hex)}
                            title={`${c.label} — 클릭해서 복사`}
                            className="flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-full bg-slate-900 border border-slate-700 hover:border-slate-500 transition-colors"
                        >
                            <span className="w-4 h-4 rounded-full border border-slate-600" style={{ background: c.hex }} />
                            <span className="text-xs font-mono text-slate-200">
                                {copiedHex === c.hex ? '복사됨' : c.hex}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            <div className="rounded-xl overflow-hidden border border-slate-800">
                <svg viewBox="0 0 940 500" className="w-full">
                    <CourtPreview background={safe('background')} paint={safe('paint')} line={safe('line')} three={safe('three')} />
                </svg>
            </div>

            <div className="space-y-3">
                {COURT_FIELDS.map(f => (
                    <ColorField key={f.key} label={f.label} value={current[f.key]}
                        onChange={v => setField(f.key, v)} disabled={!editable} />
                ))}
            </div>

            {err && <p className="text-xs text-red-400 ko-normal">{err}</p>}

            <div className="flex items-center gap-3">
                {!isGlobal && !custom && (
                    <button
                        onClick={() => setTeams(t => ({ ...t, [target]: { ...globalColors } }))}
                        className="px-4 py-2.5 rounded-xl text-sm text-slate-200 bg-slate-800 hover:bg-slate-700 transition-colors"
                    >
                        이 팀만 따로 지정
                    </button>
                )}
                {!isGlobal && custom && (
                    <button
                        onClick={async () => {
                            // 개별 지정 해제 → 즉시 저장해 전역 기본값을 따르게 한다
                            const next = { ...teams }; delete next[target];
                            setTeams(next);
                            setSaving(true); setErr(null);
                            const { error } = await saveTeamCourtDefaults(next);
                            setSaving(false);
                            if (error) setErr(error);
                        }}
                        disabled={saving}
                        className="px-4 py-2.5 rounded-xl text-sm text-slate-200 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 transition-colors"
                    >
                        전역 기본값으로 되돌리기
                    </button>
                )}
                <button
                    onClick={handleSave}
                    disabled={saving || !editable}
                    className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? '저장됨' : <><Save size={14} />저장</>}
                </button>
            </div>
        </div>
    );
};

export default AdminAppSettingsPage;
