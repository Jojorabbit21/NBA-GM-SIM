
import { Team, Player, OffenseTactic, DefenseTactic, GameTactics, TacticStatRecord, PlayerBoxScore, TacticalSnapshot } from '../types';
import { OFFENSE_STRATEGY_CONFIG, DEFENSE_STRATEGY_CONFIG } from '../services/game/engine/pbp/strategyMap';
import { calculatePlayerArchetypes } from '../services/game/engine/pbp/archetypeSystem';

// UI Texts
export const OFFENSE_TACTIC_INFO: Record<OffenseTactic, { label: string, desc: string, pros: string[], cons: string[] }> = {
  'Balance': { 
      label: '밸런스 오펜스', 
      desc: '모든 공격 루트의 조화 및 체급 위주',
      pros: [
          '모든 공격 방법을 다양하게 사용합니다.',
          '팀의 전체적 능력치가 높다면 효과가 좋습니다.'
      ],
      cons: [
          '전반적인 능력치가 떨어진다면 효율이 떨어집니다.',
          '수비 강도가 높아 체력 소모량이 높습니다.'
      ]
  },
  'PaceAndSpace': { 
      label: '페이스 & 스페이스', 
      desc: '공간 창출 및 캐치앤슛 포커스',
      pros: [
          '팀에 좋은 패서와 슈터가 있다면 효율이 좋습니다.',
          '빠른 속공과 위치선정으로 많은 공격 기회를 창출합니다.'
      ],
      cons: [
          '스페이서, 스팟업슈터들의 체력 소모가 심합니다.',
          '패서의 플레이메이킹 능력이 떨어지면 턴오버가 증가합니다.',
          '수비 리바운드를 많이 내주면 공격의 효율이 급감합니다.'
      ]
  },
  'PerimeterFocus': { 
      label: '퍼리미터 포커스', 
      desc: '픽앤롤 및 외곽 에이스 아이솔레이션',
      pros: [
          '메인 핸들러의 능력이 좋다면 효율이 극대화됩니다.',
          '강력한 파괴력을 가진 빅맨을 십분 활용합니다.'
      ],
      cons: [
          '공격의 페이스가 낮아 공격의 효율이 매우 중요해집니다.',
          '핸들러의 역량이 떨어진다면 팀의 전체적인 득점이 감소합니다.',
          '빅맨의 체력 부담이 가중됩니다.'
      ]
  },
  'PostFocus': { 
      label: '포스트 포커스', 
      desc: '빅맨의 높이와 파워를 이용한 골밑 장악',
      pros: [
          '강력한 빅맨이 있다면 효율이 극대화됩니다.',
          '패스 능력이 좋은 빅맨이라면 외곽 슈팅 기회를 많이 창출합니다.'
      ],
      cons: [
          '외곽 생산력이 낮다면 빅맨에게 많은 부담이 가중됩니다.',
          '공격의 페이스가 낮아 공격의 효율이 매우 중요합니다.',
          '빅맨의 체력 부담이 심하게 가중됩니다.'
      ]
  },
  'Grind': { 
      label: '그라인드', 
      desc: '저득점 강제 및 에이스 득점 집중',
      pros: [
          '팀의 전체적인 수비력이 좋다면 상대방의 득점을 강하게 억제합니다.',
          '공격의 페이스를 의도적으로 낮춰 상대방의 수비 부담을 가중시킵니다.'
      ],
      cons: [
          '팀 에이스의 득점력이 좋지 못하면 공격의 효율이 매우 악화됩니다.',
          '팀 전체가 높은 강도로 수비하므로 전체적인 체력 부담이 심해집니다.',
          '팀 수비력이 좋지 못하면 많은 파울이 쌓일 가능성이 있습니다.'
      ]
  },
  'SevenSeconds': { 
      label: '세븐 세컨즈', 
      desc: '7초 이내의 빠른 공격과 3점 폭격',
      pros: [
          '가장 빠른 페이스로 속공을 전개해 많은 기회를 창출할 수 있습니다.',
          '팀의 전체적인 운동능력이 좋다면 효율이 극대화됩니다.'
      ],
      cons: [
          '턴오버가 급증하고, 상대방에게 더 많은 공격 기회를 내줄 수 있습니다.',
          '체력 부담이 가장 심한 전술입니다.',
          '수비 강도가 매우 낮아 많은 실점을 허용할 수 있습니다.'
      ]
  },
  'Custom': {
      label: '사용자 설정',
      desc: '사용자가 직접 설정한 전술',
      pros: [],
      cons: []
  }
};

