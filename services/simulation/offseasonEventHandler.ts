/**
 * 오프시즌 이벤트 디스패처
 *
 * Key Dates에 도달하면 해당 오프시즌 이벤트를 실행.
 * 순수 서비스 — React 의존 없음. 호출자(useSimulation)가 UI 전환 처리.
 */

import { Team, Game, PlayoffSeries } from '../../types';
import { SeasonKeyDates, SeasonConfig } from '../../utils/seasonConfig';
import { OffseasonPhase } from '../../types/app';
import { AppView } from '../../types/app';
import { runLotteryEngine, LotteryResult } from '../draft/lotteryEngine';
import { buildSeasonConfig } from '../../utils/seasonConfig';
import { generateSeasonSchedule, ScheduleConfig } from '../../utils/scheduleGenerator';
import { INITIAL_STATS } from '../../utils/constants';

// ── 결과 타입 ──

export interface OffseasonEventResult {
    /** 이벤트가 발생했는지 */
    fired: boolean;
    /** true면 날짜 진행을 중단하고 뷰 전환 필요 */
    blocked: boolean;
    /** blocked일 때 이동할 뷰 */
    navigateTo?: AppView;
    /** 상태 업데이트 */
    updates?: {
        offseasonPhase?: OffseasonPhase;
        lotteryResult?: LotteryResult;
        newSchedule?: Game[];
        newSeasonNumber?: number;
        newSeasonConfig?: SeasonConfig;
        teamsReset?: boolean;  // W/L + 스탯 리셋 수행됨
    };
}

const NO_EVENT: OffseasonEventResult = { fired: false, blocked: false };

// ── 파이널 종료 감지 ──

/**
 * 파이널(round 4) 종료 여부 확인 → POST_FINALS 전환.
 * 기존 checkAndStartNextSeason의 감지 부분만 분리.
 */
export function detectFinalsEnd(
    playoffSeries: PlayoffSeries[],
    offseasonPhase: OffseasonPhase,
): OffseasonEventResult {
    if (offseasonPhase !== null) return NO_EVENT; // 이미 오프시즌 진행 중

    const finalsFinished = playoffSeries.some(s => s.round === 4 && s.finished);
    if (!finalsFinished) return NO_EVENT;

    console.log('🏆 Finals ended — entering offseason');
    return {
        fired: true,
        blocked: false,
        updates: { offseasonPhase: 'POST_FINALS' },
    };
}

// ── Key Date 이벤트 디스패처 ──

export interface DispatchParams {
    currentDate: string;
    keyDates: SeasonKeyDates;
    offseasonPhase: OffseasonPhase;
    teams: Team[];
    schedule: Game[];
    playoffSeries: PlayoffSeries[];
    currentSeasonNumber: number;
}

/**
 * 현재 날짜가 오프시즌 Key Date에 해당하면 이벤트 실행.
 * 각 이벤트는 offseasonPhase로 멱등성 보장.
 */
export function dispatchOffseasonEvent(params: DispatchParams): OffseasonEventResult {
    const { currentDate, keyDates, offseasonPhase, teams, schedule, playoffSeries, currentSeasonNumber } = params;

    // Phase가 null이면 인시즌 — 오프시즌 이벤트 불필요
    if (offseasonPhase === null) return NO_EVENT;

    // ── draftLottery: 로터리 추첨 + DraftLotteryView 강제 이동 ──
    if (currentDate >= keyDates.draftLottery && offseasonPhase === 'POST_FINALS') {
        const lotteryResult = runLotteryEngine(teams, schedule, playoffSeries);
        console.log(`🎰 Lottery drawn: #1 pick → ${lotteryResult.finalOrder[0]}`);

        return {
            fired: true,
            blocked: true,
            navigateTo: 'DraftLottery',
            updates: {
                offseasonPhase: 'POST_LOTTERY',
                lotteryResult,
            },
        };
    }

    // ── rookieDraft: 신인 드래프트 강제 이동 (Phase 3에서 구현 예정) ──
    // if (currentDate >= keyDates.rookieDraft && offseasonPhase === 'POST_LOTTERY') {
    //     return { fired: true, blocked: true, navigateTo: 'DraftRoom', updates: { offseasonPhase: 'POST_DRAFT' } };
    // }

    // POST_LOTTERY 상태에서 rookieDraft 미구현 → 자동으로 POST_DRAFT로 전환
    if (currentDate >= keyDates.rookieDraft && offseasonPhase === 'POST_LOTTERY') {
        console.log('📝 Rookie draft date reached (not yet implemented) — skipping to POST_DRAFT');
        return {
            fired: true,
            blocked: false,
            updates: { offseasonPhase: 'POST_DRAFT' },
        };
    }

    // ── openingNight: 새 시즌 개막 ──
    if (currentDate >= keyDates.openingNight && (offseasonPhase === 'POST_DRAFT' || offseasonPhase === 'FA_OPEN' || offseasonPhase === 'PRE_SEASON')) {
        return handleOpeningNight(teams, currentSeasonNumber);
    }

    return NO_EVENT;
}

// ── openingNight 핸들러 ──

function handleOpeningNight(
    teams: Team[],
    currentSeasonNumber: number,
): OffseasonEventResult {
    const nextSeasonNumber = currentSeasonNumber + 1;
    const nextConfig = buildSeasonConfig(nextSeasonNumber);

    // 새 시즌 일정 생성
    const scheduleConfig: ScheduleConfig = {
        seasonYear: nextConfig.startYear,
        seasonStart: nextConfig.startDate,
        regularSeasonEnd: nextConfig.regularSeasonEnd,
        allStarStart: nextConfig.allStarStart,
        allStarEnd: nextConfig.allStarEnd,
    };
    const newSchedule = generateSeasonSchedule(scheduleConfig);

    // 팀 W/L 리셋
    for (const team of teams) {
        team.wins = 0;
        team.losses = 0;
    }

    // 선수 시즌 스탯 리셋
    for (const team of teams) {
        for (const player of team.roster) {
            player.stats = INITIAL_STATS();
            player.playoffStats = undefined;
        }
    }

    console.log(`🔄 Season transition: ${currentSeasonNumber} → ${nextSeasonNumber} (${nextConfig.seasonLabel})`);

    return {
        fired: true,
        blocked: false,
        updates: {
            offseasonPhase: null,
            newSchedule,
            newSeasonNumber: nextSeasonNumber,
            newSeasonConfig: nextConfig,
            teamsReset: true,
        },
    };
}
