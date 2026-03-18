
import type { Player } from '../types';
import {
  evaluatePlayerRawOVR,
  mapRawOVRToDisplayOVR,
  calculateFutureOVR,
  type PlayerInput,
  type PlayerRatings,
  type LeagueDistribution,
  type OvrPosition,
} from './ovrEngine';

// ─── League Distribution Cache ───────────────────────────────────────────────
// Initialised to a reasonable fallback so OVR is usable before all players load.
// Call setLeagueDistribution() once after the full roster is available.

let _leagueDist: LeagueDistribution = { meanRawOVR: 75.0, stdRawOVR: 7.0 };

export function setLeagueDistribution(dist: LeagueDistribution): void {
  _leagueDist = dist;
}

export function getLeagueDistribution(): LeagueDistribution {
  return _leagueDist;
}

// ─── Player → PlayerInput Adapter ────────────────────────────────────────────

function resolvePosition(position: string): OvrPosition {
  if (position.startsWith('PG')) return 'PG';
  if (position.startsWith('SG')) return 'SG';
  if (position.startsWith('SF')) return 'SF';
  if (position.startsWith('PF')) return 'PF';
  if (position.startsWith('C'))  return 'C';
  // Multi-position string: pick first segment
  const first = position.split('/')[0].trim();
  if (first === 'PG') return 'PG';
  if (first === 'SG') return 'SG';
  if (first === 'SF') return 'SF';
  if (first === 'PF') return 'PF';
  if (first === 'C')  return 'C';
  return 'SF'; // safe fallback
}

export function adaptPlayerToInput(p: Player | any, positionOverride?: string): PlayerInput {
  const pos = resolvePosition(positionOverride ?? p.position ?? 'SF');

  // Height: DB stores cm, engine needs inches
  const heightCm: number = p.height ?? 200;
  const heightInches = Math.round(heightCm / 2.54);

  const ratings: PlayerRatings = {
    // Inside Scoring
    closeShot:  p.closeShot  ?? p.ins ?? 70,
    layup:      p.layup      ?? p.ins ?? 70,
    dunk:       p.dunk       ?? p.ins ?? 70,
    postPlay:   p.postPlay   ?? p.ins ?? 70,
    drawFoul:   p.drawFoul   ?? p.ins ?? 70,
    hands:      p.hands      ?? p.ins ?? 70,

    // Outside Scoring (field name mapping: Player uses abbreviated names)
    midRange:             p.midRange    ?? p.out ?? 70,
    cornerThree:          p.threeCorner ?? p.out ?? 70,
    fortyFiveThree:       p.three45     ?? p.out ?? 70,
    topThree:             p.threeTop    ?? p.out ?? 70,
    freeThrow:            p.ft          ?? p.out ?? 70,
    shotIQ:               p.shotIq      ?? p.out ?? 70,
    offensiveConsistency: p.offConsist  ?? p.out ?? 70,

    // Playmaking
    passAccuracy:   p.passAcc         ?? p.plm ?? 70,
    ballHandling:   p.handling        ?? p.plm ?? 70,
    speedWithBall:  p.spdBall         ?? p.plm ?? 70,
    passVision:     p.passVision      ?? p.plm ?? 70,
    passIQ:         p.passIq          ?? p.plm ?? 70,
    offballMovement: p.offBallMovement ?? p.plm ?? 70,

    // Defense
    interiorDefense:   p.intDef     ?? p.def ?? 70,
    perimeterDefense:  p.perDef     ?? p.def ?? 70,
    steal:             p.steal      ?? p.def ?? 70,
    block:             p.blk        ?? p.def ?? 70,
    helpDefenseIQ:     p.helpDefIq  ?? p.def ?? 70,
    passPerception:    p.passPerc   ?? p.def ?? 70,
    defensiveConsistency: p.defConsist ?? p.def ?? 70,

    // Rebounds
    offensiveRebounds: p.offReb ?? p.reb ?? 70,
    defensiveRebounds: p.defReb ?? p.reb ?? 70,
    boxout:            p.boxOut ?? p.reb ?? 70,

    // Athleticism
    speed:      p.speed      ?? p.ath ?? 70,
    agility:    p.agility    ?? p.ath ?? 70,
    strength:   p.strength   ?? p.ath ?? 70,
    vertical:   p.vertical   ?? p.ath ?? 70,
    stamina:    p.stamina     ?? p.ath ?? 70,
    hustle:     p.hustle      ?? p.ath ?? 70,
    durability: p.durability  ?? p.ath ?? 70,

    // Intangible & meta
    intangible:   p.intangibles ?? 70,
    heightInches,
  };

  return {
    id:              String(p.id ?? 'unknown'),
    primaryPosition: pos,
    age:             p.age ?? 25,
    potential:       p.potential ?? 70,
    ratings,
  };
}

// ─── Public OVR APIs ─────────────────────────────────────────────────────────

/**
 * Calculates displayCurrentOVR for a single player.
 * Uses cached league distribution (updated by setLeagueDistribution after full load).
 *
 * This is a Pure Function from the perspective of caller code.
 * (It reads module-level distribution cache, but that is stable after startup.)
 */
export const calculateOvr = (attributes: Player | any, position?: string): number => {
  const input = adaptPlayerToInput(attributes, position);
  const raw   = evaluatePlayerRawOVR(input);
  return mapRawOVRToDisplayOVR(raw.rawCurrentOVR, _leagueDist);
};

/**
 * Returns raw (pre-distribution) OVR.
 * Useful for internal calculations (trade value, award voting) that should not
 * shift when league mean changes.
 */
export const calculateRawOvr = (attributes: Player | any, position?: string): number => {
  const input = adaptPlayerToInput(attributes, position);
  return evaluatePlayerRawOVR(input).rawCurrentOVR;
};

/**
 * Calculates futureOVR (potential-based, separate from current OVR).
 */
export const calculateFutureOvr = (p: Player | any, position?: string): number => {
  const input         = adaptPlayerToInput(p, position);
  const raw           = evaluatePlayerRawOVR(input);
  const displayOvr    = mapRawOVRToDisplayOVR(raw.rawCurrentOVR, _leagueDist);
  return calculateFutureOVR(displayOvr, input.potential, input.age);
};

/**
 * OVR → 별점 변환 (0.5 ~ 5.0, 0.5 단위)
 *
 * 리그 상대 displayOVR 기준 매핑:
 * | OVR   | Stars | Tier              |
 * |-------|-------|-------------------|
 * | 97+   | 5.0★  | MVP 슈퍼스타       |
 * | 93-96 | 4.5★  | All-NBA           |
 * | 89-92 | 4.0★  | All-Star          |
 * | 85-88 | 3.5★  | 주전급             |
 * | 81-84 | 3.0★  | 준주전             |
 * | 76-80 | 2.5★  | 로테이션           |
 * | 72-75 | 2.0★  | 벤치              |
 * | 68-71 | 1.5★  | 엔드 벤치          |
 * | 64-67 | 1.0★  | 투웨이/G리그        |
 * | <64   | 0.5★  | 리플레이스먼트 이하  |
 */
export const getPlayerStarRating = (ovr: number): number => {
  const raw = (ovr - 60) / 37 * 4.5 + 0.5;
  return Math.round(Math.max(0.5, Math.min(5.0, raw)) * 2) / 2;
};

// Re-export engine types that callers may need
export type { LeagueDistribution, OvrPosition } from './ovrEngine';
export { calculateLeagueDistribution } from './ovrEngine';
