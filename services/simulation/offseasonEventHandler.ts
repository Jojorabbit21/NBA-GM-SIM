/**
 * 오프시즌 이벤트 디스패처
 *
 * Key Dates에 도달하면 해당 오프시즌 이벤트를 실행.
 * 순수 서비스 — React 의존 없음. 호출자(useSimulation)가 UI 전환 처리.
 */

import { Team, Game, PlayoffSeries } from '../../types';
import { SeasonKeyDates, SeasonConfig } from '../../utils/seasonConfig';
import { OffseasonPhase } from '../../types/app';
import { runLotteryEngine, LotteryResult } from '../draft/lotteryEngine';
import { generateDraftClass } from '../draft/rookieGenerator';
import { GeneratedPlayerRow } from '../../types/generatedPlayer';
import { fetchPredefinedDraftClass } from '../queries';
import { buildSeasonConfig } from '../../utils/seasonConfig';
import { generateSeasonSchedule, ScheduleConfig } from '../../utils/scheduleGenerator';
import { INITIAL_STATS, LEAGUE_FINANCIALS } from '../../utils/constants';
import { processOffseason, OffseasonResult } from '../playerDevelopment/playerAging';
import { calculateLuxuryTax } from '../financeEngine/budgetManager';
import { calcTeamPayroll } from '../fa/faMarketBuilder';
import { TEAM_DATA } from '../../data/teamData';
import { resolveDraftOrder } from '../draft/draftOrderResolver';
import type { LeaguePickAssets, ResolvedDraftOrder } from '../../types/draftAssets';
import type { LeagueTrainingConfigs } from '../../types/training';
import type { LeagueCoachingData } from '../../types/coaching';
import type { LeagueInvestmentState } from '../../types/finance';

// ── 결과 타입 ──

export interface OffseasonEventResult {
    /** 이벤트가 발생했는지 */
    fired: boolean;
    /** true면 날짜 진행을 중단하고 뷰 전환 필요 */
    blocked: boolean;
    /** blocked일 때 이동할 뷰 */
    navigateTo?: string;
    /** 상태 업데이트 */
    updates?: {
        offseasonPhase?: OffseasonPhase;
        lotteryResult?: LotteryResult;
        resolvedDraftOrder?: ResolvedDraftOrder;    // 보호/스왑/소유권 반영된 드래프트 오더
        updatedPickAssets?: LeaguePickAssets;       // fallback 이관 반영된 픽 자산
        generatedDraftClass?: GeneratedPlayerRow[];  // 생성된 드래프트 클래스
        newSchedule?: Game[];
        newSeasonNumber?: number;
        newSeasonConfig?: SeasonConfig;
        teamsReset?: boolean;  // W/L + 스탯 리셋 수행됨
        offseasonProcessed?: OffseasonResult;  // 에이징/은퇴/계약만료/옵션 결과
        expiredPlayerObjects?: Team['roster'];  // 계약 만료 선수 전체 Player 객체 (FA 시장 개설용)
        prevTeamIdMap?: Record<string, string>; // playerId → 계약 만료 직전 팀 ID (Bird Rights 판정용)
        prevTenureMap?: Record<string, number>; // playerId → teamTenure 리셋 전 값 (Bird Rights 판정용)
        rfaCandidateMap?: Record<string, { qoSalary: number; originalTeamId: string }>; // RFA 후보 (QO 텐더된)
        faMarketClosed?: boolean;               // FA 시장 마감 신호 (CPU 자동 서명 트리거)
        luxuryTaxResult?: {                     // 럭셔리 택스 정산 결과
            myTeamTax: number;
            myTeamPayroll: number;
            taxLevel: number;
            isLuxuryTeam: boolean;
            ownerName: string;
            title: string;
            msg: string;
        };
        luxuryTaxPaid?: boolean;                // 멱등성 플래그
        leagueInvestmentState?: LeagueInvestmentState; // 구단주 예산 배분 상태
    };
}

const NO_EVENT: OffseasonEventResult = { fired: false, blocked: false };

// ── 인시즌: 드래프트 풀 공개 감지 ──

export interface ProspectRevealParams {
    currentDate: string;
    prospectRevealDate: string;
    currentSeasonNumber: number;
    tendencySeed: string;
    userId?: string;
    hasProspects: boolean;  // 이미 생성된 prospects가 있으면 스킵
}

/** 첫 시즌 드래프트 클래스의 draft_year (meta_players에서 fetch) */
const FIRST_SEASON_DRAFT_YEAR = '2026';

