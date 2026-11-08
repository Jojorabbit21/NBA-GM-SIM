/**
 * pointsSettlement.ts — BP 경기 정산: 공개된 경기 결과로 유저 팀에 BP 지급 (2026-11-08).
 * 계획: docs/plan/points-system-plan.md "① 일일 정산"·"플레이오프 보상", 공식: shared/points/dailySettlement.ts
 *
 * scheduler tick(30초)마다 진행 중 main_league 방을 돌며:
 *   1. rooms.points_settled_through(워터마크) 이후의 완료 경기(정규시즌 + 플레이인 + 플레이오프, 올스타 제외)를 scheduled_at 순으로 읽고
 *   2. 공개 시각(scheduled_at + 리플레이, 연장 가산 — postRevealTransitions 와 같은 식)이 지난 경기만 정산한다.
 *      첫 미공개 경기에서 멈춘다 → 결과보다 BP 가 먼저 움직이는 스포일러 방지.
 *   3. 각 경기의 홈·원정 중 유저 팀(league_teams.user_id, AI 아님)이고 **경기 시각에 이미 그 팀을 맡고 있던**
 *      (room_members.joined_at <= scheduled_at) 유저에게만 지급. 시즌 중 인수한 팀의 이전 경기는 지급하지 않는다.
 *   4. 플레이오프 본선(round ≥ 1) 경기는 추가로
 *        - R1 경기 → 양 팀에 "본선 진출" 보상(시즌당 1회, 멱등 키)
 *        - 그 경기로 시리즈가 확정(공개된 승수 = targetWins)되면 승자에게 "시리즈 승리" 보상(라운드 이름은 브라켓 maxRound 기준)
 *      bracket_data.finished/winnerId 는 시뮬 직후 찍혀 공개 전이므로 쓰지 않고, 공개된 경기만으로 승수를 센다.
 *   5. 정산한 마지막 경기의 scheduled_at 을 워터마크로 저장(>= 비교라 같은 시각의 나머지 경기도 다음 tick 에 잡힌다).
 *
 * 멱등: 원장 키 daily:{league}:{season}:{game}:{user} / po_qualify:{league}:{season}:{user} / po_series:{league}:{season}:{series}:{user}.
 * 지급 실패(ok:false)가 나면 그 경기에서 멈추고 워터마크를 전진시키지 않아 다음 tick 에 재시도된다.
 * 기존 방의 워터마크는 마이그레이션에서 now() 로 채워 과거 경기를 소급하지 않는다(소급하려면 null 로 — 정규시즌·플레이오프 함께 처리됨).
 */
import { supabase } from './supabaseAdmin.ts';
import { getRoomReplayMs } from './replayConfig.ts';
import { replayLengthMs } from './liveGameView.ts';
import { grantPoints } from './points.ts';
import {
    dailyGameReward, dailySettlementKey, playoffQualifyKey, playoffSeriesKey,
    playoffSeriesWinBonus, playoffRoundLabel, PLAYOFF_QUALIFY_BONUS, type GameStage,
} from './shared/points/dailySettlement.ts';
import {
    CUMULATIVE_STATS, RATIO_LADDERS, crossedCumulativeRungs, ratioRungs, playerStatKey, type RatioStat,
} from './shared/points/playerStatMilestones.ts';
import { unlockAchievement } from './pointsAchievements.ts';

/** tick 한 번에 방당 최대 처리 경기 수 — 하루 15경기 × 며칠치 밀려도 몇 tick 안에 따라잡는다. */
const BATCH_LIMIT = 200;

interface GameRow {
    game_id: string;
    game_date: string;
    scheduled_at: string | null;
    ot_periods: number | null;
    home_team_id: string;
    away_team_id: string;
    home_score: number | null;
    away_score: number | null;
    is_playoff: boolean | null;
    series_id: string | null;
}

interface OwnerInfo { userId: string; joinedAtMs: number }
interface SeriesInfo { round: number; targetWins: number }
interface Bracket { series: Map<string, SeriesInfo>; maxRound: number }

