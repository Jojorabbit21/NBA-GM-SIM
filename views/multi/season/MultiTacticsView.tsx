
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Spinner } from '../../../components/common/Spinner';
import { InlineNotice } from '../../../components/common/InlineNotice';
import { Save, Check, RotateCcw, PenLine } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLeagueContext } from '../league/LeagueLayout';
import { getSeriesRoundLabel } from '../../../utils/playoffLogic';
import { useGame } from '../../../hooks/useGameContext';
import { useSeasonContext } from './seasonContext';
import { useMultiPlayerConditions } from './useMultiPlayerConditions';
import { TabBar } from '../../../components/common/TabBar';
import { Button } from '../../../components/common/Button';
import { DepthRotationBoard } from '../../../components/dashboard/DepthRotationBoard';
import { TacticsSlidersPanel } from '../../../components/dashboard/tactics/TacticsSlidersPanel';
import { TeamStatRankList, type StatRankRow } from '../../../components/dashboard/tactics/insights/TeamStatRankList';
import { TeamGameLogChart, type GameLogEntry } from '../../../components/dashboard/tactics/insights/TeamGameLogChart';
import { PlayerStatsTable } from '../../../components/dashboard/tactics/insights/PlayerStatsTable';
import { TeamLeadersCards } from '../../../components/dashboard/tactics/insights/TeamLeadersCards';
import { TeamZoneStatsTable } from '../../../components/dashboard/tactics/insights/TeamZoneStatsTable';
import { TeamZoneChartInsight } from '../../../components/dashboard/tactics/insights/TeamZoneChartInsight';
import { useLeagueRawStats, type LeagueRawStatsData } from '../../../hooks/useLeagueRawStats';
import { usePlayerSeasonStatsLeague } from '../../../hooks/usePlayerSeasonStatsLeague';
import { useTeamOpponentZoneStats } from '../../../hooks/useTeamOpponentZoneStats';
import { useTeamPlayTypeStats } from '../../../hooks/useTeamPlayTypeStats';
import { useLeaderboardData } from '../../../hooks/useLeaderboardData';
import { useTeamSeasonAdvancedStats } from '../../../hooks/useTeamSeasonAdvancedStats';
import { useGameShortCodes } from '../../../hooks/useGameShortCodes';
import { usePlayerShortCodes } from '../../../hooks/usePlayerShortCodes';
import { mapRawPlayerToRuntimePlayer } from '../../../services/dataMapper';
import { buildLeagueTeams } from '../../../services/multi/buildLeagueTeams';
import { buildActiveInjurySeverityMap } from '../../../services/multi/activeInjuryStatus';
import { TEAM_DATA } from '../../../data/teamData';
import { generateAutoTactics } from '../../../services/gameEngine';
import { generateSlidersForStarters } from '../../../services/game/tactics/tacticGenerator';
import { getCoachPreferences } from '../../../services/coachingStaff/coachGenerator';
import { DEFAULT_SLIDERS } from '../../../services/game/config/tacticPresets';
import { jsonEqual } from '../../../utils/jsonEqual';
import { getServerNow } from '../../../utils/serverClock';
import { isFinal, resolveRealAt } from './multiGameReveal';
import { findCurrentVirtualDate } from './multiScheduleUtils';
import { shouldUseCustomOverrides } from '../../../utils/leagueOverrides';
import { TacticPresetSelector } from '../../../components/multi/TacticPresetSelector';
import { useMultiTacticPresets } from '../../../hooks/useMultiTacticPresets';
import { buildDepthPresetData, buildTeamPresetData, applyDepthPreset, applyTeamPreset } from '../../../utils/tacticPresetData';
import type { DepthPresetData, TeamPresetData, TacticPresetKind, TacticPresetSlot, MultiTacticPreset } from '../../../services/multi/tacticPresets';
import { Dropdown, DropdownButton } from '../../../components/common/Dropdown';
import { TacticSetTimeline } from '../../../components/dashboard/tactics/TacticSetTimeline';
import { getSetLabel, getSetSliders, withSetSliders, withSetName, isClutchOn } from '../../../utils/tacticSetEdit';
import { IconButton } from '../../../components/common/IconButton';
import { TACTIC_PRESET_NAME_MAX, normalizePresetName } from '../../../services/multi/tacticPresets';
import { isImeComposing } from '../../../utils/ime';
import type { TacticSetId } from '../../../services/game/engine/pbp/tacticSchedule';

type PresetNotice = { tone: 'info' | 'danger'; text: string };
const PRESET_KINDS: TacticPresetKind[] = ['depth', 'team'];
import type { Team, Game, Player, GameTactics, DepthChart } from '../../../types';

type MultiTacticsTab = 'depth' | 'team' | 'insights';
// [2026-10-17] 'player' removed: per-player tactics disabled (deep link ?tab=player now falls back to 'depth').
const MULTI_TACTICS_TABS: MultiTacticsTab[] = ['depth', 'team', 'insights'];

// 팀 전술 탭의 슈팅 존 히트맵(TeamZoneChart)은 roster[].stats.zone_rim_m 등을 합산해서
// 그리는데, 드래프트 직후 새로 매핑한 Player는 stats가 전부 0(defaultStats)이라 항상
// 0%로만 보인다. game_pbp.home_box/away_box의 zoneData(경기별 선수 슛존 집계)를
// 선수별로 누적해서 병합해줘야 실제 토너먼트 기록이 반영된다.
const ZONE_KEYS = [
    'zone_rim_m', 'zone_rim_a', 'zone_paint_m', 'zone_paint_a',
    'zone_mid_l_m', 'zone_mid_l_a', 'zone_mid_c_m', 'zone_mid_c_a', 'zone_mid_r_m', 'zone_mid_r_a',
    'zone_c3_l_m', 'zone_c3_l_a', 'zone_c3_r_m', 'zone_c3_r_a',
    'zone_atb3_l_m', 'zone_atb3_l_a', 'zone_atb3_c_m', 'zone_atb3_c_a', 'zone_atb3_r_m', 'zone_atb3_r_a',
] as const;

// 인사이트 탭 1번 섹션 — 팀 공격/수비 지표 + 리그 순위. OFFENSE/SHOOTING/DEFENSE 3개 위젯으로
// 분리(수평 배치), CONTEST는 존별 DFGM/DFG%라 별도 계산(아래 CONTEST_ZONES). useLeaderboardData가
// 계산해주는 팀 단위 경기당 평균 스탯(team.stats[key])의 키 이름과 정확히 일치해야 한다
// (data/leaderboardConfig.ts TEAM_COLUMNS 참조). isInverse=true는 값이 낮을수록 좋은 순위라는 뜻.
type RankStatConfig = { key: string; label: string; format?: 'number' | 'percent'; isInverse?: boolean };

const OFFENSE_STATS: RankStatConfig[] = [
    { key: 'ortg', label: 'ORTG' },
    { key: 'poss', label: 'POSS' },
    { key: 'pace', label: 'PACE' },
    { key: 'pts', label: 'PTS' },
    { key: 'ast', label: 'AST' },
    { key: 'ast%', label: 'AST%', format: 'percent' },
    { key: 'oreb', label: 'OREB' },
    { key: 'tov', label: 'TOV', isInverse: true },
    { key: 'tov%', label: 'TOV%', format: 'percent', isInverse: true },
];

const SHOOTING_STATS: RankStatConfig[] = [
    { key: 'fgm', label: 'FGM' },
    { key: 'fg%', label: 'FG%', format: 'percent' },
    { key: 'p3m', label: '3PM' },
    { key: '3p%', label: '3P%', format: 'percent' },
    { key: 'ftm', label: 'FTM' },
    { key: 'ft%', label: 'FT%', format: 'percent' },
    { key: '3par', label: '3PAR', format: 'percent' },
    { key: 'ftr', label: 'FTR', format: 'percent' },
    { key: 'ts%', label: 'TS%', format: 'percent' },
    { key: 'efg%', label: 'EFG%', format: 'percent' },
];

