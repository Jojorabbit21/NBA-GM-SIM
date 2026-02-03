
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { Team, Game, PlayoffSeries, Transaction, Player, GameTactics } from '../types';
import { useBaseData } from '../services/queries';
import { loadPlayoffState, loadPlayoffGameResults } from '../services/playoffService';
import { loadCheckpoint, loadUserHistory, saveCheckpoint, registerDeviceId } from '../services/persistence';
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
    
    // [Anti-Cheat] Session Identity
    const deviceIdRef = useRef<string>(crypto.randomUUID());
    const isKickedRef = useRef(false); // If true, disable ALL saves immediately
    
    // Refs to access latest state in async callbacks
    const gameStateRef = useRef({ myTeamId, currentSimDate, userTactics });
    useEffect(() => { 
        gameStateRef.current = { myTeamId, currentSimDate, userTactics }; 
    }, [myTeamId, currentSimDate, userTactics]);

    // --- Base Data Query ---
    const { data: baseData, isLoading: isBaseDataLoading } = useBaseData();

    // ------------------------------------------------------------------
    //  INIT LOGIC: Load & Replay
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

                // [Anti-Cheat] Register this instance
                await registerDeviceId(userId, deviceIdRef.current);
                isKickedRef.current = false; // Reset kick status on init

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
    //  [Anti-Cheat] Realtime Subscription (Push instead of Pull)
    // ------------------------------------------------------------------
    useEffect(() => {
        if (isGuestMode || !session?.user) return;

        // 1. Subscribe to changes on my profile row
        // Note: 'profiles' table must have Replication enabled in Supabase Dashboard.
        const channel = supabase
            .channel(`session_check_${session.user.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                    filter: `id=eq.${session.user.id}`,
                },
                (payload) => {
                    const newDeviceId = payload.new.active_device_id;
                    
                    // If the DB says the active device ID is different from mine, I am kicked.
                    if (newDeviceId && newDeviceId !== deviceIdRef.current) {
                        console.warn("⛔ Realtime: Session Invalidated by another login.");
                        isKickedRef.current = true;
                        
                        // Small delay to ensure UI renders if needed, then alert
                        setTimeout(() => {
                            alert("다른 기기나 탭에서 새로운 로그인이 감지되었습니다.\n데이터 보호를 위해 현재 창의 접속을 종료합니다.");
                            window.location.reload();
                        }, 100);
                    }
                }
            )
            .subscribe();

        // 2. Safety Fallback: Check ONCE on window focus (in case Realtime socket disconnected)
        const onFocusCheck = async () => {
            if (document.visibilityState === 'visible' && !isKickedRef.current) {
                 const { data } = await supabase.from('profiles').select('active_device_id').eq('id', session.user.id).single();
                 if (data && data.active_device_id !== deviceIdRef.current) {
                     isKickedRef.current = true;
                     alert("다른 기기나 탭에서 새로운 로그인이 감지되었습니다.\n데이터 보호를 위해 현재 창의 접속을 종료합니다.");
                     window.location.reload();
                 }
            }
        };
        window.addEventListener('focus', onFocusCheck);

        return () => {
            supabase.removeChannel(channel);
            window.removeEventListener('focus', onFocusCheck);
        };
    }, [session, isGuestMode]);


    // ------------------------------------------------------------------
    //  ACTIONS: Save, Select Team, Reset
    // ------------------------------------------------------------------

    const forceSave = useCallback(async (overrides?: any) => {
        if (!session?.user || isGuestMode) return;
        
        // [Anti-Cheat] KILL SWITCH
        // If we are kicked, we must NOT save, to prevent overwriting the new session's data.
        if (isKickedRef.current) {
            console.warn("⛔ Save aborted: Session is invalid (Kicked).");
            return;
        }
        
        setIsSaving(true);
        try {
            const teamId = overrides?.myTeamId || gameStateRef.current.myTeamId;
            const date = overrides?.currentSimDate || gameStateRef.current.currentSimDate;
            const tactics = overrides?.userTactics || gameStateRef.current.userTactics;

            if (teamId && date) {
                // Pass deviceIdRef.current to enforce single session check at DB level too
                await saveCheckpoint(session.user.id, teamId, date, tactics, deviceIdRef.current);
            }
        } catch (e: any) {
            // Double protection
            if (e.message === 'DUPLICATE_LOGIN') {
                isKickedRef.current = true;
                alert("중복 로그인이 감지되어 저장이 차단되었습니다. 페이지를 새로고침합니다.");
                window.location.reload();
                return;
            }
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
            
            await registerDeviceId(userId, deviceIdRef.current);

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