/** meta_players raw row → GeneratedPlayerRow 변환 */
function mapRawRowToGeneratedPlayer(row: any, userId: string, debutSeasonNumber: number): GeneratedPlayerRow {
    const attrs = typeof row.base_attributes === 'string'
        ? JSON.parse(row.base_attributes)
        : { ...(row.base_attributes || {}) };
    if (row.name) attrs.name = row.name;
    if (row.position) attrs.position = row.position;
    if (row.height) attrs.height = row.height;
    if (row.weight) attrs.weight = row.weight;
    return {
        id: String(row.id),
        user_id: userId,
        season_number: debutSeasonNumber,
        draft_pick: null,
        draft_team_id: null,
        status: 'fa' as const,
        base_attributes: attrs,
        age_at_draft: Number(attrs.age ?? 19),
    };
}

/**
 * prospectReveal 날짜 도달 시 드래프트 클래스를 로드/생성한다.
 * - 시즌 1: meta_players에서 draft_year=2026 선수를 fetch (사전 입력 데이터)
 * - 시즌 2+: generateDraftClass로 자동 생성
 * 인시즌 이벤트이므로 offseasonPhase와 무관하게 동작.
 */
export async function checkProspectReveal(params: ProspectRevealParams): Promise<OffseasonEventResult> {
    const { currentDate, prospectRevealDate, currentSeasonNumber, tendencySeed, userId, hasProspects } = params;

    if (hasProspects) return NO_EVENT;  // 이미 생성됨
    if (currentDate < prospectRevealDate) return NO_EVENT;  // 아직 공개일 아님

    let draftClass: GeneratedPlayerRow[] = [];

    if (currentSeasonNumber === 1) {
        // 첫 시즌: meta_players에서 사전 입력된 루키 데이터 fetch
        const rawRows = await fetchPredefinedDraftClass(FIRST_SEASON_DRAFT_YEAR);
        draftClass = rawRows.map((row: any) => mapRawRowToGeneratedPlayer(row, userId || '', currentSeasonNumber + 1));
        if (draftClass.length > 0) {
            console.log(`📋 Prospect reveal: loaded ${draftClass.length} predefined prospects from meta_players (draft_year=${FIRST_SEASON_DRAFT_YEAR})`);
        }
    } else {
        // 시즌 2+: 자동 생성
        const nextSeasonNumber = currentSeasonNumber + 1;
        draftClass = userId
            ? generateDraftClass(userId, nextSeasonNumber, tendencySeed, 60)
            : [];
        if (draftClass.length > 0) {
            console.log(`📋 Prospect reveal: generated ${draftClass.length} prospects for season ${nextSeasonNumber} draft`);
        }
    }

    return {
        fired: true,
        blocked: false,
        updates: {
            generatedDraftClass: draftClass.length > 0 ? draftClass : undefined,
        },
    };
}

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
    userTeamId?: string;  // 유저팀 팀옵션 보류용
    hasProspects?: boolean;  // prospectReveal에서 이미 생성됨
    leaguePickAssets?: LeaguePickAssets;  // 픽 자산 (보호/스왑 해석용)
    luxuryTaxPaid?: boolean;  // 럭셔리 택스 이미 처리됨 (멱등성)
    leagueTrainingConfigs?: LeagueTrainingConfigs;  // 훈련 설정
    leagueCoachingData?: LeagueCoachingData;        // 코칭스태프
    investmentConfirmed?: boolean;                  // 구단주 예산 배분 완료 여부 (멱등성)
    teamOperatingIncomes?: Record<string, number>;  // 팀별 영업이익 (discretionaryBudget 계산용)
    leagueInvestmentState?: LeagueInvestmentState;  // 현 시즌 투자 상태 (훈련 효과 적용용)
}

/**
 * 현재 날짜가 오프시즌 Key Date에 해당하면 이벤트 실행.
 * 각 이벤트는 offseasonPhase로 멱등성 보장.
 */
