
import { Team, GameTactics, OffenseTactic, DefenseTactic } from '../../../types';
import { calculatePlayerOvr } from '../../../utils/constants';

export const generateAutoTactics = (team: Team): GameTactics => {
    // 1. Filter Healthy Players
    const healthy = team.roster.filter(p => p.health !== 'Injured');
    
    // Sort by OVR desc
    healthy.sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a));

    // 2. Select Starters (Simple Logic: Best at Position)
    const starters: { PG: string; SG: string; SF: string; PF: string; C: string } = {
        PG: '', SG: '', SF: '', PF: '', C: ''
    };
    
    const usedIds = new Set<string>();

    const assignStarter = (pos: string): string => {
        const candidate = healthy.find(p => p.position.includes(pos) && !usedIds.has(p.id));
        if (candidate) {
            usedIds.add(candidate.id);
            return candidate.id;
        }
        // Fallback: Best available
        const fallback = healthy.find(p => !usedIds.has(p.id));
        if (fallback) {
            usedIds.add(fallback.id);
            return fallback.id;
        }
        return '';
    };

    starters.PG = assignStarter('PG');
    starters.SG = assignStarter('SG');
    starters.SF = assignStarter('SF');
    starters.PF = assignStarter('PF');
    starters.C = assignStarter('C');

    // 3. Determine Strategy
    const top3 = healthy.slice(0, 3);
    let bestTactic: OffenseTactic = 'Balance';
    
    const avg3pt = top3.reduce((sum, p) => sum + (p.threeCorner + p.three45 + p.threeTop)/3, 0) / (top3.length || 1);
    const avgIns = top3.reduce((sum, p) => sum + p.ins, 0) / (top3.length || 1);
    const avgPas = top3.reduce((sum, p) => sum + p.passAcc, 0) / (top3.length || 1);
    const avgSpd = top3.reduce((sum, p) => sum + p.speed, 0) / (top3.length || 1);

    if (avg3pt > 80 && avgSpd > 80) bestTactic = 'SevenSeconds';
    else if (avg3pt > 75 && avgPas > 75) bestTactic = 'PaceAndSpace';
    else if (avgIns > 80) bestTactic = 'PostFocus';
    else if (avgPas > 80) bestTactic = 'PerimeterFocus';
    else if (avgIns < 70 && avg3pt < 70) bestTactic = 'Grind'; 

    const defTactics: DefenseTactic[] = ['ManToManPerimeter'];
    const center = healthy.find(p => p.id === starters.C);
    if (center && center.blk > 80) defTactics[0] = 'ZoneDefense';

    // 4. Set Sliders
    const sliders = {
        pace: bestTactic === 'SevenSeconds' ? 9 : bestTactic === 'PaceAndSpace' ? 7 : bestTactic === 'Grind' ? 2 : 5,
        offReb: 5,
        defIntensity: 5,
        defReb: 5,
        fullCourtPress: 1,
        zoneUsage: defTactics[0] === 'ZoneDefense' ? 8 : 2,
        rotationFlexibility: 5
    };

    // 5. Minutes Distribution
    const minutesLimits: Record<string, number> = {};
    const starterIds = Object.values(starters);
    
    healthy.forEach((p, idx) => {
        let mins = 0;
        if (starterIds.includes(p.id)) {
            // Starters: 28-38 mins range. 
            mins = 33 + (p.stamina - 80) * 0.4;
            mins = Math.max(28, Math.min(38, mins));
        } else if (idx < 10) { // Top 10 Rotation
            const ovrBonus = (calculatePlayerOvr(p) - 70) * 0.6;      
            const staBonus = (p.stamina - 75) * 0.2;  
            
            mins = 10 + ovrBonus + staBonus;
            mins = Math.max(0, Math.min(24, mins));
        } else {
            mins = 0;
        }
        minutesLimits[p.id] = Math.round(mins);
    });

    return {
        offenseTactics: [bestTactic],
        defenseTactics: defTactics,
        sliders,
        starters,
        minutesLimits,
        stopperId: undefined
    };
};
