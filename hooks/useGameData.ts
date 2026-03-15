
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
import { initializeSeasonGrowth, reapplyAttrDeltas } from '../services/playerDevelopment/playerAging';
import { SimSettings, DEFAULT_SIM_SETTINGS } from '../types/simSettings';
import { LeagueCoachingData } from '../types/coaching';
import { SavedTeamFinances } from '../types/finance';
import { generateLeagueCoaches, getCoachPreferences } from '../services/coachingStaff/coachGenerator';
import { getBudgetManager, resetBudgetManager } from '../services/financeEngine';
import { LeaguePickAssets } from '../types/draftAssets';
import { LeagueTradeBlocks, LeagueTradeOffers } from '../types/trade';
import { LeagueGMProfiles } from '../types/gm';
import { generateLeagueGMProfiles } from '../services/tradeEngine/gmProfiler';
import { initializeLeaguePickAssets } from '../services/draftAssets/pickInitializer';
import { buildSeasonConfig, SeasonConfig } from '../utils/seasonConfig';

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
    const [simSettings, setSimSettings] = useState<SimSettings>(DEFAULT_SIM_SETTINGS);
    const [coachingData, setCoachingData] = useState<LeagueCoachingData | null>(null);
    const [teamFinances, setTeamFinances] = useState<SavedTeamFinances | null>(null);
    const [leaguePickAssets, setLeaguePickAssets] = useState<LeaguePickAssets | null>(null);
    const [leagueTradeBlocks, setLeagueTradeBlocks] = useState<LeagueTradeBlocks>({});
    const [leagueTradeOffers, setLeagueTradeOffers] = useState<LeagueTradeOffers>({ offers: [] });
    const [leagueGMProfiles, setLeagueGMProfiles] = useState<LeagueGMProfiles>({});
    const [news, setNews] = useState<any[]>([]);

    // --- Flags & Loading ---
    const [isSaveLoading, setIsSaveLoading] = useState(true);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    const hasInitialLoadRef = useRef(false);
    const isResettingRef = useRef(false);
    const draftPicksRef = useRef<{ order?: string[]; poolType?: DraftPoolType; teams?: Record<string, string[]>; picks?: any[] } | null>(null);
    const pendingSaveRef = useRef<any>(null);
    const isSavingRef = useRef(false);

    // Refs to avoid stale closures in callbacks
    const [seasonNumber, setSeasonNumber] = useState<number>(1);
    const [currentSeason, setCurrentSeason] = useState<string>('2025-2026');
    const gameStateRef = useRef({ myTeamId, currentSimDate, userTactics, depthChart, teams, schedule, tendencySeed, simSettings, coachingData, leaguePickAssets, leagueTradeBlocks, leagueTradeOffers, leagueGMProfiles, transactions, seasonNumber, currentSeason });
    useEffect(() => {
        gameStateRef.current = { myTeamId, currentSimDate, userTactics, depthChart, teams, schedule, tendencySeed, simSettings, coachingData, leaguePickAssets, leagueTradeBlocks, leagueTradeOffers, leagueGMProfiles, transactions, seasonNumber, currentSeason };
    }, [myTeamId, currentSimDate, userTactics, depthChart, teams, schedule, tendencySeed, simSettings, coachingData, leaguePickAssets, leagueTradeBlocks, leagueTradeOffers, leagueGMProfiles, transactions, seasonNumber, currentSeason]);

    // --- Season Config (derived from seasonNumber) ---
    const seasonConfig = useMemo<SeasonConfig>(() => buildSeasonConfig(seasonNumber), [seasonNumber]);

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

                        // ★ 기존 스냅샷에서 성장 데이터 복원 (스냅샷 버전 미스매치 등으로 full replay 시)
                        if (snapshot?.teams_data) {
                            for (const team of loadedTeams) {
                                const teamData = snapshot.teams_data[team.id];
                                if (!teamData?.roster_stats) continue;
                                for (const player of team.roster) {
                                    const pData = teamData.roster_stats[player.id];
                                    if (!pData) continue;
                                    const gs = (pData as any).growthState;
                                    if (gs) {
                                        if (gs.fractionalGrowth) player.fractionalGrowth = gs.fractionalGrowth;
                                        if (gs.attrDeltas) player.attrDeltas = gs.attrDeltas;
                                        if (gs.changeLog) player.changeLog = gs.changeLog;
                                        if (gs.seasonStartAttributes) player.seasonStartAttributes = gs.seasonStartAttributes;
                                        if (gs.attrDeltas) reapplyAttrDeltas(player);
                                    }
                                    if ((pData as any).injuryHistory) player.injuryHistory = (pData as any).injuryHistory;
                                    if ((pData as any).awards) player.awards = (pData as any).awards;
                                }
                            }
                        }

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
                                const restored = {
                                    ...p,
                                    condition: savedState.condition ?? 100,
                                    health: savedState.health || 'Healthy',
                                    injuryType: savedState.injuryType,
                                    returnDate: savedState.returnDate,
                                    ...(savedState.fractionalGrowth && { fractionalGrowth: savedState.fractionalGrowth }),
                                    ...(savedState.attrDeltas && { attrDeltas: savedState.attrDeltas }),
                                    ...(savedState.changeLog && { changeLog: savedState.changeLog }),
                                    ...(savedState.seasonStartAttributes && { seasonStartAttributes: savedState.seasonStartAttributes }),
                                    ...(savedState.injuryHistory && { injuryHistory: savedState.injuryHistory }),
                                    ...(savedState.awards && { awards: savedState.awards }),
                                    ...(savedState.contract && {
                                        contract: savedState.contract,
                                        salary: savedState.contract.years[savedState.contract.currentYear],
                                        contractYears: savedState.contract.years.length - savedState.contract.currentYear,
                                    }),
                                };
                                // snapshot 경로에서 이미 reapplyAttrDeltas를 호출했으므로 이중 적용 방지
                                if (!snapshotUsed && restored.attrDeltas) reapplyAttrDeltas(restored);
                                return restored;
                            })
                        }));
                    }

                    setMyTeamId(checkpoint.team_id);
                    setTeams(loadedTeams!);
                    setSchedule(loadedSchedule!);
                    setCurrentSimDate(checkpoint.sim_date || INITIAL_DATE);

                    // 시즌 번호/라벨 복원
                    if (checkpoint.season_number) {
                        setSeasonNumber(checkpoint.season_number);
                    }
                    if (checkpoint.current_season) {
                        setCurrentSeason(checkpoint.current_season);
                    }

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

                    // SimSettings 로드 (기존 tactics.tcr 마이그레이션 포함)
                    if (checkpoint.sim_settings) {
                        setSimSettings({ ...DEFAULT_SIM_SETTINGS, ...checkpoint.sim_settings });
                    } else if (checkpoint.tactics?.tcr !== undefined) {
                        // 레거시 마이그레이션: tactics.tcr → growthRate + declineRate
                        const legacyTcr = checkpoint.tactics.tcr;
                        setSimSettings({ ...DEFAULT_SIM_SETTINGS, tcr: legacyTcr, growthRate: legacyTcr, declineRate: legacyTcr });
                    }

                    // 코칭 스태프 로드 (저장된 값 우선, 없으면 생성)
                    if (checkpoint.coaching_staff) {
                        setCoachingData(checkpoint.coaching_staff);
                    } else if (checkpoint.tendency_seed) {
                        const teamIds = loadedTeams!.map(t => t.id);
                        const generated = generateLeagueCoaches(teamIds, checkpoint.tendency_seed);
                        setCoachingData(generated);
                        // 비동기 저장 (non-blocking)
                        saveCheckpoint(userId, checkpoint.team_id, checkpoint.sim_date,
                            undefined, undefined, undefined, undefined, undefined, undefined, undefined, generated);
                    }

                    // 팀 재정 로드 (저장된 값 우선, 없으면 초기화)
                    if (checkpoint.team_finances) {
                        setTeamFinances(checkpoint.team_finances);
                        getBudgetManager().loadFromSaveData(checkpoint.team_finances);
                    } else if (loadedTeams) {
                        resetBudgetManager();
                        const coachSalaries: Record<string, number> = {};
                        const staffData = checkpoint.coaching_staff || coachingData;
                        if (staffData) {
                            for (const tid of Object.keys(staffData)) {
                                coachSalaries[tid] = staffData[tid]?.headCoach?.contractSalary ?? 7_000_000;
                            }
                        }
                        getBudgetManager().initializeSeason(loadedTeams, coachSalaries);
                        setTeamFinances(getBudgetManager().toSaveData());
                    }

                    // 드래프트 픽 자산 로드 (저장된 값 우선, 없으면 초기화)
                    if (checkpoint.league_pick_assets) {
                        setLeaguePickAssets(checkpoint.league_pick_assets);
                    } else {
                        const newPickAssets = initializeLeaguePickAssets();
                        setLeaguePickAssets(newPickAssets);
                        saveCheckpoint(userId, checkpoint.team_id, checkpoint.sim_date,
                            undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, newPickAssets);
                    }

                    // 트레이드 블록/오퍼 로드
                    if (checkpoint.league_trade_blocks) {
                        setLeagueTradeBlocks(checkpoint.league_trade_blocks);
                    }
                    if (checkpoint.league_trade_offers) {
                        setLeagueTradeOffers(checkpoint.league_trade_offers);
                    }
                    if (checkpoint.league_gm_profiles && Object.keys(checkpoint.league_gm_profiles).length > 0) {
                        setLeagueGMProfiles(checkpoint.league_gm_profiles);
                    } else {
                        // 기존 세이브에 GM 프로필이 없으면 새로 생성
                        const seed = checkpoint.tendency_seed || tendencySeed;
                        if (seed && loadedTeams) {
                            const teamIds = loadedTeams.map(t => t.id);
                            const gmProfiles = generateLeagueGMProfiles(teamIds, seed, checkpoint.team_id);
                            setLeagueGMProfiles(gmProfiles);
                        }
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

        pendingSaveRef.current = overrides ?? {};
        if (isSavingRef.current) return; // 이미 저장 중 → 완료 후 pending 실행됨

        isSavingRef.current = true;
        setIsSaving(true);
        try {
            while (pendingSaveRef.current !== null) {
                const ov = pendingSaveRef.current;
                pendingSaveRef.current = null; // 소비

                const teamId = ov?.myTeamId || gameStateRef.current.myTeamId;
                const date = ov?.currentSimDate || gameStateRef.current.currentSimDate;
                const tactics = ov?.userTactics || gameStateRef.current.userTactics;
                const dc = ov?.depthChart || gameStateRef.current.depthChart;
                const currentTeams = ov?.teams || gameStateRef.current.teams;
                const currentSchedule = ov?.schedule || gameStateRef.current.schedule;

                // Build snapshot if requested
                let snapshot: ReplaySnapshot | undefined;
                let snapshotBuildFailed = false;
                if (ov?.withSnapshot && teamId) {
                    try {
                        // 스케줄에서 직접 카운트 계산 (countUserData DB 호출 제거)
                        const txLen = (gameStateRef.current as any).transactions?.length || 0;
                        const counts = {
                            games: currentSchedule.filter((g: Game) => g.played && !g.isPlayoff).length,
                            playoffs: currentSchedule.filter((g: Game) => g.played && g.isPlayoff).length,
                            transactions: txLen,
                        };
                        snapshot = buildReplaySnapshot(currentTeams, currentSchedule, counts);
                    } catch (e) {
                        console.warn("⚠️ Snapshot build failed (non-critical):", e);
                        snapshotBuildFailed = true;
                    }
                }

                // Roster State: 정상 시 condition/health/injury만, 스냅샷 실패 시 성장 데이터 폴백 포함
                const rosterState: Record<string, SavedPlayerState> = {};
                if (currentTeams) {
                    currentTeams.forEach((t: Team) => {
                        t.roster.forEach((p: Player) => {
                            const isInjured = p.health !== 'Healthy';
                            const isFatigued = p.condition !== undefined && p.condition < 100;
                            const hasGrowth = p.fractionalGrowth && Object.keys(p.fractionalGrowth).length > 0;
                            const hasChangeLog = p.changeLog && p.changeLog.length > 0;
                            const hasAttrDeltas = p.attrDeltas && Object.keys(p.attrDeltas).length > 0;
                            const hasSeasonStart = p.seasonStartAttributes && Object.keys(p.seasonStartAttributes).length > 0;
                            const hasInjuryHistory = p.injuryHistory && p.injuryHistory.length > 0;
                            const hasAwards = p.awards && p.awards.length > 0;
                            const hasContract = p.contract && (p.contract.currentYear > 0 || p.contract.noTrade || p.contract.option);
                            const hasAnyGrowthData = hasGrowth || hasChangeLog || hasAttrDeltas || hasSeasonStart;
                            const needsGrowthBackup = snapshotBuildFailed && hasAnyGrowthData;
                            const needsExtraBackup = snapshotBuildFailed && (hasInjuryHistory || hasAwards);

                            if (isInjured || isFatigued || needsGrowthBackup || needsExtraBackup || hasContract) {
                                const state: SavedPlayerState = {
                                    condition: p.condition || 100,
                                    health: p.health,
                                    injuryType: p.injuryType,
                                    returnDate: p.returnDate,
                                };
                                if (needsGrowthBackup) {
                                    if (hasGrowth) state.fractionalGrowth = p.fractionalGrowth;
                                    if (hasAttrDeltas) state.attrDeltas = p.attrDeltas;
                                    if (hasChangeLog) state.changeLog = p.changeLog;
                                    if (hasSeasonStart) state.seasonStartAttributes = p.seasonStartAttributes;
                                }
                                if (snapshotBuildFailed && hasInjuryHistory) state.injuryHistory = p.injuryHistory;
                                if (snapshotBuildFailed && hasAwards) state.awards = p.awards;
                                if (hasContract) state.contract = p.contract;
                                rosterState[p.id] = state;
                            }
                        });
                    });
                }

                if (ov?.draftPicks) {
                    draftPicksRef.current = ov.draftPicks;
                }
                const seed = ov?.tendencySeed || gameStateRef.current.tendencySeed;

                if (teamId && date) {
                    const _saveStart = performance.now();
                    const currentSimSettings = ov?.simSettings || gameStateRef.current.simSettings;
                    const coaching = ov?.coachingData || gameStateRef.current.coachingData;
                    const finances = getBudgetManager().toSaveData();
                    const pickAssets = ov?.leaguePickAssets || gameStateRef.current.leaguePickAssets;
                    const tradeBlocks = ov?.leagueTradeBlocks || gameStateRef.current.leagueTradeBlocks;
                    const tradeOffers = ov?.leagueTradeOffers || gameStateRef.current.leagueTradeOffers;
                    const gmProfiles = ov?.leagueGMProfiles || gameStateRef.current.leagueGMProfiles;
                    const savSeasonNum = ov?.seasonNumber || gameStateRef.current.seasonNumber;
                    const savCurrentSeason = ov?.currentSeason || gameStateRef.current.currentSeason;
                    const result = await saveCheckpoint(session.user.id, teamId, date, tactics, rosterState, dc, draftPicksRef.current, seed, snapshot, currentSimSettings, coaching, finances, pickAssets, tradeBlocks, tradeOffers, gmProfiles, savSeasonNum, savCurrentSeason);
                    const rosterKeys = Object.keys(rosterState).length;
                    console.log(`💾 [forceSave] ${date} saved in ${(performance.now() - _saveStart).toFixed(0)}ms (snapshot: ${snapshot ? 'yes' : 'no'}, roster_state: ${rosterKeys} players)`);
                    if (result?.[0]?.hof_id) {
                        setHofId(result[0].hof_id);
                    }
                }
            }
        } catch (err) {
            console.warn("❌ [forceSave] Save error:", err);
        } finally {
            isSavingRef.current = false;
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

        // 30팀 코칭 스태프 생성 (tendencySeed 기반 결정론적)
        const teamIds = teams.map(t => t.id);
        const newCoachingData = generateLeagueCoaches(teamIds, newSeed);
        setCoachingData(newCoachingData);

        // 코치 선호도를 자동전술에 반영
        if (teamData && newTactics) {
            const coachPrefs = getCoachPreferences(newCoachingData, teamId);
            if (coachPrefs) {
                newTactics = generateAutoTactics(teamData, coachPrefs);
                setUserTactics(newTactics);
            }
        }

        // 시즌 시작: 모든 선수 성장 초기화 (catPot, seasonStartAttributes, fractionalGrowth)
        teams.forEach(t => initializeSeasonGrowth(t.roster));

        // 재정 초기화: 이전 세이브 싱글턴 클리어 → 새 시즌 재정 세팅
        resetBudgetManager();
        const coachSalaries: Record<string, number> = {};
        if (newCoachingData) {
            for (const tid of teamIds) {
                coachSalaries[tid] = newCoachingData[tid]?.headCoach?.contractSalary ?? 7_000_000;
            }
        }
        getBudgetManager().initializeSeason(teams, coachSalaries);
        setTeamFinances(getBudgetManager().toSaveData());

        // 드래프트 픽 자산 초기화
        const newPickAssets = initializeLeaguePickAssets();
        setLeaguePickAssets(newPickAssets);

        // 트레이드 블록/오퍼/GM 프로필 초기화
        setLeagueTradeBlocks({});
        setLeagueTradeOffers({ offers: [] });
        // GM 프로필 생성 (tendencySeed 기반)
        const gmProfiles = generateLeagueGMProfiles(teamIds, newSeed, teamId);
        setLeagueGMProfiles(gmProfiles);

        setMyTeamId(teamId);
        setCurrentSimDate(INITIAL_DATE);

        await forceSave({
            myTeamId: teamId,
            currentSimDate: INITIAL_DATE,
            userTactics: newTactics,
            tendencySeed: newSeed,
            coachingData: newCoachingData,
            leaguePickAssets: newPickAssets,
            teams,
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
            setCoachingData(null);
            setLeaguePickAssets(null);
            setLeagueTradeBlocks({});
            setLeagueTradeOffers({ offers: [] });
            setLeagueGMProfiles({});
            setHofId(null);
            setSeasonNumber(1);
            setCurrentSeason('2025-2026');
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

        // 4. 유저 팀 전술 재생성 (새 로스터 기반 + 코치 선호 반영)
        const myTeam = newTeams.find(t => t.id === myTeamId);
        let newTactics: GameTactics | null = null;
        if (myTeam) {
            const coachPrefs = getCoachPreferences(gameStateRef.current.coachingData, myTeam.id);
            newTactics = generateAutoTactics(myTeam, coachPrefs);
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

    // simSettings 변경 시 디바운스 자동 저장 (1.5초)
    const simSettingsAutoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isInitialSimSettingsLoad = useRef(true);

    useEffect(() => {
        if (isInitialSimSettingsLoad.current) {
            isInitialSimSettingsLoad.current = false;
            return;
        }
        if (!myTeamId || isResettingRef.current) return;

        if (simSettingsAutoSaveTimer.current) clearTimeout(simSettingsAutoSaveTimer.current);
        simSettingsAutoSaveTimer.current = setTimeout(() => {
            forceSave();
        }, 1500);

        return () => {
            if (simSettingsAutoSaveTimer.current) clearTimeout(simSettingsAutoSaveTimer.current);
        };
    }, [simSettings]);

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
         setSimSettings(DEFAULT_SIM_SETTINGS);
         setCoachingData(null);
         setLeaguePickAssets(null);
         setSeasonNumber(1);
         setCurrentSeason('2025-2026');
         setNews([]);
         draftPicksRef.current = null;
         isInitialTacticsLoad.current = true;
         isInitialSimSettingsLoad.current = true;
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
        simSettings, setSimSettings,
        coachingData, setCoachingData,
        leaguePickAssets, setLeaguePickAssets,
        leagueTradeBlocks, setLeagueTradeBlocks,
        leagueTradeOffers, setLeagueTradeOffers,
        leagueGMProfiles, setLeagueGMProfiles,
        teamFinances,
        seasonNumber, setSeasonNumber,
        currentSeason, setCurrentSeason,
        seasonConfig,
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
