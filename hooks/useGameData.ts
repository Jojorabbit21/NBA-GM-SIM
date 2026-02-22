
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { Team, Game, PlayoffSeries, Transaction, Player, GameTactics, DepthChart, SavedPlayerState } from '../types';
import { useBaseData } from '../services/queries';
import { loadPlayoffState, loadPlayoffGameResults } from '../services/playoffService';
import { loadCheckpoint, loadUserHistory, saveCheckpoint } from '../services/persistence';
import { replayGameState } from '../services/stateReplayer';
import { generateOwnerWelcome } from '../services/geminiService';
import { generateAutoTactics } from '../services/gameEngine';

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
    const [depthChart, setDepthChart] = useState<DepthChart | null>(null); // [New] Depth Chart
    const [news, setNews] = useState<any[]>([]);

    // --- Flags & Loading ---
    const [isSaveLoading, setIsSaveLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const hasInitialLoadRef = useRef(false);
    const isResettingRef = useRef(false);
    
    // Refs to avoid stale closures in callbacks
    const gameStateRef = useRef({ myTeamId, currentSimDate, userTactics, depthChart, teams });
    useEffect(() => { 
        gameStateRef.current = { myTeamId, currentSimDate, userTactics, depthChart, teams }; 
    }, [myTeamId, currentSimDate, userTactics, depthChart, teams]);

    // --- Base Data Query ---
    const { data: baseData, isLoading: isBaseDataLoading } = useBaseData();

    // ------------------------------------------------------------------
    //  INIT LOGIC
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

                // Load Data
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

                    // [NEW] Apply Saved Roster Condition & Injury State
                    let loadedTeams = replayedState.teams;
                    if (checkpoint.roster_state) {
                        const stateMap = checkpoint.roster_state;
                        loadedTeams = loadedTeams.map(t => ({
                            ...t,
                            roster: t.roster.map(p => {
                                const savedState = stateMap[p.id];
                                if (!savedState) return p;

                                // Handle Legacy Format (number only for condition)
                                if (typeof savedState === 'number') {
                                    return { ...p, condition: savedState };
                                }
                                
                                // Handle New Object Format
                                return {
                                    ...p,
                                    condition: savedState.condition ?? 100,
                                    health: savedState.health || 'Healthy',
                                    injuryType: savedState.injuryType,
                                    returnDate: savedState.returnDate
                                };
                            })
                        }));
                    }

                    setMyTeamId(checkpoint.team_id);
                    setTeams(loadedTeams);
                    setSchedule(replayedState.schedule);
                    setCurrentSimDate(replayedState.currentSimDate);
                    
                    if (checkpoint.tactics) {
                        // [Migration Fix] Ensure rotationMap exists for legacy saves
                        const tactics = { ...checkpoint.tactics };
                        if (!tactics.rotationMap) {
                            tactics.rotationMap = {};
                        }
                        setUserTactics(tactics);
                    }

                    // [New] Load Depth Chart
                    if (checkpoint.depth_chart) {
                        setDepthChart(checkpoint.depth_chart);
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
                    hasInitialLoadRef.current = true; // 재진입 방지 (baseData 재조회 시 중복 실행 차단)
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
            const depthChart = overrides?.depthChart || gameStateRef.current.depthChart; 
            
            // [NEW] Capture Full Roster State (Condition + Injury)
            const currentTeams = overrides?.teams || gameStateRef.current.teams;
            const rosterState: Record<string, SavedPlayerState> = {};
            
            if (currentTeams) {
                currentTeams.forEach((t: Team) => {
                    t.roster.forEach((p: Player) => {
                        // Save if condition changed OR if player is injured
                        const isInjured = p.health !== 'Healthy';
                        const isFatigued = p.condition !== undefined && p.condition < 100;
                        
                        if (isInjured || isFatigued) {
                            rosterState[p.id] = {
                                condition: p.condition || 100,
                                health: p.health,
                                injuryType: p.injuryType,
                                returnDate: p.returnDate
                            };
                        }
                    });
                });
            }

            if (teamId && date) {
                await saveCheckpoint(session.user.id, teamId, date, tactics, rosterState, depthChart);
            }
        } catch (e: any) {
            console.error("Save Failed:", e);
        } finally {
            setIsSaving(false);
        }
    }, [session, isGuestMode]);

    const handleSelectTeam = useCallback(async (teamId: string) => {
        console.log(`🏀 Team Selected: ${teamId}`);
        
        const teamData = teams.find(t => t.id === teamId);
        let newTactics: GameTactics | null = null;
        
        if (teamData) {
            // [Fix] Generate default tactics for the selected team
            newTactics = generateAutoTactics(teamData);
            setUserTactics(newTactics);
            
            const welcome = await generateOwnerWelcome(`${teamData.city} ${teamData.name}`);
            setNews([{ type: 'text', content: welcome }]);
        }

        setMyTeamId(teamId);
        setCurrentSimDate(INITIAL_DATE);

        await forceSave({ 
            myTeamId: teamId, 
            currentSimDate: INITIAL_DATE,
            userTactics: newTactics
        });

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
            setDepthChart(null); // [New]
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
        depthChart, setDepthChart, // [New]
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
