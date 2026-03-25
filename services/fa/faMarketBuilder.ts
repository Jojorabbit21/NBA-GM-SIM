import type { Player, PlayerContract } from '../../types/player';
import type { Team } from '../../types/team';
import type { FARole, FAMarketEntry, LeagueFAMarket, SigningType } from '../../types/fa';
import { LEAGUE_FINANCIALS, SIGNING_EXCEPTIONS } from '../../utils/constants';
import {
    buildMarketConditions,
    calcFADemand,
    evaluateFAOffer,
    determineFARole,
} from './faValuation';
import { isRoseRuleEligible } from './contractEligibility';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

export function calcTeamPayroll(team: Team): number {
    const rosterTotal = team.roster.reduce((sum, p) => sum + (p.salary ?? 0), 0);
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
                payroll < LEAGUE_FINANCIALS.FIRST_APRON;
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

/** 팀이 해당 선수에게 사용 가능한 계약 슬롯 목록 반환 */
export function getAvailableSigningSlots(
    team: Team,
    player: Player,
    playerPrevTeamId: string | undefined,
    usedMLE: Record<string, boolean>,
    isBuyout?: boolean,
    prevTeamTenure?: number,  // Bird Rights 판정용 — teamTenure 리셋 전 값 (FAMarketEntry.prevTeamTenure)
): SigningType[] {
    const slots: SigningType[] = [];
    const payroll = calcTeamPayroll(team);
    const { SALARY_CAP, FIRST_APRON, SECOND_APRON } = LEAGUE_FINANCIALS;

    // 바이아웃 선수 에이프런 영입 제한
    if (isBuyout) {
        if (payroll >= SECOND_APRON) return [];   // 2차 에이프런 초과: 완전 불가
        if (payroll >= FIRST_APRON) {             // 1차 에이프런 초과: vet_min만 가능
            if (payroll < SALARY_CAP) slots.push('cap_space');
            slots.push('vet_min');
            return slots;
        }
    }

    // 캡 스페이스
    if (payroll < SALARY_CAP) slots.push('cap_space');

    // MLE
    const mleUsed = usedMLE[team.id] ?? false;
    if (!mleUsed) {
        if (payroll < FIRST_APRON)  slots.push('non_tax_mle');
        else if (payroll < SECOND_APRON) slots.push('tax_mle');
    }

    // Bird Rights (자팀 FA만)
    // prevTeamTenure 우선 사용 — teamTenure는 processOffseason()에서 0으로 리셋되므로
    // FA 등록 시점에 저장해 둔 prevTeamTenure(리셋 전 값)를 Bird Rights 판정 기준으로 삼는다
    if (playerPrevTeamId === team.id) {
        const tenureForBird = prevTeamTenure ?? player.teamTenure ?? 0;
        const bird = getBirdRightsLevel(tenureForBird);
        if (bird === 'full')  slots.push('bird_full');
        if (bird === 'early') slots.push('bird_early');
        if (bird === 'non')   slots.push('bird_non');
    }

    // 베테랑 미니멈 (항상 가능)
    slots.push('vet_min');

    return slots;
}

/** 슬롯별 연봉 상한 계산 */
function getSlotSalaryCap(
    slot: SigningType,
    team: Team,
    player: Player,
    maxAllowed: number,
    vetMin: number,
): number {
    const payroll = calcTeamPayroll(team);
    const remainingCap = Math.max(0, LEAGUE_FINANCIALS.SALARY_CAP - payroll);

    switch (slot) {
        case 'cap_space':  return Math.min(remainingCap, maxAllowed);
        case 'non_tax_mle': return Math.min(SIGNING_EXCEPTIONS.NON_TAX_MLE, maxAllowed);
        case 'tax_mle':    return Math.min(SIGNING_EXCEPTIONS.TAXPAYER_MLE, maxAllowed);
        case 'bird_full':  return maxAllowed;
        case 'bird_early': {
            const base = player.prevSalary ?? player.salary ?? 0;
            return Math.min(maxAllowed, Math.max(base * 1.75, LEAGUE_FINANCIALS.SALARY_CAP * 1.05));
        }
        case 'bird_non': {
            const base = player.prevSalary ?? player.salary ?? 0;
            return Math.min(maxAllowed, base * 1.20);
        }
        case 'vet_min':    return vetMin;
        default:           return vetMin;
    }
}

function calcYOSBounds(yos: number, player?: Player): { maxAllowed: number; vetMin: number } {
    const cap = LEAGUE_FINANCIALS.SALARY_CAP;
    // 데릭 로즈 룰: YOS 0~6 + 루키 3시즌 내 수상 → 30%
    const roseRule = yos < 7 && !!player && isRoseRuleEligible(player);
    const maxAllowed = yos >= 10 ? cap * 0.35 : yos >= 7 ? cap * 0.30 : roseRule ? cap * 0.30 : cap * 0.25;
    const vetMin     = yos >= 7  ? 3_000_000  : yos >= 4 ? 2_200_000  : 1_500_000;
    return { maxAllowed, vetMin };
}

function buildContract(
    salary: number, years: number, type: PlayerContract['type'],
    option?: import('../types/player').ContractOption,
    noTrade?: boolean,
    tradeKicker?: number,
): PlayerContract {
    const contract: PlayerContract = { years: Array(years).fill(Math.round(salary)), currentYear: 0, type };
    if (option)                   contract.option      = option;
    if (noTrade)                  contract.noTrade     = true;
    if (tradeKicker && tradeKicker > 0) contract.tradeKicker = tradeKicker;
    return contract;
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
        );

        const interestedTeamIds = calcInterestedTeamIds(teams, player, demand.faRole);

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
        });
    }

    return {
        openDate,
        closeDate,
        entries,
        usedMLE: {},
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

            // 슬롯 확인
            const slots = getAvailableSigningSlots(
                teamObj,
                player,
                undefined, // CPU는 Bird Rights 자팀 여부 간단히 생략
                updatedMarket.usedMLE,
                entry.isBuyout,
            );
            if (slots.length === 0) continue;

            // 예산에 맞는 최선 슬롯 선택
            const yos = currentSeasonYear - (player.draftYear ?? currentSeasonYear);
            const { maxAllowed, vetMin } = calcYOSBounds(yos, player);

            let bestSlot: SigningType | null = null;
            let offerSalary = 0;

            for (const slot of slots) {
                const cap = getSlotSalaryCap(slot, teamObj, player, maxAllowed, vetMin);
                // CPU는 walkAway의 105%~askingSalary 사이로 오퍼
                const cpuOffer = Math.min(cap, Math.round(entry.walkAwaySalary * 1.05));
                if (cpuOffer >= entry.walkAwaySalary) {
                    bestSlot = slot;
                    offerSalary = cpuOffer;
                    break;
                }
            }
            if (!bestSlot || offerSalary <= 0) continue;

            const offerYears = Math.min(entry.askingYears, bestSlot === 'tax_mle' ? 2 : 4);
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
                // 계약 체결
                const contractType = bestSlot === 'vet_min' ? 'min' : 'veteran';
                const contract = buildContract(offerSalary, offerYears, contractType);
                const signedPlayer: Player = {
                    ...player,
                    contract,
                    salary: offerSalary,
                    contractYears: offerYears,
                    teamTenure: 0,
                };
                teamObj.roster.push(signedPlayer);

                // MLE 사용 처리
                if (bestSlot === 'non_tax_mle' || bestSlot === 'tax_mle') {
                    updatedMarket.usedMLE[team.id] = true;
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

                // Set-Off Rule: B팀 총 계약액만큼 원팀 waive 데드캡 차감
                if (entry.prevTeamId) {
                    const prevTeam = updatedTeams.find(t => t.id === entry.prevTeamId);
                    if (prevTeam) {
                        const bTeamTotal = offerSalary * offerYears;
                        prevTeam.deadMoney = (prevTeam.deadMoney ?? []).reduce((acc, d) => {
                            if (d.playerId === player.id && d.releaseType === 'waive') {
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
    | { accepted: true;  contract: PlayerContract; signingType: SigningType }
    | { accepted: false; reason: string };

export function processUserOffer(
    market: LeagueFAMarket,
    team: Team,
    player: Player,
    playerPrevTeamId: string | undefined,
    offer: {
        salary: number;
        years: number;
        signingType: SigningType;
        option?: import('../types/player').ContractOption;
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
    const { maxAllowed, vetMin } = calcYOSBounds(yos, player);

    // 슬롯 유효성 검증 — entry.prevTeamTenure로 Bird Rights 판정 (teamTenure 리셋 전 값)
    const availableSlots = getAvailableSigningSlots(team, player, playerPrevTeamId, market.usedMLE, entry.isBuyout, entry.prevTeamTenure);
    if (!availableSlots.includes(offer.signingType)) {
        return { accepted: false, reason: `${offer.signingType} 슬롯을 사용할 수 없습니다.` };
    }

    // 연봉 상한 검증
    const slotCap = getSlotSalaryCap(offer.signingType, team, player, maxAllowed, vetMin);
    if (offer.salary > slotCap) {
        return { accepted: false, reason: `제시 연봉이 슬롯 상한($${(slotCap / 1_000_000).toFixed(1)}M)을 초과합니다.` };
    }
    if (offer.salary < vetMin) {
        return { accepted: false, reason: `제시 연봉이 베테랑 미니멈($${(vetMin / 1_000_000).toFixed(1)}M) 미만입니다.` };
    }

    // 연수 검증
    const maxYears = offer.signingType === 'tax_mle' ? 2 : 5;
    if (offer.years < 1 || offer.years > maxYears) {
        return { accepted: false, reason: `연수는 1~${maxYears}년 사이여야 합니다.` };
    }

    // 계약 옵션에 따른 체감 연봉 보정 (수락 판정용)
    let effectiveSalary = offer.salary;
    if (offer.option?.type === 'player') effectiveSalary *= 1.08;  // 선수 옵션: 이탈 자유 → 선수에게 유리
    // 팀 옵션: 마지막 1년이 불확실 → 계약 연수 비례 패널티 (짧을수록 타격 큼)
    if (offer.option?.type === 'team')   effectiveSalary *= (1 - (1 / offer.years) * 0.55);
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
        return { accepted: false, reason: '선수가 오퍼를 거절했습니다.' };
    }

    const contractType = offer.signingType === 'vet_min' ? 'min' : 'veteran';
    const contract = buildContract(offer.salary, offer.years, contractType, offer.option, offer.noTrade, offer.tradeKicker);

    return { accepted: true, contract, signingType: offer.signingType };
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
