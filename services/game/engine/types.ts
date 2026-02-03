
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
    // Stat events calculated immediately
    stl: number;
    blk: number;
    
    // Weighted potentials for post-simulation distribution
    defRebWeight: number; // 수비 리바운드 장악력
    offRebWeight: number; // 공격 리바운드 장악력
}

export interface PlaymakingResult {
    tov: number;
    
    // Weighted potential for post-simulation distribution
    assistWeight: number; // 어시스트 창출력 (패스 능력 * 볼 소유)
}

export interface FatigueResult {
    newCondition: number;
    newHealth: 'Healthy' | 'Injured' | 'Day-to-Day';
    injuryType?: string;
    returnDate?: string;
    fatiguePerfPenalty: number; // Penalty based on pre-game condition
    inGameFatiguePenalty: number; // Penalty based on minutes played
}

// Intermediate type for holding simulation data before final aggregation
export interface PlayerSimContext {
    playerId: string;
    stats: ShootingResult & DefenseResult & PlaymakingResult & { 
        mp: number; 
        gs: number; 
        pf: number;
        isStopper: boolean;
        
        // Added missing properties needed for box score and distribution logic
        playerName: string;
        reb: number;
        offReb: number;
        defReb: number;
        ast: number;
        passIq: number;
    };
    updates: any;
}
