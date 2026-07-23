
import { add, lerp, scale, sub, ZERO } from '../../../../utils/vec2';
import type { Vec2 } from '../../../../utils/vec2';
import { COURT_WIDTH, HOOP_X_LEFT, HOOP_Y_CENTER } from '../../../../utils/courtCoordinates';
import type { BallState, PhysicsEntity } from './types';

// ─────────────────────────────────────────────────────────────
// Ball motion — held (rigidly attached to a carrier) vs in-flight (ballistic projectile).
// The key primitive is launchToTarget(): given a known start point/height and a known end
// point/height and a chosen flight duration, solve the constant horizontal velocity + initial
// vertical velocity that lands the ball EXACTLY there at EXACTLY that time under gravity. That
// is what lets a shot/pass trajectory agree with an already-decided PossessionResult (made
// shot → lands at the rim; miss → bounces toward the recorded rebounder) within a chosen
// possession-tick window, while the ballistics themselves stay completely outcome-agnostic —
// they only ever receive "start here, end there, take this long."
// ─────────────────────────────────────────────────────────────

export const GRAVITY_FT_S2 = 32; // approximation of 32.17 ft/s²

// Shot target height. Real rim height is 10ft, but CourtBackground.tsx's rim icon is a flat
// top-down mark with no height offset (implicit z=0) — so a shot arcing to a "true" z=10 target
// renders BallMarker.tsx's height-offset ball hovering well above that flat icon, never visually
// landing on it. Targeting z=0 instead makes the animated arc's landing point coincide with the
// rim icon on screen, at the cost of not modeling the literal 10ft rim in this lab's ballistics.
export const RIM_HEIGHT_FT = 0;
export const DRIBBLE_HEIGHT_FT = 3.5;

/** Chest-pass release/catch height — flatter and lower than a shot arc, deliberately reusing
 *  launchBall/launchToTarget rather than a separate "pass" function: a short duration between
 *  two points at similar (chest-level) height naturally solves to a low, fast arc, while a shot's
 *  long duration to the 10ft rim naturally solves to a high one. Same physics, different inputs. */
export const CHEST_HEIGHT_FT = 4.5;

// Height the ball is released from at the top of a jumpshot (arms extended overhead) — distinct
// from DRIBBLE_HEIGHT_FT (the ball's held/catch height inherited from the preceding beat).
// Raising this raises the arc's peak without touching shot duration/flight time.
export const SHOT_RELEASE_HEIGHT_FT = 8.0;

export function createBall(pos: Vec2, height: number = DRIBBLE_HEIGHT_FT): BallState {
    return { pos: { ...pos }, height, vel: ZERO, vz: 0, radius: 0.4, state: 'held' };
}

/** Rigidly attach the ball to a carrier — call every tick while held so it tracks the carrier's live position. */
export function attachToCarrier(ball: BallState, carrier: PhysicsEntity, height: number = DRIBBLE_HEIGHT_FT): void {
    ball.pos = { ...carrier.pos };
    ball.height = height;
    ball.vel = ZERO;
    ball.vz = 0;
    ball.state = 'held';
    ball.carrierId = carrier.id;
}

// ─────────────────────────────────────────────────────────────
// Dribble bounce — while a carrier holds the ball and is actively dribbling (as opposed to
// gathering/catching, which uses the flat attachToCarrier above), the ball's height should
// oscillate between the floor and hand height instead of floating at a fixed height. This is
// purely cosmetic (doesn't affect state/carrierId semantics), so it's a separate small helper
// rather than a mode flag on attachToCarrier.
// ─────────────────────────────────────────────────────────────

export const DRIBBLE_MIN_HEIGHT_FT = 1.0;
export const DRIBBLE_MAX_HEIGHT_FT = 4.0;
export const DRIBBLE_PERIOD_S = 0.45;

/**
 * Height of a dribbled ball at elapsed time `t` (seconds since the dribble sequence started).
 * A raised-cosine (smoothstep-like) oscillation between DRIBBLE_MIN/MAX_HEIGHT: eases through
 * the top of the bounce and speeds up near the floor, which reads more like a real dribble than
 * a pure sine would (a ball actually spends more visual time near the peak than the floor contact).
 */
