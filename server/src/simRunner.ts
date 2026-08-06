/**
 * simRunner.ts — 단일 경기 PBP 시뮬레이션 (simulate-game EF → Fly 이식)
 *
 * export async function runSimulation(roomId, gameId): Promise<SimResult>
 */
import { supabase } from './supabaseAdmin.ts';
import { runFullGameSimulation } from './shared/engine/pbp/main.ts';
import { buildTeamForSim, mapRawPlayerToRuntimePlayer } from './shared/dataMapper.ts';
import { resolveNormalizationContext } from './shared/engine/pbp/leagueNormalization.ts';
import { calculateOvr } from './shared/utils/ovrUtils.ts';
import {
    advanceTournamentState,
    targetWinsFromFormat,
    type PlayoffSeries as BPLSeries,
    type TournamentGame,
} from './shared/tournamentBracket.ts';
import { archiveTournament } from './shared/tournamentArchiver.ts';
import { insertGameShortCodes, insertGames } from './finalize.ts';

export interface SimResult {
    ok: boolean;
    homeScore?: number;
    awayScore?: number;
    skipped?: boolean;
    reason?: string;
    simDurationMs?: number;
    error?: string;
}

// ── 공개 진입점 ───────────────────────────────────────────────────────────────

export async function runSimulation(roomId: string, gameId: string, forceStartNow = false): Promise<SimResult> {
    const t0 = Date.now();
    console.log(`[simRunner] room=${roomId} game=${gameId}`);

    try {
        // ── 1. 방 데이터 로드 ──────────────────────────────────────────────
        const { data: room } = await supabase
            .from('rooms')
            .select('roster_state, tendency_seed, sim_settings, coaching_staff, league_id')
            .eq('id', roomId)
            .single();
        if (!room) return { ok: false, error: 'Room not found' };

        // custom_overrides 적용 여부 + 시간 압축 파라미터
        const { data: leagueData } = await supabase
            .from('leagues')
            .select('draft_pool, sim_real_start_at, games_per_real_day')
            .eq('id', room.league_id)
            .maybeSingle();
        const draftPools = (leagueData?.draft_pool ?? 'standard')
            .split(',').map((s: string) => s.trim());
        const useCustomOverrides = draftPools.includes('alltime');

        // [migration 2026-08-06] rooms.schedule 전체 스캔 대신 games 테이블에서 해당 경기 1행만 조회.
        const { data: game } = await supabase
            .from('games')
            .select('home_team_id, away_team_id, played, scheduled_at, game_seq, series_id')
            .eq('room_id', roomId).eq('game_id', gameId)
            .maybeSingle();
        if (!game) return { ok: false, error: 'Game not found in schedule' };
        if (game.played) return { ok: true, skipped: true, reason: 'already played' };

        // ── 원자적 클레임 ──────────────────────────────────────────────────
        // 스케줄러 tick이 겹치거나(설정 폴링 간격보다 처리 시간이 길어지는 경우) 서버 인스턴스가
        // 둘 이상이면, 같은 경기가 동시에 두 번 시뮬레이션될 수 있다 — 이 경우 시리즈 승수
        // read-modify-write가 레이스를 일으켜 여분 경기 생성/결승 조기 노출 버그로 이어진다.
        // (room_id, game_id) PK unique 제약을 락으로 이용해 먼저 처리를 "찜"한 프로세스만
        // 계속 진행하도록 한다.
        const { error: claimErr } = await supabase
            .from('game_sim_claims')
            .insert({ room_id: roomId, game_id: gameId });
        if (claimErr) {
            console.log(`[simRunner] ${gameId} already claimed by another process — skip`);
            return { ok: true, skipped: true, reason: 'already claimed' };
        }

        // 클레임 획득(위에서 insert 성공) 이후의 전체 처리를 감싼다 — 성공/실패 어느 쪽으로
        // 끝나든 finally에서 단 한 번만 클레임을 해제한다. "이미 클레임됨" 스킵 경로(위)는
        // 애초에 이 프로세스가 클레임을 가진 적이 없으므로(다른 프로세스 소유) 이 블록 밖에 둔다.
        try {
            const homeTeamId = game.home_team_id;
            const awayTeamId = game.away_team_id;

            // ── 2. 리그 팀 + 선수 데이터 로드 ─────────────────────────────────
            const { data: leagueTeams } = await supabase
                .from('league_teams')
                .select('id, team_slug, team_name, roster')
                .eq('room_id', roomId)
                .in('team_slug', [homeTeamId, awayTeamId]);

            const homeTeamRow = leagueTeams?.find((t: any) => t.team_slug === homeTeamId);
            const awayTeamRow = leagueTeams?.find((t: any) => t.team_slug === awayTeamId);
            if (!homeTeamRow || !awayTeamRow) return { ok: false, error: 'Team data missing' };

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
            const { data: members } = await supabase
                .from('room_members')
                .select('team_id, tactics, depth_chart')
                .eq('room_id', roomId)
                .in('team_id', [homeTeamId, awayTeamId]);

            const homeMember  = members?.find((m: any) => m.team_id === homeTeamId);
            const awayMember  = members?.find((m: any) => m.team_id === awayTeamId);
            const homeTactics = (homeMember?.tactics    ?? null) as any;
            const awayTactics = (awayMember?.tactics    ?? null) as any;
            const homeDepth   = (homeMember?.depth_chart ?? null) as any;
            const awayDepth   = (awayMember?.depth_chart ?? null) as any;

            const coachingData = (room.coaching_staff ?? null) as any;
            const simSettings  = (room.sim_settings   ?? null) as any;
            const tendencySeed = room.tendency_seed   ?? '';

            // ── 3.5 League-relative normalization context ──────────────────────
            resolveNormalizationContext(simSettings, [homeTeam, awayTeam], calculateOvr);

            // ── 4. PBP 엔진 실행 ───────────────────────────────────────────────
            const { data: existingPbp } = await supabase
                .from('game_pbp')
                .select('game_start_time')
                .eq('room_id', roomId)
                .eq('game_id', gameId)
                .maybeSingle();
            const gameStartTime = (() => {
                // 관리자가 수동으로 시뮬 실행 시 — 원래 예정 시각과 무관하게 지금 바로 "방송 시작"
                if (forceStartNow) return new Date().toISOString();
                // schedule 생성 시점에 이미 scheduled_at이 저장되어 있으면(SSOT) 그대로 사용 —
                // game_seq로부터 재계산하지 않는다. 없으면(레거시 스케줄) 예전처럼 계산해 폴백한다.
                if (game.scheduled_at) return game.scheduled_at;
                const simStart = leagueData?.sim_real_start_at;
                const gprd     = leagueData?.games_per_real_day ?? 5;
                const seq: number | undefined = game.game_seq ?? undefined;
                if (simStart != null && seq != null) {
                    const raw = new Date(simStart).getTime() + (seq / gprd) * 86_400_000;
                    // 10분 단위로 반올림하면 경기 간격(intervalMinutes)이 10의 배수가 아닐 때
                    // (예: 15분) 슬롯마다 독립적으로 스냅되며 20분/10분이 번갈아 나오는 간격
                    // 불균일 버그가 생긴다 — 분 단위로만 반올림해 부동소수점 오차만 제거한다.
                    return new Date(Math.round(raw / 60_000) * 60_000).toISOString();
                }
                return existingPbp?.game_start_time ?? new Date().toISOString();
            })();

            // userTeamId를 homeTeamId로 고정해 hTactics/aTactics 해석 로직의 "앵커" 역할만 하도록
            // 하고, awayTactics는 awayUserTactics로 별도 전달한다 — 이렇게 하면 홈/원정 어느 쪽이든
            // 저장된 전술(tactics)이 있으면 그 팀 것을 쓰고, 없으면 (null/undefined) 자동으로
            // generateAutoTactics() 폴백이 걸리는 두 경우 모두 올바르게 처리된다. 기존에는
            // userTeamId를 null로 하드코딩해 모든 팀이 무조건 자동 생성 전술로 덮어써졌었다.
            const result = runFullGameSimulation(
                homeTeam,
                awayTeam,
                homeTeamId,
                homeTactics ?? undefined,
                false,
                false,
                homeDepth,
                awayDepth,
                tendencySeed + ':' + gameId,
                simSettings,
                coachingData,
                awayTactics ?? undefined,
                // [Fix 2026-07-26] 저장된 tactics/depthChart가 없어 엔진의 generateAutoTactics()
                // 폴백이 걸리는 경우(예: 구버전 리그), 뎁스차트는 항상 OVR 내림차순으로 채운다 —
                // 드래프트 픽 순서를 유지하면 낮은 OVR 선수가 먼저 뽑혔다는 이유만으로 더 높은
                // OVR의 동포지션 선수를 밀어내고 주전을 차지하는 문제가 있었다.
                false,
            );

            const simDurationMs = Date.now() - t0;
            const homeScore = result.homeScore ?? 0;
            const awayScore = result.awayScore ?? 0;

            console.log(`[simRunner] ${homeTeamId} ${homeScore} - ${awayScore} ${awayTeamId} (${simDurationMs}ms)`);

            // ── 5. game_pbp 저장 ───────────────────────────────────────────────
            await supabase.from('game_pbp').upsert({
                room_id:         roomId,
                game_id:         gameId,
                events:          result.pbpLogs ?? [],
                shot_events:     result.pbpShotEvents ?? [],
                home_box:        result.homeBox ?? [],
                away_box:        result.awayBox ?? [],
                home_score:      homeScore,
                away_score:      awayScore,
                home_team_id:    homeTeamId,
                away_team_id:    awayTeamId,
                game_start_time: gameStartTime,
                sim_duration_ms: simDurationMs,
                box_timeline:    result.boxTimeline ?? [],
                rotation_data:   result.rotationData ?? {},
            }, { onConflict: 'room_id,game_id' });

            // ── 6. games 테이블 업데이트 ───────────────────────────────────────
            // forceStartNow면 scheduled_at도 game_start_time과 맞춰줘야 일정/브라켓 화면이
            // 같은 시각 기준으로 LIVE 상태를 판정한다 (game_pbp.game_start_time만 바뀌고
            // scheduled_at은 그대로면 화면엔 계속 "예정"으로 보이는 불일치 발생).
            // [migration 2026-08-06] 배열 전체 read-modify-write 대신 단일 row 조건부 UPDATE —
            // .eq('played', false)로 compare-and-set을 걸어 game_sim_claims에 이은 2차 동시성
            // 방어선을 확보한다(0 rows 반환 시 다른 프로세스가 이미 기록한 것).
            const { data: applied, error: updErr } = await supabase
                .from('games')
                .update({
                    played: true, home_score: homeScore, away_score: awayScore,
                    ...(forceStartNow ? { scheduled_at: gameStartTime } : {}),
                })
                .eq('room_id', roomId).eq('game_id', gameId).eq('played', false)
                .select('game_id');
            if (updErr) {
                console.error(`[simRunner] games update 실패 room=${roomId} game=${gameId}: ${updErr.message}`);
                return { ok: false, error: updErr.message };
            }
            if (!applied?.length) {
                console.warn(`[simRunner] ${gameId} — 다른 프로세스가 이미 기록함, 토너먼트 전진 스킵`);
                return { ok: true, skipped: true, reason: 'already recorded' };
            }

            // ── 7. 토너먼트 처리 ───────────────────────────────────────────────
            if (game.series_id) {
                await handleTournamentAdvance(
                    roomId, (room as any).league_id ?? '', gameId, game.series_id,
                    homeTeamId, awayTeamId, homeScore, awayScore,
                );
            }

            return { ok: true, homeScore, awayScore, simDurationMs };
        } finally {
            // 클레임 획득 이후에는 성공/실패 관계없이 반드시 여기서 한 번만 해제한다 —
            // 안 지우면 완료된 경기의 클레임이 영구히 테이블에 쌓이거나(성공 시), 이 경기가
            // 영원히 "처리 중"으로 남아 스케줄러가 계속 스킵하게 된다(실패 시).
            await supabase.from('game_sim_claims').delete().eq('room_id', roomId).eq('game_id', gameId);
        }

    } catch (err) {
        console.error('[simRunner] error:', err);
        return { ok: false, error: String(err) };
    }
}

