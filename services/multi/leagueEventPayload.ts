
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

/** [2026-09-08] 올스타 팬 투표 중간/최종 집계 뉴스 — 서버 미러: server/src/postAllStarVoteNews.ts
 * (league_events 뉴스 + league_allstar_votes 테이블 payload 둘 다 이 형태 그대로 저장). 필드명을
 * 바꿀 땐 서버 쪽도 반드시 같이 고칠 것(dev-log.md 기록 대상). votes/pct는
 * utils/allStarSelection.ts의 AllStarVoteEntry(votes, pct)와 동일 정의(pct는 0~1, 같은 포지션
 * 그룹 내 득표율). */
export interface AllstarVoteEntry {
    playerId: string; playerName: string; teamSlug: string;
    posGroup: 'G' | 'FC';
    votes: number;
    pct: number;
}
export interface AllstarVoteConference {
    guards: AllstarVoteEntry[];
    frontcourt: AllstarVoteEntry[];
}
export interface AllstarVoteUpdateDetail {
    kind: 'allstar_vote_update';
    /** "1차 중간 집계" / "최종 집계" 등 — 카드 제목에 그대로 사용. */
    roundLabel: string;
    /** 0~1, 투표 시작 대비 경과 비율(runAllStarVote의 voteProgress와 동일). */
    voteProgress: number;
    east: AllstarVoteConference;
    west: AllstarVoteConference;
}

/** [2026-09-08] 투표 시작일(getAllStarKeyDates().allStarVoteStart)에 발송되는 안내 서신 —
 * 득표 리더보드(allstar_vote_update)와 달리 표가 없는 순수 안내문. 날짜들은 서버가 계산
 * 시점에 이미 문자열로 박아서 보내므로 카드가 별도 계산 없이 그대로 표시한다. */
export interface AllstarVoteStartDetail {
    kind: 'allstar_vote_start';
    leagueName: string;
    /** 예: "2026-27" */
    seasonLabel: string;
    voteStart: string;
    voteEnd: string;
    allStarStart: string;
    allStarEnd: string;
    /** [2026-09-08] 올스타 본경기 실제 실행일(allStarStart+3일) — 구버전 데이터엔 없을 수
     *  있어 optional. */
    mainGameDate?: string;
}

/** [2026-09-08] 투표 마감 후 확정된 올스타 명단(스타터/리저브) — 원래는
 * league_allstar_votes.roster 컬럼 전용으로 만든 타입이었는데, 2026-09-08 후속으로
 * league_events의 allstar_vote_result 뉴스 payload도 완전히 같은 형태를 그대로 재사용한다
 * (아래 AllstarVoteResultDetail 참고) — 그래서 이제 LeagueEventDetail 유니온에도 들어감.
 * utils/allStarSelection.ts의 runAllStarSelection()이 반환하는 AllStarPlayer를 화면 표시에
 * 필요한 필드만 남겨 축약한 형태 — votes/statLine 등 계산용 필드는 저장하지 않는다. */
export interface AllstarRosterPlayer {
    playerId: string; playerName: string; teamSlug: string;
    posGroup: 'G' | 'FC';
    position: string;
    ovr: number;
    /** 스타터는 최종 팬 득표수, 리저브/와일드카드는 코치 100인 투표 포인트 — 서로 스케일이
     *  다른 값이니 섞어서 비교하지 말 것(utils/allStarSelection.ts AllStarPlayer.votes 주석 참고). */
    votes: number;
    /** 0~1, 같은 포지션 그룹 내 팬 득표율 — 스타터만 있음(팬 투표로 뽑히므로). 리저브는 코치
     *  투표라 이 개념이 없어 undefined. */
    pct?: number;
}
export interface AllstarConferenceRoster {
    /** 5명: 백코트 2 + 프론트코트 3 (팬 투표 최종 결과) */
    starters: AllstarRosterPlayer[];
    /** 7명: 백코트 2 + 프론트코트 3 + 와일드카드 2 (코치 투표) */
    reserves: AllstarRosterPlayer[];
}
/** [2026-09-08] 라이징스타 챌린지 — 투표 없이 성적 기준으로 뽑힌 선수라 votes/pct가 없다
 * (AllstarRosterPlayer와 달리 컨퍼런스 구분도 없음, teamA/teamB는 임의 라벨). */
