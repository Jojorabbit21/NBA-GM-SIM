
import { Player, PlayerStats } from '../../../types';

export interface OpponentDefensiveMetrics {
    intDef: number;
    perDef: number;
    block: number;
    pressure: number;
    helpDef: number;
}

export interface PerfModifiers {
    effectivePerfDrop: number; // 0.0 ~ 1.0 (Higher is worse)
    homeAdvantage: number;
    hastePenalty: number;
    mentalClutchBonus: number;
}

export interface ShootingResult {
    pts: number;
    fgm: number;
    fga: number;
    p3m: number;
    p3a: number;
    ftm: number;
    fta: number;
    rimM: number;
    rimA: number;
    midM: number;
    midA: number;
    matchupEffect: number;
    isAceTarget: boolean;
    zoneData?: Partial<PlayerStats>;
}

export interface DefenseResult {
    reb: number;
    offReb: number;
    defReb: number;
    stl: number;
    blk: number;
}

export interface PlaymakingResult {
    ast: number;
    tov: number;
}

export interface FatigueResult {
    newCondition: number;
    newHealth: 'Healthy' | 'Injured' | 'Day-to-Day';
    injuryType?: string;
    returnDate?: string;
    fatiguePerfPenalty: number; // Penalty based on pre-game condition
    inGameFatiguePenalty: number; // Penalty based on minutes played
}
