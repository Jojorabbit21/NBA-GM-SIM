
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
    /** 이 리그(room) 안에서 이미 끝난 과거 시즌들의 최종 스탯 스냅샷 —
     *  meta_players.career_history(전체 리그 공유·실제 NBA 커리어)와 별개로 room_id 단위로
     *  격리 저장된다(여러 리그가 동시에 돌아도 서로 안 섞임). 시즌 롤오버 기능이 아직 없어
     *  현재는 항상 빈 배열이지만, buildLeagueTeams()가 이미 이 필드를 merge하도록 준비돼 있다. */
    leagueSeasonRows: { player_id: string; season: string; stat_line: Record<string, any> }[];
    /** 서버(simRunner.ts)가 경기 시뮬 후 기록하는 부상/출장정지 이력 + 현재 상태 —
     *  room_player_state 테이블(room_id, player_id 단위). buildLeagueTeams()가
     *  injury_history를 player.injuryHistory로 merge. health/return_date/season_number는
     *  "지금 활성 부상인지" 판정용(MultiRosterView.tsx의 로스터 배지 등 호출부가 직접 판정 —
     *  이 훅은 원본 그대로 전달만 한다). */
    playerInjuryRows: {
        player_id: string;
        injury_history: Record<string, any>[];
        health: string | null;
        return_date: string | null;
        season_number: number | null;
    }[];
}

const RAW_PLAYER_COLS = 'id, name, position, base_attributes, tendencies, career_history';
const RAW_PBP_COLS = 'game_id, home_box, away_box, home_team_id, away_team_id, home_score, away_score, game_start_time';
const RAW_LEAGUE_SEASON_COLS = 'player_id, season, stat_line';
const RAW_PLAYER_INJURY_COLS = 'player_id, injury_history, health, return_date, season_number';

export function useLeagueRawStats<T = LeagueRawStatsData>(
    roomId: string | undefined,
    allRosterIds: string[],
    select?: (data: LeagueRawStatsData) => T,
) {
    return useQuery({
        queryKey: ['leagueRawStats', roomId, allRosterIds.join(',')],
        enabled: allRosterIds.length > 0 && !!roomId,
        queryFn: async (): Promise<LeagueRawStatsData> => {
            const [playersRes, pbpRes, seasonRes, injuryRes] = await Promise.all([
                supabase.from('meta_players').select(RAW_PLAYER_COLS).in('id', allRosterIds),
                supabase.from('game_pbp').select(RAW_PBP_COLS).eq('room_id', roomId!),
                supabase.from('league_player_seasons').select(RAW_LEAGUE_SEASON_COLS).eq('room_id', roomId!),
                supabase.from('room_player_state').select(RAW_PLAYER_INJURY_COLS).eq('room_id', roomId!).in('player_id', allRosterIds),
            ]);
            return {
                playersRaw: playersRes.data ?? [],
                pbpRows: pbpRes.data ?? [],
                leagueSeasonRows: seasonRes.data ?? [],
                playerInjuryRows: injuryRes.data ?? [],
            };
        },
        select,
    });
}
