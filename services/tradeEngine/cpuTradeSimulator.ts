
import { Player, Team, Transaction } from '../../types';
import { LeaguePickAssets, DraftPickAsset } from '../../types/draftAssets';
import { LeagueTradeBlocks, PersistentPickRef, TeamTradeState } from '../../types/trade';
import { calculatePlayerOvr } from '../../utils/constants';
import { SEASON_START_DATE, TRADE_DEADLINE } from '../../utils/constants';
import { SeasonConfig } from '../../utils/seasonConfig';
import { TRADE_CONFIG as C } from './tradeConfig';
import { getPlayerTradeValue, calculatePackageTrueValue, getPlayerValueToTeam } from './tradeValue';
import { getPickTradeValue } from './pickValueEngine';
import { analyzeTeamSituation, buildTeamTradeState, TeamNeeds } from './teamAnalysis';
import { LeagueGMProfiles } from '../../types/gm';
import { getDirectionParams } from './gmProfiler';
import { checkTradeLegality } from './salaryRules';
import { executeTrade, TradeExecutionPayload, MAX_ROSTER_SIZE } from './tradeExecutor';
import { formatMoney } from '../../utils/formatMoney';
import { calculateParticipationScore, PARTICIPATION_THRESHOLD } from './tradeParticipation';
import { generateTradeGoal } from './tradeGoalEngine';
import { getPlayerAvailability } from './assetAvailability';
import { findTradeTargets } from './tradeTargetFinder';
import { calculateTradeUtility } from './tradeUtilityEngine';

// ──────────────────────────────────────────────
// 인접 포지션 매핑 (SG↔SF, PF↔C 등)
// ──────────────────────────────────────────────

const ADJACENT_POSITIONS: Record<string, string[]> = {
    'PG': ['SG'],
    'SG': ['PG', 'SF'],
    'SF': ['SG', 'PF'],
    'PF': ['SF', 'C'],
    'C': ['PF'],
};

function matchesPosition(playerPositions: string, needPosition: string): 'exact' | 'adjacent' | 'none' {
    if (playerPositions.includes(needPosition)) return 'exact';
    const adjacent = ADJACENT_POSITIONS[needPosition] || [];
    for (const adj of adjacent) {
        if (playerPositions.includes(adj)) return 'adjacent';
    }
    return 'none';
}

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface ScoredAsset {
    player: Player;
    tradeValue: number;
    willingness: number;
    reasons: string[];
}

interface ScoredPickAsset {
    pick: DraftPickAsset;
    tradeValue: number;
    willingness: number;
}

interface AcquisitionTarget {
    position: string;
    minOvr: number;
    priority: number;
    statPreference?: string;
}

interface TeamTradeProfile {
    team: Team;
    needs: TeamNeeds;
    tradeableAssets: ScoredAsset[];
    tradeablePicks: ScoredPickAsset[];
    acquisitionPriorities: AcquisitionTarget[];
}

interface TradePackage {
    teamAPlayers: Player[];
    teamBPlayers: Player[];
    teamAPicks: ScoredPickAsset[];
    teamBPicks: ScoredPickAsset[];
    teamAValue: number;
    teamBValue: number;
    teamAImprovement: number;
    teamBImprovement: number;
    analysis: string[];
}

// ──────────────────────────────────────────────
// 1. 점진적 확률 계산
// ──────────────────────────────────────────────

function calculateTradeChance(currentDate: string, seasonStart: string, tradeDeadline: string): number {
    const current = new Date(currentDate).getTime();
    const start = new Date(seasonStart).getTime();
    const deadline = new Date(tradeDeadline).getTime();

    if (current > deadline || current < start) return 0;

    const progress = Math.min(1, Math.max(0, (current - start) / (deadline - start)));
    const { BASE_PROBABILITY, MAX_PROBABILITY, PROBABILITY_EXPONENT } = C.CPU_TRADE;

    return BASE_PROBABILITY + (MAX_PROBABILITY - BASE_PROBABILITY) * Math.pow(progress, PROBABILITY_EXPONENT);
}

// ──────────────────────────────────────────────
// 2. 팀 프로필 생성
// ──────────────────────────────────────────────

