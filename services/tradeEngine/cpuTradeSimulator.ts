
import { Player, Team, Transaction } from '../../types';
import { calculatePlayerOvr } from '../../utils/constants';
import { SEASON_START_DATE, TRADE_DEADLINE } from '../../utils/constants';
import { TRADE_CONFIG as C } from './tradeConfig';
import { getPlayerTradeValue, calculatePackageTrueValue } from './tradeValue';
import { analyzeTeamSituation, TeamNeeds } from './teamAnalysis';
import { checkTradeLegality } from './salaryRules';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface ScoredAsset {
    player: Player;
    tradeValue: number;
    willingness: number;
    reasons: string[];
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
    acquisitionPriorities: AcquisitionTarget[];
}

interface TradePackage {
    teamAPlayers: Player[];
    teamBPlayers: Player[];
    teamAValue: number;
    teamBValue: number;
    teamAImprovement: number;
    teamBImprovement: number;
    analysis: string[];
}

// ──────────────────────────────────────────────
// 1. 점진적 확률 계산
// ──────────────────────────────────────────────

function calculateTradeChance(currentDate: string): number {
    const current = new Date(currentDate).getTime();
    const start = new Date(SEASON_START_DATE).getTime();
    const deadline = new Date(TRADE_DEADLINE).getTime();

    if (current > deadline || current < start) return 0;

    const progress = Math.min(1, Math.max(0, (current - start) / (deadline - start)));
    const { BASE_PROBABILITY, MAX_PROBABILITY, PROBABILITY_EXPONENT } = C.CPU_TRADE;

    return BASE_PROBABILITY + (MAX_PROBABILITY - BASE_PROBABILITY) * Math.pow(progress, PROBABILITY_EXPONENT);
}

function getDaysUntilDeadline(currentDate: string): number {
    const current = new Date(currentDate).getTime();
    const deadline = new Date(TRADE_DEADLINE).getTime();
    return Math.max(0, Math.floor((deadline - current) / (1000 * 60 * 60 * 24)));
}

// ──────────────────────────────────────────────
// 2. 팀 프로필 생성
// ──────────────────────────────────────────────

