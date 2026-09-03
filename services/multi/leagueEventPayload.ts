
// leagueEventPayload.ts — league_events.payload 구조화 필드 파서(클라이언트).
//
// [2026-09-01] 뉴스피드 그리드 개편 — server/src/shared/leagueEvents.ts(+ trade RPC)가
// payload에 {v:1, headline, ...타입별 필드}를 쓰기 시작하면서, 여기서는 그걸 판별
// 유니온(LeagueEventDetail)으로 정규화한다. v가 없거나(옛 이벤트) 필수 필드가 깨진
// 경우 kind:'legacy'로 폴백 — 그리드가 크래시 대신 기존 아이콘+헤드라인 카드로 렌더링.
//
// 서버 미러: server/src/shared/leagueEvents.ts의 GameResultPayload/PlayerFeatPayload/
// PlayerStreakPayload/WinStreakPayload. 필드명을 바꿀 땐 반드시 양쪽 다 같이 고칠 것
// (client/server 미러 쌍 — dev-log.md 기록 대상).
//
// 훅(useLeagueHeadlines.ts)이 아니라 별도 모듈로 둔 이유: 카드 컴포넌트도 이 타입이
// 필요한데, 훅↔카드 상호 참조를 피하려면 타입/파서를 독립 모듈에 둬야 의존 그래프가
// 순환 없이 DAG로 유지된다(CLAUDE.md 순환 임포트 금지 규칙).

import type { LeagueEventType } from '../../hooks/useLeagueHeadlines';

export interface StatEntry { label: string; value: number }

export interface GameResultDetail {
    kind: 'game_result';
    homeSlug: string;
    awaySlug: string;
    homeScore: number;
    awayScore: number;
    margin: number;
    mvpHome?: { playerId: string; name: string; position?: string; stats: StatEntry[] };
    mvpAway?: { playerId: string; name: string; position?: string; stats: StatEntry[] };
    /** [2026-09-01] "특이케이스" 1차분 — 초박빙 경기(margin≤3)/버저비터. */
    closeGame?: boolean;
    buzzerBeater?: { playerId: string; name: string; teamSlug: string; points: number; secondsLeft: number };
}

/** 그 활약/기록이 나온 경기의 최종 스코어 — 미니 박스스코어 렌더용. 이 필드 추가(2026-09-01)
 * 이전 이벤트는 없어서 optional — 없으면 카드가 미니 박스스코어를 생략(폴백). */
export interface GameRef { homeSlug: string; awaySlug: string; homeScore: number; awayScore: number }

export interface PlayerFeatDetail {
    kind: 'player_feat';
    featKind: 'triple_double' | 'double_double' | 'stat_explosion';
    player: { id: string; name: string };
    teamSlug: string;
    opponentSlug: string;
    stats: { key: string; label: string; value: number }[];
    game?: GameRef;
}

/** [2026-09-02] 선수 연속기록을 구성하는 경기 하나 — win_streak의 WinStreakGame과 동일한
 * 패턴이지만 mvp(팀 전체 최고 활약) 대신 statValue(이 선수 개인의 해당 스탯 실측치)를 담는다. */
/** [2026-09-02] 서버 미러(leagueEvents.ts) — 연속 기록 리스트를 텍스트에서 박스스코어
 * 스타일 테이블(PTS/REB/AST/STL/BLK/TOV/PF/FG%/3P%/FT%)로 재설계하며 statValue 하나만으론
 * 부족해 그 경기의 전체 스탯 라인을 추가. 이 필드가 생기기 전(2026-09-02 이전) 이벤트는
 * 전부 0으로 파싱됨(parsePlayerStreakGame) — 테이블이 0으로 채워지는 정도로 폴백, 카드
 * 자체는 그대로 렌더링. */
export interface PlayerStreakGame {
    gameId: string; gameDate: string;
    homeSlug: string; awaySlug: string; homeScore: number; awayScore: number;
    statValue: number;
    pts: number; reb: number; ast: number; stl: number; blk: number; tov: number; pf: number;
    fgm: number; fga: number; p3m: number; p3a: number; ftm: number; fta: number;
}

