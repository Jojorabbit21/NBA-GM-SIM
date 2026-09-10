import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Check } from 'lucide-react';
import { useLeagueContext } from '../league/LeagueLayout';
import { useMultiSearchData } from '../../../hooks/useMultiSearchData';
import { usePlayerShortCodes } from '../../../hooks/usePlayerShortCodes';
import { usePlayerSeasonStatsFull } from '../../../hooks/usePlayerSeasonStatsFull';
import { useAllStarVotes } from '../../../hooks/useAllStarVotes';
import { useAllStarSideEvents } from '../../../hooks/useAllStarSideEvents';
import { PlayerHoverCard, buildPlayerCardMap, mergeStatsIntoPlayerCardMap, type PlayerCardMap } from '../../../components/common/PlayerHoverCard';
import { AllstarVoteSection, AllstarRosterTable, ThreePointContestTable, DunkContestTable, ThreePointContestResultTable, ThreePointContestShotChart, DunkContestResultTable } from './newsFeedCards';
import { AllStarHalfCourt } from '../../../components/multi/AllStarHalfCourt';
import { getRealTeamLogoUrl, getTeamLogoUrl } from '../../../utils/constants';
import type { LeagueTeamRow } from '../../../services/multi/roomQueries';
import type { AllstarVoteConference, AllstarVoteEntry, AllstarConferenceRoster, RisingStarsRosterResult } from '../../../services/multi/leagueEventPayload';
import { getAllStarKeyDates, type AllStarKeyDates } from '../../../utils/allStarSelection';

// 서버(server/src/postAllStarVoteNews.ts)가 가상 캘린더 날짜 기준 하루 1회 계산해
// league_allstar_votes에 저장한 최신 스냅샷을 그대로 읽어 보여준다 — 클라이언트 재계산이
// 아니므로 모든 유저가 동일한 득표수를 본다(docs/history/dev-log.md 2026-09-08 항목 참고).

const conferenceEntries = (c: AllstarVoteConference | undefined): AllstarVoteEntry[] =>
    c ? [...c.guards, ...c.frontcourt] : [];

const rosterConferenceIds = (c: AllstarConferenceRoster | undefined): string[] =>
    c ? [...c.starters, ...c.reserves].map(p => p.playerId) : [];

// ── 스타터 5명 세로 하프코트 배치도 ──────────────────────────────────────────
// 코트 도형 자체는 components/multi/AllStarHalfCourt.tsx(이 화면 전용, CourtPreview.tsx와
// 별개 컴포넌트 — 공유 컴포넌트를 회전/크롭/마스킹으로 우회하는 것보다 별도 컴포넌트가
// 더 단순하고 안전해 분리함) 참고. 팀 커스터마이징이 없는 리그 전체 화면이라 팀/리그 기본
// 코트 색상 대신 이 화면 전용 인디고 팔레트를 씀 — 헤더의 컨퍼런스 컬러 배지, 링크 텍스트
// 등 이 화면 곳곳이 이미 인디고 톤이라 코트도 맞춤.
const ALLSTAR_COURT_COLORS = { background: '#1e1b4b', paint: '#3730a3', line: '#a5b4fc' };
const COURT_VIEW = { w: 500, h: 474 };

// 포지션 배치: 가드 2명(백코트, roster 배열의 앞 2개 — runAllStarSelection이 이미 이 순서로
// 정렬해서 반환함)은 골대에서 먼 하단, 프론트코트 3명(뒤 3개)은 골대에 가까운 상단에 배치
// — 실제 농구 스페이싱과 동일한 방향. 2-1-2 다이아몬드 대형, 좌우 간격은 상단/하단 모두
// 130↔370로 통일. 상하 배치는 가운데 센터(starters[4])를 코트 세로 중앙(viewBox 높이
// 474의 절반=237)에 맞추고, 그 위아래로 140씩 균등하게 벌려 상단/하단 줄을 배치
// (97→237→377) — 위아래 여유(97)가 대칭이라 어느 쪽 이름표도 경계에 안 닿는다.
//   [프론트코트]         [프론트코트]
//               [프론트코트]
//   [백코트]                   [백코트]
const STARTER_SLOTS: { x: number; y: number }[] = [
    { x: 130, y: 377 }, // starters[0] — 백코트1(PG 자리, 좌측)
    { x: 370, y: 377 }, // starters[1] — 백코트2(SG 자리, 우측)
    { x: 130, y: 97  }, // starters[2] — 프론트코트1(좌측, 백코트와 동일 가로 간격)
    { x: 370, y: 97  }, // starters[3] — 프론트코트2(우측, 백코트와 동일 가로 간격)
    { x: 250, y: 237 }, // starters[4] — 프론트코트3(센터, 코트 세로 중앙)
];

