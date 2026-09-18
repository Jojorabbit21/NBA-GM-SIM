// personalDraft.ts — 개인 팩 드래프트 RPC 3종의 얇은 클라이언트 래퍼.
// docs/plan/tournament-personal-pack-draft-plan.md Phase 3/3.5 — RPC 정의는
// migrations/add_personal_draft_rpcs.sql + add_personal_draft_timer.sql 참고.
import { supabase } from '../supabaseClient';

export interface PersonalDraftPackState {
    status: 'in_progress' | 'completed';
    currentRound: number;
    picksRemaining: number;
    /** 현재 라운드에 노출된 후보 meta_players.id 목록. completed 상태면 null. */
    offeredPool: string[] | null;
    /** 팩 생성 시각(ISO) = 픽 타이머 시작점. completed면 null. */
    packStartedAt: string | null;
    /** 라운드당 제한시간(초). null이면 타이머 없음. */
    pickTimerSec: number | null;
    /** 서버 현재 시각(ISO) — 클라이언트 시계 오차 보정용. */
    serverNow: string;
    /** 이 호출에서 만료 처리로 자동 지명된 카드 수(0이면 없음). */
    autoPicked: number;
}

export interface PersonalDraftPickResult extends PersonalDraftPackState {
    /** 만료된 팩에 대한 늦은 제출 — 유저 선택은 무시되고 자동 지명이 적용됨. */
    expired: boolean;
    /** 이번 픽으로 새로 발급된 룸 스코프 인스턴스 id(expired=true면 없음). */
    draftedInstanceId?: string;
    draftedSourcePlayerId?: string;
}

/** 팀 확정 직후 1회 호출 — 진행 상태 생성 + 1라운드 팩까지 바로 반환(멱등, 재호출해도 안전). */
export async function startPersonalDraft(
    roomId: string,
    teamId: string,
): Promise<{ data: PersonalDraftPackState | null; error: string | null }> {
    const { data, error } = await supabase.rpc('start_personal_draft', {
        p_room_id: roomId,
        p_team_id: teamId,
    });
    if (error) return { data: null, error: error.message };
    return { data: data as PersonalDraftPackState, error: null };
}

/** 현재 라운드 팩 조회(없으면 생성). 만료됐으면 서버가 자동 지명 후 최신 상태를 돌려준다. */
export async function getOrGenerateRoundPack(
    roomId: string,
    teamId: string,
): Promise<{ data: PersonalDraftPackState | null; error: string | null }> {
    const { data, error } = await supabase.rpc('get_or_generate_round_pack', {
        p_room_id: roomId,
        p_team_id: teamId,
    });
    if (error) return { data: null, error: error.message };
    return { data: data as PersonalDraftPackState, error: null };
}

/** 현재 팩에서 한 장 픽 — 라운드 내 다중 픽이면 같은 팩에서 계속, 아니면 다음 라운드 팩이 즉시 생성됨. */
export async function submitPersonalDraftPick(
    roomId: string,
    teamId: string,
    sourcePlayerId: string,
): Promise<{ data: PersonalDraftPickResult | null; error: string | null }> {
    const { data, error } = await supabase.rpc('submit_personal_draft_pick', {
        p_room_id: roomId,
        p_team_id: teamId,
        p_source_player_id: sourcePlayerId,
    });
    if (error) return { data: null, error: error.message };
    return { data: data as PersonalDraftPickResult, error: null };
}
