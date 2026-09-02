/**
 * leagueEvents.ts — 멀티플레이어 "리그 소식"(League Headlines) 이벤트 감지.
 *
 * ZenGM의 League Headlines를 참고해 도입. 처음엔 대량득점차 경기만 골라 기록했으나
 * [2026-08-30] "전 경기 결과+MVP로 대체" 요청으로 detectBlowout()을 폐지하고
 * detectGameResult()로 교체 — 이제 모든 경기가 무조건 하나씩 기록된다(마진 필터 없음).
 * 개인 활약(detectPlayerFeats)도 "경기당 최고 1명"에서 "자격 있는 선수 전원 각 1건"으로
 * 넓어졌고, 여러 경기에 걸친 선수 연속 기록(detectPlayerStatStreaks)이 새로 추가됐다.
 *
 * 호출부(simRunner.ts)는 이 파일의 감지 함수 결과를 그대로 league_events에 insert하면
 * 된다. 트레이드 이벤트는 respond_trade_offer RPC(SQL) 안에서 직접 insert한다(이 파일과
 * 무관).
 */
import { createClient } from '@supabase/supabase-js';
import type { PlayerBoxScore, ShotEvent } from './types/engine.ts';

// tournamentArchiver.ts와 동일한 패턴 — 라이브러리의 SupabaseClient<...> 제네릭 타입을
// 직접 쓰면 supabaseAdmin.ts의 실제 인스턴스와 제네릭 불일치 에러가 난다(strict:false라
// 런타임엔 무해하지만 tsc 노이즈가 남는다). createClient()의 반환 타입으로 로컬 정의.
type SupabaseClient = ReturnType<typeof createClient>;

// [2026-09-01] payload 구조화 — 클라이언트 뉴스피드 그리드가 헤드라인 문자열 파싱 없이
// 대형 스탯 숫자/팀 슬러그/선수명을 바로 렌더링할 수 있도록 타입별 구조화 필드 추가.
// v(버전)/headline은 이 파일이 아니라 삽입 지점(simRunner.ts)에서 한 번만 봉투로 붙인다
// (반환 지점이 6곳이라 여기서 반복하면 번거로움). 클라이언트 미러: services/multi/leagueEventPayload.ts
export interface GameResultPayload {
    homeSlug: string; awaySlug: string; homeScore: number; awayScore: number; margin: number;
    mvpHome?: { playerId: string; name: string; position?: string; stats: { label: string; value: number }[] };
    mvpAway?: { playerId: string; name: string; position?: string; stats: { label: string; value: number }[] };
    /** [2026-09-01] margin≤CLOSE_GAME_MARGIN(초박빙 경기) — 뉴스피드 "특이케이스" 판정용. */
    closeGame?: boolean;
    /** 승부를 결정지은 마지막 슛이 종료 직전 BUZZER_BEATER_SECONDS초 이내였을 때만 채워짐. */
    buzzerBeater?: { playerId: string; name: string; teamSlug: string; points: number; secondsLeft: number };
}
export interface PlayerFeatPayload {
    featKind: 'triple_double' | 'double_double' | 'stat_explosion';
    player: { id: string; name: string };
    teamSlug: string;
    opponentSlug: string;
    stats: { key: string; label: string; value: number }[];
    /** [2026-09-01] 이 활약이 나온 경기의 최종 스코어 — 뉴스피드 카드의 미니 박스스코어용
     * (기사체 blurb를 우선 노출하는 레이아웃으로 바뀌며 "이 경기 결과"를 함께 보여줘야 함). */
    homeSlug: string; awaySlug: string; homeScore: number; awayScore: number;
}
export interface PlayerStreakPayload {
    player: { id: string; name: string };
    teamSlug: string;
    opponentSlug: string;
    /** [2026-09-01] 단수 streak → 복수 streaks로 변경 — 한 선수가 같은 경기에서 여러
     * 규칙(예: 20+득점 연속 + 10+리바운드 연속)을 동시에 만족하면 이벤트를 여러 건이 아니라
     * 하나로 묶어서 배열에 전부 담는다(detectPlayerStatStreaks 참고).
     * [2026-09-02] 각 규칙에 games 배열 추가 — 그 연속기록을 구성하는 경기들(최신순, win_streak의
     * WinStreakPayload.games와 동일한 패턴). statValue는 그 경기에서 이 선수의 해당 스탯
     * (statKey) 실측치 — 팀 전체 MVP가 아니라 이 선수 개인의 박스스코어 한 줄이라 win_streak의
     * mvp 필드와 달리 그냥 숫자 하나(카드가 "N PTS"처럼 라벨을 직접 붙임). */
    streaks: {
        ruleKey: string; statKey: string; min: number; count: number; label: string;
        games: { gameId: string; gameDate: string; homeSlug: string; awaySlug: string; homeScore: number; awayScore: number; statValue: number }[];
    }[];
    /** 연속기록이 갱신(보고 기준 도달)된 바로 그 경기의 최종 스코어. */
    homeSlug: string; awaySlug: string; homeScore: number; awayScore: number;
}
export interface WinStreakPayload {
    teamSlug: string;
    streak: number;
    /** [2026-09-01] 레터 디자인(팀 연승 뉴스 재설계) 요청 — 연승을 구성하는 경기들을
     * 최신순으로 나열. 각 경기의 MVP는 연승 중인 팀 자신의 박스에서만 선정(그 경기 전체
     * MVP가 아니라 "이 팀의 그날 최고 활약"). */
    games: {
        gameId: string;
        gameDate: string;
        homeSlug: string; awaySlug: string; homeScore: number; awayScore: number;
        mvp?: { playerId: string; name: string; stats: { label: string; value: number }[] };
    }[];
}
export type LeagueEventPayloadData = GameResultPayload | PlayerFeatPayload | PlayerStreakPayload | WinStreakPayload;

