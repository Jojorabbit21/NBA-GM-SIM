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

// Helper: Recalculate OVR for all players in teams (e.g. after loading from save)
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
      // Fetch Teams & Schedule in Parallel
      const [teamsResult, scheduleResult] = await Promise.all([
          supabase.from('meta_teams').select('*, meta_players (*)'),
          supabase.from('meta_schedule').select('*')
      ]);
      
      if (teamsResult.error) {
          console.error("❌ Failed to fetch base data (Teams):", teamsResult.error);
          throw new Error("데이터베이스 연결 실패: 구단 정보를 불러올 수 없습니다.");
      }

      if (scheduleResult.error) {
          console.error("❌ Failed to fetch base data (Schedule):", scheduleResult.error);
          throw new Error("데이터베이스 연결 실패: 일정 정보를 불러올 수 없습니다.");
      }

      // Map to Runtime Objects
      const teams: Team[] = (teamsResult.data || []).map((t: any) => {
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

      const schedule = mapDatabaseScheduleToRuntimeGame(scheduleResult.data || []);

      console.log(`✅ Base Data Loaded from DB: ${teams.length} Teams, ${schedule.length} Games`);

      return { teams, schedule };
    },
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    refetchOnWindowFocus: false,
    retry: 1
  });
};

// 2. Save Data Loading (Smart Sync: Supabase vs LocalStorage)
export const useLoadSave = (userId: string | undefined) => {
  return useQuery({
    queryKey: ['saveData', userId],
    queryFn: async () => {
      // 400 Error Prevention: Guard clause for invalid userId
      if (!userId) return null;

      let remoteData = null;
      let localData = null;

      // 1. Fetch from Supabase
      try {
          const { data, error } = await supabase
            .from('saves')
            .select('team_id, game_data, updated_at')
            .eq('user_id', userId)
            .maybeSingle();
          
          if (!error && data) {
              remoteData = data;
          }
      } catch (e) {
          console.warn("Supabase save load warning:", e);
      }

      // 2. Fetch from LocalStorage
      try {
          const localString = localStorage.getItem(`nba_gm_save_${userId}`);
          if (localString) {
              localData = JSON.parse(localString);
          }
      } catch (e) {
          console.error("LocalStorage load error:", e);
      }

      // 3. Compare Timestamps and Select Best Source
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
    // 400 Error Prevention: Only enable query if userId exists
    enabled: !!userId,
    retry: false,
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
      if (!userId || !teamId) {
        throw new Error("Cannot save: Missing UserID or TeamID");
      }

      const timestamp = new Date().toISOString();
      const payload = {
        user_id: userId,
        team_id: teamId,
        game_data: gameData,
        updated_at: timestamp
      };

      // 1. Save to LocalStorage (Synchronous backup)
      try {
          localStorage.setItem(`nba_gm_save_${userId}`, JSON.stringify(payload));
      } catch (e) {
          console.error("LocalStorage save failed (possibly quota exceeded)", e);
      }

      // 2. Save to Supabase
      // [Fix] Removed space in 'user_id,team_id' to prevent potential 400 errors with strict SQL parsing
      const { error } = await supabase
        .from('saves')
        .upsert(payload, { onConflict: 'user_id,team_id' });
      
      if (error) {
          console.error("❌ Supabase Save Failed:", error);
          throw error;
      }

      return payload;
    },
    onSuccess: (savedData, variables) => {
        queryClient.setQueryData(['saveData', variables.userId], savedData);
        // Debug log (can be removed in production)
        // console.log("✅ Game Saved Successfully"); 
    }
  });
};

export const saveGameResults = async (results: any[]) => {
    if (results.length === 0) return;
    try {
        const { error } = await supabase
            .from('user_game_results')
            .insert(results);
        
        if (error) {
            console.error("Failed to save game results:", error);
            // Don't throw here to avoid blocking UI for analytics errors
        }
    } catch (e) {
        console.error("Failed to save game results:", e);
    }
};

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

export const useMonthlySchedule = (userId: string | undefined, year: number, month: number) => {
    return useQuery({
        queryKey: ['monthlySchedule', userId, year, month],
        queryFn: async () => {
            if (!userId) return []; // 400 Error Prevention

            const startDate = new Date(year, month, 1).toISOString().split('T')[0];
            const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

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