
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

    // Refs for persistence (Snapshot System)
    const gameDataRef = useRef<any>({});
    const isResettingRef = useRef(false);
    const hasInitialLoadRef = useRef(false); // 로컬에 데이터가 로드되었는지 여부
    const isSaveLoadedRef = useRef(false);   // DB에서 세이브 파일 로드를 완료했는지 여부

    // Queries & Mutations
    const saveGameMutation = useSaveGame();
    const { data: baseData, isLoading: isBaseDataLoading, refetch: refetchBaseData } = useBaseData();
    const { data: saveData, isLoading: isSaveLoading } = useLoadSave(session?.user?.id);

    // [Preserved] Snapshot Sync - Update Ref whenever state changes
    useEffect(() => {
        // Build the snapshot object
        gameDataRef.current = {
            myTeamId, 
            teams, 
            schedule, 
            currentSimDate, 
            tactics: userTactics, 
            playoffSeries, 
            transactions, 
            prospects
        };
    }, [myTeamId, teams, schedule, currentSimDate, userTactics, playoffSeries, transactions, prospects]);

    // [Logic 1] Initial Data Loading (One-Shot)
    // DB에서 데이터를 가져와서 State에 넣는 작업은 "단 한 번"만 실행
    useEffect(() => {
        if (isResettingRef.current || isGuestMode || isSaveLoadedRef.current) return;
        
        // 1. Load User Save (Priority)
        if (session?.user && !isSaveLoading && saveData && saveData.game_data) {
            console.log("💾 [Init] Save Data Found! Restoring Snapshot...");
            const gd = saveData.game_data;
            
            // Batch State Updates
            if (gd.myTeamId) setMyTeamId(gd.myTeamId);
            else setMyTeamId(saveData.team_id); // Fallback for old saves

            if (gd.teams && gd.teams.length > 0) setTeams(gd.teams);
            if (gd.schedule && gd.schedule.length > 0) setSchedule(gd.schedule);
            if (gd.currentSimDate) setCurrentSimDate(gd.currentSimDate);
            if (gd.tactics) setUserTactics(gd.tactics);
            if (gd.playoffSeries) setPlayoffSeries(gd.playoffSeries);
            if (gd.transactions) setTransactions(gd.transactions);
            if (gd.prospects) setProspects(gd.prospects);
            
            // Latch: Prevent future DB reads from overwriting local state
            isSaveLoadedRef.current = true;
            hasInitialLoadRef.current = true;
            return;
        }

        // 2. Load Base Data (If no save exists)
        if (!isSaveLoadedRef.current && baseData && !isBaseDataLoading) {
            if (teams.length === 0) {
                console.log("🆕 [Init] No Save Found. Initializing Base Roster...");
                setTeams(baseData.teams);
                setSchedule(baseData.schedule);
            }
        }
    }, [saveData, isSaveLoading, baseData, isBaseDataLoading, session, isGuestMode, teams.length]);

    // [Logic 2] Force Save / Manual Save
    const forceSave = useCallback(async (overrides?: Partial<typeof gameDataRef.current>) => {
        if (isResettingRef.current || !session?.user || isGuestMode) return;

        // Merge current ref with any overrides
        const dataToSave = { ...gameDataRef.current, ...overrides };
        const targetTeamId = dataToSave.myTeamId || myTeamId;

        // Validation
        if (!targetTeamId) {
            console.warn("⚠️ Cannot save: No Team ID selected.");
            return;
        }
        if (!dataToSave.teams || dataToSave.teams.length === 0) {
            console.warn("⚠️ Cannot save: Roster data is empty.");
            return;
        }

        console.log(`💾 [Force Save] Triggered for Team: ${targetTeamId}`);
        
        try {
            await saveGameMutation.mutateAsync({ 
                userId: session.user.id, 
                teamId: targetTeamId, 
                gameData: dataToSave 
            });
            console.log("✅ [Force Save] Completed.");
        } catch (e) {
            console.error("❌ [Force Save] Failed:", e);
        }
    }, [session, isGuestMode, myTeamId, saveGameMutation]);

    // [Logic 3] Auto-Save Interval (Preserved from original)
    // Saves every 30 seconds if a team is selected
    useEffect(() => {
        if (!session?.user || isGuestMode) return;
        const SAVE_INTERVAL = 30000; // 30 seconds

        const intervalId = setInterval(() => {
            // Check if we have a valid game state to save
            if (myTeamId && hasInitialLoadRef.current && !isResettingRef.current && !saveGameMutation.isPending) {
                console.log("💾 [Auto-Save] Saving Snapshot...");
                // Snapshot is already in gameDataRef.current
                saveGameMutation.mutate({ 
                    userId: session.user.id, 
                    teamId: myTeamId, 
                    gameData: gameDataRef.current 
                });
            }
        }, SAVE_INTERVAL);

        return () => clearInterval(intervalId);
    }, [session, isGuestMode, myTeamId, saveGameMutation]);

    // [Logic 4] Team Selection Action
    const handleSelectTeam = useCallback(async (teamId: string) => {
        console.log(`🏀 User Selected Team: ${teamId}`);
        
        // 1. Prepare Initial State
        const initialTeams = baseData?.teams || teams;
        const initialSchedule = (baseData?.schedule && baseData.schedule.length > 0) 
            ? baseData.schedule 
            : generateSeasonSchedule(teamId);
        
        // 2. Set Local State
        setMyTeamId(teamId);
        setTeams(initialTeams);
        setSchedule(initialSchedule);
        setCurrentSimDate(INITIAL_DATE);
        
        // 3. Welcome Message
        const teamData = initialTeams.find(t => t.id === teamId);
        if (teamData) {
            const welcome = await generateOwnerWelcome(`${teamData.city} ${teamData.name}`);
            setNews([{ type: 'text', content: welcome }]);
        }
        
        // 4. Update Flags
        hasInitialLoadRef.current = true;
        isSaveLoadedRef.current = true; // Mark as "loaded" so DB read doesn't overwrite this

        // 5. Trigger INITIAL SAVE immediately (Create row in 'saves' table)
        // We pass the data explicitly to ensure we save what we just set
        const initialSnapshot = {
            myTeamId: teamId,
            teams: initialTeams,
            schedule: initialSchedule,
            currentSimDate: INITIAL_DATE,
            tactics: null,
            playoffSeries: [],
            transactions: [],
            prospects: []
        };
        
        await forceSave(initialSnapshot);

        return true;
    }, [baseData, teams, forceSave]);

    // Cleanup / Reset
    const handleResetData = async () => {
        console.log("🛠️ [RESET] Starting Data Reset...");
        isResettingRef.current = true;
        try {
            if (session?.user) {
                const userId = session.user.id;
                await Promise.all([
                    supabase.from('saves').delete().eq('user_id', userId),
                    supabase.from('user_game_results').delete().eq('user_id', userId),
                    supabase.from('user_transactions').delete().eq('user_id', userId)
                ]);
                queryClient.removeQueries({ queryKey: ['saveData', userId] });
            }
            
            // Reset Local State
            setMyTeamId(null);
            setPlayoffSeries([]);
            setTransactions([]);
            setCurrentSimDate(INITIAL_DATE);
            setUserTactics(null);
            
            // Reset Flags
            isSaveLoadedRef.current = false;
            hasInitialLoadRef.current = false;
            
            // Reload Base
            const res = await refetchBaseData();
            if (res.data) {
                setTeams(res.data.teams);
                setSchedule(res.data.schedule);
            }
            return { success: true };
        } catch (e) {
            console.error("❌ [RESET] Critical Error:", e);
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
