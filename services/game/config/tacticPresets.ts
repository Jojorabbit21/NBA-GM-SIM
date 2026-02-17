
import { TacticalSliders, OffenseTactic, DefenseTactic } from '../../../types';

export const DEFAULT_SLIDERS: TacticalSliders = {
    pace: 5, ballMovement: 5, offReb: 5,
    play_pnr: 5, play_post: 5, play_iso: 5, play_cns: 5, play_drive: 5,
    shot_3pt: 5, shot_mid: 5, shot_rim: 5, shot_pullup: 5,
    defIntensity: 5, helpDef: 5, switchFreq: 5, defReb: 5, zoneFreq: 1,
    fullCourtPress: 1, zoneUsage: 1
};

export const OFFENSE_PRESETS: Record<OffenseTactic, Partial<TacticalSliders>> = {
    'Balance': {
        pace: 5, ballMovement: 5, offReb: 5,
        play_pnr: 5, play_post: 5, play_iso: 5, play_cns: 5, play_drive: 5,
        shot_3pt: 5, shot_mid: 5, shot_rim: 5, shot_pullup: 5
    },
    'PaceAndSpace': {
        pace: 8, ballMovement: 8, offReb: 3,
        play_pnr: 7, play_post: 2, play_iso: 4, play_cns: 9, play_drive: 6,
        shot_3pt: 10, shot_mid: 2, shot_rim: 6, shot_pullup: 3
    },
    'PerimeterFocus': {
        pace: 4, ballMovement: 6, offReb: 4,
        play_pnr: 8, play_post: 3, play_iso: 7, play_cns: 6, play_drive: 4,
        shot_3pt: 8, shot_mid: 7, shot_rim: 4, shot_pullup: 8
    },
    'PostFocus': {
        pace: 3, ballMovement: 4, offReb: 9,
        play_pnr: 4, play_post: 10, play_iso: 3, play_cns: 4, play_drive: 5,
        shot_3pt: 3, shot_mid: 6, shot_rim: 9, shot_pullup: 2
    },
    'Grind': {
        pace: 1, ballMovement: 3, offReb: 8,
        play_pnr: 6, play_post: 7, play_iso: 6, play_cns: 3, play_drive: 4,
        shot_3pt: 2, shot_mid: 5, shot_rim: 7, shot_pullup: 4
    },
    'SevenSeconds': {
        pace: 10, ballMovement: 4, offReb: 2,
        play_pnr: 6, play_post: 1, play_iso: 4, play_cns: 8, play_drive: 9,
        shot_3pt: 8, shot_mid: 1, shot_rim: 9, shot_pullup: 6
    },
    'Custom': {}
};

export const DEFENSE_PRESETS: Record<DefenseTactic, Partial<TacticalSliders>> = {
    'ManToManPerimeter': {
        defIntensity: 5, helpDef: 5, switchFreq: 4, defReb: 6, zoneFreq: 1, zoneUsage: 1, fullCourtPress: 1
    },
    'ZoneDefense': {
        defIntensity: 3, helpDef: 8, switchFreq: 1, defReb: 8, zoneFreq: 10, zoneUsage: 10, fullCourtPress: 1
    },
    'AceStopper': {
        defIntensity: 8, helpDef: 3, switchFreq: 2, defReb: 5, zoneFreq: 1, zoneUsage: 1, fullCourtPress: 2
    },
    'Custom': {}
};

export function getSlidersFromPresets(off: OffenseTactic, def: DefenseTactic): TacticalSliders {
    const offValues = OFFENSE_PRESETS[off] || {};
    const defValues = DEFENSE_PRESETS[def] || {};
    
    return {
        ...DEFAULT_SLIDERS,
        ...offValues,
        ...defValues
    };
}
