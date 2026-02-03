
import { Team, Player, PlayerBoxScore, TacticalSnapshot, GameTactics, RosterUpdate, SimulationResult } from '../types';
import { SIM_CONFIG, POSITION_PENALTY_MAP } from './game/config/constants';
import { stableSort, distributeMinutes } from './game/tactics/minutesManager';
import { generateAutoTactics } from './game/tactics/tacticGenerator';

// Modularized Systems
import { calculateFatigueAndInjury } from './game/engine/fatigueSystem';
import { getOpponentDefensiveMetrics, calculateDefenseStats, distributeRebounds } from './game/engine/defenseSystem';
import { calculatePlaymakingStats, distributeAssists } from './game/engine/playmakingSystem';
import { calculateShootingStats } from './game/engine/shootingSystem';
import { calculateFoulStats } from './game/engine/foulSystem';
import { PlayerSimContext } from './game/engine/types';

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
    
    // --- Phase 1: Individual Simulation (Shooting & Potentials) ---
    // Calculates points, fouls, fatigue, and *weights* for reb/ast
    const homeSim = simulateTeamPhase1(homeTeam, homeTactics, awayTeam, awayTactics, true, isHomeB2B);
    const awaySim = simulateTeamPhase1(awayTeam, awayTactics, homeTeam, homeTactics, false, isAwayB2B);

    // --- Phase 2: Aggregation & Context Calculation ---
    const homeFGM = homeSim.reduce((s, p) => s + p.stats.fgm, 0);
    const awayFGM = awaySim.reduce((s, p) => s + p.stats.fgm, 0);
    
    const homeFGA = homeSim.reduce((s, p) => s + p.stats.fga, 0);
    const awayFGA = awaySim.reduce((s, p) => s + p.stats.fga, 0);
    
    const homeFTM = homeSim.reduce((s, p) => s + p.stats.ftm, 0);
    const awayFTM = awaySim.reduce((s, p) => s + p.stats.ftm, 0);
    
    const homeFTA = homeSim.reduce((s, p) => s + p.stats.fta, 0);
    const awayFTA = awaySim.reduce((s, p) => s + p.stats.fta, 0);

    // Calculate Misses (Opportunities for Rebounds)
    // Live Ball Free Throw Miss Rate approx 0.4 (Only the last one counts, simplifed)
    const homeMisses = (homeFGA - homeFGM) + Math.round((homeFTA - homeFTM) * 0.4);
    const awayMisses = (awayFGA - awayFGM) + Math.round((awayFTA - awayFTM) * 0.4);

    // --- Phase 3: Distribution (Rebounds & Assists) ---
    
    // Distribute Rebounds based on OPPONENT misses (Defense) and OWN misses (Offense)
    // Home Team: Def Rebs from Away Misses, Off Rebs from Home Misses
    distributeRebounds(homeSim, awaySim, homeMisses, awayMisses);
    // Away Team: Def Rebs from Home Misses, Off Rebs from Away Misses
    distributeRebounds(awaySim, homeSim, awayMisses, homeMisses);

    // Distribute Assists based on Team FGM
    distributeAssists(homeSim, homeFGM, { offense: homeTactics.offenseTactics });
    distributeAssists(awaySim, awayFGM, { offense: awayTactics.offenseTactics });

    // --- Phase 4: Finalize Box Scores ---
    
    const mapToBoxScore = (simCtx: PlayerSimContext): PlayerBoxScore => ({
        playerId: simCtx.playerId,
        playerName: simCtx.stats.playerName, // Passed through from phase 1
        pts: simCtx.stats.pts,
        reb: simCtx.stats.defReb + simCtx.stats.offReb,
        offReb: simCtx.stats.offReb,
        defReb: simCtx.stats.defReb,
        ast: simCtx.stats.ast,
        stl: simCtx.stats.stl,
        blk: simCtx.stats.blk,
        tov: simCtx.stats.tov,
        fgm: simCtx.stats.fgm, fga: simCtx.stats.fga,
        p3m: simCtx.stats.p3m, p3a: simCtx.stats.p3a,
        ftm: simCtx.stats.ftm, fta: simCtx.stats.fta,
        rimM: simCtx.stats.rimM, rimA: simCtx.stats.rimA,
        midM: simCtx.stats.midM, midA: simCtx.stats.midA,
        mp: simCtx.stats.mp, g: 1, gs: simCtx.stats.gs, pf: simCtx.stats.pf,
        isStopper: simCtx.stats.isStopper,
        isAceTarget: simCtx.stats.isAceTarget,
        matchupEffect: simCtx.stats.matchupEffect,
        zoneData: simCtx.stats.zoneData
    });

    const homeBox = homeSim.map(mapToBoxScore);
    const awayBox = awaySim.map(mapToBoxScore);
    
    let homeScore = homeBox.reduce((sum, p) => sum + p.pts, 0);
    let awayScore = awayBox.reduce((sum, p) => sum + p.pts, 0);
    
    // Prevent Draws
    if (homeScore === awayScore) {
        if (Math.random() > 0.5) {
            homeScore += 1;
            // Add point to top scorer
            const hero = homeBox.reduce((p, c) => (p.pts > c.pts ? p : c));
            hero.pts += 1; hero.ftm += 1; hero.fta += 1;
        } else {
            awayScore += 1;
            const hero = awayBox.reduce((p, c) => (p.pts > c.pts ? p : c));
            hero.pts += 1; hero.ftm += 1; hero.fta += 1;
        }
    }

    // Merge roster updates
    const allUpdates = { ...homeSim.reduce((acc, p) => ({...acc, [p.playerId]: p.updates}), {}), ...awaySim.reduce((acc, p) => ({...acc, [p.playerId]: p.updates}), {}) };

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
        homeBox,
        awayBox,
        rosterUpdates: allUpdates,
        homeTactics: homeSnapshot,
        awayTactics: awaySnapshot
    };
}

