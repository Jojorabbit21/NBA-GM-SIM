
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Team, Game, PlayoffSeries, Transaction, GameTactics, DepthChart } from '../types';
import type { SimSettings } from '../types/simSettings';
import type { OffseasonPhase } from '../types/app';
import type { LeaguePickAssets } from '../types/draftAssets';
import type { LeagueTradeBlocks, LeagueTradeOffers } from '../types/trade';
import type { LeagueGMProfiles } from '../types/gm';
import type { LeagueFAPool } from '../types/generatedPlayer';
import type { LeagueFAMarket } from '../types/fa';
import type { SavedTeamFinances } from '../types/finance';
import type { LeagueTrainingConfigs } from '../types/training';
import type { CoachFAPool, LeagueCoachingData } from '../types/coaching';
import type { LotteryResult } from '../services/draft/lotteryEngine';
import { loadRoom, saveRoom, saveMemberTactics } from '../services/multi/roomPersistence';
import { loadRoomMember } from '../services/multi/roomQueries';
import { DEFAULT_SIM_SETTINGS } from '../types/simSettings';
import { buildSeasonConfig } from '../utils/seasonConfig';
import type { SeasonConfig } from '../utils/seasonConfig';

// ─── 훅 반환 타입 ─────────────────────────────────────────────────────────────

export interface MultiGameDataReturn {
    // 로딩
    isLoading:     boolean;
    hasInitError:  boolean;
    loadingProgress: number;
    loadingMessage:  string;

    // 식별
    myTeamId:      string | null;
    roomId:        string | null;

    // 팀/일정
    teams:               Team[];
    setTeams:            (t: Team[]) => void;
    schedule:            Game[];
    setSchedule:         (g: Game[]) => void;
    playoffSeries:       PlayoffSeries[];
    setPlayoffSeries:    (s: PlayoffSeries[]) => void;
    transactions:        Transaction[];
    setTransactions:     (t: Transaction[]) => void;

    // 날짜/시즌
    currentSimDate:      string;
    setCurrentSimDate:   (d: string) => void;
    seasonNumber:        number;
    currentSeason:       string;
    offseasonPhase:      OffseasonPhase;
    setOffseasonPhase:   (p: OffseasonPhase) => void;
    seasonConfig:        SeasonConfig;

    // 전술
    userTactics:         GameTactics | null;
    setUserTactics:      (t: GameTactics | null) => void;
    depthChart:          DepthChart | null;
    setDepthChart:       (d: DepthChart | null) => void;
    tendencySeed:        string | null;

    // 설정
    simSettings:         SimSettings;
    setSimSettings:      (s: SimSettings) => void;

    // 재정
    teamFinances:        SavedTeamFinances | null;
    leaguePickAssets:    LeaguePickAssets | null;
    setLeaguePickAssets: (a: LeaguePickAssets | null) => void;
    leagueTradeBlocks:   LeagueTradeBlocks;
    setLeagueTradeBlocks:(b: LeagueTradeBlocks) => void;
    leagueTradeOffers:   LeagueTradeOffers;
    setLeagueTradeOffers:(o: LeagueTradeOffers) => void;
    leagueGMProfiles:    LeagueGMProfiles;
    leagueFAPool:        LeagueFAPool | null;
    leagueFAMarket:      LeagueFAMarket | null;
    setLeagueFAMarket:   (m: LeagueFAMarket | null) => void;
    leagueCapHistory:    Record<number, number>;

    // 코칭/훈련
    coachingData:        LeagueCoachingData | null;
    leagueTrainingConfigs: LeagueTrainingConfigs | null;
    coachFAPool:         CoachFAPool | null;

    // 드래프트/은퇴
    lotteryResult:       LotteryResult | null;
    setLotteryResult:    (r: LotteryResult | null) => void;
    retiredPlayerIds:    string[];
    setRetiredPlayerIds: (ids: string[]) => void;

    // 저장
    forceSave:           () => Promise<void>;
}

// ─── 훅 본체 ─────────────────────────────────────────────────────────────────

/**
 * 멀티플레이어 전용 게임 데이터 훅.
 * 싱글의 useGameData 패턴을 따르되, 데이터 소스가 rooms / room_members 테이블이다.
 *
 * @param session    Supabase 세션
 * @param roomId     참가 중인 방 ID
 */
