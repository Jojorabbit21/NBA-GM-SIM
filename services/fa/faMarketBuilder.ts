import type { Player, PlayerContract } from '../../types/player';
import type { Team } from '../../types/team';
import type { FARole, FAMarketEntry, LeagueFAMarket, SigningType, PendingOfferSheet } from '../../types/fa';
import { LEAGUE_FINANCIALS, SIGNING_EXCEPTIONS } from '../../utils/constants';
import {
    buildMarketConditions,
    calcFADemand,
    calcYOSBounds,
    evaluateFAOffer,
    determineFARole,
} from './faValuation';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

// [2026-09-16] 투웨이 계약(contract.type === 'two_way')은 실제 CBA상 샐러리캡에 전혀
// 잡히지 않는다 — 페이롤 합산에서 제외한다(방출/트레이드로 남는 데드머니는 그대로 포함).
// [2026-09-21] 파라미터를 전체 Team이 아니라 Pick<Team,'roster'|'deadMoney'>로 완화 —
// 멀티플레이어 화면 중 일부(MultiFrontOfficeView.tsx의 트레이드 화면)는 poolById+roster id
// 배열로 로스터를 직접 조립해서 완전한 Team 객체가 없다. 기존 호출부(싱글/멀티 전부 완전한
// Team을 넘김)는 구조적으로 이 더 좁은 타입도 만족하므로 하위호환 그대로. "팀 페이롤 =
// 로스터 연봉 합 + 데드캡" 계산의 유일한 소스 — 화면마다 따로 재구현하지 말고 이 함수를
// 쓸 것(안 그러면 데드캡 누락 회귀가 반복됨, 2026-09-21에 MultiNegotiationView/
// MultiFrontOfficeView 둘 다 각자 따로 안 붙여서 실제로 발생했었다).
export function calcTeamPayroll(team: Pick<Team, 'roster' | 'deadMoney'>): number {
    const rosterTotal = team.roster
        .filter(p => p.contract?.type !== 'two_way')
        .reduce((sum, p) => sum + (p.salary ?? 0), 0);
    const deadTotal = (team.deadMoney ?? []).reduce((sum, d) => sum + d.amount, 0);
    return rosterTotal + deadTotal;
}

function calcInterestedTeamIds(
    teams: Team[],
    player: Player,
    faRole: FARole,
): string[] {
    return teams
        .filter(t => {
            const payroll = calcTeamPayroll(t);
            const hasCapOrMLE =
                payroll < LEAGUE_FINANCIALS.SALARY_CAP ||
                payroll < LEAGUE_FINANCIALS.SECOND_APRON;
            const roleStrength = t.roster
                .filter(p => determineFARole(p) === faRole)
                .reduce((max, p) => Math.max(max, p.ovr), 0);
            return hasCapOrMLE && roleStrength < player.ovr;
        })
        .map(t => t.id)
        .slice(0, 6);
}

function getBirdRightsLevel(teamTenure: number): 'full' | 'early' | 'non' | 'none' {
    if (teamTenure >= 3) return 'full';
    if (teamTenure === 2) return 'early';
    if (teamTenure === 1) return 'non';
    return 'none';
}

/**
 * 팀이 해당 선수에게 사용 가능한 "예외 조항" 목록 반환 — [2026-09-17] 캡스페이스는 더 이상
 * SigningType의 한 값이 아니라 항상 가능한 기본값이라(빈 값 = 캡스페이스) 이 배열엔 안
 * 들어온다. 캡스페이스로 쓸 수 있는 금액은 getCapSpaceCap()으로 따로 계산한다.
 */
