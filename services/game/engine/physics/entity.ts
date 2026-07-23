
import { ZERO } from '../../../../utils/vec2';
import type { Vec2 } from '../../../../utils/vec2';
import type { PhysicsEntity } from './types';

// ─────────────────────────────────────────────────────────────
// L2 — Entity construction helpers.
// Defaults are rough NBA-scale numbers (ft/s): a full sprint is ~20-24 ft/s (~14-16 mph),
// maxForce controls how quickly a player can change velocity (accel/decel/cut sharpness),
// radius ~1.4ft approximates personal space for separation (shoulder-to-shoulder ≈ 2-3ft apart).
// These are placeholders for this foundation stage — tunable once real motion is compared
// against game footage / design intent.
// ─────────────────────────────────────────────────────────────

const DEFAULTS = {
    vel: ZERO,
    acc: ZERO,
    maxSpeed: 22,
    // arrive()'s braking curve now derives its deceleration zone directly from maxForce/mass
    // (v = √(2·decel·distance)) instead of a separately-tuned slowRadius/dampingFactor — so this
    // value alone controls both how sharply a sprint turns into a cut AND how far out braking
    // starts. 45 → braking begins ≈5.4ft from the target at full speed (close to the original
    // slowRadius=6 feel), stop time ≈0.49s. The earlier 90/140 values were only compensating for
    // a broken damping formula (since fixed) and aren't needed at this magnitude anymore.
    maxForce: 45,
    mass: 1,
    radius: 1.4,
    team: 'neutral' as const,
};

export function createEntity(params: Partial<PhysicsEntity> & { id: string; pos: Vec2 }): PhysicsEntity {
    return {
        ...DEFAULTS,
        ...params,
    };
}
