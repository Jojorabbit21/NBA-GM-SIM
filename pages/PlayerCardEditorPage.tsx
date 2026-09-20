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
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Loader2, Save, Trash2, Copy, Search, AlertCircle, ImagePlus, X } from 'lucide-react';
import { searchPlayers, fetchPlayerById, type MetaPlayerRow } from '../services/admin/playerAdminService';
import {
    listCardsForPlayer, createCardFromCopy, updateCard, deleteCard, uploadCardBackground, fetchCardById,
    fetchAvailableSeasons, fetchSeasonStatLine, type PlayerCardRow, type UpdateCardPatch,
} from '../services/admin/playerCardAdminService';
import { buildCardBackground, buildCardBottomGradient, resolveCardTeamGradient } from '../utils/cardBackground';
import { convertImageToWebp } from '../utils/imageToWebp';
import { useCardTeamColors } from '../hooks/useCardTeamColors';
import { getRealTeamLogoUrl } from '../utils/constants';
import {
    listCollections, listCollectionsForCard, addCardToCollection, removeCardFromCollection,
    type CardCollectionRow,
} from '../services/admin/playerCardCollectionAdminService';
import { ATTR_GROUPS, ATTR_KR_LABEL } from '../data/attributeConfig';
import { mapRawPlayerToRuntimePlayer } from '../services/dataMapper';
import { calculateOvr } from '../utils/ovrUtils';
import { OvrBadge } from '../components/common/OvrBadge';
import { TEAM_DATA } from '../data/teamData';
import { CARD_EXTRA_TEAMS } from '../data/cardTeams';
import { listEditions, type CardEditionRow } from '../services/admin/cardEditionAdminService';

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
const TEAM_OPTIONS = Object.values(TEAM_DATA).sort((a, b) => a.city.localeCompare(b.city));

/** [2026-09-18] manual_ovr가 있으면 그대로 쓰고(카드 전용 고정값), 없으면 지금처럼
 *  base_attributes 기반 동적 계산. meta_players/일반 선수 OVR 파이프라인은 건드리지 않음 —
 *  이 함수는 카드 목록·미리보기 표시 전용. */
