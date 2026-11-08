/**
 * pointsAllStar.ts — 올스타 BP 정산: 올스타 선정·MVP·콘테스트 결과로 소속 유저 팀에 지급 (2026-11-08).
 * 계획: docs/plan/points-system-plan.md "올스타 보상", 상수: shared/points/allStarRewards.ts
 *
 * scheduler tick 마다 진행 중 main_league 방의 league_events 중 type 'allstar_*' 이고 points_settled_at 이 null 인 행을 처리한다.
 *   allstar_vote_result          → 올스타 선발 50 / 리저브 30 (명단: league_allstar_votes.roster 스냅샷, 없으면 payload)
 *   allstar_rising_stars         → 라이징스타 선정 20
 *   allstar_game_result          → 올스타전 MVP 소속팀 100   (game_id 공개 시각 이후에만)
 *   allstar_rising_stars_result  → 라이징스타 MVP 소속팀 50  (동일)
 *   allstar_three_point_contest / allstar_dunk_contest           → 참가 선수당 10
 *   allstar_three_point_contest_result / allstar_dunk_contest_result → 우승자 소속팀 60
 * 소속 = 명단·payload 의 teamSlug(발표 시점 스냅샷). 소유자 = league_teams.user_id(AI 아님) + room_members.joined_at <= 이벤트 created_at.
 * 처리가 전부 성공(또는 이미 지급)하면 points_settled_at 을 찍는다. 공개 전이거나 실패하면 null 로 남겨 다음 tick 재시도.
 * 원장 키 allstar:{league}:{season}:{kind}:{player}:{user} — 재실행에 안전.
 */
import { supabase } from './supabaseAdmin.ts';
import { getRoomReplayMs } from './replayConfig.ts';
import { replayLengthMs } from './liveGameView.ts';
import { grantPoints } from './points.ts';
import { ALLSTAR_BONUS, allStarKey, type AllStarEventKind } from './shared/points/allStarRewards.ts';
import { FINALS_MVP_BONUS, SEASON_AWARD_TYPES, seasonAwardBonus, seasonAwardKey } from './shared/points/seasonAwardRewards.ts';
import { unlockAchievement } from './pointsAchievements.ts';

// [2026-11-08] 시즌 어워드도 같은 표식(points_settled_at)·같은 루프로 처리 — mvp_award/dpoy_award 는 같은 배치에서 생기므로
// 둘 중 어느 쪽이 먼저 와도 그 시즌 league_player_awards 전체를 읽어 지급한다(키로 중복 차단). finals_mvp 는 파이널 경기 공개 이후.
const ALLSTAR_TYPES = [
    'allstar_vote_result', 'allstar_rising_stars', 'allstar_game_result', 'allstar_rising_stars_result',
    'allstar_three_point_contest', 'allstar_three_point_contest_result',
    'allstar_dunk_contest', 'allstar_dunk_contest_result',
    'mvp_award', 'dpoy_award', 'finals_mvp',
];

interface EventRow {
    id: string;
    room_id: string;
    league_id: string;
    season_number: number | null;
    type: string;
    game_id: string | null;
    payload: any;
    created_at: string;
}

interface OwnerInfo { userId: string; joinedAtMs: number }
interface RosterPlayer { playerId: string; teamSlug: string }

interface Ctx {
    leagueId: string;
    roomId: string;
    season: number;
    owners: Map<string, OwnerInfo>;
    /** 이 시즌 올스타 명단 스냅샷(선수 → 팀) — MVP 소속 판정용 */
    roster: { starters: RosterPlayer[]; reserves: RosterPlayer[]; rising: RosterPlayer[] } | null;
}

export async function runAllStarPointSettlements(): Promise<void> {
    const { data: leagues, error } = await supabase
        .from('leagues').select('id').eq('type', 'main_league').eq('status', 'in_progress');
    if (error) { console.error('[points:allstar] leagues 조회 실패:', error.message); return; }
    for (const l of leagues ?? []) {
        try { await settleLeague(l.id as string); }
        catch (err) { console.error(`[points:allstar] league=${l.id} 처리 실패:`, err); }
    }
}

async function settleLeague(leagueId: string): Promise<void> {
    const { data: events, error } = await supabase
        .from('league_events')
        .select('id, room_id, league_id, season_number, type, game_id, payload, created_at')
        .eq('league_id', leagueId)
        .in('type', ALLSTAR_TYPES)
        .is('points_settled_at', null)
        .order('created_at', { ascending: true })
        .limit(50);
    if (error) { console.error(`[points:allstar] league=${leagueId} events 조회 실패:`, error.message); return; }
    if (!events?.length) return;

    const roomId = (events[0] as EventRow).room_id;
    const season = (events[0] as EventRow).season_number ?? 1;
    const ctx: Ctx = { leagueId, roomId, season, owners: await loadOwners(roomId), roster: await loadRoster(roomId, season) };

    for (const ev of events as EventRow[]) {
        const done = await settleEvent(ctx, ev);
        if (done) {
            await supabase.from('league_events').update({ points_settled_at: new Date().toISOString() }).eq('id', ev.id);
        }
    }
}

