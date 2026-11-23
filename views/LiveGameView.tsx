
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Team, GameTactics, DepthChart, SimulationResult, PbpLog } from '../types';
import { useLiveGame, PauseReason, GameSpeed } from '../hooks/useLiveGame';
import { LivePlayer, ShotEvent, CourtSnapshot } from '../services/game/engine/pbp/pbpTypes';
import { TEAM_DATA } from '../data/teamData';
import { LiveTacticsTab } from '../components/game/tabs/LiveTacticsTab';
import { GameRotationTab } from '../components/game/tabs/GameRotationTab';
import { COURT_WIDTH, COURT_HEIGHT, HOOP_X_LEFT, HOOP_Y_CENTER } from '../utils/courtCoordinates';
import { Clock, Users } from 'lucide-react';
import { getTeamLogoUrl } from '../utils/constants';
import { useShotChartTooltip } from '../hooks/useShotChartTooltip';
import { ShotTooltip } from '../components/game/ShotTooltip';
import { PlayerMarkers } from '../components/game/PlayerMarkers';
import { CourtPreview } from '../components/multi/CourtPreview';
import { DEFAULT_COURT_STYLE } from '../services/points/courtLoadout';
import { LiveScoreHeader } from '../components/game/LiveScoreHeader';
import { LivePbpFeed } from '../components/game/LivePbpFeed';
import { PlayerBoxPanel, GameInsightsPanel, computeTeamStats, TeamStatsCompare, type StatFlash } from './multi/season/MultiGamePbpView';
import { GameShotChartTab } from '../components/game/tabs/GameShotChartTab';
import { TabBar } from '../components/common/TabBar';
import { SegmentedControl } from '../components/common/SegmentedControl';
import { Button } from '../components/common/Button';
import { PauseFillIcon, PlayFillIcon, SkipToEndFillIcon } from '../components/game/liveControlIcons';
import { countOvertimePeriods, normalizePeriod, periodShortLabel, periodList } from '../utils/periodLabel';

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

interface LiveGameViewProps {
    homeTeam: Team;
    awayTeam: Team;
    userTeamId: string | null;
    userTactics?: GameTactics | null;
    isHomeB2B?: boolean;
    isAwayB2B?: boolean;
    homeDepthChart?: DepthChart | null;
    awayDepthChart?: DepthChart | null;
    tendencySeed?: string;
    simSettings?: import('../types/simSettings').SimSettings;
    coachPrefs?: import('../types/coaching').HeadCoachPreferences | null;
    awayUserTactics?: GameTactics | null;
    onGameEnd: (result: SimulationResult) => void;
    hideTimeout?: boolean;
    /** [2026-11-23] 스크롤되는 탭(중계·경기 기록·로테이션) 본문 끝에 붙일 푸터(Quick Game). 없으면 푸터 없음 */
    footer?: React.ReactNode;
}

type ActiveTab = 'court' | 'pbp' | 'shot' | 'rotation' | 'tactics';

// ─────────────────────────────────────────────────────────────
// Util
// ─────────────────────────────────────────────────────────────

function formatClock(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}



// ─────────────────────────────────────────────────────────────
// Full Court Shot Chart
// ─────────────────────────────────────────────────────────────

function normalizeShotForDisplay(shot: ShotEvent, isHomeTeam: boolean): { x: number; y: number } {
    let { x, y } = shot;
    if (isHomeTeam) {
        if (x < COURT_WIDTH / 2) { x = COURT_WIDTH - x; y = COURT_HEIGHT - y; }
    } else {
        if (x > COURT_WIDTH / 2) { x = COURT_WIDTH - x; y = COURT_HEIGHT - y; }
    }
    return { x, y };
}

