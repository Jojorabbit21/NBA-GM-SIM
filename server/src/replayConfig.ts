/**
 * replayConfig.ts — 방(room) → 리그 리플레이 길이(leagues.replay_minutes) 조회 + 짧은 캐시.
 *
 * [2026-09-18 2단계] 리플레이(결과 공개 지연) 길이가 리그 설정이 되면서 라이브 엔드포인트
 * (/live-game, /live-games)가 요청마다 "이 방의 리플레이는 몇 분인가"를 알아야 한다. 5초 폴링 ×
 * 접속자 수만큼 호출되므로 60초 캐시를 둔다 — 설정 변경은 세션 설정에서 어드민이 드물게 하는
 * 작업이라 최대 1분 지연은 허용 범위. 같은 규칙의 미러: 클라이언트 multiGameReveal.getReplayDurationMs(),
 * DB room_replay_interval().
 */
import { supabase } from './supabaseAdmin';

export const DEFAULT_REPLAY_MINUTES = 10;
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { ms: number; expiresAt: number }>();

export async function getRoomReplayMs(roomId: string): Promise<number> {
    const hit = cache.get(roomId);
    if (hit && hit.expiresAt > Date.now()) return hit.ms;

    let minutes = DEFAULT_REPLAY_MINUTES;
    try {
        const { data: room } = await supabase.from('rooms').select('league_id').eq('id', roomId).maybeSingle();
        if (room?.league_id) {
            const { data: league } = await supabase.from('leagues').select('replay_minutes').eq('id', room.league_id).maybeSingle();
            const v = (league as any)?.replay_minutes;
            if (typeof v === 'number' && v > 0) minutes = v;
        }
    } catch (err) {
        console.error(`[replayConfig] room=${roomId} 조회 실패 — 기본 ${DEFAULT_REPLAY_MINUTES}분 사용:`, err);
    }
    const ms = minutes * 60_000;
    cache.set(roomId, { ms, expiresAt: Date.now() + CACHE_TTL_MS });
    return ms;
}

/** 테스트/설정 변경 직후 강제 무효화용. */
export function invalidateRoomReplayCache(roomId?: string): void {
    if (roomId) cache.delete(roomId); else cache.clear();
}
