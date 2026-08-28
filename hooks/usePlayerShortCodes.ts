
import { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';

/**
 * 선수 프로필 URL에 노출되는 DB UUID를 간단한 번호(1, 2, 3…)로 대체.
 * game_short_codes(방마다 DB에 영구 저장)와 달리, meta_players는 리그와 무관한
 * 공유·읽기전용 글로벌 테이블이라 별도 매핑 테이블 없이 정렬 순서만으로 번호를
 * 매길 수 있다 — created_at은 CSV 일괄 업로드 특성상 동시각 배치가 많아(854건 중
 * 유니크 123개) id로 타이브레이크해 항상 같은 순서가 나오게 한다.
 * meta_players는 사실상 불변(읽기전용)이므로 staleTime을 무한으로 두고 세션당 한 번만 조회.
 */
export function usePlayerShortCodes(): {
    getPlayerUrlId: (playerId: string) => string;
    resolvePlayerId: (urlId: string) => string;
    isLoading: boolean;
} {
    const { data: orderedIds, isLoading } = useQuery({
        queryKey: ['metaPlayerOrder'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('meta_players')
                .select('id')
                .order('created_at', { ascending: true })
                .order('id', { ascending: true });
            if (error) throw error;
            return (data ?? []).map(r => r.id as string);
        },
        staleTime: Infinity,
        gcTime: Infinity,
    });

    const { toShort, toFull } = useMemo(() => {
        const toShort = new Map<string, string>();
        const toFull = new Map<string, string>();
        (orderedIds ?? []).forEach((id, i) => {
            const short = String(i + 1);
            toShort.set(id, short);
            toFull.set(short, id);
        });
        return { toShort, toFull };
    }, [orderedIds]);

    // 매핑에 없는 선수(신규 추가분 등)는 원래 UUID로 폴백.
    const getPlayerUrlId = useCallback((playerId: string) => toShort.get(playerId) ?? playerId, [toShort]);
    const resolvePlayerId = useCallback((urlId: string) => toFull.get(urlId) ?? urlId, [toFull]);

    return { getPlayerUrlId, resolvePlayerId, isLoading };
}