export interface PlayerStreakDetail {
    kind: 'player_streak';
    player: { id: string; name: string };
    teamSlug: string;
    opponentSlug: string;
    /** [2026-09-01] 단수 streak → 복수 streaks — 한 경기에서 여러 규칙(20+득점 연속 +
     * 10+리바운드 연속 등)이 동시에 자격을 얻으면 이벤트 여러 건이 아니라 하나로 묶어
     * 배열에 전부 담는다(server/src/shared/leagueEvents.ts 미러).
     * [2026-09-02] 각 규칙에 games 추가 — 그 연속기록을 구성하는 경기 목록(최신순). 이
     * 필드가 생기기 전(2026-09-02 이전) 이벤트는 빈 배열 — 카드가 경기 리스트 없이
     * 렌더링(폴백, win_streak과 동일한 하위호환 원칙). */
    streaks: { ruleKey: string; statKey: string; min: number; count: number; label: string; games: PlayerStreakGame[] }[];
    game?: GameRef;
}

export interface WinStreakGame {
    gameId: string;
    gameDate: string;
    homeSlug: string; awaySlug: string; homeScore: number; awayScore: number;
    mvp?: { playerId: string; name: string; stats: StatEntry[] };
}

export interface WinStreakDetail {
    kind: 'win_streak';
    teamSlug: string;
    streak: number;
    /** [2026-09-01] 레터 디자인(팀 연승 뉴스 재설계) — 연승을 구성하는 경기 목록(최신순).
     * 이 필드가 생기기 전(2026-09-01 이전) 이벤트는 빈 배열 — 카드가 경기 리스트 없이
     * 렌더링(폴백). */
    games: WinStreakGame[];
}

export interface TradeDetail {
    kind: 'trade';
    teamA: { slug: string };
    teamB: { slug: string };
    aOut: { id: string; name: string }[];
    bOut: { id: string; name: string }[];
}

export interface LegacyDetail { kind: 'legacy' }

export interface PowerRankingEntry {
    teamSlug: string;
    teamName: string;
    rank: number;
    powerScore: number;
    /** [2026-09] "재능"/"공격"/"수비" 컬럼 — 이 필드 추가 이전(구 이벤트)에는 없을 수 있어
     * optional(카드가 '-'로 폴백). */
    talentScore?: number;
    offenseScore?: number;
    defenseScore?: number;
}

/** [2026-09] "매월 초 파워랭킹" 뉴스 — 서버 미러: server/src/postPowerRankingNews.ts의
 * PowerRankingPayloadData. 필드명을 바꿀 땐 반드시 양쪽 다 같이 고칠 것(client/server 미러
 * 쌍 — dev-log.md 기록 대상). */
export interface PowerRankingDetail {
    kind: 'power_ranking';
    month: string; // 'YYYY-MM'
    full: PowerRankingEntry[]; // 전체 팀, rank 오름차순
    riser?: PowerRankingEntry & { fromRank: number };
    faller?: PowerRankingEntry & { fromRank: number };
}

/** [2026-09] 정규시즌 종료 1일 후 발표되는 시즌 어워드 뉴스 — 서버 미러:
 * server/src/postSeasonAwards.ts. 필드명을 바꿀 땐 반드시 양쪽 다 같이 고칠 것(client/server
 * 미러 쌍 — dev-log.md 기록 대상). */
export interface MvpAwardEntry {
    playerId: string; playerName: string; teamSlug: string; position: string;
    points: number; firstPlaceVotes: number;
    /** [1위표, 2위표, 3위표, 4위표, 5위표] 개수 — server/src/postSeasonAwards.ts의
     * mvpVoteBreakdown(components/inbox/AwardsReportViewer.tsx와 동일 집계 방식)에서 채움. */
    rankVotes: number[];
    ppg: number; rpg: number; apg: number; spg: number; bpg: number;
    fgPct: number; p3Pct: number; ftPct: number;
}
export interface MvpAwardDetail {
    kind: 'mvp_award';
    season: string;
    ranking: MvpAwardEntry[]; // 1~5위, 오름차순
}

