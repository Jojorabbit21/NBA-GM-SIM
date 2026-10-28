import React, { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Spinner } from '../../../components/common/Spinner';
import { Dropdown, DropdownButton } from '../../../components/common/Dropdown';
import { PercentileCard } from '../../../components/player/PercentileCard';
import { useLeaderboardData, type SeasonType } from '../../../hooks/useLeaderboardData';
import { usePlayerSeasonStatsLeague } from '../../../hooks/usePlayerSeasonStatsLeague';
import { useTeamSeasonAdvancedStats } from '../../../hooks/useTeamSeasonAdvancedStats';
import { useSessionSeasons } from '../../../hooks/useSessionSeasons';
import type { LeagueRow } from '../../../services/multi/roomQueries';
import { buildPercentileCard, type PercentileRow } from '../../../utils/percentileCard';
import { INITIAL_STATS } from '../../../utils/constants';
import type { FilterItem } from '../../../data/leaderboardConfig';
import type { Team, Game, PlayerStats } from '../../../types';

// 선수 프로필 "퍼센타일" 탭 본문(멀티 전용 — PlayerDetailView 의 percentileSlot). 리더보드와 같은 계산 경로
// (useLeaderboardData + 팀 어드밴스드 RPC)를 그대로 써서 카드 값/순위가 리더보드와 어긋나지 않게 한다.
// 선수 분모(USG%·STL% 등)가 팀 어드밴스드 RPC 에 의존하므로 그 로딩이 끝나기 전엔 카드를 그리지 않는다
// (끝난 뒤 값이 바뀌면 막대가 튀어 보임).
// 시즌 구분(정규시즌/플레이오프)은 리더보드와 같은 `?season=` 쿼리 파라미터 — 새로고침·링크 공유에서 유지된다.
// 플레이오프는 선택했을 때만 해당 RPC 를 호출한다(리더보드와 같은 지연 조회).
// 시즌 드롭다운은 같은 세션(group_id+tier)에서 진행된 시즌 목록(useSessionSeasons) — `?seasonNo=` 파라미터. 지난 시즌의 방·로스터
// 불러오기는 멀티 시즌 전환(현재 DB 에 시즌 2 이상 없음)이 구현된 뒤 붙이기로 해서, 지난 시즌을 고르면 안내문만 보인다.

// 훅 인자 참조 고정 — 매 렌더 새 배열을 넘기면 리더보드 훅의 useMemo 가 매번 다시 계산된다.
const NO_FILTERS: FilterItem[] = [];
const NO_STRINGS: string[] = [];
const SORT = { key: 'ts%', direction: 'desc' as const };

const SEASON_TYPE_OPTIONS: { id: SeasonType; label: string }[] = [
    { id: 'regular', label: '정규시즌' },
    { id: 'playoff', label: '플레이오프' },
];

interface PlayerPercentileTabProps {
    teams: Team[];
    schedule: Game[];
    playerId: string;
    roomId?: string | null;
    seasonLabel: string;
    /** 현재 리그 행 — 같은 세션의 시즌 목록 조회와 현재 시즌 판별에 쓴다. */
    league?: LeagueRow | null;
    /** false 면 시즌 구분 드롭다운을 숨기고 정규시즌 고정(토너먼트 — 리더보드 hideSeasonType 과 같은 규칙). */
    allowPlayoff?: boolean;
}

