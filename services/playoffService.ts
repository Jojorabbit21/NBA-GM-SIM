
import { supabase } from './supabaseClient';
import { PlayoffSeries, PlayoffStateDB, PlayoffGameResultDB } from '../types';

/**
 * Loads the current state of the playoffs from DB.
 */
export const loadPlayoffState = async (userId: string, teamId: string): Promise<PlayoffStateDB | null> => {
    const { data, error } = await supabase
        .from('user_playoffs')
        .select('*')
        .eq('user_id', userId)
        .eq('team_id', teamId)
        .maybeSingle();
    
    if (error) {
        console.error("❌ Failed to load playoff state:", error);
        return null;
    }
    return data;
};

/**
 * Initializes or Updates the Playoff Bracket State in DB.
 */
export const savePlayoffState = async (
    userId: string, 
    teamId: string, 
    bracketData: PlayoffSeries[], 
    currentRound: number = 0,
    isFinished: boolean = false,
    championId?: string
) => {
    const payload = {
        user_id: userId,
        team_id: teamId,
        season: '2025-2026',
        bracket_data: { series: bracketData }, // Wrap in object for JSONB
        current_round: currentRound,
        is_finished: isFinished,
        champion_id: championId,
        updated_at: new Date().toISOString()
    };

    const { error } = await supabase
        .from('user_playoffs')
        .upsert(payload, { onConflict: 'user_id, team_id, season' });

    if (error) {
        console.error("❌ Failed to save playoff state:", error);
    } else {
        console.log("✅ Playoff Bracket Saved.");
    }
};

/**
 * Saves a single playoff game result.
 */
export const savePlayoffGameResult = async (result: PlayoffGameResultDB) => {
    const { error } = await supabase
        .from('user_playoffs_results')
        .insert(result);
        
    if (error) {
        console.error("❌ Failed to save playoff game result:", error);
    }
};

/**
 * Loads all playoff games for the current user/team.
 * Used to replay state on load.
 */
export const loadPlayoffGameResults = async (userId: string) => {
    const { data, error } = await supabase
        .from('user_playoffs_results')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });

    if (error) {
        console.error("❌ Failed to load playoff results:", error);
        return [];
    }
    return data;
};
