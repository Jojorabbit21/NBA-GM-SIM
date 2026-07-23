
// ─────────────────────────────────────────────────────────────
// Deterministic RNG — promotes the existing mulberry32/hashString pattern
// (supabase/functions/_shared/multiDraftEngine.ts, server/src/shared/multiDraftEngine.ts)
// from a stateless one-shot shuffle helper into a stateful, forkable stream generator.
//
// Why this exists: the PBP engine currently calls Math.random() directly (~61 call sites),
// which is fine for a single client-or-server run but breaks reproducibility for anything
// that needs the SAME sequence twice — e.g. a physics simulation that must trace an identical
// trajectory on the client (SP) and on the server (MP), or a headless determinism test.
// This module is the shared primitive both the physics core and (eventually) the PBP engine
// can thread a seed through. Pure, no Math.random/Date/DOM/Node/Deno API — safe on all 3 runtimes.
// ─────────────────────────────────────────────────────────────

export interface Rng {
    /** Current 32bit generator state — exposed for logging/snapshotting, not for external mutation. */
    state: number;
    /** Next pseudo-random float in [0, 1). */
    next(): number;
    /** Next float in [min, max). */
    nextRange(min: number, max: number): number;
    /** Next integer in [0, n). */
    int(n: number): number;
    /** Next normally-distributed float (Box-Muller), clamped to [min, max] if given. */
    nextNormal(mean: number, std: number, min?: number, max?: number): number;
    /**
     * Derive an independent child stream from this generator's current state + a salt.
     * Use this to give each entity/behavior its own random sequence without perturbing
     * the parent stream's call order (e.g. rng.fork('jitter:' + playerId)).
     */
    fork(salt: string | number): Rng;
}

/** djb2-style 32bit string hash. Same shape as the existing hashString() in multiDraftEngine.ts. */
export function hashString(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return h >>> 0;
}

/** Mulberry32 step function — same core as multiDraftEngine.ts's mulberry32(). */
function mulberry32Step(a: number): number {
    let t = (a + 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
}

export function makeRng(seed: number | string): Rng {
    const initial = typeof seed === 'string' ? hashString(seed) : (seed >>> 0);

    const rng: Rng = {
        state: initial,

        next(): number {
            rng.state = mulberry32Step(rng.state);
            return rng.state / 0xFFFFFFFF;
        },

        nextRange(min: number, max: number): number {
            return min + rng.next() * (max - min);
        },

        int(n: number): number {
            return Math.floor(rng.next() * n);
        },

        nextNormal(mean: number, std: number, min = -Infinity, max = Infinity): number {
            const u1 = Math.max(1e-9, rng.next());
            const u2 = rng.next();
            const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
            return Math.min(max, Math.max(min, mean + z * std));
        },

        fork(salt: string | number): Rng {
            const saltHash = typeof salt === 'string' ? hashString(salt) : (salt >>> 0);
            return makeRng((rng.state ^ saltHash) >>> 0);
        },
    };

    return rng;
}
