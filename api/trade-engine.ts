
import { createClient } from '@supabase/supabase-js';

// --- Types ---
interface Player {
  id: string;
  name: string;
  position: string;
  age: number;
  salary: number;
  contractYears: number;
  ovr: number;
  potential: number;
  health?: 'Healthy' | 'Injured' | 'Day-to-Day'; 
  injuryType?: string;
  returnDate?: string;
  // Stats
  def: number;
  out: number; 
  reb: number;
  plm: number;
  ins: number; 
  ath: number;
  intDef: number;
  perDef: number;
  height: number;
  [key: string]: any;
}

interface Team {
  id: string;
  name: string;
  roster: Player[];
  wins?: number;
  losses?: number;
  salaryCap?: number;
  luxuryTaxLine?: number;
}

interface TradeOffer {
  teamId: string;
  teamName: string;
  players: Player[];
  diffValue: number;
  analysis?: string[];
}

interface TeamNeeds {
    weakPositions: string[];
    strongPositions: string[];
    statNeeds: string[]; // 'DEF', 'REB', '3PT'
    isContender: boolean;
    isSeller: boolean; 
    capSpace: number;
    isTaxPayer: boolean;
}

// --- Configuration ---
const TRADE_CONFIG = {
    BASE: { 
        REPLACEMENT_LEVEL_OVR: 40, 
        // [Difficulty Update] Value Exponent Increased (3.0 -> 3.8)
        // Makes high OVR players exponentially more valuable than mid-tier players.
        VALUE_EXPONENT: 3.8, 
        SUPERSTAR_PREMIUM_THRESHOLD: 90,
        SUPERSTAR_MULTIPLIER: 1.8 
    },
    CONTRACT: {
        VALUE_MULTIPLIER: 1.1, 
        BAD_CONTRACT_PENALTY: 0.6, // Penalize bad contracts more heavily
    },
    NEEDS: { 
        POSITION_BONUS: 0.25,
        STAT_BONUS: 0.15,
        SALARY_DUMP_BONUS: 0.2 
    },
    SALARY: {
        CAP_LINE: 140,
        TAX_LINE: 170, 
        APRON_1: 178,
        APRON_2: 189
    },
    INJURY: { 
        DTD_PENALTY: 0.90, 
        INJURED_PENALTY: 0.10 
    },
    DEPTH: {
        MAX_CORE_ASSETS_IN_DEAL: 2, 
        MIN_ROSTER_SIZE: 13,
        // [Difficulty Update] Diminishing Returns for Quantity
        // 1st player: 100% value, 2nd: 80%, 3rd: 20%, 4th+: 5%
        // Prevents "5 trash players for 1 star" exploits.
        PACKAGE_WEIGHTS: [1.0, 0.8, 0.2, 0.05, 0.05]
    }
};

const normalizeName = (name: string): string => {
    if (!name) return "";
    return name.replace(/[\s\.\,\-\u3000\u00a0\u200b]+/g, '').replace(/(II|III|IV|Jr|Sr)$/i, '').toLowerCase().trim();
};

// --- Check Legal Trade (Server Side Validation) ---
function checkTradeLegality(team: Team, incoming: Player[], outgoing: Player[]): boolean {
    const currentCap = team.roster.reduce((sum, p) => sum + p.salary, 0);
    const inSalary = incoming.reduce((sum, p) => sum + p.salary, 0);
    const outSalary = outgoing.reduce((sum, p) => sum + p.salary, 0);

    const { TAX_LINE, APRON_1, APRON_2 } = TRADE_CONFIG.SALARY;

    if (currentCap >= APRON_2) {
        // Rule A: Aggregation Ban (Sending >1 players for 1 player)
        if (outgoing.length > 1 && incoming.length === 1) return false;
        // Rule B: 100% Salary Match (Can't take back more)
        if (inSalary > outSalary) return false;
    } 
    else if (currentCap >= APRON_1) {
        // Rule: 100% Salary Match
        if (inSalary > outSalary) return false;
    }
    else if (currentCap >= TAX_LINE) {
        // Rule: 110% Match
        if (inSalary > outSalary * 1.10) return false;
    }
    else {
        // Rule: 125% Match + padding (simplified)
        if (inSalary > (outSalary * 1.25) + 0.25) return false;
    }

    return true;
}