interface LeagueCtx {
    leagueId: string;
    roomId: string;
    season: number;
    owners: Map<string, OwnerInfo>;
    bracket: Bracket | null;
    replayMs: number;
    now: number;
    /** 도전 과제용 — team_slug → 컨퍼런스 시드(playoff_bracket_confirmed), 플레이인 10번 시드 집합(play_in_bracket 9v10 하위). 브라켓 없으면 빈 값 */
    seeds: Map<string, number>;
    tenSeeds: Set<string>;
}

/** 시드 정보 — 대진 확정 서신(playoff_bracket_confirmed)·플레이인 대진 서신(play_in_bracket) payload 에서. 없으면 빈 값(관련 과제만 건너뜀). */
async function loadSeeds(roomId: string, season: number): Promise<{ seeds: Map<string, number>; tenSeeds: Set<string> }> {
    const seeds = new Map<string, number>();
    const tenSeeds = new Set<string>();
    const { data } = await supabase.from('league_events').select('type, payload')
        .eq('room_id', roomId).eq('season_number', season)
        .in('type', ['playoff_bracket_confirmed', 'play_in_bracket'])
        .order('created_at', { ascending: false }).limit(4);
    for (const ev of data ?? []) {
        const p: any = ev.payload ?? {};
        if (ev.type === 'playoff_bracket_confirmed') {
            for (const side of ['east', 'west']) for (const s of (p[side] ?? [])) {
                if (s?.teamSlug && typeof s.seed === 'number' && !seeds.has(s.teamSlug)) seeds.set(s.teamSlug, s.seed);
            }
        } else if (ev.type === 'play_in_bracket') {
            for (const m of (p.matchups ?? [])) {
                if (m?.tag === '9v10' && m.lowerSeedSlug) tenSeeds.add(m.lowerSeedSlug);
            }
        }
    }
    return { seeds, tenSeeds };
}

export async function runDailyPointSettlements(): Promise<void> {
    const { data: leagues, error } = await supabase
        .from('leagues')
        .select('id, bracket_data, regular_season_ended_at')
        .eq('type', 'main_league')
        .eq('status', 'in_progress');
    if (error) { console.error('[points] leagues 조회 실패:', error.message); return; }

    for (const league of leagues ?? []) {
        try {
            await settleLeague(league.id as string, parseBracket((league as any).bracket_data), (league as any).regular_season_ended_at ?? null);
        } catch (err) {
            console.error(`[points] league=${league.id} 경기 정산 실패:`, err);
        }
    }
}

function parseBracket(raw: unknown): Bracket | null {
    const list = (raw as { series?: Array<{ id: string; round: number; targetWins: number }> } | null)?.series;
    if (!Array.isArray(list) || list.length === 0) return null;
    const series = new Map<string, SeriesInfo>();
    let maxRound = 0;
    for (const s of list) {
        if (!s?.id) continue;
        series.set(s.id, { round: Number(s.round) || 0, targetWins: Number(s.targetWins) || 4 });
        if (Number(s.round) > maxRound) maxRound = Number(s.round);
    }
    return { series, maxRound };
}

