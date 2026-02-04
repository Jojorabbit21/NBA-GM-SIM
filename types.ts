
export interface Transaction {
  id: string;
  date: string;
  type: 'Trade' | 'Sign' | 'Release' | 'Draft' | 'InjuryUpdate';
  teamId: string; // My team or affected team
  description: string;
  details?: {
     // Trade
     acquired?: {id: string, name: string, ovr?: number, position?: string}[];
     traded?: {id: string, name: string, ovr?: number, position?: string}[];
     partnerTeamId?: string;
     partnerTeamName?: string;
     
     // InjuryUpdate
     playerId?: string;
     playerName?: string;
     health?: 'Healthy' | 'Injured' | 'Day-to-Day';
     injuryType?: string;
     returnDate?: string;
  }
}

export interface PlayerStats {
  g: number;
  gs: number;
  mp: number;
  pts: number;
  reb: number;
  offReb: number;
  defReb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fgm: number;
  fga: number;
  p3m: number;
  p3a: number;
  ftm: number;
  fta: number;
  
  // Legacy Aggregates (Compatibility)
  rimM: number; rimA: number;
  midM: number; midA: number;
  
  // --- Standard 10-Zone Shooting Data ---
  // Zone 1: Restricted Area (Rim)
  zone_rim_m: number; zone_rim_a: number;
  
  // Zone 2: Paint (Non-RA) - Merged
  zone_paint_m: number; zone_paint_a: number;
  
  // Zone 3-5: Mid-Range
  zone_mid_l_m: number; zone_mid_l_a: number;
  zone_mid_c_m: number; zone_mid_c_a: number;
  zone_mid_r_m: number; zone_mid_r_a: number;
  
  // Zone 6-7: Corner 3
  zone_c3_l_m: number; zone_c3_l_a: number;
  zone_c3_r_m: number; zone_c3_r_a: number;
  
  // Zone 8-10: Above the Break 3
  zone_atb3_l_m: number; zone_atb3_l_a: number;
  zone_atb3_c_m: number; zone_atb3_c_a: number;
  zone_atb3_r_m: number; zone_atb3_r_a: number;

  pf: number;
  plusMinus: number; 
}

// New: Hidden Tendencies (Generated at runtime, not stored in DB)
export interface HiddenTendencies {
    hand: 'Right' | 'Left';
    lateralBias: number; // -1.0 (Left) to 1.0 (Right)
    // Archetype field removed. Replaced by dynamic archetypeSystem.ts
}

export interface Player {
  id: string;
  name: string;
  position: string; // 'PG', 'SG', 'SF', 'PF', 'C'
  age: number;
  height: number;
  weight: number;
  salary: number;
  contractYears: number;
  ovr: number;
  potential: number;
  health: 'Healthy' | 'Injured' | 'Day-to-Day';
  condition: number;
  injuryType?: string;
  returnDate?: string;
  
  // Attributes
  ins: number; out: number; ath: number; plm: number; def: number; reb: number;
  closeShot: number; midRange: number; threeCorner: number; three45: number; threeTop: number;
  ft: number; shotIq: number; offConsist: number;
  layup: number; dunk: number; postPlay: number; drawFoul: number; hands: number;
  passAcc: number; handling: number; spdBall: number; passIq: number; passVision: number;
  intDef: number; perDef: number; steal: number; blk: number; helpDefIq: number; passPerc: number; defConsist: number;
  offReb: number; defReb: number;
  speed: number; agility: number; strength: number; vertical: number; stamina: number; hustle: number; durability: number;
  intangibles: number;

  stats: PlayerStats;
  playoffStats?: PlayerStats;
  
  revealedPotential?: number; // Optional
  
  // Runtime Only
  tendencies?: HiddenTendencies; 
}

export type OffenseTactic = 'Balance' | 'PaceAndSpace' | 'PerimeterFocus' | 'PostFocus' | 'Grind' | 'SevenSeconds';
export type DefenseTactic = 'ManToManPerimeter' | 'ZoneDefense' | 'AceStopper';
export type PlayType = 'Iso' | 'PnR_Handler' | 'PnR_Roll' | 'PnR_Pop' | 'PostUp' | 'CatchShoot' | 'Cut' | 'Handoff' | 'Transition';

export interface TacticalSliders {
  pace: number;
  offReb: number;
  defIntensity: number;
  defReb: number;
  fullCourtPress: number;
  zoneUsage: number;
  rotationFlexibility?: number;
}

export interface GameTactics {
  offenseTactics: OffenseTactic[];
  defenseTactics: DefenseTactic[];
  sliders: TacticalSliders;
  starters: { PG: string; SG: string; SF: string; PF: string; C: string };
  minutesLimits: Record<string, number>;
  stopperId?: string;
}

export interface TacticPreset {
  slot: number;
  name: string;
  data: Partial<GameTactics>; // Contains sliders, offenseTactics, defenseTactics only
}