/** 이벤트 1건 처리. true = 완료(표식 찍기), false = 보류(공개 전·실패 → 다음 tick). */
async function settleEvent(ctx: Ctx, ev: EventRow): Promise<boolean> {
    const atMs = Date.parse(ev.created_at);
    const p = ev.payload ?? {};
    switch (ev.type) {
        case 'allstar_vote_result': {
            const starters = ctx.roster?.starters.length ? ctx.roster.starters : extractConfList(p, 'starters');
            const reserves = ctx.roster?.reserves.length ? ctx.roster.reserves : extractConfList(p, 'reserves');
            return (await grantMany(ctx, ev, 'starter', starters, atMs)) && (await grantMany(ctx, ev, 'reserve', reserves, atMs));
        }
        case 'allstar_rising_stars': {
            const list = ctx.roster?.rising.length ? ctx.roster.rising : [...toPlayers(p.teamA), ...toPlayers(p.teamB)];
            return grantMany(ctx, ev, 'rising', list, atMs);
        }
        case 'allstar_game_result':
        case 'allstar_rising_stars_result': {
            if (!(await isGameRevealed(ctx.roomId, ev.game_id))) return false;
            const mvpId = p.mvp?.playerId as string | undefined;
            if (!mvpId) return true;
            const pool = ev.type === 'allstar_game_result'
                ? [...(ctx.roster?.starters ?? []), ...(ctx.roster?.reserves ?? [])]
                : (ctx.roster?.rising ?? []);
            const hit = pool.find(x => x.playerId === mvpId);
            if (!hit) { console.warn(`[points:allstar] ${ev.type} MVP ${mvpId} 소속 미확인 — 건너뜀`); return true; }
            return grantMany(ctx, ev, ev.type === 'allstar_game_result' ? 'asg_mvp' : 'rs_mvp', [hit], atMs);
        }
        case 'allstar_three_point_contest':
        case 'allstar_dunk_contest':
            return grantMany(ctx, ev, ev.type.includes('three') ? 'three_entry' : 'dunk_entry', toPlayers(p.participants), atMs);
        case 'allstar_three_point_contest_result':
        case 'allstar_dunk_contest_result': {
            const winnerId = p.winnerId as string | undefined;
            if (!winnerId) return true;
            const entrants = [...toPlayers(p.round1), ...toPlayers(p.round2)];
            const hit = entrants.find(x => x.playerId === winnerId);
            if (!hit) { console.warn(`[points:allstar] ${ev.type} 우승자 ${winnerId} 소속 미확인 — 건너뜀`); return true; }
            return grantMany(ctx, ev, ev.type.includes('three') ? 'three_win' : 'dunk_win', [hit], atMs);
        }
        case 'mvp_award':
        case 'dpoy_award':
            return settleSeasonAwards(ctx, ev, atMs);
        case 'finals_mvp': {
            if (!(await isGameRevealed(ctx.roomId, ev.game_id))) return false;
            const playerId = p.playerId as string | undefined;
            const teamSlug = p.teamSlug as string | undefined;
            if (!playerId || !teamSlug) return true;
            const owner = ctx.owners.get(teamSlug);
            if (!owner || owner.joinedAtMs > atMs) return true;
            const res = await grantPoints({
                userId: owner.userId, amount: FINALS_MVP_BONUS, source: 'season_daily',
                idempotencyKey: seasonAwardKey(ctx.leagueId, ctx.season, 'FINALS_MVP', 1, playerId, owner.userId),
                refType: 'season_award', refId: ev.id,
                meta: { league_id: ctx.leagueId, season: ctx.season, event: 'finals_mvp', award_type: 'FINALS_MVP', rank: 1, player_id: playerId, team: teamSlug },
            });
            if (res.ok) await unlockAchievement(owner.userId, 'finals_mvp', { league_id: ctx.leagueId, season: ctx.season, player_id: playerId, team: teamSlug });
            return res.ok;
        }
        default:
            return true;
    }
}

/** 그 시즌 league_player_awards(MVP·DPOY 순위, 올-리그·올-디펜시브 팀)를 전부 읽어 소속 유저에게 지급. */
async function settleSeasonAwards(ctx: Ctx, ev: EventRow, atMs: number): Promise<boolean> {
    const { data, error } = await supabase
        .from('league_player_awards')
        .select('player_id, team_slug, award_type, rank')
        .eq('room_id', ctx.roomId).eq('season_number', ctx.season)
        .in('award_type', SEASON_AWARD_TYPES);
    if (error) { console.error(`[points:award] room=${ctx.roomId} 어워드 조회 실패:`, error.message); return false; }
    for (const a of data ?? []) {
        const rank = (a.rank as number | null) ?? 0;
        const bonus = seasonAwardBonus(a.award_type as string, rank);
        if (bonus <= 0) continue;
        const owner = ctx.owners.get(a.team_slug as string);
        if (!owner || owner.joinedAtMs > atMs) continue;
        const res = await grantPoints({
            userId: owner.userId, amount: bonus, source: 'season_daily',
            idempotencyKey: seasonAwardKey(ctx.leagueId, ctx.season, a.award_type as string, rank, a.player_id as string, owner.userId),
            refType: 'season_award', refId: ev.id,
            meta: { league_id: ctx.leagueId, season: ctx.season, event: 'season_award', award_type: a.award_type, rank, player_id: a.player_id, team: a.team_slug },
        });
        if (!res.ok) return false;
        // 도전 과제 — 올-리그 팀 배출 / MVP·DPOY 1위 배출
        const aref = { league_id: ctx.leagueId, season: ctx.season, award_type: a.award_type, rank, player_id: a.player_id, team: a.team_slug };
        if ((a.award_type as string).startsWith('ALL_NBA_')) await unlockAchievement(owner.userId, 'all_league', aref);
        if ((a.award_type === 'MVP' || a.award_type === 'DPOY') && rank === 1) await unlockAchievement(owner.userId, 'hardware', aref);
    }
    return true;
}

