
import { PossessionResult, LivePlayer, CourtSnapshot, PlayerCourtPosition } from '../pbpTypes';
import { COURT_WIDTH, COURT_HEIGHT, HOOP_X_LEFT, HOOP_Y_CENTER } from '../../../../../utils/courtCoordinates';
import { PlayType } from '../../../../../types';

// ─────────────────────────────────────────────────────────────
// Formation Template System
// All coordinates in "left-basket halfcourt" (0-47 x, 0-50 y)
// Basket at (5.25, 25)
// ─────────────────────────────────────────────────────────────

interface Pos { x: number; y: number }

interface FormationTemplate {
    ballHandler: Pos;
    screenPartner: Pos;
    spacers: [Pos, Pos, Pos];
}

interface FormationConfig {
    base: FormationTemplate;
    zoneOverrides?: Partial<Record<'Rim' | 'Paint' | 'Mid' | '3PT', Partial<FormationTemplate>>>;
}

// ── 10 PlayType Formations ──

const FORMATIONS: Record<PlayType, FormationConfig> = {
    Iso: {
        base: {
            ballHandler:   { x: 28, y: 20 },
            screenPartner: { x: 32, y: 42 },
            spacers: [{ x: 10, y: 4 }, { x: 32, y: 8 }, { x: 18, y: 42 }],
        },
        zoneOverrides: {
            Rim:   { ballHandler: { x: 8, y: 22 } },
            Paint: { ballHandler: { x: 14, y: 20 } },
            Mid:   { ballHandler: { x: 20, y: 18 } },
            '3PT': { ballHandler: { x: 30, y: 15 } },
        },
    },
    PnR_Handler: {
        base: {
            ballHandler:   { x: 28, y: 25 },
            screenPartner: { x: 22, y: 25 },
            spacers: [{ x: 10, y: 4 }, { x: 10, y: 46 }, { x: 32, y: 8 }],
        },
        zoneOverrides: {
            Rim:   { ballHandler: { x: 8, y: 24 } },
            Paint: { ballHandler: { x: 14, y: 23 } },
            Mid:   { ballHandler: { x: 20, y: 22 } },
            '3PT': { ballHandler: { x: 30, y: 25 } },
        },
    },
    PnR_Roll: {
        base: {
            ballHandler:   { x: 10, y: 28 },
            screenPartner: { x: 28, y: 25 },
            spacers: [{ x: 10, y: 4 }, { x: 10, y: 46 }, { x: 32, y: 42 }],
        },
        zoneOverrides: {
            Rim:   { ballHandler: { x: 7, y: 26 } },
            Paint: { ballHandler: { x: 13, y: 28 } },
            Mid:   { ballHandler: { x: 18, y: 25 } },
        },
    },
    PnR_Pop: {
        base: {
            ballHandler:   { x: 30, y: 15 },
            screenPartner: { x: 28, y: 25 },
            spacers: [{ x: 10, y: 4 }, { x: 10, y: 46 }, { x: 32, y: 42 }],
        },
    },
    PostUp: {
        base: {
            ballHandler:   { x: 10, y: 18 },
            screenPartner: { x: 30, y: 25 },
            spacers: [{ x: 10, y: 46 }, { x: 30, y: 8 }, { x: 30, y: 42 }],
        },
        zoneOverrides: {
            Rim:   { ballHandler: { x: 7, y: 20 } },
            Paint: { ballHandler: { x: 12, y: 20 } },
            Mid:   { ballHandler: { x: 18, y: 15 } },
        },
    },
    CatchShoot: {
        base: {
            ballHandler:   { x: 28, y: 8 },
            screenPartner: { x: 28, y: 25 },
            spacers: [{ x: 10, y: 46 }, { x: 10, y: 25 }, { x: 30, y: 42 }],
        },
    },
    Cut: {
        base: {
            ballHandler:   { x: 8, y: 30 },
            screenPartner: { x: 30, y: 20 },
            spacers: [{ x: 10, y: 4 }, { x: 32, y: 42 }, { x: 30, y: 8 }],
        },
        zoneOverrides: {
            Rim:   { ballHandler: { x: 7, y: 28 } },
            Paint: { ballHandler: { x: 12, y: 30 } },
        },
    },
    Handoff: {
        base: {
            ballHandler:   { x: 24, y: 20 },
            screenPartner: { x: 20, y: 22 },
            spacers: [{ x: 10, y: 4 }, { x: 10, y: 46 }, { x: 32, y: 42 }],
        },
        zoneOverrides: {
            Rim:   { ballHandler: { x: 8, y: 22 } },
            Mid:   { ballHandler: { x: 20, y: 18 } },
            '3PT': { ballHandler: { x: 28, y: 15 } },
        },
    },
    Transition: {
        base: {
            ballHandler:   { x: 12, y: 25 },
            screenPartner: { x: 30, y: 25 },
            spacers: [{ x: 8, y: 8 }, { x: 8, y: 42 }, { x: 22, y: 25 }],
        },
        zoneOverrides: {
            Rim:   { ballHandler: { x: 7, y: 25 } },
            '3PT': { ballHandler: { x: 28, y: 10 } },
        },
    },
    Putback: {
        base: {
            ballHandler:   { x: 7, y: 26 },
            screenPartner: { x: 28, y: 25 },
            spacers: [{ x: 12, y: 18 }, { x: 12, y: 32 }, { x: 30, y: 10 }],
        },
    },
    OffBallScreen: {
        // 슈터가 스크린 돌아 나와 캐치앤슛 (Handoff와 유사한 포메이션)
        base: {
            ballHandler:   { x: 28, y: 12 },   // 슈터: 윙 3점 라인
            screenPartner: { x: 18, y: 18 },   // 스크리너: 엘보우 근처
            spacers: [{ x: 30, y: 25 }, { x: 10, y: 46 }, { x: 32, y: 42 }],
        },
        zoneOverrides: {
            Mid:   { ballHandler: { x: 22, y: 15 } },
            '3PT': { ballHandler: { x: 30, y: 10 } },
        },
    },
    DriveKick: {
        // 드라이버가 침투 후 킥아웃 → 슈터 캐치앤슛 (CatchShoot와 유사)
        base: {
            ballHandler:   { x: 28, y: 8 },    // 슈터: 코너/윙 3점 라인
            screenPartner: { x: 14, y: 25 },   // 드라이버: 페인트 근처 (침투 후)
            spacers: [{ x: 30, y: 42 }, { x: 10, y: 46 }, { x: 10, y: 4 }],
        },
    },
};

