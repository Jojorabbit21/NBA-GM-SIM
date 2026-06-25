
import { LivePlayer, TeamState } from '../pbpTypes.ts';
import { resolveDynamicZone } from '../../shotDistribution.ts';

export function updateZoneStats(p: LivePlayer, zone: 'Rim' | 'Paint' | 'Mid' | '3PT', isMake: boolean, preResolvedSubZone?: string) {
    const subZoneKey = preResolvedSubZone || resolveDynamicZone(p, zone);
    const attemptKey = `${subZoneKey}_a` as keyof LivePlayer;
    if (typeof p[attemptKey] === 'number') (p as any)[attemptKey]++;
    if (isMake) {
        const makeKey = `${subZoneKey}_m` as keyof LivePlayer;
        if (typeof p[makeKey] === 'number') (p as any)[makeKey]++;
    }
}

export function updatePlusMinus(offTeam: TeamState, defTeam: TeamState, scoreDelta: number) {
    if (scoreDelta === 0) return;
    offTeam.onCourt.forEach(p => p.plusMinus += scoreDelta);
    defTeam.onCourt.forEach(p => p.plusMinus -= scoreDelta);
}
