
import { useEffect, useRef, useState, useCallback } from 'react';
import {
    createWorld, worldStep, cloneWorld, lerpWorld,
    seek, separation, containment, combine,
    worldToSnapshot, snapshotToEntities, reconcileWorldEntities, snapshotTargets, snapshotMeta, normalizeSnapshot,
    createBall, attachToCarrier, attachToCarrierDribbling, launchBall, stepBallFlight, cloneBall, lerpBall, rimPosition,
    DRIBBLE_HEIGHT_FT, CHEST_HEIGHT_FT, SHOT_RELEASE_HEIGHT_FT,
} from '../../services/game/engine/physics';
import type { PhysicsWorld, PhysicsEntity, SteeringOutput, EntityMeta, BallState } from '../../services/game/engine/physics';
import type { ChoreographyReel } from '../../services/game/engine/pbp/choreographyTypes';
import type { CourtSnapshot } from '../../services/game/engine/pbp/pbpTypes';
import { len, scale, sub } from '../../utils/vec2';

// ─────────────────────────────────────────────────────────────
// §12-3 — generalizes ScriptedPlayPanel.tsx's rAF fixed-dt render loop (hardcoded 4-beat
// script) into a reusable hook that plays back ANY ChoreographyReel array. Same physics core
// (seek/separation/containment, ballistics), same lerp-based interpolation — only the
// "which beat am I on" bookkeeping is generalized from a phase enum to an array index.
// Loops back to beat 0 on completion (testing/tuning tool — continuous playback is more useful
// than a single-shot demo here).
// ─────────────────────────────────────────────────────────────

const FIXED_DT = 1 / 60;
const SETTLE_VEL_THRESHOLD_FT_S = 1.0; // "stopped enough" for a holdUntilSettled gate
const MAX_HOLD_EXTRA_SEC = 3.0; // safety cap so a never-settling entity can't freeze the reel forever
// arrive()'s smooth deceleration curve (steering.ts, now disabled) kept overshooting under real
// combine()'d conditions no matter how it was tuned — separation/containment competing for the
// same force budget right when several entities converge on nearby targets made its braking-
// distance assumption unreliable. Two fixes were tried after disabling it: an instant hard-snap
// (v1 — removed the overshoot but felt like a jarring freeze-frame), then a linear-in-distance
// velocity ramp (v2 — smoother, but braked hardest right at zone entry and crawled near the
// target, since v ∝ d makes deceleration itself proportional to speed: high when fast, negligible
// when slow — the opposite of how a real stop feels).
//
// This version keeps v2's core idea (direct velocity ASSIGNMENT each tick, bypassing combine()'s
// force budget entirely so it can't be diluted or overshoot) but swaps the velocity profile for
// the same constant-deceleration braking curve arrive() always intended: v = √(2·decel·distance),
// decel = maxForce/mass. Unlike the linear ramp, deceleration here is CONSTANT throughout the
// approach — no hard jolt at zone entry, no asymptotic crawl near the target, and it reaches
// exactly v=0 at d=0 by construction instead of needing an external cutoff. The brake zone itself
// is no longer a fixed guess — it's the entity's own physical stopping distance
// (maxSpeed²/(2·decel)), so the transition into braking is speed-continuous with whatever seek()
// was already doing. FINAL_SNAP_RADIUS_FT remains only as a tiny numerical safety net for exact
// landing (discrete ticking can't hit v=0,d=0 precisely).
const FINAL_SNAP_RADIUS_FT = 0.3;

function brakedVelocity(entity: PhysicsEntity, toTarget: { x: number; y: number }, d: number) {
    const decel = entity.maxForce / entity.mass;
    const stoppingDistance = (entity.maxSpeed * entity.maxSpeed) / (2 * decel);
    if (d >= stoppingDistance) return null; // outside braking range — let seek() drive
    const brakedSpeed = Math.min(entity.maxSpeed, Math.sqrt(2 * decel * d));
    return scale(toTarget, brakedSpeed / d);
}

function carrierIdOf(snapshot: CourtSnapshot): string | undefined {
    return snapshot.positions.find(p => p.hasBall)?.playerId;
}

