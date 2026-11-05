// useMyProfile.ts — 내 profiles 행(닉네임·프로필 색) 조회 (2026-11-05)
// 사이드바 프로필 아이콘·로비 계정 영역이 같은 queryKey로 공유. 닉네임 설정 모달 저장 후 MY_PROFILE_KEY로 무효화.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';

export interface MyProfile { nickname: string | null; avatar_color: string | null; }

export const MY_PROFILE_KEY = (userId: string | null | undefined) => ['myProfile', userId ?? null] as const;

export function useMyProfile(userId: string | null | undefined) {
    return useQuery({
        queryKey: MY_PROFILE_KEY(userId),
        enabled: !!userId,
        staleTime: 5 * 60_000,
        queryFn: async (): Promise<MyProfile | null> => {
            const { data, error } = await supabase.from('profiles').select('nickname, avatar_color').eq('id', userId!).maybeSingle();
            if (error) throw error;
            return (data as MyProfile | null) ?? null;
        },
    });
}
