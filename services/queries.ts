
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
            .maybeSingle();
          
          if (!error && data) {
              remoteData = data;
          }
      } catch (e) {
          console.warn("Supabase load failed.", e);
      }

      // 2. Fetch from LocalStorage
      try {
          const localString = localStorage.getItem(`nba_gm_save_${userId}`);
          if (localString) {
              localData = JSON.parse(localString);
          }
      } catch (e) {
          console.error("LocalStorage load failed.", e);
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

      console.log(`Loading Save Data from: ${source}`, finalData?.updated_at);

      if (!finalData) return null;

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
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: Infinity, // [CTO Update] 0 -> Infinity. DB 부하 방지. 초기 로드 1회만 수행.
    gcTime: 1000 * 60 * 60 * 24, // 캐시 유지 시간 대폭 증가 (24시간)
  });
};

// 3. Save Game Mutation (Dual Save: LocalStorage + Supabase)
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

      // 1. Save to LocalStorage (Synchronous backup)
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
        // [Critical] Update Cache Immediately with the exact payload we just saved
        // DB에서 다시 읽어올 필요가 없도록 클라이언트 캐시를 강제 업데이트
        queryClient.setQueryData(['saveData', variables.userId], savedData);
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
