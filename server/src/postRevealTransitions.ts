/**
 * postRevealTransitions.ts — 경기 결과가 "공개"(리플레이 종료)된 뒤에만 해야 하는 서버 상태 전환 (2026-11-07).
 *
 * 서버는 경기를 시작 0~60초 전에 시뮬해 결과를 즉시 DB에 쓴다. 공개 시각 = scheduled_at + 리플레이(리그 설정, 연장 가산)
 * — DB game_reveal_at()·liveGameView.replayLengthMs()·클라 multiGameReveal.replayLengthMsFor()와 같은 식.
 * games/leagues 행은 RLS 지연이 없어서, 결과에 따라 바뀌는 상태를 시뮬 시점에 바로 쓰면 화면·뉴스로 결과가 먼저 샌다
 * (정규시즌 마지막 경기 → 포스트시즌 대진, 시리즈 확정 경기 → 남은 경기 삭제, 결승 → 리그 종료·아카이브).
 * 이 모듈은 그 전환을 "관련 경기 전부 공개" 이후로 미룬다:
 *
 *  - isRegularSeasonRevealed(): scheduler.checkSeasonCompletions 게이트(포스트시즌 시작·정규시즌 종료 스탬프·트레이드 제안 만료)
 *  - runPostRevealTransitions(): 매 tick — (1) 조기 확정 시리즈의 남은 예정 경기 삭제, (2) 전 시리즈 종료 시 아카이브 +
 *    status='finished' + 개인 팩 드래프트 정리. 둘 다 예전엔 simRunner.tryAdvanceTournamentOnce가 시뮬 즉시 했다.
 *
 * 시뮬 쪽 안전장치: 삭제가 늦어져도 이미 끝난 시리즈의 경기는 simRunner.runSimulation이 건너뛴다.
 * 결과 뉴스(시리즈 결과·우승·파이널 MVP)는 여전히 시뮬 시점에 발행하되 game_id로 RLS가 공개 시각까지 숨긴다.
 */
import { supabase } from './supabaseAdmin';
import { getRoomReplayMs } from './replayConfig';
import { replayLengthMs } from './liveGameView';
import { archiveTournament } from './shared/tournamentArchiver.ts';

type RevealRow = { scheduled_at: string | null; ot_periods: number | null };

/** rows 중 가장 늦은 공개 시각(ms). scheduled_at 없는 행은 무시(정상 경로에선 항상 채워짐). */
async function latestRevealMs(roomId: string, rows: RevealRow[]): Promise<number> {
    const replayMs = await getRoomReplayMs(roomId);
    let max = 0;
    for (const r of rows) {
        if (!r.scheduled_at) continue;
        max = Math.max(max, Date.parse(r.scheduled_at) + replayLengthMs(replayMs, r.ot_periods));
    }
    return max;
}

/** 정규시즌 경기가 전부 공개됐는가 — 호출부가 "미실행 0경기"를 이미 확인한 뒤 부른다.
 *  가장 늦은 공개는 마지막 날 경기들 중 하나이므로(연장 가산은 수 분, 날짜 간격은 그보다 큼) 최근 50경기만 본다. */
export async function isRegularSeasonRevealed(leagueId: string, roomId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('games')
        .select('scheduled_at, ot_periods')
        .eq('league_id', leagueId).eq('is_playoff', false).eq('played', true)
        .order('scheduled_at', { ascending: false })
        .limit(50);
    if (error) {
        console.error(`[postReveal] league=${leagueId} 정규시즌 공개 판정 조회 실패:`, error.message);
        return false;
    }
    return (await latestRevealMs(roomId, (data ?? []) as RevealRow[])) <= Date.now();
}

interface BracketSeriesLite { id: string; round: number; lowerSeedId: string; finished: boolean }

export async function runPostRevealTransitions(): Promise<void> {
    const { data: leagues, error } = await supabase
        .from('leagues')
        .select('id, bracket_data')
        .eq('status', 'in_progress')
        .not('bracket_data', 'is', null);
    if (error) { console.error('[postReveal] leagues 조회 실패:', error.message); return; }

    for (const league of leagues ?? []) {
        try {
            const series: BracketSeriesLite[] = ((league as any).bracket_data?.series ?? []) as BracketSeriesLite[];
            const real = series.filter(s => s.lowerSeedId !== 'BYE');
            const finishedIds = real.filter(s => s.finished).map(s => s.id);
            if (finishedIds.length === 0) continue;
            await pruneRevealedSeries(league.id, finishedIds);
            if (real.every(s => s.finished)) await finishRevealedTournament(league.id);
        } catch (err) {
            console.error(`[postReveal] league=${league.id} 처리 실패:`, err);
        }
    }
}