export interface DpoyAwardEntry {
    playerId: string; playerName: string; teamSlug: string; position: string;
    points: number; firstPlaceVotes: number;
    /** [1위표, 2위표, 3위표] 개수 — mvp_award의 rankVotes와 동일한 개념(topN=3). */
    rankVotes: number[];
    spg: number; bpg: number; drebpg: number; orebpg: number;
    /** 상대가 이 선수에게 컨테스트당했을 때의 필드골 성공률(DFG%). */
    dfgPct: number;
    /** 경기당 상대 턴오버 유발(TOVF/G) — 스틸 + 차징 유도. */
    tovfpg: number;
}
export interface DpoyAwardDetail {
    kind: 'dpoy_award';
    season: string;
    ranking: DpoyAwardEntry[]; // 1~3위, 오름차순
}

export interface AllNbaTeamEntry {
    playerId: string; playerName: string; teamSlug: string; pos: 'G' | 'F' | 'C';
    ppg: number; rpg: number; apg: number;
    g: number; gs: number; mpg: number; spg: number; bpg: number; tovpg: number;
    fgPct: number; p3Pct: number; ftPct: number;
}
export interface AllTeamTier { tier: number; players: AllNbaTeamEntry[] }
export interface AllNbaTeamDetail {
    kind: 'all_nba_team';
    season: string;
    tiers: AllTeamTier[]; // tier 1~3
}

export interface AllDefTeamEntry {
    playerId: string; playerName: string; teamSlug: string; pos: 'G' | 'F' | 'C';
    spg: number; bpg: number;
    g: number; gs: number; mpg: number; orebpg: number; drebpg: number; dfgPct: number;
    pfpg: number; tovpg: number;
    /** 경기당 상대 턴오버 유발(TOVF/G) — 스틸 + 차징 유도. */
    tovfpg: number;
}
export interface AllDefTeamTier { tier: number; players: AllDefTeamEntry[] }
export interface AllDefTeamDetail {
    kind: 'all_def_team';
    season: string;
    tiers: AllDefTeamTier[]; // tier 1~2
}

/** [2026-09-03] "부상 발생 시 뉴스" 요청 — 서버 미러: server/src/shared/leagueEvents.ts의
 * InjuryPayload/detectInjuryEvent(). GRADE3 이상만 발행되므로 severity는 항상 이 3개
 * 값 중 하나(서버가 GRADE1/2는 애초에 이벤트를 만들지 않음). 필드명을 바꿀 땐 반드시
 * 양쪽 다 같이 고칠 것(client/server 미러 쌍 — dev-log.md 기록 대상). */
export interface InjuryDetail {
    kind: 'injury';
    player: { id: string; name: string };
    teamSlug: string;
    severity: 'Grade3' | 'Grade4' | 'Grade5';
    injuryType: string;
    duration: string;
    returnDate: string | null;
}

/** [2026-09-03] "출장정지도 한 뉴스에 양쪽 다" 요청 — 서버 미러:
 * server/src/shared/leagueEvents.ts의 SuspensionPayload/detectSuspensionEvent(). 싸움은
 * 항상 두 선수 모두에게 동시에 발생하므로 이벤트 하나에 양쪽 정보를 전부 담는다(injury와
 * 달리 선수 1명당 이벤트 1건이 아님). 필드명을 바꿀 땐 반드시 양쪽 다 같이 고칠 것
 * (client/server 미러 쌍 — dev-log.md 기록 대상). */
export interface SuspensionDetail {
    kind: 'suspension';
    fighter: { id: string; name: string };
    fighterTeamSlug: string;
    fighterSuspensionGames: number;
    fighterReturnDate: string | null;
    opponent: { id: string; name: string };
    opponentTeamSlug: string;
    opponentSuspensionGames: number;
    opponentReturnDate: string | null;
    quarter: number;
    timeRemaining: string;
}

