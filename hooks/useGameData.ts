
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { Team, Game, PlayoffSeries, Transaction, Player, GameTactics, DepthChart, SavedPlayerState, RosterMode, ReplaySnapshot } from '../types';
import { useBaseData } from '../services/queries';
import { loadPlayoffState, loadPlayoffGameResults } from '../services/playoffService';
import { loadCheckpoint, loadUserHistory, loadUserTransactions, saveCheckpoint, countUserData } from '../services/persistence';
import { replayGameState } from '../services/stateReplayer';
import { buildReplaySnapshot, hydrateFromSnapshot, CURRENT_SNAPSHOT_VERSION } from '../services/snapshotBuilder';
import { generateOwnerWelcome } from '../services/geminiService';
import { generateAutoTactics } from '../services/gameEngine';
import { sendMessage } from '../services/messageService';
import { buildSeasonStartOwnerLetter } from '../services/reportGenerator';
import { generateNextPlayoffGames } from '../utils/playoffLogic';
import { calculateOvr } from '../utils/ovrUtils';
import { BoardPick } from '../components/draft/DraftBoard';
import { DraftPoolType } from '../types';
import { initializeSeasonGrowth } from '../services/playerDevelopment/playerAging';

export const INITIAL_DATE = '2025-10-20';

export const useGameData = (session: any, isGuestMode: boolean, rosterMode?: RosterMode | null) => {
    const queryClient = useQueryClient();

    // --- State ---
    const [myTeamId, _setMyTeamId] = useState<string | null>(null);
    const setMyTeamId = useCallback((id: string | null) => {
        _setMyTeamId(id);
        if (id) localStorage.setItem('lastTeamId', id);
        else localStorage.removeItem('lastTeamId');
    }, []);
    const [teams, setTeams] = useState<Team[]>([]);
    const [schedule, setSchedule] = useState<Game[]>([]);
    const [playoffSeries, setPlayoffSeries] = useState<PlayoffSeries[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [prospects, setProspects] = useState<Player[]>([]);
    const [currentSimDate, setCurrentSimDate] = useState<string>(INITIAL_DATE);
    const [userTactics, setUserTactics] = useState<GameTactics | null>(null);
    const [depthChart, setDepthChart] = useState<DepthChart | null>(null); // [New] Depth Chart
    const [tendencySeed, setTendencySeed] = useState<string | null>(null); // [New] Save-seeded hidden tendencies
    const [hofId, setHofId] = useState<string | null>(null); // HoF 제출용 세이브 식별자
    const [news, setNews] = useState<any[]>([]);

    // --- Flags & Loading ---
    const [isSaveLoading, setIsSaveLoading] = useState(true);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    const hasInitialLoadRef = useRef(false);
    const isResettingRef = useRef(false);
    const draftPicksRef = useRef<{ order?: string[]; poolType?: DraftPoolType; teams?: Record<string, string[]>; picks?: any[] } | null>(null);
    
    // Refs to avoid stale closures in callbacks
    const gameStateRef = useRef({ myTeamId, currentSimDate, userTactics, depthChart, teams, schedule, tendencySeed });
    useEffect(() => {
        gameStateRef.current = { myTeamId, currentSimDate, userTactics, depthChart, teams, schedule, tendencySeed };
    }, [myTeamId, currentSimDate, userTactics, depthChart, teams, schedule, tendencySeed]);

    // --- Base Data Query ---
    const { data: baseData, isLoading: isBaseDataLoading } = useBaseData();

    // --- Custom Mode: 부상 제거 + override 머지 + OVR 재계산 ---
    const applyCustomMode = useCallback((player: Player): Player => {
        // 1. 부상 제거
        let p: Player = { ...player, health: 'Healthy' as const, injuryType: undefined, returnDate: undefined };

        // 2. customOverrides 머지
        if (p.customOverrides) {
            p = { ...p, ...p.customOverrides };
        }

        // 3. 카테고리 평균 재계산
        const avg3pt = Math.round((p.threeCorner + p.three45 + p.threeTop) / 3);
        const ins = Math.round((p.layup + p.dunk + p.postPlay + p.drawFoul + p.hands) / 5);
        const out = Math.round((p.closeShot + p.midRange + avg3pt + p.ft + p.shotIq + p.offConsist) / 6);
        const plm = Math.round((p.passAcc + p.handling + p.spdBall + p.passIq + p.passVision) / 5);
        const def = Math.round((p.intDef + p.perDef + p.steal + p.blk + p.helpDefIq + p.passPerc + p.defConsist) / 7);
        const reb = Math.round((p.offReb + p.defReb) / 2);
        const ath = Math.round((p.speed + p.agility + p.strength + p.vertical + p.stamina + p.hustle + p.durability) / 7);

        // 4. OVR — 커스텀 오버라이드 OVR > 수동 OVR > 재계산
        const customOvr = player.customOverrides?.ovr;
        const ovrInput = { ...p, ins, out, plm, def, reb, ath, potential: p.potential };
        const ovr = customOvr ?? (p.manualOvr ? p.manualOvr : calculateOvr(ovrInput, p.position));

        return { ...p, ins, out, plm, def, reb, ath, ovr };
    }, []);

    // --- Custom Mode: freeAgents에 적용 ---
    const effectiveFreeAgents = useMemo(() => {
        const fa = baseData?.freeAgents || [];
        if (rosterMode !== 'custom') return fa;
        return fa.map(applyCustomMode);
    }, [baseData?.freeAgents, rosterMode, applyCustomMode]);

    // --- Custom Mode: teams에 적용 ---
    useEffect(() => {
        if (rosterMode !== 'custom') return;
        setTeams(prev => {
            if (prev.length === 0) return prev;
            return prev.map(t => ({
                ...t,
                roster: t.roster.map(applyCustomMode),
            }));
        });
    }, [rosterMode, applyCustomMode]);

    // ------------------------------------------------------------------
    //  INIT LOGIC
    // ------------------------------------------------------------------
    useEffect(() => {
        if (hasInitialLoadRef.current || isResettingRef.current) return;
        if (isBaseDataLoading || !baseData) return;

        const initializeGame = async () => {
            setIsSaveLoading(true);
            setLoadingProgress(0);
            try {
                if (isGuestMode) {
                    setLoadingProgress(100);
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
                setLoadingProgress(10);
                const checkpoint = await loadCheckpoint(userId);

                if (checkpoint && checkpoint.team_id) {
                    console.log(`📂 Found Save: ${checkpoint.team_id} @ ${checkpoint.sim_date}`);
                    setLoadingProgress(20);

                    // 드래프트 결과 복원 (스냅샷/리플레이 공통)
                    let teamsForReplay = baseData.teams;
                    const savedDraftPicks = checkpoint.draft_picks as { order?: string[]; poolType?: DraftPoolType; teams?: Record<string, string[]>; picks?: any[] } | null;
                    if (savedDraftPicks) {
                        draftPicksRef.current = savedDraftPicks;
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

                    // --- Snapshot Fast Path ---
                    const snapshot = checkpoint.replay_snapshot as ReplaySnapshot | null;
                    let snapshotUsed = false;
                    let loadedTeams: Team[];
                    let loadedSchedule: Game[];
                    let txList: any[] = [];
                    let playoffBracketState: any = null;

                    // Playoff bracket + snapshot validation + transactions 병렬 로드
                    if (snapshot && snapshot.version === CURRENT_SNAPSHOT_VERSION) {
                        setLoadingProgress(30);
                        const [pbState, counts, txData] = await Promise.all([
                            loadPlayoffState(userId, checkpoint.team_id),
                            countUserData(userId),
                            loadUserTransactions(userId),
                        ]);
                        playoffBracketState = pbState;
                        const isValid =
                            snapshot.game_count === counts.games &&
                            snapshot.playoff_game_count === counts.playoffs &&
                            snapshot.transaction_count === counts.transactions;

                        if (isValid) {
                            console.log("⚡ Snapshot valid — skipping full replay");
                            setLoadingProgress(50);
                            txList = txData;
                            setLoadingProgress(70);
                            await new Promise(r => setTimeout(r, 0));
                            const hydrated = hydrateFromSnapshot(teamsForReplay, baseData.schedule, snapshot, txList);
                            loadedTeams = hydrated.teams;
                            loadedSchedule = hydrated.schedule;
                            snapshotUsed = true;
                            setLoadingProgress(90);
                        }
                    }

                    // --- Full Replay Fallback ---
                    if (!snapshotUsed) {
                        console.log("🔄 Full replay — snapshot not available or invalid");
                        if (!playoffBracketState) {
                            playoffBracketState = await loadPlayoffState(userId, checkpoint.team_id);
                        }
                        setLoadingProgress(40);
                        const history = await loadUserHistory(userId);
                        txList = history.transactions;
                        setLoadingProgress(50);
                        const rawPlayoffResults = playoffBracketState ? await loadPlayoffGameResults(userId) : [];
                        setLoadingProgress(65);
                        await new Promise(r => setTimeout(r, 0));
                        const playoffResults = rawPlayoffResults.map((r: any) => ({ ...r, is_playoff: true }));
                        const allGameResults = [...history.games, ...playoffResults];

                        setLoadingProgress(70);
                        await new Promise(r => setTimeout(r, 0));
                        const replayedState = replayGameState(
                            teamsForReplay,
                            baseData.schedule,
                            txList,
                            allGameResults,
                            checkpoint.sim_date
                        );
                        loadedTeams = replayedState.teams;
                        loadedSchedule = replayedState.schedule;
                        setLoadingProgress(90);
                        await new Promise(r => setTimeout(r, 0));

                        // Build & save snapshot for next load
                        try {
                            const counts = await countUserData(userId);
                            const newSnapshot = buildReplaySnapshot(loadedTeams, loadedSchedule, counts);
                            saveCheckpoint(userId, checkpoint.team_id, checkpoint.sim_date,
                                undefined, undefined, undefined, undefined, undefined, newSnapshot);
                            console.log("💾 Snapshot saved for next load");
                        } catch (e) {
                            console.warn("⚠️ Failed to save snapshot (non-critical):", e);
                        }
                    }

                    // --- 공통 후처리 ---
                    // Apply Saved Roster Condition & Injury State
                    if (checkpoint.roster_state) {
                        const stateMap = checkpoint.roster_state;
                        loadedTeams = loadedTeams!.map(t => ({
                            ...t,
                            roster: t.roster.map(p => {
                                const savedState = stateMap[p.id];
                                if (!savedState) return p;
                                if (typeof savedState === 'number') {
                                    return { ...p, condition: savedState };
                                }
                                return {
                                    ...p,
                                    condition: savedState.condition ?? 100,
                                    health: savedState.health || 'Healthy',
                                    injuryType: savedState.injuryType,
                                    returnDate: savedState.returnDate,
                                    ...(savedState.fractionalGrowth && { fractionalGrowth: savedState.fractionalGrowth }),
                                    ...(savedState.changeLog && { changeLog: savedState.changeLog }),
                                };
                            })
                        }));
                    }

                    setMyTeamId(checkpoint.team_id);
                    setTeams(loadedTeams!);
                    setSchedule(loadedSchedule!);
                    setCurrentSimDate(checkpoint.sim_date || INITIAL_DATE);

                    if (checkpoint.tactics) {
                        const tactics = { ...checkpoint.tactics };
                        if (!tactics.rotationMap) {
                            tactics.rotationMap = {};
                        }
                        if (tactics.sliders && 'play_pnr' in tactics.sliders && !('playStyle' in tactics.sliders)) {
                            const { play_pnr = 5, play_iso = 5, play_post = 5, play_cns = 5, play_drive = 5, ...rest } = tactics.sliders as any;
                            const heroInd = (play_iso + play_post) / 2;
                            const sysInd = (play_cns + play_drive) / 2;
                            tactics.sliders = {
                                ...rest,
                                playStyle: Math.max(1, Math.min(10, Math.round(5 + (sysInd - heroInd) * 0.5))),
                                insideOut: Math.max(1, Math.min(10, Math.round(5 + (play_cns - play_post) * 0.5))),
                                pnrFreq: play_pnr,
                            };
                        }
                        setUserTactics(tactics);
                    }

                    if (checkpoint.depth_chart) {
                        setDepthChart(checkpoint.depth_chart);
                    }

                    if (checkpoint.tendency_seed) {
                        setTendencySeed(checkpoint.tendency_seed);
                    } else {
                        const newSeed = crypto.randomUUID();
                        setTendencySeed(newSeed);
                        saveCheckpoint(userId, checkpoint.team_id, checkpoint.sim_date, undefined, undefined, undefined, undefined, newSeed);
                    }

                    if (checkpoint.hof_id) {
                        setHofId(checkpoint.hof_id);
                    }

                    if (playoffBracketState && playoffBracketState.bracket_data) {
                        const restoredSeries: PlayoffSeries[] = playoffBracketState.bracket_data.series;
                        setPlayoffSeries(restoredSeries);

                        // Fallback: 스냅샷에 pending_playoff_games가 없는 경우에만 재생성
                        // (스냅샷 경로에서는 hydrateFromSnapshot이 이미 미진행 경기를 복원함)
                        const hasUnplayedPlayoff = loadedSchedule!.some(g => g.isPlayoff && !g.played);
                        if (!hasUnplayedPlayoff) {
                            const { newGames } = generateNextPlayoffGames(loadedSchedule!, restoredSeries, checkpoint.sim_date);
                            if (newGames.length > 0) {
                                loadedSchedule = [...loadedSchedule!, ...newGames];
                                setSchedule(prev => [...prev, ...newGames]);
                                console.log(`🏆 Regenerated ${newGames.length} upcoming playoff game(s)`);
                            }
                        }
                    }

                    setTransactions(txList.map((tx: any) => ({
                        id: tx.id || tx.Id || tx.transaction_id || `tx_${Math.random()}`,
                        date: tx.date,
                        type: tx.type,
                        teamId: tx.team_id,
                        description: tx.description,
                        details: tx.details
                    })).reverse());

                    setLoadingProgress(100);
                    hasInitialLoadRef.current = true;
                } else {
                    console.log("🆕 New Game Started");
                    setLoadingProgress(100);
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
    }, [baseData, isBaseDataLoading, isGuestMode, session?.user?.id]);

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
                        const isInjured = p.health !== 'Healthy';
                        const isFatigued = p.condition !== undefined && p.condition < 100;
                        const hasGrowth = p.fractionalGrowth && Object.keys(p.fractionalGrowth).length > 0;
                        const hasChangeLog = p.changeLog && p.changeLog.length > 0;

                        if (isInjured || isFatigued || hasGrowth || hasChangeLog) {
                            const state: SavedPlayerState = {
                                condition: p.condition || 100,
                                health: p.health,
                                injuryType: p.injuryType,
                                returnDate: p.returnDate,
                            };
                            if (hasGrowth) state.fractionalGrowth = p.fractionalGrowth;
                            if (hasChangeLog) state.changeLog = p.changeLog;
                            rosterState[p.id] = state;
                        }
                    });
                });
            }

            // 드래프트 결과: 새로 전달되면 ref에 저장
            if (overrides?.draftPicks) {
                draftPicksRef.current = overrides.draftPicks;
            }

            // tendencySeed: override에서 전달되면 우선 사용, 아니면 ref에서 가져옴
            const seed = overrides?.tendencySeed || gameStateRef.current.tendencySeed;

            // Build snapshot if requested (after game results)
            let snapshot: ReplaySnapshot | undefined;
            if (overrides?.withSnapshot && teamId) {
                try {
                    const currentSchedule = overrides?.schedule || gameStateRef.current.schedule;
                    const counts = await countUserData(session.user.id);
                    snapshot = buildReplaySnapshot(currentTeams, currentSchedule, counts);
                } catch (e) {
                    console.warn("⚠️ Snapshot build failed (non-critical):", e);
                }
            }

            if (teamId && date) {
                const result = await saveCheckpoint(session.user.id, teamId, date, tactics, rosterState, depthChart, draftPicksRef.current, seed, snapshot);
                // hofId를 DB 응답에서 동기화 (최초 세이브 시 DB가 gen_random_uuid()로 생성)
                if (result?.[0]?.hof_id) {
                    setHofId(result[0].hof_id);
                }
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

        // [New] Generate unique tendency seed for this save
        const newSeed = crypto.randomUUID();
        setTendencySeed(newSeed);

        // 시즌 시작: 모든 선수 성장 초기화 (catPot, seasonStartAttributes, fractionalGrowth)
        teams.forEach(t => initializeSeasonGrowth(t.roster));

        setMyTeamId(teamId);
        setCurrentSimDate(INITIAL_DATE);

        await forceSave({
            myTeamId: teamId,
            currentSimDate: INITIAL_DATE,
            userTactics: newTactics,
            tendencySeed: newSeed
        });

        // 시즌 시작 구단주 환영 서신 발송
        if (session?.user?.id) {
            const ownerLetter = buildSeasonStartOwnerLetter(teamId);
            await sendMessage(session.user.id, teamId, INITIAL_DATE, 'OWNER_LETTER', `[서신] ${ownerLetter.title}`, ownerLetter);
        }

        hasInitialLoadRef.current = true;
        return true;
    }, [teams, forceSave, session]);

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
            
            queryClient.removeQueries({ predicate: q => q.queryKey[0] !== 'baseData' });
            
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
            setDepthChart(null);
            setTendencySeed(null);
            setHofId(null);
            hasInitialLoadRef.current = false;

            return { success: true };
        } catch (e) {
            return { success: false, error: e };
        } finally {
            isResettingRef.current = false;
        }
    };

    const saveDraftOrder = useCallback(async (order: string[], poolType: DraftPoolType, teamId?: string) => {
        const draftData = { order, poolType };
        draftPicksRef.current = draftData;

        await forceSave({
            myTeamId: teamId || gameStateRef.current.myTeamId,
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
        effectiveFreeAgents.forEach((p: Player) => playerMap.set(p.id, p));

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
    }, [teams, myTeamId, effectiveFreeAgents, forceSave]);

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
         setTeams([]);
         setSchedule([]);
         setPlayoffSeries([]);
         setTransactions([]);
         setCurrentSimDate(INITIAL_DATE);
         setUserTactics(null);
         setDepthChart(null);
         setTendencySeed(null);
         setHofId(null);
         setNews([]);
         draftPicksRef.current = null;
         isInitialTacticsLoad.current = true;
         hasInitialLoadRef.current = false;
         queryClient.removeQueries({ predicate: q => q.queryKey[0] !== 'baseData' });
         Object.keys(localStorage).forEach((key) => {
             if (key.startsWith('trade_ops_')) localStorage.removeItem(key);
         });
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
        tendencySeed,
        hofId,
        news, setNews,
        
        isBaseDataLoading,
        isSaveLoading,
        loadingProgress,
        isSaving,
        
        handleSelectTeam,
        handleResetData,
        handleDraftComplete,
        saveDraftOrder,
        forceSave,
        cleanupData,
        
        freeAgents: effectiveFreeAgents,
        draftPicks: draftPicksRef.current,

        hasInitialLoadRef,
        isResetting: isResettingRef.current
    };
};
