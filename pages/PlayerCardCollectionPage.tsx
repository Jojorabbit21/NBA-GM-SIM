// PlayerCardCollectionPage.tsx — 어드민 "카드 컬렉션" 탭 ("카드 관리" 탭 우측).
// docs/plan/tournament-personal-pack-draft-plan.md 후속. 카드 컬렉션 CRUD + 카드
// 추가/제거만 담당 — 개인 팩 드래프트가 실제로 컬렉션을 소비하는 배선은 아직 없음
// (카드 자체의 소비 배선과 마찬가지로 콘텐츠가 쌓인 뒤의 별도 후속 작업).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Loader2, Plus, Trash2, X, Search, AlertCircle, Pencil } from 'lucide-react';
import { searchCards, type PlayerCardRow } from '../services/admin/playerCardAdminService';
import {
    listCollections, createCollection, updateCollection, deleteCollection,
    listCollectionMembers, addCardToCollection, removeCardFromCollection,
    type CardCollectionRow,
} from '../services/admin/playerCardCollectionAdminService';

type CollectionWithCount = CardCollectionRow & { memberCount: number };

const PlayerCardCollectionPage: React.FC = () => {
    useOutletContext<{ userId?: string }>();

    const [collections, setCollections] = useState<CollectionWithCount[]>([]);
    const [collectionsLoading, setCollectionsLoading] = useState(true);
    const [listErr, setListErr] = useState<string | null>(null);
    const [selected, setSelected] = useState<CollectionWithCount | null>(null);

    const reloadCollections = useCallback(async (keepSelectedId?: string) => {
        setCollectionsLoading(true);
        try {
            const rows = await listCollections();
            setCollections(rows);
            if (keepSelectedId) {
                const found = rows.find(r => r.id === keepSelectedId);
                if (found) setSelected(found);
            }
        } catch (e) {
            setListErr(e instanceof Error ? e.message : '컬렉션 목록을 불러오지 못했습니다.');
        } finally {
            setCollectionsLoading(false);
        }
    }, []);

    useEffect(() => { reloadCollections(); }, [reloadCollections]);

    // ── 새 컬렉션 생성 ───────────────────────────────────────────────────────
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [creating, setCreating] = useState(false);
    const [createErr, setCreateErr] = useState<string | null>(null);

    const handleCreate = async () => {
        if (!newName.trim()) return;
        setCreating(true); setCreateErr(null);
        try {
            const created = await createCollection(newName, newDesc);
            setNewName(''); setNewDesc('');
            await reloadCollections(created.id);
        } catch (e) {
            setCreateErr(e instanceof Error ? e.message : '생성에 실패했습니다(이름이 이미 있을 수 있습니다).');
        } finally {
            setCreating(false);
        }
    };

    // ── 컬렉션 이름/설명 인라인 편집 ─────────────────────────────────────────
    const [editingMeta, setEditingMeta] = useState(false);
    const [metaName, setMetaName] = useState('');
    const [metaDesc, setMetaDesc] = useState('');
    const [metaSaving, setMetaSaving] = useState(false);

    useEffect(() => {
        if (selected) { setMetaName(selected.name); setMetaDesc(selected.description ?? ''); }
        setEditingMeta(false);
    }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSaveMeta = async () => {
        if (!selected) return;
        setMetaSaving(true);
        try {
            await updateCollection(selected.id, { name: metaName.trim(), description: metaDesc.trim() || null });
            setEditingMeta(false);
            await reloadCollections(selected.id);
        } catch (e) {
            setListErr(e instanceof Error ? e.message : '수정에 실패했습니다.');
        } finally {
            setMetaSaving(false);
        }
    };

    const handleDeleteCollection = async (c: CollectionWithCount) => {
        if (!window.confirm(`"${c.name}" 컬렉션을 삭제할까요? (카드 자체는 삭제되지 않습니다)`)) return;
        try {
            await deleteCollection(c.id);
            if (selected?.id === c.id) setSelected(null);
            await reloadCollections();
        } catch (e) {
            setListErr(e instanceof Error ? e.message : '삭제에 실패했습니다.');
        }
    };

    // ── 선택된 컬렉션의 멤버 카드 ───────────────────────────────────────────
    const [members, setMembers] = useState<PlayerCardRow[]>([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const memberIds = useMemo(() => new Set(members.map(m => m.id)), [members]);

    const reloadMembers = useCallback(async (collectionId: string) => {
        setMembersLoading(true);
        try {
            setMembers(await listCollectionMembers(collectionId));
        } catch (e) {
            setListErr(e instanceof Error ? e.message : '카드 목록을 불러오지 못했습니다.');
        } finally {
            setMembersLoading(false);
        }
    }, []);

    useEffect(() => {
        if (selected) reloadMembers(selected.id);
        else setMembers([]);
    }, [selected?.id, reloadMembers]);

    const handleRemove = async (cardId: string) => {
        if (!selected) return;
        try {
            await removeCardFromCollection(selected.id, cardId);
            setMembers(m => m.filter(c => c.id !== cardId));
            setCollections(cs => cs.map(c => c.id === selected.id ? { ...c, memberCount: c.memberCount - 1 } : c));
        } catch (e) {
            setListErr(e instanceof Error ? e.message : '제거에 실패했습니다.');
        }
    };

    // ── 카드 검색해서 추가 ────────────────────────────────────────────────────
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState<PlayerCardRow[]>([]);
    const [searching, setSearching] = useState(false);
    const [addingId, setAddingId] = useState<string | null>(null);

    useEffect(() => {
        if (!selected) { setSearchResults([]); return; }
        let cancelled = false;
        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                const rows = await searchCards(query);
                if (!cancelled) setSearchResults(rows.slice(0, 50));
            } finally {
                if (!cancelled) setSearching(false);
            }
        }, 250);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [query, selected?.id]);

    const handleAdd = async (card: PlayerCardRow) => {
        if (!selected || memberIds.has(card.id)) return;
        setAddingId(card.id);
        try {
            await addCardToCollection(selected.id, card.id);
            setMembers(m => [...m, card]);
            setCollections(cs => cs.map(c => c.id === selected.id ? { ...c, memberCount: c.memberCount + 1 } : c));
        } catch (e) {
            setListErr(e instanceof Error ? e.message : '추가에 실패했습니다.');
        } finally {
            setAddingId(null);
        }
    };

    return (
        <div className="pretendard grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
            {/* ── 좌측: 컬렉션 목록 + 새 컬렉션 만들기 ── */}
            <div className="space-y-4">
                <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-4 space-y-2">
                    <h3 className="text-sm font-bold text-white">새 컬렉션</h3>
                    <input
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="컬렉션 이름"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                    <input
                        value={newDesc}
                        onChange={e => setNewDesc(e.target.value)}
                        placeholder="설명(선택)"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                    />
                    {createErr && (
                        <p className="flex items-start gap-1.5 text-xs text-red-400 ko-normal">
                            <AlertCircle size={12} className="shrink-0 mt-0.5" />{createErr}
                        </p>
                    )}
                    <button
                        onClick={handleCreate}
                        disabled={creating || !newName.trim()}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
                    >
                        {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        만들기
                    </button>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl max-h-[60vh] overflow-y-auto">
                    {collectionsLoading ? (
                        <div className="flex items-center justify-center py-6"><Loader2 size={16} className="animate-spin text-slate-500" /></div>
                    ) : collections.length === 0 ? (
                        <p className="text-xs text-slate-600 ko-normal px-3 py-4 text-center">아직 컬렉션이 없습니다.</p>
                    ) : collections.map(c => (
                        <button
                            key={c.id}
                            onClick={() => setSelected(c)}
                            className={`w-full flex items-center justify-between px-3 py-2.5 text-left border-b border-slate-800/60 last:border-b-0 transition-colors ${
                                selected?.id === c.id ? 'bg-indigo-600/20 text-white' : 'text-slate-300 hover:bg-white/5'
                            }`}
                        >
                            <div className="min-w-0">
                                <p className="text-sm font-bold truncate">{c.name}</p>
                                {c.description && <p className="text-xs text-slate-500 truncate">{c.description}</p>}
                            </div>
                            <span className="text-xs text-slate-500 shrink-0 ml-2">{c.memberCount}장</span>
                        </button>
                    ))}
                </div>
                {listErr && (
                    <p className="flex items-start gap-1.5 text-xs text-red-400 ko-normal">
                        <AlertCircle size={12} className="shrink-0 mt-0.5" />{listErr}
                    </p>
                )}
            </div>

            {/* ── 우측: 선택된 컬렉션 상세 ── */}
            <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-6">
                {!selected ? (
                    <p className="text-sm text-slate-500 ko-normal text-center py-16">왼쪽에서 컬렉션을 선택하거나 새로 만들어주세요.</p>
                ) : (
                    <div className="space-y-5">
                        <div className="flex items-center justify-between gap-3">
                            {editingMeta ? (
                                <div className="flex-1 flex items-center gap-2">
                                    <input value={metaName} onChange={e => setMetaName(e.target.value)}
                                        className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
                                    <input value={metaDesc} onChange={e => setMetaDesc(e.target.value)} placeholder="설명"
                                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
                                    <button onClick={handleSaveMeta} disabled={metaSaving}
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
                                        {metaSaving ? <Loader2 size={12} className="animate-spin" /> : '저장'}
                                    </button>
                                </div>
                            ) : (
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-lg font-bold text-white">{selected.name}</h2>
                                        <button onClick={() => setEditingMeta(true)} className="text-slate-500 hover:text-white transition-colors">
                                            <Pencil size={13} />
                                        </button>
                                    </div>
                                    {selected.description && <p className="text-xs text-slate-500 ko-normal">{selected.description}</p>}
                                </div>
                            )}
                            <button
                                onClick={() => handleDeleteCollection(selected)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors shrink-0"
                            >
                                <Trash2 size={12} />컬렉션 삭제
                            </button>
                        </div>

                        {/* 카드 검색해서 추가 */}
                        <div>
                            <label className="text-xs text-slate-400 ko-normal block mb-1.5">카드 추가</label>
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder="선수 이름으로 카드 검색"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                />
                                {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-500" />}
                            </div>
                            {searchResults.length > 0 && (
                                <div className="mt-2 bg-slate-900/60 border border-slate-800 rounded-xl max-h-56 overflow-y-auto">
                                    {searchResults.map(card => {
                                        const isMember = memberIds.has(card.id);
                                        return (
                                            <div key={card.id} className="flex items-center justify-between px-3 py-2 text-sm border-b border-slate-800/60 last:border-b-0">
                                                <span className="text-slate-300 truncate">{card.name} <span className="text-slate-600">· {card.season}</span></span>
                                                <button
                                                    onClick={() => handleAdd(card)}
                                                    disabled={isMember || addingId === card.id}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                                                        isMember ? 'bg-slate-800 text-slate-600 cursor-default' : 'bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40'
                                                    }`}
                                                >
                                                    {addingId === card.id ? <Loader2 size={11} className="animate-spin" /> : isMember ? '추가됨' : '추가'}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* 컬렉션 멤버 카드 목록 */}
                        <div>
                            <h3 className="text-sm font-bold text-white mb-2">이 컬렉션의 카드 ({members.length}장)</h3>
                            {membersLoading ? (
                                <div className="flex items-center justify-center py-6"><Loader2 size={16} className="animate-spin text-slate-500" /></div>
                            ) : members.length === 0 ? (
                                <p className="text-xs text-slate-600 ko-normal">아직 넣은 카드가 없습니다. 위에서 검색해서 추가하세요.</p>
                            ) : (
                                <div className="bg-slate-900/60 border border-slate-800 rounded-xl divide-y divide-slate-800/60">
                                    {members.map(card => (
                                        <div key={card.id} className="flex items-center justify-between px-3 py-2 text-sm">
                                            <span className="text-slate-200 truncate">{card.name} <span className="text-slate-500">· {card.season} · {card.position}</span></span>
                                            <button
                                                onClick={() => handleRemove(card.id)}
                                                className="p-1 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                                                aria-label={`${card.name} ${card.season} 카드 제거`}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PlayerCardCollectionPage;