// Position order for spacer slot assignment (guards → perimeter, bigs → interior)
const POS_ORDER: Record<string, number> = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 };

// ── 2-3 Zone Defense Formation ──
// Halfcourt coordinates (0-47 x, 0-50 y), basket at (5.25, 25)
interface ZoneSlot {
    base: Pos;
    strongShift: Pos;  // Ball-side shift offset
    weakShift: Pos;    // Weak-side collapse offset
}

const ZONE_23: ZoneSlot[] = [
    // Slot 0: Left Guard (top-left perimeter)
    { base: { x: 24, y: 16 }, strongShift: { x: -4, y: -3 }, weakShift: { x: 3, y: 4 } },
    // Slot 1: Right Guard (top-right perimeter)
    { base: { x: 24, y: 34 }, strongShift: { x: -4, y: 3 }, weakShift: { x: 3, y: -4 } },
    // Slot 2: Left Forward (baseline-left)
    { base: { x: 12, y: 12 }, strongShift: { x: -2, y: -4 }, weakShift: { x: 3, y: 6 } },
    // Slot 3: Right Forward (baseline-right)
    { base: { x: 12, y: 38 }, strongShift: { x: -2, y: 4 }, weakShift: { x: 3, y: -6 } },
    // Slot 4: Center (paint anchor)
    { base: { x: 8, y: 25 }, strongShift: { x: -1, y: -3 }, weakShift: { x: -1, y: 3 } },
];

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

function addJitter(pos: Pos, maxFt: number = 1.5): Pos {
    return {
        x: clamp(pos.x + (Math.random() - 0.5) * maxFt * 2, 1, COURT_WIDTH - 1),
        y: clamp(pos.y + (Math.random() - 0.5) * maxFt * 2, 1, COURT_HEIGHT - 1),
    };
}

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
}

function mirrorX(pos: Pos): Pos {
    return { x: COURT_WIDTH - pos.x, y: pos.y };
}

