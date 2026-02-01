
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { Team, Game, Player, Transaction } from '../types';
import { generateScoutingReport } from './geminiService';
import { mapPlayersToTeams, mapDatabaseScheduleToRuntimeGame } from './dataMapper';

// --- Fetch Base Data (Static Initial State) ---
export const useBaseData = () => {
    return useQuery({
        queryKey: ['baseData'],
        queryFn: async () => {
            console.log("🔄 Fetching Base Data from Supabase...");
            
            // 1. Fetch Players
            let playersData = [];
            const { data: metaPlayers, error: metaError } = await supabase.from('meta_players').select('*');
            
            if (!metaError && metaPlayers && metaPlayers.length > 0) {
                playersData = metaPlayers;
            } else {
                console.warn("⚠️ 'meta_players' empty/error, trying fallback...", metaError);
                const { data: backupPlayers } = await supabase.from('players').select('*');
                if (backupPlayers) playersData = backupPlayers;
            }

            // 2. Fetch Schedule
            let scheduleData = [];
            const { data: metaSchedule, error: schError } = await supabase.from('meta_schedule').select('*');
            
            if (!schError && metaSchedule && metaSchedule.length > 0) {
                 scheduleData = metaSchedule;
            } else {
                 console.warn("⚠️ 'meta_schedule' empty/error, trying fallback...", schError);
                 const { data: backupSchedule } = await supabase.from('schedule').select('*');
                 if (backupSchedule) scheduleData = backupSchedule;
            }

            // 3. Map Data
            const teams: Team[] = mapPlayersToTeams(playersData);
            let schedule: Game[] = [];
            if (scheduleData && scheduleData.length > 0) {
                schedule = mapDatabaseScheduleToRuntimeGame(scheduleData);
            }
            
            return { teams, schedule };
        },
        staleTime: Infinity,
        retry: 2
    });
};

// --- Save System (Metadata Only) ---
export const useSaveGame = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ userId, teamId }: { userId: string, teamId: string }) => {
            // saves 테이블에는 오직 현재 플레이 중인 팀 정보와 시간만 남김
            // 실제 데이터는 user_game_results와 user_transactions에 쌓임
            const { data, error } = await supabase
                .from('saves')
                .upsert({ 
                    user_id: userId, 
                    team_id: teamId, 
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' })
                .select();
            
            if (error) {
                console.error("❌ [Supabase] Save Meta Failed:", error);
                throw error;
            }
            return data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['saveData', variables.userId] });
        }
    });
};

// --- Load System (Reconstruction Source) ---

// 1. Load Metadata (Which team am I playing?)
export const useLoadSave = (userId?: string) => {
    return useQuery({
        queryKey: ['saveData', userId],
        queryFn: async () => {
            if (!userId) return null;
            
            const { data, error } = await supabase
                .from('saves')
                .select('team_id, updated_at')
                .eq('user_id', userId)
                .maybeSingle();
            
            if (error) {
                console.error("❌ [Supabase] Load Meta Error:", error);
                throw error;
            }
            return data; // returns { team_id, updated_at }
        },
        enabled: !!userId,
        retry: false 
    });
};

// 2. Load Full History (Games & Transactions) for State Reconstruction
export const useUserHistory = (userId?: string) => {
    return useQuery({
        queryKey: ['userHistory', userId],
        queryFn: async () => {
            if (!userId) return { games: [], transactions: [] };

            // A. Fetch All Game Results
            const { data: games, error: gamesError } = await supabase
                .from('user_game_results')
                .select('*')
                .eq('user_id', userId)
                .order('date', { ascending: true }); // 날짜 순 정렬 필수

            if (gamesError) console.error("❌ Failed to fetch game history:", gamesError);

            // B. Fetch All Transactions
            const { data: transactions, error: txError } = await supabase
                .from('user_transactions')
                .select('*')
                .eq('user_id', userId)
                .order('date', { ascending: true }); // 날짜 순 정렬 필수

            if (txError) console.error("❌ Failed to fetch transaction history:", txError);

            return {
                games: games || [],
                transactions: transactions || []
            };
        },
        enabled: !!userId,
        refetchOnWindowFocus: false
    });
};

// 3. Load Monthly Schedule (For Schedule View Pagination)
export const useMonthlySchedule = (userId?: string, year?: number, month?: number) => {
    return useQuery({
        queryKey: ['monthlySchedule', userId, year, month],
        queryFn: async () => {
            if (!userId || year === undefined || month === undefined) return [];

            // Construct string date range for the month (YYYY-MM-DD)
            // Month is 0-indexed
            const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
            const lastDay = new Date(year, month + 1, 0).getDate();
            const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;

            const { data, error } = await supabase
                .from('user_game_results')
                .select('*')
                .eq('user_id', userId)
                .gte('date', startStr)
                .lte('date', endStr);

            if (error) {
                console.error("❌ Failed to fetch monthly schedule:", error);
                return [];
            }
            return data || [];
        },
        enabled: !!userId && year !== undefined && month !== undefined,
        staleTime: 60 * 1000 // 1 minute
    });
};

// --- Transaction Writers ---

export const saveGameResults = async (results: any[]) => {
    const { error } = await supabase
        .from('user_game_results')
        .insert(results);
    if (error) console.error("❌ Error saving game results:", error);
    else console.log(`✅ Saved ${results.length} game results to DB.`);
};

export const saveUserTransaction = async (userId: string, transaction: Transaction) => {
    const { error } = await supabase
        .from('user_transactions')
        .insert({
            user_id: userId,
            transaction_id: transaction.id,
            date: transaction.date,
            type: transaction.type,
            team_id: transaction.teamId,
            description: transaction.description,
            details: transaction.details // JSONB
        });
    if (error) console.error("❌ Error saving transaction:", error);
    else console.log("✅ Transaction saved to DB.");
};

// --- Scouting ---
export const useScoutingReport = (player: Player | null) => {
    return useQuery({
        queryKey: ['scoutingReport', player?.id],
        queryFn: async () => {
            if (!player) return null;
            return await generateScoutingReport(player);
        },
        enabled: !!player,
        staleTime: Infinity
    });
};
