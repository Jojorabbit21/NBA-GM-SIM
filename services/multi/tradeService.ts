
import { supabase } from '../supabaseClient';

// ─── 타입 ──────────────────────────────────────────────────────────────────

export type TradeOfferStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired' | 'invalidated';

export interface TradeOfferPlayerRow {
    offer_id:     string;
    player_id:    string;
    from_team_id: string;
    to_team_id:   string;
}

export interface TradeOfferRow {
    id:           string;
    room_id:      string;
    league_id:    string;
    from_team_id: string;
    to_team_id:   string;
    created_by:   string;
    message:      string | null;
    status:       TradeOfferStatus;
    expires_at:   string;
    resolved_at:  string | null;
    resolved_by:  string | null;
    resolved_as_admin: boolean;
    created_at:   string;
    league_trade_offer_players: TradeOfferPlayerRow[];
}

export interface TradeBlockRow {
    team_id:   string;
    player_id: string;
    room_id:   string;
}

/** [2026-08-26] 트레이드 블록(선수 리스트)과는 별개 — 팀 단위로 "원하는 대가"를 표현하는
 * 위시리스트. league_teams 테이블에 저장(팀당 1행이 이미 존재하므로 별도 테이블 불필요). */
export interface TeamTradeRequest {
    note:              string;
    desiredPositions:  string[];
    desiredPlayerIds:  string[];
    desiredArchetypes: string[];
}

// ─── 제안 생성/응답 (RPC 래퍼) ────────────────────────────────────────────────

export interface CreateTradeOfferParams {
    roomId:       string;
    fromTeamId:   string;   // league_teams.id — 내 팀
    toTeamId:     string;   // league_teams.id — 상대 팀
    playersFrom:  string[]; // 내가 내놓는 선수
    playersTo:    string[]; // 상대에게 요구하는 선수
    message?:     string;
}

const mapTradeOfferError = (msg: string): string => {
    if (msg.includes('not_authenticated'))   return '로그인이 필요합니다.';
    if (msg.includes('same_team'))           return '같은 팀끼리는 트레이드할 수 없습니다.';
    if (msg.includes('empty_offer'))         return '최소 한 명 이상의 선수를 선택하세요.';
    if (msg.includes('message_too_long'))    return '메시지는 300자를 넘을 수 없습니다.';
    if (msg.includes('room_not_found'))      return '방을 찾을 수 없습니다.';
    if (msg.includes('trade_disabled'))      return '이 리그는 트레이드가 비활성화되어 있습니다.';
    if (msg.includes('team_not_found'))      return '팀을 찾을 수 없습니다.';
    if (msg.includes('not_team_owner'))      return '본인 팀에서만 제안을 보낼 수 있습니다.';
    if (msg.includes('target_not_human'))    return 'AI가 운영하는 팀에는 제안을 보낼 수 없습니다.';
    if (msg.includes('player_not_on_team'))  return '선택한 선수가 더 이상 해당 팀 로스터에 없습니다. 새로고침 후 다시 시도하세요.';
    if (msg.includes('player_not_tradeable')) return '상대가 트레이드 가능으로 지정하지 않은 선수입니다.';
    if (msg.includes('offer_not_found'))     return '제안을 찾을 수 없습니다.';
    if (msg.includes('offer_not_pending'))   return '이미 처리된 제안입니다. 새로고침 후 확인하세요.';
    if (msg.includes('offer_expired'))       return '유효 기간이 지난 제안입니다.';
    if (msg.includes('not_sender'))          return '본인이 보낸 제안만 취소할 수 있습니다.';
    if (msg.includes('not_recipient'))       return '본인에게 온 제안만 응답할 수 있습니다.';
    if (msg.includes('stale_offer'))         return '선택된 선수가 그 사이 다른 트레이드로 팀을 떠났습니다. 제안이 무효화됩니다.';
    return msg;
};

export const createTradeOffer = async (
    p: CreateTradeOfferParams
): Promise<{ offerId: string | null; error: string | null }> => {
    const { data, error } = await supabase.rpc('create_trade_offer', {
        p_room_id:      p.roomId,
        p_from_team_id: p.fromTeamId,
        p_to_team_id:   p.toTeamId,
        p_players_from: p.playersFrom,
        p_players_to:   p.playersTo,
        p_message:      p.message ?? null,
    });
    if (error) return { offerId: null, error: mapTradeOfferError(error.message ?? '') };
    return { offerId: data as string, error: null };
};

export type TradeOfferAction = 'accept' | 'reject' | 'cancel';