export interface DetectedEvent {
    type: 'game_result' | 'player_feat' | 'player_streak' | 'win_streak';
    headline: string;
    score: number;
    teamIds: string[];
    playerIds: string[];
    payload: LeagueEventPayloadData;
}

// ── 경기 결과 + 최우수선수 ────────────────────────────────────────────────────
// [2026-08-30] 클라이언트 services/multi/gameLeadersCache.ts의 bestFromBox()와 동일
// 로직을 서버용으로 이식(클라이언트/서버 미러 쌍) — PIE 최댓값 선수 + 두드러진 대표
// 스탯(최대 5개, 임계값 미만 제외).
function pieRaw(p: PlayerBoxScore): number {
    return p.pts + p.fgm + p.ftm - p.fga - p.fta + p.defReb + p.offReb / 2 + p.ast + p.stl + p.blk / 2 - p.pf - p.tov;
}

const MVP_STAT_CANDIDATES: { key: 'pts' | 'reb' | 'ast' | 'stl' | 'blk'; label: string; threshold: number }[] = [
    { key: 'pts', label: 'PTS', threshold: 10 },
    { key: 'reb', label: 'REB', threshold: 5 },
    { key: 'ast', label: 'AST', threshold: 5 },
    { key: 'stl', label: 'STL', threshold: 2 },
    { key: 'blk', label: 'BLK', threshold: 2 },
];

interface GameMvpLite { playerId: string; name: string; position?: string; stats: { label: string; value: number }[] }

// [2026-09-01] 통합(양팀 concat) 1명 선정 → 팀별 1명씩으로 분리 — 뉴스피드 카드가 팀당
// 리더 한 줄씩(스크린샷 레퍼런스) 보여줘야 해서. 로직 자체는 그대로(pieRaw 최댓값 + 대표
// 스탯 최대 5개), 호출부(detectGameResult)가 homeBox/awayBox를 따로 넘기기만 하면 됨.
// 클라이언트 미러: services/multi/gameLeadersCache.ts의 bestFromBox() — 그쪽은 이미
// mvpHome/mvpAway로 나뉘어 있었고(MultiScheduleView.tsx가 사용 중), 여기가 뒤늦게 따라감.
function pickTeamMvp(box: PlayerBoxScore[] | null | undefined): GameMvpLite | undefined {
    if (!box || box.length === 0) return undefined;

    let best = box[0];
    let bestScore = pieRaw(best);
    for (let i = 1; i < box.length; i++) {
        const score = pieRaw(box[i]);
        if (score > bestScore) { best = box[i]; bestScore = score; }
    }

    const stats = MVP_STAT_CANDIDATES
        .map(c => ({ label: c.label, value: best[c.key], threshold: c.threshold }))
        .filter(s => s.value >= s.threshold)
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)
        .map(({ label, value }) => ({ label, value }));

    return { playerId: best.playerId, name: best.playerName, position: best.position, stats };
}

