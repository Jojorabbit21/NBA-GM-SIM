
/**
 * NBA-style OVR Engine (Tuned Version)
 *
 * Goals of this tuned version:
 * 1) Reduce OVR inflation at the top end
 * 2) Prevent too many 99 OVR players
 * 3) Preserve special cases like Curry / Jokic
 * 4) Make archetype a differentiator, not a second full base score
 * 5) Keep potential separate from current OVR
 */

import { getWeightConfigSync, getPositionConfigSync, getTagConfigSync, getLabelConfigSync } from '../services/admin/gameConfigService';

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
  intangible: number; // clutch / poise – small OVR effect, larger gameplay effect
  heightInches: number;
}

export interface PlayerInput {
  id: string;
  primaryPosition: OvrPosition;
  age: number;
  potential: number; // used only for futureOVR
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
  | 'FLOOR_GENERAL_GUARD'
  | 'SCORING_POINT_GUARD'
  | 'DEFENSIVE_GUARD'
  | 'TWO_WAY_WING'
  | 'SLASHING_WING'
  | 'SHOT_CREATOR_WING'
  | 'CONNECTOR_FORWARD'
  | 'AERIAL_WING'
  | 'POST_SCORING_WING'
  | 'WING_PROTECTOR'
  | 'THREE_LEVEL_SCORER'
  | 'LOCKDOWN_WING'
  | 'POST_SCORING_BIG'
  | 'RIM_RUNNER_BIG'
  | 'STRETCH_BIG'
  | 'RIM_PROTECTOR_ANCHOR'
  | 'PLAYMAKING_BIG'
  | 'SWITCHABLE_ANCHOR'
  | 'TWO_WAY_BIG'
  | 'REBOUNDING_BIG'
  | 'ISOLATION_SCORER'
  | 'ELBOW_OPERATOR'
  | 'ELITE_GUARD'
  | 'LOCKDOWN_SHOOTER';

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
  corePositionPenalty: number;
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
    case 'PG': return 77; // 6'5
    case 'SG': return 79; // 6'7
    case 'SF': return 81; // 6'9
    case 'PF': return 83; // 6'11
    case 'C':  return 85; // 7'1
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
    [r.postPlay, 0.26],
    [r.closeShot, 0.26],
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
    [r.interiorDefense, 0.42],
    [r.block, 0.14],
    [r.helpDefenseIQ, 0.18],
    [r.strength, 0.12],
    [r.vertical, 0.08],
    [r.defensiveConsistency, 0.06],
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
    spotUpShooting: r1(spotUpShooting),
    shotCreation: r1(shotCreation),
    rimFinishing: r1(rimFinishing),
    postCraft: r1(postCraft),
    playmaking: r1(playmaking),
    offballAttack: r1(offballAttack),
    poaDefense: r1(poaDefense),
    teamDefense: r1(teamDefense),
    rimProtection: r1(rimProtection),
    rebounding: r1(rebounding),
    athleticism: r1(athleticism),
    motorAvailability: r1(motorAvailability),
    sizeFit: r1(sizeFit),
  };
}

// ─── 2) Archetype Scores ─────────────────────────────────────────────────────

