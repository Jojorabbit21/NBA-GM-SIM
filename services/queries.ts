
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
  });
};

// 2. Save Data Loading
export const useLoadSave = (userId: string | undefined) => {
  return useQuery({
    queryKey: ['saveData', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('saves')
        .select('team_id, game_data')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      if (data.game_data && data.game_data.teams) {
          data.game_data.teams = syncOvrWithLatestWeights(data.game_data.teams);
          
          if (data.game_data.prospects) {
              data.game_data.prospects = data.game_data.prospects.map((p: Player) => ({
                  ...p,
                  ovr: calculatePlayerOvr(p)
              }));
          }
      }

      return data;
    },
    enabled: !!userId,
    retry: false
  });
};

// 3. Save Game Mutation
export const useSaveGame = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, teamId, gameData }: { userId: string, teamId: string, gameData: any }) => {
      const { error } = await supabase.from('saves').upsert({
        user_id: userId,
        team_id: teamId,
        game_data: gameData,
        updated_at: new Date()
      }, { onConflict: 'user_id, team_id' });
      
      if (error) throw error;
      return true;
    }
  });
};

// 4. Session Heartbeat (Polling)
export const useSessionHeartbeat = (userId: string | undefined, deviceId: string) => {
    return useQuery({
        queryKey: ['heartbeat', userId, deviceId],
        queryFn: async () => {
            if (!userId) return null;
            
            await supabase.from('profiles')
                .update({ last_seen_at: new Date().toISOString() })
                .eq('id', userId)
                .eq('active_device_id', deviceId);

            const { data } = await supabase
                .from('profiles')
                .select('active_device_id')
                .eq('id', userId)
                .single();
            
            return data?.active_device_id === deviceId;
        },
        enabled: !!userId,
        refetchInterval: 300000, // [OPTIMIZATION] 1분에서 5분으로 완화 (300,000ms)
        refetchOnWindowFocus: true,
        retry: false
    });
};

// 5. Scouting Report (Gemini)
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
    });
};
