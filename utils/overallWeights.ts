
export type PositionType = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

// Modern NBA Weighted Formula (2025-26 Season Standard)
// Only Weights Configuration here. Logic is in ovrUtils.ts
export const POSITION_WEIGHTS: Record<PositionType, Record<string, number>> = {
  PG: {
      // 슈팅 & 득점 효율
      closeShot: 5, midRange: 5, threeAvg: 5, ft: 0, shotIq: 15, offConsist: 10,
      // 인사이드 툴
      layup: 10, dunk: 0, postPlay: 0, drawFoul: 5, hands: 5,
      // 수비력
      intDef: 0, perDef: 1, steal: 1, blk: 0, helpDefIq: 1, passPerc: 0, defConsist: 0,
      // 신체 능력
      speed: 6, agility: 5, strength: 0, vertical: 0, stamina: 0, hustle: 0, durability: 0,
      // 플레이메이킹
      passAcc: 12, handling: 10, spdBall: 10, passVision: 10, passIq: 12,
      // 리바운드 & 기타
      offReb: 0, defReb: 0, intangibles: 15, potential: 15, height: 7
  },
  SG: {
      // 슈팅 & 득점 효율
      closeShot: 5, midRange: 5, threeAvg: 10, ft: 5, shotIq: 10, offConsist: 10,
      // 인사이드 툴
      layup: 5, dunk: 0, postPlay: 0, drawFoul: 3, hands: 0,
      // 수비력
      intDef: 0, perDef: 2, steal: 1, blk: 0, helpDefIq: 2, passPerc: 2, defConsist: 0,
      // 신체 능력
      speed: 5, agility: 4, strength: 0, vertical: 1, stamina: 1, hustle: 0, durability: 0,
      // 플레이메이킹
      passAcc: 5, handling: 5, spdBall: 0, passVision: 5, passIq: 5,
      // 리바운드 & 기타
      offReb: 0, defReb: 0, intangibles: 15, potential: 15, height: 8
  },
  SF: { 
      // 슈팅 & 득점 효율
      closeShot: 12, midRange: 8, threeAvg: 4, ft: 3, shotIq: 10, offConsist: 8,
      // 인사이드 툴
      layup: 12, dunk: 3, postPlay: 3, drawFoul: 5, hands: 6,
      // 수비력
      intDef: 2, perDef: 0, steal: 1, blk: 1, helpDefIq: 5, passPerc: 1, defConsist: 3,
      // 신체 능력
      speed: 5, agility: 3, strength: 6, vertical: 6, stamina: 9, hustle: 1, durability: 3,
      // 플레이메이킹
      passAcc: 2, handling: 4, spdBall: 3, passVision: 3, passIq: 3,
      // 리바운드 & 기타
      offReb: 1, defReb: 6, intangibles: 8, potential: 11, height: 10
  },
  PF: {
      // 슈팅 & 득점 효율
      closeShot: 10, midRange: 8, threeAvg: 0, ft: 5, shotIq: 5, offConsist: 10,
      // 인사이드 툴
      layup: 15, dunk: 10, postPlay: 8, drawFoul: 5, hands: 10,
      // 수비력
      intDef: 10, perDef: 2, steal: 1, blk: 2, helpDefIq: 1, passPerc: 1, defConsist: 5,
      // 신체 능력
      speed: 1, agility: 1, strength: 5, vertical: 5, stamina: 3, hustle: 1, durability: 5,
      // 플레이메이킹
      passAcc: 0, handling: 0, spdBall: 0, passVision: 0, passIq: 0,
      // 리바운드 & 기타
      offReb: 8, defReb: 8, intangibles: 15, potential: 15, height: 15
  },
  C: {
      // 슈팅 & 득점 효율
      closeShot: 5, midRange: 3, threeAvg: 0, ft: 5, shotIq: 8, offConsist: 0,
      // 인사이드 툴
      layup: 5, dunk: 10, postPlay: 15, drawFoul: 0, hands: 15,
      // 수비력
      intDef: 10, perDef: 0, steal: 0, blk: 10, helpDefIq: 0, passPerc: 0, defConsist: 0,
      // 신체 능력
      speed: 0, agility: 0, strength: 8, vertical: 10, stamina: 2, hustle: 0, durability: 10,
      // 플레이메이킹
      passAcc: 0, handling: 0, spdBall: 0, passVision: 0, passIq: 0,
      // 리바운드 & 기타
      offReb: 8, defReb: 12, intangibles: 15, potential: 12, height: 15
  }
};
