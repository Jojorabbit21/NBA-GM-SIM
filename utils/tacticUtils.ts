
import { Team, GameTactics, TacticStatRecord, PlayerBoxScore, TacticalSnapshot } from '../types';

export const getEfficiencyStyles = (score: number) => {
    if (score >= 96) return { bar: 'bg-fuchsia-500', text: 'text-fuchsia-400', border: 'border-fuchsia-400/50' };
    if (score >= 91) return { bar: 'bg-purple-500', text: 'text-purple-400', border: 'border-purple-400/50' };
    if (score >= 86) return { bar: 'bg-violet-500', text: 'text-violet-400', border: 'border-violet-400/50' };
    if (score >= 81) return { bar: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-400/50' };
    if (score >= 76) return { bar: 'bg-amber-400', text: 'text-amber-300', border: 'border-amber-400/50' };
    if (score >= 71) return { bar: 'bg-orange-500', text: 'text-orange-400', border: 'border-orange-500/50' };
    return { bar: 'bg-slate-500', text: 'text-slate-400', border: 'border-slate-500/50' };
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
