
import { LivePlayer, TeamState } from '../pbpTypes';
import { resolveDynamicZone } from '../../shotDistribution';

/**
 * Updates detailed shooting zone stats for a player.
 */
export function updateZoneStats(p: LivePlayer, zone: 'Rim' | 'Paint' | 'Mid' | '3PT', isMake: boolean) {
    if (zone === 'Rim' || zone === 'Paint') {
        p.rimA++;
        if (isMake) p.rimM++;
    } else if (zone === 'Mid') {
        p.midA++;
        if (isMake) p.midM++;
    }
    const subZoneKey = resolveDynamicZone(p, zone);
    const attemptKey = `${subZoneKey}_a` as keyof LivePlayer;
    if (typeof p[attemptKey] === 'number') (p as any)[attemptKey]++;
    if (isMake) {
        const makeKey = `${subZoneKey}_m` as keyof LivePlayer;
        if (typeof p[makeKey] === 'number') (p as any)[makeKey]++;
    }
}

/**
 * Updates +/- for all players on court.
 */
export function updatePlusMinus(offTeam: TeamState, defTeam: TeamState, scoreDelta: number) {
    if (scoreDelta === 0) return;
    offTeam.onCourt.forEach(p => p.plusMinus += scoreDelta);
    defTeam.onCourt.forEach(p => p.plusMinus -= scoreDelta);
}
