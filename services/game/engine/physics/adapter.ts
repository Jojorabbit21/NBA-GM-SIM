
import type { PlayType } from '../../../../types';
import type { CourtSnapshot, PlayerCourtPosition } from '../pbp/pbpTypes';
import { createEntity } from './entity';
import type { PhysicsEntity, PhysicsWorld } from './types';

// ─────────────────────────────────────────────────────────────
// L5 — Adapter between the physics core and the existing PBP court-visualization types.
// This is the ONLY layer that knows about CourtSnapshot/PlayerCourtPosition — L0-L4 stay
// completely agnostic of the game engine, which is what will make them portable to the
// 3-mirror setup (client/Edge/server) once this foundation graduates out of the lab.
//
// PhysicsEntity.pos.{x,y} and PlayerCourtPosition.{x,y} are the same feet-based coordinate
// space (0-94 x, 0-50 y) by construction — no scaling/conversion needed, just field renaming.
// ─────────────────────────────────────────────────────────────

/** Per-player display metadata that PhysicsEntity doesn't carry but CourtSnapshot needs. */
export interface EntityMeta {
    position: string;
    isHome: boolean;
    hasBall?: boolean;
    role?: PlayerCourtPosition['role'];
}

export function worldToSnapshot(
    world: PhysicsWorld,
    meta: Record<string, EntityMeta>,
    offTeamId: string,
    playType?: PlayType,
    zone?: CourtSnapshot['zone'],
): CourtSnapshot {
    return {
        offTeamId,
        playType,
        zone,
        positions: world.entities.map((e): PlayerCourtPosition => {
            const m = meta[e.id];
            return {
                playerId: e.id,
                x: e.pos.x,
                y: e.pos.y,
                role: m?.role ?? (e.role as PlayerCourtPosition['role']) ?? 'spacer',
                hasBall: m?.hasBall ?? false,
                position: m?.position ?? e.position ?? '?',
                isHome: m?.isHome ?? false,
            };
        }),
    };
}

/** Build a fresh entity list straight from a CourtSnapshot (e.g. for the very first possession). */
export function snapshotToEntities(snapshot: CourtSnapshot): PhysicsEntity[] {
    return snapshot.positions.map(p => createEntity({
        id: p.playerId,
        pos: { x: p.x, y: p.y },
        role: p.role,
        position: p.position,
        team: p.isHome ? 'off' : 'def',
    }));
}

/**
 * Reconcile a world's entity list against a new CourtSnapshot IN PLACE, preserving pos/vel
 * for players who are still on court (so they keep moving from where they physically are)
 * and inserting brand-new entities directly at their snapshot position (substitutions are an
 * instantaneous real-world event — there is no "previous position on court" to animate from).
 * Players no longer in the snapshot are dropped.
 *
 * This is the seam the PBP-game-mode lab uses each possession: call this to update WHO exists,
 * then set steering targets separately from the same snapshot's coordinates to decide WHERE they
 * should move to.
 */
export function reconcileWorldEntities(world: PhysicsWorld, snapshot: CourtSnapshot): void {
    const existingById = new Map(world.entities.map(e => [e.id, e]));
    world.entities = snapshot.positions.map((p): PhysicsEntity => {
        const prev = existingById.get(p.playerId);
        if (prev) {
            prev.role = p.role;
            prev.position = p.position;
            prev.team = p.isHome ? 'off' : 'def';
            return prev;
        }
        return createEntity({
            id: p.playerId,
            pos: { x: p.x, y: p.y },
            role: p.role,
            position: p.position,
            team: p.isHome ? 'off' : 'def',
        });
    });
}

/** Extract a playerId → target-point map from a snapshot, for feeding into arrive()/seek(). */
export function snapshotTargets(snapshot: CourtSnapshot): Record<string, { x: number; y: number }> {
    const targets: Record<string, { x: number; y: number }> = {};
    for (const p of snapshot.positions) targets[p.playerId] = { x: p.x, y: p.y };
    return targets;
}

/** Extract playerId → EntityMeta map from a snapshot, for feeding back into worldToSnapshot(). */
export function snapshotMeta(snapshot: CourtSnapshot): Record<string, EntityMeta> {
    const meta: Record<string, EntityMeta> = {};
    for (const p of snapshot.positions) {
        meta[p.playerId] = { position: p.position, isHome: p.isHome, hasBall: p.hasBall, role: p.role };
    }
    return meta;
}

/**
 * Defensive normalization: collapse to at most one PlayerCourtPosition per playerId (last
 * write wins) before it ever reaches reconcileWorldEntities/snapshotTargets/snapshotMeta.
 *
 * This exists because a legal 5v5 halfcourt snapshot should never have more than 10 entries,
 * but this adapter has no way to enforce that upstream (in the PBP engine's TeamState.onCourt
 * rosters) — if onCourt ever grows past 5 players a side (a rotation/substitution bug, not a
 * physics-core bug), computeCourtPositions() would happily emit 12+ positions, and every
 * physics-lab entity/marker built from it would inherit that growth every possession. Dedup
 * here caps the VISUAL symptom regardless of where the root cause turns out to live, and the
 * console.warn is a deliberate tripwire: if this ever fires, the bug is in onCourt/rotation
 * state, not in reconcileWorldEntities (which is provably bounded to snapshot.positions.length).
 */
export function normalizeSnapshot(snapshot: CourtSnapshot): CourtSnapshot {
    const byId = new Map<string, PlayerCourtPosition>();
    for (const p of snapshot.positions) byId.set(p.playerId, p);
    const positions = Array.from(byId.values());
    if (positions.length > 10) {
        console.warn(
            `[physics-lab] courtSnapshot carried ${snapshot.positions.length} entries ` +
            `(${positions.length} unique playerIds) — expected ≤10 for a legal 5v5 formation. ` +
            `Check TeamState.onCourt size upstream (rotation/substitution system), not the physics adapter.`,
        );
    }
    return positions.length === snapshot.positions.length ? snapshot : { ...snapshot, positions };
}
