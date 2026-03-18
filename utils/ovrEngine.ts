
/**
 * NBA-style OVR Engine
 *
 * Architecture:
 *   PlayerRatings (internal, canonical field names)
 *     → ModuleScores (13 role modules)
 *       → ArchetypeScores (13 archetypes)
 *         → PositionBase + Bonuses/Penalties
 *           → rawCurrentOVR
 *             → displayCurrentOVR (league-relative)
 *
 * This file is a pure-computation engine.
 * The adapter from Player type lives in ovrUtils.ts.
 *
 * Key principle: potential is NOT part of currentOVR.
 * It only affects futureOVR, which is computed separately.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type OvrPosition = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

/** Canonical rating field names used internally by this engine */
export interface PlayerRatings {
  // Inside Scoring
  closeShot: number;
  layup: number;
  dunk: number;
  postPlay: number;
  drawFoul: number;
  hands: number;

  // Outside Scoring
  midRange: number;
  cornerThree: number;
  fortyFiveThree: number;
  topThree: number;
  freeThrow: number;
  shotIQ: number;
  offensiveConsistency: number;

  // Playmaking
  passAccuracy: number;
  ballHandling: number;
  speedWithBall: number;
  passVision: number;
  passIQ: number;
  offballMovement: number;

  // Defense
  interiorDefense: number;
  perimeterDefense: number;
  steal: number;
  block: number;
  helpDefenseIQ: number;
  passPerception: number;
  defensiveConsistency: number;

  // Rebounds
  offensiveRebounds: number;
  defensiveRebounds: number;
  boxout: number;

  // Athleticism
  speed: number;
  agility: number;
  strength: number;
  vertical: number;
  stamina: number;
  hustle: number;
  durability: number;

  // Intangible & meta
  intangible: number;  // clutch / poise – small OVR effect, big gameplay effect
  heightInches: number;
}

export interface PlayerInput {
  id: string;
  primaryPosition: OvrPosition;
  age: number;
  potential: number;  // used only for futureOVR
  ratings: PlayerRatings;
}

export interface ModuleScores {
  spotUpShooting: number;
  shotCreation: number;
  rimFinishing: number;
  postCraft: number;
  playmaking: number;
  offballAttack: number;
  poaDefense: number;
  teamDefense: number;
  rimProtection: number;
  rebounding: number;
  athleticism: number;
  motorAvailability: number;
  sizeFit: number;
}

export type OvrArchetype =
  | 'PRIMARY_CREATOR_GUARD'
  | 'SCORING_COMBO_GUARD'
  | 'MOVEMENT_SHOOTER'
  | 'PERIMETER_3D'
  | 'TWO_WAY_WING'
  | 'SLASHING_WING'
  | 'SHOT_CREATOR_WING'
  | 'CONNECTOR_FORWARD'
  | 'POST_SCORING_BIG'
  | 'RIM_RUNNER_BIG'
  | 'STRETCH_BIG'
  | 'RIM_PROTECTOR_ANCHOR'
  | 'PLAYMAKING_BIG';

export interface LeagueDistribution {
  meanRawOVR: number;
  stdRawOVR: number;
}

