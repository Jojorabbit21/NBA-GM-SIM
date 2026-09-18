// PlayerCardEditorPage.tsx — 어드민 "카드 관리" 탭 (Admin 편집기 신규 탭).
// docs/plan/tournament-personal-pack-draft-plan.md 후속(시즌 카드 바리에이션).
//
// 흐름: meta_players에서 선수 검색 → 선택 → (career_history 기준) 시즌 선택 → "복사해서
// 카드 만들기" → meta_player_cards에 그 선수 현재 레이팅을 통째로 복사한 새 row 생성 →
// 오른쪽 편집기에서 그 시즌에 맞게 능력치를 손으로 조정 → 저장.
//
// meta_players는 여기서 읽기만 한다(검색/복사 원본) — 절대 쓰지 않음. 실제 DB엔 시즌별
// "레이팅"이 없고(career_history는 실제 박스스코어 통계일 뿐) 오직 현재 레이팅 1세트뿐이라,
// "복사"는 그 레이팅을 출발점 템플릿으로 베끼는 것 — 시즌 반영은 어드민이 직접 조정한다.
// 이때 참고할 수 있도록 그 시즌의 실제 스탯 라인을 편집기 옆에 같이 보여준다.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Loader2, Save, Trash2, Copy, Search, AlertCircle } from 'lucide-react';
import { searchPlayers, type MetaPlayerRow } from '../services/admin/playerAdminService';
import {
    listCardsForPlayer, createCardFromCopy, updateCard, deleteCard,
    fetchAvailableSeasons, fetchSeasonStatLine, type PlayerCardRow, type UpdateCardPatch,
} from '../services/admin/playerCardAdminService';
import { ATTR_GROUPS, ATTR_KR_LABEL } from '../data/attributeConfig';
import { mapRawPlayerToRuntimePlayer } from '../services/dataMapper';
import { calculateOvr } from '../utils/ovrUtils';
import { OvrBadge } from '../components/common/OvrBadge';
import { TEAM_DATA } from '../data/teamData';

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
const TEAM_OPTIONS = Object.values(TEAM_DATA).sort((a, b) => a.city.localeCompare(b.city));

function computeOvrPreview(card: PlayerCardRow): number | null {
    try {
        const player = mapRawPlayerToRuntimePlayer({
            id: card.id, name: card.name, position: card.position,
            base_attributes: card.base_attributes, tendencies: card.tendencies,
        }, false, true);
        return calculateOvr(player, card.position);
    } catch {
        return null;
    }
}

