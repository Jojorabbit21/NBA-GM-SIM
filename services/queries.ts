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

/**
 * [CTO 핵심 로직] 메타데이터와 사용자 개별 상태를 병합하여 팀 정보를 복구합니다.
 */
const reconstructTeams = (baseTeams: Team[], userPlayerStates: any[]): Team[] => {
    if (!userPlayerStates || userPlayerStates.length === 0) return baseTeams;
    
    // 유저 상태를 Map으로 변환하여 O(1) 탐색 가능하게 함
    const stateMap = new Map(userPlayerStates.map(s => [s.player_id, s]));
    
    return baseTeams.map(team => ({
        ...team,
        // 해당 유저의 기록에서 팀 승패를 다시 계산 (또는 별도 컬럼에서 가져옴)
        // 여기서는 편의상 로스터 데이터 복구에 집중
        roster: team.roster.map(player => {
            const savedState = stateMap.get(player.id);
            if (savedState) {
                return {
                    ...player,
                    condition: savedState.condition ?? 100,
                    health: savedState.health ?? 'Healthy',
                    injuryType: savedState.injury_type,
                    returnDate: savedState.return_date,
                    stats: savedState.stats || INITIAL_STATS(),
                    playoffStats: savedState.playoff_stats || INITIAL_STATS(),
                };
            }
            return player;
        })
    }));
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
      console.log("🔄 Loading Game State (Relational Reconstruction)...");

      // 1. 기본 메타데이터 확보
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

      // 2. 유저별 세션 데이터 및 개별 선수 상태/기록 병렬 로드
      const [saveRes, statesRes, historyRes, txRes] = await Promise.all([
          supabase.from('saves').select('*').eq('user_id', userId).maybeSingle(),
          supabase.from('user_player_state').select('*').eq('user_id', userId),
          supabase.from('user_game_results').select('game_id, home_score, away_score').eq('user_id', userId),
          supabase.from('user_transactions').select('*').eq('user_id', userId).order('date', { ascending: false })
      ]);

      if (!saveRes.data) return null;

      console.log("...Merging Relational Data into State...");
      
      // 3. 데이터 병합 (RDB -> Runtime Object)
      const finalTeams = reconstructTeams(baseData.teams, statesRes.data || []);
      const finalSchedule = reconstructSchedule(baseData.schedule, historyRes.data || []);
      const finalTransactions: Transaction[] = (txRes.data || []).map((t: any) => ({
          id: t.id, date: t.date, type: t.type, teamId: t.team_id, description: t.description, details: t.details
      }));

      // 4. 팀별 승패 데이터는 경기 기록(user_game_results)을 통해 재계산하는 것이 가장 정확하지만,
      // 성능을 위해 saves 테이블의 game_data에 요약본만 남겨두거나 여기서 즉석 계산합니다.
      finalTeams.forEach(team => {
          let wins = 0; let losses = 0;
          finalSchedule.forEach(g => {
              if (g.played && (g.homeTeamId === team.id || g.awayTeamId === team.id)) {
                  const isHome = g.homeTeamId === team.id;
                  const won = isHome ? (g.homeScore! > g.awayScore!) : (g.awayScore! > g.homeScore!);
                  if (won) wins++; else losses++;
              }
          });
          team.wins = wins;
          team.losses = losses;
      });

      return {
          team_id: saveRes.data.team_id,
          game_data: {
              ...saveRes.data.game_data,
              teams: finalTeams, // 복구된 전체 팀 정보
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

      console.log("💾 Normalizing and Saving Game Data...");

      // 1. 대용량 'teams' 배열을 제외한 가벼운 메타데이터 구성
      const payloadMeta = {
          currentSimDate: gameData.currentSimDate,
          tactics: gameData.tactics,
          playoffSeries: gameData.playoffSeries,
          prospects: gameData.prospects
      };

      const savePayload = {
        user_id: userId,
        team_id: teamId,
        game_data: payloadMeta, // 더 이상 teams를 포함하지 않음
        updated_at: new Date().toISOString()
      };

      // 2. 개별 선수 상태 추출 (Normalization)
      const playerStates = gameData.teams.flatMap((t: Team) => t.roster.map((p: Player) => ({
          user_id: userId,
          player_id: p.id,
          condition: Math.round(p.condition),
          health: p.health,
          injury_type: p.injuryType,
          return_date: p.returnDate,
          stats: p.stats, // 개별 선수의 JSON은 크기가 작아 안전함
          playoff_stats: p.playoffStats,
          updated_at: new Date().toISOString()
      })));

      // 3. 병렬 업서트 실행
      const results = await Promise.all([
          supabase.from('saves').upsert(savePayload, { onConflict: 'user_id,team_id' }),
          supabase.from('user_player_state').upsert(playerStates, { onConflict: 'user_id,player_id' })
      ]);

      const error = results.find(r => r.error);
      if (error) {
          console.error("❌ Database Upsert Failed:", error);
          throw error.error;
      }

      console.log("✅ Hybrid RDB Save Successful");
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
        // @ts-ignore
        keepPreviousData: true
    });
};
