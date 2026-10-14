// personalDraft.ts — 개인 팩 드래프트 RPC 3종의 얇은 클라이언트 래퍼.
// docs/plan/tournament-personal-pack-draft-plan.md Phase 3/3.5 — RPC 정의는
// migrations/add_personal_draft_rpcs.sql + add_personal_draft_timer.sql 참고.
import { supabase } from '../supabaseClient';
import { actionFailure } from '../notifications/actionErrorCatalog';

// [2026-10-13] RPC RAISE 코드 → 사용자 문구(migrations/add_personal_draft_rpcs.sql, add_personal_draft_multi_pick_and_seen.sql).
// 표에 없는 원문(네트워크·권한·타임아웃)은 actionFailure가 부류별 문구로 바꾼다 — 영어 원문을 화면에 내보내지 않는다.
const PERSONAL_DRAFT_ERROR_TEXT: [RegExp, string][] = [
    [/not_personal_draft_league/, '이 리그는 개인 드래프트를 사용하지 않습니다.'],
    [/draft_not_started/,         '드래프트가 아직 시작되지 않았습니다.'],
    [/draft_already_completed/,   '드래프트가 이미 완료되었습니다.'],
    [/pack_not_generated/,        '이번 라운드 팩이 아직 준비되지 않았습니다. 잠시 후 다시 시도하세요.'],
    [/pick_count_mismatch/,       '지명할 카드 수가 맞지 않습니다. 남은 픽 수만큼 선택하세요.'],
    [/duplicate_card/,            '같은 카드를 두 번 선택했습니다.'],
    [/player_not_in_pack/,        '이번 팩에 없는 카드입니다. 팩을 새로고침합니다.'],
    [/duplicate_player/,          '같은 선수의 카드를 이미 보유했거나 선택 중입니다.'],
    [/invalid_format|invalid_round_config/, '드래프트 포맷 설정이 올바르지 않습니다. 어드민에게 문의하세요.'],
    [/not_team_owner/,            '본인 팀에서만 지명할 수 있습니다.'],
    [/team_not_found/,            '팀을 찾을 수 없습니다.'],
];
export function mapPersonalDraftError(err: { message?: string } | string | null | undefined, what: string): string {
    const msg = typeof err === 'string' ? err : (err?.message ?? '');
    for (const [re, text] of PERSONAL_DRAFT_ERROR_TEXT) if (re.test(msg)) return text;
    return actionFailure(err, what);
}

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
    if (error) return { data: null, error: mapPersonalDraftError(error, '드래프트 시작') };
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
    if (error) return { data: null, error: mapPersonalDraftError(error, '팩 불러오기') };
    return { data: data as PersonalDraftPackState, error: null };
}

/**
 * [2026-09-20] 동시 지명 — 현재 팩에서 picks_remaining 장을 한 번에 지명(개수가 다르면 서버가 거부).
 * 서버가 카드마다 팩 포함 여부·같은 실제 선수 중복을 검사한 뒤 순서대로 적용하고, 마지막 픽에서
 * 라운드가 넘어가며 다음 팩이 즉시 생성된다. RPC: submit_personal_draft_picks.
 */
export async function submitPersonalDraftPicks(
    roomId: string,
    teamId: string,
    cardIds: string[],
): Promise<{ data: PersonalDraftPickResult | null; error: string | null }> {
    const { data, error } = await supabase.rpc('submit_personal_draft_picks', {
        p_room_id: roomId,
        p_team_id: teamId,
        p_card_ids: cardIds,
    });
    if (error) return { data: null, error: mapPersonalDraftError(error, '지명') };
    return { data: data as PersonalDraftPickResult, error: null };
}

/** 현재 팩에서 한 장 픽 — 라운드 내 다중 픽이면 같은 팩에서 계속, 아니면 다음 라운드 팩이 즉시 생성됨.
 *  (동시 지명 도입 후 화면은 submitPersonalDraftPicks를 쓴다 — 단일 픽 RPC는 호환용으로 유지) */
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
    if (error) return { data: null, error: mapPersonalDraftError(error, '지명') };
    return { data: data as PersonalDraftPickResult, error: null };
}
