// useAiGmProfiles.ts — 멀티 AI 팀 프런트 프로필 맵(team_slug → AiGmProfile). 원본은 meta_gms(30행).
// AI 팀의 프런트는 저장하지 않고 항상 슬러그로 찾는다(docs/plan/multi-ai-gm-profile-plan.md P1).
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { buildAiGmProfileMap, type AiGmProfile, type MetaGmRow } from '../services/multi/aiGmProfile';

export const AI_GM_PROFILES_QUERY_KEY = ['metaGms'] as const;

const META_GM_COLUMNS = 'team_id, gm_name, gm_title, president_name, president_title, personality_type, sliders';

async function fetchMetaGms(): Promise<MetaGmRow[]> {
    const { data, error } = await supabase.from('meta_gms').select(META_GM_COLUMNS);
    if (error) throw new Error(`meta_gms: ${error.message}`);
    return (data ?? []) as MetaGmRow[];
}

export function useAiGmProfiles(enabled = true): Map<string, AiGmProfile> {
    const { data } = useQuery({
        queryKey: AI_GM_PROFILES_QUERY_KEY,
        enabled,
        // 전역 기본값(staleTime: Infinity + localStorage 영속화)을 상속하면 meta_gms를 갱신해도 옛 프런트가
        // 계속 남는다(useCardTeamColors와 같은 교훈). 팀 호버 카드가 열릴 때마다 마운트되므로 0이면 호버마다
        // 재조회한다 — 5분이면 갱신은 반영되고 호버당 요청은 없다.
        staleTime: 5 * 60_000,
        queryFn: fetchMetaGms,
    });
    return useMemo(() => buildAiGmProfileMap(data ?? []), [data]);
}
