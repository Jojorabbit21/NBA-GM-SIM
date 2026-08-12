
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';

// 홈 로스터 위젯 / 로스터 화면 / 리더보드 화면이 각자 따로 meta_players+game_pbp를
// 긁어오던 걸 하나로 통합 — 같은 queryKey를 쓰는 useQuery라면 어느 화면에서 먼저
// 로드하든 나머지 두 화면은 캐시를 그대로 재사용해 로더 없이 즉시 뜬다.
// 화면별로 필요한 파생 데이터 모양이 달라서(로스터: Team[]+게임로그, 리더보드: Team[],
// 홈 위젯: 내 팀 선수만) select 옵션으로 각자 다르게 가공하되 원본 fetch는 공유한다.

export interface LeagueRawStatsData {
    playersRaw: any[];
    pbpRows: any[];
}

const RAW_PLAYER_COLS = 'id, name, position, base_attributes, tendencies';
const RAW_PBP_COLS = 'game_id, home_box, away_box, home_team_id, away_team_id, home_score, away_score, game_start_time';

export function useLeagueRawStats<T = LeagueRawStatsData>(
    roomId: string | undefined,
    allRosterIds: string[],
    select?: (data: LeagueRawStatsData) => T,
) {
    return useQuery({
        queryKey: ['leagueRawStats', roomId, allRosterIds.join(',')],
        enabled: allRosterIds.length > 0 && !!roomId,
        queryFn: async (): Promise<LeagueRawStatsData> => {
            const [playersRes, pbpRes] = await Promise.all([
                supabase.from('meta_players').select(RAW_PLAYER_COLS).in('id', allRosterIds),
                supabase.from('game_pbp').select(RAW_PBP_COLS).eq('room_id', roomId!),
            ]);
            return {
                playersRaw: playersRes.data ?? [],
                pbpRows: pbpRes.data ?? [],
            };
        },
        select,
    });
}
