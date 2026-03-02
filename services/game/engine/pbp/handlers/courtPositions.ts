
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
};

// Position order for spacer slot assignment (guards → perimeter, bigs → interior)
const POS_ORDER: Record<string, number> = { PG: 0, SG: 1, SF: 2, PF: 3, C: 4 };

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
    positions.push({ playerId: actorId, x: bhDisplay.x, y: bhDisplay.y, role: 'ballHandler', hasBall: true });
    offPosMap.set(actorId, bhDisplay);

    // Screen partner
    if (secondaryId) {
        const spTemplate = addJitter(formation.screenPartner);
        const spDisplay = toDisplay(spTemplate);
        positions.push({ playerId: secondaryId, x: spDisplay.x, y: spDisplay.y, role: 'screener', hasBall: false });
        offPosMap.set(secondaryId, spDisplay);
    }

    // Spacers
    let slotIdx = 0;
    for (const p of otherOff) {
        // If no secondary actor, first "other" player takes screenPartner slot
        if (!secondaryId && slotIdx === 0) {
            const spTemplate = addJitter(formation.screenPartner);
            const spDisplay = toDisplay(spTemplate);
            positions.push({ playerId: p.playerId, x: spDisplay.x, y: spDisplay.y, role: 'spacer', hasBall: false });
            offPosMap.set(p.playerId, spDisplay);
            slotIdx++;
            continue;
        }
        const spacerIdx = secondaryId ? slotIdx : slotIdx - 1;
        if (spacerIdx < formation.spacers.length) {
            const sTemplate = addJitter(formation.spacers[spacerIdx]);
            const sDisplay = toDisplay(sTemplate);
            positions.push({ playerId: p.playerId, x: sDisplay.x, y: sDisplay.y, role: 'spacer', hasBall: false });
            offPosMap.set(p.playerId, sDisplay);
        }
        slotIdx++;
    }

    // 3. Defense positions
    // Basket the defense is protecting
    const basketX = isHomePossession ? HOOP_X_LEFT : COURT_WIDTH - HOOP_X_LEFT;

    // On-ball defender → shadows actor
    const assignedDefIds = new Set<string>();
    if (defender) {
        const actorPos = offPosMap.get(actorId)!;
        const defPos = computeDefPos(actorPos, basketX, 2.5);
        positions.push({ playerId: defender.playerId, x: defPos.x, y: defPos.y, role: 'onBallDef', hasBall: false });
        assignedDefIds.add(defender.playerId);
    }

    // Help defenders → match by position string, fallback by index
    const offPlayersExActor = offTeam.onCourt.filter(p => p.playerId !== actorId);
    for (const offP of offPlayersExActor) {
        const matchedDef = defTeam.onCourt.find(d =>
            !assignedDefIds.has(d.playerId) && d.position === offP.position
        ) || defTeam.onCourt.find(d => !assignedDefIds.has(d.playerId));

        if (matchedDef) {
            assignedDefIds.add(matchedDef.playerId);
            const offDisplay = offPosMap.get(offP.playerId);
            if (offDisplay) {
                const defPos = computeDefPos(offDisplay, basketX, 3.5);
                positions.push({ playerId: matchedDef.playerId, x: defPos.x, y: defPos.y, role: 'helpDef', hasBall: false });
            }
        }
    }

    // Fallback: any unassigned defenders (shouldn't happen with 5v5)
    for (const d of defTeam.onCourt) {
        if (!assignedDefIds.has(d.playerId)) {
            assignedDefIds.add(d.playerId);
            const fallbackPos = toDisplay(addJitter({ x: 25, y: 25 }));
            positions.push({ playerId: d.playerId, x: fallbackPos.x, y: fallbackPos.y, role: 'helpDef', hasBall: false });
        }
    }

    return {
        offTeamId: offTeam.id,
        playType,
        zone: zoneKey,
        positions,
    };
}
