
import { PlayerBoxScore } from './engine';
import { TacticalSnapshot } from './tactics';

export interface Game {
    id: string;
    homeTeamId: string;
    awayTeamId: string;
    date: string;
    homeScore?: number;
    awayScore?: number;
    played: boolean;
    isPlayoff?: boolean;
    seriesId?: string;
}

export interface PlayoffSeries {
    id: string;
    round: number;
    conference: 'East' | 'West' | 'NBA';
    higherSeedId: string;
    lowerSeedId: string;
    higherSeedWins: number;
    lowerSeedWins: number;
    finished: boolean;
    targetWins: number;
    winnerId?: string;
}

export interface PlayoffStateDB {
    id: string;
    user_id: string;
    team_id: string;
    season: string;
    bracket_data: { series: PlayoffSeries[] };
    current_round: number;
    is_finished: boolean;
    champion_id?: string;
    updated_at: string;
}

export interface PlayoffGameResultDB {
    user_id: string;
    game_id: string;
    date: string;
    home_team_id: string;
    away_team_id: string;
    home_score: number;
    away_score: number;
    box_score: { home: PlayerBoxScore[], away: PlayerBoxScore[] };
    tactics: { home: TacticalSnapshot, away: TacticalSnapshot };
    is_playoff: boolean;
    series_id: string;
    round_number: number;
    game_number: number;
}