// [2026-09-01] "특이케이스" 1차분 — 초박빙 경기(마진)와 버저비터(마지막 성공 슛의 시점).
// 시리즈 클린치/플레이오프 진출-탈락은 리그 전체 순위표+잔여일정 조회가 새로 필요해서
// 다음 단계로 미룸(초박빙/버저비터는 이미 simRunner.ts가 갖고 있는 데이터만으로 충분).
const CLOSE_GAME_MARGIN = 3;
const BUZZER_BEATER_SECONDS = 10;

interface BuzzerBeaterInfo { playerId: string; name: string; teamSlug: string; points: number; secondsLeft: number }

// pbpShotEvents(시간순)의 마지막 성공 슛이 종료 직전 BUZZER_BEATER_SECONDS초 이내였고,
// 그 슛의 득점이 최종 마진 이상(=이 슛이 없었으면 결과가 달랐거나 최소 동점이었을 상황)이며,
// 슛을 넣은 팀이 실제 승리팀일 때만 "버저비터"로 인정한다. 자유투는 ShotEvent에 안 남아서
// (필드골만 기록) 자유투로 끝난 경기는 이 함수가 못 잡는다 — "버저비터"라는 이름 자체가
// 슛(field goal)을 전제하므로 의미상으로도 자연스러운 누락.
function detectBuzzerBeater(
    shotEvents: ShotEvent[] | null | undefined,
    homeTeamSlug: string, awayTeamSlug: string,
    homeScore: number, awayScore: number,
): BuzzerBeaterInfo | undefined {
    if (!shotEvents || shotEvents.length === 0) return undefined;

    let lastMake: ShotEvent | undefined;
    for (let i = shotEvents.length - 1; i >= 0; i--) {
        if (shotEvents[i].isMake) { lastMake = shotEvents[i]; break; }
    }
    if (!lastMake || lastMake.gameClock > BUZZER_BEATER_SECONDS) return undefined;

    const points = lastMake.points ?? 0;
    if (points <= 0) return undefined;

    const margin = Math.abs(homeScore - awayScore);
    if (margin > points) return undefined; // 이 슛의 득점보다 최종 마진이 크면 이미 결정 난 경기였다는 뜻

    const winnerTeamSlug = homeScore > awayScore ? homeTeamSlug : awayTeamSlug;
    if (lastMake.teamId !== winnerTeamSlug) return undefined; // 패배팀의 막판 슛은 승부와 무관

    return { playerId: lastMake.playerId, name: lastMake.playerName ?? '', teamSlug: lastMake.teamId, points, secondsLeft: lastMake.gameClock };
}

// 경기 결과 — 마진과 무관하게 항상 1건 기록(옛 detectBlowout의 20점 필터 폐지).
export function detectGameResult(
    homeTeamName: string, awayTeamName: string,
    homeTeamSlug: string, awayTeamSlug: string,
    homeScore: number, awayScore: number,
    homeBox: PlayerBoxScore[] | null | undefined,
    awayBox: PlayerBoxScore[] | null | undefined,
    shotEvents: ShotEvent[] | null | undefined,
): DetectedEvent {
    const margin = Math.abs(homeScore - awayScore);
    const homeWon = homeScore > awayScore;
    const winnerName = homeWon ? homeTeamName : awayTeamName;
    const loserName = homeWon ? awayTeamName : homeTeamName;
    const winnerScore = Math.max(homeScore, awayScore);
    const loserScore = Math.min(homeScore, awayScore);

    const mvpHome = pickTeamMvp(homeBox);
    const mvpAway = pickTeamMvp(awayBox);

    const closeGame = margin <= CLOSE_GAME_MARGIN;
    const buzzerBeater = detectBuzzerBeater(shotEvents, homeTeamSlug, awayTeamSlug, homeScore, awayScore);

    return {
        type: 'game_result',
        headline: `${winnerName}, ${loserName}에게 ${winnerScore}-${loserScore} 승리`,
        score: 10 + (margin >= 20 ? 5 : 0) + (margin >= 30 ? 5 : 0) + (closeGame ? 5 : 0) + (buzzerBeater ? 10 : 0),
        teamIds: [homeTeamSlug, awayTeamSlug],
        playerIds: [mvpHome?.playerId, mvpAway?.playerId].filter((id): id is string => !!id),
        payload: {
            homeSlug: homeTeamSlug, awaySlug: awayTeamSlug, homeScore, awayScore, margin,
            mvpHome: mvpHome ? { playerId: mvpHome.playerId, name: mvpHome.name, position: mvpHome.position, stats: mvpHome.stats } : undefined,
            mvpAway: mvpAway ? { playerId: mvpAway.playerId, name: mvpAway.name, position: mvpAway.position, stats: mvpAway.stats } : undefined,
            closeGame: closeGame || undefined,
            buzzerBeater,
        },
    };
}