async function grantMany(ctx: Ctx, ev: EventRow, kind: AllStarEventKind, players: RosterPlayer[], atMs: number): Promise<boolean> {
    for (const pl of players) {
        const owner = ctx.owners.get(pl.teamSlug);
        if (!owner || owner.joinedAtMs > atMs) continue;
        const res = await grantPoints({
            userId: owner.userId,
            amount: ALLSTAR_BONUS[kind],
            source: 'season_daily',
            idempotencyKey: allStarKey(ctx.leagueId, ctx.season, kind, pl.playerId, owner.userId),
            refType: 'allstar',
            refId: ev.id,
            meta: { league_id: ctx.leagueId, season: ctx.season, event: kind, event_type: ev.type, player_id: pl.playerId, team: pl.teamSlug, sim_date: ev.payload?.contestDate ?? undefined },
        });
        if (!res.ok) return false;
        // 도전 과제 — 올스타(선발·리저브) 배출
        if (kind === 'starter' || kind === 'reserve') {
            await unlockAchievement(owner.userId, 'all_star', { league_id: ctx.leagueId, season: ctx.season, player_id: pl.playerId, team: pl.teamSlug, kind });
        }
    }
    return true;
}

function toPlayers(list: unknown): RosterPlayer[] {
    if (!Array.isArray(list)) return [];
    return list
        .filter((x: any) => x && typeof x.playerId === 'string' && typeof x.teamSlug === 'string')
        .map((x: any) => ({ playerId: x.playerId, teamSlug: x.teamSlug }));
}

function extractConfList(p: any, key: 'starters' | 'reserves'): RosterPlayer[] {
    return [...toPlayers(p?.east?.[key]), ...toPlayers(p?.west?.[key])];
}

async function loadRoster(roomId: string, season: number): Promise<Ctx['roster']> {
    const { data } = await supabase
        .from('league_allstar_votes').select('roster')
        .eq('room_id', roomId).eq('season_number', season).not('roster', 'is', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
    const r = (data as any)?.roster;
    if (!r) return null;
    // risingStars 는 { teamA, teamB, teamAName, teamBName } 객체(배열 아님) — allStarSelection.runRisingStarsSelection 결과 그대로
    const rs = r.risingStars;
    const rising = Array.isArray(rs) ? toPlayers(rs) : [...toPlayers(rs?.teamA), ...toPlayers(rs?.teamB)];
    return {
        starters: extractConfList(r, 'starters'),
        reserves: extractConfList(r, 'reserves'),
        rising,
    };
}

async function isGameRevealed(roomId: string, gameId: string | null): Promise<boolean> {
    if (!gameId) return true;
    const { data } = await supabase.from('games').select('scheduled_at, ot_periods, played')
        .eq('room_id', roomId).eq('game_id', gameId).maybeSingle();
    if (!data || !data.played || !data.scheduled_at) return false;
    const replayMs = await getRoomReplayMs(roomId);
    return Date.parse(data.scheduled_at as string) + replayLengthMs(replayMs, data.ot_periods as number | null) <= Date.now();
}

/** pointsSettlement.loadOwners 와 동일 규칙 — team_slug → 유저 소유자 + 맡기 시작한 시각. */
async function loadOwners(roomId: string): Promise<Map<string, OwnerInfo>> {
    const [{ data: teams }, { data: members }] = await Promise.all([
        supabase.from('league_teams').select('team_slug, user_id, is_ai').eq('room_id', roomId),
        supabase.from('room_members').select('team_id, user_id, joined_at, is_ai').eq('room_id', roomId),
    ]);
    const joined = new Map<string, number>();
    for (const m of members ?? []) {
        if (m.user_id && m.team_id && !m.is_ai) joined.set(`${m.team_id}:${m.user_id}`, Date.parse(m.joined_at as string));
    }
    const owners = new Map<string, OwnerInfo>();
    for (const t of teams ?? []) {
        if (!t.user_id || t.is_ai) continue;
        const j = joined.get(`${t.team_slug}:${t.user_id}`);
        if (j === undefined || Number.isNaN(j)) continue;
        owners.set(t.team_slug as string, { userId: t.user_id as string, joinedAtMs: j });
    }
    return owners;
}
