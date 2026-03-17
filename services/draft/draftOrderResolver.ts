/**
 * 드래프트 오더 해석기
 *
 * 로터리 결과(finalOrder) + 리그 픽 자산(LeaguePickAssets) →
 * 보호/스왑/소유권을 반영한 최종 60픽 드래프트 오더 생성.
 *
 * 순수 함수 — React/DB 의존 없음.
 */

import {
    LeaguePickAssets,
    DraftPickAsset,
    PickProtection,
    ResolvedPick,
    ProtectionResult,
    SwapResult,
    ResolvedDraftOrder,
} from '../../types/draftAssets';
// ── 헬퍼 ──

function teamAbbr(teamId: string): string {
    return teamId.toUpperCase();
}

/** pickAssets를 deep clone (mutation 방지) */
function cloneAssets(assets: LeaguePickAssets): LeaguePickAssets {
    const clone: LeaguePickAssets = {};
    for (const [key, arr] of Object.entries(assets)) {
        clone[key] = arr.map(a => ({ ...a, protection: a.protection ? { ...a.protection } : undefined, swapRight: a.swapRight ? { ...a.swapRight } : undefined }));
    }
    return clone;
}

/** 모든 팀의 픽 자산을 flat하게 반환 */
function allPicks(assets: LeaguePickAssets): DraftPickAsset[] {
    return Object.values(assets).flat();
}

/** 특정 시즌/라운드의 거래된 픽 (originalTeamId ≠ currentTeamId) 찾기 */
function findTradedPicks(assets: LeaguePickAssets, season: number, round: 1 | 2): DraftPickAsset[] {
    return allPicks(assets).filter(
        p => p.season === season && p.round === round && p.originalTeamId !== p.currentTeamId && p.protection,
    );
}

/** 특정 시즌/라운드의 스왑 권리가 있는 픽 찾기 */
function findSwapPicks(assets: LeaguePickAssets, season: number, round: 1 | 2): DraftPickAsset[] {
    return allPicks(assets).filter(
        p => p.season === season && p.round === round && p.swapRight,
    );
}

// ── 보호 판정 ──

function isProtectionTriggered(protection: PickProtection, slot: number): boolean {
    switch (protection.type) {
        case 'top':
            return slot <= (protection.threshold ?? 0);
        case 'lottery':
            return slot <= 14;
        case 'none':
            return false;
    }
}

// ── 메인 함수 ──

/**
 * 로터리 결과 + 픽 자산 → 보호/스왑/소유권 반영된 최종 60픽 드래프트 오더
 *
 * @param finalOrder 로터리 엔진 결과 (30팀, index=슬롯-1)
 * @param pickAssets 리그 전체 픽 소유 현황
 * @param draftSeason 현재 드래프트 시즌 (예: 2026)
 */
