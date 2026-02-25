
import { Player, Team, TradeOffer } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { TRADE_CONFIG as C } from './tradeConfig';
import { getPlayerTradeValue, calculatePackageTrueValue } from './tradeValue';
import { analyzeTeamSituation } from './teamAnalysis';
import { checkTradeLegality } from './salaryRules';

interface ScoredAsset {
    player: Player;
    score: number;
    reasons: string[];
}

export function generateCounters(
    targetPlayers: Player[],
    targetTeam: Team,
    myTeam: Team,
    allTeams: Team[]
): TradeOffer[] {
    const targetValue = calculatePackageTrueValue(targetPlayers);
    const needs = analyzeTeamSituation(targetTeam);
    const myAssets = myTeam.roster.filter(p => p.health !== 'Injured');

    // Star protection: if requesting OVR 88+, must offer premium asset
    const targetBestOvr = Math.max(...targetPlayers.map(p => calculatePlayerOvr(p)));
    const requirePremiumAsset = targetBestOvr >= C.COUNTER.STAR_PROTECTION_OVR;

    const scoredAssets: ScoredAsset[] = myAssets.map(p => {
        const ovr = calculatePlayerOvr(p);
        let score = 0;
        const reasons: string[] = [];

        if (needs.weakPositions.some(pos => p.position.includes(pos))) {
            score += 2;
            reasons.push(`${p.name}: 상대팀 약점 포지션(${p.position}) 보강`);
        }
        if (needs.statNeeds.includes('DEF') && p.def > 75) {
            score += 1;
            reasons.push(`${p.name}: 수비력 필요`);
        }
        if (needs.statNeeds.includes('3PT') && p.out > 75) {
            score += 1;
            reasons.push(`${p.name}: 슈팅 능력 필요`);
        }
        if (needs.statNeeds.includes('REB') && p.reb > 75) {
            score += 1;
            reasons.push(`${p.name}: 리바운드 필요`);
        }
        if (needs.isSeller && p.age <= 24) {
            score += 2;
            reasons.push(`${p.name}: 리빌딩 코어 (유망주)`);
        }
        if (needs.isContender && ovr >= 80) {
            score += 2;
            reasons.push(`${p.name}: 윈나우 조각 (즉시전력)`);
        }

        // Penalize non-premium assets when star is requested
        if (requirePremiumAsset && ovr < C.COUNTER.PREMIUM_ASSET_OVR && p.potential < C.COUNTER.PREMIUM_POTENTIAL) {
            score -= 5;
        }

        score += getPlayerTradeValue(p) / 1000;
        return { player: p, score, reasons };
    }).sort((a, b) => b.score - a.score);

    const offers: TradeOffer[] = [];

    const buildPackage = (
        available: ScoredAsset[],
        valueMultiplier: number
    ): { players: Player[]; value: number; reasons: string[] } => {
        const pkg: Player[] = [];
        let currentVal = 0;
        const reasons: string[] = [];
        let hasPremiumAsset = false;

        for (const asset of available) {
            if (pkg.some(p => p.id === asset.player.id)) continue;

            const potentialPkg = [...pkg, asset.player];

            // Salary legality (both sides)
            if (!checkTradeLegality(myTeam, targetPlayers, potentialPkg)) continue;
            if (!checkTradeLegality(targetTeam, potentialPkg, targetPlayers)) continue;

            if (pkg.length >= C.COUNTER.MAX_PACKAGE_SIZE) break;

            // Overpay prevention
            const potentialVal = calculatePackageTrueValue(potentialPkg);
            if (potentialVal > targetValue * C.COUNTER.OVERPAY_CEILING) continue;

            const ovr = calculatePlayerOvr(asset.player);
            if (requirePremiumAsset && (ovr >= C.COUNTER.PREMIUM_ASSET_OVR || asset.player.potential >= C.COUNTER.PREMIUM_POTENTIAL)) {
                hasPremiumAsset = true;
            }

            pkg.push(asset.player);
            currentVal = potentialVal;
            reasons.push(...asset.reasons);

            if (currentVal >= targetValue * valueMultiplier) break;
        }

        // If star requested but no premium asset in package → reject
        if (requirePremiumAsset && !hasPremiumAsset) {
            return { players: [], value: 0, reasons: [] };
        }

        return { players: pkg, value: currentVal, reasons: [...new Set(reasons)] };
    };

    // P1: Balanced offer
    const p1 = buildPackage(scoredAssets, C.COUNTER.BALANCED_MULTIPLIER);
    if (p1.players.length > 0 && p1.value >= targetValue) {
        offers.push({
            teamId: targetTeam.id,
            teamName: targetTeam.name,
            players: p1.players,
            diffValue: p1.value - targetValue,
            analysis: ['역제안 (균형)', ...p1.reasons.slice(0, 3)]
        });
    }

    // P2: Alternative offer (exclude P1's top player)
    if (p1.players.length > 0) {
        const altAssets = scoredAssets.filter(a => a.player.id !== p1.players[0].id);
        const p2 = buildPackage(altAssets, C.COUNTER.ALTERNATIVE_MULTIPLIER);
        if (p2.players.length > 0 && p2.value >= targetValue) {
            offers.push({
                teamId: targetTeam.id,
                teamName: targetTeam.name,
                players: p2.players,
                diffValue: p2.value - targetValue,
                analysis: ['역제안 (대안)', ...p2.reasons.slice(0, 3)]
            });
        }
    }

    return offers;
}
