
/**
 * simulate-game — 단일 경기 PBP 시뮬레이션 Edge Function
 *
 * POST { roomId, gameId, secret? }
 *
 * 처리 순서:
 * 1. 인증 (service role 또는 cron secret)
 * 2. rooms.schedule에서 게임 로드
 * 3. league_teams + meta_players → Team 객체 재구성
 * 4. room_members에서 전술/뎁스차트 로드
 * 5. PBP 엔진 실행
 * 6. game_pbp 테이블에 이벤트 저장
 * 7. rooms.schedule 업데이트 (played=true, 스코어)
 * 8. 토너먼트: bracket_data 업데이트 + 다음 경기 생성
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runFullGameSimulation } from '../_shared/engine/pbp/main.ts';
import { buildTeamForSim, mapRawPlayerToRuntimePlayer } from '../_shared/dataMapper.ts';
import {
    advanceTournamentState,
    type PlayoffSeries as BPLSeries,
    type TournamentGame,
} from '../_shared/tournamentBracket.ts';
import { archiveTournament } from '../_shared/tournamentArchiver.ts';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CRON_SECRET = Deno.env.get('SIMULATE_CRON_SECRET') ?? '';

// ── 진입점 ────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: CORS_HEADERS });
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── 인증: cron secret / Bearer token / adminToken (body) ─────────────
    const authHeader  = req.headers.get('Authorization') ?? '';
    const cronHeader  = req.headers.get('X-Cron-Secret') ?? '';
    const isCron      = CRON_SECRET && cronHeader === CRON_SECRET;
    const isBearer    = authHeader.startsWith('Bearer ');

    // body를 먼저 읽어야 adminToken 확인 가능
    const body = await req.json() as { roomId: string; gameId: string; adminToken?: string };
    const { roomId, gameId, adminToken } = body;
    if (!roomId || !gameId) return json({ error: 'roomId and gameId required' }, 400);

    const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const isAdminToken      = !!adminToken && adminToken === SERVICE_ROLE_KEY;

    if (!isCron && !isBearer && !isAdminToken) {
        return json({ error: 'Unauthorized' }, 401);
    }

    const t0 = Date.now();
    console.log(`[simulate-game] room=${roomId} game=${gameId}`);

    try {
        // ── 1. 방 데이터 로드 ──────────────────────────────────────────────
        const { data: room } = await supabase
            .from('rooms')
            .select('schedule, roster_state, tendency_seed, sim_settings, coaching_staff, league_id')
            .eq('id', roomId)
            .single();
        if (!room) return json({ error: 'Room not found' }, 404);

        // custom_overrides 적용 여부: alltime 풀이 포함된 경우에만 적용
        const { data: leagueDraftPool } = await supabase
            .from('leagues')
            .select('draft_pool')
            .eq('id', room.league_id)
            .maybeSingle();
        const draftPools = (leagueDraftPool?.draft_pool ?? 'standard')
            .split(',').map((s: string) => s.trim());
        const useCustomOverrides = draftPools.includes('alltime');

        const schedule: any[] = room.schedule ?? [];
        const game = schedule.find(g => g.id === gameId);
        if (!game) return json({ error: 'Game not found in schedule' }, 404);
        if (game.played) return json({ ok: true, skipped: true, reason: 'already played' });

        const { homeTeamId, awayTeamId } = game;

        // ── 2. 리그 팀 + 선수 데이터 로드 ─────────────────────────────────
        const { data: leagueTeams } = await supabase
            .from('league_teams')
            .select('id, team_slug, team_name, roster')
            .eq('room_id', roomId)
            .in('team_slug', [homeTeamId, awayTeamId]);

        const homeTeamRow = leagueTeams?.find(t => t.team_slug === homeTeamId);
        const awayTeamRow = leagueTeams?.find(t => t.team_slug === awayTeamId);
        if (!homeTeamRow || !awayTeamRow) {
            return json({ error: 'Team data missing' }, 500);
        }

        const allPlayerIds = [
            ...(homeTeamRow.roster ?? []),
            ...(awayTeamRow.roster ?? []),
        ];

        const { data: rawPlayers } = await supabase
            .from('meta_players')
            .select('id, name, position, base_attributes, tendencies')
            .in('id', allPlayerIds);

        const playerMap = new Map<string, any>();
        for (const raw of rawPlayers ?? []) {
            playerMap.set(String(raw.id), mapRawPlayerToRuntimePlayer(raw, useCustomOverrides));
        }

        const rosterState: Record<string, any> = (room.roster_state as any) ?? {};

        const homeTeam = buildTeamForSim(homeTeamRow, playerMap, rosterState);
        const awayTeam = buildTeamForSim(awayTeamRow, playerMap, rosterState);

        // ── 3. 전술/뎁스차트 로드 ─────────────────────────────────────────
        // room_members에서 해당 팀의 유저 멤버 전술을 가져옴
        // AI 팀 또는 멤버 없으면 엔진이 자동 전술 생성
        const { data: members } = await supabase
            .from('room_members')
            .select('team_id, tactics, depth_chart')
            .eq('room_id', roomId)
            .in('team_id', [homeTeamId, awayTeamId]);

        const homeMember  = members?.find(m => m.team_id === homeTeamId);
        const awayMember  = members?.find(m => m.team_id === awayTeamId);
        const homeTactics = (homeMember?.tactics   ?? null) as any;
        const awayTactics = (awayMember?.tactics   ?? null) as any;
        const homeDepth   = (homeMember?.depth_chart ?? null) as any;
        const awayDepth   = (awayMember?.depth_chart ?? null) as any;

        const coachingData  = (room.coaching_staff ?? null) as any;
        const simSettings   = (room.sim_settings   ?? null) as any;
        const tendencySeed  = room.tendency_seed   ?? '';

        // ── 4. PBP 엔진 실행 ───────────────────────────────────────────────
        // game_start_time: 최초 시뮬레이션 시각을 보존 (재시뮬 시 덮어쓰지 않음)
        const { data: existingPbp } = await supabase
            .from('game_pbp')
            .select('game_start_time')
            .eq('room_id', roomId)
            .eq('game_id', gameId)
            .maybeSingle();
        const gameStartTime = existingPbp?.game_start_time ?? new Date().toISOString();

        const result = runFullGameSimulation(
            homeTeam,
            awayTeam,
            null,           // userTeamId: 서버 시뮬에서는 없음
            homeTactics,
            false,          // isHomeB2B (추후 back-to-back 로직 추가 가능)
            false,
            homeDepth,
            awayDepth,
            tendencySeed + ':' + gameId,
            simSettings,
            coachingData,
        );

        const simDurationMs = Date.now() - t0;

        const homeScore = result.homeScore ?? 0;
        const awayScore = result.awayScore ?? 0;

        console.log(`[simulate-game] result: ${homeTeamId} ${homeScore} - ${awayScore} ${awayTeamId} (${simDurationMs}ms)`);

        // ── 5. game_pbp 저장 ───────────────────────────────────────────────
        await supabase.from('game_pbp').upsert({
            room_id:        roomId,
            game_id:        gameId,
            events:         result.pbpLogs ?? [],
            shot_events:    result.pbpShotEvents ?? [],
            home_box:       result.homeBox ?? [],
            away_box:       result.awayBox ?? [],
            home_score:     homeScore,
            away_score:     awayScore,
            home_team_id:   homeTeamId,
            away_team_id:   awayTeamId,
            game_start_time: gameStartTime,
            sim_duration_ms: simDurationMs,
        }, { onConflict: 'room_id,game_id' });

        // ── 6. rooms.schedule 업데이트 ─────────────────────────────────────
        const updatedSchedule = schedule.map(g =>
            g.id === gameId
                ? { ...g, played: true, homeScore, awayScore }
                : g,
        );

        // ── 7. 토너먼트 처리 ───────────────────────────────────────────────
        if (game.seriesId) {
            await handleTournamentAdvance(
                supabase, roomId, (room as any).league_id ?? '', gameId, game.seriesId,
                homeTeamId, awayTeamId, homeScore, awayScore,
                updatedSchedule, game.scheduledAt,
            );
        } else {
            // 라운드 로빈 / 일반 리그: 일정만 갱신
            await supabase.from('rooms')
                .update({ schedule: updatedSchedule })
                .eq('id', roomId);
        }

        return json({
            ok: true,
            homeScore,
            awayScore,
            simDurationMs,
        });

    } catch (err) {
        console.error('[simulate-game] error:', err);
        return json({ error: String(err) }, 500);
    }
});

// ── 토너먼트 상태 전진 ────────────────────────────────────────────────────────

async function handleTournamentAdvance(
    supabase:        ReturnType<typeof createClient>,
    roomId:          string,
    leagueId:        string,
    gameId:          string,
    seriesId:        string,
    homeTeamId:      string,
    awayTeamId:      string,
    homeScore:       number,
    awayScore:       number,
    updatedSchedule: any[],
    gameScheduledAt?: string,
) {
    const { data: leagueRow } = await supabase
        .from('leagues')
        .select('id, bracket_data, season_start_date, match_format, tournament_format')
        .eq('id', leagueId)
        .maybeSingle();

    if (!leagueRow?.bracket_data) {
        // 토너먼트가 아니거나 브라켓 없음: 일정만 저장
        await supabase.from('rooms').update({ schedule: updatedSchedule }).eq('id', roomId);
        return;
    }

    const bracketData = leagueRow.bracket_data as { series: BPLSeries[]; schedule: TournamentGame[] };
    const series: BPLSeries[] = bracketData.series ?? [];
    const bracketSchedule: TournamentGame[] = bracketData.schedule ?? [];
    const startDate: string = leagueRow.season_start_date ?? '2025-10-21';

    // 해당 시리즈 찾기
    const seriesObj = series.find(s => s.id === seriesId);
    if (!seriesObj || seriesObj.finished) {
        await supabase.from('rooms').update({ schedule: updatedSchedule }).eq('id', roomId);
        return;
    }

    // 이긴 팀 판별
    const homeWon = homeScore > awayScore;
    if (homeWon) {
        if (homeTeamId === seriesObj.higherSeedId) seriesObj.higherSeedWins++;
        else                                        seriesObj.lowerSeedWins++;
    } else {
        if (awayTeamId === seriesObj.higherSeedId) seriesObj.higherSeedWins++;
        else                                        seriesObj.lowerSeedWins++;
    }

    // bracket_data.schedule의 해당 게임도 played 처리
    const bracketGame = bracketSchedule.find(g => g.id === gameId);
    if (bracketGame) {
        (bracketGame as any).played    = true;
        (bracketGame as any).homeScore = homeScore;
        (bracketGame as any).awayScore = awayScore;
    }

    // 시리즈 완료 확인
    if (seriesObj.higherSeedWins >= seriesObj.targetWins) {
        seriesObj.finished  = true;
        seriesObj.winnerId  = seriesObj.higherSeedId;
    } else if (seriesObj.lowerSeedWins >= seriesObj.targetWins) {
        seriesObj.finished  = true;
        seriesObj.winnerId  = seriesObj.lowerSeedId;
    }

    if (seriesObj.finished) {
        // 시리즈 완료: 다음 라운드 슬롯 채우기 + 전체 게임 생성
        advanceTournamentState(series, bracketSchedule, seriesObj.targetWins, startDate);

        // advanceTournamentState가 새로 추가한 게임을 rooms.schedule에 반영
        const existingIds = new Set(updatedSchedule.map((g: any) => g.id));
        for (const g of bracketSchedule) {
            if (!existingIds.has(g.id)) {
                updatedSchedule.push(g as any);
            }
        }
    }
    // 시리즈 계속: 게임은 사전 생성되어 있으므로 추가 조치 불필요

    // DB 저장: rooms.schedule + leagues.bracket_data
    await Promise.all([
        supabase.from('rooms')
            .update({ schedule: updatedSchedule })
            .eq('id', roomId),
        supabase.from('leagues')
            .update({ bracket_data: { series, schedule: bracketSchedule } })
            .eq('id', leagueRow.id),
    ]);

    // 토너먼트 전체 종료 확인: 모든 실제 시리즈(BYE 제외)가 finished면 아카이브
    const realSeries = series.filter(s => s.lowerSeedId !== 'BYE');
    const allDone    = realSeries.length > 0 && realSeries.every(s => s.finished);
    if (allDone) {
        console.log(`[simulate-game] Tournament complete — archiving league=${leagueId}`);
        const { error: archiveErr } = await archiveTournament(supabase, leagueId, roomId);
        if (archiveErr) {
            console.error('[simulate-game] archive error:', archiveErr);
        }
        await supabase.from('leagues').update({ status: 'finished' }).eq('id', leagueId);
    }
}

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
}