async function settleLeague(leagueId: string, bracket: Bracket | null, regularSeasonEndedAt: string | null): Promise<void> {
    const { data: room } = await supabase
        .from('rooms')
        .select('id, season_number, points_settled_through, points_ratio_settled_at')
        .eq('league_id', leagueId)
        .maybeSingle();
    if (!room) return;
    const roomId = room.id as string;
    const watermark = room.points_settled_through as string | null;

    let q = supabase
        .from('games')
        .select('game_id, game_date, scheduled_at, ot_periods, home_team_id, away_team_id, home_score, away_score, is_playoff, series_id')
        .eq('room_id', roomId)
        .eq('played', true)
        .or('is_allstar.is.null,is_allstar.eq.false')
        .not('scheduled_at', 'is', null)
        .order('scheduled_at', { ascending: true })
        .limit(BATCH_LIMIT);
    if (watermark) q = q.gte('scheduled_at', watermark);
    const { data: games, error: gErr } = await q;
    if (gErr) { console.error(`[points] room=${roomId} games 조회 실패:`, gErr.message); return; }
    if (!games?.length) return;

    const season = (room.season_number as number | null) ?? 1;
    const seedInfo = bracket ? await loadSeeds(roomId, season) : { seeds: new Map<string, number>(), tenSeeds: new Set<string>() };
    const ctx: LeagueCtx = {
        leagueId, roomId, season,
        owners: await loadOwners(roomId),
        bracket,
        replayMs: await getRoomReplayMs(roomId),
        now: Date.now(),
        seeds: seedInfo.seeds,
        tenSeeds: seedInfo.tenSeeds,
    };

    let lastSettledAt: string | null = null;
    let granted = 0;

    for (const g of games as GameRow[]) {
        const startMs = Date.parse(g.scheduled_at!);
        if (startMs + replayLengthMs(ctx.replayMs, g.ot_periods) > ctx.now) break;   // 첫 미공개 경기에서 멈춤
        if (g.home_score == null || g.away_score == null) break;                      // 비정상 행 — 다음 tick 재시도

        const ok = ctx.owners.size === 0 ? true : await settleGame(ctx, g, startMs);
        if (!ok) break;                                                               // 지급 실패 → 워터마크 고정, 재시도
        granted++;
        lastSettledAt = g.scheduled_at;
    }

    const effectiveWatermark = lastSettledAt ?? watermark;
    if (lastSettledAt && lastSettledAt !== watermark) {
        await supabase.from('rooms').update({ points_settled_through: lastSettledAt }).eq('id', roomId);
    }
    if (granted > 0 && ctx.owners.size > 0) console.log(`[points] league=${leagueId} 경기 정산 ${granted}경기 (through ${lastSettledAt})`);

    // 비율 지표(야투율·자유투·3점) — 정규시즌 종료 스탬프가 찍혔고, 정규시즌 마지막 경기까지 카운터에 반영된 뒤 1회
    if (regularSeasonEndedAt && !room.points_ratio_settled_at && ctx.owners.size > 0) {
        await settleRatioMilestones(ctx, effectiveWatermark);
    }
}

/** 정규시즌 마지막 경기 시각 ≤ 워터마크이면(= 전부 정산·카운트됨) 자격 선수의 비율 단계를 판정해 지급하고 표식을 찍는다. */
async function settleRatioMilestones(ctx: LeagueCtx, watermark: string | null): Promise<void> {
    if (!watermark) return;
    const { data: last } = await supabase
        .from('games').select('scheduled_at')
        .eq('room_id', ctx.roomId).eq('is_playoff', false).or('is_allstar.is.null,is_allstar.eq.false')
        .not('scheduled_at', 'is', null)
        .order('scheduled_at', { ascending: false }).limit(1).maybeSingle();
    if (!last?.scheduled_at || Date.parse(last.scheduled_at as string) > Date.parse(watermark)) return;

    const { data: rows, error } = await supabase
        .from('points_player_season_counters')
        .select('player_id, team_slug, fgm, fga, ftm, fta, p3m, p3a')
        .eq('room_id', ctx.roomId).eq('season_number', ctx.season);
    if (error) { console.error(`[points] room=${ctx.roomId} 카운터 조회 실패:`, error.message); return; }

    for (const r of rows ?? []) {
        const owner = ctx.owners.get(r.team_slug as string);
        if (!owner) continue;
        for (const stat of Object.keys(RATIO_LADDERS) as RatioStat[]) {
            const lad = RATIO_LADDERS[stat];
            const rungs = ratioRungs(stat, Number(r[lad.made]) || 0, Number(r[lad.att]) || 0);
            for (const rung of rungs) {
                const res = await grantPoints({
                    userId: owner.userId, amount: rung.reward, source: 'season_milestone',
                    idempotencyKey: playerStatKey(ctx.leagueId, ctx.season, r.player_id as string, rung.stat, rung.threshold, owner.userId),
                    refType: 'player_stat', refId: r.player_id as string,
                    meta: { league_id: ctx.leagueId, season: ctx.season, player_id: r.player_id, team: r.team_slug, stat: rung.stat, threshold: rung.threshold,
                            made: r[lad.made], attempts: r[lad.att], rarity_index: rung.rarityIndex, kind: 'ratio' },
                });
                if (!res.ok) return;   // 표식 안 찍음 → 다음 tick 재시도(멱등)
            }
        }
    }
    await supabase.from('rooms').update({ points_ratio_settled_at: new Date().toISOString() }).eq('id', ctx.roomId);
    console.log(`[points] league=${ctx.leagueId} 비율 마일스톤 판정 완료 (${rows?.length ?? 0}명)`);
}