function buildTeamTradeProfile(
    team: Team,
    leaguePickAssets?: LeaguePickAssets,
    currentDate?: string,
    leagueGMProfiles?: LeagueGMProfiles
): TeamTradeProfile {
    const gmProfile = leagueGMProfiles?.[team.id];
    const needs = analyzeTeamSituation(team, gmProfile);
    const roster = team.roster;
    const CC = C.CPU_TRADE;

    // ── 내놓을 수 있는 선수 판별 ──
    const tradeableAssets: ScoredAsset[] = [];
    const tradeablePicks: ScoredPickAsset[] = [];

    if (roster.length <= C.DEPTH.MIN_ROSTER_SIZE) {
        return { team, needs, tradeableAssets: [], tradeablePicks: [], acquisitionPriorities: [] };
    }

    const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
    const positionDepth: Record<string, Player[]> = {};
    positions.forEach(pos => {
        positionDepth[pos] = roster
            .filter(p => p.position.includes(pos))
            .sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
    });

    const sortedByOvr = [...roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));

    roster.forEach(p => {
        const ovr = calculatePlayerOvr(p);

        // Untouchable: 스타급
        if (ovr >= CC.UNTOUCHABLE_OVR) return;
        // 부상 선수 제외
        if (p.health === 'Injured') return;

        let willingness = 0;
        const reasons: string[] = [];

        // 포지션별 뎁스 분석
        for (const pos of positions) {
            if (!p.position.includes(pos)) continue;
            const depth = positionDepth[pos];
            const playerRankInPos = depth.findIndex(d => d.id === p.id);

            if (depth.length >= 4 && playerRankInPos >= depth.length - 2) {
                willingness += 5;
                reasons.push(`${pos} 포지션 과잉 뎁스 (${depth.length}명)`);
            } else if (depth.length >= CC.EXCESS_DEPTH_THRESHOLD && playerRankInPos === depth.length - 1) {
                willingness += 3;
                reasons.push(`${pos} 포지션 여분 뎁스`);
            }
        }

        // 나쁜 계약
        if (ovr < CC.LOW_VALUE_DUMP_OVR && p.salary > CC.BAD_CONTRACT_SALARY_FLOOR) {
            willingness += 4;
            reasons.push(`나쁜 계약 (OVR ${ovr}, ${formatMoney(p.salary)})`);
        }

        // 벤치 끝자리
        const ovrRank = sortedByOvr.findIndex(s => s.id === p.id);
        if (ovrRank >= 12) {
            willingness += 2;
            reasons.push('벤치 끝자리');
        }

        // 최소 willingness 1 이상이어야 트레이드 대상
        if (willingness > 0) {
            tradeableAssets.push({
                player: p,
                tradeValue: getPlayerTradeValue(p),
                willingness,
                reasons,
            });
        }
    });

    // willingness 내림차순 정렬
    tradeableAssets.sort((a, b) => b.willingness - a.willingness);

    // ── 원하는 선수 유형 ──
    const acquisitionPriorities: AcquisitionTarget[] = [];

    // 약점 포지션 (최고 우선)
    needs.weakPositions.forEach(pos => {
        acquisitionPriorities.push({ position: pos, minOvr: 73, priority: 5 });
    });

    // 스탯 니즈
    needs.statNeeds.forEach(stat => {
        const relevantPositions = stat === 'REB' ? ['PF', 'C'] : stat === '3PT' ? ['SG', 'SF'] : positions;
        relevantPositions.forEach(pos => {
            if (!acquisitionPriorities.some(t => t.position === pos && t.priority >= 3)) {
                acquisitionPriorities.push({ position: pos, minOvr: 70, priority: 3, statPreference: stat });
            }
        });
    });

    // 뎁스 보강 (약하지 않지만 depth < 2인 포지션)
    positions.forEach(pos => {
        if (!needs.weakPositions.includes(pos) && (positionDepth[pos]?.length || 0) < 2) {
            acquisitionPriorities.push({ position: pos, minOvr: 68, priority: 2 });
        }
    });

    // ── 추가 동기 1: 컨텐더의 업그레이드 욕구 ──
    if (needs.isContender) {
        positions.forEach(pos => {
            const depth = positionDepth[pos] || [];
            const bestOvr = depth.length > 0 ? calculatePlayerOvr(depth[0]) : 0;
            if (bestOvr > 0 && bestOvr < 80 && !acquisitionPriorities.some(t => t.position === pos && t.priority >= 3)) {
                acquisitionPriorities.push({ position: pos, minOvr: bestOvr + 3, priority: 2 });
            }
        });
    }

    // ── 추가 동기 2: 셀러 팀의 리빌딩 (젊은 선수 확보) ──
    if (needs.isSeller) {
        positions.forEach(pos => {
            if (!acquisitionPriorities.some(t => t.position === pos)) {
                acquisitionPriorities.push({ position: pos, minOvr: 65, priority: 1 });
            }
        });
    }

    // ── 추가 동기 3: 나쁜 계약 교체 ──
    roster.forEach(p => {
        const ovr = calculatePlayerOvr(p);
        if (ovr < CC.LOW_VALUE_DUMP_OVR && p.salary > CC.BAD_CONTRACT_SALARY_FLOOR) {
            for (const pos of positions) {
                if (p.position.includes(pos) && !acquisitionPriorities.some(t => t.position === pos && t.priority >= 3)) {
                    acquisitionPriorities.push({ position: pos, minOvr: 68, priority: 3 });
                }
            }
        }
    });

    // ── 내놓을 수 있는 픽 판별 ──
    if (leaguePickAssets && currentDate) {
        const teamPicks = leaguePickAssets[team.id] || [];
        const currentYear = new Date(currentDate).getFullYear();

        for (const pick of teamPicks) {
            let willingness = 0;

            // 2라운드 픽: 누구나 내놓을 수 있음
            if (pick.round === 2) {
                willingness = 3;
            }
            // 컨텐더: 먼 미래(3년+) 1라운드 내놓기
            else if (needs.isContender && pick.round === 1 && pick.season >= currentYear + 3) {
                willingness = 2;
            }
            // 셀러: 다른 팀 원래 픽 1라운드도 내놓음
            else if (needs.isSeller && pick.round === 1 && pick.originalTeamId !== team.id) {
                willingness = 2;
            }

            if (willingness > 0) {
                tradeablePicks.push({
                    pick,
                    tradeValue: getPickTradeValue(pick, [team], currentDate),
                    willingness,
                });
            }
        }

        // 가치 내림차순
        tradeablePicks.sort((a, b) => b.tradeValue - a.tradeValue);
    }

    return { team, needs, tradeableAssets, tradeablePicks, acquisitionPriorities };
}

