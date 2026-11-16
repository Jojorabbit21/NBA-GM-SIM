
import type { Team, Player } from '../../types';
import type { ArchetypeModuleScores } from '../../types/archetype';
import { calcModuleScores } from '../playerDevelopment/archetypeEvaluator';
import { POWER_CATEGORIES, type PowerCategory, type PowerCategoryKey } from './powerRankingCategories';

export { POWER_CATEGORIES };
export type { PowerCategory, PowerCategoryKey };

/** 로테이션 미확정(시즌 개막 전) 상태의 기본 출전시간 가중치 — OVR 랭크 1~10위 순으로
 * 실제 NBA 팀의 전형적인 분당 배분(선발 5명 합 160분 + 식스맨~10옵션 80분 = 팀 총 240분)을
 * 본떠 하드코딩. 로테이션이 실제로 짜여있으면(GameTactics.rotationMap) 그 실측 분배로 대체한다. */
const PROJECTED_DEPTH_MINUTES = [36, 34, 32, 30, 28, 24, 20, 16, 12, 8];

function getPlayerWeight(
    player: Player,
    depthRank: number,
    rotationMap?: Record<string, boolean[]>,
): number {
    const rotation = rotationMap?.[player.id];
    if (rotation) return rotation.filter(Boolean).length;
    return PROJECTED_DEPTH_MINUTES[depthRank] ?? 0;
}

interface TeamRawMetrics {
    teamId: string;
    categoryRaw: Record<PowerCategoryKey, number>;
}

function computeRawMetrics(
    team: Team,
    rotationMap?: Record<string, boolean[]>,
): TeamRawMetrics {
    const ranked = [...team.roster].sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
    const weights = ranked.map((p, i) => getPlayerWeight(p, i, rotationMap));
    const totalWeight = weights.reduce((s, w) => s + w, 0) || 1;
    const playerModules = ranked.map(p => calcModuleScores(p));
    const teamModule = (mod: keyof ArchetypeModuleScores) =>
        playerModules.reduce((s, m, i) => s + m[mod] * weights[i], 0) / totalWeight;

    const categoryRaw = {} as Record<PowerCategoryKey, number>;
    for (const cat of POWER_CATEGORIES) {
        categoryRaw[cat.key] = cat.modules.reduce((s, mod) => s + teamModule(mod), 0) / cat.modules.length;
    }
    return { teamId: team.id, categoryRaw };
}

/** values[i]의 리그 내 순위(1 = 가장 높음). 동률은 teamIds 오름차순으로 갈라 입력 순서와 무관하게 결정론적. */
function rankDescending(values: number[], teamIds: string[]): number[] {
    const order = values.map((_, i) => i).sort((a, b) => values[b] - values[a] || teamIds[a].localeCompare(teamIds[b]));
    const ranks = new Array(values.length).fill(0);
    order.forEach((originalIndex, position) => { ranks[originalIndex] = position + 1; });
    return ranks;
}

/** 순위 → 0~100 백분위(1위 = 100, 꼴찌 = 0). 팀 간 raw 전력치는 편차가 작아 절대값으로는 순위가
 * 사실상 안 갈린다 — 리그 내 상대 순위로 바꿔야 파워랭킹다운 스프레드가 나온다. */
function rankToPercentile(rank: number, teamCount: number): number {
    return teamCount > 1 ? ((teamCount - rank) / (teamCount - 1)) * 100 : 50;
}

const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / (values.length || 1);

export interface TeamPowerRanking {
    teamId: string;
    rank: number;
    /** 부문별 리그 내 순위(1 = 최고) — 뉴스 표가 그대로 보여준다 */
    categoryRanks: Record<PowerCategoryKey, number>;
    /** 부문별 팀 값(로테이션 가중 평균 모듈 점수, 능력치 스케일) — 순위의 근거 값 */
    categoryRatings: Record<PowerCategoryKey, number>;
    /** 공격 4개 부문 백분위의 평균 (0~100) */
    offenseScore: number;
    /** 수비 4개 부문 백분위의 평균 (0~100) */
    defenseScore: number;
    /** (offenseScore + defenseScore) / 2 = 8개 부문 백분위의 평균 (0~100) — 최종 랭킹 지표.
     * 표에 보이는 부문 순위만으로 다시 계산할 수 있다. */
    powerScore: number;
}

/** 로스터 능력치만으로 팀별 예상 전력을 매기는 파워랭킹(실제 경기 결과는 반영하지 않는다).
 * rotationMaps를 안 넘기면 OVR 랭크 기반 기본 출전시간 커브(PROJECTED_DEPTH_MINUTES)로 대체한다. */
export function calculatePreseasonPowerRankings(
    teams: Team[],
    rotationMaps?: Record<string, Record<string, boolean[]>>,
): TeamPowerRanking[] {
    const raw = teams.map(t => computeRawMetrics(t, rotationMaps?.[t.id]));
    const teamIds = raw.map(r => r.teamId);
    const teamCount = raw.length;

    const ranksByCategory = {} as Record<PowerCategoryKey, number[]>;
    for (const cat of POWER_CATEGORIES) {
        ranksByCategory[cat.key] = rankDescending(raw.map(r => r.categoryRaw[cat.key]), teamIds);
    }

    const sideScore = (side: PowerCategory['side'], i: number) =>
        mean(POWER_CATEGORIES.filter(c => c.side === side).map(c => rankToPercentile(ranksByCategory[c.key][i], teamCount)));

    const rankings: TeamPowerRanking[] = raw.map((r, i) => {
        const categoryRanks = {} as Record<PowerCategoryKey, number>;
        for (const cat of POWER_CATEGORIES) categoryRanks[cat.key] = ranksByCategory[cat.key][i];
        const offenseScore = sideScore('offense', i);
        const defenseScore = sideScore('defense', i);
        return {
            teamId: r.teamId,
            rank: 0,
            categoryRanks,
            categoryRatings: r.categoryRaw,
            offenseScore,
            defenseScore,
            powerScore: (offenseScore + defenseScore) / 2,
        };
    });

    // 부문 순위의 평균이라 동점이 실제로 나온다(30팀 기준 흔함) — 부문 값 평균이 높은 팀, 그다음 teamId 순.
    // 점수는 100/(부문 수 × (팀 수 − 1)) 단위로만 벌어지므로 부동소수 오차(1e-13 수준)는 동점으로 본다.
    const ratingMean = (r: TeamPowerRanking) => mean(POWER_CATEGORIES.map(c => r.categoryRatings[c.key]));
    rankings.sort((a, b) => {
        const diff = b.powerScore - a.powerScore;
        if (Math.abs(diff) > 1e-9) return diff;
        return ratingMean(b) - ratingMean(a) || a.teamId.localeCompare(b.teamId);
    });
    rankings.forEach((r, i) => { r.rank = i + 1; });
    return rankings;
}
