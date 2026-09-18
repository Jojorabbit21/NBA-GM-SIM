// usePersonalDraft.ts — 토너먼트 개인 팩 드래프트 화면(PersonalDraftView) 상태 훅.
// docs/plan/tournament-personal-pack-draft-plan.md Phase 5 / 3.5.
//
// - 진행 상태는 전부 서버(personal_draft_progress)가 소유 — 이 훅은 RPC 응답을 받아 표시용으로
//   선수 row를 하이드레이트하고, 픽 타이머 카운트다운만 로컬에서 돌린다.
// - 타이머 기준 시각은 서버가 돌려주는 packStartedAt + pickTimerSec. 클라이언트 시계 오차는
//   serverNow와 Date.now()의 차이를 offset으로 잡아 보정한다.
// - 로컬 카운트다운이 0에 닿으면 get_or_generate_round_pack을 다시 호출 — 서버가 만료를
//   판정하면 자동 지명 후 다음 라운드 팩을 돌려주므로 클라이언트는 그 결과를 그대로 반영만 한다
//   (클라이언트가 직접 자동 지명을 하지 않는다 — 만료 판정의 단일 주체는 서버).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { mapRawPlayerToRuntimePlayer } from '../services/dataMapper';
import {
    getOrGenerateRoundPack,
    startPersonalDraft,
    submitPersonalDraftPick,
    type PersonalDraftPackState,
} from '../services/multi/personalDraft';
import type { PersonalDraftFormat } from '../services/multi/personalDraftFormat';
import type { Player } from '../types';

/** 카드/로스터 표시용 — Player에 소속 원팀(meta_players.base_team_id)만 덧붙인 형태. */
export interface PersonalDraftPlayer extends Player {
    /** meta_players.base_team_id — 은퇴 레전드 등은 null(카드 로고/팀명 생략). */
    baseTeamId: string | null;
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
    useCustomOverrides: boolean;
}

interface UsePersonalDraftResult {
    packState: PersonalDraftPackState | null;
    poolPlayers: PersonalDraftPlayer[];
    roster: PersonalDraftRosterEntry[];
    isLoading: boolean;
    isSubmitting: boolean;
    error: string | null;
    /** 남은 초(정수, 0 이상). 타이머 없음/완료 상태면 null. */
    timeRemaining: number | null;
    /** 직전 동기화에서 서버가 자동 지명한 카드 수 — 화면에서 안내 배너로 쓴다. */
    lastAutoPicked: number;
    submitPick: (sourcePlayerId: string) => Promise<boolean>;
    refresh: () => Promise<void>;
}

const PLAYER_SELECT = 'id, name, position, draft_year, base_attributes, tendencies, base_team_id';

export function usePersonalDraft({ roomId, teamId, format, useCustomOverrides }: UsePersonalDraftParams): UsePersonalDraftResult {
    const [packState, setPackState]       = useState<PersonalDraftPackState | null>(null);
    const [poolPlayers, setPoolPlayers]   = useState<PersonalDraftPlayer[]>([]);
    const [roster, setRoster]             = useState<PersonalDraftRosterEntry[]>([]);
    const [isLoading, setIsLoading]       = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError]               = useState<string | null>(null);
    const [lastAutoPicked, setLastAutoPicked] = useState(0);
    const [timeRemaining, setTimeRemaining]   = useState<number | null>(null);

    // 서버 시계 - 로컬 시계 (ms). 응답을 받을 때마다 갱신.
    const clockOffsetRef = useRef(0);
    // 같은 팩에 대해 만료 재동기화를 한 번만 보내기 위한 키(packStartedAt).
    const expiredSyncKeyRef = useRef<string | null>(null);
    // 하이드레이트한 선수 캐시 — 팩이 바뀌어도 같은 선수는 재조회하지 않는다.
    const playerCacheRef = useRef<Map<string, PersonalDraftPlayer>>(new Map());
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const hydratePlayers = useCallback(async (ids: string[]): Promise<Map<string, PersonalDraftPlayer>> => {
        const cache = playerCacheRef.current;
        const missing = Array.from(new Set(ids)).filter(id => !cache.has(id));
        if (missing.length > 0) {
            const { data, error: qErr } = await supabase
                .from('meta_players')
                .select(PLAYER_SELECT)
                .in('id', missing);
            if (qErr) throw new Error(qErr.message);
            for (const raw of data ?? []) {
                const mapped = mapRawPlayerToRuntimePlayer(raw, useCustomOverrides, true) as PersonalDraftPlayer;
                mapped.baseTeamId = (raw as { base_team_id?: string | null }).base_team_id ?? null;
                cache.set(String(raw.id), mapped);
            }
        }
        return cache;
    }, [useCustomOverrides]);

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
        const cache = await hydratePlayers(rows.map(r => String(r.source_player_id)));
        if (!mountedRef.current) return;
        setRoster(rows.map(r => ({
            instanceId:     String(r.instance_id),
            sourcePlayerId: String(r.source_player_id),
            draftedRound:   Number(r.drafted_round),
            player:         cache.get(String(r.source_player_id)) ?? null,
        })));
    }, [roomId, teamId, hydratePlayers]);

    /** RPC 응답 하나를 화면 상태로 반영 — 팩 하이드레이트 + 시계 오프셋 + (자동 지명 시) 로스터 재조회. */
    const applyState = useCallback(async (state: PersonalDraftPackState, opts?: { rosterChanged?: boolean }) => {
        clockOffsetRef.current = Date.parse(state.serverNow) - Date.now();
        const ids = state.offeredPool ?? [];
        const cache = await hydratePlayers(ids);
        if (!mountedRef.current) return;
        setPoolPlayers(ids.map(id => cache.get(id)).filter((p): p is PersonalDraftPlayer => !!p));
        setPackState(state);
        setLastAutoPicked(state.autoPicked ?? 0);
        if (opts?.rosterChanged || (state.autoPicked ?? 0) > 0) {
            await loadRoster();
        }
    }, [hydratePlayers, loadRoster]);

    const refresh = useCallback(async () => {
        if (!roomId || !teamId) return;
        const { data, error: rpcErr } = await getOrGenerateRoundPack(roomId, teamId);
        if (!mountedRef.current) return;
        if (rpcErr || !data) { setError(rpcErr ?? '팩을 불러오지 못했습니다.'); return; }
        setError(null);
        try {
            await applyState(data, { rosterChanged: true });
        } catch (e) {
            if (mountedRef.current) setError(e instanceof Error ? e.message : '선수 정보를 불러오지 못했습니다.');
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
                setError(e instanceof Error ? e.message : '선수 정보를 불러오지 못했습니다.');
            } finally {
                if (!cancelled && mountedRef.current) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
        // applyState는 useCustomOverrides/roomId/teamId에만 의존 — 그 값들이 바뀌면 재시작이 맞다.
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
    const submitPick = useCallback(async (sourcePlayerId: string): Promise<boolean> => {
        if (!roomId || !teamId || isSubmitting) return false;
        setIsSubmitting(true); setError(null);
        try {
            const { data, error: rpcErr } = await submitPersonalDraftPick(roomId, teamId, sourcePlayerId);
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
        packState, poolPlayers, roster,
        isLoading, isSubmitting, error,
        timeRemaining, lastAutoPicked,
        submitPick, refresh,
    };
}