// ── 개인 활약(한 경기 안에서 완결) ────────────────────────────────────────────
const CORE_CATEGORIES: ('pts' | 'reb' | 'ast' | 'stl' | 'blk')[] = ['pts', 'reb', 'ast', 'stl', 'blk'];
const CORE_LABELS: Record<string, string> = { pts: '득점', reb: '리바운드', ast: '어시스트', stl: '스틸', blk: '블락' };
const CORE_THRESHOLD = 10;

function countCoreCategoriesAtLeast(p: PlayerBoxScore): number {
    return CORE_CATEGORIES.filter(k => p[k] >= CORE_THRESHOLD).length;
}

// [2026-09-01] "더블더블 뉴스가 너무 자주 뜬다" — 포지션별로 세분화. PF/C(빅맨)는
// 득점+리바운드 조합만 10-10에서 20-10으로 상향(10-10은 빅맨에게 흔한 조합이라). 득점+
// 어시스트, 그리고 스틸/블락이 포함되는 모든 조합(포지션 불문)은 기존처럼 10-10 유지 —
// 즉 득점의 "파트너"가 리바운드뿐일 때만(어시스트/스틸/블락 중 어느 것도 자격을 못 채웠을
// 때) 득점 문턱을 20으로 올린다. 가드(PG/SG/SF)는 모든 조합에서 기존 10-10 그대로(가드가
// 10리바/10어시를 채우는 일 자체가 드묾). 트리플더블(coreCount>=3, 바로 아래
// evaluatePlayerFeat의 첫 분기) 판정은 이번 변경 범위 밖 — 기존 표준 CORE_THRESHOLD 그대로.
function isBigPosition(position: string | undefined): boolean {
    return position === 'PF' || position === 'C';
}

function determineDoubleDoubleHits(p: PlayerBoxScore): ('pts' | 'reb' | 'ast' | 'stl' | 'blk')[] | null {
    const reb10 = p.reb >= CORE_THRESHOLD;
    const ast10 = p.ast >= CORE_THRESHOLD;
    const stl10 = p.stl >= CORE_THRESHOLD;
    const blk10 = p.blk >= CORE_THRESHOLD;
    const ptsThreshold = isBigPosition(p.position) && !ast10 && !stl10 && !blk10 ? 20 : CORE_THRESHOLD;
    const pts10 = p.pts >= ptsThreshold;

    const hits: ('pts' | 'reb' | 'ast' | 'stl' | 'blk')[] = [];
    if (pts10) hits.push('pts');
    if (reb10) hits.push('reb');
    if (ast10) hits.push('ast');
    if (stl10) hits.push('stl');
    if (blk10) hits.push('blk');
    return hits.length >= 2 ? hits : null;
}

// 개인 기준치 — 트리플더블/더블더블에 해당 안 될 때만 검사. 각 항목 최소치 이상이면
// 자격, 실제 값을 그대로 표시(표시 단위는 등급 매기기 = score 계산용).
// [2026-09-01] "스탯 폭발 임계도 상향" — 득점 30/step10 → 35/step5(더 촘촘하게 등급
// 매김), 3점 7개 → 6개. 나머지(리바운드/어시스트/스틸/블락)는 그대로.
const TIER_RULES: { key: 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'p3m'; min: number; step: number; label: string }[] = [
    { key: 'pts', min: 35, step: 5, label: '득점' },
    { key: 'reb', min: 15, step: 5, label: '리바운드' },
    { key: 'ast', min: 10, step: 5, label: '어시스트' },
    { key: 'stl', min: 5, step: 1, label: '스틸' },
    { key: 'blk', min: 5, step: 1, label: '블락' },
    { key: 'p3m', min: 6, step: 1, label: '3점' },
];

