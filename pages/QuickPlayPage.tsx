import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Loader2, ChevronDown, Check } from 'lucide-react';
import { useQuickPlayPresence } from '../hooks/useQuickPlayPresence';
import type { Player, GameTactics, DepthChart, SimulationResult } from '../types';
import { supabase } from '../services/supabaseClient';
import { mapRawPlayerToRuntimePlayer } from '../services/dataMapper';
import { generateAutoTactics } from '../services/gameEngine';
import { LiveGameView } from '../views/LiveGameView';
import { TEAM_DATA, getAllTeamsList } from '../data/teamData';
import { TeamLogo } from '../components/common/TeamLogo';
import { DepthChartEditor } from '../components/dashboard/DepthChartEditor';
import { RotationGanttChart } from '../components/dashboard/RotationGanttChart';
import { TacticsBoard } from '../components/dashboard/TacticsBoard';
import { QuickRosterPanel } from '../views/quick/QuickRosterPanel';
import { QuickResultView } from '../views/quick/QuickResultView';
import { buildVirtualTeam, buildDefaultDepthChart } from '../utils/quickPlay';
import { calculatePlayerOvr } from '../utils/constants';

type QuickTab  = 'roster' | 'depth' | 'rotation' | 'tactics';
type PoolType  = 'current' | 'alltime';

const TAB_LABELS: { id: QuickTab; label: string }[] = [
    { id: 'roster',   label: '로스터' },
    { id: 'depth',    label: '뎁스차트' },
    { id: 'rotation', label: '로테이션' },
    { id: 'tactics',  label: '전술' },
];

const ALL_TEAM_IDS = Object.keys(TEAM_DATA);

// ─── 팀 셀렉터 드롭다운 ───────────────────────────────────────────────────────

