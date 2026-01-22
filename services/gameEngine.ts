
import { Team, Player, PlayerBoxScore, OffenseTactic, DefenseTactic, TradeOffer } from '../types';

// ==========================================================================================
//  🏀 NBA GM SIMULATOR - GAME ENGINE CONFIGURATION
// ==========================================================================================

export const TRADE_CONFIG = {
    BASE: {
        REPLACEMENT_LEVEL_OVR: 38,
        VALUE_EXPONENT: 2.7,
    },
    AGE: {
        YOUNG_LIMIT: 23,
        HIGH_POT_THRESHOLD: 80,
        YOUNG_POT_BONUS: 0.015,
        PRIME_START: 24,
        PRIME_END: 29,
        PRIME_BONUS: 1.05,
        OLD_START: 33,
        OLD_PENALTY_PER_YEAR: 0.07,
        MIN_OLD_VALUE: 0.2,
    },
    NEEDS: {
        WEAKNESS_THRESHOLD: 70,
        STRENGTH_THRESHOLD: 80,
        OUTSIDE_OFFSET: 2,
        REBOUND_OFFSET: -5,
    },
    CONTEXT: {
        FIT_BONUS: 0.15,
        REDUNDANCY_PENALTY: 0.10,
        NEW_ALPHA_BONUS: 0.8,
        NEW_SECOND_BONUS: 0.5,
        NEW_CORE_BONUS: 0.3,
        PROTECT_ALPHA_MULT: 2.0,
        PROTECT_SECOND_MULT: 1.7,
        PROTECT_STARTER_MULT: 1.4,
    },
    ACCEPTANCE: {
        DEFAULT_RATIO: 0.95,
        STAR_SWAP_RATIO: 0.90,
        STAR_SWAP_STEAL_RATIO: 0.85,
        CONSOLIDATION_TAX: 0.05,
        STAR_OVR_THRESHOLD: 85,
        HIGH_VALUE_THRESHOLD: 5000,
    },
    DILUTION: {
        // 쓰레기 선수 덤핑 방지 설정
        PACKAGE_SIZE_TRIGGER: 3, // 3명 이상일 때 검사
        ANCHOR_OVR_LOW: 76, // 패키지 내 최고 선수가 이 수치 미만이면 가치 폭락
        ANCHOR_OVR_MID: 81, // 패키지 내 최고 선수가 이 수치 미만이면 가치 하락
        LOW_ANCHOR_PENALTY: 0.50, // 50% 가치만 인정
        MID_ANCHOR_PENALTY: 0.80, // 80% 가치만 인정
        ROSTER_CLOG_PENALTY: 0.90, // 로스터 공간 차지 페널티
    }
};

