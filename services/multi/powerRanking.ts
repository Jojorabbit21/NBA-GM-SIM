
import type { Team, Player } from '../../types';
import type { ArchetypeModuleScores } from '../../types/archetype';
import { calcModuleScores } from '../playerDevelopment/archetypeEvaluator';

const MODULE_NAMES: (keyof ArchetypeModuleScores)[] = [
    'rimFinishing', 'postCraft', 'spotUpShooting', 'shotCreation', 'playmaking',
    'offballAttack', 'poaDefense', 'teamDefense', 'rimProtection', 'rebounding',
    'motorAvailability',
];

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

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

/** values[i]가 전체 리그에서 몇 번째로 높은지를 0~100 백분위로 변환.
 * 팀 간 raw 전력치(로스터 OVR 등)는 스네이크 드래프트로 만든 리그일수록 편차가 매우 작아
 * (실측: 78.7~81.0 수준) 절대값 그대로 쓰면 순위가 사실상 안 갈린다 — 리그 내 상대 순위로
 * 바꿔야 파워랭킹다운 스프레드가 나온다. */
function percentileRank(values: number[]): number[] {
    const n = values.length;
    if (n <= 1) return values.map(() => 50);
    const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
    const ranks = new Array(n).fill(0);
    order.forEach((originalIndex, rank) => {
        ranks[originalIndex] = (rank / (n - 1)) * 100;
    });
    return ranks;
}

function harmonicMean(values: number[]): number {
    const safe = values.map(v => Math.max(v, 1));
    return safe.length / safe.reduce((sum, v) => sum + 1 / v, 0);
}

interface TeamRawMetrics {
    teamId: string;
    talentRaw: number;
    moduleRaw: Record<keyof ArchetypeModuleScores, number>;
    positionBalanceRaw: number;
}

function computeRawMetrics(
    team: Team,
    rotationMap?: Record<string, boolean[]>,
): TeamRawMetrics {
    const ranked = [...team.roster].sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
    const weights = ranked.map((p, i) => getPlayerWeight(p, i, rotationMap));
    const totalWeight = weights.reduce((s, w) => s + w, 0) || 1;

    const talentRaw = ranked.reduce((s, p, i) => s + (p.ovr || 0) * weights[i], 0) / totalWeight;

    const moduleRaw = {} as Record<keyof ArchetypeModuleScores, number>;
    const playerModules = ranked.map(p => calcModuleScores(p));
    for (const mod of MODULE_NAMES) {
        moduleRaw[mod] = playerModules.reduce((s, m, i) => s + m[mod] * weights[i], 0) / totalWeight;
    }

    const posGroups: Record<string, { ovr: number; weight: number }[]> = { PG: [], SG: [], SF: [], PF: [], C: [] };
    ranked.forEach((p, i) => {
        if (posGroups[p.position]) posGroups[p.position].push({ ovr: p.ovr || 0, weight: weights[i] });
    });
    const posAvgs = POSITIONS.map(pos => {
        const group = posGroups[pos];
        if (group.length === 0) return 0;
        const w = group.reduce((s, g) => s + g.weight, 0) || 1;
        return group.reduce((s, g) => s + g.ovr * g.weight, 0) / w;
    });
    const gap = Math.max(...posAvgs) - Math.min(...posAvgs);
    const positionBalanceRaw = Math.max(0, Math.min(100, 100 - gap * 1.2));

    return { teamId: team.id, talentRaw, moduleRaw, positionBalanceRaw };
}

export interface TeamPowerRanking {
    teamId: string;
    rank: number;
    /** 로테이션 가중 로스터 OVR의 리그 내 백분위 (0~100) */
    talentScore: number;
    /** 11개 역할 모듈의 리그 내 백분위을 조화평균한 값 (0~100) — 약점이 있으면 크게 깎임 */
    compositionScore: number;
    /** 포지션별 전력 격차의 리그 내 백분위 (0~100) */
    positionBalanceScore: number;
    /** talentScore*0.5 + compositionScore*0.35 + positionBalanceScore*0.15 — 최종 랭킹 지표 */
    powerScore: number;
    /** 팀 전체 11개 모듈 raw 가중평균 (0~100, UI 브레이크다운용 — 백분위 아님) */
    moduleScores: Record<keyof ArchetypeModuleScores, number>;
    /** 리그 내 백분위가 가장 낮은 모듈 = 이 팀의 상대적 약점 */
    weakestModule: { module: keyof ArchetypeModuleScores; percentile: number };
}

/** 시즌 시작 전 로스터 능력치만으로 팀별 예상 전력을 매기는 파워랭킹.
 * 실제 경기 결과가 없는 프리시즌 전용 — 시즌 진행 후에는 실적 기반 지표(승률/득실차)와
 * 별도로 병행하거나 대체해야 함. rotationMaps를 안 넘기면 OVR 랭크 기반 기본 출전시간
 * 커브(PROJECTED_DEPTH_MINUTES)로 대체한다. */
export function calculatePreseasonPowerRankings(
    teams: Team[],
    rotationMaps?: Record<string, Record<string, boolean[]>>,
): TeamPowerRanking[] {
    const raw = teams.map(t => computeRawMetrics(t, rotationMaps?.[t.id]));

    const talentPct = percentileRank(raw.map(r => r.talentRaw));
    const posBalPct = percentileRank(raw.map(r => r.positionBalanceRaw));
    const modulePctByName = {} as Record<keyof ArchetypeModuleScores, number[]>;
    for (const mod of MODULE_NAMES) {
        modulePctByName[mod] = percentileRank(raw.map(r => r.moduleRaw[mod]));
    }

    const rankings: TeamPowerRanking[] = raw.map((r, i) => {
        const modulePercentiles = MODULE_NAMES.map(mod => ({ module: mod, percentile: modulePctByName[mod][i] }));
        const compositionScore = harmonicMean(modulePercentiles.map(m => m.percentile));
        const weakestModule = modulePercentiles.reduce((min, m) => m.percentile < min.percentile ? m : min);
        const talentScore = talentPct[i];
        const positionBalanceScore = posBalPct[i];

        return {
            teamId: r.teamId,
            rank: 0,
            talentScore,
            compositionScore,
            positionBalanceScore,
            powerScore: talentScore * 0.5 + compositionScore * 0.35 + positionBalanceScore * 0.15,
            moduleScores: r.moduleRaw,
            weakestModule,
        };
    });

    rankings.sort((a, b) => b.powerScore - a.powerScore);
    rankings.forEach((r, i) => { r.rank = i + 1; });
    return rankings;
}
