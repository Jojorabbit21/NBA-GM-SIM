
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from '../../../components/common/Spinner';
import { InlineNotice } from '../../../components/common/InlineNotice';
import { Search, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLeagueContext } from '../league/LeagueLayout';
import { useSeasonContext } from './seasonContext';
import { useGame } from '../../../hooks/useGameContext';
import { useMultiSearchData } from '../../../hooks/useMultiSearchData';
import { usePlayerShortCodes } from '../../../hooks/usePlayerShortCodes';
import { usePrefetchFreeAgentCareerHistory } from '../../../hooks/usePrefetchFreeAgentCareerHistory';
import { useLeagueRawStats, type LeagueRawStatsData } from '../../../hooks/useLeagueRawStats';
import { usePlayerSeasonStatsLeague } from '../../../hooks/usePlayerSeasonStatsLeague';
import { signFreeAgent } from '../../../services/multi/faService';
import { Table, TableHead, TableBody, TableHeaderCell, TableCell } from '../../../components/common/Table';
import { Button } from '../../../components/common/Button';
import { OvrBadge } from '../../../components/common/OvrBadge';
import { PlayerHoverCard } from '../../../components/common/PlayerHoverCard';
import { calculatePlayerOvr, INITIAL_STATS } from '../../../utils/constants';
import { formatMoneyFull } from '../../../utils/formatMoney';
import { shouldUseCustomOverrides } from '../../../utils/leagueOverrides';
import { getServerNow } from '../../../utils/serverClock';
import { COMPACT_ATTR_GROUPS, ATTR_NAME_MAP, getCompactAttrValue } from '../../../data/attributeConfig';
import { buildLeagueTeams } from '../../../services/multi/buildLeagueTeams';
import { computeMultiStandingsStats, computePlayoffOddsMap } from './multiSeasonUtils';
import { buildMultiFADemandBatch } from '../../../services/multi/negotiation/multiFaDemand';
import { estimateAcceptProbability } from '../../../services/fa/faValuation';
import { generateSaveTendencies } from '../../../utils/hiddenTendencies';
import { getAcceptLikelihoodLabel } from '../../../utils/contractLabels';
import type { Team } from '../../../types/team';
import type { PlayerStats } from '../../../types/player';
import { IconButton } from '../../../components/common/IconButton';
import { Pagination } from '../../../components/common/Pagination';
import { CheckboxFilterDropdown } from '../../../components/common/filters/CheckboxFilterDropdown';
import { StatFilterBar, FilterChips, type StatFilterDraft } from '../../../components/common/filters/StatFilterBar';
import { compareOperator, type Operator } from '../../../utils/statFilter';

interface StatFilterItem {
    id: string;
    attrKey: string;
    operator: Operator;
    value: number;
    label: string;
}

// 자유 계약(FA) 화면 — 독립 메뉴. [2026-09-03] 처음엔 트레이드 화면(MultiFrontOfficeView.tsx)
// 하단 탭으로 넣었다가, "트레이드 산하가 아니라 독립된 메뉴"라는 사용자 정정으로 별도
// 라우트/사이드바 메뉴로 분리했다(components/MultiSidebar.tsx, App.tsx 라우트 참고).
//
// 1단계: 드래프트에서 뽑히지 않고 드래프트풀에 남아있는 선수 목록만 테이블로 표시.
// 영입/방출(세션 샐러리캡 룰 적용)은 후속 작업.

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

// [2026-09-03] "능력치 컬럼은 전부 표시" 요청 — RosterGrid.tsx "능력치" 탭/리더보드
// Attributes 카테고리와 동일하게 COMPACT_ATTR_GROUPS(36개 raw 능력치를 21개로 압축한
// 표시 전용 뷰, data/attributeConfig.ts)를 평탄화해서 전부 컬럼으로 노출.
const ATTR_ITEMS = COMPACT_ATTR_GROUPS.flatMap(g => g.items);
const ATTR_FILTER_OPTIONS = ATTR_ITEMS.map(i => ({ value: i.key, label: i.label }));

