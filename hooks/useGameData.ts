
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { Team, Game, PlayoffSeries, Transaction, Player, GameTactics } from '../types';
import { useBaseData, useLoadSave, useSaveGame } from '../services/queries';
import { generateSeasonSchedule } from '../utils/constants';
import { generateOwnerWelcome } from '../services/geminiService';
import { calculateOvr } from '../utils/ovrUtils';

export const INITIAL_DATE = '2025-10-20';

export const useGameData = (session: any, isGuestMode: boolean) => {
    const queryClient = useQueryClient();

    // Game Data State
    const [myTeamId, setMyTeamId] = useState<string | null>(null);
    const [teams, setTeams] = useState<Team[]>([]);
    const [schedule, setSchedule] = useState<Game[]>([]);
    const [playoffSeries, setPlayoffSeries] = useState<PlayoffSeries[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [prospects, setProspects] = useState<Player[]>([]);
    const [currentSimDate, setCurrentSimDate] = useState<string>(INITIAL_DATE);
    const [userTactics, setUserTactics] = useState<GameTactics | null>(null);
    const [news, setNews] = useState<any[]>([]);

    // Refs for persistence logic
    const gameDataRef = useRef<any>({});
    const isResettingRef = useRef(false);
    const hasInitialLoadRef = useRef(false);
    const isDirtyRef = useRef(false);
    const isSaveLoadedRef = useRef(false); // New Ref to track if save was loaded

    // Queries & Mutations
    const saveGameMutation = useSaveGame();
    const { data: baseData, isLoading: isBaseDataLoading, refetch: refetchBaseData } = useBaseData();
    const { data: saveData, isLoading: isSaveLoading } = useLoadSave(session?.user?.id);

    // Update GameData Ref for Save
    useEffect(() => {
        // Extract current team's tactic history to ensure it persists
        const myTeam = teams.find(t => t.id === myTeamId);
        const tacticHistorySnapshot = myTeam?.tacticHistory || null;

        gameDataRef.current = {
            myTeamId, teams, schedule, currentSimDate, 
            tactics: userTactics, 
            tacticHistory: tacticHistorySnapshot,
            playoffSeries, transactions, prospects
        };
        // Mark dirty when state changes (if game is active and not just loaded, and not resetting)
        if (myTeamId && session?.user && !isGuestMode && hasInitialLoadRef.current && !isResettingRef.current) {
            isDirtyRef.current = true;
        }
    }, [myTeamId, teams, schedule, currentSimDate, userTactics, playoffSeries, transactions, prospects, session, isGuestMode]);

    // 1. Load Save Data (Priority 1)
    useEffect(() => {
        if (isResettingRef.current || isGuestMode) return;
        
        if (session?.user && !isSaveLoading && saveData && saveData.game_data) {
            console.log("💾 Save Data Found! Loading...");
            const gd = saveData.game_data;
            
            setMyTeamId(saveData.team_id);
            
            if (gd.teams && gd.teams.length > 0) {
                // Just load the raw data. OVR will be calculated on display.
                setTeams(gd.teams);
            }

            if (gd.schedule && gd.schedule.length > 0) setSchedule(gd.schedule);
            if (gd.currentSimDate) setCurrentSimDate(gd.currentSimDate);
            if (gd.tactics) setUserTactics(gd.tactics);
            if (gd.playoffSeries) setPlayoffSeries(gd.playoffSeries);
            if (gd.transactions) setTransactions(gd.transactions);
            if (gd.prospects) setProspects(gd.prospects);
            
            isSaveLoadedRef.current = true;
            hasInitialLoadRef.current = true;
            isDirtyRef.current = false; 
        }
    }, [saveData, isSaveLoading, session, isGuestMode]);

    // 2. Initialize Base Data (Priority 2 - Only if no save loaded)
    useEffect(() => {
        // Skip if save already loaded or base data missing
        if (isSaveLoadedRef.current) return;
        if (!baseData) return;

        // If no teams yet (fresh start or guest mode), load base
        if (teams.length === 0) {
            console.log("🆕 Initializing Base Data...");
            // Base data is already mapped with correct OVR in dataMapper.ts
            setTeams(baseData.teams);
            setSchedule(baseData.schedule);
        }
    }, [baseData, teams.length]);

    // [Fix] Robust Auto-Save Interval
    useEffect(() => {
        if (!session?.user || isGuestMode) return;

        const SAVE_INTERVAL = 10000; // Check every 10 seconds

        const intervalId = setInterval(() => {
            // Check conditions: Dirty, Initial Load Done, Team Selected, Not Resetting, Not Currently Saving
            if (isDirtyRef.current && hasInitialLoadRef.current && myTeamId && !isResettingRef.current && !saveGameMutation.isPending) {
                console.log("💾 Auto-Saving Game (Interval)...");
                
                // Deep copy current state to prevent reference issues
                const currentData = JSON.parse(JSON.stringify(gameDataRef.current));
                
                // Optimistically mark as clean to prevent double-saves in next tick
                isDirtyRef.current = false;

                saveGameMutation.mutate({ 
                    userId: session.user.id, 
                    teamId: myTeamId, 
                    gameData: currentData 
                });
            }
        }, SAVE_INTERVAL);

        return () => clearInterval(intervalId);
    }, [session, isGuestMode, myTeamId, saveGameMutation]);

    // [New] Prevent Tab Close if Dirty
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            // If dirty and authenticated, warn user
            if (isDirtyRef.current && session?.user && !isGuestMode) {
                e.preventDefault();
                e.returnValue = ''; // Standard for modern browsers
                return ''; // Legacy support
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [session, isGuestMode]);

    // Force Save (Manual or Critical Events) - [CRITICAL FIX FOR LOGOUT]
    const forceSave = useCallback(async (overrides?: Partial<typeof gameDataRef.current>) => {
        if (isResettingRef.current || !session?.user || isGuestMode || !myTeamId) {
             console.warn("⚠️ Force Save Skipped: Conditions not met (Guest/No Session/Resetting)");
             return;
        }

        console.log(`💾 Force Save Triggered. Preparing payload...`);
        
        // 1. Capture Data Synchronously immediately
        const dataToSave = { ...gameDataRef.current, ...overrides };
        
        // 2. Validate Payload
        if (!dataToSave.teams || dataToSave.teams.length === 0) {
            console.error("❌ Force Save Aborted: No teams data to save.");
            return;
        }

        // 3. Mark as clean locally
        isDirtyRef.current = false;

        try {
            // 4. Send to Supabase and WAIT for completion
            await saveGameMutation.mutateAsync({ 
                userId: session.user.id, 
                teamId: myTeamId, 
                gameData: dataToSave 
            });
            console.log("✅ Force Save Completed Successfully");
        } catch (e) {
            console.error("❌ Force Save Failed:", e);
            // Restore dirty flag if save failed so user knows
            isDirtyRef.current = true;
            throw e; // Re-throw so caller (logout) knows it failed
        }
    }, [session, isGuestMode, myTeamId, saveGameMutation]);

    // Actions
    const handleSelectTeam = useCallback(async (teamId: string) => {
        if (myTeamId) return;
        console.log(`🏀 Team Selected: ${teamId}`);
        setMyTeamId(teamId);
        
        // Clear trade ops counters on new team selection
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('trade_ops_')) {
                localStorage.removeItem(key);
            }
        });
        
        // Ensure base data is fully populated if not already
        if (teams.length === 0 && baseData) {
            setTeams(baseData.teams);
            setSchedule(baseData.schedule);
        }
        
        if (schedule.length === 0 && baseData?.schedule) {
             setSchedule(baseData.schedule);
        } else if (schedule.length === 0) {
             // Absolute Fallback
             setSchedule(generateSeasonSchedule(teamId));
        }

        setCurrentSimDate(INITIAL_DATE);
        
        // Setup initial news
        const teamData = (teams.length > 0 ? teams : baseData?.teams || []).find(t => t.id === teamId);
        if (teamData) {
            const welcome = await generateOwnerWelcome(`${teamData.city} ${teamData.name}`);
            setNews([{ type: 'text', content: welcome }]);
        }
        
        hasInitialLoadRef.current = true;
        // Immediate Save to establish session
        setTimeout(() => forceSave(), 500);

        return true;
    }, [baseData, myTeamId, teams, schedule, forceSave]);

    const handleResetData = async () => {
        console.log("🛠️ [RESET] Starting Data Reset Process...");
        isResettingRef.current = true;
        
        try {
            if (session?.user) {
                const userId = session.user.id;
                await Promise.all([
                    supabase.from('saves').delete().eq('user_id', userId),
                    supabase.from('user_game_results').delete().eq('user_id', userId),
                    supabase.from('user_transactions').delete().eq('user_id', userId)
                ]);
                localStorage.removeItem(`nba_gm_save_${userId}`);
                queryClient.removeQueries({ queryKey: ['fullGameState', userId] });
                queryClient.setQueryData(['fullGameState', userId], null);
            }
            
            // Clear local storage for trade ops counters on reset
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('trade_ops_')) {
                    localStorage.removeItem(key);
                }
            });

            setMyTeamId(null);
            setPlayoffSeries([]);
            setTransactions([]);
            setCurrentSimDate(INITIAL_DATE);
            setUserTactics(null);
            
            isSaveLoadedRef.current = false;
            hasInitialLoadRef.current = false;
            isDirtyRef.current = false;
            
            // Reload Base Data
            const res = await refetchBaseData();
            if (res.data) {
                setTeams(res.data.teams);
                setSchedule(res.data.schedule);
            }
            
            return { success: true };
        } catch (e) {
            console.error("❌ [RESET] Critical Error during reset:", e);
            return { success: false, error: e };
        } finally {
            isResettingRef.current = false;
        }
    };

    const cleanupData = () => {
         setMyTeamId(null);
         hasInitialLoadRef.current = false;
         isSaveLoadedRef.current = false;
    };

    return {
        myTeamId, setMyTeamId,
        teams, setTeams,
        schedule, setSchedule,
        playoffSeries, setPlayoffSeries,
        transactions, setTransactions,
        prospects, setProspects,
        currentSimDate, setCurrentSimDate,
        forceSave, 
        userTactics, setUserTactics,
        news, setNews,
        isBaseDataLoading,
        hasInitialLoadRef,
        isSaveLoading,
        isSaving: saveGameMutation.isPending,
        handleSelectTeam,
        handleResetData,
        isResetting: isResettingRef.current,
        cleanupData
    };
};
