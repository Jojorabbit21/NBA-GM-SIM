
import { supabase } from './supabaseClient';
import { Transaction, GameTactics } from '../types';

// 1. Save Metadata (Pointer to current progress)
export const saveCheckpoint = async (
    userId: string, 
    teamId: string, 
    simDate: string, 
    tactics?: GameTactics | null
) => {
    if (!userId || !teamId || !simDate) return null;

    const payload: any = { 
        user_id: userId, 
        team_id: teamId,
        sim_date: simDate,
        updated_at: new Date().toISOString()
    };

    if (tactics) {
        payload.tactics = tactics;
    }

    const { data, error } = await supabase
        .from('saves')
        .upsert(payload, { onConflict: 'user_id' })
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
        .select('team_id, sim_date, tactics, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw error;
    return data;
};

// 3. Load History Logs (Source of Truth)
export const loadUserHistory = async (userId: string) => {
    const [gamesRes, txRes] = await Promise.all([
        supabase.from('user_game_results').select('*').eq('user_id', userId).order('date', { ascending: true }),
        supabase.from('user_transactions').select('*').eq('user_id', userId).order('date', { ascending: true })
    ]);

    return {
        games: gamesRes.data || [],
        transactions: txRes.data || []
    };
};

// 4. Write Logs
export const writeGameResult = async (result: any) => {
    await supabase.from('user_game_results').insert(result);
};

export const writeTransaction = async (userId: string, tx: Transaction) => {
    await supabase.from('user_transactions').insert({
        user_id: userId,
        transaction_id: tx.id,
        date: tx.date,
        type: tx.type,
        team_id: tx.teamId,
        description: tx.description,
        details: tx.details
    });
};
