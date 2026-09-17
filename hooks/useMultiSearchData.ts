
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabaseClient';
import { mapRawPlayerToRuntimePlayer } from '../services/dataMapper';
import { calculatePlayerOvr } from '../utils/constants';
import type { Player } from '../types';
import type { LeagueRow, LeagueTeamRow } from '../services/multi/roomQueries';
import { applyMetaPlayerPoolFilter } from '../services/multi/draftPoolQuery';
import { shouldUseCustomOverrides } from '../utils/leagueOverrides';

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

    const ovrMin = league?.draft_ovr_min ?? 0;
    const ovrMax = league?.draft_ovr_max ?? 99;
    const draftYearMin = league?.draft_year_min ?? 2001;
    const draftYearMax = league?.draft_year_max ?? 2025;
    const useCustomOverrides = shouldUseCustomOverrides(league);

    const { data: poolPlayers = EMPTY_POOL } = useQuery({
        queryKey: ['multiSearchPool', league?.id, ovrMin, ovrMax, draftYearMin, draftYearMax, useCustomOverrides],
        enabled: !!league?.id,
        staleTime: Infinity,
        gcTime: Infinity,
        queryFn: async (): Promise<Player[]> => {
            // [2026-09-04 임시 계측] FA 화면 렉 원인 실측용 — 조사 끝나면 제거할 것.
            console.time('[perf] multiSearchPool: fetch');
            // [2026-09-17 Fix] draft_year가 select에 없어 mapRawPlayerToRuntimePlayer가
            // Player.draftYear를 항상 undefined로 채웠다 — 협상 화면의 YOS(연차) 계산
            // (currentSeasonYear - draftYear)이 전부 0으로 뜨던 버그, 그리고 루키 스케일
            // 자격 판정(player.draftYear === currentSeasonYear)도 같은 원인으로 전부
            // 실패하고 있었다. meta_players.draft_year는 base_attributes JSONB 안에
            // 중복 저장되지 않는 별도 컬럼이라(DB로 직접 확인) 명시적으로 select해야 한다.
            let q = supabase
                .from('meta_players')
                .select('id, name, position, draft_year, base_attributes, tendencies');
            q = applyMetaPlayerPoolFilter(q as any, draftYearMin, draftYearMax);
            const { data } = await q;
            console.timeEnd('[perf] multiSearchPool: fetch');

            console.time('[perf] multiSearchPool: map+ovr');
            const all: Player[] = [];
            for (const raw of data ?? []) {
                const player = mapRawPlayerToRuntimePlayer(raw, useCustomOverrides, true);
                const ovr = calculatePlayerOvr(player);
                if (ovr >= ovrMin && ovr <= ovrMax) all.push(player);
            }
            console.timeEnd('[perf] multiSearchPool: map+ovr');
            console.log(`[perf] multiSearchPool: rowCount=${data?.length ?? 0}, kept=${all.length}`);

            return all;
        },
    });

    return { poolPlayers, rosterMap };
}