function calcArchetypeScore(mod: ModuleScores, arch: OvrArchetype): number {
  // DB 캐시에 가중치가 있으면 우선 사용, 없으면 hardcoded fallback
  const weightConfig = getWeightConfigSync();
  const archKey = arch.toLowerCase() as string;
  const dbWeights = weightConfig?.[archKey as keyof typeof weightConfig];
  if (dbWeights) {
    return wavg(
      (Object.entries(dbWeights) as [string, number][])
        .map(([modKey, w]) => [mod[modKey as keyof ModuleScores] ?? 0, w])
    );
  }

  switch (arch) {
    case 'PRIMARY_CREATOR_GUARD':
      return wavg([
        [mod.playmaking, 0.38],
        [mod.shotCreation, 0.22],
        [mod.rimFinishing, 0.12],
        [mod.spotUpShooting, 0.08],
        [mod.poaDefense, 0.08],
        [mod.motorAvailability, 0.12],
      ]);

    case 'SCORING_COMBO_GUARD':
      return wavg([
        [mod.shotCreation, 0.32],
        [mod.rimFinishing, 0.20],
        [mod.spotUpShooting, 0.18],
        [mod.playmaking, 0.12],
        [mod.offballAttack, 0.08],
        [mod.motorAvailability, 0.10],
      ]);

    case 'MOVEMENT_SHOOTER':
      return wavg([
        [mod.spotUpShooting, 0.40],
        [mod.offballAttack, 0.28],
        [mod.motorAvailability, 0.12],
        [mod.poaDefense, 0.10],
        [mod.teamDefense, 0.10],
      ]);

    case 'PERIMETER_3D':
      return wavg([
        [mod.spotUpShooting, 0.30],
        [mod.poaDefense, 0.28],
        [mod.teamDefense, 0.20],
        [mod.offballAttack, 0.10],
        [mod.motorAvailability, 0.12],
      ]);

    case 'TWO_WAY_WING':
      return wavg([
        [mod.spotUpShooting, 0.18],
        [mod.rimFinishing, 0.16],
        [mod.poaDefense, 0.18],
        [mod.teamDefense, 0.18],
        [mod.shotCreation, 0.10],
        [mod.rebounding, 0.10],
        [mod.motorAvailability, 0.10],
      ]);

    case 'SLASHING_WING':
      return wavg([
        [mod.rimFinishing, 0.34],
        [mod.shotCreation, 0.16],
        [mod.offballAttack, 0.14],
        [mod.poaDefense, 0.12],
        [mod.teamDefense, 0.10],
        [mod.motorAvailability, 0.14],
      ]);

    case 'SHOT_CREATOR_WING':
      return wavg([
        [mod.shotCreation, 0.30],
        [mod.rimFinishing, 0.18],
        [mod.spotUpShooting, 0.16],
        [mod.playmaking, 0.10],
        [mod.poaDefense, 0.10],
        [mod.motorAvailability, 0.16],
      ]);

    case 'CONNECTOR_FORWARD':
      return wavg([
        [mod.playmaking, 0.24],
        [mod.spotUpShooting, 0.18],
        [mod.teamDefense, 0.16],
        [mod.rebounding, 0.14],
        [mod.offballAttack, 0.10],
        [mod.rimFinishing, 0.08],
        [mod.motorAvailability, 0.10],
      ]);

    case 'POST_SCORING_BIG':
      return wavg([
        [mod.postCraft, 0.38],
        [mod.rimFinishing, 0.20],
        [mod.rebounding, 0.16],
        [mod.rimProtection, 0.10],
        [mod.teamDefense, 0.08],
        [mod.motorAvailability, 0.08],
      ]);

    case 'RIM_RUNNER_BIG':
      return wavg([
        [mod.rimFinishing, 0.30],
        [mod.rimProtection, 0.24],
        [mod.rebounding, 0.22],
        [mod.teamDefense, 0.10],
        [mod.motorAvailability, 0.14],
      ]);

    case 'STRETCH_BIG':
      return wavg([
        [mod.spotUpShooting, 0.30],
        [mod.rebounding, 0.20],
        [mod.rimProtection, 0.18],
        [mod.teamDefense, 0.12],
        [mod.postCraft, 0.10],
        [mod.motorAvailability, 0.10],
      ]);

    case 'RIM_PROTECTOR_ANCHOR':
      return wavg([
        [mod.rimProtection, 0.40],
        [mod.rebounding, 0.28],
        [mod.teamDefense, 0.18],
        [mod.motorAvailability, 0.14],
      ]);

    case 'PLAYMAKING_BIG':
      return wavg([
        [mod.playmaking, 0.26],
        [mod.postCraft, 0.20],
        [mod.spotUpShooting, 0.16],
        [mod.rebounding, 0.16],
        [mod.teamDefense, 0.12],
        [mod.rimProtection, 0.10],
      ]);

    case 'AERIAL_WING':
      return wavg([
        [mod.rimFinishing, 0.40],
        [mod.rebounding, 0.18],
        [mod.postCraft, 0.12],
        [mod.teamDefense, 0.10],
        [mod.poaDefense, 0.08],
        [mod.motorAvailability, 0.12],
      ]);

    case 'POST_SCORING_WING':
      return wavg([
        [mod.postCraft, 0.32],
        [mod.rimFinishing, 0.22],
        [mod.shotCreation, 0.14],
        [mod.rebounding, 0.12],
        [mod.teamDefense, 0.08],
        [mod.motorAvailability, 0.12],
      ]);

    case 'WING_PROTECTOR':
      return wavg([
        [mod.rimProtection, 0.30],
        [mod.poaDefense, 0.24],
        [mod.teamDefense, 0.20],
        [mod.rebounding, 0.14],
        [mod.motorAvailability, 0.12],
      ]);

    case 'FLOOR_GENERAL_GUARD':
      return wavg([
        [mod.playmaking, 0.42],
        [mod.teamDefense, 0.16],
        [mod.poaDefense, 0.12],
        [mod.spotUpShooting, 0.10],
        [mod.motorAvailability, 0.10],
        [mod.offballAttack, 0.10],
      ]);

    case 'SCORING_POINT_GUARD':
      return wavg([
        [mod.shotCreation, 0.28],
        [mod.playmaking, 0.20],
        [mod.rimFinishing, 0.18],
        [mod.spotUpShooting, 0.14],
        [mod.motorAvailability, 0.10],
        [mod.poaDefense, 0.10],
      ]);

    case 'DEFENSIVE_GUARD':
      return wavg([
        [mod.poaDefense, 0.32],
        [mod.teamDefense, 0.18],
        [mod.playmaking, 0.14],
        [mod.spotUpShooting, 0.14],
        [mod.motorAvailability, 0.12],
        [mod.rebounding, 0.10],
      ]);

    case 'THREE_LEVEL_SCORER':
      return wavg([
        [mod.shotCreation, 0.26],
        [mod.rimFinishing, 0.24],
        [mod.spotUpShooting, 0.24],
        [mod.motorAvailability, 0.10],
        [mod.playmaking, 0.08],
        [mod.poaDefense, 0.08],
      ]);

    case 'LOCKDOWN_WING':
      return wavg([
        [mod.poaDefense, 0.34],
        [mod.teamDefense, 0.22],
        [mod.motorAvailability, 0.16],
        [mod.rebounding, 0.12],
        [mod.rimFinishing, 0.08],
        [mod.playmaking, 0.08],
      ]);

    case 'SWITCHABLE_ANCHOR':
      return wavg([
        [mod.poaDefense, 0.20],
        [mod.teamDefense, 0.18],
        [mod.rimProtection, 0.18],
        [mod.playmaking, 0.14],
        [mod.rebounding, 0.14],
        [mod.motorAvailability, 0.16],
      ]);

    case 'TWO_WAY_BIG':
      return wavg([
        [mod.postCraft, 0.22],
        [mod.rimFinishing, 0.18],
        [mod.rimProtection, 0.24],
        [mod.rebounding, 0.16],
        [mod.teamDefense, 0.12],
        [mod.motorAvailability, 0.08],
      ]);

    case 'REBOUNDING_BIG':
      return wavg([
        [mod.rebounding, 0.44],
        [mod.rimFinishing, 0.20],
        [mod.rimProtection, 0.16],
        [mod.motorAvailability, 0.12],
        [mod.teamDefense, 0.08],
      ]);

    case 'ISOLATION_SCORER':
      return wavg([
        [mod.shotCreation,     0.32],
        [mod.postCraft,        0.24],
        [mod.rimFinishing,     0.12],
        [mod.playmaking,       0.12],
        [mod.motorAvailability,0.12],
        [mod.poaDefense,       0.08],
      ]);

    case 'ELBOW_OPERATOR':
      return wavg([
        [mod.postCraft,        0.28],
        [mod.shotCreation,     0.24],
        [mod.rimFinishing,     0.16],
        [mod.rebounding,       0.14],
        [mod.teamDefense,      0.12],
        [mod.motorAvailability,0.06],
      ]);

    case 'ELITE_GUARD':
      return wavg([
        [mod.shotCreation,     0.26],
        [mod.poaDefense,       0.24],
        [mod.playmaking,       0.20],
        [mod.rimFinishing,     0.12],
        [mod.teamDefense,      0.10],
        [mod.motorAvailability,0.08],
      ]);

    case 'LOCKDOWN_SHOOTER':
      return wavg([
        [mod.spotUpShooting,   0.35],
        [mod.poaDefense,       0.30],
        [mod.teamDefense,      0.15],
        [mod.offballAttack,    0.10],
        [mod.motorAvailability,0.10],
      ]);
  }
}

