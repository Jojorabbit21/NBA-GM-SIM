
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { generateScoutingReport } from './geminiService';
import { 
  INITIAL_TEAMS_DATA, 
  getTeamLogoUrl, 
  parseCSVToObjects, 
  mapDatabasePlayerToRuntimePlayer, 
  mapDatabaseScheduleToRuntimeGame,
  calculatePlayerOvr,
  resolveTeamId
} from '../utils/constants';
import { Team, Player, Game } from '../types';

// --- Data Transformation Helpers ---
const syncOvrWithLatestWeights = (teamsToSync: Team[]): Team[] => {
    return teamsToSync.map(t => ({
        ...t,
        roster: t.roster.map(p => ({
            ...p,
            ovr: calculatePlayerOvr(p)
        }))
    }));
};

// --- Hooks ---

// 1. Base Data Loading (CSV)
export const useBaseData = () => {
  return useQuery({
    queryKey: ['baseData'],
    queryFn: async () => {
      const [playersRes, scheduleRes] = await Promise.all([
        fetch('/players.csv'),
        fetch('/schedule.csv')
      ]);

      let combinedPlayers: any[] = [];
      let loadedSchedule: Game[] = [];

      if (playersRes.ok) {
          const text = await playersRes.text();
          combinedPlayers = parseCSVToObjects(text);
      }

      if (scheduleRes.ok) {
        const text = await scheduleRes.text();
        const rawSchedule = parseCSVToObjects(text);
        const parsedGames = mapDatabaseScheduleToRuntimeGame(rawSchedule);
        
        const gameMap = new Map<string, Game>();
        parsedGames.forEach(g => {
            if (!gameMap.has(g.id)) {
                gameMap.set(g.id, g);
            }
        });
        
        loadedSchedule = Array.from(gameMap.values()).sort((a, b) => 
            new Date(a.date).getTime() - new Date(b.date).getTime()
        );
      }

      const fullRosterMap: Record<string, any[]> = {};
      combinedPlayers.forEach((p: any) => {
        const teamName = p.team || p.team_name || p.Team;
        if (!teamName) return;
        const teamId = resolveTeamId(teamName);

        if (teamId !== 'unknown') {
          if (!fullRosterMap[teamId]) fullRosterMap[teamId] = [];
          fullRosterMap[teamId].push(mapDatabasePlayerToRuntimePlayer(p, teamId));
        }
      });

      const initializedTeams: Team[] = INITIAL_TEAMS_DATA.map(t => ({
        ...t,
        roster: fullRosterMap[t.id] || [],
        wins: 0, losses: 0, budget: 200, salaryCap: 140, luxuryTaxLine: 170,
        logo: getTeamLogoUrl(t.id),
        tacticHistory: { offense: {}, defense: {} }
      }));

      const teams = syncOvrWithLatestWeights(initializedTeams);

      return { teams, schedule: loadedSchedule };
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });
};

// 2. Save Data Loading (Dual Source: Supabase -> LocalStorage Fallback)
export const useLoadSave = (userId: string | undefined) => {
  return useQuery({
    queryKey: ['saveData', userId],
    queryFn: async () => {
      if (!userId) return null;

      let resultData = null;

      // 1. Try Loading from Supabase
      try {
          const { data, error } = await supabase
            .from('saves')
            .select('team_id, game_data')
            .eq('user_id', userId)
            .maybeSingle();
          
          if (!error && data) {
              resultData = data;
          }
      } catch (e) {
          console.warn("Supabase load failed, attempting local storage.", e);
      }

      // 2. Fallback to LocalStorage if Supabase failed or empty
      if (!resultData) {
          try {
              const localString = localStorage.getItem(`nba_gm_save_${userId}`);
              if (localString) {
                  resultData = JSON.parse(localString);
                  console.log("Loaded data from LocalStorage.");
              }
          } catch (e) {
              console.error("LocalStorage load failed.", e);
          }
      }

      if (!resultData) return null;

      // 3. Process Data
      if (resultData.game_data && resultData.game_data.teams) {
          resultData.game_data.teams = syncOvrWithLatestWeights(resultData.game_data.teams);
          
          if (resultData.game_data.prospects) {
              resultData.game_data.prospects = resultData.game_data.prospects.map((p: Player) => ({
                  ...p,
                  ovr: calculatePlayerOvr(p)
              }));
          }
      }

      return resultData;
    },
    enabled: !!userId,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60,
  });
};

// 3. Save Game Mutation (Dual Save: LocalStorage + Supabase)
export const useSaveGame = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, teamId, gameData }: { userId: string, teamId: string, gameData: any }) => {
      // 1. Save to LocalStorage (Safety Net)
      try {
          const localPayload = {
              team_id: teamId,
              game_data: gameData,
              updated_at: new Date().toISOString()
          };
          localStorage.setItem(`nba_gm_save_${userId}`, JSON.stringify(localPayload));
      } catch (e) {
          console.error("LocalStorage save failed", e);
      }

      // 2. Save to Supabase
      const { error } = await supabase.from('saves').upsert({
        user_id: userId,
        team_id: teamId,
        game_data: gameData,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id, team_id' });
      
      if (error) throw error;
      return true;
    },
    onSuccess: (data, variables) => {
        // [Critical] Update Cache Immediately so UI reflects saved state without refetch
        queryClient.setQueryData(['saveData', variables.userId], {
            team_id: variables.teamId,
            game_data: variables.gameData
        });
    }
  });
};

// 4. Session Heartbeat (Read-Only)
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

// 5. Scouting Report
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