export const DEFENSE_TACTIC_INFO: Record<DefenseTactic, { label: string, desc: string, pros: string[], cons: string[] }> = {
  'ManToManPerimeter': { 
      label: '맨투맨 & 퍼리미터', 
      desc: '대인 방어 및 외곽 억제',
      pros: [
          '상대방의 공격 시작 지점부터 강하게 압박하여 턴오버를 유발합니다.',
          '상대방의 3점 시도에 적극적으로 컨테스트합니다.'
      ],
      cons: [
          '퍼리미터 디펜더들의 높은 체력 소모가 요구됩니다.',
          '외곽 수비 능력이 좋지 못하면 오히려 더 많은 3점 기회를 내줄 수 있습니다.',
          '상대방에게 공격 리바운드를 많이 내줄 수 있습니다.'
      ]
  },
  'ZoneDefense': { 
      label: '지역 방어 및 골밑 보호', 
      desc: '지역 방어 및 골밑 보호',
      pros: [
          '페인트존과 미드레인지 지역의 진입 자체를 막아 상대에게 3점을 강요합니다.',
          '상대방의 내곽 공격 생산력이 크게 감소할 수 있습니다.',
          '상대방에게 더 적은 공격 리바운드를 허용합니다.',
          '많은 체력이 소모되지 않습니다.'
      ],
      cons: [
          '상대방의 3점 능력에 따라 더 많은 점수를 쉽게 내어줄 수 있습니다.'
      ]
  },
  'AceStopper': { 
      label: '에이스 스토퍼', 
      desc: '상대 주득점원 봉쇄 지시',
      pros: [],
      cons: []
  },
  'Custom': {
      label: '사용자 설정',
      desc: '사용자가 직접 설정한 수비 전술',
      pros: [],
      cons: []
  }
};