export function resolveDraftOrder(
    finalOrder: string[],
    pickAssets: LeaguePickAssets,
    draftSeason: number,
): ResolvedDraftOrder {
    const assets = cloneAssets(pickAssets);
    const protectionResults: ProtectionResult[] = [];
    const swapResults: SwapResult[] = [];

    // 1라운드 순서 = finalOrder (로터리 결과 그대로)
    // 2라운드 순서 = finalOrder 역순 (역전적 순서)
    const round1Order = [...finalOrder]; // index 0 = 1픽
    const round2Order = [...finalOrder].reverse(); // index 0 = 31픽

    // 라운드별 처리
    for (const round of [1, 2] as (1 | 2)[]) {
        const order = round === 1 ? round1Order : round2Order;

        // ── 1단계: 보호 조건 판정 ──
        const tradedPicks = findTradedPicks(assets, draftSeason, round);
        for (const pick of tradedPicks) {
            const slot = order.indexOf(pick.originalTeamId) + 1; // 1-based
            if (slot === 0) continue; // 해당 라운드에 없는 팀 (불가능하지만 방어)

            const protection = pick.protection!;
            const triggered = isProtectionTriggered(protection, slot);

            const result: ProtectionResult = {
                round,
                originalTeamId: pick.originalTeamId,
                currentTeamId: pick.currentTeamId,
                slot,
                protection,
                triggered,
            };

            if (triggered) {
                // 보호 발동 → 픽이 원래 팀에 잔류
                // pickAssets에서 해당 픽의 currentTeamId를 원래 팀으로 되돌림
                revertPickOwnership(assets, pick);

                // fallback 처리
                if (protection.fallbackSeason && protection.fallbackRound) {
                    result.fallbackAction = `${protection.fallbackSeason} ${protection.fallbackRound}R로 이관`;
                    addFallbackPick(assets, pick, protection.fallbackSeason, protection.fallbackRound);
                } else if (protection.fallbackRound === 2) {
                    result.fallbackAction = `${draftSeason} 2R로 이관`;
                    addFallbackPick(assets, pick, draftSeason, 2);
                } else {
                    result.fallbackAction = '픽 소멸';
                }
            } else {
                // 보호 미발동 → conveyed (currentTeamId 유지)
            }

            protectionResults.push(result);
        }

        // ── 2단계: 스왑 권리 실행 ──
        const swapPicks = findSwapPicks(assets, draftSeason, round);
        for (const pick of swapPicks) {
            const swap = pick.swapRight!;
            const beneficiarySlot = order.indexOf(swap.beneficiaryTeamId) + 1;
            const originSlot = order.indexOf(swap.originTeamId) + 1;

            if (beneficiarySlot === 0 || originSlot === 0) continue;

            // 보호 발동으로 원래 팀에 잔류한 픽은 스왑 대상에서 제외
            const originPickStillTraded = allPicks(assets).some(
                p => p.season === draftSeason && p.round === round &&
                    p.originalTeamId === swap.originTeamId &&
                    p.currentTeamId !== swap.originTeamId,
            );

            // beneficiary 슬롯이 더 나쁘면(숫자 큼) 스왑 실행
            const shouldSwap = beneficiarySlot > originSlot && !originPickStillTraded;

            const result: SwapResult = {
                round,
                beneficiaryTeamId: swap.beneficiaryTeamId,
                originTeamId: swap.originTeamId,
                beneficiarySlot,
                originSlot,
                swapped: shouldSwap,
            };

            if (shouldSwap) {
                // 스왑 실행: beneficiary가 origin의 슬롯을 가져감
                executeSwap(assets, draftSeason, round, swap.beneficiaryTeamId, swap.originTeamId);
            }

            swapResults.push(result);
        }
    }

    // ── 3단계: 최종 60픽 오더 생성 ──
    const picks: ResolvedPick[] = [];

    for (const round of [1, 2] as (1 | 2)[]) {
        const order = round === 1 ? round1Order : round2Order;
        for (let i = 0; i < order.length; i++) {
            const pickNumber = round === 1 ? i + 1 : 30 + i + 1;
            const originalTeamId = order[i];
            const currentTeamId = findCurrentOwner(assets, draftSeason, round, originalTeamId);
            const note = buildNote(originalTeamId, currentTeamId, protectionResults, swapResults, round, i + 1);

            picks.push({ pickNumber, round, originalTeamId, currentTeamId, note });
        }
    }

    return { picks, protectionResults, swapResults, updatedPickAssets: assets };
}

// ── 내부 헬퍼 ──

/** 보호 발동 시 픽 소유권을 원래 팀으로 되돌림 */
function revertPickOwnership(assets: LeaguePickAssets, pick: DraftPickAsset): void {
    // currentTeamId의 배열에서 해당 픽 제거
    const currentArr = assets[pick.currentTeamId];
    if (currentArr) {
        const idx = currentArr.findIndex(
            p => p.season === pick.season && p.round === pick.round && p.originalTeamId === pick.originalTeamId,
        );
        if (idx >= 0) currentArr.splice(idx, 1);
    }

    // originalTeamId 배열에 원래 팀 소유 픽으로 추가
    if (!assets[pick.originalTeamId]) assets[pick.originalTeamId] = [];
    assets[pick.originalTeamId].push({
        season: pick.season,
        round: pick.round,
        originalTeamId: pick.originalTeamId,
        currentTeamId: pick.originalTeamId,
    });
}

/** fallback 픽 생성 (보호 발동 시 다음 시즌/라운드로 이관) */
function addFallbackPick(
    assets: LeaguePickAssets,
    originalPick: DraftPickAsset,
    fallbackSeason: number,
    fallbackRound: 1 | 2,
): void {
    const newPick: DraftPickAsset = {
        season: fallbackSeason,
        round: fallbackRound,
        originalTeamId: originalPick.originalTeamId,
        currentTeamId: originalPick.currentTeamId,
        protection: originalPick.protection?.fallbackSeason
            ? undefined // fallback 픽은 기본적으로 무보호 (원본 보호 조건의 fallback 체인은 draftPickTrades에서 별도 정의)
            : undefined,
        tradedDate: originalPick.tradedDate,
    };

    if (!assets[originalPick.currentTeamId]) assets[originalPick.currentTeamId] = [];
    assets[originalPick.currentTeamId].push(newPick);
}

