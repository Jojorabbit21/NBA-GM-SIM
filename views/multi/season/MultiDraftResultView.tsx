import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../../services/supabaseClient';
import { useGame } from '../../../hooks/useGameContext';
import { useLeagueContext } from '../league/LeagueLayout';
import { useMultiSearchData } from '../../../hooks/useMultiSearchData';
import { usePlayerShortCodes } from '../../../hooks/usePlayerShortCodes';
import { Spinner } from '../../../components/common/Spinner';
import { EmptyState } from '../../../components/common/EmptyState';
import { PlayerHoverCard } from '../../../components/common/PlayerHoverCard';
import { TeamHover } from '../../../components/common/TeamHover';
import { TeamMark } from '../../../components/common/TeamMark';
import { Table, TableHead, TableBody, TableHeaderCell, TableCell } from '../../../components/common/Table';

// 드래프트 결과 화면 — /season/draft-result. [2026-10-22] 신설. 헤더 "리그" 드롭다운(MultiHeaderNavMenu)에서만 진입한다
// (사이드바 메뉴에는 일부러 넣지 않음 — 사용자 요청). 데이터는 공용 풀 드래프트의 지명 기록(draft_picks)이며,
// 드래프트 완료 시 뉴스피드로 가는 "드래프트 결과" 서신(server/src/postDraftResultNews.ts)은 1라운드만 싣고
// 전체 라운드는 이 화면으로 안내한다. 개인 팩 드래프트(카드)는 draft_picks를 쓰지 않아 기록이 없으면 빈 상태로 보인다.
//
// 격자 하나만 제공: 행 = 팀(1열 드래프트 순위, 2열 팀 이름 — 둘 다 sticky), 열 = 라운드, 셀 = 선수 이름(text-sm).
// 리스트 뷰·OVR 표시·필터는 사용자 결정으로 뺐다(2026-10-22).

interface DraftPickRow {
    pick_index: number;
    round: number;
    slot: number;
    team_id: string;
    player_id: string;
    player_name: string;
}

const PICK_COLS = 'pick_index, round, slot, team_id, player_id, player_name';
// 고정 열 너비 — 순위/팀 열은 sticky라 폭이 흔들리면 안 된다. 라운드 열은 고정 폭으로 가로 스크롤.
const RANK_COL_WIDTH = 56;
const TEAM_COL_WIDTH = 176;
const ROUND_COL_WIDTH = 128;

/** 서버 server/src/shared/playoffSeeder.ts seasonLabelFor()와 같은 표기('2026-27'). 클라이언트엔 공용 함수가 없어 여기서 계산. */
function seasonLabelFor(virtualSeasonYear: number | null | undefined): string {
    const y = virtualSeasonYear ?? new Date().getFullYear();
    return `${y}-${String(y + 1).slice(2)}`;
}

function useDraftPicks(roomId: string | undefined | null) {
    return useQuery({
        queryKey: ['draftPicks', roomId ?? null],
        enabled: !!roomId,
        // 앱 기본 staleTime이 Infinity라 드래프트 진행 중에 열어 둔 빈/부분 결과가 굳을 수 있어 매번 갱신
        staleTime: 0,
        queryFn: async (): Promise<DraftPickRow[]> => {
            const { data, error } = await supabase.from('draft_picks').select(PICK_COLS).eq('room_id', roomId!).order('pick_index', { ascending: true });
            if (error) throw error;
            return (data ?? []) as DraftPickRow[];
        },
    });
}

