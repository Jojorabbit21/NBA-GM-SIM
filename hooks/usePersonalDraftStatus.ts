// usePersonalDraftStatus.ts — "내 팀의 개인 팩 드래프트가 끝났는가" (사이드바/헤더/로비 공용).
// personal_draft_progress(room_id, team_id).status를 react-query로 읽고, 같은 행의 변경을
// Realtime으로 구독해 드래프트 화면에서 마지막 픽을 하면 다른 화면의 메뉴가 바로 바뀌게 한다.
// 개인 드래프트 리그가 아니거나 내 팀이 없으면 비활성(status null).
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';

export type PersonalDraftStatus = 'not_started' | 'in_progress' | 'completed';

export function usePersonalDraftStatus(
    roomId: string | null | undefined,
    myTeamDbId: string | null | undefined,
    enabledFlag: boolean,
): PersonalDraftStatus | null {
    const queryClient = useQueryClient();
    const enabled = enabledFlag && !!roomId && !!myTeamDbId;
    const queryKey = ['personalDraftStatus', roomId, myTeamDbId];

    const { data = null } = useQuery({
        queryKey,
        enabled,
        // [2026-09-18 Fix] 앱 전역 QueryClient 기본값이 staleTime: Infinity(+ localStorage 영속화,
        // index.tsx) — 이 값을 상속하면 "드래프트 완료" 같은 상태 변화가 한 번 캐시된 뒤엔 Realtime
        // 무효화 신호를 놓칠 경우(예: 마지막 픽이 PersonalDraftView에서 일어날 때 이 훅을 쓰는
        // Sidebar/Header/Lobby 어느 것도 마운트돼 있지 않았던 경우) 하드 리프레시를 해도 절대
        // 재조회되지 않는다(복원된 영속 캐시가 "영원히 신선함"으로 취급됨) — 실제 리포트된 버그.
        // 이 쿼리는 전역 기본값을 오버라이드해 마운트될 때마다 항상 재조회한다.
        staleTime: 0,
        queryFn: async (): Promise<PersonalDraftStatus> => {
            const { data: row, error } = await supabase
                .from('personal_draft_progress')
                .select('status')
                .eq('room_id', roomId!)
                .eq('team_id', myTeamDbId!)
                .maybeSingle();
            if (error) throw error;
            if (!row) return 'not_started';
            return row.status === 'completed' ? 'completed' : 'in_progress';
        },
    });

    useEffect(() => {
        if (!enabled) return;
        const channel = supabase
            .channel(`personal-draft-status-${roomId}-${myTeamDbId}`)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'personal_draft_progress', filter: `team_id=eq.${myTeamDbId}` },
                () => queryClient.invalidateQueries({ queryKey }))
            .subscribe();
        return () => { supabase.removeChannel(channel); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, roomId, myTeamDbId]);

    return enabled ? data : null;
}
