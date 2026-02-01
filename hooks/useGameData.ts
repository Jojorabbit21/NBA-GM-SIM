
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
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        // Mark dirty when state changes (if game is active and not just loaded)
        if (myTeamId && session?.user && !isGuestMode && hasInitialLoadRef.current) {
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

    // Auto Save Logic (Debounced)
    const triggerSave = useCallback(() => {
        if (isResettingRef.current || !session?.user || isGuestMode) return;
        
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        
        saveTimeoutRef.current = setTimeout(() => {
            if (!isDirtyRef.current) return;
            const currentData = gameDataRef.current;
            if (!currentData.myTeamId) return;

            // Double check data validity before save
            if (!currentData.teams || currentData.teams.length === 0) {
                console.warn("⚠️ Attempted to save empty teams. Aborting.");
                return;
            }

            console.log("💾 Auto-Saving Game...");
            isDirtyRef.current = false;
            saveGameMutation.mutate({ userId: session.user.id, teamId: currentData.myTeamId, gameData: currentData });
        }, 30000); // 30s debounce
    }, [session, isGuestMode, saveGameMutation]);

    // Trigger save on change
    useEffect(() => {
        if (myTeamId && hasInitialLoadRef.current) triggerSave();
    }, [teams, schedule, currentSimDate, userTactics, playoffSeries, transactions, myTeamId, triggerSave]);

    // Force Save
    const forceSave = useCallback(async (overrides?: Partial<typeof gameDataRef.current>) => {
        if (isResettingRef.current || !session?.user || isGuestMode || !myTeamId) return;

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        isDirtyRef.current = false; 

        const dataToSave = { ...gameDataRef.current, ...overrides };
        
        // Safety Check
        if (!dataToSave.teams || dataToSave.teams.length === 0) {
            console.error("❌ Force Save Aborted: No teams data.");
            return;
        }

        console.log(`💾 Force Save Triggered`);
        try {
            await saveGameMutation.mutateAsync({ 
                userId: session.user.id, 
                teamId: myTeamId, 
                gameData: dataToSave 
            });
        } catch (e) {
            console.error("Failed to force save:", e);
        }
    }, [session, isGuestMode, myTeamId, saveGameMutation]);

    // Actions
    const handleSelectTeam = useCallback(async (teamId: string) => {
        if (myTeamId) return;
        console.log(`🏀 Team Selected: ${teamId}`);
        setMyTeamId(teamId);
        
        // [Fix] Clear trade ops counters on new team selection
        // Iterate all keys and remove only trade_ops related ones to be safe
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
            
            // [Fix] Clear local storage for trade ops counters on reset
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
