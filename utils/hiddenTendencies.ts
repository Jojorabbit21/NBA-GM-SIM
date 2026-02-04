
import { Player, HiddenTendencies } from '../types';

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
