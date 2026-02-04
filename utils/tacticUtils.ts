
import { Team, Player, OffenseTactic, DefenseTactic, GameTactics, TacticStatRecord, PlayerBoxScore, TacticalSnapshot } from '../types';
import { OFFENSE_TACTIC_CONFIG, DEFENSE_TACTIC_CONFIG } from '../services/game/engine/pbp/tacticMaps';
import { calculatePlayerArchetypes } from '../services/game/engine/pbp/archetypeSystem';

// UI Texts
export const OFFENSE_TACTIC_INFO: Record<OffenseTactic, { label: string, desc: string }> = {
  'Balance': { label: '밸런스 오펜스', desc: '모든 공격 루트의 조화 및 체급 위주' },
  'PaceAndSpace': { label: '페이스 & 스페이스', desc: '공간 창출 및 캐치앤슛 포커스' },
  'PerimeterFocus': { label: '퍼리미터 포커스', desc: '픽앤롤 및 외곽 에이스 아이솔레이션' },
  'PostFocus': { label: '포스트 포커스', desc: '빅맨의 높이와 파워를 이용한 골밑 장악' },
  'Grind': { label: '그라인드', desc: '저득점 강제 및 에이스 득점 집중' },
  'SevenSeconds': { label: '세븐 세컨즈', desc: '7초 이내의 빠른 공격과 3점 폭격' }
};

export const DEFENSE_TACTIC_INFO: Record<DefenseTactic, { label: string, desc: string }> = {
  'ManToManPerimeter': { label: '맨투맨 & 퍼리미터', desc: '대인 방어 및 외곽 억제' },
  'ZoneDefense': { label: '지역 방어 및 골밑 보호', desc: '지역 방어 및 골밑 보호' },
  'AceStopper': { label: '에이스 스토퍼', desc: '상대 주득점원 봉쇄 지시' }
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
    const offConfig = OFFENSE_TACTIC_CONFIG[type as OffenseTactic];
    const defConfig = DEFENSE_TACTIC_CONFIG[type as DefenseTactic];
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
        const archs = calculatePlayerArchetypes(attr, p.condition || 100);

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
    // Total Score / Total Weight / Player Count
    if (totalWeight === 0) return 50;
    
    const finalScore = totalScore / totalWeight / effectiveStarters.length;
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
