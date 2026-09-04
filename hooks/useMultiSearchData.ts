
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { mapRawPlayerToRuntimePlayer } from '../services/dataMapper';
import { calculatePlayerOvr } from '../utils/constants';
import type { Player } from '../types';
import type { LeagueRow, LeagueTeamRow } from '../services/multi/roomQueries';

const EMPTY_POOL: Player[] = [];

// [2026-08-30] 예전엔 useState+useEffect로 직접 fetch해서, 이 훅을 쓰는 화면(예: 트레이드
// 화면)이 마운트될 때마다(탭을 나갔다가 재진입할 때마다) poolPlayers가 빈 배열로 리셋되고
// meta_players fetch가 다시 끝날 때까지 poolById.get(id)?.name이 없어 선수 이름 대신
// UUID가 그대로 보였다가 fetch 완료 후에야 이름으로 바뀌는 깜빡임이 있었음. React Query로
// 옮겨서 같은 queryKey(리그+드래프트풀 설정)면 캐시를 그대로 재사용해 재방문 시 즉시
// 이름이 뜨게 함. meta_players는 사실상 불변(읽기전용)이라 staleTime을 무한으로 둠
// (hooks/usePlayerShortCodes.ts와 동일한 근거).
export function useMultiSearchData(league: LeagueRow | null, leagueTeams: LeagueTeamRow[]) {
    // roster 역인덱스: playerId → team_slug
    const rosterMap = useMemo(() => {
        const m = new Map<string, string>();
        for (const t of leagueTeams) {
            for (const pid of (t.roster ?? [])) m.set(pid, t.team_slug);
        }
        return m;
    }, [leagueTeams]);

    const draftPool = league?.draft_pool ?? 'standard';
    const ovrMin = league?.draft_ovr_min ?? 0;
    const ovrMax = league?.draft_ovr_max ?? 99;

    const { data: poolPlayers = EMPTY_POOL } = useQuery({
        queryKey: ['multiSearchPool', league?.id, draftPool, ovrMin, ovrMax],
        enabled: !!league?.id,
        staleTime: Infinity,
        gcTime: Infinity,
        queryFn: async (): Promise<Player[]> => {
            // [2026-09-04 임시 계측] FA 화면 렉 원인 실측용 — 조사 끝나면 제거할 것.
            console.time('[perf] multiSearchPool: fetch');
            const draftPools = draftPool.split(',').map((s: string) => s.trim()).filter(Boolean);
            const useCustomOverrides = draftPools.includes('alltime');

            // draftPools가 2개 이상(예: 'standard,alltime')이면 각 풀은 서로 독립적인
            // 쿼리라 순차 await로 왕복 레이턴시를 쌓을 이유가 없음 — 동시에 날리고
            // draftPools 순서대로(먼저 온 풀 우선) dedup만 순차 처리.
            const results = await Promise.all(draftPools.map(pt => {
                let q = supabase
                    .from('meta_players')
                    .select('id, name, position, base_attributes, tendencies');

                if (pt === 'standard') {
                    q = (q as any).eq('in_multi_pool', true).lt('draft_year', 2026).not('base_team_id', 'is', null);
                } else if (pt === 'alltime') {
                    q = (q as any).eq('in_multi_pool', true).eq('include_alltime', true).lt('draft_year', 2026);
                } else {
                    q = (q as any).eq('draft_year', 2026);
                }

                return q;
            }));
            console.timeEnd('[perf] multiSearchPool: fetch');

            console.time('[perf] multiSearchPool: map+ovr');
            const seenIds = new Set<string>();
            const all: Player[] = [];
            let rowCount = 0;

            for (const { data } of results) {
                if (!data) continue;

                for (const raw of data) {
                    rowCount++;
                    if (seenIds.has(raw.id)) continue;
                    seenIds.add(raw.id);
                    const player = mapRawPlayerToRuntimePlayer(raw, useCustomOverrides, true);
                    const ovr = calculatePlayerOvr(player);
                    if (ovr >= ovrMin && ovr <= ovrMax) all.push(player);
                }
            }
            console.timeEnd('[perf] multiSearchPool: map+ovr');
            console.log(`[perf] multiSearchPool: rowCount=${rowCount}, kept=${all.length}`);

            return all;
        },
    });

    return { poolPlayers, rosterMap };
}
