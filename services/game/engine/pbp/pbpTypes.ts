import { Player, PlayerBoxScore, GameTactics, PbpLog } from '../../../../types';

export interface LivePlayer extends PlayerBoxScore {
    // Current runtime attributes (can be modified by fatigue)
    currentCondition: number;
    position: string;
    ovr: number;
}

export interface TeamState {
    id: string;
    name: string;
    score: number;
    tactics: GameTactics;
    onCourt: LivePlayer[]; // 5 players currently on floor
    bench: LivePlayer[];
    timeouts: number;
    fouls: number; // Team fouls in quarter
}

export interface GameState {
    home: TeamState;
    away: TeamState;
    
    quarter: number; // 1, 2, 3, 4, 5(OT)...
    gameClock: number; // Seconds remaining in quarter (720 -> 0)
    shotClock: number; // 24 -> 0
    
    possession: 'home' | 'away';
    isDeadBall: boolean;
    
    logs: PbpLog[];
    
    // Config
    isHomeB2B: boolean;
    isAwayB2B: boolean;
}

export interface PossessionResult {
    type: 'score' | 'miss' | 'turnover' | 'foul';
    points?: 2 | 3;
    player?: LivePlayer; // Primary actor (Scorer, Turnover committer)
    secondaryPlayer?: LivePlayer; // (Assister, Stealer, Blocker)
    rebounder?: LivePlayer;
    timeTaken: number; // Seconds consumed
    logText: string;
    nextPossession: 'home' | 'away' | 'keep'; // 'keep' for off reb
}