// 1. Calculate Base Trade Value (Individual)
function getPlayerTradeValue(p: Player): number {
    const C = TRADE_CONFIG;
    const safeOvr = typeof p.ovr === 'number' ? p.ovr : 70;
    const effectiveOvr = Math.max(C.BASE.REPLACEMENT_LEVEL_OVR, safeOvr);
    
    let baseValue = Math.pow(effectiveOvr - C.BASE.REPLACEMENT_LEVEL_OVR, C.BASE.VALUE_EXPONENT);

    // [Update] Sharper curve for stars
    if (safeOvr >= C.BASE.SUPERSTAR_PREMIUM_THRESHOLD) baseValue *= C.BASE.SUPERSTAR_MULTIPLIER;
    else if (safeOvr >= 85) baseValue *= 1.2; 

    // Young Talent Premium
    if (p.age <= 23 && p.potential > safeOvr) {
        const potDiff = p.potential - safeOvr;
        baseValue *= (1.0 + (potDiff * 0.08)); // Increased from 0.05
    } else if (p.age >= 32) {
        baseValue *= Math.max(0.1, 1.0 - ((p.age - 31) * 0.15)); // Steeper decline value
    }

    // Contract Context
    if (safeOvr < 78 && p.salary > 15) baseValue *= C.CONTRACT.BAD_CONTRACT_PENALTY;

    // Injury Context
    if (p.health === 'Injured') {
        baseValue *= C.INJURY.INJURED_PENALTY;
    } else if (p.health === 'Day-to-Day') {
        baseValue *= C.INJURY.DTD_PENALTY;
    }

    return Math.max(1, Math.floor(baseValue));
}

// 2. [New] Calculate Total Package Value with Diminishing Returns
function calculatePackageTrueValue(players: Player[]): number {
    // Sort by value desc (Best players first)
    const sorted = [...players].sort((a, b) => getPlayerTradeValue(b) - getPlayerTradeValue(a));
    
    let totalValue = 0;
    const weights = TRADE_CONFIG.DEPTH.PACKAGE_WEIGHTS;

    sorted.forEach((p, idx) => {
        const val = getPlayerTradeValue(p);
        const weight = idx < weights.length ? weights[idx] : 0.05; // 5% for deep bench fillers
        totalValue += (val * weight);
    });

    return totalValue;
}

