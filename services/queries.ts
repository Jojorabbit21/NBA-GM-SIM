
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { Team, Game, Player, Transaction } from '../types';
import { generateScoutingReport } from './geminiService';
import { mapPlayersToTeams, mapDatabaseScheduleToRuntimeGame } from './dataMapper';

// --- Fetch Base Data (Teams & Schedule) ---
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

// --- Save/Load System ---
export const useSaveGame = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ userId, teamId, gameData }: { userId: string, teamId: string, gameData: any }) => {
            const payloadSize = JSON.stringify(gameData).length;
            console.log(`💾 [Supabase] Upserting Save... User: ${userId}, Size: ${payloadSize} bytes`);

            // 방어 코드: 데이터가 비어있으면 저장하지 않음
            if (payloadSize < 100) {
                console.error("❌ [Supabase] Save Aborted: Payload too small/empty!");
                throw new Error("Save payload is empty");
            }

            const { data, error } = await supabase
                .from('saves')
                .upsert({ 
                    user_id: userId, 
                    team_id: teamId, 
                    game_data: gameData,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' })
                .select();
            
            if (error) {
                console.error("❌ [Supabase] DB Error:", error);
                throw error;
            }
            
            return data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['saveData', variables.userId] });
        }
    });
};

export const useLoadSave = (userId?: string) => {
    return useQuery({
        queryKey: ['saveData', userId],
        queryFn: async () => {
            if (!userId) return null;
            
            const { data, error } = await supabase
                .from('saves')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();
            
            if (error) {
                console.error("❌ [Supabase] Load Error:", error);
                throw error;
            }
            return data;
        },
        enabled: !!userId,
        retry: false 
    });
};

// --- Game Results & Schedule ---
export const useMonthlySchedule = (userId: string | undefined, year: number, month: number) => {
    return useQuery({
        queryKey: ['monthlySchedule', userId, year, month],
        queryFn: async () => {
            if (!userId) return [];
            
            const startDate = new Date(year, month, 1).toISOString().split('T')[0];
            const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

            const { data, error } = await supabase
                .from('user_game_results')
                .select('*')
                .eq('user_id', userId)
                .gte('date', startDate)
                .lte('date', endDate);

            if (error) throw error;
            return data;
        },
        enabled: !!userId
    });
};

export const saveGameResults = async (results: any[]) => {
    const { error } = await supabase
        .from('user_game_results')
        .insert(results);
    if (error) console.error("Error saving game results:", error);
};

// --- Transactions ---
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
            details: transaction.details
        });
    if (error) console.error("Error saving transaction:", error);
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
