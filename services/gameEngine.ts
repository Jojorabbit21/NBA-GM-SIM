
import { Team, Player, PlayerBoxScore, TacticalSnapshot, GameTactics, RosterUpdate, SimulationResult } from '../types';
import { SIM_CONFIG, POSITION_PENALTY_MAP } from './game/config/constants';
import { stableSort, distributeMinutes } from './game/tactics/minutesManager';
import { generateAutoTactics } from './game/tactics/tacticGenerator';

// ==========================================================================================
//  🏀 NBA GM SIMULATOR - GAME ENGINE (CORE)
//  Focus: Game Physics Loop & Stats Generation
//  Dependencies: Config, TacticsManager, MinutesManager
// ==========================================================================================

export { generateAutoTactics }; // Re-export for App.tsx consumption

// ------------------------------------------------------------------------------------------
//  SIMULATION LOOP
// ------------------------------------------------------------------------------------------

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
    
    const healthyPlayers = team.roster.filter(p => p.health !== 'Injured').sort(stableSort);
    
    const starterIdsMap = teamTactics.starters; // { PG: 'id', SG: 'id'... }
    const starterIds = Object.values(starterIdsMap);
    const isStarter = healthyPlayers.map(p => starterIds.includes(p.id));

    const finalMinutesList = distributeMinutes(healthyPlayers, isStarter, teamTactics.minutesLimits, sliders);
    
    const minutesMap: Record<string, number> = {};
    healthyPlayers.forEach((p, i) => {
        minutesMap[p.id] = finalMinutesList[i];
    });
    
    // Opponent Minutes (Estimate to help with defense metrics)
    const oppSliders = oppTactics.sliders;
    // [Fix] Use stableSort to ensure deterministic opponent minutes mapping
    const oppSorted = oppTeam.roster.filter(p => p.health !== 'Injured').sort(stableSort);
    const oppStarterIds = Object.values(oppTactics.starters);
    const oppIsStarter = oppSorted.map(p => oppStarterIds.includes(p.id));
    const oppMinsEst = distributeMinutes(oppSorted, oppIsStarter, oppTactics.minutesLimits, oppSliders);
    
    const oppMinutesMap: Record<string, number> = {};
    oppSorted.forEach((p, i) => {
        oppMinutesMap[p.id] = oppMinsEst[i];
    });

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
          
          // [System Update] Workload Penalty based on Minutes Played
          let workloadMult = 1.0;
          if (mp <= 15) workloadMult = 1.0;
          else if (mp <= 25) workloadMult = 1.1;
          else if (mp <= 32) workloadMult = 1.2;
          else if (mp <= 36) workloadMult = 1.35;
          else if (mp <= 40) workloadMult = 1.6;
          else workloadMult = 1.8; // 40+ min (Overwork)

          drain *= workloadMult;
          
          // [System Update] Apply Back-to-Back Penalty (1.5x drain)
          if (isB2B) {
              drain *= 1.5;
          }

          // [Ace Stopper Fix] Only drain extra stamina if playing significant minutes
          // If Stopper plays 0 or very few minutes, the drain is naturally low via mp, 
          // but we shouldn't apply extra multiplier for "chasing ace" if they aren't on court much.
          isStopper = teamTactics?.defenseTactics.includes('AceStopper') && teamTactics.stopperId === p.id;
          if (isStopper && mp > 5) drain *= 1.25;

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

      // 5. Stopper Effect [FIXED Logic]
      const oppHasStopper = oppTactics?.defenseTactics.includes('AceStopper');
      // Only set isAceTarget if this player IS the Ace AND opponent has a stopper ASSIGNED.
      isAceTarget = !!(oppHasStopper && p.id === acePlayer.id && oppTactics.stopperId);

      if (isAceTarget && oppTactics?.stopperId) {
          const stopperId = oppTactics.stopperId;
          const stopper = oppTeam.roster.find(d => d.id === stopperId);
          // Check Stopper Minutes from Map
          const stopperMP = oppMinutesMap[stopperId] || 0;
          const aceMP = mp;

          if (stopper && stopperMP > 0) {
              const perDef = stopper.perDef || 50;
              let rawImpact = 10 - ((perDef - 40) * 0.63); // Negative value means diffculty increased
              
              // Calculate Overlap Factor (Minute Differential Logic)
              // If Stopper plays 15 mins and Ace plays 35 mins -> Overlap ratio is ~0.42
              // Effective Impact should be reduced.
              let overlapRatio = stopperMP >= aceMP ? 1.0 : (stopperMP / aceMP);
              
              // [Logic Update] If Ace plays significantly more than stopper (e.g. +10 mins), 
              // they get a "Freedom Bonus" for the non-guarded minutes.
              let freedomBonus = 0;
              if (aceMP > stopperMP + 8) {
                  freedomBonus = 5; // +5% FG effectiveness due to exploiting bench/switch matchups
              }

              // Final Impact = (Negative Impact * Overlap) + Freedom Bonus
              let adjustedImpact = (rawImpact * overlapRatio) + freedomBonus;

              // Cap impact
              adjustedImpact = Math.max(-27, Math.min(10, adjustedImpact)); 
              matchupEffect = Math.round(adjustedImpact);
              
              // Apply reduction/boost to makes
              const factor = (1.0 + (matchupEffect / 100));
              rimM = Math.round(rimM * factor);
              midM = Math.round(midM * factor);
              p3m = Math.round(p3m * factor);
          } else {
              // Stopper assigned but didn't play (0 minutes) -> No Effect
              matchupEffect = 0;
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
