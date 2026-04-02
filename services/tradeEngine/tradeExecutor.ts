
import { Player, Team } from '../../types';
import { LeaguePickAssets, DraftPickAsset } from '../../types/draftAssets';
import {
    PersistentPickRef,
    TradeDetails,
    TradePlayerRef,
    Transaction,
    LeagueTradeBlocks,
} from '../../types/trade';
import { calculatePlayerOvr } from '../../utils/constants';
import { checkTradeLegality, checkTradeLegalityDetailed, checkNTCViolation } from './salaryRules';
import { checkStepienRule } from './stepienRule';
import { TRADE_CONFIG as C } from './tradeConfig';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface TradeExecutionPayload {
    teamAId: string;
    teamBId: string;
    teamASentPlayers: string[];          // player IDs (A가 내보내는 선수)
    teamASentPicks: PersistentPickRef[]; // A가 내보내는 픽
    teamBSentPlayers: string[];          // player IDs (B가 내보내는 선수)
    teamBSentPicks: PersistentPickRef[]; // B가 내보내는 픽
    date: string;
    season?: string;
    isUserTrade: boolean;
}

export interface TradeValidationError {
    type: 'salary' | 'ntc' | 'stepien' | 'roster_min' | 'pick_not_found' | 'player_not_found';
    message: string;
    teamId?: string;
    players?: Player[];  // NTC 위반 선수 목록
}

export const MAX_ROSTER_SIZE = 15;

export interface TradeExecutionResult {
    success: boolean;
    errors: TradeValidationError[];
    transaction?: Transaction;
    updatedPickAssets?: LeaguePickAssets;
    /** 트레이드 후 MAX_ROSTER_SIZE 초과 팀 ID 목록 */
    overflowTeams?: string[];
}

// ──────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────

function validateTrade(
    payload: TradeExecutionPayload,
    teams: Team[],
    leaguePickAssets: LeaguePickAssets
): TradeValidationError[] {
    const errors: TradeValidationError[] = [];
    const teamA = teams.find(t => t.id === payload.teamAId);
    const teamB = teams.find(t => t.id === payload.teamBId);
    if (!teamA || !teamB) {
        errors.push({ type: 'player_not_found', message: '팀을 찾을 수 없습니다.' });
        return errors;
    }

    // 선수 검증
    const aSentPlayers = payload.teamASentPlayers.map(id => teamA.roster.find(p => p.id === id)).filter(Boolean) as Player[];
    const bSentPlayers = payload.teamBSentPlayers.map(id => teamB.roster.find(p => p.id === id)).filter(Boolean) as Player[];

    if (aSentPlayers.length !== payload.teamASentPlayers.length) {
        errors.push({ type: 'player_not_found', message: 'A팀 선수를 찾을 수 없습니다.', teamId: payload.teamAId });
    }
    if (bSentPlayers.length !== payload.teamBSentPlayers.length) {
        errors.push({ type: 'player_not_found', message: 'B팀 선수를 찾을 수 없습니다.', teamId: payload.teamBId });
    }
    if (errors.length > 0) return errors;

    // 픽 검증
    for (const pickRef of payload.teamASentPicks) {
        const teamPicks = leaguePickAssets[payload.teamAId] || [];
        const found = teamPicks.find(p =>
            p.season === pickRef.season && p.round === pickRef.round && p.originalTeamId === pickRef.originalTeamId
        );
        if (!found) {
            errors.push({ type: 'pick_not_found', message: `A팀이 ${pickRef.season} ${pickRef.round}R (${pickRef.originalTeamId}) 픽을 보유하고 있지 않습니다.`, teamId: payload.teamAId });
        }
    }
    for (const pickRef of payload.teamBSentPicks) {
        const teamPicks = leaguePickAssets[payload.teamBId] || [];
        const found = teamPicks.find(p =>
            p.season === pickRef.season && p.round === pickRef.round && p.originalTeamId === pickRef.originalTeamId
        );
        if (!found) {
            errors.push({ type: 'pick_not_found', message: `B팀이 ${pickRef.season} ${pickRef.round}R (${pickRef.originalTeamId}) 픽을 보유하고 있지 않습니다.`, teamId: payload.teamBId });
        }
    }
    if (errors.length > 0) return errors;

    // NTC 검사
    const ntcA = checkNTCViolation(aSentPlayers);
    if (ntcA.length > 0) {
        errors.push({ type: 'ntc', message: `NTC 선수 트레이드 불가: ${ntcA.map(p => p.name).join(', ')}`, teamId: payload.teamAId, players: ntcA });
    }
    const ntcB = checkNTCViolation(bSentPlayers);
    if (ntcB.length > 0) {
        errors.push({ type: 'ntc', message: `NTC 선수 트레이드 불가: ${ntcB.map(p => p.name).join(', ')}`, teamId: payload.teamBId, players: ntcB });
    }

    // 샐러리 체크 (A 입장: incoming=bSentPlayers, outgoing=aSentPlayers)
    const salaryA = checkTradeLegalityDetailed(teamA, bSentPlayers, aSentPlayers);
    if (!salaryA.valid) {
        errors.push({ type: 'salary', message: `${teamA.name}: ${salaryA.reason}`, teamId: payload.teamAId });
    }
    const salaryB = checkTradeLegalityDetailed(teamB, aSentPlayers, bSentPlayers);
    if (!salaryB.valid) {
        errors.push({ type: 'salary', message: `${teamB.name}: ${salaryB.reason}`, teamId: payload.teamBId });
    }

    // 로스터 최소 인원 체크
    const aNewSize = teamA.roster.length - aSentPlayers.length + bSentPlayers.length;
    if (aNewSize < C.DEPTH.MIN_ROSTER_SIZE) {
        errors.push({ type: 'roster_min', message: `${teamA.name}: 트레이드 후 로스터가 ${aNewSize}명 (최소 ${C.DEPTH.MIN_ROSTER_SIZE}명)`, teamId: payload.teamAId });
    }
    const bNewSize = teamB.roster.length - bSentPlayers.length + aSentPlayers.length;
    if (bNewSize < C.DEPTH.MIN_ROSTER_SIZE) {
        errors.push({ type: 'roster_min', message: `${teamB.name}: 트레이드 후 로스터가 ${bNewSize}명 (최소 ${C.DEPTH.MIN_ROSTER_SIZE}명)`, teamId: payload.teamBId });
    }

    // 스테피언 룰 (픽이 포함된 경우만)
    if (payload.teamASentPicks.length > 0) {
        const aPickAssets = (leaguePickAssets[payload.teamAId] || []) as DraftPickAsset[];
        const aSentPickAssets = payload.teamASentPicks.map(ref =>
            aPickAssets.find(p => p.season === ref.season && p.round === ref.round && p.originalTeamId === ref.originalTeamId)
        ).filter(Boolean) as DraftPickAsset[];

        const stepienA = checkStepienRule(payload.teamAId, aPickAssets, aSentPickAssets, payload.date);
        if (!stepienA.valid) {
            errors.push({ type: 'stepien', message: stepienA.violationReason || '스테피언 룰 위반', teamId: payload.teamAId });
        }
    }
    if (payload.teamBSentPicks.length > 0) {
        const bPickAssets = (leaguePickAssets[payload.teamBId] || []) as DraftPickAsset[];
        const bSentPickAssets = payload.teamBSentPicks.map(ref =>
            bPickAssets.find(p => p.season === ref.season && p.round === ref.round && p.originalTeamId === ref.originalTeamId)
        ).filter(Boolean) as DraftPickAsset[];

        const stepienB = checkStepienRule(payload.teamBId, bPickAssets, bSentPickAssets, payload.date);
        if (!stepienB.valid) {
            errors.push({ type: 'stepien', message: stepienB.violationReason || '스테피언 룰 위반', teamId: payload.teamBId });
        }
    }

    return errors;
}