export function dribbleHeightAt(t: number, period: number = DRIBBLE_PERIOD_S): number {
    const phase = (t % period) / period; // 0..1
    return DRIBBLE_MIN_HEIGHT_FT + (DRIBBLE_MAX_HEIGHT_FT - DRIBBLE_MIN_HEIGHT_FT) * (0.5 - 0.5 * Math.cos(2 * Math.PI * phase));
}

/** Attach the ball to a carrier while dribbling — position tracks the carrier, height bounces per dribbleHeightAt(). */
export function attachToCarrierDribbling(ball: BallState, carrier: PhysicsEntity, t: number): void {
    ball.pos = { ...carrier.pos };
    ball.height = dribbleHeightAt(t);
    ball.vel = ZERO;
    ball.vz = 0;
    ball.state = 'held';
    ball.carrierId = carrier.id;
}

/**
 * Solve constant horizontal velocity + initial vertical velocity so a ball launched from
 * (fromPos, fromHeight) lands at exactly (toPos, toHeight) after exactly `duration` seconds,
 * given constant downward gravity. Horizontal motion is unaccelerated (no air resistance);
 * vertical motion is 1D kinematics: height(t) = fromHeight + vz·t − ½g·t² , solved for vz
 * at t = duration.
 */
export function launchToTarget(
    fromPos: Vec2, fromHeight: number,
    toPos: Vec2, toHeight: number,
    duration: number,
): { vel: Vec2; vz: number } {
    const d = Math.max(1e-3, duration);
    const vel = scale(sub(toPos, fromPos), 1 / d);
    const vz = (toHeight - fromHeight + 0.5 * GRAVITY_FT_S2 * d * d) / d;
    return { vel, vz };
}

/** Launch the ball toward a target point/height over `duration` seconds. */
export function launchBall(ball: BallState, target: { pos: Vec2; height: number }, duration: number): void {
    const { vel, vz } = launchToTarget(ball.pos, ball.height, target.pos, target.height, duration);
    ball.vel = vel;
    ball.vz = vz;
    ball.state = 'inFlight';
    ball.carrierId = undefined;
}

/** Advance an in-flight ball by one tick under gravity. No-op if the ball isn't in flight. */
export function stepBallFlight(ball: BallState, dt: number): void {
    if (ball.state !== 'inFlight') return;
    ball.pos = add(ball.pos, scale(ball.vel, dt));
    ball.height += ball.vz * dt;
    ball.vz -= GRAVITY_FT_S2 * dt;
    if (ball.height <= 0) {
        ball.height = 0;
        ball.state = 'loose';
        ball.vel = ZERO;
        ball.vz = 0;
    }
}

export function cloneBall(ball: BallState): BallState {
    return { ...ball, pos: { ...ball.pos }, vel: { ...ball.vel } };
}

/** Field-wise interpolation for render-side blending — same role as lerpWorld() for entities. */
export function lerpBall(a: BallState, b: BallState, alpha: number): BallState {
    return { ...b, pos: lerp(a.pos, b.pos, alpha), height: a.height + (b.height - a.height) * alpha };
}

/**
 * Rim location for the basket the current offense is attacking. Deliberately mirrors
 * courtPositions.ts's `basketX = isHomePossession ? HOOP_X_LEFT : COURT_WIDTH - HOOP_X_LEFT`
 * convention exactly (not re-derived) so the ball's shot target agrees with wherever that
 * file already draws the paint/defenders for this possession — consistency with the existing
 * visual takes priority over re-deriving "true" home/away court-side semantics.
 */
export function rimPosition(isHomePossession: boolean): { pos: Vec2; height: number } {
    const x = isHomePossession ? HOOP_X_LEFT : COURT_WIDTH - HOOP_X_LEFT;
    return { pos: { x, y: HOOP_Y_CENTER }, height: RIM_HEIGHT_FT };
}