// ──────────────────────────────────────────────
// 3. 팀 쌍 호환성 점수
// ──────────────────────────────────────────────

function calculateCompatibility(profileA: TeamTradeProfile, profileB: TeamTradeProfile): number {
    const CC = C.CPU_TRADE;
    let scoreAtoB = 0;
    let scoreBtoA = 0;

    // A의 자산이 B의 니즈를 충족하는지
    for (const asset of profileA.tradeableAssets) {
        const ovr = calculatePlayerOvr(asset.player);
        for (const need of profileB.acquisitionPriorities) {
            const posMatch = matchesPosition(asset.player.position, need.position);
            if (posMatch !== 'none' && ovr >= need.minOvr) {
                const posMultiplier = posMatch === 'exact' ? 1.0 : 0.6;
                scoreAtoB += need.priority * CC.POSITION_NEED_BONUS * posMultiplier;

                if (need.statPreference) {
                    const stat = need.statPreference === 'DEF' ? asset.player.def
                        : need.statPreference === 'REB' ? asset.player.reb
                        : need.statPreference === '3PT' ? asset.player.out : 0;
                    if ((stat || 0) >= 75) scoreAtoB += CC.STAT_NEED_BONUS;
                }
            }
        }
    }

    // B의 자산이 A의 니즈를 충족하는지
    for (const asset of profileB.tradeableAssets) {
        const ovr = calculatePlayerOvr(asset.player);
        for (const need of profileA.acquisitionPriorities) {
            const posMatch = matchesPosition(asset.player.position, need.position);
            if (posMatch !== 'none' && ovr >= need.minOvr) {
                const posMultiplier = posMatch === 'exact' ? 1.0 : 0.6;
                scoreBtoA += need.priority * CC.POSITION_NEED_BONUS * posMultiplier;

                if (need.statPreference) {
                    const stat = need.statPreference === 'DEF' ? asset.player.def
                        : need.statPreference === 'REB' ? asset.player.reb
                        : need.statPreference === '3PT' ? asset.player.out : 0;
                    if ((stat || 0) >= 75) scoreBtoA += CC.STAT_NEED_BONUS;
                }
            }
        }
    }

    // 양방향 모두 이익이어야 유효
    if (scoreAtoB <= 0 || scoreBtoA <= 0) return 0;

    return scoreAtoB + scoreBtoA;
}

// ──────────────────────────────────────────────
// 4. 팀력 개선도 계산
// ──────────────────────────────────────────────

function calculateTeamImprovement(team: Team, incoming: Player[], outgoing: Player[]): number {
    const outIds = new Set(outgoing.map(p => p.id));
    const hypotheticalRoster = [...team.roster.filter(p => !outIds.has(p.id)), ...incoming];
    const positions = ['PG', 'SG', 'SF', 'PF', 'C'];

    // 포지션별 최고 OVR 선수로 스타팅 5 추정 + 로테이션 3명
    const getEffectiveStrength = (roster: Player[]): number => {
        const usedIds = new Set<string>();
        let strength = 0;

        // 스타팅 5: 포지션별 최고 선수
        for (const pos of positions) {
            const candidates = roster
                .filter(p => p.position.includes(pos) && !usedIds.has(p.id))
                .sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));
            if (candidates.length > 0) {
                strength += calculatePlayerOvr(candidates[0]);
                usedIds.add(candidates[0].id);
            }
        }

        // 로테이션 3명: 남은 선수 중 상위 3명
        const remaining = roster
            .filter(p => !usedIds.has(p.id))
            .sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a))
            .slice(0, 3);
        for (const p of remaining) {
            strength += calculatePlayerOvr(p) * 0.6; // 로테이션 가중치
        }

        return strength;
    };

    const before = getEffectiveStrength(team.roster);
    const after = getEffectiveStrength(hypotheticalRoster);

    if (before === 0) return 0;

    let improvement = (after - before) / before;

    // 약점 포지션 해소 보너스
    const needsBefore = analyzeTeamSituation(team);
    const hypotheticalTeam = { ...team, roster: hypotheticalRoster };
    const needsAfter = analyzeTeamSituation(hypotheticalTeam);
    const resolvedWeaknesses = needsBefore.weakPositions.filter(
        pos => !needsAfter.weakPositions.includes(pos)
    );
    improvement += resolvedWeaknesses.length * 0.01;

    return improvement;
}

