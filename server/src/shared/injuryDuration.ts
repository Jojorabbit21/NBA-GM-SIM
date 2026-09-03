/**
 * injuryDuration.ts — 부상/출장정지 duration 문자열 → 실제 복귀 날짜 변환 (서버 전용)
 *
 * 미러 쌍: services/simulation/userGameService.ts의 durationToDays()/computeReturnDate().
 * 그쪽을 고치면 여기도 같이 고칠 것 (docs/history/dev-log.md에 함께 기록).
 *
 * 서버 엔진(server/src/shared/engine/pbp/stateUpdater.ts)은 부상 발생 시 p.returnDate에
 * "2주"/"시즌아웃" 같은 duration 원본 문자열을 그대로 넣는다(실제 날짜로 변환하지 않음).
 * 싸움으로 인한 출장정지(statsMappers.ts)는 같은 필드에 "3경기" 형식으로 들어온다.
 * 이 파일이 room_player_state에 쓸 실제 return_date를 계산한다.
 *
 * 클라이언트(싱글)와 다른 점 2가지:
 *   - "시즌아웃": 싱글은 180일 고정값으로 근사하지만, 멀티는 압축 스케줄(가상 날짜)이라
 *     실제 시즌 길이와 안 맞는다 — 날짜 대신 null을 반환하고 season_number로 스코프한다
 *     (해당 시즌이 끝날 때까지 활성 취급).
 *   - "N경기" (부상이 아니라 싸움 출장정지 전용, 부상과 같은 필드로 흘러들어온다): 싱글엔
 *     없는 케이스. 해당 팀의 다음 미실행 경기 N개를 조회해 N번째 경기 날짜를 복귀일로 쓴다.
 */

import { createClient } from '@supabase/supabase-js';

type SupabaseClient = ReturnType<typeof createClient>;

/** GRADE1~5 부상 duration 문자열 → 일수. 구 "시즌아웃"/출장정지(N경기)는 resolveReturnDate가
 *  별도 처리. "N개월"/"N주"/"N일"은 정규식으로 일반화(GRADE_CONFIG의 신규 기간 추가 시 이
 *  함수를 안 건드려도 됨) — 클라이언트 userGameService.ts의 durationToDays()와 미러 쌍. */
function durationToDays(dur: string): number {
    switch (dur) {
        // GRADE1
        case '1일': return 1;
        case '당일 복귀': return 2;
        case '3일': return 3;
        case '1주': return 7;
        // GRADE2
        case '2주': return 14;
        case '3주': return 21;
        case '1개월': return 30;
        // 레거시 호환 (클라이언트 durationToDays와 동일하게 유지)
        case 'Day-to-Day': return 2;
        case '3 Days': return 3;
        case '1 Week': return 7;
        case '2 Weeks': return 14;
        case '1 Month': return 30;
    }
    // GRADE3~5: "N개월"/"N주"/"N일" 일반 패턴
    const monthMatch = dur.match(/^(\d+)개월$/);
    if (monthMatch) return Number(monthMatch[1]) * 30;
    const weekMatch = dur.match(/^(\d+)주$/);
    if (weekMatch) return Number(weekMatch[1]) * 7;
    const dayMatch = dur.match(/^(\d+)일$/);
    if (dayMatch) return Number(dayMatch[1]);
    return 7;
}

function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

/**
 * duration 문자열 → 실제 복귀 날짜(YYYY-MM-DD) 또는 null(시즌아웃 — season_number로 스코프).
 *
 * @param occurredDate 부상/출장정지가 발생한 인게임 날짜 (games.game_date)
 */
export async function resolveReturnDate(
    supabase: SupabaseClient,
    roomId: string,
    teamId: string,
    occurredDate: string,
    duration: string,
): Promise<string | null> {
    if (duration === '시즌아웃') return null;

    const suspensionMatch = duration.match(/^(\d+)경기$/);
    if (suspensionMatch) {
        const n = parseInt(suspensionMatch[1], 10);
        const { data: upcoming } = await supabase
            .from('games')
            .select('game_date, game_seq')
            .eq('room_id', roomId)
            .eq('played', false)
            .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
            .order('game_seq', { ascending: true })
            .limit(n);
        const nth = (upcoming as any[] | null)?.[n - 1];
        if (nth?.game_date) return nth.game_date as string;
        // 폴백: 예정된 경기가 N개 미만이면(시즌 막바지 등) 대략적인 날짜로 근사.
        return addDays(occurredDate, n * 2);
    }

    return addDays(occurredDate, durationToDays(duration));
}
