
export type PositionType = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export const POSITION_WEIGHTS: Record<PositionType, Record<string, number>> = {
  PG: { 
      closeShot: 10, midRange: 20, threeAvg: 25, ft: 10, shotIq: 45, offConsist: 25, 
      layup: 25, dunk: 0, postPlay: 0, drawFoul: 0, hands: 40, 
      intDef: 0, perDef: 0, steal: 0, blk: 0, helpDefIq: 0, passPerc: 0, defConsist: 0, 
      offReb: 0, defReb: 0, 
      speed: 0, agility: 0, strength: 0, vertical: 0, stamina: 15, hustle: 0, durability: 0, 
      passAcc: 25, handling: 15, spdBall: 10, passVision: 25, passIq: 50, 
      intangibles: 5, potential: 500, height: 0 
  },
  SG: { 
      closeShot: 300, midRange: 100, threeAvg: 150, ft: 100, shotIq: 500, offConsist: 500, 
      layup: 200, dunk: 150, postPlay: 0, drawFoul: 50, hands: 250, 
      intDef: 0, perDef: 0, steal: 0, blk: 0, helpDefIq: 0, passPerc: 0, defConsist: 5, 
      offReb: 0, defReb: 0, 
      speed: 0, agility: 0, strength: 0, vertical: 0, stamina: 0, hustle: 0, durability: 0, 
      passAcc: 0, handling: 0, spdBall: 0, passVision: 0, passIq: 0, 
      intangibles: 50, potential: 500, height: 30 
  },
  SF: { 
      closeShot: 300, midRange: 150, threeAvg: 50, ft: 150, shotIq: 300, offConsist: 500, 
      layup: 500, dunk: 100, postPlay: 0, drawFoul: 150, hands: 250, 
      intDef: 200, perDef: 200, steal: 10, blk: 0, helpDefIq: 10, passPerc: 10, defConsist: 0, 
      offReb: 0, defReb: 0, 
      speed: 0, agility: 100, strength: 0, vertical: 100, stamina: 200, hustle: 200, durability: 0, 
      passAcc: 0, handling: 0, spdBall: 0, passVision: 0, passIq: 0, 
      intangibles: 5, potential: 500, height: 100 
  },
  PF: { 
      closeShot: 450, midRange: 50, threeAvg: 50, ft: 150, shotIq: 100, offConsist: 600, 
      layup: 500, dunk: 350, postPlay: 0, drawFoul: 0, hands: 500, 
      intDef: 200, perDef: 50, steal: 0, blk: 50, helpDefIq: 0, passPerc: 0, defConsist: 0, 
      offReb: 100, defReb: 160, 
      speed: 0, agility: 0, strength: 100, vertical: 100, stamina: 100, hustle: 0, durability: 50, 
      passAcc: 50, handling: 50, spdBall: 0, passVision: 50, passIq: 50, 
      intangibles: 10, potential: 500, height: 150 
  },
  C: { 
      closeShot: 300, midRange: 0, threeAvg: 0, ft: 0, shotIq: 200, offConsist: 0, 
      layup: 0, dunk: 0, postPlay: 200, drawFoul: 250, hands: 200, 
      intDef: 250, perDef: 0, steal: 0, blk: 100, helpDefIq: 0, passPerc: 0, defConsist: 200, 
      offReb: 100, defReb: 100, 
      speed: 0, agility: 0, strength: 150, vertical: 0, stamina: 150, hustle: 0, durability: 150, 
      passAcc: 100, handling: 200, spdBall: 0, passVision: 0, passIq: 100, 
      intangibles: 15, potential: 500, height: 180 
  }
};