// ──────────────────────────────────────────────
// 5. 패키지 구성
// ──────────────────────────────────────────────

function constructTradePackage(
    profileA: TeamTradeProfile,
    profileB: TeamTradeProfile
): TradePackage | null {
    const CC = C.CPU_TRADE;
    const teamA = profileA.team;
    const teamB = profileB.team;

    // ── 1단계: 니즈 기반 1차 선택 ──
    let aToB = selectPlayersForNeeds(profileA.tradeableAssets, profileB.acquisitionPriorities);
    if (aToB.length === 0) return null;

    let bToA = selectPlayersForNeeds(profileB.tradeableAssets, profileA.acquisitionPriorities);
    if (bToA.length === 0) return null;

    // 동일 선수 교환 방지
    const aToBIds = new Set(aToB.map(p => p.id));
    if (bToA.some(p => aToBIds.has(p.id))) return null;

    // ── 2단계: CBA 샐러리 밸런싱 ──
    const legalA = checkTradeLegality(teamA, bToA, aToB);
    const legalB = checkTradeLegality(teamB, aToB, bToA);

    if (!legalA || !legalB) {
        const balanced = trySalaryBalance(profileA, profileB, aToB, bToA);
        if (!balanced) return null;
        aToB = balanced.aToB;
        bToA = balanced.bToA;
    }

    // 로스터 최소 인원 체크
    if (teamA.roster.length - aToB.length + bToA.length < C.DEPTH.MIN_ROSTER_SIZE) return null;
    if (teamB.roster.length - bToA.length + aToB.length < C.DEPTH.MIN_ROSTER_SIZE) return null;

    // ── 2.5단계: 픽으로 가치 차이 보완 ──
    const aToBPlayerValue = calculatePackageTrueValue(aToB);
    const bToAPlayerValue = calculatePackageTrueValue(bToA);
    const valueDiff = aToBPlayerValue - bToAPlayerValue;
    const aToBPicks: ScoredPickAsset[] = [];
    const bToAPicks: ScoredPickAsset[] = [];

    // 가치 차이가 크면 열세팀이 픽을 추가하여 보완
    if (Math.abs(valueDiff) > aToBPlayerValue * 0.15) {
        const deficit = valueDiff; // +면 A→B가 더 가치 있음 → B가 픽을 추가해야
        if (deficit > 0 && profileB.tradeablePicks.length > 0) {
            let addedPickValue = 0;
            for (const sp of profileB.tradeablePicks) {
                if (addedPickValue >= deficit * 0.8) break;
                if (bToAPicks.length >= 2) break;
                bToAPicks.push(sp);
                addedPickValue += sp.tradeValue;
            }
        } else if (deficit < 0 && profileA.tradeablePicks.length > 0) {
            let addedPickValue = 0;
            for (const sp of profileA.tradeablePicks) {
                if (addedPickValue >= Math.abs(deficit) * 0.8) break;
                if (aToBPicks.length >= 2) break;
                aToBPicks.push(sp);
                addedPickValue += sp.tradeValue;
            }
        }
    }

    // ── 3단계: 팀력 개선도 체크 (seller 완화) ──
    const improvA = calculateTeamImprovement(teamA, bToA, aToB);
    const improvB = calculateTeamImprovement(teamB, aToB, bToA);

    const dirParamsA = getDirectionParams(profileA.needs.direction);
    const dirParamsB = getDirectionParams(profileB.needs.direction);
    const threshA = dirParamsA.improvementThreshold;
    const threshB = dirParamsB.improvementThreshold;

    // 픽 수신 팀은 improvement가 부족해도 픽 가치로 보완 가능
    const pickBonusA = bToAPicks.reduce((sum, sp) => sum + sp.tradeValue, 0) * 0.0001;
    const pickBonusB = aToBPicks.reduce((sum, sp) => sum + sp.tradeValue, 0) * 0.0001;

    if ((improvA + pickBonusA) < threshA || (improvB + pickBonusB) < threshB) return null;

    // 분석 메시지 생성
    const analysis: string[] = [];
    aToB.forEach(p => {
        const asset = profileA.tradeableAssets.find(a => a.player.id === p.id);
        if (asset) analysis.push(...asset.reasons.slice(0, 1));
    });
    bToA.forEach(p => {
        const asset = profileB.tradeableAssets.find(a => a.player.id === p.id);
        if (asset) analysis.push(...asset.reasons.slice(0, 1));
    });
    if (aToBPicks.length > 0) analysis.push(`${teamA.name}: 드래프트 픽 ${aToBPicks.length}건 포함`);
    if (bToAPicks.length > 0) analysis.push(`${teamB.name}: 드래프트 픽 ${bToAPicks.length}건 포함`);

    const totalAValue = aToBPlayerValue + aToBPicks.reduce((s, p) => s + p.tradeValue, 0);
    const totalBValue = bToAPlayerValue + bToAPicks.reduce((s, p) => s + p.tradeValue, 0);

    return {
        teamAPlayers: aToB,
        teamBPlayers: bToA,
        teamAPicks: aToBPicks,
        teamBPicks: bToAPicks,
        teamAValue: totalAValue,
        teamBValue: totalBValue,
        teamAImprovement: improvA,
        teamBImprovement: improvB,
        analysis: [...new Set(analysis)],
    };
}

