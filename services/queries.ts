
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { generateScoutingReport } from './geminiService';
import { 
  getTeamLogoUrl, 
  mapDatabasePlayerToRuntimePlayer, 
  mapDatabaseScheduleToRuntimeGame,
  INITIAL_STATS,
  INITIAL_TEAMS_DATA
} from '../utils/constants';
import { Team, Player, Game, Transaction, SeasonStats, PlayoffSeries } from '../types';

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
    gameResults: any[]
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
            const { acquired, traded, partnerTeamId } = tx.details;
            
            // My Team: Gained 'acquired', Lost 'traded'
            const myTeam = teamsMap.get(tx.teamId);
            const partnerTeam = teamsMap.get(partnerTeamId || '');

            if (myTeam && partnerTeam) {
                // Remove traded players from My Team
                if (traded) {
                    traded.forEach((tp: any) => {
                        const player = playerMap.get(tp.id);
                        if (player) {
                            myTeam.roster = myTeam.roster.filter(p => p.id !== tp.id);
                            // Add to Partner Team
                            if (!partnerTeam.roster.find(p => p.id === tp.id)) {
                                partnerTeam.roster.push(player);
                            }
                        }
                    });
                }
                
                // Remove acquired players from Partner Team (They act as 'traded' from partner's view)
                if (acquired) {
                    acquired.forEach((ap: any) => {
                        const player = playerMap.get(ap.id);
                        if (player) {
                            partnerTeam.roster = partnerTeam.roster.filter(p => p.id !== ap.id);
                            // Add to My Team
                            if (!myTeam.roster.find(p => p.id === ap.id)) {
                                myTeam.roster.push(player);
                            }
                        }
                    });
                }
            }
        }
    });

    // 3. Aggregate Stats from Game Results
    const scheduleMap = new Map<string, Game>();
    baseSchedule.forEach(g => scheduleMap.set(g.id, { ...g }));

    gameResults.forEach((res: any) => {
        // 3-1. Update Schedule Status
        const game = scheduleMap.get(res.game_id);
        if (game) {
            game.played = true;
            game.homeScore = res.home_score;
            game.awayScore = res.away_score;
            
            // 3-2. Update Team Standings
            const homeTeam = teamsMap.get(game.homeTeamId);
            const awayTeam = teamsMap.get(game.awayTeamId);
            
            if (homeTeam && awayTeam) {
                if (res.home_score > res.away_score) {
                    homeTeam.wins += 1;
                    awayTeam.losses += 1;
                } else {
                    awayTeam.wins += 1;
                    homeTeam.losses += 1;
                }
            }
        }

        // 3-3. Aggregate Player Box Scores
        // DB의 box_score는 { home: PlayerBoxScore[], away: PlayerBoxScore[] } 형태임
        const boxData = res.box_score;
        if (boxData) {
            const allBoxStats = [...(boxData.home || []), ...(boxData.away || [])];
            
            allBoxStats.forEach((stat: any) => {
                const player = playerMap.get(stat.playerId);
                if (player) {
                    // Decide if regular season or playoff stats
                    const targetStats = game?.isPlayoff ? player.playoffStats : player.stats;
                    
                    // Accumulate
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

    return {
        teams: Array.from(teamsMap.values()),
        schedule: Array.from(scheduleMap.values())
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
      
      // Fallback if DB is empty/error
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

      // 1. Fetch Save Metadata (Date, Team)
      // Saves table structure: user_id | team_id | sim_date | updated_at
      const { data: saveMeta, error: saveError } = await supabase
          .from('saves')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

      if (saveError || !saveMeta) {
          console.log("No save found.");
          return null;
      }

      // 2. Fetch Base Data (Teams, Schedule, Players)
      // Check cache first
      let baseData = queryClient.getQueryData<{teams: Team[], schedule: Game[]}>(['baseData']);
      if (!baseData) {
          console.log("Base data missing in cache, fetching...");
          // Manually trigger base data fetch if not in cache
          // (Simplified for this function, assuming baseData is usually loaded by App)
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

      // 3. Fetch Transactions (for Roster Moves)
      const { data: transactions } = await supabase
          .from('user_transactions')
          .select('*')
          .eq('user_id', userId);

      // 4. Fetch Game Results (for Stats & Records)
      // Note: fetching ALL results might be heavy eventually, but OK for now.
      const { data: gameResults } = await supabase
          .from('user_game_results')
          .select('game_id, home_score, away_score, box_score, date')
          .eq('user_id', userId);

      // 5. Reconstruct State
      console.time("ReconstructState");
      const { teams: reconstructedTeams, schedule: reconstructedSchedule } = reconstructGameState(
          baseData.teams,
          baseData.schedule,
          (transactions || []).map((t: any) => ({
              id: t.id, date: t.date, type: t.type, teamId: t.team_id, description: t.description, details: t.details
          })),
          gameResults || []
      );
      console.timeEnd("ReconstructState");

      // [Reverted] Do not calculate date from game history. 
      // Rely on the 'saveMeta.sim_date' which is now updated immediately via 'saveDateImmediately'.
      
      // 6. Return formatted game data
      return {
          team_id: saveMeta.team_id,
          game_data: {
              teams: reconstructedTeams,
              schedule: reconstructedSchedule,
              currentSimDate: saveMeta.sim_date, // Direct use of DB Date
              tactics: null, 
              playoffSeries: [], 
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

      console.log("💾 Updating Save Metadata (Date only)...");

      // Now we only save the Date and Team ID. 
      // Stats are saved via 'saveGameResults', Rosters via 'saveUserTransaction'.
      const savePayload = {
        user_id: userId,
        team_id: teamId,
        sim_date: gameData.currentSimDate,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase.from('saves').upsert(savePayload, { onConflict: 'user_id' });

      if (error) {
          console.error("❌ Save Update Failed:", error);
          throw error;
      }

      console.log("✅ Save Metadata Updated");
      return savePayload;
    }
  });
};

export const saveGameResults = async (results: any[]) => {
    if (results.length === 0) return;
    // user_game_results table must have: user_id, game_id, home_score, away_score, box_score (jsonb), date
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
