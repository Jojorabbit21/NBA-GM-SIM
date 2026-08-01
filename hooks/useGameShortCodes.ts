
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';

/**
 * 방(room)의 game_short_codes 매핑을 한 번에 불러와 game_id → short_code 조회를 제공한다.
 * [2026-08-01] 경기 상세 URL(T_R1_M0_G1 등 내부 저장 키 노출)을 짧은 코드로 대체하기 위한 훅.
 * 매핑이 없는 경기(구 리그, 소급 미적용)는 원래 game_id로 폴백.
 */
export function useGameShortCodes(roomId: string | undefined): {
    getGameUrlId: (gameId: string) => string;
    isLoading: boolean;
} {
    const [map, setMap] = useState<Map<string, string>>(new Map());
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!roomId) { setIsLoading(false); return; }
        let cancelled = false;
        setIsLoading(true);

        supabase
            .from('game_short_codes')
            .select('game_id, short_code')
            .eq('room_id', roomId)
            .then(({ data, error }) => {
                if (cancelled) return;
                if (error) { console.error('[useGameShortCodes]', error.message); setIsLoading(false); return; }
                setMap(new Map((data ?? []).map(r => [r.game_id as string, r.short_code as string])));
                setIsLoading(false);
            });

        return () => { cancelled = true; };
    }, [roomId]);

    const getGameUrlId = useCallback((gameId: string) => map.get(gameId) ?? gameId, [map]);

    return { getGameUrlId, isLoading };
}