// --------------------------------------------------------------------------
//  PHASE 1: INDIVIDUAL SIMULATION
//  Calculates Shooting, Fouls, Fatigue, and Potential Weights for Reb/Ast
// --------------------------------------------------------------------------
function simulateTeamPhase1(
    team: Team, 
    teamTactics: GameTactics, 
    oppTeam: Team, 
    oppTactics: GameTactics, 
    isHome: boolean,
    isB2B: boolean
): PlayerSimContext[] {
    const C = SIM_CONFIG;
    const sliders = teamTactics.sliders;
    
    // 1. Setup Team Minutes
    const healthyPlayers = team.roster.filter(p => p.health !== 'Injured').sort(stableSort);
    const starterIdsMap = teamTactics.starters; 
    const starterIds = Object.values(starterIdsMap);
    const isStarter = healthyPlayers.map(p => starterIds.includes(p.id));
    const finalMinutesList = distributeMinutes(healthyPlayers, isStarter, teamTactics.minutesLimits, sliders);
    
    // 2. Setup Opponent Metrics
    const oppSliders = oppTactics.sliders;
    const oppSorted = oppTeam.roster.filter(p => p.health !== 'Injured').sort(stableSort);
    const oppStarterIds = Object.values(oppTactics.starters);
    const oppIsStarter = oppSorted.map(p => oppStarterIds.includes(p.id));
    const oppMinsEst = distributeMinutes(oppSorted, oppIsStarter, oppTactics.minutesLimits, oppSliders);
    const oppMinutesMap: Record<string, number> = {};
    oppSorted.forEach((p, i) => { oppMinutesMap[p.id] = oppMinsEst[i]; });
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
    const acePlayer = healthyPlayers.reduce((prev, current) => (prev.ovr > current.ovr) ? prev : current, healthyPlayers[0] || { ovr: 0, id: 'dummy' });

    // 4. Usage Weights
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

    const results: PlayerSimContext[] = [];

    // 5. Player Loop
    healthyPlayers.forEach((p, i) => {
      let mp = finalMinutesList[i];
      const isStopper = teamTactics?.defenseTactics.includes('AceStopper') && teamTactics.stopperId === p.id;
      
      // 5-0. Foul System
      let matchupTarget = oppSorted.find(op => op.position === p.position && oppMinutesMap[op.id] > 10) || oppSorted[0];
      if (isStopper) {
          matchupTarget = oppSorted.reduce((prev, curr) => (prev.ovr > curr.ovr) ? prev : curr, oppSorted[0]);
      }
      const { pf, adjustedMinutes } = calculateFoulStats(
          p, mp, { defense: teamTactics.defenseTactics }, { offense: oppTactics.offenseTactics }, sliders, matchupTarget, isStopper
      );
      mp = adjustedMinutes;

      // 5-1. Fatigue
      const fatigueResult = calculateFatigueAndInjury(p, mp, sliders, tacticDrainMult, isB2B, isStopper);
      const updates = {
          condition: fatigueResult.newCondition,
          health: fatigueResult.newHealth,
          injuryType: fatigueResult.injuryType,
          returnDate: fatigueResult.returnDate
      };

      if (mp <= 0) {
          results.push({
              playerId: p.id,
              updates,
              stats: {
                  playerName: p.name, pts: 0, 
                  // Placeholders for Phase 2 distribution
                  reb: 0, offReb: 0, defReb: 0, ast: 0, 
                  passIq: p.passIq,
                  stl: 0, blk: 0, tov: 0, 
                  fgm: 0, fga: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, 
                  rimM: 0, rimA: 0, midM: 0, midA: 0, 
                  mp: 0, gs: 0, pf: 0,
                  isStopper, isAceTarget: false, matchupEffect: 0,
                  // Zero Weights
                  defRebWeight: 0, offRebWeight: 0, assistWeight: 0
              }
          });
          return;
      }

      // 5-2. Contextual Drop
      let positionPenalty = 0;
      const assignedSlot = Object.entries(starterIdsMap).find(([slot, id]) => id === p.id)?.[0];
      if (assignedSlot) {
          const playerPos = p.position; 
          const isMatch = (playerPos === assignedSlot) || (playerPos === 'G' && (assignedSlot === 'PG' || assignedSlot === 'SG')) || (playerPos === 'F' && (assignedSlot === 'SF' || assignedSlot === 'PF'));
          if (!isMatch) { positionPenalty = POSITION_PENALTY_MAP[playerPos]?.[assignedSlot] || 0; }
      }
      const mentalFortitude = (p.intangibles || 50) / 100;
      const effectivePerfDrop = Math.min(1.0, (fatigueResult.fatiguePerfPenalty + fatigueResult.inGameFatiguePenalty + positionPenalty) * (1 - (mentalFortitude * 0.5)));
      const mentalClutchBonus = Math.max(0, (p.intangibles - 75) * 0.001); 

      // 5-3. FGA
      let pUsage = (Math.pow(p.ovr, 2.75) * (p.offConsist / 50) * mp * (p.shotIq / 75));
      if (teamTactics?.offenseTactics.includes('PostFocus') && (p.position === 'C' || p.position === 'PF')) pUsage *= 1.4;
      if (teamTactics?.offenseTactics.includes('PerimeterFocus') && (p.position === 'PG' || p.position === 'SG')) pUsage *= 1.4;
      const fga = Math.round(teamFgaTarget * (pUsage / totalUsageWeight));

      // 5-4. Opponent Stopper
      const oppHasStopper = oppTactics?.defenseTactics.includes('AceStopper');
      const oppStopperId = oppTactics?.stopperId;
      const oppStopper = oppStopperId ? oppTeam.roster.find(d => d.id === oppStopperId) : undefined;
      const oppStopperMP = oppStopperId ? (oppMinutesMap[oppStopperId] || 0) : 0;

      // 5-5. Shooting
      const shootingRes = calculateShootingStats(
          p, mp, fga, 
          { offense: teamTactics.offenseTactics },
          { effectivePerfDrop, homeAdvantage: homeAdvantageModifier, hastePenalty, mentalClutchBonus },
          oppDefMetrics,
          oppHasStopper, oppStopperId, acePlayer.id,
          oppStopper, oppStopperMP
      );

      // 5-6. Defense Weights & Events
      const defRes = calculateDefenseStats(p, mp, sliders, effectivePerfDrop);

      // 5-7. Playmaking Weights & Events
      const plmRes = calculatePlaymakingStats(
          p, mp, fga, 
          { offense: teamTactics.offenseTactics }, 
          sliders, 
          shootingRes.isAceTarget, 
          oppStopper, 
          effectivePerfDrop
      );

      results.push({
          playerId: p.id,
          updates,
          stats: {
              playerName: p.name,
              pts: shootingRes.pts,
              // Filled in Phase 3
              reb: 0, offReb: 0, defReb: 0, ast: 0,
              passIq: p.passIq, 
              // Calculated here
              stl: defRes.stl, blk: defRes.blk, tov: plmRes.tov,
              fgm: shootingRes.fgm, fga: shootingRes.fga,
              p3m: shootingRes.p3m, p3a: shootingRes.p3a,
              ftm: shootingRes.ftm, fta: shootingRes.fta,
              rimM: shootingRes.rimM, rimA: shootingRes.rimA,
              midM: shootingRes.midM, midA: shootingRes.midA,
              mp, gs: starterIds.includes(p.id) ? 1 : 0, pf,
              isStopper,
              isAceTarget: shootingRes.isAceTarget,
              matchupEffect: shootingRes.matchupEffect,
              zoneData: shootingRes.zoneData,
              // Weights for distribution
              defRebWeight: defRes.defRebWeight,
              offRebWeight: defRes.offRebWeight,
              assistWeight: plmRes.assistWeight
          }
      });
    });

    return results;
}