/** [2026-10-14] embedded = 트레이드 화면(MultiFrontOfficeView)의 "자유 계약" 탭 안에서 렌더 — 상위가 제목·탭을 그리므로 h1을 숨긴다. */
const MultiFreeAgentView: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
    // [2026-09-04 임시 계측] FA 화면 렉 원인 실측용 — 조사 끝나면 이 useRef/useEffect 블록 제거할 것.
    // renderStartRef는 이 컴포넌트가 처음 호출된 시점(React가 render 함수를 부르기 시작한 시각),
    // 아래 useEffect는 커밋 후 2번의 requestAnimationFrame으로 "실제 페인트가 끝난 시점"을 근사.
    const renderStartRef = useRef(performance.now());
    useEffect(() => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                console.log(`[perf] FA view: render→paint ${(performance.now() - renderStartRef.current).toFixed(1)}ms`);
            });
        });
    }, []);

    const { league, leagueTeams, room, isLoading: leagueLoading, reload } = useLeagueContext();
    const { tendencySeed, currentSeason, schedule } = useSeasonContext();
    const { poolPlayers, rosterMap } = useMultiSearchData(league, leagueTeams);
    const { getPlayerUrlId } = usePlayerShortCodes();
    const { session } = useGame();
    const navigate = useNavigate();
    const { leagueId } = useParams<{ leagueId: string }>();

    // 로그인 유저가 관리하는 팀 — 트레이드 화면(MultiFrontOfficeView.tsx)의 myTeamRow와
    // 동일한 방식(leagueTeams.user_id === 세션 유저 id)으로 찾는다.
    const myTeamRow = useMemo(
        () => leagueTeams.find(t => t.user_id === session?.user?.id) ?? null,
        [leagueTeams, session],
    );

    // "가능성" 컬럼용 데이터 파이프라인 — MultiNegotiationView.tsx와 동일한 계산(계약 확률
    // = evaluateFAOffer가 실제로 참고하는 공식과 동일한 estimateAcceptProbability)을
    // FA 목록 여러 선수에 대해 한 번에 계산한다. myTeamRow가 없으면(소속 팀 없음) 계산해도
    // 의미가 없으므로 아래 각 단계가 자연히 빈 값/중립값으로 스킵된다.
    const useCustomOverrides = shouldUseCustomOverrides(league);
    const allRosterIds = useMemo(
        () => [...new Set(leagueTeams.flatMap(t => t.roster ?? []))],
        [leagueTeams],
    );
    const selectLeagueTeams = useCallback(
        (raw: LeagueRawStatsData): Team[] => buildLeagueTeams(raw, leagueTeams, useCustomOverrides),
        [leagueTeams, useCustomOverrides],
    );
    const { data: teams = [] } = useLeagueRawStats(room?.id, allRosterIds, selectLeagueTeams, { includePbp: false });

    // 로스터 정원(leagues.max_roster_size, 기본 15) 초과 여부 — sign_free_agent()/
    // sign_free_agent_negotiated() RPC가 서버에서도 동일하게 검증하지만(권위 있는 체크),
    // 정원이 찬 상태에서 협상 화면까지 들어갔다가 막히는 걸 막기 위해 "계약" 버튼 단계에서
    // 미리 막는다. [2026-09-16 Fix] myTeamRow.roster.length(투웨이 포함 전체 인원)를 그대로
    // 쓰면 투웨이 계약이 정규 계약 슬롯을 깎아먹어(정규 13명+투웨이 2명=15명으로 보여
    // max_roster_size=15에서 곧바로 꽉 참) 실제로는 정규 계약이 15명 미만인데도 "계약"
    // 버튼이 막혔다 — RosterOverviewGrid.tsx의 "정규 계약 슬롯" 집계와 동일하게 투웨이
    // 계약(p.contract?.type === 'two_way')은 이 카운트에서 제외한다.
    const myTeam = useMemo(
        () => (myTeamRow ? teams.find(t => t.id === myTeamRow.team_slug) ?? null : null),
        [teams, myTeamRow],
    );
    const myRegularContractCount = myTeam
        ? myTeam.roster.filter(p => p.contract?.type !== 'two_way').length
        : (myTeamRow?.roster?.length ?? 0); // teams 로딩 전 과도기 폴백
    const isMyRosterFull = !!myTeamRow && myRegularContractCount >= ((league as any)?.max_roster_size ?? 15);

    const currentSeasonYear = useMemo(() => parseInt((currentSeason || '').split('-')[0], 10) || new Date().getFullYear(), [currentSeason]);

    // 승률만 보는 대신 플레이오프 진출 확률(PO%, 승률+남은 일정 난이도 반영)을 재사용 —
    // MultiNegotiationView.tsx와 동일한 계산.
    const contenderScore = useMemo(() => {
        if (!myTeamRow || leagueTeams.length === 0 || schedule.length === 0) return 0.5;
        const slugs = leagueTeams.map(t => t.team_slug);
        const nowMs = getServerNow();
        const statsMap = computeMultiStandingsStats(slugs, schedule, nowMs);
        const oddsMap = computePlayoffOddsMap(
            leagueTeams, statsMap, schedule, nowMs,
            league?.playoff_team_count ?? 8, league?.play_in_enabled ?? true,
        );
        return oddsMap[myTeamRow.team_slug] ?? 0.5;
    }, [myTeamRow, leagueTeams, schedule, league]);

    // [버그 수정] useMultiSearchData()는 검색/필터용으로 meta_players에서 id/name/position/
    // base_attributes만 가져오고 이번 시즌 실제 박스스코어(player.stats)는 채우지 않는다 —
    // "가능성" 컬럼이 참고하는 calcFADemand()의 정확한 백분위 기반 롤 점수 경로를 타려면
    // 실제 스탯이 필요하다(MultiNegotiationView.tsx에서 이미 고친 것과 동일한 문제/해법).
    const poolPlayerIds = useMemo(() => poolPlayers.map(p => p.id), [poolPlayers]);
    const { data: statsByPlayer = {} } = usePlayerSeasonStatsLeague(room?.id, poolPlayerIds);
    const poolPlayersWithStats = useMemo(
        () => poolPlayers.map(p => statsByPlayer[p.id]
            ? { ...p, stats: { ...INITIAL_STATS(), ...statsByPlayer[p.id] } as PlayerStats }
            : p),
        [poolPlayers, statsByPlayer],
    );

    const [signingId, setSigningId] = useState<string | null>(null);
    // [2026-10-13] 서명 실패는 표 위 InlineNotice(에러 표시 정책 0-7). CBA 꺼진 리그의 즉시 계약에서만 발생하며
    // (CBA 리그는 협상 화면으로 이동만 함), 실제로는 타 팀 선점·정원 변동 같은 경합 케이스. 다음 시도 시작 시 소거.
    const [signError, setSignError] = useState<string | null>(null);

    // 1단계: 협상 없이 즉시 계약(캡 체크 없음 — 후속 작업). 성공 시 reload()로
    // leagueTeams를 갱신해 rosterMap이 업데이트되고 해당 선수가 FA 목록에서 즉시 사라진다.
    const handleSign = async (playerId: string, playerName: string) => {
        if (!myTeamRow || signingId) return;
        setSigningId(playerId);
        setSignError(null);
        const { error } = await signFreeAgent(myTeamRow.id, playerId);
        setSigningId(null);
        if (error) { setSignError(`${playerName} 계약 실패: ${error}`); return; }
        reload();
    };

    const [nameQuery, setNameQuery] = useState('');
    const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
    const [selectedArchetypes, setSelectedArchetypes] = useState<string[]>([]);

    // [2026-09-03] "리더보드의 부등호 필터 추가 기능처럼" 요청 — LeaderboardToolbar.tsx의
    // Stat Filter(카테고리+연산자+값 입력 후 칩으로 누적)를 능력치 21개 컬럼(ATTR_ITEMS)
    // 대상으로 재현.
    const [statFilters, setStatFilters] = useState<StatFilterItem[]>([]);

    // 드래프트풀 전체(poolPlayers, league.draft_pool 설정 기준)에서 어느 팀 로스터에도
    // 없는(rosterMap에 없는) 선수만 추려 OVR 내림차순+ID 오름차순(결정론적)으로 정렬.
    //
    // [2026-09-04 성능 수정] calculatePlayerOvr()는 adaptPlayerToInput+evaluatePlayerRawOVR을
    // 매번 새로 계산하는 무거운 함수라, .sort() 비교 함수 안에서 직접 호출하면 비교할 때마다
    // (선수 161명 기준 n·log₂n ≈ 1,175회 비교 × 2회 호출 ≈ 2,350회) 반복 계산돼 실측 54ms가
    // 걸렸음(콘솔 [perf] FA: undraftedPlayers filter+sort). 정렬 전 선수당 OVR을 한 번만
    // 계산해두는 Schwartzian transform으로 호출 횟수를 161회로 줄임.
    const undraftedPlayers = useMemo(() => {
        console.time('[perf] FA: undraftedPlayers filter+sort');
        const withOvr = poolPlayersWithStats
            .filter(p => !rosterMap.has(p.id))
            .map(p => ({ p, ovr: calculatePlayerOvr(p) }));
        withOvr.sort((a, b) => b.ovr - a.ovr || a.p.id.localeCompare(b.p.id));
        const result = withOvr.map(x => x.p);
        console.timeEnd('[perf] FA: undraftedPlayers filter+sort');
        return result;
    }, [poolPlayersWithStats, rosterMap]);

    // [2026-09-04] "FA 프로필 커리어 기록 로딩이 느리다" 후속 — 화면을 막지 않고 백그라운드로
    // undraftedPlayers 전체의 career_history를 미리 받아 usePlayerCareerHistory.ts가 쓰는
    // 캐시에 시딩해둔다. 실제로 특정 선수 프로필을 열 때는 이미 캐시가 있어 즉시 표시됨
    // (MultiPlayerDetailView.tsx는 수정 불필요 — 같은 쿼리키를 그대로 재사용).
    usePrefetchFreeAgentCareerHistory(useMemo(() => undraftedPlayers.map(p => p.id), [undraftedPlayers]));

    // 아키타입 드롭다운 옵션 — 고정된 전체 목록이 아니라 실제 FA풀에 존재하는 주 아키타입
    // (player.archetype, dataMapper.ts가 OVR 계산 시 같이 산출해둔 라벨)만 노출 — 팀 필터가
    // "리그에 실제로 있는 팀만" 보여주는 것과 동일한 관례.
    const archetypeOptions = useMemo(
        () => [...new Set(undraftedPlayers.map(p => p.archetype).filter((a): a is string => !!a))].sort(),
        [undraftedPlayers],
    );

    const filteredPlayers = useMemo(() => {
        console.time('[perf] FA: filteredPlayers');
        const q = nameQuery.trim();
        const result = undraftedPlayers.filter(p => {
            if (q && !p.name.includes(q)) return false;
            if (selectedPositions.length > 0 && !selectedPositions.includes(p.position)) return false;
            if (selectedArchetypes.length > 0 && (!p.archetype || !selectedArchetypes.includes(p.archetype))) return false;
            for (const f of statFilters) {
                const item = ATTR_ITEMS.find(i => i.key === f.attrKey);
                if (!item) continue;
                if (!compareOperator(getCompactAttrValue(p, item), f.operator, f.value)) return false;
            }
            return true;
        });
        console.timeEnd('[perf] FA: filteredPlayers');
        return result;
    }, [undraftedPlayers, nameQuery, selectedPositions, selectedArchetypes, statFilters]);

    // [2026-09-04] "리더보드 화면 구조 적용" 요청 — LeaderboardView.tsx의 페이지네이션(기본
    // 50명, 25/50/75/100 선택, 가운데 페이지 번호+양옆 화살표, 좌측 "총 N명 중 X-Y" 표시)을
    // 그대로 재현. 필터가 바뀌면 이전 페이지 번호가 범위를 벗어날 수 있어 1페이지로 리셋.
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(50);
    useEffect(() => setCurrentPage(1), [nameQuery, selectedPositions, selectedArchetypes, statFilters]);
    const pagedPlayers = filteredPlayers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // "가능성" 컬럼 — 현재 페이지에 보이는 선수만 계산(전체 FA 풀 수백 명을 매번 계산하면
    // 낭비라 페이지네이션과 자연스럽게 범위를 맞춤). 각 선수가 "자신이 요구하는 조건"
    // (askingSalary/askingYears)으로 오퍼를 받았다고 가정했을 때의 체결 확률 — 협상 화면의
    // "체결 가능성"과 완전히 동일한 공식(estimateAcceptProbability)을 재사용한다.
    const likelihoodByPlayerId = useMemo(() => {
        const result = new Map<string, ReturnType<typeof getAcceptLikelihoodLabel>>();
        if (!myTeamRow || !league || teams.length === 0 || pagedPlayers.length === 0) return result;
        const demandByPlayerId = buildMultiFADemandBatch(
            pagedPlayers, poolPlayersWithStats, teams, league.salary_cap_amount,
            currentSeasonYear, currentSeason, tendencySeed ?? '',
        );
        for (const p of pagedPlayers) {
            const demand = demandByPlayerId.get(p.id);
            if (!demand) continue;
            const tendencies = generateSaveTendencies(tendencySeed ?? '', p.id);
            // raisePercent 미지정 — 이 "가능성" 컬럼은 항상 정액(요구가/요구연수 그대로)
            // 오퍼를 가정하므로 하향식 페널티(declinePenalty, faValuation.ts 참고)는
            // financialAmbition을 넘겨도 어차피 발동 안 함(일관성을 위해 넘겨둠).
            const probability = estimateAcceptProbability(
                { salary: demand.askingSalary, years: demand.askingYears },
                demand, tendencies.winDesire, contenderScore, tendencies.financialAmbition,
            );
            result.set(p.id, getAcceptLikelihoodLabel(probability));
        }
        return result;
    }, [myTeamRow, league, teams, pagedPlayers, poolPlayersWithStats, currentSeasonYear, currentSeason, tendencySeed, contenderScore]);

    const handleItemsPerPageChange = (val: number) => {
        setItemsPerPage(val);
        setCurrentPage(1);
    };

    const handleAddStatFilter = (draft: StatFilterDraft) => {
        setStatFilters(prev => [...prev, { id: `${Date.now()}`, attrKey: draft.category, operator: draft.operator, value: draft.value, label: draft.label }]);
    };

    if (leagueLoading) {
        return (
            <Spinner variant="page" />
        );
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex flex-col shrink-0 bg-slate-900 border-b border-slate-800">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                    {!embedded && <h1 className="text-lg font-black text-white ko-tight truncate shrink-0">자유 계약</h1>}

                    <div className="flex flex-wrap items-center gap-3 ml-auto">
                        <div className="relative h-[36px] bg-slate-950 rounded-lg border border-slate-800 hover:border-slate-700 transition-colors shadow-sm shrink-0 w-48">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                                <Search size={14} />
                            </div>
                            <input
                                type="text"
                                placeholder="이름으로 검색"
                                value={nameQuery}
                                onChange={e => setNameQuery(e.target.value)}
                                className="h-full w-full bg-transparent pl-9 pr-3 text-sm font-bold text-white outline-none placeholder:text-slate-600"
                            />
                            {nameQuery && (
                                <IconButton label="검색어 지우기" size="xs" tone="ghost" onClick={() => setNameQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                                    <X size={12} />
                                </IconButton>
                            )}
                        </div>

                        {/* [2026-09-03] "헤더 필터는 리더보드 화면과 동일하게" — 리더보드 툴바의 체크박스 드롭다운을
                            복제해 쓰다가 [2026-10-12] components/common/filters/CheckboxFilterDropdown.tsx로 공용화. */}
                        <CheckboxFilterDropdown label="포지션" options={[...POSITIONS]} selected={selectedPositions} onChange={setSelectedPositions} />
                        <CheckboxFilterDropdown label="아키타입" options={archetypeOptions} selected={selectedArchetypes} onChange={setSelectedArchetypes} />

                        {/* [2026-09-03] "리더보드의 부등호 필터 추가 기능처럼" — 능력치(ATTR_ITEMS)
                            카테고리+연산자+값을 골라 추가하면 아래 칩 목록에 누적된다. */}
                        <StatFilterBar options={ATTR_FILTER_OPTIONS} onAdd={handleAddStatFilter} />
                    </div>
                </div>

                <FilterChips chips={statFilters} onRemove={id => setStatFilters(prev => prev.filter(f => f.id !== id))} onClear={() => setStatFilters([])} />

            </div>

            {signError && <InlineNotice tone="danger" className="shrink-0">{signError}</InlineNotice>}

            <div className="flex-1 min-h-0">
                <Table className="!rounded-none !border-x-0 !border-t-0" fullHeight tableStyle={{ tableLayout: 'auto', width: '100%' }}>
                    <TableHead className="bg-slate-950 sticky top-0 z-40 shadow-sm" noRow>
                        <tr className="h-10 text-slate-400 text-sm font-bold">
                            <TableHeaderCell align="left" className="pl-4 bg-slate-950">선수</TableHeaderCell>
                            <TableHeaderCell align="center" className="bg-slate-950">포지션</TableHeaderCell>
                            <TableHeaderCell align="center" className="bg-slate-950">나이</TableHeaderCell>
                            <TableHeaderCell align="center" className="bg-slate-950">키</TableHeaderCell>
                            <TableHeaderCell align="center" className="bg-slate-950">몸무게</TableHeaderCell>
                            <TableHeaderCell align="center" className="bg-slate-950">OVR</TableHeaderCell>
                            {ATTR_ITEMS.map(item => (
                                <TableHeaderCell
                                    key={item.key}
                                    className="bg-slate-950"
                                    title={item.sourceKeys.map(k => ATTR_NAME_MAP[k] || k).join(' + ')}
                                >
                                    {item.label}
                                </TableHeaderCell>
                            ))}
                            <TableHeaderCell align="center" className="bg-slate-950">연봉</TableHeaderCell>
                            <TableHeaderCell align="center" className="bg-slate-950">가능성</TableHeaderCell>
                            <TableHeaderCell align="center" width="1%" className="pr-4 bg-slate-950">계약</TableHeaderCell>
                        </tr>
                    </TableHead>
                    <TableBody>
                        {pagedPlayers.length === 0 ? (
                            <tr>
                                <TableCell colSpan={6 + ATTR_ITEMS.length + 3} className="text-center text-slate-500 text-sm py-10">
                                    조건에 맞는 자유 계약 선수가 없습니다.
                                </TableCell>
                            </tr>
                        ) : pagedPlayers.map(p => (
                            <tr key={p.id}>
                                <TableCell align="left" className="pl-4 py-2">
                                    <PlayerHoverCard player={p}>
                                        <span
                                            onClick={() => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(p.id)}`)}
                                            className="text-slate-200 ko-normal text-sm font-semibold cursor-pointer hover:underline hover:text-indigo-400 whitespace-nowrap"
                                        >
                                            {p.name}
                                        </span>
                                    </PlayerHoverCard>
                                </TableCell>
                                <TableCell align="center" className="text-sm text-slate-400">{p.position}</TableCell>
                                <TableCell align="center" className="text-sm text-slate-400">{p.age}</TableCell>
                                <TableCell align="center" className="text-sm text-slate-400">{p.height}</TableCell>
                                <TableCell align="center" className="text-sm text-slate-400">{p.weight}</TableCell>
                                <TableCell align="center" className="">
                                    <div className="flex justify-center"><OvrBadge value={calculatePlayerOvr(p)} size="sm" className="!w-7 !h-7 !text-xs !shadow-none" /></div>
                                </TableCell>
                                {ATTR_ITEMS.map(item => (
                                    <TableCell
                                        key={item.key}
                                        align="center"
                                        className="font-semibold text-sm"
                                        value={getCompactAttrValue(p, item)}
                                        variant="attribute"
                                        colorScale
                                    />
                                ))}
                                <TableCell align="right" className="text-sm text-slate-200 whitespace-nowrap tabular-nums">{formatMoneyFull(p.salary)}</TableCell>
                                <TableCell align="center" className="text-sm whitespace-nowrap">
                                    {(() => {
                                        const likelihood = likelihoodByPlayerId.get(p.id);
                                        return likelihood
                                            ? <span className={`font-bold ${likelihood.color}`}>{likelihood.text}</span>
                                            : <span className="text-slate-600">-</span>;
                                    })()}
                                </TableCell>
                                <TableCell align="center" className="pr-4">
                                    <Button
                                        size="sm"
                                        shape="md"
                                        onClick={() => {
                                            if (league?.cba_rules_enabled) {
                                                navigate(`/multi/leagues/${leagueId}/season/negotiate/${getPlayerUrlId(p.id)}`);
                                            } else {
                                                handleSign(p.id, p.name);
                                            }
                                        }}
                                        // [2026-09-17 Fix×2] 처음엔 목록 단계에서 "정규 꽉 찼지만 투웨이 자격+여유
                                        // 있으면 활성화"를 계산했는데, myTeam(teams 배열 기반)이 뒤늦게 로딩되며
                                        // 이 계산 결과가 바뀌어(로딩 중엔 myRegularContractCount가 roster.length
                                        // 통짜 폴백을 타 부정확) 버튼이 활성화→비활성화로 깜빡이는 문제가 있었다.
                                        // 대신 협상 화면(MultiNegotiationView.tsx)이 이미 "정규 선택+정규 정원
                                        // 초과일 때만 오퍼 제출 막기 / 투웨이 선택+투웨이 정원 초과일 때만 막기"를
                                        // 정확히 구현해두고 있으므로, cba_rules_enabled 리그는 목록 단계에서 정원
                                        // 관련 판단을 아예 하지 않고 협상 화면 진입 자체를 항상 허용한다 — 실제
                                        // 차단은 그 화면의 "오퍼 제출" 버튼에서만 일어난다. CBA가 꺼진 리그는
                                        // 즉시계약 RPC(sign_free_agent)라 이 화면을 거치지 않으므로(사후 가드가
                                        // 없음) 예전처럼 목록 단계에서 정규 정원만 체크(투웨이 개념 자체가 이
                                        // RPC엔 없음).
                                        disabled={!myTeamRow || signingId !== null || (!league?.cba_rules_enabled && isMyRosterFull)}
                                        title={
                                            !myTeamRow ? '소속 팀이 있어야 계약할 수 있습니다'
                                            : (!league?.cba_rules_enabled && isMyRosterFull)
                                                ? `로스터 정원(${(league as any)?.max_roster_size ?? 15}명)이 가득 찼습니다. 선수를 방출한 뒤 다시 시도하세요.`
                                            : undefined
                                        }
                                    >
                                        계약
                                    </Button>
                                </TableCell>
                            </tr>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <Pagination
                page={currentPage}
                pageSize={itemsPerPage}
                totalItems={filteredPlayers.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={handleItemsPerPageChange}
            />
        </div>
    );
};

export default MultiFreeAgentView;