const ARCHETYPE_CANDIDATES: Record<OvrPosition, OvrArchetype[]> = {
  PG: ['PRIMARY_CREATOR_GUARD', 'SCORING_COMBO_GUARD', 'MOVEMENT_SHOOTER', 'PERIMETER_3D',
       'FLOOR_GENERAL_GUARD', 'SCORING_POINT_GUARD', 'DEFENSIVE_GUARD', 'THREE_LEVEL_SCORER',
       'ISOLATION_SCORER', 'ELITE_GUARD', 'LOCKDOWN_SHOOTER'],
  SG: ['PRIMARY_CREATOR_GUARD', 'SCORING_COMBO_GUARD', 'MOVEMENT_SHOOTER', 'PERIMETER_3D',
       'TWO_WAY_WING', 'SLASHING_WING', 'SHOT_CREATOR_WING',
       'FLOOR_GENERAL_GUARD', 'SCORING_POINT_GUARD', 'DEFENSIVE_GUARD',
       'THREE_LEVEL_SCORER', 'LOCKDOWN_WING', 'ISOLATION_SCORER',
       'ELITE_GUARD', 'LOCKDOWN_SHOOTER'],
  SF: ['MOVEMENT_SHOOTER', 'PERIMETER_3D', 'TWO_WAY_WING', 'SLASHING_WING', 'SHOT_CREATOR_WING',
       'CONNECTOR_FORWARD', 'AERIAL_WING', 'POST_SCORING_WING', 'WING_PROTECTOR',
       'THREE_LEVEL_SCORER', 'LOCKDOWN_WING', 'ELBOW_OPERATOR'],
  PF: ['TWO_WAY_WING', 'CONNECTOR_FORWARD', 'POST_SCORING_BIG', 'RIM_RUNNER_BIG', 'STRETCH_BIG',
       'RIM_PROTECTOR_ANCHOR', 'PLAYMAKING_BIG', 'AERIAL_WING', 'POST_SCORING_WING', 'WING_PROTECTOR',
       'THREE_LEVEL_SCORER', 'LOCKDOWN_WING', 'SWITCHABLE_ANCHOR', 'TWO_WAY_BIG', 'REBOUNDING_BIG',
       'ELBOW_OPERATOR'],
  C:  ['POST_SCORING_BIG', 'RIM_RUNNER_BIG', 'STRETCH_BIG', 'RIM_PROTECTOR_ANCHOR', 'PLAYMAKING_BIG',
       'THREE_LEVEL_SCORER', 'SWITCHABLE_ANCHOR', 'TWO_WAY_BIG', 'REBOUNDING_BIG',
       'ELBOW_OPERATOR'],
};

