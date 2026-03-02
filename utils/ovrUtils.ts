
import { POSITION_WEIGHTS, PositionType } from './overallWeights';

/**
 * Calculates the Overall Rating (OVR) dynamically based on attributes.
 * This is a Pure Function - it does not rely on stored state.
 */
export const calculateOvr = (attributes: any, position: string): number => {
    // 1. Position Resolution
    let posKey = position as PositionType;
    
    // Handle multi-position strings (e.g. "PG/SG") or fallback
    if (!POSITION_WEIGHTS[posKey]) {
        if (position.includes('PG')) posKey = 'PG';
        else if (position.includes('SG')) posKey = 'SG';
        else if (position.includes('SF')) posKey = 'SF';
        else if (position.includes('PF')) posKey = 'PF';
        else if (position.includes('C')) posKey = 'C';
        else posKey = 'SF'; // Default fallback
    }

    const weights = POSITION_WEIGHTS[posKey];
    let totalScore = 0;
    let totalWeight = 0;

    // 2. Derive Average 3PT for calculation if needed
    const tC = attributes.threeCorner ?? attributes.out ?? 70;
    const t45 = attributes.three45 ?? attributes.out ?? 70;
    const tT = attributes.threeTop ?? attributes.out ?? 70;
    const threeAvg = Math.round((tC + t45 + tT) / 3);
    
    // 3. Prepare calculation object with all possible keys and fallbacks
    // Use category averages as fallbacks for specific stats
    const ins = attributes.ins ?? 70;
    const out = attributes.out ?? 70;
    const def = attributes.def ?? 70;
    const reb = attributes.reb ?? 70;
    const ath = attributes.ath ?? 70;
    const plm = attributes.plm ?? 70;

    const calcAttrs: Record<string, number> = { 
        ...attributes, 
        threeAvg,
        // Ensure categories exist
        ins, out, def, reb, ath, plm
    };

    // 4. Weighted Sum
    for (const [key, weight] of Object.entries(weights)) {
        let val = calcAttrs[key];
        
        // Fallback for missing specific stats using category averages
        if (val === undefined || val === null || isNaN(val)) {
             if (['closeShot','midRange','threeAvg','ft','shotIq','offConsist'].includes(key)) val = out;
             else if (['layup','dunk','postPlay','drawFoul','hands'].includes(key)) val = ins;
             else if (['intDef','perDef','steal','blk','helpDefIq','passPerc','defConsist'].includes(key)) val = def;
             else if (['speed','agility','strength','vertical','stamina','hustle','durability'].includes(key)) val = ath;
             else if (['passAcc','handling','spdBall','passVision','passIq'].includes(key)) val = plm;
             else if (['offReb','defReb'].includes(key)) val = reb;
             else val = 70; 
        }
        
        totalScore += val * weight;
        totalWeight += weight;
    }

    // Scale compression: 0.6x + 40 (maps raw ~50→70, ~85→91, ~95→97)
    const rawAvg = totalWeight > 0 ? totalScore / totalWeight : 50;
    return Math.min(99, Math.max(40, Math.round(rawAvg * 0.6 + 40)));
};

/**
 * OVR → 별점 변환 (0.5 ~ 5.0, 0.5 단위)
 *
 * 선형 매핑: OVR 60 → 0.5★, OVR 97 → 5.0★
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