const DEFENSE_STATS: RankStatConfig[] = [
    { key: 'drtg', label: 'DRTG', isInverse: true },
    { key: 'opp_pts', label: 'OPP PTS', isInverse: true },
    { key: 'dreb', label: 'DREB' },
    { key: 'stl', label: 'STL' },
    { key: 'stl%', label: 'STL%', format: 'percent' },
    { key: 'blk', label: 'BLK' },
    { key: 'blk%', label: 'BLK%', format: 'percent' },
    { key: 'pf', label: 'PF', isInverse: true },
    { key: 'dfg%', label: 'DFG%', format: 'percent', isInverse: true },
];

// CONTEST(존별 피FG) — buildLeagueTeams.ts가 계산해주는 oppZoneStats(상대가 우리를 상대로
// 기록한 공격 10존 zone_* 시즌 합계)를 사용. RIM/PAINT는 단일 존, MID는 좌/중/우 3존 합산,
// THREE는 코너3(좌우)+정면3(좌/중/우) 5존 전부 합산(요청에 따라 코너3도 THREE에 포함).
const CONTEST_ZONES: { key: string; label: string; zoneKeys: string[] }[] = [
    { key: 'rim', label: 'RIM', zoneKeys: ['zone_rim'] },
    { key: 'paint', label: 'PAINT', zoneKeys: ['zone_paint'] },
    { key: 'mid', label: 'MID', zoneKeys: ['zone_mid_l', 'zone_mid_c', 'zone_mid_r'] },
    { key: 'three', label: 'THREE', zoneKeys: ['zone_c3_l', 'zone_c3_r', 'zone_atb3_l', 'zone_atb3_c', 'zone_atb3_r'] },
];

// 인사이트 탭 최상단 "시즌 경기 로그" 스파크라인용 — 플레이오프 시리즈id → 라운드 라벨.
// 규칙은 utils/playoffLogic.getSeriesRoundLabel 한 곳(MultiHeader와 공유).
function computeRoundLabelMap(bracketData: unknown): Record<string, string> {
    const series: any[] = (bracketData as any)?.series ?? [];
    const map: Record<string, string> = {};
    for (const s of series) map[s.id] = getSeriesRoundLabel(s, series);
    return map;
}

/** allTeamStats(useLeaderboardData의 팀 sortedData)에서 statsConfig 각 항목에 대해 우리 팀의
 *  값/리그평균/순위를 계산 — OFFENSE/SHOOTING/DEFENSE 3개 위젯이 동일 로직을 공유한다. */
function computeStatRankRows(allTeamStats: any[], myTeamId: string | null, statsConfig: RankStatConfig[]): StatRankRow[] {
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
        return {
            key, label, format,
            value: myTeam.stats?.[key] ?? 0,
            leagueAvg,
            rank: rank > 0 ? rank : sorted.length,
            totalTeams: sorted.length,
        };
    });
}

