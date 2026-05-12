
import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';

/**
 * 드래프트 룸 온라인 참여자 추적 훅 (Supabase Realtime Presence).
 *
 * - 마운트 시 채널에 track({ userId }) 전송
 * - 언마운트 시 채널 제거 (자동 offline 처리)
 * - 반환값: 현재 접속 중인 userId Set
 */
export function useDraftPresence(
    roomId: string | null,
    userId: string | null,
): Set<string> {
    const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!roomId || !userId) return;

        const channel = supabase.channel(`draft-presence-${roomId}`, {
            config: { presence: { key: userId } },
        });

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                setOnlineUserIds(new Set(Object.keys(state)));
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({ userId });
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [roomId, userId]);

    return onlineUserIds;
}
