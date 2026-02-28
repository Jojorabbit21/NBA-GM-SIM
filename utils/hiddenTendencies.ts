
import { Player, HiddenTendencies, SaveTendencies } from '../types';

/**
 * Deterministic Hash Function (String -> Number)
 * Ensures the same player always gets the same hidden stats.
 */
function stringToHash(str: string): number {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

/**
 * Generates a pseudo-random number between 0 and 1 based on a seed.
 */
function seededRandom(seed: number): number {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

/**
 * Generates hidden tendencies for a player based on their ID and Attributes.
 * Not stored in DB, generated on the fly.
 * 
 * [Update] 'Archetype' removed here. We now use the dynamic 'ArchetypeSystem' for role-based logic.
 * This file now focuses purely on 'Flavor' (Left/Right preference).
 */
export function generateHiddenTendencies(player: Player): HiddenTendencies {
    const seed = stringToHash(player.id + player.name);
    
    // 1. Dominant Hand (90% Right, 10% Left)
    // Using simple modulo logic on the hash
    const handRoll = seededRandom(seed) * 100;
    const hand: 'Right' | 'Left' = handRoll < 10 ? 'Left' : 'Right';

    // 2. Lateral Bias (Left vs Right Preference)
    // Generate a Normal Distribution-like value using Box-Muller transform
    // Result is roughly -1.0 (Left) to 1.0 (Right), centered at 0
    const u1 = Math.max(0.001, seededRandom(seed + 1));
    const u2 = seededRandom(seed + 2);
    // Standard normal distribution (mean=0, std=1)
    let z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    // Clamp to -1.5 ~ 1.5 and normalize to -1 ~ 1 range effectively
    const lateralBias = Math.max(-1.0, Math.min(1.0, z / 2.5));

    return { hand, lateralBias };
}

// ─────────────────────────────────────────────────────────────
// Save-seeded Tendencies (세이브별 고유 텐던시)
// ─────────────────────────────────────────────────────────────

/** 모든 값이 중립인 기본 텐던시 (레거시 세이브 호환) */
export const DEFAULT_TENDENCIES: SaveTendencies = {
    clutchGene: 0,
    consistency: 0.6,
    confidenceSensitivity: 1.0,
    composure: 0,
    motorIntensity: 1.0,
    focusDrift: 0.5,
    shotDiscipline: 0,
    defensiveMotor: 0,
    ballDominance: 1.0,
    foulProneness: 0,
    playStyle: 0,
    temperament: 0,
    ego: 0,
};

/**
 * Box-Muller 변환으로 정규분포 난수 생성 (시드 기반)
 * @param baseSeed 기본 시드
 * @param offset 텐던시별 오프셋 (서로 다른 난수 생성)
 * @param mean 평균
 * @param stdev 표준편차
 * @param min 최솟값 (clamp)
 * @param max 최댓값 (clamp)
 */
function seededNormal(baseSeed: number, offset: number, mean: number, stdev: number, min: number, max: number): number {
    const u1 = Math.max(0.001, seededRandom(baseSeed + offset * 7));
    const u2 = seededRandom(baseSeed + offset * 7 + 1);
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return Math.max(min, Math.min(max, mean + z * stdev));
}

/**
 * 균등분포 난수 생성 (시드 기반)
 */
function seededUniform(baseSeed: number, offset: number, min: number, max: number): number {
    const r = seededRandom(baseSeed + offset * 7);
    return min + r * (max - min);
}

/**
 * 세이브 시드 + 선수 ID로 13개 히든 텐던시를 결정론적으로 생성.
 * 같은 시드 + 같은 선수 → 항상 동일한 텐던시.
 * 다른 시드 → 완전히 다른 텐던시.
 */
export function generateSaveTendencies(tendencySeed: string, playerId: string): SaveTendencies {
    const baseSeed = stringToHash(tendencySeed + playerId);

    return {
        // 멘탈 (6)
        clutchGene:            seededNormal(baseSeed, 0,  0,   0.4,   -1.0, 1.0),
        consistency:           seededNormal(baseSeed, 1,  0.6, 0.15,   0.0, 1.0),
        confidenceSensitivity: seededNormal(baseSeed, 2,  1.0, 0.25,   0.3, 1.7),
        composure:             seededNormal(baseSeed, 3,  0,   0.35,  -1.0, 1.0),
        motorIntensity:        seededNormal(baseSeed, 4,  1.0, 0.2,    0.5, 1.5),
        focusDrift:            seededUniform(baseSeed, 5, 0.0, 1.0),

        // 플레이스타일 (5)
        shotDiscipline:        seededNormal(baseSeed, 6,  0.1, 0.35,  -1.0, 1.0),
        defensiveMotor:        seededNormal(baseSeed, 7,  0,   0.4,   -1.0, 1.0),
        ballDominance:         seededNormal(baseSeed, 8,  1.0, 0.2,    0.5, 1.5),
        foulProneness:         seededNormal(baseSeed, 9,  0,   0.3,   -1.0, 1.0),
        playStyle:             seededNormal(baseSeed, 10, 0,   0.35,  -1.0, 1.0),

        // 성격 (2)
        temperament:           seededNormal(baseSeed, 11, 0,   0.35,  -1.0, 1.0),
        ego:                   seededNormal(baseSeed, 12, 0,   0.3,   -1.0, 1.0),
    };
}
