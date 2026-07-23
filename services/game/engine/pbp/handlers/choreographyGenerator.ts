
import { COURT_WIDTH } from '../../../../../utils/courtCoordinates';
import type { PossessionResult, PlayerCourtPosition, CourtSnapshot, LivePlayer } from '../pbpTypes';
import type { ChoreographyBeat, ChoreographyReel, SubZoneKey } from '../choreographyTypes';
import { assignNearestSlots } from './choreographyContinuity';
import { chooseSpacerTargets, chooseSpacerTargetsWithPinnedRebounder, pickFarthestPoint, REBOUND_CRASH_POINTS } from './virtualShotPoints';

// ─────────────────────────────────────────────────────────────
// §4-5/§8 — generateChoreography(). PBP layer, sits alongside courtPositions.ts (not inside
// it) — this is a NEW system, not a modification of the existing single-snapshot visualizer.
// Milestone 1 scope: CatchShoot (§8-6) only. Everything else falls through to a minimal
// single-beat snapshot so the function never throws for an unimplemented playType.
//
// Deliberately does not import FORMATIONS/mirrorX from courtPositions.ts (module-private,
// and this is meant to be a parallel system per §4-5) — small local coordinate tables instead.
// ─────────────────────────────────────────────────────────────

interface Pos { x: number; y: number }

function mirrorX(p: Pos): Pos {
    return { x: COURT_WIDTH - p.x, y: p.y };
}

/** §8-6 FORMATIONS['CatchShoot'] equivalent — halfcourt (left-basket) coordinates. */
const CATCH_SHOOT = {
    perimeterCatch: { x: 28, y: 8 } as Pos,   // Rim/Paint branch: where the shooter first catches
    passer: { x: 28, y: 25 } as Pos,
    spacers: [{ x: 10, y: 46 }, { x: 10, y: 25 }, { x: 30, y: 42 }] as Pos[],
};

/** Representative coordinate per subZone, attacking the left basket (x=5.25,y=25). Milestone 1
 *  stand-in for §2-1's real shot-coordinate unification — deterministic, not randomized, so the
 *  same subZone always lands at the same spot (useful for physics tuning A/B comparisons). */
const SUBZONE_COORDS: Record<SubZoneKey, Pos> = {
    zone_rim: { x: 7, y: 25 },
    zone_paint: { x: 12, y: 25 },
    zone_mid_l: { x: 18, y: 12 },
    zone_mid_c: { x: 18, y: 25 },
    zone_mid_r: { x: 18, y: 38 },
    zone_c3_l: { x: 6, y: 4 },
    zone_c3_r: { x: 6, y: 46 },
    zone_atb3_l: { x: 23, y: 8 },
    zone_atb3_c: { x: 28, y: 25 },
    zone_atb3_r: { x: 23, y: 42 },
};

/** §8-6 shooter's catch/shot spot — shared by generateCatchShoot() and the case1 chaining
 *  distance calc below, so both always agree on where the shooter ends up. */
function resolveShooterCatchPos(zone: PossessionResult['zone'], subZone: PossessionResult['subZone']): Pos {
    const finishPos = subZone ? SUBZONE_COORDS[subZone as SubZoneKey] : CATCH_SHOOT.perimeterCatch;
    const isDrive = zone === 'Rim' || zone === 'Paint';
    return isDrive ? CATCH_SHOOT.perimeterCatch : finishPos;
}

function buildSnapshot(
    offTeamId: string,
    playType: PossessionResult['playType'],
    zone: PossessionResult['zone'],
    isHomePossession: boolean,
    entries: { playerId: string; pos: Pos; role: PlayerCourtPosition['role']; position: string; hasBall: boolean }[],
): CourtSnapshot {
    const toDisplay = (p: Pos): Pos => (isHomePossession ? p : mirrorX(p));
    return {
        offTeamId,
        playType,
        zone,
        positions: entries.map(e => {
            const d = toDisplay(e.pos);
            return {
                playerId: e.playerId, x: d.x, y: d.y,
                role: e.role, hasBall: e.hasBall, position: e.position, isHome: isHomePossession,
            };
        }),
    };
}

// ─────────────────────────────────────────────────────────────
// §6-5/§14 Milestone 2 — 케이스 1(우리 진영 베이스라인 인바운드 → 풀코트 전진). "누가 전개하는가"
// 축은 단순화: 리시버 = 항상 CatchShoot의 assister로 고정(릴레이 분기 생략, §14 결정 3). 압박 강도
// 축(§6-5 2번째 분기)은 수비 AI 붙기 전까지 보류(§14 결정 2) — "평상시 전진"만 구현.
// ─────────────────────────────────────────────────────────────

/** §6-5 백코트 출발 좌표 — CatchShoot 로컬 좌표계(왼쪽 골대 공격)와 동일 컨벤션. 도착 지점은
 *  더 이상 고정 상수가 아니라 resolveCase1FinalDestinations()가 매번 동적으로 계산한다(§14
 *  후속 — 엔트리가 CatchShoot의 진짜 목적지를 미리 알고 한 번에 뛰어가게 해서, 릴이 바뀌는
 *  순간 방향을 다시 트는 부자연스러움을 없앰). */
const CASE1_ENTRY = {
    inboundSpot: { x: 93.5, y: 32 } as Pos,     // 인바운더 시작 위치 — 경계선 바로 안쪽 근사(§6-5)
    receiverCatch: { x: 82, y: 22 } as Pos,     // 리시버(assister)가 인바운드 패스를 받는 지점
    // 인바운더·리시버를 제외한 3명(골밑/코너)도 실제 인바운드 상황처럼 우리 진영 베이스라인
    // 근처에서 출발해야 자연스럽다(사용자 피드백 — 하프코트 근처에서 스폰되니 핸들러/패서보다
    // 너무 앞서 있는 것처럼 보였음). x를 인바운더/리시버와 비슷한 범위로 당기고, y만 골밑/좌우
    // 코너로 벌려서 스폰 시점에 서로 겹치지 않게 함.
    paintStart: { x: 88, y: 25 } as Pos,
    cornerLStart: { x: 85, y: 44 } as Pos,
    cornerRStart: { x: 85, y: 6 } as Pos,
};

