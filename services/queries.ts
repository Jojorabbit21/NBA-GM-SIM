
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

// Helper: Fetch all rows from a table using pagination (handles >1000 rows)
async function fetchAllRows(tableName: string) {
    let allData: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .range(page * pageSize, (page + 1) * pageSize - 1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            allData = allData.concat(data);
            if (data.length < pageSize) {
                hasMore = false;
            } else {
                page++;
            }
        } else {
            hasMore = false;
        }
    }
    return allData;
}

// --- Hooks ---

// 1. Base Data Loading (Priority: Supabase DB > CSV)
export const useBaseData = () => {
  return useQuery({
    queryKey: ['baseData'],
    queryFn: async () => {
      // 1. Try to fetch from Supabase first
      let dbTeams: any[] | null = null;
      let dbPlayers: any[] | null = null;
      let dbSchedule: any[] | null = null;

      try {
        // Parallel fetch for initial check, but schedule might need recursion
        const [teamsResult, playersResult] = await Promise.all([
             supabase.from('meta_teams').select('*'),
             supabase.from('meta_players').select('*')
        ]);
        
        // Fetch schedule with pagination helper
        const scheduleData = await fetchAllRows('meta_schedule');

        if (!teamsResult.error && !playersResult.error && teamsResult.data && playersResult.data) {
            dbTeams = teamsResult.data;
            dbPlayers = playersResult.data;
            dbSchedule = scheduleData;
            console.log(`✅ Loaded base data from Supabase (Players: ${dbPlayers.length}, Schedule: ${dbSchedule.length})`);
        }
      } catch (e) {
          console.warn("⚠️ Failed to load from DB, falling back to CSV", e);
      }

      let loadedSchedule: Game[] = [];
      let combinedPlayers: any[] = dbPlayers || [];
      let initialTeamsSource = dbTeams || INITIAL_TEAMS_DATA;

      // Fallback: If DB load failed, load players CSV
      if (!dbPlayers) {
          try {
            const playersRes = await fetch('/players.csv');
            if (playersRes.ok) {
                const text = await playersRes.text();
                combinedPlayers = parseCSVToObjects(text);
                console.log("ℹ️ Loaded players from CSV (Fallback)");
            }
          } catch(e) { console.error("CSV Load Error", e); }
      }

      // Schedule Loading Logic: DB -> CSV
      if (dbSchedule && dbSchedule.length > 0) {
           loadedSchedule = mapDatabaseScheduleToRuntimeGame(dbSchedule);
      } else {
           // Fallback CSV
           try {
               const scheduleRes = await fetch('/schedule.csv');
               if (scheduleRes.ok) {
                   const text = await scheduleRes.text();
                   const rawSchedule = parseCSVToObjects(text);
                   const parsedGames = mapDatabaseScheduleToRuntimeGame(rawSchedule);
                   // Deduplicate CSV schedule (it contains rows for both home/away per game)
                   const gameMap = new Map<string, Game>();
                   parsedGames.forEach(g => {
                        if (!gameMap.has(g.id)) {
                             gameMap.set(g.id, g);
                        }
                   });
                   loadedSchedule = Array.from(gameMap.values());
                   console.log("ℹ️ Loaded schedule from CSV (Fallback)");
               }
           } catch(e) { console.error("Schedule CSV Load Error", e); }
      }
      
      // Sort schedule by date
      loadedSchedule.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // 3. Construct Roster Map
      const fullRosterMap: Record<string, any[]> = {};
      combinedPlayers.forEach((p: any) => {
        let teamId = p.base_team_id;
        
        if (!teamId) {
            const teamName = p.Team || p.team || p.team_name;
            if (teamName) teamId = resolveTeamId(teamName);
        }

        if (teamId && teamId !== 'unknown') {
          if (!fullRosterMap[teamId]) fullRosterMap[teamId] = [];
          fullRosterMap[teamId].push(mapDatabasePlayerToRuntimePlayer(p, teamId));
        }
      });

      // 4. Construct Teams
      const initializedTeams: Team[] = initialTeamsSource.map((t: any) => ({
        id: t.id,
        name: t.name,
        city: t.city,
        conference: t.conference,
        division: t.division,
        logo: t.logo_url || getTeamLogoUrl(t.id),
        roster: fullRosterMap[t.id] || [],
        wins: 0, 
        losses: 0, 
        budget: 200, 
        salaryCap: 140, 
        luxuryTaxLine: 170,
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
        queryClient.setQueryData(['saveData', variables.userId], savedData);
    }
  });
};

// 4. Save Game Results (Box Scores) to dedicated table
export const saveGameResults = async (results: any[]) => {
    if (results.length === 0) return;
    try {
        const { error } = await supabase
            .from('user_game_results')
            .insert(results);
        
        if (error) throw error;
        console.log(`✅ Saved ${results.length} game results to DB`);
    } catch (e) {
        console.error("Failed to save game results:", e);
        // Fallback or retry logic could be added here
    }
};

// 5. Session Heartbeat (Read-Only)
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
