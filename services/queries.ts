
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { generateScoutingReport } from './geminiService';
import { 
  getTeamLogoUrl, 
  mapDatabasePlayerToRuntimePlayer, 
  mapDatabaseScheduleToRuntimeGame,
  calculatePlayerOvr
} from '../utils/constants';
import { Team, Player } from '../types';

// Helper: Recalculate OVR for all players in teams
const syncOvrWithLatestWeights = (teams: Team[]): Team[] => {
    return teams.map(t => ({
        ...t,
        roster: t.roster.map(p => ({
            ...p,
            ovr: calculatePlayerOvr(p)
        }))
    }));
};

// 1. Base Data Query (Teams & Schedule) - DB ONLY
export const useBaseData = () => {
  return useQuery({
    queryKey: ['baseData'],
    queryFn: async () => {
      // 1. Fetch Teams & Players from Supabase
      const { data: teamsData, error: teamsError } = await supabase
        .from('meta_teams')
        .select(`
            *,
            meta_players (*)
        `);
      
      if (teamsError) {
          console.error("❌ Failed to fetch base data (Teams):", teamsError);
          throw new Error("데이터베이스 연결 실패: 구단 정보를 불러올 수 없습니다.");
      }

      // 2. Fetch Schedule from Supabase
      const { data: scheduleData, error: scheduleError } = await supabase
        .from('meta_schedule')
        .select('*');

      if (scheduleError) {
          console.error("❌ Failed to fetch base data (Schedule):", scheduleError);
          throw new Error("데이터베이스 연결 실패: 일정 정보를 불러올 수 없습니다.");
      }

      // 3. Map to Runtime Objects
      const teams: Team[] = (teamsData || []).map((t: any) => {
          // DB의 meta_players 데이터를 Runtime Player 객체로 변환
          const roster = (t.meta_players || []).map((p: any) => mapDatabasePlayerToRuntimePlayer(p, t.id));
          
          return {
              id: t.id,
              name: t.name,
              city: t.city,
              logo: getTeamLogoUrl(t.id),
              conference: t.conference,
              division: t.division,
              salaryCap: 140,
              luxuryTaxLine: 170,
              budget: 200, 
              wins: 0,
              losses: 0,
              roster: roster.sort((a: Player, b: Player) => b.ovr - a.ovr)
          };
      });

      const schedule = mapDatabaseScheduleToRuntimeGame(scheduleData || []);

      console.log(`✅ Base Data Loaded from DB: ${teams.length} Teams, ${schedule.length} Games`);

      return { teams, schedule };
    },
    staleTime: Infinity, // 데이터는 불변으로 가정 (새로고침 전까지)
    gcTime: 1000 * 60 * 60 * 24, // 24시간 캐싱
    refetchOnWindowFocus: false,
    retry: 1
  });
};

// 2. Save Data Loading (Smart Sync: Supabase vs LocalStorage)
export const useLoadSave = (userId: string | undefined) => {
  return useQuery({
    queryKey: ['saveData', userId],
    queryFn: async () => {
      if (!userId) return null;

      let remoteData = null;
      let localData = null;

      // 1. Fetch from Supabase
      try {
          const { data, error } = await supabase
            .from('saves')
            .select('team_id, game_data, updated_at')
            .eq('user_id', userId)
            .maybeSingle(); // 에러를 던지지 않고 데이터가 없으면 null 반환
          
          if (!error && data) {
              remoteData = data;
          }
      } catch (e) {
          console.warn("Supabase save load warning:", e);
      }

      // 2. Fetch from LocalStorage (Backup)
      try {
          const localString = localStorage.getItem(`nba_gm_save_${userId}`);
          if (localString) {
              localData = JSON.parse(localString);
          }
      } catch (e) {
          console.error("LocalStorage load error:", e);
      }

      // 3. Compare Timestamps
      let finalData = null;
      let source = '';

      if (remoteData && localData) {
          const remoteTime = new Date(remoteData.updated_at || 0).getTime();
          const localTime = new Date(localData.updated_at || 0).getTime();
          
          if (localTime > remoteTime) {
              finalData = localData;
              source = 'Local (Newer)';
          } else {
              finalData = remoteData;
              source = 'Remote (Newer)';
          }
      } else if (remoteData) {
          finalData = remoteData;
          source = 'Remote (Only)';
      } else if (localData) {
          finalData = localData;
          source = 'Local (Only)';
      }

      // 데이터가 없으면 (신규 유저) 조용히 리턴
      if (!finalData) return null;

      console.log(`📂 Game Data Loaded from: ${source}`, finalData.updated_at);

      // 4. Process Data (OVR Sync)
      if (finalData.game_data && finalData.game_data.teams) {
          finalData.game_data.teams = syncOvrWithLatestWeights(finalData.game_data.teams);
          
          if (finalData.game_data.prospects) {
              finalData.game_data.prospects = finalData.game_data.prospects.map((p: Player) => ({
                  ...p,
                  ovr: calculatePlayerOvr(p)
              }));
          }
      }

      return finalData;
    },
    enabled: !!userId,
    retry: false, // 데이터가 없으면 재시도하지 않음 (신규 유저 무한 루프 방지)
    refetchOnWindowFocus: false,
    staleTime: Infinity, 
    gcTime: 1000 * 60 * 60 * 24, 
  });
};