/** 직선 대신 살짝 휘어진 경로를 만들기 위한 중간 경유점 — start→end 직선의 중점을 수직 방향으로
 *  살짝 오프셋(경로 길이의 12%, 최대 4ft로 캡). "반대쪽 코트까지 1자로 뛰어가는" 부자연스러움을
 *  줄이려는 순수 시각적 장식 — 항상 같은 회전 방향(진행 방향 기준 좌측)으로 휘어서 일관성 유지. */
function curvedWaypoint(start: Pos, end: Pos): Pos {
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const dx = end.x - start.x, dy = end.y - start.y;
    const len = Math.hypot(dx, dy) || 1;
    const bend = Math.min(4, len * 0.12);
    return { x: mid.x - (dy / len) * bend, y: mid.y + (dx / len) * bend };
}

/** §6-5 역할 배정 — inbounder는 override 우선, 없으면 spacer 풀에서 자동(C가 아닌 첫 선수).
 *  paint는 남은 3명 중 C, corner 2명은 그 나머지. */
function resolveCase1Roles(
    offTeam: PossessionResult['offTeam'],
    assisterId: string,
    inbounderIdOverride?: string,
): { inbounder: LivePlayer; paint: LivePlayer; cornerL: LivePlayer; cornerR: LivePlayer } {
    const others = offTeam.onCourt.filter(p => p.playerId !== assisterId); // 4명(actor 포함)
    const inbounder =
        (inbounderIdOverride ? others.find(p => p.playerId === inbounderIdOverride) : undefined)
        ?? others.find(p => p.position !== 'C')
        ?? others[0];
    const rest = others.filter(p => p.playerId !== inbounder.playerId); // 3명
    const paint = rest.find(p => p.position === 'C') ?? rest[0];
    const corners = rest.filter(p => p.playerId !== paint.playerId); // 2명
    return { inbounder, paint, cornerL: corners[0] ?? paint, cornerR: corners[1] ?? paint };
}

interface Case1FinalDestinations {
    inbounder: Pos; paint: Pos; cornerL: Pos; cornerR: Pos;
    spacerTargets: Pos[]; // the 3 chosen points, shared with generateCatchShoot() so it doesn't reroll
    posByPlayerId: Record<string, Pos>; // same 4 destinations keyed by playerId, for CatchShoot's predecessorPositions
}

/**
 * Resolves where all 4 off-ball entry roles (inbounder/paint/cornerL/cornerR) will ULTIMATELY
 * end up — computed once, up front, so generateCase1Entry() can route each player DIRECTLY to
 * their real CatchShoot destination instead of a fixed intermediate spot that gets overridden
 * again once CatchShoot's own beats take over (§14 후속 — 사용자 피드백: 릴이 바뀔 때 방향이
 * 다시 꺾이는 부자연스러움). Whichever role is the actor(shooter) goes to shooterCatchPos; the
 * other 3 share chooseSpacerTargets()'s dynamic pool, matched to whichever role starts closest
 * (assignNearestSlots, same continuity-layer tool used for the CatchShoot-side handoff).
 */
function resolveCase1FinalDestinations(result: PossessionResult): Case1FinalDestinations {
    const { offTeam, actor, assister, zone, subZone, type, rebounder, reboundType } = result;
    if (!assister) {
        throw new Error('[Choreography] case1 entry requires an assister (advancing ball handler, §14 결정 3)');
    }
    const { inbounder, paint, cornerL, cornerR } = resolveCase1Roles(offTeam, assister.playerId, result.inbounderId);
    const roles = [
        { key: 'inbounder' as const, player: inbounder, startPos: CASE1_ENTRY.inboundSpot },
        { key: 'paint' as const, player: paint, startPos: CASE1_ENTRY.paintStart },
        { key: 'cornerL' as const, player: cornerL, startPos: CASE1_ENTRY.cornerLStart },
        { key: 'cornerR' as const, player: cornerR, startPos: CASE1_ENTRY.cornerRStart },
    ];

    const shooterCatchPos = resolveShooterCatchPos(zone, subZone);
    const actorRole = roles.find(r => r.player.playerId === actor.playerId);
    const spacerRoles = roles.filter(r => r.player.playerId !== actor.playerId);

    // 2026-07 — 이 포제션이 이미 "공격 리바운드 성공"으로 끝난다는 걸 알고 있으면(합성/실제
    // PossessionResult에 rebounder가 미리 채워져 있음), 그 선수의 엔트리 최종 스팟 자체를 골밑
    // 근처로 미리 고정한다 — 안 그러면 코너 같은 먼 자리에 서 있다가, 미스 이후 크래시 beat에서
    // 비현실적으로 긴 거리를 전력 질주해야 한다(사용자 피드백). 나머지 2명은 기존과 동일하게
    // insideOut 기반 최근접 매칭.
    const pinnedRole = (type === 'miss' && reboundType === 'off' && rebounder)
        ? spacerRoles.find(r => r.player.playerId === rebounder.playerId)
        : undefined;

    const posByRole: Record<string, Pos> = {};
    if (actorRole) posByRole[actorRole.key] = shooterCatchPos;

    let spacerTargets: Pos[];
    if (pinnedRole) {
        spacerTargets = chooseSpacerTargetsWithPinnedRebounder(
            offTeam.tactics.sliders.insideOut,
            subZone as SubZoneKey | undefined,
            [shooterCatchPos, CATCH_SHOOT.passer],
        );
        // spacerTargets[0]은 항상 고정 포인트(chooseSpacerTargetsWithPinnedRebounder 반환 규약) —
        // assignNearestSlots를 거치지 않고 리바운더 역할에 직접 배정. 나머지 2명·2좌표만 기존처럼
        // 최근접 매칭(그래야 시작 위치와 안 겹치는 자연스러운 경로가 나옴).
        posByRole[pinnedRole.key] = spacerTargets[0];
        const remainingRoles = spacerRoles.filter(r => r.key !== pinnedRole.key);
        const remainingSlots = spacerTargets.slice(1).map((pos, i) => ({ label: String(i), pos }));
        const slotAssignment = assignNearestSlots(
            remainingRoles.map(r => ({ id: r.key, pos: r.startPos })),
            remainingSlots,
        );
        for (const [label, roleKey] of Object.entries(slotAssignment)) {
            posByRole[roleKey] = remainingSlots[Number(label)].pos;
        }
    } else {
        spacerTargets = chooseSpacerTargets(
            offTeam.tactics.sliders.insideOut,
            subZone as SubZoneKey | undefined,
            [shooterCatchPos, CATCH_SHOOT.passer],
        );
        const slotAssignment = assignNearestSlots(
            spacerRoles.map(r => ({ id: r.key, pos: r.startPos })),
            spacerTargets.map((pos, i) => ({ label: String(i), pos })),
        );
        for (const [label, roleKey] of Object.entries(slotAssignment)) {
            posByRole[roleKey] = spacerTargets[Number(label)];
        }
    }

    const posByPlayerId: Record<string, Pos> = {};
    for (const r of roles) posByPlayerId[r.player.playerId] = posByRole[r.key] ?? r.startPos;

    return {
        inbounder: posByRole['inbounder'] ?? CASE1_ENTRY.inboundSpot,
        paint: posByRole['paint'] ?? CASE1_ENTRY.paintStart,
        cornerL: posByRole['cornerL'] ?? CASE1_ENTRY.cornerLStart,
        cornerR: posByRole['cornerR'] ?? CASE1_ENTRY.cornerRStart,
        spacerTargets,
        posByPlayerId,
    };
}

