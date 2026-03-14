
import { Player, Team } from '../../types';
import { LeaguePickAssets, DraftPickAsset } from '../../types/draftAssets';
import {
    LeagueTradeBlocks,
    TeamTradeBlock,
    TradeBlockEntry,
    TradePickRef,
    TradePlayerRef,
    PersistentPickRef,
    PersistentTradeOffer,
    LeagueTradeOffers,
} from '../../types/trade';
import { calculatePlayerOvr } from '../../utils/constants';
import { TRADE_CONFIG as C } from './tradeConfig';
import { analyzeTeamSituation, TeamNeeds } from './teamAnalysis';
import { getPlayerTradeValue, calculatePackageTrueValue } from './tradeValue';
import { getPickTradeValue } from './pickValueEngine';
import { checkTradeLegality, checkNTCViolation } from './salaryRules';
import { checkStepienRule } from './stepienRule';

// ──────────────────────────────────────────────
// 1. CPU 트레이드 블록 동기화
// ──────────────────────────────────────────────

/**
 * 모든 CPU 팀의 트레이드 블록을 갱신.
 * 기존 cpuTradeSimulator의 buildTeamTradeProfile tradeableAssets 로직을 재사용.
 */
export function syncCPUTradeBlocks(
    teams: Team[],
    leagueTradeBlocks: LeagueTradeBlocks,
    leaguePickAssets: LeaguePickAssets,
    myTeamId: string,
    currentDate: string
): void {
    const CC = C.CPU_TRADE;
    const positions = ['PG', 'SG', 'SF', 'PF', 'C'];

    for (const team of teams) {
        if (team.id === myTeamId) continue;

        const roster = team.roster;
        if (roster.length <= C.DEPTH.MIN_ROSTER_SIZE) {
            leagueTradeBlocks[team.id] = { teamId: team.id, entries: [] };
            continue;
        }

        const entries: TradeBlockEntry[] = [];

        // 포지션별 뎁스 맵
        const positionDepth: Record<string, Player[]> = {};
        positions.forEach(pos => {
            positionDepth[pos] = roster
                .filter(p => p.position.includes(pos))
                .sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
        });

        const sortedByOvr = [...roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));

        // 선수 블록 판단
        roster.forEach(p => {
            const ovr = calculatePlayerOvr(p);
            if (ovr >= CC.UNTOUCHABLE_OVR) return;
            if (p.health === 'Injured') return;
            if (p.contract?.noTrade) return;

            let willingness = 0;

            for (const pos of positions) {
                if (!p.position.includes(pos)) continue;
                const depth = positionDepth[pos];
                const rank = depth.findIndex(d => d.id === p.id);
                if (depth.length >= 4 && rank >= depth.length - 2) willingness += 5;
                else if (depth.length >= CC.EXCESS_DEPTH_THRESHOLD && rank === depth.length - 1) willingness += 3;
            }

            if (ovr < CC.LOW_VALUE_DUMP_OVR && p.salary > CC.BAD_CONTRACT_SALARY_FLOOR) willingness += 4;

            const ovrRank = sortedByOvr.findIndex(s => s.id === p.id);
            if (ovrRank >= 12) willingness += 2;

            if (willingness > 0) {
                entries.push({ type: 'player', playerId: p.id, addedDate: currentDate });
            }
        });

        // 픽 블록: 2라운드 픽이나 먼 미래 1라운드 픽은 블록에 올림
        const teamPicks = leaguePickAssets[team.id] || [];
        const needs = analyzeTeamSituation(team);

        for (const pick of teamPicks) {
            // 컨텐더: 먼 미래 픽 내놓기 가능
            if (needs.isContender && pick.round === 1 && pick.season >= new Date(currentDate).getFullYear() + 3) {
                entries.push({
                    type: 'pick',
                    pick: { season: pick.season, round: pick.round, originalTeamId: pick.originalTeamId },
                    addedDate: currentDate,
                });
            }
            // 2라운드 픽은 누구나
            if (pick.round === 2) {
                entries.push({
                    type: 'pick',
                    pick: { season: pick.season, round: pick.round, originalTeamId: pick.originalTeamId },
                    addedDate: currentDate,
                });
            }
            // 셀러: 가까운 미래 1라운드도 내놓음 (다른 팀 원래 픽)
            if (needs.isSeller && pick.round === 1 && pick.originalTeamId !== team.id) {
                entries.push({
                    type: 'pick',
                    pick: { season: pick.season, round: pick.round, originalTeamId: pick.originalTeamId },
                    addedDate: currentDate,
                });
            }
        }

        const prevLastEvaluated = leagueTradeBlocks[team.id]?.lastEvaluated;
        leagueTradeBlocks[team.id] = { teamId: team.id, entries, lastEvaluated: prevLastEvaluated };
    }
}