/** 스왑 실행: beneficiary와 origin의 픽 소유권 교환 */
function executeSwap(
    assets: LeaguePickAssets,
    season: number,
    round: 1 | 2,
    beneficiaryTeamId: string,
    originTeamId: string,
): void {
    // beneficiary가 origin 팀의 원래 슬롯 픽을 가져감
    // origin이 beneficiary 팀의 원래 슬롯 픽을 가져감

    // origin의 own pick을 찾아서 beneficiary에게 이전
    const originPickIdx = findOwnPickIndex(assets, season, round, originTeamId);
    // beneficiary의 own pick을 찾아서 origin에게 이전
    const benePickIdx = findOwnPickIndex(assets, season, round, beneficiaryTeamId);

    if (originPickIdx !== null) {
        const [originPick] = assets[originPickIdx.holder].splice(originPickIdx.idx, 1);
        originPick.currentTeamId = beneficiaryTeamId;
        if (!assets[beneficiaryTeamId]) assets[beneficiaryTeamId] = [];
        assets[beneficiaryTeamId].push(originPick);
    }

    if (benePickIdx !== null) {
        const [benePick] = assets[benePickIdx.holder].splice(benePickIdx.idx, 1);
        benePick.currentTeamId = originTeamId;
        if (!assets[originTeamId]) assets[originTeamId] = [];
        assets[originTeamId].push(benePick);
    }
}

/** 특정 팀의 own pick (originalTeamId === teamId) 인덱스를 찾음 */
function findOwnPickIndex(
    assets: LeaguePickAssets,
    season: number,
    round: 1 | 2,
    teamId: string,
): { holder: string; idx: number } | null {
    for (const [holder, picks] of Object.entries(assets)) {
        const idx = picks.findIndex(
            p => p.season === season && p.round === round && p.originalTeamId === teamId,
        );
        if (idx >= 0) return { holder, idx };
    }
    return null;
}

/** 특정 슬롯(originalTeamId)의 현재 소유자 찾기 */
function findCurrentOwner(
    assets: LeaguePickAssets,
    season: number,
    round: 1 | 2,
    originalTeamId: string,
): string {
    for (const picks of Object.values(assets)) {
        const found = picks.find(
            p => p.season === season && p.round === round && p.originalTeamId === originalTeamId,
        );
        if (found) return found.currentTeamId;
    }
    // 픽 자산에 없으면 원래 팀이 보유
    return originalTeamId;
}

/** 변동사항 노트 생성 */
function buildNote(
    originalTeamId: string,
    currentTeamId: string,
    protectionResults: ProtectionResult[],
    swapResults: SwapResult[],
    round: 1 | 2,
    slotInRound: number,
): string | undefined {
    // 보호 발동 결과 확인
    const protResult = protectionResults.find(
        p => p.round === round && p.originalTeamId === originalTeamId && p.triggered,
    );
    if (protResult) {
        const protLabel = protResult.protection.type === 'top'
            ? `Top ${protResult.protection.threshold}`
            : protResult.protection.type === 'lottery' ? 'Lottery' : '';
        return `보호 발동 (${protLabel}) → ${protResult.fallbackAction}`;
    }

    // 스왑 결과 확인
    const swapResult = swapResults.find(
        p => p.round === round && p.swapped &&
            (p.originTeamId === originalTeamId || p.beneficiaryTeamId === originalTeamId),
    );
    if (swapResult) {
        const otherTeam = swapResult.beneficiaryTeamId === originalTeamId
            ? swapResult.originTeamId
            : swapResult.beneficiaryTeamId;
        return `스왑 ↔ ${teamAbbr(otherTeam)} (${swapResult.originSlot}↔${swapResult.beneficiarySlot})`;
    }

    // 보호 미발동 (conveyed)
    const conveyedResult = protectionResults.find(
        p => p.round === round && p.originalTeamId === originalTeamId && !p.triggered,
    );
    if (conveyedResult) {
        return `${teamAbbr(currentTeamId)} 소유 (트레이드)`;
    }

    // 단순 트레이드 (보호 없이 거래된 픽)
    if (originalTeamId !== currentTeamId) {
        return `${teamAbbr(currentTeamId)} 소유 (트레이드)`;
    }

    return undefined;
}