function buildTeamTradeProfile(team: Team): TeamTradeProfile {
    const needs = analyzeTeamSituation(team);
    const roster = team.roster;
    const CC = C.CPU_TRADE;

    // ── 내놓을 수 있는 선수 판별 ──
    const tradeableAssets: ScoredAsset[] = [];

    if (roster.length <= C.DEPTH.MIN_ROSTER_SIZE) {
        return { team, needs, tradeableAssets: [], acquisitionPriorities: [] };
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
            reasons.push(`나쁜 계약 (OVR ${ovr}, $${p.salary}M)`);
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

    return { team, needs, tradeableAssets, acquisitionPriorities };
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
            if (asset.player.position.includes(need.position) && ovr >= need.minOvr) {
                scoreAtoB += need.priority * CC.POSITION_NEED_BONUS;

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
            if (asset.player.position.includes(need.position) && ovr >= need.minOvr) {
                scoreBtoA += need.priority * CC.POSITION_NEED_BONUS;

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

    // A→B: A의 tradeable 중 B의 니즈에 맞는 선수 선택
    const aToB = selectPlayersForNeeds(profileA.tradeableAssets, profileB.acquisitionPriorities);
    if (aToB.length === 0) return null;

    const aToBValue = calculatePackageTrueValue(aToB);
    if (aToBValue <= 0) return null;

    // B→A: B의 tradeable 중 A의 니즈에 맞고, 가치가 aToBValue의 95%~110% 범위인 패키지
    const bToA = buildMatchingPackage(
        profileB.tradeableAssets,
        profileA.acquisitionPriorities,
        aToBValue
    );
    if (bToA.length === 0) return null;

    const bToAValue = calculatePackageTrueValue(bToA);

    // 가치 비율 검증
    const ratioA = bToAValue / aToBValue; // A가 받는 가치 / A가 주는 가치
    const ratioB = aToBValue / bToAValue; // B가 받는 가치 / B가 주는 가치

    if (ratioA < CC.MIN_VALUE_RATIO || ratioA > CC.MAX_VALUE_RATIO) return null;
    if (ratioB < CC.MIN_VALUE_RATIO || ratioB > CC.MAX_VALUE_RATIO) return null;

    // 샐러리 합법성 양방향 체크
    if (!checkTradeLegality(teamA, bToA, aToB)) return null;
    if (!checkTradeLegality(teamB, aToB, bToA)) return null;

    // 로스터 최소 인원 체크
    if (teamA.roster.length - aToB.length + bToA.length < C.DEPTH.MIN_ROSTER_SIZE) return null;
    if (teamB.roster.length - bToA.length + aToB.length < C.DEPTH.MIN_ROSTER_SIZE) return null;

    // 팀력 개선도 체크
    const improvA = calculateTeamImprovement(teamA, bToA, aToB);
    const improvB = calculateTeamImprovement(teamB, aToB, bToA);

    if (improvA < CC.IMPROVEMENT_THRESHOLD || improvB < CC.IMPROVEMENT_THRESHOLD) return null;

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

    return {
        teamAPlayers: aToB,
        teamBPlayers: bToA,
        teamAValue: aToBValue,
        teamBValue: bToAValue,
        teamAImprovement: improvA,
        teamBImprovement: improvB,
        analysis: [...new Set(analysis)],
    };
}

function selectPlayersForNeeds(
    assets: ScoredAsset[],
    priorities: AcquisitionTarget[]
): Player[] {
    const selected: Player[] = [];
    const usedPriorities = new Set<number>();

    for (const asset of assets) {
        if (selected.length >= C.DEPTH.MAX_PACKAGE_SIZE) break;

        const ovr = calculatePlayerOvr(asset.player);
        for (let i = 0; i < priorities.length; i++) {
            if (usedPriorities.has(i)) continue;
            const need = priorities[i];
            if (asset.player.position.includes(need.position) && ovr >= need.minOvr) {
                selected.push(asset.player);
                usedPriorities.add(i);
                break;
            }
        }
    }

    return selected;
}

function buildMatchingPackage(
    assets: ScoredAsset[],
    priorities: AcquisitionTarget[],
    targetValue: number
): Player[] {
    const CC = C.CPU_TRADE;
    const minTarget = targetValue * CC.MIN_VALUE_RATIO;
    const maxTarget = targetValue * CC.MAX_VALUE_RATIO;

    // 우선: 니즈 매칭 자산으로 구성 시도
    const needMatched = selectPlayersForNeeds(assets, priorities);
    const needMatchedValue = calculatePackageTrueValue(needMatched);

    if (needMatchedValue >= minTarget && needMatchedValue <= maxTarget) {
        return needMatched;
    }

    // 가치가 부족하면 추가 자산 보충
    if (needMatchedValue < minTarget) {
        const usedIds = new Set(needMatched.map(p => p.id));
        const pkg = [...needMatched];

        for (const asset of assets) {
            if (usedIds.has(asset.player.id)) continue;
            if (pkg.length >= C.DEPTH.MAX_PACKAGE_SIZE) break;

            pkg.push(asset.player);
            usedIds.add(asset.player.id);

            const pkgValue = calculatePackageTrueValue(pkg);
            if (pkgValue >= minTarget) {
                if (pkgValue <= maxTarget) return pkg;
                // 초과 → 이 선수 빼고 다음 시도
                pkg.pop();
                usedIds.delete(asset.player.id);
            }
        }

        // 보충 후에도 범위 내 도달 시 반환
        const finalValue = calculatePackageTrueValue(pkg);
        if (finalValue >= minTarget && finalValue <= maxTarget) return pkg;
    }

    // 가치가 과하면 더 작은 패키지 시도
    if (needMatchedValue > maxTarget && needMatched.length > 1) {
        // 가장 가치 낮은 선수 하나로 시도
        for (const asset of assets) {
            const singleValue = getPlayerTradeValue(asset.player);
            if (singleValue >= minTarget && singleValue <= maxTarget) {
                // 니즈 매칭 확인
                const matches = priorities.some(
                    need => asset.player.position.includes(need.position) &&
                        calculatePlayerOvr(asset.player) >= need.minOvr
                );
                if (matches) return [asset.player];
            }
        }
    }

    return [];
}

// ──────────────────────────────────────────────
// 6. Transaction 생성
// ──────────────────────────────────────────────

function createTradeTransaction(
    teamA: Team, teamB: Team,
    teamAPlayers: Player[], teamBPlayers: Player[],
    analysis: string[]
): Transaction {
    const id = `cpu-trade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
    currentDate: string
): { updatedTeams: Team[]; transactions: Transaction[] } | null {
    // 데드라인 체크
    if (new Date(currentDate) > new Date(TRADE_DEADLINE)) return null;
    if (new Date(currentDate) < new Date(SEASON_START_DATE)) return null;

    // 확률 계산 & 주사위
    const chance = calculateTradeChance(currentDate);
    if (Math.random() > chance) return null;

    const CC = C.CPU_TRADE;
    const daysLeft = getDaysUntilDeadline(currentDate);
    const maxTradesToday = daysLeft <= CC.NEAR_DEADLINE_DAYS ? CC.MAX_TRADES_PER_DAY : 1;

    // CPU 팀 프로필 구축 (유저 팀 제외)
    const cpuTeams = teams.filter(t => t.id !== myTeamId);
    let profiles = cpuTeams.map(t => buildTeamTradeProfile(t));

    // 팀 쌍 호환성 계산
    const pairs: { a: TeamTradeProfile; b: TeamTradeProfile; score: number }[] = [];
    for (let i = 0; i < profiles.length; i++) {
        for (let j = i + 1; j < profiles.length; j++) {
            // 트레이드 가능 자산이 없으면 스킵
            if (profiles[i].tradeableAssets.length === 0 || profiles[j].tradeableAssets.length === 0) continue;

            const score = calculateCompatibility(profiles[i], profiles[j]);
            if (score > 0) {
                pairs.push({ a: profiles[i], b: profiles[j], score });
            }
        }
    }

    if (pairs.length === 0) return null;

    // 호환성 내림차순 + 약간의 랜덤성 (상위 쌍만 무조건 성사되지 않도록)
    pairs.sort((x, y) => y.score - x.score);
    const candidatePairs = pairs.slice(0, CC.MAX_CANDIDATE_PAIRS);

    // 후보 쌍에 랜덤 셔플 적용 (상위 5개 중에서 랜덤 선택 효과)
    for (let i = candidatePairs.length - 1; i > 0; i--) {
        // 인접 원소만 스왑 (부분 셔플 — 순위 우선 유지하되 약간의 무작위성)
        if (Math.random() < 0.3) {
            const j = Math.max(0, i - 1);
            [candidatePairs[i], candidatePairs[j]] = [candidatePairs[j], candidatePairs[i]];
        }
    }

    const transactions: Transaction[] = [];
    const tradedTeamIds = new Set<string>();

    for (const pair of candidatePairs) {
        if (transactions.length >= maxTradesToday) break;

        // 이미 오늘 트레이드한 팀은 건너뜀
        if (tradedTeamIds.has(pair.a.team.id) || tradedTeamIds.has(pair.b.team.id)) continue;

        const pkg = constructTradePackage(pair.a, pair.b);
        if (!pkg) continue;

        // 트레이드 실행
        executeRosterSwap(pair.a.team, pair.b.team, pkg.teamAPlayers, pkg.teamBPlayers);

        const tx = createTradeTransaction(
            pair.a.team, pair.b.team,
            pkg.teamAPlayers, pkg.teamBPlayers,
            pkg.analysis
        );
        transactions.push(tx);
        tradedTeamIds.add(pair.a.team.id);
        tradedTeamIds.add(pair.b.team.id);

        // 멀티 트레이드 시 프로필 재구축 (로스터 변경 반영)
        if (transactions.length < maxTradesToday) {
            profiles = cpuTeams
                .filter(t => !tradedTeamIds.has(t.id))
                .map(t => buildTeamTradeProfile(t));
        }
    }

    if (transactions.length === 0) return null;

    return { updatedTeams: teams, transactions };
}