export function useReelPlayback(reel: ChoreographyReel | null) {
    const [running, setRunning] = useState(true);
    const [speed, setSpeed] = useState(1);
    const [displaySnapshot, setDisplaySnapshot] = useState<CourtSnapshot | null>(null);
    const [ballDisplay, setBallDisplay] = useState<{ x: number; y: number; height: number } | null>(null);
    const [beatIndex, setBeatIndex] = useState(0);

    const worldRef = useRef<PhysicsWorld | null>(null);
    const prevWorldRef = useRef<PhysicsWorld | null>(null);
    const ballRef = useRef<BallState | null>(null);
    const prevBallRef = useRef<BallState | null>(null);
    const targetsRef = useRef<Record<string, { x: number; y: number }>>({});
    const metaRef = useRef<Record<string, EntityMeta>>({});
    const offTeamIdRef = useRef<string>('');
    const beatIndexRef = useRef(0);
    const beatElapsedRef = useRef(0);
    const rafRef = useRef<number | null>(null);
    const lastRef = useRef(0);
    const accRef = useRef(0);
    // Actual interpolated positions sampled every displayed frame, per player — for a debug
    // overlay comparing "where they were told to go" (beat targets) against "where they actually
    // went" (this trail), to diagnose steering jitter. Mutated in place; re-read on every render
    // since setDisplaySnapshot already forces one every frame, so no separate state needed.
    const trailsRef = useRef<Record<string, { x: number; y: number }[]>>({});

    const runningRef = useRef(running); runningRef.current = running;
    const speedRef = useRef(speed); speedRef.current = speed;
    const reelRef = useRef(reel); reelRef.current = reel;

    const forceProvider = useCallback((e: PhysicsEntity, world: PhysicsWorld): SteeringOutput => {
        const target = targetsRef.current[e.id] ?? e.pos;
        const seekOut = seek(e, target);
        const sepOut = separation(e, world.entities, 3);
        // margin was 2ft — conflicted with legitimate near-boundary targets (corner-3 virtual
        // shot points sit ~1.2-2.3ft from the sideline). 0.1ft keeps this a true out-of-bounds
        // safety net without contesting real spots.
        const containOut = containment(e, world.bounds, 0.1, 1.5);
        return combine(
            [{ out: seekOut, weight: 3 }, { out: sepOut, weight: 1.1 }, { out: containOut, weight: 1.5 }],
            e.maxForce,
        );
    }, []);

    /** Loads a new beat's snapshot into the world (targets/meta) — called on beat transitions. */
    const applyBeat = useCallback((idx: number) => {
        const r = reelRef.current;
        if (!r || !r[idx]) return;
        const snap = normalizeSnapshot(r[idx].snapshot);
        const world = worldRef.current;
        if (!world) return;
        reconcileWorldEntities(world, snap);
        targetsRef.current = snapshotTargets(snap);
        metaRef.current = snapshotMeta(snap);
        offTeamIdRef.current = snap.offTeamId;
    }, []);

    /** Per-fixed-tick ball update — branches on the current beat's ballEvent. Mirrors
     *  PbpGameModePanel.updateBallTick()'s "entered" pattern for one-time launchBall calls. */
    const updateBallTick = useCallback((dt: number, entered: boolean) => {
        const ball = ballRef.current;
        const world = worldRef.current;
        const r = reelRef.current;
        if (!ball || !world || !r) return;
        const beat = r[beatIndexRef.current];
        if (!beat) return;

        const carrierId = carrierIdOf(beat.snapshot);
        const carrier = world.entities.find(e => e.id === carrierId);

        switch (beat.ballEvent) {
            case 'dribble':
                if (carrier) attachToCarrierDribbling(ball, carrier, beatElapsedRef.current);
                break;
            case 'pass': {
                if (entered) {
                    const nextBeat = r[beatIndexRef.current + 1];
                    const receiverId = nextBeat ? carrierIdOf(nextBeat.snapshot) : undefined;
                    const receiver = receiverId ? world.entities.find(e => e.id === receiverId) : undefined;
                    if (receiver) launchBall(ball, { pos: receiver.pos, height: CHEST_HEIGHT_FT }, beat.durationSec);
                }
                stepBallFlight(ball, dt);
                break;
            }
            case 'catch':
            case 'handoff':
                if (carrier) attachToCarrier(ball, carrier);
                break;
            case 'screen':
                if (carrier) attachToCarrier(ball, carrier);
                break;
            case 'shoot':
                if (entered) {
                    // Raise from whatever height the ball was held at (catch/dribble) to a jumpshot
                    // release height first, so the arc peaks higher without lengthening flight time.
                    ball.height = SHOT_RELEASE_HEIGHT_FT;
                    // Milestone 1: offense always attacks the left hoop (matches generateChoreography's
                    // isHomePossession convention when sandbox passes homeTeamId === offTeam.id).
                    launchBall(ball, rimPosition(true), beat.durationSec);
                }
                stepBallFlight(ball, dt);
                break;
            case 'bounce':
                // 미스 후 림에 맞고 튕겨나가는 구간 — 목적지는 generateCatchShoot()이 릴 생성
                // 시점에 미리 계산해둔 ballLandingPos(리바운더 좌표+랜덤 반경) 하나뿐이라, 여기선
                // 그대로 읽어서 쏘기만 한다(릴은 사전 계산, 재생은 순수 보간이라는 원칙 그대로).
                if (entered && beat.ballLandingPos) {
                    launchBall(ball, { pos: beat.ballLandingPos, height: DRIBBLE_HEIGHT_FT }, beat.durationSec);
                }
                stepBallFlight(ball, dt);
                break;
        }
    }, []);

    /** (Re)initializes the world from reel[0] whenever the reel itself changes. */
    useEffect(() => {
        if (!reel || reel.length === 0) {
            worldRef.current = null;
            setDisplaySnapshot(null);
            setBallDisplay(null);
            return;
        }
        // A previous reel may have auto-paused on completion (§ freeze-on-settle) — a fresh reel
        // should always start playing, not stay paused from whatever the last one ended in.
        runningRef.current = true;
        setRunning(true);

        const firstSnap = normalizeSnapshot(reel[0].snapshot);
        const world = createWorld('sandbox', snapshotToEntities(firstSnap));
        worldRef.current = world;
        prevWorldRef.current = cloneWorld(world);
        targetsRef.current = snapshotTargets(firstSnap);
        metaRef.current = snapshotMeta(firstSnap);
        offTeamIdRef.current = firstSnap.offTeamId;
        beatIndexRef.current = 0;
        beatElapsedRef.current = 0;
        setBeatIndex(0);
        accRef.current = 0;
        trailsRef.current = {};

        const carrierId = carrierIdOf(firstSnap);
        const carrierEntity = world.entities.find(e => e.id === carrierId);
        const ball = createBall(carrierEntity ? carrierEntity.pos : { x: firstSnap.positions[0].x, y: firstSnap.positions[0].y }, DRIBBLE_HEIGHT_FT);
        if (carrierEntity) attachToCarrier(ball, carrierEntity);
        ballRef.current = ball;
        prevBallRef.current = cloneBall(ball);

        setDisplaySnapshot(worldToSnapshot(world, metaRef.current, offTeamIdRef.current));
        setBallDisplay({ x: ball.pos.x, y: ball.pos.y, height: ball.height });
        lastRef.current = performance.now();
    }, [reel]);

    // rAF loop — started once on mount, idles until the reel-init effect above populates worldRef.
    useEffect(() => {
        const frame = (now: number) => {
            rafRef.current = requestAnimationFrame(frame);
            const world = worldRef.current;
            const r = reelRef.current;
            if (!runningRef.current || !world || !r || r.length === 0) { lastRef.current = now; return; }

            const dtReal = Math.min(0.25, (now - lastRef.current) / 1000) * speedRef.current;
            lastRef.current = now;
            accRef.current += dtReal;

            let prevWorld = prevWorldRef.current ?? cloneWorld(world);
            let prevBall = ballRef.current ? (prevBallRef.current ?? cloneBall(ballRef.current)) : null;

            while (accRef.current >= FIXED_DT) {
                prevWorld = cloneWorld(world);
                if (ballRef.current) prevBall = cloneBall(ballRef.current);

                let entered = false;
                beatElapsedRef.current += FIXED_DT;
                const currentBeat = r[beatIndexRef.current];
                const isLastBeat = beatIndexRef.current === r.length - 1;
                if (currentBeat && beatElapsedRef.current >= currentBeat.durationSec && !isLastBeat) {
                    // durationSec is a floor, not a fixed length, when holdUntilSettled is set — keep
                    // holding this beat (target stays put, the braking zone above ramps velocity down
                    // to exactly 0 on arrival) until every listed player has actually stopped, so a
                    // catch/shot never fires while still in motion.
                    // The extra-time cap prevents an entity that never quite settles (e.g. stuck
                    // oscillating against separation()) from freezing playback indefinitely.
                    const withinSafetyCap = beatElapsedRef.current < currentBeat.durationSec + MAX_HOLD_EXTRA_SEC;
                    const stillSettling = withinSafetyCap && currentBeat.holdUntilSettled?.some(pid => {
                        const e = world.entities.find(x => x.id === pid);
                        return e && len(e.vel) > SETTLE_VEL_THRESHOLD_FT_S;
                    });
                    if (!stillSettling) {
                        beatIndexRef.current += 1;
                        beatElapsedRef.current = 0;
                        applyBeat(beatIndexRef.current);
                        setBeatIndex(beatIndexRef.current);
                        entered = true;
                        prevWorld = cloneWorld(world); // fresh entities (if any) render at target immediately
                        if (ballRef.current) prevBall = cloneBall(ballRef.current);
                    }
                }

                worldStep(world, forceProvider);

                // Direct kinematic braking near arrival — see brakedVelocity()/FINAL_SNAP_RADIUS_FT
                // above. Runs every tick, so it kicks in smoothly the moment an entity crosses into
                // its own stopping distance rather than as a single jarring cutover.
                for (const entity of world.entities) {
                    const target = targetsRef.current[entity.id];
                    if (!target) continue;
                    const toTarget = sub(target, entity.pos);
                    const d = len(toTarget);
                    if (d < FINAL_SNAP_RADIUS_FT) {
                        entity.pos = { ...target };
                        entity.vel = { x: 0, y: 0 };
                    } else {
                        const braked = brakedVelocity(entity, toTarget, d);
                        if (braked) entity.vel = braked;
                    }
                }

                updateBallTick(FIXED_DT, entered);
                accRef.current -= FIXED_DT;

                // Player choreography ends when the last beat's duration elapses, but the ball is a
                // free physics object, not part of the beat clock — gravity keeps carrying it (e.g. a
                // made shot falling through the net) via stepBallFlight every tick above until it
                // actually settles (state leaves 'inFlight'). Only then does the scene freeze, instead
                // of stopping the instant the ball merely reaches the rim's height.
                // holdUntilSettled on a NON-last beat already holds up the transition to the NEXT
                // beat (above) — but the mid-reel check explicitly skips the last beat (!isLastBeat),
                // so holdUntilSettled on the FINAL beat had no effect at all: the reel would end the
                // instant durationSec elapsed regardless of whether those players had actually
                // arrived (e.g. rebound-crash beats — 골밑까지 갈 시간이 beat 길이보다 길면, 도착하기
                // 전에 릴이 끝나버림). Apply the same settle-gate here too, so the last beat's
                // holdUntilSettled actually means something.
                const lastBeatWithinSafetyCap = currentBeat
                    ? beatElapsedRef.current < currentBeat.durationSec + MAX_HOLD_EXTRA_SEC
                    : false;
                const lastBeatStillSettling = isLastBeat && lastBeatWithinSafetyCap && currentBeat?.holdUntilSettled?.some(pid => {
                    const e = world.entities.find(x => x.id === pid);
                    return e && len(e.vel) > SETTLE_VEL_THRESHOLD_FT_S;
                });
                const reelFinished = currentBeat && isLastBeat
                    && beatElapsedRef.current >= currentBeat.durationSec
                    && !lastBeatStillSettling;
                const ballSettled = !ballRef.current || ballRef.current.state !== 'inFlight';
                if (reelFinished && ballSettled) {
                    runningRef.current = false;
                    setRunning(false);
                    break;
                }
            }
            prevWorldRef.current = prevWorld;
            prevBallRef.current = prevBall;

            const alpha = Math.min(1, accRef.current / FIXED_DT);
            const interpolated = lerpWorld(prevWorld, world, alpha);
            const snap = worldToSnapshot(interpolated, metaRef.current, offTeamIdRef.current);
            setDisplaySnapshot(snap);

            for (const p of snap.positions) {
                const trail = trailsRef.current[p.playerId] ?? (trailsRef.current[p.playerId] = []);
                trail.push({ x: p.x, y: p.y });
                if (trail.length > 600) trail.shift(); // cap ~10s of samples at 60fps
            }

            if (ballRef.current && prevBall) {
                const interpolatedBall = lerpBall(prevBall, ballRef.current, alpha);
                setBallDisplay({ x: interpolatedBall.pos.x, y: interpolatedBall.pos.y, height: interpolatedBall.height });
            }
        };
        rafRef.current = requestAnimationFrame(frame);
        return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [forceProvider, updateBallTick, applyBeat]);

    return { displaySnapshot, ballDisplay, running, setRunning, speed, setSpeed, beatIndex, trails: trailsRef.current };
}