export async function dispatchOffseasonEvent(params: DispatchParams): Promise<OffseasonEventResult> {
    const { currentDate, keyDates, offseasonPhase, teams, schedule, playoffSeries, currentSeasonNumber, tendencySeed, userId, userTeamId, leaguePickAssets } = params;

    // Phase가 null이면 인시즌 — 오프시즌 이벤트 불필요
    if (offseasonPhase === null) return NO_EVENT;

    // ── draftLottery: 로터리 추첨 + 보호/스왑 해석 + DraftLotteryView 강제 이동 ──
    if (currentDate >= keyDates.draftLottery && offseasonPhase === 'POST_FINALS') {
        const lotteryResult = runLotteryEngine(teams, schedule, playoffSeries);
        console.log(`🎰 Lottery drawn: #1 pick → ${lotteryResult.finalOrder[0]}`);

        // 보호/스왑/소유권 해석
        const draftSeason = 2024 + currentSeasonNumber + 1; // season 1 → 2026, season 2 → 2027
        let resolvedOrder: ResolvedDraftOrder | undefined;
        let updatedAssets: LeaguePickAssets | undefined;
        if (leaguePickAssets) {
            resolvedOrder = resolveDraftOrder(lotteryResult.finalOrder, leaguePickAssets, draftSeason);
            updatedAssets = resolvedOrder.updatedPickAssets;
            console.log(`📋 Draft order resolved: ${resolvedOrder.protectionResults.filter(p => p.triggered).length} protections triggered, ${resolvedOrder.swapResults.filter(s => s.swapped).length} swaps executed`);
        }

        return {
            fired: true,
            blocked: true,
            navigateTo: 'DraftLottery',
            updates: {
                offseasonPhase: 'POST_LOTTERY',
                lotteryResult,
                resolvedDraftOrder: resolvedOrder,
                updatedPickAssets: updatedAssets,
            },
        };
    }

    // ── rookieDraft: 드래프트 뷰 이동 (클래스는 prospectReveal에서 이미 생성됨) ──
    if (currentDate >= keyDates.rookieDraft && offseasonPhase === 'POST_LOTTERY') {
        // prospectReveal에서 이미 로드/생성되지 않은 경우에만 fallback
        const nextSeasonNumber = currentSeasonNumber + 1;
        let draftClass: GeneratedPlayerRow[] | undefined;
        if (userId && !params.hasProspects) {
            if (currentSeasonNumber === 1) {
                // 첫 시즌 fallback: meta_players에서 fetch
                const rawRows = await fetchPredefinedDraftClass(FIRST_SEASON_DRAFT_YEAR);
                draftClass = rawRows.map((row: any) => mapRawRowToGeneratedPlayer(row, userId, currentSeasonNumber + 1));
                console.log(`📝 Draft class fallback: loaded ${draftClass.length} predefined prospects`);
            } else {
                const generated = generateDraftClass(userId, nextSeasonNumber, tendencySeed, 60);
                if (generated.length > 0) {
                    console.log(`📝 Generated draft class (fallback): ${generated.length} rookies for season ${nextSeasonNumber}`);
                    draftClass = generated;
                }
            }
        }

        // 루키 드래프트 뷰로 이동 — offseasonPhase는 드래프트 완료 시 handleRookieDraftComplete에서 변경
        return {
            fired: true,
            blocked: true,
            navigateTo: 'DraftRoom',
            updates: {
                generatedDraftClass: draftClass,
            },
        };
    }

    // ── moratoriumStart: 에이징/은퇴/계약만료/옵션 처리 + 오프시즌 훈련 ──
    if (currentDate >= keyDates.moratoriumStart && offseasonPhase === 'POST_DRAFT') {
        return handleMoratoriumStart(teams, currentSeasonNumber, tendencySeed, userTeamId);
    }

    // ── luxuryTaxDay: 럭셔리 택스 정산 ──
    if (keyDates.luxuryTaxDay && currentDate >= keyDates.luxuryTaxDay
        && offseasonPhase === 'FA_OPEN' && !params.luxuryTaxPaid) {
        const myTeam = userTeamId ? teams.find(t => t.id === userTeamId) : null;
        if (myTeam) {
            const myTeamPayroll = calcTeamPayroll(myTeam);
            const taxLevel = LEAGUE_FINANCIALS.TAX_LEVEL;
            const myTeamTax = calculateLuxuryTax(myTeamPayroll, taxLevel);
            const isLuxuryTeam = myTeamTax > 0;
            const ownerName = TEAM_DATA[myTeam.id]?.owner ?? 'The Ownership Group';
            const fmtM = (v: number) => `$${(v / 1_000_000).toFixed(1)}M`;
            const title = isLuxuryTeam ? '럭셔리 택스 납부 안내' : '시즌 재정 결산 보고';
            const msg = isLuxuryTeam
                ? `이번 시즌 팀 페이롤은 ${fmtM(myTeamPayroll)}입니다. 럭셔리 택스 기준선(${fmtM(taxLevel)})을 초과하여 ${fmtM(myTeamTax)}의 럭셔리 택스를 납부했습니다.`
                : `이번 시즌 팀 페이롤은 ${fmtM(myTeamPayroll)}입니다. 럭셔리 택스 기준선(${fmtM(taxLevel)}) 이내로 마감되어 럭셔리 택스가 부과되지 않았습니다.`;

            console.log(`💰 Luxury tax settled: ${myTeam.id} — payroll ${fmtM(myTeamPayroll)}, tax ${fmtM(myTeamTax)}`);

            return {
                fired: true,
                blocked: false,
                updates: {
                    luxuryTaxResult: { myTeamTax, myTeamPayroll, taxLevel, isLuxuryTeam, ownerName, title, msg },
                    luxuryTaxPaid: true,
                },
            };
        }
    }

    // ── rosterDeadline: FA 시장 마감 (FA_OPEN → PRE_SEASON) ──
    if (keyDates.rosterDeadline && currentDate >= keyDates.rosterDeadline && offseasonPhase === 'FA_OPEN') {
        return {
            fired: true,
            blocked: false,
            updates: {
                offseasonPhase: 'PRE_SEASON',
                faMarketClosed: true,
            },
        };
    }

    // ── openingNight: 새 시즌 개막 ──
    if (currentDate >= keyDates.openingNight && (offseasonPhase === 'FA_OPEN' || offseasonPhase === 'PRE_SEASON')) {
        return handleOpeningNight(teams, currentSeasonNumber, userTeamId);
    }

    return NO_EVENT;
}

