
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { Team, Game, PlayoffSeries, Transaction, Player, GameTactics } from '../types';
import { useBaseData } from '../services/queries';
import { loadPlayoffState, loadPlayoffGameResults } from '../services/playoffService';
import { loadCheckpoint, loadUserHistory, saveCheckpoint } from '../services/persistence';
import { replayGameState } from '../services/stateReplayer';
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

    // --- Flags & Loading ---
    const [isSaveLoading, setIsSaveLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const hasInitialLoadRef = useRef(false);
    const isResettingRef = useRef(false);
    
    // Refs
    const gameStateRef = useRef({ myTeamId, currentSimDate, userTactics });
    useEffect(() => { 
        gameStateRef.current = { myTeamId, currentSimDate, userTactics }; 
    }, [myTeamId, currentSimDate, userTactics]);

    // --- Base Data Query ---
    const { data: baseData, isLoading: isBaseDataLoading } = useBaseData();

    // ------------------------------------------------------------------
    //  INIT LOGIC (Simple Load)
    // ------------------------------------------------------------------
    useEffect(() => {
        if (hasInitialLoadRef.current || isResettingRef.current) return;
        if (isBaseDataLoading || !baseData) return;

        const initializeGame = async () => {
            setIsSaveLoading(true);
            try {
                if (isGuestMode) {
                    setTeams(JSON.parse(JSON.stringify(baseData.teams)));
                    setSchedule(JSON.parse(JSON.stringify(baseData.schedule)));
                    setIsSaveLoading(false);
                    hasInitialLoadRef.current = true;
                    return;
                }

                const userId = session?.user?.id;
                if (!userId) {
                    setIsSaveLoading(false);
                    return;
                }

                // [Simplified] Load Data Directly (No Locks)
                const checkpoint = await loadCheckpoint(userId);

                if (checkpoint && checkpoint.team_id) {
                    console.log(`📂 Found Save: ${checkpoint.team_id} @ ${checkpoint.sim_date}`);
                    const history = await loadUserHistory(userId);
                    const playoffState = await loadPlayoffState(userId, checkpoint.team_id);
                    const playoffResults = playoffState ? await loadPlayoffGameResults(userId) : [];
                    const allGameResults = [...history.games, ...playoffResults];

                    const replayedState = replayGameState(
                        baseData.teams,
                        baseData.schedule,
                        history.transactions,
                        allGameResults,
                        checkpoint.sim_date
                    );

                    setMyTeamId(checkpoint.team_id);
                    setTeams(replayedState.teams);
                    setSchedule(replayedState.schedule);
                    setCurrentSimDate(replayedState.currentSimDate);
                    
                    if (checkpoint.tactics) {
                        setUserTactics(checkpoint.tactics);
                    }
                    
                    if (playoffState && playoffState.bracket_data) {
                        setPlayoffSeries(playoffState.bracket_data.series);
                    }

                    setTransactions(history.transactions.map((tx: any) => ({
                        id: tx.id || tx.Id || tx.transaction_id || `tx_${Math.random()}`, 
                        date: tx.date,
                        type: tx.type,
                        teamId: tx.team_id,
                        description: tx.description,
                        details: tx.details
                    })).reverse());

                    hasInitialLoadRef.current = true;
                } else {
                    console.log("🆕 New Game Started");
                    setTeams(JSON.parse(JSON.stringify(baseData.teams)));
                    setSchedule(JSON.parse(JSON.stringify(baseData.schedule)));
                }

            } catch (e) {
                console.error("❌ Initialization Failed:", e);
            } finally {
                setIsSaveLoading(false);
            }
        };

        initializeGame();
    }, [baseData, isBaseDataLoading, isGuestMode, session]);

    // ------------------------------------------------------------------
    //  ACTIONS: Save, Select Team, Reset
    // ------------------------------------------------------------------

    const forceSave = useCallback(async (overrides?: any) => {
        if (!session?.user || isGuestMode) return;
        
        setIsSaving(true);
        try {
            const teamId = overrides?.myTeamId || gameStateRef.current.myTeamId;
            const date = overrides?.currentSimDate || gameStateRef.current.currentSimDate;
            const tactics = overrides?.userTactics || gameStateRef.current.userTactics;

            if (teamId && date) {
                await saveCheckpoint(session.user.id, teamId, date, tactics);
            }
        } catch (e: any) {
            console.error("Save Failed:", e);
        } finally {
            setIsSaving(false);
        }
    }, [session, isGuestMode]);

    const handleSelectTeam = useCallback(async (teamId: string) => {
        console.log(`🏀 Team Selected: ${teamId}`);
        setMyTeamId(teamId);
        setCurrentSimDate(INITIAL_DATE);

        await forceSave({ myTeamId: teamId, currentSimDate: INITIAL_DATE });

        const teamData = teams.find(t => t.id === teamId);
        if (teamData) {
            const welcome = await generateOwnerWelcome(`${teamData.city} ${teamData.name}`);
            setNews([{ type: 'text', content: welcome }]);
        }

        hasInitialLoadRef.current = true;
        return true;
    }, [teams, forceSave]);

    const handleResetData = async () => {
        if (!session?.user) return { success: false };
        isResettingRef.current = true;
        try {
            const userId = session.user.id;
            await Promise.all([
                supabase.from('saves').delete().eq('user_id', userId),
                supabase.from('user_game_results').delete().eq('user_id', userId),
                supabase.from('user_transactions').delete().eq('user_id', userId),
                supabase.from('user_playoffs').delete().eq('user_id', userId),
                supabase.from('user_playoffs_results').delete().eq('user_id', userId),
                supabase.from('user_messages').delete().eq('user_id', userId),
                supabase.from('user_tactics').delete().eq('user_id', userId)
            ]);
            
            queryClient.removeQueries();
            
            // Clean up old trade counters
            Object.keys(localStorage).forEach((key) => {
                if (key.startsWith('trade_ops_')) {
                    localStorage.removeItem(key);
                }
            });
            
            if (baseData) {
                setTeams(JSON.parse(JSON.stringify(baseData.teams)));
                setSchedule(JSON.parse(JSON.stringify(baseData.schedule)));
            }
            setMyTeamId(null);
            setCurrentSimDate(INITIAL_DATE);
            setTransactions([]);
            setPlayoffSeries([]);
            setUserTactics(null);
            hasInitialLoadRef.current = false;

            return { success: true };
        } catch (e) {
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
        
        isBaseDataLoading,
        isSaveLoading,
        isSaving,
        
        handleSelectTeam,
        handleResetData,
        forceSave,
        cleanupData,
        
        hasInitialLoadRef,
        isResetting: isResettingRef.current
    };
};