// ──────────────────────────────────────────────
// 5-1. 샐러리 밸런싱 (filler 추가로 CBA 통과 시도)
// ──────────────────────────────────────────────

function trySalaryBalance(
    profileA: TeamTradeProfile,
    profileB: TeamTradeProfile,
    origAToB: Player[],
    origBToA: Player[]
): { aToB: Player[]; bToA: Player[] } | null {
    let aToB = [...origAToB];
    let bToA = [...origBToA];
    const maxFiller = C.CPU_TRADE.SALARY_FILLER_MAX;
    const maxPkgSize = C.DEPTH.MAX_PACKAGE_SIZE + maxFiller; // filler 포함 최대 패키지

    const selectedIds = new Set([...aToB.map(p => p.id), ...bToA.map(p => p.id)]);

    // teamA가 illegal → A의 outgoing(aToB)에 filler 추가하여 outSalary 증가
    if (!checkTradeLegality(profileA.team, bToA, aToB)) {
        const fillerCandidates = profileA.tradeableAssets
            .filter(a => !selectedIds.has(a.player.id))
            .sort((a, b) => b.player.salary - a.player.salary); // 높은 연봉 우선

        let added = 0;
        for (const filler of fillerCandidates) {
            if (added >= maxFiller || aToB.length >= maxPkgSize) break;
            aToB.push(filler.player);
            selectedIds.add(filler.player.id);
            added++;
            if (checkTradeLegality(profileA.team, bToA, aToB)) break;
        }
    }

    // teamB가 illegal → B의 outgoing(bToA)에 filler 추가
    if (!checkTradeLegality(profileB.team, aToB, bToA)) {
        const fillerCandidates = profileB.tradeableAssets
            .filter(a => !selectedIds.has(a.player.id))
            .sort((a, b) => b.player.salary - a.player.salary);

        let added = 0;
        for (const filler of fillerCandidates) {
            if (added >= maxFiller || bToA.length >= maxPkgSize) break;
            bToA.push(filler.player);
            selectedIds.add(filler.player.id);
            added++;
            if (checkTradeLegality(profileB.team, aToB, bToA)) break;
        }
    }

    // 최종 양팀 legality 확인
    if (!checkTradeLegality(profileA.team, bToA, aToB)) return null;
    if (!checkTradeLegality(profileB.team, aToB, bToA)) return null;

    return { aToB, bToA };
}

function selectPlayersForNeeds(
    assets: ScoredAsset[],
    priorities: AcquisitionTarget[]
): Player[] {
    const selected: Player[] = [];
    const usedPriorities = new Set<number>();
    const usedAssetIds = new Set<string>();

    // 1차: 정확한 포지션 매치
    for (const asset of assets) {
        if (selected.length >= C.DEPTH.MAX_PACKAGE_SIZE) break;
        if (usedAssetIds.has(asset.player.id)) continue;

        const ovr = calculatePlayerOvr(asset.player);
        for (let i = 0; i < priorities.length; i++) {
            if (usedPriorities.has(i)) continue;
            const need = priorities[i];
            if (matchesPosition(asset.player.position, need.position) === 'exact' && ovr >= need.minOvr) {
                selected.push(asset.player);
                usedPriorities.add(i);
                usedAssetIds.add(asset.player.id);
                break;
            }
        }
    }

    // 2차: 인접 포지션 fallback
    for (const asset of assets) {
        if (selected.length >= C.DEPTH.MAX_PACKAGE_SIZE) break;
        if (usedAssetIds.has(asset.player.id)) continue;

        const ovr = calculatePlayerOvr(asset.player);
        for (let i = 0; i < priorities.length; i++) {
            if (usedPriorities.has(i)) continue;
            const need = priorities[i];
            if (matchesPosition(asset.player.position, need.position) === 'adjacent' && ovr >= need.minOvr) {
                selected.push(asset.player);
                usedPriorities.add(i);
                usedAssetIds.add(asset.player.id);
                break;
            }
        }
    }

    return selected;
}

// ──────────────────────────────────────────────
// 6. Transaction 생성
// ──────────────────────────────────────────────

function createTradeTransaction(
    teamA: Team, teamB: Team,
    teamAPlayers: Player[], teamBPlayers: Player[],
    analysis: string[]
): Transaction {
    const id = crypto.randomUUID();

    return {
        id,
        date: '',
        type: 'Trade',
        teamId: teamA.id,
        description: `[CPU] ${teamA.name} ↔ ${teamB.name} 트레이드`,
        details: {
            acquired: teamBPlayers.map(p => ({ id: p.id, name: p.name, ovr: calculatePlayerOvr(p) })),
            traded: teamAPlayers.map(p => ({ id: p.id, name: p.name, ovr: calculatePlayerOvr(p) })),
            partnerTeamId: teamB.id,
            partnerTeamName: teamB.name,
            analysis,
        },
    };
}

