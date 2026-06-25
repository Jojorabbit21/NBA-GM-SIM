
// Court Dimensions (in feet)
export const COURT_WIDTH = 94;
export const COURT_HEIGHT = 50;
export const HOOP_X_LEFT = 5.25;
export const HOOP_Y_CENTER = 25;
export const RIM_RADIUS = 0.75;
export const THREE_POINT_RADIUS = 23.75;
export const CORNER_THREE_DIST = 22;
export const PAINT_WIDTH = 16;
export const PAINT_LENGTH = 19;
export const RESTRICTED_AREA_RADIUS = 4;

export type ShotZone = 'Rim' | 'Paint' | 'Mid' | '3PT';
export type CourtSide = 'Left' | 'Right';

interface Point {
    x: number;
    y: number;
}

function getBiasedOffset(maxOffset: number, bias: number = 3): number {
    const rand = Math.random();
    return Math.pow(rand, bias) * maxOffset;
}

function isValidPoint(x: number, y: number): boolean {
    return x >= 0 && x <= COURT_WIDTH / 2 && y >= 0 && y <= COURT_HEIGHT;
}

export function generateShotCoordinate(zone: ShotZone, side: CourtSide = 'Left'): Point {
    let x = 0;
    let y = 0;
    let valid = false;
    let attempts = 0;

    while (!valid && attempts < 20) {
        attempts++;

        switch (zone) {
            case 'Rim': {
                const rRim = Math.random() * RESTRICTED_AREA_RADIUS;
                const thetaRim = Math.random() * 2 * Math.PI;
                x = HOOP_X_LEFT + rRim * Math.cos(thetaRim);
                y = HOOP_Y_CENTER + rRim * Math.sin(thetaRim);
                if (x < 3) x = 3;
                break;
            }
            case 'Paint': {
                x = Math.random() * PAINT_LENGTH;
                y = (HOOP_Y_CENTER - PAINT_WIDTH/2) + Math.random() * PAINT_WIDTH;
                const distToHoop = Math.sqrt(Math.pow(x - HOOP_X_LEFT, 2) + Math.pow(y - HOOP_Y_CENTER, 2));
                if (distToHoop < RESTRICTED_AREA_RADIUS) continue;
                break;
            }
            case 'Mid': {
                const thetaMid = (Math.random() * Math.PI) - (Math.PI / 2);
                const rMid = 6 + Math.random() * (THREE_POINT_RADIUS - 7);
                x = HOOP_X_LEFT + rMid * Math.cos(thetaMid);
                y = HOOP_Y_CENTER + rMid * Math.sin(thetaMid);
                if (x < PAINT_LENGTH && Math.abs(y - HOOP_Y_CENTER) < PAINT_WIDTH/2) continue;
                if (Math.sqrt(Math.pow(x - HOOP_X_LEFT, 2) + Math.pow(y - HOOP_Y_CENTER, 2)) > 23) continue;
                break;
            }
            case '3PT': {
                const sectorRoll = Math.random();
                if (sectorRoll < 0.15) {
                    y = COURT_HEIGHT - (1.5 + Math.random() * 2);
                    x = Math.random() * 14;
                } else if (sectorRoll < 0.30) {
                    y = 1.5 + Math.random() * 2;
                    x = Math.random() * 14;
                } else {
                    const angleLimit = 1.2;
                    const theta3 = (Math.random() * 2 * angleLimit) - angleLimit;
                    const deepBias = getBiasedOffset(6, 4);
                    const r3 = THREE_POINT_RADIUS + 0.5 + deepBias;
                    x = HOOP_X_LEFT + r3 * Math.cos(theta3);
                    y = HOOP_Y_CENTER + r3 * Math.sin(theta3);
                }
                break;
            }
        }

        if (isValidPoint(x, y)) {
            valid = true;
        }
    }

    if (side === 'Right') {
        x = COURT_WIDTH - x;
    }

    return { x, y };
}

export function categorizeZone(dist: number): ShotZone {
    if (dist < 4) return 'Rim';
    if (dist < 16) return 'Paint';
    if (dist < 23) return 'Mid';
    return '3PT';
}
