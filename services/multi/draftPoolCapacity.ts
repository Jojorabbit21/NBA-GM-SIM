// 드래프트 풀 용량 검증 — "참가팀 수 × 드래프트 라운드 수"만큼의 선수가 풀에 있어야 드래프트가
// 끝까지 진행될 수 있다. 부족하면 서버 DraftRoom이 마지막 픽에서 "no available players"로
// 멈춘 채 영영 완료되지 않는다(2026-09-17 "New League" 세션: 풀 431명 < 30팀×15라운드=450픽,
// #431 픽에서 정지). 세션 생성(CreateLeagueModal)과 설정 저장(LeagueSettingsView) 시점에서
// 이 검사를 통과하지 못하면 아예 저장을 막는다. server/src/startDraft.ts buildDraftSetup()에도
// 같은 공식의 최종 방어선이 있다(미러) — 공식을 바꾸면 둘 다 고칠 것.
import { supabase } from '../supabaseClient';
import { mapRawPlayerToRuntimePlayer } from '../dataMapper';
import { applyMetaPlayerPoolFilter } from './draftPoolQuery';
import type { Player } from '../../types';

export interface DraftPoolFilterParams {
    draftYearMin:       number;
    draftYearMax:       number;
    ovrMin:             number;
    ovrMax:             number;
    useCustomOverrides: boolean;
}

/** 드래프트에 필요한 총 픽 수 = 참가팀 수 × 라운드 수. */
export function getRequiredDraftPicks(teamCount: number, totalRounds: number): number {
    return Math.max(0, Math.trunc(teamCount)) * Math.max(0, Math.trunc(totalRounds));
}

/**
 * 현재 풀 설정(연도 범위 + OVR 범위 + 피크 능력치 적용 여부)으로 실제 드래프트 풀에 들어갈 선수
 * 목록을 조회한다. 서버 buildDraftSetup()의 풀 구성과 동일한 필터 순서(연도 → 매핑 → OVR).
 * DraftPoolSettings의 통계 표시와 용량 검증이 같은 결과를 보도록 여기 한 곳에서만 계산한다.
 */
export async function fetchDraftPoolPlayers(params: DraftPoolFilterParams): Promise<Player[]> {
    let query = supabase
        .from('meta_players')
        .select('id, position, base_attributes, tendencies');
    query = applyMetaPlayerPoolFilter(query as any, params.draftYearMin, params.draftYearMax);

    const { data, error } = await query;
    if (error) throw new Error(`드래프트 풀 조회 실패: ${error.message}`);

    return (data as any[] ?? [])
        .map(r => mapRawPlayerToRuntimePlayer(r, params.useCustomOverrides, true))
        .filter(p => p.ovr >= params.ovrMin && p.ovr <= params.ovrMax);
}

/**
 * 풀 용량 검증. 부족하면 사용자에게 그대로 보여줄 한국어 에러 메시지를, 충분하면 null을 반환한다.
 * 조회 자체가 실패하면 예외를 던진다(호출부의 기존 try/catch 또는 에러 표시 경로로 흘려보낼 것).
 */
export async function checkDraftPoolCapacity(
    params: DraftPoolFilterParams & { teamCount: number; totalRounds: number },
): Promise<string | null> {
    const required = getRequiredDraftPicks(params.teamCount, params.totalRounds);
    if (required <= 0) return null;
    const pool = await fetchDraftPoolPlayers(params);
    return buildCapacityError(pool.length, params.teamCount, params.totalRounds);
}

/** 풀 크기와 요구 픽 수를 비교해 에러 메시지(부족) 또는 null(충분)을 만든다 — 순수 함수. */
export function buildCapacityError(poolSize: number, teamCount: number, totalRounds: number): string | null {
    const required = getRequiredDraftPicks(teamCount, totalRounds);
    if (poolSize >= required) return null;
    return `드래프트 풀이 부족합니다 — 현재 ${poolSize}명, 필요 ${required}명(${teamCount}팀 × ${totalRounds}라운드). `
        + `OVR/드래프트 연도 범위를 넓히거나 라운드 수 또는 참가팀 수를 줄여주세요.`;
}
