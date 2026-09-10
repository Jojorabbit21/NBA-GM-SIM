
import { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';

/**
 * 방(room)의 game_short_codes 매핑을 한 번에 불러와 game_id ↔ short_code 조회를 제공한다.
 * [2026-08-01] 경기 상세 URL(T_R1_M0_G1 등 내부 저장 키 노출)을 짧은 코드로 대체하기 위한 훅.
 * 매핑이 없는 경기(구 리그, 소급 미적용)는 원래 game_id로 폴백.
 * [2026-08-28] resolveGameId(역방향, short_code → game_id) 추가 — MultiSeasonLayout이
 * 전역 GameDateStrip에서 현재 보고 있는 경기(URL의 짧은 코드)를 하이라이트하려면 실제
 * game_id로 되돌려야 하는데, 기존엔 MultiGamePbpView.tsx가 이 매핑과 별개로 자체
 * supabase 쿼리를 또 날리고 있었다 — 이미 로드해둔 forward map을 그대로 뒤집어 재사용.
 *
 * [2026-09-07] 예전엔 useState+useEffect로 각 호출부가 독립적으로 직접 fetch했다 —
 * 이 훅을 부르는 곳이 8군데(MultiSeasonLayout/MultiRosterView/MultiTacticsView/
 * MultiScheduleView/MultiSeasonPage/MultiNewsFeedView/MultiPlayerDetailView/
 * TournamentBracketView)나 되고, 그중 여러 곳이 항상 동시에 마운트돼 있어(예: 홈 화면
 * 진입 시 MultiSeasonLayout+MultiSeasonPage 둘 다) 캐시 공유 없이 매번 중복 fetch가
 * 나갔다(네트워크 탭 실측으로 발견). react-query로 옮기면 같은 roomId를 쓰는 호출은
 * 전부 fetch 하나로 묶인다 — usePlayerShortCodes.ts와 동일 패턴. game_short_codes는
 * finalize.ts가 시즌 파이널라이즈 시점에 한 번에 다 생성하고 이후 정상 시즌 진행 중엔
 * 안 바뀌므로(플레이오프 브라켓 재생성 시의 삭제만 예외) staleTime을 무한으로 둔다.
 */
export function useGameShortCodes(roomId: string | undefined): {
    getGameUrlId: (gameId: string) => string;
    resolveGameId: (urlId: string) => string;
    isLoading: boolean;
} {
    const { data: rows, isLoading } = useQuery({
        queryKey: ['gameShortCodes', roomId],
        enabled: !!roomId,
        staleTime: Infinity,
        gcTime: Infinity,
        queryFn: async (): Promise<{ game_id: string; short_code: string }[]> => {
            const { data, error } = await supabase
                .from('game_short_codes')
                .select('game_id, short_code')
                .eq('room_id', roomId!);
            if (error) throw error;
            return (data ?? []) as { game_id: string; short_code: string }[];
        },
    });

    const map = useMemo(() => new Map((rows ?? []).map(r => [r.game_id, r.short_code])), [rows]);
    const reverseMap = useMemo(() => new Map((rows ?? []).map(r => [r.short_code, r.game_id])), [rows]);

    const getGameUrlId = useCallback((gameId: string) => map.get(gameId) ?? gameId, [map]);
    const resolveGameId = useCallback((urlId: string) => reverseMap.get(urlId) ?? urlId, [reverseMap]);

    return { getGameUrlId, resolveGameId, isLoading };
}