/** 조기 확정된 시리즈(예: 4-0)의 남은 예정 경기를, 확정 경기가 공개된 뒤에 삭제한다. */
async function pruneRevealedSeries(leagueId: string, finishedIds: string[]): Promise<void> {
    const { data: pending } = await supabase
        .from('games')
        .select('room_id, series_id')
        .eq('league_id', leagueId).eq('played', false)
        .in('series_id', finishedIds);
    if (!pending?.length) return;

    const seriesIds = [...new Set(pending.map(g => g.series_id as string))];
    const roomId = pending[0].room_id as string;
    for (const seriesId of seriesIds) {
        const { data: played } = await supabase
            .from('games')
            .select('scheduled_at, ot_periods')
            .eq('room_id', roomId).eq('series_id', seriesId).eq('played', true);
        if (!played?.length) continue;   // 경기 없이 확정될 수 없음 — 방어
        if ((await latestRevealMs(roomId, played as RevealRow[])) > Date.now()) continue;

        const { data: pruned } = await supabase
            .from('games')
            .delete()
            .eq('room_id', roomId).eq('series_id', seriesId).eq('played', false)
            .select('game_id');
        if (pruned?.length) {
            // prune된 경기의 short_code도 함께 정리(고아 short code 방지 — 예전 simRunner와 동일).
            await supabase.from('game_short_codes').delete()
                .eq('room_id', roomId).in('game_id', pruned.map(g => g.game_id));
            console.log(`[postReveal] league=${leagueId} series=${seriesId} — 공개 후 잔여 ${pruned.length}경기 삭제`);
        }
    }
}

/** 모든 시리즈가 끝났고 마지막 경기가 공개됐으면 아카이브 + status='finished' + 개인 팩 정리.
 *  archiveTournament는 멱등이 아니므로(edition 증가) status를 바꾸기 전까지 한 번만 실행돼야 한다 —
 *  scheduler tick은 겹치지 않고(tickRunning) 이 함수는 tick 안에서 순차 실행되므로, archive 직후
 *  status를 바꾸면 다음 tick의 status='in_progress' 조회에 다시 걸리지 않는다(예전 simRunner 순서와 동일). */
async function finishRevealedTournament(leagueId: string): Promise<void> {
    const { data: last } = await supabase
        .from('games')
        .select('room_id, scheduled_at, ot_periods')
        .eq('league_id', leagueId).eq('played', true)
        .not('series_id', 'is', null)
        .order('scheduled_at', { ascending: false })
        .limit(20);
    if (!last?.length) return;
    const roomId = last[0].room_id as string;
    if ((await latestRevealMs(roomId, last as RevealRow[])) > Date.now()) return;

    console.log(`[postReveal] tournament complete & revealed — archiving league=${leagueId}`);
    const { error: archiveErr } = await archiveTournament(supabase, leagueId, roomId);
    if (archiveErr) console.error('[postReveal] archive error:', archiveErr);
    await supabase.from('leagues').update({ status: 'finished' }).eq('id', leagueId);

    // [2026-09-18] 개인 팩 드래프트 룸 — 아카이빙이 끝난 뒤에만 룸 스코프 선수 인스턴스/상태/진행 행을
    // 지운다(아카이브 테이블은 이름·포지션을 비정규화 저장하므로 삭제 후에도 과거 기록 조회는 영향 없음).
    // 아카이브가 실패했으면 다음 재시도 때 박스스코어를 다시 읽어야 하므로 지우지 않는다.
    // 공유풀 드래프트 룸에선 지울 행이 없어 no-op. migrations/add_personal_draft_room_ops.sql 참조.
    if (!archiveErr) {
        const { data: cleaned, error: cleanErr } = await supabase.rpc('personal_draft_cleanup_room', { p_room_id: roomId });
        if (cleanErr) console.error('[postReveal] personal_draft_cleanup_room error:', cleanErr.message);
        else if (cleaned && (cleaned as any).instances > 0) console.log(`[postReveal] personal draft cleanup room=${roomId}: ${JSON.stringify(cleaned)}`);
    }
}
