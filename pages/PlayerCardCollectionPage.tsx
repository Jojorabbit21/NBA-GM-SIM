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
    listCollectionMembers, addCardToCollection, removeCardFromCollection, uploadCollectionBackground,
    type CardCollectionRow,
} from '../services/admin/playerCardCollectionAdminService';
import { buildCardBackground, DEFAULT_CARD_BACKGROUND, type CardBackgroundSettings } from '../utils/cardBackground';
import { convertImageToWebp } from '../utils/imageToWebp';

// 배경 미리보기에 쓰는 대표 팀 컬러(골든스테이트) — 'team' 타입이 실제로 어떻게 보이는지 예시용
const PREVIEW_TEAM_GRADIENT: readonly [string, string] = ['#1D428A', '#FDB927'];
const BG_TYPES: { value: CardBackgroundSettings['bg_type']; label: string; desc: string }[] = [
    { value: 'team',     label: '팀 컬러',   desc: '카드 원팀의 컬러 그라디언트(기본)' },
    { value: 'solid',    label: '단색',      desc: '한 가지 색으로 채움' },
    { value: 'gradient', label: '그라디언트', desc: '두 색 + 각도' },
    { value: 'image',    label: '이미지',    desc: '아무 이미지나 업로드 — WebP로 자동 변환' },
];

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

    // ── 카드 배경 설정 (컬렉션 단위) ─────────────────────────────────────────
    const [bg, setBg] = useState<CardBackgroundSettings>(DEFAULT_CARD_BACKGROUND);
    const [bgSaving, setBgSaving] = useState(false);
    const [bgSaveOk, setBgSaveOk] = useState(false);
    const [bgUploading, setBgUploading] = useState(false);
    const [bgErr, setBgErr] = useState<string | null>(null);

    useEffect(() => {
        if (!selected) return;
        setBg({
            bg_type: selected.bg_type ?? 'team',
            bg_color: selected.bg_color ?? DEFAULT_CARD_BACKGROUND.bg_color,
            bg_gradient_from: selected.bg_gradient_from ?? DEFAULT_CARD_BACKGROUND.bg_gradient_from,
            bg_gradient_to: selected.bg_gradient_to ?? DEFAULT_CARD_BACKGROUND.bg_gradient_to,
            bg_gradient_angle: selected.bg_gradient_angle ?? 165,
            bg_image_url: selected.bg_image_url ?? null,
        });
        setBgErr(null); setBgSaveOk(false);
    }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const bgDirty = !!selected && (
        bg.bg_type !== (selected.bg_type ?? 'team') ||
        (bg.bg_color ?? null) !== (selected.bg_color ?? null) ||
        (bg.bg_gradient_from ?? null) !== (selected.bg_gradient_from ?? null) ||
        (bg.bg_gradient_to ?? null) !== (selected.bg_gradient_to ?? null) ||
        bg.bg_gradient_angle !== (selected.bg_gradient_angle ?? 165) ||
        (bg.bg_image_url ?? null) !== (selected.bg_image_url ?? null)
    );

    const handleBgUpload = async (file: File | null) => {
        if (!selected || !file) return;
        setBgUploading(true); setBgErr(null);
        try {
            // 어떤 형식이든 브라우저에서 WebP로 변환(+긴 변 1200/2000px 이내로 축소) 후 업로드.
            // 변환 미지원 브라우저면 원본 그대로(버킷 허용 형식이면).
            let blob: Blob = file;
            let ext = (file.name.split('.').pop() || 'png').toLowerCase();
            let contentType = file.type || 'application/octet-stream';
            const converted = await convertImageToWebp(file);
            if (converted) {
                blob = converted.blob; ext = 'webp'; contentType = 'image/webp';
            } else if (!['image/webp', 'image/png', 'image/jpeg', 'image/avif'].includes(contentType)) {
                throw new Error('이 브라우저에서는 WebP 변환이 안 되고, 원본 형식은 업로드가 허용되지 않습니다(WebP/PNG/JPEG/AVIF).');
            }
            if (blob.size > 5 * 1024 * 1024) { throw new Error(`변환 후에도 5MB를 넘습니다(${(blob.size / 1024 / 1024).toFixed(1)}MB). 더 작은 이미지를 써주세요.`); }
            const url = await uploadCollectionBackground(selected.id, blob, ext, contentType);
            setBg(b => ({ ...b, bg_type: 'image', bg_image_url: url }));
        } catch (e) {
            setBgErr(e instanceof Error ? e.message : '업로드에 실패했습니다.');
        } finally {
            setBgUploading(false);
        }
    };

    const handleSaveBg = async () => {
        if (!selected) return;
        if (bg.bg_type === 'image' && !bg.bg_image_url) { setBgErr('이미지를 먼저 업로드해주세요.'); return; }
        setBgSaving(true); setBgErr(null); setBgSaveOk(false);
        try {
            await updateCollection(selected.id, bg);
            setBgSaveOk(true);
            setTimeout(() => setBgSaveOk(false), 2000);
            await reloadCollections(selected.id);
        } catch (e) {
            setBgErr(e instanceof Error ? e.message : '저장에 실패했습니다.');
        } finally {
            setBgSaving(false);
        }
    };

    const previewBackground = buildCardBackground(bg, PREVIEW_TEAM_GRADIENT);

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

                        {/* 카드 배경 — 이 컬렉션의 카드가 드래프트 화면에서 쓸 배경 */}
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-4 bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs text-slate-400 ko-normal">카드 배경</label>
                                    <div className="flex items-center gap-2">
                                        {bgErr && <span className="text-xs text-red-400 ko-normal">{bgErr}</span>}
                                        <button
                                            onClick={handleSaveBg}
                                            disabled={!bgDirty || bgSaving || bgUploading}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
                                        >
                                            {bgSaving ? <Loader2 size={12} className="animate-spin" /> : bgSaveOk ? '저장됨 ✓' : '배경 저장'}
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {BG_TYPES.map(t => (
                                        <button
                                            key={t.value}
                                            type="button"
                                            onClick={() => setBg(b => ({ ...b, bg_type: t.value }))}
                                            className={`px-2.5 py-2 rounded-lg text-left transition-colors ${
                                                bg.bg_type === t.value ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            <p className="text-xs font-bold">{t.label}</p>
                                            <p className={`text-[10px] ko-normal ${bg.bg_type === t.value ? 'text-indigo-100' : 'text-slate-600'}`}>{t.desc}</p>
                                        </button>
                                    ))}
                                </div>

                                {bg.bg_type === 'solid' && (
                                    <div className="flex items-center gap-2">
                                        <input type="color" value={bg.bg_color ?? '#1e293b'} onChange={e => setBg(b => ({ ...b, bg_color: e.target.value }))}
                                            className="w-10 h-8 rounded bg-transparent border border-slate-700 cursor-pointer" />
                                        <input value={bg.bg_color ?? ''} onChange={e => setBg(b => ({ ...b, bg_color: e.target.value }))}
                                            className="w-28 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500" />
                                    </div>
                                )}
                                {bg.bg_type === 'gradient' && (
                                    <div className="flex flex-wrap items-center gap-3">
                                        <label className="flex items-center gap-1.5 text-xs text-slate-400">
                                            시작
                                            <input type="color" value={bg.bg_gradient_from ?? '#1D428A'} onChange={e => setBg(b => ({ ...b, bg_gradient_from: e.target.value }))}
                                                className="w-9 h-8 rounded bg-transparent border border-slate-700 cursor-pointer" />
                                            <input value={bg.bg_gradient_from ?? ''} onChange={e => setBg(b => ({ ...b, bg_gradient_from: e.target.value }))}
                                                className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500" />
                                        </label>
                                        <label className="flex items-center gap-1.5 text-xs text-slate-400">
                                            끝
                                            <input type="color" value={bg.bg_gradient_to ?? '#0f172a'} onChange={e => setBg(b => ({ ...b, bg_gradient_to: e.target.value }))}
                                                className="w-9 h-8 rounded bg-transparent border border-slate-700 cursor-pointer" />
                                            <input value={bg.bg_gradient_to ?? ''} onChange={e => setBg(b => ({ ...b, bg_gradient_to: e.target.value }))}
                                                className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500" />
                                        </label>
                                        <label className="flex items-center gap-1.5 text-xs text-slate-400">
                                            각도
                                            <input type="number" min={0} max={360} value={bg.bg_gradient_angle}
                                                onChange={e => setBg(b => ({ ...b, bg_gradient_angle: Math.max(0, Math.min(360, Number(e.target.value) || 0)) }))}
                                                className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white text-center focus:outline-none focus:border-indigo-500" />
                                            °
                                        </label>
                                    </div>
                                )}
                                {bg.bg_type === 'image' && (
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-2">
                                            <label className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                                                bgUploading ? 'bg-slate-800 text-slate-500' : 'bg-slate-800 text-slate-300 hover:text-white'
                                            }`}>
                                                {bgUploading ? <Loader2 size={12} className="inline animate-spin" /> : null}
                                                {bgUploading ? ' 업로드 중…' : bg.bg_image_url ? '이미지 교체' : '이미지 업로드'}
                                                <input type="file" accept="image/*" className="hidden" disabled={bgUploading}
                                                    onChange={e => { handleBgUpload(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                                            </label>
                                            {bg.bg_image_url && (
                                                <button type="button" onClick={() => setBg(b => ({ ...b, bg_image_url: null }))}
                                                    className="text-xs text-slate-500 hover:text-red-400 transition-colors">제거</button>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-slate-600 ko-normal">
                                            PNG/JPEG 등 어떤 형식이든 올리면 브라우저에서 WebP로 변환하고 긴 변 1200×2000px 이내로 줄여서 저장합니다(권장 비율 3:5). 업로드 후 "배경 저장"을 눌러야 반영됩니다.
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* 미리보기 — 실제 카드와 같은 상단 어둡기 오버레이(15→45%) + 능력치 영역 35% 다크 레이어 */}
                            <div>
                                <p className="text-[10px] text-slate-600 ko-normal mb-1.5">미리보기{bg.bg_type === 'team' ? ' (예: 골든스테이트)' : ''}</p>
                                <div className="rounded-xl border border-slate-700 overflow-hidden flex flex-col aspect-[3/4.6]" style={{ background: previewBackground }}>
                                    <div className="h-6 flex items-center justify-center text-[10px] font-bold uppercase tracking-wide text-white/70 bg-black/25 border-b border-white/10 truncate px-2">{selected.name}</div>
                                    <div className="flex-1 flex flex-col items-center justify-center px-2" style={{ background: 'linear-gradient(180deg, rgba(2,6,23,.15) 0%, rgba(2,6,23,.45) 100%)' }}>
                                        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-[#fb7185] via-[#e11d48] to-[#ff1457] text-white text-sm font-black flex items-center justify-center self-start">85</div>
                                        <div className="mt-auto text-sm font-black text-white">선수 이름</div>
                                        <div className="text-[11px] text-white/70 mb-2">팀명 · SF</div>
                                    </div>
                                    <div className="px-2 py-2 border-t border-white/10 space-y-1" style={{ background: 'rgba(2,6,23,.35)' }}>
                                        {[82, 74, 68, 88].map((v, i) => (
                                            <div key={i} className="flex items-center gap-1">
                                                <span className="w-6 text-[10px] font-semibold text-white">{['OFF','DEF','PLM','ATH'][i]}</span>
                                                <span className="flex-1 h-[6px] rounded-full bg-slate-800 overflow-hidden"><span className="block h-full rounded-full bg-[#38d100]" style={{ width: `${v}%` }} /></span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
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
