
/**
 * ovrUtils.ts — 멀티플레이어 이식본 (Phase 3: 어댑터 계층 포팅)
 * 원본: utils/ovrUtils.ts.
 *
 * getOVRThreshold()/OVR_TIER_THRESHOLDS는 server/src/shared/utils/constants.ts에
 * 이미 동일하게 존재해 이식 대상에서 제외했다. getPlayerStarRating()은 순수
 * 클라이언트 표시 로직(별점 렌더링)이라 서버에 필요 없어 제외했다.
 */

import type { Player } from '../types/player.ts';
import {
  evaluatePlayerRawOVR,
  calculateFutureOVR,
  ARCHETYPE_LABEL,
  type PlayerInput,
  type PlayerRatings,
  type OvrPosition,
} from './ovrEngine.ts';
import { getLabelConfigSync } from '../services/admin/gameConfigService.ts';

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
 * Calculates OVR for a single player.
 * rawCurrentOVR is returned directly — no z-score normalization.
 * OVR values are absolute (not league-relative), so a single player's change
 * does not affect any other player's OVR.
 */
export const calculateOvr = (attributes: Player | any, position?: string): number => {
  const input = adaptPlayerToInput(attributes, position);
  const raw   = evaluatePlayerRawOVR(input);
  return Math.round(raw.rawCurrentOVR);
};

/**
 * calculateOvr()과 동일한 evaluatePlayerRawOVR() 결과 하나로 OVR과 주/부 아키타입 라벨을
 * 같이 뽑아낸다 — 아키타입 표시가 필요한 곳(드래프트 풀 등)에서 OVR을 두 번 계산하지
 * 않도록 하기 위함. 라벨은 DB 커스텀 설정(archetypes.labels) 우선, 없으면 하드코딩 폴백.
 * secondaryArchetype은 primary와 동일하면 null(후보군이 1개뿐인 극히 드문 경우 대비).
 */
export const calculateOvrWithArchetype = (attributes: Player | any, position?: string): { ovr: number; archetype: string; secondaryArchetype: string | null } => {
  const input = adaptPlayerToInput(attributes, position);
  const raw   = evaluatePlayerRawOVR(input);
  const labelConf = getLabelConfigSync();
  const resolveLabel = (key: string) => labelConf?.[key] ?? ARCHETYPE_LABEL[key as keyof typeof ARCHETYPE_LABEL] ?? key;
  const primaryKey   = raw.primaryArchetype.archetype;
  const secondaryKey = raw.secondaryArchetype.archetype;
  return {
    ovr: Math.round(raw.rawCurrentOVR),
    archetype: resolveLabel(primaryKey),
    secondaryArchetype: secondaryKey !== primaryKey ? resolveLabel(secondaryKey) : null,
  };
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
  const input      = adaptPlayerToInput(p, position);
  const raw        = evaluatePlayerRawOVR(input);
  const currentOvr = Math.round(raw.rawCurrentOVR);
  return calculateFutureOVR(currentOvr, input.potential, input.age);
};

// Re-export engine types that callers may need
export type { OvrPosition } from './ovrEngine.ts';