/**
 * Compute defensive position: between the offensive player and the basket.
 */
function computeDefPos(offPos: Pos, basketX: number, offsetFt: number): Pos {
    const dx = basketX - offPos.x;
    const dy = HOOP_Y_CENTER - offPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.5) return { x: offPos.x + offsetFt, y: offPos.y };
    return addJitter({
        x: offPos.x + (dx / dist) * offsetFt,
        y: offPos.y + (dy / dist) * offsetFt * 0.3,
    }, 1.0);
}

/**
 * PnR coverage positioning for the screener's defender.
 */
function computePnrDefPos(
    screenerPos: Pos, handlerPos: Pos, basketX: number,
    coverage: 'drop' | 'hedge' | 'blitz', defIntensity: number,
): Pos {
    const intensityFactor = defIntensity / 10;
    switch (coverage) {
        case 'drop':
            return addJitter({
                x: screenerPos.x + (basketX - screenerPos.x) * 0.65,
                y: screenerPos.y + (HOOP_Y_CENTER - screenerPos.y) * 0.5,
            }, 1.5);
        case 'hedge': {
            const midX = (screenerPos.x + handlerPos.x) / 2;
            const midY = (screenerPos.y + handlerPos.y) / 2;
            return addJitter({
                x: midX + (handlerPos.x - midX) * 0.3 * intensityFactor,
                y: midY + (handlerPos.y - midY) * 0.3 * intensityFactor,
            }, 1.0);
        }
        case 'blitz':
            return addJitter({
                x: handlerPos.x + (basketX - handlerPos.x) * 0.08,
                y: handlerPos.y + (HOOP_Y_CENTER - handlerPos.y) * 0.1,
            }, 0.8);
    }
}

/**
 * Weak-side help defender sag toward paint.
 */
function applyHelpSag(defPos: Pos, ballY: number, basketX: number, sagFactor: number): Pos {
    if (sagFactor < 0.01) return defPos;
    const ballSide = ballY < HOOP_Y_CENTER ? 'top' : 'bottom';
    const defSide = defPos.y < HOOP_Y_CENTER ? 'top' : 'bottom';
    if (ballSide === defSide) return defPos; // strong-side: stay with man

    return {
        x: defPos.x + (basketX - defPos.x) * sagFactor * 0.3,
        y: defPos.y + (HOOP_Y_CENTER - defPos.y) * sagFactor,
    };
}

// ─────────────────────────────────────────────────────────────
// Main Function
// ─────────────────────────────────────────────────────────────