const MultiTacticsView: React.FC = () => {
    const { league, leagueTeams, members, room, isLoading: leagueLoading , timeline } = useLeagueContext();
    const useCustomOverrides = shouldUseCustomOverrides(league);
    const { session } = useGame();
    const navigate = useNavigate();
    const { leagueId } = useParams<{ leagueId: string }>();
    const { getGameUrlId } = useGameShortCodes(room?.id);

    // MultiLeaderboardView.tsx/MultiRosterView.tsx와 동일한 패턴 — 탭 상태를 로컬 useState
    // 대신 URL 쿼리스트링(?tab=)에 저장해서 새로고침·뒤로가기·링크 공유 시에도 탭이 유지되고
    // 특정 탭으로 바로 진입하는 딥링크도 가능하게 함.
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get('tab') as MultiTacticsTab | null;
    const activeTab: MultiTacticsTab = tabParam && MULTI_TACTICS_TABS.includes(tabParam) ? tabParam : 'depth';
    const handleTabChange = useCallback((tab: MultiTacticsTab) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('tab', tab);
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    const myTeamId = useMemo(
        () => members.find(m => m.user_id === session?.user?.id)?.team_id ?? null,
        [members, session],
    );
    const myTeamRow = leagueTeams.find(t => t.team_slug === myTeamId) ?? null;

    // 인사이트 탭 "시즌 경기 로그" 막대 클릭 → 해당 경기 박스스코어/PBP 화면(MultiGamePbpView).
    // MultiScheduleView.tsx/TournamentBracketView.tsx/MultiRosterView.tsx와 동일한 패턴
    // (getGameUrlId로 실제 id를 짧은 코드로 변환).
    const handleViewGame = useCallback((gameId: string) => {
        navigate(`/multi/leagues/${leagueId}/season/game/${getGameUrlId(gameId)}`);
    }, [navigate, leagueId, getGameUrlId]);

    // 인사이트 탭 선수 스탯/존별 효율 테이블에서 선수 이름 클릭 → 선수 프로필 전용 캐노니컬
    // 라우트(MultiPlayerDetailView)로 이동. 그 화면이 리그 전체 로스터에서 playerId로 직접
    // 소속팀을 찾으므로 teamId를 별도로 넘길 필요가 없다.
    const { getPlayerUrlId } = usePlayerShortCodes();
    const handleViewPlayer = useCallback((player: Player) => {
        navigate(`/multi/leagues/${leagueId}/season/player/${getPlayerUrlId(player.id)}`);
    }, [navigate, leagueId, getPlayerUrlId]);

    const {
        userTactics, setUserTactics,
        depthChart, setDepthChart,
        coachingData,
        isLoading: gameLoading,
        isTacticsDirty, saveTactics,
        lastSavedTactics, lastSavedDepthChart,
        presetSlots, setPresetSlot, commitPresetSlot,
        schedule,
    } = useSeasonContext();

    // [2026-10-18] 전술 프리셋(뎁스·로테이션 / 팀 전술, 각 최대 3개) — 사용자가 [프리셋 +]로 추가,
    // 상단 저장 버튼이 종류별 활성 프리셋(presetSlots)에 덮어쓴다. handleSaveTactics가 쓰므로 그보다 먼저 선언(CLAUDE.md 규칙2).
    const myUserId = session?.user?.id ?? null;
    const { presets: allPresets, save: savePreset, rename: renamePreset, remove: removePreset, isLoading: presetsLoading } =
        useMultiTacticPresets(room?.id, myUserId);
    const presetsByKind = useMemo<Record<TacticPresetKind, MultiTacticPreset[]>>(() => ({
        depth: allPresets.filter(p => p.kind === 'depth'),
        team:  allPresets.filter(p => p.kind === 'team'),
    }), [allPresets]);
    // 프리셋 선택기 옆 안내(제외된 선수 수·추가/삭제/이름 변경 실패) — 탭별
    const [presetNotices, setPresetNotices] = useState<Record<TacticPresetKind, PresetNotice | null>>({ depth: null, team: null });
    const setPresetNotice = useCallback((kind: TacticPresetKind, notice: PresetNotice | null) => {
        setPresetNotices(prev => (prev[kind] === notice ? prev : { ...prev, [kind]: notice }));
    }, []);

    // ── 전술 저장 ──────────────────────────────────────────────────────────────
    const [saving, setSaving] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);
    // [2026-10-13] 저장 실패 — 예전엔 error를 완전히 버렸음(토스트·인라인·console 없음). 탭 바 우측 슬롯 sm danger(미저장 warning 대신).
    const [saveError, setSaveError] = useState<string | null>(null);

    const handleSaveTactics = useCallback(async () => {
        setSaving(true);
        setSaveError(null);
        // 현재 로스터(league_teams 실시간 구독값) 기준으로 나간 선수 ID를 걸러서 저장 — 접속 중 트레이드/방출 후
        // 메모리에 남은 stale 상태가 DB로 되돌아오는 걸 막는다. (rosterPlayers는 이 콜백보다 아래에서 선언돼 TDZ → myTeamRow 사용)
        const res = await saveTactics(myTeamRow?.roster ?? []);
        if (res.error) {
            setSaving(false);
            console.error('[tactics.save]', res.error);
            setSaveError('전술 저장에 실패했습니다. 잠시 후 다시 시도하세요.');
            return;
        }
        // 종류별 활성 프리셋이 있으면 저장된(로스터 정리 후) 값으로 덮어쓴다. 활성 프리셋이 없는 종류는 건드리지 않음.
        let presetFailed = false;
        for (const kind of PRESET_KINDS) {
            const slot = res.presetSlots[kind];
            const activePreset = slot !== null ? presetsByKind[kind].find(p => p.slot === slot) : undefined;
            if (!res.tactics || !activePreset) continue;
            const data = kind === 'depth' ? buildDepthPresetData(res.tactics, res.depthChart) : buildTeamPresetData(res.tactics);
            const presetRes = await savePreset(kind, activePreset.slot, activePreset.name, data);
            if (presetRes.error) {
                presetFailed = true;
                console.error(`[tactics.save.preset:${kind}]`, presetRes.error);
            }
        }
        setSaving(false);
        if (presetFailed) {
            setSaveError('전술은 저장됐지만 프리셋 저장에 실패했습니다. 다시 저장해 주세요.');
            return;
        }
        setPresetNotices({ depth: null, team: null });
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1500);
    }, [saveTactics, myTeamRow?.roster, presetsByKind, savePreset]);

    // 저장 안 된 변경사항이 있는 채로 브라우저를 나가려 하면(새로고침/탭 닫기/URL 이동)
    // 확인 프롬프트를 띄운다. 앱 내부 라우트 전환(사이드바 클릭 등)은 이 프로젝트가
    // BrowserRouter(선언형)를 써서 useBlocker를 못 쓰는 관계로 범위 밖.
    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (!isTacticsDirty) return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isTacticsDirty]);

    // 홈 위젯/로스터/리더보드 화면과 원본 fetch(meta_players+game_pbp)를 공유 — queryKey가
    // 같으면(room.id + 리그 전체 로스터 id 목록) 다른 화면을 먼저 방문했을 때 이미 캐시가
    // 워밍돼 있어 로더 없이 즉시 뜬다. [Fix 2026-08-13] 예전엔 이 화면만 별도 useEffect 2개로
    // meta_players/game_pbp를 각자 fetch해서, 화면(탭바+패널 껍데기)은 isReady(userTactics만
    // 확인)로 먼저 뜨고 레이더차트/슈팅맵은 두 fetch가 각자 끝나는 시점에 뒤늦게 채워지는
    // "워터폴" 현상이 있었다 — 이제 isReady에 이 fetch의 로딩 상태도 포함시켜 함께 기다린다.
    const allRosterIds = useMemo(
        () => [...new Set(leagueTeams.flatMap(t => t.roster ?? []))],
        [leagueTeams],
    );

    // schedule의 game_seq 기반 경기는 scheduledAt이 없을 수 있어(레거시) resolveRealAt으로
    // 역산해 채워야 useLeaderboardData의 isFinal() 게이팅이 정확히 동작한다(MultiLeaderboardView와 동일 처리).
    const simStart = league?.sim_real_start_at ?? null;
    const gprd     = league?.games_per_real_day ?? 5;
    const normalizedSchedule = useMemo(
        () => (schedule as Game[]).map(g => ({ ...g, scheduledAt: resolveRealAt(g, simStart, gprd) ?? g.scheduledAt })),
        [schedule, simStart, gprd],
    );

    // 뎁스차트 부상/출장정지 배지용 "지금 활성 상태인지" 판정 — MultiRosterView.tsx와
    // 동일한 findCurrentVirtualDate 패턴으로 인게임 "오늘"을 구한다. selectTacticsData보다
    // 먼저 선언해야 한다(CLAUDE.md 규칙2 — 아래에서 참조하는 activeInjuryByPlayer가 이 값을 씀).
    const preferVirtual = league?.type === 'main_league';
    const currentSimDate = useMemo(() => {
        if (!preferVirtual) return room?.sim_date ?? '';
        return findCurrentVirtualDate(schedule, simStart, gprd, getServerNow(), timeline) ?? room?.sim_date ?? '';
    }, [preferVirtual, room?.sim_date, schedule, simStart, gprd]);

    // [2026-09-07] 슈팅 존 히트맵(zoneMap)은 예전엔 selectTacticsData 안에서 raw.pbpRows(room
    // 전체 game_pbp 원본)를 직접 순회해 우리 팀 경기만 걸러 집계했다 — 서버 집계 RPC
    // (usePlayerSeasonStatsLeague)의 zone_* 필드가 정확히 "그 선수의 시즌 전체 존별 슛 집계"라
    // 동일한 값이면서 원본 fetch 자체가 필요 없다(홈/리더보드 화면과 동일한 병목 개선,
    // services/multi/buildLeagueTeams.ts 주석 참고). 내 팀 로스터로만 스코프를 좁혀 조회.
    const { data: myTeamStatsByPlayer } = usePlayerSeasonStatsLeague(room?.id, myTeamRow?.roster ?? []);

    const selectTacticsData = useCallback((raw: LeagueRawStatsData) => {
        // .in() 조회는 입력 배열 순서를 보장하지 않으므로, 드래프트 픽 순서(roster 배열 순서)대로 재정렬
        const draftOrder = myTeamRow?.roster ?? [];
        const byId = new Map(raw.playersRaw.map((r: any) => [String(r.id), r]));
        const orderedRaw = draftOrder.map(id => byId.get(String(id))).filter(Boolean);
        const rosterPlayers = orderedRaw.map((r: any) => mapRawPlayerToRuntimePlayer(r, useCustomOverrides, true));

        return { rosterPlayers, playerInjuryRows: raw.playerInjuryRows };
    }, [myTeamRow?.roster, useCustomOverrides]);

    const {
        data: tacticsRawData,
        isPending: rosterFetchLoading,
    } = useLeagueRawStats(room?.id, allRosterIds, selectTacticsData, { includePbp: false });

    const rosterPlayers = tacticsRawData?.rosterPlayers ?? [];
    const zoneStatsMap  = useMemo(() => {
        const m = new Map<string, Record<string, number>>();
        if (!myTeamStatsByPlayer) return m;
        for (const [playerId, stats] of Object.entries(myTeamStatsByPlayer)) {
            const zones: Record<string, number> = {};
            for (const k of ZONE_KEYS) zones[k] = (stats as any)[k] ?? 0;
            m.set(playerId, zones);
        }
        return m;
    }, [myTeamStatsByPlayer]);

    // 뎁스차트 부상/출장정지 배지 — playerInjuryRows는 room 전체 fetch(useLeagueRawStats)에서
    // 오므로 selectTacticsData의 반환값을 거쳐야 하고, 그 select 함수 자체는 currentSimDate
    // 변경 시 재실행할 필요가 없어(react-query select와 무관하게) 여기서 별도로 merge한다.
    const activeInjuryByPlayer = useMemo(
        () => buildActiveInjurySeverityMap(tacticsRawData?.playerInjuryRows, currentSimDate, room?.season_number, {
            schedule: schedule as { homeTeamId: string; awayTeamId: string; date: string; played: boolean }[],
            getTeamId: () => myTeamId ?? undefined,
        }),
        [tacticsRawData?.playerInjuryRows, currentSimDate, room?.season_number, schedule, myTeamId],
    );

    const rosterWithZoneStats = useMemo(() => {
        return rosterPlayers.map(p => {
            const z = zoneStatsMap.get(p.id);
            const injuryStatus = activeInjuryByPlayer.get(p.id);
            if (!z && !injuryStatus) return p;
            return {
                ...p,
                ...(z ? { stats: { ...p.stats, ...z } } : {}),
                activeInjurySeverity: injuryStatus?.severity,
                injuryType: injuryStatus?.injuryType,
                activeInjuryDuration: injuryStatus?.duration,
                returnDate: injuryStatus?.returnDate ?? undefined,
            };
        });
    }, [rosterPlayers, zoneStatsMap, activeInjuryByPlayer]);

    // ── "인사이트" 탭 전용 — 리그 전체 30팀 시즌 누적 스탯 ─────────────────────────
    // MultiLeaderboardView.tsx와 동일한 buildLeagueTeams()를 재사용(로직 중복 방지). queryKey가
    // 같은(room.id + 전체 로스터 id) useLeagueRawStats라 리더보드/로스터 화면을 먼저 방문했다면
    // 캐시를 그대로 재사용해 별도 네트워크 요청 없이 즉시 계산된다. 인사이트 탭 전용 데이터라
    // 메인 isReady 게이트에는 포함하지 않고(다른 탭이 이 fetch 때문에 기다리지 않도록) 탭 내부에서
    // 로컬 로더로 처리한다.
    // [2026-09-07] game_pbp 원본 fetch(includePbp:false로 생략) 대신 서버 집계 RPC 2개로
    // 선수 시즌 스탯 + 팀별 oppZoneStats(CONTEST 섹션용)를 받는다 — 홈/리더보드 화면과
    // 동일한 병목이 인사이트 탭에도 있었음(services/multi/buildLeagueTeams.ts 주석 참고).
    const { data: leagueStatsByPlayer, isPending: leagueStatsPending } = usePlayerSeasonStatsLeague(room?.id, allRosterIds);
    const { data: oppZoneByTeam, isPending: oppZonePending } = useTeamOpponentZoneStats(room?.id);
    const selectLeagueTeams = useCallback(
        (raw: LeagueRawStatsData): Team[] => buildLeagueTeams(raw, leagueTeams, useCustomOverrides, leagueStatsByPlayer, oppZoneByTeam),
        [leagueTeams, useCustomOverrides, leagueStatsByPlayer, oppZoneByTeam],
    );
    const {
        data: leagueTeamsWithStats = [],
        isPending: leagueTeamsFetchPending,
    } = useLeagueRawStats(room?.id, allRosterIds, selectLeagueTeams, { includePbp: false });
    // 셋 다 기다렸다 한 번에 표시 — 신원만 먼저 뜨고 스탯/oppZone이 한 박자 늦게 팝인되는
    // 문제 방지(팀 화면 Off/Def Rtg 게이트 통합과 동일한 이유).
    const leagueTeamsLoading = leagueTeamsFetchPending || leagueStatsPending || oppZonePending;

    // [2026-10-18] 팀 전술 탭 "PPP" — 서버가 경기마다 저장한 팀×플레이타입 요약을 시즌 합산(공개된 경기만)
    const { data: playTypeData, isPending: playTypePending, isError: playTypeError } = useTeamPlayTypeStats(room?.id);
    const playTypeActual = useMemo(
        () => ({
            totals: playTypeData?.totals, myTeamId, isLoading: playTypePending, isError: playTypeError,
        }),
        [playTypeData, myTeamId, playTypePending, playTypeError],
    );

    // 인사이트 탭 "선수 스탯" 테이블(PlayerStatsTable)용 — 30팀 중 우리 팀만 추출(로스터+시즌 누적 스탯 포함).
    const myTeamWithFullStats = useMemo(
        () => leagueTeamsWithStats.find(t => t.id === myTeamId) ?? null,
        [leagueTeamsWithStats, myTeamId],
    );

    // 인사이트 탭 최상단 "시즌 경기 로그" — 우리 팀이 참여하는 경기 전체(아직 안 치른 미래 경기
    // 포함, isFinal 필터 없음)를 시간순으로 정렬. 시즌 시작 시점에 games 테이블에 정규시즌
    // 82경기가 전부(미래분 포함) 미리 삽입되어 있으므로(server/src/finalize.ts insertGames),
    // 이렇게 하면 하드코딩 없이도 "치른 경기 수"가 아니라 "시즌 전체 슬롯 수"만큼 스파크라인
    // 폭이 잡힌다 — 안 치른 경기는 played:false로 표시만 하고 스파크라인에서 빈 슬롯 처리.
    // 라운드 라벨은 bracket_data 기반 computeRoundLabelMap 재사용.
    const roundLabelMap = useMemo(() => computeRoundLabelMap(league?.bracket_data), [league?.bracket_data]);
    const teamAbbrMap = useMemo(
        () => new Map(leagueTeams.map(t => [t.team_slug, t.team_abbr])),
        [leagueTeams],
    );
    // "시즌 경기 로그"의 vs DIV/vs ECF/vs WCF 분할 통계용 — 컨퍼런스는 league_teams.conference(리그별
    // 커스텀 배정)를 그대로 쓰고, 디비전은 실제 30팀 TEAM_DATA에만 존재(MultiStandingsView.tsx와
    // 동일 패턴) — 가상/커스텀 팀은 division이 없어 vsDivision이 항상 false로 떨어진다.
    const teamConfMap = useMemo(
        () => new Map(leagueTeams.map(t => [t.team_slug, t.conference as 'East' | 'West'])),
        [leagueTeams],
    );
    const myDivision = myTeamId ? (TEAM_DATA[myTeamId]?.division ?? null) : null;
    const myTeamGameLog: GameLogEntry[] = useMemo(() => {
        if (!myTeamId) return [];
        const now = getServerNow();
        return normalizedSchedule
            .filter(g => g.homeTeamId === myTeamId || g.awayTeamId === myTeamId)
            .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''))
            .map(g => {
                const isHome = g.homeTeamId === myTeamId;
                const played = isFinal(g, now);
                const myScore  = played ? (isHome ? g.homeScore : g.awayScore) ?? 0 : undefined;
                const oppScore = played ? (isHome ? g.awayScore : g.homeScore) ?? 0 : undefined;
                const oppTeamId = isHome ? g.awayTeamId : g.homeTeamId;
                const oppDivision = TEAM_DATA[oppTeamId]?.division ?? null;
                return {
                    id: g.id,
                    played,
                    myScore,
                    oppScore,
                    win: played ? (myScore ?? 0) > (oppScore ?? 0) : undefined,
                    isHome,
                    isPlayoff: !!g.isPlayoff,
                    roundLabel: g.isPlayoff && g.seriesId ? roundLabelMap[g.seriesId] : undefined,
                    date: g.date,
                    homeScore: played ? g.homeScore ?? 0 : undefined,
                    awayScore: played ? g.awayScore ?? 0 : undefined,
                    homeTeamAbbr: teamAbbrMap.get(g.homeTeamId),
                    awayTeamAbbr: teamAbbrMap.get(g.awayTeamId),
                    oppConference: teamConfMap.get(oppTeamId),
                    vsDivision: !!myDivision && !!oppDivision && myDivision === oppDivision,
                };
            });
    }, [normalizedSchedule, myTeamId, roundLabelMap, teamAbbrMap, teamConfMap, myDivision]);

    // 1. 팀 공격/수비 지표 + 리그 순위 — leagueTeamsWithStats(30팀)를 useLeaderboardData에 태워
    // 팀 단위 경기당 평균 스탯을 얻은 뒤, 스탯별로 직접 재정렬해 우리 팀의 리그 순위를 계산한다
    // (useLeaderboardData의 sortedData는 sortConfig 하나로만 정렬되므로 스탯 12개 순위를 한 번에
    // 못 얻는다 — 대신 이미 계산된 값만 재사용하고 정렬/랭크만 별도로 계산).
    const teamSortConfig = useMemo(() => ({ key: 'pts', direction: 'desc' as const }), []);
    // [2026-10-19] ORTG/POSS/PACE/PTS/TOV%/DRTG/OPP PTS/STL%는 팀 화면 헤더·리더보드와 같은 서버 RPC 기준.
    const { data: teamAdvanced } = useTeamSeasonAdvancedStats(room?.id);
    const { sortedData: allTeamStats } = useLeaderboardData(
        leagueTeamsWithStats, normalizedSchedule, [], teamSortConfig, 'Teams', [], [], '', 'Traditional', 'regular',
        false, teamAdvanced,
    );

    const offenseRows  = useMemo(() => computeStatRankRows(allTeamStats, myTeamId, OFFENSE_STATS),  [allTeamStats, myTeamId]);
    const shootingRows = useMemo(() => computeStatRankRows(allTeamStats, myTeamId, SHOOTING_STATS), [allTeamStats, myTeamId]);
    const defenseRows  = useMemo(() => computeStatRankRows(allTeamStats, myTeamId, DEFENSE_STATS),  [allTeamStats, myTeamId]);

    // CONTEST — leagueTeamsWithStats(buildLeagueTeams 결과, oppZoneStats 보유)와 allTeamStats
    // (games played 조회용)를 함께 사용해 존별 DFGM(경기당)·DFG%를 30팀 기준으로 순위 계산.
    const contestRows: StatRankRow[] = useMemo(() => {
        if (!myTeamId || leagueTeamsWithStats.length === 0 || allTeamStats.length === 0) return [];

        const gamesMap = new Map<string, number>();
        for (const t of allTeamStats as any[]) gamesMap.set(t.id, t.stats?.g || 1);

        const zoneAggByTeam = new Map<string, Record<string, { m: number; a: number }>>();
        for (const t of leagueTeamsWithStats as any[]) {
            const opp = t.oppZoneStats ?? {};
            const agg: Record<string, { m: number; a: number }> = {};
            for (const { key, zoneKeys } of CONTEST_ZONES) {
                let m = 0, a = 0;
                for (const zk of zoneKeys) {
                    m += opp[`${zk}_m`] ?? 0;
                    a += opp[`${zk}_a`] ?? 0;
                }
                agg[key] = { m, a };
            }
            zoneAggByTeam.set(t.id, agg);
        }

        const rows: StatRankRow[] = [];
        for (const { key, label } of CONTEST_ZONES) {
            // DFGM(경기당 허용 성공 개수) — 적을수록 좋은 수비(isInverse)
            const dfgmSorted = [...leagueTeamsWithStats].sort((a: any, b: any) => {
                const av = (zoneAggByTeam.get(a.id)?.[key]?.m ?? 0) / (gamesMap.get(a.id) || 1);
                const bv = (zoneAggByTeam.get(b.id)?.[key]?.m ?? 0) / (gamesMap.get(b.id) || 1);
                return av - bv;
            });
            const dfgmRank = dfgmSorted.findIndex((t: any) => t.id === myTeamId) + 1;
            const myGames = gamesMap.get(myTeamId) || 1;
            const myAgg = zoneAggByTeam.get(myTeamId)?.[key] ?? { m: 0, a: 0 };
            const dfgmLeagueAvg = leagueTeamsWithStats.reduce((sum: number, t: any) => {
                const agg = zoneAggByTeam.get(t.id)?.[key] ?? { m: 0, a: 0 };
                return sum + agg.m / (gamesMap.get(t.id) || 1);
            }, 0) / leagueTeamsWithStats.length;
            rows.push({
                key: `${key}_dfgm`, label,
                value: myAgg.m / myGames,
                leagueAvg: dfgmLeagueAvg,
                rank: dfgmRank > 0 ? dfgmRank : dfgmSorted.length,
                totalTeams: dfgmSorted.length,
            });

            // DFG%(허용 야투율) — 낮을수록 좋은 수비(isInverse)
            const pctOf = (agg: { m: number; a: number }) => (agg.a > 0 ? agg.m / agg.a : 0);
            const pctSorted = [...leagueTeamsWithStats].sort((a: any, b: any) => {
                const av = pctOf(zoneAggByTeam.get(a.id)?.[key] ?? { m: 0, a: 0 });
                const bv = pctOf(zoneAggByTeam.get(b.id)?.[key] ?? { m: 0, a: 0 });
                return av - bv;
            });
            const pctRank = pctSorted.findIndex((t: any) => t.id === myTeamId) + 1;
            const pctLeagueAvg = leagueTeamsWithStats.reduce((sum: number, t: any) => {
                return sum + pctOf(zoneAggByTeam.get(t.id)?.[key] ?? { m: 0, a: 0 });
            }, 0) / leagueTeamsWithStats.length;
            rows.push({
                key: `${key}_dfg%`, label: `${label}%`, format: 'percent',
                value: pctOf(myAgg),
                leagueAvg: pctLeagueAvg,
                rank: pctRank > 0 ? pctRank : pctSorted.length,
                totalTeams: pctSorted.length,
            });
        }
        return rows;
    }, [leagueTeamsWithStats, allTeamStats, myTeamId]);

    const team = useMemo((): Team => ({
        id:            myTeamId ?? '',
        name:          myTeamRow?.team_name ?? '',
        city:          '',
        logo:          '',
        conference:    'East',
        division:      '',
        wins:          0,
        losses:        0,
        budget:        0,
        salaryCap:     0,
        luxuryTaxLine: 0,
        // rosterPlayers(원본)가 아니라 rosterWithZoneStats — 존스탯 + activeInjurySeverity(부상
        // 배지)가 병합된 버전. 둘 다 없는 선수는 원본과 동일 객체라 안전하게 대체 가능.
        roster:        rosterWithZoneStats,
    }), [myTeamId, myTeamRow?.team_name, rosterWithZoneStats]);

    const coachName = coachingData?.[myTeamId ?? '']?.headCoach?.name;

    // ── 팀 전술 탭 헤더 버튼 [2026-10-18] ─────────────────────────────────────────
    // 자동 설정: 지금 뎁스차트의 주전 5명(슬롯 1번째, 없으면 tactics.starters)으로 generateSlidersForStarters
    // (generateAutoTactics와 같은 슬라이더 계산 + 감독 성향 블렌드). 뎁스·로테이션은 건드리지 않음.
    // 주전 5명이 다 안 차 있으면 바꾸지 않고 안내. 초기화: DEFAULT_SLIDERS(싱글 TacticsBoard.handleReset과 동일, confirm).
    const [autoSetNotice, setAutoSetNotice] = useState<string | null>(null);

    // [2026-10-23] 시간별 전술 세트 — 헤더 아래 드롭다운으로 편집할 세트(1번/2번/클러치)를 고르고,
    // 슬라이더 패널·초기화는 고른 세트에만 적용(전술 자동 설정은 1번 전술 전용). 경기 반영 규칙은 engine/pbp/tacticSchedule.ts.
    const [selectedSet, setSelectedSet] = useState<TacticSetId>('main');
    const [setMenuOpen, setSetMenuOpen] = useState(false);
    // 1번/2번 이름 편집 — 프리셋 이름 변경과 같은 흐름(드롭다운 → 입력창 + 확인, Enter 확정·Esc 취소)
    const [nameDraft, setNameDraft] = useState<string | null>(null);
    // 체크 해제 상태 — 저장된 클러치 값은 보여주되(흐리게) 편집은 막는다
    const clutchLocked = selectedSet === 'clutch' && !isClutchOn(userTactics);
    const editingTactics = useMemo(
        () => (userTactics ? { ...userTactics, sliders: getSetSliders(userTactics, selectedSet) } : null),
        [userTactics, selectedSet],
    );
    const handleUpdateSetTactics = useCallback((t: GameTactics) => {
        if (!userTactics) return;
        // 클러치는 체크박스로 켠 뒤에만 편집 — 꺼진 상태에서 편집으로 생성되지 않게
        if (selectedSet === 'clutch' && !isClutchOn(userTactics)) return;
        setUserTactics(withSetSliders(userTactics, selectedSet, t.sliders));
    }, [userTactics, selectedSet, setUserTactics]);
    const altMinutes = useMemo(
        () => (userTactics?.sliderSchedule ?? '').split('').filter(c => c === '2').length,
        [userTactics?.sliderSchedule],
    );
    const confirmSetName = () => {
        if (nameDraft === null || selectedSet === 'clutch' || !userTactics) return;
        if (!normalizePresetName(nameDraft)) return;
        setUserTactics(withSetName(userTactics, selectedSet, nameDraft));
        setNameDraft(null);
    };

    const handleAutoSetSliders = useCallback(() => {
        if (!userTactics) return;
        const ids = (['PG', 'SG', 'SF', 'PF', 'C'] as const).map(pos => depthChart?.[pos]?.[0] || userTactics.starters?.[pos] || '');
        const starters = [...new Set(ids.filter(Boolean))]
            .map(id => team.roster.find(p => p.id === id))
            .filter((p): p is Player => !!p);
        if (starters.length < 5) {
            setAutoSetNotice('뎁스 차트에서 주전 5명을 모두 지정해야 자동 설정할 수 있습니다');
            return;
        }
        setAutoSetNotice(null);
        const sliders = generateSlidersForStarters(starters, getCoachPreferences(coachingData, myTeamId ?? ''));
        // 자동 설정은 1번 전술 전용 — 결과가 보이도록 1번으로 전환
        setUserTactics(withSetSliders(userTactics, 'main', sliders));
        setSelectedSet('main');
        setNameDraft(null);
    }, [userTactics, depthChart, team.roster, coachingData, myTeamId, setUserTactics]);

    const handleResetSliders = useCallback(() => {
        if (!userTactics || clutchLocked || !window.confirm(`${getSetLabel(userTactics, selectedSet)} 슬라이더를 전부 기본값으로 초기화하시겠습니까?`)) return;
        setUserTactics(withSetSliders(userTactics, selectedSet, { ...DEFAULT_SLIDERS }));
    }, [userTactics, setUserTactics, selectedSet, clutchLocked]);

    // 뎁스차트 "체력" 열 — 로스터 탭·선수 프로필과 같은 공용 훅(결과 공개 전 경기는 경기 전 체력)
    const myRosterIds = useMemo(() => [...(myTeamRow?.roster ?? [])], [myTeamRow?.roster]);
    const playerConditions = useMultiPlayerConditions(myRosterIds);

    // ── 전술 프리셋 핸들러(뎁스·팀 공용) [2026-10-18] ───────────────────────────────
    // 핸들러는 ref로 최신 편집기 상태·프리셋 목록을 읽어 identity를 고정한다 — DepthRotationBoard가 memo라
    // toolbarExtra 요소가 매 렌더 바뀌면 드래그 중 보드 전체가 다시 그려진다.
    const presetStateRef = useRef({ userTactics, depthChart, lastSavedTactics, lastSavedDepthChart, myRosterIds, presetsByKind, presetSlots });
    presetStateRef.current = { userTactics, depthChart, lastSavedTactics, lastSavedDepthChart, myRosterIds, presetsByKind, presetSlots };
    // [2026-10-18] 프리셋 전환 시 confirm은 "덮어쓰면 어디에도 남지 않는 편집"이 있을 때만 — 해당 종류(뎁스/팀)의 화면 값이
    // 마지막 저장값과도, 지금 활성 프리셋과도 다를 때. 프리셋끼리 왔다 갔다 하는 건(전부 프리셋/저장값에 남아 있음) 묻지 않는다.
    // 예전엔 전체 isTacticsDirty 기준이라 슬롯 번호만 바뀌어도(=프리셋 하나 고른 직후) 다음 전환마다 confirm이 떴다.
    const confirmOverwriteDirty = (kind: TacticPresetKind) => {
        const { userTactics: t, depthChart: d, lastSavedTactics: st, lastSavedDepthChart: sd, presetsByKind: byKind, presetSlots: slots } = presetStateRef.current;
        if (!t) return true;
        const part = (tac: GameTactics, dc: DepthChart | null) => (kind === 'depth' ? buildDepthPresetData(tac, dc) : buildTeamPresetData(tac));
        const current = part(t, d);
        if (st && jsonEqual(current, part(st, sd))) return true;
        const active = slots[kind] !== null ? byKind[kind].find(p => p.slot === slots[kind]) : undefined;
        if (active && jsonEqual(current, active.data)) return true;
        const label = kind === 'depth' ? '뎁스·로테이션' : '팀 전술';
        return window.confirm(`저장하지 않은 ${label} 변경사항이 있습니다. 프리셋을 불러오면 사라집니다. 계속할까요?`);
    };
    const findActivePreset = (kind: TacticPresetKind) => {
        const { presetsByKind: byKind, presetSlots: slots } = presetStateRef.current;
        return slots[kind] !== null ? byKind[kind].find(p => p.slot === slots[kind]) : undefined;
    };

    // 드롭다운에서 프리셋 선택 → 즉시 편집기에 적용(뎁스=뎁스차트·주전·로테이션·출전제한, 팀=슬라이더). 경기 반영은 상단 저장 버튼.
    const handleSelectPreset = useCallback((kind: TacticPresetKind, slot: TacticPresetSlot) => {
        const { userTactics: t, myRosterIds: ids, presetsByKind: byKind } = presetStateRef.current;
        const preset = byKind[kind].find(p => p.slot === slot);
        if (!preset || !t || !confirmOverwriteDirty(kind)) return;
        if (kind === 'depth') {
            const res = applyDepthPreset(t, preset.data as DepthPresetData, ids);
            setUserTactics(res.tactics);
            setDepthChart(res.depthChart);
            setPresetNotice(kind, res.removedCount > 0 ? { tone: 'info', text: `로스터에 없는 선수 ${res.removedCount}명 제외` } : null);
        } else {
            setUserTactics(applyTeamPreset(t, preset.data as TeamPresetData));
            setPresetNotice(kind, null);
        }
        setPresetSlot(kind, slot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [setUserTactics, setDepthChart, setPresetSlot, setPresetNotice]);

    // [프리셋 +] → 이름 확인 시 생성. 내용 = 지금 편집기 값, 생성된 프리셋이 곧바로 활성(슬롯 번호 즉시 저장).
    const handleCreatePreset = useCallback(async (kind: TacticPresetKind, slot: TacticPresetSlot, name: string): Promise<string | null> => {
        const { userTactics: t, depthChart: d } = presetStateRef.current;
        if (!t) return 'tactics not ready';
        const data = kind === 'depth' ? buildDepthPresetData(t, d) : buildTeamPresetData(t);
        const { error } = await savePreset(kind, slot, name, data);
        if (error) {
            setPresetNotice(kind, { tone: 'danger', text: '프리셋 추가에 실패했습니다' });
            return error;
        }
        const slotRes = await commitPresetSlot(kind, slot);
        setPresetNotice(kind, slotRes.error ? { tone: 'danger', text: '프리셋 선택 저장에 실패했습니다' } : null);
        return null;
    }, [savePreset, commitPresetSlot, setPresetNotice]);

    const handleRenamePreset = useCallback(async (kind: TacticPresetKind, name: string): Promise<string | null> => {
        const active = findActivePreset(kind);
        if (!active) return 'no active preset';
        const { error } = await renamePreset(kind, active.slot, name);
        setPresetNotice(kind, error ? { tone: 'danger', text: '이름 변경에 실패했습니다' } : null);
        return error;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [renamePreset, setPresetNotice]);

    const handleDeletePreset = useCallback(async (kind: TacticPresetKind) => {
        const preset = findActivePreset(kind);
        const keepText = kind === 'depth' ? '뎁스·로테이션' : '팀 전술';
        if (!preset || !window.confirm(`'${preset.name}' 프리셋을 삭제할까요? 현재 화면의 ${keepText}은 그대로 유지됩니다.`)) return;
        const { error } = await removePreset(kind, preset.slot);
        if (error) { setPresetNotice(kind, { tone: 'danger', text: '프리셋 삭제에 실패했습니다' }); return; }
        // 활성 프리셋이 사라졌으므로 슬롯 선택도 즉시 비운다(안 비우면 다음 저장이 지운 프리셋을 되살림)
        const slotRes = await commitPresetSlot(kind, null);
        setPresetNotice(kind, slotRes.error ? { tone: 'danger', text: '프리셋 선택 저장에 실패했습니다' } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [removePreset, commitPresetSlot, setPresetNotice]);

    // ── 되돌리기(활성 프리셋에 저장된 값으로) ─────────────────────────────────────
    // 대상 = 활성 프리셋을 지금 로스터 기준으로 적용한 결과(나간 선수 정리 후). 화면 값과 같으면 버튼 비활성 —
    // 정리 전 원본과 비교하면 선수가 빠진 프리셋은 되돌린 뒤에도 영원히 "다름"이라 버튼이 안 꺼진다.
    const revertTargets = useMemo(() => {
        const out: Record<TacticPresetKind, { tactics: GameTactics; depthChart: DepthChart | null; removedCount: number } | null> = { depth: null, team: null };
        if (!userTactics) return out;
        for (const kind of PRESET_KINDS) {
            const slot = presetSlots[kind];
            const active = slot !== null ? presetsByKind[kind].find(p => p.slot === slot) : undefined;
            if (!active) continue;
            out[kind] = kind === 'depth'
                ? applyDepthPreset(userTactics, active.data as DepthPresetData, myRosterIds)
                : { tactics: applyTeamPreset(userTactics, active.data as TeamPresetData), depthChart, removedCount: 0 };
        }
        return out;
    }, [userTactics, depthChart, presetSlots, presetsByKind, myRosterIds]);
    const canRevert = useMemo<Record<TacticPresetKind, boolean>>(() => {
        const differs = (kind: TacticPresetKind) => {
            const target = revertTargets[kind];
            if (!target || !userTactics) return false;
            return kind === 'depth'
                ? !jsonEqual(buildDepthPresetData(userTactics, depthChart), buildDepthPresetData(target.tactics, target.depthChart))
                : !jsonEqual(buildTeamPresetData(userTactics), buildTeamPresetData(target.tactics));
        };
        return { depth: differs('depth'), team: differs('team') };
    }, [revertTargets, userTactics, depthChart]);
    const revertTargetsRef = useRef(revertTargets);
    revertTargetsRef.current = revertTargets;

    // 명시적 되돌리기라 confirm 없음. 해당 종류만 덮어씀(뎁스 되돌리기는 팀 슬라이더 유지, 반대도 동일), 슬롯은 그대로.
    const handleRevertPreset = useCallback((kind: TacticPresetKind) => {
        const target = revertTargetsRef.current[kind];
        if (!target) return;
        if (kind === 'depth') {
            setUserTactics(target.tactics);
            setDepthChart(target.depthChart);
            setPresetNotice(kind, target.removedCount > 0 ? { tone: 'info', text: `로스터에 없는 선수 ${target.removedCount}명 제외` } : null);
        } else {
            setUserTactics(target.tactics);
            setPresetNotice(kind, null);
        }
    }, [setUserTactics, setDepthChart, setPresetNotice]);

    const renderPresetSelector = (kind: TacticPresetKind) => (
        <div className="flex items-center gap-2 min-w-0">
            <TacticPresetSelector
                presets={presetsByKind[kind]}
                activeSlot={presetSlots[kind] as TacticPresetSlot | null}
                disabled={presetsLoading || saving}
                onSelect={slot => handleSelectPreset(kind, slot)}
                onCreate={(slot, name) => handleCreatePreset(kind, slot, name)}
                onRename={name => handleRenamePreset(kind, name)}
                onDelete={() => handleDeletePreset(kind)}
                onRevert={() => handleRevertPreset(kind)}
                canRevert={canRevert[kind]}
            />
            {presetNotices[kind] && <InlineNotice tone={presetNotices[kind]!.tone} size="sm">{presetNotices[kind]!.text}</InlineNotice>}
        </div>
    );
    // DepthRotationBoard는 memo라 toolbarExtra를 useMemo로 고정 — 드래그 중엔 deps가 안 바뀐다.
    const depthPresetBar = useMemo(
        () => renderPresetSelector('depth'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
        [presetsByKind.depth, presetSlots.depth, presetsLoading, saving, presetNotices.depth, canRevert.depth, handleSelectPreset, handleCreatePreset, handleRenamePreset, handleDeletePreset, handleRevertPreset],
    );

    // tactics가 없는 신규 유저: 로스터 로드 완료 후 자동 생성
    // preserveDraftOrder=true — 드래프트에서 먼저 뽑은 선수가 선발을 유지하고,
    // 같은 포지션을 나중에 뽑은 선수(OVR이 더 높아도)는 벤치로 배정되도록 한다.
    useEffect(() => {
        if (gameLoading || userTactics || rosterPlayers.length === 0) return;
        setUserTactics(generateAutoTactics(team, undefined, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameLoading, userTactics, rosterPlayers.length, team, setUserTactics]);

    const isReady = !leagueLoading && !gameLoading && !!userTactics && !rosterFetchLoading;

    if (!isReady) {
        return (
            <Spinner variant="page" className="bg-slate-950" />
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden animate-in fade-in duration-300">
            <TabBar
                tabs={[
                    { id: 'depth' as MultiTacticsTab,     label: '뎁스 차트 · 로테이션' },
                    { id: 'team' as MultiTacticsTab,      label: '팀 전술' },
                    { id: 'insights' as MultiTacticsTab,  label: '인사이트' },
                    // 개인 전술 비활성화(2026-10-17) — 탭/딥링크/패널 렌더 모두 제거. 복구는 dev-log 참조.
                ]}
                activeTab={activeTab}
                onTabChange={handleTabChange}
                rightSlot={
                    <>
                        {saveError
                            ? <InlineNotice tone="danger" size="sm">{saveError}</InlineNotice>
                            : isTacticsDirty && <InlineNotice tone="warning" size="sm">저장되지 않은 변경사항이 있습니다</InlineNotice>}
                        <Button
                            variant={saving || !isTacticsDirty ? 'secondary' : 'success'}
                            size="lg"
                            onClick={handleSaveTactics}
                            disabled={saving || !isTacticsDirty}
                            isLoading={saving}
                            loadingText="저장 중…"
                            style={!saving && isTacticsDirty ? { boxShadow: '0 0 12px rgba(16,185,129,0.5)' } : undefined}
                        >
                            {savedFlash
                                ? <><Check size={13} />저장됨</>
                                : <><Save size={13} />저장</>
                            }
                        </Button>
                    </>
                }
            />
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {activeTab === 'depth' && (
                    <DepthRotationBoard
                        team={team}
                        tactics={userTactics!}
                        depthChart={depthChart}
                        onUpdateDepthChart={setDepthChart}
                        onUpdateTactics={setUserTactics}
                        coachName={coachName}
                        playerConditions={playerConditions}
                        toolbarExtra={depthPresetBar}
                    />
                )}
                {activeTab === 'team' && (
                    <div className="flex flex-col h-full overflow-hidden">
                        {/* ── Toolbar — DepthRotationBoard 툴바와 같은 구성(제목+프리셋 좌측, 자동/초기화 우측) ── */}
                        <div className="px-6 py-3 bg-slate-800 border-b border-slate-600 flex items-center justify-between flex-shrink-0 gap-4">
                            <div className="flex items-center gap-4 min-w-0">
                                <span className="text-base font-black text-white shrink-0">팀 전술</span>
                                {renderPresetSelector('team')}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                {autoSetNotice && <InlineNotice tone="warning" size="sm">{autoSetNotice}</InlineNotice>}
                                <Button variant="primary" shape="md" onClick={handleAutoSetSliders}>
                                    전술 자동 설정
                                </Button>
                                <Button variant="secondary" onClick={handleResetSliders} icon={<RotateCcw size={14} />}>
                                    초기화
                                </Button>
                            </div>
                        </div>
                        {/* ── 전술 세트 선택 바 [2026-10-23] — 슬라이더 패널·초기화가 고른 세트에 적용 ── */}
                        <div className="px-6 py-2.5 bg-slate-900 border-b border-slate-700 flex items-center gap-2 flex-shrink-0 min-w-0">
                            {nameDraft !== null ? (
                                <>
                                    <input
                                        type="text"
                                        value={nameDraft}
                                        onChange={e => setNameDraft(e.target.value)}
                                        onFocus={e => e.currentTarget.select()}
                                        onKeyDown={e => {
                                            if (isImeComposing(e)) return;
                                            if (e.key === 'Enter') confirmSetName();
                                            if (e.key === 'Escape') setNameDraft(null);
                                        }}
                                        maxLength={TACTIC_PRESET_NAME_MAX}
                                        placeholder="전술 이름"
                                        autoFocus
                                        className="h-8 w-[168px] px-3 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                                    />
                                    <Button variant="primary" size="md" onClick={confirmSetName} disabled={!normalizePresetName(nameDraft)}>
                                        확인
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Dropdown
                                        isOpen={setMenuOpen}
                                        onOpenChange={setSetMenuOpen}
                                        align="left"
                                        width="w-44"
                                        trigger={
                                            <DropdownButton
                                                isOpen={setMenuOpen}
                                                label={getSetLabel(userTactics, selectedSet)}
                                                className="h-8 w-[168px] !px-3 !py-0"
                                            />
                                        }
                                        items={(['main', 'alt', 'clutch'] as TacticSetId[]).map(id => ({
                                            id,
                                            label: <span className="truncate">{getSetLabel(userTactics, id)}</span>,
                                            active: id === selectedSet,
                                            onClick: () => setSelectedSet(id),
                                        }))}
                                    />
                                    <IconButton
                                        label="이름 변경"
                                        size="lg"
                                        tone="subtle"
                                        onClick={() => setNameDraft(getSetLabel(userTactics, selectedSet))}
                                        disabled={selectedSet === 'clutch'}
                                    >
                                        <PenLine size={16} />
                                    </IconButton>
                                </>
                            )}
                            {selectedSet === 'alt' && altMinutes === 0 && (
                                <InlineNotice tone="danger" size="sm">전술 로테이션에 이 전술 구간이 없어 경기에 쓰이지 않습니다</InlineNotice>
                            )}
                            {clutchLocked && (
                                <InlineNotice tone="danger" size="sm">전술 로테이션 차트의 클러치 전술 체크박스를 켜면 편집할 수 있습니다</InlineNotice>
                            )}
                            {/* 상시 주의사항 — 미지정 시간의 엔진 처리(tacticSchedule.scheduledSetAt: '2'가 아니면 1번) */}
                            <span className="ml-auto pl-4 text-sm text-slate-400 shrink-0">
                                전술 로테이션에서 지정하지 않은 시간은 1번 전술{getSetLabel(userTactics, 'main') !== '1번 전술' && `(${getSetLabel(userTactics, 'main')})`}로 진행됩니다
                            </span>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-slate-900">
                            <TacticSetTimeline
                                tactics={userTactics!}
                                onUpdateTactics={setUserTactics}
                                selectedSet={selectedSet}
                            />
                            <div className={`p-8 pb-20 ${clutchLocked ? 'opacity-40 pointer-events-none select-none' : ''}`} aria-disabled={clutchLocked}>
                                <TacticsSlidersPanel
                                    tactics={editingTactics!}
                                    onUpdateTactics={handleUpdateSetTactics}
                                    roster={rosterWithZoneStats}
                                    offenseDefenseSplit
                                    playTypeActual={playTypeActual}
                                />
                            </div>
                        </div>
                    </div>
                )}
                {activeTab === 'insights' && (
                    <div className="p-8 pb-20 flex flex-col gap-4">
                        {/* 최상단 — 시즌 경기 로그(득실차 스파크라인 + 득점/실점/득실차 히스토그램 + 홈원정·승패 요약) */}
                        <TeamGameLogChart games={myTeamGameLog} onBarClick={handleViewGame} />

                        {/* 팀 공격/수비 지표 + 리그 순위 — 좌측에 OFFENSE+SHOOTING 통합 테이블과
                            DEFENSE+CONTEST 통합 테이블을 수직 배치, 우측에 선수 스탯 테이블
                            (PlayerStatsTable — TeamStatRankList와 동일한 톤의 단순 리스트, 리더보드
                            테이블 RosterStatsStack은 미사용) 배치 */}
                        {offenseRows.length === 0 ? (
                            <Spinner variant="section" />
                        ) : (
                            <div className="flex flex-col lg:flex-row gap-4 items-stretch">
                                <div className="flex-[7] flex flex-col gap-4">
                                    {leagueTeamsLoading || !myTeamWithFullStats ? (
                                        <Spinner variant="section" />
                                    ) : (
                                        <>
                                            <TeamLeadersCards
                                                leagueTeams={leagueTeamsWithStats}
                                                myTeamId={myTeamId ?? ''}
                                                schedule={normalizedSchedule}
                                                onPlayerClick={handleViewPlayer}
                                            />
                                            <PlayerStatsTable
                                                team={myTeamWithFullStats}
                                                schedule={normalizedSchedule}
                                                onPlayerClick={handleViewPlayer}
                                            />
                                        </>
                                    )}
                                </div>
                                <div className="flex-[3]">
                                    <TeamStatRankList
                                        pages={[
                                            { title: '공격', rows: [...offenseRows, ...shootingRows] },
                                            { title: '수비', rows: [...defenseRows, ...contestRows] },
                                        ]}
                                    />
                                </div>
                            </div>
                        )}

                        {/* 리더/팀스탯/선수스탯 섹션과 별도 — 바디 100% 너비를 차지하는 샷차트(좌) +
                            존별 효율·리더 통합 테이블(우) 섹션, 4:6 비율(기존 차트4:효율2:리더4의
                            효율+리더 합산 폭을 그대로 유지) */}
                        {!leagueTeamsLoading && myTeamWithFullStats && (
                            <div className="flex flex-col md:flex-row gap-4">
                                <div className="flex-[4]">
                                    <TeamZoneChartInsight roster={myTeamWithFullStats.roster} />
                                </div>
                                <div className="flex-[6]">
                                    <TeamZoneStatsTable roster={myTeamWithFullStats.roster} teamAbbr={myTeamWithFullStats.abbr ?? undefined} onPlayerClick={handleViewPlayer} />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MultiTacticsView;
