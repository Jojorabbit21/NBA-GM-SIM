
import { supabase } from './supabaseClient';
import { GameTactics, TacticPreset } from '../types';

/**
 * Fetch all presets for a user and team
 */
export const fetchPresets = async (userId: string, teamId: string): Promise<TacticPreset[]> => {
    const { data, error } = await supabase
        .from('user_tactics')
        .select('*')
        .eq('user_id', userId)
        .eq('team_id', teamId)
        .order('slot_number', { ascending: true });

    if (error) {
        console.error("❌ Failed to fetch presets:", error);
        return [];
    }

    return data.map((item: any) => ({
        slot: item.slot_number,
        name: item.preset_name,
        data: item.tactics_data
    }));
};

/**
 * Save (Upsert) a preset
 */
export const savePreset = async (
    userId: string, 
    teamId: string, 
    slot: number, 
    name: string, 
    fullTactics: GameTactics
): Promise<boolean> => {
    
    // Filter data to only include strategy, not roster/lineup
    const tacticsData = {
        offenseTactics: fullTactics.offenseTactics,
        defenseTactics: fullTactics.defenseTactics,
        sliders: fullTactics.sliders
        // Note: Starters, Minutes, StopperID are excluded per requirement
    };

    const payload = {
        user_id: userId,
        team_id: teamId,
        slot_number: slot,
        preset_name: name,
        tactics_data: tacticsData,
        updated_at: new Date().toISOString()
    };

    const { error } = await supabase
        .from('user_tactics')
        .upsert(payload, { onConflict: 'user_id, team_id, slot_number' });

    if (error) {
        console.error("❌ Failed to save preset:", error);
        return false;
    }
    return true;
};

/**
 * Delete a preset
 */
export const deletePreset = async (userId: string, teamId: string, slot: number): Promise<boolean> => {
    const { error } = await supabase
        .from('user_tactics')
        .delete()
        .eq('user_id', userId)
        .eq('team_id', teamId)
        .eq('slot_number', slot);

    if (error) {
        console.error("❌ Failed to delete preset:", error);
        return false;
    }
    return true;
};

/**
 * Rename a preset (Update name only)
 */
export const renamePreset = async (
    userId: string, 
    teamId: string, 
    slot: number, 
    newName: string
): Promise<boolean> => {
    const { error } = await supabase
        .from('user_tactics')
        .update({ preset_name: newName, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('team_id', teamId)
        .eq('slot_number', slot);

    if (error) {
        console.error("❌ Failed to rename preset:", error);
        return false;
    }
    return true;
};