export const SIM_CONFIG = {
    GAME_ENV: {
        BASE_POSSESSIONS: 84,
        HOME_ADVANTAGE: 0.02,
        PACE_SLIDER_IMPACT: 0.035,
        SCORING_MODIFIER: 0.95,
    },
    FATIGUE: {
        DRAIN_BASE: 1.8,
        STAMINA_SAVE_FACTOR: 0.015,
        DURABILITY_FACTOR: 0.005,
        FATIGUE_PENALTY_LOW: 0.02,
        FATIGUE_PENALTY_MED: 0.10,
        FATIGUE_PENALTY_HIGH: 0.25,
        REST_RECOVERY_OFF: 65,
        REST_RECOVERY_B2B: 35,
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
        OUTSIDE_BASE_PCT: 0.38,
        OUTSIDE_DEF_IMPACT: 0.003,
        THREE_BASE_PCT: 0.35,
        THREE_DEF_IMPACT: 0.003,
        OPEN_SHOT_BONUS: 0.05,
        CONTESTED_PENALTY: 0.15,
    },
    STATS: {
        REB_BASE_FACTOR: 0.21,
        AST_BASE_FACTOR: 0.14,
        STL_BASE_FACTOR: 0.036,
        BLK_GUARD_FACTOR: 0.035,
        BLK_BIG_FACTOR: 0.055,
        TOV_USAGE_FACTOR: 0.08,
    }
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
}

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

  const calculateScore = (tactic: OffenseTactic): number => {
      let score = 0;
      switch(tactic) {
        case 'Balance': 
            score = (sAvg('ovr') * 0.4 + sAvg('plm') * 0.2 + sAvg('def') * 0.2 + sAvg('out') * 0.2);
            break;
        case 'PaceAndSpace':
            const handlers = rotation.filter(p => p.position.includes('G'));
            const handlerPLM = handlers.length > 0 ? getAvg(handlers, 'plm') : 60;
            score = (handlerPLM * 0.45) + (sAvg('out') * 0.45) + (sAvg('speed') * 0.1);
            break;
        case 'PerimeterFocus':
            const shooters = [...rotation].sort((a,b) => b.out - a.out);
            score = ((shooters[0]?.out || 70) * 0.35) + ((shooters[1]?.out || 65) * 0.25) + (sAvg('plm') * 0.4);
            break;
        case 'PostFocus':
            const bigs = rotation.filter(p => p.position === 'C' || p.position === 'PF');
            const bigPower = bigs.length > 0 ? (getAvg(bigs, 'postPlay') * 0.5 + getAvg(bigs, 'strength') * 0.3 + (getAvg(bigs, 'height') - 190)) : 50;
            score = (bigPower * 0.7) + (sAvg('ins') * 0.3);
            break;
        case 'Grind':
            score = (sAvg('def') * 0.8) + (sAvg('plm') * 0.2);
            break;
        case 'SevenSeconds':
            const pg = rotation.find(p => p.position === 'PG');
            const pgFactor = pg ? (pg.plm * 0.6 + pg.speed * 0.4) : 60;
            score = (pgFactor * 0.4) + (sAvg('speed') * 0.3) + (sAvg('out') * 0.3);
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

  // AI Logic Updated: Prioritize PerDef and Steal for Ace Stopper
  const bestDefender = healthy.find(p => p.perDef > 85 && p.steal > 80);
  let stopperId: string | undefined = undefined;
  if (bestDefender) {
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

function applyRestToRoster(roster: Player[], daysRest: number): Player[] {
    const C = SIM_CONFIG.FATIGUE;
    return roster.map(p => {
        const currentCond = p.condition !== undefined ? p.condition : 100;
        let recoveryAmount = 0;

        if (daysRest <= 0) {
            recoveryAmount = C.REST_RECOVERY_B2B + (p.stamina * 0.4); 
        } else {
            recoveryAmount = C.REST_RECOVERY_OFF + (p.stamina * 0.5);
        }

        const newCond = Math.min(100, Math.floor(currentCond + recoveryAmount));
        return { ...p, condition: newCond };
    });
}

export function simulateGame(
    homeTeam: Team, 
    awayTeam: Team, 
    userTeamId: string | null, 
    userTactics?: GameTactics,
    homeRestDays: number = 3,
    awayRestDays: number = 3
): SimulationResult {
    const isUserHome = userTeamId === homeTeam.id;
    const isUserAway = userTeamId === awayTeam.id;
    
    const homeRosterRecovered = applyRestToRoster(homeTeam.roster, homeRestDays);
    const awayRosterRecovered = applyRestToRoster(awayTeam.roster, awayRestDays);

    const homeTeamReady = { ...homeTeam, roster: homeRosterRecovered };
    const awayTeamReady = { ...awayTeam, roster: awayRosterRecovered };
    
    const homeTactics = isUserHome && userTactics ? userTactics : generateAutoTactics(homeTeamReady);
    const awayTactics = isUserAway && userTactics ? userTactics : generateAutoTactics(awayTeamReady);
    
    const homeBox = simulateTeamPerformance(homeTeamReady, homeTactics, awayTeamReady, awayTactics, true);
    const awayBox = simulateTeamPerformance(awayTeamReady, awayTactics, homeTeamReady, homeTactics, false);
    
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

    return {
        homeScore,
        awayScore,
        homeBox: homeBox.stats,
        awayBox: awayBox.stats,
        rosterUpdates: { ...homeBox.updates, ...awayBox.updates }
    };
}

function simulateTeamPerformance(
    team: Team, 
    teamTactics: GameTactics, 
    oppTeam: Team, 
    oppTactics: GameTactics, 
    isHome: boolean
): { stats: PlayerBoxScore[], updates: RosterUpdate } {
    const C = SIM_CONFIG;
    const rosterUpdates: RosterUpdate = {};
    const sliders = teamTactics.sliders;
    
    const healthyPlayers = team.roster.filter(p => p.health !== 'Injured').sort((a,b) => b.ovr - a.ovr);
    
    const starterIds = Object.values(teamTactics.starters);
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
        if (tactic === 'PaceAndSpace') { tacticPerimeterBonus += 0.08; tacticPaceBonus += 0.05; tacticDrainMult += 0.1; } 
        else if (tactic === 'PerimeterFocus') { tacticPerimeterBonus += 0.06; }
        else if (tactic === 'PostFocus') { tacticInteriorBonus += 0.08; tacticPaceBonus -= 0.05; }
        else if (tactic === 'SevenSeconds') { tacticPerimeterBonus += 0.10; tacticPaceBonus += 0.14; tacticDrainMult += 0.15; } 
        else if (tactic === 'Grind') { tacticPaceBonus -= 0.20; }
      });
      
      teamTactics.defenseTactics.forEach(tactic => {
          if (tactic === 'ManToManPerimeter') { tacticDrainMult += 0.05; }
          else if (tactic === 'AceStopper') { tacticDrainMult += 0.05; } 
      });
    }
    paceMultiplier += tacticPaceBonus;

    const teamFgaTarget = (C.GAME_ENV.BASE_POSSESSIONS + (Math.random() * 8) + (isHome ? 2 : 0)) * C.GAME_ENV.SCORING_MODIFIER * paceMultiplier;
    const hastePenalty = paceMultiplier > 1.15 ? (paceMultiplier - 1.15) * 0.6 : 0;

    const oppZoneEffect = (oppSliders.zoneUsage - 5) * 2.0; 
    oppDefMetrics.intDef += oppZoneEffect; 
    oppDefMetrics.perDef -= oppZoneEffect; 

    const acePlayer = healthyPlayers.reduce((prev, current) => (prev.ovr > current.ovr) ? prev : current, healthyPlayers[0] || { ovr: 0, id: 'dummy' });

    const totalUsageWeight = healthyPlayers.reduce((sum, p) => {
        const mp = minutesMap[p.id] || 0;
        let w = Math.pow(p.ovr, 3) * (p.offConsist / 50) * mp; 
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

      if (mp > 0) {
          const staminaFactor = Math.max(0.25, C.FATIGUE.DRAIN_BASE - (p.stamina * C.FATIGUE.STAMINA_SAVE_FACTOR)); 
          const durabilityFactor = 1 + (80 - p.durability) * C.FATIGUE.DURABILITY_FACTOR;
          const baseDrain = mp * staminaFactor * durabilityFactor;
          
          const sliderIntensity = (sliders.pace + sliders.defIntensity + sliders.fullCourtPress) / 15; 
          let drain = baseDrain * sliderIntensity * tacticDrainMult;
          
          const threshold = p.stamina * 0.4;
          if (mp > threshold) {
              const overMinutes = mp - threshold;
              drain += overMinutes * 0.5;
          }

          isStopper = teamTactics?.defenseTactics.includes('AceStopper') && teamTactics.stopperId === p.id;
          if (isStopper) drain *= 1.25;

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
      const effectivePerfDrop = (fatiguePerfPenalty + inGameFatiguePenalty) * (1 - (mentalFortitude * 0.5));

      let pUsage = (Math.pow(p.ovr, 3) * (p.offConsist / 50) * mp * (p.shotIq / 75));
      if (teamTactics?.offenseTactics.includes('PostFocus')) {
          if (p.position === 'C' || p.position === 'PF') pUsage *= 1.4;
          if (p.closeShot > 80) pUsage *= 1.1;
      } 
      if (teamTactics?.offenseTactics.includes('PerimeterFocus') && (p.position === 'PG' || p.position === 'SG')) pUsage *= 1.4;
      
      let fga = Math.round(teamFgaTarget * (pUsage / totalUsageWeight));

      const insideAbility = (p.layup * 0.25 + p.dunk * 0.15 + p.postPlay * 0.15 + p.closeShot * 0.25 + p.strength * 0.10 + p.vertical * 0.10) * tacticInteriorBonus * (1 - effectivePerfDrop);
      const threeAvg = (p.threeCorner + p.three45 + p.threeTop) / 3;
      const outsideAbility = (p.midRange * 0.3 + threeAvg * 0.5 + p.shotIq * 0.2) * tacticPerimeterBonus * (1 - effectivePerfDrop);

      let insideBias = 0.5;
      if (['C', 'PF'].includes(p.position)) insideBias = 0.75;
      if (threeAvg > 85) insideBias -= 0.25; 
      if (p.dunk > 90) insideBias += 0.1;    

      const mentalClutchBonus = Math.max(0, (p.intangibles - 75) * 0.001); 

      const insideSuccessRate = Math.min(0.85, Math.max(0.35, 
        C.SHOOTING.INSIDE_BASE_PCT 
        + (insideAbility - oppDefMetrics.intDef) * C.SHOOTING.INSIDE_DEF_IMPACT 
        - (oppDefMetrics.block * 0.001) 
        - (hastePenalty * 0.5) 
        + mentalClutchBonus 
        + homeAdvantageModifier
      ));

      const outsideSuccessRate = Math.min(0.60, Math.max(0.25, 
        C.SHOOTING.OUTSIDE_BASE_PCT 
        + (outsideAbility - oppDefMetrics.perDef) * C.SHOOTING.OUTSIDE_DEF_IMPACT 
        - (oppDefMetrics.pressure * 0.001) 
        - (oppDefMetrics.helpDef * 0.001) 
        - hastePenalty 
        + mentalClutchBonus 
        + homeAdvantageModifier
      ));

      let fgp = (insideSuccessRate * insideBias) + (outsideSuccessRate * (1 - insideBias));
      fgp *= (1.0 - effectivePerfDrop); 
      
      const oppHasStopper = oppTactics?.defenseTactics.includes('AceStopper');
      isAceTarget = !!(oppHasStopper && p.id === acePlayer.id);

      if (isAceTarget && oppTactics?.stopperId) {
          const stopper = oppTeam.roster.find(d => d.id === oppTactics.stopperId);
          if (stopper) {
              // UPDATED LOGIC: PerDef determines FGP impact (+10% to -27%)
              // Low PerDef (40) -> +10% bonus to Ace
              // High PerDef (99) -> -27% penalty to Ace
              const perDef = stopper.perDef || 50;
              let fgpImpact = 10 - ((perDef - 40) * 0.63);
              fgpImpact = Math.max(-27, Math.min(10, fgpImpact)); 

              fgp *= (1.0 + (fgpImpact / 100));
              matchupEffect = Math.round(fgpImpact);
          }
      }

      const fgm = Math.round(fga * fgp);

      const p3Tendency = (threeAvg / 100) * (teamTactics?.offenseTactics.includes('PaceAndSpace') || teamTactics?.offenseTactics.includes('SevenSeconds') ? 1.4 : 1.0);
      let p3a = Math.round(fga * p3Tendency * 0.55); 
      const p3p = Math.min(0.50, Math.max(0.20, 
         C.SHOOTING.THREE_BASE_PCT 
         + ((threeAvg - oppDefMetrics.perDef) * C.SHOOTING.THREE_DEF_IMPACT) 
         - effectivePerfDrop 
         - (hastePenalty * 0.8) 
         + (mentalClutchBonus * 0.5) 
         + (homeAdvantageModifier * 0.8)
      )); 
      
      let p3m = Math.round(p3a * p3p);
      if (p3a > fga) p3a = fga; 
      if (p3m > p3a) p3m = p3a;
      if (p3m > fgm) p3m = fgm; 

      const drawFoulRate = (p.drawFoul * 0.6 + p.agility * 0.2 + insideBias * 20) / 400;
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

      const astAttr = (p.passAcc * 0.3 + p.passVision * 0.4 + p.passIq * 0.2 + p.handling * 0.1);
      let astBase = astAttr * (mp / 48) * C.STATS.AST_BASE_FACTOR;
      
      if (p.position === 'PG') astBase *= 1.4;
      if (p.position === 'SG') astBase *= 1.1;
      
      if (teamTactics?.offenseTactics.includes('SevenSeconds') || teamTactics?.offenseTactics.includes('PaceAndSpace')) {
          astBase *= 1.1;
      }
      const ast = Math.round(astBase * (Math.random() * 0.5 + 0.75));

      const stlAttr = (p.steal * 0.5 + p.perDef * 0.3 + p.hustle * 0.2);
      const stlIntensity = 1 + (sliders.defIntensity - 5) * 0.06;
      let stlBase = stlAttr * (mp / 48) * C.STATS.STL_BASE_FACTOR * stlIntensity;
      if (p.position === 'PG' || p.position === 'SG') stlBase *= 1.1; 
      const stl = Math.round(stlBase * (Math.random() * 0.5 + 0.75));

      const blkAttr = (p.blk * 0.6 + p.vertical * 0.2 + p.height * 0.2);
      let blkFactor = 0.035; 
      if (p.position === 'C') blkFactor = C.STATS.BLK_BIG_FACTOR;
      else if (p.position === 'PF') blkFactor = 0.045;
      const blk = Math.round(blkAttr * (mp / 48) * blkFactor * (Math.random() * 0.6 + 0.7));

      const usageProxy = (fga + ast * 2 + 5);
      const tovAttr = (100 - p.handling) * 0.02 + (100 - p.passIq) * 0.02;
      const tovBase = (usageProxy * C.STATS.TOV_USAGE_FACTOR) + (tovAttr * 0.05); 
      let tov = Math.round(tovBase * (mp / 48) * (Math.random() * 0.5 + 0.7));

      // UPDATED LOGIC: Steal increases TOV up to 40%
      if (isAceTarget && oppTactics?.stopperId) {
          const stopper = oppTeam.roster.find(d => d.id === oppTactics.stopperId);
          if (stopper) {
              const stealRating = stopper.steal || 50;
              // Max 40% increase at 100 steal rating
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
          mp, g: 1, gs: starterIds.includes(p.id) ? 1 : 0,
          isStopper,
          isAceTarget,
          matchupEffect
      });
    });

    return { stats: boxScores, updates: rosterUpdates };
}

export function getPlayerTradeValue(p: Player): number {
    const C = TRADE_CONFIG;

    const effectiveOvr = Math.max(C.BASE.REPLACEMENT_LEVEL_OVR, p.ovr);
    let baseValue = Math.pow(effectiveOvr - C.BASE.REPLACEMENT_LEVEL_OVR, C.BASE.VALUE_EXPONENT);

    if (p.age <= C.AGE.YOUNG_LIMIT && p.potential >= C.AGE.HIGH_POT_THRESHOLD) {
        const potBonus = 1.0 + ((p.potential - C.AGE.HIGH_POT_THRESHOLD) * C.AGE.YOUNG_POT_BONUS); 
        baseValue *= potBonus;
    }
    else if (p.age >= C.AGE.PRIME_START && p.age <= C.AGE.PRIME_END) {
        baseValue *= C.AGE.PRIME_BONUS;
    }
    else if (p.age >= C.AGE.OLD_START) {
        const agePenalty = 1.0 - ((p.age - (C.AGE.OLD_START - 1)) * C.AGE.OLD_PENALTY_PER_YEAR); 
        baseValue *= Math.max(C.AGE.MIN_OLD_VALUE, agePenalty);
    }
    
    return Math.floor(baseValue);
}

function getTeamNeeds(team: Team): { needs: string[], strengths: string[] } {
    const C = TRADE_CONFIG.NEEDS;
    const top8 = [...team.roster].sort((a,b) => b.ovr - a.ovr).slice(0, 8);
    
    if (top8.length === 0) return { needs: [], strengths: [] };

    const avg = (attr: keyof Player) => top8.reduce((sum, p) => sum + (p[attr] as number), 0) / top8.length;

    const stats = {
        ins: avg('ins'),
        out: avg('out'),
        plm: avg('plm'),
        def: avg('def'),
        reb: avg('reb')
    };

    const needs: string[] = [];
    const strengths: string[] = [];

    if (stats.ins < C.WEAKNESS_THRESHOLD) needs.push('ins');
    if (stats.out < C.WEAKNESS_THRESHOLD + C.OUTSIDE_OFFSET) needs.push('out');
    if (stats.plm < C.WEAKNESS_THRESHOLD) needs.push('plm');
    if (stats.def < C.WEAKNESS_THRESHOLD) needs.push('def');
    if (stats.reb < C.WEAKNESS_THRESHOLD + C.REBOUND_OFFSET) needs.push('reb');

    if (stats.ins > C.STRENGTH_THRESHOLD) strengths.push('ins');
    if (stats.out > C.STRENGTH_THRESHOLD + C.OUTSIDE_OFFSET) strengths.push('out');
    if (stats.plm > C.STRENGTH_THRESHOLD) strengths.push('plm');
    if (stats.def > C.STRENGTH_THRESHOLD) strengths.push('def');
    if (stats.reb > C.STRENGTH_THRESHOLD + C.REBOUND_OFFSET) strengths.push('reb');

    return { needs, strengths };
}

function getContextualTradeValue(player: Player, teamContext: Team, isAcquiring: boolean): number {
    const C = TRADE_CONFIG.CONTEXT;
    let value = getPlayerTradeValue(player);
    const { needs } = getTeamNeeds(teamContext);
    
    const sortedRoster = [...teamContext.roster].sort((a,b) => b.ovr - a.ovr);
    const rank = sortedRoster.findIndex(p => p.id === player.id);

    if (isAcquiring) {
        let fitBonus = 1.0;
        if (needs.includes('ins') && player.ins > 78) fitBonus += C.FIT_BONUS;
        if (needs.includes('out') && player.out > 78) fitBonus += C.FIT_BONUS;
        if (needs.includes('plm') && player.plm > 78) fitBonus += C.FIT_BONUS;
        if (needs.includes('def') && player.def > 78) fitBonus += C.FIT_BONUS;
        if (needs.includes('reb') && player.reb > 75) fitBonus += C.FIT_BONUS;
        
        const playersAtPos = sortedRoster.filter(p => p.position === player.position).length;
        if (playersAtPos >= 3) fitBonus -= C.REDUNDANCY_PENALTY;

        const wouldBeRank = sortedRoster.filter(p => p.ovr > player.ovr).length;
        
        if (wouldBeRank === 0) fitBonus += C.NEW_ALPHA_BONUS;      
        else if (wouldBeRank === 1) fitBonus += C.NEW_SECOND_BONUS;
        else if (wouldBeRank === 2) fitBonus += C.NEW_CORE_BONUS; 

        value *= fitBonus;
    } else {
        let retentionPremium = 1.0;
        if (rank === 0) retentionPremium = C.PROTECT_ALPHA_MULT;      
        else if (rank === 1) retentionPremium = C.PROTECT_SECOND_MULT;
        else if (rank >= 2 && rank <= 4) retentionPremium = C.PROTECT_STARTER_MULT; 
        
        value *= retentionPremium;
    }

    return value;
}

export function generateTradeOffers(players: Player[], myTeam: Team, allTeams: Team[]): TradeOffer[] {
    const C = TRADE_CONFIG.ACCEPTANCE;
    const D = TRADE_CONFIG.DILUTION; // 가치 희석 관련 설정
    const offers: TradeOffer[] = [];
    if (players.length === 0) return offers;

    const mySalary = players.reduce((sum, p) => sum + p.salary, 0);

    allTeams.forEach(targetTeam => {
        if (targetTeam.id === myTeam.id) return;

        let userPackageValueToAI = 0;
        let maxUserOvr = 0; // 패키지 내 최고 OVR 추적

        players.forEach(p => {
            userPackageValueToAI += getContextualTradeValue(p, targetTeam, true);
            if (p.ovr > maxUserOvr) maxUserOvr = p.ovr;
        });

        // ==========================================
        //  [NEW] Quality Over Quantity Penalty Logic
        // ==========================================
        if (players.length >= D.PACKAGE_SIZE_TRIGGER) {
            // 1. 앵커(에이스급) 부재 페널티
            if (maxUserOvr < D.ANCHOR_OVR_LOW) {
                userPackageValueToAI *= D.LOW_ANCHOR_PENALTY; // 가치 50% 삭감 (쓰레기 덤핑 방지)
            } else if (maxUserOvr < D.ANCHOR_OVR_MID) {
                userPackageValueToAI *= D.MID_ANCHOR_PENALTY; // 가치 20% 삭감 (롤플레이어 모음 방지)
            }

            // 2. 로스터 클로깅 페널티 (단순 머릿수 채우기 방지)
            const lowTierCount = players.filter(p => p.ovr < 75).length;
            if (lowTierCount >= 2) {
                userPackageValueToAI *= D.ROSTER_CLOG_PENALTY;
            }
        }
        // ==========================================

        const candidates = [...targetTeam.roster].sort((a,b) => a.ovr - b.ovr);
        
        for (let i = 0; i < 25; i++) {
            const count = Math.floor(Math.random() * 3) + 1;
            const tradePack: Player[] = [];
            const visited = new Set<number>();
            
            for (let k = 0; k < count; k++) {
                const idx = Math.floor(Math.random() * candidates.length);
                if (!visited.has(idx)) {
                    visited.add(idx);
                    tradePack.push(candidates[idx]);
                }
            }
            
            let aiPackageCost = 0;
            let targetSalary = 0;
            tradePack.forEach(p => {
                aiPackageCost += getContextualTradeValue(p, targetTeam, false);
                targetSalary += p.salary;
            });

            const isSalaryMatch = Math.abs(mySalary - targetSalary) < 5 || (targetSalary >= mySalary * 0.8 && targetSalary <= mySalary * 1.25);
            if (!isSalaryMatch) continue;

            let requiredRatio = C.DEFAULT_RATIO;

            if (tradePack.length === players.length && userPackageValueToAI > C.HIGH_VALUE_THRESHOLD) { 
                 requiredRatio = C.STAR_SWAP_RATIO;
            }

            if (userPackageValueToAI >= aiPackageCost * requiredRatio) {
                const isDup = offers.some(o => o.teamId === targetTeam.id && o.players.length === tradePack.length && o.players.every(p => tradePack.some(tp => tp.id === p.id)));
                if (!isDup) {
                    const rawUserVal = players.reduce((s,p) => s + getPlayerTradeValue(p), 0);
                    const rawTargetVal = tradePack.reduce((s,p) => s + getPlayerTradeValue(p), 0);
                    
                    offers.push({
                        teamId: targetTeam.id,
                        teamName: targetTeam.name,
                        players: tradePack,
                        diffValue: rawTargetVal - rawUserVal 
                    });
                }
            }
        }
    });

    return offers.sort((a,b) => b.diffValue - a.diffValue).slice(0, 5);
}

export function generateCounterOffers(wantedPlayers: Player[], targetTeam: Team, myTeam: Team): TradeOffer[] {
    const C = TRADE_CONFIG.ACCEPTANCE;
    const requirements: TradeOffer[] = [];
    
    let wantedValueToAI = 0;
    let wantedSalary = 0;
    wantedPlayers.forEach(p => {
        wantedValueToAI += getContextualTradeValue(p, targetTeam, false);
        wantedSalary += p.salary;
    });

    const myCandidates = [...myTeam.roster].sort((a,b) => b.ovr - a.ovr);

    for (let i = 0; i < 35; i++) { 
        let count = Math.floor(Math.random() * 3) + 1;
        
        if (wantedPlayers.length === 1 && Math.random() < 0.6) {
            count = 1; 
        }

        const tradePack: Player[] = [];
        const visited = new Set<number>();
        
        const isHighValueTrade = wantedValueToAI > C.HIGH_VALUE_THRESHOLD; 
        
        for (let k = 0; k < count; k++) {
             let idx;
             if (isHighValueTrade && k === 0 && Math.random() < 0.7) {
                 idx = Math.floor(Math.random() * 5); 
             } else {
                 idx = Math.floor(Math.random() * myCandidates.length);
             }
             
             if (!visited.has(idx) && myCandidates[idx]) {
                 visited.add(idx);
                 tradePack.push(myCandidates[idx]);
             }
        }
        
        if (tradePack.length === 0) continue;

        let myPackValueToAI = 0;
        let myPackSalary = 0;
        tradePack.forEach(p => {
            myPackValueToAI += getContextualTradeValue(p, targetTeam, true);
            myPackSalary += p.salary;
        });

        const isSalaryMatch = Math.abs(wantedSalary - myPackSalary) < 5 || (myPackSalary >= wantedSalary * 0.8 && myPackSalary <= wantedSalary * 1.25);
        if (!isSalaryMatch) continue;

        let requiredRatio = 1.0;
        
        if (tradePack.length === 1 && wantedPlayers.length === 1) {
            const myP = tradePack[0];
            const targetP = wantedPlayers[0];
            if (myP.ovr >= C.STAR_OVR_THRESHOLD && targetP.ovr >= C.STAR_OVR_THRESHOLD) {
                requiredRatio = C.STAR_SWAP_RATIO; 
                
                if (myP.ovr >= targetP.ovr + 3) {
                    requiredRatio = C.STAR_SWAP_STEAL_RATIO; 
                }
            }
        }

        if (tradePack.length > wantedPlayers.length) {
            requiredRatio += (tradePack.length - wantedPlayers.length) * C.CONSOLIDATION_TAX; 
        }

        if (myPackValueToAI >= wantedValueToAI * requiredRatio) {
             const isDup = requirements.some(r => r.players.length === tradePack.length && r.players.every(p => tradePack.some(tp => tp.id === p.id)));
             if (!isDup) {
                 const rawUserVal = tradePack.reduce((s,p) => s + getPlayerTradeValue(p), 0);
                 const rawTargetVal = wantedPlayers.reduce((s,p) => s + getPlayerTradeValue(p), 0);

                 if (rawUserVal > rawTargetVal * 1.5) continue; 

                 requirements.push({
                     teamId: myTeam.id,
                     teamName: myTeam.name,
                     players: tradePack,
                     diffValue: rawUserVal - rawTargetVal 
                 });
             }
        }
    }

    return requirements.sort((a,b) => a.diffValue - b.diffValue).slice(0, 5); 
}
