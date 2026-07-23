
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Play, Pause, ShuffleIcon, SkipForward } from 'lucide-react';
import { PhysicsCourtView } from '../game/PhysicsCourtView';
import { supabase } from '../../services/supabaseClient';
import { mapRawPlayerToRuntimePlayer } from '../../services/dataMapper';
import { generateAutoTactics } from '../../services/gameEngine';
import { buildVirtualTeam, buildDefaultDepthChart, autoPickTopPlayers } from '../../utils/quickPlay';
import { computeLeagueContext } from '../../services/game/engine/pbp/leagueNormalization';
import { calculatePlayerOvr } from '../../utils/constants';
import { TEAM_DATA, getAllTeamsList } from '../../data/teamData';
import { DEFAULT_SIM_SETTINGS } from '../../types/simSettings';
import { createGameState, stepPossession, extractSimResult } from '../../services/game/engine/pbp/liveEngine';
import { formatTime } from '../../services/game/engine/pbp/timeEngine';
import type { GameState, CourtSnapshot, PossessionResult } from '../../services/game/engine/pbp/pbpTypes';
import type { Player, PbpLog, SimulationResult, PlayType } from '../../types';
import {
    createWorld, worldStep, cloneWorld, lerpWorld,
    seek, separation, containment, combine,
    worldToSnapshot, snapshotToEntities, reconcileWorldEntities, snapshotTargets, snapshotMeta,
    createBall, attachToCarrier, launchBall, stepBallFlight, cloneBall, lerpBall, rimPosition,
    DRIBBLE_HEIGHT_FT, normalizeSnapshot,
} from '../../services/game/engine/physics';
import type { PhysicsWorld, PhysicsEntity, SteeringOutput, EntityMeta, BallState } from '../../services/game/engine/physics';
import { len, scale, sub } from '../../utils/vec2';

// ─────────────────────────────────────────────────────────────
// PBP game mode — runs the REAL PBP engine (stepPossession, unmodified) with two teams
// auto-built from meta_players (same buildVirtualTeam/generateAutoTactics/buildDefaultDepthChart
// pattern as pages/QuickPlayPage.tsx), then feeds each possession's `courtSnapshot` into the
// physics core as a steering TARGET instead of rendering it as an instant snapshot swap.
//
// Per possession: stepPossession() decides the outcome (unchanged, still "결과 먼저 확정") →
// its courtSnapshot becomes this possession's formation target → the physics world spends a
// fixed number of ticks arriving there (arrive + separation + containment) → next possession.
// The physics core stays result-agnostic throughout: it only ever receives "go to this point."
// ─────────────────────────────────────────────────────────────

const FIXED_DT = 1 / 60;
// arrive()'s smooth deceleration is disabled (steering.ts) — see useReelPlayback.ts for the full
// history. seek() drives normal pursuit; within an entity's own physical stopping distance
// (maxSpeed²/(2·decel), decel = maxForce/mass), velocity is assigned directly each tick via
// brakedVelocity() using the constant-deceleration curve v = √(2·decel·distance) — bypassing
// combine()'s force budget entirely so it can't be diluted or overshoot, while still braking at a
// physically real, constant rate instead of a jarring instant stop or a front-loaded linear ramp.
// FINAL_SNAP_RADIUS_FT is a tiny true hard-snap only for the last fraction of a foot, to land
// exactly on the target coordinate (discrete ticking can't hit v=0,d=0 precisely on its own).
const FINAL_SNAP_RADIUS_FT = 0.3;
const ALL_TEAMS = getAllTeamsList();

function brakedVelocity(entity: PhysicsEntity, toTarget: { x: number; y: number }, d: number) {
    const decel = entity.maxForce / entity.mass;
    const stoppingDistance = (entity.maxSpeed * entity.maxSpeed) / (2 * decel);
    if (d >= stoppingDistance) return null; // outside braking range — let seek() drive
    const brakedSpeed = Math.min(entity.maxSpeed, Math.sqrt(2 * decel * d));
    return scale(toTarget, brakedSpeed / d);
}

