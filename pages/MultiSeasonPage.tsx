
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, ArrowLeftRight, Plus, Minus, type LucideIcon } from 'lucide-react';
import { useLeagueContext } from '../views/multi/league/LeagueLayout';
import { useSeasonContext } from '../views/multi/season/seasonContext';
import { useGameShortCodes } from '../hooks/useGameShortCodes';
import { useLeagueRawStats, type LeagueRawStatsData } from '../hooks/useLeagueRawStats';
import { usePlayerSeasonStatsLeague } from '../hooks/usePlayerSeasonStatsLeague';
import { useLeagueNewsFeed, type LeagueEvent } from '../hooks/useLeagueHeadlines';
import { usePlayerShortCodes } from '../hooks/usePlayerShortCodes';
import { useMultiSearchData } from '../hooks/useMultiSearchData';
import { useServerClockBucket } from '../utils/serverClock';
import { getRealTeamLogoUrl, getTeamLogoUrl } from '../utils/constants';
import { supabase } from '../services/supabaseClient';
import { findCurrentVirtualDate, fmtDateShort, fmtTime } from '../views/multi/season/multiScheduleUtils';
import { getGameDisplayState, resolveRealAt } from '../views/multi/season/multiGameReveal';
import { computeMultiStandingsStats, computeWL, type MultiStandingsRecord } from '../views/multi/season/multiSeasonUtils';
import { buildActiveInjurySeverityMap, formatReturnDateSuffix, type ActiveInjuryStatus } from '../services/multi/activeInjuryStatus';
import { buildLeagueTeams } from '../services/multi/buildLeagueTeams';
import { useLeaderboardData } from '../hooks/useLeaderboardData';
import { TeamBadge } from '../components/common/TeamBadge';
import { PlayerHoverCard, buildPlayerCardMap, mergeInjuryIntoPlayerCardMap } from '../components/common/PlayerHoverCard';
import { InjuryStatusBadge, SEVERITY_TEXT_COLOR } from '../components/common/InjuryStatusBadge';
import { OvrBadge } from '../components/common/OvrBadge';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import type { LeagueTeamRow } from '../services/multi/roomQueries';
import type { Game, Player, PlayerStats } from '../types';

// 좌측 리스트 우측 날짜 — "YYYY-MM-DD" 형태인 simDate를 "YY/MM/DD"로 축약 표시.
// MultiNewsFeedView.tsx의 로컬 함수와 동일 규칙(그 파일이 export하지 않아 그대로 복제).
function formatSimDateShort(simDate: string): string {
    const [y, m, d] = simDate.split('-');
    return y && m && d ? `${y.slice(2)}/${m}/${d}` : simDate;
}

// 승률 표기 — 농구 통계 관례대로 선행 0 없이 ".650"/"1.000" 형태(MultiStandingsView.tsx와 동일).
function fmtPct(pct: number): string {
    if (pct >= 1) return '1.000';
    return pct.toFixed(3).replace(/^0/, '');
}

// [2026-09-04] 홈 화면 개편 3단계(사용자 요청) — 좌측 컬럼 ④"리그 순위"를 경기 카드 그리드
// 하단에 추가. MultiStandingsView.tsx의 LeagueStandingsTable(정렬/PO%/SOS/디비전 등 풀
// 기능)은 홈 화면 위젯으로 쓰기엔 과함 — 컨퍼런스별 W/L/PCT/GB만 보여주는 압축판을 새로
// 만들고, 계산 로직(승패/승률)만 기존 공용 유틸(computeMultiStandingsStats)을 그대로
// 재사용해 전체 순위표 화면과 숫자가 어긋나지 않게 한다.
// [2026-09-04 후속] "플레이오프 직행권 초록/플레이인권 주황 틴트 스케일 + 플레이인 설정에
// 따라 구분선도 달라지게" 요청 — 자동 클린치 인원 계산은 computePlayoffOddsMap
// (multiSeasonUtils.ts)의 autoClinchCount 공식과 동일(playInEnabled면 playoffCutoff-2,
// 아니면 playoffCutoff 그대로), 플레이인 풀은 그 다음 4자리 고정(같은 파일의 실제 시딩
// 로직과 동일 — NBA 방식 7~10시드). "스케일"은 그룹 안에서 1위(가장 진하게)→마지막
// (가장 옅게) 순으로 배경 불투명도를 선형 보간(rgba)해서 표현 — Tailwind bg-opacity
// 유틸은 값이 몇 단계로 끊겨 있어 연속적인 스케일 표현이 안 돼 인라인 style로 계산.
function tintStyle(rgb: string, indexInGroup: number, groupSize: number): React.CSSProperties {
    if (groupSize <= 0) return {};
    const t = groupSize > 1 ? indexInGroup / (groupSize - 1) : 0;
    const alpha = 0.22 - t * 0.16; // 1위 0.22 → 그룹 마지막 0.06
    return { backgroundColor: `rgba(${rgb}, ${alpha})` };
}

// [2026-09-05 버그 수정] "홈 화면 호버 카드에 부상 정보가 안 뜬다" 리포트 — buildLeagueTeams()는
// 의도적으로 현재 진행 중인 부상 상태(activeInjurySeverity 등)를 채우지 않음(이력만 채움,
// buildLeagueTeams.ts 주석 참고). PlayerHoverCard/mergeInjuryIntoPlayerCardMap은 PlayerCardMap
// (poolPlayers 기반)에 병합하는 헬퍼만 있고, buildLeagueTeams()가 만든 완전한 Player 객체를
// 직접 쓰는 화면(리그 리더/내 로스터 요약)엔 대응하는 헬퍼가 없어서 이 함수로 보완.
function applyActiveInjury<T extends Player | null | undefined>(player: T, status: ActiveInjuryStatus | undefined): T {
    if (!status || !player) return player;
    return {
        ...player,
        activeInjurySeverity: status.severity,
        injuryType: status.injuryType,
        activeInjuryDuration: status.duration,
        returnDate: status.returnDate ?? undefined,
    };
}