// [2026-09-01] teamSlug/opponentSlug 파라미터 추가 — 예전엔 박스스코어에 팀 정보가 없어
// teamIds를 빈 배열로 남겼는데(뉴스피드에서 "어느 팀 선수인지" 표시 불가 + involvesMyTeam
// 강조 무효), 호출부(detectPlayerFeats)가 home/away를 각각 알고 있으므로 그대로 흘려보냄.
// 상대팀은 payload.opponentSlug에만 넣고 teamIds엔 본인 팀만 — 상대팀까지 넣으면 내 팀
// 경기의 모든 활약에 involvesMyTeam이 걸려 강조가 무의미해진다.
function evaluatePlayerFeat(
    p: PlayerBoxScore, teamSlug: string, opponentSlug: string,
    homeTeamSlug: string, awayTeamSlug: string, homeScore: number, awayScore: number,
): DetectedEvent | null {
    const coreCount = countCoreCategoriesAtLeast(p);
    const gameInfo = { homeSlug: homeTeamSlug, awaySlug: awayTeamSlug, homeScore, awayScore };

    if (coreCount >= 3) {
        return {
            type: 'player_feat',
            headline: `${p.playerName}, 트리플더블(${p.pts}득점-${p.reb}리바운드-${p.ast}어시스트) 달성`,
            score: 25,
            teamIds: [teamSlug],
            playerIds: [p.playerId],
            payload: {
                featKind: 'triple_double',
                player: { id: p.playerId, name: p.playerName },
                teamSlug, opponentSlug,
                stats: [
                    { key: 'pts', label: '득점', value: p.pts },
                    { key: 'reb', label: '리바운드', value: p.reb },
                    { key: 'ast', label: '어시스트', value: p.ast },
                ],
                ...gameInfo,
            },
        };
    }

    const doubleDoubleHits = determineDoubleDoubleHits(p);
    if (doubleDoubleHits) {
        const desc = doubleDoubleHits.map(k => `${p[k]}${CORE_LABELS[k]}`).join('-');
        return {
            type: 'player_feat',
            headline: `${p.playerName}, 더블더블(${desc}) 달성`,
            score: 15,
            teamIds: [teamSlug],
            playerIds: [p.playerId],
            payload: {
                featKind: 'double_double',
                player: { id: p.playerId, name: p.playerName },
                teamSlug, opponentSlug,
                stats: doubleDoubleHits.map(k => ({ key: k, label: CORE_LABELS[k], value: p[k] })),
                ...gameInfo,
            },
        };
    }

    const hits = TIER_RULES.filter(r => p[r.key] >= r.min);
    if (hits.length === 0) return null;

    const desc = hits.map(h => h.label === '3점' ? `3점 ${p[h.key]}개` : `${p[h.key]}${h.label}`).join('-');
    const bonus = hits.reduce((sum, h) => sum + Math.min(3, Math.floor((p[h.key] - h.min) / h.step)) * 2, 0);

    return {
        type: 'player_feat',
        headline: `${p.playerName}, ${desc} ${hits.length > 1 ? '맹활약' : '폭발'}`,
        score: Math.min(30, 15 + bonus),
        teamIds: [teamSlug],
        playerIds: [p.playerId],
        payload: {
            featKind: 'stat_explosion',
            player: { id: p.playerId, name: p.playerName },
            teamSlug, opponentSlug,
            stats: hits.map(h => ({ key: h.key, label: h.label, value: p[h.key] })),
            ...gameInfo,
        },
    };
}

