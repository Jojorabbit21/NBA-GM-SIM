
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';

/**
 * 선수 프로필 "샷 차트" 탭용 — 한 선수의 개별 슛 이벤트(x/y 좌표 포함, courtCoordinates.ts
 * 기준 풀코트 x:0~94ft/y:0~50ft)만 서버에서 걸러서 가져온다.
 *
 * game_pbp.shot_events는 경기당 JSONB 배열이라, 클라이언트에서 room 전체 게임을 불러와
 * playerId로 필터링하면(useLeagueRawStats의 공유 쿼리에 shot_events를 얹는 방식) 시즌
 * 전체 슛 데이터를 통째로 전송하게 된다 — 1,329경기짜리 방 기준 실측 약 80MB, 13초.
 * 대신 Postgres RPC(get_player_shot_events, migrations/player_shot_events_rpc.sql)가
 * jsonb_array_elements로 서버 안에서 unnest+필터링해 결과(보통 수백 건)만 반환한다.
 * isFinal 리빌 게이팅(multiGameReveal.ts의 10분 룰)도 이 RPC 안에서 동일하게 적용됨.
 */
export function usePlayerShotEvents(roomId: string | undefined, playerId: string | undefined) {
    return useQuery({
        queryKey: ['playerShotEvents', roomId, playerId],
        enabled: !!roomId && !!playerId,
        queryFn: async () => {
            const { data, error } = await supabase.rpc('get_player_shot_events', {
                p_room_id: roomId,
                p_player_id: playerId,
            });
            if (error) throw error;
            return (data ?? []) as any[];
        },
    });
}
