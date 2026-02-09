
import { Player } from './player';

export interface Transaction {
    id: string;
    date: string;
    type: 'Trade' | 'Sign' | 'Release' | 'InjuryUpdate';
    teamId: string;
    description: string;
    details?: any;
}

export interface TradeOffer {
    teamId: string;
    teamName: string;
    players: Player[];
    diffValue: number;
    analysis?: string[];
}
