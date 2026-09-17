
import { supabase } from '../supabaseClient';
import type { PlayerContract } from '../../types/player';
import type { SigningType } from '../../types/fa';

// sign_free_agent()/release_player() RPC(migrations/add_sign_free_agent_release_player_rpc.sql)
// 에러 메시지를 한국어로 변환 — tradeService.ts의 mapTradeOfferError와 동일한 관례.
const mapFaError = (msg: string): string => {
    if (msg.includes('not_authenticated'))      return '로그인이 필요합니다.';
    if (msg.includes('fa_disabled'))            return '이 리그는 자유계약이 비활성화되어 있습니다.';
    if (msg.includes('team_not_found'))         return '팀을 찾을 수 없습니다.';
    if (msg.includes('not_team_owner'))         return '본인 팀에서만 계약/방출할 수 있습니다.';
    if (msg.includes('roster_full'))            return '로스터 정원이 가득 찼습니다. 다른 선수를 방출한 뒤 다시 시도하세요.';
    if (msg.includes('two_way_slots_full'))     return '투웨이 슬롯이 가득 찼습니다. 투웨이 계약을 방출한 뒤 다시 시도하세요.';
    if (msg.includes('already_on_roster'))      return '이미 로스터에 있는 선수입니다.';
    if (msg.includes('player_already_signed'))  return '다른 팀이 이미 계약한 선수입니다. 새로고침 후 다시 시도하세요.';
    if (msg.includes('player_not_on_roster'))   return '로스터에 없는 선수입니다. 새로고침 후 다시 시도하세요.';
    return '요청 처리 중 오류가 발생했습니다.';
};

export const signFreeAgent = async (teamId: string, playerId: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.rpc('sign_free_agent', { p_team_id: teamId, p_player_id: playerId });
    if (error) return { error: mapFaError(error.message ?? '') };
    return { error: null };
};

// sign_free_agent_negotiated() RPC(migrations/add_sign_free_agent_negotiated_rpc.sql) — 협상
// 화면(MultiNegotiationView.tsx)에서 evaluateFAOffer()가 수락으로 판정한 오퍼를 실제 계약으로
// 체결한다. sign_free_agent()와 달리 계약 내용(연봉/연수/signingType)을 함께 저장한다.
export const signFreeAgentNegotiated = async (
    teamId: string,
    playerId: string,
    contract: PlayerContract,
    signingType: SigningType | undefined,  // undefined = 캡 스페이스로 체결(예외 조항 미사용)
): Promise<{ error: string | null }> => {
    // [2026-09-17 Fix] signingType이 undefined면 supabase-js가 JSON 직렬화 시 p_signing_type
    // 키 자체를 통째로 생략해버려(JSON.stringify가 undefined 값을 가진 속성을 드롭) 요청에
    // 파라미터 3개만 실려 간다. DB 함수는 4개 파라미터(p_team_id/p_player_id/p_contract/
    // p_signing_type) 시그니처라 PostgREST가 매칭되는 오버로드를 못 찾고 404(PGRST202,
    // "Could not find the function ... with parameters p_contract, p_player_id, p_team_id")를
    // 반환했다 — 스키마 캐시 문제가 아니라 undefined→키 누락이 진짜 원인. ?? null로 명시적
    // SQL NULL을 보내면 키가 항상 실려가 4-파라미터 오버로드가 정상 매칭된다(DB 함수는
    // p_signing_type을 league_transactions 로그에만 쓰고 NULL 여부로 분기하지 않아 안전).
    const { error } = await supabase.rpc('sign_free_agent_negotiated', {
        p_team_id: teamId,
        p_player_id: playerId,
        p_contract: contract,
        p_signing_type: signingType ?? null,
    });
    if (error) return { error: mapFaError(error.message ?? '') };
    return { error: null };
};

export const releasePlayer = async (teamId: string, playerId: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.rpc('release_player', { p_team_id: teamId, p_player_id: playerId });
    if (error) return { error: mapFaError(error.message ?? '') };
    return { error: null };
};
