
import { Player } from './player';

export interface TacticStatRecord {
    games: number;
    wins: number;
    ptsFor: number;
    ptsAgainst: number;
    fgm: number;
    fga: number;
    p3m: number;
    p3a: number;
    rimM: number;
    rimA: number;
    midM: number;
    midA: number;
    aceImpact?: number;
}

export interface Team {
    id: string;
    name: string;
    city: string;
    logo: string;
    conference: 'East' | 'West';
    division: string;
    wins: number;
    losses: number;
    budget: number;
    salaryCap: number;
    luxuryTaxLine: number;
    roster: Player[];
    tacticHistory?: {
        offense: Record<string, TacticStatRecord>;
        defense: Record<string, TacticStatRecord>;
    };
}
