
import { supabase } from '../supabaseClient';
import type { Game } from '../../types';
import type { PlayerBoxScore } from '../../types/engine';

// [migration 2026-08-06] rooms.schedule JSONB 정규화 — games 테이블 접근은 이 파일을 통해서만 한다.
// 상세 배경: docs/history/dev-log.md 2026-08-06 항목.

const GAME_COLS =
    'game_id, home_team_id, away_team_id, game_date, game_time, game_seq, scheduled_at, played, home_score, away_score, is_playoff, series_id, is_allstar';

// PostgREST는 timestamptz를 '2026-08-06T12:30:00+00:00' 형태로 반환하는데, 기존 JSONB엔
// JS toISOString()의 '...Z' 형태가 저장돼 있었다. AdminSimView.tsx의 scheduledAt 문자열 직접
// 비교, MultiScheduleView.tsx의 .localeCompare() 정렬이 이 경계에서 반드시 Z 형태로
// 정규화되어야 기존과 동일하게 동작한다.
function toIsoZ(v: string | null): string | undefined {
    return v ? new Date(v).toISOString() : undefined;
}

function rowToGame(r: any): Game {
    return {
        id:          r.game_id,
        homeTeamId:  r.home_team_id,
        awayTeamId:  r.away_team_id,
        date:        r.game_date,                // date 타입 → 'YYYY-MM-DD' 그대로
        time:        r.game_time ?? undefined,
        scheduledAt: toIsoZ(r.scheduled_at),
        game_seq:    r.game_seq ?? undefined,
        homeScore:   r.home_score ?? undefined,
        awayScore:   r.away_score ?? undefined,
        played:      !!r.played,
        isPlayoff:   !!r.is_playoff,
        seriesId:    r.series_id ?? undefined,
        isAllstar:   !!r.is_allstar,
    };
}

/** rooms.schedule을 대체하는 유일한 스케줄 로더. 반환 형태는 기존 Game[]과 100% 동일하다. */
export async function loadSchedule(roomId: string): Promise<Game[]> {
    const { data, error } = await supabase
        .from('games')
        .select(GAME_COLS)
        .eq('room_id', roomId)
        .order('game_seq', { ascending: true })
        .order('game_id', { ascending: true });
    if (error) {
        console.error('[gameQueries] loadSchedule error:', error.message);
        return [];
    }
    return (data ?? []).map(rowToGame);
}

/** 경기 1건만 조회 — MultiGamePbpView의 scheduledAt 해석 등 단건 조회 지점에서 사용. */
export async function loadGame(roomId: string, gameId: string): Promise<Game | null> {
    const { data, error } = await supabase
        .from('games')
        .select(GAME_COLS)
        .eq('room_id', roomId)
        .eq('game_id', gameId)
        .maybeSingle();
    if (error) {
        console.error('[gameQueries] loadGame error:', error.message);
        return null;
    }
    return data ? rowToGame(data) : null;
}

export interface GameBoxScoreData {
    homeTeamId: string; awayTeamId: string;
    homeScore: number; awayScore: number;
    homeBox: PlayerBoxScore[]; awayBox: PlayerBoxScore[];
    /** [2026-09-01] "경기 결과" 레터 카드의 쿼터별 득점 테이블용 — game_pbp.quarter_scores는
     * simRunner.ts가 경기 종료 시 computeQuarterScoresFromEvents()로 이미 계산해 저장해
     * 둔 값이라 여기서 재계산 불필요. 연장전이 있으면 4개보다 길어질 수 있어 고정 4튜플
     * (types/engine.ts의 QuarterScores)이 아니라 number[]로 느슨하게 받는다. */
    quarterScores: { home: number[]; away: number[] } | null;
}

// [2026-09-01] 뉴스피드의 "선수 활약" 카드가 그 경기의 실제 박스스코어 테이블을 인라인으로
// 보여주기 위해 신설 — game_pbp(경기 종료 시 1회 upsert되고 이후 안 바뀜, 관리자 수동
// 재시뮬레이션 제외)에서 양팀 박스스코어만 뽑아온다. loadGame()과 달리 games가 아니라
// game_pbp를 조회(점수/일정 요약이 아니라 선수별 스탯이 필요해서 — 별도 함수로 분리).
export async function loadGameBoxScore(roomId: string, gameId: string): Promise<GameBoxScoreData | null> {
    const { data, error } = await supabase
        .from('game_pbp')
        .select('home_team_id, away_team_id, home_score, away_score, home_box, away_box, quarter_scores')
        .eq('room_id', roomId)
        .eq('game_id', gameId)
        .maybeSingle();
    if (error) {
        console.error('[gameQueries] loadGameBoxScore error:', error.message);
        return null;
    }
    if (!data) return null;
    return {
        homeTeamId: data.home_team_id,
        awayTeamId: data.away_team_id,
        homeScore: data.home_score ?? 0,
        awayScore: data.away_score ?? 0,
        homeBox: data.home_box ?? [],
        awayBox: data.away_box ?? [],
        quarterScores: data.quarter_scores ?? null,
    };
}

/** 준비 완료 폴링(MultiDraftView) 전용 — 배열 전체를 안 받고 개수만 확인. */
export async function countGames(roomId: string): Promise<number> {
    const { count } = await supabase
        .from('games')
        .select('game_id', { count: 'exact', head: true })
        .eq('room_id', roomId);
    return count ?? 0;
}
