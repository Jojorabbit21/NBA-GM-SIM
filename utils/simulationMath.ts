
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
    const volatility = Math.sqrt(timeRemaining + 1) * 3.0;
    
    // Normalize to 0-100 (Home 100%, Away 0%)
    let wp = 50 + (diff / volatility) * 50;
    return Math.max(0.1, Math.min(99.9, wp));
};

export const generateRealisticGameFlow = (finalHome: number, finalAway: number) => {
    let currentHome = 0;
    let currentAway = 0;
    // Ensure the graph starts exactly at 50%
    const history: { h: number, a: number, wp: number }[] = [{ h: 0, a: 0, wp: 50 }];
    
    const scoreDiff = Math.abs(finalHome - finalAway);
    const isClutchGame = scoreDiff <= 5;
    let momentum = 0;
    const clutchTriggerHome = isClutchGame ? finalHome - (Math.floor(Math.random() * 3) + 3) : 9999;
    const clutchTriggerAway = isClutchGame ? finalAway - (Math.floor(Math.random() * 3) + 3) : 9999;
    let clutchModeActivated = false;

    // Total events roughly mapped to 48 minutes
    const totalSteps = 100; 

    while (currentHome < finalHome || currentAway < finalAway) {
        const timePassed = (history.length / totalSteps) * 48;

        if (isClutchGame && !clutchModeActivated && currentHome >= clutchTriggerHome && currentAway >= clutchTriggerAway) {
            clutchModeActivated = true;
        }

        const remainingHome = finalHome - currentHome;
        const remainingAway = finalAway - currentAway;
        let homeProb = remainingHome / (remainingHome + remainingAway || 1);
        homeProb += (momentum * 0.05);

        if (isClutchGame && !clutchModeActivated) {
            if (currentHome > currentAway + 10) homeProb -= 0.2;
            if (currentAway > currentHome + 10) homeProb += 0.2;
        } else if (clutchModeActivated) {
             if (currentHome < currentAway && remainingHome > 0) homeProb += 0.35;
             else if (currentAway < currentHome && remainingAway > 0) homeProb -= 0.35;
        }

        homeProb = Math.max(0.05, Math.min(0.95, homeProb));
        let scorer: 'home' | 'away';
        if (currentHome >= finalHome) scorer = 'away';
        else if (currentAway >= finalAway) scorer = 'home';
        else scorer = Math.random() < homeProb ? 'home' : 'away';

        let points = 2;
        const rand = Math.random();
        if (clutchModeActivated) points = rand > 0.7 ? 1 : 2; 
        else points = rand > 0.35 ? 2 : 3; 

        if (scorer === 'home') {
            points = Math.min(points, remainingHome); 
            currentHome += points;
            momentum = Math.min(momentum + 1, 3);
        } else {
            points = Math.min(points, remainingAway);
            currentAway += points;
            momentum = Math.max(momentum - 1, -3);
        }
        if ((scorer === 'home' && momentum < 0) || (scorer === 'away' && momentum > 0)) momentum = 0;
        
        const currentWP = calculateWinProbability(currentHome, currentAway, timePassed);
        history.push({ h: currentHome, a: currentAway, wp: currentWP });
    }
    return history;
};