/** team_slug → 유저 팀 소유자(AI 제외) + 맡기 시작한 실제 시각. */
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
        const joinedAtMs = joined.get(`${t.team_slug}:${t.user_id}`);
        // room_members 행이 없으면(비정상) 지급하지 않는다 — 소유 시점을 알 수 없음
        if (joinedAtMs === undefined || Number.isNaN(joinedAtMs)) continue;
        owners.set(t.team_slug as string, { userId: t.user_id as string, joinedAtMs });
    }
    return owners;
}

function stageOf(ctx: LeagueCtx, g: GameRow): { stage: GameStage; series: SeriesInfo | null } {
    if (!g.is_playoff) return { stage: 'regular', series: null };
    const series = (g.series_id && ctx.bracket?.series.get(g.series_id)) || null;
    // 브라켓에 없는 시리즈(비정상)는 라운드를 알 수 없어 플레이인 취급 — 경기 보상만, 사건 보상 없음
    if (!series || series.round < 1) return { stage: 'play_in', series: null };
    return { stage: 'playoff', series };
}

/** 경기 1건 — 홈·원정 유저 팀에 경기 보상 + (본선) 진출·시리즈 확정 보상. 전부 성공(또는 이미 지급)해야 true. */
async function settleGame(ctx: LeagueCtx, g: GameRow, startMs: number): Promise<boolean> {
    const { stage, series } = stageOf(ctx, g);
    const sides = [
        { team: g.home_team_id, opp: g.away_team_id, pf: g.home_score!, pa: g.away_score!, home: true },
        { team: g.away_team_id, opp: g.home_team_id, pf: g.away_score!, pa: g.home_score!, home: false },
    ];
    const baseMeta = { league_id: ctx.leagueId, season: ctx.season, game_id: g.game_id, game_date: g.game_date, stage, series_id: g.series_id ?? undefined };

    for (const s of sides) {
        const owner = ctx.owners.get(s.team);
        if (!owner || owner.joinedAtMs > startMs) continue;   // 경기 당시 다른 사람(또는 AI)의 팀이었음

        const won = s.pf > s.pa;
        const margin = s.pf - s.pa;
        const { amount, marginBonus } = dailyGameReward(won, margin, stage);
        const res = await grantPoints({
            userId: owner.userId, amount, source: 'season_daily',
            idempotencyKey: dailySettlementKey(ctx.leagueId, ctx.season, g.game_id, owner.userId),
            refType: 'game', refId: g.game_id,
            meta: { ...baseMeta, team: s.team, opponent: s.opp, home: s.home, result: won ? 'W' : 'L',
                    score: `${s.pf}-${s.pa}`, margin, margin_bonus: marginBonus, ot: g.ot_periods ?? 0 },
        });
        if (!res.ok) return false;

        // 본선 R1 경기 → 진출 보상(시즌당 1회 — 두 번째부터는 granted:false 로 걸러짐)
        if (stage === 'playoff' && series!.round === 1) {
            const q = await grantPoints({
                userId: owner.userId, amount: PLAYOFF_QUALIFY_BONUS, source: 'season_daily',
                idempotencyKey: playoffQualifyKey(ctx.leagueId, ctx.season, owner.userId),
                refType: 'playoff_qualify', refId: g.series_id ?? g.game_id,
                meta: { ...baseMeta, team: s.team, event: 'playoff_qualify' },
            });
            if (!q.ok) return false;
            // 도전 과제 — 진출 / 플레이인 10번 시드 진출 (해금은 멱등, 실패해도 정산을 막지 않음)
            const aref = { league_id: ctx.leagueId, season: ctx.season, team: s.team, series_id: g.series_id };
            await unlockAchievement(owner.userId, 'po_qualify', aref);
            if (ctx.tenSeeds.has(s.team)) await unlockAchievement(owner.userId, 'po_long_shot', aref);
        }
    }

    // 정규시즌 경기만 선수 시즌 카운터에 반영 → 넘은 누적 단계 지급 (플레이인·플레이오프는 시즌 스탯에 넣지 않는다)
    if (stage === 'regular') {
        if (!(await applyPlayerStats(ctx, g, startMs))) return false;
    }

    // 이 경기로 시리즈가 확정됐는가 — 공개된 경기만으로 승수를 센다(bracket.finished 는 공개 전에 찍힘)
    if (stage === 'playoff' && g.series_id) {
        const winnerTeam = g.home_score! > g.away_score! ? g.home_team_id : g.away_team_id;
        const owner = ctx.owners.get(winnerTeam);
        if (owner && owner.joinedAtMs <= startMs) {
            const clinch = await seriesClinchState(ctx, g, winnerTeam, series!.targetWins);
            if (clinch === null) return false;
            if (clinch.clinched) {
                const round = series!.round;
                const maxRound = ctx.bracket!.maxRound;
                const bonus = playoffSeriesWinBonus(round, maxRound);
                const res = await grantPoints({
                    userId: owner.userId, amount: bonus, source: 'season_daily',
                    idempotencyKey: playoffSeriesKey(ctx.leagueId, ctx.season, g.series_id, owner.userId),
                    refType: 'playoff_series', refId: g.series_id,
                    meta: { ...baseMeta, team: winnerTeam, event: 'series_win', round, max_round: maxRound, round_label: playoffRoundLabel(round, maxRound) },
                });
                if (!res.ok) return false;

                // 도전 과제 — 시리즈 승리 계열(해금 멱등, 실패해도 정산을 막지 않음)
                const loserTeam = winnerTeam === g.home_team_id ? g.away_team_id : g.home_team_id;
                const wSeed = ctx.seeds.get(winnerTeam);
                const lSeed = ctx.seeds.get(loserTeam);
                const aref = { league_id: ctx.leagueId, season: ctx.season, team: winnerTeam, series_id: g.series_id, round, max_round: maxRound,
                               opponent: loserTeam, seed: wSeed ?? null, opponent_seed: lSeed ?? null, series_score: `${clinch.winnerWins}-${clinch.loserWins}` };
                const u = owner.userId;
                await unlockAchievement(u, 'po_series_win', aref);
                if (clinch.loserWins === 0) await unlockAchievement(u, 'po_sweep', aref);
                if (wSeed !== undefined && lSeed !== undefined && wSeed > lSeed) await unlockAchievement(u, 'po_upset', aref);
                if (maxRound >= 3 && round === maxRound - 2) await unlockAchievement(u, 'po_conf_finals', aref);
                if (maxRound >= 2 && round === maxRound - 1) await unlockAchievement(u, 'po_finals', aref);
                if (round === maxRound) {
                    await unlockAchievement(u, 'champion', aref);
                    if (wSeed === 8) await unlockAchievement(u, 'eighth_wonder', aref);
                    const losses = await playoffLossCount(ctx, winnerTeam);
                    if (losses === 0) await unlockAchievement(u, 'flawless', aref);
                }
            }
        }
    }
    return true;
}