function generateCase1Entry(result: PossessionResult, isHomePossession: boolean, finalDest: Case1FinalDestinations): ChoreographyReel {
    const { offTeam, assister } = result;
    if (!assister) {
        throw new Error('[Choreography] case1 entry requires an assister (advancing ball handler, §14 결정 3)');
    }
    const { inbounder, paint, cornerL, cornerR } = resolveCase1Roles(offTeam, assister.playerId, result.inbounderId);

    const buildEntrySnap = (
        inbounderPos: Pos, inbounderHasBall: boolean,
        receiverPos: Pos, receiverHasBall: boolean,
        paintPos: Pos, cornerLPos: Pos, cornerRPos: Pos,
    ) => buildSnapshot(offTeam.id, 'CatchShoot', result.zone, isHomePossession, [
        { playerId: inbounder.playerId, pos: inbounderPos, role: 'inbounder', position: inbounder.position, hasBall: inbounderHasBall },
        { playerId: assister.playerId, pos: receiverPos, role: 'ballHandler', position: assister.position, hasBall: receiverHasBall },
        { playerId: paint.playerId, pos: paintPos, role: 'spacer', position: paint.position, hasBall: false },
        { playerId: cornerL.playerId, pos: cornerLPos, role: 'spacer', position: cornerL.position, hasBall: false },
        { playerId: cornerR.playerId, pos: cornerRPos, role: 'spacer', position: cornerR.position, hasBall: false },
    ]);

    // Spawn-only snapshot — beat 0's positions are also where entities physically spawn
    // (snapshotToEntities), so paint/cornerL/cornerR start visibly at their backcourt Start spot.
    const spawnSnap = buildEntrySnap(
        CASE1_ENTRY.inboundSpot, true,
        CASE1_ENTRY.receiverCatch, false,
        CASE1_ENTRY.paintStart, CASE1_ENTRY.cornerLStart, CASE1_ENTRY.cornerRStart,
    );
    // Brief early "nudge" toward a curved waypoint — establishes a bent departure angle while
    // speed is still low (right after spawning, before much momentum builds), instead of
    // redirecting mid-flight. Only ONE target change happens for these 3 for the rest of the
    // entry (nudge → final, right below) — no second switch back later, which is what caused the
    // overshoot-and-loop-back: an earlier version aimed straight at finalDest for over a second,
    // THEN suddenly retargeted to this same waypoint (already passed by then), forcing a return trip.
    const nudgeSnap = buildEntrySnap(
        CASE1_ENTRY.inboundSpot, true,
        CASE1_ENTRY.receiverCatch, false,
        curvedWaypoint(CASE1_ENTRY.paintStart, finalDest.paint),
        curvedWaypoint(CASE1_ENTRY.cornerLStart, finalDest.cornerL),
        curvedWaypoint(CASE1_ENTRY.cornerRStart, finalDest.cornerR),
    );
    // From here on, paint/cornerL/cornerR target their true final spot with no further changes —
    // durationSec: pass(0.6)+catch(0.15)+inbounderNudge(0.4)+final(3.2) ≈ 4.4s of uninterrupted
    // approach. Bumped from an earlier 1.8s final beat when paintStart/cornerLStart/cornerRStart
    // moved back near our own baseline (was hugging halfcourt) — spacers now cover ~30ft more
    // ground, so the beat needs the extra time budget or they'd still be short of their spot when
    // the reel ends.
    const directSnap = buildEntrySnap(
        CASE1_ENTRY.inboundSpot, true,
        CASE1_ENTRY.receiverCatch, false,
        finalDest.paint, finalDest.cornerL, finalDest.cornerR,
    );
    const catchSnap = buildEntrySnap(
        CASE1_ENTRY.inboundSpot, false,
        CASE1_ENTRY.receiverCatch, true,
        finalDest.paint, finalDest.cornerL, finalDest.cornerR,
    );
    // Inbounder starts from a dead stop (he was stationary, holding for the pass, this whole
    // time) the moment he releases the ball — so he gets the SAME "brief nudge, then one-time
    // switch to final" treatment, timed to his own departure instead of paint/cornerL/cornerR's.
    const inbounderNudgeSnap = buildEntrySnap(
        curvedWaypoint(CASE1_ENTRY.inboundSpot, finalDest.inbounder), false,
        CATCH_SHOOT.passer, true,
        finalDest.paint, finalDest.cornerL, finalDest.cornerR,
    );
    const finalSnap = buildEntrySnap(
        finalDest.inbounder, false,
        CATCH_SHOOT.passer, true,
        finalDest.paint, finalDest.cornerL, finalDest.cornerR,
    );

    return [
        { snapshot: spawnSnap, durationSec: 0.05, ballEvent: 'dribble' },
        { snapshot: nudgeSnap, durationSec: 0.45, ballEvent: 'dribble' },
        { snapshot: directSnap, durationSec: 0.6, ballEvent: 'pass' },
        { snapshot: catchSnap, durationSec: 0.15, ballEvent: 'catch' },
        { snapshot: inbounderNudgeSnap, durationSec: 0.4, ballEvent: 'dribble' },
        { snapshot: finalSnap, durationSec: 3.2, ballEvent: 'dribble' },
    ];
}

