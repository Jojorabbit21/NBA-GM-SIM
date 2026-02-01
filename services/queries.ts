
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { Team, Game, Player, Transaction } from '../types';
import { resolveTeamId, mapDatabaseScheduleToRuntimeGame, FALLBACK_TEAMS, getTeamLogoUrl } from '../utils/constants';
import { generateScoutingReport } from './geminiService';

// --- Fetch Base Data (Teams & Schedule) ---
export const useBaseData = () => {
    return useQuery({
        queryKey: ['baseData'],
        queryFn: async () => {
            // 1. Fetch Raw Data from DB (Allow fail gracefully)
            const { data: playersData } = await supabase.from('players').select('*');
            const { data: scheduleData } = await supabase.from('schedule').select('*');
            
            // NOTE: We do NOT fetch 'teams' from DB for display names to ensure Korean names (FALLBACK_TEAMS) are used.
            // We only use DB for Players and Schedule.

            // 2. Base Teams Logic: Use FALLBACK_TEAMS as the Master Source of Truth for Metadata (Korean Names)
            // This guarantees UI is always in Korean regardless of DB content.
            const baseTeams = FALLBACK_TEAMS;

            // 3. Map Players to Teams (Fuzzy Match)
            const teams: Team[] = baseTeams.map((t) => {
                const teamId = t.id; // e.g., 'atl'
                
                // Find roster in playersData using fuzzy matching on team_id
                // DB might have 'ATL', 'Atlanta', 'Hawks' -> resolveTeamId handles all.
                const roster = (playersData || [])
                    .filter((p: any) => {
                        const playerTeamCode = resolveTeamId(p.team_id || p.Team);
                        return playerTeamCode === teamId;
                    })
                    .map((p: any) => ({
                        ...p,
                        // Ensure numeric types
                        ovr: Number(p.ovr),
                        age: Number(p.age),
                        salary: Number(p.salary),
                        // Initialize Runtime Stats if missing
                        stats: p.stats || { g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, rimM: 0, rimA: 0, midM: 0, midA: 0 },
                        playoffStats: p.playoffStats || { g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, rimM: 0, rimA: 0, midM: 0, midA: 0 }
                    }));

                return {
                    id: teamId,
                    name: t.name, // Korean Name from Constant
                    city: t.city, // Korean City from Constant
                    logo: getTeamLogoUrl(teamId),
                    conference: t.conference as 'East' | 'West',
                    division: t.division as 'Atlantic' | 'Central' | 'Southeast' | 'Northwest' | 'Pacific' | 'Southwest',
                    wins: 0,
                    losses: 0,
                    budget: 150, // Default
                    salaryCap: 140, // Default
                    luxuryTaxLine: 170, // Default
                    roster: roster
                };
            });

            // 4. Map Schedule
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
            // Simplified Save: Upsert to 'saves' table
            const { error } = await supabase
                .from('saves')
                .upsert({ 
                    user_id: userId, 
                    team_id: teamId, 
                    game_data: gameData,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });
            
            if (error) throw error;
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
                .single();
            
            if (error && error.code !== 'PGRST116') throw error; // Ignore no rows found
            return data;
        },
        enabled: !!userId
    });
};

// --- Game Results & Schedule ---
export const useMonthlySchedule = (userId: string | undefined, year: number, month: number) => {
    return useQuery({
        queryKey: ['monthlySchedule', userId, year, month],
        queryFn: async () => {
            if (!userId) return [];
            
            // Calculate start and end date for the month
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