export function useMultiGameData(
    session: Session | null,
    roomId:  string | null
): MultiGameDataReturn {

    const userId = session?.user?.id ?? null;

    // ── 로딩 상태 ───────────────────────────────────────────────────────────
    const [isLoading,       setIsLoading]       = useState(true);
    const [hasInitError,    setHasInitError]    = useState(false);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [loadingMessage,  setLoadingMessage]  = useState('게임 데이터를 불러오는 중…');

    // ── 팀/일정 ─────────────────────────────────────────────────────────────
    const [teams,            setTeams]            = useState<Team[]>([]);
    const [schedule,         setSchedule]         = useState<Game[]>([]);
    const [playoffSeries,    setPlayoffSeries]    = useState<PlayoffSeries[]>([]);
    const [transactions,     setTransactions]     = useState<Transaction[]>([]);

    // ── 날짜/시즌 ───────────────────────────────────────────────────────────
    const [currentSimDate,   setCurrentSimDate]   = useState('2025-10-20');
    const [seasonNumber,     setSeasonNumber]     = useState(1);
    const [currentSeason,    setCurrentSeason]    = useState('2025-2026');
    const [offseasonPhase,   setOffseasonPhase]   = useState<OffseasonPhase>(null);

    // ── 전술 ────────────────────────────────────────────────────────────────
    const [userTactics,      setUserTactics]      = useState<GameTactics | null>(null);
    const [depthChart,       setDepthChart]       = useState<DepthChart | null>(null);
    const [tendencySeed,     setTendencySeed]     = useState<string | null>(null);

    // ── 식별 ────────────────────────────────────────────────────────────────
    const [myTeamId,         setMyTeamId]         = useState<string | null>(null);

    // ── 설정 ────────────────────────────────────────────────────────────────
    const [simSettings,      setSimSettings]      = useState<SimSettings>(DEFAULT_SIM_SETTINGS);

    // ── 재정/FA/트레이드 ────────────────────────────────────────────────────
    const [teamFinances,         setTeamFinances]         = useState<SavedTeamFinances | null>(null);
    const [leaguePickAssets,     setLeaguePickAssets]     = useState<LeaguePickAssets | null>(null);
    const [leagueTradeBlocks,    setLeagueTradeBlocks]    = useState<LeagueTradeBlocks>({});
    const [leagueTradeOffers,    setLeagueTradeOffers]    = useState<LeagueTradeOffers>({ offers: [] });
    const [leagueGMProfiles,     setLeagueGMProfiles]     = useState<LeagueGMProfiles>({});
    const [leagueFAPool,         setLeagueFAPool]         = useState<LeagueFAPool | null>(null);
    const [leagueFAMarket,       setLeagueFAMarket]       = useState<LeagueFAMarket | null>(null);
    const [leagueCapHistory,     setLeagueCapHistory]     = useState<Record<number, number>>({});

    // ── 코칭/훈련 ───────────────────────────────────────────────────────────
    const [coachingData,           setCoachingData]           = useState<LeagueCoachingData | null>(null);
    const [leagueTrainingConfigs,  setLeagueTrainingConfigs]  = useState<LeagueTrainingConfigs | null>(null);
    const [coachFAPool,            setCoachFAPool]            = useState<CoachFAPool | null>(null);

    // ── 드래프트/은퇴 ───────────────────────────────────────────────────────
    const [lotteryResult,    setLotteryResult]    = useState<LotteryResult | null>(null);
    const [retiredPlayerIds, setRetiredPlayerIds] = useState<string[]>([]);

    // stale closure 방지: forceSave가 항상 최신 상태를 읽도록 렌더마다 갱신
    const stateRef = useRef({
        roomId, userId, simSettings, userTactics, depthChart,
        currentSimDate, offseasonPhase, seasonNumber, currentSeason,
        tendencySeed, teamFinances, leaguePickAssets, leagueTradeBlocks,
        leagueTradeOffers, leagueGMProfiles, leagueFAPool, leagueFAMarket,
        leagueCapHistory, coachingData, leagueTrainingConfigs, coachFAPool,
        lotteryResult, retiredPlayerIds, schedule, teams,
    });
    stateRef.current = {
        roomId, userId, simSettings, userTactics, depthChart,
        currentSimDate, offseasonPhase, seasonNumber, currentSeason,
        tendencySeed, teamFinances, leaguePickAssets, leagueTradeBlocks,
        leagueTradeOffers, leagueGMProfiles, leagueFAPool, leagueFAMarket,
        leagueCapHistory, coachingData, leagueTrainingConfigs, coachFAPool,
        lotteryResult, retiredPlayerIds, schedule, teams,
    };

    // ── 초기 로드 ───────────────────────────────────────────────────────────
    useEffect(() => {
        if (!roomId || !userId) { setIsLoading(false); return; }
        let cancelled = false;

        const init = async () => {
            setIsLoading(true);
            setHasInitError(false);
            setLoadingProgress(10);
            setLoadingMessage('방 데이터 로드 중…');

            try {
                const [room, member] = await Promise.all([
                    loadRoom(roomId),
                    loadRoomMember(roomId, userId),
                ]);

                if (cancelled) return;

                if (!room) { setHasInitError(true); setIsLoading(false); return; }

                setLoadingProgress(50);
                setLoadingMessage('게임 상태 복원 중…');

                // 방 공유 상태
                setCurrentSimDate(room.sim_date);
                setOffseasonPhase((room.offseason_phase as OffseasonPhase) ?? null);
                setSeasonNumber(room.season_number);
                setCurrentSeason(room.season);
                setTendencySeed(room.tendency_seed ?? null);

                if (room.sim_settings)          setSimSettings(room.sim_settings as SimSettings);
                if (room.team_finances)         setTeamFinances(room.team_finances as SavedTeamFinances);
                if (room.league_pick_assets)    setLeaguePickAssets(room.league_pick_assets as LeaguePickAssets);
                if (room.league_trade_blocks)   setLeagueTradeBlocks(room.league_trade_blocks as LeagueTradeBlocks);
                if (room.league_trade_offers)   setLeagueTradeOffers(room.league_trade_offers as LeagueTradeOffers);
                if (room.league_gm_profiles)    setLeagueGMProfiles(room.league_gm_profiles as LeagueGMProfiles);
                if (room.league_fa_pool)        setLeagueFAPool(room.league_fa_pool as LeagueFAPool);
                if (room.league_fa_market)      setLeagueFAMarket(room.league_fa_market as LeagueFAMarket);
                if (room.league_cap_history)    setLeagueCapHistory(room.league_cap_history as Record<number, number>);
                if (room.coaching_staff)        setCoachingData(room.coaching_staff as LeagueCoachingData);
                if (room.league_training_configs) setLeagueTrainingConfigs(room.league_training_configs as LeagueTrainingConfigs);
                if (room.coach_fa_pool)         setCoachFAPool(room.coach_fa_pool as CoachFAPool);
                if (room.lottery_result)        setLotteryResult(room.lottery_result as LotteryResult);
                if (room.retired_player_ids)    setRetiredPlayerIds(room.retired_player_ids as string[]);
                if (room.roster_state)          { /* teams 파싱은 별도 처리 필요 */ }
                if (room.schedule)              setSchedule(room.schedule as Game[]);

                // 멤버 전술 (개인)
                if (member) {
                    setMyTeamId(member.team_id ?? null);
                    if (member.tactics)     setUserTactics(member.tactics as GameTactics);
                    if (member.depth_chart) setDepthChart(member.depth_chart as DepthChart);
                }

                setLoadingProgress(100);
                setLoadingMessage('완료');
                setIsLoading(false);

            } catch (err) {
                if (!cancelled) {
                    console.error('[useMultiGameData] init error:', err);
                    setHasInitError(true);
                    setIsLoading(false);
                }
            }
        };

        init();
        return () => { cancelled = true; };
    }, [roomId, userId]);

    // ── forceSave ────────────────────────────────────────────────────────────
    const forceSave = useCallback(async () => {
        const s = stateRef.current;
        if (!s.roomId || !s.userId) return;

        await Promise.all([
            // 방 공유 상태
            saveRoom(s.roomId, {
                simDate:               s.currentSimDate,
                offseasonPhase:        s.offseasonPhase,
                season:                s.currentSeason,
                seasonNumber:          s.seasonNumber,
                tendencySeed:          s.tendencySeed,
                simSettings:           s.simSettings,
                teamFinances:          s.teamFinances,
                leaguePickAssets:      s.leaguePickAssets,
                leagueCapHistory:      s.leagueCapHistory,
                leagueTradeBlocks:     s.leagueTradeBlocks,
                leagueTradeOffers:     s.leagueTradeOffers,
                leagueGMProfiles:      s.leagueGMProfiles,
                leagueFAPool:          s.leagueFAPool,
                leagueFAMarket:        s.leagueFAMarket,
                leagueTrainingConfigs: s.leagueTrainingConfigs,
                coachFAPool:           s.coachFAPool,
                retiredPlayerIds:      s.retiredPlayerIds,
                lotteryResult:         s.lotteryResult,
                schedule:              s.schedule,
            }),
            // 멤버 개인 전술
            saveMemberTactics(s.roomId, s.userId, s.userTactics, s.depthChart),
        ]);
    }, []);

    const seasonConfig = buildSeasonConfig(seasonNumber);

    return {
        isLoading, hasInitError, loadingProgress, loadingMessage,
        myTeamId, roomId,
        teams, setTeams,
        schedule, setSchedule,
        playoffSeries, setPlayoffSeries,
        transactions, setTransactions,
        currentSimDate, setCurrentSimDate,
        seasonNumber, currentSeason, offseasonPhase, setOffseasonPhase,
        seasonConfig,
        userTactics, setUserTactics,
        depthChart, setDepthChart,
        tendencySeed,
        simSettings, setSimSettings,
        teamFinances,
        leaguePickAssets, setLeaguePickAssets,
        leagueTradeBlocks, setLeagueTradeBlocks,
        leagueTradeOffers, setLeagueTradeOffers,
        leagueGMProfiles,
        leagueFAPool, leagueFAMarket, setLeagueFAMarket,
        leagueCapHistory,
        coachingData,
        leagueTrainingConfigs,
        coachFAPool,
        lotteryResult, setLotteryResult,
        retiredPlayerIds, setRetiredPlayerIds,
        forceSave,
    };
}