/** 본선(round ≥ 1) 플레이오프에서 team 이 진 경기 수 — Flawless 판정. 조회 실패 시 -1(해금 안 함). */
async function playoffLossCount(ctx: LeagueCtx, team: string): Promise<number> {
    const { data, error } = await supabase
        .from('games').select('series_id, home_team_id, away_team_id, home_score, away_score')
        .eq('room_id', ctx.roomId).eq('is_playoff', true).eq('played', true)
        .or(`home_team_id.eq.${team},away_team_id.eq.${team}`);
    if (error) { console.error(`[points] team=${team} 플옵 패배 집계 실패:`, error.message); return -1; }
    let losses = 0;
    for (const r of data ?? []) {
        const info = r.series_id ? ctx.bracket?.series.get(r.series_id as string) : null;
        if (!info || info.round < 1) continue;   // 플레이인 제외
        if (r.home_score == null || r.away_score == null) continue;
        const winner = (r.home_score as number) > (r.away_score as number) ? r.home_team_id : r.away_team_id;
        if (winner !== team) losses++;
    }
    return losses;
}

interface BoxLine {
    playerId?: string; mp?: number; pts?: number; reb?: number; ast?: number; stl?: number; blk?: number;
    p3m?: number; p3a?: number; fgm?: number; fga?: number; ftm?: number; ftb?: number; fta?: number;
}

