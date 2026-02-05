
import { Player, PlayerBoxScore, GameTactics, PbpLog, RotationData, DepthChart } from '../../../../types';
import { ArchetypeRatings } from './archetypeSystem';

export interface LivePlayer extends PlayerBoxScore {
    // Current runtime attributes
    currentCondition: number;
    position: string;
    ovr: number;
    isStarter: boolean; 
    health: 'Healthy' | 'Injured' | 'Day-to-Day'; 
    
    // [New] Rotation Stability & Fatigue Tracking
    lastSubInTime: number; // Game clock seconds when they entered (720 -> 0)
    conditionAtSubIn: number; // Condition when they last entered the court (for Delta calc)
    
    // [New] Safety Nets
    isShutdown: boolean; // True if hit < 20% (Cannot return)
    needsDeepRecovery: boolean; // True if hit < 30% (Cannot return until > 65%)

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
    type: 'score' | 'miss' | 'turnover' | 'foul' | 'block' | 'freethrow';
    points?: 1 | 2 | 3;
    attempts?: number; 
    player?: LivePlayer; // Main actor
    secondaryPlayer?: LivePlayer; // Assister, Fouler, Blocker
    rebounder?: LivePlayer;
    timeTaken: number;
    logText: string;
    nextPossession: 'home' | 'away' | 'keep' | 'free_throw'; 
    isDeadBall?: boolean;
    playType?: string; // Developer Log Info (added)
}
