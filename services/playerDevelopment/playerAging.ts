
import { Player, AttributeChangeEvent } from '../../types/player';
import { PlayerBoxScore } from '../../types/engine';
import { stringToHash } from '../../utils/hiddenTendencies';
import { calculateOvr } from '../../utils/ovrUtils';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** 37개 세부 능력치 키 */
export type SkillAttribute =
    | 'closeShot' | 'midRange' | 'threeCorner' | 'three45' | 'threeTop'
    | 'ft' | 'shotIq' | 'offConsist'
    | 'layup' | 'dunk' | 'postPlay' | 'drawFoul' | 'hands'
    | 'passAcc' | 'handling' | 'spdBall' | 'passIq' | 'passVision' | 'offBallMovement'
    | 'intDef' | 'perDef' | 'steal' | 'blk' | 'helpDefIq' | 'passPerc' | 'defConsist'
    | 'offReb' | 'defReb' | 'boxOut'
    | 'speed' | 'agility' | 'strength' | 'vertical' | 'stamina' | 'hustle' | 'durability'
    | 'intangibles';

/** 6개 카테고리 키 */
export type CategoryKey = 'ins' | 'out' | 'plm' | 'def' | 'reb' | 'ath';

export interface CategoryPotentials {
    ins: number; out: number; plm: number;
    def: number; reb: number; ath: number;
}

export interface CategoryAverages {
    ins: number; out: number; plm: number;
    def: number; reb: number; ath: number;
}

export interface GrowthProfile {
    categoryPotentials: CategoryPotentials;
    attrAffinities: Record<SkillAttribute, number>;
    athleticResilience: number;
}

export interface PerGameResult {
    playerId: string;
    fractionalDeltas: Partial<Record<SkillAttribute, number>>;
    integerChanges: Partial<Record<SkillAttribute, number>>;
    changeEvents: AttributeChangeEvent[];
    newOvr?: number;
}

export interface LeagueAverages {
    pts: number; p3m: number; ast: number;
    stl: number; blk: number; reb: number;
    mp: number; tov: number; pf: number; fgPct: number;
    ptsStd: number; p3mStd: number; astStd: number;
    stlStd: number; blkStd: number; rebStd: number;
    mpStd: number; tovStd: number; pfStd: number; fgPctStd: number;
}