const TeamSelector: React.FC<{
    value: string | null;
    exclude: string | null;
    label: string;
    onChange: (id: string) => void;
}> = ({ value, exclude, label, onChange }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const teams = useMemo(() => getAllTeamsList().filter(t => t.id !== exclude), [exclude]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const selected = value ? TEAM_DATA[value] : null;

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 border border-white/20 rounded-xl text-sm font-bold text-white transition-colors"
            >
                {selected ? (
                    <>
                        <TeamLogo teamId={value!} size="xs" />
                        <span>{selected.city} {selected.name}</span>
                    </>
                ) : (
                    <span className="text-slate-500">{label}</span>
                )}
                <ChevronDown size={13} className="text-slate-400 ml-1" />
            </button>
            {open && (
                <div className="absolute top-full mt-1 left-0 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-y-auto max-h-72 w-56">
                    {teams.map(t => (
                        <button
                            key={t.id}
                            onClick={() => { onChange(t.id); setOpen(false); }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-slate-800 transition-colors ${
                                t.id === value ? 'text-indigo-400 font-bold' : 'text-slate-300'
                            }`}
                        >
                            <TeamLogo teamId={t.id} size="xs" />
                            <span>{t.city} {t.name}</span>
                            {t.id === value && <Check size={11} className="ml-auto text-indigo-400" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// ─── 팀 컬럼 ─────────────────────────────────────────────────────────────────

interface TeamColumnProps {
    side: 'away' | 'home';
    teamId: string | null;
    otherTeamId: string | null;
    roster: Player[];
    pool: Player[];
    depthChart: DepthChart | null;
    tactics: GameTactics | null;
    activeTab: QuickTab;
    onChangeTeam: (id: string) => void;
    onChangeRoster: (p: Player[]) => void;
    onChangeDepthChart: (dc: DepthChart) => void;
    onChangeTactics: (t: GameTactics) => void;
}

const TeamColumn: React.FC<TeamColumnProps> = ({
    side, teamId, otherTeamId, roster, pool, depthChart, tactics, activeTab,
    onChangeTeam, onChangeRoster, onChangeDepthChart, onChangeTactics,
}) => {
    const meta = teamId ? TEAM_DATA[teamId] : null;
    const primaryColor = meta?.colors?.primary ?? '#6366f1';

    const virtualTeam = useMemo(
        () => teamId ? buildVirtualTeam(teamId, roster) : null,
        [teamId, roster],
    );

    const healthySorted = useMemo(
        () => [...roster].sort((a, b) => calculatePlayerOvr(b) - calculatePlayerOvr(a)),
        [roster],
    );

    const effectiveTactics = tactics ?? (virtualTeam ? generateAutoTactics(virtualTeam) : null);
    const effectiveDepth   = depthChart ?? (effectiveTactics && roster.length > 0
        ? buildDefaultDepthChart(roster, effectiveTactics)
        : null);

    const handleUpdateTactics = useCallback((t: GameTactics) => {
        onChangeTactics(t);
        if (!depthChart && t && roster.length > 0) {
            onChangeDepthChart(buildDefaultDepthChart(roster, t));
        }
    }, [onChangeTactics, onChangeDepthChart, depthChart, roster]);

    const sideLabel   = side === 'away' ? '원정팀' : '홈팀';
    const borderColor = side === 'away' ? 'border-r border-slate-800' : '';

    return (
        <div className={`flex-1 min-w-0 flex flex-col min-h-0 ${borderColor}`}>
            {/* 컬럼 헤더: 팀 선택 */}
            <div
                className="px-4 py-3 border-b border-slate-800 flex items-center gap-3 shrink-0 transition-colors duration-300"
                style={{
                    backgroundColor: teamId ? `${primaryColor}80` : 'rgba(15,23,42,0.6)',
                }}
            >
                <span className="text-sm font-black text-white">
                    {sideLabel}
                </span>
                <TeamSelector
                    value={teamId}
                    exclude={otherTeamId}
                    label="팀 선택"
                    onChange={onChangeTeam}
                />
                {roster.length > 0 && (
                    <span className="ml-auto text-[10px] text-slate-500 font-bold">
                        {roster.length} / 10명
                    </span>
                )}
            </div>

            {/* 탭 컨텐츠 */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {!teamId ? (
                    <div className="h-full flex items-center justify-center text-slate-600 text-sm">
                        팀을 선택하세요
                    </div>
                ) : activeTab === 'roster' ? (
                    <div className="p-3 h-full flex flex-col min-h-0">
                        <QuickRosterPanel
                            pool={pool}
                            selected={roster}
                            onSelect={onChangeRoster}
                        />
                    </div>
                ) : activeTab === 'depth' && virtualTeam && effectiveTactics ? (
                    <DepthChartEditor
                        team={virtualTeam}
                        tactics={effectiveTactics}
                        depthChart={effectiveDepth}
                        onUpdateDepthChart={onChangeDepthChart}
                        onUpdateTactics={handleUpdateTactics}
                    />
                ) : activeTab === 'rotation' && virtualTeam && effectiveTactics ? (
                    <RotationGanttChart
                        team={virtualTeam}
                        tactics={effectiveTactics}
                        depthChart={effectiveDepth}
                        healthySorted={healthySorted}
                        onUpdateTactics={handleUpdateTactics}
                        onViewPlayer={() => {}}
                    />
                ) : activeTab === 'tactics' && virtualTeam && effectiveTactics ? (
                    <TacticsBoard
                        team={virtualTeam}
                        tactics={effectiveTactics}
                        roster={roster}
                        onUpdateTactics={handleUpdateTactics}
                        onAutoSet={() => handleUpdateTactics(generateAutoTactics(virtualTeam))}
                        hidePresets={true}
                        teamTacticsOnly={true}
                    />
                ) : (
                    <div className="h-full flex items-center justify-center text-slate-600 text-sm">
                        로스터를 먼저 구성하세요
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────

const QuickPlayPage: React.FC = () => {
    const navigate = useNavigate();
    const onlineCount = useQuickPlayPresence();

    const [tab, setTab]               = useState<QuickTab>('roster');
    const [awayTeamId, setAwayTeamId] = useState<string | null>(null);
    const [homeTeamId, setHomeTeamId] = useState<string | null>(null);
    const [awayRoster, setAwayRoster] = useState<Player[]>([]);
    const [homeRoster, setHomeRoster] = useState<Player[]>([]);
    const [awayDepth, setAwayDepth]   = useState<DepthChart | null>(null);
    const [homeDepth, setHomeDepth]   = useState<DepthChart | null>(null);
    const [awayTactics, setAwayTactics] = useState<GameTactics | null>(null);
    const [homeTactics, setHomeTactics] = useState<GameTactics | null>(null);
    const [pool, setPool]             = useState<Player[]>([]);
    const [poolLoading, setPoolLoading] = useState(true);
    const [poolType, setPoolType]     = useState<PoolType>('current');
    const [showLive, setShowLive]     = useState(false);
    const [liveParams, setLiveParams] = useState<{
        homeTeam: ReturnType<typeof buildVirtualTeam>;
        awayTeam: ReturnType<typeof buildVirtualTeam>;
        hTactics: GameTactics;
        aTactics: GameTactics;
        hDepth: import('../types').DepthChart;
        aDepth: import('../types').DepthChart;
        seed: string;
    } | null>(null);
    const [result, setResult]         = useState<SimulationResult | null>(null);

    // poolType 변경 시 meta_players 재fetch
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setPoolLoading(true);
            setPool([]);
            const base = supabase
                .from('meta_players')
                .select('id, name, position, base_attributes, tendencies');
            const query = poolType === 'current'
                ? base.eq('in_multi_pool', true).or('base_team_id.not.is.null,draft_year.eq.2026')
                : base.eq('include_alltime', true);
            const { data, error } = await query;
            if (error) { console.error('[QuickPlay] pool fetch error:', error); setPoolLoading(false); return; }
            if (!cancelled && data) {
                const applyOverrides = poolType === 'alltime';
                setPool(data.map((r: any) => mapRawPlayerToRuntimePlayer(r, applyOverrides)));
            }
            if (!cancelled) setPoolLoading(false);
        })();
        return () => { cancelled = true; };
    }, [poolType]);

    const handlePoolTypeChange = (type: PoolType) => {
        if (type === poolType) return;
        setPoolType(type);
        setAwayRoster([]); setHomeRoster([]);
        setAwayDepth(null); setHomeDepth(null);
        setAwayTactics(null); setHomeTactics(null);
    };

    const handleChangeAwayTeam = (id: string) => {
        if (awayRoster.length > 0 && !confirm('팀을 바꾸면 현재 로스터 설정이 초기화됩니다.')) return;
        setAwayTeamId(id); setAwayRoster([]); setAwayDepth(null); setAwayTactics(null);
    };
    const handleChangeHomeTeam = (id: string) => {
        if (homeRoster.length > 0 && !confirm('팀을 바꾸면 현재 로스터 설정이 초기화됩니다.')) return;
        setHomeTeamId(id); setHomeRoster([]); setHomeDepth(null); setHomeTactics(null);
    };

    const canSim = awayRoster.length === 10 && homeRoster.length === 10;

    const handleSim = useCallback(() => {
        if (!awayTeamId || !homeTeamId || !canSim) return;

        const homeTeam = buildVirtualTeam(homeTeamId, homeRoster);
        const awayTeam = buildVirtualTeam(awayTeamId, awayRoster);

        const hTactics = homeTactics ?? generateAutoTactics(homeTeam);
        const aTactics = awayTactics ?? generateAutoTactics(awayTeam);
        const hDepth   = homeDepth   ?? buildDefaultDepthChart(homeRoster, hTactics);
        const aDepth   = awayDepth   ?? buildDefaultDepthChart(awayRoster, aTactics);

        setLiveParams({ homeTeam, awayTeam, hTactics, aTactics, hDepth, aDepth, seed: `quick-${Date.now()}` });
        setShowLive(true);
    }, [awayTeamId, homeTeamId, awayRoster, homeRoster, awayDepth, homeDepth, awayTactics, homeTactics, canSim]);

    const handleReplay = () => { setResult(null); setTab('roster'); };
    const handleHome   = () => navigate('/');
    const handleReset  = () => {
        setResult(null); setShowLive(false); setLiveParams(null);
        setAwayTeamId(null); setHomeTeamId(null);
        setAwayRoster([]); setHomeRoster([]);
        setAwayDepth(null); setHomeDepth(null);
        setAwayTactics(null); setHomeTactics(null);
        setTab('roster');
    };

    // 라이브 PBP 뷰
    if (showLive && liveParams) {
        return (
            <LiveGameView
                homeTeam={liveParams.homeTeam}
                awayTeam={liveParams.awayTeam}
                userTeamId={liveParams.homeTeam.id}
                userTactics={liveParams.hTactics}
                awayUserTactics={liveParams.aTactics}
                homeDepthChart={liveParams.hDepth}
                awayDepthChart={liveParams.aDepth}
                tendencySeed={liveParams.seed}
                hideTimeout
                onGameEnd={(simResult) => {
                    setResult(simResult);
                    setShowLive(false);
                }}
            />
        );
    }

    if (result && awayTeamId && homeTeamId) {
        return (
            <QuickResultView
                result={result}
                homeTeam={buildVirtualTeam(homeTeamId, homeRoster)}
                awayTeam={buildVirtualTeam(awayTeamId, awayRoster)}
                onReplay={handleReplay}
                onHome={handleHome}
            />
        );
    }

    return (
        <div className="fixed inset-0 bg-slate-950 flex flex-col pretendard text-slate-200">
            {/* ── 헤더 ── */}
            <header className="relative flex items-center justify-between px-5 h-14 bg-slate-900 border-b border-slate-800 shrink-0">
                {/* 좌: 뒤로 + 풀 토글 */}
                <div className="flex items-center gap-3 shrink-0 z-10">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm font-bold"
                    >
                        <ArrowLeft size={15} /> 뒤로
                    </button>
                    <div className="flex items-center bg-slate-800 rounded-lg p-0.5">
                        {(['current', 'alltime'] as PoolType[]).map(type => (
                            <button
                                key={type}
                                onClick={() => handlePoolTypeChange(type)}
                                className={`px-3 py-1 rounded text-xs font-bold transition-colors ${
                                    poolType === type
                                        ? 'bg-amber-600 text-white'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                {type === 'current' ? '현역+신인' : '올타임 레전드'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 중앙: 탭 — 절대 중앙 고정 */}
                <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 h-full">
                    {TAB_LABELS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`h-full px-4 text-sm font-black border-b-2 transition-all ${
                                tab === t.id
                                    ? 'text-indigo-400 border-indigo-400'
                                    : 'text-slate-500 hover:text-slate-300 border-transparent'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* 우: 접속자 수 + 시뮬 버튼 */}
                <div className="flex items-center gap-3 shrink-0 z-10">
                    {onlineCount > 0 && (
                        <span className="flex items-center gap-1.5 text-xs text-slate-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            {onlineCount}명 접속중
                        </span>
                    )}
                    <button
                        onClick={handleSim}
                        disabled={!canSim}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-black rounded-xl transition-all active:scale-95"
                    >
                        <Play size={14} fill="white" /> 경기 시작
                    </button>
                </div>
            </header>

            {/* 풀 로딩 오버레이 */}
            {poolLoading && (
                <div className="absolute inset-0 z-50 bg-slate-950/80 flex items-center justify-center">
                    <Loader2 size={32} className="animate-spin text-amber-500" />
                </div>
            )}

            {/* ── 바디: 2컬럼 ── */}
            <div className="flex-1 flex min-h-0">
                <TeamColumn
                    side="away"
                    teamId={awayTeamId}
                    otherTeamId={homeTeamId}
                    roster={awayRoster}
                    pool={pool}
                    depthChart={awayDepth}
                    tactics={awayTactics}
                    activeTab={tab}
                    onChangeTeam={handleChangeAwayTeam}
                    onChangeRoster={setAwayRoster}
                    onChangeDepthChart={setAwayDepth}
                    onChangeTactics={setAwayTactics}
                />
                <TeamColumn
                    side="home"
                    teamId={homeTeamId}
                    otherTeamId={awayTeamId}
                    roster={homeRoster}
                    pool={pool}
                    depthChart={homeDepth}
                    tactics={homeTactics}
                    activeTab={tab}
                    onChangeTeam={handleChangeHomeTeam}
                    onChangeRoster={setHomeRoster}
                    onChangeDepthChart={setHomeDepth}
                    onChangeTactics={setHomeTactics}
                />
            </div>

            {/* 미선택 안내 바 */}
            {!canSim && (awayTeamId || homeTeamId) && (
                <div className="shrink-0 px-5 py-2 bg-amber-900/30 border-t border-amber-700/30 text-center text-xs text-amber-300 font-bold">
                    {!awayTeamId || !homeTeamId
                        ? '원정팀과 홈팀을 모두 선택하세요'
                        : `로스터를 채워주세요 — 원정 ${awayRoster.length}/10 · 홈 ${homeRoster.length}/10`}
                </div>
            )}
        </div>
    );
};

export default QuickPlayPage;
