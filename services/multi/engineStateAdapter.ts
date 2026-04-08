
/**
 * engineStateAdapter.ts
 *
 * Room + RoomMember 데이터를 엔진이 소비하는 in-memory shape(EngineGameState)로 변환한다.
 * 싱글플레이어에서 useGameData 훅이 만들어주는 객체와 동형(同形)이어야 한다.
 *
 * 원칙:
 *   - DB 접근은 roomPersistence / roomQueries에 위임. 이 파일은 변환만 담당.
 *   - 엔진 함수(runPbp, executeTradeProposal, processOffseason …)는 이 타입만 받는다.
 *   - 싱글 어댑터(useGameData)와 동형 단위 테스트로 정합성을 검증한다.
 */

import type { Team, Game, PlayoffSeries, Transaction, GameTactics, DepthChart, SavedPlayerState, ReplaySnapshot } from '../../types';
import type { SimSettings } from '../../types/simSettings';
import type { OffseasonPhase } from '../../types/app';
import type { LeaguePickAssets } from '../../types/draftAssets';
import type { LeagueTradeBlocks, LeagueTradeOffers } from '../../types/trade';
import type { LeagueGMProfiles } from '../../types/gm';
import type { LeagueFAPool } from '../../types/generatedPlayer';
import type { LeagueFAMarket } from '../../types/fa';
import type { SavedTeamFinances } from '../../types/finance';
import type { LeagueTrainingConfigs } from '../../types/training';
import type { CoachFAPool, LeagueCoachingData } from '../../types/coaching';
import type { LotteryResult } from '../draft/lotteryEngine';
import { buildSeasonConfig } from '../../utils/seasonConfig';
import { loadRoom } from './roomPersistence';
import { loadRoomMember } from './roomQueries';

// ─── EngineGameState 인터페이스 ──────────────────────────────────────────────
// useGameData 훅이 반환하는 state와 동형이어야 한다.
// 추가 필드가 생기면 양쪽에 동시에 추가할 것.

export interface EngineGameState {
    // 기본 식별
    myTeamId:            string | null;
    roomId:              string;         // 멀티 전용 (싱글은 N/A)

    // 팀/선수
    teams:               Team[];
    rosterState:         Record<string, SavedPlayerState | number>;

    // 일정/게임
    schedule:            Game[];
    playoffSeries:       PlayoffSeries[];
    transactions:        Transaction[];

    // 날짜/시즌
    currentSimDate:      string;
    seasonNumber:        number;
    currentSeason:       string;
    offseasonPhase:      OffseasonPhase;
    seasonConfig:        ReturnType<typeof buildSeasonConfig>;

    // 전술 (현재 멤버 기준)
    userTactics:         GameTactics | null;
    depthChart:          DepthChart | null;
    tendencySeed:        string | null;

    // 시뮬 설정
    simSettings:         SimSettings | null;
    replaySnapshot:      ReplaySnapshot | null;

    // 재정/FA/트레이드
    teamFinances:        SavedTeamFinances | null;
    leaguePickAssets:    LeaguePickAssets | null;
    leagueTradeBlocks:   LeagueTradeBlocks;
    leagueTradeOffers:   LeagueTradeOffers;
    leagueGMProfiles:    LeagueGMProfiles;
    leagueFAPool:        LeagueFAPool | null;
    leagueFAMarket:      LeagueFAMarket | null;
    leagueCapHistory:    Record<number, number>;

    // 코칭/훈련
    coachingData:        LeagueCoachingData | null;
    leagueTrainingConfigs: LeagueTrainingConfigs | null;
    coachFAPool:         CoachFAPool | null;

    // 드래프트/은퇴
    lotteryResult:       LotteryResult | null;
    retiredPlayerIds:    string[];
    draftState:          unknown | null;
}

// ─── 어댑터 메인 함수 ─────────────────────────────────────────────────────────

/**
 * Room + 현재 유저의 RoomMember 데이터를 EngineGameState로 변환한다.
 * 엔진 함수 호출 직전에 호출할 것 (세이브 주기와 무관하게 최신 DB 상태를 가져온다).
 */
