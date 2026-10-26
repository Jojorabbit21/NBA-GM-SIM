/**
 * newsVirtualDate.ts — 뉴스 이벤트(league_events.sim_date)에 기록할 인게임 날짜.
 *
 * 뉴스 피드는 sim_date(가상 날짜) 내림차순 정렬이라, 실제 현실 날짜를 넣으면 가상 캘린더보다
 * 항상 뒤로 나와 최신순 최상단에 고정된다(드래프트 로터리/결과 뉴스 버그, 2026-10-26).
 * 시즌 시작 전엔 current_virtual_date()가 타임라인 첫 날짜를 돌려줘 시즌 첫 뉴스 바로 앞에 놓인다.
 * ⚠️ rooms.sim_date가 아니라 반드시 이 RPC를 쓸 것.
 */
import { supabase } from './supabaseAdmin';

/** 'YYYY-MM-DD'. RPC 실패/빈 값이면 실제 오늘 날짜로 폴백(기존 동작). */
export async function resolveNewsSimDate(roomId: string): Promise<string> {
    const { data, error } = await supabase.rpc('current_virtual_date', { p_room_id: roomId });
    if (error || !data) {
        if (error) console.error(`[newsVirtualDate] room=${roomId} current_virtual_date 실패, 실제 날짜로 폴백:`, error.message);
        return new Date().toISOString().slice(0, 10);
    }
    return String(data).slice(0, 10);
}
