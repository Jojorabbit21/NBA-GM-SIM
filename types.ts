
export type AppView = 'TeamSelect' | 'Onboarding' | 'GameSim' | 'GameResult' | 'Dashboard' | 'Inbox' | 'Roster' | 'Standings' | 'Leaderboard' | 'Transactions' | 'Playoffs' | 'SeasonReview' | 'PlayoffReview' | 'Draft' | 'Help' | 'OvrCalculator' | 'Schedule';

export type PositionType = 'PG' | 'SG' | 'SF' | 'PF' | 'C';

export interface PlayerStats {
  g: number; gs: number; mp: number; pts: number; reb: number; offReb: number; defReb: number;
  ast: number; stl: number; blk: number; tov: number;
  fgm: number; fga: number; p3m: number; p3a: number; ftm: number; fta: number;
  rimM: number; rimA: number; midM: number; midA: number;
  pf: number; plusMinus: number;
  
  // Zone stats
  zone_rim_m?: number; zone_rim_a?: number;
  zone_paint_m?: number; zone_paint_a?: number;
  zone_mid_l_m?: number; zone_mid_l_a?: number;
  zone_mid_c_m?: number; zone_mid_c_a?: number;
  zone_mid_r_m?: number; zone_mid_r_a?: number;
  zone_c3_l_m?: number; zone_c3_l_a?: number;
  zone_c3_r_m?: number; zone_c3_r_a?: number;
  zone_atb3_l_m?: number; zone_atb3_l_a?: number;
  zone_atb3_c_m?: number; zone_atb3_c_a?: number;
  zone_atb3_r_m?: number; zone_atb3_r_a?: number;
}

// Added HiddenTendencies for shooting system
export interface HiddenTendencies {
  hand: 'Right' | 'Left';
  lateralBias: number;
}

export interface Player {
  id: string;
  name: string;
  position: string;
  age: number;
  height: number;
  weight: number;
  salary: number;
  contractYears: number;
  ovr: number;
  potential: number;
  revealedPotential?: number;
  health: 'Healthy' | 'Injured' | 'Day-to-Day';
  injuryType?: string;
  returnDate?: string;
  condition?: number;
  
  // Attributes
  ins: number; out: number; midRange: number; threeCorner: number; three45: number; threeTop: number;
  ft: number; shotIq: number; offConsist: number;
  layup: number; dunk: number; postPlay: number; drawFoul: number; hands: number;
  passAcc: number; handling: number; spdBall: number; passIq: number; passVision: number;
  intDef: number; perDef: number; steal: number; blk: number; helpDefIq: number; passPerc: number; defConsist: number;
  offReb: number; defReb: number;
  speed: number; agility: number; strength: number; vertical: number; stamina: number; hustle: number; durability: number;
  intangibles: number; reb: number; plm: number; def: number; ath: number; closeShot: number;

  stats: PlayerStats;
  playoffStats?: PlayerStats;
  // Added tendencies
  tendencies?: HiddenTendencies;
}

export interface PlayerBoxScore {
  playerId: string;
  playerName: string;
  pts: number; reb: number; offReb: number; defReb: number;
  ast: number; stl: number; blk: number; tov: number;
  fgm: number; fga: number; p3m: number; p3a: number; ftm: number; fta: number;
  rimM: number; rimA: number; midM: number; midA: number;
  mp: number; g: number; gs: number; pf: number;
  plusMinus: number;
  condition?: number;
  isStopper?: boolean;
  // Added missing properties for engine and UI
  isAceTarget?: boolean;
  matchupEffect?: number;
  fatigue?: number;
  zoneData?: Partial<PlayerStats>;
}

// Added TacticStatRecord
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
  roster: Player[];
  // Updated tacticHistory type
  tacticHistory?: {
    offense: Record<string, TacticStatRecord>;
    defense: Record<string, TacticStatRecord>;
  };
  // Added salary properties
  salaryCap: number;
  luxuryTaxLine: number;
}

export type OffenseTactic = 'Balance' | 'PaceAndSpace' | 'PerimeterFocus' | 'PostFocus' | 'Grind' | 'SevenSeconds';
export type DefenseTactic = 'ManToManPerimeter' | 'ZoneDefense' | 'AceStopper';

