
import { Team, Player, PlayerBoxScore, TacticalSnapshot, GameTactics, RosterUpdate, SimulationResult } from '../types';
import { SIM_CONFIG, POSITION_PENALTY_MAP } from './game/config/constants';
import { stableSort, distributeMinutes } from './game/tactics/minutesManager';
import { generateAutoTactics } from './game/tactics/tacticGenerator';

// Modularized Systems
import { calculateFatigueAndInjury } from './game/engine/fatigueSystem';
import { getOpponentDefensiveMetrics, calculateDefenseStats } from './game/engine/defenseSystem';
import { calculatePlaymakingStats } from './game/engine/playmakingSystem';
import { calculateShootingStats } from './game/engine/shootingSystem';
import { calculateFoulStats } from './game/engine/foulSystem';

// ==========================================================================================
//  🏀 NBA GM SIMULATOR - GAME ENGINE (CORE)
//  Focus: Game Physics Loop & Stats Generation
//  Dependencies: Config, TacticsManager, MinutesManager, Sub-Systems
// ==========================================================================================

export { generateAutoTactics }; // Re-export for App.tsx consumption

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
    
    // Prevent Draws
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
    
    // 1. Setup Team Minutes
    const healthyPlayers = team.roster.filter(p => p.health !== 'Injured').sort(stableSort);
    const starterIdsMap = teamTactics.starters; 
    const starterIds = Object.values(starterIdsMap);
    const isStarter = healthyPlayers.map(p => starterIds.includes(p.id));
    const finalMinutesList = distributeMinutes(healthyPlayers, isStarter, teamTactics.minutesLimits, sliders);
    
    // 2. Setup Opponent Metrics (for Matchup logic)
    const oppSliders = oppTactics.sliders;
    const oppSorted = oppTeam.roster.filter(p => p.health !== 'Injured').sort(stableSort);
    const oppStarterIds = Object.values(oppTactics.starters);
    const oppIsStarter = oppSorted.map(p => oppStarterIds.includes(p.id));
    const oppMinsEst = distributeMinutes(oppSorted, oppIsStarter, oppTactics.minutesLimits, oppSliders);
    
    const oppMinutesMap: Record<string, number> = {};
    oppSorted.forEach((p, i) => { oppMinutesMap[p.id] = oppMinsEst[i]; });

    // Calculate aggregated defense metrics of opponent
    const oppDefMetrics = getOpponentDefensiveMetrics(oppSorted, oppMinsEst, oppSliders.zoneUsage);

    // 3. Environmental Modifiers
    const homeAdvantageModifier = isHome ? C.GAME_ENV.HOME_ADVANTAGE : -(C.GAME_ENV.HOME_ADVANTAGE * 0.8);

    let paceMultiplier = 1.0 + (sliders.pace - 5) * C.GAME_ENV.PACE_SLIDER_IMPACT; 
    paceMultiplier += (sliders.fullCourtPress - 5) * 0.015;
    
    let tacticPaceBonus = 0.0;      
    let tacticDrainMult = 1.0;      

    if (teamTactics) {
      teamTactics.offenseTactics.forEach(tactic => {
        if (tactic === 'PaceAndSpace') { tacticPaceBonus += 0.03; tacticDrainMult += 0.1; } 
        else if (tactic === 'PostFocus') { tacticPaceBonus -= 0.03; } 
        else if (tactic === 'SevenSeconds') { tacticPaceBonus += 0.08; tacticDrainMult += 0.15; } 
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

    // Identify Ace Player for Stopper Logic
    const acePlayer = healthyPlayers.reduce((prev, current) => (prev.ovr > current.ovr) ? prev : current, healthyPlayers[0] || { ovr: 0, id: 'dummy' });

    // 4. Calculate Usage Weights (Initial)
    const totalUsageWeight = healthyPlayers.reduce((sum, p, i) => {
        const mp = finalMinutesList[i];
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

    // 5. Player Loop
    healthyPlayers.forEach((p, i) => {
      let mp = finalMinutesList[i];
      const isStopper = teamTactics?.defenseTactics.includes('AceStopper') && teamTactics.stopperId === p.id;
      
      // 5-0. Foul System Calculation
      // Find a matchup proxy from opponent starters based on position
      // OR if Ace Stopper, find the actual opponent Ace
      let matchupTarget = oppSorted.find(op => op.position === p.position && oppMinutesMap[op.id] > 10) || oppSorted[0];
      
      if (isStopper) {
          // If this player is the Ace Stopper, they are matched up against the Opponent's Ace (highest OVR)
          // Regardless of position mismatch
          matchupTarget = oppSorted.reduce((prev, curr) => (prev.ovr > curr.ovr) ? prev : curr, oppSorted[0]);
      }
      
      const { pf, adjustedMinutes } = calculateFoulStats(
          p, mp, 
          { defense: teamTactics.defenseTactics }, 
          { offense: oppTactics.offenseTactics },
          sliders, // Pass sliders to foul system
          matchupTarget,
          isStopper // Pass isStopper flag
      );
      
      // If fouled out, reduce minutes played for subsequent stat calculations
      mp = adjustedMinutes;

      // 5-1. Fatigue System
      const fatigueResult = calculateFatigueAndInjury(p, mp, sliders, tacticDrainMult, isB2B, isStopper);
      rosterUpdates[p.id] = {
          condition: fatigueResult.newCondition,
          health: fatigueResult.newHealth,
          injuryType: fatigueResult.injuryType,
          returnDate: fatigueResult.returnDate
      };

      if (mp <= 0) {
          boxScores.push({
            playerId: p.id, playerName: p.name, pts: 0, reb: 0, offReb: 0, defReb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, rimM: 0, rimA: 0, midM: 0, midA: 0, mp: 0, g: 1, gs: 0, pf: 0
          });
          return;
      }

      // 5-2. Calculate Contextual Performance Drop
      // Position Mismatch Penalty
      let positionPenalty = 0;
      const assignedSlot = Object.entries(starterIdsMap).find(([slot, id]) => id === p.id)?.[0];
      if (assignedSlot) {
          const playerPos = p.position; 
          const isMatch = (playerPos === assignedSlot) ||
                          (playerPos === 'G' && (assignedSlot === 'PG' || assignedSlot === 'SG')) ||
                          (playerPos === 'F' && (assignedSlot === 'SF' || assignedSlot === 'PF'));
          
          if (!isMatch) {
              positionPenalty = POSITION_PENALTY_MAP[playerPos]?.[assignedSlot] || 0;
          }
      }

      const mentalFortitude = (p.intangibles || 50) / 100;
      const effectivePerfDrop = Math.min(1.0, (fatigueResult.fatiguePerfPenalty + fatigueResult.inGameFatiguePenalty + positionPenalty) * (1 - (mentalFortitude * 0.5)));
      const mentalClutchBonus = Math.max(0, (p.intangibles - 75) * 0.001); 

      // 5-3. Usage & FGA Calculation (Adjusted by minutes)
      let pUsage = (Math.pow(p.ovr, 2.75) * (p.offConsist / 50) * mp * (p.shotIq / 75));
      if (teamTactics?.offenseTactics.includes('PostFocus')) {
          if (p.position === 'C' || p.position === 'PF') pUsage *= 1.4;
          if (p.closeShot > 80) pUsage *= 1.1;
      } 
      if (teamTactics?.offenseTactics.includes('PerimeterFocus') && (p.position === 'PG' || p.position === 'SG')) pUsage *= 1.4;
      
      // Re-normalize target based on actual minutes played ratio vs expected team total
      // Simulating "If I play less, I shoot less"
      const fga = Math.round(teamFgaTarget * (pUsage / totalUsageWeight));

      // 5-4. Prepare Opponent Stopper Info
      const oppHasStopper = oppTactics?.defenseTactics.includes('AceStopper');
      const oppStopperId = oppTactics?.stopperId;
      const oppStopper = oppStopperId ? oppTeam.roster.find(d => d.id === oppStopperId) : undefined;
      const oppStopperMP = oppStopperId ? (oppMinutesMap[oppStopperId] || 0) : 0;

      // 5-5. Shooting System
      const shootingRes = calculateShootingStats(
          p, mp, fga, 
          { offense: teamTactics.offenseTactics },
          { effectivePerfDrop, homeAdvantage: homeAdvantageModifier, hastePenalty, mentalClutchBonus },
          oppDefMetrics,
          oppHasStopper, oppStopperId, acePlayer.id,
          oppStopper, oppStopperMP
      );

      // 5-6. Defense System
      const defRes = calculateDefenseStats(p, mp, sliders, effectivePerfDrop);

      // 5-7. Playmaking System
      const plmRes = calculatePlaymakingStats(
          p, mp, fga, 
          { offense: teamTactics.offenseTactics }, 
          sliders, 
          shootingRes.isAceTarget, 
          oppStopper, 
          effectivePerfDrop
      );

      boxScores.push({
          playerId: p.id,
          playerName: p.name,
          pts: shootingRes.pts, 
          reb: defRes.reb, offReb: defRes.offReb, defReb: defRes.defReb, 
          ast: plmRes.ast, 
          stl: defRes.stl, 
          blk: defRes.blk, 
          tov: plmRes.tov,
          fgm: shootingRes.fgm, fga: shootingRes.fga, 
          p3m: shootingRes.p3m, p3a: shootingRes.p3a, 
          ftm: shootingRes.ftm, fta: shootingRes.fta,
          rimM: shootingRes.rimM, rimA: shootingRes.rimA, 
          midM: shootingRes.midM, midA: shootingRes.midA, 
          mp, g: 1, gs: starterIds.includes(p.id) ? 1 : 0,
          pf: pf, // Added PF
          isStopper,
          isAceTarget: shootingRes.isAceTarget,
          matchupEffect: shootingRes.matchupEffect,
          zoneData: shootingRes.zoneData // Pass detailed zone stats to box score
      });
    });

    return { stats: boxScores, updates: rosterUpdates };
}