export interface RisingStarsRosterPlayer {
    playerId: string; playerName: string; teamSlug: string;
    posGroup: 'G' | 'FC';
    position: string;
    ovr: number;
    /** [2026-09-08] 팀 내 최고 스코어러(전체 1·2위) — 팀 주장, teamAName/teamBName의 출처. */
    isCaptain: boolean;
}
export interface RisingStarsRosterResult {
    /** 10명씩 — 소속 실제 팀과 무관한 임의 라벨(컨퍼런스 구분 없음) */
    teamA: RisingStarsRosterPlayer[];
    teamB: RisingStarsRosterPlayer[];
    /** 각 팀 주장의 성(姓) — "팀 " + 이 값으로 조합해 표시(예: "팀 플래그"). */
    teamAName: string;
    teamBName: string;
}

export interface AllstarRosterResult {
    east: AllstarConferenceRoster;
    west: AllstarConferenceRoster;
    /** 본올스타와 같이 발표되므로 같은 행/같은 뉴스에 실린다 — 구버전 데이터엔 없을 수 있어 optional. */
    risingStars?: RisingStarsRosterResult;
}

/** [2026-09-08] 투표 마감일에 발송되는 최종 명단 발표 서신 — 코트 배치도 없이 컨퍼런스별
 * 스타터/리저브를 리스트(표)로만 보여준다(사용자 요청, 뉴스 서신은 코트 이미지 제외).
 * east/west는 AllstarRosterResult와 완전히 동일한 형태라 파싱기(parseAllstarRosterPayload)를
 * 그대로 재사용한다. */
export interface AllstarVoteResultDetail {
    kind: 'allstar_vote_result';
    seasonLabel: string;
    east: AllstarConferenceRoster;
    west: AllstarConferenceRoster;
    risingStars?: RisingStarsRosterResult;
    /** [2026-09-08] 서신 본문에 "올스타전 경기 일정" 문구를 넣기 위해 추가 — 올스타전 개최
     *  기간(getAllStarKeyDates().allStarStart/allStarEnd)을 그대로 재사용. 구버전 데이터엔
     *  없을 수 있어 optional. */
    allStarStart?: string;
    allStarEnd?: string;
    /** [2026-09-08] 올스타 본경기 실제 실행일(allStarStart+3일) — 구버전 데이터엔 없을 수
     *  있어 optional. */
    mainGameDate?: string;
}

/** [2026-09-08] 라이징스타 챌린지 명단 — 처음엔 allstar_vote_result 서신 안에 섹션으로만
 * 끼워 넣었는데, 사용자 요청으로 별도 서신(뉴스 피드 아이템)으로도 발송한다. league_events
 * 삽입 시점은 allstar_vote_result와 동일(투표 마감일, isFinalDay) — server/src/postAllStarVoteNews.ts
 * maybePostRisingStarsNews() 참고. teamA/teamB는 AllstarVoteResultDetail.risingStars와 완전히
 * 같은 값(재계산 아님, computeAndStoreAllStarVotes에서 이미 계산해둔 걸 그대로 씀). */
export interface AllstarRisingStarsDetail {
    kind: 'allstar_rising_stars';
    seasonLabel: string;
    teamA: RisingStarsRosterPlayer[];
    teamB: RisingStarsRosterPlayer[];
    teamAName: string;
    teamBName: string;
    /** [2026-09-08] 서신 본문에 "라이징스타 챌린지 경기 일정" 문구를 넣기 위해 추가 — 올스타전
     *  개최 기간(getAllStarKeyDates().allStarStart/allStarEnd)을 그대로 재사용. */
    allStarStart: string;
    allStarEnd: string;
    /** [2026-09-08] 라이징스타 챌린지 실제 경기 실행일(allStarStart+1일) — 구버전 데이터엔
     *  없을 수 있어 optional. */
    gameDate?: string;
}

