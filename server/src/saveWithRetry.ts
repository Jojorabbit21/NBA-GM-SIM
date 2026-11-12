/**
 * saveWithRetry.ts — DB 쓰기 한 건을 "오류 확인 + 짧은 재시도"로 감싼다 (2026-11-12).
 *
 * supabase-js 는 DB 오류를 throw 하지 않고 { error } 로 돌려준다. 결과를 확인하지 않고 넘어가면
 * "저장은 실패했는데 다음 단계는 진행된" 상태가 조용히 생긴다(예: game_pbp 없이 games.played=true —
 * 점수는 있는데 중계·박스스코어·기록이 없는 경기).
 * 이 헬퍼는 같은 요청을 몇 번 다시 보내 순간적인 끊김을 넘기고, 끝내 실패하면 마지막 오류 문구를 돌려준다.
 * 호출부는 그 값으로 다음 단계를 멈추고 바깥 재시도(스케줄러 30초 tick)에 맡긴다.
 *
 * 재시도를 2회(총 3번 시도)로 두는 이유: 바로 다시 보내서 풀리는 것은 순간 끊김뿐이다. DB 재시작·과부하는
 * 수십 초~수 분이라 바깥 tick 이 맡아야 한다. 시도 한 번이 최대 8초(API 경로 statement_timeout)라
 * 3번이면 최악 약 27초 — tick 간격(scheduler.ts POLL_INTERVAL_MS 30초) 안에 끝난다.
 *
 * 서버 전용 — 클라이언트 미러 없음. supabase 를 import 하지 않는 순수 함수라 단독으로 시험할 수 있다.
 */

/** 재시도 사이 대기(ms). 길이 = 재시도 횟수. */
export const SAVE_RETRY_WAITS_MS: readonly number[] = [1000, 2000];

type WriteResult = { error: { message: string } | null };

/**
 * 성공하면 null, 끝내 실패하면 마지막 오류 문구.
 * attempt 는 호출될 때마다 같은 내용을 다시 보내야 한다 — upsert·조건부 update/delete 처럼 반복해도 안전한 쓰기에만 쓴다
 * (응답만 유실되고 실제로는 반영된 경우에도 다시 보내기 때문).
 */
export async function saveWithRetry(
    attempt: () => PromiseLike<WriteResult>,
    label: string,
    waitsMs: readonly number[] = SAVE_RETRY_WAITS_MS,
): Promise<string | null> {
    let lastError = 'unknown error';
    for (let i = 0; i <= waitsMs.length; i++) {
        if (i > 0) await new Promise(resolve => setTimeout(resolve, waitsMs[i - 1]));
        try {
            const { error } = await attempt();
            if (!error) {
                if (i > 0) console.warn(`[saveWithRetry] ${label} — 재시도 ${i}회 만에 성공`);
                return null;
            }
            lastError = error.message;
        } catch (e) {
            // 네트워크 계층에서 던진 경우(supabase-js 는 대개 { error } 로 감싸 주지만 방어적으로 같은 실패로 취급)
            lastError = String(e);
        }
        console.error(`[saveWithRetry] ${label} — 시도 ${i + 1}/${waitsMs.length + 1} 실패: ${lastError}`);
    }
    return lastError;
}