// ─────────────────────────────────────────────────────────────
// 2026-07 — CatchShoot 미스 시 공격 리바운드 크래시 + 바운스. 골밑/페인트 후보 지점(REBOUND_
// CRASH_POINTS)은 virtualShotPoints.ts에서 정의·공유 — 리바운더 엔트리 고정 배치(아래
// resolveCase1FinalDestinations)와 같은 풀을 써야 두 지점이 서로 가깝게 유지된다.
// ─────────────────────────────────────────────────────────────

// [2026-07 두 차례 정정] 낙구지점 설계가 세 단계를 거쳤다:
//   v1 — "크래시 목표 + 랜덤 오프셋"을 별도 좌표로 계산. 선수는 오프셋 적용 전 anchor로 계속
//        움직이고 재조준을 안 해서, 공은 근처 다른 지점에 떨어지는데 사람은 안 따라가는 어색함
//        발생(사용자 피드백).
//   v2 — 재조준 대신 좌표를 아예 하나로 통일(크래시 목표 = 낙구지점). 어색함은 없앴지만, 사용자
//        의도는 "재조준이 필요 없게" 만드는 게 아니라 "공중에 떠 있을 때 골밑으로 쇄도 → 림에
//        맞고 튀면 실제 지점으로 반응"하는 2단계 동작 자체를 원한 것이었음이 다시 확인됨.
//   v3 — generateCatchShoot()의 shoot beat(공 비행 중)까지는 초기 크래시 목표로 쇄도, bounce
//        beat(림에 맞고 튐) 진입 시점에 리바운더 1명만 pickFarthestPoint(REBOUND_CRASH_POINTS,
//        ...)로 고른 새 지점으로 재조준. 그런데 이 함수는 "가장 멀리 떨어진 지점"이 목적이라
//        골밑 풀 전체(최대 15ft) 반경까지 재조준 거리가 벌어질 수 있어, "튄 공에 살짝 반응"이
//        아니라 "다른 곳으로 뛰어가는" 것처럼 보였다(사용자 피드백).
//   v4(현재) — 재조준 로직은 그대로 두고, 낙구지점만 nearbyLandingPoint()로 교체 — 초기 크래시
//        목표에서 NEARBY_LANDING_RADIUS_FT(0.5ft) 이내로만 옮긴다. 케이스1 곡선 버그와 다른
//        이유는 여전히 동일(beat 전환 시점 한 번뿐인 재조준)이고, 이제 거리 상한도 명시적으로 짧다.

const NEARBY_LANDING_RADIUS_FT = 0.5;

/** 낙구지점 = 초기 크래시 목표에서 반경 이내 랜덤 지점. REBOUND_CRASH_POINTS 풀 전체에서 다시
 *  고르지 않는 이유: 그 풀은 "크래시 인원이 골밑 어디로 갈지"를 넓게 흩뿌리기 위한 것이라, 재조준에
 *  쓰면 리바운더가 이미 향하던 곳과 무관하게 먼 지점이 나올 수 있다(위 v3의 실패 원인). 재조준은
 *  "이미 그쪽으로 가고 있었는데 살짝 방향을 트는" 정도여야 자연스럽다. */
function nearbyLandingPoint(from: Pos): Pos {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * NEARBY_LANDING_RADIUS_FT;
    return {
        x: Math.max(0.5, from.x + Math.cos(angle) * r),
        y: Math.min(49, Math.max(1, from.y + Math.sin(angle) * r)),
    };
}

/** 공격 리바운드 크래시 인원 선정 — offReb 슬라이더(1~10)로 스페이서 3명 중 몇 명이 골밑으로
 *  붙는지 정하되, 실제 리바운더(reboundType==='off')는 슬라이더 결과와 무관하게 항상 강제
 *  포함한다. 그렇지 않으면 "리바운드를 잡은 선수가 정작 거기 없었다"는 모순이 생긴다. 슈터/
 *  패서는 기본적으로 크래시 후보가 아니지만, 실제 리바운더로 뽑힌 예외적인 경우엔 그들도
 *  강제로 골밑 좌표를 받는다. */
