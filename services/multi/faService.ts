
import { supabase } from '../supabaseClient';

// sign_free_agent()/release_player() RPC(migrations/add_sign_free_agent_release_player_rpc.sql)
// 에러 메시지를 한국어로 변환 — tradeService.ts의 mapTradeOfferError와 동일한 관례.
const mapFaError = (msg: string): string => {
    if (msg.includes('not_authenticated'))      return '로그인이 필요합니다.';
    if (msg.includes('fa_disabled'))            return '이 리그는 자유계약이 비활성화되어 있습니다.';
    if (msg.includes('team_not_found'))         return '팀을 찾을 수 없습니다.';
    if (msg.includes('not_team_owner'))         return '본인 팀에서만 계약/방출할 수 있습니다.';
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

export const releasePlayer = async (teamId: string, playerId: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.rpc('release_player', { p_team_id: teamId, p_player_id: playerId });
    if (error) return { error: mapFaError(error.message ?? '') };
    return { error: null };
};
