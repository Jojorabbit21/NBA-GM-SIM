
export type PositionType = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export const POSITION_WEIGHTS: Record<PositionType, Record<string, number>> = {
  PG: { 
      closeShot: 10, midRange: 10, threeAvg: 15, ft: 6, shotIq: 10, offConsist: 15, 
      layup: 10, dunk: 0, postPlay: 0, drawFoul: 2, hands: 8, 
      intDef: 0, perDef: 2, steal: 1, blk: 0, helpDefIq: 3, passPerc: 1, defConsist: 1, 
      offReb: 1, defReb: 1, 
      speed: 5, agility: 5, strength: 1, vertical: 3, stamina: 8, hustle: 3, durability: 3, 
      passAcc: 15, handling: 10, spdBall: 4, passVision: 10, passIq: 15, 
      intangibles: 12, potential: 20, height: 6 
  },
  SG: { 
      closeShot: 15, midRange: 13, threeAvg: 20, ft: 8, shotIq: 15, offConsist: 20, 
      layup: 13, dunk: 3, postPlay: 0, drawFoul: 5, hands: 10, 
      intDef: 0, perDef: 10, steal: 5, blk: 1, helpDefIq: 8, passPerc: 5, defConsist: 5, 
      offReb: 1, defReb: 2, 
      speed: 10, agility: 8, strength: 1, vertical: 5, stamina: 5, hustle: 1, durability: 2, 
      passAcc: 5, handling: 8, spdBall: 5, passVision: 3, passIq: 6, 
      intangibles: 15, potential: 20, height: 8 
  },
  SF: { 
      closeShot: 15, midRange: 15, threeAvg: 12, ft: 8, shotIq: 10, offConsist: 7, 
      layup: 10, dunk: 10, postPlay: 6, drawFoul: 10, hands: 12, 
      intDef: 5, perDef: 5, steal: 3, blk: 1, helpDefIq: 10, passPerc: 3, defConsist: 10, 
      offReb: 3, defReb: 3, 
      speed: 6, agility: 8, strength: 4, vertical: 5, stamina: 5, hustle: 3, durability: 5, 
      passAcc: 3, handling: 5, spdBall: 5, passVision: 3, passIq: 3, 
      intangibles: 5, potential: 25, height: 13 
  },
  PF: { 
      closeShot: 15, midRange: 10, threeAvg: 7, ft: 10, shotIq: 10, offConsist: 15, 
      layup: 20, dunk: 15, postPlay: 15, drawFoul: 15, hands: 15, 
      intDef: 12, perDef: 6, steal: 1, blk: 3, helpDefIq: 2, passPerc: 5, defConsist: 8, 
      offReb: 2, defReb: 4, 
      speed: 3, agility: 3, strength: 8, vertical: 7, stamina: 5, hustle: 2, durability: 2, 
      passAcc: 6, handling: 5, spdBall: 5, passVision: 5, passIq: 5, 
      intangibles: 8, potential: 25, height: 14 
  },
  C: { 
      closeShot: 15, midRange: 16, threeAvg: 8, ft: 6, shotIq: 5, offConsist: 7, 
      layup: 12, dunk: 15, postPlay: 15, drawFoul: 6, hands: 14, 
      intDef: 10, perDef: 0, steal: 1, blk: 10, helpDefIq: 0, passPerc: 2, defConsist: 5, 
      offReb: 5, defReb: 8, 
      speed: 3, agility: 3, strength: 10, vertical: 10, stamina: 3, hustle: 2, durability: 10, 
      passAcc: 3, handling: 2, spdBall: 1, passVision: 2, passIq: 3, 
      intangibles: 6, potential: 25, height: 16 
  }
};