function chooseCrashTargets(
    spacerPlayers: LivePlayer[],
    actor: LivePlayer,
    assister: LivePlayer,
    offReb: number,
    rebounder?: LivePlayer,
    reboundType?: 'off' | 'def',
): Map<string, Pos> {
    const forcedId = reboundType === 'off' ? rebounder?.playerId : undefined;

    const crasherIds = new Set<string>();
    if (forcedId && spacerPlayers.some(p => p.playerId === forcedId)) crasherIds.add(forcedId);

    // offReb 1~10 → 스페이서 풀(3명) 중 0~3명. 강제 포함 인원이 있으면 그 이하로는 안 내려감.
    const targetCount = Math.max(
        crasherIds.size,
        Math.round(((offReb - 1) / 9) * spacerPlayers.length),
    );
    const shuffled = [...spacerPlayers].sort(() => Math.random() - 0.5);
    for (const p of shuffled) {
        if (crasherIds.size >= targetCount) break;
        crasherIds.add(p.playerId);
    }

    // 슈터/패서가 실제 리바운더로 뽑힌 예외 케이스 — 스페이서 풀 밖이라도 강제 합류.
    if (forcedId && (forcedId === actor.playerId || forcedId === assister.playerId)) {
        crasherIds.add(forcedId);
    }

    // 강제 포함 인원을 먼저 배치해 골밑 좌표의 앵커로 삼고, 나머지는 이미 배치된 지점에서
    // 가장 먼 곳부터 순서대로 채운다(스페이서 배치와 동일한 최원점 그리디).
    const occupied: Pos[] = [];
    const targets = new Map<string, Pos>();
    const orderedIds = [...crasherIds].sort((a, b) => (a === forcedId ? -1 : b === forcedId ? 1 : 0));
    for (const id of orderedIds) {
        const pos = pickFarthestPoint(REBOUND_CRASH_POINTS, occupied);
        targets.set(id, pos);
        occupied.push(pos);
    }
    return targets;
}