// ──────────────────────────────────────────────
// Execution
// ──────────────────────────────────────────────

/**
 * 통합 트레이드 실행기.
 * 선수, 픽, 혼합 모든 트레이드를 하나의 경로로 처리.
 *
 * 실행 순서:
 * 1. 사전 검증 (CBA, NTC, 스테피언, 로스터)
 * 2. 선수 로스터 스왑
 * 3. 픽 소유권 이전
 * 4. 트레이드 블록 정리
 * 5. Transaction 레코드 생성
 */
export function executeTrade(
    payload: TradeExecutionPayload,
    teams: Team[],
    leaguePickAssets: LeaguePickAssets,
    leagueTradeBlocks?: LeagueTradeBlocks
): TradeExecutionResult {
    // 1. 검증
    const errors = validateTrade(payload, teams, leaguePickAssets);
    if (errors.length > 0) {
        return { success: false, errors };
    }

    const teamA = teams.find(t => t.id === payload.teamAId)!;
    const teamB = teams.find(t => t.id === payload.teamBId)!;

    // 2. 선수 로스터 스왑
    const aSentPlayerIds = new Set(payload.teamASentPlayers);
    const bSentPlayerIds = new Set(payload.teamBSentPlayers);

    const aSentPlayers = teamA.roster.filter(p => aSentPlayerIds.has(p.id));
    const bSentPlayers = teamB.roster.filter(p => bSentPlayerIds.has(p.id));

    // teamTenure 리셋: Bird Rights는 새 팀에서 재산정되어야 함
    aSentPlayers.forEach(p => { p.teamTenure = 0; });
    bSentPlayers.forEach(p => { p.teamTenure = 0; });

    teamA.roster = [...teamA.roster.filter(p => !aSentPlayerIds.has(p.id)), ...bSentPlayers];
    teamB.roster = [...teamB.roster.filter(p => !bSentPlayerIds.has(p.id)), ...aSentPlayers];

    // 3. 픽 소유권 이전
    const updatedPickAssets = { ...leaguePickAssets };

    for (const pickRef of payload.teamASentPicks) {
        transferPick(updatedPickAssets, payload.teamAId, payload.teamBId, pickRef, payload.date);
    }
    for (const pickRef of payload.teamBSentPicks) {
        transferPick(updatedPickAssets, payload.teamBId, payload.teamAId, pickRef, payload.date);
    }

    // 4. 트레이드 블록 정리
    if (leagueTradeBlocks) {
        cleanupTradeBlock(leagueTradeBlocks, payload.teamAId, payload.teamASentPlayers, payload.teamASentPicks);
        cleanupTradeBlock(leagueTradeBlocks, payload.teamBId, payload.teamBSentPlayers, payload.teamBSentPicks);
    }

    // 5. Transaction 레코드 생성
    const transaction = buildTransaction(payload, teamA, teamB, aSentPlayers, bSentPlayers);

    // 로스터 초과 팀 검출
    const overflowTeams: string[] = [];
    if (teamA.roster.length > MAX_ROSTER_SIZE) overflowTeams.push(teamA.id);
    if (teamB.roster.length > MAX_ROSTER_SIZE) overflowTeams.push(teamB.id);

    return {
        success: true,
        errors: [],
        transaction,
        updatedPickAssets,
        ...(overflowTeams.length > 0 && { overflowTeams }),
    };
}