// Removed rotationFlexibility from TacticalSliders
export interface TacticalSliders {
    pace: number;
    offReb: number;
    defIntensity: number;
    defReb: number;
    fullCourtPress: number;
    zoneUsage: number;
}

// Added minutesLimits
export interface GameTactics {
    offenseTactics: OffenseTactic[];
    defenseTactics: DefenseTactic[];
    sliders: TacticalSliders;
    starters: { PG: string; SG: string; SF: string; PF: string; C: string };
    rotationMap: Record<string, boolean[]>; 
    stopperId?: string;
    minutesLimits: Record<string, number>;
}

export interface DepthChart {
    PG: (string | null)[];
    SG: (string | null)[];
    SF: (string | null)[];
    PF: (string | null)[];
    C: (string | null)[];
}

// Added PlayType
export type PlayType = 'Iso' | 'PnR_Handler' | 'PnR_Roll' | 'PnR_Pop' | 'PostUp' | 'CatchShoot' | 'Cut' | 'Handoff' | 'Transition';

// Added TacticalSnapshot
export interface TacticalSnapshot {
  offense: OffenseTactic;
  defense: DefenseTactic;
  pace: number;
  sliders: TacticalSliders;
  stopperId?: string;
}

// Added RosterUpdate
export interface RosterUpdate {
  condition?: number;
  health?: 'Healthy' | 'Injured' | 'Day-to-Day';
  injuryType?: string;
  returnDate?: string;
}

// Added PbpLog
export interface PbpLog {
  quarter: number;
  timeRemaining: string;
  teamId: string;
  text: string;
  type: 'score' | 'miss' | 'turnover' | 'foul' | 'block' | 'freethrow' | 'info';
  points?: number;
}

// Added RotationData
export type RotationData = Record<string, { in: number; out: number }[]>;

export interface Game {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  date: string;
  homeScore?: number;
  awayScore?: number;
  played: boolean;
  isPlayoff: boolean;
  seriesId?: string;
}

export interface SimulationResult {
    homeScore: number;
    awayScore: number;
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
    homeTactics: any;
    awayTactics: any;
    rosterUpdates: Record<string, any>;
    pbpLogs: any[];
    rotationData: any;
}

// Added PlayoffSeries
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

// Added Transaction
export interface Transaction {
  id: string;
  date: string;
  type: 'Trade' | 'InjuryUpdate' | 'Sign' | 'Release';
  teamId: string;
  description: string;
  details?: any;
}

// Added TradeOffer
export interface TradeOffer {
  teamId: string;
  teamName: string;
  players: Player[];
  diffValue: number;
  analysis?: string[];
}

// Added PlayoffStateDB
export interface PlayoffStateDB {
  user_id: string;
  team_id: string;
  season: string;
  bracket_data: { series: PlayoffSeries[] };
  current_round: number;
  is_finished: boolean;
  champion_id?: string;
  updated_at: string;
}

// Added PlayoffGameResultDB
export interface PlayoffGameResultDB {
  user_id: string;
  game_id: string;
  date: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number;
  away_score: number;
  box_score: { home: PlayerBoxScore[]; away: PlayerBoxScore[] };
  tactics: { home: any; away: any };
  is_playoff: boolean;
  series_id: string;
  round_number: number;
  game_number: number;
}

// Added Message types
export type MessageType = 'GAME_RECAP' | 'TRADE_ALERT' | 'INJURY_REPORT';

export interface GameRecapContent {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  userBoxScore?: PlayerBoxScore[];
}

export interface TradeAlertContent {
  summary: string;
  trades: {
    team1Id: string;
    team1Name: string;
    team2Id: string;
    team2Name: string;
    team1Acquired: { id: string; name: string; ovr: number }[];
    team2Acquired: { id: string; name: string; ovr: number }[];
  }[];
}

export interface InjuryReportContent {
  playerId: string;
  playerName: string;
  injuryType: string;
  severity: 'Minor' | 'Major';
  duration: string;
  returnDate: string;
}

export interface Message {
  id: string;
  user_id: string;
  team_id: string;
  date: string;
  type: MessageType;
  title: string;
  content: any;
  is_read: boolean;
  created_at: string;
}

// Added TacticPreset
export interface TacticPreset {
  slot: number;
  name: string;
  data: Partial<GameTactics>;
}