// AllstarRosterPlayer(본올스타)와 RisingStarsRosterPlayer(라이징스타) 둘 다 이 3개 필드만
// 있으면 그려지므로(투표 여부 관련 필드는 안 씀) 구조적 타이핑으로 공용 재사용.
type CourtDiagramPlayer = { playerId: string; playerName: string; teamSlug: string };

const AllStarCourtDiagram: React.FC<{
    starters: CourtDiagramPlayer[];
    /** 코트 위 카드 위 소제목 — 본올스타는 "스타터", 라이징스타는 "핵심 5인" 등 문맥에 맞게. */
    title?: string;
    teamBySlug: Map<string, LeagueTeamRow>;
    playerCardMap: PlayerCardMap;
    onPlayerClick?: (playerId: string) => void;
}> = ({ starters, title = '스타터', teamBySlug, playerCardMap, onPlayerClick }) => (
    <div className="space-y-2">
        <h3 className="text-sm font-black text-slate-300 uppercase">{title}</h3>
        <div className="relative w-full rounded-lg overflow-hidden border border-slate-700" style={{ aspectRatio: `${COURT_VIEW.w} / ${COURT_VIEW.h}` }}>
            <svg viewBox={`0 0 ${COURT_VIEW.w} ${COURT_VIEW.h}`} className="absolute inset-0 w-full h-full">
                <AllStarHalfCourt background={ALLSTAR_COURT_COLORS.background} paint={ALLSTAR_COURT_COLORS.paint} line={ALLSTAR_COURT_COLORS.line} />
            </svg>
            {starters.slice(0, 5).map((p, i) => {
                const slot = STARTER_SLOTS[i];
                if (!slot) return null;
                const entry = playerCardMap.get(p.playerId);
                const team = teamBySlug.get(p.teamSlug);
                return (
                    <div
                        key={p.playerId}
                        className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1"
                        style={{ left: `${(slot.x / COURT_VIEW.w) * 100}%`, top: `${(slot.y / COURT_VIEW.h) * 100}%` }}
                    >
                        <button
                            type="button"
                            onClick={onPlayerClick ? () => onPlayerClick(p.playerId) : undefined}
                            className="w-20 h-20 shrink-0 cursor-pointer"
                        >
                            <img
                                src={getRealTeamLogoUrl(p.teamSlug)}
                                alt={team?.team_abbr ?? p.teamSlug}
                                className="w-full h-full object-contain drop-shadow"
                                onError={(ev) => {
                                    const img = ev.currentTarget;
                                    if (img.dataset.fallback !== 'old') {
                                        img.dataset.fallback = 'old';
                                        img.src = getTeamLogoUrl(p.teamSlug);
                                    } else {
                                        img.src = 'https://placehold.co/100x100?text=BPL';
                                    }
                                }}
                            />
                        </button>
                        <PlayerHoverCard player={entry?.player} teamAbbr={entry?.teamAbbr}>
                            <span
                                className={`text-base font-bold text-white bg-slate-900/80 px-1.5 py-0.5 rounded whitespace-nowrap ${onPlayerClick ? 'cursor-pointer hover:text-indigo-300 hover:underline' : ''}`}
                                onClick={onPlayerClick ? () => onPlayerClick(p.playerId) : undefined}
                            >
                                {p.playerName}
                            </span>
                        </PlayerHoverCard>
                    </div>
                );
            })}
        </div>
    </div>
);