export interface TacticStatRecord {
  games: number;
  wins: number;
  ptsFor: number;
  ptsAgainst: number;
  fgm: number; fga: number;
  p3m: number; p3a: number;
  rimM: number; rimA: number;
  midM: number; midA: number;
  aceImpact?: number;
}

export interface Team {
  id: string;
  name: string;
  city: string;
  logo: string;
  conference: 'East' | 'West';
  division: 'Atlantic' | 'Central' | 'Southeast' | 'Northwest' | 'Pacific' | 'Southwest';
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

export interface TacticalSnapshot {
  offense?: string; // or OffenseTactic
  defense?: string; // or DefenseTactic
  pace?: number;
  stopperId?: string;
}

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
  tactics?: {
      home?: TacticalSnapshot;
      away?: TacticalSnapshot;
  };
}

export interface PlayoffSeries {
  id: string;
  round: 0 | 1 | 2 | 3 | 4;
  conference: 'East' | 'West' | 'NBA';
  higherSeedId: string;
  lowerSeedId: string;
  higherSeedWins: number;
  lowerSeedWins: number;
  finished: boolean;
  targetWins: number;
  winnerId?: string;
}

export type RosterUpdate = Record<string, Partial<Player>>;

export interface PlayerBoxScore {
  playerId: string;
  playerName: string;
  pts: number; reb: number; offReb: number; defReb: number;
  ast: number; stl: number; blk: number; tov: number;
  fgm: number; fga: number; p3m: number; p3a: number; ftm: number; fta: number;
  rimM: number; rimA: number; midM: number; midA: number;
  
  // Detailed Zone Stats for Box Score Accumulation
  zoneData?: Partial<PlayerStats>; 

  mp: number; g: number; gs: number; pf: number;
  
  // [New] Plus Minus
  plusMinus: number;

  isStopper?: boolean;
  isAceTarget?: boolean;
  matchupEffect?: number;
}

export interface SimulationResult {
  homeScore: number;
  awayScore: number;
  homeBox: PlayerBoxScore[];
  awayBox: PlayerBoxScore[];
  rosterUpdates: RosterUpdate;
  homeTactics: TacticalSnapshot;
  awayTactics: TacticalSnapshot;
  // [New] PBP Logs (Ephemeral)
  pbpLogs?: PbpLog[]; 
}

export interface PbpLog {
    quarter: number;
    timeRemaining: string; // "11:45"
    teamId: string;
    text: string;
    type: 'score' | 'miss' | 'rebound' | 'turnover' | 'foul' | 'info' | 'block' | 'freethrow';
}

export interface TradeOffer {
  teamId: string;
  teamName: string;
  players: Player[];
  diffValue: number;
  analysis?: string[];
}

export type AppView = 'TeamSelect' | 'Onboarding' | 'GameSim' | 'GameResult' | 'Dashboard' | 'Roster' | 'Standings' | 'Leaderboard' | 'Playoffs' | 'Schedule' | 'Transactions' | 'Help' | 'OvrCalculator' | 'SeasonReview' | 'PlayoffReview' | 'Draft' | 'Inbox';

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

export interface PlayoffGameResultDB {
    user_id: string;
    game_id: string;
    date: string;
    series_id: string;
    round_number: number;
    game_number: number;
    home_team_id: string;
    away_team_id: string;
    home_score: number;
    away_score: number;
    box_score: { home: PlayerBoxScore[]; away: PlayerBoxScore[] };
    tactics: { home: TacticalSnapshot; away: TacticalSnapshot };
}

// --- Message System Types ---

export type MessageType = 'GAME_RECAP' | 'TRADE_ALERT' | 'INJURY_REPORT' | 'AWARD_NEWS' | 'SEASON_SUMMARY';

export interface GameRecapContent {
    gameId: string;
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number;
    awayScore: number;
    userWon: boolean;
    mvp: {
        playerId: string;
        name: string;
        stats: string; // "30 PTS, 10 REB" short format
    };
    userBoxScore: PlayerBoxScore[]; // Store full box score for user team for detailed view
}

export interface TradeAlertContent {
    summary: string; // "LAL, BOS, CHI involve in trade"
    trades: Array<{
        team1Id: string;
        team1Name: string;
        team2Id: string;
        team2Name: string;
        team1Acquired: { id: string; name: string; ovr: number }[]; // Players team 1 got
        team2Acquired: { id: string; name: string; ovr: number }[]; // Players team 2 got
    }>;
}

export interface InjuryReportContent {
    playerId: string;
    playerName: string;
    injuryType: string;
    duration: string; // "2 weeks" or "Day-to-Day"
    returnDate: string;
    severity: 'Major' | 'Minor'; // Major = > 14 days
}

export interface Message {
    id: string;
    user_id: string;
    team_id: string;
    date: string;
    type: MessageType;
    title: string;
    content: GameRecapContent | TradeAlertContent | InjuryReportContent | any;
    is_read: boolean;
    created_at: string;
}
