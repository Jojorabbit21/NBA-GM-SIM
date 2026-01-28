
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { generateScoutingReport } from './geminiService';
import { 
  getTeamLogoUrl, 
  mapDatabasePlayerToRuntimePlayer, 
  mapDatabaseScheduleToRuntimeGame,
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
      console.log("🔄 Loading Game State (JSONB Reconstruction)...");

      // 1. 유저별 세션 데이터 및 트레이드 이력 로드
      const [saveRes, historyRes, txRes] = await Promise.all([
          supabase.from('saves').select('*').eq('user_id', userId).maybeSingle(),
          supabase.from('user_game_results').select('game_id, home_score, away_score').eq('user_id', userId),
          supabase.from('user_transactions').select('*').eq('user_id', userId).order('date', { ascending: false })
      ]);

      if (!saveRes.data) return null;

      const gd = saveRes.data.game_data;
      const finalTransactions: Transaction[] = (txRes.data || []).map((t: any) => ({
          id: t.id, date: t.date, type: t.type, teamId: t.team_id, description: t.description, details: t.details
      }));

      // 기본 스케줄 메타데이터 가져오기
      let baseData = queryClient.getQueryData<{teams: Team[], schedule: Game[]}>(['baseData']);
      if (!baseData) {
          // If query cache is empty, we still need to combine with results to show scores correctly
          const { schedule: rawSchedule } = await (async () => {
             const { data } = await supabase.from('meta_schedule').select('*').range(0, 2999);
             return { schedule: mapDatabaseScheduleToRuntimeGame(data || []) };
          })();
          baseData = { teams: gd.teams, schedule: rawSchedule };
      }

      // 2. 경기 결과 매칭하여 스케줄 복구
      const finalSchedule = reconstructSchedule(baseData.schedule, historyRes.data || []);

      return {
          team_id: saveRes.data.team_id,
          game_data: {
              ...gd,
              schedule: finalSchedule,
              transactions: finalTransactions
          },
          updated_at: saveRes.data.updated_at
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

      console.log("💾 Saving Game Data to Central JSONB...");

      // 모든 선수의 현재 누적 스탯이 포함된 teams 배열을 통째로 저장 (JSONB의 강점 활용)
      const savePayload = {
        user_id: userId,
        team_id: teamId,
        game_data: {
            teams: gameData.teams, // 선수들의 누적 스탯(zone stats 포함)이 여기에 모두 들어있습니다.
            currentSimDate: gameData.currentSimDate,
            tactics: gameData.tactics,
            playoffSeries: gameData.playoffSeries,
            prospects: gameData.prospects
        },
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase.from('saves').upsert(savePayload, { onConflict: 'user_id,team_id' });

      if (error) {
          console.error("❌ Database Upsert Failed:", error);
          throw error;
      }

      console.log("✅ Game Save Successful");
      return savePayload;
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
        // @ts-ignore
        keepPreviousData: true
    });
};