// 경기당 최고 1명이 아니라, 자격 있는 선수마다 각각 1건씩 반환. home/away를 concat하지 않고
// 각자 순회 — 선수마다 본인 팀/상대팀 슬러그를 정확히 붙이기 위함(위 주석 참고).
export function detectPlayerFeats(
    homeBox: PlayerBoxScore[] | null | undefined,
    awayBox: PlayerBoxScore[] | null | undefined,
    homeTeamSlug: string,
    awayTeamSlug: string,
    homeScore: number,
    awayScore: number,
): DetectedEvent[] {
    const events: DetectedEvent[] = [];
    for (const p of homeBox ?? []) {
        const ev = evaluatePlayerFeat(p, homeTeamSlug, awayTeamSlug, homeTeamSlug, awayTeamSlug, homeScore, awayScore);
        if (ev) events.push(ev);
    }
    for (const p of awayBox ?? []) {
        const ev = evaluatePlayerFeat(p, awayTeamSlug, homeTeamSlug, homeTeamSlug, awayTeamSlug, homeScore, awayScore);
        if (ev) events.push(ev);
    }
    return events;
}

// ── 팀 연승 ──────────────────────────────────────────────────────────────────
const WIN_STREAK_THRESHOLD = 5;
const BIG_WIN_STREAK_THRESHOLD = 8;

// games 테이블에서 해당 팀의 최근 경기만 역순으로 스캔(전체 스케줄 스캔 금지).
// recentGames는 이미 "이 팀이 낀 경기, 최신순" 정렬로 넘어온다고 가정(호출부 책임).
// [2026-09-01] "팀 연승" 뉴스를 레터 디자인(개인 활약과 동일한 헤더+본문+경기 리스트)으로
// 재설계하며 async로 전환 — 연승을 구성하는 경기들의 game_id/날짜/그날 그 팀의 MVP까지
// payload에 채워야 해서 games 테이블 조회만으론 부족(스코어까지는 있지만 game_id/날짜/
// 박스스코어는 없음) → 여기서 game_pbp를 한 번 더(배치 조회) 조회한다.
export async function detectWinStreak(
    supabase: SupabaseClient,
    roomId: string,
    teamSlug: string,
    teamName: string,
    recentGames: { game_id: string; game_date: string; home_team_id: string; away_team_id: string; home_score: number | null; away_score: number | null }[],
): Promise<DetectedEvent | null> {
    let streak = 0;
    for (const g of recentGames) {
        if (g.home_score == null || g.away_score == null) break;
        const isHome = g.home_team_id === teamSlug;
        const won = isHome ? g.home_score > g.away_score : g.away_score! > g.home_score!;
        if (!won) break;
        streak += 1;
    }
    if (streak < WIN_STREAK_THRESHOLD) return null;

    const streakGames = recentGames.slice(0, streak);
    const gameIds = streakGames.map(g => g.game_id);
    const { data: pbpRows } = await supabase
        .from('game_pbp')
        .select('game_id, home_team_id, home_box, away_box')
        .eq('room_id', roomId)
        .in('game_id', gameIds);
    const pbpByGameId = new Map<string, any>((pbpRows ?? []).map((r: any) => [r.game_id, r]));

    const games = streakGames.map(g => {
        const pbp = pbpByGameId.get(g.game_id);
        const isHome = g.home_team_id === teamSlug;
        const myBox: PlayerBoxScore[] | undefined = pbp ? (isHome ? pbp.home_box : pbp.away_box) : undefined;
        const mvp = pickTeamMvp(myBox);
        return {
            gameId: g.game_id,
            gameDate: g.game_date,
            homeSlug: g.home_team_id, awaySlug: g.away_team_id,
            homeScore: g.home_score!, awayScore: g.away_score!,
            mvp: mvp ? { playerId: mvp.playerId, name: mvp.name, stats: mvp.stats } : undefined,
        };
    });

    return {
        type: 'win_streak',
        headline: `${teamName}, ${streak}연승 질주`,
        score: streak >= BIG_WIN_STREAK_THRESHOLD ? 25 : 15,
        teamIds: [teamSlug],
        playerIds: [],
        payload: { teamSlug, streak, games },
    };
}

// ── 선수 연속 기록(여러 경기에 걸친 누적 — player_stat_streaks 테이블 필요) ──────
interface StreakCounts {
    pts20?: number; pts30?: number; pts40?: number;
    reb10?: number; ast10?: number; stl5?: number; blk5?: number;
}