export type LeagueEventDetail =
    | GameResultDetail
    | PlayerFeatDetail
    | PlayerStreakDetail
    | WinStreakDetail
    | TradeDetail
    | PowerRankingDetail
    | MvpAwardDetail
    | DpoyAwardDetail
    | AllNbaTeamDetail
    | AllDefTeamDetail
    | InjuryDetail
    | SuspensionDetail
    | LegacyDetail;

const LEGACY: LegacyDetail = { kind: 'legacy' };

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

// mvpHome/mvpAway 각각 독립적으로 파싱 — 한쪽이 깨져도(예: 그 팀에 출전 선수가 없어
// undefined) 다른 쪽까지 legacy로 끌고 내려가지 않는다.
function parseGameMvp(raw: any): { playerId: string; name: string; position?: string; stats: StatEntry[] } | undefined {
    if (!raw || !isNonEmptyString(raw.playerId) || !isNonEmptyString(raw.name)) return undefined;
    return {
        playerId: raw.playerId,
        name: raw.name,
        position: isNonEmptyString(raw.position) ? raw.position : undefined,
        stats: Array.isArray(raw.stats) ? raw.stats : [],
    };
}

// buzzerBeater 필드 검증 — mvpHome/mvpAway처럼 형태가 깨져도(선수 정보 부실 등) 그 필드만
// undefined로 떨어뜨리고 나머지(closeGame 등)는 그대로 살린다.
function parseBuzzerBeater(raw: any): { playerId: string; name: string; teamSlug: string; points: number; secondsLeft: number } | undefined {
    if (!raw || !isNonEmptyString(raw.playerId) || !isNonEmptyString(raw.teamSlug)) return undefined;
    if (typeof raw.points !== 'number' || typeof raw.secondsLeft !== 'number') return undefined;
    return { playerId: raw.playerId, name: isNonEmptyString(raw.name) ? raw.name : '', teamSlug: raw.teamSlug, points: raw.points, secondsLeft: raw.secondsLeft };
}

// [2026-09-01] 팀 연승 레터 디자인 — 연승을 구성하는 경기 하나를 검증. 개별 경기가
// 깨지면(예: mvp 필드 부실) 그 경기만 리스트에서 걸러내고 나머지 경기는 그대로 살린다
// (mvpHome/mvpAway와 동일한 방어적 파싱 원칙).
function parseWinStreakGame(raw: any): WinStreakGame | undefined {
    if (!raw || !isNonEmptyString(raw.gameId) || !isNonEmptyString(raw.gameDate)) return undefined;
    if (!isNonEmptyString(raw.homeSlug) || !isNonEmptyString(raw.awaySlug)) return undefined;
    if (typeof raw.homeScore !== 'number' || typeof raw.awayScore !== 'number') return undefined;
    return {
        gameId: raw.gameId, gameDate: raw.gameDate,
        homeSlug: raw.homeSlug, awaySlug: raw.awaySlug, homeScore: raw.homeScore, awayScore: raw.awayScore,
        mvp: parseGameMvp(raw.mvp),
    };
}

// [2026-09-02] 연속기록을 구성하는 경기 하나 검증 — parseWinStreakGame과 동일한 원리지만
// mvp 대신 statValue(숫자, 없으면 0 취급 — 이 필드 자체가 없는 걸로 카드가 깨지면 안 됨).
function parsePlayerStreakGame(raw: any): PlayerStreakGame | undefined {
    if (!raw || !isNonEmptyString(raw.gameId) || !isNonEmptyString(raw.gameDate)) return undefined;
    if (!isNonEmptyString(raw.homeSlug) || !isNonEmptyString(raw.awaySlug)) return undefined;
    if (typeof raw.homeScore !== 'number' || typeof raw.awayScore !== 'number') return undefined;
    const num = (v: any): number => typeof v === 'number' ? v : 0;
    return {
        gameId: raw.gameId, gameDate: raw.gameDate,
        homeSlug: raw.homeSlug, awaySlug: raw.awaySlug, homeScore: raw.homeScore, awayScore: raw.awayScore,
        statValue: num(raw.statValue),
        pts: num(raw.pts), reb: num(raw.reb), ast: num(raw.ast), stl: num(raw.stl), blk: num(raw.blk),
        tov: num(raw.tov), pf: num(raw.pf),
        fgm: num(raw.fgm), fga: num(raw.fga), p3m: num(raw.p3m), p3a: num(raw.p3a), ftm: num(raw.ftm), fta: num(raw.fta),
    };
}