// ──────────────────────────────────────────────
// 7. 로스터 스왑 실행
// ──────────────────────────────────────────────

function executeRosterSwap(
    teamA: Team, teamB: Team,
    teamAPlayers: Player[], teamBPlayers: Player[]
): void {
    const aOutIds = new Set(teamAPlayers.map(p => p.id));
    const bOutIds = new Set(teamBPlayers.map(p => p.id));

    teamA.roster = [...teamA.roster.filter(p => !aOutIds.has(p.id)), ...teamBPlayers];
    teamB.roster = [...teamB.roster.filter(p => !bOutIds.has(p.id)), ...teamAPlayers];
}

// ──────────────────────────────────────────────
// 8. 메인 오케스트레이터
// ──────────────────────────────────────────────

export function runCPUTradeRound(
    teams: Team[],
    myTeamId: string | null,
    currentDate: string,
    leaguePickAssets?: LeaguePickAssets,
    leagueTradeBlocks?: LeagueTradeBlocks,
    leagueGMProfiles?: LeagueGMProfiles,
    seasonConfig?: SeasonConfig
): { updatedTeams: Team[]; transactions: Transaction[]; overflowCutPlayers: Player[] } | null {
    // 데드라인 체크
    const tradeDeadline = seasonConfig?.tradeDeadline ?? TRADE_DEADLINE;
    const seasonStart = seasonConfig?.startDate ?? SEASON_START_DATE;
    if (new Date(currentDate) > new Date(tradeDeadline)) return null;
    if (new Date(currentDate) < new Date(seasonStart)) return null;

    // 데드라인까지 남은 일수
    const daysToDeadline = Math.max(0,
        (new Date(tradeDeadline).getTime() - new Date(currentDate).getTime()) / 86400000
    );

    const CC = C.CPU_TRADE;
    const cpuTeams = teams.filter(t => t.id !== myTeamId);

    // ── Step 1: 전체 팀 트레이드 상태 계산 ──
    const teamStates: Record<string, TeamTradeState> = {};
    for (const team of cpuTeams) {
        const gmProfile = leagueGMProfiles?.[team.id];
        if (!gmProfile) continue;
        teamStates[team.id] = buildTeamTradeState(team, gmProfile, leaguePickAssets, currentDate);
    }

    // ── Step 2: 참가 점수로 참가 팀 선정 ──
    // 기존 확률 곡선도 병용 (데드라인 근접 시 자연스러운 트레이드 빈도 증가)
    const baseChance = calculateTradeChance(currentDate, seasonStart, tradeDeadline);
    if (Math.random() > baseChance * 1.5) return null; // 빠른 bail-out

    const participatingTeams = cpuTeams.filter(team => {
        const gmProfile = leagueGMProfiles?.[team.id];
        const state = teamStates[team.id];
        if (!gmProfile || !state) return false;
        const score = calculateParticipationScore(state, gmProfile, 99, daysToDeadline);
        return score >= PARTICIPATION_THRESHOLD;
    });

    if (participatingTeams.length < 2) return null;

    // ── Step 3: 목표 생성 ──
    const teamGoals: Record<string, ReturnType<typeof generateTradeGoal>> = {};
    for (const team of participatingTeams) {
        const gmProfile = leagueGMProfiles?.[team.id];
        const state = teamStates[team.id];
        if (gmProfile && state) {
            teamGoals[team.id] = generateTradeGoal(state, gmProfile, team);
        }
    }

    // ── Step 4~6: 목표 기반 타깃 탐색 → 패키지 구성 → 유틸리티 체크 ──
    const transactions: Transaction[] = [];
    const tradedTeamIds = new Set<string>();
    const overflowCutPlayers: Player[] = [];
    let profiles = cpuTeams.map(t =>
        buildTeamTradeProfile(t, leaguePickAssets, currentDate, leagueGMProfiles)
    );

    // 구매자 팀 기준으로 타깃 탐색
    for (const buyerTeam of participatingTeams) {
        if (tradedTeamIds.has(buyerTeam.id)) continue;
        const buyerProfile = leagueGMProfiles?.[buyerTeam.id];
        const buyerState = teamStates[buyerTeam.id];
        const goal = teamGoals[buyerTeam.id];
        if (!buyerProfile || !buyerState || !goal) continue;

        // 미래 자산 목표이면 픽 탐색이지 선수 탐색 아님 → 기존 호환성 방식으로 fallback
        if (goal === 'FUTURE_ASSETS') {
            const sellerProfiles = profiles.filter(p =>
                p.team.id !== buyerTeam.id && !tradedTeamIds.has(p.team.id)
            );
            const buyerProf = profiles.find(p => p.team.id === buyerTeam.id);
            if (!buyerProf) continue;

            for (const sellerProf of sellerProfiles) {
                if (tradedTeamIds.has(sellerProf.team.id)) continue;
                const score = calculateCompatibility(buyerProf, sellerProf);
                if (score <= 0) continue;
                const pkg = constructTradePackage(buyerProf, sellerProf);
                if (!pkg) continue;
                if (executePkg(pkg, buyerProf, sellerProf, teams, leaguePickAssets, leagueTradeBlocks, currentDate, transactions, tradedTeamIds, overflowCutPlayers)) {
                    break;
                }
            }
            continue;
        }

        // 목표 기반 타깃 탐색
        if (!leagueGMProfiles) continue;
        const targets = findTradeTargets(
            buyerTeam, buyerState, buyerProfile, goal,
            teams.filter(t => t.id !== myTeamId),
            leagueGMProfiles, teamStates
        );

        for (const target of targets) {
            if (tradedTeamIds.has(target.sellerTeamId)) continue;

            const sellerProfile = profiles.find(p => p.team.id === target.sellerTeamId);
            const buyerProf = profiles.find(p => p.team.id === buyerTeam.id);
            if (!sellerProfile || !buyerProf) continue;

            // 타깃 선수를 포함한 패키지 구성 시도
            // sellerProf의 tradeableAssets에서 타깃 선수를 최우선으로 선택
            const reorderedSeller = reorderAssetsWithTarget(sellerProfile, target.player.id);
            const pkg = constructTradePackage(buyerProf, reorderedSeller);
            if (!pkg) continue;

            // ── TradeUtility 체크 (양팀 모두 수락 가능해야) ──
            const sellerState = teamStates[target.sellerTeamId];
            const sellerGMProfile = leagueGMProfiles?.[target.sellerTeamId];
            if (!sellerState || !sellerGMProfile) continue;

            const buyerUtil = calculateTradeUtility(
                pkg.teamBPlayers, pkg.teamBPicks.map(sp => sp.pick),
                pkg.teamAPlayers, pkg.teamAPicks.map(sp => sp.pick),
                buyerState, buyerProfile, teams, currentDate, goal
            );
            const sellerUtil = calculateTradeUtility(
                pkg.teamAPlayers, pkg.teamAPicks.map(sp => sp.pick),
                pkg.teamBPlayers, pkg.teamBPicks.map(sp => sp.pick),
                sellerState, sellerGMProfile, teams, currentDate, teamGoals[target.sellerTeamId]
            );

            const buyerThreshold = getPhaseUtilityThreshold(buyerState.phase);
            const sellerThreshold = getPhaseUtilityThreshold(sellerState.phase);

            if (buyerUtil.utility < buyerThreshold || sellerUtil.utility < sellerThreshold) {
                continue; // 양팀 모두 수락 가능해야 트레이드 성사
            }

            if (executePkg(pkg, buyerProf, sellerProfile, teams, leaguePickAssets, leagueTradeBlocks, currentDate, transactions, tradedTeamIds, overflowCutPlayers)) {
                break; // 이 구매자에 대해 하나 성사 → 다음 팀으로
            }
        }

        // 타깃 탐색으로 못 찾으면 기존 호환성 방식 fallback
        if (!tradedTeamIds.has(buyerTeam.id)) {
            const buyerProf = profiles.find(p => p.team.id === buyerTeam.id);
            if (!buyerProf || buyerProf.tradeableAssets.length === 0) continue;

            const compatiblePairs = profiles
                .filter(p => p.team.id !== buyerTeam.id && !tradedTeamIds.has(p.team.id) && p.tradeableAssets.length > 0)
                .map(sellerProf => ({
                    sellerProf,
                    score: calculateCompatibility(buyerProf, sellerProf),
                }))
                .filter(x => x.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 3);

            for (const { sellerProf } of compatiblePairs) {
                if (tradedTeamIds.has(sellerProf.team.id)) continue;
                const pkg = constructTradePackage(buyerProf, sellerProf);
                if (!pkg) continue;
                if (executePkg(pkg, buyerProf, sellerProf, teams, leaguePickAssets, leagueTradeBlocks, currentDate, transactions, tradedTeamIds, overflowCutPlayers)) {
                    break;
                }
            }
        }
    }

    // 참가 팀이 아닌 팀끼리의 기존 방식도 한 번 더 시도 (소형딜)
    if (transactions.length === 0) {
        const remainingProfiles = profiles.filter(p => !tradedTeamIds.has(p.team.id));
        const pairs: { a: TeamTradeProfile; b: TeamTradeProfile; score: number }[] = [];
        for (let i = 0; i < remainingProfiles.length; i++) {
            for (let j = i + 1; j < remainingProfiles.length; j++) {
                if (remainingProfiles[i].tradeableAssets.length === 0 || remainingProfiles[j].tradeableAssets.length === 0) continue;
                const score = calculateCompatibility(remainingProfiles[i], remainingProfiles[j]);
                if (score > 0) pairs.push({ a: remainingProfiles[i], b: remainingProfiles[j], score });
            }
        }
        pairs.sort((x, y) => y.score - x.score);
        for (const pair of pairs.slice(0, CC.MAX_CANDIDATE_PAIRS)) {
            if (tradedTeamIds.has(pair.a.team.id) || tradedTeamIds.has(pair.b.team.id)) continue;
            const pkg = constructTradePackage(pair.a, pair.b);
            if (!pkg) continue;
            executePkg(pkg, pair.a, pair.b, teams, leaguePickAssets, leagueTradeBlocks, currentDate, transactions, tradedTeamIds, overflowCutPlayers);
        }
    }

    if (transactions.length === 0) return null;
    return { updatedTeams: teams, transactions, overflowCutPlayers };
}

