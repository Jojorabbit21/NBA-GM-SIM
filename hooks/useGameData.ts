
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { Team, Game, PlayoffSeries, Transaction, Player, GameTactics } from '../types';
import { useBaseData, useLoadSave, useSaveGame } from '../services/queries';
import { generateSeasonSchedule } from '../utils/constants';
import { generateOwnerWelcome } from '../services/geminiService';

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

    // Queries & Mutations
    const saveGameMutation = useSaveGame();
    const { data: baseData, isLoading: isBaseDataLoading, refetch: refetchBaseData } = useBaseData();
    const { data: saveData, isLoading: isSaveLoading } = useLoadSave(session?.user?.id);

    // Update GameData Ref for Save
    useEffect(() => {
        gameDataRef.current = {
            myTeamId, teams, schedule, currentSimDate, 
            tactics: userTactics, playoffSeries, transactions, prospects
        };
        // Mark dirty when state changes (if game is active)
        if (myTeamId && session?.user && !isGuestMode) {
            isDirtyRef.current = true;
        }
    }, [myTeamId, teams, schedule, currentSimDate, userTactics, playoffSeries, transactions, prospects, session, isGuestMode]);

    // Initialize Base Data
    useEffect(() => {
        if (baseData && teams.length === 0 && !myTeamId) {
            setTeams(baseData.teams);
            setSchedule(baseData.schedule);
        }
    }, [baseData, teams.length, myTeamId]);

    // Load Save Data
    useEffect(() => {
        if (isResettingRef.current || isGuestMode) return;
        
        if (session?.user && !isSaveLoading && !hasInitialLoadRef.current) {
            if (saveData && saveData.game_data) {
                const gd = saveData.game_data;
                setMyTeamId(saveData.team_id);
                if (gd.teams) setTeams(gd.teams);
                if (gd.schedule) setSchedule(gd.schedule);
                if (gd.currentSimDate) setCurrentSimDate(gd.currentSimDate);
                if (gd.tactics) setUserTactics(gd.tactics);
                if (gd.playoffSeries) setPlayoffSeries(gd.playoffSeries);
                if (gd.transactions) setTransactions(gd.transactions);
                if (gd.prospects) setProspects(gd.prospects);
            }
            hasInitialLoadRef.current = true;
            isDirtyRef.current = false; 
        }
    }, [saveData, isSaveLoading, session, isGuestMode]);

    // Auto Save Logic (Debounced)
    const triggerSave = useCallback(() => {
        if (isResettingRef.current || !session?.user || isGuestMode) return;
        
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        
        saveTimeoutRef.current = setTimeout(() => {
            if (!isDirtyRef.current) return;
            const currentData = gameDataRef.current;
            if (!currentData.myTeamId) return;

            isDirtyRef.current = false;
            saveGameMutation.mutate({ userId: session.user.id, teamId: currentData.myTeamId, gameData: currentData });
        }, 60000); 
    }, [session, isGuestMode, saveGameMutation]);

    // Trigger save on change
    useEffect(() => {
        if (myTeamId) triggerSave();
    }, [teams, schedule, currentSimDate, userTactics, playoffSeries, transactions, myTeamId, triggerSave]);

    // [Update] Force Save for Critical Events (Trades, Date Change)
    const forceSave = useCallback(async () => {
        // 1. Validate Env
        if (isResettingRef.current || !session?.user || isGuestMode || !myTeamId) return;

        // 2. Clear pending debounce to avoid double save
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        isDirtyRef.current = false; 

        console.log(`💾 Force Save Triggered`);
        
        try {
            await saveGameMutation.mutateAsync({ 
                userId: session.user.id, 
                teamId: myTeamId, 
                gameData: gameDataRef.current 
            });
        } catch (e) {
            console.error("Failed to force save:", e);
        }
    }, [session, isGuestMode, myTeamId, saveGameMutation]);

    // Actions
    const handleSelectTeam = useCallback(async (teamId: string) => {
        if (myTeamId) return;
        setMyTeamId(teamId);
        hasInitialLoadRef.current = true; 
        if (baseData?.schedule && baseData.schedule.length > 0) setSchedule(baseData.schedule);
        else setSchedule(generateSeasonSchedule(teamId));
        setCurrentSimDate(INITIAL_DATE);
        const teamData = teams.find(t => t.id === teamId);
        if (teamData) {
            const welcome = await generateOwnerWelcome(`${teamData.city} ${teamData.name}`);
            setNews([{ type: 'text', content: welcome }]);
        }
        return true;
    }, [baseData, myTeamId, teams]);

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

            setMyTeamId(null);
            setPlayoffSeries([]);
            setTransactions([]);
            setCurrentSimDate(INITIAL_DATE);
            setUserTactics(null);
            isDirtyRef.current = false;
            
            if (baseData) { 
                setTeams(baseData.teams); 
                setSchedule(baseData.schedule); 
            } else { 
                await refetchBaseData(); 
            }
            
            hasInitialLoadRef.current = true; 
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
    };

    return {
        myTeamId, setMyTeamId,
        teams, setTeams,
        schedule, setSchedule,
        playoffSeries, setPlayoffSeries,
        transactions, setTransactions,
        prospects, setProspects,
        currentSimDate, setCurrentSimDate,
        forceSave, // Updated name
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
