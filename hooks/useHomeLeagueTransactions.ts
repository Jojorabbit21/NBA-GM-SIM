// [2026-10-06] 홈 화면 "최근 거래" 섹션의 league_transactions 조회 — pages/MultiSeasonPage.tsx 인라인 useQuery에서
// 분리. 리그 부트스트랩 게이트(hooks/useLeagueBootstrap.ts)가 같은 키·함수로 프리패치한다.
import { supabase } from '../services/supabaseClient';

export const HOME_TRANSACTIONS_LIMIT = 10;

export interface HomeLeagueTransactionRow {
    id: string;
    type: 'fa_sign' | 'waive';
    team_id: string;
    player_id: string;
    sim_date: string | null;
    created_at: string;
}

export function homeLeagueTransactionsQuery(roomId: string | undefined | null) {
    return {
        queryKey: ['homeLeagueTransactions', roomId] as const,
        queryFn: async (): Promise<HomeLeagueTransactionRow[]> => {
            const { data, error } = await supabase
                .from('league_transactions')
                .select('id, type, team_id, player_id, sim_date, created_at')
                .eq('room_id', roomId!)
                .order('created_at', { ascending: false })
                .limit(HOME_TRANSACTIONS_LIMIT);
            if (error) throw error;
            return (data ?? []) as HomeLeagueTransactionRow[];
        },
    };
}

// [2026-10-14] 트레이드 화면 "히스토리" 탭이 FA 계약·웨이버까지 보여주는 리그 트랜잭션 로그로 넓어지며 전체 목록 조회 추가.
// 홈 위젯용(위, 10건 제한)과 키를 분리 — 홈은 부트스트랩 게이트가 프리패치하는 작은 쿼리로 유지.
export interface LeagueTransactionRow extends HomeLeagueTransactionRow {
    /** fa_sign: { contract: { years: number[], … }, signingType } / waive: null */
    details: { contract?: { years?: number[] } | null } | null;
}

export function leagueTransactionsQuery(roomId: string | undefined | null) {
    return {
        queryKey: ['leagueTransactionsAll', roomId] as const,
        enabled: !!roomId,
        queryFn: async (): Promise<LeagueTransactionRow[]> => {
            const { data, error } = await supabase
                .from('league_transactions')
                .select('id, type, team_id, player_id, sim_date, created_at, details')
                .eq('room_id', roomId!)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return (data ?? []) as LeagueTransactionRow[];
        },
    };
}
