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
import { generateDraftClass } from '../draft/rookieGenerator';
import { GeneratedPlayerRow } from '../../types/generatedPlayer';
import { buildSeasonConfig } from '../../utils/seasonConfig';
import { generateSeasonSchedule, ScheduleConfig } from '../../utils/scheduleGenerator';
import { INITIAL_STATS } from '../../utils/constants';
import { processOffseason, OffseasonResult } from '../playerDevelopment/playerAging';

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
        generatedDraftClass?: GeneratedPlayerRow[];  // 생성된 드래프트 클래스
        newSchedule?: Game[];
        newSeasonNumber?: number;
        newSeasonConfig?: SeasonConfig;
        teamsReset?: boolean;  // W/L + 스탯 리셋 수행됨
        offseasonProcessed?: OffseasonResult;  // 에이징/은퇴/계약만료/옵션 결과
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
    tendencySeed: string;
    userId?: string;  // 생성 선수 저장용
}

/**
 * 현재 날짜가 오프시즌 Key Date에 해당하면 이벤트 실행.
 * 각 이벤트는 offseasonPhase로 멱등성 보장.
 */
export function dispatchOffseasonEvent(params: DispatchParams): OffseasonEventResult {
    const { currentDate, keyDates, offseasonPhase, teams, schedule, playoffSeries, currentSeasonNumber, tendencySeed } = params;

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

    // ── rookieDraft: 드래프트 클래스 생성 + 드래프트 뷰 이동 ──
    if (currentDate >= keyDates.rookieDraft && offseasonPhase === 'POST_LOTTERY') {
        // 다음 시즌(currentSeasonNumber + 1)용 드래프트 클래스 생성
        const nextSeasonNumber = currentSeasonNumber + 1;
        const draftClass = userId
            ? generateDraftClass(userId, nextSeasonNumber, tendencySeed, 60)
            : [];

        if (draftClass.length > 0) {
            console.log(`📝 Generated draft class: ${draftClass.length} rookies for season ${nextSeasonNumber}`);
        }

        // TODO: DraftRoom 뷰 구현 시 blocked: true, navigateTo: 'DraftRoom'으로 변경
        return {
            fired: true,
            blocked: false,
            updates: {
                offseasonPhase: 'POST_DRAFT',
                generatedDraftClass: draftClass.length > 0 ? draftClass : undefined,
            },
        };
    }

    // ── moratoriumStart: 에이징/은퇴/계약만료/옵션 처리 ──
    if (currentDate >= keyDates.moratoriumStart && offseasonPhase === 'POST_DRAFT') {
        return handleMoratoriumStart(teams, currentSeasonNumber, tendencySeed);
    }

    // ── openingNight: 새 시즌 개막 ──
    if (currentDate >= keyDates.openingNight && (offseasonPhase === 'FA_OPEN' || offseasonPhase === 'PRE_SEASON')) {
        return handleOpeningNight(teams, currentSeasonNumber);
    }

    return NO_EVENT;
}

// ── moratoriumStart 핸들러 ──

function handleMoratoriumStart(
    teams: Team[],
    currentSeasonNumber: number,
    tendencySeed: string,
): OffseasonEventResult {
    const offseasonResult = processOffseason(teams, tendencySeed, currentSeasonNumber);

    // 제거 대상 집합
    const removeIds = new Set<string>();
    for (const p of offseasonResult.retiredPlayers) removeIds.add(p.playerId);
    for (const p of offseasonResult.expiredPlayers) removeIds.add(p.playerId);

    // 팀별 로스터 최소 인원(8명) 보장: 만료 선수 중 OVR 최고를 제거 대상에서 제외
    const MIN_ROSTER = 8;
    for (const team of teams) {
        const retainedCount = team.roster.filter(p => !removeIds.has(p.id)).length;
        if (retainedCount < MIN_ROSTER) {
            const needed = MIN_ROSTER - retainedCount;
            // 은퇴 선수는 복원 불가 — 만료 선수만 OVR 내림차순으로 복원
            const teamExpired = offseasonResult.expiredPlayers
                .filter(ep => ep.teamId === team.id && !offseasonResult.retiredPlayers.some(r => r.playerId === ep.playerId))
                .sort((a, b) => b.ovr - a.ovr);

            let restored = 0;
            for (const ep of teamExpired) {
                if (restored >= needed) break;
                removeIds.delete(ep.playerId);
                // min 계약 부여
                const player = team.roster.find(p => p.id === ep.playerId);
                if (player) {
                    player.salary = 1_500_000;
                    player.contractYears = 1;
                    player.contract = { years: [1_500_000], currentYear: 0, type: 'min' };
                }
                restored++;
                console.log(`🔄 Auto re-signed ${ep.playerName} (${team.id}) on min deal for roster minimum`);
            }
        }
    }

    // 최종 제거
    for (const team of teams) {
        team.roster = team.roster.filter(p => !removeIds.has(p.id));
    }

    console.log(`📋 Moratorium: ${offseasonResult.retiredPlayers.length} retired, ${offseasonResult.expiredPlayers.length} expired, ${offseasonResult.optionDecisions.length} option decisions`);

    return {
        fired: true,
        blocked: false,
        updates: {
            offseasonPhase: 'FA_OPEN',
            offseasonProcessed: offseasonResult,
        },
    };
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
