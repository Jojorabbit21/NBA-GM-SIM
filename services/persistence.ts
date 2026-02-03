
import { supabase } from './supabaseClient';
import { Transaction, GameTactics } from '../types';

// 0. Register Device ID (Enforce Single Session)
export const registerDeviceId = async (userId: string, deviceId: string) => {
    const { error } = await supabase
        .from('profiles')
        .update({ active_device_id: deviceId })
        .eq('id', userId);
    
    if (error) {
        console.error("❌ [Persistence] Failed to register device ID:", error);
    } else {
        console.log("🔒 [Security] Session Locked to Device:", deviceId);
    }
};

// 1. Save Metadata (Pointer to current progress)
// [Update] Added deviceId verification for Anti-Cheat
export const saveCheckpoint = async (
    userId: string, 
    teamId: string, 
    simDate: string, 
    tactics?: GameTactics | null,
    currentDeviceId?: string // New Param
) => {
    if (!userId || !teamId || !simDate) {
        console.error("❌ [Persistence] Invalid Checkpoint Data:", { userId, teamId, simDate });
        return null;
    }

    // [Anti-Cheat] Verify Session Integrity
    if (currentDeviceId) {
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('active_device_id')
            .eq('id', userId)
            .single();

        if (!profileError && profile) {
            if (profile.active_device_id !== currentDeviceId) {
                console.error("⛔ [Security] Duplicate Login Detected. Access Denied.");
                throw new Error("DUPLICATE_LOGIN");
            }
        }
    }

    const payload: any = { 
        user_id: userId, 
        team_id: teamId,
        sim_date: simDate,
        updated_at: new Date().toISOString()
    };

    // Only add tactics if it exists to avoid overwriting with null if unintentional
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
// [Update] Select tactics column
export const loadCheckpoint = async (userId: string) => {
    const { data, error } = await supabase
        .from('saves')
        .select('team_id, sim_date, tactics, updated_at') // Added tactics
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