const HomeStandingsTable: React.FC<{
    teams: LeagueTeamRow[];
    statsMap: Record<string, MultiStandingsRecord>;
    playoffCutoff: number;
    playInEnabled: boolean;
    onOpenTeam: (slug: string) => void;
}> = ({ teams, statsMap, playoffCutoff, playInEnabled, onOpenTeam }) => {
    const sorted = [...teams].sort((a, b) => (statsMap[b.team_slug]?.pct ?? 0) - (statsMap[a.team_slug]?.pct ?? 0));
    const leader = statsMap[sorted[0]?.team_slug];

    // 자동 클린치(직행) 인원 — 플레이인 활성화 시 playoffCutoff보다 2명 적게(그 2자리는
    // 플레이인 승자 몫), 비활성화 시 playoffCutoff 그대로(플레이인 자체가 없으므로 컷 아래는
    // 전부 탈락).
    const autoClinchCount = Math.min(
        playInEnabled ? Math.max(0, playoffCutoff - 2) : playoffCutoff,
        sorted.length,
    );
    // 플레이인 풀은 항상 4자리(7~10시드 방식) — 비활성화면 애초에 플레이인 자체가 없음.
    const playInEndIdx = playInEnabled ? Math.min(autoClinchCount + 4, sorted.length) : autoClinchCount;

    return (
        <table className="w-full text-left border-collapse bg-slate-900">
            <thead>
                <tr className="border-b border-slate-800 bg-slate-900">
                    <th className="py-1 px-1 text-sm font-bold text-slate-600 w-5">#</th>
                    <th className="py-1 px-1 text-sm font-bold text-slate-600">팀</th>
                    <th className="py-1 px-1 text-sm font-bold text-slate-600 text-center">W</th>
                    <th className="py-1 px-1 text-sm font-bold text-slate-600 text-center">L</th>
                    <th className="py-1 px-1 text-sm font-bold text-slate-600 text-center">PCT</th>
                    <th className="py-1 px-1 text-sm font-bold text-slate-600 text-center">GB</th>
                </tr>
            </thead>
            <tbody>
                {sorted.map((t, i) => {
                    const rec = statsMap[t.team_slug];
                    const gb = i === 0 || !leader || !rec
                        ? '-'
                        : (((leader.wins - leader.losses) - (rec.wins - rec.losses)) / 2).toFixed(1);
                    // 직행권(초록) → 플레이인권(주황, 활성화 시만) → 탈락권(무색) 순으로 판정.
                    const rowTint = i < autoClinchCount
                        ? tintStyle('16, 185, 129', i, autoClinchCount)
                        : playInEnabled && i < playInEndIdx
                            ? tintStyle('249, 115, 22', i - autoClinchCount, playInEndIdx - autoClinchCount)
                            : undefined;
                    // 컷라인 구분선 — 직행권 끝(항상)과 플레이인권 끝(플레이인 활성화 시만) 두 곳.
                    const isCutoffRow = i === autoClinchCount - 1 || (playInEnabled && i === playInEndIdx - 1);
                    return (
                        <tr
                            key={t.team_slug}
                            onClick={() => onOpenTeam(t.team_slug)}
                            style={rowTint}
                            className={`cursor-pointer hover:bg-white/5 transition-colors ${isCutoffRow ? 'border-b-2 border-slate-700' : 'border-b border-slate-800/60'}`}
                        >
                            <td className="py-1 px-1 text-sm text-slate-500">{i + 1}</td>
                            <td className="py-1 px-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <TeamBadge
                                        teamId={t.team_slug} abbr={t.team_abbr}
                                        colorPrimary={t.color_primary} colorSecondary={t.color_secondary} colorText={t.color_text}
                                        size="xs"
                                    />
                                    <span className="text-sm font-bold text-slate-300 truncate">{t.team_name}</span>
                                </div>
                            </td>
                            <td className="py-1 px-1 text-sm text-center text-slate-300">{rec?.wins ?? 0}</td>
                            <td className="py-1 px-1 text-sm text-center text-slate-300">{rec?.losses ?? 0}</td>
                            <td className="py-1 px-1 text-sm text-center text-slate-400 tabular-nums">{fmtPct(rec?.pct ?? 0)}</td>
                            <td className="py-1 px-1 text-sm text-center text-slate-500">{gb}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};

const HomeStandingsSection: React.FC = () => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, leagueTeams } = useLeagueContext();
    const { schedule } = useSeasonContext();
    // [2026-09-07] 경기 공개 10분 딜레이/가상 오늘 날짜 판정에만 쓰여 초 단위 정밀도가
    // 필요 없다 — useServerClock() 대신 useServerClockBucket()으로 매초 리렌더(+그 아래
    // useMemo 재계산)를 15초에 한 번으로 줄인다(React DevTools로 실측 확인된 낭비).
    const serverNow = useServerClockBucket();
    const navigate = useNavigate();

    const isTournament = league?.type === 'tournament';
    const slugs = useMemo(() => leagueTeams.map(t => t.team_slug), [leagueTeams]);
    const statsMap = useMemo(
        () => computeMultiStandingsStats(slugs, schedule, serverNow, {}, isTournament),
        [slugs, schedule, serverNow, isTournament],
    );
    const playoffCutoff = league?.playoff_team_count ?? 8;
    const playInEnabled = league?.play_in_enabled ?? true;
    const onOpenTeam = (slug: string) => navigate(`/multi/leagues/${leagueId}/season/roster?rteam=${slug}`);

    const eastTeams = leagueTeams.filter(t => t.conference === 'East');
    const westTeams = leagueTeams.filter(t => t.conference === 'West');
    // 컨퍼런스 구분이 없는 경우(예: 토너먼트) 통합 순위표로 폴백.
    const hasConferences = eastTeams.length > 0 && westTeams.length > 0;

    return (
        <section className="space-y-3">
            <h3 className="text-lg font-black text-white">리그 순위</h3>
            {hasConferences ? (
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <h4 className="text-sm font-black text-slate-500 uppercase px-1">동부</h4>
                        <HomeStandingsTable teams={eastTeams} statsMap={statsMap} playoffCutoff={playoffCutoff} playInEnabled={playInEnabled} onOpenTeam={onOpenTeam} />
                    </div>
                    <div className="space-y-1">
                        <h4 className="text-sm font-black text-slate-500 uppercase px-1">서부</h4>
                        <HomeStandingsTable teams={westTeams} statsMap={statsMap} playoffCutoff={playoffCutoff} playInEnabled={playInEnabled} onOpenTeam={onOpenTeam} />
                    </div>
                </div>
            ) : (
                <HomeStandingsTable teams={leagueTeams} statsMap={statsMap} playoffCutoff={playoffCutoff} playInEnabled={playInEnabled} onOpenTeam={onOpenTeam} />
            )}
        </section>
    );
};

// [2026-09-04] 홈 화면 개편 4단계(사용자 요청) — 좌측 컬럼 ⑧"리그 리더"를 순위표 하단에
// 추가. MultiLeaderboardView.tsx와 동일한 원본 fetch(useLeagueRawStats + buildLeagueTeams)를
// 그대로 재사용 — queryKey(room?.id + allRosterIds)가 같아서 로스터/리더보드 화면이 이미
// 로드해둔 캐시를 그대로 재사용하거나(로더 없이 즉시 표시), 이 화면이 먼저 로드하면 반대로
// 그 화면들이 캐시를 재사용한다(useLeagueRawStats.ts 주석 참고).
// [2026-09-04 후속] "3x3 그리드로 각 분야 상위 3명씩" 요청으로 전면 재설계 — 카테고리를
// 5개(1위만)에서 9개(득점/리바운드/어시스트/스틸/블락/야투율/3점시도/3점성공률/턴오버,
// 각 상위 3명)로 확장. useLeaderboardData 훅은 카테고리 하나만 정렬해 돌려주는 구조라
// 9개 전부 뽑으려면 9번 호출(중복 계산)이 필요해 재사용하지 않고, teams(이미 fetch한
// Player[] 스냅샷)를 그대로 순회해 카테고리별 상위 3명을 직접 계산한다. 야투율/3점성공률처럼
// 시도 볼륨과 무관한 비율 스탯은 자격 기준(최소 시도 수) 없이 그대로 정렬 — 시도 1~2회로
// 100%를 찍는 선수가 상위에 뜰 수 있는 건 알려진 한계(전체 리더보드처럼 별도 자격 기준을
// 두려면 추후 확장).
interface LeaderCategoryDef { key: string; label: string; compute: (s: PlayerStats) => number; format: (v: number) => string }
const pctFmt = (v: number) => `${(v * 100).toFixed(1)}%`;
const avgFmt = (v: number) => v.toFixed(1);
// 3행(득점/리바운드/어시스트 → 스틸/블락/야투율 → 3점시도/3점성공률/턴오버) × 3열 —
// 평탄화한 배열을 grid-cols-3에 그대로 흘려보내면 요청한 배치와 동일하게 배치된다.
const LEADER_CATEGORIES: LeaderCategoryDef[] = [
    { key: 'pts', label: '득점', compute: s => s.pts / s.g, format: avgFmt },
    { key: 'reb', label: '리바운드', compute: s => s.reb / s.g, format: avgFmt },
    { key: 'ast', label: '어시스트', compute: s => s.ast / s.g, format: avgFmt },
    { key: 'stl', label: '스틸', compute: s => s.stl / s.g, format: avgFmt },
    { key: 'blk', label: '블락', compute: s => s.blk / s.g, format: avgFmt },
    { key: 'fgpct', label: '야투율', compute: s => s.fga > 0 ? s.fgm / s.fga : 0, format: pctFmt },
    { key: 'p3a', label: '3점시도', compute: s => s.p3a / s.g, format: avgFmt },
    { key: 'p3pct', label: '3점성공률', compute: s => s.p3a > 0 ? s.p3m / s.p3a : 0, format: pctFmt },
    { key: 'tov', label: '턴오버', compute: s => s.tov / s.g, format: avgFmt },
];
const LEADERS_PER_CATEGORY = 3;

const HomeLeagueLeadersSection: React.FC = () => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, leagueTeams, room } = useLeagueContext();
    const { schedule, currentSimDate } = useSeasonContext();
    // [2026-09-07] 경기 공개 10분 딜레이/가상 오늘 날짜 판정에만 쓰여 초 단위 정밀도가
    // 필요 없다 — useServerClock() 대신 useServerClockBucket()으로 매초 리렌더(+그 아래
    // useMemo 재계산)를 15초에 한 번으로 줄인다(React DevTools로 실측 확인된 낭비).
    const serverNow = useServerClockBucket();
    const navigate = useNavigate();
    const { getPlayerUrlId } = usePlayerShortCodes();

    const useCustomOverrides = (league?.draft_pool ?? '').split(',').map(s => s.trim()).includes('alltime');
    const allRosterIds = useMemo(() => [...new Set(leagueTeams.flatMap(t => t.roster ?? []))], [leagueTeams]);
    // [2026-09-07] game_pbp 원본 fetch(includePbp:false로 생략) 대신 서버 집계 RPC로 선수
    // 시즌 스탯을 받는다 — 홈 화면 최초 진입 병목 개선(buildLeagueTeams.ts 주석 참고).
    const { data: statsByPlayer } = usePlayerSeasonStatsLeague(room?.id, allRosterIds);
    const selectTeams = useCallback(
        (raw: LeagueRawStatsData) => buildLeagueTeams(raw, leagueTeams, useCustomOverrides, statsByPlayer),
        [leagueTeams, useCustomOverrides, statsByPlayer],
    );
    const { data: teams = [] } = useLeagueRawStats(room?.id, allRosterIds, selectTeams, { includePbp: false });

    // [2026-09-05 버그 수정] "호버 카드에 부상 정보가 안 뜬다" — buildLeagueTeams()가 만든
    // Player엔 현재 활성 부상 상태가 없어(위 applyActiveInjury 주석 참고) 별도로 계산해 얹는다.
    // [2026-09-07] playerInjuryRows만 필요하고 game_pbp는 전혀 안 쓰므로 includePbp:false —
    // 이걸 빼먹으면 이 훅이 기본값(includePbp:true)으로 room 전체 game_pbp(수 MB)를 또
    // 따로 받아버린다(다른 홈 위젯들을 includePbp:false로 옮기면서 큐key가 갈라져 캐시
    // 공유가 끊긴 것 — 실제로 홈 화면에서 이 누락 때문에 여전히 8초대 fetch가 남아있었음).
    const selectInjuryRows = useCallback((raw: LeagueRawStatsData) => raw.playerInjuryRows, []);
    const { data: injuryRows = [] } = useLeagueRawStats(room?.id, allRosterIds, selectInjuryRows, { includePbp: false });
    const isMainLeague = league?.type === 'main_league';
    const todaySimDate = useMemo(() => {
        if (!isMainLeague) return currentSimDate;
        return findCurrentVirtualDate(schedule, league?.sim_real_start_at ?? null, league?.games_per_real_day ?? 5, serverNow) ?? currentSimDate;
    }, [isMainLeague, schedule, league?.sim_real_start_at, league?.games_per_real_day, serverNow, currentSimDate]);
    const teamIdByPlayer = useMemo(() => {
        const m = new Map<string, string>();
        for (const t of leagueTeams) for (const id of (t.roster ?? [])) m.set(id, t.team_slug);
        return m;
    }, [leagueTeams]);
    const activeInjuryByPlayer = useMemo(
        () => buildActiveInjurySeverityMap(injuryRows, todaySimDate, room?.season_number, {
            schedule, getTeamId: id => teamIdByPlayer.get(id),
        }),
        [injuryRows, todaySimDate, room?.season_number, schedule, teamIdByPlayer],
    );

    const leaderGrid = useMemo(() => {
        const allPlayers = teams.flatMap(t => t.roster
            .filter(p => (p.stats?.g ?? 0) > 0)
            .map(p => ({
                player: applyActiveInjury(p, activeInjuryByPlayer.get(p.id)),
                teamId: t.id, teamAbbr: t.abbr, colorPrimary: t.colorPrimary, colorSecondary: t.colorSecondary,
            })));

        return LEADER_CATEGORIES.map(cat => ({
            ...cat,
            ranked: allPlayers
                .map(entry => ({ entry, value: cat.compute(entry.player.stats) }))
                .sort((a, b) => b.value - a.value)
                .slice(0, LEADERS_PER_CATEGORY),
        }));
    }, [teams, activeInjuryByPlayer]);

    return (
        <section className="space-y-3">
            <h3 className="text-lg font-black text-white">리그 리더</h3>
            {/* [2026-09-05 후속] "카드 컨테이너를 해체하고 순위표처럼 리스트로" 요청 —
                HomeStandingsSection의 동/서부 블록(카드 박스 없이 헤더+얇은 행 구분선만
                있는 순수 리스트)과 동일한 톤으로 맞춤. 카테고리별 rounded-lg border 박스를
                제거하고 헤더 + border-b 구분선만 남긴 3열 그리드로 재구성. */}
            <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                {leaderGrid.map(cat => (
                    <div key={cat.key} className="space-y-1">
                        <h4 className="text-sm font-black text-slate-500 uppercase px-1">{cat.label}</h4>
                        <div className="bg-slate-900 px-2">
                            <div className="flex items-center gap-1.5 py-1 border-b border-slate-800">
                                <span className="text-sm font-bold text-slate-600 w-3 shrink-0">#</span>
                                <span className="w-7 h-5 shrink-0" />
                                <span className="text-sm font-bold text-slate-600 flex-1 min-w-0">선수</span>
                                <span className="text-sm font-bold text-slate-600 shrink-0">{cat.label}</span>
                            </div>
                            {cat.ranked.map(({ entry, value }, i) => (
                                <div
                                    key={entry.player.id}
                                    onClick={() => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(entry.player.id)}`)}
                                    className={`flex items-center gap-1.5 py-1 cursor-pointer hover:bg-white/5 transition-colors ${i < cat.ranked.length - 1 ? 'border-b border-slate-800/60' : ''}`}
                                >
                                    <span className="text-sm font-bold text-slate-600 w-3 shrink-0">{i + 1}</span>
                                    <TeamBadge
                                        teamId={entry.teamId} abbr={entry.teamAbbr}
                                        colorPrimary={entry.colorPrimary} colorSecondary={entry.colorSecondary}
                                        size="xs"
                                    />
                                    <PlayerHoverCard player={entry.player} teamAbbr={entry.teamAbbr}>
                                        <span className="text-sm font-bold text-slate-300 truncate flex-1 min-w-0">{entry.player.name}</span>
                                    </PlayerHoverCard>
                                    <span className="text-sm text-white tabular-nums shrink-0">{cat.format(value)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
};

// [2026-09-04] 홈 화면 개편 5단계(사용자 요청) — 좌측 컬럼 ⑥"리그 최신 뉴스"를 리더
// 섹션 하단에 추가. MultiNewsFeedView.tsx가 이미 쓰는 useLeagueNewsFeed()를 필터 없이
// (기본값 = "전체 기간"·전체 타입·최신순, 리그 뉴스 화면의 기본 상태와 동일) 그대로
// 재사용해 최신 6건만 잘라 보여준다 — 일반 경기 결과(game_result, score<15)는 이 훅의
// 기본 쿼리가 이미 걸러내므로(GAME_RESULT_MIN_SCORE) 홈 화면 ①번 경기 카드 그리드와
// 중복되지 않는다. 카드 렌더는 뉴스피드의 "레거시 폴백" 카드(LegacyCard — 아이콘+헤드라인+
// 상대시각 한 줄, export만 돼 있고 실제로는 어떤 이벤트 타입에도 쓸 수 있는 범용 컴포넌트)를
// 그대로 재사용 — 압축 목록에 맞는 스타일을 새로 만들 필요가 없었다.
// [2026-09-05 후속] "영역을 반으로 나누고 10개 표시, 카드 대신 리스트로, 아이콘 제거,
// 상대시각 대신 날짜" 요청으로 전면 재설계 — 기존엔 뉴스피드의 LegacyCard(아이콘+헤드라인+
// 상대시각, 테두리 있는 카드)를 그대로 재사용했지만 요구사항이 전부 그 컴포넌트와
// 어긋나서(아이콘 없음/카드 아님/날짜 표기) 재사용을 접고 이 섹션 전용 리스트 행을 새로
// 작성했다. 10건을 5개씩 좌우 두 열로 나눠 배치(뉴스는 시간순이라 홀짝 인터리브 대신
// "왼쪽에 최신 5개, 오른쪽에 다음 5개" 신문 지면 방식이 자연스러움).
const HomeLatestNewsSection: React.FC = () => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const { room } = useLeagueContext();
    const { myTeamId } = useSeasonContext();
    const navigate = useNavigate();
    const { stories, isLoading } = useLeagueNewsFeed(room?.id, myTeamId);
    const latest = stories.slice(0, 10);
    const openNews = () => navigate(`/multi/leagues/${leagueId}/season/news`);
    const columns = [latest.slice(0, 5), latest.slice(5, 10)];

    return (
        <section className="space-y-3">
            <h3 className="text-lg font-black text-white">리그 최신 뉴스</h3>
            {isLoading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 size={20} className="animate-spin text-indigo-400" />
                </div>
            ) : latest.length === 0 ? (
                <p className="text-sm text-slate-500 ko-normal py-6 text-center border border-dashed border-slate-800 rounded-lg">
                    아직 소식이 없습니다.
                </p>
            ) : (
                <div className="grid grid-cols-2 gap-x-4 bg-slate-900">
                    {columns.map((col, colIdx) => (
                        <div key={colIdx}>
                            {col.map((e: LeagueEvent, i) => (
                                <div
                                    key={e.id}
                                    onClick={openNews}
                                    className={`flex items-center justify-between gap-2 py-1.5 px-2 cursor-pointer hover:bg-white/5 transition-colors ${i < col.length - 1 ? 'border-b border-slate-800/60' : ''}`}
                                >
                                    <span className="text-sm text-slate-300 truncate ko-normal">{e.headline}</span>
                                    <span className="text-sm text-slate-500 tabular-nums shrink-0">
                                        {e.simDate ? formatSimDateShort(e.simDate) : formatRelativeTime(e.createdAt)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
};

// [2026-09-04] 홈 화면 개편 6단계(사용자 요청) — 좌측 컬럼 ③"리그 트랜잭션 소식"(트레이드/
// FA/웨이버)을 최신 뉴스 하단에 추가. league_events에는 'trade' 타입만 있고 FA서명/웨이버는
// 별도 이벤트가 없어(league_transactions 테이블에만 기록 — services/multi/playerHistoryService.ts
// 참고) 두 원본을 합쳐야 한다:
//   - 트레이드: useLeagueNewsFeed({ types: ['trade'] })로 league_events에서 조회(이미 파싱된
//     TradeDetail — teamA/teamB/aOut/bOut에 선수 이름까지 들어있어 별도 조회 불필요).
//   - FA서명/웨이버: league_transactions를 room_id로 직접 조회(player_id만 있어 이름 조회
//     필요 — 방출된 선수는 로스터에서 이미 빠져있어 useLeagueRawStats의 allRosterIds로는
//     못 찾으므로, 로스터 여부와 무관하게 리그 전체 드래프트풀을 담고 있는
//     useMultiSearchData().poolPlayers에서 이름을 찾는다).
// [2026-09-05 후속] "리스트로 변경, 선수 이름 | 이전팀→이후팀(또는 웨이버/자유 계약) | 날짜
// 형식으로, 트레이드/웨이버/FA영입 전부 표시" 요청으로 재설계 — 트레이드 이벤트 하나가
// 여러 선수를 옮길 수 있어(예: 3-for-2 트레이드) 기존처럼 "이벤트 1건=행 1개"가 아니라
// "이동한 선수 1명=행 1개"로 평탄화한다(aOut은 teamA가 내보내 teamB가 받는 선수들,
// bOut은 반대 — TradePlayerTable과 동일한 방향 규칙). 날짜는 다른 섹션과 동일하게
// simDate 우선 표시(트레이드는 event.simDate, FA/웨이버는 league_transactions.sim_date —
// 이번에 select에 추가), 없으면 상대시각 폴백.
interface RawLeagueTransactionRow {
    id: string;
    type: 'fa_sign' | 'waive';
    team_id: string;
    player_id: string;
    sim_date: string | null;
    created_at: string;
}

interface HomeTxnTeamRef { slug: string; abbr: string }

interface HomeTxnItem {
    id: string;
    atMs: number;
    kind: 'trade' | 'fa_sign' | 'waive';
    playerId: string;
    playerName: string;
    /** 트레이드일 때만 채워짐 — 이름 우측 열에 "이전팀 → 이후팀"으로 표시(각 팀 약어를
     * 별도로 클릭 가능하게 만들기 위해 문자열이 아닌 구조화된 팀 참조로 보관).
     * FA/웨이버는 undefined(해당 칸을 비워둔다 — 사용자 요청). */
    fromTeam?: HomeTxnTeamRef;
    toTeam?: HomeTxnTeamRef;
    dateLabel: string;
}

// [2026-09-05 후속] "자유 계약 앞엔 트레이드 새 제안 탭에서 쓰는 초록 원+십자, 웨이버 앞엔
// 빨간 원+일자, 트레이드 앞엔 트레이드에 맞는 아이콘" 요청 — 초록/빨강 원+아이콘은
// MultiFrontOfficeView.tsx의 새 제안 탭 행 토글 버튼(TradeOfferPlayerRow)과 완전히 동일한
// 마크업(w-5 h-5 rounded-full + Plus/Minus)을 그대로 재사용해 시각 언어를 통일했다.
const TXN_ICON_BY_KIND: Record<HomeTxnItem['kind'], { Icon: LucideIcon; bg: string }> = {
    trade: { Icon: ArrowLeftRight, bg: 'bg-indigo-600' },
    fa_sign: { Icon: Plus, bg: 'bg-emerald-600' },
    waive: { Icon: Minus, bg: 'bg-red-600' },
};
// [2026-09-05 후속] "트레이드/자유계약/웨이버 순으로 정렬, 그 안에서 날짜순" 요청 — 어떤
// 10건을 보여줄지(선택)는 기존처럼 전체 최신순으로 정하고, 화면에 그릴 때만 이 순서로
// 재정렬한다(선택 기준까지 종류 순으로 바꾸면 "최근 10건"의 의미가 흐려짐).
const TXN_KIND_ORDER: Record<HomeTxnItem['kind'], number> = { trade: 0, fa_sign: 1, waive: 2 };
const TXN_KIND_LABEL: Record<HomeTxnItem['kind'], string> = { trade: '트레이드', fa_sign: '자유 계약', waive: '웨이버' };

const HOME_TRANSACTIONS_LIMIT = 10;

const HomeTransactionsSection: React.FC = () => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, leagueTeams, room } = useLeagueContext();
    const { myTeamId, schedule, currentSimDate } = useSeasonContext();
    // [2026-09-07] 경기 공개 10분 딜레이/가상 오늘 날짜 판정에만 쓰여 초 단위 정밀도가
    // 필요 없다 — useServerClock() 대신 useServerClockBucket()으로 매초 리렌더(+그 아래
    // useMemo 재계산)를 15초에 한 번으로 줄인다(React DevTools로 실측 확인된 낭비).
    const serverNow = useServerClockBucket();
    const navigate = useNavigate();
    const { getPlayerUrlId } = usePlayerShortCodes();
    const { poolPlayers, rosterMap } = useMultiSearchData(league, leagueTeams);

    const teamBySlug = useMemo(() => {
        const m = new Map<string, LeagueTeamRow>();
        for (const t of leagueTeams) m.set(t.team_slug, t);
        return m;
    }, [leagueTeams]);
    const playerNameById = useMemo(() => new Map(poolPlayers.map(p => [p.id, p.name])), [poolPlayers]);
    // 선수 이름 호버 시 능력치/스탯 팝업 — MultiScheduleView.tsx 등 다른 화면과 동일하게
    // poolPlayers(전체 드래프트풀 Player[]) + rosterMap(playerId→team_slug)으로 조립.
    const basePlayerCardMap = useMemo(
        () => buildPlayerCardMap(poolPlayers, rosterMap, slug => teamBySlug.get(slug)?.team_abbr),
        [poolPlayers, rosterMap, teamBySlug],
    );
    // [2026-09-05 버그 수정] "호버 카드에 부상 정보가 안 뜬다" — poolPlayers(meta_players)엔
    // 부상 컬럼이 없어 별도로 room_player_state를 조회해 병합해야 한다(HomeMyInjuriesSection과
    // 동일 패턴). 방출된 지 오래된 선수는 allRosterIds(현재 로스터)에 없어 병합 대상에서
    // 빠질 수 있음 — 알려진 한계.
    const allRosterIds = useMemo(() => [...new Set(leagueTeams.flatMap(t => t.roster ?? []))], [leagueTeams]);
    // [2026-09-07] playerInjuryRows만 필요, game_pbp 불필요 — includePbp:false.
    const selectInjuryRows = useCallback((raw: LeagueRawStatsData) => raw.playerInjuryRows, []);
    const { data: injuryRows = [] } = useLeagueRawStats(room?.id, allRosterIds, selectInjuryRows, { includePbp: false });
    const isMainLeague = league?.type === 'main_league';
    const todaySimDate = useMemo(() => {
        if (!isMainLeague) return currentSimDate;
        return findCurrentVirtualDate(schedule, league?.sim_real_start_at ?? null, league?.games_per_real_day ?? 5, serverNow) ?? currentSimDate;
    }, [isMainLeague, schedule, league?.sim_real_start_at, league?.games_per_real_day, serverNow, currentSimDate]);
    const activeInjuryByPlayer = useMemo(
        () => buildActiveInjurySeverityMap(injuryRows, todaySimDate, room?.season_number, {
            schedule, getTeamId: id => rosterMap.get(id),
        }),
        [injuryRows, todaySimDate, room?.season_number, schedule, rosterMap],
    );
    const playerCardMap = useMemo(
        () => mergeInjuryIntoPlayerCardMap(basePlayerCardMap, activeInjuryByPlayer),
        [basePlayerCardMap, activeInjuryByPlayer],
    );

    const { stories: tradeStories } = useLeagueNewsFeed(room?.id, myTeamId, { types: ['trade'] });

    const { data: faRows = [] } = useQuery({
        queryKey: ['homeLeagueTransactions', room?.id],
        enabled: !!room?.id,
        queryFn: async (): Promise<RawLeagueTransactionRow[]> => {
            const { data, error } = await supabase
                .from('league_transactions')
                .select('id, type, team_id, player_id, sim_date, created_at')
                .eq('room_id', room!.id)
                .order('created_at', { ascending: false })
                .limit(HOME_TRANSACTIONS_LIMIT);
            if (error) throw error;
            return data ?? [];
        },
    });

    const items = useMemo((): HomeTxnItem[] => {
        const tradeItems: HomeTxnItem[] = tradeStories.flatMap(e => {
            if (e.detail.kind !== 'trade') return [];
            const { teamA, teamB, aOut, bOut } = e.detail;
            const teamARef: HomeTxnTeamRef = { slug: teamA.slug, abbr: teamBySlug.get(teamA.slug)?.team_abbr ?? teamA.slug };
            const teamBRef: HomeTxnTeamRef = { slug: teamB.slug, abbr: teamBySlug.get(teamB.slug)?.team_abbr ?? teamB.slug };
            const atMs = new Date(e.createdAt).getTime();
            const dateLabel = e.simDate ? formatSimDateShort(e.simDate) : formatRelativeTime(e.createdAt);
            return [
                ...aOut.map(p => ({ id: `${e.id}-${p.id}`, atMs, kind: 'trade' as const, playerId: p.id, playerName: p.name, fromTeam: teamARef, toTeam: teamBRef, dateLabel })),
                ...bOut.map(p => ({ id: `${e.id}-${p.id}`, atMs, kind: 'trade' as const, playerId: p.id, playerName: p.name, fromTeam: teamBRef, toTeam: teamARef, dateLabel })),
            ];
        });
        const faItems: HomeTxnItem[] = faRows.map(r => ({
            id: r.id,
            atMs: new Date(r.created_at).getTime(),
            kind: r.type,
            playerId: r.player_id,
            playerName: playerNameById.get(r.player_id) ?? r.player_id,
            dateLabel: r.sim_date ? formatSimDateShort(r.sim_date) : formatRelativeTime(r.created_at),
        }));
        // 어떤 10건을 보여줄지는 최신순으로 고르고, 화면에 그릴 순서만 트레이드→자유계약→
        // 웨이버, 그 안에서 최신순으로 재정렬.
        return [...tradeItems, ...faItems]
            .sort((a, b) => b.atMs - a.atMs)
            .slice(0, HOME_TRANSACTIONS_LIMIT)
            .sort((a, b) => TXN_KIND_ORDER[a.kind] - TXN_KIND_ORDER[b.kind] || b.atMs - a.atMs);
    }, [tradeStories, faRows, teamBySlug, playerNameById]);

    const openTransactions = () => navigate(`/multi/leagues/${leagueId}/season/transaction`);
    const openPlayer = (playerId: string) => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(playerId)}`);
    const openTeam = (slug: string) => navigate(`/multi/leagues/${leagueId}/season/roster?rteam=${slug}`);

    return (
        <section className="space-y-3">
            <h3 className="text-lg font-black text-white">트랜잭션 소식</h3>
            {items.length === 0 ? (
                <p className="text-sm text-slate-500 ko-normal py-6 text-center border border-dashed border-slate-800 rounded-lg">
                    아직 트랜잭션이 없습니다.
                </p>
            ) : (
                <div className="bg-slate-900">
                    <div className="flex items-center gap-2 py-1 px-2 border-b border-slate-800">
                        <span className="text-sm font-bold text-slate-600 w-24 shrink-0">종류</span>
                        <span className="text-sm font-bold text-slate-600 flex-1 min-w-0">선수</span>
                        <span className="text-sm font-bold text-slate-600 w-24 shrink-0">팀 이동</span>
                        <span className="text-sm font-bold text-slate-600 shrink-0">날짜</span>
                    </div>
                    {items.map((item, i) => {
                        const { Icon, bg } = TXN_ICON_BY_KIND[item.kind];
                        return (
                            <div
                                key={item.id}
                                onClick={openTransactions}
                                className={`flex items-center gap-2 py-1.5 px-2 cursor-pointer hover:bg-white/5 transition-colors ${i < items.length - 1 ? 'border-b border-slate-800/60' : ''}`}
                            >
                                {/* 1열: 종류(트레이드/자유 계약/웨이버) */}
                                <span className="flex items-center gap-1.5 w-24 shrink-0">
                                    <span className={`w-4 h-4 rounded-full inline-flex items-center justify-center text-white shrink-0 ${bg}`}>
                                        <Icon size={10} />
                                    </span>
                                    <span className="text-sm text-slate-400 truncate">{TXN_KIND_LABEL[item.kind]}</span>
                                </span>
                                {/* 2열: 선수 이름 — 클릭 시 선수 상세로 이동(행 전체의 트랜잭션 목록
                                    이동과 별개 동작이라 stopPropagation), 호버 시 능력치/스탯 팝업. */}
                                <span className="text-sm font-bold text-slate-200 truncate flex-1 min-w-0">
                                    <PlayerHoverCard player={playerCardMap.get(item.playerId)?.player} teamAbbr={playerCardMap.get(item.playerId)?.teamAbbr}>
                                        <span
                                            className="cursor-pointer hover:text-indigo-400 hover:underline"
                                            onClick={(e) => { e.stopPropagation(); openPlayer(item.playerId); }}
                                        >
                                            {item.playerName}
                                        </span>
                                    </PlayerHoverCard>
                                </span>
                                {/* 3열: 팀 이동 내역 — 트레이드일 때만 채워짐, 각 팀 약어를 클릭하면
                                    해당 팀 로스터로 이동. */}
                                <span className="text-sm text-slate-400 truncate w-24 shrink-0">
                                    {item.fromTeam && item.toTeam ? (
                                        <>
                                            <span
                                                className="cursor-pointer hover:text-indigo-400 hover:underline"
                                                onClick={(e) => { e.stopPropagation(); openTeam(item.fromTeam!.slug); }}
                                            >
                                                {item.fromTeam.abbr}
                                            </span>
                                            {' → '}
                                            <span
                                                className="cursor-pointer hover:text-indigo-400 hover:underline"
                                                onClick={(e) => { e.stopPropagation(); openTeam(item.toTeam!.slug); }}
                                            >
                                                {item.toTeam.abbr}
                                            </span>
                                        </>
                                    ) : ''}
                                </span>
                                {/* 4열: 날짜 */}
                                <span className="text-sm text-slate-500 tabular-nums shrink-0">{item.dateLabel}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
};

// [2026-09-04] 홈 화면 개편 7단계(사용자 요청) — 좌측 컬럼 ②"리그 부상 소식"을 트랜잭션
// 소식 하단에 추가. 트랜잭션 섹션과 동일한 패턴 — league_events의 'injury' 타입만 필터링
// (`useLeagueNewsFeed({ types: ['injury'] })`, GRADE3 이상만 발행되므로 항상 유의미한
// 부상만 표시됨). 부상 등급 배지는 로스터/호버카드가 이미 쓰는 InjuryStatusBadge를 그대로
// 재사용해 등급별 색상이 화면마다 어긋나지 않게 한다.
// [2026-09-05 후속] "부상/출장정지 소식도 동일하게 리스트로, 출장정지도 표기, 부상 정도별
// 배지 색, 부상명+기간+예상복귀일을 함께" 요청으로 재설계.
//   - 출장정지: 기존엔 types:['injury']만 조회해 league_events의 'suspension' 타입이
//     아예 빠져 있었다. 싸움은 항상 두 선수 모두에게 동시에 발생(SuspensionDetail에
//     fighter/opponent 둘 다 들어있음 — server/src/shared/leagueEvents.ts의
//     detectSuspensionEvent 참고)하므로, 부상처럼 "이벤트 1건=선수 1명"이 아니라 이벤트
//     하나를 두 행으로 펼친다(트랜잭션 섹션의 트레이드 다중 선수 평탄화와 동일 원리).
//   - 배지 색: InjuryStatusBadge/SEVERITY_TEXT_COLOR(components/common/InjuryStatusBadge.tsx)
//     가 이미 Grade3/4/5/Suspension별로 다른 색을 정의해두고 있어 그대로 재사용 — 부상
//     타입만 조회하던 이전엔 이 컴포넌트의 색 분기가 사실상 Grade3~5 세 가지만 보였을 뿐,
//     새 기능을 만들 필요는 없었다.
//   - 부상명/기간/복귀일: 부상은 injuryType·duration·returnDate 그대로, 출장정지는
//     injuryType이 없어 고정 라벨("출장정지")과 "N경기"(games) 기간을 대신 씀.
interface HomeInjuryItem {
    id: string;
    playerId: string;
    playerName: string;
    teamSlug: string;
    severity: 'Grade3' | 'Grade4' | 'Grade5' | 'Suspension';
    typeLabel: string;
    durationLabel: string;
    returnDate: string | null;
}

const HomeInjurySection: React.FC = () => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, leagueTeams, room } = useLeagueContext();
    const { myTeamId } = useSeasonContext();
    const navigate = useNavigate();
    const { getPlayerUrlId } = usePlayerShortCodes();
    const { poolPlayers } = useMultiSearchData(league, leagueTeams);
    // 선수 이름 호버 시 능력치/스탯 팝업 — 부상 이벤트 시점의 teamSlug를 그대로 써서
    // (현재 로스터가 아니라 이벤트 발생 당시 소속팀) 팝업 헤더 팀 약어를 표시한다.
    const playerById = useMemo(() => new Map(poolPlayers.map(p => [p.id, p])), [poolPlayers]);
    const teamAbbrBySlug = useMemo(() => new Map(leagueTeams.map(t => [t.team_slug, t.team_abbr])), [leagueTeams]);

    const { stories, isLoading } = useLeagueNewsFeed(room?.id, myTeamId, { types: ['injury', 'suspension'] });

    const items = useMemo((): HomeInjuryItem[] => stories.slice(0, 6).flatMap((e): HomeInjuryItem[] => {
        if (e.detail.kind === 'injury') {
            const { player, teamSlug, severity, injuryType, duration, returnDate } = e.detail;
            return [{ id: e.id, playerId: player.id, playerName: player.name, teamSlug, severity, typeLabel: injuryType, durationLabel: duration, returnDate }];
        }
        if (e.detail.kind === 'suspension') {
            const {
                fighter, fighterTeamSlug, fighterSuspensionGames, fighterReturnDate,
                opponent, opponentTeamSlug, opponentSuspensionGames, opponentReturnDate,
            } = e.detail;
            return [
                { id: `${e.id}-fighter`, playerId: fighter.id, playerName: fighter.name, teamSlug: fighterTeamSlug, severity: 'Suspension' as const, typeLabel: '출장정지', durationLabel: `${fighterSuspensionGames}경기`, returnDate: fighterReturnDate },
                { id: `${e.id}-opponent`, playerId: opponent.id, playerName: opponent.name, teamSlug: opponentTeamSlug, severity: 'Suspension' as const, typeLabel: '출장정지', durationLabel: `${opponentSuspensionGames}경기`, returnDate: opponentReturnDate },
            ];
        }
        return [];
    }), [stories]);

    return (
        <section className="space-y-3">
            <h3 className="text-lg font-black text-white">리그 부상 소식</h3>
            {isLoading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 size={20} className="animate-spin text-indigo-400" />
                </div>
            ) : items.length === 0 ? (
                <p className="text-sm text-slate-500 ko-normal py-6 text-center border border-dashed border-slate-800 rounded-lg">
                    아직 부상 소식이 없습니다.
                </p>
            ) : (
                <div className="bg-slate-900">
                    <div className="flex items-center gap-2 py-1 px-2 border-b border-slate-800">
                        <span className="w-4 h-4 shrink-0" />
                        <span className="text-sm font-bold text-slate-600 w-24 shrink-0">이름</span>
                        <span className="text-sm font-bold text-slate-600 flex-1 min-w-0">부상명</span>
                        <span className="text-sm font-bold text-slate-600 shrink-0">기간</span>
                    </div>
                    {items.map((item, i) => {
                        return (
                            <div
                                key={item.id}
                                onClick={() => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(item.playerId)}`)}
                                className={`flex items-center gap-2 py-1.5 px-2 cursor-pointer hover:bg-white/5 transition-colors ${i < items.length - 1 ? 'border-b border-slate-800/60' : ''}`}
                            >
                                <InjuryStatusBadge severity={item.severity} size={16} iconSize={10} strokeWidth={4} />
                                <PlayerHoverCard
                                    player={applyActiveInjury(playerById.get(item.playerId), {
                                        severity: item.severity, injuryType: item.typeLabel, duration: item.durationLabel, returnDate: item.returnDate,
                                    })}
                                    teamAbbr={teamAbbrBySlug.get(item.teamSlug)}
                                >
                                    <span className="text-sm font-bold text-white truncate w-24 shrink-0">{item.playerName}</span>
                                </PlayerHoverCard>
                                <span className="text-sm text-slate-400 truncate flex-1 min-w-0">{item.typeLabel}</span>
                                <span className={`text-sm truncate shrink-0 ${SEVERITY_TEXT_COLOR[item.severity]}`}>
                                    {item.durationLabel}{formatReturnDateSuffix(item.returnDate)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
};

// [2026-09-04] 홈 화면 개편 8단계(사용자 요청) — 우측 컬럼 ⑤"내 팀 최근 경기(결과)"를
// 첫 영역으로 추가했었고, [2026-09-05] 스코어보드형 전용 카드(HomeMyTeamGameCard)로
// 재설계했었다. [2026-09-05 후속2] "그 카드 삭제, '다음 5경기'를 '내 팀 스케쥴'로 개편해
// 상위 5줄=다음 5경기·하위 5줄=종료된 최근 5경기로" 요청으로 두 섹션(단일 경기 카드 +
// 다음 5경기 리스트)을 이 섹션 하나로 통합. 종료된 경기 행은 시간 칸 대신 승패+스코어를
// 보여주고, 그 외 컬럼(날짜/vs·@/팀뱃지/팀명+상대 기록)은 동일하게 유지해 하나의 리스트로
// 자연스럽게 이어지도록 한다 — 위/아래 그룹 경계에만 구분선을 하나 더 넣어 시각적으로
// 구간을 나눈다.
const HomeMyScheduleSection: React.FC = () => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, room, leagueTeams } = useLeagueContext();
    const { schedule, myTeamId } = useSeasonContext();
    const { getGameUrlId } = useGameShortCodes(room?.id);
    // [2026-09-07] 경기 공개 10분 딜레이/가상 오늘 날짜 판정에만 쓰여 초 단위 정밀도가
    // 필요 없다 — useServerClock() 대신 useServerClockBucket()으로 매초 리렌더(+그 아래
    // useMemo 재계산)를 15초에 한 번으로 줄인다(React DevTools로 실측 확인된 낭비).
    const serverNow = useServerClockBucket();
    const navigate = useNavigate();

    const preferVirtual = league?.type === 'main_league';
    const simStart = league?.sim_real_start_at ?? null;
    const gprd = league?.games_per_real_day ?? 5;
    const isTournament = league?.type === 'tournament';

    const teamBySlug = useMemo(() => {
        const m = new Map<string, LeagueTeamRow>();
        for (const t of leagueTeams) m.set(t.team_slug, t);
        return m;
    }, [leagueTeams]);

    const myGamesNormalized = useMemo(() => {
        if (!myTeamId) return [];
        return schedule
            .filter(g => g.homeTeamId === myTeamId || g.awayTeamId === myTeamId)
            .map(g => ({ ...g, scheduledAt: resolveRealAt(g, simStart, gprd) ?? g.scheduledAt }));
    }, [schedule, myTeamId, simStart, gprd]);

    const upcomingGames = useMemo(
        () => myGamesNormalized
            .filter(g => getGameDisplayState(g, serverNow) === 'scheduled')
            .sort((a, b) => (a.scheduledAt ?? a.date).localeCompare(b.scheduledAt ?? b.date))
            .slice(0, 5),
        [myGamesNormalized, serverNow],
    );
    // "종료된" 경기만 — live(진행 중)는 제외.
    const recentGames = useMemo(
        () => myGamesNormalized
            .filter(g => getGameDisplayState(g, serverNow) === 'final')
            .sort((a, b) => (b.scheduledAt ?? b.date).localeCompare(a.scheduledAt ?? a.date))
            .slice(0, 5),
        [myGamesNormalized, serverNow],
    );

    // 상대팀 승-패 레코드 — 다음 5경기/최근 5경기 상대팀 전부에 대해 한 번에 계산.
    const opponentSlugs = useMemo(
        () => [...upcomingGames, ...recentGames].map(g => g.homeTeamId === myTeamId ? g.awayTeamId : g.homeTeamId),
        [upcomingGames, recentGames, myTeamId],
    );
    const opponentRecords = useMemo(
        () => computeWL(schedule, opponentSlugs, serverNow, isTournament),
        [schedule, opponentSlugs, serverNow, isTournament],
    );

    const openGame = (gameId: string) => navigate(`/multi/leagues/${leagueId}/season/game/${getGameUrlId(gameId)}`);
    const openTeam = (slug: string) => navigate(`/multi/leagues/${leagueId}/season/roster?rteam=${slug}`);

    // [2026-09-05 후속3] "절반으로 나눠 좌측=최근 5경기, 우측=예정 5경기 테이블로" 요청 —
    // 위/아래로 이어붙인 리스트 대신 HomeStandingsSection의 동/서부 분할과 동일한 패턴
    // (2열 그리드 + 각 칸에 소제목("최근 5경기"/"예정 5경기") + 순수 테이블)으로 재구성.
    // 마지막 열은 종료된 경기(좌측)는 승패+스코어, 예정 경기(우측)는 시간으로 갈린다.
    const renderTable = (games: typeof myGamesNormalized, isRecent: boolean) => (
        <table className="w-full text-left border-collapse bg-slate-900">
            <thead>
                <tr className="border-b border-slate-800">
                    <th className="py-1 pl-2 pr-1 text-sm font-bold text-slate-600">날짜</th>
                    <th className="py-1 px-1 text-sm font-bold text-slate-600">상대</th>
                    <th className="py-1 pl-1 pr-2 text-sm font-bold text-slate-600">{isRecent ? '결과' : '시간'}</th>
                </tr>
            </thead>
            <tbody>
                {games.map((g, i) => {
                    const isHome = g.homeTeamId === myTeamId;
                    const oppSlug = isHome ? g.awayTeamId : g.homeTeamId;
                    const opp = teamBySlug.get(oppSlug);
                    const oppRecord = opponentRecords[oppSlug];
                    const isFinal = g.homeScore != null && g.awayScore != null && getGameDisplayState(g, serverNow) === 'final';
                    const myScore = isHome ? g.homeScore : g.awayScore;
                    const oppScore = isHome ? g.awayScore : g.homeScore;
                    const won = isFinal && myScore! > oppScore!;

                    return (
                        <tr
                            key={g.id}
                            onClick={() => openGame(g.id)}
                            className={`cursor-pointer hover:bg-white/5 transition-colors ${i < games.length - 1 ? 'border-b border-slate-800/60' : ''}`}
                        >
                            <td className="py-1 pl-2 pr-1 text-sm text-slate-500 tabular-nums">{fmtDateShort(g, preferVirtual)}</td>
                            <td className="py-1 px-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-sm text-slate-600 shrink-0">{isHome ? 'vs' : '@'}</span>
                                    <TeamBadge
                                        teamId={oppSlug} abbr={opp?.team_abbr}
                                        colorPrimary={opp?.color_primary} colorSecondary={opp?.color_secondary} colorText={opp?.color_text}
                                        size="xs"
                                    />
                                    <span
                                        className="text-sm font-bold text-slate-200 truncate cursor-pointer hover:text-indigo-400 hover:underline"
                                        onClick={(e) => { e.stopPropagation(); openTeam(oppSlug); }}
                                    >
                                        {opp?.team_abbr ?? oppSlug}
                                    </span>
                                    <span className="text-sm text-slate-500 tabular-nums shrink-0">{oppRecord ? `${oppRecord.wins}-${oppRecord.losses}` : ''}</span>
                                </div>
                            </td>
                            <td className="py-1 pl-1 pr-2">
                                {isFinal ? (
                                    <span className={`text-sm font-bold tabular-nums ${won ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {won ? 'W' : 'L'} {myScore}-{oppScore}
                                    </span>
                                ) : (
                                    <span className="text-sm text-slate-500 tabular-nums">{fmtTime(g, preferVirtual)}</span>
                                )}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );

    return (
        <section className="space-y-3">
            {!myTeamId ? (
                <p className="text-sm text-slate-500 ko-normal py-8 text-center border border-dashed border-slate-800 rounded-lg">
                    참가 중인 팀이 없습니다.
                </p>
            ) : upcomingGames.length === 0 && recentGames.length === 0 ? (
                <p className="text-sm text-slate-500 ko-normal py-8 text-center border border-dashed border-slate-800 rounded-lg">
                    표시할 경기가 없습니다.
                </p>
            ) : (
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1 overflow-x-auto">
                        <h4 className="text-lg font-black text-white">최근 5경기</h4>
                        {renderTable(recentGames, true)}
                    </div>
                    <div className="space-y-1 overflow-x-auto">
                        <h4 className="text-lg font-black text-white">예정 5경기</h4>
                        {renderTable(upcomingGames, false)}
                    </div>
                </div>
            )}
        </section>
    );
};

// [2026-09-05 후속] "내 팀 스케쥴 하단에 팀 스탯 및 리그 순위 테이블" 요청 — 전술 > 인사이트
// 탭(MultiTacticsView.tsx)이 이미 팀 스탯 집계(useLeaderboardData)와 스탯별 리그 순위 계산
// (computeStatRankRows)을 갖고 있어 그 계산 방식을 그대로 재사용한다. 그 함수가 export되어
// 있지 않아 이 파일에 동일 로직을 복제(computeHomeTeamStatRows) — 원본을 고칠 땐 이쪽도
// 함께 검토할 것. UI는 인사이트 탭 전용 컴포넌트(TeamStatRankList, 카드형 배경+uppercase
// tracking 스타일)를 그대로 쓰지 않고, 홈 화면의 다른 테이블(bg-slate-900 + 헤더 +
// border-b 리스트)과 동일한 톤으로 새로 작성했다.
type HomeTeamStatConfig = { key: string; label: string; format?: 'number' | 'percent'; isInverse?: boolean };

// [2026-09-05 후속2] "공/수 둘로 나눠서 두 개의 단으로" 요청 — HomeStandingsSection의 동/서부
// 분할과 동일한 패턴(2열 그리드 + 각 칸에 소제목 + 별도 테이블)으로 재구성. OREB/AST/TOV/
// ORTG/슈팅 스탯은 공격, DREB/STL/DRTG/OPP 스탯은 수비로 분류 — MultiTacticsView.tsx의
// OFFENSE_STATS/DEFENSE_STATS 분류 기준과 동일(슈팅 스탯만 그 화면은 별도 SHOOTING_STATS
// 페이지로 나누지만, 이번 요청은 공/수 2단만 원해서 슈팅 스탯은 공격 쪽에 합쳤다).
const HOME_OFFENSE_STATS_CONFIG: HomeTeamStatConfig[] = [
    { key: 'pts', label: 'PTS' },
    { key: 'oreb', label: 'OREB' },
    { key: 'ast', label: 'AST' },
    { key: 'tov', label: 'TOV', isInverse: true },
    { key: 'ortg', label: 'ORTG' },
    { key: 'fg%', label: 'FG%', format: 'percent' },
    { key: '3p%', label: '3P%', format: 'percent' },
    { key: 'efg%', label: 'EFG%', format: 'percent' },
    { key: 'ts%', label: 'TS%', format: 'percent' },
];
const HOME_DEFENSE_STATS_CONFIG: HomeTeamStatConfig[] = [
    { key: 'dreb', label: 'DREB' },
    { key: 'stl', label: 'STL' },
    { key: 'drtg', label: 'DRTG', isInverse: true },
    { key: 'opp_pts', label: 'OPP PTS', isInverse: true },
    { key: 'opp_tov', label: 'OPP TOV' },
];

interface HomeTeamStatRow {
    key: string; label: string; format?: 'number' | 'percent';
    value: number; leagueAvg: number; rank: number; totalTeams: number;
}

// MultiTacticsView.tsx의 computeStatRankRows와 동일 로직(복제) — allTeamStats(useLeaderboardData의
// 팀 sortedData)에서 각 스탯의 우리 팀 값/리그평균/순위를 계산.
function computeHomeTeamStatRows(allTeamStats: any[], myTeamId: string | null, statsConfig: HomeTeamStatConfig[]): HomeTeamStatRow[] {
    if (!myTeamId || allTeamStats.length === 0) return [];
    const myTeam = allTeamStats.find((t: any) => t.id === myTeamId);
    if (!myTeam) return [];
    return statsConfig.map(({ key, label, format, isInverse }) => {
        const sorted = [...allTeamStats].sort((a: any, b: any) => {
            const av = a.stats?.[key] ?? 0, bv = b.stats?.[key] ?? 0;
            return isInverse ? av - bv : bv - av;
        });
        const rank = sorted.findIndex((t: any) => t.id === myTeamId) + 1;
        const leagueAvg = allTeamStats.reduce((sum: number, t: any) => sum + (t.stats?.[key] ?? 0), 0) / allTeamStats.length;
        return { key, label, format, value: myTeam.stats?.[key] ?? 0, leagueAvg, rank: rank > 0 ? rank : sorted.length, totalTeams: sorted.length };
    });
}

function formatHomeStatValue(val: number, format?: 'number' | 'percent'): string {
    if (format === 'percent') return (val * 100).toFixed(1) + '%';
    return val.toFixed(1);
}

// VisualShotChart.tsx/TeamStatRankList.tsx와 동일한 순위 색상 컨벤션(1~5=fuchsia, 6~10=emerald, 11~30=blue).
function homeRankColor(rank: number): string {
    if (rank <= 5) return 'text-fuchsia-400';
    if (rank <= 10) return 'text-emerald-400';
    return 'text-blue-400';
}

const HomeMyTeamStatsSection: React.FC = () => {
    const { league, leagueTeams, room } = useLeagueContext();
    const { myTeamId, schedule } = useSeasonContext();

    const useCustomOverrides = (league?.draft_pool ?? '').split(',').map(s => s.trim()).includes('alltime');
    const allRosterIds = useMemo(() => [...new Set(leagueTeams.flatMap(t => t.roster ?? []))], [leagueTeams]);
    // [2026-09-07] game_pbp 원본 fetch(includePbp:false로 생략) 대신 서버 집계 RPC로 선수
    // 시즌 스탯을 받는다 — 홈 화면 최초 진입 병목 개선(buildLeagueTeams.ts 주석 참고).
    const { data: statsByPlayer } = usePlayerSeasonStatsLeague(room?.id, allRosterIds);
    const selectTeams = useCallback(
        (raw: LeagueRawStatsData) => buildLeagueTeams(raw, leagueTeams, useCustomOverrides, statsByPlayer),
        [leagueTeams, useCustomOverrides, statsByPlayer],
    );
    const { data: teams = [] } = useLeagueRawStats(room?.id, allRosterIds, selectTeams, { includePbp: false });

    // useLeaderboardData의 isFinal() 게이팅이 정확히 동작하려면 game_seq 기반 경기(scheduledAt
    // 없을 수 있음)도 resolveRealAt으로 역산해야 한다 — MultiTacticsView.tsx와 동일 처리.
    const simStart = league?.sim_real_start_at ?? null;
    const gprd = league?.games_per_real_day ?? 5;
    const normalizedSchedule = useMemo(
        () => schedule.map(g => ({ ...g, scheduledAt: resolveRealAt(g, simStart, gprd) ?? g.scheduledAt })),
        [schedule, simStart, gprd],
    );
    const teamSortConfig = useMemo(() => ({ key: 'pts', direction: 'desc' as const }), []);
    const { sortedData: allTeamStats } = useLeaderboardData(
        teams, normalizedSchedule, [], teamSortConfig, 'Teams', [], [], '', 'Traditional', 'regular',
    );
    const offenseRows = useMemo(() => computeHomeTeamStatRows(allTeamStats, myTeamId, HOME_OFFENSE_STATS_CONFIG), [allTeamStats, myTeamId]);
    const defenseRows = useMemo(() => computeHomeTeamStatRows(allTeamStats, myTeamId, HOME_DEFENSE_STATS_CONFIG), [allTeamStats, myTeamId]);

    const renderStatTable = (rows: HomeTeamStatRow[]) => (
        <table className="w-full text-left border-collapse bg-slate-900">
            <thead>
                <tr className="border-b border-slate-800">
                    <th className="py-1 pl-2 pr-1 text-sm font-bold text-slate-600">스탯</th>
                    <th className="py-1 px-1 text-sm font-bold text-slate-600 text-center">값</th>
                    <th className="py-1 px-1 text-sm font-bold text-slate-600 text-center">평균</th>
                    <th className="py-1 pl-1 pr-2 text-sm font-bold text-slate-600 text-center">순위</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((row, i) => (
                    <tr key={row.key} className={i < rows.length - 1 ? 'border-b border-slate-800/60' : ''}>
                        <td className="py-1 pl-2 pr-1 text-sm font-bold text-slate-300">{row.label}</td>
                        <td className="py-1 px-1 text-sm text-center text-white tabular-nums">{formatHomeStatValue(row.value, row.format)}</td>
                        <td className="py-1 px-1 text-sm text-center text-slate-500 tabular-nums">{formatHomeStatValue(row.leagueAvg, row.format)}</td>
                        <td className={`py-1 pl-1 pr-2 text-sm text-center tabular-nums font-bold ${homeRankColor(row.rank)}`}>{row.rank}위</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    return (
        <section className="space-y-3">
            <h3 className="text-lg font-black text-white">팀 스탯</h3>
            {!myTeamId ? (
                <p className="text-sm text-slate-500 ko-normal py-8 text-center border border-dashed border-slate-800 rounded-lg">
                    참가 중인 팀이 없습니다.
                </p>
            ) : offenseRows.length === 0 ? (
                <p className="text-sm text-slate-500 ko-normal py-8 text-center border border-dashed border-slate-800 rounded-lg">
                    스탯 정보를 불러오는 중입니다.
                </p>
            ) : (
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <h4 className="text-sm font-black text-slate-500 uppercase px-1">공격</h4>
                        {renderStatTable(offenseRows)}
                    </div>
                    <div className="space-y-1">
                        <h4 className="text-sm font-black text-slate-500 uppercase px-1">수비</h4>
                        {renderStatTable(defenseRows)}
                    </div>
                </div>
            )}
        </section>
    );
};

// [2026-09-04] 홈 화면 개편 9단계(사용자 요청) — 우측 컬럼 ⑦"내 로스터 요약"을 최근 경기
// 하단에 추가. HomeLeagueLeadersSection과 동일한 원본 fetch(useLeagueRawStats +
// buildLeagueTeams)를 재사용 — queryKey(room?.id + allRosterIds)가 같아 캐시를 그대로
// 공유한다. 전체 로스터(15명)를 다 나열하기엔 요약 위젯으로 과해서, OVR 내림차순 상위
// 8명만 보여준다(스타팅 5 + 벤치 주력 정도).
const HomeMyRosterSummarySection: React.FC = () => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, leagueTeams, room } = useLeagueContext();
    const { myTeamId, schedule, currentSimDate } = useSeasonContext();
    // [2026-09-07] 경기 공개 10분 딜레이/가상 오늘 날짜 판정에만 쓰여 초 단위 정밀도가
    // 필요 없다 — useServerClock() 대신 useServerClockBucket()으로 매초 리렌더(+그 아래
    // useMemo 재계산)를 15초에 한 번으로 줄인다(React DevTools로 실측 확인된 낭비).
    const serverNow = useServerClockBucket();
    const navigate = useNavigate();
    const { getPlayerUrlId } = usePlayerShortCodes();

    const useCustomOverrides = (league?.draft_pool ?? '').split(',').map(s => s.trim()).includes('alltime');
    const allRosterIds = useMemo(() => [...new Set(leagueTeams.flatMap(t => t.roster ?? []))], [leagueTeams]);
    // [2026-09-07] game_pbp 원본 fetch(includePbp:false로 생략) 대신 서버 집계 RPC로 선수
    // 시즌 스탯을 받는다 — 홈 화면 최초 진입 병목 개선(buildLeagueTeams.ts 주석 참고).
    const { data: statsByPlayer } = usePlayerSeasonStatsLeague(room?.id, allRosterIds);
    const selectTeams = useCallback(
        (raw: LeagueRawStatsData) => buildLeagueTeams(raw, leagueTeams, useCustomOverrides, statsByPlayer),
        [leagueTeams, useCustomOverrides, statsByPlayer],
    );
    const { data: teams = [] } = useLeagueRawStats(room?.id, allRosterIds, selectTeams, { includePbp: false });

    // [2026-09-05 버그 수정] "호버 카드에 부상 정보가 안 뜬다" — HomeLeagueLeadersSection과
    // 동일한 원인/해법(buildLeagueTeams()는 현재 활성 부상 상태를 채우지 않음).
    // [2026-09-07] playerInjuryRows만 필요, game_pbp 불필요 — includePbp:false.
    const selectInjuryRows = useCallback((raw: LeagueRawStatsData) => raw.playerInjuryRows, []);
    const { data: injuryRows = [] } = useLeagueRawStats(room?.id, allRosterIds, selectInjuryRows, { includePbp: false });
    const isMainLeague = league?.type === 'main_league';
    const todaySimDate = useMemo(() => {
        if (!isMainLeague) return currentSimDate;
        return findCurrentVirtualDate(schedule, league?.sim_real_start_at ?? null, league?.games_per_real_day ?? 5, serverNow) ?? currentSimDate;
    }, [isMainLeague, schedule, league?.sim_real_start_at, league?.games_per_real_day, serverNow, currentSimDate]);
    const teamIdByPlayer = useMemo(() => {
        const m = new Map<string, string>();
        for (const t of leagueTeams) for (const id of (t.roster ?? [])) m.set(id, t.team_slug);
        return m;
    }, [leagueTeams]);
    const activeInjuryByPlayer = useMemo(
        () => buildActiveInjurySeverityMap(injuryRows, todaySimDate, room?.season_number, {
            schedule, getTeamId: id => teamIdByPlayer.get(id),
        }),
        [injuryRows, todaySimDate, room?.season_number, schedule, teamIdByPlayer],
    );

    const myTeam = useMemo(() => teams.find(t => t.id === myTeamId), [teams, myTeamId]);
    // [2026-09-05 후속] "팀에 소속된 모든 선수가 보이도록" 요청 — 기존엔 OVR 상위 8명만
    // 잘라 보여주는 요약 위젯이었으나, 전체 로스터(최대 15명)를 전부 보여주도록 변경.
    const rosterPlayers = useMemo(
        () => myTeam
            ? [...myTeam.roster]
                .sort((a, b) => (b.ovr || 0) - (a.ovr || 0))
                .map(p => applyActiveInjury(p, activeInjuryByPlayer.get(p.id)))
            : [],
        [myTeam, activeInjuryByPlayer],
    );

    return (
        <section className="space-y-3">
            <h3 className="text-lg font-black text-white">내 로스터 요약</h3>
            {!myTeamId ? (
                <p className="text-sm text-slate-500 ko-normal py-8 text-center border border-dashed border-slate-800 rounded-lg">
                    참가 중인 팀이 없습니다.
                </p>
            ) : rosterPlayers.length === 0 ? (
                <p className="text-sm text-slate-500 ko-normal py-8 text-center border border-dashed border-slate-800 rounded-lg">
                    로스터 정보를 불러오는 중입니다.
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse bg-slate-900">
                        <thead>
                            <tr className="border-b border-slate-800">
                                <th className="py-1 pl-2 pr-1 text-sm font-bold text-slate-600 w-8" />
                                <th className="py-1 px-1 text-sm font-bold text-slate-600">선수</th>
                                <th className="py-1 px-1 text-sm font-bold text-slate-600 text-center">POS</th>
                                <th className="py-1 px-1 text-sm font-bold text-slate-600 text-center">MPG</th>
                                <th className="py-1 px-1 text-sm font-bold text-slate-600 text-center">PPG</th>
                                <th className="py-1 px-1 text-sm font-bold text-slate-600 text-center">APG</th>
                                <th className="py-1 px-1 text-sm font-bold text-slate-600 text-center">RPG</th>
                                <th className="py-1 px-1 text-sm font-bold text-slate-600 text-center">SPG</th>
                                <th className="py-1 px-1 text-sm font-bold text-slate-600 text-center">BPG</th>
                                <th className="py-1 px-1 text-sm font-bold text-slate-600 text-center">FG%</th>
                                <th className="py-1 pl-1 pr-2 text-sm font-bold text-slate-600 text-center">3P%</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rosterPlayers.map((p, i) => {
                                const g = p.stats?.g || 0;
                                const perGame = (v: number) => g > 0 ? (v / g).toFixed(1) : '-';
                                const pct = (m: number, a: number) => a > 0 ? `${((m / a) * 100).toFixed(1)}%` : '-';
                                return (
                                    <tr
                                        key={p.id}
                                        onClick={() => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(p.id)}`)}
                                        className={`cursor-pointer hover:bg-white/5 transition-colors ${i < rosterPlayers.length - 1 ? 'border-b border-slate-800/60' : ''}`}
                                    >
                                        <td className="py-1 pl-2 pr-1"><OvrBadge value={p.ovr} size="sm" className="!text-xs" /></td>
                                        <td className="py-1 px-1">
                                            <PlayerHoverCard player={p} teamAbbr={myTeam?.abbr}>
                                                <span className="text-sm font-bold text-slate-200 truncate">{p.name}</span>
                                            </PlayerHoverCard>
                                        </td>
                                        <td className="py-1 px-1 text-sm text-center text-slate-500">{p.position}</td>
                                        <td className="py-1 px-1 text-sm text-center text-slate-300 tabular-nums">{perGame(p.stats.mp)}</td>
                                        <td className="py-1 px-1 text-sm text-center text-slate-300 tabular-nums">{perGame(p.stats.pts)}</td>
                                        <td className="py-1 px-1 text-sm text-center text-slate-300 tabular-nums">{perGame(p.stats.ast)}</td>
                                        <td className="py-1 px-1 text-sm text-center text-slate-300 tabular-nums">{perGame(p.stats.reb)}</td>
                                        <td className="py-1 px-1 text-sm text-center text-slate-300 tabular-nums">{perGame(p.stats.stl)}</td>
                                        <td className="py-1 px-1 text-sm text-center text-slate-300 tabular-nums">{perGame(p.stats.blk)}</td>
                                        <td className="py-1 px-1 text-sm text-center text-slate-400 tabular-nums">{pct(p.stats.fgm, p.stats.fga)}</td>
                                        <td className="py-1 pl-1 pr-2 text-sm text-center text-slate-400 tabular-nums">{pct(p.stats.p3m, p.stats.p3a)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
};

// [2026-09-04] 홈 화면 개편 10단계(사용자 요청, 우측 컬럼 마지막 영역) — ⑨"내 팀 부상자
// 현황". 좌측 ②번(리그 부상 소식)이 "발생 사건"(league_events의 injury 타입, GRADE3
// 이상만) 위주라면 이건 "지금 이 순간 활성 상태인" 부상만 보여준다 — 로스터/전술 화면이
// 부상 배지에 쓰는 것과 동일한 room_player_state → buildActiveInjurySeverityMap() 판정
// 로직을 그대로 재사용(server/src/simRunner.ts §2.5 오버레이와 동일 기준, 화면마다 판정이
// 어긋나지 않도록 이미 공용 유틸로 뽑혀 있음). room_player_state는 player_id 단위 행이라
// useLeagueRawStats(select로 raw.playerInjuryRows만 뽑음)를 내 팀 로스터 id로만 걸러
// 쓴다 — allRosterIds(리그 전체)로 fetch 자체는 이미 다른 홈 위젯(리더/로스터 요약)이
// 캐시해둔 것과 같은 queryKey라 추가 네트워크 비용 없음.
// [2026-09-05 버그 수정] "과거 이력까지 나온다" 리포트 — 원인은 buildActiveInjurySeverityMap에
// currentSimDate(useSeasonContext, rooms.sim_date=실제 KST 벽시계 날짜)를 그대로 넘긴 것.
// injury_history의 date/returnDate는 메인리그 한정 가상 NBA 캘린더 날짜(games.game_date와
// 동일 도메인, 예: "2026-11-22")라 실제 KST 날짜와 값 자체가 다르다(MultiNewsFeedView.tsx의
// "todaySimDate" 버그와 동일 계열 — 그때는 날짜 필터 기본값용으로만 고쳤고 이 판정 함수
// 호출부는 안 고쳐져 있었음). 리그 룸을 Supabase로 직접 조회해 실제로 return_date가
// 몇 달씩 미래로 찍힌 채 활성 판정되는 것을 확인 — 벽시계가 그 날짜에 도달하려면 실제로
// 몇 달이 걸리므로 그동안 계속 "활성 부상"으로 남는다. findCurrentVirtualDate()로 만든
// 가상 날짜(메인리그가 아니면 currentSimDate 그대로)로 교체.
const HomeMyInjuriesSection: React.FC = () => {
    const { leagueId } = useParams<{ leagueId: string }>();
    const { league, leagueTeams, room } = useLeagueContext();
    const { myTeamId, currentSimDate, schedule } = useSeasonContext();
    // [2026-09-07] 경기 공개 10분 딜레이/가상 오늘 날짜 판정에만 쓰여 초 단위 정밀도가
    // 필요 없다 — useServerClock() 대신 useServerClockBucket()으로 매초 리렌더(+그 아래
    // useMemo 재계산)를 15초에 한 번으로 줄인다(React DevTools로 실측 확인된 낭비).
    const serverNow = useServerClockBucket();
    const navigate = useNavigate();
    const { getPlayerUrlId } = usePlayerShortCodes();
    const { poolPlayers } = useMultiSearchData(league, leagueTeams);

    const isMainLeague = league?.type === 'main_league';
    const todaySimDate = useMemo(() => {
        if (!isMainLeague) return currentSimDate;
        return findCurrentVirtualDate(schedule, league?.sim_real_start_at ?? null, league?.games_per_real_day ?? 5, serverNow) ?? currentSimDate;
    }, [isMainLeague, schedule, league?.sim_real_start_at, league?.games_per_real_day, serverNow, currentSimDate]);

    const allRosterIds = useMemo(() => [...new Set(leagueTeams.flatMap(t => t.roster ?? []))], [leagueTeams]);
    const myRosterIds = useMemo(
        () => new Set(leagueTeams.find(t => t.team_slug === myTeamId)?.roster ?? []),
        [leagueTeams, myTeamId],
    );
    // [2026-09-07] playerInjuryRows만 필요, game_pbp 불필요 — includePbp:false.
    const selectMyInjuryRows = useCallback(
        (raw: LeagueRawStatsData) => raw.playerInjuryRows.filter(r => myRosterIds.has(r.player_id)),
        [myRosterIds],
    );
    const { data: injuryRows = [] } = useLeagueRawStats(room?.id, allRosterIds, selectMyInjuryRows, { includePbp: false });

    const teamIdByPlayer = useMemo(() => {
        const m = new Map<string, string>();
        for (const t of leagueTeams) for (const id of (t.roster ?? [])) m.set(id, t.team_slug);
        return m;
    }, [leagueTeams]);
    const activeInjuryByPlayer = useMemo(
        () => buildActiveInjurySeverityMap(injuryRows, todaySimDate, room?.season_number, {
            schedule, getTeamId: id => teamIdByPlayer.get(id),
        }),
        [injuryRows, todaySimDate, room?.season_number, schedule, teamIdByPlayer],
    );
    const playerNameById = useMemo(() => new Map(poolPlayers.map(p => [p.id, p.name])), [poolPlayers]);
    // 선수 이름 호버 시 능력치/스탯 팝업.
    const playerById = useMemo(() => new Map(poolPlayers.map(p => [p.id, p])), [poolPlayers]);
    const teamAbbrBySlug = useMemo(() => new Map(leagueTeams.map(t => [t.team_slug, t.team_abbr])), [leagueTeams]);

    const injuredPlayers = useMemo(
        () => [...activeInjuryByPlayer.entries()]
            .map(([playerId, status]) => ({ playerId, status, name: playerNameById.get(playerId) ?? playerId }))
            .sort((a, b) => (a.status.returnDate ?? '9999-99-99').localeCompare(b.status.returnDate ?? '9999-99-99')),
        [activeInjuryByPlayer, playerNameById],
    );

    return (
        <section className="space-y-3">
            <h3 className="text-lg font-black text-white">내 팀 부상자 현황</h3>
            {!myTeamId ? (
                <p className="text-sm text-slate-500 ko-normal py-8 text-center border border-dashed border-slate-800 rounded-lg">
                    참가 중인 팀이 없습니다.
                </p>
            ) : injuredPlayers.length === 0 ? (
                <p className="text-sm text-slate-500 ko-normal py-8 text-center border border-dashed border-slate-800 rounded-lg">
                    부상자가 없습니다.
                </p>
            ) : (
                <div className="bg-slate-900">
                    <div className="flex items-center gap-2 py-1 px-2 border-b border-slate-800">
                        <span className="w-4 h-4 shrink-0" />
                        <span className="text-sm font-bold text-slate-600 w-36 shrink-0">이름</span>
                        <span className="text-sm font-bold text-slate-600 flex-1 min-w-0">부상명</span>
                        <span className="text-sm font-bold text-slate-600 shrink-0">기간</span>
                    </div>
                    {injuredPlayers.map(({ playerId, status, name }, i) => (
                        <div
                            key={playerId}
                            onClick={() => navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(playerId)}`)}
                            className={`flex items-center gap-2 py-1.5 px-2 cursor-pointer hover:bg-white/5 transition-colors ${i < injuredPlayers.length - 1 ? 'border-b border-slate-800/60' : ''}`}
                        >
                            <InjuryStatusBadge severity={status.severity} size={16} iconSize={10} strokeWidth={4} />
                            <PlayerHoverCard
                                player={applyActiveInjury(playerById.get(playerId), status)}
                                teamAbbr={teamAbbrBySlug.get(teamIdByPlayer.get(playerId) ?? '')}
                            >
                                <span className="text-sm font-bold text-white truncate w-36 shrink-0">{name}</span>
                            </PlayerHoverCard>
                            <span className="text-sm text-slate-400 truncate flex-1 min-w-0">
                                {status.severity === 'Suspension' ? '출장정지' : status.injuryType}
                            </span>
                            <span className={`text-sm truncate shrink-0 ${SEVERITY_TEXT_COLOR[status.severity]}`}>
                                {status.duration}{formatReturnDateSuffix(status.returnDate)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
};

const MultiSeasonPage: React.FC = () => {
    const { myTeamId } = useSeasonContext();
    const { leagueTeams } = useLeagueContext();
    const myTeam = useMemo(() => leagueTeams.find(t => t.team_slug === myTeamId), [leagueTeams, myTeamId]);

    return (
        <div className="grid grid-cols-2 gap-4 p-4 min-h-full">
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <img
                        src="/logos/real/PBL.svg"
                        alt="PRO BASKETBALL LEAGUE"
                        className="w-16 h-16 object-contain drop-shadow-md shrink-0"
                    />
                    <span className="text-2xl font-black text-white">PRO BASKETBALL LEAGUE</span>
                </div>
                <HomeStandingsSection />
                <HomeLeagueLeadersSection />
                <HomeLatestNewsSection />
                {/* [2026-09-05 후속] "트랜잭션 소식 영역을 반으로 나눠 좌측=트랜잭션,
                    우측=리그 부상 소식" 요청 — 각 섹션은 자기 헤더("트랜잭션 소식"/"리그
                    부상 소식")를 그대로 갖고 있어 내부 수정 없이 배치만 2열로 바꿨다. */}
                <div className="grid grid-cols-2 gap-4">
                    <HomeTransactionsSection />
                    <HomeInjurySection />
                </div>
            </div>
            <div className="space-y-6">
                {myTeam && (
                    <div className="flex items-center gap-3">
                        {/* 실제 팀 로고 세트(public/logos/real/) — RosterView.tsx/PlayerDetailView.tsx
                            헤더와 동일한 폴백 체인(신규 로고 실패 시 구버전 → 플레이스홀더). */}
                        <img
                            src={getRealTeamLogoUrl(myTeam.team_slug)}
                            alt={myTeam.team_abbr}
                            className="w-16 h-16 object-contain drop-shadow-md shrink-0"
                            onError={(e) => {
                                const img = e.currentTarget;
                                if (img.dataset.fallback !== 'old') {
                                    img.dataset.fallback = 'old';
                                    img.src = getTeamLogoUrl(myTeam.team_slug);
                                } else {
                                    img.src = 'https://placehold.co/100x100?text=BPL';
                                }
                            }}
                        />
                        <span className="text-2xl font-black text-white">{myTeam.team_name}</span>
                    </div>
                )}
                <HomeMyScheduleSection />
                <HomeMyTeamStatsSection />
                <HomeMyRosterSummarySection />
                <HomeMyInjuriesSection />
            </div>
        </div>
    );
};

export default MultiSeasonPage;
