
export type PositionType = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

// Modern NBA Weighted Formula (2025-26 Season Standard)
// Only Weights Configuration here. Logic is in ovrUtils.ts
// Scale compression (0.6x + 40) is applied in ovrUtils — weights represent pure skill importance
export const POSITION_WEIGHTS: Record<PositionType, Record<string, number>> = {
  PG: {
      // 슈팅 & 득점 효율
      closeShot: 8, midRange: 5, threeAvg: 12, ft: 3, shotIq: 12, offConsist: 10,
      // 인사이드 툴
      layup: 8, dunk: 0, postPlay: 0, drawFoul: 3, hands: 3,
      // 수비력
      intDef: 0, perDef: 3, steal: 2, blk: 0, helpDefIq: 2, passPerc: 1, defConsist: 1,
      // 신체 능력
      speed: 8, agility: 6, strength: 0, vertical: 0, stamina: 3, hustle: 1, durability: 2,
      // 플레이메이킹
      passAcc: 12, handling: 10, spdBall: 8, passVision: 12, passIq: 12,
      // 리바운드 & 기타 (height: cm 스케일 보정 — weight 3 ≈ 일반 능력치 weight 8 수준 영향력)
      offReb: 0, defReb: 0, intangibles: 10, potential: 10, height: 3
  },
  SG: {
      // 슈팅 & 득점 효율
      closeShot: 10, midRange: 10, threeAvg: 15, ft: 5, shotIq: 10, offConsist: 10,
      // 인사이드 툴
      layup: 8, dunk: 2, postPlay: 0, drawFoul: 5, hands: 3,
      // 수비력
      intDef: 0, perDef: 5, steal: 3, blk: 0, helpDefIq: 3, passPerc: 3, defConsist: 2,
      // 신체 능력
      speed: 6, agility: 5, strength: 1, vertical: 2, stamina: 3, hustle: 1, durability: 2,
      // 플레이메이킹
      passAcc: 5, handling: 8, spdBall: 3, passVision: 5, passIq: 5,
      // 리바운드 & 기타
      offReb: 0, defReb: 1, intangibles: 12, potential: 12, height: 3
  },
  SF: {
      // 슈팅 & 득점 효율
      closeShot: 8, midRange: 8, threeAvg: 8, ft: 3, shotIq: 8, offConsist: 8,
      // 인사이드 툴
      layup: 8, dunk: 3, postPlay: 2, drawFoul: 5, hands: 5,
      // 수비력
      intDef: 3, perDef: 5, steal: 2, blk: 2, helpDefIq: 5, passPerc: 2, defConsist: 3,
      // 신체 능력
      speed: 5, agility: 4, strength: 4, vertical: 4, stamina: 5, hustle: 2, durability: 3,
      // 플레이메이킹
      passAcc: 5, handling: 5, spdBall: 3, passVision: 5, passIq: 5,
      // 리바운드 & 기타
      offReb: 2, defReb: 5, intangibles: 10, potential: 10, height: 3
  },
  PF: {
      // 슈팅 & 득점 효율
      closeShot: 8, midRange: 5, threeAvg: 3, ft: 3, shotIq: 5, offConsist: 8,
      // 인사이드 툴
      layup: 12, dunk: 8, postPlay: 8, drawFoul: 5, hands: 8,
      // 수비력
      intDef: 10, perDef: 2, steal: 1, blk: 3, helpDefIq: 3, passPerc: 1, defConsist: 3,
      // 신체 능력
      speed: 2, agility: 2, strength: 5, vertical: 5, stamina: 3, hustle: 2, durability: 5,
      // 플레이메이킹
      passAcc: 2, handling: 2, spdBall: 0, passVision: 2, passIq: 2,
      // 리바운드 & 기타
      offReb: 8, defReb: 10, intangibles: 10, potential: 10, height: 4
  },
  C: {
      // 슈팅 & 득점 효율
      closeShot: 5, midRange: 3, threeAvg: 0, ft: 3, shotIq: 5, offConsist: 5,
      // 인사이드 툴
      layup: 5, dunk: 10, postPlay: 12, drawFoul: 5, hands: 10,
      // 수비력
      intDef: 12, perDef: 0, steal: 0, blk: 10, helpDefIq: 2, passPerc: 0, defConsist: 3,
      // 신체 능력
      speed: 0, agility: 0, strength: 8, vertical: 8, stamina: 3, hustle: 1, durability: 8,
      // 플레이메이킹
      passAcc: 2, handling: 0, spdBall: 0, passVision: 2, passIq: 2,
      // 리바운드 & 기타
      offReb: 8, defReb: 12, intangibles: 10, potential: 10, height: 4
  }
};
