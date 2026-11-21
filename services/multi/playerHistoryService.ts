
import { supabase } from '../supabaseClient';
import type { LeagueTeamRow } from './roomQueries';

export type PlayerTransactionType = 'draft' | 'trade' | 'fa' | 'waive';

export interface PlayerTransactionEntry {
    /** 인게임 날짜(YYYY-MM-DD). 드래프트는 wall-clock picked_at 날짜(시즌 시작 전이라
     * sim_date 개념이 없음), 트레이드는 sim_date_at_resolution(없으면 creation)로 대체,
     * FA/웨이브는 league_transactions.sim_date(없으면 created_at)로 대체. */
    date: string | null;
    type: PlayerTransactionType;
    /** 드래프트는 이전 소속 팀이 없어 null. */
    fromTeamAbbr: string | null;
    toTeamAbbr: string;
    /** 드래프트 전용 — round(라운드)/그 라운드 안에서 실제로 몇 번째로 뽑혔는지. 화면에서 "1R 3rd LAL"
     * 형태로 조합(순서 접미사 계산은 UI 쪽 — 수상 내역 위젯의 toOrdinal과 동일한 규칙).
     * draft_picks.slot(팀의 고정 드래프트 순번)이 아니라 pick_index로 계산 — 스네이크 짝수
     * 라운드는 역순이라 slot 1 팀이 그 라운드 마지막에 뽑는다. */
    draftRound?: number;
    draftPick?: number;
}

/**
 * 선수 프로필 "선수 이동 내역" 위젯용 — 이 선수가 이 리그(room)에서 겪은 드래프트+성사된
 * 트레이드+FA서명/방출을 최신순으로 합쳐 반환.
 *
 * 트레이드 쪽 쿼리: 이 room의 성사된(status='accepted') 트레이드 전체를 tradeService.ts의
 * listTradeHistory()와 동일한 임베드 select(OFFER_SELECT 방식, !inner 없이 평범한 임베드)로
 * 가져온 뒤, 각 트레이드의 league_trade_offer_players 배열에서 이 선수 자신의 행을 클라이언트
 * 에서 찾는다 — 이미 히스토리 탭에서 검증된 조회 패턴을 그대로 재사용(리그 하나당 트레이드가
 * 많아야 수십 건이라 room 전체를 가져와도 가벼움), 검증되지 않은 PostgREST 임베드 필터
 * 문법(!inner + 점 표기 eq)을 새로 도입하지 않기 위함.
 *
 * FA/웨이브 쪽 쿼리: league_transactions(migrations/add_league_transactions_log.sql)를
 * player_id로 직접 필터 — 트레이드와 달리 선수 1명=행 1개라 임베드 없이 바로 eq 가능.
 */
export const listPlayerTransactionHistory = async (
    roomId: string,
    playerId: string,
    leagueTeams: LeagueTeamRow[],
): Promise<PlayerTransactionEntry[]> => {
    const teamBySlug = new Map(leagueTeams.map(t => [t.team_slug, t]));
    const teamById   = new Map(leagueTeams.map(t => [t.id, t]));

    const [draftRes, tradeRes, faRes] = await Promise.all([
        supabase.from('draft_picks')
            .select('round, slot, pick_index, team_id, picked_at')
            .eq('room_id', roomId)
            .eq('player_id', playerId)
            .maybeSingle(),
        supabase.from('league_trade_offers')
            .select('sim_date_at_creation, sim_date_at_resolution, league_trade_offer_players(from_team_id, to_team_id, player_id)')
            .eq('room_id', roomId)
            .eq('status', 'accepted'),
        supabase.from('league_transactions')
            .select('type, team_id, sim_date, created_at')
            .eq('room_id', roomId)
            .eq('player_id', playerId),
    ]);

    const entries: PlayerTransactionEntry[] = [];

    const draft = draftRes.data;
    if (draft) {
        // 라운드 안 순번 = 이 픽의 pick_index − 그 라운드 첫 픽의 pick_index + 1.
        // 라운드마다 pick_index가 연속 구간이라 성립(스네이크·선형·라운드별 팀 수가 달라도 동일).
        // 조회 실패 시에만 옛 slot으로 폴백.
        let pickInRound: number = draft.slot;
        if (draft.pick_index != null) {
            const { data: firstOfRound } = await supabase.from('draft_picks')
                .select('pick_index')
                .eq('room_id', roomId)
                .eq('round', draft.round)
                .order('pick_index', { ascending: true })
                .limit(1)
                .maybeSingle();
            if (firstOfRound?.pick_index != null) pickInRound = draft.pick_index - firstOfRound.pick_index + 1;
        }
        entries.push({
            date: draft.picked_at ? String(draft.picked_at).slice(0, 10) : null,
            type: 'draft',
            fromTeamAbbr: null,
            toTeamAbbr: teamBySlug.get(draft.team_id)?.team_abbr ?? draft.team_id,
            draftRound: draft.round,
            draftPick: pickInRound,
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

    for (const row of (faRes.data ?? []) as any[]) {
        const teamAbbr = teamById.get(row.team_id)?.team_abbr ?? '?';
        const date = row.sim_date ?? (row.created_at ? String(row.created_at).slice(0, 10) : null);
        entries.push(
            row.type === 'waive'
                ? { date, type: 'waive', fromTeamAbbr: teamAbbr, toTeamAbbr: 'FA' }
                : { date, type: 'fa', fromTeamAbbr: null, toTeamAbbr: teamAbbr },
        );
    }

    return entries.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
};
