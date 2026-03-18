import React, { useState, useMemo, useCallback } from 'react';
import type { Team, Player, ReleaseType } from '../types';
import type { PlayerContract } from '../types/player';
import type { FARole, LeagueFAMarket, FAMarketEntry, SigningType } from '../types/fa';
import { LEAGUE_FINANCIALS } from '../utils/constants';
import { calcTeamPayroll, getAvailableSigningSlots } from '../services/fa/faMarketBuilder';
import { processUserOffer } from '../services/fa/faMarketBuilder';
import { getTeamTheme } from '../utils/teamTheme';
import { TEAM_DATA } from '../data/teamData';
import {
    getExtensionCandidates,
    initNegotiationState,
    evaluateExtensionOffer,
} from '../services/fa/extensionEngine';
import type { NegotiationState, NegotiationResponse } from '../services/fa/extensionEngine';

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
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const FA_ROLE_LABELS: Record<FARole, string> = {
    lead_guard:   'Lead Guard',
    combo_guard:  'Combo Guard',
    '3and_d':     '3&D',
    shot_creator: 'Shot Creator',
    stretch_big:  'Stretch Big',
    rim_big:      'Rim Big',
    floor_big:    'Floor Big',
};

const SLOT_LABELS: Record<SigningType, string> = {
    cap_space:   'Cap Space',
    non_tax_mle: 'Non-Tax MLE',
    tax_mle:     'Taxpayer MLE',
    bird_full:   'Full Bird',
    bird_early:  'Early Bird',
    bird_non:    'Non-Bird',
    vet_min:     'Vet Min',
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

function scoreColor(score: number): string {
    if (score >= 82) return 'text-amber-400';
    if (score >= 72) return 'text-emerald-400';
    if (score >= 60) return 'text-blue-400';
    if (score >= 48) return 'text-slate-300';
    return 'text-slate-500';
}

function statusBadge(status: FAMarketEntry['status']) {
    switch (status) {
        case 'available': return <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Available</span>;
        case 'signed':    return <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">Signed</span>;
        case 'withdrawn': return <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">Withdrawn</span>;
    }
}

// ─────────────────────────────────────────────────────────────
// CapStatus — 상단 팀 재정 요약
// ─────────────────────────────────────────────────────────────

const CapStatus: React.FC<{ myTeam: Team; usedMLE: Record<string, boolean> }> = ({ myTeam, usedMLE }) => {
    const payroll   = calcTeamPayroll(myTeam);
    const deadTotal = (myTeam.deadMoney ?? []).reduce((s, d) => s + d.amount, 0);
    const cap       = LEAGUE_FINANCIALS.SALARY_CAP;
    const tax       = LEAGUE_FINANCIALS.TAX_LEVEL;
    const apron1    = LEAGUE_FINANCIALS.FIRST_APRON;
    const apron2    = LEAGUE_FINANCIALS.SECOND_APRON;
    const remaining = Math.max(0, cap - payroll);
    const mleUsed   = usedMLE[myTeam.id] ?? false;

    const capBarPct = Math.min(100, (payroll / apron2) * 100);

    const teamColors = TEAM_DATA[myTeam.id]?.colors;
    const theme = getTeamTheme(myTeam.id, teamColors ?? null);

    return (
        <div className="flex-shrink-0 px-6 py-3 border-b border-slate-800 bg-slate-900/60">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">총 페이롤</div>
                    <div className="text-sm font-mono font-bold text-white">{fmtM(payroll)}</div>
                </div>
                {deadTotal > 0 && (
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">데드캡</div>
                        <div className="text-sm font-mono font-bold text-red-400">{fmtM(deadTotal)}</div>
                    </div>
                )}
                <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">잔여 캡</div>
                    <div className={`text-sm font-mono font-bold ${remaining > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>{remaining > 0 ? fmtM(remaining) : '캡 초과'}</div>
                </div>
                <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">MLE</div>
                    <div className={`text-sm font-bold ${mleUsed ? 'text-slate-500 line-through' : 'text-indigo-400'}`}>
                        {mleUsed ? '사용됨' : payroll < apron1 ? 'Non-Tax ($14.1M)' : payroll < apron2 ? 'Tax ($5.7M)' : '없음'}
                    </div>
                </div>
                {/* Cap bar */}
                <div className="flex-1 min-w-[160px]">
                    <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-1">
                        <span>CAP {fmtM(cap)}</span>
                        <span>TAX {fmtM(tax)}</span>
                        <span>APR1 {fmtM(apron1)}</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden relative">
                        <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${capBarPct}%`, backgroundColor: theme.accent }}
                        />
                        {/* CAP marker */}
                        <div className="absolute top-0 bottom-0 w-px bg-indigo-500/60" style={{ left: `${(cap / apron2) * 100}%` }} />
                        {/* TAX marker */}
                        <div className="absolute top-0 bottom-0 w-px bg-amber-500/60" style={{ left: `${(tax / apron2) * 100}%` }} />
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// NegotiationPanel — 우측 협상 패널
// ─────────────────────────────────────────────────────────────

interface NegotiationPanelProps {
    entry: FAMarketEntry;
    player: Player;
    myTeam: Team;
    usedMLE: Record<string, boolean>;
    tendencySeed: string;
    currentSeasonYear: number;
    currentSeason: string;
    teams: Team[];
    onOfferSubmit: (slot: SigningType, salary: number, years: number) => void;
    offerResult: { accepted: boolean; reason?: string } | null;
    onViewPlayer?: (player: Player) => void;
}

const NegotiationPanel: React.FC<NegotiationPanelProps> = ({
    entry, player, myTeam, usedMLE, tendencySeed,
    currentSeasonYear, currentSeason, onOfferSubmit, offerResult, onViewPlayer,
}) => {
    const slots = getAvailableSigningSlots(myTeam, player, entry.prevTeamId, usedMLE);
    const [selectedSlot, setSelectedSlot] = useState<SigningType>(slots[0] ?? 'vet_min');
    const [offerSalary, setOfferSalary]   = useState<number>(entry.askingSalary);
    const [offerYears, setOfferYears]     = useState<number>(entry.askingYears);

    const yos = currentSeasonYear - (player.draftYear ?? currentSeasonYear);
    const capPct = yos >= 10 ? 0.35 : yos >= 7 ? 0.30 : 0.25;
    const maxAllowed = Math.round(LEAGUE_FINANCIALS.SALARY_CAP * capPct);
    const vetMin = yos >= 7 ? 3_000_000 : yos >= 4 ? 2_200_000 : 1_500_000;

    const slotMax: Partial<Record<SigningType, number>> = {
        cap_space:   Math.min(Math.max(0, LEAGUE_FINANCIALS.SALARY_CAP - calcTeamPayroll(myTeam)), maxAllowed),
        non_tax_mle: Math.min(LEAGUE_FINANCIALS.SALARY_CAP * 0.0913, maxAllowed),  // $14.1M
        tax_mle:     Math.min(LEAGUE_FINANCIALS.SALARY_CAP * 0.0368, maxAllowed),  // $5.7M
        bird_full:   maxAllowed,
        bird_early:  Math.min(maxAllowed, (player.salary ?? 0) * 1.75),
        bird_non:    Math.min(maxAllowed, (player.salary ?? 0) * 1.20),
        vet_min:     vetMin,
    };
    const currentMax = slotMax[selectedSlot] ?? vetMin;
    const maxYears = selectedSlot === 'tax_mle' ? 2 : 5;

    const salaryPct = entry.askingSalary > vetMin
        ? Math.round(((offerSalary - vetMin) / (Math.max(currentMax, entry.askingSalary) - vetMin)) * 100)
        : 100;

    const isAboveAsking = offerSalary >= entry.askingSalary;
    const isBelowWalkaway = offerSalary < entry.walkAwaySalary;

    return (
        <div className="flex flex-col h-full overflow-y-auto custom-scrollbar p-5 gap-5">
            {/* 선수 정보 */}
            <div>
                <button
                    onClick={() => onViewPlayer?.(player)}
                    className="text-left hover:opacity-80 transition-opacity"
                >
                    <div className="text-lg font-black text-white ko-tight">{player.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                        {player.position} · {player.age}세 · OVR {player.ovr}
                    </div>
                </button>
                <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400">
                        {FA_ROLE_LABELS[entry.faRole]}
                    </span>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-800 ${scoreColor(entry.marketValueScore)}`}>
                        MVS {entry.marketValueScore}
                    </span>
                </div>
            </div>

            {/* 선수 요구 조건 */}
            <div className="bg-slate-800/60 rounded-xl p-4 space-y-2 border border-slate-700/50">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">선수 요구 조건</div>
                <div className="flex justify-between text-sm">
                    <span className="text-slate-400">요구 연봉</span>
                    <span className="font-mono font-bold text-amber-400">{fmtM(entry.askingSalary)} / yr</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-slate-400">최저 수락선</span>
                    <span className="font-mono font-bold text-slate-300">{fmtM(entry.walkAwaySalary)} / yr</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-slate-400">요구 연수</span>
                    <span className="font-mono font-bold text-slate-300">{entry.askingYears}년</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-slate-400">관심 팀</span>
                    <span className="font-bold text-slate-300">{entry.interestedTeamIds.length}팀</span>
                </div>
            </div>

            {/* 계약 슬롯 선택 */}
            <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">계약 슬롯</div>
                <div className="space-y-1.5">
                    {slots.map(slot => (
                        <button
                            key={slot}
                            onClick={() => {
                                setSelectedSlot(slot);
                                const newMax = slotMax[slot] ?? vetMin;
                                setOfferSalary(Math.min(offerSalary, newMax));
                                setOfferYears(Math.min(offerYears, slot === 'tax_mle' ? 2 : 5));
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-all ${
                                selectedSlot === slot
                                    ? 'border-indigo-500 bg-indigo-500/10 text-white'
                                    : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600'
                            }`}
                        >
                            <span className="font-bold">{SLOT_LABELS[slot]}</span>
                            <span className="text-xs font-mono">{SLOT_CAPS[slot]}</span>
                        </button>
                    ))}
                    {slots.length === 0 && (
                        <div className="text-sm text-slate-500 text-center py-4">사용 가능한 슬롯이 없습니다.</div>
                    )}
                </div>
            </div>

            {/* 연봉 입력 */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">제시 연봉 / yr</div>
                    <div className={`text-sm font-mono font-bold ${
                        isAboveAsking ? 'text-emerald-400' : isBelowWalkaway ? 'text-red-400' : 'text-amber-400'
                    }`}>{fmtM(offerSalary)}</div>
                </div>
                <input
                    type="range"
                    min={vetMin}
                    max={Math.max(currentMax, entry.askingSalary)}
                    step={100_000}
                    value={offerSalary}
                    onChange={e => setOfferSalary(Number(e.target.value))}
                    className="w-full accent-indigo-500"
                    disabled={selectedSlot === 'vet_min'}
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-600 mt-1">
                    <span>{fmtM(vetMin)}</span>
                    <span className="text-amber-600">요구 {fmtM(entry.askingSalary)}</span>
                    <span>{fmtM(Math.max(currentMax, entry.askingSalary))}</span>
                </div>
                {/* 수락 확률 힌트 */}
                <div className="mt-2 text-xs text-slate-500 text-center">
                    {isAboveAsking
                        ? '✓ 요구 이상 — 높은 수락 확률'
                        : isBelowWalkaway
                        ? '✗ 최저선 미달 — 거절 확정'
                        : `협상 구간 (${salaryPct}%)`}
                </div>
            </div>

            {/* 연수 입력 */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">계약 연수</div>
                    <div className="text-sm font-mono font-bold text-white">{offerYears}년</div>
                </div>
                <div className="flex gap-2">
                    {Array.from({ length: maxYears }, (_, i) => i + 1).map(y => (
                        <button
                            key={y}
                            onClick={() => setOfferYears(y)}
                            className={`flex-1 py-1.5 rounded-lg text-sm font-bold border transition-all ${
                                offerYears === y
                                    ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300'
                                    : 'border-slate-700 bg-slate-800/40 text-slate-500 hover:border-slate-600'
                            }`}
                        >
                            {y}
                        </button>
                    ))}
                </div>
            </div>

            {/* 오퍼 결과 */}
            {offerResult && (
                <div className={`rounded-xl px-4 py-3 text-sm font-bold text-center border ${
                    offerResult.accepted
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                        : 'bg-red-500/10 border-red-500/40 text-red-400'
                }`}>
                    {offerResult.accepted ? '✓ 계약 체결!' : `✗ ${offerResult.reason ?? '거절'}`}
                </div>
            )}

            {/* 제출 버튼 */}
            {entry.status === 'available' && !offerResult?.accepted && (
                <button
                    onClick={() => onOfferSubmit(selectedSlot, offerSalary, offerYears)}
                    disabled={slots.length === 0 || isBelowWalkaway}
                    className="w-full py-3 rounded-xl font-black uppercase tracking-wide text-sm transition-all
                        bg-indigo-600 hover:bg-indigo-500 text-white
                        disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    오퍼 제출
                </button>
            )}
            {entry.status === 'signed' && (
                <div className="text-center text-sm text-slate-500 py-2">이미 서명된 선수입니다.</div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// ExtensionPanel — 익스텐션 협상 패널
// ─────────────────────────────────────────────────────────────

interface ExtensionPanelProps {
    player: Player;
    myTeam: Team;
    allPlayers: Player[];
    tendencySeed: string;
    currentSeasonYear: number;
    currentSeason: string;
    contenderScore: number;
    onExtensionSigned: (contract: PlayerContract) => void;
    onViewPlayer?: (player: Player) => void;
}

const ExtensionPanel: React.FC<ExtensionPanelProps> = ({
    player, myTeam, allPlayers, tendencySeed,
    currentSeasonYear, currentSeason, contenderScore,
    onExtensionSigned, onViewPlayer,
}) => {
    // key={player.id}가 선수 변경 시 컴포넌트를 리마운트하므로 lazy initializer로 단순화
    const [negState, setNegState] = useState<NegotiationState>(() =>
        initNegotiationState(player, myTeam, allPlayers, tendencySeed, currentSeasonYear, currentSeason)
    );
    const [offerSalary, setOfferSalary] = useState(() => negState.demand.openingAsk);
    const [offerYears, setOfferYears]   = useState(() => negState.demand.askingYears);
    const [lastResponse, setLastResponse] = useState<NegotiationResponse | null>(null);

    const { demand } = negState;
    const sliderMin = Math.round(demand.insultThreshold * 0.9);
    const sliderMax = Math.round(demand.openingAsk * 1.3);

    const isBelowInsult = offerSalary < demand.insultThreshold;
    const isBelowFloor  = offerSalary < demand.reservationFloor;
    const isAboveTarget = offerSalary >= demand.targetAAV;

    const salaryColor = isAboveTarget ? 'text-emerald-400' : isBelowInsult ? 'text-red-500' : isBelowFloor ? 'text-red-400' : 'text-amber-400';

    const handleSubmit = () => {
        if (negState.walkedAway || negState.signed) return;
        const { response, updatedState } = evaluateExtensionOffer(
            { years: offerYears, annualSalary: offerSalary, contenderScore },
            negState,
            tendencySeed,
        );
        setNegState(updatedState);
        setLastResponse(response);
        if (response.outcome === 'ACCEPT') {
            onExtensionSigned(response.contract);
        }
    };

    const isFinal = negState.walkedAway || negState.signed;

    return (
        <div className="flex flex-col h-full overflow-y-auto custom-scrollbar p-5 gap-5">
            {/* 선수 정보 */}
            <div>
                <button
                    onClick={() => onViewPlayer?.(player)}
                    className="text-left hover:opacity-80 transition-opacity"
                >
                    <div className="text-lg font-black text-white ko-tight">{player.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                        {player.position} · {player.age}세 · OVR {player.ovr}
                    </div>
                </button>
                <div className="flex gap-2 mt-2">
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-violet-500/20 text-violet-400">
                        CONTRACT EXT.
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                        잔여 {player.contractYears}년
                    </span>
                </div>
            </div>

            {/* 감정 상태 바 */}
            <div className="bg-slate-800/60 rounded-xl p-3 space-y-2 border border-slate-700/50">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">선수 심리 상태</div>
                <div className="space-y-1.5">
                    {[
                        { label: 'Respect', value: negState.respect, color: 'bg-indigo-500' },
                        { label: 'Trust',   value: negState.trust,   color: 'bg-emerald-500' },
                        { label: 'Frustration', value: negState.frustration, color: 'bg-red-500' },
                    ].map(({ label, value, color }) => (
                        <div key={label} className="flex items-center gap-2">
                            <div className="w-20 text-[10px] text-slate-500 font-bold">{label}</div>
                            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-300 ${color}`}
                                    style={{ width: `${Math.round(value * 100)}%` }}
                                />
                            </div>
                            <div className="w-8 text-[10px] font-mono text-slate-500 text-right">
                                {Math.round(value * 100)}
                            </div>
                        </div>
                    ))}
                </div>
                {negState.lowballCount > 0 && (
                    <div className="text-[10px] text-amber-400 font-bold mt-1">
                        ⚠ 저가 제안 경고 {negState.lowballCount}/3
                    </div>
                )}
            </div>

            {/* 선수 요구 조건 */}
            <div className="bg-slate-800/60 rounded-xl p-4 space-y-2 border border-slate-700/50">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">선수 요구 조건</div>
                <div className="flex justify-between text-sm">
                    <span className="text-slate-400">요구 연봉</span>
                    <span className="font-mono font-bold text-amber-400">{fmtM(negState.currentCounterAAV)} / yr</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-slate-400">요구 연수</span>
                    <span className="font-mono font-bold text-slate-300">{negState.currentCounterYears}년</span>
                </div>
                <div className="flex justify-between text-sm">
                    <span className="text-slate-400">협상 라운드</span>
                    <span className="font-mono font-bold text-slate-300">{negState.roundsUsed}회</span>
                </div>
            </div>

            {/* 연봉 슬라이더 */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">제시 연봉 / yr</div>
                    <div className={`text-sm font-mono font-bold ${salaryColor}`}>{fmtM(offerSalary)}</div>
                </div>
                <input
                    type="range"
                    min={sliderMin}
                    max={sliderMax}
                    step={100_000}
                    value={offerSalary}
                    onChange={e => setOfferSalary(Number(e.target.value))}
                    className="w-full accent-violet-500"
                    disabled={isFinal}
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-600 mt-1">
                    <span>{fmtM(sliderMin)}</span>
                    <span className="text-amber-600">요구 {fmtM(negState.currentCounterAAV)}</span>
                    <span>{fmtM(sliderMax)}</span>
                </div>
                <div className="mt-1.5 text-xs text-center">
                    {isAboveTarget
                        ? <span className="text-emerald-400">✓ 목표가 이상 — 높은 수락 가능성</span>
                        : isBelowInsult
                        ? <span className="text-red-500">✗ 모욕 수준 — 즉시 거절 + 감정 악화</span>
                        : isBelowFloor
                        ? <span className="text-red-400">✗ 최소 수용선 미달 — 거절 확정</span>
                        : <span className="text-slate-500">협상 구간</span>
                    }
                </div>
            </div>

            {/* 연수 버튼 */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">계약 연수</div>
                    <div className="text-sm font-mono font-bold text-white">{offerYears}년</div>
                </div>
                <div className="flex gap-2">
                    {[1, 2, 3, 4].map(y => (
                        <button
                            key={y}
                            onClick={() => setOfferYears(y)}
                            disabled={isFinal}
                            className={`flex-1 py-1.5 rounded-lg text-sm font-bold border transition-all ${
                                offerYears === y
                                    ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                                    : 'border-slate-700 bg-slate-800/40 text-slate-500 hover:border-slate-600'
                            }`}
                        >
                            {y}
                        </button>
                    ))}
                </div>
            </div>

            {/* 응답 배너 */}
            {lastResponse && (
                <div className={`rounded-xl px-4 py-3 text-sm font-bold border ${
                    lastResponse.outcome === 'ACCEPT'
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                        : lastResponse.outcome === 'COUNTER'
                        ? 'bg-violet-500/10 border-violet-500/40 text-violet-300'
                        : lastResponse.outcome === 'WALKED_AWAY'
                        ? 'bg-red-900/20 border-red-500/40 text-red-400'
                        : 'bg-red-500/10 border-red-500/40 text-red-400'
                }`}>
                    {lastResponse.outcome === 'ACCEPT'    && '✓ 계약 체결!'}
                    {lastResponse.outcome === 'COUNTER'   && `💬 ${lastResponse.message}`}
                    {lastResponse.outcome === 'REJECT_HARD' && `✗ ${lastResponse.message}`}
                    {lastResponse.outcome === 'WALKED_AWAY' && `🚪 ${lastResponse.message}`}
                </div>
            )}

            {/* 제출 버튼 */}
            {!isFinal && (
                <button
                    onClick={handleSubmit}
                    className="w-full py-3 rounded-xl font-black uppercase tracking-wide text-sm transition-all
                        bg-violet-600 hover:bg-violet-500 text-white"
                >
                    오퍼 제출
                </button>
            )}
        </div>
    );
};

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
}) => {
    const [activeTab, setActiveTab]       = useState<'market' | 'roster' | 'extensions'>('market');
    const [roleFilter, setRoleFilter]     = useState<FARole | 'all'>('all');
    const [statusFilter, setStatusFilter] = useState<'available' | 'all'>('available');
    const [sortBy, setSortBy]             = useState<'ovr' | 'salary' | 'score'>('ovr');
    const [selectedId, setSelectedId]     = useState<string | null>(null);
    const [offerResult, setOfferResult]   = useState<{ accepted: boolean; reason?: string } | null>(null);

    // extensions 탭 전용 상태
    const [extSelectedId, setExtSelectedId] = useState<string | null>(null);

    const handleTabChange = (tab: 'market' | 'roster' | 'extensions') => {
        setActiveTab(tab);
        setSelectedId(null);
        setOfferResult(null);
    };
    const [releaseConfirmId, setReleaseConfirmId] = useState<string | null>(null);
    const [releaseMode, setReleaseMode] = useState<ReleaseType>('waive');
    const [buyoutSlider, setBuyoutSlider] = useState<number>(0); // 0~100 (%)

    // 방출 모달 열 때 초기화
    const openReleaseModal = useCallback((playerId: string) => {
        setReleaseConfirmId(playerId);
        setReleaseMode('waive');
        setBuyoutSlider(70); // 기본 바이아웃 제시액: 잔여의 70%
    }, []);

    const market = leagueFAMarket;
    const usedMLE = market?.usedMLE ?? {};

    // 필터링 + 정렬
    const filteredEntries = useMemo(() => {
        if (!market) return [];
        return market.entries
            .filter(e => {
                if (statusFilter === 'available' && e.status !== 'available') return false;
                if (roleFilter !== 'all' && e.faRole !== roleFilter) return false;
                return true;
            })
            .sort((a, b) => {
                const pa = faPlayerMap[a.playerId];
                const pb = faPlayerMap[b.playerId];
                if (!pa || !pb) return 0;
                if (sortBy === 'ovr')    return pb.ovr - pa.ovr;
                if (sortBy === 'salary') return b.askingSalary - a.askingSalary;
                if (sortBy === 'score')  return b.marketValueScore - a.marketValueScore;
                return 0;
            });
    }, [market, statusFilter, roleFilter, sortBy, faPlayerMap]);

    const selectedEntry  = selectedId ? market?.entries.find(e => e.playerId === selectedId) ?? null : null;
    const selectedPlayer = selectedId ? faPlayerMap[selectedId] ?? null : null;

    const sortedRoster = useMemo(
        () => [...myTeam.roster].sort((a, b) => b.ovr - a.ovr),
        [myTeam.roster],
    );

    // 팀 옵션 대기 선수 (로스터에 있는 선수 중 team option 보유 = 아직 미결정)
    const pendingTeamOptions = useMemo(
        () => myTeam.roster.filter(p => p.contract?.option?.type === 'team'),
        [myTeam.roster],
    );

    // 일반 로스터 (팀 옵션 선수 제외)
    const regularRoster = useMemo(
        () => sortedRoster.filter(p => p.contract?.option?.type !== 'team'),
        [sortedRoster],
    );

    const handleOfferSubmit = (slot: SigningType, salary: number, years: number) => {
        if (!selectedEntry || !selectedPlayer || !market) return;

        const result = processUserOffer(
            market,
            myTeam,
            selectedPlayer,
            selectedEntry.prevTeamId,
            { salary, years, signingType: slot },
            tendencySeed,
            currentSeasonYear,
        );

        if (result.accepted) {
            setOfferResult({ accepted: true });
            // 마켓 엔트리 업데이트
            const updatedEntries = market.entries.map(e =>
                e.playerId === selectedPlayer.id
                    ? { ...e, status: 'signed' as const, signedTeamId: myTeam.id, signedYears: years, signedSalary: salary }
                    : e
            );
            // MLE 사용 처리
            const updatedMLE = { ...market.usedMLE };
            if (slot === 'non_tax_mle' || slot === 'tax_mle') {
                updatedMLE[myTeam.id] = true;
            }
            const updatedMarket: LeagueFAMarket = { ...market, entries: updatedEntries, usedMLE: updatedMLE };
            onOfferAccepted(selectedPlayer.id, result.contract, result.signingType, updatedMarket);
        } else {
            setOfferResult({ accepted: false, reason: (result as { accepted: false; reason: string }).reason });
        }
    };

    // 선수 변경 시 결과 초기화
    const handleSelectPlayer = (id: string) => {
        setSelectedId(id);
        setOfferResult(null);
    };

    const roles: FARole[] = ['lead_guard', 'combo_guard', '3and_d', 'shot_creator', 'stretch_big', 'rim_big', 'floor_big'];

    const availableCount = market?.entries.filter(e => e.status === 'available').length ?? 0;
    const signedCount    = market?.entries.filter(e => e.status === 'signed').length ?? 0;

    // 익스텐션 전용
    const allPlayers = useMemo(() => teams.flatMap(t => t.roster), [teams]);
    const extensionCandidates = useMemo(() => getExtensionCandidates(myTeam), [myTeam.roster]);
    const extSelectedPlayer = extSelectedId
        ? extensionCandidates.find(p => p.id === extSelectedId) ?? null
        : null;
    const contenderScore = useMemo(() => {
        const total = myTeam.wins + myTeam.losses;
        return total > 0 ? Math.min(1, (myTeam.wins / total) * 1.5) : 0.5;
    }, [myTeam.wins, myTeam.losses]);

    // 방출 확인 모달용 선수
    const releaseTarget = releaseConfirmId ? myTeam.roster.find(p => p.id === releaseConfirmId) ?? null : null;

    return (
        <div className="h-full flex flex-col overflow-hidden animate-in fade-in duration-500">
            {/* ── 헤더 ── */}
            <div className="flex-shrink-0 px-6 h-14 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <h1 className="oswald font-black uppercase tracking-widest text-white text-xl">FA Market</h1>
                    <span className="text-xs font-mono text-slate-500">{currentSeason}</span>
                </div>
                <div className="flex items-center gap-4 text-xs font-mono">
                    <span className="text-emerald-400">{availableCount} Available</span>
                    <span className="text-slate-500">{signedCount} Signed</span>
                </div>
            </div>

            {/* ── 탭 ── */}
            <div className="flex-shrink-0 px-6 border-b border-slate-800 bg-slate-950 flex gap-4">
                <button
                    onClick={() => handleTabChange('market')}
                    className={`py-2.5 text-sm font-bold border-b-2 transition-colors ${activeTab === 'market' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                >FA 시장</button>
                <button
                    onClick={() => handleTabChange('roster')}
                    className={`py-2.5 text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'roster' ? 'border-indigo-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                >
                    내 로스터
                    <span className="text-xs text-slate-600 font-mono">({myTeam.roster.length})</span>
                    {pendingTeamOptions.length > 0 && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                            옵션 {pendingTeamOptions.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => handleTabChange('extensions')}
                    className={`py-2.5 text-sm font-bold border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === 'extensions' ? 'border-violet-500 text-white' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                >
                    익스텐션
                    {extensionCandidates.length > 0 && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">
                            {extensionCandidates.length}
                        </span>
                    )}
                </button>
            </div>

            {/* ── 팀 캡 상황 ── */}
            <CapStatus myTeam={myTeam} usedMLE={usedMLE} />

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
                        <>
                            {/* ── 필터 바 ── */}
                            <div className="flex-shrink-0 px-6 py-2.5 border-b border-slate-800 bg-slate-950/50 flex flex-wrap items-center gap-3">
                                {/* 롤 필터 */}
                                <div className="flex gap-1.5">
                                    <button
                                        onClick={() => setRoleFilter('all')}
                                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${roleFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                                    >All</button>
                                    {roles.map(role => (
                                        <button
                                            key={role}
                                            onClick={() => setRoleFilter(role)}
                                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${roleFilter === role ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                                        >{FA_ROLE_LABELS[role]}</button>
                                    ))}
                                </div>
                                <div className="h-4 w-px bg-slate-700" />
                                {/* 상태 필터 */}
                                <div className="flex gap-1.5">
                                    {(['available', 'all'] as const).map(s => (
                                        <button
                                            key={s}
                                            onClick={() => setStatusFilter(s)}
                                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${statusFilter === s ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                                        >{s === 'available' ? '가용' : '전체'}</button>
                                    ))}
                                </div>
                                <div className="h-4 w-px bg-slate-700 ml-auto" />
                                {/* 정렬 */}
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-black">정렬</span>
                                    {(['ovr', 'salary', 'score'] as const).map(s => (
                                        <button
                                            key={s}
                                            onClick={() => setSortBy(s)}
                                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${sortBy === s ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                                        >{{ ovr: 'OVR', salary: '연봉', score: 'MVS' }[s]}</button>
                                    ))}
                                </div>
                            </div>

                            {/* ── 메인 컨텐츠 ── */}
                            <div className="flex-1 min-h-0 flex overflow-hidden">
                                {/* FA 선수 목록 */}
                                <div className={`flex-1 min-w-0 overflow-y-auto custom-scrollbar ${selectedId ? 'border-r border-slate-800' : ''}`}>
                                    {/* 테이블 헤더 */}
                                    <div className="sticky top-0 z-10 bg-slate-950 border-b border-slate-800 px-4 py-2 grid grid-cols-[2fr_1fr_1fr_1.2fr_1.2fr_1fr_1fr] gap-2">
                                        {['선수', '포지션', '나이', '롤', '요구 연봉', 'MVS', '상태'].map(h => (
                                            <div key={h} className="text-[10px] font-black uppercase tracking-widest text-slate-500">{h}</div>
                                        ))}
                                    </div>

                                    {/* 선수 행 */}
                                    {filteredEntries.length === 0 ? (
                                        <div className="py-16 text-center text-slate-500 text-sm">조건에 맞는 선수가 없습니다.</div>
                                    ) : (
                                        filteredEntries.map(entry => {
                                            const player = faPlayerMap[entry.playerId];
                                            if (!player) return null;
                                            const isSelected = selectedId === entry.playerId;
                                            return (
                                                <button
                                                    key={entry.playerId}
                                                    onClick={() => handleSelectPlayer(entry.playerId)}
                                                    className={`w-full px-4 py-3 grid grid-cols-[2fr_1fr_1fr_1.2fr_1.2fr_1fr_1fr] gap-2 items-center text-left border-b border-white/5 transition-all ${
                                                        isSelected
                                                            ? 'bg-indigo-600/10 border-l-2 border-l-indigo-500'
                                                            : 'hover:bg-slate-800/50'
                                                    } ${entry.status !== 'available' ? 'opacity-50' : ''}`}
                                                >
                                                    <div className="font-bold text-sm text-white truncate ko-tight">{player.name}</div>
                                                    <div className="text-xs font-mono text-slate-400">{player.position}</div>
                                                    <div className="text-xs font-mono text-slate-400">{player.age}</div>
                                                    <div className="text-[10px] font-bold text-indigo-300 truncate">{FA_ROLE_LABELS[entry.faRole]}</div>
                                                    <div className="text-xs font-mono font-bold text-amber-400">{fmtM(entry.askingSalary)}</div>
                                                    <div className={`text-xs font-mono font-bold ${scoreColor(entry.marketValueScore)}`}>{entry.marketValueScore}</div>
                                                    <div>{statusBadge(entry.status)}</div>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>

                                {/* 협상 패널 */}
                                {selectedEntry && selectedPlayer && (
                                    <div className="w-80 flex-shrink-0 bg-slate-900/60">
                                        <NegotiationPanel
                                            entry={selectedEntry}
                                            player={selectedPlayer}
                                            myTeam={myTeam}
                                            usedMLE={usedMLE}
                                            tendencySeed={tendencySeed}
                                            currentSeasonYear={currentSeasonYear}
                                            currentSeason={currentSeason}
                                            teams={teams}
                                            onOfferSubmit={handleOfferSubmit}
                                            offerResult={offerResult}
                                            onViewPlayer={onViewPlayer}
                                        />
                                    </div>
                                )}
                            </div>
                        </>
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
                    <div className="sticky top-0 z-10 bg-slate-950 border-b border-slate-800 px-4 py-2 grid grid-cols-[2fr_1fr_1fr_1.2fr_1.2fr_1fr] gap-2">
                        {['선수', '포지션', '나이', '연봉', '잔여', ''].map(h => (
                            <div key={h} className="text-[10px] font-black uppercase tracking-widest text-slate-500">{h}</div>
                        ))}
                    </div>
                    {myTeam.roster.length === 0 ? (
                        <div className="py-16 text-center text-slate-500 text-sm">로스터에 선수가 없습니다.</div>
                    ) : regularRoster.length === 0 ? (
                        <div className="py-8 text-center text-slate-500 text-sm">모든 선수가 팀 옵션 대기 중입니다.</div>
                    ) : (
                        regularRoster.map(player => {
                            const salary = player.salary ?? player.contract?.years[player.contract?.currentYear ?? 0] ?? 0;
                            const yearsLeft = player.contract ? player.contract.years.length - (player.contract.currentYear ?? 0) : 0;
                            return (
                                <div
                                    key={player.id}
                                    className="px-4 py-3 grid grid-cols-[2fr_1fr_1fr_1.2fr_1.2fr_1fr] gap-2 items-center border-b border-white/5"
                                >
                                    <div>
                                        <button
                                            onClick={() => onViewPlayer?.(player)}
                                            className="font-bold text-sm text-white hover:text-indigo-400 transition-colors truncate ko-tight"
                                        >
                                            {player.name}
                                        </button>
                                        <div className="text-[10px] text-slate-500 font-mono">OVR {player.ovr}</div>
                                    </div>
                                    <div className="text-xs font-mono text-slate-400">{player.position}</div>
                                    <div className="text-xs font-mono text-slate-400">{player.age}</div>
                                    <div className="text-xs font-mono font-bold text-amber-400">{fmtM(salary)}</div>
                                    <div className="text-xs font-mono text-slate-400">{yearsLeft}년</div>
                                    <div>
                                        <button
                                            onClick={() => openReleaseModal(player.id)}
                                            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
                                        >방출</button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* ── 익스텐션 탭 콘텐츠 ── */}
            {activeTab === 'extensions' && (
                <div className="flex-1 min-h-0 flex overflow-hidden">
                    {/* 후보 선수 목록 */}
                    <div className={`flex-1 min-w-0 overflow-y-auto custom-scrollbar ${extSelectedPlayer ? 'border-r border-slate-800' : ''}`}>
                        {/* 헤더 */}
                        <div className="sticky top-0 z-10 bg-slate-950 border-b border-slate-800 px-4 py-2 grid grid-cols-[2fr_1fr_1fr_1.2fr_1.2fr] gap-2">
                            {['선수', '포지션', '나이', '연봉', '잔여'].map(h => (
                                <div key={h} className="text-[10px] font-black uppercase tracking-widest text-slate-500">{h}</div>
                            ))}
                        </div>
                        {extensionCandidates.length === 0 ? (
                            <div className="py-16 text-center text-slate-500 text-sm">
                                <div className="text-3xl mb-3">📋</div>
                                <div className="font-bold text-slate-400">익스텐션 가능한 선수가 없습니다.</div>
                                <div className="text-xs text-slate-600 mt-1">계약 1~2년 남은 선수가 대상입니다.</div>
                            </div>
                        ) : (
                            extensionCandidates.map(player => {
                                const salary = player.salary ?? player.contract?.years[player.contract?.currentYear ?? 0] ?? 0;
                                const yearsLeft = player.contractYears ?? 0;
                                const isSelected = extSelectedId === player.id;
                                return (
                                    <button
                                        key={player.id}
                                        onClick={() => setExtSelectedId(player.id)}
                                        className={`w-full px-4 py-3 grid grid-cols-[2fr_1fr_1fr_1.2fr_1.2fr] gap-2 items-center text-left border-b border-white/5 transition-all ${
                                            isSelected
                                                ? 'bg-violet-600/10 border-l-2 border-l-violet-500'
                                                : 'hover:bg-slate-800/50'
                                        }`}
                                    >
                                        <div>
                                            <div className="font-bold text-sm text-white truncate ko-tight">{player.name}</div>
                                            <div className="text-[10px] text-slate-500 font-mono">OVR {player.ovr}</div>
                                        </div>
                                        <div className="text-xs font-mono text-slate-400">{player.position}</div>
                                        <div className="text-xs font-mono text-slate-400">{player.age}</div>
                                        <div className="text-xs font-mono font-bold text-amber-400">{fmtM(salary)}</div>
                                        <div className={`text-xs font-mono font-bold ${yearsLeft <= 1 ? 'text-red-400' : 'text-slate-300'}`}>
                                            {yearsLeft}년
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {/* 협상 패널 */}
                    {extSelectedPlayer && (
                        <div className="w-80 flex-shrink-0 bg-slate-900/60">
                            <ExtensionPanel
                                key={extSelectedPlayer.id}
                                player={extSelectedPlayer}
                                myTeam={myTeam}
                                allPlayers={allPlayers}
                                tendencySeed={tendencySeed}
                                currentSeasonYear={currentSeasonYear}
                                currentSeason={currentSeason}
                                contenderScore={contenderScore}
                                onExtensionSigned={(contract) => onExtensionOffer(extSelectedPlayer.id, contract)}
                                onViewPlayer={onViewPlayer}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* ── 방출 모달 ── */}
            {releaseConfirmId && releaseTarget && (() => {
                const contract = releaseTarget.contract;
                const remainingYears = contract
                    ? contract.years.length - contract.currentYear
                    : 1;
                const totalRemaining = contract
                    ? contract.years.slice(contract.currentYear).reduce((s, v) => s + v, 0)
                    : (releaseTarget.salary ?? 0);

                // 스트레치: totalRemaining / (2 * remainingYears - 1) per year
                const stretchYearsTotal = Math.max(1, 2 * remainingYears - 1);
                const stretchAnnual = totalRemaining / stretchYearsTotal;

                // 바이아웃 최소 수락액 (OVR 기반: OVR 60→50%, OVR 80→65%, OVR 95→75%)
                const minBuyoutPct = Math.round(
                    Math.min(75, 50 + 25 * Math.max(0, (releaseTarget.ovr - 60) / 35))
                );
                const minBuyoutAmount = Math.round(totalRemaining * (minBuyoutPct / 100));
                const buyoutAmount = Math.round(totalRemaining * (buyoutSlider / 100));
                const buyoutAccepted = buyoutAmount >= minBuyoutAmount;

                const deadCapPreview =
                    releaseMode === 'waive'   ? totalRemaining :
                    releaseMode === 'stretch' ? stretchAnnual  :
                    buyoutAmount;

                const MODE_INFO: Record<ReleaseType, { label: string; desc: string; color: string }> = {
                    waive:   { label: '웨이브',         desc: '잔여 계약 전액이 즉시 데드캡으로 적용됩니다.',               color: 'border-red-500/50 bg-red-500/5' },
                    stretch: { label: '스트레치 웨이브', desc: `잔여 금액을 ${stretchYearsTotal}년으로 분산해 캡 부담을 줄입니다.`, color: 'border-amber-500/50 bg-amber-500/5' },
                    buyout:  { label: '바이아웃',        desc: '선수와 합의한 금액만 데드캡으로 적용됩니다.',                color: 'border-emerald-500/50 bg-emerald-500/5' },
                };

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
                        <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-96 space-y-4">
                            {/* 헤더 */}
                            <div>
                                <h3 className="oswald font-black text-white text-lg uppercase tracking-widest">선수 방출</h3>
                                <p className="text-slate-400 text-sm mt-0.5">
                                    <span className="font-bold text-white">{releaseTarget.name}</span>
                                    <span className="text-slate-500 font-mono ml-2">{releaseTarget.position} · OVR {releaseTarget.ovr}</span>
                                </p>
                                <p className="text-slate-500 text-xs mt-1">
                                    잔여 계약: <span className="text-amber-400 font-mono font-bold">{fmtM(totalRemaining)}</span>
                                    {contract && <span className="ml-2">({remainingYears}년 잔여)</span>}
                                </p>
                            </div>

                            {/* 방출 방식 선택 */}
                            <div className="space-y-2">
                                {(['waive', 'stretch', 'buyout'] as ReleaseType[]).map(mode => {
                                    const info = MODE_INFO[mode];
                                    const isSelected = releaseMode === mode;
                                    // 잔여 계약이 1년 이하이면 스트레치 의미 없음
                                    const disabled = mode === 'stretch' && remainingYears <= 1;
                                    return (
                                        <button
                                            key={mode}
                                            disabled={disabled}
                                            onClick={() => !disabled && setReleaseMode(mode)}
                                            className={`w-full text-left p-3 rounded-2xl border transition-all ${
                                                disabled ? 'opacity-30 cursor-not-allowed border-slate-700 bg-transparent' :
                                                isSelected ? info.color + ' border-opacity-100' :
                                                'border-slate-700 bg-transparent hover:bg-slate-800'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                                                    {isSelected ? '● ' : '○ '}{info.label}
                                                </span>
                                                <span className="text-xs font-mono font-bold text-slate-400">
                                                    데드캡{mode === 'stretch' ? `/년` : ''}: {' '}
                                                    <span className={isSelected ? 'text-white' : ''}>
                                                        {mode === 'waive'   ? fmtM(totalRemaining) :
                                                         mode === 'stretch' ? `${fmtM(stretchAnnual)} × ${stretchYearsTotal}년` :
                                                         fmtM(minBuyoutAmount) + '~'}
                                                    </span>
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-slate-500 mt-0.5">{info.desc}</p>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* 바이아웃 슬라이더 */}
                            {releaseMode === 'buyout' && (
                                <div className="bg-slate-800/60 rounded-2xl p-3 space-y-2">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-400">제시 금액</span>
                                        <span className={`font-mono font-bold ${buyoutAccepted ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {fmtM(buyoutAmount)} {buyoutAccepted ? '✓ 수락 예상' : '✗ 거절 예상'}
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min={minBuyoutPct}
                                        max={100}
                                        value={buyoutSlider}
                                        onChange={e => setBuyoutSlider(Number(e.target.value))}
                                        className="w-full accent-emerald-500"
                                    />
                                    <div className="flex justify-between text-[10px] text-slate-600 font-mono">
                                        <span>최소 {fmtM(minBuyoutAmount)} ({minBuyoutPct}%)</span>
                                        <span>전액 {fmtM(totalRemaining)}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-500">
                                        선수는 잔여 금액의 최소 {minBuyoutPct}%를 요구합니다.
                                    </p>
                                </div>
                            )}

                            {/* 데드캡 최종 확인 */}
                            <div className="flex items-center justify-between bg-slate-800/40 rounded-2xl px-4 py-2.5">
                                <span className="text-sm text-slate-400">이번 시즌 데드캡</span>
                                <span className="text-sm font-mono font-bold text-red-400">{fmtM(deadCapPreview)}</span>
                            </div>

                            {/* 버튼 */}
                            <div className="flex gap-3 pt-1">
                                <button
                                    onClick={() => setReleaseConfirmId(null)}
                                    className="flex-1 py-2 rounded-2xl text-sm font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
                                >취소</button>
                                <button
                                    disabled={releaseMode === 'buyout' && !buyoutAccepted}
                                    onClick={() => {
                                        const amount = releaseMode === 'buyout' ? buyoutAmount : undefined;
                                        onReleasePlayer(releaseConfirmId, releaseMode, amount);
                                        setReleaseConfirmId(null);
                                    }}
                                    className="flex-1 py-2 rounded-2xl text-sm font-bold bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >방출 확정</button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};
