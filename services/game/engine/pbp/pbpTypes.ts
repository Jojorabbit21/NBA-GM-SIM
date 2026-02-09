
import { Player, PlayerBoxScore, GameTactics, PbpLog, RotationData, DepthChart, PlayType } from '../../../../types';
import { ArchetypeRatings } from './archetypeSystem';

export interface LivePlayer extends PlayerBoxScore {
    // Current runtime attributes
    currentCondition: number;
    startCondition: number; // [New] To calculate fatigue used
    position: string;
    ovr: number;
    isStarter: boolean; 
    health: 'Healthy' | 'Injured' | 'Day-to-Day'; 
    injuryType?: string; // [Added] For runtime injury tracking
    returnDate?: string; // [Added] For runtime injury tracking
    
    // [New] Rotation Stability & Fatigue Tracking
    lastSubInTime: number; // Game clock seconds when they entered (720 -> 0)
    conditionAtSubIn: number; // Condition when they last entered the court (for Delta calc)
    
    // [New] Fatigue Flags for Substitution System
    isShutdown?: boolean;
    // needsDeepRecovery removed

    // Dynamic Role Ratings (0-100+) - Recalculated on substitutions
    archetypes: ArchetypeRatings;

    // Attributes needed for simulation (Expanded for precise archetype calc)
    attr: {
        // General
        ins: number; out: number; mid: number; 
        ft: number; threeVal: number; // Derived 3pt average
        
        // Physical
        speed: number; agility: number; strength: number; vertical: number;
        stamina: number; durability: number; hustle: number;
        height: number; weight: number;

        // Skill
        handling: number; hands: number;
        pas: number; passAcc: number; passVision: number; passIq: number;
        shotIq: number; offConsist: number;
        postPlay: number;
        
        // Defense
        def: number; intDef: number; perDef: number;
        blk: number; stl: number; 
        helpDefIq: number; defConsist: number;
        drFoul: number; foulTendency: number;

        // Rebound
        reb: number;
    }
    
    // [New] Runtime Zone Tracking (Flat structure for easy increment)
    // These need to be initialized in main.ts
    zone_rim_m: number; zone_rim_a: number;
    zone_paint_m: number; zone_paint_a: number;
    zone_mid_l_m: number; zone_mid_l_a: number;
    zone_mid_c_m: number; zone_mid_c_a: number;
    zone_mid_r_m: number; zone_mid_r_a: number;
    zone_c3_l_m: number; zone_c3_l_a: number;
    zone_c3_r_m: number; zone_c3_r_a: number;
    zone_atb3_l_m: number; zone_atb3_l_a: number;
    zone_atb3_c_m: number; zone_atb3_c_a: number;
    zone_atb3_r_m: number; zone_atb3_r_a: number;
}

export interface TeamState {
    id: string;
    name: string;
    score: number;
    tactics: GameTactics;
    depthChart?: DepthChart; // [New] Added Depth Chart info
    onCourt: LivePlayer[]; // Always 5 players
    bench: LivePlayer[];
    timeouts: number;
    fouls: number; // Team fouls in quarter
    bonus: boolean; // Penalty situation
}

export interface GameState {
    home: TeamState;
    away: TeamState;
    
    quarter: number; 
    gameClock: number; 
    shotClock: number; 
    
    possession: 'home' | 'away';
    isDeadBall: boolean;
    
    logs: PbpLog[];
    
    // Config
    isHomeB2B: boolean;
    isAwayB2B: boolean;

    // [New] Rotation Tracking
    rotationHistory: RotationData;
}

export interface PossessionResult {
    type: 'score' | 'miss' | 'turnover' | 'foul' | 'freethrow' | 'rebound'; // 'block' is part of miss
    
    // Actors
    offTeam: TeamState;
    defTeam: TeamState;
    actor: LivePlayer; // The one who shot, turned it over, or got fouled
    defender?: LivePlayer; // The primary defender (or stealer/blocker)
    assister?: LivePlayer; // If scored
    rebounder?: LivePlayer; // If missed

    // Details
    playType?: PlayType;
    zone?: 'Rim' | 'Paint' | 'Mid' | '3PT';
    points: 0 | 1 | 2 | 3;
    isAndOne: boolean;
    
    // Stats for logs
    shotType?: string; // "Jump Shot", "Dunk", "Layup"
    isBlock?: boolean;
    isSteal?: boolean;
}
