import React, { useState, useMemo } from 'react';
import { useTabParam } from '../hooks/useTabParam';
import type { Team, Player, ReleaseType } from '../types';
import type { PlayerContract } from '../types/player';
import type { FARole, LeagueFAMarket, FAMarketEntry, SigningType } from '../types/fa';
import type { NegotiationState } from '../services/fa/extensionEngine';
import type { OffseasonPhase } from '../types/app';
import { LEAGUE_FINANCIALS } from '../utils/constants';
import { calcTeamPayroll } from '../services/fa/faMarketBuilder';
import { TEAM_DATA } from '../data/teamData';
import { getExtensionCandidates } from '../services/fa/extensionEngine';
import { NegotiationScreen } from './NegotiationScreen';
import { RosterGrid } from '../components/roster/RosterGrid';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface FAViewProps {
    leagueFAMarket: LeagueFAMarket | null;
    faPlayerMap: Record<string, Player>;       // playerId → Player
    myTeam: Team;
    teams: Team[];
    tendencySeed: string;
    currentSeasonYear: number;
    currentSeason: string;
    onOfferAccepted: (
        playerId: string,
        contract: PlayerContract,
        signingType: SigningType,
        updatedMarket: LeagueFAMarket,
    ) => void;
    onReleasePlayer: (playerId: string, releaseType: ReleaseType, buyoutAmount?: number) => void;
    onTeamOptionDecide: (playerId: string, exercised: boolean) => void;
    onExtensionOffer: (playerId: string, contract: PlayerContract) => void;
    onViewPlayer?: (player: Player) => void;
    currentDate?: string;
    offseasonPhase?: OffseasonPhase;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const FA_ROLE_LABELS: Record<FARole, string> = {
    lead_guard:   '리드 가드',
    combo_guard:  '콤보 가드',
    '3and_d':     '3&D',
    shot_creator: '득점 창출자',
    stretch_big:  '스트레치 빅',
    rim_big:      '림 프로텍터',
    floor_big:    '플로어 빅',
};

const SLOT_LABELS: Record<SigningType, string> = {
    cap_space:   '캡 스페이스',
    non_tax_mle: '논택스 MLE',
    tax_mle:     '택스페이어 MLE',
    bird_full:   '풀 버드권',
    bird_early:  '얼리 버드권',
    bird_non:    '논버드',
    vet_min:     '베테랑 미니멈',
};

const SLOT_CAPS: Record<SigningType, string> = {
    cap_space:   '잔여 캡',
    non_tax_mle: '$14.1M',
    tax_mle:     '$5.7M',
    bird_full:   '맥스',
    bird_early:  '전 연봉 175%',
    bird_non:    '전 연봉 120%',
    vet_min:     '미니멈',
};

function fmtM(val: number): string {
    return `$${(val / 1_000_000).toFixed(1)}M`;
}

function attrColor(v: number): string {
    if (v >= 90) return 'text-fuchsia-400';
    if (v >= 80) return 'text-emerald-400';
    if (v >= 70) return 'text-amber-400';
    return 'text-slate-500';
}

function statusBadge(status: FAMarketEntry['status']) {
    switch (status) {
        case 'available': return <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">가용</span>;
        case 'signed':    return <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">서명</span>;
        case 'withdrawn': return <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">철수</span>;
    }
}

// ─────────────────────────────────────────────────────────────
// CapStatus — 상단 팀 재정 요약
// ─────────────────────────────────────────────────────────────

const CapStatus: React.FC<{ myTeam: Team; usedMLE: Record<string, boolean>; primaryColor: string; currentSeason: string }> = ({ myTeam, usedMLE, primaryColor, currentSeason }) => {
    const payroll   = calcTeamPayroll(myTeam);
    const deadTotal = (myTeam.deadMoney ?? []).reduce((s, d) => s + d.amount, 0);
    const cap       = LEAGUE_FINANCIALS.SALARY_CAP;
    const tax       = LEAGUE_FINANCIALS.TAX_LEVEL;
    const apron1    = LEAGUE_FINANCIALS.FIRST_APRON;
    const apron2    = LEAGUE_FINANCIALS.SECOND_APRON;
    const remaining = Math.max(0, cap - payroll);
    const mleUsed   = usedMLE[myTeam.id] ?? false;

    const capBarPct = Math.min(100, (payroll / apron2) * 100);

    return (
        <div className="flex-shrink-0 px-6 py-3 border-b border-slate-800 bg-slate-950">
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                {/* WidgetHeader */}
                <div className="px-4 py-2 flex items-center justify-between" style={{ backgroundColor: primaryColor }}>
                    <span className="text-sm font-bold text-white">샐러리 캡 현황</span>
                    <span className="text-xs font-mono text-white/70">{currentSeason}</span>
                </div>
                {/* 정보 */}
                <div className="flex items-center divide-x divide-slate-800 flex-wrap">
                    <div className="px-4 py-2 min-w-[110px]">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">총 페이롤</div>
                        <div className="text-sm font-mono font-bold text-white">{fmtM(payroll)}</div>
                    </div>
                    {deadTotal > 0 && (
                        <div className="px-4 py-2 min-w-[90px]">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">데드캡</div>
                            <div className="text-sm font-mono font-bold text-red-400">{fmtM(deadTotal)}</div>
                        </div>
                    )}
                    <div className="px-4 py-2 min-w-[90px]">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">잔여 캡</div>
                        <div className={`text-sm font-mono font-bold ${remaining > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>{remaining > 0 ? fmtM(remaining) : '캡 초과'}</div>
                    </div>
                    <div className="px-4 py-2 min-w-[130px]">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">MLE</div>
                        <div className={`text-sm font-bold ${mleUsed ? 'text-slate-500 line-through' : 'text-indigo-400'}`}>
                            {mleUsed ? '사용됨' : payroll < apron1 ? '논택스 ($14.1M)' : payroll < apron2 ? '택스페이어 ($5.7M)' : '없음'}
                        </div>
                    </div>
                    {/* Cap bar */}
                    <div className="flex-1 min-w-[180px] px-4 py-2">
                        <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-1">
                            <span>캡 {fmtM(cap)}</span>
                            <span>택스 {fmtM(tax)}</span>
                            <span>에이프런 {fmtM(apron1)}</span>
                        </div>
                        <div className="h-2 bg-slate-800 rounded-full overflow-hidden relative">
                            <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${capBarPct}%`, backgroundColor: primaryColor }}
                            />
                            {/* CAP marker */}
                            <div className="absolute top-0 bottom-0 w-px bg-indigo-500/60" style={{ left: `${(cap / apron2) * 100}%` }} />
                            {/* TAX marker */}
                            <div className="absolute top-0 bottom-0 w-px bg-amber-500/60" style={{ left: `${(tax / apron2) * 100}%` }} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Main FAView — NegotiationPanel/ExtensionPanel 제거됨
// 선수 클릭 시 NegotiationScreen 오버레이를 사용
// ─────────────────────────────────────────────────────────────

// REMOVED: NegotiationPanel, ExtensionPanel (NegotiationScreen으로 교체)

// ─────────────────────────────────────────────────────────────
// Main FAView
// ─────────────────────────────────────────────────────────────

export const FAView: React.FC<FAViewProps> = ({
    leagueFAMarket,
    faPlayerMap,
    myTeam,
    teams,
    tendencySeed,
    currentSeasonYear,
    currentSeason,
    onOfferAccepted,
    onReleasePlayer,
    onTeamOptionDecide,
    onExtensionOffer,
    onViewPlayer,
    currentDate = '',
    offseasonPhase,
}) => {
    const [activeTab, setActiveTab] = useTabParam<'market' | 'roster'>('market');

    // 협상 타깃 (NegotiationScreen 오버레이를 열 때 사용)
    const [negotiationTarget, setNegotiationTarget] = useState<{
        type: 'fa' | 'extension' | 'release';
        playerId: string;
    } | null>(null);

    // 결렬된 협상 선수 ID (FA walk away 또는 Extension 결렬 — 재협상 불가)
    const [blockedNegotiationIds, setBlockedNegotiationIds] = useState<Set<string>>(new Set());

    // FA 협상 라운드 간 쿨다운: playerId → 다음 오퍼 가능 날짜
    const [cooldownMap, setCooldownMap] = useState<Record<string, string>>({});

    // Extension 감정 상태 영속화: playerId → NegotiationState
    const [extNegStates, setExtNegStates] = useState<Record<string, NegotiationState>>({});

    // FA 협상 상태 영속화: playerId → { round, result }
    const [faSessionStates, setFaSessionStates] = useState<Record<string, { round: number; result: { accepted: boolean; reason?: string } | null }>>({});



    const market = leagueFAMarket;
    const usedMLE = market?.usedMLE ?? {};

    // available 선수만 OVR 내림차순
    const filteredEntries = useMemo(() => {
        if (!market) return [];
        return market.entries
            .filter(e => e.status === 'available')
            .sort((a, b) => {
                const pa = faPlayerMap[a.playerId];
                const pb = faPlayerMap[b.playerId];
                if (!pa || !pb) return 0;
                return pb.ovr - pa.ovr;
            });
    }, [market, faPlayerMap]);

    const sortedRoster = useMemo(
        () => [...myTeam.roster].sort((a, b) => b.ovr - a.ovr),
        [myTeam.roster],
    );

    // 팀 옵션 대기 선수: FA_OPEN 또는 PRE_SEASON 중에만 결정 가능
    // processOffseason()이 currentYear를 +1한 후 option.year와 일치하는 시점 = 오프시즌
    const isOffseasonPhase = offseasonPhase === 'FA_OPEN' || offseasonPhase === 'PRE_SEASON';
    const pendingTeamOptions = useMemo(
        () => isOffseasonPhase ? myTeam.roster.filter(p =>
            p.contract?.option?.type === 'team' &&
            p.contract.option.year === p.contract.currentYear
        ) : [],
        [myTeam.roster, isOffseasonPhase],
    );

    // 일반 로스터 (현재 결정해야 할 팀옵션 선수 제외, 오프시즌 중에만)
    const regularRoster = useMemo(
        () => sortedRoster.filter(p =>
            !isOffseasonPhase ||
            p.contract?.option?.type !== 'team' ||
            p.contract.option.year !== p.contract.currentYear
        ),
        [sortedRoster, isOffseasonPhase],
    );

    const availableCount = market?.entries.filter(e => e.status === 'available').length ?? 0;
    const signedCount    = market?.entries.filter(e => e.status === 'signed').length ?? 0;

    // RosterGrid용 FA 선수 임시 team
    const faTeamForGrid = useMemo(() => ({
        ...myTeam,
        roster: filteredEntries.map(e => faPlayerMap[e.playerId]).filter(Boolean) as Player[],
    }), [myTeam, filteredEntries, faPlayerMap]);

    // 익스텐션 후보
    const extensionCandidates = useMemo(() => getExtensionCandidates(myTeam), [myTeam.roster]);

    const primaryColor = TEAM_DATA[myTeam.id]?.colors?.primary ?? '#4f46e5';

    // NegotiationScreen용 데이터 계산
    const ntEntry   = negotiationTarget?.type === 'fa'
        ? market?.entries.find(e => e.playerId === negotiationTarget.playerId) ?? null
        : null;
    const ntPlayer: Player | null = negotiationTarget
        ? (negotiationTarget.type === 'fa'
            ? faPlayerMap[negotiationTarget.playerId] ?? null
            : myTeam.roster.find(p => p.id === negotiationTarget.playerId)
                ?? (negotiationTarget.type === 'extension'
                    ? extensionCandidates.find(p => p.id === negotiationTarget.playerId) ?? null
                    : null))
        : null;

    return (
        <div className="relative h-full flex flex-col overflow-hidden animate-in fade-in duration-500">
            {/* ── 탭 네비게이션 (통합) ── */}
            <div className="flex-shrink-0 px-8 border-b border-slate-800 bg-slate-950 flex items-center justify-between h-14">
                <div className="flex items-center gap-8 h-full">
                    <button
                        onClick={() => setActiveTab('market')}
                        className={`flex items-center gap-2 transition-all h-full border-b-2 font-black tracking-tight uppercase text-sm ${activeTab === 'market' ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 hover:text-slate-300 border-transparent'}`}
                    >FA 시장</button>
                    <button
                        onClick={() => setActiveTab('roster')}
                        className={`flex items-center gap-2 transition-all h-full border-b-2 font-black tracking-tight uppercase text-sm ${activeTab === 'roster' ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 hover:text-slate-300 border-transparent'}`}
                    >
                        내 로스터
                        <span className="text-xs font-mono font-normal normal-case">({myTeam.roster.length})</span>
                        {pendingTeamOptions.length > 0 && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                                옵션 {pendingTeamOptions.length}
                            </span>
                        )}
                    </button>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono">
                    <span className="text-emerald-400">{availableCount} 가용</span>
                    <span className="text-slate-500">{signedCount} 서명</span>
                </div>
            </div>

            {/* ── 팀 캡 상황 ── */}
            <CapStatus myTeam={myTeam} usedMLE={usedMLE} primaryColor={primaryColor} currentSeason={currentSeason} />

            {/* ── FA 시장 탭 콘텐츠 ── */}
            {activeTab === 'market' && (
                <>
                    {!market ? (
                        <div className="flex-1 flex items-center justify-center text-slate-500">
                            <div className="text-center space-y-2">
                                <div className="text-4xl mb-3">🏀</div>
                                <div className="font-bold text-slate-400">FA 풀이 비어 있습니다.</div>
                                <div className="text-sm text-slate-500">내 로스터 탭에서 선수를 방출하면 즉시 이곳에 등록됩니다.</div>
                                <div className="text-sm text-slate-600">오프시즌에는 계약 만료 선수들이 자동으로 추가됩니다.</div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 min-h-0 overflow-hidden">
                            <RosterGrid
                                team={faTeamForGrid}
                                tab="roster"
                                onPlayerClick={(player) => {
                                    if (!blockedNegotiationIds.has(player.id)) {
                                        setNegotiationTarget({ type: 'fa', playerId: player.id });
                                    }
                                }}
                            />
                        </div>
                    )}
                </>
            )}

            {/* ── 내 로스터 탭 콘텐츠 ── */}
            {activeTab === 'roster' && (
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">

                    {/* ── 팀 옵션 결정 섹션 ── */}
                    {pendingTeamOptions.length > 0 && (
                        <div className="border-b-2 border-cyan-500/30 bg-cyan-500/5">
                            <div className="px-4 py-2.5 flex items-center gap-2 border-b border-cyan-500/20">
                                <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400">팀 옵션 결정 대기</span>
                                <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">{pendingTeamOptions.length}</span>
                                <span className="text-[10px] text-slate-500 ml-1">— 행사하지 않으면 선수가 FA로 이동합니다</span>
                            </div>
                            {pendingTeamOptions.map(player => {
                                const optionSalary = player.contract!.years[player.contract!.option!.year] ?? 0;
                                return (
                                    <div
                                        key={player.id}
                                        className="px-4 py-3 flex items-center gap-3 border-b border-cyan-500/10"
                                    >
                                        {/* 선수 정보 */}
                                        <div className="flex-1 min-w-0">
                                            <button
                                                onClick={() => onViewPlayer?.(player)}
                                                className="font-bold text-sm text-white hover:text-cyan-400 transition-colors truncate ko-tight block"
                                            >
                                                {player.name}
                                            </button>
                                            <div className="text-[10px] text-slate-500 font-mono">
                                                {player.position} · OVR {player.ovr} · Age {player.age}
                                            </div>
                                        </div>
                                        {/* 옵션 연봉 */}
                                        <div className="text-right">
                                            <div className="text-xs font-mono font-bold text-cyan-300">{fmtM(optionSalary)}</div>
                                            <div className="text-[9px] text-slate-500">옵션 연봉</div>
                                        </div>
                                        {/* 행사 / 거부 버튼 */}
                                        <div className="flex gap-2 flex-shrink-0">
                                            <button
                                                onClick={() => onTeamOptionDecide(player.id, true)}
                                                className="px-3 py-1.5 rounded-xl text-[10px] font-black bg-emerald-600/25 text-emerald-400 hover:bg-emerald-600/40 transition-colors"
                                            >행사</button>
                                            <button
                                                onClick={() => onTeamOptionDecide(player.id, false)}
                                                className="px-3 py-1.5 rounded-xl text-[10px] font-black bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
                                            >거부</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ── 일반 로스터 ── */}
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs" style={{ tableLayout: 'fixed', minWidth: 900 }}>
                            <thead className="sticky top-0 z-10">
                                <tr className="bg-slate-800 border-b border-slate-700">
                                    <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap" style={{ width: 160 }}>선수</th>
                                    <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap" style={{ width: 60 }}>포지션</th>
                                    <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap" style={{ width: 48 }}>나이</th>
                                    <th className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap border-l border-slate-700" style={{ width: 52 }}>INS</th>
                                    <th className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap" style={{ width: 52 }}>OUT</th>
                                    <th className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap" style={{ width: 52 }}>PLM</th>
                                    <th className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap" style={{ width: 52 }}>DEF</th>
                                    <th className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap" style={{ width: 52 }}>REB</th>
                                    <th className="px-3 py-2 text-center text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap border-r border-slate-700" style={{ width: 52 }}>ATH</th>
                                    <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap" style={{ width: 80 }}>연봉</th>
                                    <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap" style={{ width: 56 }}>잔여</th>
                                    <th className="px-4 py-2" style={{ width: 120 }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {myTeam.roster.length === 0 ? (
                                    <tr><td colSpan={12} className="py-16 text-center text-slate-500 text-sm">로스터에 선수가 없습니다.</td></tr>
                                ) : regularRoster.length === 0 ? (
                                    <tr><td colSpan={12} className="py-8 text-center text-slate-500 text-sm">모든 선수가 팀 옵션 대기 중입니다.</td></tr>
                                ) : (
                                    regularRoster.map(player => {
                                        const salary = player.salary ?? player.contract?.years[player.contract?.currentYear ?? 0] ?? 0;
                                        const yearsLeft = player.contract ? player.contract.years.length - (player.contract.currentYear ?? 0) : 0;
                                        const getAttrColor = (v: number) => v >= 90 ? 'text-fuchsia-400' : v >= 80 ? 'text-emerald-400' : v >= 70 ? 'text-amber-400' : 'text-slate-500';
                                        return (
                                            <tr key={player.id} className="group border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                                                <td className="px-4 py-2">
                                                    <button
                                                        onClick={() => onViewPlayer?.(player)}
                                                        className="font-bold text-white hover:text-indigo-400 transition-colors ko-tight block truncate max-w-[140px]"
                                                    >
                                                        {player.name}
                                                    </button>
                                                </td>
                                                <td className="px-4 py-2 font-mono text-slate-400">{player.position}</td>
                                                <td className="px-4 py-2 font-mono text-slate-400">{player.age}</td>
                                                <td className={`px-3 py-2 font-mono font-black text-center border-l border-slate-800/60 ${getAttrColor(player.ins ?? 50)}`}>{player.ins ?? '-'}</td>
                                                <td className={`px-3 py-2 font-mono font-black text-center ${getAttrColor(player.out ?? 50)}`}>{player.out ?? '-'}</td>
                                                <td className={`px-3 py-2 font-mono font-black text-center ${getAttrColor(player.plm ?? 50)}`}>{player.plm ?? '-'}</td>
                                                <td className={`px-3 py-2 font-mono font-black text-center ${getAttrColor(player.def ?? 50)}`}>{player.def ?? '-'}</td>
                                                <td className={`px-3 py-2 font-mono font-black text-center ${getAttrColor(player.reb ?? 50)}`}>{player.reb ?? '-'}</td>
                                                <td className={`px-3 py-2 font-mono font-black text-center border-r border-slate-800/60 ${getAttrColor(player.ath ?? 50)}`}>{player.ath ?? '-'}</td>
                                                <td className="px-4 py-2 font-mono text-slate-400 whitespace-nowrap">{fmtM(salary)}</td>
                                                <td className="px-4 py-2 font-mono text-slate-400">{yearsLeft}년</td>
                                                <td className="px-4 py-2">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => !blockedNegotiationIds.has(player.id) && setNegotiationTarget({ type: 'extension', playerId: player.id })}
                                                            disabled={blockedNegotiationIds.has(player.id)}
                                                            className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-violet-600/30 bg-violet-600/15 text-violet-400 hover:bg-violet-600/25 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                        >연장</button>
                                                        <button
                                                            onClick={() => setNegotiationTarget({ type: 'release', playerId: player.id })}
                                                            className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-red-600/30 bg-red-600/15 text-red-400 hover:bg-red-600/25 active:scale-95 transition-all"
                                                        >방출</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}




            {/* ── NegotiationScreen 오버레이 ── */}
            {negotiationTarget && ntPlayer && (
                <NegotiationScreen
                    negotiationType={negotiationTarget.type}
                    player={ntPlayer}
                    myTeam={myTeam}
                    teams={teams}
                    tendencySeed={tendencySeed}
                    currentSeasonYear={currentSeasonYear}
                    currentSeason={currentSeason}
                    usedMLE={usedMLE}
                    faEntry={ntEntry ?? undefined}
                    faMarket={leagueFAMarket ?? undefined}
                    extensionNotYet={
                        negotiationTarget.type === 'extension' &&
                        (ntPlayer.contract
                            ? ntPlayer.contract.years.length - (ntPlayer.contract.currentYear ?? 0)
                            : 0) > 1
                    }
                    onClose={() => setNegotiationTarget(null)}
                    onFAOfferAccepted={(playerId, contract, signingType, updatedMarket) => {
                        onOfferAccepted(playerId, contract, signingType, updatedMarket);
                    }}
                    onExtensionSigned={(playerId, contract) => {
                        onExtensionOffer(playerId, contract);
                    }}
                    onNegotiationBlocked={(playerId) => {
                        setBlockedNegotiationIds(prev => new Set([...prev, playerId]));
                    }}
                    onCooldownStarted={(playerId, nextOfferDate) => {
                        setCooldownMap(prev => ({ ...prev, [playerId]: nextOfferDate }));
                    }}
                    onNegStateChange={(playerId, state) => {
                        setExtNegStates(prev => ({ ...prev, [playerId]: state }));
                    }}
                    onFAStateChange={(playerId, round, result) => {
                        setFaSessionStates(prev => ({ ...prev, [playerId]: { round, result } }));
                    }}
                    persistedNegState={negotiationTarget ? extNegStates[negotiationTarget.playerId] : undefined}
                    persistedFARound={negotiationTarget ? faSessionStates[negotiationTarget.playerId]?.round : undefined}
                    persistedFAResult={negotiationTarget ? faSessionStates[negotiationTarget.playerId]?.result : undefined}
                    currentDate={currentDate}
                    cooldownNextDate={negotiationTarget ? cooldownMap[negotiationTarget.playerId] : undefined}
                    onReleasePlayer={onReleasePlayer}
                    onViewPlayer={onViewPlayer}
                />
            )}
        </div>
    );
};