export const respondTradeOffer = async (
    offerId: string,
    action:  TradeOfferAction,
): Promise<{ error: string | null }> => {
    const { error } = await supabase.rpc('respond_trade_offer', {
        p_offer_id: offerId,
        p_action:   action,
    });
    if (error) return { error: mapTradeOfferError(error.message ?? '') };
    return { error: null };
};

// ─── 조회 ──────────────────────────────────────────────────────────────────

const OFFER_SELECT = '*, league_trade_offer_players(offer_id, player_id, from_team_id, to_team_id)';

/** 특정 팀이 받은/보낸 대기 중 제안. */
export const listPendingTradeOffers = async (
    roomId: string,
    teamId: string,
): Promise<{ incoming: TradeOfferRow[]; outgoing: TradeOfferRow[] }> => {
    const [{ data: incoming }, { data: outgoing }] = await Promise.all([
        supabase.from('league_trade_offers').select(OFFER_SELECT)
            .eq('room_id', roomId).eq('to_team_id', teamId).eq('status', 'pending')
            .order('created_at', { ascending: false }),
        supabase.from('league_trade_offers').select(OFFER_SELECT)
            .eq('room_id', roomId).eq('from_team_id', teamId).eq('status', 'pending')
            .order('created_at', { ascending: false }),
    ]);
    return {
        incoming: (incoming ?? []) as unknown as TradeOfferRow[],
        outgoing: (outgoing ?? []) as unknown as TradeOfferRow[],
    };
};

/** 어드민용 — 방 전체의 대기 중 제안. */
export const listAllPendingTradeOffers = async (roomId: string): Promise<TradeOfferRow[]> => {
    const { data } = await supabase.from('league_trade_offers').select(OFFER_SELECT)
        .eq('room_id', roomId).eq('status', 'pending')
        .order('created_at', { ascending: false });
    return (data ?? []) as unknown as TradeOfferRow[];
};

/** 리그 전체 공개 트레이드 히스토리(성사분만). */
export const listTradeHistory = async (roomId: string): Promise<TradeOfferRow[]> => {
    const { data } = await supabase.from('league_trade_offers').select(OFFER_SELECT)
        .eq('room_id', roomId).eq('status', 'accepted')
        .order('resolved_at', { ascending: false });
    return (data ?? []) as unknown as TradeOfferRow[];
};

// ─── 트레이드 블록 (일반 CRUD — RLS로 소유자/어드민만 쓰기 허용) ──────────────
// [2026-08-24] 의미 반전(opt-out → opt-in): league_trade_blocks에 행이 존재 = "이 선수는
// 트레이드 가능(공개 매물)". 체크 안 한 선수는 기본값이 트레이드 불가 — DB RPC
// (create_trade_offer/respond_trade_offer)의 EXISTS 검증 방향도 이 마이그레이션과 함께
// 반전됨(docs/history/dev-log.md 참고).

export const listTradeBlocks = async (roomId: string): Promise<TradeBlockRow[]> => {
    const { data } = await supabase.from('league_trade_blocks').select('team_id, player_id, room_id')
        .eq('room_id', roomId);
    return (data ?? []) as TradeBlockRow[];
};

export const setTradeBlock = async (
    roomId: string, teamId: string, playerId: string, tradeable: boolean,
): Promise<{ error: string | null }> => {
    if (tradeable) {
        const { error } = await supabase.from('league_trade_blocks')
            .upsert({ room_id: roomId, team_id: teamId, player_id: playerId }, { onConflict: 'team_id,player_id' });
        return { error: error?.message ?? null };
    }
    const { error } = await supabase.from('league_trade_blocks')
        .delete().eq('team_id', teamId).eq('player_id', playerId);
    return { error: error?.message ?? null };
};

// ─── 팀 단위 트레이드 요청(원하는 대가) — 트레이드 블록(선수 리스트)과 별개 기능 ──────

/** 내 팀의 "원하는 대가" 위시리스트를 갱신(league_teams 행 직접 update). */
export const updateTeamTradeRequest = async (
    teamId: string, request: TeamTradeRequest,
): Promise<{ error: string | null }> => {
    const { error } = await supabase.from('league_teams')
        .update({
            trade_request_note:           request.note.trim() || null,
            trade_request_positions:      request.desiredPositions,
            trade_request_player_ids:     request.desiredPlayerIds,
            trade_request_archetypes:     request.desiredArchetypes,
        })
        .eq('id', teamId);
    return { error: error?.message ?? null };
};
