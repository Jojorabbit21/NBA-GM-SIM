
import { Team, Player, PlayerBoxScore, OffenseTactic, DefenseTactic, TacticalSnapshot } from '../types';

// ==========================================================================================
//  🏀 NBA GM SIMULATOR - GAME ENGINE
//  Focus: Game Physics, Stats Generation, Tactics
// ==========================================================================================

export const SIM_CONFIG = {
    GAME_ENV: {
        // [Balance Patch v4] Increased base possessions from 80 to 85 to ensure 95-125 PPG range.
        BASE_POSSESSIONS: 85, 
        HOME_ADVANTAGE: 0.02,
        PACE_SLIDER_IMPACT: 0.02, 
        SCORING_MODIFIER: 1.05, // 점수 보강을 위해 모디파이어 상향
    },
    FATIGUE: {
        DRAIN_BASE: 1.8,
        STAMINA_SAVE_FACTOR: 0.015,
        DURABILITY_FACTOR: 0.005,
        FATIGUE_PENALTY_LOW: 0.02,
        FATIGUE_PENALTY_MED: 0.10,
        FATIGUE_PENALTY_HIGH: 0.25,
        // Daily recovery is now handled in App.tsx to ensure off-days work correctly
    },
    INJURY: {
        BASE_RISK: 0.0005,
        RISK_LOW_COND: 0.005,
        RISK_CRITICAL_COND: 0.08,
        SEVERE_INJURY_CHANCE: 0.65,
    },
    SHOOTING: {
        INSIDE_BASE_PCT: 0.58,
        INSIDE_DEF_IMPACT: 0.004,
        MID_BASE_PCT: 0.40,
        MID_DEF_IMPACT: 0.003,
        THREE_BASE_PCT: 0.35,
        THREE_DEF_IMPACT: 0.003,
        OPEN_SHOT_BONUS: 0.05,
        CONTESTED_PENALTY: 0.15,
    },
    STATS: {
        REB_BASE_FACTOR: 0.23,
        AST_BASE_FACTOR: 0.14,
        STL_BASE_FACTOR: 0.036,
        BLK_GUARD_FACTOR: 0.035,
        BLK_BIG_FACTOR: 0.055,
        TOV_USAGE_FACTOR: 0.08,
    }
};

// 포지션 불일치 페널티 매핑 (단위: 1.0 = 100%)
const POSITION_PENALTY_MAP: Record<string, Record<string, number>> = {
  'PG': { 'SG': 0.03, 'SF': 0.10, 'PF': 0.50, 'C': 1.00 },
  'SG': { 'PG': 0.03, 'SF': 0.05, 'PF': 0.50, 'C': 1.00 },
  'SF': { 'PG': 0.25, 'SG': 0.05, 'PF': 0.25, 'C': 0.40 },
  'PF': { 'PG': 0.40, 'SG': 0.30, 'SF': 0.05, 'C': 0.10 },
  'C':  { 'PG': 0.50, 'SG': 0.50, 'SF': 0.35, 'PF': 0.10 }
};

export interface TacticalSliders {
  pace: number;
  offReb: number;
  defIntensity: number;
  defReb: number;
  fullCourtPress: number;
  zoneUsage: number;
  rotationFlexibility: number;
}

export interface GameTactics {
  offenseTactics: OffenseTactic[];
  defenseTactics: DefenseTactic[];
  sliders: TacticalSliders;
  starters: { PG: string; SG: string; SF: string; PF: string; C: string };
  minutesLimits: Record<string, number>;
  stopperId?: string;
}

export interface RosterUpdate {
    [playerId: string]: {
        condition: number;
        health: 'Healthy' | 'Injured' | 'Day-to-Day';
        injuryType?: string;
        returnDate?: string;
    };
}

export interface SimulationResult {
    homeScore: number;
    awayScore: number;
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
    rosterUpdates: RosterUpdate;
    homeTactics: TacticalSnapshot;
    awayTactics: TacticalSnapshot;
}

// ------------------------------------------------------------------------------------------
//  SIMULATION & TACTICS LOGIC
// ------------------------------------------------------------------------------------------

