
import { Team, Player, OffenseTactic, DefenseTactic } from '../types';
import { GameTactics } from '../services/gameEngine';

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
    if (score >= 91) return { bar: 'bg-indigo-500', text: 'text-indigo-400', border: 'border-indigo-400/50' };
    if (score >= 86) return { bar: 'bg-blue-500', text: 'text-blue-400', border: 'border-blue-400/50' };
    if (score >= 81) return { bar: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-400/50' };
    if (score >= 76) return { bar: 'bg-amber-400', text: 'text-amber-300', border: 'border-amber-400/50' };
    if (score >= 71) return { bar: 'bg-orange-500', text: 'text-orange-400', border: 'border-orange-500/50' };
    return { bar: 'bg-slate-500', text: 'text-slate-400', border: 'border-slate-500/50' };
};

export const calculateTacticScore = (
    type: OffenseTactic | DefenseTactic, 
    team: Team, 
    tactics: GameTactics
): number => {
    if (!team?.roster) return 60;

    const healthySorted = team.roster.filter(p => p.health !== 'Injured').sort((a, b) => b.ovr - a.ovr);
    const starterIds = Object.values(tactics.starters).filter(id => id !== '');
    const activeStarters = team.roster.filter(p => starterIds.includes(p.id));
    // 선발 라인업이 설정되지 않았으면 건강한 상위 5명 기준
    const effectiveStarters = activeStarters.length > 0 ? activeStarters : healthySorted.slice(0, 5);
    
    if (effectiveStarters.length === 0) return 70;

    // Helper functions
    const getAvg = (players: Player[], attr: keyof Player) => {
        if (players.length === 0) return 70;
        return players.reduce((sum, p) => sum + (p[attr] as number), 0) / players.length;
    };
    const sAvg = (attr: keyof Player) => getAvg(effectiveStarters, attr);
    const get3Pt = (p: Player) => (p.threeCorner + p.three45 + p.threeTop) / 3;
    const get3PtAvg = (players: Player[]) => {
        if (players.length === 0) return 60;
        return players.reduce((sum, p) => sum + get3Pt(p), 0) / players.length;
    };

    let baseScore = 0;

    switch(type) {
        case 'Balance': {
            baseScore = (sAvg('ovr') * 0.3) + 
                        (sAvg('ins') * 0.15) + 
                        (sAvg('out') * 0.15) + 
                        (sAvg('plm') * 0.15) + 
                        (sAvg('def') * 0.1) + 
                        (sAvg('reb') * 0.05) + 
                        (sAvg('ath') * 0.1);
            break;
        }
        case 'PaceAndSpace': {
            const guards = effectiveStarters.filter(p => p.position.includes('G'));
            const centers = effectiveStarters.filter(p => p.position === 'C' || p.position === 'PF');

            const gHand = getAvg(guards, 'handling') * 0.08;
            const gVis = getAvg(guards, 'passVision') * 0.03;
            const gIq = getAvg(guards, 'passIq') * 0.07;
            const gAcc = getAvg(guards, 'passAcc') * 0.05;
            const gSpd = getAvg(guards, 'speed') * 0.03;
            const gSta = getAvg(guards, 'stamina') * 0.02;

            const t3pt = get3PtAvg(effectiveStarters) * 0.15;
            const tMid = sAvg('midRange') * 0.10;

            const cIntDef = getAvg(centers, 'intDef') * 0.10;
            const cStl = getAvg(centers, 'steal') * 0.03;
            const cBlk = getAvg(centers, 'blk') * 0.06;
            const c3pt = get3PtAvg(centers) * 0.05;

            const tAcc = sAvg('passAcc') * 0.05;
            const tVis = sAvg('passVision') * 0.05;
            const tIq = sAvg('passIq') * 0.05;
            const tSta = sAvg('stamina') * 0.10;

            baseScore = gHand + gVis + gIq + gAcc + gSpd + gSta + 
                        t3pt + tMid + 
                        cIntDef + cStl + cBlk + c3pt + 
                        tAcc + tVis + tIq + tSta;
            break;
        }
        case 'PerimeterFocus': {
            const pgPlayer = team.roster.find(p => p.id === tactics.starters.PG) || effectiveStarters.find(p => p.position === 'PG');
            const cPlayer = team.roster.find(p => p.id === tactics.starters.C) || effectiveStarters.find(p => p.position === 'C');
            const pg = pgPlayer || (effectiveStarters.find(p => p.position.includes('G')) || effectiveStarters[0]);
            const c = cPlayer || (effectiveStarters.find(p => ['C', 'PF'].includes(p.position)) || effectiveStarters[0]);

            const pgScore = 
                (pg.handling * 0.10) + (pg.passAcc * 0.10) + (pg.passVision * 0.08) + (pg.passIq * 0.10) +
                (get3Pt(pg) * 0.10) + (pg.midRange * 0.05) + (pg.closeShot * 0.02);

            const cScore = 
                (c.strength * 0.02) + (c.speed * 0.02) + (c.layup * 0.05) + (c.dunk * 0.05) + (c.postPlay * 0.05) +
                (c.midRange * 0.03) + (c.hands * 0.07) + (c.drawFoul * 0.03) + (c.closeShot * 0.03);

            const teamScore = get3PtAvg(effectiveStarters) * 0.10;

            baseScore = pgScore + cScore + teamScore;
            break;
        }
        case 'PostFocus': {
            // 1. Center (C) Calculation (Dominant Factor)
            let c = team.roster.find(p => p.id === tactics.starters.C);
            // Fallbacks if user hasn't set starter
            if (!c) c = effectiveStarters.find(p => p.position === 'C');
            if (!c) c = [...effectiveStarters].sort((a,b) => b.height - a.height)[0]; 
            if (!c) c = healthySorted[0];

            // Normalize height to 0-100 scale (190cm=0, 225cm=100)
            const hRating = Math.min(100, Math.max(0, (c.height - 190) * 2.8));
            
            // C Metric Sum: ~70
            const cScore = 
                (c.postPlay * 0.10) +
                (c.strength * 0.07) +
                (hRating * 0.07) +
                (c.layup * 0.10) +
                (c.dunk * 0.10) +
                (c.hands * 0.10) +
                (c.drawFoul * 0.05) +
                (c.closeShot * 0.03) +
                (c.midRange * 0.03) +
                (c.plm * 0.05);

            // 2. Forwards (SF, PF) Calculation
            let fwds = effectiveStarters.filter(p => ['SF', 'PF', 'F'].includes(p.position));
            if (fwds.length === 0) fwds = [effectiveStarters[2], effectiveStarters[3]].filter(Boolean);
            
            const avgFwd = (attr: keyof Player) => fwds.length ? fwds.reduce((s,p)=>s+(p[attr] as number),0)/fwds.length : 50;
            const avgFwd3 = fwds.length ? fwds.reduce((s,p)=>s+get3Pt(p),0)/fwds.length : 50;

            // F Metric Sum: ~25
            const fScore = 
                (avgFwd('layup') * 0.04) +
                (avgFwd('dunk') * 0.03) +
                (avgFwd('closeShot') * 0.04) +
                (avgFwd('midRange') * 0.04) +
                (avgFwd3 * 0.05) +
                (avgFwd('def') * 0.05);

            // 3. Guards (PG, SG) Calculation
            let guards = effectiveStarters.filter(p => ['PG', 'SG', 'G'].includes(p.position));
            if (guards.length === 0) guards = [effectiveStarters[0], effectiveStarters[1]].filter(Boolean);

            const avgGrd = (attr: keyof Player) => guards.length ? guards.reduce((s,p)=>s+(p[attr] as number),0)/guards.length : 50;
            const avgGrd3 = guards.length ? guards.reduce((s,p)=>s+get3Pt(p),0)/guards.length : 50;

            // G Metric Sum: ~15
            const gScore = 
                (avgGrd('plm') * 0.10) +
                (avgGrd3 * 0.05);

            // 4. Height Bonus (>210cm)
            const heightBonus = c.height >= 210 ? 5 : 0;

            baseScore = cScore + fScore + gScore + heightBonus;
            break;
        }
        case 'Grind': {
            // 1. Identify Options: Sort by (INS + OUT) / 2
            const sortedScorers = [...effectiveStarters].sort((a, b) => {
                const scoreA = (a.ins + a.out) / 2;
                const scoreB = (b.ins + b.out) / 2;
                return scoreB - scoreA;
            });

            const opt1 = sortedScorers[0];
            const opt2 = sortedScorers[1];
            const opt3 = sortedScorers[2];

            // 2. 1st Option Score (Total 40%)
            // LAY 3%, DNK 2%, MID 2%, HANDS 3%, CLOSE 5%, 3PT AVG 5%, SHOT IQ 10%, OFF CONS 10%
            const score1 = opt1 ? (
                (opt1.layup * 0.03) +
                (opt1.dunk * 0.02) +
                (opt1.midRange * 0.02) +
                (opt1.hands * 0.03) +
                (opt1.closeShot * 0.05) +
                (get3Pt(opt1) * 0.05) +
                (opt1.shotIq * 0.10) +
                (opt1.offConsist * 0.10)
            ) : 20;

            // 3. 2nd & 3rd Options Score (Total 10%)
            // MID 2%, 3PT AVG 3%, SHOT IQ 3%, OFF CONS 2%
            const secondaryOpts = [opt2, opt3].filter(Boolean);
            const secAvg = (attr: keyof Player) => secondaryOpts.length ? secondaryOpts.reduce((s, p) => s + (p[attr] as number), 0) / secondaryOpts.length : 50;
            const sec3PtAvg = secondaryOpts.length ? secondaryOpts.reduce((s, p) => s + get3Pt(p), 0) / secondaryOpts.length : 50;

            const score23 = (
                (secAvg('midRange') * 0.02) +
                (sec3PtAvg * 0.03) +
                (secAvg('shotIq') * 0.03) +
                (secAvg('offConsist') * 0.02)
            );

            // 4. Team Score (Total 40%)
            // DEF AVG 15%, REB AVG 10%, STAMINA 10%, HUSTLE 5%
            const scoreTeam = (
                (sAvg('def') * 0.15) +
                (sAvg('reb') * 0.10) +
                (sAvg('stamina') * 0.10) +
                (sAvg('hustle') * 0.05)
            );

            // 5. Guards (PG, SG) Score (Total 10%)
            // PLM 10%
            const guards = effectiveStarters.filter(p => ['PG', 'SG', 'G'].includes(p.position));
            const guardPlm = guards.length ? guards.reduce((s, p) => s + p.plm, 0) / guards.length : 50;
            const scoreGuard = guardPlm * 0.10;

            baseScore = score1 + score23 + scoreTeam + scoreGuard;
            break;
        }
        case 'SevenSeconds': {
            // 1. PG, SG (40%)
            let guards = effectiveStarters.filter(p => ['PG', 'SG', 'G'].includes(p.position));
            if (guards.length === 0) guards = [effectiveStarters[0], effectiveStarters[1]].filter(Boolean);

            const gAvg = (attr: keyof Player) => guards.length ? guards.reduce((s,p)=>s+(p[attr] as number),0)/guards.length : 50;
            const g3Pt = guards.length ? guards.reduce((s,p)=>s+get3Pt(p),0)/guards.length : 50;

            const scoreGuards = 
                (gAvg('handling') * 0.05) +
                (gAvg('spdBall') * 0.05) +
                (gAvg('passAcc') * 0.05) +
                (gAvg('passIq') * 0.05) +
                (gAvg('passVision') * 0.05) +
                (gAvg('midRange') * 0.02) +
                (g3Pt * 0.05) +
                (gAvg('speed') * 0.03) +
                (gAvg('stamina') * 0.05);

            // 2. SF, PF (20%)
            let forwards = effectiveStarters.filter(p => ['SF', 'PF', 'F'].includes(p.position));
            if (forwards.length === 0) forwards = [effectiveStarters[2], effectiveStarters[3]].filter(Boolean);
            
            const fAvg = (attr: keyof Player) => forwards.length ? forwards.reduce((s,p)=>s+(p[attr] as number),0)/forwards.length : 50;

            const scoreForwards = 
                (fAvg('speed') * 0.02) +
                (fAvg('agility') * 0.02) +
                (fAvg('handling') * 0.02) +
                (fAvg('spdBall') * 0.02) +
                (fAvg('layup') * 0.06) +
                (fAvg('dunk') * 0.03) +
                (fAvg('closeShot') * 0.05);

            // 3. PF (10%)
            // Try to find the specific starter assigned to PF
            let pfPlayer = team.roster.find(p => p.id === tactics.starters.PF);
            // Fallback
            if (!pfPlayer) pfPlayer = effectiveStarters.find(p => p.position === 'PF');
            if (!pfPlayer) pfPlayer = forwards.find(p => p.position.includes('F')) || forwards[0] || healthySorted[3];

            const pf = pfPlayer || { intDef: 50, blk: 50, defConsist: 50 } as Player;
            
            const scorePF = 
                (pf.intDef * 0.05) +
                (pf.blk * 0.03) +
                (pf.defConsist * 0.02);

            // 4. Team 3PT (30%)
            const team3Pt = get3PtAvg(effectiveStarters);
            const scoreTeam = team3Pt * 0.30;

            baseScore = scoreGuards + scoreForwards + scorePF + scoreTeam;
            break;
        }
        case 'ManToManPerimeter': {
            baseScore = 
                (sAvg('perDef') * 0.20) + 
                (sAvg('steal') * 0.10) + 
                (sAvg('blk') * 0.02) + 
                (sAvg('helpDefIq') * 0.10) + 
                (sAvg('passPerc') * 0.03) + 
                (sAvg('defConsist') * 0.05) + 
                (sAvg('speed') * 0.05) + 
                (sAvg('agility') * 0.10) + 
                (sAvg('stamina') * 0.10) + 
                (sAvg('hustle') * 0.10) + 
                (sAvg('durability') * 0.10) + 
                (sAvg('defReb') * 0.05);
            break;
        }
        case 'ZoneDefense': {
            const avgHeight = effectiveStarters.reduce((s, p) => s + p.height, 0) / effectiveStarters.length;
            // Height Score (10%): Normalize 190cm~215cm to 50~100 scale
            const heightScore = Math.min(100, Math.max(50, (avgHeight - 190) * 3 + 50));

            // Base Stats (Total 89%)
            // IntDef 20%, Stl 2%, Blk 5%, DefReb 19%, HelpIQ 3%, PassPerc 2%, DefCons 5%
            // Stamina 3%, Str 10%, Hustle 5%, Durability 5%
            const baseStats = 
                (sAvg('intDef') * 0.20) + 
                (sAvg('steal') * 0.02) + 
                (sAvg('blk') * 0.05) + 
                (sAvg('defReb') * 0.19) + 
                (sAvg('helpDefIq') * 0.03) + 
                (sAvg('passPerc') * 0.02) + 
                (sAvg('defConsist') * 0.05) + 
                (sAvg('stamina') * 0.03) + 
                (sAvg('strength') * 0.10) + 
                (sAvg('hustle') * 0.05) + 
                (sAvg('durability') * 0.05) + 
                (heightScore * 0.10);

            // Conditional Bonuses
            let bonus = 0;
            effectiveStarters.forEach(p => {
                if (['PG', 'SG', 'G'].includes(p.position) && p.height >= 200) bonus += 2;
                else if (['SF', 'PF', 'F'].includes(p.position) && p.height >= 205) bonus += 4;
                else if (p.position === 'C' && p.height >= 210) bonus += 5;
            });

            baseScore = baseStats + bonus;
            break;
        }
        case 'AceStopper': {
            // Find the best stopper based on the specific formula:
            // (PDEF * 0.3) + (STL * 0.2) + (PASS PERC * 0.15) + (DEF CONS * 0.1) + (STA * 0.1) + (SPD * 0.1) + (AGI * 0.05)
            const getScore = (p: Player) => 
                (p.perDef * 0.30) +
                (p.steal * 0.20) +
                (p.passPerc * 0.15) +
                (p.defConsist * 0.10) +
                (p.stamina * 0.10) +
                (p.speed * 0.10) +
                (p.agility * 0.05);

            // Calculate score for all healthy players and pick the max to represent tactic potential
            const bestStopperScore = team.roster
                .filter(p => p.health !== 'Injured')
                .reduce((max, p) => Math.max(max, getScore(p)), 0);

            baseScore = bestStopperScore > 0 ? bestStopperScore : 60;
            break;
        }
    }

    let finalScore = baseScore;
    if (baseScore > 80) {
        finalScore = 80 + (baseScore - 80) * 0.6;
    }

    return Math.min(99, Math.max(35, Math.round(finalScore)));
};