export interface RawOVRResult {
  modules: ModuleScores;
  positionBase: number;
  primaryArchetype: { archetype: OvrArchetype; score: number };
  secondaryArchetype: { archetype: OvrArchetype; score: number };
  tagBonus: number;
  signatureSkillBonus: number;
  rareComboBonus: number;
  fatalWeaknessPenalty: number;
  intangibleBonus: number;
  rawCurrentOVR: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function r1(value: number): number {
  return Math.round(value * 10) / 10;
}

function wavg(pairs: Array<[number, number]>): number {
  let totalW = 0;
  let totalV = 0;
  for (const [v, w] of pairs) {
    totalV += v * w;
    totalW += w;
  }
  return totalW > 0 ? totalV / totalW : 0;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[], mean?: number): number {
  if (values.length < 2) return 1;
  const m = mean ?? avg(values);
  const variance = avg(values.map(v => (v - m) ** 2));
  return Math.sqrt(Math.max(variance, 0.0001));
}

function scoreRangeLinear(
  diff: number,   // threshold - actual (positive = below threshold)
  maxDiff: number,
  maxPenalty: number,
): number {
  if (diff <= 0) return 0;
  return clamp((diff / maxDiff) * maxPenalty, 0, maxPenalty);
}

// ─── Size Fit ─────────────────────────────────────────────────────────────────

function idealHeightInches(pos: OvrPosition): number {
  switch (pos) {
    case 'PG': return 77;   // 6'5
    case 'SG': return 79;   // 6'7
    case 'SF': return 81;   // 6'9
    case 'PF': return 83;   // 6'11
    case 'C':  return 85;   // 7'1
  }
}

function calcSizeFit(pos: OvrPosition, heightInches: number): number {
  const diff = Math.abs(heightInches - idealHeightInches(pos));
  const penalty = diff <= 2 ? diff * 3 : 6 + (diff - 2) * 5;
  return clamp(100 - penalty, 55, 100);
}

// ─── 1) Module Scores ─────────────────────────────────────────────────────────

export function calculateModules(r: PlayerRatings, pos: OvrPosition): ModuleScores {
  const spotUpShooting = wavg([
    [r.cornerThree, 0.30],
    [r.fortyFiveThree, 0.28],
    [r.topThree, 0.22],
    [r.freeThrow, 0.08],
    [r.shotIQ, 0.06],
    [r.offensiveConsistency, 0.06],
  ]);

  const shotCreation = wavg([
    [r.midRange, 0.28],
    [r.topThree, 0.18],
    [r.ballHandling, 0.16],
    [r.speedWithBall, 0.12],
    [r.drawFoul, 0.10],
    [r.layup, 0.08],
    [r.shotIQ, 0.08],
  ]);

  const rimFinishing = wavg([
    [r.layup, 0.26],
    [r.dunk, 0.18],
    [r.closeShot, 0.14],
    [r.drawFoul, 0.12],
    [r.hands, 0.08],
    [r.speedWithBall, 0.08],
    [r.vertical, 0.08],
    [r.agility, 0.06],
  ]);

  const postCraft = wavg([
    [r.postPlay, 0.34],
    [r.closeShot, 0.18],
    [r.strength, 0.14],
    [r.drawFoul, 0.10],
    [r.hands, 0.10],
    [r.shotIQ, 0.07],
    [r.offensiveConsistency, 0.07],
  ]);

  const playmaking = wavg([
    [r.passVision, 0.28],
    [r.passAccuracy, 0.24],
    [r.passIQ, 0.18],
    [r.ballHandling, 0.16],
    [r.speedWithBall, 0.10],
    [r.offballMovement, 0.04],
  ]);

  const offballAttack = wavg([
    [r.offballMovement, 0.28],
    [spotUpShooting, 0.22],
    [r.layup, 0.14],
    [r.speed, 0.10],
    [r.agility, 0.10],
    [r.shotIQ, 0.08],
    [r.offensiveConsistency, 0.08],
  ]);

  const poaDefense = wavg([
    [r.perimeterDefense, 0.30],
    [r.steal, 0.14],
    [r.passPerception, 0.12],
    [r.helpDefenseIQ, 0.12],
    [r.agility, 0.10],
    [r.speed, 0.10],
    [r.defensiveConsistency, 0.12],
  ]);

  const teamDefense = wavg([
    [r.helpDefenseIQ, 0.20],
    [r.passPerception, 0.18],
    [r.perimeterDefense, 0.16],
    [r.interiorDefense, 0.14],
    [r.steal, 0.08],
    [r.block, 0.08],
    [r.boxout, 0.08],
    [r.defensiveConsistency, 0.08],
  ]);

  const rimProtection = wavg([
    [r.interiorDefense, 0.34],
    [r.block, 0.24],
    [r.helpDefenseIQ, 0.12],
    [r.strength, 0.10],
    [r.vertical, 0.10],
    [r.defensiveConsistency, 0.10],
  ]);

  const rebounding = wavg([
    [r.offensiveRebounds, 0.24],
    [r.defensiveRebounds, 0.34],
    [r.boxout, 0.24],
    [r.strength, 0.10],
    [r.hustle, 0.08],
  ]);

  const athleticism = wavg([
    [r.speed, 0.22],
    [r.agility, 0.22],
    [r.vertical, 0.18],
    [r.strength, 0.16],
    [r.stamina, 0.12],
    [r.hustle, 0.10],
  ]);

  const motorAvailability = wavg([
    [r.durability, 0.35],
    [r.stamina, 0.25],
    [r.hustle, 0.20],
    [r.offensiveConsistency, 0.10],
    [r.defensiveConsistency, 0.10],
  ]);

  const sizeFit = calcSizeFit(pos, r.heightInches);

  return {
    spotUpShooting:   r1(spotUpShooting),
    shotCreation:     r1(shotCreation),
    rimFinishing:     r1(rimFinishing),
    postCraft:        r1(postCraft),
    playmaking:       r1(playmaking),
    offballAttack:    r1(offballAttack),
    poaDefense:       r1(poaDefense),
    teamDefense:      r1(teamDefense),
    rimProtection:    r1(rimProtection),
    rebounding:       r1(rebounding),
    athleticism:      r1(athleticism),
    motorAvailability: r1(motorAvailability),
    sizeFit:          r1(sizeFit),
  };
}

// ─── 2) Archetype Scores ─────────────────────────────────────────────────────

function calcArchetypeScore(mod: ModuleScores, arch: OvrArchetype): number {
  switch (arch) {
    case 'PRIMARY_CREATOR_GUARD':
      return wavg([[mod.playmaking, 0.38], [mod.shotCreation, 0.22], [mod.rimFinishing, 0.12],
                   [mod.spotUpShooting, 0.08], [mod.poaDefense, 0.08], [mod.motorAvailability, 0.12]]);

    case 'SCORING_COMBO_GUARD':
      return wavg([[mod.shotCreation, 0.32], [mod.rimFinishing, 0.20], [mod.spotUpShooting, 0.18],
                   [mod.playmaking, 0.12], [mod.offballAttack, 0.08], [mod.motorAvailability, 0.10]]);

    case 'MOVEMENT_SHOOTER':
      return wavg([[mod.spotUpShooting, 0.40], [mod.offballAttack, 0.28], [mod.motorAvailability, 0.12],
                   [mod.poaDefense, 0.10], [mod.teamDefense, 0.10]]);

    case 'PERIMETER_3D':
      return wavg([[mod.spotUpShooting, 0.30], [mod.poaDefense, 0.28], [mod.teamDefense, 0.20],
                   [mod.offballAttack, 0.10], [mod.motorAvailability, 0.12]]);

    case 'TWO_WAY_WING':
      return wavg([[mod.spotUpShooting, 0.18], [mod.rimFinishing, 0.16], [mod.poaDefense, 0.18],
                   [mod.teamDefense, 0.18], [mod.shotCreation, 0.10], [mod.rebounding, 0.10],
                   [mod.motorAvailability, 0.10]]);

    case 'SLASHING_WING':
      return wavg([[mod.rimFinishing, 0.34], [mod.shotCreation, 0.16], [mod.offballAttack, 0.14],
                   [mod.poaDefense, 0.12], [mod.teamDefense, 0.10], [mod.motorAvailability, 0.14]]);

    case 'SHOT_CREATOR_WING':
      return wavg([[mod.shotCreation, 0.30], [mod.rimFinishing, 0.18], [mod.spotUpShooting, 0.16],
                   [mod.playmaking, 0.10], [mod.poaDefense, 0.10], [mod.motorAvailability, 0.16]]);

    case 'CONNECTOR_FORWARD':
      return wavg([[mod.playmaking, 0.24], [mod.spotUpShooting, 0.18], [mod.teamDefense, 0.16],
                   [mod.rebounding, 0.14], [mod.offballAttack, 0.10], [mod.rimFinishing, 0.08],
                   [mod.motorAvailability, 0.10]]);

    case 'POST_SCORING_BIG':
      return wavg([[mod.postCraft, 0.38], [mod.rimFinishing, 0.20], [mod.rebounding, 0.16],
                   [mod.rimProtection, 0.10], [mod.teamDefense, 0.08], [mod.motorAvailability, 0.08]]);

    case 'RIM_RUNNER_BIG':
      return wavg([[mod.rimFinishing, 0.30], [mod.rimProtection, 0.24], [mod.rebounding, 0.22],
                   [mod.teamDefense, 0.10], [mod.motorAvailability, 0.14]]);

    case 'STRETCH_BIG':
      return wavg([[mod.spotUpShooting, 0.30], [mod.rebounding, 0.20], [mod.rimProtection, 0.18],
                   [mod.teamDefense, 0.12], [mod.postCraft, 0.10], [mod.motorAvailability, 0.10]]);

    case 'RIM_PROTECTOR_ANCHOR':
      return wavg([[mod.rimProtection, 0.38], [mod.rebounding, 0.26], [mod.teamDefense, 0.14],
                   [mod.motorAvailability, 0.10], [mod.postCraft, 0.12]]);

    case 'PLAYMAKING_BIG':
      return wavg([[mod.playmaking, 0.26], [mod.postCraft, 0.20], [mod.spotUpShooting, 0.16],
                   [mod.rebounding, 0.16], [mod.teamDefense, 0.12], [mod.rimProtection, 0.10]]);

    default:
      return 0;
  }
}

const ARCHETYPE_CANDIDATES: Record<OvrPosition, OvrArchetype[]> = {
  PG: ['PRIMARY_CREATOR_GUARD', 'SCORING_COMBO_GUARD', 'MOVEMENT_SHOOTER', 'PERIMETER_3D'],
  SG: ['PRIMARY_CREATOR_GUARD', 'SCORING_COMBO_GUARD', 'MOVEMENT_SHOOTER', 'PERIMETER_3D',
       'TWO_WAY_WING', 'SLASHING_WING', 'SHOT_CREATOR_WING'],
  SF: ['MOVEMENT_SHOOTER', 'PERIMETER_3D', 'TWO_WAY_WING', 'SLASHING_WING',
       'SHOT_CREATOR_WING', 'CONNECTOR_FORWARD'],
  PF: ['TWO_WAY_WING', 'CONNECTOR_FORWARD', 'POST_SCORING_BIG', 'RIM_RUNNER_BIG',
       'STRETCH_BIG', 'RIM_PROTECTOR_ANCHOR', 'PLAYMAKING_BIG'],
  C:  ['POST_SCORING_BIG', 'RIM_RUNNER_BIG', 'STRETCH_BIG', 'RIM_PROTECTOR_ANCHOR', 'PLAYMAKING_BIG'],
};

function selectPrimarySecondary(
  pos: OvrPosition,
  mod: ModuleScores,
): { primary: { archetype: OvrArchetype; score: number }; secondary: { archetype: OvrArchetype; score: number }; blend: number } {
  const ranked = ARCHETYPE_CANDIDATES[pos]
    .map(arch => ({ archetype: arch, score: r1(calcArchetypeScore(mod, arch)) }))
    .sort((a, b) => b.score - a.score);

  const primary = ranked[0];
  const secondary = ranked[1] ?? ranked[0];

  const diff = primary.score - secondary.score;
  const pw = diff >= 8 ? 0.82 : 0.70;
  const sw = diff >= 8 ? 0.18 : 0.30;
  const blend = r1(primary.score * pw + secondary.score * sw);

  return { primary, secondary, blend };
}

// ─── 3) Trait Tag Bonus ───────────────────────────────────────────────────────

function calcTagBonus(pos: OvrPosition, r: PlayerRatings, mod: ModuleScores): number {
  const bonuses: number[] = [];
  let negBonus = 0;

  if (mod.rimFinishing >= 88)                             bonuses.push(0.8);
  if (r.drawFoul >= 90)                                   bonuses.push(0.4);
  if (mod.shotCreation >= 88)                             bonuses.push(0.9);
  if (mod.spotUpShooting >= 86)                           bonuses.push(0.7);
  if (mod.offballAttack >= 84 && mod.spotUpShooting >= 84) bonuses.push(1.0);
  if (mod.playmaking >= 86) {
    bonuses.push(pos === 'PF' || pos === 'C' ? 1.2 : 0.9);
  }
  if (mod.poaDefense >= 86)                               bonuses.push(0.8);
  if (mod.teamDefense >= 86)                              bonuses.push(0.6);
  if (mod.rimProtection >= 88)                            bonuses.push(0.9);
  if (mod.rebounding >= 86)                               bonuses.push(0.7);
  if (mod.motorAvailability >= 86)                        bonuses.push(0.5);
  if (r.durability >= 90 && r.stamina >= 85)              bonuses.push(0.4);

  // Reliable two-way
  const atkAvg = avg([mod.spotUpShooting, mod.shotCreation, mod.rimFinishing]);
  const defAvg = avg([mod.poaDefense, mod.teamDefense, mod.rimProtection]);
  if (atkAvg >= 82 && defAvg >= 82 && r.offensiveConsistency >= 75 && r.defensiveConsistency >= 75) {
    bonuses.push(1.1);
  }

  // Streaky scorer (negative)
  if ((mod.shotCreation >= 82 || mod.spotUpShooting >= 82) && r.offensiveConsistency <= 60) {
    negBonus -= 0.7;
  }

  const posBonus = bonuses.sort((a, b) => b - a).slice(0, 3).reduce((s, v) => s + v, 0);
  return r1(clamp(posBonus + negBonus, -2.0, 3.2));
}

// ─── 4) Position Base ────────────────────────────────────────────────────────

function calcPositionBase(pos: OvrPosition, mod: ModuleScores, intangible: number): number {
  switch (pos) {
    case 'PG':
      return r1(wavg([
        [mod.playmaking, 0.30], [mod.spotUpShooting, 0.24], [mod.rimFinishing, 0.12],
        [mod.poaDefense, 0.08], [mod.athleticism, 0.06], [mod.motorAvailability, 0.05],
        [intangible, 0.05], [mod.sizeFit, 0.04], [mod.teamDefense, 0.03], [mod.shotCreation, 0.03],
      ]));

    case 'SG':
      return r1(wavg([
        [mod.spotUpShooting, 0.26], [mod.shotCreation, 0.18], [mod.rimFinishing, 0.14],
        [mod.playmaking, 0.10], [mod.poaDefense, 0.10], [mod.athleticism, 0.07],
        [mod.motorAvailability, 0.05], [intangible, 0.05], [mod.sizeFit, 0.03], [mod.teamDefense, 0.02],
      ]));

    case 'SF':
      return r1(wavg([
        [mod.spotUpShooting, 0.18], [mod.shotCreation, 0.16], [mod.rimFinishing, 0.14],
        [mod.playmaking, 0.10], [mod.poaDefense, 0.14], [mod.teamDefense, 0.10],
        [mod.rebounding, 0.08], [mod.athleticism, 0.06], [mod.motorAvailability, 0.04],
        [mod.sizeFit, 0.04], [intangible, 0.04],
      ]));

    case 'PF':
      return r1(wavg([
        [mod.postCraft, 0.14], [mod.spotUpShooting, 0.10], [mod.rimFinishing, 0.10],
        [mod.playmaking, 0.08], [mod.rimProtection, 0.16], [mod.rebounding, 0.12],
        [mod.teamDefense, 0.08], [mod.poaDefense, 0.06], [mod.athleticism, 0.06],
        [mod.motorAvailability, 0.04], [mod.sizeFit, 0.03], [intangible, 0.03],
      ]));

    case 'C':
      return r1(wavg([
        [mod.postCraft, 0.18], [mod.spotUpShooting, 0.06], [mod.rimFinishing, 0.10],
        [mod.playmaking, 0.10], [mod.rimProtection, 0.18], [mod.rebounding, 0.18],
        [mod.teamDefense, 0.08], [mod.athleticism, 0.06], [mod.motorAvailability, 0.04],
        [mod.sizeFit, 0.04], [intangible, 0.04],
      ]));
  }
}

// ─── 5) Signature Skill Bonus ────────────────────────────────────────────────

function calcSignatureSkillBonus(mod: ModuleScores): number {
  const pool = [
    mod.spotUpShooting, mod.shotCreation, mod.rimFinishing, mod.postCraft,
    mod.playmaking, mod.poaDefense, mod.teamDefense, mod.rimProtection, mod.rebounding,
  ].sort((a, b) => b - a);

  const best   = pool[0];
  const second = pool[1];

  function bonusFrom(v: number): number {
    if (v >= 98) return 3.0 + (v - 98) * 0.20;
    if (v >= 95) return 2.0 + (v - 95) * 0.33;
    if (v >= 90) return 1.0 + (v - 90) * 0.20;
    return 0;
  }

  return r1(clamp(bonusFrom(best) + bonusFrom(second) * 0.40, 0, 4.0));
}

// ─── 6) Rare Combo Bonus ─────────────────────────────────────────────────────

function calcRareComboBonus(pos: OvrPosition, mod: ModuleScores): number {
  let bonus = 0;

  if ((pos === 'PG' || pos === 'SG') && mod.playmaking >= 90 && mod.spotUpShooting >= 92) bonus += 2.6;
  if ((pos === 'PG' || pos === 'SG') && mod.spotUpShooting >= 98)                         bonus += 1.6;
  if ((pos === 'SG' || pos === 'SF') && mod.shotCreation >= 90 && mod.spotUpShooting >= 88) bonus += 2.2;
  if ((pos === 'SG' || pos === 'SF') && mod.spotUpShooting >= 88 && mod.poaDefense >= 88)   bonus += 1.8;
  if ((pos === 'PF' || pos === 'C')  && mod.playmaking >= 88 && mod.postCraft >= 82)         bonus += 2.4;
  if ((pos === 'PF' || pos === 'C')  && mod.playmaking >= 94)                                bonus += 1.8;
  if ((pos === 'PF' || pos === 'C')  && mod.spotUpShooting >= 84 && mod.rimProtection >= 88) bonus += 2.0;
  if ((pos === 'PF' || pos === 'C')  && mod.rebounding >= 90 && mod.rimProtection >= 92)     bonus += 1.6;

  return r1(clamp(bonus, 0, 4.5));
}

// ─── 7) Fatal Weakness Penalty ───────────────────────────────────────────────

function calcFatalWeaknessPenalty(
  arch: OvrArchetype,
  r: PlayerRatings,
  mod: ModuleScores,
): number {
  let penalty = 0;

  switch (arch) {
    case 'PRIMARY_CREATOR_GUARD':
      penalty += scoreRangeLinear(74 - mod.playmaking, 20, 6);
      penalty += scoreRangeLinear(70 - r.ballHandling, 20, 4);
      break;

    case 'SCORING_COMBO_GUARD':
      penalty += scoreRangeLinear(76 - mod.shotCreation, 20, 5);
      penalty += scoreRangeLinear(70 - mod.rimFinishing, 20, 3);
      break;

    case 'MOVEMENT_SHOOTER':
      penalty += scoreRangeLinear(78 - mod.spotUpShooting, 20, 5);
      penalty += scoreRangeLinear(72 - mod.offballAttack, 20, 3);
      break;

    case 'PERIMETER_3D':
      penalty += scoreRangeLinear(76 - mod.spotUpShooting, 20, 4);
      penalty += scoreRangeLinear(78 - mod.poaDefense, 20, 5);
      break;

    case 'TWO_WAY_WING':
      penalty += scoreRangeLinear(74 - mod.poaDefense, 20, 4);
      penalty += scoreRangeLinear(72 - mod.spotUpShooting, 20, 3);
      break;

    case 'SLASHING_WING':
      penalty += scoreRangeLinear(80 - mod.rimFinishing, 20, 6);
      break;

    case 'SHOT_CREATOR_WING':
      penalty += scoreRangeLinear(80 - mod.shotCreation, 20, 6);
      break;

    case 'CONNECTOR_FORWARD':
      penalty += scoreRangeLinear(74 - mod.playmaking, 20, 4);
      penalty += scoreRangeLinear(72 - mod.teamDefense, 20, 3);
      break;

    case 'POST_SCORING_BIG':
      penalty += scoreRangeLinear(78 - mod.postCraft, 20, 6);
      break;

    case 'RIM_RUNNER_BIG':
      penalty += scoreRangeLinear(80 - mod.rimFinishing, 20, 5);
      penalty += scoreRangeLinear(74 - mod.rebounding, 20, 4);
      break;

    case 'STRETCH_BIG':
      penalty += scoreRangeLinear(78 - mod.spotUpShooting, 20, 5);
      break;

    case 'RIM_PROTECTOR_ANCHOR':
      penalty += scoreRangeLinear(80 - mod.rimProtection, 20, 7);
      penalty += scoreRangeLinear(74 - mod.rebounding, 20, 4);
      break;

    case 'PLAYMAKING_BIG':
      penalty += scoreRangeLinear(82 - mod.playmaking, 20, 6);
      if (mod.postCraft < 70 && mod.spotUpShooting < 72) {
        penalty += 2.0;
      }
      break;
  }

  return r1(clamp(penalty, 0, 8));
}

// ─── 8) Intangible Bonus ─────────────────────────────────────────────────────

function intangibleBonus(intangible: number): number {
  return clamp(((intangible - 50) / 50) * 2.5, -2.5, 2.5);
}

// ─── 9) Raw Current OVR ──────────────────────────────────────────────────────

export function evaluatePlayerRawOVR(player: PlayerInput): RawOVRResult {
  const mod = calculateModules(player.ratings, player.primaryPosition);
  const { primary, secondary } = selectPrimarySecondary(player.primaryPosition, mod);
  const posBase = calcPositionBase(player.primaryPosition, mod, player.ratings.intangible);
  const tagBonus = calcTagBonus(player.primaryPosition, player.ratings, mod);
  const sigBonus = calcSignatureSkillBonus(mod);
  const rareBonus = calcRareComboBonus(player.primaryPosition, mod);
  const weakPenalty = calcFatalWeaknessPenalty(primary.archetype, player.ratings, mod);
  const intBonus = intangibleBonus(player.ratings.intangible);

  const rawCurrentOVR = clamp(
    0.55 * posBase +
    0.25 * primary.score +
    0.10 * secondary.score +
    tagBonus +
    sigBonus +
    rareBonus -
    weakPenalty +
    intBonus,
    40,
    99,
  );

  return {
    modules: mod,
    positionBase: posBase,
    primaryArchetype: primary,
    secondaryArchetype: secondary,
    tagBonus,
    signatureSkillBonus: sigBonus,
    rareComboBonus: rareBonus,
    fatalWeaknessPenalty: weakPenalty,
    intangibleBonus: intBonus,
    rawCurrentOVR: r1(rawCurrentOVR),
  };
}

// ─── 10) League Distribution ─────────────────────────────────────────────────

export function calculateLeagueDistribution(rawValues: number[]): LeagueDistribution {
  const meanRawOVR = rawValues.reduce((s, v) => s + v, 0) / Math.max(1, rawValues.length);
  const stdRawOVR = Math.max(stddev(rawValues, meanRawOVR), 1.5);
  return { meanRawOVR, stdRawOVR };
}

// ─── 11) Display OVR (league-relative) ───────────────────────────────────────

export function mapRawOVRToDisplayOVR(rawOVR: number, dist: LeagueDistribution): number {
  const z = (rawOVR - dist.meanRawOVR) / dist.stdRawOVR;
  const display = 76 + 5.8 * z + 1.0 * z * z * z;
  return clamp(Math.round(display), 50, 99);
}

// ─── 12) Future OVR (potential-based, separate from current OVR) ─────────────

export function calculateFutureOVR(
  currentDisplayOVR: number,
  potential: number,
  age: number,
): number {
  let ageFactor = 0;
  if (age <= 21)      ageFactor = 1.00;
  else if (age <= 24) ageFactor = 0.75;
  else if (age <= 27) ageFactor = 0.40;
  else if (age <= 30) ageFactor = 0.15;
  else                ageFactor = 0;

  const growth = Math.max(0, (potential - currentDisplayOVR) * ageFactor * 0.55);
  return clamp(Math.round(currentDisplayOVR + growth), currentDisplayOVR, 99);
}
