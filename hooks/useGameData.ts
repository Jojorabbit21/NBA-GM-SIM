
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
import { BoardPick } from '../components/draft/DraftBoard';
import { DraftPoolType } from '../types';

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
    const draftPicksRef = useRef<{ order?: string[]; poolType?: DraftPoolType; teams?: Record<string, string[]>; picks?: any[] } | null>(null);
    
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

                    // 드래프트 결과가 저장되어 있으면 로스터를 드래프트 결과로 재구성
                    let teamsForReplay = baseData.teams;
                    const savedDraftPicks = checkpoint.draft_picks as { order?: string[]; poolType?: DraftPoolType; teams?: Record<string, string[]>; picks?: any[] } | null;
                    if (savedDraftPicks) {
                        draftPicksRef.current = savedDraftPicks;
                        // teams가 있을 때만 로스터 재구성 (order만 있으면 추첨만 완료된 상태)
                        if (savedDraftPicks.teams) {
                            const playerMap = new Map<string, Player>();
                            baseData.teams.forEach((t: Team) => t.roster.forEach((p: Player) => playerMap.set(p.id, p)));
                            (baseData.freeAgents || []).forEach((p: Player) => playerMap.set(p.id, p));

                            teamsForReplay = baseData.teams.map((team: Team) => {
                                const pickedIds = savedDraftPicks.teams![team.id];
                                if (!pickedIds) return team;
                                const newRoster = pickedIds.map(id => playerMap.get(id)).filter(Boolean) as Player[];
                                return { ...team, roster: newRoster };
                            });
                        }
                    }

                    const replayedState = replayGameState(
                        teamsForReplay,
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

            // 드래프트 결과: 새로 전달되면 ref에 저장
            if (overrides?.draftPicks) {
                draftPicksRef.current = overrides.draftPicks;
            }

            if (teamId && date) {
                await saveCheckpoint(session.user.id, teamId, date, tactics, rosterState, depthChart, draftPicksRef.current);
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
            draftPicksRef.current = null;
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

    const saveDraftOrder = useCallback(async (order: string[], poolType: DraftPoolType) => {
        const draftData = { order, poolType };
        draftPicksRef.current = draftData;

        await forceSave({
            myTeamId: gameStateRef.current.myTeamId,
            currentSimDate: INITIAL_DATE,
            draftPicks: draftData,
        });
    }, [forceSave]);

    const handleDraftComplete = useCallback(async (picks: BoardPick[]) => {
        // 1. 팀별로 픽 분류
        const teamPicks: Record<string, string[]> = {};
        picks.forEach(p => {
            if (!teamPicks[p.teamId]) teamPicks[p.teamId] = [];
            teamPicks[p.teamId].push(p.playerId);
        });

        // 2. 전체 선수 풀 (id → Player 매핑) — freeAgents(레전드) 포함
        const playerMap = new Map<string, Player>();
        teams.forEach(t => t.roster.forEach(p => playerMap.set(p.id, p)));
        const fa = baseData?.freeAgents || [];
        fa.forEach((p: Player) => playerMap.set(p.id, p));

        // 3. 각 팀의 로스터를 드래프트 결과로 교체
        const newTeams = teams.map(team => {
            const pickedIds = teamPicks[team.id] || [];
            const newRoster = pickedIds
                .map(id => playerMap.get(id))
                .filter(Boolean) as Player[];
            return { ...team, roster: newRoster };
        });

        setTeams(newTeams);

        // 4. 유저 팀 전술 재생성 (새 로스터 기반)
        const myTeam = newTeams.find(t => t.id === myTeamId);
        let newTactics: GameTactics | null = null;
        if (myTeam) {
            newTactics = generateAutoTactics(myTeam);
            setUserTactics(newTactics);
        }

        // 5. draft_picks 구성 (DB draft_picks 컬럼용)
        const draftTeamsMap: Record<string, string[]> = {};
        newTeams.forEach(t => {
            draftTeamsMap[t.id] = t.roster.map(p => p.id);
        });

        // 6. 저장 — draft_picks 컬럼에 팀 매핑 + 전체 픽 히스토리 (추첨 순서 보존)
        await forceSave({
            myTeamId: myTeamId,
            currentSimDate: INITIAL_DATE,
            userTactics: newTactics,
            teams: newTeams,
            draftPicks: {
                order: draftPicksRef.current?.order,
                poolType: draftPicksRef.current?.poolType,
                teams: draftTeamsMap,
                picks,
            },
        });
    }, [teams, myTeamId, baseData, forceSave]);

    // 전술/뎁스차트 변경 시 디바운스 자동 저장 (1.5초)
    const tacticsAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isInitialTacticsLoad = useRef(true);

    useEffect(() => {
        // 초기 로드 시에는 저장하지 않음
        if (isInitialTacticsLoad.current) {
            if (userTactics) isInitialTacticsLoad.current = false;
            return;
        }
        if (!userTactics || !myTeamId || isResettingRef.current) return;

        if (tacticsAutoSaveTimer.current) clearTimeout(tacticsAutoSaveTimer.current);
        tacticsAutoSaveTimer.current = setTimeout(() => {
            forceSave();
        }, 1500);

        return () => {
            if (tacticsAutoSaveTimer.current) clearTimeout(tacticsAutoSaveTimer.current);
        };
    }, [userTactics, depthChart]);

    const cleanupData = () => {
         setMyTeamId(null);
         isInitialTacticsLoad.current = true;
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
        handleDraftComplete,
        saveDraftOrder,
        forceSave,
        cleanupData,
        
        freeAgents: baseData?.freeAgents || [],
        draftPicks: draftPicksRef.current,

        hasInitialLoadRef,
        isResetting: isResettingRef.current
    };
};
