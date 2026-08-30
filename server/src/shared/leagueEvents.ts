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
import type { PlayerBoxScore } from './types/engine.ts';

// tournamentArchiver.ts와 동일한 패턴 — 라이브러리의 SupabaseClient<...> 제네릭 타입을
// 직접 쓰면 supabaseAdmin.ts의 실제 인스턴스와 제네릭 불일치 에러가 난다(strict:false라
// 런타임엔 무해하지만 tsc 노이즈가 남는다). createClient()의 반환 타입으로 로컬 정의.
type SupabaseClient = ReturnType<typeof createClient>;

export interface DetectedEvent {
    type: 'game_result' | 'player_feat' | 'player_streak' | 'win_streak';
    headline: string;
    score: number;
    teamIds: string[];
    playerIds: string[];
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

interface GameMvpLite { playerId: string; name: string; stats: { label: string; value: number }[] }

function pickGameMvp(homeBox: PlayerBoxScore[] | null | undefined, awayBox: PlayerBoxScore[] | null | undefined): GameMvpLite | undefined {
    const box = [...(homeBox ?? []), ...(awayBox ?? [])];
    if (box.length === 0) return undefined;

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

    return { playerId: best.playerId, name: best.playerName, stats };
}

// 경기 결과 — 마진과 무관하게 항상 1건 기록(옛 detectBlowout의 20점 필터 폐지).
export function detectGameResult(
    homeTeamName: string, awayTeamName: string,
    homeTeamSlug: string, awayTeamSlug: string,
    homeScore: number, awayScore: number,
    homeBox: PlayerBoxScore[] | null | undefined,
    awayBox: PlayerBoxScore[] | null | undefined,
): DetectedEvent {
    const margin = Math.abs(homeScore - awayScore);
    const homeWon = homeScore > awayScore;
    const winnerName = homeWon ? homeTeamName : awayTeamName;
    const loserName = homeWon ? awayTeamName : homeTeamName;
    const winnerScore = Math.max(homeScore, awayScore);
    const loserScore = Math.min(homeScore, awayScore);

    const mvp = pickGameMvp(homeBox, awayBox);
    const mvpText = mvp
        ? ` (MVP: ${mvp.name}${mvp.stats.length > 0 ? ' ' + mvp.stats.map(s => `${s.value} ${s.label}`).join(', ') : ''})`
        : '';

    return {
        type: 'game_result',
        headline: `${winnerName}, ${loserName}에게 ${winnerScore}-${loserScore} 승리${mvpText}`,
        score: 10 + (margin >= 20 ? 5 : 0) + (margin >= 30 ? 5 : 0),
        teamIds: [homeTeamSlug, awayTeamSlug],
        playerIds: mvp ? [mvp.playerId] : [],
    };
}

// ── 개인 활약(한 경기 안에서 완결) ────────────────────────────────────────────
const CORE_CATEGORIES: ('pts' | 'reb' | 'ast' | 'stl' | 'blk')[] = ['pts', 'reb', 'ast', 'stl', 'blk'];
const CORE_LABELS: Record<string, string> = { pts: '득점', reb: '리바운드', ast: '어시스트', stl: '스틸', blk: '블락' };
const CORE_THRESHOLD = 10;

function countCoreCategoriesAtLeast(p: PlayerBoxScore): number {
    return CORE_CATEGORIES.filter(k => p[k] >= CORE_THRESHOLD).length;
}

// 개인 기준치 — 트리플더블/더블더블에 해당 안 될 때만 검사. 각 항목 최소치 이상이면
// 자격, 실제 값을 그대로 표시(표시 단위는 등급 매기기 = score 계산용).
const TIER_RULES: { key: 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'p3m'; min: number; step: number; label: string }[] = [
    { key: 'pts', min: 30, step: 10, label: '득점' },
    { key: 'reb', min: 15, step: 5, label: '리바운드' },
    { key: 'ast', min: 10, step: 5, label: '어시스트' },
    { key: 'stl', min: 5, step: 1, label: '스틸' },
    { key: 'blk', min: 5, step: 1, label: '블락' },
    { key: 'p3m', min: 7, step: 1, label: '3점' },
];

function evaluatePlayerFeat(p: PlayerBoxScore): DetectedEvent | null {
    const coreCount = countCoreCategoriesAtLeast(p);

    if (coreCount >= 3) {
        return {
            type: 'player_feat',
            headline: `${p.playerName}, 트리플더블(${p.pts}득점-${p.reb}리바운드-${p.ast}어시스트) 달성`,
            score: 25,
            teamIds: [],
            playerIds: [p.playerId],
        };
    }

    if (coreCount >= 2) {
        const desc = CORE_CATEGORIES
            .filter(k => p[k] >= CORE_THRESHOLD)
            .map(k => `${p[k]}${CORE_LABELS[k]}`)
            .join('-');
        return {
            type: 'player_feat',
            headline: `${p.playerName}, 더블더블(${desc}) 달성`,
            score: 15,
            teamIds: [],
            playerIds: [p.playerId],
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
        teamIds: [],
        playerIds: [p.playerId],
    };
}

// 경기당 최고 1명이 아니라, 자격 있는 선수마다 각각 1건씩 반환.
export function detectPlayerFeats(
    homeBox: PlayerBoxScore[] | null | undefined,
    awayBox: PlayerBoxScore[] | null | undefined,
): DetectedEvent[] {
    const all = [...(homeBox ?? []), ...(awayBox ?? [])];
    const events: DetectedEvent[] = [];
    for (const p of all) {
        const ev = evaluatePlayerFeat(p);
        if (ev) events.push(ev);
    }
    return events;
}

// ── 팀 연승 ──────────────────────────────────────────────────────────────────
const WIN_STREAK_THRESHOLD = 5;
const BIG_WIN_STREAK_THRESHOLD = 8;

// games 테이블에서 해당 팀의 최근 경기만 역순으로 스캔(전체 스케줄 스캔 금지).
// recentGames는 이미 "이 팀이 낀 경기, 최신순" 정렬로 넘어온다고 가정(호출부 책임).
export function detectWinStreak(
    teamSlug: string,
    teamName: string,
    recentGames: { home_team_id: string; away_team_id: string; home_score: number | null; away_score: number | null }[],
): DetectedEvent | null {
    let streak = 0;
    for (const g of recentGames) {
        if (g.home_score == null || g.away_score == null) break;
        const isHome = g.home_team_id === teamSlug;
        const won = isHome ? g.home_score > g.away_score : g.away_score! > g.home_score!;
        if (!won) break;
        streak += 1;
    }
    if (streak < WIN_STREAK_THRESHOLD) return null;

    return {
        type: 'win_streak',
        headline: `${teamName}, ${streak}연승 질주`,
        score: streak >= BIG_WIN_STREAK_THRESHOLD ? 25 : 15,
        teamIds: [teamSlug],
        playerIds: [],
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
): Promise<DetectedEvent[]> {
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

        for (const rule of STREAK_RULES) {
            const hit = p[rule.statKey] >= rule.min;
            const count = hit ? (prev[rule.key] ?? 0) + 1 : 0;
            next[rule.key] = count;

            if (count >= rule.minToReport) {
                events.push({
                    type: 'player_streak',
                    headline: `${p.playerName}, ${count}경기 연속 ${rule.label}`,
                    score: Math.min(30, 15 + count),
                    teamIds: [],
                    playerIds: [p.playerId],
                });
            }
        }

        upserts.push({ room_id: roomId, player_id: p.playerId, streaks: next });
    }

    if (upserts.length > 0) {
        await supabase.from('player_stat_streaks').upsert(upserts, { onConflict: 'room_id,player_id' });
    }

    return events;
}
