
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
    const isSaveLoadedRef = useRef(false);

    // Queries & Mutations
    const saveGameMutation = useSaveGame();
    const { data: baseData, isLoading: isBaseDataLoading, refetch: refetchBaseData } = useBaseData();
    const { data: saveData, isLoading: isSaveLoading } = useLoadSave(session?.user?.id);

    // Update GameData Ref for Save
    useEffect(() => {
        const myTeam = teams.find(t => t.id === myTeamId);
        const tacticHistorySnapshot = myTeam?.tacticHistory || null;

        gameDataRef.current = {
            myTeamId, teams, schedule, currentSimDate, 
            tactics: userTactics, 
            tacticHistory: tacticHistorySnapshot,
            playoffSeries, transactions, prospects
        };
        
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
            
            if (gd.teams && gd.teams.length > 0) setTeams(gd.teams);
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

    // 2. Initialize Base Data (Priority 2)
    useEffect(() => {
        if (isSaveLoadedRef.current) return;
        if (!baseData) return;

        if (teams.length === 0) {
            console.log("🆕 Initializing Base Data...");
            setTeams(baseData.teams);
            setSchedule(baseData.schedule);
        }
    }, [baseData, teams.length]);

    // Auto-Save Interval
    useEffect(() => {
        if (!session?.user || isGuestMode) return;
        const SAVE_INTERVAL = 10000; 

        const intervalId = setInterval(() => {
            if (isDirtyRef.current && hasInitialLoadRef.current && myTeamId && !isResettingRef.current && !saveGameMutation.isPending) {
                console.log("💾 Auto-Saving Game (Interval)...");
                const currentData = JSON.parse(JSON.stringify(gameDataRef.current));
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

    // Prevent Tab Close if Dirty
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirtyRef.current && session?.user && !isGuestMode) {
                e.preventDefault();
                e.returnValue = ''; 
                return ''; 
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [session, isGuestMode]);

    // Force Save
    const forceSave = useCallback(async (overrides?: Partial<typeof gameDataRef.current>) => {
        if (isResettingRef.current || !session?.user || isGuestMode) {
             console.warn("⚠️ Force Save Skipped: Conditions not met.");
             return;
        }

        // Merge current ref with overrides.
        // Overrides allow saving NEW data (like from Team Select) before the Ref has updated via useEffect.
        const dataToSave = { ...gameDataRef.current, ...overrides };
        const targetTeamId = dataToSave.myTeamId || myTeamId;

        if (!targetTeamId || !dataToSave.teams || dataToSave.teams.length === 0) {
            console.error("❌ Force Save Aborted: Missing Team ID or Roster Data.");
            return;
        }

        console.log(`💾 Force Save Triggered for ${targetTeamId}.`);
        isDirtyRef.current = false;

        try {
            await saveGameMutation.mutateAsync({ 
                userId: session.user.id, 
                teamId: targetTeamId, 
                gameData: dataToSave 
            });
            console.log("✅ Force Save Completed Successfully");
        } catch (e) {
            console.error("❌ Force Save Failed:", e);
            isDirtyRef.current = true;
            throw e; 
        }
    }, [session, isGuestMode, myTeamId, saveGameMutation]);

    // Actions
    const handleSelectTeam = useCallback(async (teamId: string) => {
        if (myTeamId) return; // Prevent double select
        console.log(`🏀 Selecting Team: ${teamId}`);
        
        // 1. Prepare Initial Data Synchronously
        const initialTeams = baseData?.teams || teams;
        const initialSchedule = (baseData?.schedule && baseData.schedule.length > 0) 
            ? baseData.schedule 
            : generateSeasonSchedule(teamId);
        
        // 2. Setup State
        setMyTeamId(teamId);
        setTeams(initialTeams);
        setSchedule(initialSchedule);
        setCurrentSimDate(INITIAL_DATE);
        
        // 3. Clear temp storage
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('trade_ops_')) localStorage.removeItem(key);
        });
        
        // 4. News
        const teamData = initialTeams.find(t => t.id === teamId);
        if (teamData) {
            const welcome = await generateOwnerWelcome(`${teamData.city} ${teamData.name}`);
            setNews([{ type: 'text', content: welcome }]);
        }
        
        hasInitialLoadRef.current = true;
        
        // 5. [CRITICAL] Immediate Save with Explicit Payload
        // We pass the data directly to forceSave via 'overrides' instead of waiting for useEffect to update gameDataRef
        const initialSavePayload = {
            myTeamId: teamId,
            teams: initialTeams,
            schedule: initialSchedule,
            currentSimDate: INITIAL_DATE,
            tactics: null,
            tacticHistory: null,
            playoffSeries: [],
            transactions: [],
            prospects: []
        };

        try {
            await forceSave(initialSavePayload);
            console.log(`✅ Initial Team Save Complete for ${teamId}`);
        } catch (e) {
            console.error("❌ Initial Team Save Failed:", e);
        }

        return true;
    }, [baseData, teams, forceSave, myTeamId]);

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
            
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('trade_ops_')) localStorage.removeItem(key);
            });

            setMyTeamId(null);
            setPlayoffSeries([]);
            setTransactions([]);
            setCurrentSimDate(INITIAL_DATE);
            setUserTactics(null);
            
            isSaveLoadedRef.current = false;
            hasInitialLoadRef.current = false;
            isDirtyRef.current = false;
            
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
