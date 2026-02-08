
export type OffenseTactic = 'Balance' | 'PaceAndSpace' | 'PerimeterFocus' | 'PostFocus' | 'Grind' | 'SevenSeconds';
export type DefenseTactic = 'ManToManPerimeter' | 'ZoneDefense' | 'AceStopper';

export interface TacticalSliders {
    pace: number;
    offReb: number;
    defIntensity: number;
    defReb: number;
    fullCourtPress: number;
    zoneUsage: number;
}

export interface DepthChart {
    PG: (string | null)[];
    SG: (string | null)[];
    SF: (string | null)[];
    PF: (string | null)[];
    C: (string | null)[];
}

export interface GameTactics {
    offenseTactics: OffenseTactic[];
    defenseTactics: DefenseTactic[];
    sliders: TacticalSliders;
    starters: { PG: string; SG: string; SF: string; PF: string; C: string };
    rotationMap: Record<string, boolean[]>; 
    stopperId?: string;
    minutesLimits: Record<string, number>;
    depthChart?: DepthChart; // AI 및 자동 설정을 위한 뎁스차트 추가
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
    pf: number;
    fgm: number;
    fga: number;
    p3m: number;
    p3a: number;
    ftm: number;
    fta: number;
    rimM: number;
    rimA: number;
    midM: number;
    midA: number;
    plusMinus: number;
    [key: string]: number; // for zones
}

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
    revealedPotential: number;
    health: 'Healthy' | 'Injured' | 'Day-to-Day';
    injuryType?: string;
    returnDate?: string;
    condition?: number;
    ins: number;
    out: number;
    plm: number;
    def: number;
    reb: number;
    ath: number;
    closeShot: number;
    midRange: number;
    threeCorner: number;
    three45: number;
    threeTop: number;
    ft: number;
    shotIq: number;
    offConsist: number;
    layup: number;
    dunk: number;
    postPlay: number;
    drawFoul: number;
    hands: number;
    passAcc: number;
    handling: number;
    spdBall: number;
    passIq: number;
    passVision: number;
    intDef: number;
    perDef: number;
    steal: number;
    blk: number;
    helpDefIq: number;
    passPerc: number;
    defConsist: number;
    offReb: number;
    defReb: number;
    speed: number;
    agility: number;
    strength: number;
    vertical: number;
    stamina: number;
    hustle: number;
    durability: number;
    intangibles: number;
    stats: PlayerStats;
    playoffStats?: PlayerStats;
    tendencies?: HiddenTendencies;
}

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

export interface Transaction {
    id: string;
    date: string;
    type: 'Trade' | 'Sign' | 'Release' | 'InjuryUpdate';
    teamId: string;
    description: string;
    details?: any;
}

export interface PlayerBoxScore {
    playerId: string;
    playerName: string;
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
    rimM: number;
    rimA: number;
    midM: number;
    midA: number;
    mp: number;
    g: number;
    gs: number;
    pf: number;
    plusMinus: number;
    condition: number;
    isStopper?: boolean;
    isAceTarget?: boolean;
    matchupEffect?: number;
    fatigue?: number;
    zoneData?: any;
}

export interface TacticalSnapshot {
    offense?: OffenseTactic;
    defense?: DefenseTactic;
    stopperId?: string;
    pace?: number;
    sliders?: TacticalSliders;
}

export interface RosterUpdate {
    condition?: number;
    health?: string;
    injuryType?: string;
    returnDate?: string;
}

export interface PbpLog {
    quarter: number;
    timeRemaining: string;
    teamId: string;
    text: string;
    type: 'score' | 'miss' | 'turnover' | 'foul' | 'block' | 'freethrow' | 'info';
    points?: 1 | 2 | 3;
}

export interface SimulationResult {
    homeScore: number;
    awayScore: number;
    homeBox: PlayerBoxScore[];
    awayBox: PlayerBoxScore[];
    homeTactics: TacticalSnapshot;
    awayTactics: TacticalSnapshot;
    rosterUpdates: Record<string, RosterUpdate>;
    pbpLogs: PbpLog[];
    rotationData: RotationData;
}

export type RotationData = Record<string, { in: number, out: number }[]>;

export type AppView = 'TeamSelect' | 'Onboarding' | 'Dashboard' | 'Roster' | 'Schedule' | 'Standings' | 'Leaderboard' | 'Transactions' | 'Playoffs' | 'Help' | 'OvrCalculator' | 'Inbox';

export type MessageType = 'GAME_RECAP' | 'TRADE_ALERT' | 'INJURY_REPORT' | 'SYSTEM';

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
    userBoxScore: PlayerBoxScore[];
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

export interface TacticPreset {
    slot: number;
    name: string;
    data: Partial<GameTactics>;
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

export type PlayType = 'Iso' | 'PnR_Handler' | 'PnR_Roll' | 'PnR_Pop' | 'PostUp' | 'CatchShoot' | 'Cut' | 'Handoff' | 'Transition';

export interface TradeOffer {
  teamId: string;
  teamName: string;
  players: Player[];
  diffValue: number;
  analysis?: string[];
}