function generateCatchShoot(
    result: PossessionResult,
    timeTaken: number,
    isHomePossession: boolean,
    // Where each spacer-pool player physically ended up in a PRECEDING chained reel (e.g. case1
    // entry), if any. When provided, spacer slots are assigned by nearest-distance matching
    // instead of raw roster order, so players don't visibly swap places at the reel seam.
    predecessorPositions?: Record<string, Pos>,
    // When the caller (case1 chaining) already computed the 3 spacer targets up front and routed
    // players there directly during entry, reuse those exact points instead of rerolling a fresh
    // random set here — that mismatch is what caused the "arrives, then redirects again" seam.
    spacerTargetsOverride?: Pos[],
    // Optional debug sink — if provided, gets the ACTUAL crash-target/bounce values this call
    // computed (Math.random() included). Unlike buildCase1ContinuityDebug() below (which
    // deliberately recomputes resolveCase1FinalDestinations() separately for display — fine
    // there since it's illustrating the mechanism, not meant to be pixel-exact), crash/bounce
    // debug data MUST come from the same call that built the reel, or the numbers shown won't
    // match what's actually rendered.
    debugSink?: ChoreographyDebugLine[],
): ChoreographyReel {
    const { offTeam, actor, assister, zone, subZone, rebounder, reboundType } = result;
    if (!assister) {
        throw new Error('[Choreography] CatchShoot requires an assister (always-pass playType, §8-6)');
    }

    const spacerPlayers = offTeam.onCourt.filter(p => p.playerId !== actor.playerId && p.playerId !== assister.playerId);
    const finishPos = subZone ? SUBZONE_COORDS[subZone as SubZoneKey] : CATCH_SHOOT.perimeterCatch;
    const isDrive = zone === 'Rim' || zone === 'Paint';
    const shooterCatchPos = resolveShooterCatchPos(zone, subZone);

    // 2026-07 — 이 포제션이 이미 "공격 리바운드 성공"으로 끝난다는 걸 알고 있으면(entry 없이
    // 단독 호출된 경우도 포함), 리바운더의 스팟업 자리를 미리 골밑 근처로 고정한다 — 엔트리
    // 경로(resolveCase1FinalDestinations)와 동일한 이유·동일한 원리.
    const isMiss = result.type === 'miss';
    const rebounderSpacerIndex = (isMiss && reboundType === 'off' && rebounder)
        ? spacerPlayers.findIndex(p => p.playerId === rebounder.playerId)
        : -1;

    // §14 후속 — 스페이서 3명의 목표 좌표를 고정 상수 대신 매번 동적으로 고른다: insideOut
    // 전술 슬라이더로 인사이드/아웃사이드 존을 고르고, 그 존의 가상 슈팅 포인트(73개, 사용자가
    // 좌표 피커로 직접 확정) 중 이미 배치된 지점들과 가장 멀리 떨어진 곳을 순서대로 선택. 슈터
    // 자리(shooterCatchPos)와 어시스터 자리(passer)를 시드로 넣어 스페이서가 둘과 겹치지 않게 함.
    let spacerTargets: Pos[];
    if (spacerTargetsOverride) {
        spacerTargets = spacerTargetsOverride;
    } else if (rebounderSpacerIndex >= 0) {
        // spacerPlayers는 배열 인덱스로 spacerTargets[i]와 매칭되므로(아래 spacerEntry),
        // 리바운더의 인덱스 자리에 고정 포인트를 직접 넣는다.
        const pinned = chooseSpacerTargetsWithPinnedRebounder(
            offTeam.tactics.sliders.insideOut,
            subZone as SubZoneKey | undefined,
            [shooterCatchPos, CATCH_SHOOT.passer],
        );
        const others = pinned.slice(1);
        spacerTargets = spacerPlayers.map((_, i) => (i === rebounderSpacerIndex ? pinned[0] : others.shift()!));
    } else {
        spacerTargets = chooseSpacerTargets(
            offTeam.tactics.sliders.insideOut,
            subZone as SubZoneKey | undefined,
            [shooterCatchPos, CATCH_SHOOT.passer],
        );
    }

    const spacerSlots = spacerTargets.map((pos, i) => ({ label: String(i), pos }));
    const playerToSlotPos = new Map<string, Pos>();
    if (predecessorPositions) {
        const slotAssignment = assignNearestSlots(
            spacerPlayers.map(p => ({ id: p.playerId, pos: predecessorPositions[p.playerId] ?? spacerSlots[0].pos })),
            spacerSlots,
        );
        for (const [label, playerId] of Object.entries(slotAssignment)) {
            playerToSlotPos.set(playerId, spacerSlots[Number(label)].pos);
        }
    }

    const spacerEntry = (p: typeof spacerPlayers[number], i: number) => ({
        playerId: p.playerId,
        pos: playerToSlotPos.get(p.playerId) ?? spacerTargets[i] ?? spacerTargets[0],
        role: 'spacer' as const, position: p.position, hasBall: false,
    });

    // Beat 1: setup — passer holds (dribble in place), shooter + spacers move into position.
    const setupSnap = buildSnapshot(offTeam.id, 'CatchShoot', zone, isHomePossession, [
        { playerId: actor.playerId, pos: shooterCatchPos, role: 'ballHandler', position: actor.position, hasBall: false },
        { playerId: assister.playerId, pos: CATCH_SHOOT.passer, role: 'screener', position: assister.position, hasBall: true },
        ...spacerPlayers.map(spacerEntry),
    ]);

    // Beat 2: pass — passer to shooter (same target positions, ball now in flight).
    const passSnap = setupSnap;

    // Beat 3: catch — ball settles on shooter.
    const catchSnap = buildSnapshot(offTeam.id, 'CatchShoot', zone, isHomePossession, [
        { playerId: actor.playerId, pos: shooterCatchPos, role: 'ballHandler', position: actor.position, hasBall: true },
        { playerId: assister.playerId, pos: CATCH_SHOOT.passer, role: 'screener', position: assister.position, hasBall: false },
        ...spacerPlayers.map(spacerEntry),
    ]);

    const beats: ChoreographyBeat[] = [
        { snapshot: setupSnap, durationSec: 0.8, ballEvent: 'dribble' },
        { snapshot: passSnap, durationSec: 0.5, ballEvent: 'pass' },
        { snapshot: catchSnap, durationSec: 0.15, ballEvent: 'catch' },
    ];

    if (isDrive) {
        // Rim/Paint: pump-fake then drive from the perimeter catch spot to the finish spot.
        const driveSnap = buildSnapshot(offTeam.id, 'CatchShoot', zone, isHomePossession, [
            { playerId: actor.playerId, pos: finishPos, role: 'ballHandler', position: actor.position, hasBall: true },
            { playerId: assister.playerId, pos: CATCH_SHOOT.passer, role: 'screener', position: assister.position, hasBall: false },
            ...spacerPlayers.map(spacerEntry),
        ]);
        beats.push({
            snapshot: driveSnap, durationSec: 0.9, ballEvent: 'dribble',
            // perimeterCatch → finishPos can be ~20+ft (e.g. wing catch to rim finish) — 0.9s is
            // a floor, not a guarantee. Without this, the shoot beat fires on schedule regardless
            // of whether the actor actually reached the finish spot, releasing the shot from
            // wherever he happened to be mid-drive.
            holdUntilSettled: [actor.playerId],
        });
    }

    // 2026-07 — 미스일 때: 슛이 릴리즈되는 이 순간(shoot beat 진입 시점)부터 크래시 인원의 목표를
    // 골밑으로 바꾼다. 공이 아직 림까지 날아가는 중(0.8s)일 때 이미 움직이기 시작해야 "슛 나가자
    // 마자 크래시"처럼 보이고, catch/drive 단계까지는 건드리지 않아 기존 동작과 동일하게 유지된다.
    const shootPos = isDrive ? finishPos : shooterCatchPos;
    const crashTargets = isMiss
        ? chooseCrashTargets(spacerPlayers, actor, assister, offTeam.tactics.sliders.offReb, rebounder, reboundType)
        : undefined;

    // 2026-07 재정정 — chooseCrashTargets()가 리바운더의 크래시 목표를 REBOUND_CRASH_POINTS
    // 풀에서 독립적으로 다시 뽑다 보니, 위에서(엔트리 핀닝 또는 rebounderSpacerIndex 핀닝) 이미
    // 골밑 근처로 정해둔 위치와 서로 다른 지점이 나와서(같은 풀 안에서도 최대 15ft까지 벌어질 수
    // 있음) 핀닝 효과가 사실상 무력화되는 문제가 있었다(디버그로 실측 확인: 12.4ft 차이). 리바운더가
    // 스페이서 역할(슈터/패서가 아님)이면, 크래시 목표를 다시 뽑지 말고 이미 정해둔 핀 좌표를 그대로
    // 재사용한다 — 같은 결정을 두 곳에서 독립적으로 내리지 않고 한 곳(엔트리/스팟업 배치)에서만.
    if (crashTargets && rebounder && spacerPlayers.some(p => p.playerId === rebounder.playerId)) {
        const pinnedPos = predecessorPositions?.[rebounder.playerId]
            ?? (rebounderSpacerIndex >= 0 ? spacerTargets[rebounderSpacerIndex] : undefined);
        if (pinnedPos) crashTargets.set(rebounder.playerId, pinnedPos);
    }

    const shootSpacerEntry = (p: typeof spacerPlayers[number], i: number) => ({
        playerId: p.playerId,
        pos: crashTargets?.get(p.playerId) ?? playerToSlotPos.get(p.playerId) ?? spacerTargets[i] ?? spacerTargets[0],
        role: 'spacer' as const, position: p.position, hasBall: false,
    });
    const shootSnap = buildSnapshot(offTeam.id, 'CatchShoot', zone, isHomePossession, [
        { playerId: actor.playerId, pos: crashTargets?.get(actor.playerId) ?? shootPos, role: 'ballHandler', position: actor.position, hasBall: true },
        { playerId: assister.playerId, pos: crashTargets?.get(assister.playerId) ?? CATCH_SHOOT.passer, role: 'screener', position: assister.position, hasBall: false },
        ...spacerPlayers.map(shootSpacerEntry),
    ]);
    const crasherIds = crashTargets ? [...crashTargets.keys()] : [];
    // bounce beat가 뒤에 붙을지 여기서 미리 알아야, 크래시 인원의 holdUntilSettled를 "실제로
    // 마지막 beat가 될 쪽"에 걸 수 있다 — 마지막이 아닌 beat에 걸면(예: bounce가 따로 붙는데
    // shoot에도 걸어버리면) 정지 판정 타이밍이 꼬인다.
    const willAddBounce = isMiss && reboundType === 'off' && !!rebounder && !!crashTargets?.has(rebounder.playerId);
    beats.push({
        snapshot: shootSnap,
        durationSec: 0.8,
        ballEvent: 'shoot',
        // 골밑까지 실제 이동 거리가 shoot(0.8s) 하나로는 부족한 경우가 많아, 크래시 인원이 진짜
        // 도착할 때까지 릴이 안 끝나게 붙잡아둔다 — bounce beat가 이어지면 거기서 대신 건다
        // (마지막 beat 쪽에서만 의미가 있으므로, useReelPlayback.ts의 reelFinished 판정 참고).
        holdUntilSettled: (!willAddBounce && crasherIds.length > 0) ? crasherIds : undefined,
    });

    if (isMiss && debugSink) {
        const nameOf = (id: string) =>
            [actor, assister, ...spacerPlayers].find(p => p.playerId === id)?.playerName ?? id;
        const forcedId = reboundType === 'off' ? rebounder?.playerId : undefined;
        debugSink.push({
            label: '리바운드 크래시',
            detail: crashTargets && crashTargets.size > 0
                ? [...crashTargets.entries()].map(([id, pos]) =>
                    `${nameOf(id)}${id === forcedId ? '(강제:실제리바운더)' : ''} → ${fmtPos(pos)}`).join(' · ')
                : '크래시 인원 0명 (offReb 슬라이더가 낮거나 강제 포함 대상 없음)',
        });
    }

    // 낙구지점을 앵커할 실제 공격 리바운더가 있을 때만 bounce beat 추가 — 수비 리바운드/리바운더
    // 미지정 케이스는 나중에 수비 안무를 만들 때 같이 다룰 예정이라 지금은 그냥 shoot에서 릴 종료
    // (기존 동작 그대로).
    if (willAddBounce && rebounder) {
        // 2026-07 재정정 — 사용자 피드백: 공이 공중에 떠 있는 동안은 골밑 쪽으로 쇄도하다가,
        // 림에 맞고 튀는 순간 실제 낙구지점으로 다시 목표를 잡아야 자연스럽다. 단, 처음엔
        // pickFarthestPoint(REBOUND_CRASH_POINTS, ...)로 골랐는데 — 이 함수는 "가장 멀리
        // 떨어진 지점"을 고르는 게 목적이라, 골밑 풀 전체(최대 15ft) 반경에서 재조준 거리가
        // 나올 수 있어 "튄 공에 살짝 반응"이 아니라 "완전히 다른 곳으로 뛰어가는" 것처럼
        // 보였다(사용자 피드백). 재조준 자체는 유지하되, 초기 크래시 목표 근처(NEARBY_LANDING_
        // RADIUS_FT 이내)로만 살짝 옮기는 걸로 교체 — 케이스1 곡선 버그와 다른 이유는 여전히
        // 동일: 재조준이 beat 전환 시점 한 번뿐이고, 이제 거리 자체도 명시적으로 짧게 캡핑된다.
        const initialCrashTarget = crashTargets!.get(rebounder.playerId)!;
        const landingLocal = nearbyLandingPoint(initialCrashTarget);
        // player position과 동일하게 홈/원정 미러링을 거쳐야 한다 — 안 그러면 원정팀 공격일 때
        // 선수들(mirrorX 적용됨)은 오른쪽 골대 기준인데 낙구지점만 왼쪽 골대 기준으로 어긋난다.
        const landingDisplay = isHomePossession ? landingLocal : mirrorX(landingLocal);
        // shoot beat 스냅샷을 그대로 복제하되, 리바운더 1명의 좌표만 낙구지점으로 교체 — 나머지
        // 크래시 인원/선수는 이미 향하던 자리를 계속 유지(실제로 공을 잡는 사람만 최종 반응).
        const bounceSnap: CourtSnapshot = {
            ...shootSnap,
            positions: shootSnap.positions.map(p =>
                p.playerId === rebounder.playerId ? { ...p, x: landingDisplay.x, y: landingDisplay.y } : p
            ),
        };
        beats.push({
            snapshot: bounceSnap,
            durationSec: 0.5,
            ballEvent: 'bounce',
            ballLandingPos: landingDisplay,
            // 이제 이 beat가 릴의 마지막이므로, 크래시 인원이 실제로 도착·정지할 때까지 릴이
            // 안 끝나게 붙잡아둔다(useReelPlayback.ts가 마지막 beat의 holdUntilSettled도
            // 존중하도록 함께 수정함).
            holdUntilSettled: crasherIds.length > 0 ? crasherIds : undefined,
        });
        if (debugSink) {
            debugSink.push({
                label: '리바운드 낙구지점',
                detail: `리바운더(${rebounder.playerName}) 초기 크래시 목표 ${fmtPos(initialCrashTarget)} → 튄 뒤 재조준 `
                    + `${fmtPos(landingLocal)} (거리 ${Math.hypot(landingLocal.x - initialCrashTarget.x, landingLocal.y - initialCrashTarget.y).toFixed(2)}ft)`,
            });
        }
    } else if (isMiss && debugSink) {
        debugSink.push({
            label: '리바운드 낙구지점',
            detail: reboundType !== 'off'
                ? `bounce beat 없음 — reboundType=${reboundType ?? '미지정'} (공격 리바운드 아님)`
                : `bounce beat 없음 — rebounder 미지정 또는 크래시 대상에 없음`,
        });
    }

    return beats;
}

