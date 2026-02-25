
import { Player, Team, TradeOffer } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { TRADE_CONFIG as C } from './tradeConfig';
import { getPlayerTradeValue, calculatePackageTrueValue } from './tradeValue';
import { analyzeTeamSituation } from './teamAnalysis';
import { checkTradeLegality } from './salaryRules';

export function generateOffers(
    tradingPlayers: Player[],
    myTeam: Team,
    allTeams: Team[],
    desiredPositions: string[] = []
): TradeOffer[] {
    const offers: TradeOffer[] = [];
    const outgoingValue = calculatePackageTrueValue(tradingPlayers);

    for (const otherTeam of allTeams) {
        if (otherTeam.id === myTeam.id) continue;

        const needs = analyzeTeamSituation(otherTeam);
        let interestScore = 0;
        const interestReasons: string[] = [];

        tradingPlayers.forEach(p => {
            const ovr = calculatePlayerOvr(p);

            // Weak position match
            if (needs.weakPositions.some(pos => p.position.includes(pos))) {
                interestScore += 2;
                interestReasons.push(`${p.name}: 약점 포지션(${p.position}) 보강`);
            }

            // Stat needs
            if (needs.statNeeds.includes('DEF') && p.def > 75) {
                interestScore += 1;
                if (!interestReasons.some(r => r.includes('수비'))) interestReasons.push(`${p.name}: 수비력 보강`);
            }
            if (needs.statNeeds.includes('3PT') && p.out > 75) {
                interestScore += 1;
                if (!interestReasons.some(r => r.includes('슈팅'))) interestReasons.push(`${p.name}: 외곽 슈팅 보강`);
            }
            if (needs.statNeeds.includes('REB') && p.reb > 75) {
                interestScore += 1;
                if (!interestReasons.some(r => r.includes('리바운드'))) interestReasons.push(`${p.name}: 리바운드 보강`);
            }

            // Team timeline fit
            if (needs.isSeller && p.age <= 24) {
                interestScore += 2;
                interestReasons.push(`${p.name}: 리빌딩 코어 (유망주)`);
            }
            if (needs.isContender && ovr >= 80) {
                interestScore += 2;
                interestReasons.push(`${p.name}: 윈나우 조각 (즉시전력)`);
            }
        });

        // Desired position bonus: if other team has players at user's desired positions
        if (desiredPositions.length > 0) {
            const hasDesiredPos = otherTeam.roster.some(p =>
                desiredPositions.some(pos => p.position.includes(pos)) && calculatePlayerOvr(p) >= 72
            );
            if (hasDesiredPos) interestScore += 1;
        }

        if (interestScore <= 0) continue;

        // Build package from other team's tradeable players
        const tradeable = otherTeam.roster
            .filter(p => calculatePlayerOvr(p) < C.OFFERS.SUPERSTAR_PROTECTION_OVR)
            .sort((a, b) => getPlayerTradeValue(b) - getPlayerTradeValue(a));

        const pkg: Player[] = [];
        for (const p of tradeable) {
            const potentialPkg = [...pkg, p];
            const potentialVal = calculatePackageTrueValue(potentialPkg);
            const maxVal = outgoingValue * (1.0 + interestScore * C.OFFERS.INTEREST_VALUE_MARGIN);

            // Salary legality check (both sides)
            if (!checkTradeLegality(otherTeam, tradingPlayers, potentialPkg)) continue;
            if (!checkTradeLegality(myTeam, potentialPkg, tradingPlayers)) continue;

            if (potentialVal < maxVal && pkg.length < C.DEPTH.MAX_PACKAGE_SIZE) {
                pkg.push(p);
            }
        }

        const pkgValue = calculatePackageTrueValue(pkg);

        if (pkg.length > 0 && pkgValue >= outgoingValue * C.OFFERS.MIN_VALUE_RATIO) {
            offers.push({
                teamId: otherTeam.id,
                teamName: otherTeam.name,
                players: pkg,
                diffValue: pkgValue - outgoingValue,
                analysis: [
                    `관심도: ${interestScore}/10`,
                    ...[...new Set(interestReasons)].slice(0, 3)
                ]
            });
        }
    }

    return offers
        .sort((a, b) => b.diffValue - a.diffValue)
        .slice(0, C.OFFERS.MAX_OFFERS);
}