function selectPrimarySecondary(
  pos: OvrPosition,
  mod: ModuleScores,
): {
  primary: { archetype: OvrArchetype; score: number };
  secondary: { archetype: OvrArchetype; score: number };
  blend: number;
} {
  const posConfig = getPositionConfigSync();
  const labelConf = getLabelConfigSync();
  const customCandidates: OvrArchetype[] = posConfig
      ? (Object.entries(posConfig)
          .filter(([, positions]) => positions.includes(pos))
          .map(([key]) => key as OvrArchetype)
          .filter(key => !ARCHETYPE_CANDIDATES[pos].includes(key)))
      : [];
  // If label config is loaded, exclude hardcoded archetypes that were deleted from DB
  const baseCandidates = (labelConf && Object.keys(labelConf).length > 0)
      ? ARCHETYPE_CANDIDATES[pos].filter(arch => arch in labelConf)
      : ARCHETYPE_CANDIDATES[pos];
  const allCandidates = [...baseCandidates, ...customCandidates];
  const ranked = (allCandidates.length > 0 ? allCandidates : ARCHETYPE_CANDIDATES[pos])
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

function evalTagClauseOvr(clause: { fieldType: string; field: string; op: string; value: number }, r: PlayerRatings, mod: ModuleScores): boolean {
  const val = clause.fieldType === 'module'
    ? (mod as any)[clause.field]
    : (r as any)[clause.field];
  if (val === undefined) return false;
  return clause.op === '>=' ? val >= clause.value : val <= clause.value;
}

export function evalTagConditionOvr(cond: { type: string; clause?: any; clauses?: any[]; orClauses?: any[]; andClauses?: any[] }, r: PlayerRatings, mod: ModuleScores): boolean {
  if (cond.type === 'single')   return evalTagClauseOvr(cond.clause, r, mod);
  if (cond.type === 'all_of')   return (cond.clauses ?? []).every((c: any) => evalTagClauseOvr(c, r, mod));
  if (cond.type === 'or_first') return (cond.orClauses ?? []).some((c: any) => evalTagClauseOvr(c, r, mod))
                                     && (cond.andClauses ?? []).every((c: any) => evalTagClauseOvr(c, r, mod));
  return false;
}

function calcTagBonus(pos: OvrPosition, r: PlayerRatings, mod: ModuleScores): number {
  const dbTags = getTagConfigSync();

  const bonuses: number[] = [];
  let negBonus = 0;

  if (dbTags && dbTags.length > 0) {
    // DB-driven tag bonus evaluation
    for (const entry of dbTags) {
      if (!evalTagConditionOvr(entry.condition as any, r, mod)) continue;
      const bonus = entry.posOvrBonus?.[pos] ?? entry.ovrBonus;
      if (bonus < 0) negBonus += bonus;
      else bonuses.push(bonus);
    }
  } else {
    // Hardcoded fallback
    if (mod.rimFinishing >= 88) bonuses.push(0.85);
    if (r.drawFoul >= 90) bonuses.push(0.40);
    if (mod.shotCreation >= 88) bonuses.push(1.00);
    if (mod.spotUpShooting >= 86) bonuses.push(0.75);
    if (mod.offballAttack >= 84 && mod.spotUpShooting >= 84) bonuses.push(1.10);
    if (mod.playmaking >= 86) bonuses.push(pos === 'PF' || pos === 'C' ? 1.50 : 1.00);
    if (mod.poaDefense >= 86) bonuses.push(0.85);
    if (mod.teamDefense >= 86) bonuses.push(0.70);
    if (mod.rimProtection >= 88) bonuses.push(1.10);
    if (mod.postCraft >= 90) bonuses.push(pos === 'PF' || pos === 'C' ? 1.10 : 0.75);
    if (mod.rebounding >= 86) bonuses.push(0.70);
    if (mod.motorAvailability >= 86) bonuses.push(0.50);
    if (r.durability >= 90 && r.stamina >= 85) bonuses.push(0.40);
    const atkAvg = avg([mod.spotUpShooting, mod.shotCreation, mod.rimFinishing]);
    const defAvg = avg([mod.poaDefense, mod.teamDefense, mod.rimProtection]);
    if (atkAvg >= 82 && defAvg >= 82 && r.offensiveConsistency >= 75 && r.defensiveConsistency >= 75) bonuses.push(1.40);
    if ((mod.shotCreation >= 82 || mod.spotUpShooting >= 82) && r.offensiveConsistency <= 60) negBonus -= 1.20;
  }

  // Diminishing returns for stacked tags
  const sorted = bonuses.sort((a, b) => b - a);
  const diminishingWeights = [1.0, 0.70, 0.50, 0.30];
  const posBonus = sorted
    .slice(0, diminishingWeights.length)
    .reduce((sum, bonus, i) => sum + bonus * diminishingWeights[i], 0);

  return r1(clamp(posBonus + negBonus, -2.0, 4.0));
}

// ─── 4) Position Base ────────────────────────────────────────────────────────
// NOTE: intangible REMOVED from position base to avoid double counting.

function calcPositionBase(pos: OvrPosition, mod: ModuleScores): number {
  switch (pos) {
    case 'PG':
      return r1(wavg([
        [mod.playmaking, 0.31],
        [mod.spotUpShooting, 0.24],
        [mod.rimFinishing, 0.11],
        [mod.poaDefense, 0.08],
        [mod.athleticism, 0.07],
        [mod.motorAvailability, 0.06],
        [mod.sizeFit, 0.05],
        [mod.teamDefense, 0.04],
        [mod.shotCreation, 0.04],
      ]));

    case 'SG':
      return r1(wavg([
        [mod.spotUpShooting, 0.27],
        [mod.shotCreation, 0.18],
        [mod.rimFinishing, 0.13],
        [mod.playmaking, 0.09],
        [mod.poaDefense, 0.10],
        [mod.athleticism, 0.08],
        [mod.motorAvailability, 0.06],
        [mod.sizeFit, 0.05],
        [mod.teamDefense, 0.04],
      ]));

    case 'SF':
      return r1(wavg([
        [mod.postCraft, 0.10],
        [mod.spotUpShooting, 0.14],
        [mod.shotCreation, 0.12],
        [mod.rimFinishing, 0.13],
        [mod.playmaking, 0.09],
        [mod.poaDefense, 0.14],
        [mod.teamDefense, 0.11],
        [mod.rebounding, 0.09],
        [mod.athleticism, 0.07],
        [mod.motorAvailability, 0.04],
        [mod.sizeFit, 0.05],
      ]));

    case 'PF':
      return r1(wavg([
        [mod.postCraft, 0.08],
        [mod.spotUpShooting, 0.10],
        [mod.rimFinishing, 0.11],
        [mod.playmaking, 0.06],
        [mod.rimProtection, 0.21],
        [mod.rebounding, 0.17],
        [mod.teamDefense, 0.11],
        [mod.poaDefense, 0.06],
        [mod.athleticism, 0.06],
        [mod.motorAvailability, 0.03],
        [mod.sizeFit, 0.01],
      ]));

    case 'C':
      return r1(wavg([
        [mod.postCraft, 0.08],
        [mod.spotUpShooting, 0.05],
        [mod.rimFinishing, 0.10],
        [mod.playmaking, 0.08],
        [mod.rimProtection, 0.24],
        [mod.rebounding, 0.27],
        [mod.teamDefense, 0.10],
        [mod.athleticism, 0.05],
        [mod.motorAvailability, 0.02],
        [mod.sizeFit, 0.01],
      ]));
  }
}

// ─── 5) Signature Skill Bonus ────────────────────────────────────────────────

function calcSignatureSkillBonus(mod: ModuleScores): number {
  const pool = [
    mod.spotUpShooting,
    mod.shotCreation,
    mod.rimFinishing,
    mod.postCraft,
    mod.playmaking,
    mod.poaDefense,
    mod.teamDefense,
    mod.rimProtection,
    mod.rebounding,
  ].sort((a, b) => b - a);

  const best = pool[0];
  const second = pool[1];

  function bonusFrom(v: number): number {
    if (v >= 98) return 4.0 + (v - 98) * 0.25;  // 98→4.0, 99→4.25
    if (v >= 95) return 2.4 + (v - 95) * 0.53;  // 95→2.4, 97→3.5, 98→4.0
    if (v >= 90) return 1.0 + (v - 90) * 0.28;  // 90→1.0, 93→1.8, 95→2.4
    return 0;
  }

  const bonus = bonusFrom(best) + bonusFrom(second) * 0.45;
  return r1(clamp(bonus, 0, 6.0));
}

// ─── 6) Rare Combo Bonus ─────────────────────────────────────────────────────

function calcRareComboBonus(pos: OvrPosition, mod: ModuleScores, r: PlayerRatings): number {
  let bonus = 0;

  // ── PG / SG ──────────────────────────────────────────────────────────────
  // 패스형 크리에이터 + 슈팅 (Magic/CP3 유형)
  if ((pos === 'PG' || pos === 'SG') && mod.playmaking >= 90 && mod.spotUpShooting >= 92) bonus += 3.5;
  // 역대급 스팟업 슈터
  if ((pos === 'PG' || pos === 'SG') && mod.spotUpShooting >= 98) bonus += 2.5;
  // 볼핸들링 슈터 (커리, 하든 — 핸들러 기반 슈팅 기회 창출)
  if ((pos === 'PG' || pos === 'SG') && r.ballHandling >= 93 && mod.spotUpShooting >= 95) bonus += 4.5;
  // [tier 2] 역대급 볼핸들링 슈터 — GOAT급 핸들러+슈터 (커리 전용 티어)
  if ((pos === 'PG' || pos === 'SG') && r.ballHandling >= 96 && mod.spotUpShooting >= 97) bonus += 3.0;

  // ── SG / SF ──────────────────────────────────────────────────────────────
  // 슛 창조 + 슈팅 (KD, 레이 앨런 유형)
  if ((pos === 'SG' || pos === 'SF') && mod.shotCreation >= 90 && mod.spotUpShooting >= 88) bonus += 3.0;
  // 슈팅 + 외곽 수비 양면 (클레이, 폴 조지 유형)
  if ((pos === 'SG' || pos === 'SF') && mod.spotUpShooting >= 88 && mod.poaDefense >= 88) bonus += 2.5;
  // 미드레인지 득점 + 수비 (조던, 코비, 카와이 유형 — 3점 없이도 GOAT급)
  if ((pos === 'SG' || pos === 'SF') && mod.shotCreation >= 88 && mod.poaDefense >= 90) bonus += 3.5;
  // [tier 2] GOAT급 득점+수비 양면 — 역대 최고 수준의 득점-수비 (조던, 코비 최상위 티어)
  if ((pos === 'SG' || pos === 'SF') && mod.shotCreation >= 93 && mod.poaDefense >= 93) bonus += 2.5;

  // ── SF / PF ──────────────────────────────────────────────────────────────
  // 피니셔 + 플레이메이커 (르브론 유형 — 포워드로서 패스+피니싱 최상위)
  if ((pos === 'SF' || pos === 'PF') && mod.rimFinishing >= 88 && mod.playmaking >= 90) bonus += 5.5;
  // [신규] 슈퍼 애슬릿 포워드 — 압도적 운동능력 + 림피니싱 (르브론, 야니스 유형)
  if ((pos === 'SF' || pos === 'PF') && mod.rimFinishing >= 90 && mod.athleticism >= 88) bonus += 2.5;

  // ── PF / C ───────────────────────────────────────────────────────────────
  // 플레이메이킹 빅 + 포스트 (요키치 유형 — 가장 희귀)
  if ((pos === 'PF' || pos === 'C') && mod.playmaking >= 88 && mod.postCraft >= 82) bonus += 4.5;
  // 플레이메이킹 빅 + 포스트 엘리트 (요키치 특화 추가 보너스)
  if ((pos === 'PF' || pos === 'C') && mod.playmaking >= 88 && mod.postCraft >= 90) bonus += 2.0;
  // [신규] GOAT급 플레이메이킹 빅 — 플레이메이킹+포스트 역대 최상위 (요키치, 올라주원 티어)
  if ((pos === 'PF' || pos === 'C') && mod.playmaking >= 90 && mod.postCraft >= 88) bonus += 2.5;
  // 트루 포인트 센터 (플레이메이킹 최상위)
  if ((pos === 'PF' || pos === 'C') && mod.playmaking >= 94) bonus += 2.5;
  // 스트레치 + 림프로텍션 (KAT, 야니스 early 유형)
  if ((pos === 'PF' || pos === 'C') && mod.spotUpShooting >= 84 && mod.rimProtection >= 88) bonus += 2.5;
  // 리바운딩 + 림프로텍션 최상위 — 임계값 상향 (체임벌린, 러셀 전용 — 역대 최고 수준만 해당)
  if ((pos === 'PF' || pos === 'C') && mod.rebounding >= 95 && mod.rimProtection >= 96) bonus += 2.5;

  return r1(clamp(bonus, 0, 10.0));
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
      penalty += scoreRangeLinear(76 - mod.playmaking, 14, 6.5);
      penalty += scoreRangeLinear(72 - r.ballHandling, 14, 4.5);
      break;

    case 'SCORING_COMBO_GUARD':
      penalty += scoreRangeLinear(78 - mod.shotCreation, 14, 5.5);
      penalty += scoreRangeLinear(72 - mod.rimFinishing, 14, 3.5);
      break;

    case 'MOVEMENT_SHOOTER':
      penalty += scoreRangeLinear(80 - mod.spotUpShooting, 14, 5.5);
      penalty += scoreRangeLinear(74 - mod.offballAttack, 14, 3.5);
      break;

    case 'PERIMETER_3D':
      penalty += scoreRangeLinear(78 - mod.spotUpShooting, 14, 4.5);
      penalty += scoreRangeLinear(80 - mod.poaDefense, 14, 5.5);
      break;

    case 'TWO_WAY_WING':
      penalty += scoreRangeLinear(76 - mod.poaDefense, 14, 4.5);
      penalty += scoreRangeLinear(74 - mod.spotUpShooting, 14, 3.5);
      break;

    case 'SLASHING_WING':
      penalty += scoreRangeLinear(82 - mod.rimFinishing, 14, 6.5);
      break;

    case 'SHOT_CREATOR_WING':
      penalty += scoreRangeLinear(82 - mod.shotCreation, 14, 6.5);
      break;

    case 'CONNECTOR_FORWARD':
      penalty += scoreRangeLinear(76 - mod.playmaking, 14, 4.5);
      penalty += scoreRangeLinear(74 - mod.teamDefense, 14, 4.0);
      break;

    case 'POST_SCORING_BIG':
      penalty += scoreRangeLinear(76 - mod.postCraft, 14, 6.0);
      break;

    case 'RIM_RUNNER_BIG':
      penalty += scoreRangeLinear(76 - mod.rimFinishing, 14, 5.0);
      penalty += scoreRangeLinear(70 - mod.rebounding, 14, 3.5);
      break;

    case 'STRETCH_BIG':
      penalty += scoreRangeLinear(76 - mod.spotUpShooting, 14, 5.0);
      break;

    case 'RIM_PROTECTOR_ANCHOR':
      penalty += scoreRangeLinear(72 - mod.rimProtection, 14, 4.5);
      penalty += scoreRangeLinear(68 - mod.rebounding, 14, 2.5);
      break;

    case 'PLAYMAKING_BIG':
      penalty += scoreRangeLinear(78 - mod.playmaking, 14, 5.5);
      if (mod.postCraft < 68 && mod.spotUpShooting < 70) {
        penalty += 2.0;
      }
      break;

    // ── New archetypes (6) ──
    case 'FLOOR_GENERAL_GUARD':
      penalty += scoreRangeLinear(80 - mod.playmaking, 14, 7.0);
      break;

    case 'SCORING_POINT_GUARD':
      penalty += scoreRangeLinear(76 - mod.shotCreation, 14, 5.5);
      penalty += scoreRangeLinear(72 - mod.playmaking, 14, 3.5);
      break;

    case 'DEFENSIVE_GUARD':
      penalty += scoreRangeLinear(80 - mod.poaDefense, 14, 6.5);
      break;

    case 'THREE_LEVEL_SCORER':
      penalty += scoreRangeLinear(74 - mod.rimFinishing, 14, 4.0);
      penalty += scoreRangeLinear(74 - mod.shotCreation, 14, 4.0);
      penalty += scoreRangeLinear(74 - mod.spotUpShooting, 14, 4.0);
      break;

    case 'LOCKDOWN_WING':
      penalty += scoreRangeLinear(82 - mod.poaDefense, 14, 6.5);
      break;

    case 'SWITCHABLE_ANCHOR':
      penalty += scoreRangeLinear(74 - mod.poaDefense, 14, 4.5);
      penalty += scoreRangeLinear(74 - mod.rimProtection, 14, 4.5);
      break;

    case 'TWO_WAY_BIG':
      // Post skill is the offensive identity — independent penalties
      penalty += scoreRangeLinear(70 - mod.postCraft, 14, 4.5);
      penalty += scoreRangeLinear(70 - mod.rimProtection, 14, 4.0);
      break;

    case 'REBOUNDING_BIG':
      // Rebounding is the sole identity — penalty only for non-elite rebounders
      penalty += scoreRangeLinear(78 - mod.rebounding, 14, 5.5);
      break;

    // ── Previously missing cases (3) ──
    case 'AERIAL_WING':
      penalty += scoreRangeLinear(82 - mod.rimFinishing, 14, 6.5);
      break;

    case 'POST_SCORING_WING':
      penalty += scoreRangeLinear(78 - mod.postCraft, 14, 5.5);
      break;

    case 'WING_PROTECTOR':
      penalty += scoreRangeLinear(78 - mod.rimProtection, 14, 5.0);
      penalty += scoreRangeLinear(76 - mod.poaDefense, 14, 4.0);
      break;
  }

  return r1(clamp(penalty, 0, 9));
}