export function generateAutoTactics(team: Team): GameTactics {
  const healthy = team.roster.filter(p => p.health !== 'Injured').sort((a,b) => b.ovr - a.ovr);
  
  const pickedIds = new Set<string>();

  const pickStarter = (positions: string[]) => {
      let candidate = healthy.find(p => !pickedIds.has(p.id) && positions.includes(p.position));
      
      if (!candidate) {
          const broadPositions = positions.flatMap(pos => {
              if (pos === 'PG' || pos === 'SG') return ['G', 'PG', 'SG'];
              if (pos === 'SF' || pos === 'PF') return ['F', 'SF', 'PF'];
              if (pos === 'C') return ['C', 'F', 'PF'];
              return [pos];
          });
          candidate = healthy.find(p => !pickedIds.has(p.id) && broadPositions.includes(p.position));
      }

      if (!candidate) {
          candidate = healthy.find(p => !pickedIds.has(p.id));
      }

      if (candidate) pickedIds.add(candidate.id);
      return candidate?.id || '';
  };

  const starters = {
    PG: pickStarter(['PG']),
    SG: pickStarter(['SG']),
    SF: pickStarter(['SF']),
    PF: pickStarter(['PF']),
    C: pickStarter(['C'])
  };

  const starterPlayers = Object.values(starters).map(id => team.roster.find(p => p.id === id)).filter(Boolean) as Player[];
  const rotation = starterPlayers.length === 5 ? starterPlayers : healthy.slice(0, 5);
  
  const getAvg = (players: Player[], attr: keyof Player) => {
      if (players.length === 0) return 50;
      return players.reduce((sum, p) => sum + (p[attr] as number), 0) / players.length;
  };
  const sAvg = (attr: keyof Player) => getAvg(rotation, attr);

  // [Tactics Balancing Update]
  // Previous logic favored SevenSeconds too much due to high speed/out stats.
  // New logic considers roster composition balance and weaknesses.
  const calculateScore = (tactic: OffenseTactic): number => {
      let score = 0;
      switch(tactic) {
        case 'Balance': 
            // Baseline score. High IQ and depth boost this.
            score = 75 + (sAvg('ovr') - 80) * 0.5 + (sAvg('shotIq') - 75) * 0.3;
            break;

        case 'PaceAndSpace':
            // Needs: Ball Handling, 3PT, Speed. 
            // Penalty: Low Rebounding (can't run if you don't rebound).
            const handlers = rotation.filter(p => p.position.includes('G'));
            const handlerPLM = handlers.length > 0 ? getAvg(handlers, 'plm') : 60;
            score = (handlerPLM * 0.35) + (sAvg('out') * 0.4) + (sAvg('speed') * 0.15) + (sAvg('stamina') * 0.1);
            if (sAvg('reb') < 70) score -= 10; // Penalty for bad rebounding
            break;

        case 'PerimeterFocus':
            // Needs: Elite Shooters (Wings).
            const shooters = [...rotation].sort((a,b) => b.out - a.out);
            const aceOut = shooters[0]?.out || 70;
            const subOut = shooters[1]?.out || 65;
            score = (aceOut * 0.4) + (subOut * 0.3) + (sAvg('plm') * 0.3);
            break;

        case 'PostFocus':
            // Needs: DOMINANT Bigs.
            // Heavily weighted by the best Inside scorer to ensure Embiid/Jokic teams use this.
            const bigs = rotation.filter(p => p.position === 'C' || p.position === 'PF');
            if (bigs.length > 0) {
                const bestBig = bigs.reduce((prev, curr) => prev.postPlay > curr.postPlay ? prev : curr);
                score = (bestBig.postPlay * 0.6) + (bestBig.strength * 0.2) + (sAvg('ins') * 0.2);
                // Bonus if the big is an elite passer (Jokic style)
                if (bestBig.passVision > 80) score += 10; 
            } else {
                score = 40; // No bigs, don't use this.
            }
            break;

        case 'Grind':
            // Needs: Elite Defense, Strength. Low Speed is actually fine here.
            score = (sAvg('def') * 0.5) + (sAvg('strength') * 0.3) + (sAvg('ins') * 0.2);
            // Bonus if offense is weak (forced to play defense)
            if (sAvg('out') < 75) score += 5;
            break;

        case 'SevenSeconds':
            // Needs: PG PLM, Team Speed, Team 3PT.
            // CRITICAL CHANGE: Added Stamina weight and reduced base multipliers.
            const pg = rotation.find(p => p.position === 'PG');
            const pgFactor = pg ? (pg.plm * 0.5 + pg.speed * 0.5) : 60;
            
            // Requires high stamina to sustain.
            score = (pgFactor * 0.3) + (sAvg('speed') * 0.25) + (sAvg('out') * 0.25) + (sAvg('stamina') * 0.2);
            
            // Penalty if defense is terrible (can't run if you take ball out of net)
            if (sAvg('def') < 70) score -= 8;
            break;
      }
      return score;
  };

  const tacticsList: OffenseTactic[] = ['Balance', 'PaceAndSpace', 'PerimeterFocus', 'PostFocus', 'Grind', 'SevenSeconds'];
  let bestTactic: OffenseTactic = 'Balance';
  let maxScore = -1;

  for (const t of tacticsList) {
      const s = calculateScore(t);
      if (s > maxScore) {
          maxScore = s;
          bestTactic = t;
      }
  }

  let sliders: TacticalSliders = { pace: 5, offReb: 5, defIntensity: 5, defReb: 5, fullCourtPress: 3, zoneUsage: 3, rotationFlexibility: 5 };
  
  switch(bestTactic) {
      case 'SevenSeconds': sliders.pace = 9; sliders.offReb = 4; sliders.fullCourtPress = 6; break;
      case 'PaceAndSpace': sliders.pace = 7; sliders.offReb = 3; break;
      case 'PostFocus': sliders.pace = 3; sliders.offReb = 8; sliders.defReb = 8; break;
      case 'Grind': sliders.pace = 2; sliders.defIntensity = 9; sliders.defReb = 7; break;
      case 'PerimeterFocus': sliders.pace = 6; sliders.offReb = 4; break;
      default: sliders.pace = 5; break;
  }

  const defTactics: DefenseTactic[] = ['ManToManPerimeter'];
  if (sAvg('intDef') > sAvg('perDef') + 5 || (sAvg('reb') > 80)) {
      defTactics.push('ZoneDefense');
      sliders.zoneUsage = 8;
  } else {
      sliders.zoneUsage = 2;
  }

  // New Ace Stopper Logic:
  // (PDEF * 0.3) + (STL * 0.2) + (PASS PERC * 0.15) + (DEF CONS * 0.1) + (STA * 0.1) + (SPD * 0.1) + (AGI * 0.05)
  const getStopperScore = (p: Player) => (
      (p.perDef * 0.30) +
      (p.steal * 0.20) +
      (p.passPerc * 0.15) +
      (p.defConsist * 0.10) +
      (p.stamina * 0.10) +
      (p.speed * 0.10) +
      (p.agility * 0.05)
  );

  const bestDefender = [...healthy].sort((a, b) => getStopperScore(b) - getStopperScore(a))[0];
  let stopperId: string | undefined = undefined;
  
  // Use AceStopper if the best defender has a decent score (e.g. > 78) to justify special assignment
  if (bestDefender && getStopperScore(bestDefender) >= 78) {
      defTactics.push('AceStopper');
      stopperId = bestDefender.id;
      sliders.defIntensity = Math.min(10, sliders.defIntensity + 2);
  }

  const minutesLimits: Record<string, number> = {};
  const starterIds = Object.values(starters);
  
  healthy.forEach((p, idx) => {
      let mins = 0;
      if (starterIds.includes(p.id)) {
          mins = 30 + (p.stamina - 70) * 0.2 + (p.ovr - 80) * 0.2;
          mins = Math.max(28, Math.min(40, mins));
      } else if (idx < 10) {
          mins = 15 + (p.ovr - 70) * 0.5;
          mins = Math.max(10, Math.min(26, mins));
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
    stopperId
  };
}

function distributeMinutes(roster: Player[], isStarter: boolean[], limits: Record<string, number>, sliders: TacticalSliders): number[] {
    const totalMinutes = 240;
    const minutes = roster.map(() => 0);
    let used = 0;
    
    roster.forEach((p, i) => {
        if (limits[p.id] !== undefined && limits[p.id] > 0) {
            minutes[i] = limits[p.id];
        } else if (isStarter[i]) {
            minutes[i] = 32;
        } else if (i < 10) {
            minutes[i] = 16;
        } else {
            minutes[i] = 0;
        }
        used += minutes[i];
    });
    
    if (used > 0) {
        const factor = 240 / used;
        for (let i = 0; i < minutes.length; i++) {
            minutes[i] = Math.round(minutes[i] * factor);
        }
    }
    
    let currentSum = minutes.reduce((a, b) => a + b, 0);
    let diff = 240 - currentSum;

    if (diff !== 0) {
       const sortedIndices = minutes.map((m, i) => ({m, i})).sort((a, b) => b.m - a.m).map(x => x.i);
       
       if (diff > 0) {
          let i = 0;
          while (diff > 0) {
             const idx = sortedIndices[i % sortedIndices.length];
             if (minutes[idx] < 48) { minutes[idx]++; diff--; }
             i++; if (i > 200) break; 
          }
       } else {
          let i = 0;
          while (diff < 0) {
             const idx = sortedIndices[i % sortedIndices.length];
             if (minutes[idx] > 0) { minutes[idx]--; diff++; }
             i++; if (i > 200) break;
          }
       }
    }
    
    return minutes;
}

function getOpponentDefensiveMetrics(roster: Player[], minutes: number[]) {
    let totalMin = 0;
    const metrics = { intDef: 0, perDef: 0, block: 0, pressure: 0, helpDef: 0 };
    roster.forEach((p, i) => {
        const min = minutes[i];
        if (min > 0) {
            metrics.intDef += p.intDef * min;
            metrics.perDef += p.perDef * min;
            metrics.block += p.blk * min;
            metrics.pressure += p.def * min;
            metrics.helpDef += p.helpDefIq * min;
            totalMin += min;
        }
    });
    if (totalMin > 0) {
        metrics.intDef /= totalMin;
        metrics.perDef /= totalMin;
        metrics.block /= totalMin;
        metrics.pressure /= totalMin;
        metrics.helpDef /= totalMin;
    }
    return metrics;
}

export function simulateGame(
    homeTeam: Team, 
    awayTeam: Team, 
    userTeamId: string | null, 
    userTactics?: GameTactics,
    isHomeB2B: boolean = false,
    isAwayB2B: boolean = false
): SimulationResult {
    const isUserHome = userTeamId === homeTeam.id;
    const isUserAway = userTeamId === awayTeam.id;
    
    const homeTactics = isUserHome && userTactics ? userTactics : generateAutoTactics(homeTeam);
    const awayTactics = isUserAway && userTactics ? userTactics : generateAutoTactics(awayTeam);
    
    const homeBox = simulateTeamPerformance(homeTeam, homeTactics, awayTeam, awayTactics, true, isHomeB2B);
    const awayBox = simulateTeamPerformance(awayTeam, awayTactics, homeTeam, homeTactics, false, isAwayB2B);
    
    let homeScore = homeBox.stats.reduce((sum, p) => sum + p.pts, 0);
    let awayScore = awayBox.stats.reduce((sum, p) => sum + p.pts, 0);
    
    if (homeScore === awayScore) {
        if (Math.random() > 0.5) {
            homeScore += 1;
            const hero = homeBox.stats.reduce((p, c) => (p.pts > c.pts ? p : c));
            hero.pts += 1; hero.ftm += 1; hero.fta += 1;
        } else {
            awayScore += 1;
            const hero = awayBox.stats.reduce((p, c) => (p.pts > c.pts ? p : c));
            hero.pts += 1; hero.ftm += 1; hero.fta += 1;
        }
    }

    // Extract tactics snapshots
    const homeSnapshot: TacticalSnapshot = {
        offense: homeTactics.offenseTactics[0],
        defense: homeTactics.defenseTactics.find(t => t !== 'AceStopper') || 'ManToManPerimeter',
        pace: homeTactics.sliders.pace,
        stopperId: homeTactics.stopperId
    };

    const awaySnapshot: TacticalSnapshot = {
        offense: awayTactics.offenseTactics[0],
        defense: awayTactics.defenseTactics.find(t => t !== 'AceStopper') || 'ManToManPerimeter',
        pace: awayTactics.sliders.pace,
        stopperId: awayTactics.stopperId
    };

    return {
        homeScore,
        awayScore,
        homeBox: homeBox.stats,
        awayBox: awayBox.stats,
        rosterUpdates: { ...homeBox.updates, ...awayBox.updates },
        homeTactics: homeSnapshot,
        awayTactics: awaySnapshot
    };
}

function simulateTeamPerformance(
    team: Team, 
    teamTactics: GameTactics, 
    oppTeam: Team, 
    oppTactics: GameTactics, 
    isHome: boolean,
    isB2B: boolean = false
): { stats: PlayerBoxScore[], updates: RosterUpdate } {
    const C = SIM_CONFIG;
    const rosterUpdates: RosterUpdate = {};
    const sliders = teamTactics.sliders;
    
    const healthyPlayers = team.roster.filter(p => p.health !== 'Injured').sort((a,b) => b.ovr - a.ovr);
    
    const starterIdsMap = teamTactics.starters; // { PG: 'id', SG: 'id'... }
    const starterIds = Object.values(starterIdsMap);
    const isStarter = healthyPlayers.map(p => starterIds.includes(p.id));

    const finalMinutesList = distributeMinutes(healthyPlayers, isStarter, teamTactics.minutesLimits, sliders);
    
    const minutesMap: Record<string, number> = {};
    healthyPlayers.forEach((p, i) => {
        minutesMap[p.id] = finalMinutesList[i];
    });

    const oppSliders = oppTactics.sliders;
    const oppSorted = oppTeam.roster.filter(p => p.health !== 'Injured').sort((a,b) => b.ovr - a.ovr);
    const oppMinsEst = distributeMinutes(oppSorted, oppSorted.map((_, i) => i < 5), {}, oppSliders);
    const oppDefMetrics = getOpponentDefensiveMetrics(oppSorted, oppMinsEst);

    const hcaBase = (Math.random() * 0.02) + 0.01; 
    const homeAdvantageModifier = isHome ? C.GAME_ENV.HOME_ADVANTAGE : -(C.GAME_ENV.HOME_ADVANTAGE * 0.8);

    let paceMultiplier = 1.0 + (sliders.pace - 5) * C.GAME_ENV.PACE_SLIDER_IMPACT; 
    paceMultiplier += (sliders.fullCourtPress - 5) * 0.015;
    
    let tacticPerimeterBonus = 1.0; 
    let tacticInteriorBonus = 1.0; 
    let tacticPaceBonus = 0.0;      
    let tacticDrainMult = 1.0;      

    if (teamTactics) {
      teamTactics.offenseTactics.forEach(tactic => {
        if (tactic === 'PaceAndSpace') { tacticPerimeterBonus += 0.08; tacticPaceBonus += 0.03; tacticDrainMult += 0.1; } 
        else if (tactic === 'PerimeterFocus') { tacticPerimeterBonus += 0.06; }
        else if (tactic === 'PostFocus') { tacticInteriorBonus += 0.08; tacticPaceBonus -= 0.03; } 
        else if (tactic === 'SevenSeconds') { tacticPerimeterBonus += 0.10; tacticPaceBonus += 0.08; tacticDrainMult += 0.15; } 
        else if (tactic === 'Grind') { tacticPaceBonus -= 0.06; } 
      });
      
      teamTactics.defenseTactics.forEach(tactic => {
          if (tactic === 'ManToManPerimeter') { tacticDrainMult += 0.05; }
          else if (tactic === 'AceStopper') { tacticDrainMult += 0.05; } 
      });
    }
    paceMultiplier += tacticPaceBonus;

    const teamFgaTarget = (C.GAME_ENV.BASE_POSSESSIONS + (Math.random() * 10) + (isHome ? 2 : 0)) * C.GAME_ENV.SCORING_MODIFIER * paceMultiplier;
    const hastePenalty = paceMultiplier > 1.15 ? (paceMultiplier - 1.15) * 0.6 : 0;

    const oppZoneEffect = (oppSliders.zoneUsage - 5) * 2.0; 
    oppDefMetrics.intDef += oppZoneEffect; 
    oppDefMetrics.perDef -= oppZoneEffect; 

    const acePlayer = healthyPlayers.reduce((prev, current) => (prev.ovr > current.ovr) ? prev : current, healthyPlayers[0] || { ovr: 0, id: 'dummy' });

    const totalUsageWeight = healthyPlayers.reduce((sum, p) => {
        const mp = minutesMap[p.id] || 0;
        let w = Math.pow(p.ovr, 2.75) * (p.offConsist / 50) * mp; 
        if (teamTactics?.offenseTactics.includes('PostFocus')) {
             if (p.position === 'C' || p.position === 'PF') w *= 1.4;
             if (p.closeShot > 80) w *= 1.1; 
        }
        if (teamTactics?.offenseTactics.includes('PerimeterFocus') && (p.position === 'PG' || p.position === 'SG')) w *= 1.4;
        w *= (p.shotIq / 75); 
        return sum + w;
    }, 0) || 1; 

    const boxScores: PlayerBoxScore[] = [];

    team.roster.forEach(p => {
      const mp = minutesMap[p.id] || 0;
      
      const preGameCondition = p.condition !== undefined ? p.condition : 100;
      let newCondition = preGameCondition;
      let newHealth = p.health;
      let injuryType = p.injuryType;
      let returnDate = p.returnDate;

      let isStopper = false;
      let isAceTarget = false;
      let matchupEffect = 0;

      // --- Position Mismatch Penalty Logic ---
      let positionPenalty = 0;
      // Find which slot this player is filling in the starting lineup
      const assignedSlot = Object.entries(starterIdsMap).find(([slot, id]) => id === p.id)?.[0];
      if (assignedSlot) {
          const playerPos = p.position; // PG, SG, SF, PF, C or G, F
          // 'G' or 'F' broad categories handle matching slots without penalty
          const isMatch = (playerPos === assignedSlot) ||
                          (playerPos === 'G' && (assignedSlot === 'PG' || assignedSlot === 'SG')) ||
                          (playerPos === 'F' && (assignedSlot === 'SF' || assignedSlot === 'PF'));
          
          if (!isMatch) {
              positionPenalty = POSITION_PENALTY_MAP[playerPos]?.[assignedSlot] || 0;
          }
      }

      if (mp > 0) {
          const staminaFactor = Math.max(0.25, C.FATIGUE.DRAIN_BASE - (p.stamina * C.FATIGUE.STAMINA_SAVE_FACTOR)); 
          const durabilityFactor = 1 + (80 - p.durability) * C.FATIGUE.DURABILITY_FACTOR;
          const baseDrain = mp * staminaFactor * durabilityFactor;
          
          const sliderIntensity = (sliders.pace + sliders.defIntensity + sliders.fullCourtPress) / 15; 
          let drain = baseDrain * sliderIntensity * tacticDrainMult;
          
          // [System Update] Apply Back-to-Back Penalty (1.5x drain)
          if (isB2B) {
              drain *= 1.5;
          }

          const threshold = p.stamina * 0.4;
          if (mp > threshold) {
              const overMinutes = mp - threshold;
              drain += overMinutes * 0.5;
          }

          isStopper = teamTactics?.defenseTactics.includes('AceStopper') && teamTactics.stopperId === p.id;
          if (isStopper) drain *= 1.25;

          // Game fatigue subtracts from preGameCondition
          newCondition = Math.max(0, Math.floor(preGameCondition - drain));
          
          let injuryRisk = C.INJURY.BASE_RISK;
          if (newCondition < 20) injuryRisk += C.INJURY.RISK_CRITICAL_COND;
          else if (newCondition < 40) injuryRisk += 0.03;
          else if (newCondition < 60) injuryRisk += C.INJURY.RISK_LOW_COND;
          
          injuryRisk *= (1 + (100 - p.durability) / 50); 

          if (Math.random() < injuryRisk) {
              const isSevere = Math.random() > C.INJURY.SEVERE_INJURY_CHANCE;
              const minorInjuries = ['Ankle Sprain', 'Knee Soreness', 'Back Spasms', 'Calf Strain', 'Groin Tightness', 'Hamstring Tightness'];
              const severeInjuries = ['Hamstring Strain', 'MCL Sprain', 'High Ankle Sprain', 'Calf Strain', 'Bone Bruise', 'Achilles Soreness'];
              
              newHealth = isSevere ? 'Injured' : 'Day-to-Day';
              
              if (isSevere) {
                  injuryType = severeInjuries[Math.floor(Math.random() * severeInjuries.length)];
                  const days = Math.floor(Math.random() * 21) + 7;
                  const rDate = new Date();
                  rDate.setDate(rDate.getDate() + days);
                  returnDate = rDate.toISOString().split('T')[0];
              } else {
                  injuryType = minorInjuries[Math.floor(Math.random() * minorInjuries.length)];
                  const days = Math.floor(Math.random() * 4) + 1;
                  const rDate = new Date();
                  rDate.setDate(rDate.getDate() + days);
                  returnDate = rDate.toISOString().split('T')[0];
              }
          }
      } 

      rosterUpdates[p.id] = {
          condition: newCondition,
          health: newHealth,
          injuryType,
          returnDate
      };

      if (mp <= 0) {
          return; 
      }
      
      const intensityFactor = 1 + (sliders.defIntensity - 5) * 0.05 + (sliders.fullCourtPress - 5) * 0.05;
      const inGameFatiguePenalty = Math.max(0, (mp - (p.stamina * 0.4))) * 0.01 * intensityFactor; 
      
      let fatiguePerfPenalty = 0;
      if (preGameCondition < 40) fatiguePerfPenalty = C.FATIGUE.FATIGUE_PENALTY_HIGH; 
      else if (preGameCondition < 60) fatiguePerfPenalty = C.FATIGUE.FATIGUE_PENALTY_MED;
      else if (preGameCondition < 80) fatiguePerfPenalty = C.FATIGUE.FATIGUE_PENALTY_LOW;

      const mentalFortitude = (p.intangibles || 50) / 100; 
      // Apply position penalty to the performance drop
      const effectivePerfDrop = Math.min(1.0, (fatiguePerfPenalty + inGameFatiguePenalty + positionPenalty) * (1 - (mentalFortitude * 0.5)));

      let pUsage = (Math.pow(p.ovr, 2.75) * (p.offConsist / 50) * mp * (p.shotIq / 75));
      if (teamTactics?.offenseTactics.includes('PostFocus')) {
          if (p.position === 'C' || p.position === 'PF') pUsage *= 1.4;
          if (p.closeShot > 80) pUsage *= 1.1;
      } 
      if (teamTactics?.offenseTactics.includes('PerimeterFocus') && (p.position === 'PG' || p.position === 'SG')) pUsage *= 1.4;
      
      let fga = Math.round(teamFgaTarget * (pUsage / totalUsageWeight));

      // --- 3PT Attempt Logic Optimization (Realistic Scaling) ---
      const threeAvg = (p.threeCorner + p.three45 + p.threeTop) / 3;
      const mentalClutchBonus = Math.max(0, (p.intangibles - 75) * 0.001); 

      // 1. Calculate 3PT Attempts & Makes (Reduced Tendency Coefficients)
      let base3PTendency = 0;
      if (threeAvg >= 90) base3PTendency = 0.38;      // [Patch] 0.55 -> 0.38
      else if (threeAvg >= 85) base3PTendency = 0.32; // [Patch] 0.45 -> 0.32
      else if (threeAvg >= 80) base3PTendency = 0.25; // [Patch] 0.35 -> 0.25
      else if (threeAvg >= 75) base3PTendency = 0.18; // [Patch] 0.20 -> 0.18
      else if (threeAvg >= 70) base3PTendency = 0.10; 
      else base3PTendency = 0.04;                     

      // Big man penalty for 3PA
      if (['C', 'PF'].includes(p.position)) {
          base3PTendency *= 0.65;
      }

      if (p.ins > threeAvg + 15) base3PTendency *= 0.5; 

      let tacticMult = 1.0;
      if (teamTactics?.offenseTactics.includes('PaceAndSpace') || teamTactics?.offenseTactics.includes('SevenSeconds')) tacticMult = 1.15; // [Patch] 1.4 -> 1.15
      if (teamTactics?.offenseTactics.includes('PerimeterFocus')) tacticMult = (threeAvg > 80) ? 1.12 : 0.8;

      let p3a = fga * base3PTendency * tacticMult;
      
      // [Patch] Hard Volume Cap: Applying diminishing returns to 3PA
      // If calculated 3PA is > 10, scale the remainder by 0.3
      if (p3a > 10) {
          p3a = 10 + (p3a - 10) * 0.3;
      }
      p3a = Math.round(p3a);

      if (threeAvg < 65) p3a = Math.min(p3a, 1);
      if (threeAvg < 75) p3a = Math.min(p3a, 6); 
      if (p3a > fga) p3a = fga;

      const p3p = Math.min(0.50, Math.max(0.20, 
         C.SHOOTING.THREE_BASE_PCT 
         + ((threeAvg - oppDefMetrics.perDef) * C.SHOOTING.THREE_DEF_IMPACT) 
         - effectivePerfDrop 
         - (hastePenalty * 0.8) 
         + (mentalClutchBonus * 0.5) 
         + (homeAdvantageModifier * 0.8)
      )); 
      let p3m = Math.round(p3a * p3p);

      // 2. Calculate 2PT Split (Rim vs Mid)
      const twoPa = fga - p3a;
      
      const rimAttr = (p.layup + p.dunk + p.postPlay + p.closeShot) / 4;
      const midAttr = p.midRange;
      
      // Determine Rim Tendency based on skills and position
      let rimBias = 0.5; // Base split
      if (['C', 'PF'].includes(p.position)) rimBias = 0.75;
      if (rimAttr > midAttr + 10) rimBias += 0.15;
      else if (midAttr > rimAttr + 10) rimBias -= 0.15;
      
      if (teamTactics?.offenseTactics.includes('PostFocus')) rimBias += 0.1;
      
      let rimA = Math.round(twoPa * Math.min(0.95, Math.max(0.05, rimBias)));
      let midA = twoPa - rimA;

      // 3. Calculate Rim Makes
      const rimAbility = (rimAttr * 0.7 + p.strength * 0.2 + p.vertical * 0.1) * tacticInteriorBonus * (1 - effectivePerfDrop);
      const rimSuccessRate = Math.min(0.85, Math.max(0.30, 
        C.SHOOTING.INSIDE_BASE_PCT 
        + (rimAbility - oppDefMetrics.intDef) * C.SHOOTING.INSIDE_DEF_IMPACT 
        - (oppDefMetrics.block * 0.001) 
        - (hastePenalty * 0.5) 
        + mentalClutchBonus 
        + homeAdvantageModifier
      ));
      let rimM = Math.round(rimA * rimSuccessRate);

      // 4. Calculate Mid-Range Makes
      const midAbility = (midAttr * 0.8 + p.shotIq * 0.2) * tacticPerimeterBonus * (1 - effectivePerfDrop);
      const midSuccessRate = Math.min(0.60, Math.max(0.20, 
        C.SHOOTING.MID_BASE_PCT 
        + (midAbility - oppDefMetrics.perDef) * C.SHOOTING.MID_DEF_IMPACT 
        - (oppDefMetrics.pressure * 0.001) 
        - hastePenalty 
        + mentalClutchBonus 
        + homeAdvantageModifier
      ));
      let midM = Math.round(midA * midSuccessRate);

      // 5. Stopper Effect
      const oppHasStopper = oppTactics?.defenseTactics.includes('AceStopper');
      isAceTarget = !!(oppHasStopper && p.id === acePlayer.id);

      if (isAceTarget && oppTactics?.stopperId) {
          const stopper = oppTeam.roster.find(d => d.id === oppTactics.stopperId);
          if (stopper) {
              const perDef = stopper.perDef || 50;
              let fgpImpact = 10 - ((perDef - 40) * 0.63);
              fgpImpact = Math.max(-27, Math.min(10, fgpImpact)); 
              matchupEffect = Math.round(fgpImpact);
              
              // Apply reduction to makes
              const factor = (1.0 + (fgpImpact / 100));
              rimM = Math.round(rimM * factor);
              midM = Math.round(midM * factor);
              p3m = Math.round(p3m * factor);
          }
      }

      // 6. Final Tally
      const fgm = rimM + midM + p3m;
      // Ensure consistency
      if (rimM > rimA) rimM = rimA;
      if (midM > midA) midM = midA;
      if (p3m > p3a) p3m = p3a;

      const drawFoulRate = (p.drawFoul * 0.6 + p.agility * 0.2 + rimBias * 20) / 400;
      const fta = Math.round(fga * drawFoulRate * (1 + (sliders.defIntensity - 5) * 0.05));
      
      const ftHca = isHome ? 0.02 : -0.01; 
      const ftm = Math.round(fta * ((p.ft / 100) + mentalClutchBonus + ftHca));

      const offRebSlider = 1.0 + (sliders.offReb - 5) * 0.05;
      const defRebSlider = 1.0 + (sliders.defReb - 5) * 0.03;
      
      const rebAttr = (p.reb * 0.6 + p.vertical * 0.1 + p.hustle * 0.1 + p.strength * 0.2);
      let rebBase = rebAttr * (mp / 48) * C.STATS.REB_BASE_FACTOR; 
      
      if (p.position === 'C') rebBase *= 1.15;
      if (p.position === 'PF') rebBase *= 1.08;

      const totalReb = Math.round(rebBase * (Math.random() * 0.4 + 0.8) * defRebSlider);
      const offRebRatio = (p.offReb / (p.offReb + p.defReb * 1.5)); 
      const offReb = Math.round(totalReb * offRebRatio * offRebSlider);
      const defReb = Math.max(0, totalReb - offReb);

      const astAttr = (p.passAcc * 0.3 + p.passVision * 0.4 + p.passIq * 0.2 + p.handling * 0.1) * (1 - effectivePerfDrop);
      let astBase = astAttr * (mp / 48) * C.STATS.AST_BASE_FACTOR;
      
      if (p.position === 'PG') astBase *= 1.4;
      if (p.position === 'SG') astBase *= 1.1;
      
      if (teamTactics?.offenseTactics.includes('SevenSeconds') || teamTactics?.offenseTactics.includes('PaceAndSpace')) {
          astBase *= 1.1;
      }
      const ast = Math.round(astBase * (Math.random() * 0.5 + 0.75));

      const stlAttr = (p.steal * 0.5 + p.perDef * 0.3 + p.hustle * 0.2) * (1 - effectivePerfDrop);
      const stlIntensity = 1 + (sliders.defIntensity - 5) * 0.06;
      let stlBase = stlAttr * (mp / 48) * C.STATS.STL_BASE_FACTOR * stlIntensity;
      if (p.position === 'PG' || p.position === 'SG') stlBase *= 1.1; 
      const stl = Math.round(stlBase * (Math.random() * 0.5 + 0.75));

      const blkAttr = (p.blk * 0.6 + p.vertical * 0.2 + p.height * 0.2) * (1 - effectivePerfDrop);
      let blkFactor = 0.035; 
      if (p.position === 'C') blkFactor = C.STATS.BLK_BIG_FACTOR;
      else if (p.position === 'PF') blkFactor = 0.045;
      const blk = Math.round(blkAttr * (mp / 48) * blkFactor * (Math.random() * 0.6 + 0.7));

      const usageProxy = (fga + ast * 2 + 5);
      const tovAttr = (100 - p.handling) * 0.02 + (100 - p.passIq) * 0.02;
      const tovBase = (usageProxy * C.STATS.TOV_USAGE_FACTOR) + (tovAttr * 0.05); 
      let tov = Math.round(tovBase * (mp / 48) * (Math.random() * 0.5 + 0.7));

      if (isAceTarget && oppTactics?.stopperId) {
          const stopper = oppTeam.roster.find(d => d.id === oppTactics.stopperId);
          if (stopper) {
              const stealRating = stopper.steal || 50;
              const tovIncrease = (stealRating / 100) * 0.40;
              tov = Math.round(tov * (1.0 + tovIncrease));
          }
      }

      const pts = (fgm - p3m) * 2 + p3m * 3 + ftm;

      boxScores.push({
          playerId: p.id,
          playerName: p.name,
          pts, reb: totalReb, offReb, defReb, ast, stl, blk, tov,
          fgm, fga, p3m, p3a, ftm, fta,
          rimM, rimA, midM, midA, // New Zone Stats
          mp, g: 1, gs: starterIds.includes(p.id) ? 1 : 0,
          isStopper,
          isAceTarget,
          matchupEffect
      });
    });

    return { stats: boxScores, updates: rosterUpdates };
}
