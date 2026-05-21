
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import type { MultiDraftState, DraftPickEntry, DraftPoolPlayer } from '../types/multiDraft';

export interface UseLeagueDraftReturn {
    draftState:       MultiDraftState | null;
    poolPlayers:      DraftPoolPlayer[];
    isLoading:        boolean;

    // 파생 값
    isMyTurn:         boolean;
    currentPickEntry: { userId: string; teamId: string } | null;
    timeRemaining:    number;   // 초
    myTeamId:         string | null;
    myPicks:          string[]; // playerId[]

    submitPick:       (playerId: string) => Promise<{ error: string | null }>;
    isSubmitting:     boolean;
}

/**
 * 멀티 드래프트 상태 훅.
 *
 * 개선 (2026-04-21): draft_state JSONB 전체 구독 → 분리된 구조
 *   - 초기 로드: rooms(draft_config + draft_cursor) + draft_picks 테이블
 *   - Realtime #1: rooms UPDATE → draft_cursor (100바이트) — 차례 전환 감지
 *   - Realtime #2: draft_picks INSERT → 새 픽 행 수신
 *   → 브로드캐스트 페이로드 크기: ~73KB → ~200바이트 (300배 축소)
 */
export function useLeagueDraft(
    roomId:  string | null,
    session: Session | null
): UseLeagueDraftReturn {
    const userId = session?.user?.id ?? null;

    const [draftState,   setDraftState]   = useState<MultiDraftState | null>(null);
    const [poolPlayers,  setPoolPlayers]  = useState<DraftPoolPlayer[]>([]);
    const [isLoading,    setIsLoading]    = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 타이머
    const [timeRemaining, setTimeRemaining] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // 타임아웃 자동픽용 — 최신 poolPlayers / draftedIds를 클로저 없이 참조
    const poolPlayersRef = useRef<DraftPoolPlayer[]>([]);
    const draftedIdsRef  = useRef<Set<string>>(new Set());
    useEffect(() => {
        poolPlayersRef.current = poolPlayers;
        draftedIdsRef.current  = new Set(draftState?.draftedIds);
    }, [poolPlayers, draftState?.draftedIds]);

    // ── 초기 로드 ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!roomId) { setIsLoading(false); return; }
        let cancelled = false;

        (async () => {
            setIsLoading(true);

            // draft_config + draft_cursor + draft_picks 병렬 로드
            const [roomRes, picksRes] = await Promise.all([
                supabase
                    .from('rooms')
                    .select('draft_config, draft_cursor')
                    .eq('id', roomId)
                    .single(),
                supabase
                    .from('draft_picks')
                    .select('*')
                    .eq('room_id', roomId)
                    .order('pick_index'),
            ]);

            if (cancelled) return;

            const config = (roomRes.data as any)?.draft_config;
            const cursor = (roomRes.data as any)?.draft_cursor;

            if (config && cursor) {
                const picks = buildPickEntries(picksRes.data ?? []);
                setDraftState(assembleState(config, cursor, picks));

                // 선수 풀 로드 — poolIds를 100개씩 병렬 청크로 분할하여 URL 길이 제한 회피
                const poolIds: string[] = config.poolIds ?? [];
                if (poolIds.length > 0) {
                    const CHUNK = 100;
                    const chunks: string[][] = [];
                    for (let i = 0; i < poolIds.length; i += CHUNK) chunks.push(poolIds.slice(i, i + CHUNK));
                    const results = await Promise.all(
                        chunks.map(ids =>
                            supabase
                                .from('meta_players')
                                .select('id, name, position, salary, base_attributes')
                                .in('id', ids)
                        )
                    );
                    if (!cancelled) {
                        const all = results.flatMap(r => r.data ?? []) as DraftPoolPlayer[];
                        setPoolPlayers(all);
                    }
                }
            }

            if (!cancelled) setIsLoading(false);
        })();

        return () => { cancelled = true; };
    }, [roomId]);

    // ── Realtime 구독 ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!roomId) return;

        // [1] rooms UPDATE → draft_cursor 변경 감지 (pause/resume/timer reset 포함)
        const cursorChannel = supabase
            .channel(`draft-cursor-${roomId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
                (payload) => {
                    const newCursor = (payload.new as any)?.draft_cursor;
                    if (!newCursor) return;
                    setDraftState(prev => prev ? {
                        ...prev,
                        status:               newCursor.status,
                        currentPickIndex:     newCursor.currentPickIndex,
                        currentPickStartedAt: newCursor.currentPickStartedAt ?? '',
                        pausedAt:             newCursor.pausedAt,
                    } : prev);
                }
            )
            .subscribe();

        // [2] draft_picks INSERT → 새 픽 행 수신 (picks / draftedIds 갱신)
        const picksChannel = supabase
            .channel(`draft-picks-${roomId}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'draft_picks', filter: `room_id=eq.${roomId}` },
                (payload) => {
                    const row = payload.new as any;
                    const newPick = rowToPickEntry(row);
                    setDraftState(prev => {
                        if (!prev) return prev;
                        // 중복 방지 (낙관적 업데이트와 Realtime이 겹치는 경우)
                        if (prev.picks.some(p => p.pickIndex === newPick.pickIndex)) return prev;
                        return {
                            ...prev,
                            picks:      [...prev.picks, newPick],
                            draftedIds: [...prev.draftedIds, newPick.playerId],
                        };
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(cursorChannel);
            supabase.removeChannel(picksChannel);
        };
    }, [roomId]);

    // ── 타이머 ────────────────────────────────────────────────────────────────
    const timeoutFiredRef  = useRef(false);
    const aiFollowUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (aiFollowUpTimerRef.current) clearTimeout(aiFollowUpTimerRef.current);
        timeoutFiredRef.current = false; // 픽이 바뀔 때마다 리셋

        if (!draftState || draftState.status === 'pending' || draftState.status === 'completed') {
            setTimeRemaining(0);
            return;
        }

        if (draftState.status === 'paused') {
            return;
        }

        // status === 'active'
        const isAiPick = draftState.pickOrder[draftState.currentPickIndex]?.isAi === true;

        // AI 차례: AI_MIN_THINK_SEC(3s) 경과 직후 draft-cron 트리거 (1회)
        if (isAiPick) {
            aiFollowUpTimerRef.current = setTimeout(() => {
                supabase.functions.invoke('draft-cron').catch(() => {});
            }, 3500);
        }

        const update = () => {
            const elapsed = (Date.now() - new Date(draftState.currentPickStartedAt).getTime()) / 1000;
            const remaining = Math.max(0, Math.round(draftState.pickDurationSec - elapsed));
            setTimeRemaining(remaining);

            // 인간 차례 타임아웃 → RPC 직접 호출 (EF 콜드스타트 회피, 1회만)
            if (remaining === 0 && !isAiPick && !timeoutFiredRef.current) {
                timeoutFiredRef.current = true;

                // AI_MIN_THINK_SEC(3s) + 여유 1s 뒤 AI 차례 처리
                const triggerAiCron = () => {
                    supabase.functions.invoke('draft-cron').catch(() => {});
                    aiFollowUpTimerRef.current = setTimeout(() => {
                        supabase.functions.invoke('draft-cron').catch(() => {});
                    }, 4000);
                };

                const available = poolPlayersRef.current.find(
                    p => !draftedIdsRef.current.has(p.id)
                );

                if (available && roomId) {
                    // supabase.rpc()는 PromiseLike → .catch() 미지원, 2인자 .then() 사용
                    supabase.rpc('submit_draft_pick_v2', {
                        p_room_id:   roomId,
                        p_player_id: available.id,
                    }).then(triggerAiCron, triggerAiCron);
                } else {
                    triggerAiCron();
                }
            }
        };
        update();
        timerRef.current = setInterval(update, 500);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (aiFollowUpTimerRef.current) clearTimeout(aiFollowUpTimerRef.current);
        };
    }, [draftState?.currentPickIndex, draftState?.currentPickStartedAt, draftState?.status]);

    // ── 파생 값 ───────────────────────────────────────────────────────────────
    const currentPickEntry = draftState?.pickOrder[draftState.currentPickIndex] ?? null;
    const isMyTurn         = !!(currentPickEntry && currentPickEntry.userId === userId && draftState?.status === 'active');
    const myTeamId         = draftState?.pickOrder.find(e => e.userId === userId)?.teamId ?? null;
    const myPicks          = (draftState?.picks ?? [])
        .filter(p => p.userId === userId)
        .map(p => p.playerId);

    // ── submitPick ────────────────────────────────────────────────────────────
    // Edge Function 우회 → submit_draft_pick_v2 RPC 직접 호출 (latency ~350ms 절감)
    // RPC는 SECURITY DEFINER + auth.uid() 사용 → getUser() 네트워크 왕복 불필요
    const submitPick = useCallback(async (playerId: string): Promise<{ error: string | null }> => {
        if (!roomId || !session) return { error: 'not authenticated' };
        if (!isMyTurn)           return { error: 'not your turn' };

        setIsSubmitting(true);
        try {
            const { error } = await supabase.rpc('submit_draft_pick_v2', {
                p_room_id:   roomId,
                p_player_id: playerId,
                // p_player_name / p_position / p_ovr → RPC가 meta_players에서 직접 조회
                // p_user_id 생략 → RPC 내부에서 auth.uid() 사용
            });
            if (error) {
                const msg = error.message ?? '';
                if (msg.includes('not_your_turn'))   return { error: 'not your turn' };
                if (msg.includes('already_drafted')) return { error: 'player already drafted' };
                if (msg.includes('draft_not_active'))return { error: 'draft not active' };
                return { error: msg };
            }
            // 픽 성공 → AI 차례 즉시 트리거 + 4s 후 재트리거
            // 즉시 호출 시 AI elapsed < AI_MIN_THINK_SEC(3s)라 cron이 skip할 수 있으므로
            // 4s 후 follow-up으로 보장
            supabase.functions.invoke('draft-cron').catch(() => {});
            aiFollowUpTimerRef.current = setTimeout(() => {
                supabase.functions.invoke('draft-cron').catch(() => {});
            }, 4000);
            return { error: null };
        } finally {
            setIsSubmitting(false);
        }
    }, [roomId, session, isMyTurn]);

    return {
        draftState, poolPlayers, isLoading,
        isMyTurn, currentPickEntry, timeRemaining, myTeamId, myPicks,
        submitPick, isSubmitting,
    };
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

