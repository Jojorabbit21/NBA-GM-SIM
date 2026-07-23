
import type { Vec2, Rect } from '../../../../utils/vec2';
import type { Rng } from '../../../../utils/rng';

// ─────────────────────────────────────────────────────────────
// Physics core types — L1 (Spacetime) / L2 (Entity) / L4 (Steering) contracts.
//
// Design constraint: every type here is a plain object / plain function signature.
// No class instances, no DOM/Node/Deno references. This is what lets the same code
// run client-side (single-player) and server-side (Deno Edge Function / Bun server
// for multiplayer) without modification — see docs/plan reactive-foraging-cake.md.
// ─────────────────────────────────────────────────────────────

/** Court boundary in feet — reuses the same coordinate system as CourtSnapshot (0-94 x, 0-50 y). */
export type CourtBounds = Rect;

export interface PhysicsEntity {
    id: string;                        // = playerId, so it maps 1:1 to PlayerCourtPosition.playerId
    pos: Vec2;                         // feet
    vel: Vec2;                         // ft/s
    acc: Vec2;                         // ft/s^2 — last computed acceleration (informational; reset each integrate call)
    maxSpeed: number;                  // ft/s (NBA sprint ≈ 20-24)
    maxForce: number;                  // ft/s^2 — steering/acceleration cap
    mass: number;                      // default 1
    radius: number;                    // ft — used by separation (personal space / no-overlap)
    team: 'off' | 'def' | 'neutral';   // for grouping (e.g. which players count as "neighbors" for separation)
    role?: string;                     // carried through for display — physics core does not interpret it
    position?: string;                 // PG/SG/SF/PF/C — carried through for display only
}

export interface PhysicsWorld {
    bounds: CourtBounds;
    dt: number;                        // fixed simulation timestep (seconds)
    tick: number;                      // integer tick counter
    time: number;                      // tick * dt
    rng: Rng;                          // the world's single deterministic RNG source
    entities: PhysicsEntity[];
}

export interface SteeringOutput {
    linear: Vec2;
    // angular?: number — reserved for future facing/orientation behaviors, unused for now
}

/**
 * A force provider computes the steering force for one entity given the current world state.
 * This is the seam between the pure physics core (L0-L3) and behavior composition (L4 usage):
 * callers build a ForceProvider by combining steering.ts primitives (seek/arrive/separation/
 * containment via combine()), then hand it to worldStep(). The physics core itself never
 * hardcodes "what players should do" — that's decided by whoever supplies the ForceProvider
 * (the manual sandbox, or later the PBP→ActionPlan bridge).
 */
export type ForceProvider = (entity: PhysicsEntity, world: PhysicsWorld) => SteeringOutput;

// ─────────────────────────────────────────────────────────────
// Ball — a distinct kind of subject from PhysicsEntity, not another item in world.entities.
// Players steer (seek/arrive toward a target, subject to accel/speed caps); the ball never
// steers itself — it's either rigidly attached to whichever player holds it, or a ballistic
// projectile in free flight once passed/shot. Those are different motion models, so the ball
// gets its own state shape and its own update functions (ballistics.ts) rather than being
// squeezed into PhysicsEntity's steering-based integration.
//
// height (z) is kept as a separate scalar rather than promoting Vec2 to a full Vec3 — the
// horizontal motion (pos) and vertical motion (height) integrate independently under gravity
// (standard projectile decomposition), so a dedicated 3-vector type isn't needed yet.
// ─────────────────────────────────────────────────────────────

export type BallPossessionState = 'held' | 'inFlight' | 'loose';

export interface BallState {
    pos: Vec2;                  // ground projection (x, y), feet
    height: number;             // z, feet above the court
    vel: Vec2;                  // horizontal velocity, ft/s
    vz: number;                 // vertical velocity, ft/s (positive = up)
    radius: number;             // ft (~0.4 for a regulation ball)
    state: BallPossessionState;
    carrierId?: string;         // entity id currently holding it (only meaningful when state === 'held')
}

// ─────────────────────────────────────────────────────────────
// Future connection points (types declared now, NOT implemented/used in this foundation stage).
// These are the seams where a later stage will bridge PossessionResult → physical motion:
//
//   planFromPossession(result: PossessionResult, seed: string): ActionPlan
//
// worldStep would then pick each entity's current steering target from the ActionPlan instead
// of a hand-set click target (manual mode) or a raw CourtSnapshot (PBP-lab mode). The physics
// core stays result-agnostic either way — it only ever sees "go to this point."
// ─────────────────────────────────────────────────────────────

export type PlayStepKind = 'moveTo' | 'wait' | 'screen' | 'cut' | 'hold';

export interface PlayStep {
    entityId: string;
    kind: PlayStepKind;
    target?: Vec2;
    untilTick?: number;
}

export interface ActionPlan {
    seed: string;
    steps: PlayStep[];
    totalTicks: number;
}