export interface OffseasonResult {
    players: Array<{
        playerId: string;
        newAge: number;
        newCatPot: CategoryPotentials;
        seasonTotalDeltas: Partial<Record<SkillAttribute, number>>;
    }>;
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

/** 카테고리별 소속 능력치 매핑 */
const CATEGORY_ATTRS: Record<CategoryKey, SkillAttribute[]> = {
    ins: ['closeShot', 'layup', 'dunk', 'postPlay', 'drawFoul', 'hands'],
    out: ['midRange', 'threeCorner', 'three45', 'threeTop', 'ft', 'shotIq', 'offConsist'],
    plm: ['passAcc', 'handling', 'spdBall', 'passIq', 'passVision', 'offBallMovement'],
    def: ['intDef', 'perDef', 'steal', 'blk', 'helpDefIq', 'passPerc', 'defConsist'],
    reb: ['offReb', 'defReb', 'boxOut'],
    ath: ['speed', 'agility', 'strength', 'vertical', 'stamina', 'hustle', 'durability'],
};

/** 속성 → 카테고리 역매핑 (런타임 생성) */
const ATTR_TO_CATEGORY: Record<SkillAttribute, CategoryKey> = {} as any;
for (const [cat, attrs] of Object.entries(CATEGORY_ATTRS)) {
    for (const attr of attrs) {
        ATTR_TO_CATEGORY[attr] = cat as CategoryKey;
    }
}
// intangibles는 어떤 카테고리에도 속하지 않음 — 별도 처리
// (성장/퇴화 대상이되 카테고리 기반 로직에서는 제외)

/** 전체 37개 능력치 목록 (에이징 그룹 배분용) */
const ALL_ATTRIBUTES: SkillAttribute[] = [
    'closeShot', 'midRange', 'threeCorner', 'three45', 'threeTop',
    'ft', 'shotIq', 'offConsist',
    'layup', 'dunk', 'postPlay', 'drawFoul', 'hands',
    'passAcc', 'handling', 'spdBall', 'passIq', 'passVision', 'offBallMovement',
    'intDef', 'perDef', 'steal', 'blk', 'helpDefIq', 'passPerc', 'defConsist',
    'offReb', 'defReb', 'boxOut',
    'speed', 'agility', 'strength', 'vertical', 'stamina', 'hustle', 'durability',
    'intangibles',
];

/** 에이징 그룹 정의 (4그룹, 37개 능력치 배분) */
interface AgingGroup {
    name: string;
    peakAge: number;
    declineOnset: number;
    maxSeasonDecline: number;
    floor: number;
    attributes: SkillAttribute[];
}

const AGING_GROUPS: AgingGroup[] = [
    {
        name: 'earlyAthletic',
        peakAge: 26,
        declineOnset: 28,
        maxSeasonDecline: 4.5,
        floor: 40,
        attributes: ['speed', 'agility', 'vertical', 'stamina', 'spdBall', 'dunk'],
    },
    {
        name: 'midPhysical',
        peakAge: 28,
        declineOnset: 30,
        maxSeasonDecline: 3.5,
        floor: 38,
        attributes: ['strength', 'durability', 'layup', 'closeShot', 'steal', 'blk', 'offReb'],
    },
    {
        name: 'lateStable',
        peakAge: 29,
        declineOnset: 32,
        maxSeasonDecline: 2.5,
        floor: 38,
        attributes: ['intDef', 'perDef', 'defReb', 'boxOut', 'drawFoul', 'hands', 'offBallMovement', 'hustle', 'postPlay'],
    },
    {
        name: 'iqSkill',
        peakAge: 32,
        declineOnset: 33,
        maxSeasonDecline: 2.0,
        floor: 40,
        attributes: ['midRange', 'threeCorner', 'three45', 'threeTop', 'ft', 'shotIq', 'offConsist', 'passAcc', 'handling', 'passIq', 'passVision', 'helpDefIq', 'passPerc', 'defConsist', 'intangibles'],
    },
];

/** 속성 → 에이징 그룹 역매핑 */
const ATTR_TO_AGING_GROUP: Record<SkillAttribute, AgingGroup> = {} as any;
for (const group of AGING_GROUPS) {
    for (const attr of group.attributes) {
        ATTR_TO_AGING_GROUP[attr] = group;
    }
}

/** 카테고리 POT 생성용 포지션 보너스 */
const POSITION_BONUS: Record<string, Record<CategoryKey, number>> = {
    PG: { ins: -2, out: +1, plm: +3, def: 0,  reb: -3, ath: +1 },
    SG: { ins: 0,  out: +2, plm: 0,  def: 0,  reb: -2, ath: +1 },
    SF: { ins: 0,  out: 0,  plm: 0,  def: +1, reb: 0,  ath: 0  },
    PF: { ins: +2, out: -1, plm: -1, def: +1, reb: +2, ath: 0  },
    C:  { ins: +3, out: -2, plm: -2, def: +1, reb: +3, ath: -1 },
};

/** 성장 rate 기본 상수 (튜닝 대상) */
const BASE_GROWTH_RATE = 0.35;

/** 경기 스탯 → 카테고리 매핑 */
const PERF_STAT_TO_CATS: Record<string, CategoryKey[]> = {
    pts:  ['ins', 'out'],
    p3m:  ['out'],
    rimM: ['ins'],
    ast:  ['plm'],
    stl:  ['def'],
    blk:  ['def'],
    reb:  ['reb'],
};

// ═══════════════════════════════════════════════════════════════
// Seeded Random Helpers (hiddenTendencies.ts 패턴 복제)
// ═══════════════════════════════════════════════════════════════

function seededRandom(seed: number): number {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

function seededNormal(
    baseSeed: number,
    offset: number,
    mean: number,
    stdev: number,
    min: number,
    max: number,
): number {
    const u1 = Math.max(0.001, seededRandom(baseSeed + offset * 7));
    const u2 = seededRandom(baseSeed + offset * 7 + 1);
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return Math.max(min, Math.min(max, mean + z * stdev));
}

// ═══════════════════════════════════════════════════════════════
// Helper: Player 속성 읽기/쓰기
// ═══════════════════════════════════════════════════════════════

function getAttr(player: Player, attr: SkillAttribute): number {
    return (player as any)[attr] as number;
}

function getCategoryAverage(player: Player, cat: CategoryKey): number {
    const attrs = CATEGORY_ATTRS[cat];
    if (!attrs || attrs.length === 0) return 70;
    const sum = attrs.reduce((s, a) => s + getAttr(player, a), 0);
    return sum / attrs.length;
}

function getCategoryAverages(player: Player): CategoryAverages {
    return {
        ins: getCategoryAverage(player, 'ins'),
        out: getCategoryAverage(player, 'out'),
        plm: getCategoryAverage(player, 'plm'),
        def: getCategoryAverage(player, 'def'),
        reb: getCategoryAverage(player, 'reb'),
        ath: getCategoryAverage(player, 'ath'),
    };
}

/** 포지션 문자열에서 주 포지션 키 추출 */
function resolvePosKey(position: string): string {
    if (position.includes('PG')) return 'PG';
    if (position.includes('SG')) return 'SG';
    if (position.includes('SF')) return 'SF';
    if (position.includes('PF')) return 'PF';
    if (position.includes('C')) return 'C';
    return 'SF';
}

// ═══════════════════════════════════════════════════════════════
// 4. generateCategoryPotentials
// ═══════════════════════════════════════════════════════════════

export function generateCategoryPotentials(
    overallPot: number,
    position: string,
    categoryAverages: CategoryAverages,
): CategoryPotentials {
    const posKey = resolvePosKey(position);
    const bonus = POSITION_BONUS[posKey] ?? POSITION_BONUS['SF'];

    const cats: CategoryKey[] = ['ins', 'out', 'plm', 'def', 'reb', 'ath'];
    const overallAvg = cats.reduce((s, c) => s + categoryAverages[c], 0) / cats.length;

    const result: Partial<CategoryPotentials> = {};
    for (const cat of cats) {
        const relStrength = categoryAverages[cat] - overallAvg;
        const raw = overallPot + relStrength * 0.6 + bonus[cat];
        result[cat] = Math.max(50, Math.min(99, Math.round(raw)));
    }

    return result as CategoryPotentials;
}

// ═══════════════════════════════════════════════════════════════
// 5. generateGrowthProfile (attrAffinity + athleticResilience)
// ═══════════════════════════════════════════════════════════════

export function generateGrowthProfile(
    tendencySeed: string,
    playerId: string,
    player: Player,
): GrowthProfile {
    const growthSeed = stringToHash(`growth_${tendencySeed}_${playerId}`);

    // 속성별 친화도 (0.3 ~ 2.0, 평균 1.0)
    const attrAffinities: Record<SkillAttribute, number> = {} as any;
    for (let i = 0; i < ALL_ATTRIBUTES.length; i++) {
        attrAffinities[ALL_ATTRIBUTES[i]] = seededNormal(growthSeed, i, 1.0, 0.4, 0.3, 2.0);
    }

    // athleticResilience: -2 ~ +2 (earlyAthletic onset 조정)
    const athleticResilience = seededNormal(growthSeed, 100, 0, 1.0, -2, 2);

    // catPot 생성
    const catAvgs = getCategoryAverages(player);
    const categoryPotentials = generateCategoryPotentials(
        player.potential,
        player.position,
        catAvgs,
    );

    return { categoryPotentials, attrAffinities, athleticResilience };
}

// ═══════════════════════════════════════════════════════════════
// 7. Per-Game 성장 계산
// ═══════════════════════════════════════════════════════════════

function calculatePerGameGrowth(
    player: Player,
    gameBoxScore: PlayerBoxScore,
    catPotentials: CategoryPotentials,
    attrAffinities: Record<SkillAttribute, number>,
    tcr: number,
    leagueAverages: LeagueAverages,
): Partial<Record<SkillAttribute, number>> {
    const age = player.age;

    // 30세 이상: 성장 없음
    if (age >= 30) return {};

    // 나이 계수
    let ageFactor: number;
    if (age <= 21) {
        ageFactor = 1.0;
    } else if (age <= 26) {
        // 22~26: 선형 감소 1.0 → 0.2
        ageFactor = 1.0 - (age - 21) * (0.8 / 5);
    } else {
        // 27~29
        ageFactor = 0.1;
    }

    // 출전시간 비례 계수 (0분이면 성장 없음)
    const mpRatio = Math.min(1.0, gameBoxScore.mp / 36);
    if (mpRatio <= 0) return {};

    // 퍼포먼스 보정 계산
    const perfMultipliers: Partial<Record<CategoryKey, number>> = {};
    const cats: CategoryKey[] = ['ins', 'out', 'plm', 'def', 'reb', 'ath'];

    for (const cat of cats) {
        perfMultipliers[cat] = 1.0;
    }

    // 경기 스탯 → 카테고리별 퍼포먼스 배율
    // rimM/midM은 deprecated → zoneData에서 rim+paint 합산
    const zd = (gameBoxScore as any).zoneData || {};
    const insideMakes = (zd.zone_rim_m || 0) + (zd.zone_paint_m || 0) + (gameBoxScore.rimM || 0);
    const gameFgPct = gameBoxScore.fga > 0 ? gameBoxScore.fgm / gameBoxScore.fga : 0;

    const perfCalcs: { stat: number; avg: number; std: number; cats: CategoryKey[] }[] = [
        // 긍정 지표 (높을수록 좋음)
        { stat: gameBoxScore.pts, avg: leagueAverages.pts, std: leagueAverages.ptsStd, cats: ['ins', 'out'] },
        { stat: gameBoxScore.p3m, avg: leagueAverages.p3m, std: leagueAverages.p3mStd, cats: ['out'] },
        { stat: insideMakes, avg: leagueAverages.pts * 0.3, std: leagueAverages.ptsStd * 0.3, cats: ['ins'] },
        { stat: gameBoxScore.ast, avg: leagueAverages.ast, std: leagueAverages.astStd, cats: ['plm'] },
        { stat: gameBoxScore.stl, avg: leagueAverages.stl, std: leagueAverages.stlStd, cats: ['def'] },
        { stat: gameBoxScore.blk, avg: leagueAverages.blk, std: leagueAverages.blkStd, cats: ['def'] },
        { stat: gameBoxScore.reb, avg: leagueAverages.reb, std: leagueAverages.rebStd, cats: ['reb'] },
        // 야투율 (높을수록 좋음)
        { stat: gameFgPct, avg: leagueAverages.fgPct, std: leagueAverages.fgPctStd, cats: ['ins', 'out'] },
        // 부정 지표 (반전: 낮을수록 좋음 → stat과 avg를 뒤집어서 높을수록 좋은 z-score)
        { stat: -gameBoxScore.tov, avg: -leagueAverages.tov, std: leagueAverages.tovStd, cats: ['plm', 'out'] },
        { stat: -gameBoxScore.pf, avg: -leagueAverages.pf, std: leagueAverages.pfStd, cats: ['def'] },
    ];

    // 카테고리별 퍼포먼스 z-score 누적
    const catPerfScores: Record<CategoryKey, number[]> = { ins: [], out: [], plm: [], def: [], reb: [], ath: [] };
    for (const pc of perfCalcs) {
        if (pc.std <= 0) continue;
        const z = (pc.stat - pc.avg) / pc.std;
        for (const cat of pc.cats) {
            catPerfScores[cat].push(z);
        }
    }

    for (const cat of cats) {
        const scores = catPerfScores[cat];
        if (scores.length > 0) {
            const avgZ = scores.reduce((s, v) => s + v, 0) / scores.length;
            // 음수 허용: 끔찍한 경기 시 perfMultiplier < 0 → 능력치 하락
            perfMultipliers[cat] = Math.max(-0.5, Math.min(2.0, 1.0 + avgZ * 0.3));
        }
    }

    // ath는 출전시간 비례
    perfMultipliers['ath'] = Math.max(0.3, Math.min(2.0, 0.3 + mpRatio * 1.7));

    // 카테고리별 성장 에너지 → 속성별 분배
    const deltas: Partial<Record<SkillAttribute, number>> = {};

    for (const cat of cats) {
        const currentCatAvg = getCategoryAverage(player, cat);
        const catPot = catPotentials[cat];
        const catGap = Math.max(0, catPot - currentCatAvg);

        // POT 소프트 캡
        let growthMult: number;
        if (currentCatAvg <= catPot - 5) {
            growthMult = 1.0;
        } else if (currentCatAvg <= catPot) {
            growthMult = 0.2 + 0.8 * ((catPot - currentCatAvg) / 5);
        } else {
            const overshoot = currentCatAvg - catPot;
            growthMult = 0.15 * Math.exp(-overshoot * 0.3);
        }

        // 시즌 총 성장 예산 → 1경기당
        const effectiveGap = currentCatAvg <= catPot ? catGap : 5;
        const seasonBudget = effectiveGap * BASE_GROWTH_RATE * ageFactor * growthMult * tcr;
        const perGameBase = seasonBudget / 82;
        const perfMult = perfMultipliers[cat] ?? 1.0;
        const catEnergy = perGameBase * perfMult * mpRatio;

        if (Math.abs(catEnergy) < 0.0001) continue;

        const attrs = CATEGORY_ATTRS[cat];

        if (catEnergy > 0) {
            // ── 성장: affinity × room 기반 분배 ──
            let totalWeight = 0;
            const weights: number[] = [];

            for (const attr of attrs) {
                const room = Math.max(0, 99 - getAttr(player, attr));
                const w = (attrAffinities[attr] ?? 1.0) * room;
                weights.push(w);
                totalWeight += w;
            }

            if (totalWeight <= 0) continue;

            for (let i = 0; i < attrs.length; i++) {
                const share = weights[i] / totalWeight;
                const delta = Math.min(0.4, catEnergy * share);
                if (delta > 0.001) {
                    deltas[attrs[i]] = (deltas[attrs[i]] ?? 0) + delta;
                }
            }
        } else {
            // ── 부진 퇴화: 현재 값 비례 분배 (높은 능력치가 더 많이 떨어짐) ──
            let totalWeight = 0;
            const weights: number[] = [];
            const PERF_DECLINE_FLOOR = 40; // 부진 퇴화 바닥

            for (const attr of attrs) {
                const val = getAttr(player, attr);
                const room = Math.max(0, val - PERF_DECLINE_FLOOR);
                weights.push(room);
                totalWeight += room;
            }

            if (totalWeight <= 0) continue;

            for (let i = 0; i < attrs.length; i++) {
                const share = weights[i] / totalWeight;
                const delta = Math.max(-0.3, catEnergy * share); // 속성당 최대 -0.3/경기
                if (delta < -0.001) {
                    deltas[attrs[i]] = (deltas[attrs[i]] ?? 0) + delta;
                }
            }
        }
    }

    // intangibles: iqSkill 카테고리 에너지의 일부를 별도 적용
    const iqCatAvg = getCategoryAverage(player, 'out'); // iqSkill 참조용
    const iqPot = catPotentials.out;
    const iqGap = Math.max(0, iqPot - iqCatAvg);
    if (iqGap > 0 && ageFactor > 0) {
        const intRoom = Math.max(0, 99 - getAttr(player, 'intangibles'));
        const intDelta = (iqGap * BASE_GROWTH_RATE * ageFactor * tcr / 82) * mpRatio * 0.1;
        if (intDelta > 0.001 && intRoom > 0) {
            deltas['intangibles'] = (deltas['intangibles'] ?? 0) + Math.min(0.2, intDelta);
        }
    }

    return deltas;
}

// ═══════════════════════════════════════════════════════════════
// 8. Per-Game 퇴화 계산
// ═══════════════════════════════════════════════════════════════

function calculatePerGameDecline(
    player: Player,
    tendencySeed: string,
    seasonNumber: number,
    athleticResilience: number,
    tcr: number,
    mpRatio: number,
): Partial<Record<SkillAttribute, number>> {
    const age = player.age;
    const agingSeed = stringToHash(`aging_${tendencySeed}_${player.id}_s${seasonNumber}`);
    const deltas: Partial<Record<SkillAttribute, number>> = {};

    for (let gi = 0; gi < AGING_GROUPS.length; gi++) {
        const group = AGING_GROUPS[gi];

        // earlyAthletic에만 athleticResilience 적용
        const effectiveOnset = gi === 0
            ? group.declineOnset + athleticResilience
            : group.declineOnset;

        for (let ai = 0; ai < group.attributes.length; ai++) {
            const attr = group.attributes[ai];
            const currentValue = getAttr(player, attr);
            const seedOffset = gi * 50 + ai;

            if (age >= effectiveOnset) {
                // ── 퇴화 ──
                const yearsOver = age - effectiveOnset;
                let baseSeasonDecline = Math.min(
                    group.maxSeasonDecline,
                    (yearsOver / 8) * group.maxSeasonDecline,
                );

                // 33세+ 가속 (iqSkill 제외)
                if (age >= 33 && group.name !== 'iqSkill') {
                    baseSeasonDecline *= 1.0 + (age - 33) * 0.15;
                }

                // 시드 기반 개인차 ±40%
                const variance = seededNormal(agingSeed, seedOffset, 0, 0.4, -0.4, 0.4);
                let seasonDecline = baseSeasonDecline * (1 + variance) * tcr;

                // 평균 회귀 (높을수록 더 떨어짐)
                const heightPenalty = Math.max(0, (currentValue - 70) * 0.03);
                seasonDecline += heightPenalty;

                // 1경기당 (82경기 분배), 바닥 체크
                const perGameDecline = Math.min(0.3, seasonDecline / 82) * mpRatio;
                const newValue = currentValue - perGameDecline;

                if (newValue >= group.floor && perGameDecline > 0.001) {
                    deltas[attr] = (deltas[attr] ?? 0) - perGameDecline;
                }
            } else if (age > group.peakAge) {
                // ── 유지 노이즈 (peak ~ onset 사이) ──
                const seasonNoise = seededNormal(agingSeed, seedOffset + 100, 0, 0.5, -1.0, 1.0) * tcr;
                const perGameNoise = (seasonNoise / 82) * mpRatio;

                // 노이즈로 바닥 이하로 내려가지 않도록
                if (perGameNoise < 0 && currentValue + perGameNoise < group.floor) continue;
                // 노이즈로 99 초과하지 않도록
                if (perGameNoise > 0 && currentValue >= 99) continue;

                if (Math.abs(perGameNoise) > 0.001) {
                    deltas[attr] = (deltas[attr] ?? 0) + perGameNoise;
                }
            }
        }
    }

    return deltas;
}

// ═══════════════════════════════════════════════════════════════
// 10. Fractional 누적 → 정수 변화 처리
// ═══════════════════════════════════════════════════════════════

interface AccumulationResult {
    updatedFractional: Partial<Record<SkillAttribute, number>>;
    integerChanges: Partial<Record<SkillAttribute, number>>;
    changeEvents: AttributeChangeEvent[];
}

function accumulateAndResolve(
    player: Player,
    currentFractional: Partial<Record<SkillAttribute, number>>,
    newDeltas: Partial<Record<SkillAttribute, number>>,
    gameDate: string,
): AccumulationResult {
    const updatedFractional: Partial<Record<SkillAttribute, number>> = { ...currentFractional };
    const integerChanges: Partial<Record<SkillAttribute, number>> = {};
    const changeEvents: AttributeChangeEvent[] = [];

    for (const [attr, delta] of Object.entries(newDeltas) as [SkillAttribute, number][]) {
        if (!delta || Math.abs(delta) < 0.0001) continue;

        const prev = updatedFractional[attr] ?? 0;
        let accumulated = prev + delta;

        // 정수 변화 체크
        while (accumulated >= 1.0) {
            const currentVal = getAttr(player, attr) + (integerChanges[attr] ?? 0);
            if (currentVal >= 99) {
                accumulated = Math.min(accumulated, 0.99);
                break;
            }
            integerChanges[attr] = (integerChanges[attr] ?? 0) + 1;
            accumulated -= 1.0;
            changeEvents.push({
                date: gameDate,
                attribute: attr,
                delta: 1,
                oldValue: currentVal,
                newValue: currentVal + 1,
            });
        }

        while (accumulated <= -1.0) {
            const currentVal = getAttr(player, attr) + (integerChanges[attr] ?? 0);
            const group = ATTR_TO_AGING_GROUP[attr];
            const floor = group?.floor ?? 35;
            if (currentVal <= floor) {
                accumulated = Math.max(accumulated, -0.99);
                break;
            }
            integerChanges[attr] = (integerChanges[attr] ?? 0) - 1;
            accumulated += 1.0;
            changeEvents.push({
                date: gameDate,
                attribute: attr,
                delta: -1,
                oldValue: currentVal,
                newValue: currentVal - 1,
            });
        }

        // sparse 저장: 0에 가까우면 제거
        if (Math.abs(accumulated) < 0.0001) {
            delete updatedFractional[attr];
        } else {
            updatedFractional[attr] = accumulated;
        }
    }

    return { updatedFractional, integerChanges, changeEvents };
}

// ═══════════════════════════════════════════════════════════════
// 7+8+10 통합: calculatePerGameDevelopment (메인 함수)
// ═══════════════════════════════════════════════════════════════

export function calculatePerGameDevelopment(
    player: Player,
    gameBoxScore: PlayerBoxScore,
    catPotentials: CategoryPotentials,
    attrAffinities: Record<SkillAttribute, number>,
    athleticResilience: number,
    currentFractional: Partial<Record<SkillAttribute, number>>,
    tendencySeed: string,
    seasonNumber: number,
    tcr: number,
    leagueAverages: LeagueAverages,
    gameDate: string,
): PerGameResult {
    const mpRatio = Math.min(1.0, gameBoxScore.mp / 36);

    // 성장 delta (나이 < 30)
    const growthDeltas = calculatePerGameGrowth(
        player,
        gameBoxScore,
        catPotentials,
        attrAffinities,
        tcr,
        leagueAverages,
    );

    // 퇴화 delta (나이 > peakAge인 그룹에 적용)
    const declineDeltas = calculatePerGameDecline(
        player,
        tendencySeed,
        seasonNumber,
        athleticResilience,
        tcr,
        mpRatio,
    );

    // 합산
    const combinedDeltas: Partial<Record<SkillAttribute, number>> = {};
    const allKeys = Array.from(new Set([
        ...Object.keys(growthDeltas) as SkillAttribute[],
        ...Object.keys(declineDeltas) as SkillAttribute[],
    ]));

    for (const attr of allKeys) {
        const g = growthDeltas[attr] ?? 0;
        const d = declineDeltas[attr] ?? 0;
        const total = g + d;
        if (Math.abs(total) > 0.0001) {
            combinedDeltas[attr] = total;
        }
    }

    // 누적 및 정수 변화 해소
    const { updatedFractional, integerChanges, changeEvents } = accumulateAndResolve(
        player,
        currentFractional,
        combinedDeltas,
        gameDate,
    );

    // OVR 재계산 (정수 변화 발생 시)
    let newOvr: number | undefined;
    if (Object.keys(integerChanges).length > 0) {
        const tempAttrs: any = {};
        for (const attr of ALL_ATTRIBUTES) {
            tempAttrs[attr] = getAttr(player, attr) + (integerChanges[attr] ?? 0);
        }
        // 카테고리 평균도 재계산
        for (const cat of ['ins', 'out', 'plm', 'def', 'reb', 'ath'] as CategoryKey[]) {
            const attrs = CATEGORY_ATTRS[cat];
            tempAttrs[cat] = attrs.reduce((s: number, a: SkillAttribute) => s + tempAttrs[a], 0) / attrs.length;
        }
        // height도 넘겨줌 (OVR 가중치에 포함)
        tempAttrs.height = player.height;
        newOvr = calculateOvr(tempAttrs, player.position);
    }

    return {
        playerId: player.id,
        fractionalDeltas: updatedFractional,
        integerChanges,
        changeEvents,
        newOvr,
    };
}

// ═══════════════════════════════════════════════════════════════
// 11. 오프시즌 처리
// ═══════════════════════════════════════════════════════════════

export function processOffseason(
    players: Player[],
    tendencySeed: string,
    seasonNumber: number,
): OffseasonResult {
    const result: OffseasonResult = { players: [] };

    for (const player of players) {
        // 시즌 delta 계산 (changeLog에서 집계)
        const seasonTotalDeltas: Partial<Record<SkillAttribute, number>> = {};
        if (player.changeLog) {
            for (const evt of player.changeLog) {
                const key = evt.attribute as SkillAttribute;
                seasonTotalDeltas[key] = (seasonTotalDeltas[key] || 0) + evt.delta;
            }
        }

        // age +1
        const newAge = player.age + 1;
        player.age = newAge;

        // contractYears -1
        if (player.contractYears > 0) {
            player.contractYears -= 1;
        }

        // fractionalGrowth / changeLog / attrDeltas 리셋 (새 시즌 0부터)
        player.fractionalGrowth = {};
        player.attrDeltas = {};
        player.changeLog = [];
        player.seasonStartAttributes = undefined;

        // catPot 재계산 (새 나이의 능력치 기준)
        const newCatPot = generateCategoryPotentials(
            player.potential,
            player.position,
            getCategoryAverages(player),
        );

        result.players.push({
            playerId: player.id,
            newAge,
            newCatPot,
            seasonTotalDeltas,
        });
    }

    return result;
}

// ═══════════════════════════════════════════════════════════════
// LeagueAverages 계산 (teams 데이터 기반)
// ═══════════════════════════════════════════════════════════════

/** NBA 기본 리그 평균 (시즌 초반 게임 수 부족 시 fallback) */
const DEFAULT_LEAGUE_AVERAGES: LeagueAverages = {
    pts: 14.0, p3m: 1.8, ast: 3.2,
    stl: 0.9, blk: 0.5, reb: 5.5, mp: 24.0,
    tov: 1.5, pf: 2.0, fgPct: 0.46,
    ptsStd: 8.0, p3mStd: 1.5, astStd: 2.5,
    stlStd: 0.8, blkStd: 0.6, rebStd: 3.5, mpStd: 10.0,
    tovStd: 1.0, pfStd: 1.0, fgPctStd: 0.12,
};

/**
 * 전체 teams에서 리그 평균/표준편차 계산.
 * 10경기 이상 출전한 선수만 포함. 데이터 부족 시 기본값 반환.
 */
export function computeLeagueAverages(teams: { roster: Player[] }[]): LeagueAverages {
    const samples: { pts: number; p3m: number; ast: number; stl: number; blk: number; reb: number; mp: number; tov: number; pf: number; fgPct: number }[] = [];

    for (const team of teams) {
        for (const p of team.roster) {
            if (!p.stats || p.stats.g < 10) continue;
            const g = p.stats.g;
            samples.push({
                pts: p.stats.pts / g,
                p3m: p.stats.p3m / g,
                ast: p.stats.ast / g,
                stl: p.stats.stl / g,
                blk: p.stats.blk / g,
                reb: p.stats.reb / g,
                mp: p.stats.mp / g,
                tov: p.stats.tov / g,
                pf: p.stats.pf / g,
                fgPct: p.stats.fga > 0 ? p.stats.fgm / p.stats.fga : 0,
            });
        }
    }

    if (samples.length < 30) return DEFAULT_LEAGUE_AVERAGES;

    const n = samples.length;
    const mean = (key: keyof typeof samples[0]) => samples.reduce((s, v) => s + v[key], 0) / n;
    const std = (key: keyof typeof samples[0], avg: number) =>
        Math.sqrt(samples.reduce((s, v) => s + (v[key] - avg) ** 2, 0) / n) || 1;

    const ptsMean = mean('pts');
    const p3mMean = mean('p3m');
    const astMean = mean('ast');
    const stlMean = mean('stl');
    const blkMean = mean('blk');
    const rebMean = mean('reb');
    const mpMean = mean('mp');
    const tovMean = mean('tov');
    const pfMean = mean('pf');
    const fgPctMean = mean('fgPct');

    return {
        pts: ptsMean, p3m: p3mMean, ast: astMean,
        stl: stlMean, blk: blkMean, reb: rebMean, mp: mpMean,
        tov: tovMean, pf: pfMean, fgPct: fgPctMean,
        ptsStd: std('pts', ptsMean), p3mStd: std('p3m', p3mMean), astStd: std('ast', astMean),
        stlStd: std('stl', stlMean), blkStd: std('blk', blkMean), rebStd: std('reb', rebMean),
        mpStd: std('mp', mpMean), tovStd: std('tov', tovMean), pfStd: std('pf', pfMean),
        fgPctStd: std('fgPct', fgPctMean),
    };
}

// ═══════════════════════════════════════════════════════════════
// 성장 결과를 Player 객체에 반영하는 헬퍼
// ═══════════════════════════════════════════════════════════════

/**
 * PerGameResult의 integerChanges를 Player 객체에 직접 적용.
 * 속성값 변경 + 카테고리 평균 재계산 + OVR 갱신.
 * fractionalGrowth, changeLog도 Player에 머지.
 */
export function applyDevelopmentResult(player: Player, result: PerGameResult): void {
    // 1. 정수 변화 적용 + attrDeltas 누적
    if (!player.attrDeltas) player.attrDeltas = {};
    for (const [attr, delta] of Object.entries(result.integerChanges)) {
        if (!delta) continue;
        const key = attr as SkillAttribute;
        (player as any)[key] = Math.max(35, Math.min(99, getAttr(player, key) + delta));
        player.attrDeltas[key] = (player.attrDeltas[key] ?? 0) + delta;
    }

    // 2. 카테고리 평균 재계산
    if (Object.keys(result.integerChanges).length > 0) {
        for (const cat of ['ins', 'out', 'plm', 'def', 'reb', 'ath'] as CategoryKey[]) {
            const attrs = CATEGORY_ATTRS[cat];
            if (attrs) {
                (player as any)[cat] = Math.round(
                    attrs.reduce((s: number, a: SkillAttribute) => s + getAttr(player, a), 0) / attrs.length,
                );
            }
        }
        // OVR 갱신
        if (result.newOvr !== undefined) {
            player.ovr = result.newOvr;
        }
    }

    // 3. fractionalGrowth 머지
    player.fractionalGrowth = result.fractionalDeltas;

    // 4. changeLog 머지
    if (result.changeEvents.length > 0) {
        if (!player.changeLog) player.changeLog = [];
        player.changeLog.push(...result.changeEvents);
    }
}

// ═══════════════════════════════════════════════════════════════
// 시즌 시작 초기화
// ═══════════════════════════════════════════════════════════════

/**
 * 시즌 시작 시 모든 선수의 seasonStartAttributes 스냅샷 생성.
 * 성장/퇴화 delta UI 표시를 위해 기준점 저장.
 */
export function initializeSeasonGrowth(players: Player[]): void {
    for (const player of players) {
        // 현재 속성값 스냅샷
        const snapshot: Record<string, number> = {};
        for (const attr of ALL_ATTRIBUTES) {
            snapshot[attr] = getAttr(player, attr);
        }
        player.seasonStartAttributes = snapshot;
        player.fractionalGrowth = {};
        player.attrDeltas = {};
        player.changeLog = [];
    }
}

/**
 * 저장된 attrDeltas를 Player 속성에 재적용 (로드 시 사용).
 * meta_players 원본에서 시작하므로 시즌 내 정수 변화를 다시 반영.
 */
export function reapplyAttrDeltas(player: Player): void {
    if (!player.attrDeltas) return;
    for (const [attr, delta] of Object.entries(player.attrDeltas)) {
        if (!delta) continue;
        const key = attr as SkillAttribute;
        (player as any)[key] = Math.max(35, Math.min(99, getAttr(player, key) + delta));
    }
    // 카테고리 평균 + OVR 재계산
    for (const cat of ['ins', 'out', 'plm', 'def', 'reb', 'ath'] as CategoryKey[]) {
        const attrs = CATEGORY_ATTRS[cat];
        if (attrs) {
            (player as any)[cat] = Math.round(
                attrs.reduce((s: number, a: SkillAttribute) => s + getAttr(player, a), 0) / attrs.length,
            );
        }
    }
    player.ovr = calculateOvr(player, player.position);
}

// ═══════════════════════════════════════════════════════════════
// 경기 후 성장 통합 처리 (게임 서비스에서 호출)
// ═══════════════════════════════════════════════════════════════

/**
 * 한 경기의 양 팀 선수들에 대해 성장/퇴화 계산 + 적용.
 * userGameService, cpuGameService, batchSeasonService에서 공통 호출.
 */
export function processGameDevelopment(
    homeRoster: Player[],
    awayRoster: Player[],
    homeBox: PlayerBoxScore[],
    awayBox: PlayerBoxScore[],
    tendencySeed: string,
    tcr: number,
    leagueAverages: LeagueAverages,
    gameDate: string,
    seasonNumber: number = 1,
): void {
    const pairs: [Player[], PlayerBoxScore[]][] = [
        [homeRoster, homeBox],
        [awayRoster, awayBox],
    ];

    for (const [roster, boxScores] of pairs) {
        for (const box of boxScores) {
            if (box.mp <= 0) continue; // 미출전 선수 스킵

            const player = roster.find(p => p.id === box.playerId);
            if (!player) continue;

            // GrowthProfile은 시드 기반 결정론적 → 매번 재생성 가능
            const profile = generateGrowthProfile(tendencySeed, player.id, player);

            const result = calculatePerGameDevelopment(
                player,
                box,
                profile.categoryPotentials,
                profile.attrAffinities,
                profile.athleticResilience,
                player.fractionalGrowth ?? {},
                tendencySeed,
                seasonNumber,
                tcr,
                leagueAverages,
                gameDate,
            );

            applyDevelopmentResult(player, result);
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// Exports: 상수 & 유틸
// ═══════════════════════════════════════════════════════════════

export { CATEGORY_ATTRS, AGING_GROUPS, ALL_ATTRIBUTES, ATTR_TO_CATEGORY, ATTR_TO_AGING_GROUP };
export { getCategoryAverages };