function rowToPickEntry(row: any): DraftPickEntry {
    return {
        pickIndex:  row.pick_index,
        round:      row.round,
        slot:       row.slot ?? 0,
        userId:     row.user_id ?? '',
        teamId:     row.team_id,
        playerId:   row.player_id,
        playerName: row.player_name,
        position:   row.position ?? '',
        ovr:        row.ovr ?? 0,
        pickedAt:   row.picked_at ?? '',
    };
}

function buildPickEntries(rows: any[]): DraftPickEntry[] {
    return rows.map(rowToPickEntry);
}

function assembleState(config: any, cursor: any, picks: DraftPickEntry[]): MultiDraftState {
    return {
        // draft_config (정적)
        format:          config.format          ?? 'snake',
        totalRounds:     config.totalRounds      ?? 10,
        pickDurationSec: config.pickDurationSec  ?? 30,
        teamCount:       config.teamCount        ?? 0,
        poolIds:         config.poolIds          ?? [],
        pickOrder:       config.pickOrder        ?? [],
        // draft_cursor (휘발)
        status:               cursor.status               ?? 'active',
        currentPickIndex:     cursor.currentPickIndex     ?? 0,
        currentPickStartedAt: cursor.currentPickStartedAt ?? '',
        pausedAt:             cursor.pausedAt,
        // draft_picks 테이블에서 재구성
        picks,
        draftedIds: picks.map(p => p.playerId),
    };
}