const PlayerCardEditorPage: React.FC = () => {
    useOutletContext<{ userId?: string }>();

    // ── 선수 검색 ──────────────────────────────────────────────────────────
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<MetaPlayerRow[]>([]);
    const [searching, setSearching] = useState(false);
    const [selectedPlayer, setSelectedPlayer] = useState<MetaPlayerRow | null>(null);

    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                const rows = await searchPlayers(query);
                if (!cancelled) setResults(rows.slice(0, 50));
            } finally {
                if (!cancelled) setSearching(false);
            }
        }, 250);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [query]);

    // ── 선택된 선수의 카드 목록 + 시즌 후보 ────────────────────────────────────
    const [cards, setCards] = useState<PlayerCardRow[]>([]);
    const [cardsLoading, setCardsLoading] = useState(false);
    const [availableSeasons, setAvailableSeasons] = useState<string[]>([]);
    const [newSeason, setNewSeason] = useState('');
    const [creating, setCreating] = useState(false);
    const [listErr, setListErr] = useState<string | null>(null);

    const reloadCards = useCallback(async (playerId: string) => {
        setCardsLoading(true);
        try {
            const rows = await listCardsForPlayer(playerId);
            setCards(rows);
        } catch (e) {
            setListErr(e instanceof Error ? e.message : '카드 목록을 불러오지 못했습니다.');
        } finally {
            setCardsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!selectedPlayer) { setCards([]); setAvailableSeasons([]); return; }
        setListErr(null);
        reloadCards(selectedPlayer.id);
        fetchAvailableSeasons(selectedPlayer.id).then(setAvailableSeasons).catch(() => setAvailableSeasons([]));
    }, [selectedPlayer, reloadCards]);

    // ── 편집 중인 카드 ─────────────────────────────────────────────────────
    const [editing, setEditing] = useState<PlayerCardRow | null>(null);
    const [draft, setDraft] = useState<Record<string, any>>({});
    const [saving, setSaving] = useState(false);
    const [saveErr, setSaveErr] = useState<string | null>(null);
    const [saveOk, setSaveOk] = useState(false);
    const [statLine, setStatLine] = useState<Record<string, any> | null>(null);

    const loadIntoEditor = useCallback((card: PlayerCardRow) => {
        setEditing(card);
        setDraft({
            season: card.season, name: card.name, position: card.position,
            height: card.height ?? '', weight: card.weight ?? '', base_team_id: card.base_team_id ?? '',
            attrs: { ...(card.base_attributes ?? {}) },
        });
        setSaveOk(false); setSaveErr(null);
        fetchSeasonStatLine(card.source_player_id, card.season).then(setStatLine).catch(() => setStatLine(null));
    }, []);

    const handleCreate = async () => {
        if (!selectedPlayer || !newSeason.trim()) return;
        setCreating(true); setListErr(null);
        try {
            const card = await createCardFromCopy(selectedPlayer.id, newSeason.trim());
            setNewSeason('');
            await reloadCards(selectedPlayer.id);
            loadIntoEditor(card);
        } catch (e) {
            setListErr(e instanceof Error ? e.message : '카드를 만들지 못했습니다(이미 같은 시즌 카드가 있을 수 있습니다).');
        } finally {
            setCreating(false);
        }
    };

    const setAttr = (key: string, value: number) => {
        setDraft((d: any) => ({ ...d, attrs: { ...d.attrs, [key]: value } }));
    };

    const draftOvrPreview = useMemo(() => {
        if (!editing) return null;
        return computeOvrPreview({ ...editing, position: draft.position, base_attributes: draft.attrs });
    }, [editing, draft.position, draft.attrs]);

    const handleSave = async () => {
        if (!editing) return;
        setSaving(true); setSaveErr(null); setSaveOk(false);
        try {
            const patch: UpdateCardPatch = {
                season: String(draft.season).trim(),
                name: String(draft.name).trim(),
                position: draft.position,
                height: draft.height === '' ? null : Number(draft.height),
                weight: draft.weight === '' ? null : Number(draft.weight),
                base_team_id: draft.base_team_id || null,
                base_attributes: { ...draft.attrs, age: draft.attrs.age != null ? Number(draft.attrs.age) : undefined },
            };
            await updateCard(editing.id, patch);
            setSaveOk(true);
            setTimeout(() => setSaveOk(false), 2000);
            if (selectedPlayer) await reloadCards(selectedPlayer.id);
            setEditing(e => e ? { ...e, ...patch, base_attributes: patch.base_attributes! } as PlayerCardRow : e);
        } catch (e) {
            setSaveErr(e instanceof Error ? e.message : '저장에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!editing) return;
        if (!window.confirm(`"${editing.name} · ${editing.season}" 카드를 삭제할까요?`)) return;
        setSaving(true);
        try {
            await deleteCard(editing.id);
            setEditing(null);
            if (selectedPlayer) await reloadCards(selectedPlayer.id);
        } catch (e) {
            setSaveErr(e instanceof Error ? e.message : '삭제에 실패했습니다.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="pretendard grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
            {/* ── 좌측: 선수 검색 + 카드 목록 + 새 카드 만들기 ── */}
            <div className="space-y-4">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="선수 이름 검색"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                    {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-500" />}
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl max-h-64 overflow-y-auto">
                    {results.length === 0 ? (
                        <p className="text-xs text-slate-600 ko-normal px-3 py-4 text-center">검색 결과 없음</p>
                    ) : results.map(p => (
                        <button
                            key={p.id}
                            onClick={() => setSelectedPlayer(p)}
                            className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm border-b border-slate-800/60 last:border-b-0 transition-colors ${
                                selectedPlayer?.id === p.id ? 'bg-indigo-600/20 text-white' : 'text-slate-300 hover:bg-white/5'
                            }`}
                        >
                            <span className="truncate">{p.name}</span>
                            <span className="text-xs text-slate-500 shrink-0 ml-2">{p.position} · {p.draft_year ?? '—'}</span>
                        </button>
                    ))}
                </div>

                {selectedPlayer && (
                    <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-4 space-y-3">
                        <h3 className="text-sm font-bold text-white">{selectedPlayer.name}의 카드</h3>

                        {listErr && (
                            <p className="flex items-start gap-1.5 text-xs text-red-400 ko-normal">
                                <AlertCircle size={12} className="shrink-0 mt-0.5" />{listErr}
                            </p>
                        )}

                        {cardsLoading ? (
                            <div className="flex items-center justify-center py-4"><Loader2 size={16} className="animate-spin text-slate-500" /></div>
                        ) : cards.length === 0 ? (
                            <p className="text-xs text-slate-600 ko-normal">아직 만든 카드가 없습니다.</p>
                        ) : (
                            <div className="space-y-1">
                                {cards.map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => loadIntoEditor(c)}
                                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                            editing?.id === c.id ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-300 hover:text-white'
                                        }`}
                                    >
                                        <span>{c.season}</span>
                                        <span className="text-slate-500 font-normal">{computeOvrPreview(c) ?? '—'} OVR</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="pt-2 border-t border-slate-700/40 space-y-2">
                            <label className="text-xs text-slate-400 ko-normal block">새 카드 시즌</label>
                            <div className="flex gap-1.5">
                                <input
                                    list="available-seasons"
                                    value={newSeason}
                                    onChange={e => setNewSeason(e.target.value)}
                                    placeholder="예: 2000-01"
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                                />
                                <button
                                    onClick={handleCreate}
                                    disabled={creating || !newSeason.trim()}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
                                >
                                    {creating ? <Loader2 size={11} className="animate-spin" /> : <Copy size={11} />}
                                    복사
                                </button>
                            </div>
                            <datalist id="available-seasons">
                                {availableSeasons.map(s => <option key={s} value={s} />)}
                            </datalist>
                            <p className="text-[11px] text-slate-600 ko-normal">
                                {availableSeasons.length > 0
                                    ? `career_history에 기록된 시즌 ${availableSeasons.length}개 중에서 고르거나 직접 입력하세요.`
                                    : '이 선수는 career_history가 없어 자유 텍스트로만 시즌을 입력할 수 있습니다.'}
                                {' '}현재 능력치를 그대로 복사해 새 카드를 만들고, 오른쪽에서 그 시즌에 맞게 조정하세요.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* ── 우측: 카드 편집기 ── */}
            <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6">
                {!editing ? (
                    <p className="text-sm text-slate-500 ko-normal text-center py-16">왼쪽에서 선수를 검색하고 카드를 선택하거나 새로 만들어주세요.</p>
                ) : (
                    <div className="space-y-5">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                {draftOvrPreview != null && <OvrBadge value={draftOvrPreview} size="lg" />}
                                <div>
                                    <h2 className="text-lg font-bold text-white">{draft.name} · {draft.season}</h2>
                                    <p className="text-xs text-slate-500 ko-normal">원본 선수: {editing.source_player_id}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {saveErr && <span className="text-xs text-red-400 ko-normal">{saveErr}</span>}
                                <button
                                    onClick={handleDelete}
                                    disabled={saving}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors disabled:opacity-40"
                                >
                                    <Trash2 size={12} />삭제
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg text-xs font-bold text-white transition-colors"
                                >
                                    {saving ? <Loader2 size={12} className="animate-spin" /> : saveOk ? null : <Save size={12} />}
                                    {saving ? '저장 중…' : saveOk ? '저장됨 ✓' : '저장'}
                                </button>
                            </div>
                        </div>

                        {statLine && (
                            <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-400 ko-normal">
                                <span className="text-slate-500">{draft.season} 실제 기록(참고용, 레이팅 아님)</span>
                                <span className="ml-2 text-slate-200">
                                    {statLine.pts}PPG · {statLine.reb}RPG · {statLine.ast}APG · FG {statLine.fg_pct != null ? Math.round(statLine.fg_pct * 100) : '—'}% · 3P {statLine.fg3_pct != null ? Math.round(statLine.fg3_pct * 100) : '—'}%
                                </span>
                            </div>
                        )}

                        {/* 바이오 */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div>
                                <label className="text-xs text-slate-400 ko-normal block mb-1">시즌</label>
                                <input value={draft.season} onChange={e => setDraft((d: any) => ({ ...d, season: e.target.value }))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 ko-normal block mb-1">포지션</label>
                                <select value={draft.position} onChange={e => setDraft((d: any) => ({ ...d, position: e.target.value }))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500">
                                    {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 ko-normal block mb-1">키(cm)</label>
                                <input type="number" value={draft.height} onChange={e => setDraft((d: any) => ({ ...d, height: e.target.value }))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 ko-normal block mb-1">몸무게(kg)</label>
                                <input type="number" value={draft.weight} onChange={e => setDraft((d: any) => ({ ...d, weight: e.target.value }))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 ko-normal block mb-1">소속팀(그 시즌)</label>
                                <select value={draft.base_team_id} onChange={e => setDraft((d: any) => ({ ...d, base_team_id: e.target.value }))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500">
                                    <option value="">—</option>
                                    {TEAM_OPTIONS.map(t => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 ko-normal block mb-1">나이(그 시즌)</label>
                                <input type="number" value={draft.attrs.age ?? ''} onChange={e => setAttr('age', Number(e.target.value))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
                            </div>
                        </div>

                        {/* 능력치 — 카테고리별 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {ATTR_GROUPS.map(group => (
                                <div key={group.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-2">
                                    <h4 className="text-xs font-bold uppercase text-indigo-400">{group.label}</h4>
                                    {group.keys.slice(1).map(key => (
                                        <div key={key} className="flex items-center gap-2">
                                            <label className="text-xs text-slate-400 ko-normal w-24 shrink-0 truncate" title={ATTR_KR_LABEL[key] ?? key}>
                                                {ATTR_KR_LABEL[key] ?? key}
                                            </label>
                                            <input
                                                type="number" min={0} max={99}
                                                value={draft.attrs[key] ?? ''}
                                                onChange={e => setAttr(key, Math.max(0, Math.min(99, Number(e.target.value) || 0)))}
                                                className="w-16 bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-indigo-500"
                                            />
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PlayerCardEditorPage;
