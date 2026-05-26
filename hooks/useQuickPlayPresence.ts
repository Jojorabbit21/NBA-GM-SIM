
import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';

const CHANNEL_NAME = 'quickplay-presence';

/**
 * 퀵플레이 접속자 수 추적 훅 (Supabase Realtime Presence).
 * - 마운트 시 채널 join, 언마운트 시 자동 제거
 * - userId 없으면 익명 UUID로 참여
 */
export function useQuickPlayPresence(userId?: string | null): number {
    const [count, setCount] = useState(0);

    useEffect(() => {
        const key = userId ?? crypto.randomUUID();

        const channel = supabase.channel(CHANNEL_NAME, {
            config: { presence: { key } },
        });

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                setCount(Object.keys(state).length);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({ joined_at: new Date().toISOString() });
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId]);

    return count;
}
