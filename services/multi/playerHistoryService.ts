
import { supabase } from '../supabaseClient';
import type { LeagueTeamRow } from './roomQueries';

export type PlayerTransactionType = 'draft' | 'trade' | 'fa' | 'waive';

export interface PlayerTransactionEntry {
    /** 인게임 날짜(YYYY-MM-DD). 드래프트는 wall-clock picked_at 날짜(시즌 시작 전이라
     * sim_date 개념이 없음), 트레이드는 sim_date_at_resolution(없으면 creation)로 대체. */
    date: string | null;
    type: PlayerTransactionType;
    /** 드래프트는 이전 소속 팀이 없어 null. */
    fromTeamAbbr: string | null;
    toTeamAbbr: string;
    /** 드래프트 전용 — round(라운드)/slot(그 라운드 내 몇 번째 픽). 화면에서 "1R 3rd LAL"
     * 형태로 조합(순서 접미사 계산은 UI 쪽 — 수상 내역 위젯의 toOrdinal과 동일한 규칙). */
    draftRound?: number;
    draftPick?: number;
}

/**
 * 선수 프로필 "선수 이동 내역" 위젯용 — 이 선수가 이 리그(room)에서 겪은 드래프트+성사된
 * 트레이드를 최신순으로 합쳐 반환.
 *
 * FA/웨이브는 멀티플레이어에 아직 기능 자체가 구현되어 있지 않아(로드맵 예정 — CLAUDE.md
 * "FA 선수 영입/방출 시스템") 이 함수가 채우지 못한다. 그 기능이 생기면 아래 Promise.all에
 * 세 번째 조회를 추가해 합류시킬 것 — PlayerTransactionType에는 이미 'fa'/'waive'를
 * 정의해뒀으니 타입 쪽은 손댈 필요 없음.
 *
 * 트레이드 쪽 쿼리: 이 room의 성사된(status='accepted') 트레이드 전체를 tradeService.ts의
 * listTradeHistory()와 동일한 임베드 select(OFFER_SELECT 방식, !inner 없이 평범한 임베드)로
 * 가져온 뒤, 각 트레이드의 league_trade_offer_players 배열에서 이 선수 자신의 행을 클라이언트
 * 에서 찾는다 — 이미 히스토리 탭에서 검증된 조회 패턴을 그대로 재사용(리그 하나당 트레이드가
 * 많아야 수십 건이라 room 전체를 가져와도 가벼움), 검증되지 않은 PostgREST 임베드 필터
 * 문법(!inner + 점 표기 eq)을 새로 도입하지 않기 위함.
 */
export const listPlayerTransactionHistory = async (
    roomId: string,
    playerId: string,
    leagueTeams: LeagueTeamRow[],
): Promise<PlayerTransactionEntry[]> => {
    const teamBySlug = new Map(leagueTeams.map(t => [t.team_slug, t]));
    const teamById   = new Map(leagueTeams.map(t => [t.id, t]));

    const [draftRes, tradeRes] = await Promise.all([
        supabase.from('draft_picks')
            .select('round, slot, team_id, picked_at')
            .eq('room_id', roomId)
            .eq('player_id', playerId)
            .maybeSingle(),
        supabase.from('league_trade_offers')
            .select('sim_date_at_creation, sim_date_at_resolution, league_trade_offer_players(from_team_id, to_team_id, player_id)')
            .eq('room_id', roomId)
            .eq('status', 'accepted'),
    ]);

    const entries: PlayerTransactionEntry[] = [];

    const draft = draftRes.data;
    if (draft) {
        entries.push({
            date: draft.picked_at ? String(draft.picked_at).slice(0, 10) : null,
            type: 'draft',
            fromTeamAbbr: null,
            toTeamAbbr: teamBySlug.get(draft.team_id)?.team_abbr ?? draft.team_id,
            draftRound: draft.round,
            draftPick: draft.slot,
        });
    }

    for (const row of (tradeRes.data ?? []) as any[]) {
        const link = (row.league_trade_offer_players ?? []).find((p: any) => p.player_id === playerId);
        if (!link) continue;
        entries.push({
            date: row.sim_date_at_resolution ?? row.sim_date_at_creation,
            type: 'trade',
            fromTeamAbbr: teamById.get(link.from_team_id)?.team_abbr ?? '?',
            toTeamAbbr: teamById.get(link.to_team_id)?.team_abbr ?? '?',
        });
    }

    return entries.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
};
