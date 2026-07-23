
import { add, dot, len, normalize, scale, sub, truncate, ZERO } from '../../../../utils/vec2';
import type { Vec2 } from '../../../../utils/vec2';
import type { CourtBounds, PhysicsEntity, SteeringOutput } from './types';

// ─────────────────────────────────────────────────────────────
// L4 — Steering behaviors (Craig Reynolds-style), adapted for a basketball court:
// bounded space, 5v5 crowding, and formations that need to settle without overshoot.
// Every function here is pure: (entity, ...params) → SteeringOutput. None of them know
// about PossessionResult, CourtSnapshot, or game rules — they only understand points,
// velocities, and forces. That's what keeps this layer reusable for both the manual
// sandbox and (later) a PBP-driven target sequence.
// ─────────────────────────────────────────────────────────────

/** Head straight for `target` at max speed — overshoots/oscillates if the entity arrives fast. */
export function seek(entity: PhysicsEntity, target: Vec2): SteeringOutput {
    const desired = scale(normalize(sub(target, entity.pos)), entity.maxSpeed);
    return { linear: truncate(sub(desired, entity.vel), entity.maxForce) };
}

// ─────────────────────────────────────────────────────────────
// DISABLED (2026-07-21) — kept for reference, not exported/used anywhere. Three successive
// attempts to tune a smooth deceleration curve (linear slowRadius ramp → damped spring →
// physically-derived braking distance + brakingEfficiency derating) all still produced visible
// overshoot-and-loop-back under real combine()'d conditions (separation/containment competing
// for the same force budget at exactly the moment several entities converge on nearby targets).
// Replaced at the call site with seek() (constant max-speed pursuit, no decel curve) plus a hard
// velocity/position snap once within a small radius of the target — see useReelPlayback.ts's
// SNAP_RADIUS_FT. That trades smooth deceleration for an abrupt full-speed-then-stop motion, but
// structurally cannot overshoot: the stop is a direct state assignment, not a force computed
// under assumptions that can be wrong.
//
// /**
//  * Like seek, but decelerates as it nears the target so it settles at rest instead of
//  * overshooting — the right choice for "stand at this spot" (formation slots).
//  *
//  * Target speed at each distance is capped at what the entity could ACTUALLY stop from using its
//  * own full braking force — the standard kinematic v = √(2·decel·distance), decel = maxForce/mass
//  * (from v²=2·a·d). This replaces two earlier broken attempts:
//  *   - A fixed linear ramp over an arbitrary `slowRadius` (maxSpeed·distance/slowRadius): if
//  *     slowRadius didn't happen to match what maxForce could actually achieve, the entity was
//  *     asked to be slower than physically necessary near the target and faster than achievable
//  *     stopping distance farther out, in an inconsistent way — net effect was overshoot-and-loop.
//  *   - Multiplying the FULL velocity by a flat damping factor k: at steady cruise (vel=desired=
//  *     maxSpeed), force = desired − k·vel is strongly negative for k>1, so entities never reach
//  *     maxSpeed at all — they settle at a crawl (desired/k, e.g. ~5.5ft/s at k=4) far from any
//  *     target, which read as "way too slow" and, combined with other forces fighting that broken
//  *     equilibrium, as a jagged/unstable path.
//  * This formula has neither problem: far from the target the braking speed exceeds maxSpeed, so
//  * rampedSpeed caps at maxSpeed and force→0 at cruise (normal, undamped sprint); close in, the
//  * cap tracks exactly what's stoppable in time, so it decelerates smoothly with no overshoot and
//  * no separate damping term needed.
//  *
//  * One remaining wrinkle: this entity is rarely steered by arrive() alone — combine() sums this
//  * with separation()/containment(), each already independently truncated to maxForce, THEN
//  * truncates the weighted total to maxForce again. When those other behaviors are also active
//  * (most likely exactly when several entities converge near the same destination — i.e. exactly
//  * when braking matters most), arrive()'s actual share of the final force can be well under 100%
//  * even with a favorable weight. If the braking-distance math above assumes the full maxForce is
//  * available and only a fraction actually is, the entity brakes too late and overshoots anyway —
//  * then gets pulled back, reading as the same loop this function was supposed to eliminate.
//  * brakingEfficiency derates the assumed decel so the braking curve starts with margin to spare
//  * even when arrive() isn't getting the whole force budget to itself.
//  */
// export function arrive(entity: PhysicsEntity, target: Vec2, brakingEfficiency: number = 0.5): SteeringOutput {
//     const toTarget = sub(target, entity.pos);
//     const distance = len(toTarget);
//     if (distance < 1e-3) {
//         // Already there — actively brake rather than doing nothing (residual velocity would drift past).
//         return { linear: truncate(scale(entity.vel, -1), entity.maxForce) };
//     }
//     const decel = (entity.maxForce * brakingEfficiency) / entity.mass;
//     const brakingSpeed = Math.sqrt(2 * decel * distance);
//     const rampedSpeed = Math.min(entity.maxSpeed, brakingSpeed);
//     const desired = scale(toTarget, rampedSpeed / distance);
//     return { linear: truncate(sub(desired, entity.vel), entity.maxForce) };
// }

