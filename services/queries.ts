
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { generateScoutingReport } from './geminiService';
import { 
  getTeamLogoUrl, 
  mapDatabasePlayerToRuntimePlayer, 
  mapDatabaseScheduleToRuntimeGame,
  resolveTeamId,
  INITIAL_STATS,
  INITIAL_TEAMS_DATA
} from '../utils/constants';
import { Team, Player, Game, Transaction, SeasonStats, PlayoffSeries } from '../types';
import { generateNextPlayoffGames } from '../utils/playoffLogic';
import { updateTeamTacticHistory } from '../utils/tacticUtils';

// ============================================================================
//  HELPER: State Reconstruction (Event Sourcing Logic)
// ============================================================================

/**
 * DB의 Raw Data(트레이드, 경기결과)를 바탕으로 현재 시점의 팀/선수 상태를 재구성합니다.
 */
const reconstructGameState = (
    baseTeams: Team[],
    baseSchedule: Game[],
    transactions: Transaction[],
    gameResults: any[],
    playoffSeries?: PlayoffSeries[],
    currentDate?: string
) => {
    // 1. Deep Copy Base Data (To avoid mutating cache)
    const teamsMap = new Map<string, Team>();
    const playerMap = new Map<string, Player>();

    // 초기화: 선수들을 ID로 매핑하여 빠른 접근
    baseTeams.forEach(t => {
        const teamCopy = { ...t, roster: [], wins: 0, losses: 0, tacticHistory: { offense: {}, defense: {} } }; // Reset dynamic data
        teamsMap.set(t.id, teamCopy);
        t.roster.forEach(p => {
            // 초기 스탯 리셋 (DB에서 계산할 것이므로)
            const playerCopy = { 
                ...p, 
                stats: INITIAL_STATS(), 
                playoffStats: INITIAL_STATS(),
                teamId: t.id // 추적용 임시 필드
            };
            playerMap.set(p.id, playerCopy);
            // 초기 로스터 배정
            teamCopy.roster.push(playerCopy);
        });
    });

    // 2. Apply Transactions (Roster Moves)
    // 트레이드 로그를 순서대로 반영하여 선수의 현재 소속팀을 확정
    transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    transactions.forEach(tx => {
        if (tx.type === 'Trade' && tx.details) {
            const { acquired, traded } = tx.details;
            const myTeamId = tx.teamId;
            const partnerTeamId = tx.details.partnerTeamId;

            const movePlayerSafely = (playerId: string, targetTeamId: string) => {
                const player = playerMap.get(playerId);
                const targetTeam = teamsMap.get(targetTeamId);

                if (!player || !targetTeam) return;

                // 1. Global Purge: Remove player from ALL teams
                teamsMap.forEach(t => {
                    const idx = t.roster.findIndex(p => p.id === playerId);
                    if (idx !== -1) {
                        t.roster.splice(idx, 1);
                    }
                });

                // 2. Add to Target Team
                targetTeam.roster.push(player);
            };

            // Process 'traded' players: My Team -> Partner Team
            if (traded && partnerTeamId) {
                traded.forEach((tp: any) => {
                    movePlayerSafely(tp.id, partnerTeamId);
                });
            }
            
            // Process 'acquired' players: Partner (or anywhere) -> My Team
            if (acquired) {
                acquired.forEach((ap: any) => {
                    movePlayerSafely(ap.id, myTeamId);
                });
            }
        }
    });

    // 3. Aggregate Stats from Game Results
    const scheduleMap = new Map<string, Game>();
    baseSchedule.forEach(g => scheduleMap.set(g.id, { ...g }));

    gameResults.forEach((res: any) => {
        // 3-1. Update Schedule Status
        let game = scheduleMap.get(res.game_id);
        
        // [Fix] Handle Dynamic Playoff Games (Not in Meta Schedule)
        if (!game) {
            game = {
                id: res.game_id,
                homeTeamId: res.home_team_id || resolveTeamId(res.home_team_name) || 'unknown', // Fallback if IDs missing
                awayTeamId: res.away_team_id || resolveTeamId(res.away_team_name) || 'unknown',
                date: res.date,
                played: true,
                homeScore: res.home_score,
                awayScore: res.away_score,
                isPlayoff: res.is_playoff || false,
                seriesId: res.series_id || undefined,
            };
            // Only add if teams are valid
            if (game.homeTeamId !== 'unknown' && game.awayTeamId !== 'unknown') {
                 scheduleMap.set(game.id, game);
            }
        } else {
            game.played = true;
            game.homeScore = res.home_score;
            game.awayScore = res.away_score;
            // Ensure playoff metadata is synced if existing game
            if (res.is_playoff) game.isPlayoff = true;
            if (res.series_id) game.seriesId = res.series_id;
        }
            
        // 3-2. Update Team Standings
        const homeTeam = teamsMap.get(game.homeTeamId);
        const awayTeam = teamsMap.get(game.awayTeamId);
        
        if (homeTeam && awayTeam) {
            const homeWin = res.home_score > res.away_score;
            if (homeWin) {
                homeTeam.wins += 1;
                awayTeam.losses += 1;
            } else {
                awayTeam.wins += 1;
                homeTeam.losses += 1;
            }

            // [New] Reconstruct Tactic History (If stored in game log)
            // Note: This relies on the 'tactics' column in user_game_results which might be missing for old games.
            // A fallback snapshot restore is implemented in useLoadSave below.
            if (res.tactics && res.box_score) {
                 const homeBox = res.box_score.home || [];
                 const awayBox = res.box_score.away || [];
                 
                 if (res.tactics.home) {
                     homeTeam.tacticHistory = updateTeamTacticHistory(homeTeam, homeBox, awayBox, res.tactics.home, homeWin);
                 }
                 if (res.tactics.away) {
                     awayTeam.tacticHistory = updateTeamTacticHistory(awayTeam, awayBox, homeBox, res.tactics.away, !homeWin);
                 }
            }
        }

        // 3-3. Aggregate Player Box Scores
        const boxData = res.box_score;
        if (boxData) {
            const allBoxStats = [...(boxData.home || []), ...(boxData.away || [])];
            
            allBoxStats.forEach((stat: any) => {
                const player = playerMap.get(stat.playerId);
                if (player) {
                    const targetStats = game?.isPlayoff ? player.playoffStats : player.stats;
                    
                    targetStats.g += 1;
                    targetStats.gs += stat.gs || 0;
                    targetStats.mp += stat.mp || 0;
                    targetStats.pts += stat.pts || 0;
                    targetStats.reb += stat.reb || 0;
                    targetStats.offReb += stat.offReb || 0;
                    targetStats.defReb += stat.defReb || 0;
                    targetStats.ast += stat.ast || 0;
                    targetStats.stl += stat.stl || 0;
                    targetStats.blk += stat.blk || 0;
                    targetStats.tov += stat.tov || 0;
                    targetStats.fgm += stat.fgm || 0;
                    targetStats.fga += stat.fga || 0;
                    targetStats.p3m += stat.p3m || 0;
                    targetStats.p3a += stat.p3a || 0;
                    targetStats.ftm += stat.ftm || 0;
                    targetStats.fta += stat.fta || 0;
                    targetStats.rimM = (targetStats.rimM || 0) + (stat.rimM || 0);
                    targetStats.rimA = (targetStats.rimA || 0) + (stat.rimA || 0);
                    targetStats.midM = (targetStats.midM || 0) + (stat.midM || 0);
                    targetStats.midA = (targetStats.midA || 0) + (stat.midA || 0);
                }
            });
        }
    });

    let reconstructedSchedule = Array.from(scheduleMap.values());

    // 4. [Playoff Fix] Generate Future Playoff Games
    if (playoffSeries && playoffSeries.length > 0 && currentDate) {
        const { newGames } = generateNextPlayoffGames(reconstructedSchedule, playoffSeries, currentDate);
        if (newGames.length > 0) {
            reconstructedSchedule = [...reconstructedSchedule, ...newGames];
        }
    }

    return {
        teams: Array.from(teamsMap.values()),
        schedule: reconstructedSchedule
    };
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
      
      let rawTeams = teamsResult.data || [];
      if (rawTeams.length === 0) {
          rawTeams = INITIAL_TEAMS_DATA as any[];
      }

      const teams: Team[] = rawTeams.map((t: any) => {
          const rawPlayers = t.meta_players || [];
          const roster = rawPlayers.map((p: any) => mapDatabasePlayerToRuntimePlayer(p, t.id));
          
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
      console.log("🔄 Reconstructing Game State from Event Log...");

      // 1. Fetch Save Metadata
      const { data: saveMeta, error: saveError } = await supabase
          .from('saves')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

      if (saveError || !saveMeta) {
          console.log("No save found.");
          return null;
      }

      // 2. Fetch Base Data
      let baseData = queryClient.getQueryData<{teams: Team[], schedule: Game[]}>(['baseData']);
      if (!baseData) {
          console.log("Base data missing in cache, fetching...");
          const { data: teamsData } = await supabase.from('meta_teams').select('*, meta_players (*)');
          const { data: schedData } = await supabase.from('meta_schedule').select('*');
          
          const teams = (teamsData || []).map((t: any) => ({
             id: t.id, name: t.name, city: t.city, logo: getTeamLogoUrl(t.id),
             conference: t.conference, division: t.division,
             wins: 0, losses: 0, budget: 150, salaryCap: 140, luxuryTaxLine: 170,
             roster: (t.meta_players || []).map((p: any) => mapDatabasePlayerToRuntimePlayer(p, t.id))
          }));
          const schedule = mapDatabaseScheduleToRuntimeGame(schedData || []);
          baseData = { teams, schedule };
      }

      // 3. Fetch Transactions
      const { data: transactions } = await supabase
          .from('user_transactions')
          .select('*')
          .eq('user_id', userId);

      // 4. Fetch Game Results
      const { data: gameResults } = await supabase
          .from('user_game_results')
          .select('game_id, home_score, away_score, box_score, date, home_team_id, away_team_id, is_playoff, series_id, tactics')
          .eq('user_id', userId);

      // 5. Reconstruct State
      console.time("ReconstructState");
      const { teams: reconstructedTeams, schedule: reconstructedSchedule } = reconstructGameState(
          baseData.teams,
          baseData.schedule,
          (transactions || []).map((t: any) => ({
              id: t.id, date: t.date, type: t.type, teamId: t.team_id, description: t.description, details: t.details
          })),
          gameResults || [],
          saveMeta.playoff_series,
          saveMeta.sim_date
      );
      console.timeEnd("ReconstructState");

      // [Tactics History Restoration]
      // Check if _persistedHistory exists in the saved tactics JSON
      // This is a robust fallback if user_game_results lacks tactic data
      let tacticsToLoad = saveMeta.tactics || null;
      if (tacticsToLoad && tacticsToLoad._persistedHistory) {
          const historySnapshot = tacticsToLoad._persistedHistory;
          const myTeam = reconstructedTeams.find(t => t.id === saveMeta.team_id);
          if (myTeam) {
              // Apply persisted history (snapshot overrides empty/partial reconstruction)
              myTeam.tacticHistory = historySnapshot;
              console.log("✅ Restored Tactic History from Snapshot");
          }
          // Remove the internal history field before passing to app state
          const { _persistedHistory, ...cleanTactics } = tacticsToLoad;
          tacticsToLoad = cleanTactics;
      }

      // 6. Return formatted game data
      return {
          team_id: saveMeta.team_id,
          game_data: {
              teams: reconstructedTeams,
              schedule: reconstructedSchedule,
              currentSimDate: saveMeta.sim_date,
              tactics: tacticsToLoad, // Cleaned tactics object
              playoffSeries: saveMeta.playoff_series || [],
              transactions: (transactions || []).map((t: any) => ({
                id: t.id, date: t.date, type: t.type, teamId: t.team_id, description: t.description, details: t.details
              })),
              prospects: [] 
          },
          updated_at: saveMeta.updated_at
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

      console.log("💾 Updating Save Metadata...");

      // [Tactics Persistence Strategy]
      // We embed the aggregated tacticHistory into the 'tactics' JSONB column.
      // This ensures statistics survive even if game logs are incomplete or missing columns.
      const tacticsPayload = gameData.tactics ? {
          ...gameData.tactics,
          _persistedHistory: gameData.tacticHistory // Inject history snapshot
      } : null;

      const savePayload = {
        user_id: userId,
        team_id: teamId,
        sim_date: gameData.currentSimDate,
        tactics: tacticsPayload, 
        playoff_series: gameData.playoffSeries,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase.from('saves').upsert(savePayload, { onConflict: 'user_id' });

      if (error) {
          if (error.code === '42703') {
             console.error("❌ Save Failed: Schema mismatch.");
          } else {
             console.error("❌ Save Update Failed:", error);
          }
          throw error;
      }

      console.log("✅ Save Metadata Updated");
      return savePayload;
    }
  });
};

export const saveGameResults = async (results: any[]) => {
    if (results.length === 0) return;
    
    // [FIX: Safe Save Strategy]
    // 1. Try insertion with full data (including new 'tactics' field)
    const { error } = await supabase.from('user_game_results').insert(results);

    // 2. If it fails (likely due to schema mismatch if tactics column is missing), retry without tactics
    if (error) {
        console.warn("⚠️ Full game result save failed (likely schema mismatch). Retrying without tactics data...", error.message);
        
        const safeResults = results.map(r => {
            const { tactics, ...rest } = r; // Omit tactics from payload
            return rest;
        });
        
        const { error: retryError } = await supabase.from('user_game_results').insert(safeResults);
        
        if (retryError) {
            console.error("❌ Critical: Failed to save game results even without tactics.", retryError);
        } else {
            console.log("✅ Recovered: Game results saved (without tactics data).");
        }
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
