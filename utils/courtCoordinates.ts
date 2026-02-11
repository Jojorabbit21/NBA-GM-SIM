
// NBA Court Dimensions (in feet)
export const COURT_WIDTH = 94;
export const COURT_HEIGHT = 50;
export const HOOP_X_LEFT = 5.25; // 4ft from baseline + 15 inches to center
export const HOOP_Y_CENTER = 25;
export const RIM_RADIUS = 0.75; // Hoop radius
export const THREE_POINT_RADIUS = 23.75; // 23' 9"
export const CORNER_THREE_DIST = 22; // Distance from center Y to sideline breakout
export const PAINT_WIDTH = 16;
export const PAINT_LENGTH = 19;
export const RESTRICTED_AREA_RADIUS = 4;

export type ShotZone = 'Rim' | 'Paint' | 'Mid' | '3PT';
export type CourtSide = 'Left' | 'Right';

interface Point {
    x: number;
    y: number;
}

/**
 * Generates a biased random number close to 0.
 * Used to simulate players shooting close to the line.
 * @param maxOffset Maximum distance from the line (e.g., 5 feet for deep 3)
 * @param bias Strength of the pull towards 0 (higher = closer to line). 2~3 is realistic.
 */
function getBiasedOffset(maxOffset: number, bias: number = 3): number {
    const rand = Math.random();
    // Use power function to skew distribution towards 0
    // x^3 curve: 0.1->0.001, 0.9->0.72.
    // We want the opposite: low input -> low output, but densely.
    // Actually, we want heavy density at 0. So we take random^bias.
    // If random is 0.5, 0.5^3 = 0.125. This means 50% of shots are in the first 12.5% of range.
    return Math.pow(rand, bias) * maxOffset;
}

/**
 * Checks if a point is within the court boundaries
 */
function isValidPoint(x: number, y: number): boolean {
    return x >= 0 && x <= COURT_WIDTH / 2 && y >= 0 && y <= COURT_HEIGHT; // Check half court only
}

/**
 * Generates a realistic shot coordinate based on the zone.
 * Coordinates are generated for the LEFT basket (0-47ft) by default.
 */
export function generateShotCoordinate(zone: ShotZone, side: CourtSide = 'Left'): Point {
    let x = 0;
    let y = 0;
    let valid = false;
    let attempts = 0;

    // Safety break to prevent infinite loops
    while (!valid && attempts < 20) {
        attempts++;
        
        switch (zone) {
            case 'Rim':
                // Restricted Area (0-4ft)
                // High density very close to hoop
                const rRim = Math.random() * RESTRICTED_AREA_RADIUS;
                const thetaRim = Math.random() * 2 * Math.PI;
                x = HOOP_X_LEFT + rRim * Math.cos(thetaRim);
                y = HOOP_Y_CENTER + rRim * Math.sin(thetaRim);
                // Clamp to keep it somewhat in front or slight behind, not too far back
                if (x < 3) x = 3; 
                break;

            case 'Paint':
                // Paint area excluding Restricted Area
                // Box: x [0, 19], y [25-8, 25+8]
                x = Math.random() * PAINT_LENGTH;
                y = (HOOP_Y_CENTER - PAINT_WIDTH/2) + Math.random() * PAINT_WIDTH;
                
                // Exclude Restricted Area (Simple box check approximation for performance)
                const distToHoop = Math.sqrt(Math.pow(x - HOOP_X_LEFT, 2) + Math.pow(y - HOOP_Y_CENTER, 2));
                if (distToHoop < RESTRICTED_AREA_RADIUS) {
                    continue; // Retry
                }
                break;

            case 'Mid':
                // Between Paint and 3PT Line
                // Generate polar coordinate and clamp radius
                // Angle: -90 to 90 degrees (facing the basket)
                const thetaMid = (Math.random() * Math.PI) - (Math.PI / 2);
                
                // Min radius: Paint edge (~10ft), Max radius: 3PT line (~23ft)
                // Bias slightly towards the perimeter (long 2s) or paint (short 2s)? Random is fine.
                const rMid = 6 + Math.random() * (THREE_POINT_RADIUS - 7); 
                
                x = HOOP_X_LEFT + rMid * Math.cos(thetaMid);
                y = HOOP_Y_CENTER + rMid * Math.sin(thetaMid);
                
                // If inside paint box, retry (strictly mid-range)
                if (x < PAINT_LENGTH && Math.abs(y - HOOP_Y_CENTER) < PAINT_WIDTH/2) {
                    continue;
                }
                // If outside 3pt line, retry (simplified check, real check is complex)
                // Simple check: if distance > 22, might be 3pt.
                if (Math.sqrt(Math.pow(x - HOOP_X_LEFT, 2) + Math.pow(y - HOOP_Y_CENTER, 2)) > 23) {
                     continue;
                }
                break;

            case '3PT':
                // Complex 3PT Geometry
                // Determine sector: Corner (Left/Right) or Arc
                const sectorRoll = Math.random();
                
                if (sectorRoll < 0.15) {
                    // Left Corner 3
                    // x: 0 to 14, y: > 47 (approx 3ft from side)
                    // Realistically, y is between 47 and 50 (boundary).
                    // Shot location: y approx 47.5 to 49.
                    y = COURT_HEIGHT - (1.5 + Math.random() * 2); // 1.5 to 3.5 ft from edge
                    x = Math.random() * 14; 
                } else if (sectorRoll < 0.30) {
                     // Right Corner 3 (which is bottom in our 0-50 Y coord system)
                     // y: < 3
                     y = 1.5 + Math.random() * 2;
                     x = Math.random() * 14;
                } else {
                    // The Arc
                    // Angle: -70 to 70 degrees roughly (excluding corners)
                    const angleLimit = 1.2; // radians, approx 68 degrees
                    const theta3 = (Math.random() * 2 * angleLimit) - angleLimit;
                    
                    // Distance: 23.75 + Bias
                    // Most shots are within 2 feet of the line. Some are deep (up to 30ft).
                    const deepBias = getBiasedOffset(6, 4); // Max 6ft deep, bias power 4 (very close to line)
                    const r3 = THREE_POINT_RADIUS + 0.5 + deepBias; // Start 0.5ft behind line
                    
                    x = HOOP_X_LEFT + r3 * Math.cos(theta3);
                    y = HOOP_Y_CENTER + r3 * Math.sin(theta3);
                }
                break;
        }

        // Validate bounds
        if (isValidPoint(x, y)) {
            valid = true;
        }
    }

    // Mirror if Right Side
    if (side === 'Right') {
        x = COURT_WIDTH - x;
        // Y remains same as 0 is top, 50 is bottom
    }

    return { x, y };
}

/**
 * Helper to determine zone based on distance (for stats consistency)
 */
export function categorizeZone(dist: number): ShotZone {
    if (dist < 4) return 'Rim';
    if (dist < 16) return 'Paint'; // Rough approximation
    if (dist < 23) return 'Mid';
    return '3PT';
}