// 3. Analyze Team Needs
function analyzeTeamSituation(team: Team): TeamNeeds {
    const roster = team.roster;
    const sorted = [...roster].sort((a, b) => b.ovr - a.ovr);
    const top8 = sorted.slice(0, 8);
    const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
    const weakPositions: string[] = [];
    const strongPositions: string[] = [];
    
    positions.forEach(pos => {
        const depth = roster.filter(p => p.position.includes(pos));
        const bestAtPos = depth.reduce((max, p) => p.ovr > (max?.ovr || 0) ? p : max, null as Player | null);
        if (!bestAtPos || bestAtPos.ovr < 75 || depth.length < 2) {
            weakPositions.push(pos);
        } else if (bestAtPos.ovr >= 85) {
            strongPositions.push(pos);
        }
    });

    const statNeeds: string[] = [];
    const avgDef = top8.reduce((sum, p) => sum + (p.def || 50), 0) / top8.length;
    const avgReb = top8.reduce((sum, p) => sum + (p.reb || 50), 0) / top8.length;
    const avgOut = top8.reduce((sum, p) => sum + (p.out || 50), 0) / top8.length;

    if (avgDef < 70) statNeeds.push('DEF');
    if (avgReb < 70) statNeeds.push('REB');
    if (avgOut < 70) statNeeds.push('3PT');

    const top3Ovr = sorted.slice(0, 3).reduce((sum, p) => sum + p.ovr, 0) / 3;
    const isContender = top3Ovr >= 85 || (team.wins || 0) > (team.losses || 0) + 5;
    const isSeller = !isContender && ((team.wins || 0) < (team.losses || 0) - 5);

    const currentCap = roster.reduce((sum, p) => sum + p.salary, 0);
    const capSpace = TRADE_CONFIG.SALARY.CAP_LINE - currentCap;
    const isTaxPayer = currentCap > TRADE_CONFIG.SALARY.TAX_LINE;

    return {
        weakPositions,
        strongPositions,
        statNeeds,
        isContender,
        isSeller,
        capSpace,
        isTaxPayer
    };
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    const { action, payload } = req.body;

    try {
        if (action === 'generate-offers') {
            const { myTeamId, leagueState, tradingPlayers, desiredPositions } = payload;
            const myTeam = leagueState.find((t: Team) => t.id === myTeamId);
            
            const offers: TradeOffer[] = [];
            // [Difficulty Update] Use weighted package value instead of sum
            const outgoingValue = calculatePackageTrueValue(tradingPlayers);
            
            for (const otherTeam of leagueState) {
                if (otherTeam.id === myTeamId) continue;
                const needs = analyzeTeamSituation(otherTeam);
                
                // Detailed Matching Logic
                let interestScore = 0;
                const interestReasons: string[] = [];

                tradingPlayers.forEach((p: Player) => {
                    // 1. Weak Position Check
                    if (needs.weakPositions.some(pos => p.position.includes(pos))) {
                        interestScore += 2;
                        interestReasons.push(`✅ ${p.name}: 약점 포지션(${p.position}) 보강`);
                    }
                    
                    // 2. Stat Needs Check
                    if (needs.statNeeds.includes('DEF') && p.def > 75) {
                        interestScore += 1;
                        if (!interestReasons.some(r => r.includes('수비'))) interestReasons.push(`✅ ${p.name}: 수비력 보강`);
                    }
                    if (needs.statNeeds.includes('3PT') && p.out > 75) {
                        interestScore += 1;
                        if (!interestReasons.some(r => r.includes('슈팅'))) interestReasons.push(`✅ ${p.name}: 외곽 슈팅 보강`);
                    }
                    if (needs.statNeeds.includes('REB') && p.reb > 75) {
                        interestScore += 1;
                        if (!interestReasons.some(r => r.includes('리바운드'))) interestReasons.push(`✅ ${p.name}: 리바운드 보강`);
                    }

                    // 3. Team Timeline Fit
                    if (needs.isSeller && p.age <= 24) {
                        interestScore += 2;
                        interestReasons.push(`✅ ${p.name}: 리빌딩 코어 (유망주)`);
                    }
                    if (needs.isContender && p.ovr >= 80) {
                        interestScore += 2;
                        interestReasons.push(`✅ ${p.name}: 윈나우 조각 (즉시전력)`);
                    }
                });

                if (interestScore > 0) {
                    const tradeable = otherTeam.roster
                        .filter((p: Player) => p.ovr < 94) // Harder to get superstars
                        .sort((a: Player, b: Player) => getPlayerTradeValue(b) - getPlayerTradeValue(a));
                    
                    const pkg: Player[] = [];
                    for (const p of tradeable) {
                        const currentPkgVal = calculatePackageTrueValue([...pkg, p]);
                        const maxVal = outgoingValue * (1.0 + (interestScore * 0.05)); // Tighter margin
                        
                        // Proposed Check: Will adding this player break rules?
                        const potentialPkg = [...pkg, p];
                        
                        // Check if Other Team (AI) allows sending this package
                        if (!checkTradeLegality(otherTeam, tradingPlayers, potentialPkg)) continue;
                        
                        // Check if My Team (User) allows receiving this package
                        if (!checkTradeLegality(myTeam, potentialPkg, tradingPlayers)) continue;

                        if (currentPkgVal < maxVal && pkg.length < 3) { // Smaller AI packages (Quality over Quantity)
                            pkg.push(p);
                        }
                    }
                    
                    const pkgValue = calculatePackageTrueValue(pkg);
                    
                    // [Difficulty Update] Minimum Value Threshold increased
                    if (pkg.length > 0 && pkgValue >= outgoingValue * 0.95) {
                        const uniqueReasons = [...new Set(interestReasons)];
                        
                        offers.push({
                            teamId: otherTeam.id,
                            teamName: otherTeam.name,
                            players: pkg,
                            diffValue: pkgValue - outgoingValue,
                            analysis: [
                                `AI Interest Score: ${interestScore} / 10`,
                                ...uniqueReasons.slice(0, 3) 
                            ]
                        });
                    }
                }
            }
            
            return res.status(200).json({ offers: offers.sort((a: TradeOffer, b: TradeOffer) => b.diffValue - a.diffValue).slice(0, 5) });
        }
        
        if (action === 'generate-counter-offers') {
            const { myTeamId, targetTeamId, leagueState, targetPlayers } = payload;
            const myTeam = leagueState.find((t: Team) => t.id === myTeamId);
            const targetTeam = leagueState.find((t: Team) => t.id === targetTeamId);

            if (!myTeam || !targetTeam) {
                return res.status(404).json({ message: 'Teams not found', offers: [] });
            }

            // [Difficulty Update] Use weighted package value
            const targetValue = calculatePackageTrueValue(targetPlayers);
            const needs = analyzeTeamSituation(targetTeam);
            const myAssets = myTeam.roster.filter((p: Player) => p.health !== 'Injured');

            // [Difficulty Update] Star Protection Logic
            // If user is asking for a Star (OVR 88+), they MUST send a Star (OVR 82+) or High Potential
            const targetBestOvr = Math.max(...targetPlayers.map((p: Player) => p.ovr));
            const requirePremiumAsset = targetBestOvr >= 88;

            const scoredAssets = myAssets.map((p: Player) => {
                let score = 0;
                const reasons: string[] = [];
                
                if (needs.weakPositions.some(pos => p.position.includes(pos))) { score += 2; reasons.push(`✅ ${p.name}: 상대팀 약점 포지션(${p.position}) 보강`); }
                if (needs.statNeeds.includes('DEF') && p.def > 75) { score += 1; reasons.push(`✅ ${p.name}: 수비력 필요`); }
                if (needs.statNeeds.includes('3PT') && p.out > 75) { score += 1; reasons.push(`✅ ${p.name}: 슈팅 능력 필요`); }
                if (needs.statNeeds.includes('REB') && p.reb > 75) { score += 1; reasons.push(`✅ ${p.name}: 리바운드 필요`); }
                if (needs.isSeller && p.age <= 24) { score += 2; reasons.push(`✅ ${p.name}: 리빌딩 코어 (유망주)`); }
                if (needs.isContender && p.ovr >= 80) { score += 2; reasons.push(`✅ ${p.name}: 윈나우 조각 (즉시전력)`); }
                
                // Penalize if we need a premium asset but this player isn't one
                if (requirePremiumAsset && p.ovr < 82 && p.potential < 88) {
                    score -= 5;
                }

                score += (getPlayerTradeValue(p) / 1000); 
                return { player: p, score, reasons };
            }).sort((a: any, b: any) => b.score - a.score);

            const offers: TradeOffer[] = [];

            const generatePackage = (availableAssets: typeof scoredAssets, valueMultiplier: number) => {
                let currentVal = 0;
                const pkg: Player[] = [];
                const reasons: string[] = [];
                
                let hasPremiumAsset = false;

                for (const asset of availableAssets) {
                    if (pkg.includes(asset.player)) continue;
                    
                    // Proposed Check
                    const potentialPkg = [...pkg, asset.player];
                    // Check if User allows sending this package (My Team)
                    if (!checkTradeLegality(myTeam, targetPlayers, potentialPkg)) continue;
                    // Check if AI allows receiving this package (Target Team)
                    if (!checkTradeLegality(targetTeam, potentialPkg, targetPlayers)) continue;

                    // [Difficulty Update] AI hates giving up stars for 4+ players
                    if (pkg.length >= 4) break; 
                    
                    // Don't wildly overpay
                    const potentialVal = calculatePackageTrueValue(potentialPkg);
                    if (potentialVal > targetValue * 1.3) continue;

                    // Star Protection Check
                    if (requirePremiumAsset) {
                        if (asset.player.ovr >= 82 || asset.player.potential >= 88) hasPremiumAsset = true;
                    }

                    pkg.push(asset.player);
                    currentVal = potentialVal;
                    reasons.push(...asset.reasons);

                    if (currentVal >= targetValue * valueMultiplier) break;
                }

                // If asking for a star but giving trash, reject
                if (requirePremiumAsset && !hasPremiumAsset) return { players: [], value: 0, reasons: [] };

                return { players: pkg, value: currentVal, reasons: [...new Set(reasons)] };
            };

            // [Difficulty Update] AI Demands 100% Value Match or more for direct proposals
            const p1 = generatePackage(scoredAssets, 1.05);
            if (p1.players.length > 0 && p1.value >= targetValue) {
                offers.push({
                    teamId: targetTeam.id,
                    teamName: targetTeam.name,
                    players: p1.players,
                    diffValue: p1.value - targetValue,
                    analysis: [`AI Counter Proposal (Balanced)`, ...p1.reasons.slice(0, 3)]
                });
            }

            if (p1.players.length > 0) {
                const altAssets = scoredAssets.filter((a: any) => a.player.id !== p1.players[0].id);
                // Alternative package demands even more value (since it's not their first choice)
                const p2 = generatePackage(altAssets, 1.15); 
                if (p2.players.length > 0 && p2.value >= targetValue) {
                    offers.push({
                        teamId: targetTeam.id,
                        teamName: targetTeam.name,
                        players: p2.players,
                        diffValue: p2.value - targetValue,
                        analysis: [`AI Counter Proposal (Alternative)`, ...p2.reasons.slice(0, 3)]
                    });
                }
            }

            return res.status(200).json({ offers });
        }

        if (action === 'simulate-cpu-trades') {
             return res.status(200).json({ success: true, transaction: null });
        }
        
        return res.status(400).json({ message: 'Unknown action' });
    } catch (e: any) {
        return res.status(500).json({ message: e.message });
    }
}