export function generateChoreography(
    result: PossessionResult,
    timeTaken: number,
    homeTeamId: string,
    // 실제로 이 호출이 계산한 크래시/바운스 값을 그대로 보여주기 위한 sink — buildCase1
    // ContinuityDebug()처럼 별도로 재계산하면 Math.random() 때문에 실제 릴과 다른 값이 나온다.
    debugSink?: ChoreographyDebugLine[],
): ChoreographyReel {
    const isHomePossession = result.offTeam.id === homeTeamId;

    if (result.playType === 'CatchShoot') {
        if (result.entry === 'case1' && result.assister) {
            // §14 후속 — 엔트리와 CatchShoot가 "진짜 목적지"를 미리 공유한다: 예전엔 엔트리가
            // 고정된 중간 지점까지 보낸 뒤 CatchShoot가 다시 새 목적지로 리다이렉트해서 릴이
            // 바뀌는 순간 방향이 꺾였는데, 이제 resolveCase1FinalDestinations()가 한 번만 계산해서
            // 엔트리(직행 경로)와 CatchShoot(같은 스페이서 타겟 재사용) 둘 다에 넘겨준다.
            const finalDest = resolveCase1FinalDestinations(result);
            const entryBeats = generateCase1Entry(result, isHomePossession, finalDest);
            const catchShootBeats = generateCatchShoot(
                result, timeTaken, isHomePossession,
                finalDest.posByPlayerId, finalDest.spacerTargets, debugSink,
            );

            const [firstCatchShootBeat, ...restCatchShootBeats] = catchShootBeats;
            const settledFirstBeat: ChoreographyBeat = {
                ...firstCatchShootBeat,
                // Everyone already ran to their true final spot during the entry itself now (no
                // more post-hoc redirect), so this is just a short safety margin — the real gate
                // is holdUntilSettled below, in case arrive()/separation() left someone slightly
                // short.
                durationSec: Math.max(firstCatchShootBeat.durationSec, 0.3),
                // 2026-07 — 예전엔 actor(슈터) 한 명만 체크했는데, 리바운더 핀닝 때문에 특정
                // 역할(예: 인바운더)의 엔트리 이동거리가 코트 거의 전체(~90ft)로 늘어날 수 있어서,
                // 그 선수가 아직 도착 못 했는데도 CatchShoot의 shoot/bounce가 예정대로 진행돼
                // "공은 이미 착지했는데 리바운더는 한참 못 왔다"는 어긋남이 생겼다(사용자 피드백,
                // 디버그로 좌표 자체는 정확함을 확인 후 원인이 타이밍임을 특정). finalDest.
                // posByPlayerId의 4개 엔트리 역할(actor 포함) 전원이 실제로 도착·정지할 때까지
                // 기다리도록 확장.
                holdUntilSettled: Object.keys(finalDest.posByPlayerId),
            };
            return [...entryBeats, settledFirstBeat, ...restCatchShootBeats];
        }
        return generateCatchShoot(result, timeTaken, isHomePossession, undefined, undefined, debugSink);
    }

    // Milestone 1: everything else is a single static beat (no motion) so the pipeline never
    // throws — real patterns for the remaining 11 playTypes land in later milestones (§8).
    const spacers = result.offTeam.onCourt.filter(p => p.playerId !== result.actor.playerId);
    const snap = buildSnapshot(result.offTeam.id, result.playType, result.zone, isHomePossession, [
        { playerId: result.actor.playerId, pos: { x: 28, y: 25 }, role: 'ballHandler', position: result.actor.position, hasBall: true },
        ...spacers.slice(0, 4).map((p, i) => ({
            playerId: p.playerId, pos: CATCH_SHOOT.spacers[i % 3] ?? { x: 10, y: 25 }, role: 'spacer' as const, position: p.position, hasBall: false,
        })),
    ]);
    return [{ snapshot: snap, durationSec: Math.max(1, timeTaken), ballEvent: 'shoot' }];
}