function computeOvrPreview(card: PlayerCardRow): number | null {
    if (card.manual_ovr != null) return card.manual_ovr;
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
    // [2026-09-20] 에디션 — 어드민이 만든 목록(meta_card_editions)에서만 선택. ''=기본 카드
    const [editions, setEditions] = useState<CardEditionRow[]>([]);
    const [newEditionId, setNewEditionId] = useState<string>('');
    useEffect(() => {
        listEditions().then(rows => {
            setEditions(rows);
            // 에디션은 필수 — 첫 항목을 기본 선택
            setNewEditionId(prev => prev || rows[0]?.id || '');
        }).catch(() => setEditions([]));
    }, []);
    const editionName = useCallback((id: string | null | undefined) => (id ? editions.find(e => e.id === id)?.name ?? '?' : null), [editions]);
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

    // ── 카드 컬렉션 — 전체 목록은 한 번만 로드, 현재 카드의 소속 여부는 카드가 바뀔 때마다 ──
    const [allCollections, setAllCollections] = useState<CardCollectionRow[]>([]);
    const [cardCollectionIds, setCardCollectionIds] = useState<Set<string>>(new Set());
    const [collectionToggling, setCollectionToggling] = useState<string | null>(null);

    useEffect(() => {
        listCollections().then(rows => setAllCollections(rows)).catch(() => setAllCollections([]));
    }, []);

    // ── [2026-09-20] 카드별 커스텀 배경 이미지 + 미리보기 ─────────────────────────
    // 해석 순서: 카드 이미지 → (미리보기용으로 고른) 소속 컬렉션 배경 → 팀 그라디언트.
    // 카드는 여러 컬렉션에 속할 수 있어 미리보기에 쓸 컬렉션을 셀렉터로 고른다(기본: 첫 소속 컬렉션).
    const cardTeamColors = useCardTeamColors();
    const [bgUploading, setBgUploading] = useState(false);
    const [bgErr, setBgErr] = useState<string | null>(null);
    const [previewCollectionId, setPreviewCollectionId] = useState<string>('');
    const memberCollections = useMemo(
        () => allCollections.filter(c => cardCollectionIds.has(c.id)),
        [allCollections, cardCollectionIds],
    );
    const previewCollection = useMemo(
        () => memberCollections.find(c => c.id === previewCollectionId) ?? memberCollections[0] ?? null,
        [memberCollections, previewCollectionId],
    );
    const previewBackground = useMemo(() => buildCardBackground(
        previewCollection,
        resolveCardTeamGradient(draft.base_team_id || null, cardTeamColors),
        draft.bg_image_url ?? null,
    ), [previewCollection, draft.base_team_id, draft.bg_image_url, cardTeamColors]);

    const loadIntoEditor = useCallback((card: PlayerCardRow) => {
        setEditing(card);
        setDraft({
            season: card.season, name: card.name, position: card.position,
            edition_id: card.edition_id,
            height: card.height ?? '', weight: card.weight ?? '', base_team_id: card.base_team_id ?? '',
            attrs: { ...(card.base_attributes ?? {}) },
            manualOvrEnabled: card.manual_ovr != null,
            manualOvr: card.manual_ovr ?? '',
            bg_image_url: card.bg_image_url ?? null,
        });
        setSaveOk(false); setSaveErr(null); setBgErr(null); setPreviewCollectionId('');
        fetchSeasonStatLine(card.source_player_id, card.season).then(setStatLine).catch(() => setStatLine(null));
        setCardCollectionIds(new Set());
        listCollectionsForCard(card.id).then(ids => setCardCollectionIds(new Set(ids))).catch(() => setCardCollectionIds(new Set()));
    }, []);

    // [2026-09-20] ?cardId= 로 진입(카드 컬렉션 탭 그리드 클릭) — 카드 → 원본 선수 → 편집기에 로드. 한 번만.
    const [searchParams, setSearchParams] = useSearchParams();
    const deepLinkCardId = searchParams.get('cardId');
    useEffect(() => {
        if (!deepLinkCardId) return;
        let cancelled = false;
        (async () => {
            try {
                const card = await fetchCardById(deepLinkCardId);
                if (!card || cancelled) return;
                const player = await fetchPlayerById(card.source_player_id);
                if (!player || cancelled) return;
                setSelectedPlayer(player);
                setQuery(player.name);
                loadIntoEditor(card);
            } catch (e) {
                if (!cancelled) setListErr(e instanceof Error ? e.message : '카드를 열지 못했습니다.');
            } finally {
                // 파라미터는 지워 새로고침/뒤로가기 때 다시 열리지 않게
                if (!cancelled) setSearchParams({}, { replace: true });
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deepLinkCardId]);

    const handleBgUpload = async (file: File | null) => {
        if (!editing || !file) return;
        setBgUploading(true); setBgErr(null);
        try {
            // 컬렉션 배경과 같은 파이프라인: 어떤 형식이든 브라우저에서 WebP 변환(+긴 변 1200/2000px 이내), 5MB 검사
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
            const url = await uploadCardBackground(editing.id, blob, ext, contentType);
            setDraft((d: any) => ({ ...d, bg_image_url: url }));
        } catch (e) {
            setBgErr(e instanceof Error ? e.message : '업로드에 실패했습니다.');
        } finally {
            setBgUploading(false);
        }
    };

    const handleToggleCollection = async (collectionId: string, isMember: boolean) => {
        if (!editing) return;
        setCollectionToggling(collectionId);
        try {
            if (isMember) {
                await removeCardFromCollection(collectionId, editing.id);
                setCardCollectionIds(prev => { const next = new Set(prev); next.delete(collectionId); return next; });
            } else {
                await addCardToCollection(collectionId, editing.id);
                setCardCollectionIds(prev => new Set(prev).add(collectionId));
            }
        } catch (e) {
            setSaveErr(e instanceof Error ? e.message : '컬렉션 변경에 실패했습니다.');
        } finally {
            setCollectionToggling(null);
        }
    };

    const handleCreate = async () => {
        if (!selectedPlayer || !newSeason.trim() || !newEditionId) return;
        setCreating(true); setListErr(null);
        try {
            const card = await createCardFromCopy(selectedPlayer.id, newSeason.trim(), newEditionId);
            setNewSeason('');
            await reloadCards(selectedPlayer.id);
            loadIntoEditor(card);
        } catch (e) {
            setListErr(e instanceof Error ? e.message : '카드를 만들지 못했습니다(같은 시즌·에디션 카드가 이미 있을 수 있습니다).');
        } finally {
            setCreating(false);
        }
    };

    const setAttr = (key: string, value: number) => {
        setDraft((d: any) => ({ ...d, attrs: { ...d.attrs, [key]: value } }));
    };

    const draftOvrPreview = useMemo(() => {
        if (!editing) return null;
        if (draft.manualOvrEnabled) return draft.manualOvr === '' ? null : Number(draft.manualOvr);
        return computeOvrPreview({ ...editing, position: draft.position, base_attributes: draft.attrs, manual_ovr: null });
    }, [editing, draft.position, draft.attrs, draft.manualOvrEnabled, draft.manualOvr]);

    const handleSave = async () => {
        if (!editing) return;
        setSaving(true); setSaveErr(null); setSaveOk(false);
        try {
            const patch: UpdateCardPatch = {
                season: String(draft.season).trim(),
                name: String(draft.name).trim(),
                position: draft.position,
                edition_id: draft.edition_id,
                height: draft.height === '' ? null : Number(draft.height),
                weight: draft.weight === '' ? null : Number(draft.weight),
                base_team_id: draft.base_team_id || null,
                // [2026-09-20] 유효 OVR(고정값 또는 계산값)을 base_attributes.ovr에도 기록 — 서버 자동 지명 정렬
                // (personal_draft_card_ovr)의 폴백 기준. 포맷의 cardOvrById가 있으면 그게 우선이라 표시엔 영향 없음.
                base_attributes: {
                    ...draft.attrs,
                    age: draft.attrs.age != null ? Number(draft.attrs.age) : undefined,
                    ...(draftOvrPreview != null ? { ovr: draftOvrPreview } : {}),
                },
                manual_ovr: draft.manualOvrEnabled && draft.manualOvr !== '' ? Number(draft.manualOvr) : null,
                bg_image_url: draft.bg_image_url ?? null,
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
                                        <span>{c.season}{c.edition_id ? <span className="font-normal opacity-80"> · {editionName(c.edition_id)}</span> : null}</span>
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
                                    disabled={creating || !newSeason.trim() || !newEditionId}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
                                >
                                    {creating ? <Loader2 size={11} className="animate-spin" /> : <Copy size={11} />}
                                    복사
                                </button>
                            </div>
                            <datalist id="available-seasons">
                                {availableSeasons.map(s => <option key={s} value={s} />)}
                            </datalist>
                            <div className="flex items-center gap-1.5">
                                <label className="text-xs text-slate-400 ko-normal shrink-0">에디션</label>
                                <select value={newEditionId} onChange={e => setNewEditionId(e.target.value)}
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500">
                                    {editions.length === 0 && <option value="">에디션 없음</option>}
                                    {editions.map(ed => <option key={ed.id} value={ed.id}>{ed.name}</option>)}
                                </select>
                            </div>
                            <p className="text-[11px] text-slate-600 ko-normal">
                                시즌과 에디션은 필수입니다. 같은 선수·같은 시즌이라도 에디션이 다르면 제한 없이 만들 수 있고, 같은 에디션은 1장뿐입니다.
                                {editions.length === 0 ? ' 에디션은 "카드 컬렉션" 탭의 "에디션 관리"에서 먼저 만들어주세요.' : ''}
                            </p>
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
                                    <h2 className="text-lg font-bold text-white">{draft.name} · {draft.season}{draft.edition_id ? ` · ${editionName(draft.edition_id)}` : ''}</h2>
                                    <p className="text-xs text-slate-500 ko-normal">원본 선수: {editing.source_player_id}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 flex-wrap justify-end">
                                {/* [2026-09-18] 이 카드에 한정된 OVR 고정값 — meta_players/일반 선수
                                    OVR 계산 파이프라인과 완전히 분리, 여기서만 적용됨. 꺼두면 지금처럼
                                    아래 능력치 기반으로 항상 다시 계산. */}
                                <div className="flex items-center gap-2 shrink-0">
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={draft.manualOvrEnabled}
                                            onChange={e => setDraft((d: any) => ({ ...d, manualOvrEnabled: e.target.checked }))}
                                            className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                                        />
                                        <span className="text-xs text-slate-400 ko-normal">OVR 고정값</span>
                                    </label>
                                    {/* [2026-09-20] 카드 전용 세 자리 OVR 허용(0~999, DB CHECK와 동일).
                                        일반 선수 OVR은 여전히 99가 상한 — 이 입력만 예외. */}
                                    {draft.manualOvrEnabled && (
                                        <input
                                            type="number" min={0} max={999}
                                            value={draft.manualOvr}
                                            onChange={e => setDraft((d: any) => ({ ...d, manualOvr: e.target.value === '' ? '' : Math.max(0, Math.min(999, Number(e.target.value))) }))}
                                            className="w-16 bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-indigo-500"
                                        />
                                    )}
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
                                <label className="text-xs text-slate-400 ko-normal block mb-1">에디션</label>
                                <select value={draft.edition_id} onChange={e => setDraft((d: any) => ({ ...d, edition_id: e.target.value }))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500">
                                    {editions.map(ed => <option key={ed.id} value={ed.id}>{ed.name}</option>)}
                                </select>
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
                                    {/* [2026-09-20] 카드 전용 확장 팀(data/cardTeams.ts) — 시애틀 에메랄즈 등 */}
                                    {CARD_EXTRA_TEAMS.length > 0 && (
                                        <optgroup label="확장 팀">
                                            {CARD_EXTRA_TEAMS.map(t => <option key={t.id} value={t.id}>{t.city} {t.name}</option>)}
                                        </optgroup>
                                    )}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 ko-normal block mb-1">나이(그 시즌)</label>
                                <input type="number" value={draft.attrs.age ?? ''} onChange={e => setAttr('age', Number(e.target.value))}
                                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
                            </div>
                        </div>

                        {/* 카드 컬렉션 — 체크 즉시 반영(저장 버튼과 무관) */}
                        <div>
                            <label className="text-xs text-slate-400 ko-normal block mb-1.5">카드 컬렉션</label>
                            {allCollections.length === 0 ? (
                                <p className="text-xs text-slate-600 ko-normal">아직 만든 컬렉션이 없습니다 — "카드 컬렉션" 탭에서 먼저 만들어주세요.</p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {allCollections.map(col => {
                                        const isMember = cardCollectionIds.has(col.id);
                                        return (
                                            <button
                                                key={col.id}
                                                type="button"
                                                onClick={() => handleToggleCollection(col.id, isMember)}
                                                disabled={collectionToggling === col.id}
                                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-colors disabled:opacity-40 ${
                                                    isMember ? 'bg-indigo-600 text-white' : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'
                                                }`}
                                            >
                                                {collectionToggling === col.id && <Loader2 size={10} className="animate-spin" />}
                                                {col.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* 카드 배경 이미지(카드별 커스텀) + 미리보기 — 이미지는 업로드 즉시 미리보기에 반영되고 "저장"을 눌러야 DB에 기록 */}
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-4 bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs text-slate-400 ko-normal">카드 배경 이미지</label>
                                    {bgErr && <span className="text-xs text-red-400 ko-normal">{bgErr}</span>}
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                                        bgUploading ? 'bg-slate-800 text-slate-500' : 'bg-slate-800 text-slate-300 hover:text-white'
                                    }`}>
                                        {bgUploading ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
                                        {bgUploading ? '업로드 중…' : draft.bg_image_url ? '이미지 교체' : '이미지 업로드'}
                                        <input type="file" accept="image/*" className="hidden" disabled={bgUploading}
                                            onChange={e => { handleBgUpload(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                                    </label>
                                    {draft.bg_image_url && (
                                        <button type="button" onClick={() => setDraft((d: any) => ({ ...d, bg_image_url: null }))}
                                            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-slate-500 hover:text-red-400 transition-colors">
                                            <X size={12} />제거
                                        </button>
                                    )}
                                </div>
                                <p className="text-[11px] text-slate-600 ko-normal">
                                    이 카드에만 쓰는 배경입니다. 없으면 소속 컬렉션의 배경, 그것도 없으면 팀 컬러 그라디언트가 적용됩니다.
                                    어떤 형식이든 WebP로 변환해 저장하며(권장 비율 3:4.6), 업로드 후 "저장"을 눌러야 반영됩니다.
                                </p>
                                <div className="flex items-center gap-2">
                                    <label className="text-xs text-slate-400 ko-normal shrink-0">미리보기 컬렉션</label>
                                    {memberCollections.length === 0 ? (
                                        <span className="text-xs text-slate-600 ko-normal">소속 컬렉션 없음 — 팀 컬러 그라디언트로 표시</span>
                                    ) : (
                                        <select value={previewCollection?.id ?? ''} onChange={e => setPreviewCollectionId(e.target.value)}
                                            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500">
                                            {memberCollections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    )}
                                </div>
                            </div>

                            {/* 미리보기 — 드래프트 카드와 같은 구성(컬렉션 헤더 / OVR 배지 / 중앙 로고 / 하단 텍스트 그라디언트) */}
                            <div>
                                <p className="text-[10px] text-slate-600 ko-normal mb-1.5">미리보기</p>
                                <div className="relative rounded-xl border border-slate-700 overflow-hidden flex flex-col aspect-[3/4.6]" style={{ background: previewBackground }}>
                                    <div className="h-6 flex items-center justify-center text-[10px] font-bold uppercase tracking-wide text-white/70 bg-black/50 border-b border-white/10 truncate px-2">
                                        {previewCollection?.name ?? ''}
                                    </div>
                                    <div className="relative flex-1 flex flex-col px-2 pt-2">
                                        <div className="self-start">{draftOvrPreview != null && <OvrBadge value={draftOvrPreview} size="md" />}</div>
                                        {draft.base_team_id && (
                                            <img src={getRealTeamLogoUrl(draft.base_team_id)} alt="" draggable={false}
                                                className="absolute inset-0 m-auto w-[40%] aspect-square object-contain pointer-events-none"
                                                style={{ filter: 'drop-shadow(0 6px 14px rgba(0,0,0,.6))' }} />
                                        )}
                                        <div className="mt-auto -mx-2 px-2 pt-8 pb-2 text-center relative z-10"
                                            style={{ background: buildCardBottomGradient(previewCollection) }}>
                                            <div className="text-sm font-black text-white truncate">{draft.name}</div>
                                            <div className="text-[11px] text-white/70">{draft.season}</div>
                                        </div>
                                    </div>
                                </div>
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
