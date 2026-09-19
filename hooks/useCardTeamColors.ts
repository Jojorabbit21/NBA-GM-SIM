// useCardTeamColors.ts — 카드 전용 팀별 컬러 오버라이드(meta_card_team_colors) 맵.
// 개인 팩 드래프트 카드처럼 어드민 밖에서 카드 배경을 그리는 곳이 쓴다. 행이 없는 팀은 맵에
// 없으므로 resolveCardTeamGradient()가 TEAM_COLORS로 폴백한다.
import { useQuery } from '@tanstack/react-query';
import { fetchCardTeamColors } from '../services/cardTeamColorService';
import type { CardTeamColor } from '../utils/cardBackground';

export const CARD_TEAM_COLORS_QUERY_KEY = ['cardTeamColors'] as const;

export function useCardTeamColors(enabled = true): Record<string, CardTeamColor> {
    const { data } = useQuery({
        queryKey: CARD_TEAM_COLORS_QUERY_KEY,
        enabled,
        // 전역 기본값(staleTime: Infinity + localStorage 영속화)을 상속하면 어드민이 컬러를 바꿔도
        // 영원히 옛 값이 남는다(usePersonalDraftStatus의 같은 교훈). 5분 정도면 충분히 신선하다.
        staleTime: 5 * 60 * 1000,
        queryFn: fetchCardTeamColors,
    });
    return data ?? {};
}