// ─────────────────────────────────────────────────────────────
// Debug introspection — NOT used by generateChoreography() itself. Recomputes (doesn't mutate)
// the same continuity data generateChoreography()'s case1 branch derives internally, formatted
// as human-readable lines, so a UI panel (MotionSandboxPanel's debug terminal) can show exactly
// which real player names/positions are flowing between the entry reel and CatchShoot's reel —
// i.e. verify the continuity layer is actually wiring real data through, not just "looking the
// same as before" by coincidence.
// ─────────────────────────────────────────────────────────────

export interface ChoreographyDebugLine {
    label: string;
    detail: string;
}

const fmtPos = (p: Pos) => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`;

export function buildCase1ContinuityDebug(result: PossessionResult): ChoreographyDebugLine[] {
    if (result.playType !== 'CatchShoot' || result.entry !== 'case1' || !result.assister) return [];
    const { offTeam, actor, assister } = result;

    const { inbounder, paint, cornerL, cornerR } = resolveCase1Roles(offTeam, assister.playerId, result.inbounderId);
    const lines: ChoreographyDebugLine[] = [
        {
            label: '엔트리 역할 배정',
            detail: `인바운더=${inbounder.playerName} · 골밑=${paint.playerName} · 코너L=${cornerL.playerName} · 코너R=${cornerR.playerName} · 볼핸들러(어시스터)=${assister.playerName}`,
        },
    ];

    // §14 후속 — 이제 엔트리 종료 지점과 CatchShoot 목적지가 처음부터 같은 값이라, "핸드오프"가
    // 아니라 "시작부터 어디로 직행하는지"를 보여준다(재조정 구간이 없어짐).
    const finalDest = resolveCase1FinalDestinations(result);
    const roleByKey = { inbounder, paint, cornerL, cornerR } as const;
    const startByKey: Record<keyof typeof roleByKey, Pos> = {
        inbounder: CASE1_ENTRY.inboundSpot,
        paint: CASE1_ENTRY.paintStart,
        cornerL: CASE1_ENTRY.cornerLStart,
        cornerR: CASE1_ENTRY.cornerRStart,
    };
    for (const key of Object.keys(roleByKey) as (keyof typeof roleByKey)[]) {
        const player = roleByKey[key];
        const isActor = player.playerId === actor.playerId;
        lines.push({
            label: isActor ? '슈터 직행 경로' : '스페이서 직행 경로',
            detail: `${player.playerName}: 엔트리 시작 ${fmtPos(startByKey[key])} → 최종 목적지 ${fmtPos(finalDest[key])} (릴 전환 시 재조정 없음)`,
        });
    }

    return lines;
}
