
import { add, scale, truncate } from '../../../../utils/vec2';
import type { Vec2 } from '../../../../utils/vec2';
import type { PhysicsEntity } from './types';

// ─────────────────────────────────────────────────────────────
// L3 — Movement / Integration.
// Pure state transition: given a force and a timestep, advance one entity's velocity/position.
// This layer has no opinion about WHY the force exists (that's L4/steering's job) — it can be
// (and is) verified standalone with a constant force before steering.ts exists at all.
// Semi-implicit (symplectic) Euler: update velocity first, then use the NEW velocity for
// position — more stable than explicit Euler for spring/steering-like forces.
// ─────────────────────────────────────────────────────────────

export function integrate(entity: PhysicsEntity, force: Vec2, dt: number): void {
    entity.acc = scale(force, 1 / entity.mass);
    entity.vel = truncate(add(entity.vel, scale(entity.acc, dt)), entity.maxSpeed);
    entity.pos = add(entity.pos, scale(entity.vel, dt));
}
