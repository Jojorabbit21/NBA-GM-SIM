import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Player, GameTactics, DepthChart, SimulationResult, Team } from '../types';
import { generateAutoTactics } from '../services/gameEngine';
import { generateSlidersForStarters } from '../services/game/tactics/tacticGenerator';
import { computeRotationMap } from '../utils/rotationAllocation';
import { LiveGameView } from '../views/LiveGameView';
import { DEFAULT_SIM_SETTINGS } from '../types/simSettings';
import { Button } from '../components/common/Button';
import { Spinner } from '../components/common/Spinner';
import { useIsPhone } from '../hooks/useViewportClass';
import { calculatePlayerOvr } from '../utils/constants';
import { buildVirtualTeam, buildTacticsFromDepth, QUICK_ROSTER_MIN } from '../utils/quickPlay';
import { QuickGameHeader } from '../views/quick/QuickGameHeader';
import { QuickTeamSetup } from '../views/quick/QuickTeamSetup';
import { QuickTacticsSetup, type QuickTacticsSide } from '../views/quick/QuickTacticsSetup';
import { QuickResultView } from '../views/quick/QuickResultView';
import { QuickGameFooter } from '../views/quick/QuickGameFooter';
import { useQuickPlayerPool } from '../views/quick/useQuickPlayerPool';
import {
    QUICK_SIDES, QUICK_SIDE_LABEL, emptySide, emptyDepthChart, depthKey, slottedIds, slottedPlayers, placeInDepth, removeFromDepth,
    type QuickSide, type QuickSideState,
} from '../views/quick/quickGameTypes';

// [2026-11-23] Quick Game — 메인 화면 "Quick Game" 메뉴. 옛 퀵플레이(/quick)를 4단계로 다시 만든 것:
//   1 팀·선수 선택 → 2 전술 설정 → 3 경기 진행(LiveGameView, 클라이언트 엔진) → 4 경기 결과(재경기 / 팀 설정).
// 서버 부하 0: 선수 풀 조회(meta_players, 풀당 1회·메모리 캐시)만 있고 경기 계산·결과는 전부 브라우저 안에서 끝나며 어디에도 저장하지 않는다.
// 선수 숨은 성향(SaveTendencies)은 전원 중립 — tendencySeed를 넘기지 않으면 엔진 initTeamState가 DEFAULT_TENDENCIES를 쓴다.
//   (슛 존 성향 player.tendencies.zones는 실제 데이터라 그대로 둔다.)
// 로스터 = 1단계 뎁스 차트 15슬롯에 든 선수. 같은 뎁스 차트가 2단계 뎁스 차트·로테이션으로 그대로 이어진다.
//
// 단계는 location.state.phase에 둔다 — 앞으로 가는 전환은 push라 브라우저 뒤로가기가 이전 단계로 돌아간다.
// 설정·경기 데이터는 컴포넌트 state(같은 라우트라 단계 전환 중 유지). 새로고침으로 state가 사라지면 1단계로 돌린다.

type QuickPhase = 'team' | 'tactics' | 'live' | 'result';
const PHASE_STEP: Record<QuickPhase, number> = { team: 0, tactics: 1, live: 2, result: 3 };
const STEP_PHASE: QuickPhase[] = ['team', 'tactics', 'live', 'result'];

interface LiveSnapshot {
    homeTeam: Team;
    awayTeam: Team;
    hTactics: GameTactics;
    aTactics: GameTactics;
    hDepth: DepthChart;
    aDepth: DepthChart;
}

const otherOf = (side: QuickSide): QuickSide => (side === 'away' ? 'home' : 'away');

