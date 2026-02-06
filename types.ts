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

export interface HiddenTendencies {
    hand: 'Left' | 'Right';
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
  tendencies?: HiddenTendencies;
  archetypes?: any;
}

export interface PlayerBoxScore {
  playerId: string;
  playerName: string;
  pts: number; reb: number; offReb: number; defReb: number;
  ast: number; stl: number; blk: number; tov: number;
  fgm: number; fga: number; p3m: number; p3a: number; ftm: number; fta: number;
  rimM: number; rimA: number; midM: number; midA: number;
  zoneData?: Partial<PlayerStats>; 
  mp: number; g: number; gs: number; pf: number;
  plusMinus: number;
  condition?: number;
  isStopper?: boolean;
  isAceTarget?: boolean;
  matchupEffect?: number;
}

export interface TacticStatRecord {
    games: number; wins: number; ptsFor: number; ptsAgainst: number;
    fgm: number; fga: number; p3m: number; p3a: number;
    rimM: number; rimA: number; midM: number; midA: number;
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

export type OffenseTactic = 'Balance' | 'PaceAndSpace' | 'PerimeterFocus' | 'PostFocus' | 'Grind' | 'SevenSeconds';
export type DefenseTactic = 'ManToManPerimeter' | 'ZoneDefense' | 'AceStopper';

export interface TacticalSliders {
    pace: number;
    rotationFlexibility?: number;
    offReb: number;
    defIntensity: number;
    defReb: number;
    fullCourtPress: number;
    zoneUsage: number;
}

export interface GameTactics {
    offenseTactics: OffenseTactic[];
    defenseTactics: DefenseTactic[];
    sliders: TacticalSliders;
    starters: { PG: string; SG: string; SF: string; PF: string; C: string };
    minutesLimits: Record<string, number>;
    stopperId?: string;
    pace?: number;
}

export interface TacticalSnapshot extends Partial<GameTactics> {
    offense: OffenseTactic;
    defense: DefenseTactic;
    pace: number;
}

export interface DepthChart {
    PG: (string | null)[];
    SG: (string | null)[];
    SF: (string | null)[];
    PF: (string | null)[];
    C: (string | null)[];
}

export interface TacticPreset {
    slot: number;
    name: string;
    data: Partial<GameTactics>;
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
  tactics?: { home?: TacticalSnapshot; away?: TacticalSnapshot };
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

export interface Transaction {
    id: string;
    date: string;
    type: 'Trade' | 'InjuryUpdate' | 'Sign' | 'Release';
    teamId: string;
    description: string;
    details: any;
}

export interface TradeOffer {
    teamId: string;
    teamName: string;
    players: Player[];
    diffValue: number;
    analysis?: string[];
}

export type MessageType = 'GAME_RECAP' | 'TRADE_ALERT' | 'INJURY_REPORT' | 'TEXT';

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

export interface GameRecapContent {
    gameId: string;
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number;
    awayScore: number;
    userWon: boolean;
    mvp: { playerId: string; name: string; stats: string };
    userBoxScore: PlayerBoxScore[];
}

export interface TradeAlertContent {
    summary: string;
    trades: {
        team1Id: string; team1Name: string; team2Id: string; team2Name: string;
        team1Acquired: { id: string; name: string; ovr: number }[];
        team2Acquired: { id: string; name: string; ovr: number }[];
    }[];
}

export interface InjuryReportContent {
    playerId: string;
    playerName: string;
    injuryType: string;
    duration: string;
    returnDate: string;
    severity: 'Major' | 'Minor';
}

export interface PbpLog {
    quarter: number;
    timeRemaining: string;
    teamId: string;
    text: string;
    type: 'score' | 'miss' | 'turnover' | 'foul' | 'block' | 'freethrow' | 'info';
}

export interface RotationData {
    [playerId: string]: { in: number; out: number }[];
}

export type PlayType = 'Iso' | 'PnR_Handler' | 'PnR_Roll' | 'PnR_Pop' | 'PostUp' | 'CatchShoot' | 'Cut' | 'Handoff' | 'Transition';

export interface SimulationResult {
    homeScore: number;
    awayScore: number;
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
    homeTactics: TacticalSnapshot;
    awayTactics: TacticalSnapshot;
    rosterUpdates: Record<string, any>;
    pbpLogs: PbpLog[];
    rotationData: RotationData;
}

export interface RosterUpdate {
    [playerId: string]: Partial<Player>;
}

export interface PlayoffStateDB {
    bracket_data: { series: PlayoffSeries[] };
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
    tactics: { home?: TacticalSnapshot; away?: TacticalSnapshot };
}