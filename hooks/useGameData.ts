
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { Team, Game, PlayoffSeries, Transaction, Player, GameTactics } from '../types';
import { useBaseData } from '../services/queries';
import { loadPlayoffState, loadPlayoffGameResults } from '../services/playoffService';
import { loadCheckpoint, loadUserHistory, saveCheckpoint, releaseSessionLock, checkSessionLock, acquireSessionLock } from '../services/persistence'; // Added checks
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
    //  INIT LOGIC: Load & Replay (Auto-Login Handling)
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

                // [Auto-Login Lock Check]
                // 1. Get or Create Tab-specific Session ID (persisted in sessionStorage for refresh)
                let myTabId = sessionStorage.getItem('nbagm_tab_id');
                if (!myTabId) {
                    myTabId = crypto.randomUUID();
                    sessionStorage.setItem('nbagm_tab_id', myTabId);
                }

                // 2. Check DB Lock status
                const activeDevice = await checkSessionLock(userId);
                
                // 3. Logic:
                // - If DB has ID and it's NOT mine -> Someone else is playing. Block.
                // - If DB is NULL -> Tab was closed/released. Acquire lock.
                // - If DB has ID and it IS mine -> Refresh page. OK.
                
                if (activeDevice && activeDevice !== myTabId) {
                     console.warn("⛔ Auto-login Blocked: Another session active.");
                     alert("다른 기기나 탭에서 이미 접속 중입니다. \n(기존 탭을 닫았다면 잠시 후 다시 시도하거나 로그아웃 후 재접속하세요.)");
                     await (supabase.auth as any).signOut(); // Force logout to clear stale state
                     window.location.reload();
                     return;
                }

                if (!activeDevice || activeDevice !== myTabId) {
                     console.log("🔒 Acquiring Session Lock for Auto-login...");
                     await acquireSessionLock(userId, myTabId);
                }

                // --- Proceed with Data Load ---

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
    //  LOCK CLEANUP (On Window Close/Refresh)
    //  This is a best-effort attempt to unlock the session if the user closes the tab.
    // ------------------------------------------------------------------
    useEffect(() => {
        if (isGuestMode || !session?.user) return;

        const handleUnload = () => {
            // Using sendBeacon for reliable transmission on close
            const url = `${process.env.REACT_APP_SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}`;
            const headers = {
                'Authorization': `Bearer ${session.access_token}`,
                'apikey': process.env.REACT_APP_SUPABASE_ANON_KEY!,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            };
            const body = JSON.stringify({ active_device_id: null });
            
            if (navigator.sendBeacon) {
                const blob = new Blob([body], { type: 'application/json' });
                // Note: sendBeacon doesn't support PATCH directly in some setups, but Supabase REST supports PATCH.
                // Since sendBeacon is POST, we might need a custom RPC or just rely on fetch with keepalive.
                // Trying fetch with keepalive as it's standard for this now.
                fetch(url, {
                    method: 'PATCH',
                    headers: headers,
                    body: body,
                    keepalive: true
                }).catch(e => console.error("Lock release failed", e));
            }
        };

        window.addEventListener('beforeunload', handleUnload);
        return () => window.removeEventListener('beforeunload', handleUnload);
    }, [session, isGuestMode]);


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
            
            // Re-acquire lock logic is implicitly handled because we don't clear it on reset, just data.

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