const QuickGamePage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const isPhone = useIsPhone();
    const phase: QuickPhase = ((location.state as { phase?: QuickPhase } | null)?.phase) ?? 'team';

    const [sides, setSides] = useState<Record<QuickSide, QuickSideState>>(() => ({ away: emptySide(), home: emptySide() }));
    const [activeSide, setActiveSide] = useState<QuickSide>('away');
    const [live, setLive] = useState<LiveSnapshot | null>(null);
    const liveRef = useRef<LiveSnapshot | null>(null);
    liveRef.current = live;
    const [gameNo, setGameNo] = useState(0);
    const [result, setResult] = useState<{ sim: SimulationResult; homeTeam: Team; awayTeam: Team } | null>(null);
    const currentPool = useQuickPlayerPool('current');

    const goPhase = useCallback((next: QuickPhase, push: boolean) => {
        navigate('/quick', { state: { phase: next }, replace: !push });
    }, [navigate]);

    const patchSide = useCallback((side: QuickSide, patch: Partial<QuickSideState> | ((s: QuickSideState) => Partial<QuickSideState>)) => {
        setSides(prev => ({ ...prev, [side]: { ...prev[side], ...(typeof patch === 'function' ? patch(prev[side]) : patch) } }));
    }, []);

    // ── 1단계 핸들러 ──────────────────────────────────────────────────────────────
    // 팀 선택 = 그 팀 실제 로스터(현역 풀 base_team_id) 전원을 후보로, 뎁스 차트는 엔진 자동 전술의 포지션 배치(15슬롯)로 채운다.
    const handleTeamChange = (side: QuickSide, teamId: string) => {
        const cur = sides[side];
        if (cur.teamId === teamId) return;
        if (cur.customized && !window.confirm('팀을 바꾸면 지금 구성한 로스터가 새 팀의 로스터로 바뀝니다. 계속할까요?')) return;
        // 상대 진영이 이미 고른 팀이면 상대 진영의 팀 선택(로스터·전술 포함)을 해제하고 이쪽으로 가져온다
        const stealing = sides[otherOf(side)].teamId === teamId;
        if (stealing) patchSide(otherOf(side), emptySide());
        const taken = new Set(stealing ? [] : slottedIds(sides[otherOf(side)].depthChart));
        const candidates = currentPool.players
            .filter(p => currentPool.teamOf[p.id] === teamId && !taken.has(p.id))
            .sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a) || a.id.localeCompare(b.id));
        const depthChart = candidates.length > 0
            ? (generateAutoTactics(buildVirtualTeam(teamId, candidates)).depthChart ?? emptyDepthChart())
            : emptyDepthChart();
        patchSide(side, { teamId, candidates, depthChart, customized: false, tactics: null, tacticsDepthKey: null });
    };
    const handleDepthChange = useCallback((side: QuickSide, dc: DepthChart) => patchSide(side, { depthChart: dc, customized: true }), [patchSide]);
    const handleAddPlayer = (side: QuickSide, player: Player) => patchSide(side, s => {
        const depthChart = placeInDepth(s.depthChart, player);
        if (!depthChart) return {};
        const candidates = s.candidates.some(p => p.id === player.id) ? s.candidates : [...s.candidates, player];
        return { depthChart, candidates, customized: true };
    });
    const handleRemovePlayer = (side: QuickSide, playerId: string) => patchSide(side, s => ({ depthChart: removeFromDepth(s.depthChart, playerId), customized: true }));
    // 비우기 = 슬롯만 비운다(후보는 남아 드롭다운에서 다시 고를 수 있다)
    const handleClearRoster = (side: QuickSide) => patchSide(side, { depthChart: emptyDepthChart(), customized: true });

    const sideReady = (s: QuickSideState) => !!s.teamId && slottedIds(s.depthChart).length >= QUICK_ROSTER_MIN;
    const canProceed = sideReady(sides.away) && sideReady(sides.home);

    // ── 2단계 진입: 1단계에서 뎁스 차트가 바뀐 진영만 주전·로테이션 재계산(슬라이더·전술 세트는 유지) ──
    const tacticsStale = QUICK_SIDES.some(s => sides[s].teamId && sides[s].tacticsDepthKey !== depthKey(sides[s].depthChart));
    useEffect(() => {
        if (phase !== 'tactics' || !canProceed || !tacticsStale) return;
        setSides(prev => {
            const next = { ...prev };
            for (const s of QUICK_SIDES) {
                const cur = prev[s];
                const key = depthKey(cur.depthChart);
                if (!cur.teamId || cur.tacticsDepthKey === key) continue;
                const tactics = buildTacticsFromDepth(slottedPlayers(cur), cur.depthChart, cur.tactics, {
                    computeRotationMap,
                    slidersForStarters: starters => generateSlidersForStarters(starters),
                });
                next[s] = { ...cur, tactics, tacticsDepthKey: key };
            }
            return next;
        });
    }, [phase, canProceed, tacticsStale]);

    // 2단계 보드용 팀 — 드롭다운 후보 = 이 진영 후보 전원(상대 슬롯 선수 제외). 경기 로스터는 슬롯 선수만(startGame).
    const awayTakenKey = slottedIds(sides.home.depthChart).join(',');
    const homeTakenKey = slottedIds(sides.away.depthChart).join(',');
    const buildBoardTeam = (s: QuickSideState, takenKey: string) => {
        if (!s.teamId) return null;
        const taken = new Set(takenKey.split(','));
        return buildVirtualTeam(s.teamId, s.candidates.filter(p => !taken.has(p.id)));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const awayBoardTeam = useMemo(() => buildBoardTeam(sides.away, awayTakenKey), [sides.away.teamId, sides.away.candidates, awayTakenKey]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const homeBoardTeam = useMemo(() => buildBoardTeam(sides.home, homeTakenKey), [sides.home.teamId, sides.home.candidates, homeTakenKey]);
    const boardTeams = { away: awayBoardTeam, home: homeBoardTeam };

    const handleUpdateTactics = useCallback((side: QuickSide, t: GameTactics) => patchSide(side, { tactics: t }), [patchSide]);
    // 2단계에서 고친 뎁스 차트는 1단계와 같은 값 — 로테이션은 보드가 이미 맞춰 주므로 재계산 키도 같이 맞춘다
    const handleUpdateDepth = useCallback((side: QuickSide, dc: DepthChart) => patchSide(side, { depthChart: dc, tacticsDepthKey: depthKey(dc), customized: true }), [patchSide]);

    // ── 3단계: 경기 시작 / 재경기 ──────────────────────────────────────────────────
    const startGame = (push: boolean) => {
        const { away, home } = sides;
        if (!away.teamId || !home.teamId || !away.tactics || !home.tactics) return;
        setLive({
            homeTeam: buildVirtualTeam(home.teamId, slottedPlayers(home)),
            awayTeam: buildVirtualTeam(away.teamId, slottedPlayers(away)),
            hTactics: { ...home.tactics, depthChart: home.depthChart },
            aTactics: { ...away.tactics, depthChart: away.depthChart },
            hDepth: home.depthChart,
            aDepth: away.depthChart,
        });
        setGameNo(n => n + 1);
        goPhase('live', push);
    };
    const rematch = () => {
        if (!live) return;
        setGameNo(n => n + 1);
        goPhase('live', false);
    };

    const handleGameEnd = useCallback((sim: SimulationResult) => {
        const cur = liveRef.current;
        if (cur) setResult({ sim, homeTeam: cur.homeTeam, awayTeam: cur.awayTeam });
        // 끝난 라이브 화면으로는 돌아갈 수 없으므로 replace — 결과에서 뒤로가기 = 전술 설정
        goPhase('result', false);
    }, [goPhase]);

    // ── 단계 이동 가드: 필요한 데이터가 없으면(새로고침 등) 1단계로 ─────────────────
    const phaseValid =
        phase === 'team' ||
        (phase === 'tactics' && canProceed) ||
        (phase === 'live' && !!live) ||
        (phase === 'result' && !!result);
    useEffect(() => {
        if (!phaseValid) goPhase('team', false);
    }, [phaseValid, goPhase]);

    const goHome = () => {
        if (phase === 'live' && !window.confirm('진행 중인 경기를 그만두고 홈으로 이동할까요?')) return;
        navigate('/');
    };
    const handleStepClick = (step: number) => {
        const target = STEP_PHASE[step];
        if (phase === 'live' && !window.confirm('진행 중인 경기를 그만두고 설정으로 돌아갈까요?')) return;
        if (target === 'tactics' && !canProceed) return;
        goPhase(target, PHASE_STEP[target] > PHASE_STEP[phase]);
    };

    if (!phaseValid) return <Spinner variant="page" className="bg-slate-950" />;

    // ── 3단계: 경기 진행 ──────────────────────────────────────────────────────────
    if (phase === 'live' && live) {
        return (
            <div className="fixed inset-0 bg-slate-950 flex flex-col">
                <QuickGameHeader step={2} onBack={goHome} onStepClick={handleStepClick} maxClickableStep={1} compact={isPhone} />
                {/* LiveGameView 루트가 h-screen이라 상단 바 아래 남은 높이에 맞춘다 */}
                <div className="flex-1 min-h-0 [&>div]:!h-full">
                    <LiveGameView
                        key={gameNo}
                        homeTeam={live.homeTeam}
                        awayTeam={live.awayTeam}
                        userTeamId={live.homeTeam.id}
                        userTactics={live.hTactics}
                        awayUserTactics={live.aTactics}
                        homeDepthChart={live.hDepth}
                        awayDepthChart={live.aDepth}
                        simSettings={DEFAULT_SIM_SETTINGS}
                        onGameEnd={handleGameEnd}
                        footer={<QuickGameFooter isPhone={isPhone} />}
                    />
                </div>
            </div>
        );
    }

    // ── 4단계: 경기 결과 ──────────────────────────────────────────────────────────
    if (phase === 'result' && result) {
        return (
            <QuickResultView
                key={gameNo}
                result={result.sim}
                homeTeam={result.homeTeam}
                awayTeam={result.awayTeam}
                isPhone={isPhone}
                onHome={goHome}
                onTeamSetup={() => goPhase('team', false)}
                onRematch={rematch}
                onStepClick={handleStepClick}
            />
        );
    }

    // ── 1·2단계 ───────────────────────────────────────────────────────────────────
    const tacticsSides: Record<QuickSide, QuickTacticsSide> | null =
        boardTeams.away && boardTeams.home && sides.away.tactics && sides.home.tactics && !tacticsStale
            ? {
                away: { team: boardTeams.away, tactics: sides.away.tactics, depthChart: sides.away.depthChart },
                home: { team: boardTeams.home, tactics: sides.home.tactics, depthChart: sides.home.depthChart },
            }
            : null;

    const missingLabel = QUICK_SIDES
        .filter(s => !sideReady(sides[s]))
        .map(s => `${QUICK_SIDE_LABEL[s]} ${sides[s].teamId ? `${slottedIds(sides[s].depthChart).length}/${QUICK_ROSTER_MIN}` : '팀 미선택'}`)
        .join(' · ');

    const actions = phase === 'team' ? (
        <>
            {!canProceed && !isPhone && <span className="text-xs font-bold text-slate-400 tabular-nums whitespace-nowrap">{missingLabel}</span>}
            <Button variant="cta" size={isPhone ? 'md' : 'lg'} onClick={() => goPhase('tactics', true)} disabled={!canProceed}>다음</Button>
        </>
    ) : (
        <>
            <Button variant="cta" size={isPhone ? 'md' : 'lg'} onClick={() => goPhase('team', false)}>이전</Button>
            <Button variant="cta" size={isPhone ? 'md' : 'lg'} onClick={() => startGame(true)} disabled={!tacticsSides}>경기 시작</Button>
        </>
    );

    return (
        <div className="fixed inset-0 bg-slate-950 flex flex-col pretendard text-slate-200">
            <QuickGameHeader
                step={PHASE_STEP[phase]}
                onBack={goHome}
                onStepClick={handleStepClick}
                maxClickableStep={canProceed ? 1 : 0}
                actions={actions}
                compact={isPhone}
            />
            {phase === 'team' ? (
                <QuickTeamSetup
                    sides={sides}
                    activeSide={activeSide}
                    onActiveSideChange={setActiveSide}
                    onTeamChange={handleTeamChange}
                    onDepthChange={handleDepthChange}
                    onAddPlayer={handleAddPlayer}
                    onRemovePlayer={handleRemovePlayer}
                    onClearRoster={handleClearRoster}
                    teamsLoading={currentPool.isLoading}
                    isPhone={isPhone}
                />
            ) : tacticsSides ? (
                <QuickTacticsSetup
                    sides={tacticsSides}
                    activeSide={activeSide}
                    onActiveSideChange={setActiveSide}
                    onUpdateTactics={handleUpdateTactics}
                    onUpdateDepthChart={handleUpdateDepth}
                />
            ) : (
                <Spinner variant="section" />
            )}
            <QuickGameFooter isPhone={isPhone} />
        </div>
    );
};

export default QuickGamePage;