const LiveShotChart: React.FC<{
    shotEvents: ShotEvent[];
    homeTeam: Team;
    awayTeam: Team;
    courtSnapshot: CourtSnapshot | null;
}> = ({ shotEvents, homeTeam, awayTeam, courtSnapshot }) => {
    const homeData = TEAM_DATA[homeTeam.id];
    const awayData = TEAM_DATA[awayTeam.id];
    const homeColor = homeData?.colors.primary || '#6366f1';
    const awayColor = awayData?.colors.primary || '#f59e0b';
    const [showMarkers, setShowMarkers] = useState(true);

    // courtSnapshot이 교체될 때마다 PlayerMarkers를 완전히 remount시켜 이전 마커 누적 방지
    const markerKeyRef = useRef(0);
    const prevSnapshotRef = useRef<CourtSnapshot | null>(null);
    if (courtSnapshot !== prevSnapshotRef.current) {
        markerKeyRef.current += 1;
        prevSnapshotRef.current = courtSnapshot;
    }

    const displayShots = useMemo(() => shotEvents.map(s => {
        const isHome = s.teamId === homeTeam.id;
        const norm = normalizeShotForDisplay(s, isHome);
        return { ...s, ...norm, isHome };
    }), [shotEvents, homeTeam.id]);

    // SVG court at 940x500 scale (10x of 94x50 ft). Shot coords are in 94x50 → multiply by 10.
    const S = 10;
    const { tooltip, highlightShotIds, svgRef, handleMouseMove, handleMouseLeave, handleClick, isPinned, closePinned } = useShotChartTooltip(displayShots, S);
    // [Fix 2026-08-04] 컨테이너 크기를 별도 ResizeObserver state로 추적하던 방식 제거 — 그 state가
    // 최신 렌더 크기를 못 따라잡은 순간(마운트 직후 등)엔 툴팁 위치 계산이 크게 어긋났다. 이제
    // useShotChartTooltip이 호버 시점의 getBoundingClientRect()에서 컨테이너 크기도 함께 캡처해
    // tooltip state에 담아주므로 여기서 별도로 추적할 필요가 없다.
    const containerRef = useRef<HTMLDivElement>(null);

    return (
        <div ref={containerRef} className="w-full relative" style={{ aspectRatio: '940/500' }}
            onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} onClick={handleClick}>
            <svg ref={svgRef} viewBox="0 0 940 500" className="w-full h-full">
                {/* 코트 — 상점 기본 코트(하드 메이플 우드, DEFAULT_COURT_STYLE)와 같은 CourtPreview, 중앙에 홈팀 로고 */}
                <CourtPreview {...DEFAULT_COURT_STYLE} line="#FFFFFF" logoUrl={getTeamLogoUrl(homeTeam.id)} />

                {/* Player Position Markers (아래 레이어 — 샷 도트가 위에 표시됨) */}
                {showMarkers && (
                    <PlayerMarkers
                        key={markerKeyRef.current}
                        courtSnapshot={courtSnapshot}
                        homeTeamId={homeTeam.id}
                        homeColor={homeColor}
                        awayColor={awayColor}
                        scale={S}
                    />
                )}

                {/* Shot Dots (coords in 94x50, scaled to 940x500) — 선수 마커 위에 렌더 */}
                {displayShots.map((shot, i) => {
                    const color = shot.isHome ? homeColor : awayColor;
                    const isHighlighted = highlightShotIds.has(shot.id);
                    return (
                        <g key={`${shot.id}-${i}`}>
                            {shot.isMake ? (
                                <circle cx={shot.x * S} cy={shot.y * S}
                                    r={isHighlighted ? 8.5 : 6.5} fill={color}
                                    stroke={isHighlighted ? '#fff' : 'white'}
                                    strokeWidth={isHighlighted ? 2 : 1}
                                    opacity={isHighlighted ? 1 : 0.9}
                                    className="transition-all duration-150" />
                            ) : (
                                <g transform={`translate(${shot.x * S}, ${shot.y * S})`}
                                    opacity={isHighlighted ? 1 : 0.5}
                                    className="transition-all duration-150">
                                    <line x1="-5" y1="-5" x2="5" y2="5" stroke={isHighlighted ? '#fff' : color} strokeWidth={isHighlighted ? 3 : 2.5} />
                                    <line x1="-5" y1="5" x2="5" y2="-5" stroke={isHighlighted ? '#fff' : color} strokeWidth={isHighlighted ? 3 : 2.5} />
                                </g>
                            )}
                        </g>
                    );
                })}
            </svg>
            {tooltip && (
                <ShotTooltip tooltip={tooltip} isPinned={isPinned} onClose={closePinned} />
            )}
            {/* Marker toggle */}
            <button
                onClick={() => setShowMarkers(v => !v)}
                className={`absolute top-2 left-2 z-10 p-1.5 rounded-lg border transition-colors ${
                    showMarkers
                        ? 'bg-indigo-600/80 border-indigo-500 text-white'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                }`}
                title={showMarkers ? '선수 마커 숨기기' : '선수 마커 표시'}
            >
                <Users size={14} />
            </button>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Main View
// ─────────────────────────────────────────────────────────────

export const LiveGameView: React.FC<LiveGameViewProps> = ({
    homeTeam, awayTeam, userTeamId, userTactics,
    isHomeB2B, isAwayB2B, homeDepthChart, awayDepthChart, tendencySeed, simSettings,
    coachPrefs, awayUserTactics, onGameEnd, hideTimeout = false, footer,
}) => {
    const {
        displayState, callTimeout, applyTactics, applyRotationMap,
        makeSubstitution, resume, pause, getResult,
        setSpeed, skipToEnd,
        isDelegated, canDelegate, delegateToCoach, takeBackControl,
    } = useLiveGame(
        homeTeam, awayTeam, userTeamId, userTactics,
        isHomeB2B, isAwayB2B, homeDepthChart, awayDepthChart, tendencySeed, simSettings,
        coachPrefs, awayUserTactics
    );

    const {
        homeScore, awayScore, quarter, gameClock,
        allLogs, pauseReason, isGameEnd,
        timeoutsLeft, homeOnCourt, awayOnCourt,
        homeBench, awayBench,
        activeRun, speed,
        shotEvents, homeBox, awayBox,
        homeFouls, awayFouls, userTactics: liveTactics,
        avgPossessionTime,
    } = displayState;

    const [activeTab, setActiveTab] = useState<ActiveTab>('court');
    const [pbpQuarterFilter, setPbpQuarterFilter] = useState<number>(0);   // 0 = 전체, 5·6 = 연장
    const [pauseCountdown, setPauseCountdown] = useState<number>(30);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const resumeRef = useRef(resume);

    useEffect(() => { resumeRef.current = resume; });

    const isSpectateMode = userTeamId === null;
    const isUserHome = !isSpectateMode && homeTeam.id === userTeamId;
    const homeData = TEAM_DATA[homeTeam.id];
    const awayData = TEAM_DATA[awayTeam.id];
    const homeColor = homeData?.colors.primary || '#6366f1';
    const awayColor = awayData?.colors.primary || '#f59e0b';
    const userTimeoutsLeft = isUserHome ? timeoutsLeft.home : timeoutsLeft.away;
    // [2026-10-26] 연장 수 = "N차 연장 시작" 로그 수(옛 경기의 5쿼터 종료·버저비터 로그는 연장 아님 — utils/periodLabel)
    const otCount = useMemo(() => countOvertimePeriods(allLogs), [allLogs]);
    const maxSelectableQ = isGameEnd ? 4 + otCount : normalizePeriod(quarter, otCount);

    // 사용자 일시정지('manual') 중에는 선수 교체·전술 변경이 잠긴다(훅도 같은 값으로 막음). 로테이션은 읽기 전용 차트라 편집 없음.
    const manualPaused = pauseReason === 'manual';

    // ── 경기 기록 탭(인사이트) 데이터 — 멀티 라이브 "플레이-바이-플레이" 탭과 같은 GameInsightsPanel ──
    const insightHomeStats = useMemo(() => computeTeamStats(allLogs, shotEvents, homeTeam.id), [allLogs, shotEvents, homeTeam.id]);
    const insightAwayStats = useMemo(() => computeTeamStats(allLogs, shotEvents, awayTeam.id), [allLogs, shotEvents, awayTeam.id]);
    const insightHomeOreb = useMemo(() => homeBox.reduce((a, p) => a + (p.offReb || 0), 0), [homeBox]);
    const insightAwayOreb = useMemo(() => awayBox.reduce((a, p) => a + (p.offReb || 0), 0), [awayBox]);

    // ── 박스스코어 패널(멀티 라이브 화면과 같은 PlayerBoxPanel) 데이터 ──
    const awayBoxPlayers = useMemo(() => [...awayOnCourt, ...awayBench], [awayOnCourt, awayBench]);
    const homeBoxPlayers = useMemo(() => [...homeOnCourt, ...homeBench], [homeOnCourt, homeBench]);
    const onCourtIds = useMemo(() => new Set([...homeOnCourt, ...awayOnCourt].map(p => p.playerId)), [homeOnCourt, awayOnCourt]);
    const boxConditions = useMemo(
        () => new Map<string, number | null>([...homeBoxPlayers, ...awayBoxPlayers].map(p => [p.playerId, Math.round(p.currentCondition)])),
        [homeBoxPlayers, awayBoxPlayers],
    );
    const playerById = useMemo(
        () => Object.fromEntries([...homeTeam.roster, ...awayTeam.roster].map(p => [p.id, p])),
        [homeTeam.roster, awayTeam.roster],
    );
    // 스탯 셀 틴트 — 라이브 엔진엔 박스 타임라인 재생이 없으므로 화면 갱신마다 선수별 스탯 변화분을 직접 계산한다.
    // 틴트는 그 선수의 다음 변동까지 유지, 방금 변한 선수만 fresh(도착 애니메이션) — 멀티 liveStatFlashesAt과 같은 규칙.
    const FLASH_KEYS = ['pts', 'reb', 'ast', 'pf', 'fgm', 'fga', 'p3m', 'p3a', 'ftm', 'fta'] as const;
    const prevStatRef = useRef<Map<string, number[]>>(new Map());
    const flashSeqRef = useRef(0);
    const [statFlashes, setStatFlashes] = useState<Map<string, StatFlash>>(new Map());
    useEffect(() => {
        const prev = prevStatRef.current;
        const changed: [string, StatFlash['d']][] = [];
        for (const p of [...homeBoxPlayers, ...awayBoxPlayers]) {
            const cur = FLASH_KEYS.map(k => Number((p as any)[k] ?? 0));
            const old = prev.get(p.playerId);
            if (old && cur.some((v, i) => v !== old[i])) {
                const d: StatFlash['d'] = {};
                FLASH_KEYS.forEach((k, i) => { if (cur[i] !== old[i]) (d as any)[k] = cur[i] - old[i]; });
                changed.push([p.playerId, d]);
            }
            prev.set(p.playerId, cur);
        }
        if (changed.length === 0) return;
        const t = ++flashSeqRef.current;
        setStatFlashes(m => {
            const next = new Map<string, StatFlash>();
            m.forEach((f, pid) => next.set(pid, { ...f, fresh: false }));
            for (const [pid, d] of changed) next.set(pid, { t, d, fresh: true });
            return next;
        });
    }, [homeBoxPlayers, awayBoxPlayers]); // eslint-disable-line react-hooks/exhaustive-deps

    // 카운트다운 (위임 중: 5초, 일반: 30초)
    const PAUSE_COUNTDOWN_SEC = isDelegated ? 5 : 30;
    useEffect(() => {
        if (countdownRef.current) clearInterval(countdownRef.current);
        if (pauseReason === null || pauseReason === 'manual' || isGameEnd) {   // 사용자 일시정지는 자동 재개 없음
            setPauseCountdown(PAUSE_COUNTDOWN_SEC);
            return;
        }
        setPauseCountdown(PAUSE_COUNTDOWN_SEC);
        countdownRef.current = setInterval(() => {
            setPauseCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(countdownRef.current!);
                    countdownRef.current = null;
                    resumeRef.current();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => {
            if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
        };
    }, [pauseReason, isGameEnd, isDelegated]); // eslint-disable-line react-hooks/exhaustive-deps

    // 경기 종료 처리 (onGameEnd 이중 호출 방지: onGameEnd이 인라인 함수라 매 렌더마다
    // 새 레퍼런스 → deps 변경 → effect 재실행 → finalizeLiveGame 이중 호출 위험)
    const hasCalledGameEndRef = useRef(false);
    useEffect(() => {
        if (isGameEnd && !hasCalledGameEndRef.current) {
            hasCalledGameEndRef.current = true;
            const result = getResult();
            if (result) onGameEnd(result);
        }
    }, [isGameEnd, getResult, onGameEnd]);

    const quarterLabel = isGameEnd ? 'Final' : periodShortLabel(quarter, otCount);   // [2026-10-26] 연장 OT1·OT2
    // 타임아웃을 부른 팀 약어 — 가장 최근 timeout 로그(엔진 applyTimeout이 teamId에 부른 팀을 넣는다)
    const timeoutTeamAbbr = useMemo(() => {
        if (pauseReason !== 'timeout') return null;
        for (let i = allLogs.length - 1; i >= 0; i--) {
            const l = allLogs[i];
            if (l.type === 'timeout') return l.teamId === homeTeam.id || l.teamId === awayTeam.id ? l.teamId.toUpperCase() : null;
        }
        return null;
    }, [pauseReason, allLogs, homeTeam.id, awayTeam.id]);
    const pauseLabel = pauseReason === 'manual'     ? '일시정지'
                     : pauseReason === 'halftime'   ? '하프타임'
                     : pauseReason === 'timeout'    ? '타임아웃'
                     : pauseReason === 'quarterEnd' ? `${periodShortLabel(quarter, otCount)} 종료`
                     : '';

    // PBP 필터링
    const filteredLogs = useMemo(() => {
        const items = allLogs.map((log, idx) => ({ log, idx }));
        const picked = pbpQuarterFilter === 0 ? items : items.filter(({ log }) => normalizePeriod(log.quarter, otCount) === pbpQuarterFilter);
        return picked.reverse();
    }, [allLogs, pbpQuarterFilter, otCount]);

    const TABS: { key: ActiveTab; label: string }[] = isSpectateMode
        ? [{ key: 'court', label: '중계' }, { key: 'pbp', label: '경기 기록' }, { key: 'shot', label: '샷 차트' }]
        : [
            { key: 'court',    label: '중계' },
            { key: 'pbp',      label: '경기 기록' },
            { key: 'shot',     label: '샷 차트' },
            { key: 'rotation', label: '로테이션' },
            { key: 'tactics',  label: '전술 설정' },
          ];

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">

            {/* ── 스코어버그 헤더 — 멀티 라이브 화면과 같은 점보트론 스타일(components/game/LiveScoreHeader.tsx) ── */}
            <LiveScoreHeader
                awayTeamId={awayTeam.id}
                homeTeamId={homeTeam.id}
                awayAbbr={awayTeam.id.toUpperCase()}
                homeAbbr={homeTeam.id.toUpperCase()}
                awayColor={awayColor}
                homeColor={homeColor}
                awayScore={awayScore}
                homeScore={homeScore}
                awayFouls={awayFouls}
                homeFouls={homeFouls}
                timeoutsLeft={timeoutsLeft}
                quarterLabel={quarterLabel}
                clockLabel={formatClock(gameClock)}
                pause={pauseReason && pauseReason !== 'gameEnd'
                    ? pauseReason === 'timeout'
                        // 타임아웃 — "ATL 타임아웃 (29)": 부른 팀 약어(마지막 timeout 로그의 teamId) + 남은 초 2자리
                        ? { label: `${timeoutTeamAbbr ? `${timeoutTeamAbbr} ` : ''}타임아웃 (${String(pauseCountdown).padStart(2, '0')})`, countdown: null, resumeLabel: '종료', onResume: resume }
                        : { label: pauseLabel, countdown: manualPaused ? null : pauseCountdown, resumeLabel: manualPaused ? '재개' : '종료', onResume: resume }
                    : null}
                run={activeRun ? {
                    abbr: (activeRun.teamId === homeTeam.id ? homeTeam.id : awayTeam.id).toUpperCase(),
                    teamPts: activeRun.teamPts,
                    oppPts: activeRun.oppPts,
                } : null}
                logs={allLogs}
                currentQuarter={normalizePeriod(quarter, otCount)}
            />

            {/* ── 컨트롤 영역 — 멀티 라이브 화면과 같은 공용 TabBar 탭 그룹(가운데 정렬) + 오른쪽 컨트롤 ── */}
            <TabBar
                tabs={TABS.map(t => ({ id: t.key, label: t.label }))}
                activeTab={activeTab}
                onTabChange={id => setActiveTab(id as ActiveTab)}
                align="center"
                bgClassName="bg-slate-900"
                rightSlot={
                    <>
                        {/* 재생 컨트롤 — [⏸ 일시정지][▶ 재생][⏭ 경기 종료까지] | 구분선 | [0.5x … 6x 배속].
                            ⏸ = 'manual' 정지(교체·로테이션·전술 잠김), ▶ = 재개(타임아웃·쿼터 휴식 중엔 휴식 종료와 같은 동작), 배속은 정지 여부와 무관하게 속도만 바꾼다 */}
                        <SegmentedControl
                            size="sm"
                            value={manualPaused ? 'pause' : pauseReason === null ? 'play' : ''}
                            onChange={v => {
                                if (v === 'pause') pause();
                                else if (v === 'play') resume();
                                else if (v === 'end') skipToEnd();
                            }}
                            options={[
                                { value: 'pause', label: <span title="일시정지" aria-label="일시정지" className="inline-flex"><PauseFillIcon /></span>, disabled: isGameEnd || (pauseReason !== null && !manualPaused) },
                                { value: 'play', label: <span title="재생" aria-label="재생" className="inline-flex"><PlayFillIcon /></span>, disabled: isGameEnd },
                                { value: 'end', label: <span title="경기 종료까지" aria-label="경기 종료까지" className="inline-flex"><SkipToEndFillIcon /></span>, disabled: isGameEnd },
                            ]}
                            className="!bg-transparent"
                            aria-label="재생 컨트롤"
                        />
                        <span aria-hidden="true" className="w-px h-6 bg-slate-700 shrink-0" />
                        <SegmentedControl
                            size="sm"
                            value={String(speed)}
                            onChange={v => setSpeed(Number(v) as GameSpeed)}
                            options={([0.5, 1, 1.5, 3, 6] as GameSpeed[]).map(sp => ({ value: String(sp), label: `${sp}x` }))}
                            className="!bg-transparent"
                            aria-label="재생 속도"
                        />
                        {!isSpectateMode && !hideTimeout && (
                            <span aria-hidden="true" className="w-px h-6 bg-slate-700 shrink-0" />
                        )}
                        {!isSpectateMode && !hideTimeout && (
                            // [2026-11-23] 지금 부를 수 없으면(라이브볼 상대 공·정지 중) 눌렀을 때 예약 → 다음 데드볼·우리 공에 자동 발동. 예약 중 다시 누르면 취소.
                            //   비활성은 경기 종료·잔여 0·코치 위임만. 예약 중 = 초록 그라디언트 + "타임아웃 예약됨"
                            <Button
                                variant={displayState.timeoutReserved ? 'success' : 'warning'}
                                size="md"
                                onClick={callTimeout}
                                disabled={isGameEnd || userTimeoutsLeft <= 0 || isDelegated}
                                aria-pressed={displayState.timeoutReserved}
                                className={displayState.timeoutReserved ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500' : ''}
                            >
                                {displayState.timeoutReserved ? '타임아웃 예약됨' : `타임아웃 (${userTimeoutsLeft})`}
                            </Button>
                        )}
                        {!isSpectateMode && canDelegate && (
                            <Button variant={isDelegated ? 'success' : 'secondary'} size="md" onClick={isDelegated ? takeBackControl : delegateToCoach}>
                                {isDelegated ? '↩ 직접 지휘' : '코치 위임'}
                            </Button>
                        )}
                    </>
                }
            />

            {/* ── Body ── */}
            <div className="flex flex-1 overflow-hidden">

                {/* ── 중계 탭 ── */}
                {activeTab === 'court' && (
                    // [2026-11-23] 중계 탭 본문은 세로 스크롤 — 화면 높이에 고정하지 않고 내용만큼 늘어난다(멀티 라이브 화면과 같은 방식).
                    // 박스스코어는 전체 행 높이 그대로, PBP는 기록이 늘수록 커지다가 최대 70vh에서 안쪽 스크롤.
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar-hide flex flex-col">
                    <div className="flex items-start min-h-full shrink-0">
                        {/* LEFT: 원정팀 */}
                        <div className="w-[30%] self-stretch border-r border-slate-800 bg-slate-950 flex flex-col">
                            {/* 박스스코어 — 멀티 라이브 화면과 같은 PlayerBoxPanel. 사용자 팀은 코트↔벤치 행을 끌어다 놓아 교체(일시정지·코치 위임 중엔 잠금) */}
                            <div>
                                <PlayerBoxPanel
                                    players={awayBoxPlayers}
                                    label={awayTeam.id.toUpperCase()}
                                    onCourtIds={onCourtIds}
                                    conditions={boxConditions}
                                    playerById={playerById}
                                    statFlashes={statFlashes}
                                    splitBench
                                    onSubstitute={(!isSpectateMode && !isUserHome && !isDelegated && !manualPaused) ? makeSubstitution : undefined}
                                />
                            </div>
                        </div>

                        {/* CENTER: 샷차트(상단) + PBP 로그(하단) */}
                        {/* 가운데 열 — 멀티 게임 센터와 같은 카드 모듈(여백 p-4 · 카드 사이 gap-4 · rounded-xl 카드): 샷차트 카드 + PBP 카드 */}
                        <div className="flex-1 min-w-0 flex flex-col gap-4 p-4 bg-slate-950">
                            {/* 샷차트 카드 */}
                            <div className="shrink-0 bg-slate-900 border border-slate-800 rounded-xl shadow-lg overflow-hidden">
                                <LiveShotChart
                                    shotEvents={shotEvents}
                                    homeTeam={homeTeam}
                                    awayTeam={awayTeam}
                                    courtSnapshot={displayState.courtSnapshot}
                                />
                            </div>

                            {/* PBP 로그 — 멀티 라이브 화면과 같은 디자인(components/game/LivePbpFeed.tsx) */}
                            <div className="shrink-0 min-h-[240px] max-h-[70vh] flex flex-col bg-slate-900 border border-slate-800 rounded-xl shadow-lg overflow-hidden">
                                <LivePbpFeed
                                    items={filteredLogs}
                                    homeTeamId={homeTeam.id}
                                    homeAbbr={homeTeam.id.toUpperCase()}
                                    awayAbbr={awayTeam.id.toUpperCase()}
                                    homeName={homeData ? `${homeData.city} ${homeData.name}` : homeTeam.name}
                                    awayName={awayData ? `${awayData.city} ${awayData.name}` : awayTeam.name}
                                    quarterFilter={pbpQuarterFilter}
                                    onQuarterFilterChange={setPbpQuarterFilter}
                                    periods={periodList(otCount)}
                                    maxSelectableQ={maxSelectableQ}
                                    otCount={otCount}
                                />
                            </div>
                        </div>

                        {/* RIGHT: 홈팀 */}
                        <div className="w-[30%] self-stretch border-l border-slate-800 bg-slate-950 flex flex-col">
                            {/* 박스스코어 — 멀티 라이브 화면과 같은 PlayerBoxPanel. 사용자 팀은 코트↔벤치 행을 끌어다 놓아 교체(일시정지·코치 위임 중엔 잠금) */}
                            <div>
                                <PlayerBoxPanel
                                    players={homeBoxPlayers}
                                    label={homeTeam.id.toUpperCase()}
                                    onCourtIds={onCourtIds}
                                    conditions={boxConditions}
                                    playerById={playerById}
                                    statFlashes={statFlashes}
                                    splitBench
                                    onSubstitute={(!isSpectateMode && isUserHome && !isDelegated && !manualPaused) ? makeSubstitution : undefined}
                                />
                            </div>
                        </div>
                    </div>
                    {footer}
                    </div>
                )}

                {/* ── 경기 기록 탭 — 멀티 라이브 화면 "플레이-바이-플레이" 탭과 같은 구성: 인사이트 카드(전폭) + PBP 카드(가운데 max-w-3xl) ── */}
                {activeTab === 'pbp' && (
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar-hide flex flex-col">
                    <div className="grow shrink-0 p-4 flex flex-col gap-4">
                        <div className="w-full shrink-0 bg-slate-900 border border-slate-800 rounded-xl shadow-lg overflow-hidden">
                            <div className="h-10 px-4 flex items-center bg-slate-950 border-b border-slate-800 text-sm font-bold text-slate-400">인사이트</div>
                            <div className="h-[300px] overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}>
                                <GameInsightsPanel
                                    allLogs={allLogs}
                                    homeTeamId={homeTeam.id}
                                    homeStats={insightHomeStats}
                                    awayStats={insightAwayStats}
                                    homeOreb={insightHomeOreb}
                                    awayOreb={insightAwayOreb}
                                    maxQuarter={Math.max(maxSelectableQ, 4)}
                                    homeColor={homeColor}
                                    awayColor={awayColor}
                                    homeAbbr={homeTeam.id.toUpperCase()}
                                    awayAbbr={awayTeam.id.toUpperCase()}
                                    homeBox={homeBox}
                                    awayBox={awayBox}
                                />
                            </div>
                        </div>
                        {/* 아래: PBP 카드(좌) + 팀 스탯 비교 카드(우) — 팀 스탯은 예전 전술 설정 탭 하단에서 옮겨 옴(멀티 라이브 팀 스탯 탭과 같은 TeamStatsCompare) */}
                        <div className="w-full shrink-0 grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 items-start">
                            <div className="min-h-[160px] max-h-[75vh] flex flex-col bg-slate-900 border border-slate-800 rounded-xl shadow-lg overflow-hidden">
                                <LivePbpFeed
                                    items={filteredLogs}
                                    homeTeamId={homeTeam.id}
                                    homeAbbr={homeTeam.id.toUpperCase()}
                                    awayAbbr={awayTeam.id.toUpperCase()}
                                    homeName={homeData ? `${homeData.city} ${homeData.name}` : homeTeam.name}
                                    awayName={awayData ? `${awayData.city} ${awayData.name}` : awayTeam.name}
                                    quarterFilter={pbpQuarterFilter}
                                    onQuarterFilterChange={setPbpQuarterFilter}
                                    periods={periodList(otCount)}
                                    maxSelectableQ={maxSelectableQ}
                                    otCount={otCount}
                                />
                            </div>
                            <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg overflow-hidden">
                                <div className="h-10 px-4 flex items-center justify-between bg-slate-950 border-b border-slate-800 text-sm font-bold text-slate-400">
                                    <span>팀 스탯 비교</span>
                                    <span className="flex items-center gap-3 text-xs">
                                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: awayColor }} />{awayTeam.id.toUpperCase()}</span>
                                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: homeColor }} />{homeTeam.id.toUpperCase()}</span>
                                    </span>
                                </div>
                                <TeamStatsCompare
                                    home={insightHomeStats}
                                    away={insightAwayStats}
                                    homeBox={homeBox}
                                    awayBox={awayBox}
                                    homeColor={homeColor}
                                    awayColor={awayColor}
                                    variant="card"
                                />
                            </div>
                        </div>
                    </div>
                    {footer}
                    </div>
                )}

                {/* ── 샷 차트 탭 — 멀티 라이브 "샷 차트" 탭과 같은 GameShotChartTab 카드(예전 전술 설정 탭 하단 하프코트 샷 차트를 대체) ── */}
                {activeTab === 'shot' && (
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar-hide flex flex-col">
                        <div className="grow shrink-0 p-4">
                            <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg overflow-hidden">
                                <GameShotChartTab
                                    homeTeam={homeTeam}
                                    awayTeam={awayTeam}
                                    shotEvents={shotEvents}
                                    homeBadge={{ color: homeColor, abbr: homeTeam.id.toUpperCase() }}
                                    awayBadge={{ color: awayColor, abbr: awayTeam.id.toUpperCase() }}
                                    homeBox={homeBox}
                                    awayBox={awayBox}
                                />
                            </div>
                        </div>
                        {footer}
                    </div>
                )}

                {/* ── 로테이션 탭 ── */}
                {/* 로테이션 탭 — 멀티 경기 결과 화면과 같은 GameRotationTab(읽기 전용, 양 팀 좌우 분할). 교체는 중계 탭 박스스코어 드래그로만 한다 */}
                {activeTab === 'rotation' && (
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar-hide flex flex-col">
                        <div className="grow shrink-0 p-4">
                        <GameRotationTab
                            homeTeam={homeTeam}
                            awayTeam={awayTeam}
                            homeBox={homeBox}
                            awayBox={awayBox}
                            rotationData={displayState.rotationData}
                            homeBadge={{ color: homeColor, abbr: homeTeam.id.toUpperCase() }}
                            awayBadge={{ color: awayColor, abbr: awayTeam.id.toUpperCase() }}
                            pbpLogs={allLogs}
                            splitLayout
                            shotEvents={shotEvents}
                            showAllPlayers
                            cardModules
                        />
                        </div>
                        {footer}
                    </div>
                )}

                {/* ── 전술 탭 ── */}
                {/* 전술 설정 탭 — 멀티 전술 화면과 같은 슬라이더(? 툴팁). 내용 높이만큼 흐르고 바깥에서 세로 스크롤, 끝에 푸터 */}
                {activeTab === 'tactics' && (
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar-hide flex flex-col">
                        <div className="grow shrink-0">
                            <LiveTacticsTab
                                userTactics={liveTactics}
                                onApplyTactics={applyTactics}
                                disabled={isDelegated || manualPaused}
                                disabledMessage={manualPaused ? '일시정지 중 — 전술 변경이 잠겨 있습니다' : undefined}
                            />
                        </div>
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};
