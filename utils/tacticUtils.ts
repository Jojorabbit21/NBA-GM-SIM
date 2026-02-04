
import { Team, Player, OffenseTactic, DefenseTactic, GameTactics, TacticStatRecord, PlayerBoxScore, TacticalSnapshot } from '../types';

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

// Simplified Tactic Score Calculation for UI (Does not rely on PbP engine internals)
export const calculateTacticScore = (
    type: OffenseTactic | DefenseTactic, 
    team: Team, 
    tactics: GameTactics
): number => {
    if (!team?.roster) return 60;

    const healthySorted = team.roster.filter(p => p.health !== 'Injured').sort((a, b) => b.ovr - a.ovr);
    const starterIds = Object.values(tactics.starters).filter(id => id !== '');
    const activeStarters = team.roster.filter(p => starterIds.includes(p.id));
    const effectiveStarters = activeStarters.length > 0 ? activeStarters : healthySorted.slice(0, 5);
    
    if (effectiveStarters.length === 0) return 70;

    const getAvg = (players: Player[], attr: keyof Player) => {
        if (players.length === 0) return 70;
        return players.reduce((sum, p) => sum + (p[attr] as number), 0) / players.length;
    };
    const sAvg = (attr: keyof Player) => getAvg(effectiveStarters, attr);

    let baseScore = 0;

    // Use simplified logic based on attribute averages
    switch(type) {
        case 'Balance': 
            baseScore = sAvg('ovr'); 
            break;
        case 'PaceAndSpace': 
            baseScore = (sAvg('threeCorner') + sAvg('speed')) / 2; 
            break;
        case 'PerimeterFocus': 
            baseScore = (sAvg('handling') + sAvg('midRange')) / 2; 
            break;
        case 'PostFocus': 
            baseScore = (sAvg('postPlay') + sAvg('strength')) / 2; 
            break;
        case 'Grind': 
            baseScore = (sAvg('def') + sAvg('ins')) / 2; 
            break;
        case 'SevenSeconds': 
            baseScore = (sAvg('speed') + sAvg('passAcc')) / 2; 
            break;
        case 'ManToManPerimeter':
            baseScore = sAvg('perDef');
            break;
        case 'ZoneDefense':
            baseScore = sAvg('intDef');
            break;
        case 'AceStopper':
             baseScore = sAvg('perDef'); // Placeholder
             break;
    }

    return Math.min(99, Math.max(40, Math.round(baseScore)));
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