// Ball phase fractions within a possession's tick window.
// TRANSITION_FRAC always runs first (an "outlet pass" from wherever the ball settled last
// possession to this possession's actor) — without it, the ball would snap instantly from
// e.g. the rim/baseline (where it landed after a shot) straight to the new ball-handler,
// which is exactly the "teleports back to the player" bug this fixes.
const TRANSITION_FRAC = 0.10; // outlet pass to the new actor
const HOLD_FRAC = 0.55;       // held by the actor (score/miss/freethrow only — other outcomes hold the whole remaining window)
const SHOT_FRAC = 0.30;       // in flight toward the rim
// remaining (1 - HOLD_FRAC - SHOT_FRAC) = bounce-to-rebounder phase, misses only

type BallPhase = 'transition' | 'hold' | 'shot' | 'bounce' | 'idle';

function formatLogLine(log: PbpLog): string {
    return `[Q${log.quarter} ${log.timeRemaining}] ${log.text}`;
}

export const PbpGameModePanel: React.FC = () => {
    const [pool, setPool] = useState<Player[]>([]);
    const [poolLoading, setPoolLoading] = useState(true);
    const [homeTeamId, setHomeTeamId] = useState<string | null>(null);
    const [awayTeamId, setAwayTeamId] = useState<string | null>(null);
    const [gameStarted, setGameStarted] = useState(false);
    const [running, setRunning] = useState(true);
    const [speed, setSpeed] = useState(1);
    const [possessionTicks, setPossessionTicks] = useState(60); // ticks per possession at FIXED_DT (60 = 1s)
    const [logs, setLogs] = useState<string[]>([]);
    const [hud, setHud] = useState<{ quarter: number; clock: string; homeScore: number; awayScore: number } | null>(null);
    const [finalResult, setFinalResult] = useState<SimulationResult | null>(null);
    const [displaySnapshot, setDisplaySnapshot] = useState<CourtSnapshot | null>(null);
    const [ballDisplay, setBallDisplay] = useState<{ x: number; y: number; height: number } | null>(null);

    const gameStateRef = useRef<GameState | null>(null);
    const worldRef = useRef<PhysicsWorld | null>(null);
    const prevWorldRef = useRef<PhysicsWorld | null>(null);
    const targetsRef = useRef<Record<string, { x: number; y: number }>>({});
    const metaRef = useRef<Record<string, EntityMeta>>({});
    const offTeamIdRef = useRef<string>('');
    const playTypeRef = useRef<PlayType | undefined>(undefined);
    const zoneRef = useRef<CourtSnapshot['zone']>(undefined);
    const possessionTickRef = useRef(0);
    const seedRef = useRef('physics-lab');
    const rafRef = useRef<number | null>(null);
    const lastRef = useRef(0);
    const accRef = useRef(0);

    // Ball state — separate from PhysicsEntity/world.entities (see ballistics.ts: the ball
    // doesn't steer, it's either attached to a carrier or a ballistic projectile).
    const ballRef = useRef<BallState | null>(null);
    const prevBallRef = useRef<BallState | null>(null);
    const ballPhaseRef = useRef<BallPhase>('hold');
    const currentResultRef = useRef<PossessionResult | null>(null);
    const gameHomeTeamIdRef = useRef<string>('');

    const runningRef = useRef(running); runningRef.current = running;
    const speedRef = useRef(speed); speedRef.current = speed;
    const possessionTicksRef = useRef(possessionTicks); possessionTicksRef.current = possessionTicks;

    // ── meta_players 풀 로드 (QuickPlayPage와 동일한 fetch 패턴) ──
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setPoolLoading(true);
            const { data, error } = await supabase
                .from('meta_players')
                .select('id, name, position, base_attributes, tendencies')
                .eq('in_multi_pool', true)
                .or('base_team_id.not.is.null,draft_year.eq.2026');
            if (!cancelled) {
                if (!error && data) setPool(data.map((r: any) => mapRawPlayerToRuntimePlayer(r, false)));
                setPoolLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const handleRandomTeams = useCallback(() => {
        // UI convenience only (team picker) — NOT part of the deterministic physics/PBP path.
        const shuffled = [...ALL_TEAMS].sort(() => Math.random() - 0.5);
        setHomeTeamId(shuffled[0]?.id ?? null);
        setAwayTeamId(shuffled[1]?.id ?? null);
    }, []);

    const advancePossession = useCallback(() => {
        const state = gameStateRef.current;
        if (!state) return;
        const step = stepPossession(state);
        if (step.newLogs?.length) {
            setLogs(prev => [...prev, ...step.newLogs.map(formatLogLine)].slice(-80));
        }
        if (step.isGameEnd) {
            setRunning(false);
            setFinalResult(extractSimResult(state));
            return;
        }
        // Direct tripwire: if TeamState.onCourt ever holds more than 5 players a side (a
        // rotation/substitution bug, not a physics-lab bug), this fires with the exact team —
        // the strongest signal for where marker "accumulation" actually originates.
        if (state.home.onCourt.length !== 5 || state.away.onCourt.length !== 5) {
            console.warn(
                `[physics-lab] onCourt size drifted — home:${state.home.onCourt.length} away:${state.away.onCourt.length} (expected 5/5). ` +
                `This is a rotation/substitution engine issue, not the physics core.`,
            );
        }

        const snapshot = state.courtSnapshot ? normalizeSnapshot(state.courtSnapshot) : null;
        if (snapshot) {
            if (!worldRef.current) {
                worldRef.current = createWorld(seedRef.current, snapshotToEntities(snapshot));
                prevWorldRef.current = cloneWorld(worldRef.current);
            } else {
                reconcileWorldEntities(worldRef.current, snapshot);
            }
            targetsRef.current = snapshotTargets(snapshot);
            metaRef.current = snapshotMeta(snapshot);
            offTeamIdRef.current = snapshot.offTeamId;
            playTypeRef.current = snapshot.playType;
            zoneRef.current = snapshot.zone;

            if (!ballRef.current) {
                const actorId = step.result?.actor.playerId;
                const actorEntity = worldRef.current.entities.find(e => e.id === actorId);
                ballRef.current = createBall(actorEntity ? actorEntity.pos : snapshot.positions[0], DRIBBLE_HEIGHT_FT);
                prevBallRef.current = cloneBall(ballRef.current);
            }
        }
        currentResultRef.current = step.result;
        ballPhaseRef.current = 'hold';
        possessionTickRef.current = 0;
        setHud({ quarter: state.quarter, clock: formatTime(state.gameClock), homeScore: state.home.score, awayScore: state.away.score });
    }, []);

    /**
     * Per-fixed-tick ball update, called from the rAF loop right after worldStep(). Branches
     * on the current possession's PossessionResult.type — the ball's own motion is decided by
     * fixed phase fractions of the possession window (hold → shot → bounce), never by the
     * physics itself deciding an outcome. Score/miss share the same shot-toward-rim leg
     * (physically correct — every shot is aimed at the rim); a miss adds a bounce-toward-
     * rebounder leg afterward.
     */
    const updateBallTick = useCallback((dt: number) => {
        const ball = ballRef.current;
        const world = worldRef.current;
        const result = currentResultRef.current;
        if (!ball || !world || !result) return;

        const totalTicks = possessionTicksRef.current;
        const frac = totalTicks > 0 ? possessionTickRef.current / totalTicks : 0;
        const isShotPlay = result.type === 'score' || result.type === 'miss' || result.type === 'freethrow';

        const attachActor = () => {
            const carrier = world.entities.find(e => e.id === result.actor.playerId);
            if (carrier) attachToCarrier(ball, carrier);
        };

        if (!isShotPlay) {
            attachActor();
            ballPhaseRef.current = 'hold';
            return;
        }

        const shotStart = HOLD_FRAC;
        const bounceStart = HOLD_FRAC + SHOT_FRAC;

        if (frac < shotStart) {
            attachActor();
            ballPhaseRef.current = 'hold';
        } else if (frac < bounceStart) {
            if (ballPhaseRef.current !== 'shot') {
                const isHomePossession = result.offTeam.id === gameHomeTeamIdRef.current;
                const rim = rimPosition(isHomePossession);
                const shotDuration = Math.max(0.2, SHOT_FRAC * totalTicks * FIXED_DT);
                launchBall(ball, rim, shotDuration);
                ballPhaseRef.current = 'shot';
            }
            stepBallFlight(ball, dt);
        } else if (result.type === 'miss' && result.rebounder) {
            if (ballPhaseRef.current !== 'bounce') {
                const reboundTarget = targetsRef.current[result.rebounder.playerId];
                if (reboundTarget) {
                    const bounceDuration = Math.max(0.15, (1 - bounceStart) * totalTicks * FIXED_DT);
                    launchBall(ball, { pos: reboundTarget, height: DRIBBLE_HEIGHT_FT }, bounceDuration);
                }
                ballPhaseRef.current = 'bounce';
            }
            stepBallFlight(ball, dt);
        } else if (ballPhaseRef.current !== 'idle') {
            // Made shot / free throw make, or a miss with no tracked rebounder — settle at the rim.
            ball.state = 'loose';
            ball.vel = { x: 0, y: 0 };
            ball.vz = 0;
            ballPhaseRef.current = 'idle';
        }
    }, []);

    const handleStart = useCallback(() => {
        if (poolLoading || !pool.length || !homeTeamId || !awayTeamId || homeTeamId === awayTeamId) return;

        const homeRoster = autoPickTopPlayers(pool, homeTeamId, 10);
        const awayRoster = autoPickTopPlayers(pool, awayTeamId, 10);
        const homeTeam = buildVirtualTeam(homeTeamId, homeRoster);
        const awayTeam = buildVirtualTeam(awayTeamId, awayRoster);
        const hTactics = generateAutoTactics(homeTeam);
        const aTactics = generateAutoTactics(awayTeam);
        const hDepth = buildDefaultDepthChart(homeRoster, hTactics);
        const aDepth = buildDefaultDepthChart(awayRoster, aTactics);
        const leagueContext = computeLeagueContext([homeTeam, awayTeam], calculatePlayerOvr);
        const simSettings = { ...DEFAULT_SIM_SETTINGS, leagueContext };

        seedRef.current = `physics-lab-${homeTeamId}-${awayTeamId}-${Date.now()}`;
        gameHomeTeamIdRef.current = homeTeamId;
        gameStateRef.current = createGameState(
            homeTeam, awayTeam, null, hTactics, false, false, hDepth, aDepth,
            seedRef.current, simSettings, null, aTactics,
        );
        worldRef.current = null;
        prevWorldRef.current = null;
        targetsRef.current = {};
        metaRef.current = {};
        possessionTickRef.current = 0;
        accRef.current = 0;
        ballRef.current = null;
        prevBallRef.current = null;
        ballPhaseRef.current = 'hold';
        currentResultRef.current = null;
        setLogs([]);
        setFinalResult(null);
        setHud(null);
        setDisplaySnapshot(null);
        setBallDisplay(null);
        setGameStarted(true);
        setRunning(true);
    }, [pool, poolLoading, homeTeamId, awayTeamId]);

    const pbpForceProvider = useCallback((e: PhysicsEntity, world: PhysicsWorld): SteeringOutput => {
        const target = targetsRef.current[e.id] ?? e.pos;
        const seekOut = seek(e, target);
        const sepOut = separation(e, world.entities, 3);
        const containOut = containment(e, world.bounds, 2, 1.5);
        return combine(
            [{ out: seekOut, weight: 3 }, { out: sepOut, weight: 1.1 }, { out: containOut, weight: 1.5 }],
            e.maxForce,
        );
    }, []);

    // rAF loop — started once on mount; idles until handleStart() populates gameStateRef.
    useEffect(() => {
        lastRef.current = performance.now();
        const frame = (now: number) => {
            rafRef.current = requestAnimationFrame(frame);
            if (!runningRef.current || !gameStateRef.current) { lastRef.current = now; return; }

            if (!worldRef.current) {
                advancePossession(); // very first possession — no previous world to animate from
                lastRef.current = now;
                return;
            }

            const dtReal = Math.min(0.25, (now - lastRef.current) / 1000) * speedRef.current;
            lastRef.current = now;
            accRef.current += dtReal;

            const world = worldRef.current;
            let prevWorld = prevWorldRef.current ?? cloneWorld(world);
            let prevBall = ballRef.current ? (prevBallRef.current ?? cloneBall(ballRef.current)) : null;
            while (accRef.current >= FIXED_DT) {
                prevWorld = cloneWorld(world);
                if (ballRef.current) prevBall = cloneBall(ballRef.current);
                worldStep(world, pbpForceProvider);
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
                possessionTickRef.current += 1;
                updateBallTick(FIXED_DT);
                accRef.current -= FIXED_DT;
                if (possessionTickRef.current >= possessionTicksRef.current) {
                    advancePossession();
                    // Reconcile may have added/removed entities (substitutions) — re-clone so
                    // new entities/ball state render at their target immediately instead of
                    // lerping from a stale previous possession's values.
                    prevWorld = cloneWorld(world);
                    if (ballRef.current) prevBall = cloneBall(ballRef.current);
                }
            }
            prevWorldRef.current = prevWorld;
            prevBallRef.current = prevBall;

            const alpha = accRef.current / FIXED_DT;
            const interpolated = lerpWorld(prevWorld, world, alpha);
            setDisplaySnapshot(worldToSnapshot(interpolated, metaRef.current, offTeamIdRef.current, playTypeRef.current, zoneRef.current));

            if (ballRef.current && prevBall) {
                const interpolatedBall = lerpBall(prevBall, ballRef.current, alpha);
                setBallDisplay({ x: interpolatedBall.pos.x, y: interpolatedBall.pos.y, height: interpolatedBall.height });
            }
        };
        rafRef.current = requestAnimationFrame(frame);
        return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
    }, [advancePossession, pbpForceProvider, updateBallTick]);

    const canStart = !poolLoading && pool.length > 0 && !!homeTeamId && !!awayTeamId && homeTeamId !== awayTeamId;
    const homeColor = homeTeamId ? (TEAM_DATA[homeTeamId]?.colors.primary ?? '#6366f1') : '#6366f1';
    const awayColor = awayTeamId ? (TEAM_DATA[awayTeamId]?.colors.primary ?? '#f59e0b') : '#f59e0b';

    return (
        <div className="flex gap-4 h-full min-h-0">
            {/* ── 좌측: 컨트롤 패널 ── */}
            <div className="w-72 shrink-0 flex flex-col gap-4 overflow-y-auto pr-1">
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">팀 선택</label>
                        <button onClick={handleRandomTeams} className="p-1 text-slate-400 hover:text-white transition-colors" title="랜덤 대진">
                            <ShuffleIcon size={13} />
                        </button>
                    </div>
                    <select
                        value={homeTeamId ?? ''}
                        onChange={e => setHomeTeamId(e.target.value || null)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                    >
                        <option value="">홈팀 선택</option>
                        {ALL_TEAMS.filter(t => t.id !== awayTeamId).map(t => (
                            <option key={t.id} value={t.id}>{t.city} {t.name}</option>
                        ))}
                    </select>
                    <select
                        value={awayTeamId ?? ''}
                        onChange={e => setAwayTeamId(e.target.value || null)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white"
                    >
                        <option value="">원정팀 선택</option>
                        {ALL_TEAMS.filter(t => t.id !== homeTeamId).map(t => (
                            <option key={t.id} value={t.id}>{t.city} {t.name}</option>
                        ))}
                    </select>
                </div>

                <button
                    onClick={handleStart}
                    disabled={!canStart}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black rounded-lg transition-colors"
                >
                    {poolLoading ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                    {gameStarted ? '새 경기 시작' : '경기 시작 (관전)'}
                </button>

                {gameStarted && (
                    <>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setRunning(r => !r)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors"
                            >
                                {running ? <><Pause size={12} /> 일시정지</> : <><Play size={12} /> 재생</>}
                            </button>
                            <button
                                onClick={advancePossession}
                                title="즉시 다음 포제션"
                                className="p-1.5 text-slate-400 hover:text-white bg-slate-800 border border-slate-700 rounded-lg transition-colors"
                            >
                                <SkipForward size={13} />
                            </button>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                재생 속도 ({speed.toFixed(1)}x)
                            </label>
                            <input type="range" min={0.25} max={4} step={0.25} value={speed}
                                onChange={e => setSpeed(parseFloat(e.target.value))} className="w-full" />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                포제션당 이동 시간 ({(possessionTicks * FIXED_DT).toFixed(1)}s)
                            </label>
                            <input type="range" min={15} max={150} step={5} value={possessionTicks}
                                onChange={e => setPossessionTicks(parseInt(e.target.value, 10))} className="w-full" />
                        </div>

                        {hud && (
                            <div className="p-2.5 bg-slate-800/60 border border-slate-700 rounded-lg text-xs space-y-1">
                                <div className="flex justify-between text-slate-300">
                                    <span>{TEAM_DATA[awayTeamId!]?.name ?? '원정'}</span>
                                    <span className="font-bold text-white">{hud.awayScore}</span>
                                </div>
                                <div className="flex justify-between text-slate-300">
                                    <span>{TEAM_DATA[homeTeamId!]?.name ?? '홈'}</span>
                                    <span className="font-bold text-white">{hud.homeScore}</span>
                                </div>
                                <div className="text-slate-500 text-center pt-1 border-t border-slate-700/60">
                                    Q{hud.quarter} · {hud.clock}
                                </div>
                            </div>
                        )}

                        {finalResult && (
                            <div className="p-2.5 bg-emerald-900/30 border border-emerald-700/40 rounded-lg text-xs text-emerald-300 font-bold text-center">
                                경기 종료 — {finalResult.awayScore} : {finalResult.homeScore}
                            </div>
                        )}

                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">PBP 로그</label>
                            <div className="h-48 overflow-y-auto bg-slate-950 border border-slate-800 rounded-lg p-2 text-[10px] text-slate-400 font-mono leading-relaxed">
                                {logs.length === 0 ? (
                                    <span className="text-slate-600">경기가 진행되면 로그가 표시됩니다.</span>
                                ) : logs.map((line, i) => <div key={i}>{line}</div>)}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ── 우측: 코트 ── */}
            <div className="flex-1 min-w-0 flex items-center justify-center">
                <div className="w-full max-w-3xl">
                    {gameStarted ? (
                        <PhysicsCourtView
                            courtSnapshot={displaySnapshot}
                            homeTeamId={homeTeamId ?? ''}
                            homeColor={homeColor}
                            awayColor={awayColor}
                            ball={ballDisplay}
                        />
                    ) : (
                        <div className="aspect-[940/500] flex items-center justify-center text-slate-600 text-sm border border-dashed border-slate-800 rounded-xl">
                            {poolLoading ? '선수 풀 로딩 중...' : '홈/원정팀을 선택하고 경기를 시작하세요'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