export const PlayerPercentileTab: React.FC<PlayerPercentileTabProps> = ({ teams, schedule, playerId, roomId, seasonLabel, league, allowPlayoff = true }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const seasonType: SeasonType = allowPlayoff && searchParams.get('season') === 'playoff' ? 'playoff' : 'regular';
    const isPlayoff = seasonType === 'playoff';
    const [menuOpen, setMenuOpen] = useState(false);
    const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);

    // 시즌 목록 — 조회 전·실패·토너먼트여도 현재 시즌은 항상 들어 있다.
    const { data: sessionSeasons } = useSessionSeasons(league, seasonLabel);
    const seasonOptions = useMemo(() => {
        if (sessionSeasons && sessionSeasons.some(s => s.isCurrent)) return sessionSeasons;
        return [{ leagueId: league?.id ?? 'current', seasonNumber: league?.season_number ?? 1, label: seasonLabel, isCurrent: true }, ...(sessionSeasons ?? [])];
    }, [sessionSeasons, league?.id, league?.season_number, seasonLabel]);
    const currentSeason = seasonOptions.find(o => o.isCurrent) ?? seasonOptions[0];
    const seasonNoParam = Number(searchParams.get('seasonNo'));
    const selectedSeason = seasonOptions.find(o => o.seasonNumber === seasonNoParam) ?? currentSeason;
    const viewingPastSeason = !selectedSeason.isCurrent;

    const selectSeasonType = useCallback((next: SeasonType) => {
        setSearchParams(prev => {
            const params = new URLSearchParams(prev);
            if (next === 'playoff') params.set('season', 'playoff'); else params.delete('season');
            return params;
        }, { replace: true });
    }, [setSearchParams]);

    const selectSeason = useCallback((seasonNumber: number, isCurrent: boolean) => {
        setSearchParams(prev => {
            const params = new URLSearchParams(prev);
            if (isCurrent) params.delete('seasonNo'); else params.set('seasonNo', String(seasonNumber));
            return params;
        }, { replace: true });
    }, [setSearchParams]);

    const rosterIds = useMemo(() => teams.flatMap(t => t.roster.map(p => p.id)), [teams]);
    const { data: playoffStats, isPending: playoffPending } = usePlayerSeasonStatsLeague(roomId, rosterIds, true, isPlayoff);
    // buildLeagueTeams 가 채워준 teams 에는 정규시즌 스탯만 있다 — 플레이오프를 고르면 선수별 playoffStats 를 덧씌운다.
    const cardTeams = useMemo(() => {
        if (!isPlayoff || !playoffStats) return teams;
        return teams.map(t => ({
            ...t,
            roster: t.roster.map(p => ({ ...p, playoffStats: { ...INITIAL_STATS(), ...(playoffStats[p.id] ?? {}) } as PlayerStats })),
        }));
    }, [teams, isPlayoff, playoffStats]);

    const { data: teamAdvanced, isPending: advPending } = useTeamSeasonAdvancedStats(roomId, isPlayoff);
    const { sortedData } = useLeaderboardData(
        cardTeams, schedule, NO_FILTERS, SORT, 'Players', NO_STRINGS, NO_STRINGS, '', 'Traditional', seasonType, false, teamAdvanced,
    );
    const card = useMemo(() => buildPercentileCard(sortedData as PercentileRow[], playerId), [sortedData, playerId]);

    if (advPending || (isPlayoff && playoffPending)) return <Spinner variant="section" />;

    const currentLabel = SEASON_TYPE_OPTIONS.find(o => o.id === seasonType)?.label ?? '';
    return (
        <PercentileCard
            data={card}
            title="퍼센타일 랭킹"
            notice={viewingPastSeason ? `${selectedSeason.label} 시즌 데이터는 아직 불러올 수 없습니다. 지난 시즌 퍼센타일은 멀티 시즌 전환이 구현된 뒤 지원됩니다.` : undefined}
            controls={(
                <>
                    <Dropdown
                        isOpen={seasonMenuOpen}
                        onOpenChange={setSeasonMenuOpen}
                        align="left"
                        width="w-36"
                        trigger={<DropdownButton isOpen={seasonMenuOpen} label={selectedSeason.label} className="h-8 w-32 !px-3 !py-0" />}
                        items={seasonOptions.map(o => ({
                            id: String(o.seasonNumber),
                            label: <span className="truncate">{o.label}</span>,
                            active: o.seasonNumber === selectedSeason.seasonNumber,
                            onClick: () => selectSeason(o.seasonNumber, o.isCurrent),
                        }))}
                    />
                    {allowPlayoff && (
                        <Dropdown
                            isOpen={menuOpen}
                            onOpenChange={setMenuOpen}
                            align="left"
                            width="w-36"
                            trigger={<DropdownButton isOpen={menuOpen} label={currentLabel} className="h-8 w-32 !px-3 !py-0" />}
                            items={SEASON_TYPE_OPTIONS.map(o => ({
                                id: o.id,
                                label: <span className="truncate">{o.label}</span>,
                                active: o.id === seasonType,
                                onClick: () => selectSeasonType(o.id),
                            }))}
                        />
                    )}
                </>
            )}
        />
    );
};
