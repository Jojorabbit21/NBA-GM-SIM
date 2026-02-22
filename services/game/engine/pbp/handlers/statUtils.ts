
import { LivePlayer, TeamState } from '../pbpTypes';
import { resolveDynamicZone } from '../../shotDistribution';

/**
 * Updates detailed shooting zone stats for a player.
 */
export function updateZoneStats(p: LivePlayer, zone: 'Rim' | 'Paint' | 'Mid' | '3PT', isMake: boolean) {
    // rimA/rimM/midA/midM 집계 제거 → 10존(zone_*) 데이터로 대체됨
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
