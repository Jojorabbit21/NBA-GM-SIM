
import { useCurrentLeague } from './useCurrentLeague';
import type { LeagueRow } from '../services/multi/roomQueries';

// ─── LeagueContext 차별 유니온 ────────────────────────────────────────────────
// 컴파일 타임에 모드 분기를 강제한다.
// 싱글 코드는 이 훅을 호출하지 않는다.

export interface MainLeagueOptions {
    capEnabled:           boolean;
    financeEnabled:       boolean;
    tradeEnabled:         boolean;
    faEnabled:            boolean;
    rookieDraftEnabled:   boolean;
    coachingEnabled:      boolean;
    trainingEnabled:      boolean;
    startDraftEnabled:    boolean;
    draftPool:            string;
    draftFormat:          string;
    draftPoolStrategy:    string;
    draftPickDurationSec: number;
    rookiePoolInclusion:  boolean;
    seasonStartDate:      string;
    realTimePace:         string;
}

export interface TournamentOptions extends MainLeagueOptions {
    tournamentFormat: 'single_elim' | 'double_elim' | 'round_robin';
    matchFormat:      'best_of_1'   | 'best_of_3'   | 'best_of_7';
    bracketData:      unknown | null;
}

export type LeagueContext =
    | {
        mode:     'main_league';
        leagueId: string;
        tier:     'pro' | 'dleague' | 'uleague';
        groupId:  string;
        options:  MainLeagueOptions;
        season:   number;
        status:   LeagueRow['status'];
        isLoading: boolean;
      }
    | {
        mode:     'tournament';
        leagueId: string;
        options:  TournamentOptions;
        status:   LeagueRow['status'];
        isLoading: boolean;
      }
    | {
        mode:      'loading';
        isLoading: true;
      }
    | {
        mode:      'error';
        error:     string;
        isLoading: false;
      };

/**
 * /multi/leagues/:leagueId/* 라우트 내부에서 사용.
 * 현재 리그의 모드(메인리그/토너먼트)와 옵션 토글을 타입-안전하게 반환한다.
 *
 * 싱글 코드는 절대 호출하지 말 것.
 */
export function useLeagueConfig(): LeagueContext {
    const { league, isLoading, error } = useCurrentLeague();

    if (isLoading) return { mode: 'loading', isLoading: true };
    if (error || !league) return { mode: 'error', error: error ?? 'league not found', isLoading: false };

    const options = extractOptions(league);

    if (league.type === 'main_league') {
        return {
            mode:      'main_league',
            leagueId:  league.id,
            tier:      league.tier as 'pro' | 'dleague' | 'uleague',
            groupId:   league.group_id!,
            options,
            season:    league.season_number,
            status:    league.status,
            isLoading: false,
        };
    }

    // tournament
    return {
        mode:      'tournament',
        leagueId:  league.id,
        options:   {
            ...options,
            tournamentFormat: league.tournament_format as TournamentOptions['tournamentFormat'],
            matchFormat:      league.match_format      as TournamentOptions['matchFormat'],
            bracketData:      league.bracket_data,
        },
        status:    league.status,
        isLoading: false,
    };
}

// ─── 런타임 가드 헬퍼 ────────────────────────────────────────────────────────

export function assertMainLeague(
    ctx: LeagueContext
): asserts ctx is Extract<LeagueContext, { mode: 'main_league' }> {
    if (ctx.mode !== 'main_league') {
        throw new Error(`main_league context required, got "${ctx.mode}"`);
    }
}

export function assertTournament(
    ctx: LeagueContext
): asserts ctx is Extract<LeagueContext, { mode: 'tournament' }> {
    if (ctx.mode !== 'tournament') {
        throw new Error(`tournament context required, got "${ctx.mode}"`);
    }
}

// ─── 내부 헬퍼 ───────────────────────────────────────────────────────────────

function extractOptions(league: LeagueRow): MainLeagueOptions {
    return {
        capEnabled:           league.cap_enabled,
        financeEnabled:       league.finance_enabled,
        tradeEnabled:         league.trade_enabled,
        faEnabled:            league.fa_enabled,
        rookieDraftEnabled:   league.rookie_draft_enabled,
        coachingEnabled:      league.coaching_enabled,
        trainingEnabled:      league.training_enabled,
        startDraftEnabled:    league.start_draft_enabled,
        draftPool:            league.draft_pool,
        draftFormat:          league.draft_format,
        draftPoolStrategy:    league.draft_pool_strategy,
        draftPickDurationSec: league.draft_pick_duration_sec,
        rookiePoolInclusion:  league.rookie_pool_inclusion,
        seasonStartDate:      league.season_start_date,
        realTimePace:         league.real_time_pace,
    };
}
