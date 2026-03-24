
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { Team, Game, PlayoffSeries, Transaction, Player, GameTactics, DepthChart, SavedPlayerState, RosterMode, ReplaySnapshot, DeadMoneyEntry } from '../types';
import { useBaseData, fetchPredefinedDraftClass } from '../services/queries';
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
import { assignArchetypes } from '../services/playerDevelopment/archetypeEvaluator';
import { SimSettings, DEFAULT_SIM_SETTINGS } from '../types/simSettings';
import { LeagueCoachingData } from '../types/coaching';
import { SavedTeamFinances } from '../types/finance';
import { generateLeagueCoaches, getCoachPreferences } from '../services/coachingStaff/coachGenerator';
import { getBudgetManager, resetBudgetManager } from '../services/financeEngine';
import { LeaguePickAssets, ResolvedDraftOrder } from '../types/draftAssets';
import { LeagueTradeBlocks, LeagueTradeOffers } from '../types/trade';
import { LeagueGMProfiles } from '../types/gm';
import { generateLeagueGMProfiles } from '../services/tradeEngine/gmProfiler';
import { initializeLeaguePickAssets } from '../services/draftAssets/pickInitializer';
import { buildSeasonConfig, SeasonConfig, DEFAULT_SEASON_CONFIG } from '../utils/seasonConfig';
import { updateLeagueFinancials, generateCapHistory, getSeasonCap } from '../utils/constants';
import { generateSeasonSchedule, ScheduleConfig } from '../utils/scheduleGenerator';
import { LotteryResult } from '../services/draft/lotteryEngine';
import { OffseasonPhase } from '../types/app';
import { LeagueFAPool } from '../types/generatedPlayer';
import { LeagueFAMarket } from '../types/fa';
import { fetchUserGeneratedPlayers, fetchDraftClass, markAsDrafted, insertDraftClass } from '../services/draft/rookieRepository';
import { calcRookieContract, generateInitialFAPool } from '../services/draft/rookieGenerator';
import { mapRawPlayerToRuntimePlayer } from '../services/dataMapper';
import { TEAM_DATA } from '../data/teamData';
import type { DraftResultContent, DraftResultEntry } from '../types/message';

