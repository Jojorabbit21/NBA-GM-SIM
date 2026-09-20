// usePersonalDraft.ts — 토너먼트 개인 팩 드래프트 화면(PersonalDraftView) 상태 훅.
// docs/plan/tournament-personal-pack-draft-plan.md Phase 5 / 3.5.
//
// - 진행 상태는 전부 서버(personal_draft_progress)가 소유 — 이 훅은 RPC 응답을 받아 표시용으로
//   카드 row를 하이드레이트하고, 픽 타이머 카운트다운만 로컬에서 돌린다.
// - 타이머 기준 시각은 서버가 돌려주는 packStartedAt + pickTimerSec. 클라이언트 시계 오차는
//   serverNow와 Date.now()의 차이를 offset으로 잡아 보정한다.
// - 로컬 카운트다운이 0에 닿으면 get_or_generate_round_pack을 다시 호출 — 서버가 만료를
//   판정하면 자동 지명 후 다음 라운드 팩을 돌려주므로 클라이언트는 그 결과를 그대로 반영만 한다
//   (클라이언트가 직접 자동 지명을 하지 않는다 — 만료 판정의 단일 주체는 서버).
//
// [2026-09-20 안 A 배선] 팩/로스터의 id는 meta_players가 아니라 시즌 카드(meta_player_cards.id)다.
// 카드 row(자체 능력치 + manual_ovr) → Player 로 매핑하고, 카드가 속한 컬렉션(헤더/배경),
// 카드별 배경 이미지, 실제 선수의 그 시즌 기록(meta_players.career_history)을 함께 붙인다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { mapRawPlayerToRuntimePlayer } from '../services/dataMapper';
import {
    getOrGenerateRoundPack,
    startPersonalDraft,
    submitPersonalDraftPicks,
    type PersonalDraftPackState,
} from '../services/multi/personalDraft';
import { normalizeCollectionWeights, type PersonalDraftFormat } from '../services/multi/personalDraftFormat';
import type { CardBackgroundSettings } from '../utils/cardBackground';
import type { Player, PlayerStats } from '../types';

export interface PersonalDraftCollectionInfo {
    id: string;
    name: string;
    bg: CardBackgroundSettings;
}

/** 카드/로스터 표시용 — Player(카드 능력치 기반)에 카드 메타를 덧붙인 형태. id === 카드 id. */
export interface PersonalDraftPlayer extends Player {
    /** 카드의 소속팀(meta_player_cards.base_team_id) — 은퇴 레전드 등은 null(카드 로고/팀명 생략). */
    baseTeamId: string | null;
    /** meta_player_cards.id (== id) */
    cardId: string;
    /** 실제 선수 meta_players.id — 같은 선수 다른 시즌 카드 판별/기록 조회용 */
    realPlayerId: string;
    /** 카드 시즌 라벨(예: '2020-21') */
    season: string;
    /** [2026-09-20] 에디션 이름(meta_card_editions.name). 기본 카드는 null. 카드 시즌 줄에 "시즌 · 에디션"으로 표시 */
    edition: string | null;
    /** 카드별 커스텀 배경 이미지(없으면 null → 컬렉션 배경 → 팀 그라디언트) */
    bgImageUrl: string | null;
    /** 이 카드를 표시할 때 쓰는 컬렉션(라운드 컬렉션 우선, 없으면 첫 소속 컬렉션, 어디에도 없으면 null) */
    collection: PersonalDraftCollectionInfo | null;
    /** 실제 선수의 카드 시즌 정규시즌 기록(career_history). 없으면 null → 호버 카드에서 기록 섹션 숨김 */
    seasonStats: PlayerStats | null;
}

export interface PersonalDraftRosterEntry {
    instanceId: string;
    sourcePlayerId: string;
    draftedRound: number;
    player: PersonalDraftPlayer | null;
}

