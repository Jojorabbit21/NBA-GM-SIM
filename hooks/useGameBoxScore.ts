
import { useQuery } from '@tanstack/react-query';
import { loadGameBoxScore } from '../services/multi/gameQueries';

// [2026-09-01] 뉴스피드 개인 활약/연속기록 카드가 인라인 박스스코어 테이블을 보여주기 위해
// 신설 — 카드 하나가 선택돼 렌더링될 때만(뉴스피드는 좌측 리스트+우측 디테일 레이아웃이라
// 한 번에 카드 하나만 그려짐) 조회한다. 끝난 경기의 박스스코어는 이후 안 바뀌므로
// staleTime: Infinity(gameLeadersCache.ts 등이 쓰는 "종료 경기 = 불변" 전제와 동일).
export function useGameBoxScore(roomId: string | undefined, gameId: string | null | undefined) {
    return useQuery({
        queryKey: ['gameBoxScore', roomId, gameId],
        enabled: !!roomId && !!gameId,
        staleTime: Infinity,
        queryFn: () => loadGameBoxScore(roomId!, gameId!),
    });
}