export async function loadEngineState(
    roomId: string,
    userId: string
): Promise<EngineGameState | null> {
    const [room, member] = await Promise.all([
        loadRoom(roomId),
        loadRoomMember(roomId, userId),
    ]);

    if (!room) return null;

    const seasonNumber = room.season_number ?? 1;
    const seasonConfig = buildSeasonConfig(seasonNumber);

    return {
        myTeamId:      member?.team_id ?? null,
        roomId,

        // teams: M2에서 meta_teams + roster_state로 재구성. 지금은 빈 배열.
        teams:           [] as Team[],
        rosterState:     parseJSON(room.roster_state, {}) as Record<string, SavedPlayerState | number>,

        schedule:        parseJSON(room.schedule, []) as Game[],
        playoffSeries:   [],
        transactions:    [],

        currentSimDate:  room.sim_date,
        seasonNumber,
        currentSeason:   room.season,
        offseasonPhase:  room.offseason_phase ?? null,
        seasonConfig,

        userTactics:     parseJSON(member?.tactics, null) as GameTactics | null,
        depthChart:      parseJSON(member?.depth_chart, null) as DepthChart | null,
        tendencySeed:    room.tendency_seed ?? null,

        simSettings:     parseJSON(room.sim_settings, null) as SimSettings | null,
        replaySnapshot:  parseJSON(room.replay_snapshot, null) as ReplaySnapshot | null,

        teamFinances:        parseJSON(room.team_finances, null) as SavedTeamFinances | null,
        leaguePickAssets:    parseJSON(room.league_pick_assets, null) as LeaguePickAssets | null,
        leagueTradeBlocks:   parseJSON(room.league_trade_blocks, {}) as LeagueTradeBlocks,
        leagueTradeOffers:   parseJSON(room.league_trade_offers, { offers: [] }) as LeagueTradeOffers,
        leagueGMProfiles:    parseJSON(room.league_gm_profiles, {}) as LeagueGMProfiles,
        leagueFAPool:        parseJSON(room.league_fa_pool, null) as LeagueFAPool | null,
        leagueFAMarket:      parseJSON(room.league_fa_market, null) as LeagueFAMarket | null,
        leagueCapHistory:    parseJSON(room.league_cap_history, {}) as Record<number, number>,

        coachingData:          parseJSON(room.coaching_staff, null) as LeagueCoachingData | null,
        leagueTrainingConfigs: parseJSON(room.league_training_configs, null) as LeagueTrainingConfigs | null,
        coachFAPool:           parseJSON(room.coach_fa_pool, null) as CoachFAPool | null,

        lotteryResult:    parseJSON(room.lottery_result, null) as LotteryResult | null,
        retiredPlayerIds: parseJSON(room.retired_player_ids, []) as string[],
        draftState:       room.draft_state ?? null,
    };
}

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

/**
 * DB에서 온 값이 이미 파싱된 객체인 경우 그대로 반환,
 * 문자열인 경우 JSON.parse, null/undefined인 경우 fallback 반환.
 * Supabase JSONB 컬럼은 클라이언트에서 이미 파싱된 객체로 도착하지만
 * 방어적으로 처리한다.
 */
function parseJSON<T>(value: unknown, fallback: T): T {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') {
        try { return JSON.parse(value) as T; } catch { return fallback; }
    }
    return value as T;
}

// ─── 역방향 어댑터: EngineGameState → RoomSavePayload ───────────────────────
// 엔진 실행 결과를 DB에 다시 저장할 때 사용한다.

export function engineStateToRoomPayload(state: EngineGameState) {
    return {
        simDate:               state.currentSimDate,
        offseasonPhase:        state.offseasonPhase,
        season:                state.currentSeason,
        seasonNumber:          state.seasonNumber,
        rosterState:           state.rosterState,
        draftState:            state.draftState,
        tendencySeed:          state.tendencySeed,
        replaySnapshot:        state.replaySnapshot,
        simSettings:           state.simSettings,
        teamFinances:          state.teamFinances,
        leaguePickAssets:      state.leaguePickAssets,
        leagueTradeBlocks:     state.leagueTradeBlocks,
        leagueTradeOffers:     state.leagueTradeOffers,
        leagueGMProfiles:      state.leagueGMProfiles,
        leagueFAPool:          state.leagueFAPool,
        leagueFAMarket:        state.leagueFAMarket,
        leagueCapHistory:      state.leagueCapHistory,
        leagueTrainingConfigs: state.leagueTrainingConfigs,
        coachFAPool:           state.coachFAPool,
        retiredPlayerIds:      state.retiredPlayerIds,
        lotteryResult:         state.lotteryResult,
        schedule:              state.schedule,
    };
}