// ──────────────────────────────────────────────
// 2. 유저 블록 평가 → 오퍼 생성
// ──────────────────────────────────────────────

/**
 * CPU 팀들이 유저의 트레이드 블록을 평가하고 오퍼를 생성.
 * 쓰로틀: CPU 팀당 3일 간격, 하루 최대 1건.
 */
export function evaluateUserTradeBlock(
    myTeamId: string,
    teams: Team[],
    leagueTradeBlocks: LeagueTradeBlocks,
    leaguePickAssets: LeaguePickAssets,
    leagueTradeOffers: LeagueTradeOffers,
    currentDate: string
): PersistentTradeOffer[] {
    const TB = C.TRADE_BLOCK;
    const userBlock = leagueTradeBlocks[myTeamId];
    if (!userBlock || userBlock.entries.length === 0) return [];

    const userTeam = teams.find(t => t.id === myTeamId);
    if (!userTeam) return [];

    // 하루 최대 오퍼 제한
    const todayOffers = leagueTradeOffers.offers.filter(
        o => o.toTeamId === myTeamId && o.createdDate === currentDate
    );
    if (todayOffers.length >= TB.MAX_OFFERS_PER_DAY) return [];

    const newOffers: PersistentTradeOffer[] = [];
    const cpuTeams = teams.filter(t => t.id !== myTeamId);

    // CPU 팀별 평가
    for (const cpuTeam of cpuTeams) {
        if (newOffers.length + todayOffers.length >= TB.MAX_OFFERS_PER_DAY) break;

        // 쓰로틀 체크
        const cpuBlock = leagueTradeBlocks[cpuTeam.id];
        if (cpuBlock?.lastEvaluated) {
            const daysSince = daysBetween(cpuBlock.lastEvaluated, currentDate);
            if (daysSince < TB.CPU_EVAL_INTERVAL_DAYS) continue;
        }

        // 이미 이 팀의 pending 오퍼가 있으면 스킵
        const hasPending = leagueTradeOffers.offers.some(
            o => o.fromTeamId === cpuTeam.id && o.toTeamId === myTeamId && o.status === 'pending'
        );
        if (hasPending) continue;

        const offer = tryGenerateOffer(cpuTeam, userTeam, userBlock, leagueTradeBlocks, leaguePickAssets, currentDate);

        // 평가 완료 → 쓰로틀 타이머 갱신 (오퍼 성공 여부 무관)
        if (leagueTradeBlocks[cpuTeam.id]) {
            leagueTradeBlocks[cpuTeam.id].lastEvaluated = currentDate;
        }

        if (offer) {
            newOffers.push(offer);
            leagueTradeOffers.offers.push(offer);
        }
    }

    return newOffers;
}

/**
 * 특정 CPU 팀이 유저 블록을 보고 오퍼를 생성할 수 있는지 시도.
 */
