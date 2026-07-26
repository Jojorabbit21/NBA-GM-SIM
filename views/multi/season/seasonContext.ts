
import { createContext, useContext } from 'react';
import type { MultiGameDataReturn } from '../../../hooks/useMultiGameData';

// MultiSeasonLayout과 그 하위 라우트(로스터/순위/일정/리더보드/전술/경기)가 공유하는
// useMultiGameData() 컨텍스트. LeagueLayout의 useLeagueContext()와 동일한 패턴이다.
// MultiHeader/TournamentChampionModal도 MultiSeasonLayout의 자식으로 렌더링되므로 이
// 컨텍스트를 그대로 소비할 수 있다 — MultiSeasonLayout.tsx 안에 이 Context를 두면
// MultiSeasonLayout → MultiHeader → MultiSeasonLayout(컨텍스트 훅 import) 순환 임포트가
// 생기므로 별도 파일로 분리했다.
export const SeasonCtx = createContext<MultiGameDataReturn | null>(null);

export function useSeasonContext(): MultiGameDataReturn {
    const ctx = useContext(SeasonCtx);
    if (!ctx) {
        throw new Error('useSeasonContext must be used inside <MultiSeasonLayout>');
    }
    return ctx;
}