/** [2026-09-08] 3점 챌린지 참가자 명단 — 투표 없이 3점슛 능력치 기반 가중 랜덤 추첨으로
 * 선정(utils/allStarSelection.ts의 runThreePointContestSelection() 참고). 컨퍼런스/팀 구분
 * 없는 단일 리스트(8명, 실제 NBA 현행 방식). 투표 마감일(allStarVoteEnd)이 아니라 올스타전
 * 기간 시작일(allStarStart)에 발표된다 — 다른 올스타 서신들과 트리거 시점이 다름. */
export interface ThreePointContestParticipantEntry {
    playerId: string; playerName: string; teamSlug: string;
    position: string; ovr: number;
    /** threeCorner/three45/threeTop 평균값(원점수, 선정용 노이즈 반영 전) — 참고/표시용. */
    threePointRating: number;
}
export interface AllstarThreePointContestDetail {
    kind: 'allstar_three_point_contest';
    seasonLabel: string;
    participants: ThreePointContestParticipantEntry[];
    /** [2026-09-08] 실제 대회(슈팅 시뮬레이션) 실행일 — getAllStarKeyDates()의
     *  allStarThreePointContestDate(참가 명단 발표일 allStarStart+2일)를 그대로 재사용.
     *  서신 본문에 "실제 대회는 언제 열리는지" 문구를 넣기 위해 추가 — 구버전 데이터엔
     *  없을 수 있어 optional. */
    contestDate?: string;
}

/** [2026-09-08] 덩크 컨테스트 참가자 명단 — 투표 없이 덩크 능력치 기반 가중 랜덤 추첨(+
 * 아키타입 가산점)으로 선정(utils/allStarSelection.ts의 runDunkContestSelection() 참고).
 * 3점 챌린지와 완전히 동일한 구조(컨퍼런스/팀 구분 없는 단일 리스트, 4명, allStarStart에
 * 발표) — ThreePointContestParticipantEntry/AllstarThreePointContestDetail과 짝을 이룸. */
export interface DunkContestParticipantEntry {
    playerId: string; playerName: string; teamSlug: string;
    position: string; ovr: number;
    /** dunk/vertical 평균값(원점수, 선정용 노이즈·아키타입 보너스 반영 전) — 참고/표시용. */
    dunkRating: number;
}
export interface AllstarDunkContestDetail {
    kind: 'allstar_dunk_contest';
    seasonLabel: string;
    participants: DunkContestParticipantEntry[];
    /** [2026-09-09] 실제 대회(덩크 시뮬레이션) 실행일 — getAllStarKeyDates()의
     *  allStarDunkContestDate(3점 챌린지와 같은 날, allStarStart+2일)를 그대로 재사용.
     *  서신 본문에 "실제 대회는 언제 열리는지" 문구를 넣기 위해 추가 — 구버전 데이터엔
     *  없을 수 있어 optional. */
    contestDate?: string;
}

/** [2026-09-09] 올스타 본경기/라이징스타 챌린지 "결과" 서신 — 참가자 선정(AllstarVoteResultDetail/
 * AllstarRisingStarsDetail)과는 별개로, 실제 경기 시뮬레이션 완료 후 발송(server/src/
 * postAllStarGame.ts의 computeAndRunAllStarGame()). 두 이벤트 타입(allstar_game_result/
 * allstar_rising_stars_result)이 완전히 동일한 payload 구조를 공유해 detail 타입/파서도
 * 하나로 합쳤다 — kind로만 구분. homeTeamId/awayTeamId는 가상 팀 ID(EAST-ALLSTAR 등)라
 * teamBySlug 조회가 항상 실패하므로 homeTeamName/awayTeamName을 서버가 계산 시점에 이미
 * 구해 payload에 직접 실어준다(라이징스타는 시즌마다 주장 성이 달라 클라이언트에서 재조회하지
 * 않고 그대로 사용). mvp는 양팀 박스스코어를 합쳐 pickTeamMvp()로 고른 경기 전체 MVP 1명
 * (server/src/shared/leagueEvents.ts) — 후보가 없을 이론상 케이스만 undefined. */
export interface AllstarGameResultDetail {
    kind: 'allstar_game_result' | 'allstar_rising_stars_result';
    seasonLabel: string;
    homeTeamId: string; awayTeamId: string;
    homeTeamName: string; awayTeamName: string;
    homeScore: number; awayScore: number;
    mvp?: { playerId: string; name: string; position?: string; stats: StatEntry[] };
}

