
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

export interface PlayerStreakDetail {
    kind: 'player_streak';
    player: { id: string; name: string };
    teamSlug: string;
    opponentSlug: string;
    /** [2026-09-01] 단수 streak → 복수 streaks — 한 경기에서 여러 규칙(20+득점 연속 +
     * 10+리바운드 연속 등)이 동시에 자격을 얻으면 이벤트 여러 건이 아니라 하나로 묶어
     * 배열에 전부 담는다(server/src/shared/leagueEvents.ts 미러). */
    streaks: { ruleKey: string; statKey: string; min: number; count: number; label: string }[];
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

export type LeagueEventDetail =
    | GameResultDetail
    | PlayerFeatDetail
    | PlayerStreakDetail
    | WinStreakDetail
    | TradeDetail
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

type StreakEntry = { ruleKey: string; statKey: string; min: number; count: number; label: string };

function parseStreakEntry(raw: any): StreakEntry | undefined {
    if (!raw || !isNonEmptyString(raw.ruleKey) || !isNonEmptyString(raw.statKey) || !isNonEmptyString(raw.label)) return undefined;
    if (typeof raw.min !== 'number' || typeof raw.count !== 'number') return undefined;
    return { ruleKey: raw.ruleKey, statKey: raw.statKey, min: raw.min, count: raw.count, label: raw.label };
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
            default:
                return LEGACY;
        }
    } catch {
        return LEGACY;
    }
}