type StreakEntry = { ruleKey: string; statKey: string; min: number; count: number; label: string; games: PlayerStreakGame[] };

function parseStreakEntry(raw: any): StreakEntry | undefined {
    if (!raw || !isNonEmptyString(raw.ruleKey) || !isNonEmptyString(raw.statKey) || !isNonEmptyString(raw.label)) return undefined;
    if (typeof raw.min !== 'number' || typeof raw.count !== 'number') return undefined;
    const games = Array.isArray(raw.games)
        ? raw.games.map(parsePlayerStreakGame).filter((g: PlayerStreakGame | undefined): g is PlayerStreakGame => !!g)
        : [];
    return { ruleKey: raw.ruleKey, statKey: raw.statKey, min: raw.min, count: raw.count, label: raw.label, games };
}

// [2026-09-01] "같은 경기에서 여러 스트릭이 겹치면 뉴스가 여러 건 생기는" 문제 수정 —
// 서버가 이제 payload.streaks(배열)로 여러 규칙을 한 이벤트에 묶어 보낸다. 이 필드가 생기기
// 전(2026-09-01 이전)에 이미 쌓인 옛 이벤트는 payload.streak(단수)만 있으므로, 그것도 배열로
// 감싸 흡수 — 옛 이벤트가 LEGACY로 떨어지지 않고 그대로 렌더링된다. 개별 항목이 깨졌으면
// 그 항목만 걸러내고(전체를 LEGACY로 끌고 내려가지 않음), 결과가 빈 배열이면 호출부가 LEGACY
// 처리.
function parseStreaks(payload: any): StreakEntry[] {
    const raw = Array.isArray(payload.streaks) ? payload.streaks : payload.streak ? [payload.streak] : [];
    return raw.map(parseStreakEntry).filter((s: StreakEntry | undefined): s is StreakEntry => !!s);
}

// game_result와 달리 필수 필드가 아님(옛 player_feat/player_streak 이벤트엔 없음) — 형태가
// 안 맞으면 그냥 undefined(카드가 미니 박스스코어 없이 렌더링), 이벤트 전체를 legacy로
// 떨어뜨리지 않는다.
function parseGameRef(raw: any): GameRef | undefined {
    if (!raw || !isNonEmptyString(raw.homeSlug) || !isNonEmptyString(raw.awaySlug)) return undefined;
    if (typeof raw.homeScore !== 'number' || typeof raw.awayScore !== 'number') return undefined;
    return { homeSlug: raw.homeSlug, awaySlug: raw.awaySlug, homeScore: raw.homeScore, awayScore: raw.awayScore };
}

function parsePowerRankingEntry(raw: any): PowerRankingEntry | undefined {
    if (!raw || !isNonEmptyString(raw.teamSlug) || !isNonEmptyString(raw.teamName)) return undefined;
    if (typeof raw.rank !== 'number' || typeof raw.powerScore !== 'number') return undefined;
    return {
        teamSlug: raw.teamSlug, teamName: raw.teamName, rank: raw.rank, powerScore: raw.powerScore,
        talentScore: typeof raw.talentScore === 'number' ? raw.talentScore : undefined,
        offenseScore: typeof raw.offenseScore === 'number' ? raw.offenseScore : undefined,
        defenseScore: typeof raw.defenseScore === 'number' ? raw.defenseScore : undefined,
    };
}

