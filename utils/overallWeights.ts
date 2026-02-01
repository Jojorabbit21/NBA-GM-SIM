
export type PositionType = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

// Modern NBA Weighted Formula (2025-26 Season Standard)
// 사용자가 제공한 정확한 가중치 값을 적용했습니다.

export const POSITION_WEIGHTS: Record<PositionType, Record<string, number>> = {
  PG: { 
      // 슈팅 & 득점 효율
      closeShot: 12,
      midRange: 5,
      threeAvg: 22,
      ft: 6,
      shotIq: 10,
      offConsist: 20,

      // 인사이드 툴
      layup: 10,
      dunk: 0,
      postPlay: 0,
      drawFoul: 3,
      hands: 10,

      // 수비력
      intDef: 0,
      perDef: 3,
      steal: 0,
      blk: 0,
      helpDefIq: 4,
      passPerc: 1,
      defConsist: 1,

      // 신체 능력
      speed: 6,
      agility: 5,
      strength: 1,
      vertical: 3,
      stamina: 10,
      hustle: 3,
      durability: 3,

      // 플레이메이킹
      passAcc: 15,
      handling: 8,
      spdBall: 6,
      passVision: 10,
      passIq: 13,

      // 리바운드 & 기타
      offReb: 1,
      defReb: 1,
      intangibles: 15,
      potential: 15,
      height: 7
  },
  SG: { 
      // 슈팅 & 득점 효율
      closeShot: 15,
      midRange: 13,
      threeAvg: 20,
      ft: 8,
      shotIq: 15,
      offConsist: 20,

      // 인사이드 툴
      layup: 13,
      dunk: 3,
      postPlay: 0,
      drawFoul: 5,
      hands: 10,

      // 수비력
      intDef: 0,
      perDef: 10,
      steal: 5,
      blk: 1,
      helpDefIq: 8,
      passPerc: 5,
      defConsist: 5,

      // 신체 능력
      speed: 10,
      agility: 8,
      strength: 1,
      vertical: 5,
      stamina: 5,
      hustle: 1,
      durability: 2,

      // 플레이메이킹
      passAcc: 5,
      handling: 8,
      spdBall: 5,
      passVision: 3,
      passIq: 6,

      // 리바운드 & 기타
      offReb: 1,
      defReb: 2,
      intangibles: 15,
      potential: 20,
      height: 8
  },
  SF: { 
      // 슈팅 & 득점 효율
      closeShot: 12,
      midRange: 8,
      threeAvg: 4,
      ft: 3,
      shotIq: 10,
      offConsist: 8,

      // 인사이드 툴
      layup: 12,
      dunk: 3,
      postPlay: 3,
      drawFoul: 5,
      hands: 6,

      // 수비력
      intDef: 2,
      perDef: 0,
      steal: 1,
      blk: 1,
      helpDefIq: 5,
      passPerc: 1,
      defConsist: 3,

      // 신체 능력
      speed: 5,
      agility: 3,
      strength: 6,
      vertical: 6,
      stamina: 9,
      hustle: 1,
      durability: 3,

      // 플레이메이킹
      passAcc: 2,
      handling: 4,
      spdBall: 3,
      passVision: 3,
      passIq: 3,

      // 리바운드 & 기타
      offReb: 1,
      defReb: 6,
      intangibles: 8,
      potential: 11,
      height: 10
  },
  PF: { 
      // 슈팅 & 득점 효율
      closeShot: 15,
      midRange: 15,
      threeAvg: 5,
      ft: 5,
      shotIq: 7,
      offConsist: 12,

      // 인사이드 툴
      layup: 15,
      dunk: 10,
      postPlay: 10,
      drawFoul: 8,
      hands: 9,

      // 수비력
      intDef: 9,
      perDef: 3,
      steal: 1,
      blk: 2,
      helpDefIq: 2,
      passPerc: 3,
      defConsist: 7,

      // 신체 능력
      speed: 2,
      agility: 2,
      strength: 5,
      vertical: 5,
      stamina: 3,
      hustle: 2,
      durability: 5,

      // 플레이메이킹
      passAcc: 3,
      handling: 4,
      spdBall: 3,
      passVision: 3,
      passIq: 3,

      // 리바운드 & 기타
      offReb: 6,
      defReb: 8,
      intangibles: 11,
      potential: 16,
      height: 13
  },
  C: { 
      // 슈팅 & 득점 효율
      closeShot: 10,
      midRange: 3,
      threeAvg: 3,
      ft: 3,
      shotIq: 6,
      offConsist: 10,

      // 인사이드 툴
      layup: 5,
      dunk: 8,
      postPlay: 15,
      drawFoul: 10,
      hands: 10,

      // 수비력
      intDef: 10,
      perDef: 1,
      steal: 1,
      blk: 5,
      helpDefIq: 1,
      passPerc: 1,
      defConsist: 5,

      // 신체 능력
      speed: 2,
      agility: 2,
      strength: 5,
      vertical: 8,
      stamina: 3,
      hustle: 1,
      durability: 8,

      // 플레이메이킹
      passAcc: 3,
      handling: 1,
      spdBall: 1,
      passVision: 1,
      passIq: 3,

      // 리바운드 & 기타
      offReb: 8,
      defReb: 10,
      intangibles: 6,
      potential: 15,
      height: 13
  }
};