const STREAK_RULES: { key: keyof StreakCounts; statKey: 'pts' | 'reb' | 'ast' | 'stl' | 'blk'; min: number; minToReport: number; label: string }[] = [
    { key: 'pts20', statKey: 'pts', min: 20, minToReport: 3, label: '20+득점' },
    { key: 'pts30', statKey: 'pts', min: 30, minToReport: 3, label: '30+득점' },
    { key: 'pts40', statKey: 'pts', min: 40, minToReport: 2, label: '40+득점' },
    { key: 'reb10', statKey: 'reb', min: 10, minToReport: 3, label: '10+리바운드' },
    { key: 'ast10', statKey: 'ast', min: 10, minToReport: 3, label: '10+어시스트' },
    { key: 'stl5', statKey: 'stl', min: 5, minToReport: 3, label: '5+스틸' },
    { key: 'blk5', statKey: 'blk', min: 5, minToReport: 2, label: '5+블락' },
];

// 이번 경기에 실제 출전(g===1 — liveEngine.ts extractSimResult()가 mp>0 기준으로 이미
// 채워주는 필드)한 선수만 갱신한다 — 결장한 선수는 스트릭을 건드리지 않아(리셋도 증가도
// 안 함) "연속 출전 경기" 기준으로 복귀 경기부터 그대로 이어간다.
export async function detectPlayerStatStreaks(
    supabase: SupabaseClient,
    roomId: string,
    homeBox: PlayerBoxScore[] | null | undefined,
    awayBox: PlayerBoxScore[] | null | undefined,
    homeTeamSlug: string,
    awayTeamSlug: string,
    homeScore: number,
    awayScore: number,
): Promise<DetectedEvent[]> {
    // playedPlayers보다 먼저 선언 — 아래에서 각 선수의 팀/상대팀 슬러그를 조회하는 데 쓰임
    // (CLAUDE.md 규칙2: 참조되는 변수는 참조하는 변수보다 먼저 선언).
    const slugByPlayerId = new Map<string, { teamSlug: string; opponentSlug: string }>();
    for (const p of homeBox ?? []) slugByPlayerId.set(p.playerId, { teamSlug: homeTeamSlug, opponentSlug: awayTeamSlug });
    for (const p of awayBox ?? []) slugByPlayerId.set(p.playerId, { teamSlug: awayTeamSlug, opponentSlug: homeTeamSlug });

    const playedPlayers = [...(homeBox ?? []), ...(awayBox ?? [])].filter(p => p.g === 1);
    if (playedPlayers.length === 0) return [];

    const playerIds = playedPlayers.map(p => p.playerId);
    const { data: existingRows } = await supabase
        .from('player_stat_streaks')
        .select('player_id, streaks')
        .eq('room_id', roomId)
        .in('player_id', playerIds);

    const existingByPlayer = new Map<string, StreakCounts>(
        (existingRows ?? []).map((r: any) => [r.player_id, r.streaks ?? {}]),
    );

    const events: DetectedEvent[] = [];
    const upserts: { room_id: string; player_id: string; streaks: StreakCounts }[] = [];

    for (const p of playedPlayers) {
        const prev = existingByPlayer.get(p.playerId) ?? {};
        const next: StreakCounts = {};
        // [2026-09-01] "같은 경기에서 한 선수의 스트릭이 여러 개 겹치면 뉴스가 여러 건
        // 생기는" 문제 수정 요청 — 예전엔 규칙 하나가 minToReport를 넘길 때마다 즉시
        // events.push()했다(규칙 7개 중 여러 개가 동시에 조건을 만족하면 그만큼 이벤트가
        // 중복 생성됨). 이제는 자격 있는 규칙을 먼저 qualifying에 모아두기만 하고, 선수
        // 루프가 끝날 때 하나로 합쳐서 이벤트 1건만 만든다.
        const qualifying: { rule: (typeof STREAK_RULES)[number]; count: number }[] = [];

        for (const rule of STREAK_RULES) {
            const hit = p[rule.statKey] >= rule.min;
            const count = hit ? (prev[rule.key] ?? 0) + 1 : 0;
            next[rule.key] = count;
            if (count >= rule.minToReport) qualifying.push({ rule, count });
        }

        upserts.push({ room_id: roomId, player_id: p.playerId, streaks: next });

        if (qualifying.length === 0) continue;

        // pts20/pts30/pts40처럼 같은 statKey에 여러 임계값이 있는 경우, 한 경기에서 여러
        // 임계값이 동시에 자격을 얻을 수 있다(예: 45점 경기는 세 카운터를 동시에 올림).
        // 하위 임계값(pts20)은 상위 임계값(pts40)에 포함되는 정보라 statKey당 가장 높은
        // min(가장 인상적인 기록)만 남겨 중복 보고를 피한다.
        const bestByStat = new Map<string, { rule: (typeof STREAK_RULES)[number]; count: number }>();
        for (const q of qualifying) {
            const existing = bestByStat.get(q.rule.statKey);
            if (!existing || q.rule.min > existing.rule.min) bestByStat.set(q.rule.statKey, q);
        }
        const merged = [...bestByStat.values()].sort((a, b) => b.count - a.count);

        // playedPlayers가 homeBox/awayBox에서만 뽑히므로 항상 존재.
        const teamInfo = slugByPlayerId.get(p.playerId)!;
        const bestCount = Math.max(...merged.map(m => m.count));

        // [2026-09-02] "연속기록 중인 모든 경기의 결과를 표시할 수 있나" 요청 — detectWinStreak과
        // 동일한 패턴: 이 선수 팀의 최근 경기(가장 긴 규칙의 count만큼)를 가져와 game_pbp를
        // 배치 조회한 뒤, 규칙별로 필요한 만큼만 슬라이스해서 그 경기에서 이 선수의 해당 스탯
        // 실측치를 뽑는다. bestCount가 가장 긴 윈도(여러 규칙이 동시에 있으면 짧은 규칙은
        // 앞부분만 사용).
        const { data: recentGames } = await supabase
            .from('games')
            .select('game_id, game_date, home_team_id, away_team_id, home_score, away_score')
            .eq('room_id', roomId)
            .eq('played', true)
            .or(`home_team_id.eq.${teamInfo.teamSlug},away_team_id.eq.${teamInfo.teamSlug}`)
            .order('game_date', { ascending: false })
            .order('game_seq', { ascending: false })
            .limit(bestCount);
        const streakGames = recentGames ?? [];
        const gameIds = streakGames.map(g => g.game_id);
        const { data: pbpRows } = gameIds.length > 0
            ? await supabase
                .from('game_pbp')
                .select('game_id, home_team_id, home_box, away_box')
                .eq('room_id', roomId)
                .in('game_id', gameIds)
            : { data: [] as any[] };
        const pbpByGameId = new Map<string, any>((pbpRows ?? []).map((r: any) => [r.game_id, r]));

        const gamesForRule = (statKey: string, count: number) => streakGames.slice(0, count).map(g => {
            const pbp = pbpByGameId.get(g.game_id);
            const isHome = g.home_team_id === teamInfo.teamSlug;
            const box: PlayerBoxScore[] | undefined = pbp ? (isHome ? pbp.home_box : pbp.away_box) : undefined;
            const playerBox = box?.find(b => b.playerId === p.playerId);
            const statValue = playerBox ? (playerBox as any)[statKey] as number : 0;
            return {
                gameId: g.game_id, gameDate: g.game_date,
                homeSlug: g.home_team_id, awaySlug: g.away_team_id,
                homeScore: g.home_score!, awayScore: g.away_score!,
                statValue,
            };
        });

        events.push({
            type: 'player_streak',
            headline: `${p.playerName}, ${merged.map(m => `${m.count}경기 연속 ${m.rule.label}`).join(' · ')}`,
            score: Math.min(30, 15 + bestCount),
            teamIds: [teamInfo.teamSlug],
            playerIds: [p.playerId],
            payload: {
                player: { id: p.playerId, name: p.playerName },
                teamSlug: teamInfo.teamSlug,
                opponentSlug: teamInfo.opponentSlug,
                streaks: merged.map(m => ({
                    ruleKey: m.rule.key, statKey: m.rule.statKey, min: m.rule.min, count: m.count, label: m.rule.label,
                    games: gamesForRule(m.rule.statKey, m.count),
                })),
                homeSlug: homeTeamSlug, awaySlug: awayTeamSlug, homeScore, awayScore,
            },
        });
    }

    if (upserts.length > 0) {
        await supabase.from('player_stat_streaks').upsert(upserts, { onConflict: 'room_id,player_id' });
    }

    return events;
}