export function getAvailableSigningSlots(
    team: Team,
    player: Player,
    playerPrevTeamId: string | undefined,
    usedMLE: Record<string, boolean>,
    isBuyout?: boolean,
    prevTeamTenure?: number,  // Bird Rights 판정용 — teamTenure 리셋 전 값 (FAMarketEntry.prevTeamTenure)
    currentSeasonYear?: number,  // BAE 2시즌 주기 판정용 (e.g. 2025 for 2025-26)
): SigningType[] {
    const slots: SigningType[] = [];
    const payroll = calcTeamPayroll(team);
    const { FIRST_APRON, SECOND_APRON } = LEAGUE_FINANCIALS;

    // 바이아웃 선수 에이프런 영입 제한
    if (isBuyout) {
        if (payroll >= SECOND_APRON) return [];   // 2차 에이프런 초과: 완전 불가
        if (payroll >= FIRST_APRON) {             // 1차 에이프런 초과: minimum_exception만 가능
            slots.push('minimum_exception');
            return slots;
        }
    }

    // MLE
    const mleUsed = usedMLE[team.id] ?? false;
    if (!mleUsed) {
        if (payroll < FIRST_APRON)  slots.push('non_taxpayer_mle');
        else if (payroll < SECOND_APRON) slots.push('taxpayer_mle');
    }

    // BAE: 비납세자 팀 + MLE 미사용 + 2시즌에 1번 제한
    // MLE 사용팀은 BAE 동시 사용 불가 (CBA 규정)
    if (!mleUsed && payroll < FIRST_APRON) {
        const lastBAE = team.usedBAEyear ?? -99;
        if (!currentSeasonYear || (currentSeasonYear - lastBAE) >= 2) {
            slots.push('biannual_exception');
        }
    }

    // Bird Rights (자팀 FA만)
    // prevTeamTenure 우선 사용 — teamTenure는 processOffseason()에서 0으로 리셋되므로
    // FA 등록 시점에 저장해 둔 prevTeamTenure(리셋 전 값)를 Bird Rights 판정 기준으로 삼는다
    if (playerPrevTeamId === team.id) {
        const tenureForBird = prevTeamTenure ?? player.teamTenure ?? 0;
        const bird = getBirdRightsLevel(tenureForBird);
        if (bird === 'full')  slots.push('full_bird');
        if (bird === 'early') slots.push('early_bird');
        if (bird === 'non')   slots.push('non_bird');
    }

    // 미니멈 (항상 가능)
    slots.push('minimum_exception');

    return slots;
}

/** 캡스페이스(예외 조항 미사용)로 쓸 수 있는 연봉 상한 — signingType이 비어있는 오퍼는
 *  이 값으로 검증한다. */
function getCapSpaceCap(team: Team, maxAllowed: number): number {
    const payroll = calcTeamPayroll(team);
    const remainingCap = Math.max(0, LEAGUE_FINANCIALS.SALARY_CAP - payroll);
    return Math.min(remainingCap, maxAllowed);
}

/** 예외 조항별 연봉 상한 계산 */
function getSlotSalaryCap(
    slot: SigningType,
    team: Team,
    player: Player,
    maxAllowed: number,
    vetMin: number,
): number {
    switch (slot) {
        case 'non_taxpayer_mle': return Math.min(SIGNING_EXCEPTIONS.NON_TAX_MLE, maxAllowed);
        case 'taxpayer_mle':    return Math.min(SIGNING_EXCEPTIONS.TAXPAYER_MLE, maxAllowed);
        case 'biannual_exception': return Math.min(SIGNING_EXCEPTIONS.BAE, maxAllowed);
        case 'full_bird':  return maxAllowed;
        case 'early_bird': {
            const base = player.prevSalary ?? player.salary ?? 0;
            return Math.min(maxAllowed, Math.max(base * 1.75, LEAGUE_FINANCIALS.SALARY_CAP * 1.05, vetMin));
        }
        case 'non_bird': {
            const base = player.prevSalary ?? player.salary ?? 0;
            return Math.min(maxAllowed, Math.max(base * 1.20, vetMin));
        }
        case 'minimum_exception': return vetMin;
        default: return vetMin;
    }
}

// [2026-09-22] 이 파일에 있던 calcYOSBounds 복제본(3단계 절대금액 vetMin) 삭제 — faValuation.ts의
// 공용 calcYOSBounds(yos, salaryCap, player)를 import해 쓴다. 싱글플레이어 전용 파일이므로 캡은
// LEAGUE_FINANCIALS.SALARY_CAP(전역 싱글턴)을 호출부에서 명시적으로 넘긴다.

function buildContract(
    salary: number, years: number, type: PlayerContract['type'],
    option?: import('../../types/player').ContractOption,
    noTrade?: boolean,
    tradeKicker?: number,
    signingType?: SigningType,
): PlayerContract {
    const contract: PlayerContract = { years: Array(years).fill(Math.round(salary)), currentYear: 0, type };
    if (option)                   contract.options     = [option];
    if (noTrade)                  contract.noTrade     = true;
    if (tradeKicker && tradeKicker > 0) contract.tradeKicker = tradeKicker;
    if (signingType)              contract.signingType = signingType;
    return contract;
}

// ─────────────────────────────────────────────────────────────
// 날짜 헬퍼
// ─────────────────────────────────────────────────────────────

