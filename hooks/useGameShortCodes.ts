
import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../services/supabaseClient';

/**
 * 방(room)의 game_short_codes 매핑을 한 번에 불러와 game_id ↔ short_code 조회를 제공한다.
 * [2026-08-01] 경기 상세 URL(T_R1_M0_G1 등 내부 저장 키 노출)을 짧은 코드로 대체하기 위한 훅.
 * 매핑이 없는 경기(구 리그, 소급 미적용)는 원래 game_id로 폴백.
 * [2026-08-28] resolveGameId(역방향, short_code → game_id) 추가 — MultiSeasonLayout이
 * 전역 GameDateStrip에서 현재 보고 있는 경기(URL의 짧은 코드)를 하이라이트하려면 실제
 * game_id로 되돌려야 하는데, 기존엔 MultiGamePbpView.tsx가 이 매핑과 별개로 자체
 * supabase 쿼리를 또 날리고 있었다 — 이미 로드해둔 forward map을 그대로 뒤집어 재사용.
 */
export function useGameShortCodes(roomId: string | undefined): {
    getGameUrlId: (gameId: string) => string;
    resolveGameId: (urlId: string) => string;
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

    const reverseMap = useMemo(() => new Map(Array.from(map, ([gameId, shortCode]) => [shortCode, gameId])), [map]);
    const resolveGameId = useCallback((urlId: string) => reverseMap.get(urlId) ?? urlId, [reverseMap]);

    return { getGameUrlId, resolveGameId, isLoading };
}
