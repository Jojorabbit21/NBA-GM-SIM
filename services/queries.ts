import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { generateScoutingReport } from './geminiService';
import { 
  getTeamLogoUrl, 
  mapDatabasePlayerToRuntimePlayer, 
  mapDatabaseScheduleToRuntimeGame,
  calculatePlayerOvr,
  INITIAL_STATS
} from '../utils/constants';
import { Team, Player, Game, Transaction } from '../types';

// ============================================================================
//  DATA RECONSTRUCTION LOGIC
// ============================================================================

const reconstructSchedule = (metaSchedule: Game[], userResults: any[]): Game[] => {
    if (!userResults || userResults.length === 0) return metaSchedule;
    const resultMap = new Map(userResults.map((r: any) => [r.game_id, r]));
    return metaSchedule.map(game => {
        const result = resultMap.get(game.id);
        if (result) {
            return {
                ...game,
                played: true,
                homeScore: result.home_score,
                awayScore: result.away_score,
            };
        }
        return game;
    });
};

// ============================================================================
//  QUERIES
// ============================================================================

export const useBaseData = () => {
  return useQuery({
    queryKey: ['baseData'],
    queryFn: async () => {
      console.log("Fetching Meta Data from DB...");
      const [teamsResult, scheduleResult] = await Promise.all([
          supabase.from('meta_teams').select('*, meta_players (*)'),
          supabase.from('meta_schedule').select('*').range(0, 2999)
      ]);
      
      if (teamsResult.error) throw new Error("구단 정보를 불러올 수 없습니다.");
      if (scheduleResult.error) throw new Error("일정 정보를 불러올 수 없습니다.");

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
      return { teams, schedule };
    },
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24, 
    refetchOnWindowFocus: false,
  });
};

export const useLoadSave = (userId: string | undefined) => {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['fullGameState', userId],
    queryFn: async () => {
      if (!userId) return null;
      console.log("🔄 Loading Game State (Hybrid RDB Strategy)...");

      let baseData = queryClient.getQueryData<{teams: Team[], schedule: Game[]}>(['baseData']);
      if (!baseData) {
          const { teams, schedule } = await (async () => {
             const [tr, sr] = await Promise.all([
                supabase.from('meta_teams').select('*, meta_players (*)'),
                supabase.from('meta_schedule').select('*').range(0, 2999)
             ]);
             if (tr.error || sr.error) throw new Error("Base Data Fetch Failed");
             const mappedTeams: Team[] = (tr.data || []).map((t: any) => ({
                id: t.id, name: t.name, city: t.city, logo: getTeamLogoUrl(t.id),
                conference: t.conference, division: t.division, salaryCap: 140, luxuryTaxLine: 170, budget: 200, wins: 0, losses: 0,
                roster: (t.meta_players || []).map((p: any) => mapDatabasePlayerToRuntimePlayer(p, t.id)).sort((a: Player, b: Player) => b.ovr - a.ovr)
             }));
             const mappedSchedule = mapDatabaseScheduleToRuntimeGame(sr.data || []);
             return { teams: mappedTeams, schedule: mappedSchedule };
          })();
          baseData = { teams, schedule };
          queryClient.setQueryData(['baseData'], baseData);
      }

      const { data: saveRecord, error: saveError } = await supabase
        .from('saves')
        .select('team_id, game_data, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (saveError) console.error("Save Load Error:", saveError);

      const { data: resultHistory, error: historyError } = await supabase
        .from('user_game_results')
        .select('game_id, home_score, away_score')
        .eq('user_id', userId);

      if (historyError) console.error("History Load Error:", historyError);

      const { data: txHistory, error: txError } = await supabase
        .from('user_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false });

      if (txError) console.error("Transaction Load Error:", txError);

      if (!saveRecord) return null; 

      console.log("...Reconstructing Game State...");
      const finalTeams = saveRecord.game_data?.teams || baseData.teams;
      const finalSchedule = reconstructSchedule(baseData.schedule, resultHistory || []);
      const finalTransactions: Transaction[] = (txHistory || []).map((t: any) => ({
          id: t.id, date: t.date, type: t.type, teamId: t.team_id, description: t.description, details: t.details
      }));

      return {
          team_id: saveRecord.team_id,
          game_data: {
              ...saveRecord.game_data,
              teams: finalTeams,
              schedule: finalSchedule,
              transactions: finalTransactions
          },
          updated_at: saveRecord.updated_at
      };
    },
    enabled: !!userId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
};

export const useSaveGame = () => {
  return useMutation({
    mutationFn: async ({ userId, teamId, gameData }: { userId: string, teamId: string, gameData: any }) => {
      if (!userId || !teamId) throw new Error("Missing UserID or TeamID");

      console.log("💾 Saving Game (Hybrid Optimization)...");

      const payloadData = {
          currentSimDate: gameData.currentSimDate,
          tactics: gameData.tactics,
          playoffSeries: gameData.playoffSeries,
          prospects: gameData.prospects,
          teams: gameData.teams, 
      };

      const payload = {
        user_id: userId,
        team_id: teamId,
        game_data: payloadData, 
        updated_at: new Date().toISOString()
      };

      // [CRITICAL FIX]
      // if SQL 'UNIQUE' constraint is correctly added, this will work.
      // We use 'onConflict' targeting the columns defined in the UNIQUE index.
      const { error } = await supabase
        .from('saves')
        .upsert(payload, { onConflict: 'user_id,team_id' });
      
      if (error) {
          console.error("❌ Supabase Save Failed:", error);
          // If the unique constraint is still missing, we can try a fallback or at least report it.
          throw error;
      }

      console.log("✅ Save Successful");
      return payload;
    }
  });
};

export const saveGameResults = async (results: any[]) => {
    if (results.length === 0) return;
    try {
        const { error } = await supabase
            .from('user_game_results')
            .insert(results);
        if (error) console.error("Failed to save game results:", error);
    } catch (e) {
        console.error("Failed to save game results:", e);
    }
};

export const saveUserTransaction = async (userId: string, transaction: Transaction) => {
    if (!userId || !transaction) return;
    try {
        const payload = {
            user_id: userId,
            date: transaction.date,
            type: transaction.type,
            team_id: transaction.teamId,
            description: transaction.description,
            details: transaction.details
        };
        const { error } = await supabase.from('user_transactions').insert(payload);
        if (error) console.error("Failed to save transaction:", error);
    } catch (e) {
        console.error("Failed to save transaction:", e);
    }
};

export const useSessionHeartbeat = (userId: string | undefined, deviceId: string, enabled: boolean = true) => {
    return useQuery({
        queryKey: ['heartbeat', userId, deviceId],
        queryFn: async () => {
            if (!userId) return null;
            const { data } = await supabase.from('profiles').select('active_device_id').eq('id', userId).single();
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
            if (!userId) return []; 
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