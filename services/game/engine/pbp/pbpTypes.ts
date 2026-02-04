import { Player, PlayerBoxScore, GameTactics, PbpLog } from '../../../../types';

export interface LivePlayer extends PlayerBoxScore {
    // Current runtime attributes
    currentCondition: number;
    position: string;
    ovr: number;
    
    // Attributes needed for simulation
    attr: {
        ins: number; out: number; ft: number;
        drFoul: number; 
        def: number; blk: number; stl: number; foulTendency: number;
        reb: number;
        pas: number;
        stamina: number;
    }
}

export interface TeamState {
    id: string;
    name: string;
    score: number;
    tactics: GameTactics;
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
}

export interface PossessionResult {
    type: 'score' | 'miss' | 'turnover' | 'foul' | 'block' | 'freethrow';
    points?: 1 | 2 | 3;
    player?: LivePlayer; // Main actor
    secondaryPlayer?: LivePlayer; // Assister, Fouler, Blocker
    rebounder?: LivePlayer;
    timeTaken: number;
    logText: string;
    nextPossession: 'home' | 'away' | 'keep' | 'free_throw'; // free_throw is a special state
    isDeadBall?: boolean;
}