export const getEfficiencyStyles = (score: number) => {
    if (score >= 96) return { bar: 'bg-fuchsia-500', text: 'text-fuchsia-400', border: 'border-fuchsia-400/50' };
    if (score >= 91) return { bar: 'bg-purple-500', text: 'text-purple-400', border: 'border-purple-400/50' };
    if (score >= 86) return { bar: 'bg-violet-500', text: 'text-violet-400', border: 'border-violet-400/50' };
    if (score >= 81) return { bar: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-400/50' };
    if (score >= 76) return { bar: 'bg-amber-400', text: 'text-amber-300', border: 'border-amber-400/50' };
    if (score >= 71) return { bar: 'bg-orange-500', text: 'text-orange-400', border: 'border-orange-500/50' };
    return { bar: 'bg-slate-500', text: 'text-slate-400', border: 'border-slate-500/50' };
};

// Real Tactic Score Calculation linked to Engine Logic
export const calculateTacticScore = (
    type: OffenseTactic | DefenseTactic, 
    team: Team, 
    tactics: GameTactics
): number => {
    if (!team?.roster) return 60;

    // 1. Identify effective lineup (Starters or Top 5)
    const healthySorted = team.roster.filter(p => p.health !== 'Injured').sort((a, b) => b.ovr - a.ovr);
    const starterIds = Object.values(tactics.starters).filter(id => id !== '');
    const activeStarters = team.roster.filter(p => starterIds.includes(p.id));
    const effectiveStarters = activeStarters.length > 0 ? activeStarters : healthySorted.slice(0, 5);
    
    if (effectiveStarters.length === 0) return 60;

    // 2. Get Engine Config for the requested tactic
    // Force type casting to access the maps (Engine maps are source of truth)
    const offConfig = OFFENSE_STRATEGY_CONFIG[type as OffenseTactic];
    const defConfig = DEFENSE_STRATEGY_CONFIG[type as DefenseTactic];
    const config = offConfig || defConfig;

    if (!config) return 50;

    let totalScore = 0;
    let totalWeight = 0;

    // 3. Calculate Score based on Archetypes (Fit)
    effectiveStarters.forEach(p => {
        // Map Player to Engine Attribute format
        const threeAvg = (p.threeCorner + p.three45 + p.threeTop) / 3;
        const attr = {
            ins: p.ins, out: p.out, mid: p.midRange, ft: p.ft, threeVal: threeAvg,
            speed: p.speed, agility: p.agility, strength: p.strength, vertical: p.vertical,
            stamina: p.stamina, durability: p.durability, hustle: p.hustle,
            height: p.height, weight: p.weight,
            handling: p.handling, hands: p.hands, pas: p.passAcc, passAcc: p.passAcc,
            passVision: p.passVision, passIq: p.passIq, shotIq: p.shotIq, offConsist: p.offConsist,
            postPlay: p.postPlay, drFoul: p.drawFoul,
            def: p.def, intDef: p.intDef, perDef: p.perDef, blk: p.blk, stl: p.steal,
            helpDefIq: p.helpDefIq, defConsist: p.defConsist, foulTendency: 50,
            reb: p.reb
        };

        // Calculate Archetypes using current condition
        // Default condition to 100 if undefined to avoid heavy penalty in UI view
        const archs = calculatePlayerArchetypes(attr, p.condition ?? 100);

        // Sum up weighted scores defined in Engine Config
        // fit: { spacer: 3, handler: 2 ... }
        Object.entries(config.fit).forEach(([key, weight]) => {
            const rating = archs[key as keyof typeof archs] || 50;
            const w = weight as number;
            totalScore += rating * w;
            totalWeight += w;
        });
    });

    // 4. Normalize to 0-100 scale
    // [FIX] Removed division by effectiveStarters.length because totalWeight accumulates per player
    if (totalWeight === 0) return 50;
    
    const finalScore = totalScore / totalWeight;
    return Math.min(99, Math.max(40, Math.round(finalScore)));
};

export const updateTeamTacticHistory = (
    team: Team, 
    myBox: PlayerBoxScore[], 
    oppBox: PlayerBoxScore[], 
    tactics: TacticalSnapshot, 
    isWin: boolean
) => {
    const history = { ...(team.tacticHistory || { offense: {}, defense: {} }) };

    const updateRecord = (record: Record<string, TacticStatRecord>, key: string) => {
        if (!record[key]) {
            record[key] = { 
                games: 0, wins: 0, ptsFor: 0, ptsAgainst: 0, 
                fgm: 0, fga: 0, p3m: 0, p3a: 0, rimM: 0, rimA: 0, midM: 0, midA: 0, 
                aceImpact: 0 
            };
        }
        const r = record[key];
        
        const totals = myBox.reduce((acc, p) => ({ 
            pts: acc.pts + p.pts, 
            fgm: acc.fgm + p.fgm, 
            fga: acc.fga + p.fga, 
            p3m: acc.p3m + p.p3m, 
            p3a: acc.p3a + p.p3a, 
            rimM: acc.rimM + (p.rimM || 0), 
            rimA: acc.rimA + (p.rimA || 0), 
            midM: acc.midM + (p.midM || 0), 
            midA: acc.midA + (p.midA || 0) 
        }), { pts: 0, fgm: 0, fga: 0, p3m: 0, p3a: 0, rimM: 0, rimA: 0, midM: 0, midA: 0 });
        
        r.games++;
        if (isWin) r.wins++;
        r.ptsFor += totals.pts;
        r.ptsAgainst += oppBox.reduce((sum, p) => sum + p.pts, 0);
        r.fgm += totals.fgm;
        r.fga += totals.fga;
        r.p3m += totals.p3m;
        r.p3a += totals.p3a;
        r.rimM += totals.rimM;
        r.rimA += totals.rimA;
        r.midM += totals.midM;
        r.midA += totals.midA;
    };

    if (tactics.offense) updateRecord(history.offense, tactics.offense);
    if (tactics.defense) updateRecord(history.defense, tactics.defense);

    if (tactics.stopperId) {
        if (!history.defense['AceStopper']) {
            history.defense['AceStopper'] = { 
                games: 0, wins: 0, ptsFor: 0, ptsAgainst: 0, 
                fgm: 0, fga: 0, p3m: 0, p3a: 0, rimM: 0, rimA: 0, midM: 0, midA: 0, 
                aceImpact: 0 
            };
        }
        const r = history.defense['AceStopper'];
        const targetAceBox = oppBox.find(b => b.isAceTarget);
        if (targetAceBox) {
            r.games++;
            if (isWin) r.wins++;
            r.ptsAgainst += targetAceBox.pts;
            r.fgm += targetAceBox.fgm;
            r.fga += targetAceBox.fga;
            r.p3m += targetAceBox.p3m;
            r.p3a += targetAceBox.p3a;
            r.aceImpact = (r.aceImpact || 0) + (targetAceBox.matchupEffect || 0);
        }
    }

    return history;
};
