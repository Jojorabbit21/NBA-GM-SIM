
import { Player, DefenseTactic, OffenseTactic, TacticalSliders } from '../../../types';

export const FOUL_CONFIG = {
    BASE_FOUL_RATE: 4.2, 
    PROPENSITY_SCALE: 12, 
    FOUL_LIMIT: 6
};

/**
 * Calculates foul propensity for a player based on stats and tactics
 */
export function calculateFoulStats(
    defender: Player,
    minutesPlanned: number,
    defTactics: { defenseTactics: DefenseTactic[] },
    oppOffTactics: { offenseTactics: OffenseTactic[] },
    sliders: TacticalSliders
): { pf: number, isEjected: boolean } {
    if (minutesPlanned <= 0) return { pf: 0, isEjected: false };

    // Discipline Rating (높을수록 파울을 안함)
    const disciplineRating = (defender.defConsist * 0.5 + defender.hustle * 0.3 + defender.stamina * 0.2);
    
    // 파울 기대값 계산
    let foulPropensity = (FOUL_CONFIG.BASE_FOUL_RATE + ((100 - disciplineRating) / FOUL_CONFIG.PROPENSITY_SCALE));
    
    // 수비 강도 슬라이더 반영
    if (sliders.defIntensity > 5) {
        foulPropensity *= (1.0 + (sliders.defIntensity - 5) * 0.2);
    }

    const expectedFouls = foulPropensity * (minutesPlanned / 36);
    const pf = Math.floor(expectedFouls + (Math.random() * 0.8));

    return { 
        pf, 
        isEjected: pf >= FOUL_CONFIG.FOUL_LIMIT 
    };
}
