
import { lerp, clampToBounds } from '../../../../utils/vec2';
import { makeRng } from '../../../../utils/rng';
import { COURT_WIDTH, COURT_HEIGHT } from '../../../../utils/courtCoordinates';
import { integrate } from './integration';
import type { CourtBounds, ForceProvider, PhysicsEntity, PhysicsWorld } from './types';

// ─────────────────────────────────────────────────────────────
// L1 — Spacetime.
// A PhysicsWorld is a clock + a court boundary + a single deterministic RNG source + the
// entities living in it. It owns "when" and "where the edges are" — it does not own "why
// entities move" (that's the ForceProvider, composed from L4 steering.ts elsewhere).
//
// worldStep() runs one fixed-dt tick: for every entity, ask the ForceProvider for a force,
// integrate it (L3), then hard-clamp position to the court bounds as a safety net (the softer
// `containment` steering behavior in steering.ts is meant to keep entities away from the edge
// well before this clamp would ever trigger).
// ─────────────────────────────────────────────────────────────

export const COURT_BOUNDS: CourtBounds = { minX: 0, maxX: COURT_WIDTH, minY: 0, maxY: COURT_HEIGHT };

export function createWorld(
    seed: number | string,
    entities: PhysicsEntity[],
    bounds: CourtBounds = COURT_BOUNDS,
    dt: number = 1 / 60,
): PhysicsWorld {
    return { bounds, dt, tick: 0, time: 0, rng: makeRng(seed), entities };
}

export function worldStep(world: PhysicsWorld, forceProvider: ForceProvider): void {
    for (const entity of world.entities) {
        const { linear } = forceProvider(entity, world);
        integrate(entity, linear, world.dt);
        entity.pos = clampToBounds(entity.pos, world.bounds);
    }
    world.tick += 1;
    world.time = world.tick * world.dt;
}

/** Deep-enough copy for render interpolation (prev/current snapshot pair) — entities + their vectors. */
export function cloneWorld(world: PhysicsWorld): PhysicsWorld {
    return {
        ...world,
        entities: world.entities.map(cloneEntity),
    };
}

function cloneEntity(e: PhysicsEntity): PhysicsEntity {
    return { ...e, pos: { ...e.pos }, vel: { ...e.vel }, acc: { ...e.acc } };
}

/**
 * Interpolate entity positions between two world snapshots (prev → current) by alpha [0,1].
 * This is the render-side half of "fixed-dt simulate, variable-rate render": the simulation
 * always advances in whole `dt` steps, but the screen can refresh at any rate, so the visible
 * frame is a blend of the last two simulated states rather than a hard jump.
 * Matches entities by id — entities present only in `b` (e.g. a substitution) appear at `b`'s
 * position with no blending (nothing to interpolate from).
 */
export function lerpWorld(a: PhysicsWorld, b: PhysicsWorld, alpha: number): PhysicsWorld {
    const prevById = new Map(a.entities.map(e => [e.id, e]));
    return {
        ...b,
        entities: b.entities.map(eb => {
            const ea = prevById.get(eb.id);
            if (!ea) return eb;
            return { ...eb, pos: lerp(ea.pos, eb.pos, alpha) };
        }),
    };
}
