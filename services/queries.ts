
import { useQuery } from '@tanstack/react-query';
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
            
            let playersData = [];
            const { data: metaPlayers, error: metaError } = await supabase.from('meta_players').select('*');
            
            if (!metaError && metaPlayers && metaPlayers.length > 0) {
                playersData = metaPlayers;
            } else {
                console.warn("⚠️ 'meta_players' empty/error, trying fallback...", metaError);
                const { data: backupPlayers } = await supabase.from('players').select('*');
                if (backupPlayers) playersData = backupPlayers;
            }

            let scheduleData = [];
            const { data: metaSchedule, error: schError } = await supabase.from('meta_schedule').select('*');
            
            if (!schError && metaSchedule && metaSchedule.length > 0) {
                 scheduleData = metaSchedule;
            } else {
                 console.warn("⚠️ 'meta_schedule' empty/error, trying fallback...", schError);
                 const { data: backupSchedule } = await supabase.from('schedule').select('*');
                 if (backupSchedule) scheduleData = backupSchedule;
            }

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

// --- Monthly Schedule for Calendar View ---
export const useMonthlySchedule = (userId?: string, year?: number, month?: number) => {
    return useQuery({
        queryKey: ['monthlySchedule', userId, year, month],
        queryFn: async () => {
            if (!userId || year === undefined || month === undefined) return [];

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

// --- Single Game Result for Inbox Detail ---
export const fetchFullGameResult = async (gameId: string, userId: string) => {
    const { data, error } = await supabase
        .from('user_game_results')
        .select('*')
        .eq('game_id', gameId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) {
        console.error("❌ Failed to fetch game details:", error);
        return null;
    }
    return data;
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

// --- Mutations ---

export const saveGameResults = async (results: any[]) => {
    if (!results || results.length === 0) return;
    
    // 1. Try saving with FULL data (including pbp_logs, shot_events)
    const { error } = await supabase.from('user_game_results').insert(results);
    
    if (error) {
        console.error("❌ Save Full Game Results Error:", error.message);
        
        // 2. Fallback: If error is due to missing columns, retry without heavy logs
        // Postgres error code 42703 is "undefined_column", but Supabase/Postgrest message checking is safer
        if (error.message && (error.message.includes('column') || error.message.includes('does not exist'))) {
            console.warn("⚠️ DB Schema mismatch detected. Retrying save WITHOUT 'pbp_logs' and 'shot_events'. PLEASE RUN SQL MIGRATION.");
            
            const safeResults = results.map(r => {
                // Destructure to exclude the problematic columns
                const { pbp_logs, shot_events, ...rest } = r;
                return rest;
            });
            
            const { error: retryError } = await supabase.from('user_game_results').insert(safeResults);
            
            if (retryError) {
                console.error("❌ Save Fallback Failed:", retryError);
            } else {
                console.log("✅ Saved game results (Partial Data - Logs Dropped) to DB.");
            }
        }
    } else {
        console.log(`✅ Saved ${results.length} game results (Full Data) to DB.`);
    }
};

export const saveUserTransaction = async (userId: string, tx: Transaction) => {
    console.log("💾 Saving Transaction:", { userId, tx }); 
    const { data, error } = await supabase.from('user_transactions').insert({
        id: tx.id,
        user_id: userId,
        date: tx.date,
        type: tx.type,
        team_id: tx.teamId,
        description: tx.description,
        details: tx.details
    }).select(); 
    
    if (error) {
        console.error("❌ Save Transaction Error DETAILS:", error);
    } else {
        console.log("✅ Transaction Saved Successfully:", data);
    }
};
