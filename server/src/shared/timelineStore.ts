/**
 * timelineStore.ts — league_virtual_days 테이블 접근 + 타임라인 기반 경기 실제 시각 채우기 (서버 전용).
 *
 * [2026-09-18] 순수 계산은 leagueTimeline.ts(클라이언트 미러 있음)에 두고, DB를 만지는 부분만
 * 여기 모은다. finalize.ts(시즌 생성), playoffSeeder/playInSeeder/simRunner(포스트시즌 경기 생성)가
 * 공유한다.
 */
import { supabase } from '../supabaseAdmin';
import {
    fromDbRows, toDbRows, indexTimelineByDate, assignRealTimes,
    DEFAULT_DAY_LENGTH_MIN, DEFAULT_REPLAY_MIN,
    type VirtualDayRow, type TimedGameLike,
} from './leagueTimeline';

export async function loadLeagueTimeline(leagueId: string): Promise<VirtualDayRow[]> {
    const { data, error } = await supabase
        .from('league_virtual_days')
        .select('virtual_date, day_index, kind, real_start_at, real_midnight_at, real_end_at')
        .eq('league_id', leagueId)
        .order('real_start_at', { ascending: true });
    if (error) {
        console.error(`[timelineStore] loadLeagueTimeline 실패(${leagueId}): ${error.message}`);
        return [];
    }
    return fromDbRows(data ?? []);
}

/** 기존 행을 전부 지우고 새 타임라인을 저장한다(시즌 생성/재초기화 전용). */
export async function replaceLeagueTimeline(leagueId: string, roomId: string, rows: VirtualDayRow[]): Promise<string | null> {
    const { error: delErr } = await supabase.from('league_virtual_days').delete().eq('league_id', leagueId);
    if (delErr) return delErr.message;
    const dbRows = toDbRows(leagueId, roomId, rows);
    for (let i = 0; i < dbRows.length; i += 500) {
        const { error } = await supabase.from('league_virtual_days').insert(dbRows.slice(i, i + 500));
        if (error) return error.message;
    }
    return null;
}

export interface TimelineLeagueFields {
    day_length_min?: number | null;
    replay_minutes?: number | null;
}

/**
 * 포스트시즌 경기(플레이인/본선) 생성 경로 공용 — 타임라인이 있는 리그(신규 메인리그)면 game.date
 * (가상 날짜)와 시리즈 슬롯으로 scheduledAt을 채워서 돌려주고, 타임라인이 없으면(토너먼트/구 리그)
 * 입력을 그대로 돌려준다(호출부가 예전 슬롯 방식 scheduledAt을 이미 붙여둔 상태).
 */
export function fillPostseasonRealTimes<T extends TimedGameLike>(
    games: T[], timeline: VirtualDayRow[], league: TimelineLeagueFields,
): T[] {
    if (!timeline.length || !games.length) return games;
    const dayLength = league.day_length_min ?? DEFAULT_DAY_LENGTH_MIN;
    const replay = league.replay_minutes ?? DEFAULT_REPLAY_MIN;
    const { games: timed, missing } = assignRealTimes(games, indexTimelineByDate(timeline), dayLength, replay);
    if (missing.length) {
        console.warn(`[timelineStore] 타임라인 밖 가상 날짜 경기 ${missing.length}건 — scheduledAt 미배정: ${missing.slice(0, 3).map(g => `${g.id}@${g.date}`).join(', ')}`);
    }
    return timed;
}
