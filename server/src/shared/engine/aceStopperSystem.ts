
import { Player } from '../types.ts';

export type AceArchetype = 'Speedster' | 'Bully' | 'Shooter' | 'Balanced';

export function calculateAceStopperImpact(
    ace: Player,
    stopper: Player,
    stopperMinutesPlayed: number
): number {
    const { archetype, primaryStatVal } = identifyArchetype(ace);
    const physicalDelta = calculatePhysicalDelta(archetype, ace, stopper);

    const techValStopper = (stopper.perDef * 0.6) + (stopper.helpDefIq * 0.2) + (stopper.steal * 0.2);
    const techValAce = (ace.offConsist * 0.5) + (ace.shotIq * 0.3) + (ace.handling * 0.2);
    const techDelta = techValStopper - techValAce;

    let baseImpact = (physicalDelta * 0.6) + (techDelta * 0.4);

    if (baseImpact < 0) {
        const recoveryRoll = Math.random() * 100;
        if (recoveryRoll < stopper.hustle) {
            const recoveryBonus = (stopper.hustle - 50) * 0.3;
            baseImpact += recoveryBonus;
        }
    } else {
        baseImpact += (stopper.hustle - 50) * 0.1;
    }

    const fatiguePenalty = calculateFatiguePenalty(ace, stopper, stopperMinutesPlayed);
    let finalScore = baseImpact - fatiguePenalty;
    let matchupEffect = -(finalScore * 1.2);
    return Math.max(-50, Math.min(40, Math.round(matchupEffect)));
}

function identifyArchetype(p: Player): { archetype: AceArchetype, primaryStatVal: number } {
    const spdScore = (p.speed + p.agility) / 2;
    const strScore = p.strength;
    const shootScore = (p.vertical + p.agility) / 2;

    if (spdScore >= 90 && spdScore > strScore && spdScore > shootScore) {
        return { archetype: 'Speedster', primaryStatVal: spdScore };
    }
    if (strScore >= 85 && strScore > spdScore) {
        return { archetype: 'Bully', primaryStatVal: strScore };
    }
    if (shootScore > spdScore && shootScore > strScore) {
        return { archetype: 'Shooter', primaryStatVal: shootScore };
    }
    return { archetype: 'Balanced', primaryStatVal: (spdScore + strScore + shootScore) / 3 };
}

function calculatePhysicalDelta(type: AceArchetype, ace: Player, stopper: Player): number {
    switch (type) {
        case 'Speedster': {
            const aceSpd = (ace.speed + ace.agility) / 2;
            const stopSpd = (stopper.speed + stopper.agility) / 2;
            return stopSpd - aceSpd;
        }
        case 'Bully':
            return stopper.strength - ace.strength;
        case 'Shooter': {
            const aceIso = (ace.vertical + ace.agility) / 2;
            const stopContest = (stopper.vertical + stopper.agility) / 2;
            return stopContest - aceIso;
        }
        case 'Balanced':
        default: {
            const acePhy  = (ace.speed  + ace.agility  + ace.strength)  / 3;
            const stopPhy = (stopper.speed + stopper.agility + stopper.strength) / 3;
            return stopPhy - acePhy;
        }
    }
}

function calculateFatiguePenalty(ace: Player, stopper: Player, mp: number): number {
    const aceCond = ace.condition || 100;
    const stopCond = stopper.condition || 100;
    let delta = aceCond - stopCond;
    let minutesTax = 0;
    if (mp > 30) minutesTax = (mp - 30) * 0.5;

    if (delta > 0) {
        return (delta * 0.5) + minutesTax;
    } else {
        return Math.max(0, minutesTax);
    }
}
