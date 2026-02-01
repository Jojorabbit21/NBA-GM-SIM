
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { Team, Game, PlayoffSeries, Transaction, Player, GameTactics, PlayerBoxScore } from '../types';
import { useBaseData, useLoadSave, useSaveGame, useUserHistory } from '../services/queries';
import { generateSeasonSchedule, INITIAL_STATS } from '../utils/constants';
import { generateOwnerWelcome } from '../services/geminiService';

export const INITIAL_DATE = '2025-10-20';

export const useGameData = (session: any, isGuestMode: boolean) => {
    const queryClient = useQueryClient();

    // --- State ---
    const [myTeamId, setMyTeamId] = useState<string | null>(null);
    const [teams, setTeams] = useState<Team[]>([]);
    const [schedule, setSchedule] = useState<Game[]>([]);
    const [playoffSeries, setPlayoffSeries] = useState<PlayoffSeries[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [prospects, setProspects] = useState<Player[]>([]);
    const [currentSimDate, setCurrentSimDate] = useState<string>(INITIAL_DATE);
    const [userTactics, setUserTactics] = useState<GameTactics | null>(null);
    const [news, setNews] = useState<any[]>([]);

    // --- Status Flags ---
    const isResettingRef = useRef(false);
    const hasInitialLoadRef = useRef(false);
    const [isReconstructing, setIsReconstructing] = useState(false);

    // --- Queries ---
    const saveGameMutation = useSaveGame();
    const { data: baseData, isLoading: isBaseDataLoading } = useBaseData();
    const { data: saveMeta, isLoading: isSaveMetaLoading } = useLoadSave(session?.user?.id);
    const { data: userHistory, isLoading: isHistoryLoading } = useUserHistory(session?.user?.id);

    // ------------------------------------------------------------------
    //  CORE LOGIC: State Reconstruction from History (Replay)
    // ------------------------------------------------------------------
    useEffect(() => {
        // 1. Wait for all data sources to be ready
        if (isBaseDataLoading || isSaveMetaLoading || isHistoryLoading || !baseData) return;
        if (isResettingRef.current || hasInitialLoadRef.current) return;

        // Guest Mode: Just load base data
        if (isGuestMode) {
            setTeams(JSON.parse(JSON.stringify(baseData.teams)));
            setSchedule(JSON.parse(JSON.stringify(baseData.schedule)));
            hasInitialLoadRef.current = true;
            return;
        }

        // 2. Check if user has a save file (Team ID)
        if (saveMeta && saveMeta.team_id) {
            console.log(`📂 [Reconstruction] Found Save for Team: ${saveMeta.team_id}. Replaying history...`);
            setIsReconstructing(true);

            // A. Deep Copy Base Data (Starting Point)
            const reconstructedTeams: Team[] = JSON.parse(JSON.stringify(baseData.teams));
            let reconstructedSchedule: Game[] = JSON.parse(JSON.stringify(baseData.schedule));
            let lastDate = INITIAL_DATE;

            // B. Replay Transactions (Trade/Sign)
            const txHistory = userHistory?.transactions || [];
            
            txHistory.forEach((tx: any) => {
                // Apply Trade Logic
                if (tx.type === 'Trade' && tx.details) {
                    const { acquired, traded, partnerTeamId } = tx.details;
                    const myTeamIdx = reconstructedTeams.findIndex(t => t.id === tx.team_id);
                    const partnerIdx = reconstructedTeams.findIndex(t => t.id === partnerTeamId);

                    if (myTeamIdx !== -1 && partnerIdx !== -1) {
                        // Move Traded Players (My Team -> Partner)
                        traded.forEach((p: any) => {
                            const pIndex = reconstructedTeams[myTeamIdx].roster.findIndex(rp => rp.id === p.id);
                            if (pIndex !== -1) {
                                const [playerObj] = reconstructedTeams[myTeamIdx].roster.splice(pIndex, 1);
                                reconstructedTeams[partnerIdx].roster.push(playerObj);
                            }
                        });
                        // Move Acquired Players (Partner -> My Team)
                        acquired.forEach((p: any) => {
                            const pIndex = reconstructedTeams[partnerIdx].roster.findIndex(rp => rp.id === p.id);
                            if (pIndex !== -1) {
                                const [playerObj] = reconstructedTeams[partnerIdx].roster.splice(pIndex, 1);
                                reconstructedTeams[myTeamIdx].roster.push(playerObj);
                            }
                        });
                    }
                }
                // Update Date if TX is newer
                if (tx.date > lastDate) lastDate = tx.date;
            });

            // C. Replay Game Results (Stats Accumulation & Schedule Update)
            const gameResults = userHistory?.games || [];
            
            // Map for quick team lookup
            const teamMap = new Map<string, Team>();
            reconstructedTeams.forEach(t => teamMap.set(t.id, t));

            gameResults.forEach((res: any) => {
                // 1. Mark Schedule as Played
                const gameIdx = reconstructedSchedule.findIndex(g => g.id === res.game_id);
                if (gameIdx !== -1) {
                    reconstructedSchedule[gameIdx].played = true;
                    reconstructedSchedule[gameIdx].homeScore = res.home_score;
                    reconstructedSchedule[gameIdx].awayScore = res.away_score;
                } else {
                    // If playoff game (not in base schedule), add it
                    if (res.is_playoff) {
                        reconstructedSchedule.push({
                            id: res.game_id,
                            homeTeamId: res.home_team_id,
                            awayTeamId: res.away_team_id,
                            date: res.date,
                            homeScore: res.home_score,
                            awayScore: res.away_score,
                            played: true,
                            isPlayoff: true,
                            seriesId: res.series_id
                        });
                    }
                }

                // 2. Update Team Wins/Losses
                const homeTeam = teamMap.get(res.home_team_id);
                const awayTeam = teamMap.get(res.away_team_id);
                if (homeTeam && awayTeam) {
                    if (res.home_score > res.away_score) {
                        homeTeam.wins++;
                        awayTeam.losses++;
                    } else {
                        homeTeam.losses++;
                        awayTeam.wins++;
                    }
                }

                // 3. Aggregate Player Stats
                if (res.box_score) {
                    const processBox = (box: PlayerBoxScore[], teamId: string) => {
                        const team = teamMap.get(teamId);
                        if (!team) return;
                        
                        box.forEach(statLine => {
                            const player = team.roster.find(p => p.id === statLine.playerId);
                            if (player) {
                                // Initialize if null
                                if (!player.stats) player.stats = INITIAL_STATS();
                                
                                // Accumulate
                                player.stats.g += 1;
                                player.stats.gs += statLine.gs || 0;
                                player.stats.mp += statLine.mp || 0;
                                player.stats.pts += statLine.pts || 0;
                                player.stats.reb += statLine.reb || 0;
                                player.stats.ast += statLine.ast || 0;
                                player.stats.stl += statLine.stl || 0;
                                player.stats.blk += statLine.blk || 0;
                                player.stats.tov += statLine.tov || 0;
                                player.stats.fgm += statLine.fgm || 0;
                                player.stats.fga += statLine.fga || 0;
                                player.stats.p3m += statLine.p3m || 0;
                                player.stats.p3a += statLine.p3a || 0;
                                player.stats.ftm += statLine.ftm || 0;
                                player.stats.fta += statLine.fta || 0;
                            }
                        });
                    };

                    // Use 'home' and 'away' keys from JSONB
                    if (res.box_score.home) processBox(res.box_score.home, res.home_team_id);
                    if (res.box_score.away) processBox(res.box_score.away, res.away_team_id);
                }

                // Update Date
                if (res.date > lastDate) lastDate = res.date;
            });

            // D. Apply Final State
            setMyTeamId(saveMeta.team_id);
            setTeams(reconstructedTeams);
            setSchedule(reconstructedSchedule);
            setCurrentSimDate(lastDate);
            
            // Map raw transactions to Transaction type for UI
            const uiTransactions: Transaction[] = txHistory.map((tx: any) => ({
                id: tx.transaction_id,
                date: tx.date,
                type: tx.type,
                teamId: tx.team_id,
                description: tx.description,
                details: tx.details
            })).reverse(); // Newest first
            setTransactions(uiTransactions);

            console.log(`✅ [Reconstruction] Complete. Date: ${lastDate}, Games Played: ${gameResults.length}`);
            hasInitialLoadRef.current = true;
            setIsReconstructing(false);

        } else {
            // No Save - Initialize Base Data for New Game
            console.log("🆕 [Init] No Save Found. Ready for Team Selection.");
            setTeams(JSON.parse(JSON.stringify(baseData.teams)));
            setSchedule(JSON.parse(JSON.stringify(baseData.schedule)));
            // Don't set hasInitialLoadRef yet, wait for team selection
        }

    }, [baseData, saveMeta, userHistory, isBaseDataLoading, isSaveMetaLoading, isHistoryLoading, session, isGuestMode]);


    // --- Actions ---

    // 1. Save (Checkpoint)
    // We only need to update the 'saves' table's updated_at.
    // The actual game data is already saved in `user_game_results` via useSimulation.
    const forceSave = useCallback(async (overrides?: any) => {
        if (!session?.user || isGuestMode || !myTeamId) return;

        // Optionally, if we passed 'teams' override, we might want to do something,
        // but in this architecture, roster changes are event-driven (transactions).
        // So this function basically just "pings" the save file.

        try {
            await saveGameMutation.mutateAsync({
                userId: session.user.id,
                teamId: myTeamId
            });
            console.log("💾 [Checkpoint] Save timestamp updated.");
        } catch (e) {
            console.error("Save failed", e);
        }
    }, [session, isGuestMode, myTeamId, saveGameMutation]);

    // 2. Select Team
    const handleSelectTeam = useCallback(async (teamId: string) => {
        console.log(`🏀 User Selected Team: ${teamId}`);
        setMyTeamId(teamId);
        
        // Initial Save to create the record
        await forceSave();
        
        // Welcome News
        const teamData = teams.find(t => t.id === teamId);
        if (teamData) {
            const welcome = await generateOwnerWelcome(`${teamData.city} ${teamData.name}`);
            setNews([{ type: 'text', content: welcome }]);
        }

        hasInitialLoadRef.current = true;
        return true;
    }, [teams, forceSave]);

    // 3. Reset
    const handleResetData = async () => {
        if (!session?.user) return { success: false };
        isResettingRef.current = true;
        try {
            const userId = session.user.id;
            await Promise.all([
                supabase.from('saves').delete().eq('user_id', userId),
                supabase.from('user_game_results').delete().eq('user_id', userId),
                supabase.from('user_transactions').delete().eq('user_id', userId)
            ]);
            
            queryClient.removeQueries();
            
            // Reload Base Data
            if (baseData) {
                setTeams(JSON.parse(JSON.stringify(baseData.teams)));
                setSchedule(JSON.parse(JSON.stringify(baseData.schedule)));
            }
            setMyTeamId(null);
            setCurrentSimDate(INITIAL_DATE);
            setTransactions([]);
            hasInitialLoadRef.current = false;
            
            return { success: true };
        } catch (e) {
            console.error(e);
            return { success: false, error: e };
        } finally {
            isResettingRef.current = false;
        }
    };

    const cleanupData = () => {
         setMyTeamId(null);
         hasInitialLoadRef.current = false;
    };

    return {
        myTeamId, setMyTeamId,
        teams, setTeams,
        schedule, setSchedule,
        playoffSeries, setPlayoffSeries,
        transactions, setTransactions,
        prospects, setProspects,
        currentSimDate, setCurrentSimDate,
        userTactics, setUserTactics,
        news, setNews,
        
        // Loading States
        isBaseDataLoading,
        isSaveLoading: isSaveMetaLoading || isHistoryLoading || isReconstructing, // Combine all loading states
        isSaving: saveGameMutation.isPending,
        
        handleSelectTeam,
        handleResetData,
        forceSave,
        cleanupData,
        
        hasInitialLoadRef,
        isResetting: isResettingRef.current
    };
};
