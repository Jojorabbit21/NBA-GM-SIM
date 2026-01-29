
import { Team, Player, GameTactics, OffenseTactic, DefenseTactic, TacticalSliders } from '../../../types';
import { stableSort } from './minutesManager';

// ==========================================================================================
//  TACTIC GENERATOR
//  AI Logic for selecting best strategies and lineups.
// ==========================================================================================

export function generateAutoTactics(team: Team): GameTactics {
  const healthy = team.roster.filter(p => p.health !== 'Injured').sort(stableSort);
  
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
  const calculateScore = (tactic: OffenseTactic): number => {
      let score = 0;
      switch(tactic) {
        case 'Balance': 
            score = 75 + (sAvg('ovr') - 80) * 0.5 + (sAvg('shotIq') - 75) * 0.3;
            break;

        case 'PaceAndSpace':
            const handlers = rotation.filter(p => p.position.includes('G'));
            const handlerPLM = handlers.length > 0 ? getAvg(handlers, 'plm') : 60;
            score = (handlerPLM * 0.35) + (sAvg('out') * 0.4) + (sAvg('speed') * 0.15) + (sAvg('stamina') * 0.1);
            if (sAvg('reb') < 70) score -= 10; 
            break;

        case 'PerimeterFocus':
            const shooters = [...rotation].sort((a,b) => b.out - a.out);
            const aceOut = shooters[0]?.out || 70;
            const subOut = shooters[1]?.out || 65;
            score = (aceOut * 0.4) + (subOut * 0.3) + (sAvg('plm') * 0.3);
            break;

        case 'PostFocus':
            const bigs = rotation.filter(p => p.position === 'C' || p.position === 'PF');
            if (bigs.length > 0) {
                const bestBig = bigs.reduce((prev, curr) => prev.postPlay > curr.postPlay ? prev : curr);
                score = (bestBig.postPlay * 0.6) + (bestBig.strength * 0.2) + (sAvg('ins') * 0.2);
                if (bestBig.passVision > 80) score += 10; 
            } else {
                score = 40; 
            }
            break;

        case 'Grind':
            score = (sAvg('def') * 0.5) + (sAvg('strength') * 0.3) + (sAvg('ins') * 0.2);
            if (sAvg('out') < 75) score += 5;
            break;

        case 'SevenSeconds':
            const pg = rotation.find(p => p.position === 'PG');
            const pgFactor = pg ? (pg.plm * 0.5 + pg.speed * 0.5) : 60;
            score = (pgFactor * 0.3) + (sAvg('speed') * 0.25) + (sAvg('out') * 0.25) + (sAvg('stamina') * 0.2);
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