function tryGenerateOffer(
    cpuTeam: Team,
    userTeam: Team,
    userBlock: TeamTradeBlock,
    leagueTradeBlocks: LeagueTradeBlocks,
    leaguePickAssets: LeaguePickAssets,
    currentDate: string
): PersistentTradeOffer | null {
    const cpuNeeds = analyzeTeamSituation(cpuTeam);

    // 유저 블록에서 CPU 니즈에 맞는 자산 찾기
    const desiredPlayers: Player[] = [];
    const desiredPicks: DraftPickAsset[] = [];

    for (const entry of userBlock.entries) {
        if (entry.type === 'player' && entry.playerId) {
            const player = userTeam.roster.find(p => p.id === entry.playerId);
            if (!player) continue;
            const ovr = calculatePlayerOvr(player);

            // CPU 니즈 매칭
            let matched = false;
            for (const weak of cpuNeeds.weakPositions) {
                if (player.position.includes(weak) && ovr >= 70) { matched = true; break; }
            }
            if (!matched && cpuNeeds.isContender && ovr >= 78) matched = true;
            if (!matched && cpuNeeds.isSeller && player.age <= 25) matched = true;

            if (matched) desiredPlayers.push(player);
        }

        if (entry.type === 'pick' && entry.pick) {
            const pickAsset = (leaguePickAssets[userTeam.id] || []).find(p =>
                p.season === entry.pick!.season && p.round === entry.pick!.round && p.originalTeamId === entry.pick!.originalTeamId
            );
            if (pickAsset) desiredPicks.push(pickAsset);
        }
    }

    if (desiredPlayers.length === 0 && desiredPicks.length === 0) return null;

    // 요청할 자산 가치 계산
    const requestedPlayerValue = desiredPlayers.reduce((sum, p) => sum + getPlayerTradeValue(p), 0);
    const requestedPickValue = desiredPicks.reduce((sum, p) => sum + getPickTradeValue(p, [userTeam, cpuTeam], currentDate), 0);
    const totalRequestedValue = requestedPlayerValue + requestedPickValue;

    if (totalRequestedValue <= 0) return null;

    // CPU가 내놓을 자산 구성
    const cpuBlock = leagueTradeBlocks[cpuTeam.id];
    const cpuBlockPlayerIds = new Set((cpuBlock?.entries || []).filter(e => e.type === 'player' && e.playerId).map(e => e.playerId!));

    // 블록에 있는 선수 + 벤치 끝자리 선수
    const cpuOfferable = cpuTeam.roster
        .filter(p => {
            if (p.contract?.noTrade) return false;
            if (p.health === 'Injured') return false;
            const ovr = calculatePlayerOvr(p);
            if (ovr >= C.CPU_TRADE.UNTOUCHABLE_OVR) return false;
            return cpuBlockPlayerIds.has(p.id) || ovr < 80;
        })
        .sort((a, b) => getPlayerTradeValue(b) - getPlayerTradeValue(a));

    // 가치 매칭: CPU 선수 조합으로 requestedValue의 85~120%에 도달
    const offeredPlayers: Player[] = [];
    let offeredValue = 0;
    const targetMin = totalRequestedValue * 0.85;
    const targetMax = totalRequestedValue * 1.20;

    for (const p of cpuOfferable) {
        if (offeredPlayers.length >= C.DEPTH.MAX_PACKAGE_SIZE) break;
        if (offeredValue >= targetMin) break;
        offeredPlayers.push(p);
        offeredValue += getPlayerTradeValue(p);
    }

    // 픽으로 가치 보충
    const offeredPickRefs: PersistentPickRef[] = [];
    if (offeredValue < targetMin) {
        const cpuPicks = leaguePickAssets[cpuTeam.id] || [];
        const cpuBlockPicks = (cpuBlock?.entries || []).filter(e => e.type === 'pick' && e.pick);

        for (const entry of cpuBlockPicks) {
            if (offeredValue >= targetMin) break;
            const pickAsset = cpuPicks.find(p =>
                p.season === entry.pick!.season && p.round === entry.pick!.round && p.originalTeamId === entry.pick!.originalTeamId
            );
            if (!pickAsset) continue;
            const pickVal = getPickTradeValue(pickAsset, [userTeam, cpuTeam], currentDate);
            offeredPickRefs.push({
                season: pickAsset.season,
                round: pickAsset.round,
                originalTeamId: pickAsset.originalTeamId,
                currentTeamId: cpuTeam.id,
                protection: pickAsset.protection ? describeProtection(pickAsset.protection) : undefined,
                protectionDetail: pickAsset.protection,
            });
            offeredValue += pickVal;
        }
    }

    if (offeredValue < targetMin) return null;
    if (offeredPlayers.length === 0 && offeredPickRefs.length === 0) return null;

    // CBA 검증 (선수만 — 픽은 샐러리 없음)
    if (desiredPlayers.length > 0 || offeredPlayers.length > 0) {
        if (!checkTradeLegality(cpuTeam, desiredPlayers, offeredPlayers)) return null;
        if (!checkTradeLegality(userTeam, offeredPlayers, desiredPlayers)) return null;
    }

    // 스테피언 룰 (CPU가 픽을 내보내는 경우)
    if (offeredPickRefs.length > 0) {
        const cpuPicks = leaguePickAssets[cpuTeam.id] || [];
        const sentPickAssets = offeredPickRefs.map(ref =>
            cpuPicks.find(p => p.season === ref.season && p.round === ref.round && p.originalTeamId === ref.originalTeamId)
        ).filter(Boolean) as DraftPickAsset[];
        const stepien = checkStepienRule(cpuTeam.id, cpuPicks, sentPickAssets, currentDate);
        if (!stepien.valid) return null;
    }

    // 로스터 최소 인원
    const cpuNewSize = cpuTeam.roster.length - offeredPlayers.length + desiredPlayers.length;
    const userNewSize = userTeam.roster.length - desiredPlayers.length + offeredPlayers.length;
    if (cpuNewSize < C.DEPTH.MIN_ROSTER_SIZE || userNewSize < C.DEPTH.MIN_ROSTER_SIZE) return null;

    // 오퍼 생성
    const offerId = `offer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const expiresDate = addDays(currentDate, C.TRADE_BLOCK.OFFER_EXPIRY_DAYS);

    const analysis: string[] = [];
    if (cpuNeeds.weakPositions.length > 0) analysis.push(`${cpuTeam.name}: ${cpuNeeds.weakPositions.join(',')} 포지션 보강 필요`);
    if (cpuNeeds.isContender) analysis.push(`${cpuTeam.name}: 플레이오프 경쟁력 강화 목적`);
    if (cpuNeeds.isSeller) analysis.push(`${cpuTeam.name}: 리빌딩 자산 확보`);

    return {
        id: offerId,
        fromTeamId: cpuTeam.id,
        toTeamId: userTeam.id,
        createdDate: currentDate,
        expiresDate,
        status: 'pending',
        offeredPlayers: offeredPlayers.map(p => ({ playerId: p.id, playerName: p.name })),
        offeredPicks: offeredPickRefs,
        requestedPlayers: desiredPlayers.map(p => ({ playerId: p.id, playerName: p.name })),
        requestedPicks: desiredPicks.map(p => ({
            season: p.season,
            round: p.round,
            originalTeamId: p.originalTeamId,
            currentTeamId: userTeam.id,
            protection: p.protection ? describeProtection(p.protection) : undefined,
            protectionDetail: p.protection,
        })),
        analysis,
    };
}

// ──────────────────────────────────────────────
// 3. 유저 제안 CPU 평가
// ──────────────────────────────────────────────

/**
 * 유저가 보낸 pending 오퍼(fromTeamId === myTeamId)를 CPU가 평가.
 * 가치 비교 후 수락/거절.
 */
export function evaluateUserProposals(
    myTeamId: string,
    teams: Team[],
    leaguePickAssets: LeaguePickAssets,
    leagueTradeOffers: LeagueTradeOffers,
    currentDate: string
): { accepted: PersistentTradeOffer[]; rejected: PersistentTradeOffer[] } {
    const accepted: PersistentTradeOffer[] = [];
    const rejected: PersistentTradeOffer[] = [];

    const userProposals = leagueTradeOffers.offers.filter(
        o => o.fromTeamId === myTeamId && o.status === 'pending'
    );

    for (const proposal of userProposals) {
        const cpuTeam = teams.find(t => t.id === proposal.toTeamId);
        if (!cpuTeam) { proposal.status = 'rejected'; rejected.push(proposal); continue; }

        // CPU가 받는 가치 (유저가 보내는 것)
        const receivedPlayerValue = proposal.offeredPlayers.reduce((sum, ref) => {
            const p = teams.find(t => t.id === myTeamId)?.roster.find(r => r.id === ref.playerId);
            return sum + (p ? getPlayerTradeValue(p) : 0);
        }, 0);
        const receivedPickValue = proposal.offeredPicks.reduce((sum, ref) => {
            const pick = (leaguePickAssets[myTeamId] || []).find(p =>
                p.season === ref.season && p.round === ref.round && p.originalTeamId === ref.originalTeamId
            );
            return sum + (pick ? getPickTradeValue(pick, teams, currentDate) : 0);
        }, 0);

        // CPU가 내보내는 가치 (유저가 요청하는 것)
        const sentPlayerValue = proposal.requestedPlayers.reduce((sum, ref) => {
            const p = cpuTeam.roster.find(r => r.id === ref.playerId);
            return sum + (p ? getPlayerTradeValue(p) : 0);
        }, 0);
        const sentPickValue = proposal.requestedPicks.reduce((sum, ref) => {
            const pick = (leaguePickAssets[cpuTeam.id] || []).find(p =>
                p.season === ref.season && p.round === ref.round && p.originalTeamId === ref.originalTeamId
            );
            return sum + (pick ? getPickTradeValue(pick, teams, currentDate) : 0);
        }, 0);

        const receivedTotal = receivedPlayerValue + receivedPickValue;
        const sentTotal = sentPlayerValue + sentPickValue;

        // CPU 수락 기준: 받는 가치가 보내는 가치의 90% 이상
        const cpuNeeds = analyzeTeamSituation(cpuTeam);
        const valueThreshold = cpuNeeds.isSeller ? 0.80 : 0.90;

        if (receivedTotal >= sentTotal * valueThreshold) {
            proposal.status = 'accepted';
            accepted.push(proposal);
        } else {
            proposal.status = 'rejected';
            rejected.push(proposal);
        }
    }

    return { accepted, rejected };
}

// ──────────────────────────────────────────────
// 4. 오퍼 만료 처리
// ──────────────────────────────────────────────

export function expireOldOffers(
    leagueTradeOffers: LeagueTradeOffers,
    currentDate: string
): PersistentTradeOffer[] {
    const expired: PersistentTradeOffer[] = [];

    for (const offer of leagueTradeOffers.offers) {
        if (offer.status === 'pending' && offer.expiresDate <= currentDate) {
            offer.status = 'expired';
            expired.push(offer);
        }
    }

    // 오래된 비활성 오퍼 정리 (30일 이상 전)
    leagueTradeOffers.offers = leagueTradeOffers.offers.filter(o => {
        if (o.status === 'pending') return true;
        return daysBetween(o.createdDate, currentDate) < 30;
    });

    return expired;
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function daysBetween(dateA: string, dateB: string): number {
    const a = new Date(dateA).getTime();
    const b = new Date(dateB).getTime();
    return Math.floor(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}

function addDays(date: string, days: number): string {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
}

function describeProtection(protection: { type: string; threshold?: number }): string {
    if (protection.type === 'top' && protection.threshold) {
        return `Top ${protection.threshold} protected`;
    }
    if (protection.type === 'lottery') return 'Lottery protected';
    return '';
}
