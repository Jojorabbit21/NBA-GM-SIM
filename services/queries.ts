
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabaseClient';
import { Team, Game, Player, Transaction } from '../types';
import { resolveTeamId, mapDatabaseScheduleToRuntimeGame, FALLBACK_TEAMS, getTeamLogoUrl } from '../utils/constants';
import { generateScoutingReport } from './geminiService';

// --- Helper: Flexible Column Getter ---
const getCol = (item: any, keys: string[]) => {
    for (const k of keys) {
        if (item[k] !== undefined && item[k] !== null) return item[k];
    }
    return undefined;
};

// --- Fetch Base Data (Teams & Schedule) ---
export const useBaseData = () => {
    return useQuery({
        queryKey: ['baseData'],
        queryFn: async () => {
            console.log("🔄 Fetching Base Data from Supabase...");
            
            // 1. Fetch Players (Try 'meta_players' first, then 'players')
            let playersData = [];
            const { data: metaPlayers, error: metaError } = await supabase.from('meta_players').select('*');
            
            if (!metaError && metaPlayers && metaPlayers.length > 0) {
                console.log(`✅ Loaded ${metaPlayers.length} players from 'meta_players'`);
                playersData = metaPlayers;
            } else {
                console.warn("⚠️ 'meta_players' not found or empty, trying 'players'...", metaError);
                const { data: backupPlayers } = await supabase.from('players').select('*');
                if (backupPlayers) playersData = backupPlayers;
            }

            // 2. Fetch Schedule (Try 'meta_schedule' first, then 'schedule')
            let scheduleData = [];
            const { data: metaSchedule, error: schError } = await supabase.from('meta_schedule').select('*');
            
            if (!schError && metaSchedule && metaSchedule.length > 0) {
                 console.log(`✅ Loaded ${metaSchedule.length} games from 'meta_schedule'`);
                 scheduleData = metaSchedule;
            } else {
                 console.warn("⚠️ 'meta_schedule' not found or empty, trying 'schedule'...", schError);
                 const { data: backupSchedule } = await supabase.from('schedule').select('*');
                 if (backupSchedule) scheduleData = backupSchedule;
            }

            // 3. Base Teams Logic: Use FALLBACK_TEAMS as Master Metadata
            const baseTeams = FALLBACK_TEAMS;

            // 4. Map Players to Teams (Robust Mapping)
            const teams: Team[] = baseTeams.map((t) => {
                const teamId = t.id; // e.g., 'atl'
                const teamCity = t.city.toLowerCase();
                const teamName = t.name.toLowerCase();

                // Filter roster using fuzzy team ID matching + City/Name fallback
                const roster = playersData
                    .filter((p: any) => {
                        // Support various column names for Team ID
                        const rawTeamId = getCol(p, ['team_id', 'Team', 'team', 'TeamID', 'Tm']);
                        
                        if (!rawTeamId) return false;

                        // 1. Try resolving ID directly
                        const resolvedId = resolveTeamId(rawTeamId);
                        if (resolvedId === teamId) return true;

                        // 2. Fallback: Check if raw data contains City or Name (e.g. "Boston" in "Boston Celtics")
                        const rawString = String(rawTeamId).toLowerCase();
                        if (rawString.includes(teamCity) || rawString.includes(teamName)) {
                            return true;
                        }

                        return false;
                    })
                    .map((p: any) => {
                        // Support various column names for Player Attributes
                        return {
                            id: getCol(p, ['id', 'player_id', 'PlayerID']) || `p_${Math.random().toString(36).substr(2, 9)}`,
                            name: getCol(p, ['name', 'Player', 'Name', 'player_name']) || "Unknown Player",
                            position: getCol(p, ['position', 'Pos', 'Position', 'POS']) || "G",
                            age: Number(getCol(p, ['age', 'Age']) || 20),
                            height: Number(getCol(p, ['height', 'Height', 'Ht']) || 200),
                            weight: Number(getCol(p, ['weight', 'Weight', 'Wt']) || 100),
                            salary: Number(getCol(p, ['salary', 'Salary']) || 5),
                            contractYears: Number(getCol(p, ['contractYears', 'ContractYears']) || 1),
                            
                            // Game Attributes (Default to 70 if missing)
                            ovr: Number(getCol(p, ['ovr', 'OVR', 'Overall']) || 70),
                            potential: Number(getCol(p, ['potential', 'POT', 'Potential']) || 75),
                            revealedPotential: Number(getCol(p, ['potential', 'POT', 'Potential']) || 75),
                            
                            health: 'Healthy' as const,
                            condition: 100,

                            // Detailed Stats (Map or Default)
                            ins: Number(getCol(p, ['ins', 'INS']) || 70),
                            out: Number(getCol(p, ['out', 'OUT']) || 70),
                            ath: Number(getCol(p, ['ath', 'ATH']) || 70),
                            plm: Number(getCol(p, ['plm', 'PLM']) || 70),
                            def: Number(getCol(p, ['def', 'DEF']) || 70),
                            reb: Number(getCol(p, ['reb', 'REB']) || 70),

                            // Sub-attributes (Derived or Direct)
                            // If DB doesn't have detailed sub-stats, use the main category value
                            closeShot: Number(getCol(p, ['closeShot']) || getCol(p, ['ins']) || 70),
                            midRange: Number(getCol(p, ['midRange']) || getCol(p, ['out']) || 70),
                            threeCorner: Number(getCol(p, ['threeCorner', 'threePoint']) || getCol(p, ['out']) || 70),
                            three45: Number(getCol(p, ['three45']) || getCol(p, ['out']) || 70),
                            threeTop: Number(getCol(p, ['threeTop']) || getCol(p, ['out']) || 70),
                            ft: Number(getCol(p, ['ft', 'FT']) || 75),
                            shotIq: Number(getCol(p, ['shotIq']) || 75),
                            offConsist: Number(getCol(p, ['offConsist']) || 70),
                            
                            layup: Number(getCol(p, ['layup']) || getCol(p, ['ins']) || 70),
                            dunk: Number(getCol(p, ['dunk']) || getCol(p, ['ins']) || 70),
                            postPlay: Number(getCol(p, ['postPlay']) || getCol(p, ['ins']) || 70),
                            drawFoul: Number(getCol(p, ['drawFoul']) || 70),
                            hands: Number(getCol(p, ['hands']) || 70),

                            passAcc: Number(getCol(p, ['passAcc']) || getCol(p, ['plm']) || 70),
                            handling: Number(getCol(p, ['handling']) || getCol(p, ['plm']) || 70),
                            spdBall: Number(getCol(p, ['spdBall']) || getCol(p, ['plm']) || 70),
                            passIq: Number(getCol(p, ['passIq']) || getCol(p, ['plm']) || 70),
                            passVision: Number(getCol(p, ['passVision']) || getCol(p, ['plm']) || 70),

                            intDef: Number(getCol(p, ['intDef']) || getCol(p, ['def']) || 70),
                            perDef: Number(getCol(p, ['perDef']) || getCol(p, ['def']) || 70),
                            steal: Number(getCol(p, ['steal', 'STL']) || getCol(p, ['def']) || 70),
                            blk: Number(getCol(p, ['blk', 'BLK']) || getCol(p, ['def']) || 70),
                            helpDefIq: Number(getCol(p, ['helpDefIq']) || 70),
                            passPerc: Number(getCol(p, ['passPerc']) || 70),
                            defConsist: Number(getCol(p, ['defConsist']) || 70),

                            offReb: Number(getCol(p, ['offReb', 'ORB']) || getCol(p, ['reb']) || 70),
                            defReb: Number(getCol(p, ['defReb', 'DRB']) || getCol(p, ['reb']) || 70),

                            speed: Number(getCol(p, ['speed', 'SPD']) || getCol(p, ['ath']) || 70),
                            agility: Number(getCol(p, ['agility', 'AGI']) || getCol(p, ['ath']) || 70),
                            strength: Number(getCol(p, ['strength', 'STR']) || getCol(p, ['ath']) || 70),
                            vertical: Number(getCol(p, ['vertical', 'JMP']) || getCol(p, ['ath']) || 70),
                            stamina: Number(getCol(p, ['stamina', 'STA']) || getCol(p, ['ath']) || 80),
                            hustle: Number(getCol(p, ['hustle']) || 75),
                            durability: Number(getCol(p, ['durability']) || 80),
                            intangibles: Number(getCol(p, ['intangibles']) || 70),

                            // Runtime Stats Containers
                            stats: p.stats || { g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, rimM: 0, rimA: 0, midM: 0, midA: 0 },
                            playoffStats: p.playoffStats || { g: 0, gs: 0, mp: 0, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, rimM: 0, rimA: 0, midM: 0, midA: 0 }
                        };
                    });

                return {
                    id: teamId,
                    name: t.name, // Korean Name
                    city: t.city, // Korean City
                    logo: getTeamLogoUrl(teamId),
                    conference: t.conference as 'East' | 'West',
                    division: t.division as 'Atlantic' | 'Central' | 'Southeast' | 'Northwest' | 'Pacific' | 'Southwest',
                    wins: 0,
                    losses: 0,
                    budget: 150,
                    salaryCap: 140,
                    luxuryTaxLine: 170,
                    roster: roster
                };
            });

            // 5. Map Schedule
            let schedule: Game[] = [];
            if (scheduleData && scheduleData.length > 0) {
                schedule = mapDatabaseScheduleToRuntimeGame(scheduleData);
            }
            console.log("✅ Data Processing Complete. Total Teams:", teams.length, "Total Games:", schedule.length);

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
            // Use maybeSingle() instead of single() to handle 0 rows gracefully without error
            const { data, error } = await supabase
                .from('saves')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();
            
            if (error) throw error;
            return data;
        },
        enabled: !!userId,
        retry: false // Do not retry on 406 or 404
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
