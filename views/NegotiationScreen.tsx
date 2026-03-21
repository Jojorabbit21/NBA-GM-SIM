/**
 * NegotiationScreen — 협상 전용 전체화면 오버레이
 *
 * FA 서명 / 계약 익스텐션 / 선수 방출 협상을 전체화면으로 처리한다.
 * 선수 대사는 SaveTendencies + 감정 상태에 따라 동적으로 변한다.
 */

import React, { useState, useMemo, useEffect } from 'react';
import type { Player, PlayerContract, ReleaseType } from '../types';
import type { FAMarketEntry, LeagueFAMarket, SigningType } from '../types/fa';
import type { NegotiationState, NegotiationResponse } from '../services/fa/extensionEngine';
import { LEAGUE_FINANCIALS, SIGNING_EXCEPTIONS } from '../utils/constants';
import { generateSaveTendencies } from '../utils/hiddenTendencies';
import { getMoraleLabel } from '../services/moraleService';
import {
    initNegotiationState,
    evaluateExtensionOffer,
} from '../services/fa/extensionEngine';
import {
    calcTeamPayroll,
    getAvailableSigningSlots,
    processUserOffer,
} from '../services/fa/faMarketBuilder';
import {
    generateDialogue,
    type NegotiationType,
    type DialogueTrigger,
    type DialogueContext,
} from '../services/fa/negotiationDialogue';
import { TEAM_DATA } from '../data/teamData';
import type { Team } from '../types/team';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface NegotiationScreenProps {
    negotiationType: 'extension' | 'fa' | 'release';
    player: Player;
    myTeam: Team;
    teams: Team[];
    tendencySeed: string;
    currentSeasonYear: number;
    currentSeason: string;
    usedMLE: Record<string, boolean>;
    // FA only
    faEntry?: FAMarketEntry;
    faMarket?: LeagueFAMarket;
    // Callbacks
    onClose: () => void;
    onFAOfferAccepted?: (
        playerId: string,
        contract: PlayerContract,
        signingType: SigningType,
        updatedMarket: LeagueFAMarket,
    ) => void;
    onExtensionSigned?: (playerId: string, contract: PlayerContract) => void;
    onReleasePlayer?: (playerId: string, releaseType: ReleaseType, buyoutAmount?: number) => void;
    onViewPlayer?: (player: Player) => void;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function fmtM(val: number): string {
    return `$${(val / 1_000_000).toFixed(1)}M`;
}

function moraleBarColor(score: number): string {
    if (score >= 70) return 'bg-emerald-500';
    if (score >= 50) return 'bg-indigo-500';
    if (score >= 30) return 'bg-amber-500';
    return 'bg-red-500';
}

function moraleTextColor(score: number): string {
    if (score >= 70) return 'text-emerald-400';
    if (score >= 50) return 'text-slate-300';
    if (score >= 30) return 'text-amber-400';
    return 'text-red-400';
}

const SLOT_LABELS: Record<SigningType, string> = {
    cap_space:   '캡 스페이스',
    non_tax_mle: '논택스 MLE',
    tax_mle:     '택스페이어 MLE',
    bird_full:   '풀 버드권',
    bird_early:  '얼리 버드권',
    bird_non:    '논버드',
    vet_min:     '베테랑 미니멈',
};

const TYPE_BADGE: Record<NegotiationScreenProps['negotiationType'], { label: string; className: string; accentColor: string }> = {
    fa:        { label: 'FA 서명',       className: 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30', accentColor: '#6366f1' },
    extension: { label: '계약 익스텐션', className: 'bg-violet-500/20 text-violet-400 border border-violet-500/30', accentColor: '#8b5cf6' },
    release:   { label: '선수 방출',     className: 'bg-red-500/20 text-red-400 border border-red-500/30',           accentColor: '#ef4444' },
};

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

export const NegotiationScreen: React.FC<NegotiationScreenProps> = ({
    negotiationType,
    player,
    myTeam,
    teams,
    tendencySeed,
    currentSeasonYear,
    currentSeason,
    usedMLE,
    faEntry,
    faMarket,
    onClose,
    onFAOfferAccepted,
    onExtensionSigned,
    onReleasePlayer,
    onViewPlayer,
}) => {
    const primaryColor = TEAM_DATA[myTeam.id]?.colors?.primary ?? '#4f46e5';
    const moraleScore = player.morale?.score ?? 50;

    // Tendencies (결정론적)
    const tendencies = useMemo(
        () => generateSaveTendencies(tendencySeed, player.id),
        [tendencySeed, player.id],
    );

    // All players — extension initNegotiationState에 필요
    const allPlayers = useMemo(() => teams.flatMap(t => t.roster), [teams]);

    // Contender score (익스텐션 ofer 평가용)
    const contenderScore = useMemo(() => {
        const total = myTeam.wins + myTeam.losses;
        return total > 0 ? Math.min(1, (myTeam.wins / total) * 1.5) : 0.5;
    }, [myTeam.wins, myTeam.losses]);

    // ─── Extension State ─────────────────────────────────────
    const [negState, setNegState] = useState<NegotiationState | null>(() => {
        if (negotiationType === 'extension') {
            return initNegotiationState(
                player, myTeam, allPlayers, tendencySeed, currentSeasonYear, currentSeason,
            );
        }
        return null;
    });
    const [extOfferSalary, setExtOfferSalary] = useState(
        () => (negState ? negState.demand.openingAsk : 0),
    );
    const [extOfferYears, setExtOfferYears] = useState(
        () => (negState ? negState.demand.askingYears : 2),
    );
    const [lastExtResponse, setLastExtResponse] = useState<NegotiationResponse | null>(null);

    // ─── FA State ────────────────────────────────────────────
    const yos = currentSeasonYear - (player.draftYear ?? currentSeasonYear);
    const capPct = yos >= 10 ? 0.35 : yos >= 7 ? 0.30 : 0.25;
    const faMaxAllowed = Math.round(LEAGUE_FINANCIALS.SALARY_CAP * capPct);
    const vetMin = yos >= 7 ? 3_000_000 : yos >= 4 ? 2_200_000 : 1_500_000;

    const slots = useMemo(() => {
        if (negotiationType !== 'fa' || !faEntry) return [] as SigningType[];
        return getAvailableSigningSlots(myTeam, player, faEntry.prevTeamId, usedMLE);
    }, [negotiationType, faEntry, myTeam, player, usedMLE]);

    const [selectedSlot, setSelectedSlot] = useState<SigningType>(
        () => slots[0] ?? 'vet_min',
    );
    const [faOfferSalary, setFaOfferSalary] = useState(
        () => faEntry?.askingSalary ?? 0,
    );
    const [faOfferYears, setFaOfferYears] = useState(
        () => faEntry?.askingYears ?? 2,
    );
    const [faResult, setFaResult] = useState<{ accepted: boolean; reason?: string } | null>(null);
    const [faRound, setFaRound] = useState(0);

    const slotMaxMap = useMemo((): Partial<Record<SigningType, number>> => {
        const payroll = calcTeamPayroll(myTeam);
        return {
            cap_space:   Math.min(Math.max(0, LEAGUE_FINANCIALS.SALARY_CAP - payroll), faMaxAllowed),
            non_tax_mle: Math.min(SIGNING_EXCEPTIONS.NON_TAX_MLE, faMaxAllowed),
            tax_mle:     Math.min(SIGNING_EXCEPTIONS.TAXPAYER_MLE, faMaxAllowed),
            bird_full:   faMaxAllowed,
            bird_early:  Math.min(faMaxAllowed, (player.salary ?? 0) * 1.75),
            bird_non:    Math.min(faMaxAllowed, (player.salary ?? 0) * 1.20),
            vet_min:     vetMin,
        };
    }, [myTeam, faMaxAllowed, player.salary, vetMin]);

    const currentSlotMax = slotMaxMap[selectedSlot] ?? vetMin;
    const faMaxYears = selectedSlot === 'tax_mle' ? 2 : 5;

    // ─── Release State ───────────────────────────────────────
    const [releaseMode, setReleaseMode] = useState<ReleaseType>('waive');
    const [buyoutSlider, setBuyoutSlider] = useState(70);

    const releaseContract = player.contract;
    const remainingYears = releaseContract
        ? releaseContract.years.length - releaseContract.currentYear
        : 1;
    const totalRemaining = releaseContract
        ? releaseContract.years.slice(releaseContract.currentYear).reduce((s, v) => s + v, 0)
        : (player.salary ?? 0);
    const stretchYearsTotal = Math.max(1, 2 * remainingYears - 1);
    const stretchAnnual = totalRemaining / stretchYearsTotal;
    const minBuyoutPct = Math.round(Math.min(75, 50 + 25 * Math.max(0, (player.ovr - 60) / 35)));
    const minBuyoutAmount = Math.round(totalRemaining * (minBuyoutPct / 100));
    const buyoutAmount = Math.round(totalRemaining * (buyoutSlider / 100));
    const buyoutAccepted = buyoutAmount >= minBuyoutAmount;

    // ─── Dialogue State ──────────────────────────────────────
    const [dialogue, setDialogue] = useState('');
    const [dialogueKey, setDialogueKey] = useState(0);
    const [subText, setSubText] = useState<string | null>(null);
    const [round, setRound] = useState(0);

    // 대사 갱신 헬퍼
    const updateDialogue = (
        trigger: DialogueTrigger,
        r: number,
        negSt: NegotiationState | null | undefined,
        sub: string | null,
    ) => {
        const ctx: DialogueContext = {
            tendencies,
            morale: moraleScore,
            respect:    negSt?.respect    ?? 0.70,
            trust:      negSt?.trust      ?? 0.70,
            frustration: negSt?.frustration ?? 0,
            round: r,
            negotiationType: negotiationType as NegotiationType,
        };
        const d = generateDialogue(trigger, ctx, `${tendencySeed}:${player.id}`);
        setDialogue(d);
        setDialogueKey(k => k + 1);
        setSubText(sub);
    };

    // 초기 인사 대사
    useEffect(() => {
        if (negotiationType === 'release') {
            updateDialogue('RELEASE_PROPOSE', 0, null, null);
        } else {
            updateDialogue('GREETING', 0, negState, null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── FA Submit ───────────────────────────────────────────
    const handleFASubmit = () => {
        if (!faEntry || !faMarket || faResult?.accepted) return;

        const result = processUserOffer(
            faMarket,
            myTeam,
            player,
            faEntry.prevTeamId,
            { salary: faOfferSalary, years: faOfferYears, signingType: selectedSlot },
            tendencySeed,
            currentSeasonYear,
        );

        const newRound = faRound + 1;
        setFaRound(newRound);

        if (result.accepted) {
            setFaResult({ accepted: true });
            updateDialogue('ACCEPT', newRound, null, null);

            // 마켓 업데이트 빌드
            const updatedEntries = faMarket.entries.map(e =>
                e.playerId === player.id
                    ? { ...e, status: 'signed' as const, signedTeamId: myTeam.id, signedYears: faOfferYears, signedSalary: faOfferSalary }
                    : e,
            );
            const updatedMLE = { ...faMarket.usedMLE };
            if (selectedSlot === 'non_tax_mle' || selectedSlot === 'tax_mle') {
                updatedMLE[myTeam.id] = true;
            }
            const updatedMarket: LeagueFAMarket = { ...faMarket, entries: updatedEntries, usedMLE: updatedMLE };
            onFAOfferAccepted?.(player.id, result.contract, result.signingType, updatedMarket);
        } else {
            const reason = (result as { accepted: false; reason: string }).reason;
            setFaResult({ accepted: false, reason });

            // 거절 트리거: 제시 연봉 수준에 따라 결정
            let trigger: DialogueTrigger = 'REJECT';
            if (faEntry && faOfferSalary < faEntry.walkAwaySalary * 0.65) {
                trigger = 'OFFER_INSULT';
            } else if (faEntry && faOfferSalary < faEntry.walkAwaySalary) {
                trigger = 'OFFER_LOW';
            }
            updateDialogue(trigger, newRound, null, null);
        }
    };

    // ─── Extension Submit ────────────────────────────────────
    const handleExtSubmit = () => {
        if (!negState || negState.walkedAway || negState.signed) return;

        const { response, updatedState } = evaluateExtensionOffer(
            { years: extOfferYears, annualSalary: extOfferSalary, contenderScore },
            negState,
            tendencySeed,
        );

        setNegState(updatedState);
        setLastExtResponse(response);
        const newRound = round + 1;
        setRound(newRound);

        switch (response.outcome) {
            case 'ACCEPT':
                updateDialogue('ACCEPT', newRound, updatedState, null);
                onExtensionSigned?.(player.id, response.contract);
                break;
            case 'COUNTER':
                updateDialogue(
                    'COUNTER',
                    newRound,
                    updatedState,
                    `요구: ${fmtM(response.counterAAV)} / ${response.counterYears}년`,
                );
                break;
            case 'REJECT_HARD':
                updateDialogue(
                    extOfferSalary < negState.demand.insultThreshold ? 'OFFER_INSULT' : 'OFFER_LOW',
                    newRound,
                    updatedState,
                    null,
                );
                break;
            case 'WALKED_AWAY':
                updateDialogue('WALKED_AWAY', newRound, updatedState, null);
                break;
        }
    };

    // ─── Release Confirm ─────────────────────────────────────
    const handleReleaseConfirm = () => {
        const amount = releaseMode === 'buyout' ? buyoutAmount : undefined;
        onReleasePlayer?.(player.id, releaseMode, amount);
        onClose();
    };

    // ─── Derived ─────────────────────────────────────────────
    const isExtFinal = negotiationType === 'extension' && !!(negState?.walkedAway || negState?.signed);
    const isFAFinal  = negotiationType === 'fa' && !!faResult?.accepted;
    const badge = TYPE_BADGE[negotiationType];

    const isFA = negotiationType === 'fa';
    const isExt = negotiationType === 'extension';
    const isRel = negotiationType === 'release';

    const faIsAboveAsking  = faEntry ? faOfferSalary >= faEntry.askingSalary : false;
    const faIsBelowWalkaway = faEntry ? faOfferSalary < faEntry.walkAwaySalary : false;

    // ─── Render ──────────────────────────────────────────────
    return (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col text-slate-200">

            {/* ── Header ── */}
            <div className="flex-shrink-0 h-14 px-6 border-b border-slate-800 bg-slate-950 flex items-center gap-4">
                <button
                    onClick={onClose}
                    className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-white transition-colors"
                >
                    <span className="text-base">←</span>
                    <span>뒤로</span>
                </button>
                <div className="h-5 w-px bg-slate-700" />
                <span className={`text-xs font-black uppercase tracking-widest px-2.5 py-1 rounded ${badge.className}`}>
                    {badge.label}
                </span>
                <button
                    onClick={() => onViewPlayer?.(player)}
                    className="ml-auto text-right hover:opacity-80 transition-opacity"
                >
                    <div className="text-base font-black text-white ko-tight">{player.name}</div>
                    <div className="text-xs font-mono text-slate-400">{player.position} · {player.age}세 · OVR {player.ovr}</div>
                </button>
            </div>

            {/* ── Main ── */}
            <div className="flex-1 flex overflow-hidden min-h-0">

                {/* ── Left Panel ── */}
                <div className="w-72 flex-shrink-0 border-r border-slate-800 overflow-y-auto custom-scrollbar p-5 space-y-4">

                    {/* 선수 정보 카드 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <div className="px-3 py-2" style={{ backgroundColor: primaryColor }}>
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/80">선수 정보</span>
                        </div>
                        <div className="p-3 space-y-1.5">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">현재 연봉</span>
                                <span className="font-mono font-bold text-amber-400">{fmtM(player.salary ?? 0)} / yr</span>
                            </div>
                            {isExt && negState && (
                                <>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-500">잔여 계약</span>
                                        <span className="font-mono text-slate-300">{player.contractYears}년</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-500">선수 요구</span>
                                        <span className="font-mono font-bold text-amber-400">{fmtM(negState.demand.openingAsk)} / yr</span>
                                    </div>
                                </>
                            )}
                            {isFA && faEntry && (
                                <>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-500">요구 연봉</span>
                                        <span className="font-mono font-bold text-amber-400">{fmtM(faEntry.askingSalary)} / yr</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-500">요구 연수</span>
                                        <span className="font-mono text-slate-300">{faEntry.askingYears}년</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-500">관심 팀</span>
                                        <span className="font-mono text-slate-300">{faEntry.interestedTeamIds.length}팀</span>
                                    </div>
                                </>
                            )}
                            {isRel && (
                                <>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-500">잔여 연수</span>
                                        <span className="font-mono text-slate-300">{remainingYears}년</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-500">잔여 총액</span>
                                        <span className="font-mono font-bold text-amber-400">{fmtM(totalRemaining)}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* 선수 기분 (Morale) */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <div className="px-3 py-2" style={{ backgroundColor: primaryColor }}>
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/80">선수 기분</span>
                        </div>
                        <div className="p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className={`text-sm font-bold ${moraleTextColor(moraleScore)}`}>
                                    {getMoraleLabel(moraleScore)}
                                </span>
                                <span className="text-xs font-mono text-slate-500">{Math.round(moraleScore)}</span>
                            </div>
                            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${moraleBarColor(moraleScore)}`}
                                    style={{ width: `${moraleScore}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Extension: 협상 감정 상태 */}
                    {isExt && negState && (
                        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                            <div className="px-3 py-2" style={{ backgroundColor: primaryColor }}>
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/80">협상 감정 상태</span>
                            </div>
                            <div className="p-3 space-y-2">
                                {[
                                    { label: '존중감',   value: negState.respect,      color: 'bg-indigo-500' },
                                    { label: '신뢰도',   value: negState.trust,        color: 'bg-emerald-500' },
                                    { label: '불만족도', value: negState.frustration,  color: 'bg-red-500' },
                                ].map(({ label, value, color }) => (
                                    <div key={label} className="flex items-center gap-2">
                                        <div className="w-16 text-[10px] font-bold text-slate-500">{label}</div>
                                        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${color}`}
                                                style={{ width: `${Math.round(value * 100)}%` }}
                                            />
                                        </div>
                                        <div className="w-8 text-[10px] font-mono text-right text-slate-500">
                                            {Math.round(value * 100)}
                                        </div>
                                    </div>
                                ))}
                                {negState.lowballCount > 0 && (
                                    <div className="text-[10px] text-amber-400 font-bold pt-1">
                                        ⚠ 저가 제안 경고 {negState.lowballCount}/3
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Extension: 요구 조건 정보 */}
                    {isExt && negState && (
                        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-1.5">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">협상 현황</div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">현재 요구</span>
                                <span className="font-mono font-bold text-amber-400">{fmtM(negState.currentCounterAAV)} / yr</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">요구 연수</span>
                                <span className="font-mono text-slate-300">{negState.currentCounterYears}년</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">최소 수용선</span>
                                <span className="font-mono text-slate-400">{fmtM(negState.demand.reservationFloor)} / yr</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">협상 라운드</span>
                                <span className="font-mono text-slate-300">{negState.roundsUsed}회</span>
                            </div>
                        </div>
                    )}

                    {/* FA: 시장 정보 */}
                    {isFA && faEntry && faRound > 0 && (
                        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-1.5">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">협상 현황</div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">제출 횟수</span>
                                <span className="font-mono text-slate-300">{faRound}회</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">MVS</span>
                                <span className="font-mono text-slate-300">{faEntry.marketValueScore}</span>
                            </div>
                        </div>
                    )}

                    {/* Release: 방출 방식 정보 */}
                    {isRel && releaseMode !== 'waive' && (
                        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-1.5">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">데드캡 정보</div>
                            {releaseMode === 'stretch' && (
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500">연간 데드캡</span>
                                    <span className="font-mono text-slate-300">{fmtM(stretchAnnual)} × {stretchYearsTotal}년</span>
                                </div>
                            )}
                            {releaseMode === 'buyout' && (
                                <>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-500">최소 요구액</span>
                                        <span className="font-mono text-red-400">{fmtM(minBuyoutAmount)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-500">제시 금액</span>
                                        <span className={`font-mono font-bold ${buyoutAccepted ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {fmtM(buyoutAmount)}
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Center: Dialogue ── */}
                <div className="flex-1 flex flex-col items-center justify-center gap-8 px-8 overflow-hidden">
                    {/* 플레이어 아바타 */}
                    <div
                        className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-black text-white shadow-2xl ring-4 ring-white/10 flex-shrink-0"
                        style={{ backgroundColor: primaryColor }}
                    >
                        {player.name.charAt(0)}
                    </div>

                    {/* 대사 */}
                    <div
                        key={dialogueKey}
                        className="animate-in fade-in slide-in-from-bottom-2 duration-300 text-center max-w-xl space-y-4"
                    >
                        {dialogue ? (
                            <p className="text-2xl font-bold text-white leading-relaxed">
                                &ldquo;{dialogue}&rdquo;
                            </p>
                        ) : (
                            <p className="text-2xl font-bold text-slate-600">...</p>
                        )}
                        {subText && (
                            <p className="text-sm font-mono text-slate-400 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2">
                                {subText}
                            </p>
                        )}
                    </div>

                    {/* 최종 상태 배지 */}
                    {(isExtFinal || isFAFinal) && (
                        <div className={`px-5 py-2.5 rounded-lg text-sm font-black uppercase tracking-wide ${
                            (negState?.signed || faResult?.accepted)
                                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                                : 'bg-red-500/20 border border-red-500/40 text-red-400'
                        }`}>
                            {(negState?.signed || faResult?.accepted) ? '✓ 계약 체결!' : '협상 결렬'}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Bottom Controls ── */}
            <div className="flex-shrink-0 border-t border-slate-800 bg-slate-900/50 px-8 py-5">

                {/* ── FA Controls ── */}
                {isFA && faEntry && (
                    <div className="flex gap-8 items-start">

                        {/* 계약 슬롯 선택 */}
                        {!faResult?.accepted && (
                            <div className="flex-shrink-0 w-52 space-y-2">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">계약 슬롯</div>
                                <div className="space-y-1">
                                    {slots.map(slot => (
                                        <button
                                            key={slot}
                                            onClick={() => {
                                                setSelectedSlot(slot);
                                                const newMax = slotMaxMap[slot] ?? vetMin;
                                                setFaOfferSalary(prev => Math.min(prev, newMax));
                                                setFaOfferYears(prev => Math.min(prev, slot === 'tax_mle' ? 2 : 5));
                                            }}
                                            className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                                selectedSlot === slot
                                                    ? 'border-indigo-500 bg-indigo-500/15 text-white'
                                                    : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
                                            }`}
                                        >
                                            {SLOT_LABELS[slot]}
                                        </button>
                                    ))}
                                    {slots.length === 0 && (
                                        <div className="text-xs text-slate-500 py-2">사용 가능한 슬롯 없음</div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* 연봉 + 연수 */}
                        {!faResult?.accepted && (
                            <div className="flex-1 space-y-4">
                                {/* 연봉 슬라이더 */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">제시 연봉 / yr</div>
                                        <div className={`text-sm font-mono font-bold ${
                                            faIsAboveAsking ? 'text-emerald-400' :
                                            faIsBelowWalkaway ? 'text-red-400' :
                                            'text-amber-400'
                                        }`}>{fmtM(faOfferSalary)}</div>
                                    </div>
                                    <input
                                        type="range"
                                        min={vetMin}
                                        max={Math.max(currentSlotMax, faEntry.askingSalary)}
                                        step={100_000}
                                        value={faOfferSalary}
                                        onChange={e => setFaOfferSalary(Number(e.target.value))}
                                        className="w-full accent-indigo-500"
                                        disabled={selectedSlot === 'vet_min'}
                                    />
                                    <div className="flex justify-between text-[10px] font-mono text-slate-600 mt-0.5">
                                        <span>{fmtM(vetMin)}</span>
                                        <span className="text-amber-600">요구 {fmtM(faEntry.askingSalary)}</span>
                                        <span>{fmtM(Math.max(currentSlotMax, faEntry.askingSalary))}</span>
                                    </div>
                                    <div className="mt-1 text-[10px] text-center">
                                        {faIsAboveAsking
                                            ? <span className="text-emerald-400">✓ 요구 이상 — 높은 수락 확률</span>
                                            : faIsBelowWalkaway
                                            ? <span className="text-red-400">✗ 최저선 미달 — 거절 확정</span>
                                            : <span className="text-slate-500">협상 구간</span>
                                        }
                                    </div>
                                </div>

                                {/* 연수 버튼 */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">계약 연수</div>
                                        <div className="text-sm font-mono font-bold text-white">{faOfferYears}년</div>
                                    </div>
                                    <div className="flex gap-2">
                                        {Array.from({ length: faMaxYears }, (_, i) => i + 1).map(y => (
                                            <button
                                                key={y}
                                                onClick={() => setFaOfferYears(y)}
                                                className={`flex-1 py-1.5 rounded-lg text-sm font-bold border transition-all ${
                                                    faOfferYears === y
                                                        ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300'
                                                        : 'border-slate-700 bg-slate-800 text-slate-500 hover:border-slate-600'
                                                }`}
                                            >
                                                {y}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 제출 / 결과 */}
                        <div className="flex-shrink-0 w-44 flex flex-col gap-3 pt-5">
                            {!faResult ? (
                                <button
                                    onClick={handleFASubmit}
                                    disabled={slots.length === 0 || faIsBelowWalkaway}
                                    className="w-full py-3 rounded-lg font-black uppercase tracking-wide text-sm transition-all
                                        bg-indigo-600 hover:bg-indigo-500 text-white
                                        disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    오퍼 제출
                                </button>
                            ) : faResult.accepted ? (
                                <button
                                    onClick={onClose}
                                    className="w-full py-3 rounded-lg font-black uppercase tracking-wide text-sm transition-all
                                        bg-emerald-600 hover:bg-emerald-500 text-white"
                                >
                                    완료
                                </button>
                            ) : (
                                <>
                                    <div className="text-center text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                        {faResult.reason ?? '거절'}
                                    </div>
                                    <button
                                        onClick={() => setFaResult(null)}
                                        className="w-full py-2 rounded-lg font-bold text-sm transition-all
                                            bg-slate-700 hover:bg-slate-600 text-slate-200"
                                    >
                                        재협상
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Extension Controls ── */}
                {isExt && negState && (
                    <div className="flex gap-8 items-start">

                        {/* 연봉 + 연수 */}
                        <div className="flex-1 space-y-4">
                            {/* 연봉 슬라이더 */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">제시 연봉 / yr</div>
                                    <div className={`text-sm font-mono font-bold ${
                                        extOfferSalary >= negState.demand.targetAAV ? 'text-emerald-400' :
                                        extOfferSalary < negState.demand.insultThreshold ? 'text-red-500' :
                                        extOfferSalary < negState.demand.reservationFloor ? 'text-red-400' :
                                        'text-amber-400'
                                    }`}>{fmtM(extOfferSalary)}</div>
                                </div>
                                <input
                                    type="range"
                                    min={Math.round(negState.demand.insultThreshold * 0.9)}
                                    max={Math.round(negState.demand.openingAsk * 1.3)}
                                    step={100_000}
                                    value={extOfferSalary}
                                    onChange={e => setExtOfferSalary(Number(e.target.value))}
                                    className="w-full accent-violet-500"
                                    disabled={isExtFinal}
                                />
                                <div className="flex justify-between text-[10px] font-mono text-slate-600 mt-0.5">
                                    <span>{fmtM(Math.round(negState.demand.insultThreshold * 0.9))}</span>
                                    <span className="text-amber-600">요구 {fmtM(negState.currentCounterAAV)}</span>
                                    <span>{fmtM(Math.round(negState.demand.openingAsk * 1.3))}</span>
                                </div>
                                <div className="mt-1 text-[10px] text-center">
                                    {extOfferSalary >= negState.demand.targetAAV
                                        ? <span className="text-emerald-400">✓ 목표가 이상 — 높은 수락 가능성</span>
                                        : extOfferSalary < negState.demand.insultThreshold
                                        ? <span className="text-red-500">✗ 모욕 수준 — 즉시 거절</span>
                                        : extOfferSalary < negState.demand.reservationFloor
                                        ? <span className="text-red-400">✗ 최소 수용선 미달</span>
                                        : <span className="text-slate-500">협상 구간</span>
                                    }
                                </div>
                            </div>

                            {/* 연수 버튼 */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">계약 연수</div>
                                    <div className="text-sm font-mono font-bold text-white">{extOfferYears}년</div>
                                </div>
                                <div className="flex gap-2">
                                    {[1, 2, 3, 4].map(y => (
                                        <button
                                            key={y}
                                            onClick={() => setExtOfferYears(y)}
                                            disabled={isExtFinal}
                                            className={`flex-1 py-1.5 rounded-lg text-sm font-bold border transition-all ${
                                                extOfferYears === y
                                                    ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                                                    : 'border-slate-700 bg-slate-800 text-slate-500 hover:border-slate-600'
                                            }`}
                                        >
                                            {y}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* 응답 배너 + 제출 */}
                        <div className="flex-shrink-0 w-44 flex flex-col gap-3 pt-5">
                            {lastExtResponse && !isExtFinal && (
                                <div className={`rounded-lg px-3 py-2 text-xs font-bold border text-center ${
                                    lastExtResponse.outcome === 'COUNTER'
                                        ? 'bg-violet-500/10 border-violet-500/30 text-violet-300'
                                        : 'bg-red-500/10 border-red-500/30 text-red-400'
                                }`}>
                                    {lastExtResponse.outcome === 'COUNTER' ? '카운터 제시' : '거절'}
                                </div>
                            )}
                            {!isExtFinal ? (
                                <button
                                    onClick={handleExtSubmit}
                                    className="w-full py-3 rounded-lg font-black uppercase tracking-wide text-sm transition-all
                                        bg-violet-600 hover:bg-violet-500 text-white"
                                >
                                    오퍼 제출
                                </button>
                            ) : (
                                <button
                                    onClick={onClose}
                                    className={`w-full py-3 rounded-lg font-black uppercase tracking-wide text-sm transition-all
                                        ${negState.signed
                                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                            : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                                        }`}
                                >
                                    {negState.signed ? '완료' : '닫기'}
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Release Controls ── */}
                {isRel && (
                    <div className="flex gap-8 items-start">

                        {/* 방출 방식 + 바이아웃 슬라이더 */}
                        <div className="flex-1 space-y-4">
                            {/* 방식 선택 버튼 */}
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">방출 방식</div>
                                <div className="flex gap-3">
                                    {(['waive', 'stretch', 'buyout'] as ReleaseType[]).map(mode => {
                                        const labels: Record<ReleaseType, { name: string; desc: string }> = {
                                            waive:   { name: '웨이브',   desc: `데드캡 ${fmtM(totalRemaining)}` },
                                            stretch: { name: '스트레치', desc: `연간 ${fmtM(stretchAnnual)} × ${stretchYearsTotal}년` },
                                            buyout:  { name: '바이아웃', desc: `최소 ${fmtM(minBuyoutAmount)}` },
                                        };
                                        const isDisabled = mode === 'stretch' && remainingYears <= 1;
                                        const isSelected = releaseMode === mode;
                                        return (
                                            <button
                                                key={mode}
                                                disabled={isDisabled}
                                                onClick={() => { if (!isDisabled) setReleaseMode(mode); }}
                                                className={`flex-1 text-left p-3 rounded-lg border transition-all ${
                                                    isDisabled
                                                        ? 'opacity-30 cursor-not-allowed border-slate-700 bg-transparent'
                                                        : isSelected
                                                        ? 'border-red-500/60 bg-red-500/10 text-white'
                                                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600'
                                                }`}
                                            >
                                                <div className="text-sm font-bold">{labels[mode].name}</div>
                                                <div className="text-[10px] font-mono text-slate-500 mt-0.5">{labels[mode].desc}</div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 바이아웃 슬라이더 */}
                            {releaseMode === 'buyout' && (
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">제시 금액</div>
                                        <div className={`text-sm font-mono font-bold ${buyoutAccepted ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {fmtM(buyoutAmount)} {buyoutAccepted ? '✓ 수락 예상' : '✗ 거절 예상'}
                                        </div>
                                    </div>
                                    <input
                                        type="range"
                                        min={minBuyoutPct}
                                        max={100}
                                        value={buyoutSlider}
                                        onChange={e => setBuyoutSlider(Number(e.target.value))}
                                        className="w-full accent-emerald-500"
                                    />
                                    <div className="flex justify-between text-[10px] font-mono text-slate-600 mt-0.5">
                                        <span>최소 {fmtM(minBuyoutAmount)} ({minBuyoutPct}%)</span>
                                        <span>전액 {fmtM(totalRemaining)}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-1">
                                        선수는 잔여 금액의 최소 {minBuyoutPct}%를 요구합니다.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* 데드캡 + 확정 버튼 */}
                        <div className="flex-shrink-0 w-52 flex flex-col gap-3 pt-2">
                            <div className="bg-slate-800 rounded-lg px-4 py-2.5 flex items-center justify-between">
                                <span className="text-xs text-slate-400">
                                    {releaseMode === 'stretch' ? '연간 데드캡' : '데드캡'}
                                </span>
                                <span className="text-sm font-mono font-bold text-red-400">
                                    {releaseMode === 'waive'   ? fmtM(totalRemaining) :
                                     releaseMode === 'stretch' ? fmtM(stretchAnnual) :
                                     fmtM(buyoutAmount)}
                                </span>
                            </div>
                            <button
                                disabled={releaseMode === 'buyout' && !buyoutAccepted}
                                onClick={handleReleaseConfirm}
                                className="w-full py-3 rounded-lg font-black uppercase tracking-wide text-sm transition-all
                                    bg-red-600 hover:bg-red-500 text-white
                                    disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                방출 확정
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
