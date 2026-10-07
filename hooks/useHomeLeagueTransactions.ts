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
