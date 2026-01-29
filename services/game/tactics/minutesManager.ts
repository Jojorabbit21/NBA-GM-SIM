
import { Player, TacticalSliders } from '../../../types';

// ==========================================================================================
//  MINUTES MANAGER
//  Handles deterministic sorting and minute distribution logic.
// ==========================================================================================

// Stable Sort Helper: OVR desc, then ID asc (to ensure deterministic results)
export const stableSort = (a: Player, b: Player) => b.ovr - a.ovr || a.id.localeCompare(b.id);

export function distributeMinutes(roster: Player[], isStarter: boolean[], limits: Record<string, number>, sliders: TacticalSliders): number[] {
    const totalMinutes = 240;
    const minutes = roster.map(() => 0);
    let used = 0;
    
    roster.forEach((p, i) => {
        // [Fix] Respect explicit 0 limit (bench)
        if (limits[p.id] !== undefined) {
            minutes[i] = limits[p.id];
        } else if (isStarter[i]) {
            minutes[i] = 32;
        } else if (i < 10) {
            minutes[i] = 16;
        } else {
            minutes[i] = 0;
        }
        used += minutes[i];
    });
    
    if (used > 0) {
        const factor = 240 / used;
        for (let i = 0; i < minutes.length; i++) {
            minutes[i] = Math.round(minutes[i] * factor);
        }
    }
    
    let currentSum = minutes.reduce((a, b) => a + b, 0);
    let diff = 240 - currentSum;

    if (diff !== 0) {
       const sortedIndices = minutes.map((m, i) => ({m, i})).sort((a, b) => b.m - a.m).map(x => x.i);
       
       if (diff > 0) {
          let i = 0;
          while (diff > 0) {
             const idx = sortedIndices[i % sortedIndices.length];
             if (minutes[idx] < 48) { minutes[idx]++; diff--; }
             i++; if (i > 200) break; 
          }
       } else {
          let i = 0;
          while (diff < 0) {
             const idx = sortedIndices[i % sortedIndices.length];
             if (minutes[idx] > 0) { minutes[idx]--; diff++; }
             i++; if (i > 200) break;
          }
       }
    }
    
    return minutes;
}
