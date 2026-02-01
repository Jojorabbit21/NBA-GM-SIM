
import { supabase } from './supabaseClient';
import { Transaction } from '../types';

// 1. Save Metadata (Pointer to current progress)
export const saveCheckpoint = async (userId: string, teamId: string, simDate: string) => {
    if (!userId || !teamId || !simDate) {
        console.error("❌ [Persistence] Invalid Checkpoint Data:", { userId, teamId, simDate });
        return null;
    }

    const { data, error } = await supabase
        .from('saves')
        .upsert({ 
            user_id: userId, 
            team_id: teamId,
            sim_date: simDate,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' })
        .select();
    
    if (error) {
        console.error("❌ [Supabase] Save Meta Failed:", error);
        throw error;
    }
    return data;
};

// 2. Load Metadata
export const loadCheckpoint = async (userId: string) => {
    const { data, error } = await supabase
        .from('saves')
        .select('team_id, sim_date, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw error;
    return data;
};

// 3. Load History Logs (Source of Truth)
export const loadUserHistory = async (userId: string) => {
    // Parallel Fetch for Performance
    const [gamesRes, txRes] = await Promise.all([
        supabase.from('user_game_results').select('*').eq('user_id', userId).order('date', { ascending: true }),
        supabase.from('user_transactions').select('*').eq('user_id', userId).order('date', { ascending: true })
    ]);

    if (gamesRes.error) console.error("❌ History (Games) Load Error:", gamesRes.error);
    if (txRes.error) console.error("❌ History (TX) Load Error:", txRes.error);

    return {
        games: gamesRes.data || [],
        transactions: txRes.data || []
    };
};

// 4. Write Logs
export const writeGameResult = async (result: any) => {
    const { error } = await supabase.from('user_game_results').insert(result);
    if (error) console.error("❌ Write Game Result Error:", error);
};

export const writeTransaction = async (userId: string, tx: Transaction) => {
    const { error } = await supabase.from('user_transactions').insert({
        user_id: userId,
        transaction_id: tx.id,
        date: tx.date,
        type: tx.type,
        team_id: tx.teamId,
        description: tx.description,
        details: tx.details
    });
    if (error) console.error("❌ Write Transaction Error:", error);
};