const MultiDraftResultView: React.FC = () => {
    const { league, room, leagueTeams, members, isLoading: leagueLoading } = useLeagueContext();
    const { session } = useGame();
    const { poolPlayers } = useMultiSearchData(league, leagueTeams);
    const { getPlayerUrlId } = usePlayerShortCodes();
    const navigate = useNavigate();
    const { leagueId } = useParams<{ leagueId: string }>();
    const { data: picks = [], isPending } = useDraftPicks(room?.id);

    const myTeamId = useMemo(
        () => members.find(m => m.user_id === session?.user?.id)?.team_id ?? null,
        [members, session],
    );
    const teamBySlug = useMemo(() => new Map(leagueTeams.map(t => [t.team_slug, t])), [leagueTeams]);
    const playerById = useMemo(() => new Map(poolPlayers.map(p => [p.id, p])), [poolPlayers]);

    const rounds = useMemo(() => [...new Set(picks.map(p => p.round))].sort((a, b) => a - b), [picks]);
    // 행 순서 = 드래프트 순위(1라운드 slot). 1라운드 기록이 없는 팀은 뒤에 이름순(순위 '—').
    const teamRows = useMemo(() => {
        const ranked = picks.filter(p => p.round === 1).sort((a, b) => a.slot - b.slot)
            .map(p => ({ slug: p.team_id, rank: p.slot as number | null }));
        const seen = new Set(ranked.map(r => r.slug));
        const rest = leagueTeams
            .filter(t => !seen.has(t.team_slug) && picks.some(p => p.team_id === t.team_slug))
            .sort((a, b) => a.team_name.localeCompare(b.team_name, 'ko'))
            .map(t => ({ slug: t.team_slug, rank: null as number | null }));
        return [...ranked, ...rest];
    }, [picks, leagueTeams]);
    const pickByTeamRound = useMemo(() => {
        const m = new Map<string, DraftPickRow>();
        for (const p of picks) m.set(`${p.team_id}:${p.round}`, p);
        return m;
    }, [picks]);

    if (leagueLoading || isPending) return <Spinner variant="page" />;

    const openPlayer = (playerId: string) => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(playerId)}`);
    const openTeam = (slug: string) => navigate(`/multi/leagues/${leagueId}/season/roster?rteam=${slug}`);

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center px-4 py-3 shrink-0 bg-slate-900 border-b border-slate-800">
                <h1 className="text-lg font-black text-white ko-tight truncate">
                    {seasonLabelFor(league?.virtual_season_year)} 드래프트 결과
                </h1>
            </div>

            <div className="flex-1 min-h-0">
                {picks.length === 0 ? (
                    <EmptyState title="드래프트 기록이 없습니다." subtitle="공용 풀 드래프트를 진행한 리그에서만 결과가 표시됩니다." />
                ) : (
                    <Table className="!rounded-none !border-x-0 !border-t-0" fullHeight dividers tableStyle={{ tableLayout: 'fixed' }}>
                        <TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm" noRow>
                            <tr className="h-10 text-slate-400 text-sm font-bold">
                                <TableHeaderCell align="center" stickyLeft={0} width={RANK_COL_WIDTH} className="bg-slate-950 z-50">순위</TableHeaderCell>
                                <TableHeaderCell align="left" stickyLeft={RANK_COL_WIDTH} width={TEAM_COL_WIDTH} className="bg-slate-950 z-50">팀</TableHeaderCell>
                                {rounds.map(r => (
                                    <TableHeaderCell key={r} align="center" width={ROUND_COL_WIDTH} className="bg-slate-950">{r}라운드</TableHeaderCell>
                                ))}
                            </tr>
                        </TableHead>
                        <TableBody>
                            {teamRows.map(({ slug, rank }) => {
                                const team = teamBySlug.get(slug);
                                const teamName = team?.team_name ?? slug;
                                const isMine = !!myTeamId && slug === myTeamId;
                                return (
                                    <tr key={slug} className={isMine ? 'bg-indigo-500/10' : undefined}>
                                        <TableCell align="center" stickyLeft={0} width={RANK_COL_WIDTH} className="text-sm font-bold text-slate-400 tabular-nums">
                                            {rank ?? '—'}
                                        </TableCell>
                                        <TableCell align="left" stickyLeft={RANK_COL_WIDTH} width={TEAM_COL_WIDTH} className="py-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <TeamMark variant="logo" teamId={slug} teamName={teamName} size="xs" />
                                                <TeamHover teamId={slug}>
                                                    <span
                                                        onClick={() => openTeam(slug)}
                                                        className="text-sm font-semibold text-slate-100 truncate cursor-pointer hover:text-indigo-400 hover:underline"
                                                    >
                                                        {teamName}
                                                    </span>
                                                </TeamHover>
                                            </div>
                                        </TableCell>
                                        {rounds.map(r => {
                                            const p = pickByTeamRound.get(`${slug}:${r}`);
                                            return (
                                                <TableCell key={r} align="center" width={ROUND_COL_WIDTH} className="py-2">
                                                    {p ? (
                                                        <PlayerHoverCard player={playerById.get(p.player_id)}>
                                                            <span
                                                                onClick={() => openPlayer(p.player_id)}
                                                                className="block truncate text-slate-200 ko-normal text-sm font-semibold cursor-pointer hover:underline hover:text-indigo-400"
                                                            >
                                                                {p.player_name}
                                                            </span>
                                                        </PlayerHoverCard>
                                                    ) : (
                                                        <span className="text-sm text-slate-700">—</span>
                                                    )}
                                                </TableCell>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </div>
        </div>
    );
};

export default MultiDraftResultView;