// 3. Save Game Mutation
export const useSaveGame = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, teamId, gameData }: { userId: string, teamId: string, gameData: any }) => {
      const timestamp = new Date().toISOString();
      const payload = {
        user_id: userId,
        team_id: teamId,
        game_data: gameData,
        updated_at: timestamp
      };

      // 1. Save to LocalStorage (Immediate Backup)
      try {
          localStorage.setItem(`nba_gm_save_${userId}`, JSON.stringify(payload));
      } catch (e) {
          console.error("LocalStorage save failed", e);
      }

      // 2. Save to Supabase
      const { error } = await supabase.from('saves').upsert(payload, { onConflict: 'user_id, team_id' });
      
      if (error) throw error;
      return payload;
    },
    onSuccess: (savedData, variables) => {
        // 캐시 즉시 업데이트
        queryClient.setQueryData(['saveData', variables.userId], savedData);
    }
  });
};

// 4. Save Game Results (Box Scores)
export const saveGameResults = async (results: any[]) => {
    if (results.length === 0) return;
    try {
        const { error } = await supabase
            .from('user_game_results')
            .insert(results);
        
        if (error) throw error;
        // 성공 시 로그 생략 (너무 빈번할 수 있음)
    } catch (e) {
        console.error("Failed to save game results:", e);
    }
};

// 5. Session Heartbeat
export const useSessionHeartbeat = (userId: string | undefined, deviceId: string, enabled: boolean = true) => {
    return useQuery({
        queryKey: ['heartbeat', userId, deviceId],
        queryFn: async () => {
            if (!userId) return null;
            const { data } = await supabase
                .from('profiles')
                .select('active_device_id')
                .eq('id', userId)
                .single();
            return data?.active_device_id === deviceId;
        },
        enabled: !!userId && enabled,
        refetchInterval: 30000,
        refetchOnWindowFocus: true,
        retry: false
    });
};

// 6. Scouting Report
export const useScoutingReport = (player: Player | null) => {
    return useQuery({
        queryKey: ['scoutingReport', player?.id],
        queryFn: async () => {
            if (!player) return null;
            return await generateScoutingReport(player);
        },
        enabled: !!player,
        staleTime: Infinity,
        gcTime: 1000 * 60 * 30,
        refetchOnWindowFocus: false,
    });
};

// 7. Monthly Schedule
export const useMonthlySchedule = (userId: string | undefined, year: number, month: number) => {
    return useQuery({
        queryKey: ['monthlySchedule', userId, year, month],
        queryFn: async () => {
            const startDate = new Date(year, month, 1).toISOString().split('T')[0];
            const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

            if (!userId) return [];

            const { data: resultsData, error: resultsError } = await supabase
                .from('user_game_results')
                .select('game_id, home_score, away_score')
                .eq('user_id', userId)
                .gte('date', startDate)
                .lte('date', endDate);
            
            if (resultsError) throw resultsError;
            return resultsData || [];
        },
        enabled: !!userId,
        staleTime: 1000 * 60 * 5,
        keepPreviousData: true
    });
};