/** 경기 박스를 선수 시즌 카운터에 반영(RPC, 경기당 1회 멱등)하고, before→after 로 넘은 누적 단계를 소속 유저에게 지급. */
async function applyPlayerStats(ctx: LeagueCtx, g: GameRow, startMs: number): Promise<boolean> {
    const { data: pbp, error } = await supabase
        .from('game_pbp').select('home_box, away_box')
        .eq('room_id', ctx.roomId).eq('game_id', g.game_id).maybeSingle();
    if (error) { console.error(`[points] game=${g.game_id} 박스 조회 실패:`, error.message); return false; }
    if (!pbp) return true;   // 박스 없는 경기(비정상) — 스탯 없이 통과

    const rows: Record<string, unknown>[] = [];
    const push = (box: unknown, team: string) => {
        if (!Array.isArray(box)) return;
        for (const b of box as BoxLine[]) {
            if (!b?.playerId) continue;
            const n = (v: unknown) => Math.trunc(Number(v) || 0);
            rows.push({
                player_id: b.playerId, team_slug: team, gp: (Number(b.mp) || 0) > 0 ? 1 : 0,
                pts: n(b.pts), reb: n(b.reb), ast: n(b.ast), stl: n(b.stl), blk: n(b.blk),
                p3m: n(b.p3m), p3a: n(b.p3a), fgm: n(b.fgm), fga: n(b.fga), ftm: n(b.ftm), fta: n(b.fta),
            });
        }
    };
    push(pbp.home_box, g.home_team_id);
    push(pbp.away_box, g.away_team_id);
    if (rows.length === 0) return true;

    const { data: applied, error: rpcErr } = await supabase.rpc('apply_player_game_stats', {
        p_room_id: ctx.roomId, p_season: ctx.season, p_game_id: g.game_id, p_rows: rows,
    });
    if (rpcErr) { console.error(`[points] game=${g.game_id} 카운터 반영 실패:`, rpcErr.message); return false; }

    for (const row of (applied ?? []) as Array<{ player_id: string; team_slug: string; before: Record<string, number>; after: Record<string, number> }>) {
        const owner = ctx.owners.get(row.team_slug);
        if (!owner || owner.joinedAtMs > startMs) continue;
        for (const stat of CUMULATIVE_STATS) {
            const before = Number(row.before?.[stat] ?? 0);
            const after = Number(row.after?.[stat] ?? 0);
            for (const rung of crossedCumulativeRungs(stat, before, after)) {
                const res = await grantPoints({
                    userId: owner.userId, amount: rung.reward, source: 'season_milestone',
                    idempotencyKey: playerStatKey(ctx.leagueId, ctx.season, row.player_id, rung.stat, rung.threshold, owner.userId),
                    refType: 'player_stat', refId: row.player_id,
                    meta: { league_id: ctx.leagueId, season: ctx.season, game_id: g.game_id, player_id: row.player_id, team: row.team_slug,
                            stat: rung.stat, threshold: rung.threshold, value: after, rarity_index: rung.rarityIndex, kind: 'cumulative' },
                });
                if (!res.ok) return false;
            }
        }
    }
    return true;
}

/** 시리즈의 공개된 경기 중 team 의 승수가 targetWins 에 도달했고, 그 도달 경기가 바로 g 인가.
 *  (같은 시리즈의 이후 경기는 존재하지 않으므로 "승수 == targetWins" 이면 g 가 확정 경기다.) 조회 실패 시 null.
 *  loserWins 는 스윕(Brooms Out) 판정용. */
async function seriesClinchState(
    ctx: LeagueCtx, g: GameRow, team: string, targetWins: number,
): Promise<{ clinched: boolean; winnerWins: number; loserWins: number } | null> {
    const { data, error } = await supabase
        .from('games')
        .select('game_id, scheduled_at, ot_periods, home_team_id, away_team_id, home_score, away_score')
        .eq('room_id', ctx.roomId).eq('series_id', g.series_id!).eq('played', true)
        .lte('scheduled_at', g.scheduled_at!);
    if (error) { console.error(`[points] series=${g.series_id} 경기 조회 실패:`, error.message); return null; }
    let wins = 0, total = 0;
    for (const r of (data ?? []) as GameRow[]) {
        if (r.home_score == null || r.away_score == null) continue;
        total++;
        const w = r.home_score > r.away_score ? r.home_team_id : r.away_team_id;
        if (w === team) wins++;
    }
    return { clinched: wins === targetWins, winnerWins: wins, loserWins: total - wins };
}