// ── moratoriumStart 핸들러 ──

function handleMoratoriumStart(
    teams: Team[],
    currentSeasonNumber: number,
    tendencySeed: string,
    userTeamId?: string,
): OffseasonEventResult {
    const offseasonResult = processOffseason(teams, tendencySeed, currentSeasonNumber, userTeamId);

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

    // FA 선수 전체 객체 수집 (로스터 필터링 전 — FA 시장 개설 시 사용)
    // prevTenureMap: teamTenure는 processOffseason()에서 0으로 리셋되므로
    // 로스터 필터링 전(리셋 전) 값을 여기서 스냅샷해 Bird Rights 판정에 사용한다
    const expiredPlayerObjects: Team['roster'] = [];
    const prevTeamIdMap: Record<string, string> = {};
    const prevTenureMap: Record<string, number> = {};
    for (const team of teams) {
        for (const player of team.roster) {
            if (removeIds.has(player.id) && !offseasonResult.retiredPlayers.some(r => r.playerId === player.id)) {
                expiredPlayerObjects.push(player);
                prevTeamIdMap[player.id] = team.id;
                prevTenureMap[player.id] = player.teamTenure ?? 0;
            }
        }
    }

    // 최종 제거 + 데드캡 오프시즌 처리
    for (const team of teams) {
        team.roster = team.roster.filter(p => !removeIds.has(p.id));
        // waive/buyout: 1회성 → 제거
        // stretch: stretchYearsRemaining 차감, 0이 되면 제거
        team.deadMoney = (team.deadMoney ?? [])
            .filter(e => e.releaseType === 'stretch')
            .map(e => ({ ...e, stretchYearsRemaining: (e.stretchYearsRemaining ?? 1) - 1 }))
            .filter(e => (e.stretchYearsRemaining ?? 0) > 0);
    }

    // RFA 후보 처리: CPU 팀은 OVR >= 70이면 QO 텐더, 미만이면 포기(UFA 전환)
    // 유저 팀 RFA는 OFFSEASON_REPORT로 전달해 유저가 직접 결정
    const rfaCandidateMap: Record<string, { qoSalary: number; originalTeamId: string }> = {};
    for (const candidate of offseasonResult.rfaCandidates) {
        if (candidate.teamId === userTeamId) {
            // 유저팀: OFFSEASON_REPORT에서 결정 — 일단 포함해두고 유저 QO 결정 콜백으로 확정
            rfaCandidateMap[candidate.playerId] = { qoSalary: candidate.qoSalary, originalTeamId: candidate.teamId };
        } else if (candidate.ovr >= 70) {
            // CPU팀: 자동 텐더
            rfaCandidateMap[candidate.playerId] = { qoSalary: candidate.qoSalary, originalTeamId: candidate.teamId };
        }
        // OVR < 70 CPU팀: UFA로 처리 (rfaCandidateMap에 포함하지 않음)
    }

    console.log(`📋 Moratorium: ${offseasonResult.retiredPlayers.length} retired, ${offseasonResult.expiredPlayers.length} expired, ${offseasonResult.optionDecisions.length} option decisions, ${offseasonResult.rfaCandidates.length} RFA candidates`);

    return {
        fired: true,
        blocked: false,
        updates: {
            offseasonPhase: 'FA_OPEN',
            offseasonProcessed: offseasonResult,
            expiredPlayerObjects,
            prevTeamIdMap,
            prevTenureMap,
            rfaCandidateMap,
        },
    };
}

// ── openingNight 핸들러 ──

function handleOpeningNight(
    teams: Team[],
    currentSeasonNumber: number,
    userTeamId?: string,
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

    // 유저팀 미결정 팀 옵션 자동 행사 (FA_OPEN 중 미결정 시 로스터 잔류 = 행사로 간주)
    // option.year === currentYear 인 선수는 이미 option year에 진입 → option 필드 제거
    if (userTeamId) {
        const userTeam = teams.find(t => t.id === userTeamId);
        if (userTeam) {
            for (const player of userTeam.roster) {
                if (player.contract?.option?.type === 'team' &&
                    player.contract.option.year === player.contract.currentYear) {
                    player.contract = { ...player.contract, option: undefined };
                }
            }
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
