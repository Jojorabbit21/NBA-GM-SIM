
// ─────────────────────────────────────────────────────────────
// Choreography continuity layer. When two independently-generated Reels are chained (e.g. a
// case1 entry followed by a CatchShoot pattern), each generator computes its own "free role"
// slot assignment (spacer pools etc.) from scratch — usually by roster array order — with no
// knowledge of where each player physically ended up in the PRECEDING reel. That's fine for
// anchored roles (actor/assister always keep their identity across reels already), but for
// interchangeable "free" slots it causes players to visibly swap places the instant one reel
// hands off to the next. assignNearestSlots() fixes that generically: given where a group of
// players currently are and a set of slots the next reel needs filled, it returns the
// minimum-total-travel-distance pairing, so whoever's already closest to a slot keeps it.
// ─────────────────────────────────────────────────────────────

export interface Pos { x: number; y: number }

function dist(a: Pos, b: Pos): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Every permutation of [0..n). Only ever called with n<=6 (see GREEDY_FALLBACK_THRESHOLD). */
function permutations<T>(items: T[]): T[][] {
    if (items.length <= 1) return [items];
    const result: T[][] = [];
    for (let i = 0; i < items.length; i++) {
        const rest = [...items.slice(0, i), ...items.slice(i + 1)];
        for (const perm of permutations(rest)) {
            result.push([items[i], ...perm]);
        }
    }
    return result;
}

const GREEDY_FALLBACK_THRESHOLD = 6; // above this, brute force (n!) gets too expensive

/** Greedy nearest-first fallback for player/slot counts too large for brute force. Not globally
 *  optimal, but a reasonable approximation and avoids factorial blowup. */
function assignGreedy(
    players: { id: string; pos: Pos }[],
    slots: { label: string; pos: Pos }[],
): Record<string, string> {
    const remainingPlayers = [...players];
    const remainingSlots = [...slots];
    const assignment: Record<string, string> = {};
    while (remainingSlots.length > 0 && remainingPlayers.length > 0) {
        let best = { slotIdx: 0, playerIdx: 0, d: Infinity };
        for (let s = 0; s < remainingSlots.length; s++) {
            for (let p = 0; p < remainingPlayers.length; p++) {
                const d = dist(remainingSlots[s].pos, remainingPlayers[p].pos);
                if (d < best.d) best = { slotIdx: s, playerIdx: p, d };
            }
        }
        const slot = remainingSlots.splice(best.slotIdx, 1)[0];
        const player = remainingPlayers.splice(best.playerIdx, 1)[0];
        assignment[slot.label] = player.id;
    }
    return assignment;
}

/**
 * Minimum-total-travel-distance pairing between a group of "free role" players and a set of
 * slots the next beat/reel needs filled. Use this whenever a generator is reassigning
 * interchangeable spacer-type roles right after a preceding reel already placed those same
 * players somewhere — NOT for anchored roles (actor/assister), which should keep their identity
 * across reels directly rather than being run through slot matching.
 *
 * players.length and slots.length don't need to match; extra slots are left unassigned, extra
 * players are simply not used. Brute-forces all permutations for small groups (typical case:
 * 3-4 players), falls back to a greedy nearest-first heuristic above GREEDY_FALLBACK_THRESHOLD.
 */
export function assignNearestSlots(
    players: { id: string; pos: Pos }[],
    slots: { label: string; pos: Pos }[],
): Record<string, string> {
    if (players.length === 0 || slots.length === 0) return {};
    if (players.length > GREEDY_FALLBACK_THRESHOLD || slots.length > GREEDY_FALLBACK_THRESHOLD) {
        return assignGreedy(players, slots);
    }

    const n = Math.min(players.length, slots.length);
    const slotSubset = slots.slice(0, n);
    let bestAssignment: Record<string, string> = {};
    let bestTotal = Infinity;

    for (const playerPerm of permutations(players)) {
        const chosen = playerPerm.slice(0, n);
        let total = 0;
        for (let i = 0; i < n; i++) total += dist(slotSubset[i].pos, chosen[i].pos);
        if (total < bestTotal) {
            bestTotal = total;
            bestAssignment = {};
            for (let i = 0; i < n; i++) bestAssignment[slotSubset[i].label] = chosen[i].id;
        }
    }
    return bestAssignment;
}