// ── 패키지 실행 헬퍼 (중복 제거용) ──
function executePkg(
    pkg: TradePackage,
    profileA: TeamTradeProfile,
    profileB: TeamTradeProfile,
    teams: Team[],
    leaguePickAssets: LeaguePickAssets | undefined,
    leagueTradeBlocks: LeagueTradeBlocks | undefined,
    currentDate: string,
    transactions: Transaction[],
    tradedTeamIds: Set<string>,
    overflowCutPlayers: Player[],
): boolean {
    if (leaguePickAssets && (pkg.teamAPicks.length > 0 || pkg.teamBPicks.length > 0)) {
        const payload: TradeExecutionPayload = {
            teamAId: profileA.team.id,
            teamBId: profileB.team.id,
            teamASentPlayers: pkg.teamAPlayers.map(p => p.id),
            teamASentPicks: pkg.teamAPicks.map(sp => ({
                season: sp.pick.season,
                round: sp.pick.round,
                originalTeamId: sp.pick.originalTeamId,
                currentTeamId: profileA.team.id,
            })),
            teamBSentPlayers: pkg.teamBPlayers.map(p => p.id),
            teamBSentPicks: pkg.teamBPicks.map(sp => ({
                season: sp.pick.season,
                round: sp.pick.round,
                originalTeamId: sp.pick.originalTeamId,
                currentTeamId: profileB.team.id,
            })),
            date: currentDate,
            isUserTrade: false,
        };
        const result = executeTrade(payload, teams, leaguePickAssets, leagueTradeBlocks);
        if (result.success && result.transaction) {
            transactions.push(result.transaction);
            tradedTeamIds.add(profileA.team.id);
            tradedTeamIds.add(profileB.team.id);
            if (result.overflowTeams) overflowCutPlayers.push(...trimOverflowRosters(teams, result.overflowTeams));
            return true;
        }
    } else {
        executeRosterSwap(profileA.team, profileB.team, pkg.teamAPlayers, pkg.teamBPlayers);
        const tx = createTradeTransaction(
            profileA.team, profileB.team, pkg.teamAPlayers, pkg.teamBPlayers, pkg.analysis
        );
        transactions.push(tx);
        tradedTeamIds.add(profileA.team.id);
        tradedTeamIds.add(profileB.team.id);
        overflowCutPlayers.push(...trimOverflowRosters(teams, [profileA.team.id, profileB.team.id]));
        return true;
    }
    return false;
}