/** Opposite of seek — move directly away from `threat`. */
export function flee(entity: PhysicsEntity, threat: Vec2): SteeringOutput {
    const desired = scale(normalize(sub(entity.pos, threat)), entity.maxSpeed);
    return { linear: truncate(sub(desired, entity.vel), entity.maxForce) };
}

// Gentle "don't fully overlap" push, present any time bodies are close — regardless of speed.
// Keeps a post-up or tight on-ball defender in contact without a visible bounce.
const SEPARATION_CONTACT_STRENGTH = 0.25;
// Extra push scaled by closing speed along the contact normal — only meaningful when the two are
// actually crashing into each other (a fast drive plowing into a defender, a mid-air collision),
// not just standing close. At entity.maxSpeed(22ft/s) this alone saturates the output (full bounce).
const SEPARATION_COLLISION_COEFF = 0.08;

/**
 * Push away from any neighbor closer than `sepRadius` — keeps 5v5 bodies from overlapping.
 * Two blended components instead of a single distance-only push, so real basketball contact
 * doesn't always look like a "bounce": two players standing close (post-up, tight D) get only
 * the gentle contact term, while two closing on each other fast (a driving collision) also get
 * a collision impulse scaled by how hard they're approaching — a real crash still bounces.
 */
export function separation(entity: PhysicsEntity, neighbors: PhysicsEntity[], sepRadius: number = 3): SteeringOutput {
    let force = ZERO;
    for (const other of neighbors) {
        if (other.id === entity.id) continue;
        const toSelf = sub(entity.pos, other.pos);
        const d = len(toSelf);
        if (d > 1e-6 && d < sepRadius) {
            const dir = scale(toSelf, 1 / d); // points from other -> entity
            const penetration = (sepRadius - d) / sepRadius; // 0..1, how deep into personal space

            const relVel = sub(entity.vel, other.vel);
            const closingSpeed = Math.max(0, -dot(relVel, dir)); // >0 only while actually approaching

            const magnitude = penetration * SEPARATION_CONTACT_STRENGTH + closingSpeed * SEPARATION_COLLISION_COEFF;
            force = add(force, scale(dir, magnitude));
        }
    }
    return { linear: truncate(scale(force, entity.maxForce), entity.maxForce) };
}

/** Soft push back toward the court interior once within `margin` feet of a boundary. */
export function containment(entity: PhysicsEntity, bounds: CourtBounds, margin: number = 2, strength: number = 1): SteeringOutput {
    let fx = 0, fy = 0;
    if (entity.pos.x < bounds.minX + margin) fx += (bounds.minX + margin - entity.pos.x);
    if (entity.pos.x > bounds.maxX - margin) fx -= (entity.pos.x - (bounds.maxX - margin));
    if (entity.pos.y < bounds.minY + margin) fy += (bounds.minY + margin - entity.pos.y);
    if (entity.pos.y > bounds.maxY - margin) fy -= (entity.pos.y - (bounds.maxY - margin));
    return { linear: truncate(scale({ x: fx, y: fy }, strength), entity.maxForce) };
}

/** Weighted sum of multiple steering outputs, capped to maxForce — the standard way to compose behaviors. */
export function combine(outputs: { out: SteeringOutput; weight: number }[], maxForce: number): SteeringOutput {
    let total = ZERO;
    for (const { out, weight } of outputs) {
        total = add(total, scale(out.linear, weight));
    }
    return { linear: truncate(total, maxForce) };
}