function addDaysToDate(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────
// 1. FA 시장 개설
// ─────────────────────────────────────────────────────────────

export function openFAMarket(
    expiredPlayers: Player[],    // processOffseason() 에서 반환된 FA 후보 (팀에서 제거된 상태)
    allPlayers: Player[],        // 30팀 전체 로스터 (수급 풀 계산용)
    teams: Team[],
    openDate: string,
    closeDate: string,
    currentSeasonYear: number,
    currentSeason: string,
    tendencySeed: string,
    prevTeamIdMap?: Record<string, string>,    // playerId → 계약 만료 직전 팀 ID (Bird Rights용)
    prevTenureMap?: Record<string, number>,    // playerId → teamTenure 리셋 전 값 (Bird Rights 판정용)
    rfaCandidateMap?: Record<string, { qoSalary: number; originalTeamId: string }>,  // playerId → RFA 정보
): LeagueFAMarket {
    const marketConditions = buildMarketConditions(allPlayers, expiredPlayers, teams);

    const entries: FAMarketEntry[] = [];

    for (const player of expiredPlayers) {
        const demand = calcFADemand(
            player,
            allPlayers,
            marketConditions,
            currentSeasonYear,
            currentSeason,
            tendencySeed,
            LEAGUE_FINANCIALS.SALARY_CAP,
        );

        const interestedTeamIds = calcInterestedTeamIds(teams, player, demand.faRole);
        const rfaInfo = rfaCandidateMap?.[player.id];

        entries.push({
            playerId:          player.id,
            prevTeamId:        prevTeamIdMap?.[player.id],
            prevTeamTenure:    prevTenureMap?.[player.id],
            askingYears:       demand.askingYears,
            askingSalary:      demand.askingSalary,
            walkAwaySalary:    demand.walkAwaySalary,
            marketValueScore:  demand.marketValueScore,
            faRole:            demand.faRole,
            interestedTeamIds,
            status:            'available',
            ...(rfaInfo && {
                isRFA:          true,
                qualifyingOffer: rfaInfo.qoSalary,
                originalTeamId: rfaInfo.originalTeamId,
            }),
        });
    }

    return {
        openDate,
        closeDate,
        entries,
        usedMLE: {},
        players: expiredPlayers,
    };
}

// ─────────────────────────────────────────────────────────────
// 1b. 방출 선수 FA 시장 추가 (시즌 중 / 오프시즌 모두 사용 가능)
// ─────────────────────────────────────────────────────────────

export function releasePlayerToMarket(
    market: LeagueFAMarket | null,
    player: Player,
    allPlayers: Player[],
    teams: Team[],
    currentDate: string,
    tendencySeed: string,
    currentSeasonYear: number,
    currentSeason: string,
    prevTeamId?: string,  // 방출 직전 소속팀 ID (Bird Rights 재계약용)
): LeagueFAMarket {
    // market이 없으면 빈 시장 생성
    const baseMarket: LeagueFAMarket = market ?? {
        openDate: currentDate,
        closeDate: currentDate,
        entries: [],
        usedMLE: {},
        players: [],
    };

    // 이미 같은 playerId 엔트리가 있으면 중복 방지
    if (baseMarket.entries.some(e => e.playerId === player.id)) {
        return baseMarket;
    }

    const marketConditions = buildMarketConditions(allPlayers, [player], teams);
    const demand = calcFADemand(
        player,
        allPlayers,
        marketConditions,
        currentSeasonYear,
        currentSeason,
        tendencySeed,
        LEAGUE_FINANCIALS.SALARY_CAP,
    );

    const interestedTeamIds = calcInterestedTeamIds(teams, player, demand.faRole);

    const newEntry: FAMarketEntry = {
        playerId:         player.id,
        prevTeamId,
        isBuyout:         true,
        askingYears:      demand.askingYears,
        askingSalary:     demand.askingSalary,
        walkAwaySalary:   demand.walkAwaySalary,
        marketValueScore: demand.marketValueScore,
        faRole:           demand.faRole,
        interestedTeamIds,
        status:           'available',
    };

    return {
        ...baseMarket,
        entries: [...baseMarket.entries, newEntry],
        players: [...(baseMarket.players ?? []), player],
    };
}

// ─────────────────────────────────────────────────────────────
// 2. CPU 팀 FA 서명 시뮬레이션
// ─────────────────────────────────────────────────────────────

export interface CPUSigningResult {
    market: LeagueFAMarket;
    teams: Team[];
    signings: Array<{ teamId: string; playerId: string; salary: number; years: number }>;
}

export function simulateCPUSigning(
    market: LeagueFAMarket,
    teams: Team[],
    faPlayerMap: Record<string, Player>,   // playerId → Player 객체
    userTeamId: string,
    tendencySeed: string,
    currentSeasonYear: number,
    currentDate?: string,
): CPUSigningResult {
    const updatedTeams: Team[] = teams.map(t => ({
        ...t,
        roster: [...t.roster],
    }));
    const updatedMarket: LeagueFAMarket = {
        ...market,
        entries: market.entries.map(e => ({ ...e })),
        usedMLE: { ...market.usedMLE },
    };
    const signings: CPUSigningResult['signings'] = [];

    // CPU 팀만 (유저 팀 제외), 재정 여유 있는 순으로 정렬
    const cpuTeams = updatedTeams
        .filter(t => t.id !== userTeamId)
        .sort((a, b) => calcTeamPayroll(a) - calcTeamPayroll(b));

    for (const team of cpuTeams) {
        const teamObj = updatedTeams.find(t => t.id === team.id)!;

        // 이 팀이 가장 필요한 FA 롤 파악
        const roleCoverage = getRoleCoverage(teamObj);

        // available FA 중 팀에 도움이 될 선수 후보 (OVR 내림차순)
        const candidates = updatedMarket.entries
            .filter(e => e.status === 'available' && faPlayerMap[e.playerId])
            .sort((a, b) => {
                const pa = faPlayerMap[a.playerId];
                const pb = faPlayerMap[b.playerId];
                return pb.ovr - pa.ovr;
            });

        for (const entry of candidates) {
            const player = faPlayerMap[entry.playerId];
            if (!player) continue;

            const payroll = calcTeamPayroll(teamObj);

            // 팀이 이 롤을 필요로 하는지 확인
            const roleNeed = roleCoverage[entry.faRole] ?? 80;
            if (roleNeed >= 75) continue; // 이미 충분히 커버됨

            // 슬롯 확인 (prevTeamId/prevTeamTenure 전달 → CPU 팀도 Bird Rights 사용 가능)
            const slots = getAvailableSigningSlots(
                teamObj,
                player,
                entry.prevTeamId,
                updatedMarket.usedMLE,
                entry.isBuyout,
                entry.prevTeamTenure,
                currentSeasonYear,
            );

            // 예산에 맞는 최선 슬롯 선택 — 캡스페이스(예외 조항 아님, 항상 가능)를 먼저
            // 시도하고(예전엔 slots 배열 맨 앞에 있어 사실상 최우선이었던 것과 동일한 순서
            // 유지), 부족하면 예외 조항 슬롯을 순회. bestSlot이 undefined면 "캡스페이스로
            // 체결"이라는 뜻 — bestSlotFound로 "아예 오퍼 불가"와 구분한다.
            const yos = currentSeasonYear - (player.draftYear ?? currentSeasonYear);
            const { maxAllowed, vetMin } = calcYOSBounds(yos, LEAGUE_FINANCIALS.SALARY_CAP, player);

            let bestSlot: SigningType | undefined;
            let bestSlotFound = false;
            let offerSalary = 0;

            if (!entry.isBuyout || payroll < LEAGUE_FINANCIALS.FIRST_APRON) {
                const capSpaceCap = getCapSpaceCap(teamObj, maxAllowed);
                const capSpaceOffer = Math.min(capSpaceCap, Math.round(entry.walkAwaySalary * 1.05));
                if (capSpaceOffer >= entry.walkAwaySalary) {
                    bestSlotFound = true;
                    offerSalary = capSpaceOffer;
                }
            }
            if (!bestSlotFound) {
                for (const slot of slots) {
                    const cap = getSlotSalaryCap(slot, teamObj, player, maxAllowed, vetMin);
                    // CPU는 walkAway의 105%~askingSalary 사이로 오퍼
                    const cpuOffer = Math.min(cap, Math.round(entry.walkAwaySalary * 1.05));
                    if (cpuOffer >= entry.walkAwaySalary) {
                        bestSlot = slot;
                        bestSlotFound = true;
                        offerSalary = cpuOffer;
                        break;
                    }
                }
            }
            if (!bestSlotFound || offerSalary <= 0) continue;

            const slotMaxYears = bestSlot === undefined ? 4
                : bestSlot === 'full_bird' ? 5
                : bestSlot === 'early_bird' || bestSlot === 'non_taxpayer_mle' ? 4
                : bestSlot === 'non_bird' ? 2
                : 2;
            const offerYears = Math.min(entry.askingYears, slotMaxYears);
            const seed = `${tendencySeed}:cpu:${team.id}:${player.id}`;

            const accepted = evaluateFAOffer(
                { salary: offerSalary, years: offerYears },
                {
                    askingSalary:   entry.askingSalary,
                    walkAwaySalary: entry.walkAwaySalary,
                    targetSalary:   entry.walkAwaySalary,
                    askingYears:    entry.askingYears,
                    marketValueScore: entry.marketValueScore,
                    faRole:         entry.faRole,
                },
                seed,
            );

            if (accepted) {
                // RFA 타팀 → 오퍼시트 제출 (즉시 서명 불가)
                if (entry.isRFA && entry.originalTeamId && entry.originalTeamId !== team.id) {
                    const contract = buildContract(offerSalary, offerYears, 'free_agent', undefined, undefined, undefined, bestSlot);
                    const offerSheet: PendingOfferSheet = {
                        id: `os_${team.id}_${player.id}_${Date.now()}`,
                        playerId:        player.id,
                        offeringTeamId:  team.id,
                        originalTeamId:  entry.originalTeamId,
                        salary:          offerSalary,
                        years:           offerYears,
                        contract,
                        signingType:     bestSlot,
                        submittedDate:   currentDate ?? '',
                        matchDeadline:   currentDate ? addDaysToDate(currentDate, 3) : '',
                    };
                    updatedMarket.pendingOfferSheets = [...(updatedMarket.pendingOfferSheets ?? []), offerSheet];
                    const entryIdxRFA = updatedMarket.entries.findIndex(e => e.playerId === player.id);
                    if (entryIdxRFA !== -1) {
                        updatedMarket.entries[entryIdxRFA] = { ...updatedMarket.entries[entryIdxRFA], status: 'pending_match' };
                    }
                    if (bestSlot === 'non_taxpayer_mle' || bestSlot === 'taxpayer_mle' || bestSlot === 'biannual_exception') {
                        updatedMarket.usedMLE[team.id] = true;
                    }
                    if (bestSlot === 'biannual_exception') {
                        teamObj.usedBAEyear = currentSeasonYear;
                    }
                    signings.push({ teamId: team.id, playerId: player.id, salary: offerSalary, years: offerYears });
                    break;
                }

                // 일반 UFA or 자팀 RFA → 즉시 계약 체결
                const contract = buildContract(offerSalary, offerYears, 'free_agent', undefined, undefined, undefined, bestSlot);
                const signedPlayer: Player = {
                    ...player,
                    contract,
                    salary: offerSalary,
                    contractYears: offerYears,
                    teamTenure: 0,
                };
                teamObj.roster.push(signedPlayer);

                // MLE/BAE 사용 처리 (BAE와 MLE는 같은 시즌 동시 사용 불가)
                if (bestSlot === 'non_taxpayer_mle' || bestSlot === 'taxpayer_mle' || bestSlot === 'biannual_exception') {
                    updatedMarket.usedMLE[team.id] = true;
                }
                if (bestSlot === 'biannual_exception') {
                    teamObj.usedBAEyear = currentSeasonYear;
                }

                // 마켓 엔트리 업데이트
                const entryIdx = updatedMarket.entries.findIndex(e => e.playerId === player.id);
                if (entryIdx !== -1) {
                    updatedMarket.entries[entryIdx] = {
                        ...updatedMarket.entries[entryIdx],
                        status:       'signed',
                        signedTeamId: team.id,
                        signedYears:  offerYears,
                        signedSalary: offerSalary,
                    };
                }

                // Set-Off Rule: B팀 총 계약액만큼 원팀 데드캡 차감 (waive/buyout/stretch 모두 적용)
                if (entry.prevTeamId) {
                    const prevTeam = updatedTeams.find(t => t.id === entry.prevTeamId);
                    if (prevTeam) {
                        const bTeamTotal = offerSalary * offerYears;
                        prevTeam.deadMoney = (prevTeam.deadMoney ?? []).reduce((acc, d) => {
                            if (d.playerId === player.id && (d.releaseType === 'waive' || d.releaseType === 'buyout' || d.releaseType === 'stretch')) {
                                const remaining = d.amount - bTeamTotal;
                                if (remaining > 0) acc.push({ ...d, amount: remaining });
                            } else {
                                acc.push(d);
                            }
                            return acc;
                        }, [] as typeof prevTeam.deadMoney);
                    }
                }

                signings.push({ teamId: team.id, playerId: player.id, salary: offerSalary, years: offerYears });
                break; // 한 라운드에 팀당 1명 서명
            }
        }
    }

    return { market: updatedMarket, teams: updatedTeams, signings };
}

// ─────────────────────────────────────────────────────────────
// 3. 유저 오퍼 처리
// ─────────────────────────────────────────────────────────────

export type UserOfferResult =
    | { accepted: true;  contract: PlayerContract; signingType?: SigningType }
    | { accepted: false; reason: string };

// 예외 조항별 CBA 연수 상한 — UI SLOT_MAX_YEARS와 동일하게 유지. signingType이 없으면(캡
// 스페이스) 4년으로 취급(예전 cap_space:4와 동일).
const MAX_YEARS_BY_SLOT: Record<SigningType, number> = {
    full_bird: 5, early_bird: 4, non_bird: 2,
    non_taxpayer_mle: 4, taxpayer_mle: 2, room_mle: 2, biannual_exception: 2, minimum_exception: 2,
    second_round_exception: 4, rookie_scale_exception: 4, // 이 경로(일반 FA 오퍼 처리)로는
    // 실제로 거의 안 들어옴(rookie_scale_exception은 루키스케일 계약 전용) — 표만 채움.
};

export function processUserOffer(
    market: LeagueFAMarket,
    team: Team,
    player: Player,
    playerPrevTeamId: string | undefined,
    offer: {
        salary: number;
        years: number;
        signingType?: SigningType;  // 비어있으면 캡 스페이스로 체결
        option?: import('../../types/player').ContractOption;
        noTrade?: boolean;
        tradeKicker?: number;
    },
    tendencySeed: string,
    currentSeasonYear: number,
): UserOfferResult {
    const entry = market.entries.find(e => e.playerId === player.id);
    if (!entry || entry.status !== 'available') {
        return { accepted: false, reason: '이미 서명이 완료된 선수입니다.' };
    }

    const yos = currentSeasonYear - (player.draftYear ?? currentSeasonYear);
    const { maxAllowed, vetMin } = calcYOSBounds(yos, LEAGUE_FINANCIALS.SALARY_CAP, player);

    // 슬롯 유효성 검증 — entry.prevTeamTenure로 Bird Rights 판정 (teamTenure 리셋 전 값).
    // signingType이 없으면 캡 스페이스(항상 가능)라 이 검증 자체를 건너뛴다.
    let slotCap: number;
    if (offer.signingType === undefined) {
        slotCap = getCapSpaceCap(team, maxAllowed);
    } else {
        const availableSlots = getAvailableSigningSlots(team, player, playerPrevTeamId, market.usedMLE, entry.isBuyout, entry.prevTeamTenure, currentSeasonYear);
        if (!availableSlots.includes(offer.signingType)) {
            return { accepted: false, reason: `${offer.signingType} 슬롯을 사용할 수 없습니다.` };
        }
        slotCap = getSlotSalaryCap(offer.signingType, team, player, maxAllowed, vetMin);
    }

    // 연봉 상한 검증
    if (offer.salary > slotCap) {
        return { accepted: false, reason: `제시 연봉이 슬롯 상한($${(slotCap / 1_000_000).toFixed(1)}M)을 초과합니다.` };
    }
    if (offer.salary < vetMin) {
        return { accepted: false, reason: `제시 연봉이 베테랑 미니멈($${(vetMin / 1_000_000).toFixed(1)}M) 미만입니다.` };
    }

    // 연수 검증
    const maxYears = offer.signingType === undefined ? 4 : (MAX_YEARS_BY_SLOT[offer.signingType] ?? 4);
    if (offer.years < 1 || offer.years > maxYears) {
        return { accepted: false, reason: `연수는 1~${maxYears}년 사이여야 합니다.` };
    }

    // 계약 옵션에 따른 체감 연봉 보정 (수락 판정용)
    let effectiveSalary = offer.salary;
    if (offer.option?.type === 'player') effectiveSalary *= 1.08;  // 선수 옵션: 이탈 자유 → 선수에게 유리
    // 팀 옵션: 마지막 1년이 불확실 → 계약 연수 비례 패널티 (짧을수록 타격 큼)
    if (offer.option?.type === 'team')   effectiveSalary *= (1 - (1 / Math.max(1, offer.years)) * 0.55);
    if (offer.noTrade)                   effectiveSalary *= 1.05;  // NTC: 이적 거부권 → 선수에게 유리
    if (offer.tradeKicker)               effectiveSalary *= (1 + offer.tradeKicker * 0.3);

    // 수락 여부 판정
    const seed = `${tendencySeed}:user:${team.id}:${player.id}`;
    const accepted = evaluateFAOffer(
        { salary: effectiveSalary, years: offer.years },
        {
            askingSalary:    entry.askingSalary,
            walkAwaySalary:  entry.walkAwaySalary,
            targetSalary:    entry.walkAwaySalary,
            askingYears:     entry.askingYears,
            marketValueScore: entry.marketValueScore,
            faRole:          entry.faRole,
        },
        seed,
    );

    if (!accepted) {
        const fmt = (n: number) => `$${(n / 1_000_000).toFixed(1)}M`;
        // 계약 조건 페널티로 체감 연봉이 요구액 미만인 경우 원인 명시
        if (effectiveSalary < offer.salary && offer.salary >= entry.askingSalary && effectiveSalary < entry.askingSalary) {
            const cause = offer.option?.type === 'team' ? '팀 옵션'
                : offer.option?.type === 'player' ? '선수 옵션'
                : offer.noTrade ? 'NTC'
                : '계약 조건';
            return {
                accepted: false,
                reason: `${cause}으로 인해 선수가 인식하는 실효 연봉(${fmt(effectiveSalary)})이 요구액(${fmt(entry.askingSalary)}) 미만입니다. AAV를 높이거나 조건을 변경하세요.`,
            };
        }
        return { accepted: false, reason: '선수가 오퍼를 거절했습니다.' };
    }

    const contract = buildContract(offer.salary, offer.years, 'free_agent', offer.option, offer.noTrade, offer.tradeKicker, offer.signingType);

    return { accepted: true, contract, signingType: offer.signingType };
}

// ─────────────────────────────────────────────────────────────
// 4. RFA 오퍼시트 제출 (유저용)
// ─────────────────────────────────────────────────────────────

export type OfferSheetResult =
    | { submitted: true;  offerSheet: PendingOfferSheet; updatedMarket: LeagueFAMarket }
    | { submitted: false; reason: string };

export function processOfferSheet(
    market: LeagueFAMarket,
    offeringTeam: Team,
    player: Player,
    offer: {
        salary: number;
        years: number;
        signingType?: SigningType;  // 비어있으면 캡 스페이스로 체결
        option?: import('../../types/player').ContractOption;
        noTrade?: boolean;
        tradeKicker?: number;
    },
    tendencySeed: string,
    currentSeasonYear: number,
    currentDate: string,
): OfferSheetResult {
    const entry = market.entries.find(e => e.playerId === player.id);
    if (!entry || entry.status !== 'available') {
        return { submitted: false, reason: '이미 서명이 완료된 선수입니다.' };
    }
    if (!entry.isRFA || !entry.originalTeamId) {
        return { submitted: false, reason: 'RFA 선수가 아닙니다.' };
    }
    if (entry.originalTeamId === offeringTeam.id) {
        return { submitted: false, reason: '자팀 RFA에는 오퍼시트를 제출할 수 없습니다.' };
    }

    const yos = currentSeasonYear - (player.draftYear ?? currentSeasonYear);
    const { maxAllowed, vetMin } = calcYOSBounds(yos, LEAGUE_FINANCIALS.SALARY_CAP, player);

    let slotCap: number;
    if (offer.signingType === undefined) {
        slotCap = getCapSpaceCap(offeringTeam, maxAllowed);
    } else {
        const availableSlots = getAvailableSigningSlots(offeringTeam, player, undefined, market.usedMLE, false, undefined, currentSeasonYear);
        if (!availableSlots.includes(offer.signingType)) {
            return { submitted: false, reason: `${offer.signingType} 슬롯을 사용할 수 없습니다.` };
        }
        slotCap = getSlotSalaryCap(offer.signingType, offeringTeam, player, maxAllowed, vetMin);
    }

    if (offer.salary > slotCap) {
        return { submitted: false, reason: `제시 연봉이 슬롯 상한($${(slotCap / 1_000_000).toFixed(1)}M)을 초과합니다.` };
    }
    if (offer.salary < vetMin) {
        return { submitted: false, reason: `제시 연봉이 베테랑 미니멈($${(vetMin / 1_000_000).toFixed(1)}M) 미만입니다.` };
    }

    const maxYears = offer.signingType === undefined ? 4 : (MAX_YEARS_BY_SLOT[offer.signingType] ?? 4);
    if (offer.years < 1 || offer.years > maxYears) {
        return { submitted: false, reason: `연수는 1~${maxYears}년 사이여야 합니다.` };
    }

    // 선수 수락 여부 판정 (RFA도 walkAway/askingSalary 기준 동일)
    let effectiveSalary = offer.salary;
    if (offer.option?.type === 'player') effectiveSalary *= 1.08;
    if (offer.option?.type === 'team')   effectiveSalary *= (1 - (1 / Math.max(1, offer.years)) * 0.55);
    if (offer.noTrade)                   effectiveSalary *= 1.05;
    if (offer.tradeKicker)               effectiveSalary *= (1 + offer.tradeKicker * 0.3);

    const seed = `${tendencySeed}:offersheet:${offeringTeam.id}:${player.id}`;
    const playerAccepts = evaluateFAOffer(
        { salary: effectiveSalary, years: offer.years },
        {
            askingSalary:    entry.askingSalary,
            walkAwaySalary:  entry.walkAwaySalary,
            targetSalary:    entry.walkAwaySalary,
            askingYears:     entry.askingYears,
            marketValueScore: entry.marketValueScore,
            faRole:          entry.faRole,
        },
        seed,
    );
    if (!playerAccepts) {
        return { submitted: false, reason: '선수가 오퍼시트를 거절했습니다.' };
    }

    const contract = buildContract(offer.salary, offer.years, 'free_agent', offer.option, offer.noTrade, offer.tradeKicker, offer.signingType);

    const offerSheet: PendingOfferSheet = {
        id: `os_${offeringTeam.id}_${player.id}_${Date.now()}`,
        playerId:        player.id,
        offeringTeamId:  offeringTeam.id,
        originalTeamId:  entry.originalTeamId,
        salary:          offer.salary,
        years:           offer.years,
        contract,
        signingType:     offer.signingType,
        submittedDate:   currentDate,
        matchDeadline:   addDaysToDate(currentDate, 3),
    };

    const updatedMarket: LeagueFAMarket = {
        ...market,
        entries: market.entries.map(e =>
            e.playerId === player.id ? { ...e, status: 'pending_match' } : e
        ),
        pendingOfferSheets: [...(market.pendingOfferSheets ?? []), offerSheet],
        usedMLE: offer.signingType === 'non_taxpayer_mle' || offer.signingType === 'taxpayer_mle' || offer.signingType === 'biannual_exception'
            ? { ...market.usedMLE, [offeringTeam.id]: true }
            : { ...market.usedMLE },
    };

    return { submitted: true, offerSheet, updatedMarket };
}

// ─────────────────────────────────────────────────────────────
// 5. 만료 오퍼시트 처리
// ─────────────────────────────────────────────────────────────

export interface ResolvedOfferSheet {
    sheet: PendingOfferSheet;
    matched: boolean;
    isUserOriginalTeam: boolean;
    isUserOfferingTeam: boolean;
}

export function resolveExpiredOfferSheets(
    market: LeagueFAMarket,
    teams: Team[],
    faPlayerMap: Record<string, Player>,
    currentDate: string,
    userTeamId: string,
): {
    updatedMarket: LeagueFAMarket;
    updatedTeams: Team[];
    resolved: ResolvedOfferSheet[];
} {
    const expired = (market.pendingOfferSheets ?? []).filter(s => s.matchDeadline <= currentDate);
    if (expired.length === 0) {
        return { updatedMarket: market, updatedTeams: teams, resolved: [] };
    }

    const updatedTeams: Team[] = teams.map(t => ({ ...t, roster: [...t.roster] }));
    const updatedEntries = market.entries.map(e => ({ ...e }));
    const remaining = (market.pendingOfferSheets ?? []).filter(s => s.matchDeadline > currentDate);
    const resolved: ResolvedOfferSheet[] = [];

    for (const sheet of expired) {
        const player = faPlayerMap[sheet.playerId];
        if (!player) continue;

        const isUserOriginalTeam = sheet.originalTeamId === userTeamId;
        const isUserOfferingTeam = sheet.offeringTeamId === userTeamId;

        // 원소속팀의 매칭 결정 (CPU만 자동 판정; 유저는 인박스 결정 결과를 sheet.decision으로 기록)
        let matched: boolean;
        if (isUserOriginalTeam) {
            // 유저가 결정한 경우 sheet.decision을 참조
            matched = (sheet as any).decision === 'matched';
        } else {
            // CPU 원소속팀: OVR >= 80이고 페이롤 여유 있으면 매칭
            const originalTeam = updatedTeams.find(t => t.id === sheet.originalTeamId);
            if (originalTeam) {
                const payroll = calcTeamPayroll(originalTeam);
                matched = player.ovr >= 80 && payroll < LEAGUE_FINANCIALS.FIRST_APRON;
            } else {
                matched = false;
            }
        }

        // 로스터 추가
        const receivingTeamId = matched ? sheet.originalTeamId : sheet.offeringTeamId;
        const receivingTeam = updatedTeams.find(t => t.id === receivingTeamId);
        if (receivingTeam) {
            const signedPlayer: Player = {
                ...player,
                contract: sheet.contract,
                salary: sheet.salary,
                contractYears: sheet.years,
                teamTenure: matched ? (player.teamTenure ?? 0) + 1 : 0,
            };
            receivingTeam.roster.push(signedPlayer);
        }

        // 엔트리 업데이트
        const entryIdx = updatedEntries.findIndex(e => e.playerId === sheet.playerId);
        if (entryIdx !== -1) {
            updatedEntries[entryIdx] = {
                ...updatedEntries[entryIdx],
                status:       'signed',
                signedTeamId: receivingTeamId,
                signedYears:  sheet.years,
                signedSalary: sheet.salary,
            };
        }

        resolved.push({ sheet, matched, isUserOriginalTeam, isUserOfferingTeam });
    }

    const updatedMarket: LeagueFAMarket = {
        ...market,
        entries: updatedEntries,
        pendingOfferSheets: remaining,
    };

    return { updatedMarket, updatedTeams, resolved };
}

// ─────────────────────────────────────────────────────────────
// Helper: 팀의 FA 롤별 커버리지 (최고 OVR)
// ─────────────────────────────────────────────────────────────

function getRoleCoverage(team: Team): Record<FARole, number> {
    const roles: FARole[] = ['lead_guard', 'combo_guard', '3and_d', 'shot_creator', 'stretch_big', 'rim_big', 'floor_big'];
    const coverage: Record<FARole, number> = {} as Record<FARole, number>;
    for (const role of roles) {
        coverage[role] = team.roster
            .filter(p => determineFARole(p) === role)
            .reduce((max, p) => Math.max(max, p.ovr), 0);
    }
    return coverage;
}