// ── 타깃 선수를 최우선으로 배치한 프로필 복사본 생성 ──
function reorderAssetsWithTarget(profile: TeamTradeProfile, targetPlayerId: string): TeamTradeProfile {
    const target = profile.tradeableAssets.find(a => a.player.id === targetPlayerId);
    if (!target) return profile;
    const rest = profile.tradeableAssets.filter(a => a.player.id !== targetPlayerId);
    return { ...profile, tradeableAssets: [target, ...rest] };
}

// ── direction별 최소 utility ──
function getPhaseUtilityThreshold(phase: string): number {
    const thresholds: Record<string, number> = {
        winNow: -0.08,
        buyer: -0.02,
        standPat: 0.04,
        seller: -0.12,
        tanking: -0.15,
    };
    return thresholds[phase] ?? 0;
}

/**
 * 트레이드 후 로스터가 MAX_ROSTER_SIZE 초과한 CPU 팀을 정리.
 * 스타(OVR 88+ && age 33 이하)는 보호 → 최저 OVR 비스타 선수를 순서대로 컷.
 * 컷된 선수 목록을 반환하여 호출자가 FA 시장에 추가할 수 있도록 함.
 */
function trimOverflowRosters(teams: Team[], teamIds: string[]): Player[] {
    const cutPlayers: Player[] = [];
    for (const teamId of teamIds) {
        const team = teams.find(t => t.id === teamId);
        if (!team) continue;
        while (team.roster.length > MAX_ROSTER_SIZE) {
            const candidates = team.roster
                .filter(p => !(p.ovr >= 88 && p.age <= 33))
                .sort((a, b) => a.ovr - b.ovr);
            const cut = candidates[0];
            if (!cut) break;  // 스타만 남은 경우 overflow 허용
            cutPlayers.push(cut);
            team.roster = team.roster.filter(p => p.id !== cut.id);
            console.log(`✂️ Roster trim (overflow): ${cut.name} cut from ${teamId}`);
        }
    }
    return cutPlayers;
}
