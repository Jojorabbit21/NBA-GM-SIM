
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';
import { loadRoom } from '../services/multi/roomPersistence';
import type { MultiDraftState, DraftPoolPlayer } from '../types/multiDraft';

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
 * - 초기 로드: loadRoom → draft_state + meta_players
 * - Realtime: rooms 테이블 변경 감지 → draftState 업데이트
 * - submitPick: submit-pick EF 호출
 */
export function useLeagueDraft(
    roomId:  string | null,
    session: Session | null
): UseLeagueDraftReturn {
    const userId = session?.user?.id ?? null;

    const [draftState,  setDraftState]  = useState<MultiDraftState | null>(null);
    const [poolPlayers, setPoolPlayers] = useState<DraftPoolPlayer[]>([]);
    const [isLoading,   setIsLoading]   = useState(true);
    const [isSubmitting,setIsSubmitting]= useState(false);

    // 타이머
    const [timeRemaining, setTimeRemaining] = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── 초기 로드 ─────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!roomId) { setIsLoading(false); return; }
        let cancelled = false;

        (async () => {
            setIsLoading(true);
            const room = await loadRoom(roomId);
            if (cancelled || !room) { setIsLoading(false); return; }

            const state = room.draft_state as MultiDraftState | null;
            if (state) {
                setDraftState(state);
                // 선수 풀 로드 (poolIds 기준, OVR 내림차순)
                const { data } = await supabase
                    .from('meta_players')
                    .select('id, name, position, ovr, salary')
                    .order('ovr', { ascending: false });
                if (!cancelled) setPoolPlayers((data ?? []) as DraftPoolPlayer[]);
            }
            if (!cancelled) setIsLoading(false);
        })();

        return () => { cancelled = true; };
    }, [roomId]);

    // ── Realtime 구독 ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!roomId) return;

        const channel = supabase
            .channel(`draft-${roomId}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
                (payload) => {
                    const updated = (payload.new as any)?.draft_state as MultiDraftState | null;
                    if (updated) setDraftState(updated);
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [roomId]);

    // ── 타이머 ────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (!draftState || draftState.status !== 'active') { setTimeRemaining(0); return; }

        const update = () => {
            const elapsed = (Date.now() - new Date(draftState.currentPickStartedAt).getTime()) / 1000;
            setTimeRemaining(Math.max(0, Math.round(draftState.pickDurationSec - elapsed)));
        };
        update();
        timerRef.current = setInterval(update, 500);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [draftState?.currentPickIndex, draftState?.currentPickStartedAt]);

    // ── 파생 값 ───────────────────────────────────────────────────────────────
    const currentPickEntry = draftState?.pickOrder[draftState.currentPickIndex] ?? null;
    const isMyTurn         = !!(currentPickEntry && currentPickEntry.userId === userId && draftState?.status === 'active');
    const myTeamId         = draftState?.pickOrder.find(e => e.userId === userId)?.teamId ?? null;
    const myPicks          = (draftState?.picks ?? [])
        .filter(p => p.userId === userId)
        .map(p => p.playerId);

    // ── submitPick ────────────────────────────────────────────────────────────
    const submitPick = useCallback(async (playerId: string): Promise<{ error: string | null }> => {
        if (!roomId || !session) return { error: 'not authenticated' };
        if (!isMyTurn)           return { error: 'not your turn' };

        setIsSubmitting(true);
        try {
            const { error } = await supabase.functions.invoke('submit-pick', {
                body: { roomId, playerId },
            });
            if (error) return { error: error.message };
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