export function computeCourtPositions(
    result: PossessionResult,
    homeTeamId: string
): CourtSnapshot {
    const { playType, zone, actor, defender, assister, offTeam, defTeam } = result;
    const isHomePossession = offTeam.id === homeTeamId;

    // 1. Get template
    const config = FORMATIONS[playType || 'Iso'];
    const zoneKey = zone || 'Mid';
    const overrides = config.zoneOverrides?.[zoneKey] || {};
    const formation: FormationTemplate = {
        ballHandler: overrides.ballHandler || config.base.ballHandler,
        screenPartner: overrides.screenPartner || config.base.screenPartner,
        spacers: overrides.spacers || config.base.spacers,
    };

    // 2. Assign offensive players to slots
    const actorId = actor.playerId;
    const secondaryId = assister?.playerId;
    const otherOff = offTeam.onCourt.filter(
        p => p.playerId !== actorId && p.playerId !== secondaryId
    );
    // Sort: guards get first spacer slots (perimeter), bigs last (interior)
    otherOff.sort((a, b) => (POS_ORDER[a.position] ?? 5) - (POS_ORDER[b.position] ?? 5));

    const positions: PlayerCourtPosition[] = [];
    const offPosMap = new Map<string, Pos>(); // playerId → display position (for defense matching)

    // Helper: convert halfcourt template pos to fullcourt display pos
    const toDisplay = (p: Pos): Pos => isHomePossession ? mirrorX(p) : p;

    // Ball handler
    const bhTemplate = addJitter(formation.ballHandler);
    const bhDisplay = toDisplay(bhTemplate);
    positions.push({ playerId: actorId, x: bhDisplay.x, y: bhDisplay.y, role: 'ballHandler', hasBall: true, position: actor.position, isHome: isHomePossession });
    offPosMap.set(actorId, bhDisplay);

    // Screen partner
    if (secondaryId) {
        const spTemplate = addJitter(formation.screenPartner);
        const spDisplay = toDisplay(spTemplate);
        positions.push({ playerId: secondaryId, x: spDisplay.x, y: spDisplay.y, role: 'screener', hasBall: false, position: assister!.position, isHome: isHomePossession });
        offPosMap.set(secondaryId, spDisplay);
    }

    // Spacers
    let slotIdx = 0;
    for (const p of otherOff) {
        // If no secondary actor, first "other" player takes screenPartner slot
        if (!secondaryId && slotIdx === 0) {
            const spTemplate = addJitter(formation.screenPartner);
            const spDisplay = toDisplay(spTemplate);
            positions.push({ playerId: p.playerId, x: spDisplay.x, y: spDisplay.y, role: 'spacer', hasBall: false, position: p.position, isHome: isHomePossession });
            offPosMap.set(p.playerId, spDisplay);
            slotIdx++;
            continue;
        }
        const spacerIdx = secondaryId ? slotIdx : slotIdx - 1;
        if (spacerIdx < formation.spacers.length) {
            const sTemplate = addJitter(formation.spacers[spacerIdx]);
            const sDisplay = toDisplay(sTemplate);
            positions.push({ playerId: p.playerId, x: sDisplay.x, y: sDisplay.y, role: 'spacer', hasBall: false, position: p.position, isHome: isHomePossession });
            offPosMap.set(p.playerId, sDisplay);
        }
        slotIdx++;
    }

    // 3. Defense positions
    const basketX = isHomePossession ? HOOP_X_LEFT : COURT_WIDTH - HOOP_X_LEFT;
    const defSliders = defTeam.tactics.sliders;
    const isZone = result.isZone ?? false;

    // Ball handler halfcourt position (before toDisplay) for ball-tracking
    const bhHalfcourt = formation.ballHandler;
    const ballDisplayPos = offPosMap.get(actorId)!;

    // Slider-derived parameters
    const defIntensity = defSliders.defIntensity;
    const helpDef = defSliders.helpDef;
    const onBallOffset = 4.5 - (defIntensity - 1) * (3.0 / 9);    // 4.5ft(loose) ~ 1.5ft(tight)
    const helpBaseOffset = 6.0 - (defIntensity - 1) * (3.5 / 9);   // 6.0ft ~ 2.5ft
    const helpSagFactor = (helpDef - 1) / 9 * 0.4;                 // 0% ~ 40%

    const assignedDefIds = new Set<string>();

    if (isZone) {
        // ══════════════════════════════════════════
        // ZONE DEFENSE (2-3 Zone with ball-tracking)
        // ══════════════════════════════════════════
        const ballSideTop = bhHalfcourt.y < HOOP_Y_CENTER;

        // Assign defenders to zone slots by position
        const guards: LivePlayer[] = [];
        const forwards: LivePlayer[] = [];
        const centers: LivePlayer[] = [];
        for (const p of defTeam.onCourt) {
            if (p.position === 'PG' || p.position === 'SG') guards.push(p);
            else if (p.position === 'SF' || p.position === 'PF') forwards.push(p);
            else centers.push(p);
        }

        const zoneAssignment: (LivePlayer | null)[] = [
            guards[0] || null, guards[1] || null,
            forwards[0] || null, forwards[1] || null,
            centers[0] || null,
        ];

        // Fill empty slots with unassigned players
        const assigned = new Set(zoneAssignment.filter(Boolean).map(p => p!.playerId));
        const unassigned = defTeam.onCourt.filter(p => !assigned.has(p.playerId));
        let uIdx = 0;
        for (let i = 0; i < 5; i++) {
            if (!zoneAssignment[i] && uIdx < unassigned.length) {
                zoneAssignment[i] = unassigned[uIdx++];
            }
        }

        const shiftScale = 0.5 + (helpDef / 10) * 0.5;           // 0.55 ~ 1.0
        const intensityPush = (defIntensity - 5) * 0.3;            // -1.2 ~ +1.5

        for (let i = 0; i < 5; i++) {
            const player = zoneAssignment[i];
            if (!player) continue;

            const slot = ZONE_23[i];
            const slotIsTopSide = slot.base.y < HOOP_Y_CENTER;
            const isBallSide = slotIsTopSide === ballSideTop;
            const shift = isBallSide ? slot.strongShift : slot.weakShift;

            const zonePos = addJitter({
                x: slot.base.x + shift.x * shiftScale + intensityPush,
                y: slot.base.y + shift.y * shiftScale,
            }, 1.5);

            const displayPos = toDisplay(zonePos);
            assignedDefIds.add(player.playerId);
            positions.push({
                playerId: player.playerId, x: displayPos.x, y: displayPos.y,
                role: 'zoneDef', hasBall: false, position: player.position, isHome: !isHomePossession,
            });
        }
    } else {
        // ══════════════════════════════════════════
        // MAN-TO-MAN DEFENSE (intensity/helpDef/pnrCoverage)
        // ══════════════════════════════════════════
        const isPnrPlay = result.playType === 'PnR_Handler'
            || result.playType === 'PnR_Roll'
            || result.playType === 'PnR_Pop';
        const pnrCoverage = result.pnrCoverage;

        // A. On-ball defender
        if (defender) {
            const actorPos = offPosMap.get(actorId)!;
            const defPos = computeDefPos(actorPos, basketX, onBallOffset);
            positions.push({ playerId: defender.playerId, x: defPos.x, y: defPos.y, role: 'onBallDef', hasBall: false, position: defender.position, isHome: !isHomePossession });
            assignedDefIds.add(defender.playerId);
        }

        // B. PnR screener's defender (special coverage positioning)
        if (isPnrPlay && pnrCoverage && secondaryId) {
            const screenerPos = offPosMap.get(secondaryId);
            const handlerPos = offPosMap.get(actorId);
            if (screenerPos && handlerPos) {
                const assisterPlayer = offTeam.onCourt.find(p => p.playerId === secondaryId);
                const screenerDef = defTeam.onCourt.find(d =>
                    !assignedDefIds.has(d.playerId) && d.position === assisterPlayer?.position
                ) || defTeam.onCourt.find(d => !assignedDefIds.has(d.playerId));

                if (screenerDef) {
                    assignedDefIds.add(screenerDef.playerId);
                    const pnrPos = computePnrDefPos(screenerPos, handlerPos, basketX, pnrCoverage, defIntensity);
                    positions.push({ playerId: screenerDef.playerId, x: pnrPos.x, y: pnrPos.y, role: 'helpDef', hasBall: false, position: screenerDef.position, isHome: !isHomePossession });
                }
            }
        }

        // C. Remaining help defenders (with weak-side sag)
        const offPlayersExActor = offTeam.onCourt.filter(p => p.playerId !== actorId);
        for (const offP of offPlayersExActor) {
            const matchedDef = defTeam.onCourt.find(d =>
                !assignedDefIds.has(d.playerId) && d.position === offP.position
            ) || defTeam.onCourt.find(d => !assignedDefIds.has(d.playerId));

            if (matchedDef) {
                assignedDefIds.add(matchedDef.playerId);
                const offDisplay = offPosMap.get(offP.playerId);
                if (offDisplay) {
                    let defPos = computeDefPos(offDisplay, basketX, helpBaseOffset);
                    defPos = applyHelpSag(defPos, ballDisplayPos.y, basketX, helpSagFactor);
                    positions.push({ playerId: matchedDef.playerId, x: defPos.x, y: defPos.y, role: 'helpDef', hasBall: false, position: matchedDef.position, isHome: !isHomePossession });
                }
            }
        }
    }

    // Fallback: any unassigned defenders
    for (const d of defTeam.onCourt) {
        if (!assignedDefIds.has(d.playerId)) {
            assignedDefIds.add(d.playerId);
            const fallbackPos = toDisplay(addJitter({ x: 25, y: 25 }));
            positions.push({ playerId: d.playerId, x: fallbackPos.x, y: fallbackPos.y, role: 'helpDef', hasBall: false, position: d.position, isHome: !isHomePossession });
        }
    }

    return {
        offTeamId: offTeam.id,
        playType,
        zone: zoneKey,
        positions,
    };
}