// ─── 8) Core Position Penalty ────────────────────────────────────────────────
// Enforces a minimum viable NBA profile by position.

function calcCorePositionPenalty(pos: OvrPosition, mod: ModuleScores): number {
  let penalty = 0;

  switch (pos) {
    case 'PG':
      penalty += scoreRangeLinear(74 - mod.playmaking, 16, 5.0);
      penalty += scoreRangeLinear(70 - mod.spotUpShooting, 16, 2.5);
      break;

    case 'SG':
      if (mod.spotUpShooting < 72 && mod.shotCreation < 72) {
        penalty += 4.0;
      }
      break;

    case 'SF':
      if (mod.spotUpShooting < 70 && mod.poaDefense < 72 && mod.teamDefense < 72) {
        penalty += 4.5;
      }
      break;

    case 'PF':
      // Only truly deficient PFs get penalized (both far below position average)
      if (mod.rebounding < 64 && mod.rimProtection < 61) {
        penalty += 3.5;
      } else if (mod.rebounding < 57 && mod.rimProtection < 57) {
        penalty += 5.0;
      }
      break;

    case 'C':
      // Only truly deficient Cs get penalized (both far below position average)
      if (mod.rebounding < 65 && mod.rimProtection < 62) {
        penalty += 4.0;
      } else if (mod.rebounding < 58 && mod.rimProtection < 58) {
        penalty += 5.5;
      }
      break;
  }

  return r1(clamp(penalty, 0, 6));
}

