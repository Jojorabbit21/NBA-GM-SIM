/**
 * timelineQueries.ts — league_virtual_days(고정 길이 가상 하루 타임라인) 조회.
 *
 * [2026-09-18] 리그 진입 시 useCurrentLeague가 1회 로드해 CurrentLeagueState.timeline으로 공유한다.
 * 생성 후에는 바뀌지 않으며(세션 설정 "일정" 탭의 재배치 때만 갱신) leagues 행 Realtime UPDATE 시
 * 함께 다시 읽는다. 계산 규칙은 utils/leagueTimeline.ts(서버 미러) 참조.
 */
import { supabase } from '../supabaseClient';
import { fromDbRows, type VirtualDayRow } from '../../utils/leagueTimeline';

export async function loadLeagueTimeline(leagueId: string): Promise<VirtualDayRow[]> {
    const { data, error } = await supabase
        .from('league_virtual_days')
        .select('virtual_date, day_index, kind, real_start_at, real_midnight_at, real_end_at')
        .eq('league_id', leagueId)
        .order('real_start_at', { ascending: true });
    if (error) {
        console.error('[timelineQueries] loadLeagueTimeline error:', error.message);
        return [];
    }
    return fromDbRows(data ?? []);
}