function parsePowerRankingMover(raw: any): (PowerRankingEntry & { fromRank: number }) | undefined {
    const entry = parsePowerRankingEntry(raw);
    if (!entry || typeof raw.fromRank !== 'number') return undefined;
    return { ...entry, fromRank: raw.fromRank };
}

// v===1이지만 형태가 깨진 payload(반쯤 쓰인 마이그레이션, 수동 편집 등)가 그리드를
// 죽이지 않도록 필수 필드를 방어적으로 검증하고, 실패하면 legacy로 폴백한다.
export function parseLeagueEventPayload(type: LeagueEventType, payload: any): LeagueEventDetail {
    if (!payload || payload.v !== 1) return LEGACY;

    try {
        switch (type) {
            case 'game_result': {
                if (!isNonEmptyString(payload.homeSlug) || !isNonEmptyString(payload.awaySlug)) return LEGACY;
                if (typeof payload.homeScore !== 'number' || typeof payload.awayScore !== 'number') return LEGACY;
                return {
                    kind: 'game_result',
                    homeSlug: payload.homeSlug,
                    awaySlug: payload.awaySlug,
                    homeScore: payload.homeScore,
                    awayScore: payload.awayScore,
                    margin: typeof payload.margin === 'number' ? payload.margin : Math.abs(payload.homeScore - payload.awayScore),
                    mvpHome: parseGameMvp(payload.mvpHome),
                    mvpAway: parseGameMvp(payload.mvpAway),
                    closeGame: payload.closeGame === true,
                    buzzerBeater: parseBuzzerBeater(payload.buzzerBeater),
                };
            }
            case 'player_feat': {
                if (!payload.player || !isNonEmptyString(payload.player.id) || !isNonEmptyString(payload.player.name)) return LEGACY;
                if (!isNonEmptyString(payload.teamSlug) || !Array.isArray(payload.stats)) return LEGACY;
                return {
                    kind: 'player_feat',
                    featKind: payload.featKind,
                    player: { id: payload.player.id, name: payload.player.name },
                    teamSlug: payload.teamSlug,
                    opponentSlug: payload.opponentSlug ?? '',
                    stats: payload.stats,
                    game: parseGameRef(payload),
                };
            }
            case 'player_streak': {
                if (!payload.player || !isNonEmptyString(payload.player.id) || !isNonEmptyString(payload.player.name)) return LEGACY;
                if (!isNonEmptyString(payload.teamSlug)) return LEGACY;
                const streaks = parseStreaks(payload);
                if (streaks.length === 0) return LEGACY;
                return {
                    kind: 'player_streak',
                    player: { id: payload.player.id, name: payload.player.name },
                    teamSlug: payload.teamSlug,
                    opponentSlug: payload.opponentSlug ?? '',
                    streaks,
                    game: parseGameRef(payload),
                };
            }
            case 'win_streak': {
                if (!isNonEmptyString(payload.teamSlug) || typeof payload.streak !== 'number') return LEGACY;
                const games = Array.isArray(payload.games)
                    ? payload.games.map(parseWinStreakGame).filter((g: WinStreakGame | undefined): g is WinStreakGame => !!g)
                    : [];
                return { kind: 'win_streak', teamSlug: payload.teamSlug, streak: payload.streak, games };
            }
            case 'trade': {
                if (!payload.teamA?.slug || !payload.teamB?.slug) return LEGACY;
                return {
                    kind: 'trade',
                    teamA: { slug: payload.teamA.slug },
                    teamB: { slug: payload.teamB.slug },
                    aOut: Array.isArray(payload.aOut) ? payload.aOut : [],
                    bOut: Array.isArray(payload.bOut) ? payload.bOut : [],
                };
            }
            case 'power_ranking': {
                if (!isNonEmptyString(payload.month) || !Array.isArray(payload.full)) return LEGACY;
                const full = payload.full.map(parsePowerRankingEntry).filter((e: PowerRankingEntry | undefined): e is PowerRankingEntry => !!e);
                if (full.length === 0) return LEGACY;
                return {
                    kind: 'power_ranking',
                    month: payload.month,
                    full,
                    riser: parsePowerRankingMover(payload.riser),
                    faller: parsePowerRankingMover(payload.faller),
                };
            }
            case 'mvp_award': {
                if (!isNonEmptyString(payload.season) || !Array.isArray(payload.ranking)) return LEGACY;
                const num = (v: unknown) => typeof v === 'number' ? v : 0;
                const ranking: MvpAwardEntry[] = payload.ranking
                    .filter((r: any) => r && isNonEmptyString(r.playerId) && isNonEmptyString(r.playerName) && isNonEmptyString(r.teamSlug))
                    .map((r: any): MvpAwardEntry => ({
                        playerId: r.playerId, playerName: r.playerName, teamSlug: r.teamSlug,
                        position: isNonEmptyString(r.position) ? r.position : '',
                        points: num(r.points), firstPlaceVotes: num(r.firstPlaceVotes),
                        rankVotes: Array.isArray(r.rankVotes) ? r.rankVotes.map(num) : [0, 0, 0, 0, 0],
                        ppg: num(r.ppg), rpg: num(r.rpg), apg: num(r.apg), spg: num(r.spg), bpg: num(r.bpg),
                        fgPct: num(r.fgPct), p3Pct: num(r.p3Pct), ftPct: num(r.ftPct),
                    }));
                if (ranking.length === 0) return LEGACY;
                return { kind: 'mvp_award', season: payload.season, ranking };
            }
            case 'dpoy_award': {
                if (!isNonEmptyString(payload.season) || !Array.isArray(payload.ranking)) return LEGACY;
                const num = (v: unknown) => typeof v === 'number' ? v : 0;
                const ranking: DpoyAwardEntry[] = payload.ranking
                    .filter((r: any) => r && isNonEmptyString(r.playerId) && isNonEmptyString(r.playerName) && isNonEmptyString(r.teamSlug))
                    .map((r: any): DpoyAwardEntry => ({
                        playerId: r.playerId, playerName: r.playerName, teamSlug: r.teamSlug,
                        position: isNonEmptyString(r.position) ? r.position : '',
                        points: num(r.points), firstPlaceVotes: num(r.firstPlaceVotes),
                        rankVotes: Array.isArray(r.rankVotes) ? r.rankVotes.map(num) : [0, 0, 0],
                        spg: num(r.spg), bpg: num(r.bpg), drebpg: num(r.drebpg),
                        orebpg: num(r.orebpg), dfgPct: num(r.dfgPct), tovfpg: num(r.tovfpg),
                    }));
                if (ranking.length === 0) return LEGACY;
                return { kind: 'dpoy_award', season: payload.season, ranking };
            }
            case 'all_nba_team': {
                if (!isNonEmptyString(payload.season) || !Array.isArray(payload.tiers)) return LEGACY;
                const num = (v: unknown) => typeof v === 'number' ? v : 0;
                const tiers: AllTeamTier[] = payload.tiers
                    .filter((t: any) => t && typeof t.tier === 'number' && Array.isArray(t.players))
                    .map((t: any): AllTeamTier => ({
                        tier: t.tier,
                        players: t.players
                            .filter((p: any) => p && isNonEmptyString(p.playerId) && isNonEmptyString(p.playerName) && isNonEmptyString(p.teamSlug))
                            .map((p: any): AllNbaTeamEntry => ({
                                playerId: p.playerId, playerName: p.playerName, teamSlug: p.teamSlug,
                                pos: p.pos === 'G' || p.pos === 'F' || p.pos === 'C' ? p.pos : 'F',
                                ppg: num(p.ppg), rpg: num(p.rpg), apg: num(p.apg),
                                g: num(p.g), gs: num(p.gs), mpg: num(p.mpg),
                                spg: num(p.spg), bpg: num(p.bpg), tovpg: num(p.tovpg),
                                fgPct: num(p.fgPct), p3Pct: num(p.p3Pct), ftPct: num(p.ftPct),
                            })),
                    }));
                if (tiers.length === 0) return LEGACY;
                return { kind: 'all_nba_team', season: payload.season, tiers };
            }
            case 'all_def_team': {
                if (!isNonEmptyString(payload.season) || !Array.isArray(payload.tiers)) return LEGACY;
                const num = (v: unknown) => typeof v === 'number' ? v : 0;
                const tiers: AllDefTeamTier[] = payload.tiers
                    .filter((t: any) => t && typeof t.tier === 'number' && Array.isArray(t.players))
                    .map((t: any): AllDefTeamTier => ({
                        tier: t.tier,
                        players: t.players
                            .filter((p: any) => p && isNonEmptyString(p.playerId) && isNonEmptyString(p.playerName) && isNonEmptyString(p.teamSlug))
                            .map((p: any): AllDefTeamEntry => ({
                                playerId: p.playerId, playerName: p.playerName, teamSlug: p.teamSlug,
                                pos: p.pos === 'G' || p.pos === 'F' || p.pos === 'C' ? p.pos : 'F',
                                spg: num(p.spg), bpg: num(p.bpg),
                                g: num(p.g), gs: num(p.gs), mpg: num(p.mpg),
                                orebpg: num(p.orebpg), drebpg: num(p.drebpg), dfgPct: num(p.dfgPct),
                                pfpg: num(p.pfpg), tovpg: num(p.tovpg), tovfpg: num(p.tovfpg),
                            })),
                    }));
                if (tiers.length === 0) return LEGACY;
                return { kind: 'all_def_team', season: payload.season, tiers };
            }
            case 'injury': {
                if (!payload.player || !isNonEmptyString(payload.player.id) || !isNonEmptyString(payload.player.name)) return LEGACY;
                if (!isNonEmptyString(payload.teamSlug) || !isNonEmptyString(payload.injuryType) || !isNonEmptyString(payload.duration)) return LEGACY;
                if (payload.severity !== 'Grade3' && payload.severity !== 'Grade4' && payload.severity !== 'Grade5') return LEGACY;
                return {
                    kind: 'injury',
                    player: { id: payload.player.id, name: payload.player.name },
                    teamSlug: payload.teamSlug,
                    severity: payload.severity,
                    injuryType: payload.injuryType,
                    duration: payload.duration,
                    returnDate: isNonEmptyString(payload.returnDate) ? payload.returnDate : null,
                };
            }
            case 'suspension': {
                if (!payload.fighter || !isNonEmptyString(payload.fighter.id) || !isNonEmptyString(payload.fighter.name)) return LEGACY;
                if (!payload.opponent || !isNonEmptyString(payload.opponent.id) || !isNonEmptyString(payload.opponent.name)) return LEGACY;
                if (!isNonEmptyString(payload.fighterTeamSlug) || !isNonEmptyString(payload.opponentTeamSlug)) return LEGACY;
                if (typeof payload.fighterSuspensionGames !== 'number' || typeof payload.opponentSuspensionGames !== 'number') return LEGACY;
                return {
                    kind: 'suspension',
                    fighter: { id: payload.fighter.id, name: payload.fighter.name },
                    fighterTeamSlug: payload.fighterTeamSlug,
                    fighterSuspensionGames: payload.fighterSuspensionGames,
                    fighterReturnDate: isNonEmptyString(payload.fighterReturnDate) ? payload.fighterReturnDate : null,
                    opponent: { id: payload.opponent.id, name: payload.opponent.name },
                    opponentTeamSlug: payload.opponentTeamSlug,
                    opponentSuspensionGames: payload.opponentSuspensionGames,
                    opponentReturnDate: isNonEmptyString(payload.opponentReturnDate) ? payload.opponentReturnDate : null,
                    quarter: typeof payload.quarter === 'number' ? payload.quarter : 0,
                    timeRemaining: isNonEmptyString(payload.timeRemaining) ? payload.timeRemaining : '',
                };
            }
            default:
                return LEGACY;
        }
    } catch {
        return LEGACY;
    }
}