// ─── 9) Intangible Bonus ─────────────────────────────────────────────────────

function intangibleBonus(intangible: number): number {
  // Small effect on OVR; clutch value is mostly in gameplay.
  return clamp(((intangible - 50) / 50) * 1.0, -1.0, 1.0);
}

// ─── 10) Raw Current OVR ─────────────────────────────────────────────────────

export function evaluatePlayerRawOVR(player: PlayerInput): RawOVRResult {
  const mod = calculateModules(player.ratings, player.primaryPosition);
  const { primary, secondary } = selectPrimarySecondary(player.primaryPosition, mod);

  const posBase = calcPositionBase(player.primaryPosition, mod);
  const tagBonus = calcTagBonus(player.primaryPosition, player.ratings, mod);
  const sigBonus = calcSignatureSkillBonus(mod);
  const rareBonus = calcRareComboBonus(player.primaryPosition, mod, player.ratings);
  const weakPenalty = calcFatalWeaknessPenalty(primary.archetype, player.ratings, mod);
  const corePenalty = calcCorePositionPenalty(player.primaryPosition, mod);
  const intBonus = intangibleBonus(player.ratings.intangible);

  // Archetypes act as adjustments relative to the position base,
  // not as full scores. This prevents archetype inflation.
  const primaryAdj = (primary.score - posBase) * 0.18;
  const secondaryAdj = (secondary.score - posBase) * 0.08;

  // Positional calibration: big-man key modules (rimProtection, rebounding) and SF modules
  // score lower in absolute value than guard modules due to attribute distribution.
  // C calibration is conditional: pure defensive Cs with no rim offense (Ben Wallace type)
  // get reduced calibration so they don't inflate past their real two-way value.
  let calAdj = ({ SF: 4.0, PF: 5.0 } as Partial<Record<OvrPosition, number>>)[player.primaryPosition] ?? 0;
  if (player.primaryPosition === 'C') {
    const cHasOffense = mod.postCraft >= 62 || mod.rimFinishing >= 72;
    calAdj = cHasOffense ? 5.0 : 1.0;
  }

  const rawCurrentOVR = clamp(
    posBase +
    primaryAdj +
    secondaryAdj +
    tagBonus +
    sigBonus +
    rareBonus -
    weakPenalty -
    corePenalty +
    intBonus +
    calAdj,
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
    corePositionPenalty: corePenalty,
    intangibleBonus: intBonus,
    rawCurrentOVR: r1(rawCurrentOVR),
  };
}