/**
 * 검증만 수행 (실행 없음). UI에서 사전 확인용.
 */
export function validateTradeOnly(
    payload: TradeExecutionPayload,
    teams: Team[],
    leaguePickAssets: LeaguePickAssets
): TradeValidationError[] {
    return validateTrade(payload, teams, leaguePickAssets);
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function transferPick(
    pickAssets: LeaguePickAssets,
    fromTeamId: string,
    toTeamId: string,
    pickRef: PersistentPickRef,
    date: string
): void {
    const fromPicks = pickAssets[fromTeamId] || [];
    const pickIdx = fromPicks.findIndex(p =>
        p.season === pickRef.season && p.round === pickRef.round && p.originalTeamId === pickRef.originalTeamId
    );

    if (pickIdx === -1) return;

    const [pick] = fromPicks.splice(pickIdx, 1);
    pick.currentTeamId = toTeamId;
    pick.tradedDate = date;

    if (!pickAssets[toTeamId]) pickAssets[toTeamId] = [];
    pickAssets[toTeamId].push(pick);
}

function cleanupTradeBlock(
    blocks: LeagueTradeBlocks,
    teamId: string,
    sentPlayerIds: string[],
    sentPicks: PersistentPickRef[]
): void {
    const block = blocks[teamId];
    if (!block) return;

    const sentPlayerSet = new Set(sentPlayerIds);
    block.entries = block.entries.filter(entry => {
        if (entry.type === 'player' && entry.playerId && sentPlayerSet.has(entry.playerId)) {
            return false;
        }
        if (entry.type === 'pick' && entry.pick) {
            return !sentPicks.some(sp =>
                sp.season === entry.pick!.season &&
                sp.round === entry.pick!.round &&
                sp.originalTeamId === entry.pick!.originalTeamId
            );
        }
        return true;
    });
}

function buildTransaction(
    payload: TradeExecutionPayload,
    teamA: Team,
    teamB: Team,
    aSentPlayers: Player[],
    bSentPlayers: Player[]
): Transaction {
    const id = crypto.randomUUID();

    const aPlayerRefs: TradePlayerRef[] = aSentPlayers.map(p => ({ playerId: p.id, playerName: p.name }));
    const bPlayerRefs: TradePlayerRef[] = bSentPlayers.map(p => ({ playerId: p.id, playerName: p.name }));

    const details: TradeDetails = {
        counterpartTeamId: payload.teamBId,
        players: (aPlayerRefs.length > 0 || bPlayerRefs.length > 0) ? {
            sent: aPlayerRefs,
            received: bPlayerRefs,
        } : undefined,
        picks: (payload.teamASentPicks.length > 0 || payload.teamBSentPicks.length > 0) ? {
            sent: payload.teamASentPicks,
            received: payload.teamBSentPicks,
        } : undefined,
    };

    // 설명 문자열 생성
    const aSentDesc = [
        ...aSentPlayers.map(p => `${p.name}(${calculatePlayerOvr(p)})`),
        ...payload.teamASentPicks.map(p => `${p.season} ${p.round}R`),
    ].join(', ');
    const bSentDesc = [
        ...bSentPlayers.map(p => `${p.name}(${calculatePlayerOvr(p)})`),
        ...payload.teamBSentPicks.map(p => `${p.season} ${p.round}R`),
    ].join(', ');

    return {
        id,
        date: payload.date,
        type: 'Trade',
        teamId: payload.teamAId,
        season: payload.season,
        description: `${teamA.name} → ${aSentDesc} ↔ ${teamB.name} → ${bSentDesc}`,
        details,
    };
}
