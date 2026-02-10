
import { PbpLog } from "../types";

// [Config] Simulation Speed Control
// Lower increment / Higher delay = Slower game
export const SIMULATION_SPEED = {
    NORMAL: { INC: 0.6, DELAY: 60 },      // Base speed
    LATE: { INC: 0.4, DELAY: 150 },       // 4th Quarter (85%+)
    CLUTCH: { INC: 0.2, DELAY: 400 },     // Last minute close game (94%+)
    GARBAGE: { INC: 1.5, DELAY: 30 }      // Blowout games
};

// WP Calculation Logic: Score diff + Time remaining
// 50% is the baseline (Tie).
export const calculateWinProbability = (homeScore: number, awayScore: number, timePassed: number) => {
    const totalTime = 48;
    const timeRemaining = Math.max(0, totalTime - timePassed);
    const diff = homeScore - awayScore;
    
    // As time decreases, points lead becomes more valuable
    // Volatility decreases as timeRemaining -> 0
    const volatility = Math.sqrt(timeRemaining + 1) * 3.0;
    
    // Normalize to 0-100 (Home 100%, Away 0%)
    let wp = 50 + (diff / volatility) * 50;
    return Math.max(0.1, Math.min(99.9, wp));
};

export interface WPSnapshot {
    minute: number; // 0 to 48
    h: number;
    a: number;
    wp: number;
}

/**
 * Converts raw PBP logs into 49 fixed data points (Minute 0 to Minute 48).
 * This ensures the graph doesn't jitter and fills up predictably.
 */
export const calculatePerMinuteStats = (logs: PbpLog[], homeTeamId: string): WPSnapshot[] => {
    const snapshots: WPSnapshot[] = [];
    
    // Initialize Minute 0 (Start of game)
    snapshots.push({ minute: 0, h: 0, a: 0, wp: 50 });

    let currentH = 0;
    let currentA = 0;
    let logIndex = 0;

    // We need snapshots for minute 1 to 48
    for (let m = 1; m <= 48; m++) {
        // Find all logs that happened BEFORE or AT this minute mark
        // Minute M corresponds to: Quarter = Math.ceil(m / 12), TimeRemaining = 12 - (m % 12) (handle 0s carefully)
        
        // Target accumulated seconds
        const targetSeconds = m * 60;

        while (logIndex < logs.length) {
            const log = logs[logIndex];
            
            // Convert log time to elapsed seconds
            const [mm, ss] = log.timeRemaining.split(':').map(Number);
            const secondsInQuarter = 720 - (mm * 60 + ss);
            const elapsedSeconds = ((log.quarter - 1) * 720) + secondsInQuarter;

            // If this log happened after our target minute, stop processing
            if (elapsedSeconds > targetSeconds) {
                break;
            }

            // Process score
            if (log.type === 'score' || log.type === 'freethrow') {
                let points = 0;
                if (log.type === 'score') points = (log.text.includes('3점') ? 3 : 2);
                if (log.type === 'freethrow') points = 1;
                if (log.points) points = log.points;
                else if (log.text.includes('앤드원 성공')) points = 1;

                if (log.teamId === homeTeamId) currentH += points;
                else currentA += points;
            }
            
            logIndex++;
        }

        // Record snapshot for this minute
        const wp = calculateWinProbability(currentH, currentA, m); // m is minutes passed
        snapshots.push({ minute: m, h: currentH, a: currentA, wp });
    }
    
    return snapshots;
};