interface UsePersonalDraftParams {
    roomId: string | null;
    /** 내 league_teams.id — 없으면(팀 미확정) 훅이 아무것도 하지 않는다. */
    teamId: string | null;
    format: PersonalDraftFormat | null;
    /** 카드는 자체 능력치라 피크 오버라이드가 적용되지 않는다(시그니처 호환용). */
    useCustomOverrides: boolean;
}

interface UsePersonalDraftResult {
    packState: PersonalDraftPackState | null;
    poolPlayers: PersonalDraftPlayer[];
    roster: PersonalDraftRosterEntry[];
    /** 컬렉션 id → 정보 (라운드 구성 표시용) */
    collectionsById: Map<string, PersonalDraftCollectionInfo>;
    isLoading: boolean;
    isSubmitting: boolean;
    error: string | null;
    /** 남은 초(정수, 0 이상). 타이머 없음/완료 상태면 null. */
    timeRemaining: number | null;
    /** 직전 동기화에서 서버가 자동 지명한 카드 수 — 화면에서 안내 배너로 쓴다. */
    lastAutoPicked: number;
    /** [2026-09-20] 동시 지명 — 현재 라운드의 picksRemaining 장을 한 번에 제출. */
    submitPicks: (cardIds: string[]) => Promise<boolean>;
    refresh: () => Promise<void>;
}

const CARD_SELECT = 'id, source_player_id, season, name, position, height, weight, base_team_id, base_attributes, tendencies, manual_ovr, bg_image_url, edition_id, edition:meta_card_editions(name)';
const COLLECTION_SELECT = 'id, name, bg_type, bg_color, bg_gradient_from, bg_gradient_to, bg_gradient_angle, bg_image_url';

interface CachedCard {
    base: Omit<PersonalDraftPlayer, 'collection'>;
    collectionIds: string[];
}

/** career_history 한 줄(경기당 평균)을 Player.stats(누적 합계) 형태로 — 호버 팝업이 g로 나눠 평균을 다시 만든다. */
function careerLineToStats(line: Record<string, any>): PlayerStats | null {
    const g = Number(line?.gp ?? 0);
    if (!g || g <= 0) return null;
    const tot = (k: string) => Math.round((Number(line[k]) || 0) * g * 10) / 10;
    return {
        g, gs: Number(line.gs ?? 0),
        mp: tot('min'), pts: tot('pts'), reb: tot('reb'), offReb: tot('oreb'), defReb: tot('dreb'),
        ast: tot('ast'), stl: tot('stl'), blk: tot('blk'), tov: tot('tov'), tovForced: 0, pf: tot('pf'),
        techFouls: 0, flagrantFouls: 0,
        fgm: tot('fgm'), fga: tot('fga'), p3m: tot('fg3m'), p3a: tot('fg3a'), ftm: tot('ftm'), fta: tot('fta'),
    } as unknown as PlayerStats;
}

/** 같은 시즌 행이 여러 개(트레이드)면 출전 경기가 가장 많은 행(합계 'TOT' 행이 있으면 그것). */
function pickSeasonLine(history: any[], season: string): Record<string, any> | null {
    const rows = (history ?? []).filter(r => r && r.season === season);
    if (rows.length === 0) return null;
    return rows.reduce((best, r) => (Number(r.gp ?? 0) > Number(best.gp ?? 0) ? r : best), rows[0]);
}