export const INITIAL_DATE = DEFAULT_SEASON_CONFIG.startDate;

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
    const [lotteryResult, setLotteryResult] = useState<LotteryResult | null>(null);
    const [resolvedDraftOrder, setResolvedDraftOrder] = useState<ResolvedDraftOrder | null>(null);
    const [leagueFAPool, setLeagueFAPool] = useState<LeagueFAPool | null>(null);
    const [generatedFreeAgents, setGeneratedFreeAgents] = useState<Player[]>([]);
    const [retiredPlayerIds, setRetiredPlayerIds] = useState<string[]>([]);
    const [leagueFAMarket, setLeagueFAMarket] = useState<LeagueFAMarket | null>(null);
    const [leagueCapHistory, setLeagueCapHistory] = useState<Record<number, number>>({});

    // --- Flags & Loading ---
    const [isSaveLoading, setIsSaveLoading] = useState(true);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const hasInitialLoadRef = useRef(false);
    const isResettingRef = useRef(false);
    const draftPicksRef = useRef<{ order?: string[]; poolType?: DraftPoolType; teams?: Record<string, string[]>; picks?: any[] } | null>(null);
    const [draftPicksState, setDraftPicksState] = useState<{ order?: string[]; poolType?: DraftPoolType; teams?: Record<string, string[]>; picks?: any[] } | null>(null);
    const pendingSaveRef = useRef<any>(null);
    const isSavingRef = useRef(false);

    // Refs to avoid stale closures in callbacks
    const [seasonNumber, setSeasonNumber] = useState<number>(1);
    const [currentSeason, setCurrentSeason] = useState<string>(DEFAULT_SEASON_CONFIG.seasonLabel);
    const [offseasonPhase, setOffseasonPhase] = useState<OffseasonPhase>(null);
    const gameStateRef = useRef({ myTeamId, currentSimDate, userTactics, depthChart, teams, schedule, tendencySeed, simSettings, coachingData, leaguePickAssets, leagueTradeBlocks, leagueTradeOffers, leagueGMProfiles, transactions, seasonNumber, currentSeason, lotteryResult, offseasonPhase, leagueFAPool, retiredPlayerIds, leagueFAMarket, leagueCapHistory });
    useEffect(() => {
        gameStateRef.current = { myTeamId, currentSimDate, userTactics, depthChart, teams, schedule, tendencySeed, simSettings, coachingData, leaguePickAssets, leagueTradeBlocks, leagueTradeOffers, leagueGMProfiles, transactions, seasonNumber, currentSeason, lotteryResult, offseasonPhase, leagueFAPool, retiredPlayerIds, leagueFAMarket, leagueCapHistory };
    }, [myTeamId, currentSimDate, userTactics, depthChart, teams, schedule, tendencySeed, simSettings, coachingData, leaguePickAssets, leagueTradeBlocks, leagueTradeOffers, leagueGMProfiles, transactions, seasonNumber, currentSeason, lotteryResult, offseasonPhase, leagueFAPool, retiredPlayerIds, leagueFAMarket, leagueCapHistory]);

    // --- Season Config (derived from seasonNumber) ---
    const seasonConfig = useMemo<SeasonConfig>(() => buildSeasonConfig(seasonNumber), [seasonNumber]);

    // 시즌 전환 시 LEAGUE_FINANCIALS 동적 갱신
    useEffect(() => {
        if (Object.keys(leagueCapHistory).length > 0) {
            updateLeagueFinancials(getSeasonCap(leagueCapHistory, seasonNumber));
        }
    }, [seasonNumber, leagueCapHistory]);

    // --- Base Data Query ---
    const { data: baseData, isLoading: isBaseDataLoading, isError: isBaseDataError } = useBaseData(!!session || isGuestMode);

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

        // 4. OVR — 항상 능력치 기반 동적 계산 (성장/퇴화 반영)
        const customOvr = player.customOverrides?.ovr;
        const ovrInput = { ...p, ins, out, plm, def, reb, ath, potential: p.potential };
        const ovr = customOvr ?? calculateOvr(ovrInput, p.position);

        return { ...p, ins, out, plm, def, reb, ath, ovr };
    }, []);

    // --- Custom Mode: freeAgents에 적용 ---
    const effectiveFreeAgents = useMemo(() => {
        const fa = baseData?.freeAgents || [];
        const base = rosterMode === 'custom' ? fa.map(applyCustomMode) : fa;
        const retiredSet = retiredPlayerIds.length > 0 ? new Set(retiredPlayerIds) : null;
        // 생성 FA 선수 병합 + 은퇴 선수 제외
        const merged = generatedFreeAgents.length > 0 ? [...base, ...generatedFreeAgents] : base;
        return retiredSet ? merged.filter(p => !retiredSet.has(p.id)) : merged;
    }, [baseData?.freeAgents, rosterMode, applyCustomMode, generatedFreeAgents, retiredPlayerIds]);

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
            setLoadingMessage('');
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
                setLoadingMessage('세이브 데이터 조회 중 ...');
                const checkpoint = await loadCheckpoint(userId);

                if (checkpoint && checkpoint.team_id) {
                    console.log(`📂 Found Save: ${checkpoint.team_id} @ ${checkpoint.sim_date}`);
                    setLoadingProgress(20);
                    setLoadingMessage('드래프트 기록 복원 중 ...');

                    // 드래프트 결과 복원 (스냅샷/리플레이 공통)
                    let teamsForReplay = baseData.teams;
                    const savedDraftPicks = checkpoint.draft_picks as { order?: string[]; poolType?: DraftPoolType; teams?: Record<string, string[]>; picks?: any[] } | null;
                    if (savedDraftPicks) {
                        draftPicksRef.current = savedDraftPicks;
                        setDraftPicksState(savedDraftPicks);
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
                    const savedSeason = (checkpoint as any).current_season as string | undefined;
                    const savedSeasonNumber = (checkpoint as any).season_number as number | undefined;

                    // 시즌 2+ 이면 해당 시즌의 스케줄을 동적 생성 (baseData.schedule은 시즌 1 전용)
                    let baseSchedule: Game[];
                    if (savedSeasonNumber && savedSeasonNumber > 1) {
                        const sc = buildSeasonConfig(savedSeasonNumber);
                        const schedCfg: ScheduleConfig = {
                            seasonYear: sc.startYear,
                            seasonStart: sc.startDate,
                            regularSeasonEnd: sc.regularSeasonEnd,
                            allStarStart: sc.allStarStart,
                            allStarEnd: sc.allStarEnd,
                        };
                        baseSchedule = generateSeasonSchedule(schedCfg);
                        console.log(`📅 Generated season ${savedSeasonNumber} schedule: ${baseSchedule.length} games`);
                    } else {
                        baseSchedule = baseData.schedule;
                    }

                    // Playoff bracket + snapshot validation + transactions 병렬 로드
                    if (snapshot && snapshot.version === CURRENT_SNAPSHOT_VERSION) {
                        setLoadingProgress(30);
                        setLoadingMessage('스냅샷 유효성 검사 중 ...');
                        const [pbState, counts, txData] = await Promise.all([
                            loadPlayoffState(userId, checkpoint.team_id, savedSeason),
                            countUserData(userId, savedSeason),
                            loadUserTransactions(userId, savedSeason),
                        ]);
                        playoffBracketState = pbState;
                        // count가 -1이면 DB 에러 — 스냅샷 검증 불가, full replay로 fallback
                        const countsReliable = counts.games >= 0 && counts.playoffs >= 0 && counts.transactions >= 0;
                        if (!countsReliable) console.warn('⚠️ countUserData returned errors, falling back to full replay');
                        const isValid = countsReliable &&
                            snapshot.game_count === counts.games &&
                            snapshot.playoff_game_count === counts.playoffs &&
                            snapshot.transaction_count === counts.transactions;

                        if (isValid) {
                            console.log("⚡ Snapshot valid — skipping full replay");
                            setLoadingProgress(50);
                            setLoadingMessage('트랜잭션 기록 확인 완료');
                            txList = txData;
                            setLoadingProgress(70);
                            setLoadingMessage('스냅샷에서 팀 상태 복원 중 ...');
                            await new Promise(r => setTimeout(r, 0));
                            const hydrated = hydrateFromSnapshot(teamsForReplay, baseSchedule, snapshot, txList);
                            loadedTeams = hydrated.teams;
                            loadedSchedule = hydrated.schedule;
                            snapshotUsed = true;
                            setLoadingProgress(90);
                            setLoadingMessage('데이터 적용 중 ...');
                        }
                    }

                    // --- Full Replay Fallback ---
                    if (!snapshotUsed) {
                        console.log("🔄 Full replay — snapshot not available or invalid");
                        if (!playoffBracketState) {
                            playoffBracketState = await loadPlayoffState(userId, checkpoint.team_id, savedSeason);
                        }
                        setLoadingProgress(40);
                        setLoadingMessage('전체 경기 기록 조회 중 ...');
                        const history = await loadUserHistory(userId, savedSeason);
                        txList = history.transactions;
                        setLoadingProgress(50);
                        setLoadingMessage('플레이오프 기록 조회 중 ...');
                        const rawPlayoffResults = playoffBracketState ? await loadPlayoffGameResults(userId, savedSeason) : [];
                        setLoadingProgress(65);
                        setLoadingMessage('시즌 전체 경기 재생 중 ...');
                        await new Promise(r => setTimeout(r, 0));
                        const playoffResults = rawPlayoffResults.map((r: any) => ({ ...r, is_playoff: true }));
                        const allGameResults = [...history.games, ...playoffResults];

                        setLoadingProgress(70);
                        setLoadingMessage('팀 상태 재조립 중 ...');
                        await new Promise(r => setTimeout(r, 0));
                        const replayedState = replayGameState(
                            teamsForReplay,
                            baseSchedule,
                            txList,
                            allGameResults,
                            checkpoint.sim_date,
                            savedSeason,
                        );
                        loadedTeams = replayedState.teams;
                        loadedSchedule = replayedState.schedule;
                        setLoadingProgress(90);
                        setLoadingMessage('선수 성장 데이터 적용 중 ...');
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
                                    ...(savedState.archetypeState && { archetypeState: savedState.archetypeState }),
                                    ...(savedState.popularity && { popularity: savedState.popularity }),
                                    ...(savedState.morale && { morale: savedState.morale }),
                                    ...(savedState.age !== undefined && { age: savedState.age }),
                                    ...(() => {
                                        const saved = savedState.contract;
                                        if (!saved) return {};
                                        const db = p.contract; // dataMapper(+snapshotBuilder) 에서 로드된 DB 다년 계약
                                        // DB에 더 많은 이력이 있으면 DB 우선 사용 (BBRef 업데이트 반영)
                                        // 추가 조건: 연봉 배열 길이가 같아도 DB의 currentYear가 더 크면 DB 우선
                                        // (단, 현재 연봉이 일치하는 경우에만 - 재계약된 선수 오판 방지)
                                        const savedCurSal = saved.years[saved.currentYear ?? 0];
                                        const dbCurSal = db?.years[db?.currentYear ?? 0];
                                        const useDB = db && dbCurSal === savedCurSal && (
                                            saved.years.length < db.years.length ||
                                            (db.currentYear ?? 0) > (saved.currentYear ?? 0)
                                        );
                                        const useContract = useDB ? db : saved;
                                        return {
                                            contract: useContract,
                                            salary: useContract.years[useContract.currentYear],
                                            contractYears: useContract.years.length - useContract.currentYear,
                                        };
                                    })(),
                                };
                                // snapshot 경로에서 이미 reapplyAttrDeltas를 호출했으므로 이중 적용 방지
                                if (!snapshotUsed && restored.attrDeltas) reapplyAttrDeltas(restored);
                                return restored;
                            })
                        }));
                    }

                    // 초기 아키타입 배정: archetypeState가 없는 선수에게 일괄 배정
                    const seasonLabel = checkpoint.current_season || '2025-26';
                    loadedTeams = loadedTeams!.map(t => ({
                        ...t,
                        roster: t.roster.map(p => {
                            if (p.archetypeState) return p;
                            return { ...p, archetypeState: assignArchetypes(p, seasonLabel) };
                        }),
                    }));

                    // 데드캡 복원: team_finances[teamId].deadMoney → Team.deadMoney
                    if (checkpoint.team_finances) {
                        loadedTeams = loadedTeams!.map(t => {
                            const savedFinances = (checkpoint.team_finances as any)[t.id];
                            const dm = savedFinances?.deadMoney as DeadMoneyEntry[] | undefined;
                            if (dm && dm.length > 0) return { ...t, deadMoney: dm };
                            return t;
                        });
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

                    // 로터리 결과 복원
                    if (checkpoint.lottery_result) {
                        setLotteryResult(checkpoint.lottery_result);
                        // resolvedDraftOrder가 lottery_result 안에 embed되어 있으면 복원
                        if (checkpoint.lottery_result.resolvedDraftOrder) {
                            setResolvedDraftOrder(checkpoint.lottery_result.resolvedDraftOrder);
                        }
                    }

                    // 생성 FA 풀 복원
                    const savedFAPool = (checkpoint as any).league_fa_pool as LeagueFAPool | null;
                    if (savedFAPool) {
                        setLeagueFAPool(savedFAPool);
                    }

                    // 은퇴 선수 ID 목록 복원
                    const savedRetiredIds = (checkpoint as any).retired_player_ids as string[] | null;
                    if (savedRetiredIds && savedRetiredIds.length > 0) {
                        setRetiredPlayerIds(savedRetiredIds);
                    }

                    // FA 시장 상태 복원
                    const savedFAMarket = (checkpoint as any).league_fa_market as LeagueFAMarket | null;
                    if (savedFAMarket) {
                        setLeagueFAMarket(savedFAMarket);
                    }

                    // 캡 히스토리 복원 (없으면 10시즌치 신규 생성)
                    const savedCapHistory = (checkpoint as any).league_cap_history as Record<number, number> | null;
                    if (savedCapHistory && Object.keys(savedCapHistory).length > 0) {
                        setLeagueCapHistory(savedCapHistory);
                        updateLeagueFinancials(getSeasonCap(savedCapHistory, savedSeasonNumber ?? 1));
                    } else {
                        const newCapHistory = generateCapHistory(10);
                        setLeagueCapHistory(newCapHistory);
                        updateLeagueFinancials(getSeasonCap(newCapHistory, savedSeasonNumber ?? 1));
                        saveCheckpoint(userId, checkpoint.team_id, checkpoint.sim_date,
                            undefined, undefined, undefined, undefined, undefined, undefined,
                            undefined, undefined, undefined, undefined, undefined, undefined,
                            undefined, undefined, undefined, undefined, undefined, undefined,
                            undefined, undefined, newCapHistory);
                    }

                    // 생성 선수 로드 (시즌 2+ 또는 league_fa_pool 존재 시)
                    if (savedFAPool || (savedSeasonNumber && savedSeasonNumber > 1)) {
                        try {
                            const genPlayers = await fetchUserGeneratedPlayers(userId);
                            if (genPlayers.length > 0) {
                                console.log(`📋 Loaded ${genPlayers.length} generated players`);

                                const faIds = new Set(savedFAPool?.generatedIds || []);
                                const genFA: Player[] = [];

                                for (const row of genPlayers) {
                                    if (row.status === 'retired') continue;

                                    // base_attributes → Player 변환
                                    const player = mapRawPlayerToRuntimePlayer({
                                        id: row.id,
                                        base_attributes: row.base_attributes,
                                    });

                                    if (row.status === 'drafted' && row.draft_team_id) {
                                        // 드래프트된 선수 → 해당 팀 roster에 주입
                                        const team = loadedTeams!.find(t => t.id === row.draft_team_id);
                                        if (team && !team.roster.some(p => p.id === row.id)) {
                                            team.roster.push(player);
                                        }
                                    } else if (row.status === 'fa' && faIds.has(row.id)) {
                                        // FA 풀에 있는 생성 선수
                                        genFA.push(player);
                                    }
                                }

                                if (genFA.length > 0) {
                                    setGeneratedFreeAgents(genFA);
                                    console.log(`🏀 Injected ${genFA.length} generated FA, ${genPlayers.length - genFA.length} drafted/other`);
                                }
                            }
                        } catch (e) {
                            console.warn('⚠️ Failed to load generated players (non-critical):', e);
                        }
                    }

                    // 드래프트 풀 복원: prospectReveal 이후면 DB에서 prospects 로드
                    const currentSeasonCfg = savedSeasonNumber ? buildSeasonConfig(savedSeasonNumber) : DEFAULT_SEASON_CONFIG;
                    if (checkpoint.sim_date >= currentSeasonCfg.keyDates.prospectReveal) {
                        try {
                            const nextSeason = (savedSeasonNumber ?? 1) + 1;
                            const draftClassRows = await fetchDraftClass(userId, nextSeason);
                            let prospectPlayers: Player[] = [];
                            if (draftClassRows.length > 0) {
                                prospectPlayers = draftClassRows
                                    .filter(r => r.status === 'fa')
                                    .map(r => mapRawPlayerToRuntimePlayer({ id: r.id, base_attributes: r.base_attributes }));
                            }
                            // DB에 없으면 meta_players에서 직접 로드 (이전 버전 세이브 호환)
                            const phase = (checkpoint as any).offseason_phase as string | undefined;
                            if (prospectPlayers.length === 0 && phase && phase !== 'POST_DRAFT') {
                                const rawRows = await fetchPredefinedDraftClass('2026');
                                if (rawRows.length > 0) {
                                    prospectPlayers = rawRows.map((r: any) => mapRawPlayerToRuntimePlayer({ id: String(r.id), base_attributes: r.base_attributes }));
                                    console.log(`📋 Fallback: loaded ${prospectPlayers.length} prospects from meta_players`);
                                }
                            }
                            if (prospectPlayers.length > 0) {
                                setProspects(prospectPlayers);
                                console.log(`📋 Restored ${prospectPlayers.length} draft prospects`);
                            }
                        } catch (e) {
                            console.warn('⚠️ Failed to load draft prospects (non-critical):', e);
                        }
                    }

                    // 오프시즌 단계 복원
                    if (checkpoint.offseason_phase) {
                        setOffseasonPhase(checkpoint.offseason_phase);
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
                setLoadingProgress(100);
                setLoadingMessage('');
                await new Promise(r => setTimeout(r, 500));
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
                            const hasContract = p.contract && (p.contract.currentYear > 0 || p.contract.noTrade || p.contract.option || p.contract.type === 'extension');
                            const hasArchetypeState = !!p.archetypeState;
                            const hasPopularity = !!p.popularity;
                            const hasMorale = !!p.morale;
                            const hasAnyGrowthData = hasGrowth || hasChangeLog || hasAttrDeltas || hasSeasonStart;
                            const needsGrowthBackup = snapshotBuildFailed && hasAnyGrowthData;
                            const needsExtraBackup = snapshotBuildFailed && (hasInjuryHistory || hasAwards);

                            if (isInjured || isFatigued || needsGrowthBackup || needsExtraBackup || hasContract || hasArchetypeState || hasPopularity || hasMorale) {
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
                                if (hasContract) {
                                    state.contract = p.contract;
                                    state.age = p.age;
                                }
                                if (hasArchetypeState) state.archetypeState = p.archetypeState;
                                if (hasPopularity) state.popularity = p.popularity;
                                if (hasMorale) state.morale = p.morale;
                                rosterState[p.id] = state;
                            }
                        });
                    });
                }

                if (ov?.draftPicks) {
                    draftPicksRef.current = ov.draftPicks;
                    setDraftPicksState(ov.draftPicks);
                }
                const seed = ov?.tendencySeed || gameStateRef.current.tendencySeed;

                if (teamId && date) {
                    const _saveStart = performance.now();
                    const currentSimSettings = ov?.simSettings || gameStateRef.current.simSettings;
                    const coaching = ov?.coachingData || gameStateRef.current.coachingData;
                    const finances = getBudgetManager().toSaveData();
                    // 데드캡 정보를 finances에 포함 (별도 컬럼 없이 team_finances 활용)
                    currentTeams?.forEach((t: Team) => {
                        if (t.deadMoney && t.deadMoney.length > 0) {
                            if (!finances[t.id]) {
                                (finances as any)[t.id] = { revenue: { gate: 0, broadcasting: 0, localMedia: 0, sponsorship: 0, merchandise: 0, other: 0 }, expenses: { payroll: 0, luxuryTax: 0, operations: 0, coachSalary: 0, scouting: 0, marketing: 0, administration: 0 }, budget: 0, gamesPlayed: 0 };
                            }
                            (finances as any)[t.id].deadMoney = t.deadMoney;
                        }
                    });
                    const pickAssets = ov?.leaguePickAssets || gameStateRef.current.leaguePickAssets;
                    const tradeBlocks = ov?.leagueTradeBlocks || gameStateRef.current.leagueTradeBlocks;
                    const tradeOffers = ov?.leagueTradeOffers || gameStateRef.current.leagueTradeOffers;
                    const gmProfiles = ov?.leagueGMProfiles || gameStateRef.current.leagueGMProfiles;
                    const savSeasonNum = ov?.seasonNumber || gameStateRef.current.seasonNumber;
                    const savCurrentSeason = ov?.currentSeason || gameStateRef.current.currentSeason;
                    const savLotteryResult = ov?.lotteryResult !== undefined ? ov.lotteryResult : gameStateRef.current.lotteryResult;
                    const savOffseasonPhase = ov?.offseasonPhase !== undefined ? ov.offseasonPhase : (gameStateRef.current as any).offseasonPhase;
                    const savFAPool = ov?.leagueFAPool !== undefined ? ov.leagueFAPool : gameStateRef.current.leagueFAPool;
                    const savRetiredIds = ov?.retiredPlayerIds !== undefined ? ov.retiredPlayerIds : gameStateRef.current.retiredPlayerIds;
                    const savFAMarket = ov?.leagueFAMarket !== undefined ? ov.leagueFAMarket : gameStateRef.current.leagueFAMarket;
                    const savCapHistory = ov?.leagueCapHistory !== undefined ? ov.leagueCapHistory : gameStateRef.current.leagueCapHistory;
                    const result = await saveCheckpoint(session.user.id, teamId, date, tactics, rosterState, dc, draftPicksRef.current, seed, snapshot, currentSimSettings, coaching, finances, pickAssets, tradeBlocks, tradeOffers, gmProfiles, savSeasonNum, savCurrentSeason, savLotteryResult, savOffseasonPhase, savFAPool, savRetiredIds, savFAMarket, savCapHistory);
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

        // 초기 FA 풀 생성 및 DB 저장 (forceSave 전에 수행해야 leagueFAPool이 함께 저장됨)
        let initialFAPool: LeagueFAPool | null = null;
        if (session?.user?.id) {
            try {
                const faRows = generateInitialFAPool(session.user.id, newSeed);
                await insertDraftClass(faRows);
                initialFAPool = { generatedIds: faRows.map(p => p.id) };
                setLeagueFAPool(initialFAPool);
                const faPlayerObjects = faRows.map(row => mapRawPlayerToRuntimePlayer({
                    id: row.id,
                    base_attributes: row.base_attributes,
                }));
                setGeneratedFreeAgents(faPlayerObjects);
                console.log(`🏀 [initFA] Generated ${faRows.length} initial FA players`);
            } catch (e) {
                console.warn('⚠️ [initFA] Failed to generate initial FA pool (non-critical):', e);
            }
        }

        await forceSave({
            myTeamId: teamId,
            currentSimDate: INITIAL_DATE,
            userTactics: newTactics,
            tendencySeed: newSeed,
            coachingData: newCoachingData,
            leaguePickAssets: newPickAssets,
            teams,
            ...(initialFAPool ? { leagueFAPool: initialFAPool } : {}),
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
            const deleteResults = await Promise.all([
                supabase.from('saves').delete().eq('user_id', userId),
                supabase.from('user_game_results').delete().eq('user_id', userId),
                supabase.from('user_transactions').delete().eq('user_id', userId),
                supabase.from('user_playoffs').delete().eq('user_id', userId),
                supabase.from('user_playoffs_results').delete().eq('user_id', userId),
                supabase.from('user_season_history').delete().eq('user_id', userId),
                supabase.from('user_messages').delete().eq('user_id', userId),
                supabase.from('user_tactics').delete().eq('user_id', userId),
                supabase.from('user_generated_players').delete().eq('user_id', userId)
            ]);
            const deleteErrors = deleteResults.filter(r => r.error).map(r => r.error!.message);
            if (deleteErrors.length > 0) {
                console.error('❌ [handleResetData] Partial failure:', deleteErrors);
            }
            
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
            setDraftPicksState(null);
            setLotteryResult(null);
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
            setCurrentSeason(DEFAULT_SEASON_CONFIG.seasonLabel);
            setOffseasonPhase(null);
            setLeagueFAMarket(null);
            setLeagueFAPool(null);
            setGeneratedFreeAgents([]);
            setRetiredPlayerIds([]);
            setProspects([]);
            setLeagueCapHistory({});
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
        setDraftPicksState(draftData);

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

    // ── 루키 드래프트 완료 핸들러 ──
    const handleRookieDraftComplete = useCallback(async (picks: BoardPick[]) => {
        // 1. DB 업데이트: 각 픽의 선수를 drafted로 마킹
        const markPromises = picks.map(pick =>
            markAsDrafted(pick.playerId, pick.pickNumber ?? 0, pick.teamId)
        );
        await Promise.all(markPromises);

        // 2. 런타임 로스터에 루키 추가 (픽 순번 기반 계약 재적용)
        const prospectMap = new Map<string, Player>();
        prospects.forEach(p => prospectMap.set(p.id, p));

        const newTeams = teams.map(team => {
            const teamPicks = picks.filter(p => p.teamId === team.id);
            if (teamPicks.length === 0) return team;
            const rookies = teamPicks.map(pick => {
                const player = prospectMap.get(pick.playerId);
                if (!player) return null;
                // 실제 픽 순번에 맞는 루키 계약 적용
                const contract = calcRookieContract(pick.pickNumber ?? 30);
                return {
                    ...player,
                    contract,
                    salary: contract.years[0],
                    contractYears: contract.years.length,
                };
            }).filter(Boolean) as Player[];
            return { ...team, roster: [...team.roster, ...rookies] };
        });
        setTeams(newTeams);

        // 3. 미드래프트 선수(undrafted)를 FA 풀로 이동
        const draftedIds = new Set(picks.map(p => p.playerId));
        const undrafted = prospects.filter(p => !draftedIds.has(p.id));
        if (undrafted.length > 0) {
            setGeneratedFreeAgents(prev => [...prev, ...undrafted]);
            const newPool: LeagueFAPool = {
                generatedIds: [...(leagueFAPool?.generatedIds || []), ...undrafted.map(p => p.id)],
            };
            setLeagueFAPool(newPool);
        }

        // 4. prospects 초기화 + offseasonPhase 진행
        setProspects([]);
        setOffseasonPhase('POST_DRAFT');

        // 5. 드래프트 결과 메세지 발송
        const userId = session?.user?.id;
        if (userId && myTeamId) {
            const draftYear = new Date().getFullYear();
            const myPickCount = picks.filter(p => p.teamId === myTeamId).length;
            const entries: DraftResultEntry[] = picks.map(pick => {
                const player = prospectMap.get(pick.playerId);
                const rookieContract = calcRookieContract(pick.pickNumber ?? 30);
                return {
                    pickNumber: pick.pickNumber ?? 0,
                    teamId: pick.teamId,
                    teamName: TEAM_DATA[pick.teamId]?.name || pick.teamId.toUpperCase(),
                    playerId: pick.playerId,
                    playerName: pick.playerName,
                    position: pick.position,
                    age: player?.age ?? 0,
                    height: player?.height ?? 0,
                    weight: player?.weight ?? 0,
                    ovr: player?.ovr ?? 0,
                    potential: player?.potential ?? 0,
                    ins: player?.ins ?? 0,
                    out: player?.out ?? 0,
                    plm: player?.plm ?? 0,
                    def: player?.def ?? 0,
                    reb: player?.reb ?? 0,
                    ath: player?.ath ?? 0,
                    salary: rookieContract.years[0],
                    isUserPick: pick.teamId === myTeamId,
                };
            });
            const draftContent: DraftResultContent = { draftYear, myTeamId, myPickCount, entries };
            sendMessage(userId, myTeamId, gameStateRef.current.currentSimDate, 'DRAFT_RESULT', `[서신] ${draftYear} 신인 드래프트 결과 보고`, draftContent);
        }

        // 6. 저장
        await forceSave({
            teams: newTeams,
            withSnapshot: true,
        });

        console.log(`🎓 Rookie draft complete: ${picks.length} picks, ${undrafted.length} undrafted → FA`);
    }, [teams, prospects, leagueFAPool, forceSave, session, myTeamId]);

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
         setLeagueCapHistory({});
         setSeasonNumber(1);
         setCurrentSeason(DEFAULT_SEASON_CONFIG.seasonLabel);
         setOffseasonPhase(null);
         setNews([]);
         setLotteryResult(null);
         draftPicksRef.current = null;
         setDraftPicksState(null);
         isInitialTacticsLoad.current = true;
         isInitialSimSettingsLoad.current = true;
         hasInitialLoadRef.current = false;
         queryClient.removeQueries({ predicate: q => q.queryKey[0] !== 'baseData' });
         Object.keys(localStorage).forEach((key) => {
             if (key.startsWith('trade_ops_')) localStorage.removeItem(key);
         });
    };

    // FA 시장 선수 맵 (playerId → Player) — leagueFAMarket.players 기반
    const faPlayerMap = useMemo<Record<string, Player>>(() => {
        if (!leagueFAMarket?.players) return {};
        return Object.fromEntries(leagueFAMarket.players.map(p => [p.id, p]));
    }, [leagueFAMarket]);

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
        offseasonPhase, setOffseasonPhase,
        seasonConfig,
        news, setNews,
        
        isBaseDataLoading,
        isBaseDataError,
        isSaveLoading,
        loadingProgress,
        loadingMessage,
        isSaving,
        
        handleSelectTeam,
        handleResetData,
        handleDraftComplete,
        handleRookieDraftComplete,
        saveDraftOrder,
        forceSave,
        cleanupData,
        
        freeAgents: effectiveFreeAgents,
        draftPicks: draftPicksState,
        lotteryResult, setLotteryResult,
        resolvedDraftOrder, setResolvedDraftOrder,
        leagueFAPool, setLeagueFAPool,
        generatedFreeAgents, setGeneratedFreeAgents,
        retiredPlayerIds, setRetiredPlayerIds,
        leagueFAMarket, setLeagueFAMarket,
        leagueCapHistory, setLeagueCapHistory,
        faPlayerMap,

        hasInitialLoadRef,
        isResetting: isResettingRef.current
    };
};