/** [2026-09-09] 3점 챌린지 "결과" 서신 — 참가자 선정(AllstarThreePointContestDetail)과는
 * 별개로, 실제 슈팅 시뮬레이션 완료 후 발송(server/src/postThreePointContest.ts). 5랙(코너-
 * 윙-탑-윙-코너) × 5구(마지막 볼 2점) 라운드를 8명(round1) → 상위 3명 결선(round2)으로 두 번
 * 시뮬레이션 — round1/round2 모두 이미 총점 내림차순 정렬된 상태로 저장된다(서버가 정렬
 * 완료 후 저장, 클라이언트 재정렬 불필요). */
export interface ThreePointContestRoundEntry {
    playerId: string; playerName: string; teamSlug: string; position: string;
    /** 5랙 각각의 점수(0~6, 마지막 볼 2점 포함) — 랙 순서: 왼쪽 코너/왼쪽 윙/탑/오른쪽 윙/오른쪽 코너. */
    rackScores: number[];
    /** [2026-09-09] 랙별 5구 각각의 성공(true)/실패(false) — 샷차트 그래픽(선수 선택 시 랙별
     *  볼 아이콘 표시)용. 이 필드 추가 이전 이벤트는 없을 수 있어 optional. */
    rackShots?: boolean[][];
    total: number;
}
export interface AllstarThreePointContestResultDetail {
    kind: 'allstar_three_point_contest_result';
    seasonLabel: string;
    /** 8명 전원, 총점 내림차순. */
    round1: ThreePointContestRoundEntry[];
    /** round1 상위 3명의 playerId. */
    finalistIds: string[];
    /** 결선 3명, 총점 내림차순 — round2[0]이 우승자. */
    round2: ThreePointContestRoundEntry[];
    winnerId: string;
}

/** [2026-09-09] 덩크 컨테스트 "결과" 서신 — 참가자 선정(AllstarDunkContestDetail)과는 별개로,
 * 실제 채점 시뮬레이션 완료 후 발송(server/src/postDunkContest.ts). 3점 챌린지와 동일한
 * 구조 원칙(round1/round2 모두 이미 총점 내림차순 정렬된 상태로 저장, 클라이언트 재정렬
 * 불필요) — 4명이 예선 2회씩 시도(합산) → 상위 2명이 결승 2회씩 새로 시도(예선 점수 이월
 * 안 됨, 결승 점수만으로 우승 결정). */