// ── 투표 진행 스텝퍼 ──────────────────────────────────────────────────────
// voteProgress(0~1, getAllStarKeyDates().allStarVoteInterimDates가 정확히 1/4·2/4·3/4
// 지점에 있는 것과 대응)를 25% 구간으로 나눠 5단계 중 현재 단계를 표시한다. 스냅샷이 아직
// 없으면(투표 시작 전) 0단계로 표시. 화면 폭을 꽉 채우지 않고 내용 크기만큼만(w-fit) —
// 진행률 숫자/바는 표시하지 않고 단계 자체로만 진행 상황을 보여준다. 각 단계 라벨 아래엔
// keyDates에서 뽑은 해당 단계의 실제 날짜를 함께 표시.
function computeVoteStepIndex(voteProgress: number | undefined): number {
    if (voteProgress == null) return 0;
    if (voteProgress >= 1) return 4;
    if (voteProgress >= 0.75) return 3;
    if (voteProgress >= 0.5) return 2;
    if (voteProgress >= 0.25) return 1;
    return 0;
}

// [2026-09-09] 이전엔 border-b가 걸린 바깥 div와 실제 내용(w-fit) div가 분리돼 있었는데
// (구분선이 페이지 전체 폭을 덮게 하기 위함, dev-log.md 2026-09-08 "스테퍼 하단 구분선"
// 항목 참고) — 탭 그룹을 별도 섹션으로 뺀 뒤(사용자 요청)로는 우측에 더 이상 아무것도
// 안 놓으므로 그 구조(바깥 div + w-fit 안쪽 div)만 남기고 rightAction 개념은 제거했다.
const AllstarVoteStepper: React.FC<{ voteProgress: number | undefined; keyDates: AllStarKeyDates }> = ({ voteProgress, keyDates }) => {
    const stepIndex = computeVoteStepIndex(voteProgress);
    const steps = [
        { label: '투표 시작', date: keyDates.allStarVoteStart },
        { label: '1차 집계', date: keyDates.allStarVoteInterimDates[0] },
        { label: '2차 집계', date: keyDates.allStarVoteInterimDates[1] },
        { label: '3차 집계', date: keyDates.allStarVoteInterimDates[2] },
        { label: '투표 완료', date: keyDates.allStarVoteEnd },
    ];
    return (
        <div className="border-b border-slate-800 shrink-0">
            <div className="flex items-center px-6 py-4 w-fit">
                {steps.map((step, i) => {
                    const done = i < stepIndex;
                    const active = i === stepIndex;
                    return (
                        <React.Fragment key={step.label}>
                            <div className="flex items-center gap-2 shrink-0">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                                    done ? 'bg-emerald-500 text-white' : active ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500'
                                }`}>
                                    {done ? <Check size={14} strokeWidth={3} /> : i + 1}
                                </div>
                                <div className="flex flex-col leading-tight">
                                    <span className={`text-sm font-bold whitespace-nowrap ${i <= stepIndex ? 'text-white' : 'text-slate-500'}`}>{step.label}</span>
                                    <span className="text-xs text-slate-400 whitespace-nowrap">{step.date}</span>
                                </div>
                            </div>
                            {i < steps.length - 1 && (
                                <div className={`w-8 h-0.5 mx-3 shrink-0 ${done ? 'bg-emerald-500' : 'bg-slate-800'}`} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};

// ── 라이징스타 챌린지 명단 (팀장 성 기반 팀명 + 코트 이미지) ────────────────────
// [2026-09-08] "라이징스타에도 올스타처럼 코트 이미지를 추가해줘" 요청 — 본올스타의 "최종
// 결과"(코트 5인 + 리저브 표, grid-cols-[3fr_2fr]) 레이아웃을 그대로 따라, 팀별 상위 5명(이미
// 스코어 내림차순으로 정렬돼 있음 — runRisingStarsSelection() 참고)을 코트에, 나머지를 표에
// 배치한다. 본올스타와 달리 백코트/프론트코트 구분이 없는 순수 스코어 랭킹이라 코트 위 슬롯은
// 포지션과 무관하게 그냥 "상위 5명"을 담는 용도로만 씀(슬롯 자체가 좌표일 뿐 포지션 라벨을
// 렌더링하지 않아 실제로는 아무 문제 없음).
// [2026-09-08 추가] 라벨을 "핵심 5인/나머지 명단"에서 본올스타와 동일한 "스타터/리저브"로
// 통일, 리저브 표의 OVR 컬럼은 제거(showOvr 삭제). 그 아래엔 "올스타 후보 명단"과 동일한
// 포맷(AllstarVoteSection showStats)으로 팀 10명 전원의 시즌 스탯을 보여준다 — 투표가 없어
// 득표수/득표율 컬럼만 뺀다(showVotes={false}).
const RisingStarsBody: React.FC<{
    risingStars: RisingStarsRosterResult;
    teamBySlug: Map<string, LeagueTeamRow>;
    playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void;
    onPlayerClick?: (playerId: string) => void;
}> = ({ risingStars, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick }) => (
    <div className="grid grid-cols-2 divide-x divide-slate-800 min-h-full">
        <div className="p-6 space-y-6 min-w-0">
            <h2 className="flex items-center gap-2 text-2xl font-black text-white">
                <img src="/logos/real/AS/RisingA.svg" alt="" className="h-8 w-8" />
                팀 {risingStars.teamAName}
            </h2>
            <div className="grid grid-cols-[3fr_2fr] gap-4">
                <AllStarCourtDiagram starters={risingStars.teamA.slice(0, 5)} title="스타터" teamBySlug={teamBySlug} playerCardMap={playerCardMap} onPlayerClick={onPlayerClick} />
                <AllstarRosterTable label="리저브" players={risingStars.teamA.slice(5)} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} />
            </div>
            <div className="border-t border-slate-800 pt-6">
                <AllstarVoteSection label="선수 기록" entries={risingStars.teamA} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} showStats showVotes={false} />
            </div>
        </div>
        <div className="p-6 space-y-6 min-w-0">
            <h2 className="flex items-center gap-2 text-2xl font-black text-white">
                <img src="/logos/real/AS/RisingB.svg" alt="" className="h-8 w-8" />
                팀 {risingStars.teamBName}
            </h2>
            <div className="grid grid-cols-[3fr_2fr] gap-4">
                <AllStarCourtDiagram starters={risingStars.teamB.slice(0, 5)} title="스타터" teamBySlug={teamBySlug} playerCardMap={playerCardMap} onPlayerClick={onPlayerClick} />
                <AllstarRosterTable label="리저브" players={risingStars.teamB.slice(5)} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} />
            </div>
            <div className="border-t border-slate-800 pt-6">
                <AllstarVoteSection label="선수 기록" entries={risingStars.teamB} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick} showStats showVotes={false} />
            </div>
        </div>
    </div>
);

// ── 득표 리더보드: 백코트/프론트코트 셀렉터 ──────────────────────────────────
// 예전엔 백코트/프론트코트 테이블을 grid-cols-2로 나란히 뒀는데, showStats로 컬럼이 12개
// 늘어나면서 두 표를 동시에 옆에 두면 각자 폭이 너무 좁아져 — 위에 탭(MultiStandingsView.tsx의
// MODE_TABS와 동일한 스타일)을 두고 한 번에 하나만 보여주는 방식으로 전환.
type VoteGroup = 'backcourt' | 'frontcourt';

const AllstarVoteGroupPanel: React.FC<{
    conference: AllstarVoteConference;
    teamBySlug: Map<string, LeagueTeamRow>;
    playerCardMap: PlayerCardMap;
    onOpenTeam?: (teamSlug: string) => void;
    onPlayerClick?: (playerId: string) => void;
}> = ({ conference, teamBySlug, playerCardMap, onOpenTeam, onPlayerClick }) => {
    const [group, setGroup] = useState<VoteGroup>('backcourt');
    return (
        <div className="space-y-3">
            <h3 className="text-lg font-black text-slate-300 uppercase">올스타 후보 명단</h3>
            <div className="flex items-center gap-1 bg-slate-800 rounded-md p-1 w-fit">
                <button
                    type="button"
                    onClick={() => setGroup('backcourt')}
                    className={`px-3 py-1.5 rounded text-sm font-bold ko-normal transition-colors ${group === 'backcourt' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                    백코트
                </button>
                <button
                    type="button"
                    onClick={() => setGroup('frontcourt')}
                    className={`px-3 py-1.5 rounded text-sm font-bold ko-normal transition-colors ${group === 'frontcourt' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                    프론트코트
                </button>
            </div>
            <AllstarVoteSection
                label={group === 'backcourt' ? '백코트' : '프론트코트'}
                hideLabel
                entries={group === 'backcourt' ? conference.guards : conference.frontcourt}
                teamBySlug={teamBySlug} playerCardMap={playerCardMap}
                onOpenTeam={onOpenTeam} onPlayerClick={onPlayerClick}
                showStats
            />
        </div>
    );
};

// [2026-09-09] "올스타 화면에 탭 그룹을 추가해" — 올스타/라이징스타/3점 컨테스트/덩크
// 컨테스트 4개 뷰 전환용. MultiStandingsView.tsx의 MODE_TABS와 동일한 패턴.
const ALLSTAR_TABS: { id: 'main' | 'risingstars' | 'threept' | 'dunk'; label: string }[] = [
    { id: 'main', label: '올스타' },
    { id: 'risingstars', label: '라이징스타' },
    { id: 'threept', label: '3점 컨테스트' },
    { id: 'dunk', label: '덩크 컨테스트' },
];

const MultiAllStarView: React.FC = () => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, room, leagueTeams } = useLeagueContext();
    const navigate = useNavigate();
    const { getPlayerUrlId } = usePlayerShortCodes();

    // [2026-09-09] "올스타 화면에 탭 그룹을 추가해(올스타/라이징스타/3점 컨테스트/덩크
    // 컨테스트)" 요청으로 기존 2단(main/risingstars) 토글을 4단 탭으로 확장 — URL
    // 쿼리스트링에 저장(?view=risingstars 등)해서 새로고침/공유 시에도 유지되게 함.
    // MultiLeaderboardView.tsx 등 다른 시즌 화면들과 동일한 패턴.
    const [searchParams, setSearchParams] = useSearchParams();
    const rawView = searchParams.get('view');
    const view: 'main' | 'risingstars' | 'threept' | 'dunk' =
        rawView === 'risingstars' || rawView === 'threept' || rawView === 'dunk' ? rawView : 'main';

    const { poolPlayers, rosterMap } = useMultiSearchData(league, leagueTeams);
    const { data: snapshot, isLoading } = useAllStarVotes(room?.id, room?.season_number);
    // 3점/덩크 컨테스트는 league_allstar_votes가 아니라 league_events에만 저장돼 있어 별도 훅으로
    // 조회(useAllStarSideEvents.ts 참고) — allStarStart에 1회 게시되므로 투표 스냅샷과 무관.
    const { data: sideEvents, isLoading: sideEventsLoading } = useAllStarSideEvents(room?.id);

    // index.tsx의 QueryClient 기본값이 staleTime: Infinity(+로컬스토리지 영속 캐시)라, 서버가
    // 매일 새로 저장하는 스냅샷이 있어도 이 화면을 예전에(그 갱신 전에) 한 번이라도 열었으면
    // 그때의(비어 있던) 응답이 캐시에 영구 고정돼 새로고침해도 안 바뀐다 — 화면 진입 시 한 번
    // 무효화해 놓친 갱신을 흡수한다(MultiNewsFeedView.tsx의 동일 패턴).
    // [2026-09-09] allStarSideEvents(3점/덩크 컨테스트 참가자+결과)도 동일한 캐시 고정 문제를
    // 겪는다는 사용자 리포트("올스타 화면에서는 새로고침해도 안 나와") — 3점 챌린지 결과가
    // 새로 시뮬레이션된 뒤에도 이전에 이 화면을 열어본 적 있으면 그 옛날 응답(결과 없음/구버전
    // rackShots 없는 결과)이 영구 고정돼 있었다. allStarVotes와 같은 이유라 같은 자리에서
    // 함께 무효화.
    const queryClient = useQueryClient();
    useEffect(() => {
        if (room?.id && room.season_number != null) {
            queryClient.invalidateQueries({ queryKey: ['allStarVotes', room.id, room.season_number] });
        }
        if (room?.id) {
            queryClient.invalidateQueries({ queryKey: ['allStarSideEvents', room.id] });
        }
    }, [room?.id, room?.season_number, queryClient]);

    const teamBySlug = useMemo(() => {
        const m = new Map<string, LeagueTeamRow>();
        for (const t of leagueTeams) m.set(t.team_slug, t);
        return m;
    }, [leagueTeams]);

    const basePlayerCardMap = useMemo(
        () => buildPlayerCardMap(poolPlayers, rosterMap, slug => teamBySlug.get(slug)?.team_abbr),
        [poolPlayers, rosterMap, teamBySlug],
    );

    const listedPlayerIds = useMemo(() => {
        const ids: string[] = [];
        if (snapshot) {
            ids.push(
                ...conferenceEntries(snapshot.detail.east).map(e => e.playerId),
                ...conferenceEntries(snapshot.detail.west).map(e => e.playerId),
                ...rosterConferenceIds(snapshot.roster?.east),
                ...rosterConferenceIds(snapshot.roster?.west),
                ...(snapshot.roster?.risingStars?.teamA ?? []).map(p => p.playerId),
                ...(snapshot.roster?.risingStars?.teamB ?? []).map(p => p.playerId),
            );
        }
        if (sideEvents?.threePointContest) ids.push(...sideEvents.threePointContest.participants.map(p => p.playerId));
        if (sideEvents?.dunkContest) ids.push(...sideEvents.dunkContest.participants.map(p => p.playerId));
        if (sideEvents?.threePointContestResult) ids.push(...sideEvents.threePointContestResult.round1.map(e => e.playerId));
        if (sideEvents?.dunkContestResult) ids.push(...sideEvents.dunkContestResult.round1.map(e => e.playerId));
        return ids;
    }, [snapshot, sideEvents]);
    // usePlayerSeasonStatsBatch → usePlayerSeasonStatsFull 교체 — 3점 컨테스트 탭이 존
    // 슛차트(zone_c3_l/r, zone_atb3_l/c/r 등, CNR%/45%/ATB%/TS% 계산용)까지 필요해져서
    // (MultiNewsFeedView.tsx와 동일 이유) full이 batch의 상위 집합이라 이 한 곳만 바꾸면 됨.
    const { data: listedStats } = usePlayerSeasonStatsFull(room?.id, listedPlayerIds);

    const playerCardMap = useMemo(
        () => listedStats ? mergeStatsIntoPlayerCardMap(basePlayerCardMap, listedStats) : basePlayerCardMap,
        [basePlayerCardMap, listedStats],
    );

    const openPlayer = (playerId: string) => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(playerId)}`);
    const openTeam = (teamSlug: string) => navigate(`/multi/leagues/${leagueId}/season/roster?rteam=${teamSlug}`);

    const keyDates = useMemo(
        () => getAllStarKeyDates(league?.virtual_season_year ?? new Date().getFullYear()),
        [league?.virtual_season_year],
    );

    // 헤더 바(제목 + 우측 메타정보)는 다른 시즌 화면들(MultiStandingsView.tsx/
    // MultiScheduleView.tsx)과 동일한 형태(px-4 py-3, border-b, text-lg font-black h1)로
    // 통일 — 화면마다 헤더 스타일이 제각각이면 탭 전환할 때 레이아웃이 덜컥거려 보인다.
    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-3 shrink-0 bg-slate-900 border-b border-slate-800">
                <h1 className="text-lg font-black text-white ko-tight truncate">
                    {room?.season ? `${room.season}시즌 올스타 투표` : '올스타 투표'}
                </h1>
                <p className="text-sm text-slate-300 ko-normal shrink-0">
                    투표 기간 {keyDates.allStarVoteStart} ~ {keyDates.allStarVoteEnd}
                </p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-900 text-slate-200 pretendard flex flex-col">
                <AllstarVoteStepper voteProgress={snapshot?.voteProgress} keyDates={keyDates} />

                {/* [2026-09-09] 사용자 요청 — 탭 그룹을 스테퍼(셀렉터 섹션) 안에서 빼서
                    별도 그룹으로 만들고 스테퍼 아래로 이동(다른 화면들처럼 헤더 바로 아래
                    독립된 탭 바 형태). */}
                <div className="flex items-center px-6 py-3 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-1 bg-slate-800 rounded-md p-1 w-fit">
                        {ALLSTAR_TABS.map(t => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setSearchParams(t.id === 'main' ? {} : { view: t.id })}
                                className={`px-3 py-1.5 rounded text-sm font-bold ko-normal transition-colors whitespace-nowrap ${
                                    view === t.id ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {view === 'threept' ? (
                    sideEventsLoading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Loader2 size={28} className="animate-spin text-indigo-400" />
                        </div>
                    ) : sideEvents?.threePointContestResult ? (
                        // [2026-09-09] 결과가 나온 뒤에는 이 탭 자체가 결과 화면(사용자 요청) —
                        // 참가자 표 대신 결선/예선 순위표를 보여준다.
                        <div className="p-6 space-y-6">
                            <h2 className="flex items-center gap-2 text-2xl font-black text-white">
                                <img src="/logos/real/AS/ThreeContest.svg" alt="" className="h-8 w-8" />
                                3점 컨테스트 결과
                            </h2>
                            <div className="grid grid-cols-[2fr_3fr] gap-6">
                                <div className="space-y-2">
                                    <h3 className="text-sm font-black text-slate-300 uppercase">샷차트</h3>
                                    <ThreePointContestShotChart round1={sideEvents.threePointContestResult.round1} round2={sideEvents.threePointContestResult.round2} winnerId={sideEvents.threePointContestResult.winnerId} />
                                </div>
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <h3 className="text-sm font-black text-slate-300 uppercase">결선 (상위 3명)</h3>
                                        <ThreePointContestResultTable entries={sideEvents.threePointContestResult.round2} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={openTeam} onPlayerClick={openPlayer} highlightPlayerId={sideEvents.threePointContestResult.winnerId} />
                                    </div>
                                    <div className="space-y-2">
                                        <h3 className="text-sm font-black text-slate-300 uppercase">예선 (8명)</h3>
                                        <ThreePointContestResultTable entries={sideEvents.threePointContestResult.round1} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={openTeam} onPlayerClick={openPlayer} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : sideEvents?.threePointContest ? (
                        <div className="p-6 space-y-4">
                            <h2 className="flex items-center gap-2 text-2xl font-black text-white">
                                <img src="/logos/real/AS/ThreeContest.svg" alt="" className="h-8 w-8" />
                                3점 컨테스트 참가자
                            </h2>
                            <ThreePointContestTable participants={sideEvents.threePointContest.participants} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={openTeam} onPlayerClick={openPlayer} />
                        </div>
                    ) : (
                        <p className="p-10 text-sm text-slate-500 ko-normal">
                            아직 3점 컨테스트 참가자 명단이 발표되지 않았습니다. 올스타전 기간({keyDates.allStarStart} ~ {keyDates.allStarEnd}) 시작일에 발표됩니다.
                        </p>
                    )
                ) : view === 'dunk' ? (
                    sideEventsLoading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Loader2 size={28} className="animate-spin text-indigo-400" />
                        </div>
                    ) : sideEvents?.dunkContestResult ? (
                        // [2026-09-09] 결과가 나온 뒤에는 이 탭 자체가 결과 화면 — 3점 컨테스트 탭과
                        // 동일 패턴(참가자 표 대신 결승/예선 순위표).
                        <div className="p-6 space-y-6">
                            <h2 className="flex items-center gap-2 text-2xl font-black text-white">
                                <img src="/logos/real/AS/DunkContest.svg" alt="" className="h-8 w-8" />
                                덩크 컨테스트 결과
                            </h2>
                            <div className="space-y-2">
                                <h3 className="text-sm font-black text-slate-300 uppercase">결승 (상위 2명)</h3>
                                <DunkContestResultTable entries={sideEvents.dunkContestResult.round2} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={openTeam} onPlayerClick={openPlayer} highlightPlayerId={sideEvents.dunkContestResult.winnerId} />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-sm font-black text-slate-300 uppercase">예선 (4명)</h3>
                                <DunkContestResultTable entries={sideEvents.dunkContestResult.round1} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={openTeam} onPlayerClick={openPlayer} />
                            </div>
                        </div>
                    ) : sideEvents?.dunkContest ? (
                        <div className="p-6 space-y-4">
                            <h2 className="flex items-center gap-2 text-2xl font-black text-white">
                                <img src="/logos/real/AS/DunkContest.svg" alt="" className="h-8 w-8" />
                                덩크 컨테스트 참가자
                            </h2>
                            <DunkContestTable participants={sideEvents.dunkContest.participants} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={openTeam} onPlayerClick={openPlayer} />
                        </div>
                    ) : (
                        <p className="p-10 text-sm text-slate-500 ko-normal">
                            아직 덩크 컨테스트 참가자 명단이 발표되지 않았습니다. 올스타전 기간({keyDates.allStarStart} ~ {keyDates.allStarEnd}) 시작일에 발표됩니다.
                        </p>
                    )
                ) : isLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <Loader2 size={28} className="animate-spin text-indigo-400" />
                    </div>
                ) : !snapshot ? (
                    <p className="p-10 text-sm text-slate-500 ko-normal">
                        아직 투표 집계가 없습니다. 투표 기간({keyDates.allStarVoteStart} ~ {keyDates.allStarVoteEnd})이 시작되면 여기서 득표 현황을 볼 수 있습니다.
                    </p>
                ) : view === 'risingstars' && snapshot.roster?.risingStars ? (
                    <RisingStarsBody risingStars={snapshot.roster.risingStars} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={openTeam} onPlayerClick={openPlayer} />
                ) : (
                    <div className="grid grid-cols-2 divide-x divide-slate-800 min-h-full">
                        <div className="p-6 space-y-6 min-w-0">
                            <h2 className="flex items-center gap-2 text-2xl font-black text-white">
                                <img src="/logos/real/AS/East.svg" alt="" className="h-8 w-8" />
                                동부 컨퍼런스
                            </h2>
                            {snapshot.roster && (
                                <div className="space-y-3">
                                    <h3 className="text-lg font-black text-slate-300 uppercase">최종 결과</h3>
                                    <div className="grid grid-cols-[3fr_2fr] gap-4">
                                        <AllStarCourtDiagram starters={snapshot.roster.east.starters} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onPlayerClick={openPlayer} />
                                        <AllstarRosterTable label="리저브" players={snapshot.roster.east.reserves} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={openTeam} onPlayerClick={openPlayer} />
                                    </div>
                                </div>
                            )}
                            <div className="border-t border-slate-800 pt-6">
                                <AllstarVoteGroupPanel conference={snapshot.detail.east} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={openTeam} onPlayerClick={openPlayer} />
                            </div>
                        </div>
                        <div className="p-6 space-y-6 min-w-0">
                            <h2 className="flex items-center gap-2 text-2xl font-black text-white">
                                <img src="/logos/real/AS/West.svg" alt="" className="h-8 w-8" />
                                서부 컨퍼런스
                            </h2>
                            {snapshot.roster && (
                                <div className="space-y-3">
                                    <h3 className="text-lg font-black text-slate-300 uppercase">최종 결과</h3>
                                    <div className="grid grid-cols-[3fr_2fr] gap-4">
                                        <AllStarCourtDiagram starters={snapshot.roster.west.starters} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onPlayerClick={openPlayer} />
                                        <AllstarRosterTable label="리저브" players={snapshot.roster.west.reserves} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={openTeam} onPlayerClick={openPlayer} />
                                    </div>
                                </div>
                            )}
                            <div className="border-t border-slate-800 pt-6">
                                <AllstarVoteGroupPanel conference={snapshot.detail.west} teamBySlug={teamBySlug} playerCardMap={playerCardMap} onOpenTeam={openTeam} onPlayerClick={openPlayer} />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default MultiAllStarView;