// ── 토너먼트 상태 전진 ────────────────────────────────────────────────────────

async function handleTournamentAdvance(
    roomId:     string,
    leagueId:   string,
    gameId:     string,
    seriesId:   string,
    homeTeamId: string,
    awayTeamId: string,
    homeScore:  number,
    awayScore:  number,
) {
    // [migration 2026-08-06] 경기 결과 자체(played/homeScore/awayScore)는 runSimulation()의
    // games UPDATE가 이미 기록했다 — 여기서는 시리즈 진행(series)과 다음 라운드 경기 생성만 담당.
    const { data: leagueRow } = await supabase
        .from('leagues')
        .select('id, bracket_data, season_start_date, match_format, finals_match_format, tournament_format, tournament_start_at, games_per_real_day, sim_real_start_at')
        .eq('id', leagueId)
        .maybeSingle();

    if (!leagueRow?.bracket_data) return;

    const bracketData = leagueRow.bracket_data as { series: BPLSeries[] };
    const series: BPLSeries[] = bracketData.series ?? [];
    const tournStartAt = leagueRow.tournament_start_at as string | null;
    const startDate    = tournStartAt ? tournStartAt.slice(0, 10) : (leagueRow.season_start_date ?? '2025-10-21');
    const intervalMinutes = 1440 / (leagueRow.games_per_real_day ?? 48);
    const finalsTargetWins = targetWinsFromFormat(
        (leagueRow as any).finals_match_format ?? leagueRow.match_format,
    );

    const seriesObj = series.find(s => s.id === seriesId);
    if (!seriesObj || seriesObj.finished) return;

    // 승패 집계
    const homeWon = homeScore > awayScore;
    if (homeWon) {
        if (homeTeamId === seriesObj.higherSeedId) seriesObj.higherSeedWins++;
        else                                        seriesObj.lowerSeedWins++;
    } else {
        if (awayTeamId === seriesObj.higherSeedId) seriesObj.higherSeedWins++;
        else                                        seriesObj.lowerSeedWins++;
    }

    if (seriesObj.higherSeedWins >= seriesObj.targetWins) {
        seriesObj.finished = true;
        seriesObj.winnerId = seriesObj.higherSeedId;
    } else if (seriesObj.lowerSeedWins >= seriesObj.targetWins) {
        seriesObj.finished = true;
        seriesObj.winnerId = seriesObj.lowerSeedId;
    }

    if (seriesObj.finished) {
        // 시리즈가 조기 확정되면(예: Bo3에서 2-0) 아직 실행되지 않은 잔여 예정 경기는
        // 무의미하므로 제거한다 — 해당 슬롯은 경기 없이 그냥 지나가는 휴식 기간이 된다.
        const { data: pruned } = await supabase
            .from('games')
            .delete()
            .eq('room_id', roomId).eq('series_id', seriesId).eq('played', false)
            .select('game_id');
        if (pruned?.length) {
            // [migration 부수 수정] prune된 경기의 short_code가 기존엔 영구 고아로 남아
            // 존재하지 않는 game_id로 라우팅됐다 — 함께 정리.
            await supabase.from('game_short_codes').delete()
                .eq('room_id', roomId).in('game_id', pruned.map(g => g.game_id));
        }

        // advanceTournamentState는 순수 함수 — "이미 존재하는 시리즈인지" 체크(seriesId만 읽음)와
        // "신규 라운드 경기 push"만 한다. 현재 games 행들로 최소 stub 배열을 만들어 넘기고,
        // 호출 후 늘어난 뒷부분만 신규 생성된 TournamentGame 전체 객체로 취한다.
        const { data: existing } = await supabase
            .from('games').select('game_id, series_id').eq('room_id', roomId);
        const stub: TournamentGame[] = (existing ?? []).map(r => ({ id: r.game_id, seriesId: r.series_id ?? undefined } as any));
        const before = stub.length;

        advanceTournamentState(
            series, stub, seriesObj.targetWins, finalsTargetWins, startDate, intervalMinutes,
            leagueRow.sim_real_start_at as string | null,
        );

        const newGames = stub.slice(before);

        if (newGames.length > 0) {
            const { error: gamesErr } = await insertGames(roomId, leagueId, newGames as any);
            if (gamesErr) console.error(`[simRunner] games insert 실패(${roomId}): ${gamesErr}`);

            // [Fix 2026-08-03] 다음 라운드 경기가 새로 생기는 시점 — finalize.ts는 최초 일정(1라운드)만
            // 숏코드를 만들고 끝나서, 2라운드 이상 경기는 URL에 원래 game_id가 그대로 노출되던 문제.
            await insertGameShortCodes(roomId, newGames.map(g => ({ id: g.id }))).catch(err =>
                console.error(`[simRunner] insertGameShortCodes 실패(${roomId}):`, err),
            );
        }
    }

    await supabase.from('leagues')
        .update({ bracket_data: { series } })
        .eq('id', leagueRow.id);

    const realSeries = series.filter(s => s.lowerSeedId !== 'BYE');
    const allDone    = realSeries.length > 0 && realSeries.every(s => s.finished);
    if (allDone) {
        console.log(`[simRunner] tournament complete — archiving league=${leagueId}`);
        const { error: archiveErr } = await archiveTournament(supabase, leagueId, roomId);
        if (archiveErr) console.error('[simRunner] archive error:', archiveErr);
        await supabase.from('leagues').update({ status: 'finished' }).eq('id', leagueId);
    }
}