export interface DunkAttemptEntry {
    /** 저지 5명 각각의 점수(6~10) — 표시용, 현재 UI는 합계만 사용. */
    judgeScores: number[];
    /** 그 시도의 합계(저지 5명 합산, 최대 50). */
    total: number;
}
export interface DunkContestRoundEntry {
    playerId: string; playerName: string; teamSlug: string; position: string;
    /** 2회 시도 각각의 점수 — 실제 NBA와 동일하게 2회 모두 채점, 합산. */
    dunks: DunkAttemptEntry[];
    total: number;
}
export interface AllstarDunkContestResultDetail {
    kind: 'allstar_dunk_contest_result';
    seasonLabel: string;
    /** 4명 전원, 총점 내림차순. */
    round1: DunkContestRoundEntry[];
    /** round1 상위 2명의 playerId. */
    finalistIds: string[];
    /** 결승 2명, 총점 내림차순 — round2[0]이 우승자. */
    round2: DunkContestRoundEntry[];
    winnerId: string;
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
    | AllstarVoteUpdateDetail
    | AllstarVoteStartDetail
    | AllstarVoteResultDetail
    | AllstarRisingStarsDetail
    | AllstarThreePointContestDetail
    | AllstarDunkContestDetail
    | AllstarGameResultDetail
    | AllstarThreePointContestResultDetail
    | AllstarDunkContestResultDetail
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

/** league_events.payload(allstar_vote_update)와 league_allstar_votes.payload가 완전히 같은
 * 형태를 쓰므로 파싱 로직을 공유한다 — hooks/useAllStarVotes.ts(올스타 페이지)와 아래
 * parseLeagueEventPayload의 'allstar_vote_update' 케이스(뉴스 카드) 둘 다 이 함수를 쓴다. */
export function parseAllstarVotePayload(payload: any): AllstarVoteUpdateDetail | null {
    if (!payload || !isNonEmptyString(payload.roundLabel) || !payload.east || !payload.west) return null;
    const num = (v: unknown) => typeof v === 'number' ? v : 0;
    const parseGroup = (arr: any): AllstarVoteEntry[] => Array.isArray(arr)
        ? arr
            .filter((e: any) => e && isNonEmptyString(e.playerId) && isNonEmptyString(e.playerName) && isNonEmptyString(e.teamSlug))
            .map((e: any): AllstarVoteEntry => ({
                playerId: e.playerId, playerName: e.playerName, teamSlug: e.teamSlug,
                posGroup: e.posGroup === 'FC' ? 'FC' : 'G',
                votes: num(e.votes), pct: num(e.pct),
            }))
        : [];
    const east: AllstarVoteConference = { guards: parseGroup(payload.east.guards), frontcourt: parseGroup(payload.east.frontcourt) };
    const west: AllstarVoteConference = { guards: parseGroup(payload.west.guards), frontcourt: parseGroup(payload.west.frontcourt) };
    if (east.guards.length === 0 && east.frontcourt.length === 0 && west.guards.length === 0 && west.frontcourt.length === 0) return null;
    return { kind: 'allstar_vote_update', roundLabel: payload.roundLabel, voteProgress: num(payload.voteProgress), east, west };
}

/** league_allstar_votes.roster 컬럼(nullable) 전용 파서 — hooks/useAllStarVotes.ts에서 사용.
 * 투표 마감일이 아닌 행은 컬럼 자체가 NULL이라 raw가 null/undefined인 게 정상. */
export function parseAllstarRosterPayload(raw: any): AllstarRosterResult | null {
    if (!raw || !raw.east || !raw.west) return null;
    const parsePlayers = (arr: any): AllstarRosterPlayer[] => Array.isArray(arr)
        ? arr
            .filter((p: any) => p && isNonEmptyString(p.playerId) && isNonEmptyString(p.playerName) && isNonEmptyString(p.teamSlug))
            .map((p: any): AllstarRosterPlayer => ({
                playerId: p.playerId, playerName: p.playerName, teamSlug: p.teamSlug,
                posGroup: p.posGroup === 'FC' ? 'FC' : 'G',
                position: isNonEmptyString(p.position) ? p.position : '',
                ovr: typeof p.ovr === 'number' ? p.ovr : 0,
                votes: typeof p.votes === 'number' ? p.votes : 0,
                pct: typeof p.pct === 'number' ? p.pct : undefined,
            }))
        : [];
    const east: AllstarConferenceRoster = { starters: parsePlayers(raw.east.starters), reserves: parsePlayers(raw.east.reserves) };
    const west: AllstarConferenceRoster = { starters: parsePlayers(raw.west.starters), reserves: parsePlayers(raw.west.reserves) };
    if (east.starters.length === 0 && west.starters.length === 0) return null;

    // teamAName/teamBName은 [2026-09-08] 추가된 필드라 그 이전에 저장된 행엔 없을 수 있음 —
    // 없으면 'A'/'B'로 폴백(runRisingStarsSelection()의 빈 팀 폴백과 동일 기본값).
    const risingStars: RisingStarsRosterResult | undefined = raw.risingStars
        ? {
            teamA: parseRisingStarsPlayers(raw.risingStars.teamA), teamB: parseRisingStarsPlayers(raw.risingStars.teamB),
            teamAName: isNonEmptyString(raw.risingStars.teamAName) ? raw.risingStars.teamAName : 'A',
            teamBName: isNonEmptyString(raw.risingStars.teamBName) ? raw.risingStars.teamBName : 'B',
        }
        : undefined;

    return { east, west, risingStars };
}

// parseAllstarRosterPayload(league_allstar_votes.roster용)와 parseAllstarRisingStarsPayload
// (league_events의 allstar_rising_stars 서신용) 둘 다 같은 선수 배열 형태를 파싱하므로 공유.
function parseRisingStarsPlayers(arr: any): RisingStarsRosterPlayer[] {
    return Array.isArray(arr)
        ? arr
            .filter((p: any) => p && isNonEmptyString(p.playerId) && isNonEmptyString(p.playerName) && isNonEmptyString(p.teamSlug))
            .map((p: any): RisingStarsRosterPlayer => ({
                playerId: p.playerId, playerName: p.playerName, teamSlug: p.teamSlug,
                posGroup: p.posGroup === 'FC' ? 'FC' : 'G',
                position: isNonEmptyString(p.position) ? p.position : '',
                ovr: typeof p.ovr === 'number' ? p.ovr : 0,
                isCaptain: p.isCaptain === true,
            }))
        : [];
}

/** league_events의 allstar_rising_stars 서신 payload 전용 파서. */
export function parseAllstarRisingStarsPayload(payload: any): AllstarRisingStartsPayloadResult | null {
    if (!payload || !isNonEmptyString(payload.seasonLabel)) return null;
    const teamA = parseRisingStarsPlayers(payload.teamA);
    const teamB = parseRisingStarsPlayers(payload.teamB);
    if (teamA.length === 0 && teamB.length === 0) return null;
    return {
        seasonLabel: payload.seasonLabel, teamA, teamB,
        teamAName: isNonEmptyString(payload.teamAName) ? payload.teamAName : 'A',
        teamBName: isNonEmptyString(payload.teamBName) ? payload.teamBName : 'B',
        // [2026-09-08] 추가된 필드라 그 이전에 저장된 행엔 없을 수 있음 — 없으면 빈 문자열로
        // 폴백(카드 쪽에서 빈 문자열이면 일정 문구를 아예 생략).
        allStarStart: isNonEmptyString(payload.allStarStart) ? payload.allStarStart : '',
        allStarEnd: isNonEmptyString(payload.allStarEnd) ? payload.allStarEnd : '',
        gameDate: isNonEmptyString(payload.gameDate) ? payload.gameDate : undefined,
    };
}
type AllstarRisingStartsPayloadResult = {
    seasonLabel: string; teamA: RisingStarsRosterPlayer[]; teamB: RisingStarsRosterPlayer[];
    teamAName: string; teamBName: string;
    allStarStart: string; allStarEnd: string;
    gameDate?: string;
};

/** league_events의 allstar_three_point_contest 서신 payload 전용 파서. */
export function parseAllstarThreePointContestPayload(payload: any): AllstarThreePointContestDetail | null {
    if (!payload || !isNonEmptyString(payload.seasonLabel)) return null;
    const participants: ThreePointContestParticipantEntry[] = Array.isArray(payload.participants)
        ? payload.participants
            .filter((p: any) => p && isNonEmptyString(p.playerId) && isNonEmptyString(p.playerName) && isNonEmptyString(p.teamSlug))
            .map((p: any): ThreePointContestParticipantEntry => ({
                playerId: p.playerId, playerName: p.playerName, teamSlug: p.teamSlug,
                position: isNonEmptyString(p.position) ? p.position : '',
                ovr: typeof p.ovr === 'number' ? p.ovr : 0,
                threePointRating: typeof p.threePointRating === 'number' ? p.threePointRating : 0,
            }))
        : [];
    if (participants.length === 0) return null;
    return {
        kind: 'allstar_three_point_contest', seasonLabel: payload.seasonLabel, participants,
        contestDate: isNonEmptyString(payload.contestDate) ? payload.contestDate : undefined,
    };
}

/** league_events의 allstar_dunk_contest 서신 payload 전용 파서 —
 * parseAllstarThreePointContestPayload()와 완전히 동일한 구조. */
export function parseAllstarDunkContestPayload(payload: any): AllstarDunkContestDetail | null {
    if (!payload || !isNonEmptyString(payload.seasonLabel)) return null;
    const participants: DunkContestParticipantEntry[] = Array.isArray(payload.participants)
        ? payload.participants
            .filter((p: any) => p && isNonEmptyString(p.playerId) && isNonEmptyString(p.playerName) && isNonEmptyString(p.teamSlug))
            .map((p: any): DunkContestParticipantEntry => ({
                playerId: p.playerId, playerName: p.playerName, teamSlug: p.teamSlug,
                position: isNonEmptyString(p.position) ? p.position : '',
                ovr: typeof p.ovr === 'number' ? p.ovr : 0,
                dunkRating: typeof p.dunkRating === 'number' ? p.dunkRating : 0,
            }))
        : [];
    if (participants.length === 0) return null;
    return {
        kind: 'allstar_dunk_contest', seasonLabel: payload.seasonLabel, participants,
        contestDate: isNonEmptyString(payload.contestDate) ? payload.contestDate : undefined,
    };
}

/** league_events의 allstar_game_result/allstar_rising_stars_result 서신 payload 공용 파서 —
 * 두 타입이 완전히 동일한 구조를 공유(server/src/postAllStarGame.ts 참고)라 kind 문자열만
 * 그대로 넘겨받아 채운다. */
export function parseAllstarGameResultPayload(
    payload: any, kind: 'allstar_game_result' | 'allstar_rising_stars_result',
): AllstarGameResultDetail | null {
    if (!payload || !isNonEmptyString(payload.homeTeamId) || !isNonEmptyString(payload.awayTeamId)) return null;
    if (typeof payload.homeScore !== 'number' || typeof payload.awayScore !== 'number') return null;
    return {
        kind,
        seasonLabel: isNonEmptyString(payload.seasonLabel) ? payload.seasonLabel : '',
        homeTeamId: payload.homeTeamId, awayTeamId: payload.awayTeamId,
        homeTeamName: isNonEmptyString(payload.homeTeamName) ? payload.homeTeamName : payload.homeTeamId,
        awayTeamName: isNonEmptyString(payload.awayTeamName) ? payload.awayTeamName : payload.awayTeamId,
        homeScore: payload.homeScore, awayScore: payload.awayScore,
        mvp: parseGameMvp(payload.mvp),
    };
}

function parseThreePointRoundEntries(raw: any): ThreePointContestRoundEntry[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((e: any) => e && isNonEmptyString(e.playerId) && isNonEmptyString(e.playerName) && Array.isArray(e.rackScores))
        .map((e: any): ThreePointContestRoundEntry => ({
            playerId: e.playerId, playerName: e.playerName,
            teamSlug: isNonEmptyString(e.teamSlug) ? e.teamSlug : '',
            position: isNonEmptyString(e.position) ? e.position : '',
            rackScores: e.rackScores.map((n: any) => (typeof n === 'number' ? n : 0)),
            rackShots: Array.isArray(e.rackShots)
                ? e.rackShots.map((rack: any) => Array.isArray(rack) ? rack.map((b: any) => !!b) : [])
                : undefined,
            total: typeof e.total === 'number' ? e.total : e.rackScores.reduce((s: number, n: any) => s + (typeof n === 'number' ? n : 0), 0),
        }));
}

/** league_events의 allstar_three_point_contest_result 서신 payload 전용 파서. */
export function parseAllstarThreePointContestResultPayload(payload: any): AllstarThreePointContestResultDetail | null {
    if (!payload || !isNonEmptyString(payload.winnerId)) return null;
    const round1 = parseThreePointRoundEntries(payload.round1);
    const round2 = parseThreePointRoundEntries(payload.round2);
    if (round1.length === 0 || round2.length === 0) return null;
    return {
        kind: 'allstar_three_point_contest_result',
        seasonLabel: isNonEmptyString(payload.seasonLabel) ? payload.seasonLabel : '',
        round1,
        finalistIds: Array.isArray(payload.finalistIds) ? payload.finalistIds.filter(isNonEmptyString) : round2.map((e: ThreePointContestRoundEntry) => e.playerId),
        round2,
        winnerId: payload.winnerId,
    };
}

function parseDunkAttempts(raw: any): DunkAttemptEntry[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((d: any): DunkAttemptEntry => ({
        judgeScores: Array.isArray(d?.judgeScores) ? d.judgeScores.map((n: any) => (typeof n === 'number' ? n : 0)) : [],
        total: typeof d?.total === 'number' ? d.total : 0,
    }));
}

function parseDunkRoundEntries(raw: any): DunkContestRoundEntry[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((e: any) => e && isNonEmptyString(e.playerId) && isNonEmptyString(e.playerName) && Array.isArray(e.dunks))
        .map((e: any): DunkContestRoundEntry => ({
            playerId: e.playerId, playerName: e.playerName,
            teamSlug: isNonEmptyString(e.teamSlug) ? e.teamSlug : '',
            position: isNonEmptyString(e.position) ? e.position : '',
            dunks: parseDunkAttempts(e.dunks),
            total: typeof e.total === 'number' ? e.total : e.dunks.reduce((s: number, d: any) => s + (typeof d?.total === 'number' ? d.total : 0), 0),
        }));
}

/** league_events의 allstar_dunk_contest_result 서신 payload 전용 파서 —
 * parseAllstarThreePointContestResultPayload()와 완전히 동일한 구조. */
export function parseAllstarDunkContestResultPayload(payload: any): AllstarDunkContestResultDetail | null {
    if (!payload || !isNonEmptyString(payload.winnerId)) return null;
    const round1 = parseDunkRoundEntries(payload.round1);
    const round2 = parseDunkRoundEntries(payload.round2);
    if (round1.length === 0 || round2.length === 0) return null;
    return {
        kind: 'allstar_dunk_contest_result',
        seasonLabel: isNonEmptyString(payload.seasonLabel) ? payload.seasonLabel : '',
        round1,
        finalistIds: Array.isArray(payload.finalistIds) ? payload.finalistIds.filter(isNonEmptyString) : round2.map((e: DunkContestRoundEntry) => e.playerId),
        round2,
        winnerId: payload.winnerId,
    };
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
            case 'allstar_vote_update': {
                const parsed = parseAllstarVotePayload(payload);
                return parsed ?? LEGACY;
            }
            case 'allstar_vote_start': {
                if (!isNonEmptyString(payload.leagueName) || !isNonEmptyString(payload.seasonLabel)) return LEGACY;
                if (!isNonEmptyString(payload.voteStart) || !isNonEmptyString(payload.voteEnd)) return LEGACY;
                if (!isNonEmptyString(payload.allStarStart) || !isNonEmptyString(payload.allStarEnd)) return LEGACY;
                return {
                    kind: 'allstar_vote_start',
                    leagueName: payload.leagueName, seasonLabel: payload.seasonLabel,
                    voteStart: payload.voteStart, voteEnd: payload.voteEnd,
                    allStarStart: payload.allStarStart, allStarEnd: payload.allStarEnd,
                    mainGameDate: isNonEmptyString(payload.mainGameDate) ? payload.mainGameDate : undefined,
                };
            }
            case 'allstar_vote_result': {
                if (!isNonEmptyString(payload.seasonLabel)) return LEGACY;
                const parsed = parseAllstarRosterPayload(payload);
                if (!parsed) return LEGACY;
                return {
                    kind: 'allstar_vote_result', seasonLabel: payload.seasonLabel,
                    east: parsed.east, west: parsed.west, risingStars: parsed.risingStars,
                    allStarStart: isNonEmptyString(payload.allStarStart) ? payload.allStarStart : undefined,
                    allStarEnd: isNonEmptyString(payload.allStarEnd) ? payload.allStarEnd : undefined,
                    mainGameDate: isNonEmptyString(payload.mainGameDate) ? payload.mainGameDate : undefined,
                };
            }
            case 'allstar_rising_stars': {
                const parsed = parseAllstarRisingStarsPayload(payload);
                if (!parsed) return LEGACY;
                return { kind: 'allstar_rising_stars', ...parsed };
            }
            case 'allstar_three_point_contest': {
                const parsed = parseAllstarThreePointContestPayload(payload);
                return parsed ?? LEGACY;
            }
            case 'allstar_dunk_contest': {
                const parsed = parseAllstarDunkContestPayload(payload);
                return parsed ?? LEGACY;
            }
            case 'allstar_game_result':
            case 'allstar_rising_stars_result': {
                const parsed = parseAllstarGameResultPayload(payload, type);
                return parsed ?? LEGACY;
            }
            case 'allstar_three_point_contest_result': {
                const parsed = parseAllstarThreePointContestResultPayload(payload);
                return parsed ?? LEGACY;
            }
            case 'allstar_dunk_contest_result': {
                const parsed = parseAllstarDunkContestResultPayload(payload);
                return parsed ?? LEGACY;
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