// ─── 11) League Distribution ─────────────────────────────────────────────────

export function calculateLeagueDistribution(rawValues: number[]): LeagueDistribution {
  const meanRawOVR = rawValues.reduce((s, v) => s + v, 0) / Math.max(1, rawValues.length);
  const stdRawOVR = Math.max(stddev(rawValues, meanRawOVR), 1.75);
  return { meanRawOVR, stdRawOVR };
}

// ─── 12) Display OVR (league-relative, top-end compressed) ───────────────────

export function mapRawOVRToDisplayOVR(rawOVR: number, dist: LeagueDistribution): number {
  const z = (rawOVR - dist.meanRawOVR) / dist.stdRawOVR;

  // Spread calibrated for 445-player league: top player (z≈2.3) lands ~94
  let display = 75 + 6.5 * z + 0.35 * z * z * z;

  // Top-end compression: makes 99 truly rare
  if (display > 95) {
    display = 95 + (display - 95) * 0.55;
  }
  if (display > 97.5) {
    display = 97.5 + (display - 97.5) * 0.28;
  }

  return clamp(Math.round(display), 50, 99);
}

// ─── 13) Optional league-wide rank cap for the very top ──────────────────────
// Use this only if you want an even stricter top-end distribution.
// Example policy:
// - top 1 player can be 99
// - next 2 players max 98
// - next 4 players max 97
export function applyEliteRankCaps(displayOVRs: number[]): number[] {
  const indexed = displayOVRs.map((ovr, i) => ({ i, ovr }))
    .sort((a, b) => b.ovr - a.ovr);

  for (let rank = 0; rank < indexed.length; rank++) {
    const item = indexed[rank];
    let cap = 99;

    if (rank === 0) cap = 99;
    else if (rank <= 2) cap = 98;
    else if (rank <= 6) cap = 97;
    else if (rank <= 12) cap = 96;
    else if (rank <= 20) cap = 95;

    item.ovr = Math.min(item.ovr, cap);
  }

  const result = new Array(displayOVRs.length).fill(0);
  for (const item of indexed) {
    result[item.i] = item.ovr;
  }
  return result;
}

// ─── 14) Future OVR (potential-based, separate from current OVR) ─────────────

export function calculateFutureOVR(
  currentDisplayOVR: number,
  potential: number,
  age: number,
): number {
  let ageFactor = 0;
  if (age <= 21) ageFactor = 1.00;
  else if (age <= 24) ageFactor = 0.75;
  else if (age <= 27) ageFactor = 0.40;
  else if (age <= 30) ageFactor = 0.15;
  else ageFactor = 0;

  const growth = Math.max(0, (potential - currentDisplayOVR) * ageFactor * 0.55);
  return clamp(Math.round(currentDisplayOVR + growth), currentDisplayOVR, 99);
}
