
export interface SeasonStats {
  g: number;    // Games Played
  gs: number;   // Games Started
  mp: number;   // Minutes Played (Total)
  pts: number;  // Points
  reb: number;  // Rebounds (Total)
  offReb: number; // Offensive Rebounds
  defReb: number; // Defensive Rebounds
  ast: number;  // Assists
  stl: number;  // Steals
  blk: number;  // Blocks
  tov: number;  // Turnovers
  fgm: number;  // Field Goals Made
  fga: number;  // Field Goals Attempted
  p3m: number;  // 3pt Made
  p3a: number;  // 3pt Attempted
  ftm: number;  // Free Throws Made
  fta: number;  // Free Throws Attempted
  
  // New Zone Stats
  rimM: number; // Rim Makes
  rimA: number; // Rim Attempts
  midM: number; // Mid-Range Makes
  midA: number; // Mid-Range Attempts
}

export interface Player {
  id: string;
  name: string;
  position: 'G' | 'F' | 'C' | 'PG' | 'SG' | 'SF' | 'PF';
  age: number;
  height: number;
  weight: number;
  salary: number;
  contractYears: number;
  health: 'Healthy' | 'Injured' | 'Day-to-Day';
  injuryType?: string;
  returnDate?: string; // YYYY-MM-DD format
  
  condition: number; // 0-100, Current Stamina/Energy Level

  ovr: number;
  potential: number;
  revealedPotential: number;
  intangibles: number;

  // Athleticism (ATH)
  ath: number; // Average of below
  speed: number;
  agility: number;
  strength: number;
  vertical: number;
  stamina: number;
  hustle: number;
  durability: number;

  // Outside Scoring (OUT)
  out: number; // Average of below
  closeShot: number;
  midRange: number;
  threeCorner: number;
  three45: number;
  threeTop: number;
  ft: number;
  shotIq: number;
  offConsist: number;

  // Inside Scoring (INS)
  ins: number; // Average of below
  layup: number;
  dunk: number;
  postPlay: number;
  drawFoul: number;
  hands: number;

  // Playmaking (PLM)
  plm: number; // Average of below
  passAcc: number;
  handling: number;
  spdBall: number;
  passIq: number;
  passVision: number;

  // Defense (DEF)
  def: number; // Average of below
  intDef: number;
  perDef: number;
  steal: number;
  blk: number;
  helpDefIq: number;
  passPerc: number;
  defConsist: number;

  // Rebounding (REB)
  reb: number; // Average of below
  offReb: number;
  defReb: number;

  stats: SeasonStats;
  playoffStats: SeasonStats; // Added for Playoff Tracking
}

export interface PlayerBoxScore extends SeasonStats {
  playerId: string;
  playerName: string;
  isStopper?: boolean;
  isAceTarget?: boolean;
  matchupEffect?: number;
}

export interface TacticStatRecord {
  games: number;
  wins: number;
  ptsFor: number;
  ptsAgainst: number;
  // Detailed Shooting Stats
  fgm: number; fga: number;
  p3m: number; p3a: number;
  rimM: number; rimA: number;
  midM: number; midA: number;
  tov?: number;
  // Ace Stopper specific (Against opponent's star)
  aceImpact?: number; // Accumulated matchupEffect
}

export interface TeamTacticHistory {
  offense: Record<string, TacticStatRecord>;
  defense: Record<string, TacticStatRecord>;
}

export interface Team {
  id: string;
  name: string;
  city: string;
  logo: string;
  roster: Player[];
  wins: number;
  losses: number;
  budget: number;
  salaryCap: number;
  luxuryTaxLine: number;
  conference: 'East' | 'West';
  division: 'Atlantic' | 'Central' | 'Southeast' | 'Northwest' | 'Pacific' | 'Southwest';
  tacticHistory?: TeamTacticHistory;
}

export interface TacticalSnapshot {
  offense: string;
  defense: string;
  pace: number;
  stopperId?: string;
  focusPlayer?: string;
}

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
  boxScore?: {
    home: PlayerBoxScore[];
    away: PlayerBoxScore[];
  };
  tactics?: {
    home: TacticalSnapshot;
    away: TacticalSnapshot;
  };
}

export interface PlayoffSeries {
  id: string;
  round: 0 | 1 | 2 | 3 | 4; // 0: Play-In, 1: Round 1, 2: Semis, 3: Finals, 4: NBA Finals
  conference: 'East' | 'West' | 'NBA';
  higherSeedId: string;
  lowerSeedId: string;
  higherSeedWins: number;
  lowerSeedWins: number;
  finished: boolean;
  winnerId?: string;
  targetWins?: number; // Default 4 for playoffs, 1 for play-in
}

export interface Transaction {
  id: string;
  date: string;
  type: 'Trade' | 'Sign' | 'Release' | 'Draft';
  teamId: string; // My team
  description: string;
  details?: {
     acquired: {id: string, name: string, ovr?: number, position?: string}[];
     traded: {id: string, name: string, ovr?: number, position?: string}[];
     partnerTeamId?: string;
     partnerTeamName?: string;
  }
}

export interface TradeOffer {
  teamId: string;
  teamName: string;
  players: Player[];
  diffValue: number;
}

export type OffenseTactic = 'Balance' | 'PaceAndSpace' | 'PerimeterFocus' | 'PostFocus' | 'Grind' | 'SevenSeconds';
export type DefenseTactic = 'ManToManPerimeter' | 'ZoneDefense' | 'AceStopper';

export type AppView = 'Dashboard' | 'Standings' | 'Leaderboard' | 'Roster' | 'Schedule' | 'Transactions' | 'Draft' | 'TeamSelect' | 'Onboarding' | 'GamePrep' | 'GameSim' | 'GameResult' | 'Playoffs' | 'SeasonReview' | 'PlayoffReview' | 'OvrCalculator' | 'Help';