export function usePersonalDraft({ roomId, teamId, format }: UsePersonalDraftParams): UsePersonalDraftResult {
    const [packState, setPackState]       = useState<PersonalDraftPackState | null>(null);
    const [poolPlayers, setPoolPlayers]   = useState<PersonalDraftPlayer[]>([]);
    const [roster, setRoster]             = useState<PersonalDraftRosterEntry[]>([]);
    const [collectionsById, setCollectionsById] = useState<Map<string, PersonalDraftCollectionInfo>>(new Map());
    const [isLoading, setIsLoading]       = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError]               = useState<string | null>(null);
    const [lastAutoPicked, setLastAutoPicked] = useState(0);
    const [timeRemaining, setTimeRemaining]   = useState<number | null>(null);

    // 서버 시계 - 로컬 시계 (ms). 응답을 받을 때마다 갱신.
    const clockOffsetRef = useRef(0);
    // 같은 팩에 대해 만료 재동기화를 한 번만 보내기 위한 키(packStartedAt).
    const expiredSyncKeyRef = useRef<string | null>(null);
    // 하이드레이트한 카드 캐시 — 팩이 바뀌어도 같은 카드는 재조회하지 않는다.
    const cardCacheRef = useRef<Map<string, CachedCard>>(new Map());
    const collectionsRef = useRef<Map<string, PersonalDraftCollectionInfo> | null>(null);
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const loadCollections = useCallback(async (): Promise<Map<string, PersonalDraftCollectionInfo>> => {
        if (collectionsRef.current) return collectionsRef.current;
        const { data, error: qErr } = await supabase.from('meta_player_card_collections').select(COLLECTION_SELECT);
        if (qErr) throw new Error(qErr.message);
        const map = new Map<string, PersonalDraftCollectionInfo>();
        for (const c of (data ?? []) as any[]) {
            map.set(String(c.id), {
                id: String(c.id),
                name: String(c.name),
                bg: {
                    bg_type: c.bg_type ?? 'team',
                    bg_color: c.bg_color ?? null,
                    bg_gradient_from: c.bg_gradient_from ?? null,
                    bg_gradient_to: c.bg_gradient_to ?? null,
                    bg_gradient_angle: c.bg_gradient_angle ?? 165,
                    bg_image_url: c.bg_image_url ?? null,
                },
            });
        }
        collectionsRef.current = map;
        if (mountedRef.current) setCollectionsById(map);
        return map;
    }, []);

    /** 카드 id 목록을 캐시에 채운다(카드 row + 컬렉션 멤버십 + 실제 선수 시즌 기록). */
    const hydrateCards = useCallback(async (ids: string[]): Promise<Map<string, CachedCard>> => {
        const cache = cardCacheRef.current;
        const missing = Array.from(new Set(ids)).filter(id => !cache.has(id));
        if (missing.length === 0) return cache;

        const [{ data: cards, error: cErr }, { data: members, error: mErr }] = await Promise.all([
            supabase.from('meta_player_cards').select(CARD_SELECT).in('id', missing),
            supabase.from('meta_player_card_collection_members').select('card_id, collection_id').in('card_id', missing),
        ]);
        if (cErr) throw new Error(cErr.message);
        if (mErr) throw new Error(mErr.message);

        const realIds = Array.from(new Set((cards ?? []).map((c: any) => String(c.source_player_id))));
        const { data: reals, error: rErr } = realIds.length > 0
            ? await supabase.from('meta_players').select('id, career_history').in('id', realIds)
            : { data: [], error: null };
        if (rErr) throw new Error(rErr.message);
        const historyById = new Map((reals ?? []).map((r: any) => [String(r.id), Array.isArray(r.career_history) ? r.career_history : []]));

        const membersByCard = new Map<string, string[]>();
        for (const m of (members ?? []) as any[]) {
            const list = membersByCard.get(String(m.card_id)) ?? [];
            list.push(String(m.collection_id));
            membersByCard.set(String(m.card_id), list);
        }

        for (const raw of (cards ?? []) as any[]) {
            const id = String(raw.id);
            const mapped = mapRawPlayerToRuntimePlayer(raw, false, true) as PersonalDraftPlayer;
            const line = pickSeasonLine(historyById.get(String(raw.source_player_id)) ?? [], String(raw.season));
            const seasonStats = line ? careerLineToStats(line) : null;
            const base: Omit<PersonalDraftPlayer, 'collection'> = {
                ...mapped,
                id,
                cardId: id,
                realPlayerId: String(raw.source_player_id),
                season: String(raw.season),
                edition: raw.edition?.name ?? null,
                baseTeamId: raw.base_team_id ?? null,
                bgImageUrl: raw.bg_image_url ?? null,
                seasonStats,
                stats: seasonStats ?? mapped.stats,
            };
            cache.set(id, { base, collectionIds: membersByCard.get(id) ?? [] });
        }
        return cache;
    }, []);

    /** 캐시된 카드 + 라운드 컬렉션 우선순위로 표시용 Player 조립. */
    const buildPlayer = useCallback((
        cached: CachedCard,
        preferredCollectionIds: string[] | undefined,
        collections: Map<string, PersonalDraftCollectionInfo>,
    ): PersonalDraftPlayer => {
        const preferred = (preferredCollectionIds ?? []).find(id => cached.collectionIds.includes(id));
        const chosen = preferred ?? cached.collectionIds[0] ?? null;
        return { ...cached.base, collection: chosen ? (collections.get(chosen) ?? null) : null };
    }, []);

    // 카드 표시용 컬렉션 우선순위: 포맷의 등장 컬렉션(가중치 큰 순) → 라운드 collectionIds
    const roundCollectionIds = useCallback((round: number): string[] | undefined => {
        const weighted = normalizeCollectionWeights(format?.collectionWeights).map(w => w.id);
        if (weighted.length > 0) return weighted;
        return format?.rounds?.[round - 1]?.collectionIds;
    }, [format]);

    const loadRoster = useCallback(async () => {
        if (!roomId || !teamId) return;
        const { data, error: qErr } = await supabase
            .from('room_player_instances')
            .select('instance_id, source_player_id, drafted_round, created_at')
            .eq('room_id', roomId)
            .eq('team_id', teamId)
            .order('created_at', { ascending: true });
        if (qErr) throw new Error(qErr.message);
        const rows = data ?? [];
        const [cache, collections] = await Promise.all([
            hydrateCards(rows.map(r => String(r.source_player_id))),
            loadCollections(),
        ]);
        if (!mountedRef.current) return;
        setRoster(rows.map(r => {
            const cached = cache.get(String(r.source_player_id));
            return {
                instanceId:     String(r.instance_id),
                sourcePlayerId: String(r.source_player_id),
                draftedRound:   Number(r.drafted_round),
                player:         cached ? buildPlayer(cached, roundCollectionIds(Number(r.drafted_round)), collections) : null,
            };
        }));
    }, [roomId, teamId, hydrateCards, loadCollections, buildPlayer, roundCollectionIds]);

    /** RPC 응답 하나를 화면 상태로 반영 — 팩 하이드레이트 + 시계 오프셋 + (자동 지명 시) 로스터 재조회. */
    const applyState = useCallback(async (state: PersonalDraftPackState, opts?: { rosterChanged?: boolean }) => {
        clockOffsetRef.current = Date.parse(state.serverNow) - Date.now();
        const ids = state.offeredPool ?? [];
        const [cache, collections] = await Promise.all([hydrateCards(ids), loadCollections()]);
        if (!mountedRef.current) return;
        const preferred = roundCollectionIds(state.currentRound);
        setPoolPlayers(ids.map(id => cache.get(id)).filter((c): c is CachedCard => !!c).map(c => buildPlayer(c, preferred, collections)));
        setPackState(state);
        setLastAutoPicked(state.autoPicked ?? 0);
        if (opts?.rosterChanged || (state.autoPicked ?? 0) > 0) {
            await loadRoster();
        }
    }, [hydrateCards, loadCollections, buildPlayer, roundCollectionIds, loadRoster]);

    const refresh = useCallback(async () => {
        if (!roomId || !teamId) return;
        const { data, error: rpcErr } = await getOrGenerateRoundPack(roomId, teamId);
        if (!mountedRef.current) return;
        if (rpcErr || !data) { setError(rpcErr ?? '팩을 불러오지 못했습니다.'); return; }
        setError(null);
        try {
            await applyState(data, { rosterChanged: true });
        } catch (e) {
            if (mountedRef.current) setError(e instanceof Error ? e.message : '카드 정보를 불러오지 못했습니다.');
        }
    }, [roomId, teamId, applyState]);

    // ── 최초 진입: start(멱등) → 팩 + 로스터 ───────────────────────────────────
    useEffect(() => {
        if (!roomId || !teamId || !format) { setIsLoading(false); return; }
        let cancelled = false;
        setIsLoading(true);
        (async () => {
            const { data, error: rpcErr } = await startPersonalDraft(roomId, teamId);
            if (cancelled || !mountedRef.current) return;
            if (rpcErr || !data) { setError(rpcErr ?? '드래프트를 시작하지 못했습니다.'); setIsLoading(false); return; }
            try {
                await applyState(data, { rosterChanged: true });
                setError(null);
            } catch (e) {
                setError(e instanceof Error ? e.message : '카드 정보를 불러오지 못했습니다.');
            } finally {
                if (!cancelled && mountedRef.current) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
        // applyState는 roomId/teamId/format에만 의존 — 그 값들이 바뀌면 재시작이 맞다.
    }, [roomId, teamId, format, applyState]);

    // ── 픽 타이머 카운트다운 ──────────────────────────────────────────────────
    const deadlineMs = useMemo(() => {
        if (!packState || packState.status !== 'in_progress') return null;
        if (!packState.packStartedAt || packState.pickTimerSec == null) return null;
        return Date.parse(packState.packStartedAt) + packState.pickTimerSec * 1000;
    }, [packState]);

    useEffect(() => {
        if (deadlineMs == null) { setTimeRemaining(null); return; }
        const tick = () => {
            const nowServer = Date.now() + clockOffsetRef.current;
            const remain = Math.max(0, Math.ceil((deadlineMs - nowServer) / 1000));
            setTimeRemaining(remain);
            if (remain <= 0) {
                const key = packState?.packStartedAt ?? null;
                if (key && expiredSyncKeyRef.current !== key) {
                    expiredSyncKeyRef.current = key;
                    // 서버가 만료 판정 + 자동 지명 후 다음 팩을 돌려준다. 아직 서버 시계상 만료 전이면
                    // 같은 팩이 그대로 돌아오고, 그 경우 다음 tick에서 다시 0이 되지만 key가 같아
                    // 재요청은 하지 않는다 — 그땐 스케줄러 스윕(30초 주기) 또는 유저의 다음 조작이 처리.
                    void refresh();
                }
            }
        };
        tick();
        const id = setInterval(tick, 500);
        return () => clearInterval(id);
    }, [deadlineMs, packState?.packStartedAt, refresh]);

    // ── 픽 제출 ───────────────────────────────────────────────────────────────
    const submitPicks = useCallback(async (cardIds: string[]): Promise<boolean> => {
        if (!roomId || !teamId || isSubmitting || cardIds.length === 0) return false;
        setIsSubmitting(true); setError(null);
        try {
            const { data, error: rpcErr } = await submitPersonalDraftPicks(roomId, teamId, cardIds);
            if (!mountedRef.current) return false;
            if (rpcErr || !data) { setError(rpcErr ?? '지명에 실패했습니다.'); return false; }
            await applyState(data, { rosterChanged: true });
            if (data.expired) {
                setError('제한시간이 지나 자동 지명되었습니다.');
                return false;
            }
            return true;
        } catch (e) {
            if (mountedRef.current) setError(e instanceof Error ? e.message : '지명에 실패했습니다.');
            return false;
        } finally {
            if (mountedRef.current) setIsSubmitting(false);
        }
    }, [roomId, teamId, isSubmitting, applyState]);

    return {
        packState, poolPlayers, roster, collectionsById,
        isLoading, isSubmitting, error,
        timeRemaining, lastAutoPicked,
        submitPicks, refresh,
    };
}
