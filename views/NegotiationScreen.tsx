/**
 * NegotiationScreen — FA 시장 바디 위 오버레이 (FM26 스타일)
 * 3패널: 좌(선수정보+감정) | 중(오퍼폼+요약) | 우(채팅버블 히스토리)
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
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

interface ChatMsg {
    id: number;
    role: 'player' | 'gm' | 'status';
    text: string;
    subText?: string;
    isSuccess?: boolean;
}

interface NegotiationScreenProps {
    negotiationType: 'extension' | 'fa' | 'release';
    player: Player;
    myTeam: Team;
    teams: Team[];
    tendencySeed: string;
    currentSeasonYear: number;
    currentSeason: string;
    usedMLE: Record<string, boolean>;
    faEntry?: FAMarketEntry;
    faMarket?: LeagueFAMarket;
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

function moraleEmoji(score: number): string {
    if (score >= 88) return '😄';
    if (score >= 72) return '🙂';
    if (score >= 52) return '😐';
    if (score >= 35) return '😕';
    if (score >= 20) return '😠';
    return '😤';
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

const TYPE_BADGE = {
    fa:        { label: 'FA 서명',       className: 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30', accentColor: '#6366f1' },
    extension: { label: '계약 익스텐션', className: 'bg-violet-500/20 text-violet-400 border border-violet-500/30', accentColor: '#8b5cf6' },
    release:   { label: '선수 방출',     className: 'bg-red-500/20 text-red-400 border border-red-500/30',           accentColor: '#ef4444' },
} as const;

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
    const primaryColor  = TEAM_DATA[myTeam.id]?.colors?.primary ?? '#4f46e5';
    const moraleScore   = player.morale?.score ?? 50;
    const badge         = TYPE_BADGE[negotiationType];
    const accentColor   = badge.accentColor;
    const isFA  = negotiationType === 'fa';
    const isExt = negotiationType === 'extension';
    const isRel = negotiationType === 'release';

    // ─── Tendencies ──────────────────────────────────────────
    const tendencies = useMemo(
        () => generateSaveTendencies(tendencySeed, player.id),
        [tendencySeed, player.id],
    );

    const allPlayers    = useMemo(() => teams.flatMap(t => t.roster), [teams]);
    const contenderScore = useMemo(() => {
        const total = myTeam.wins + myTeam.losses;
        return total > 0 ? Math.min(1, (myTeam.wins / total) * 1.5) : 0.5;
    }, [myTeam.wins, myTeam.losses]);

    // ─── Extension State ─────────────────────────────────────
    const [negState, setNegState] = useState<NegotiationState | null>(() =>
        isExt ? initNegotiationState(player, myTeam, allPlayers, tendencySeed, currentSeasonYear, currentSeason) : null,
    );
    const [extOfferSalary, setExtOfferSalary] = useState(() => negState?.demand.openingAsk ?? 0);
    const [extOfferYears, setExtOfferYears]   = useState(() => negState?.demand.askingYears ?? 2);
    const [lastExtResponse, setLastExtResponse] = useState<NegotiationResponse | null>(null);

    // ─── FA State ────────────────────────────────────────────
    const yos         = currentSeasonYear - (player.draftYear ?? currentSeasonYear);
    const capPct      = yos >= 10 ? 0.35 : yos >= 7 ? 0.30 : 0.25;
    const faMaxAllowed = Math.round(LEAGUE_FINANCIALS.SALARY_CAP * capPct);
    const vetMin      = yos >= 7 ? 3_000_000 : yos >= 4 ? 2_200_000 : 1_500_000;

    const slots = useMemo(() => {
        if (!isFA || !faEntry) return [] as SigningType[];
        return getAvailableSigningSlots(myTeam, player, faEntry.prevTeamId, usedMLE);
    }, [isFA, faEntry, myTeam, player, usedMLE]);

    const [selectedSlot, setSelectedSlot]   = useState<SigningType>(() => slots[0] ?? 'vet_min');
    const [faOfferSalary, setFaOfferSalary] = useState(() => faEntry?.askingSalary ?? 0);
    const [faOfferYears, setFaOfferYears]   = useState(() => faEntry?.askingYears ?? 2);
    const [faResult, setFaResult]           = useState<{ accepted: boolean; reason?: string } | null>(null);
    const [faRound, setFaRound]             = useState(0);

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

    // NBA CBA 기준 슬롯별 최대 계약 연수
    const SLOT_MAX_YEARS: Record<SigningType, number> = {
        bird_full:   5,  // 풀 버드권 (자기 팀 재계약)
        bird_early:  5,  // 얼리 버드권
        bird_non:    4,  // 논버드
        cap_space:   4,  // 캡 스페이스
        non_tax_mle: 4,  // 논택스 MLE
        tax_mle:     3,  // 택스페이어 MLE
        vet_min:     2,  // 베테랑 미니멈
    };
    const faMaxYears = SLOT_MAX_YEARS[selectedSlot] ?? 4;

    // ─── Release State ───────────────────────────────────────
    const [releaseMode, setReleaseMode]   = useState<ReleaseType>('waive');
    const [buyoutSlider, setBuyoutSlider] = useState(70);

    const releaseContract  = player.contract;
    const remainingYears   = releaseContract ? releaseContract.years.length - releaseContract.currentYear : 1;
    const totalRemaining   = releaseContract
        ? releaseContract.years.slice(releaseContract.currentYear).reduce((s, v) => s + v, 0)
        : (player.salary ?? 0);
    const stretchYearsTotal = Math.max(1, 2 * remainingYears - 1);
    const stretchAnnual     = totalRemaining / stretchYearsTotal;
    const minBuyoutPct      = Math.round(Math.min(75, 50 + 25 * Math.max(0, (player.ovr - 60) / 35)));
    const minBuyoutAmount   = Math.round(totalRemaining * (minBuyoutPct / 100));
    const buyoutAmount      = Math.round(totalRemaining * (buyoutSlider / 100));
    const buyoutAccepted    = buyoutAmount >= minBuyoutAmount;

    // ─── Chat State ──────────────────────────────────────────
    const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const idCounter  = useRef(0);

    const nextId = () => { idCounter.current += 1; return idCounter.current; };

    // 채팅 메시지 추가 헬퍼
    const addMsg = (role: ChatMsg['role'], text: string, subText?: string, isSuccess?: boolean) => {
        setChatMessages(prev => [...prev, { id: nextId(), role, text, subText, isSuccess }]);
    };

    // 선수 대사 생성 후 채팅에 추가
    const addPlayerMsg = (
        trigger: DialogueTrigger,
        r: number,
        negSt: NegotiationState | null | undefined,
        sub: string | null,
    ) => {
        const ctx: DialogueContext = {
            tendencies,
            morale:      moraleScore,
            respect:     negSt?.respect     ?? 0.70,
            trust:       negSt?.trust       ?? 0.70,
            frustration: negSt?.frustration ?? 0,
            round:       r,
            negotiationType: negotiationType as NegotiationType,
        };
        const d = generateDialogue(trigger, ctx, `${tendencySeed}:${player.id}`);
        setChatMessages(prev => [...prev, { id: nextId(), role: 'player', text: d, subText: sub ?? undefined }]);
    };

    // 채팅 자동 스크롤
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    // 인사 대사 (마운트 시 1회)
    useEffect(() => {
        const trigger: DialogueTrigger = isRel ? 'RELEASE_PROPOSE' : 'GREETING';
        const ctx: DialogueContext = {
            tendencies,
            morale:      moraleScore,
            respect:     negState?.respect     ?? 0.70,
            trust:       negState?.trust       ?? 0.70,
            frustration: negState?.frustration ?? 0,
            round:       0,
            negotiationType: negotiationType as NegotiationType,
        };
        const d = generateDialogue(trigger, ctx, `${tendencySeed}:${player.id}`);
        // 익스텐션: 초기 요구 조건을 대화 subText로 간접 노출
        const greetingSub = isExt && negState
            ? `요구: ${fmtM(negState.demand.openingAsk)} / yr · ${negState.demand.askingYears}년`
            : undefined;
        setChatMessages([{ id: nextId(), role: 'player', text: d, subText: greetingSub }]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── FA Submit ───────────────────────────────────────────
    const handleFASubmit = () => {
        if (!faEntry || !faMarket || faResult?.accepted) return;

        const newRound = faRound + 1;
        setFaRound(newRound);

        // GM 오퍼 버블
        addMsg('gm', `${fmtM(faOfferSalary)} / yr · ${faOfferYears}년`, `예상 총액 ${fmtM(faOfferSalary * faOfferYears)}`);

        const result = processUserOffer(
            faMarket, myTeam, player, faEntry.prevTeamId,
            { salary: faOfferSalary, years: faOfferYears, signingType: selectedSlot },
            tendencySeed, currentSeasonYear,
        );

        if (result.accepted) {
            setFaResult({ accepted: true });
            addPlayerMsg('ACCEPT', newRound, null, null);
            setChatMessages(prev => [...prev, { id: nextId(), role: 'status', text: '✓ 계약 체결!', isSuccess: true }]);

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
            let trigger: DialogueTrigger = 'REJECT';
            if (faOfferSalary < faEntry.walkAwaySalary * 0.65) trigger = 'OFFER_INSULT';
            else if (faOfferSalary < faEntry.walkAwaySalary)    trigger = 'OFFER_LOW';
            addPlayerMsg(trigger, newRound, null, null);
        }
    };

    // ─── Extension Submit ────────────────────────────────────
    const handleExtSubmit = () => {
        if (!negState || negState.walkedAway || negState.signed) return;

        const { response, updatedState } = evaluateExtensionOffer(
            { years: extOfferYears, annualSalary: extOfferSalary, contenderScore },
            negState, tendencySeed,
        );

        setNegState(updatedState);
        setLastExtResponse(response);
        const newRound = updatedState.roundsUsed;

        // GM 오퍼 버블
        addMsg('gm', `${fmtM(extOfferSalary)} / yr · ${extOfferYears}년`, `예상 총액 ${fmtM(extOfferSalary * extOfferYears)}`);

        switch (response.outcome) {
            case 'ACCEPT':
                addPlayerMsg('ACCEPT', newRound, updatedState, null);
                setChatMessages(prev => [...prev, { id: nextId(), role: 'status', text: '✓ 계약 연장!', isSuccess: true }]);
                onExtensionSigned?.(player.id, response.contract);
                break;
            case 'COUNTER':
                addPlayerMsg('COUNTER', newRound, updatedState, `요구: ${fmtM(response.counterAAV)} / ${response.counterYears}년`);
                break;
            case 'REJECT_HARD':
                addPlayerMsg(
                    extOfferSalary < negState.demand.insultThreshold ? 'OFFER_INSULT' : 'OFFER_LOW',
                    newRound, updatedState, null,
                );
                break;
            case 'WALKED_AWAY':
                addPlayerMsg('WALKED_AWAY', newRound, updatedState, null);
                setChatMessages(prev => [...prev, { id: nextId(), role: 'status', text: '협상 결렬', isSuccess: false }]);
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
    const isExtFinal = isExt && !!(negState?.walkedAway || negState?.signed);
    const isFAFinal  = isFA  && !!faResult?.accepted;

    const faIsAboveAsking   = faEntry ? faOfferSalary >= faEntry.askingSalary  : false;
    const faIsBelowWalkaway = faEntry ? faOfferSalary < faEntry.walkAwaySalary : false;

    // 중앙 패널 오퍼 요약 문장 (FM 스타일)
    const offerSummaryText = (() => {
        if (isFA)  return `구단은 ${player.name}에게 ${fmtM(faOfferSalary)} / yr, ${faOfferYears}년 계약을 제안합니다.`;
        if (isExt) return `구단은 ${player.name}의 계약을 ${fmtM(extOfferSalary)} / yr, ${extOfferYears}년 연장 제안합니다.`;
        const modeNames: Record<ReleaseType, string> = { waive: '웨이브', stretch: '스트레치 웨이브', buyout: '바이아웃' };
        return `구단은 ${player.name}을(를) ${modeNames[releaseMode]} 방출 처리합니다.`;
    })();

    const totalContractValue = isFA ? faOfferSalary * faOfferYears : isExt ? extOfferSalary * extOfferYears : 0;

    // ─── Render ──────────────────────────────────────────────
    // absolute inset-0: FAView(relative) 위에만 오버레이 — 사이드바·헤더 노출 유지
    return (
        <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col text-slate-200 animate-in fade-in duration-200">

            {/* ── Header ── */}
            <div className="flex-shrink-0 h-12 px-5 border-b border-slate-800 bg-slate-950 flex items-center gap-3">
                <button
                    onClick={onClose}
                    className="flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-white transition-colors flex-shrink-0"
                >
                    <span>←</span>
                    <span>뒤로</span>
                </button>
                <div className="h-4 w-px bg-slate-700 flex-shrink-0" />
                <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded flex-shrink-0 ${badge.className}`}>
                    {badge.label}
                </span>
                <button
                    onClick={() => onViewPlayer?.(player)}
                    className="ml-2 hover:opacity-80 transition-opacity flex items-center gap-2"
                >
                    <span className="text-sm font-black text-white ko-tight">{player.name}</span>
                    <span className="text-xs font-mono text-slate-500">{player.position} · {player.age}세 · OVR {player.ovr}</span>
                </button>
            </div>

            {/* ── 3-panel Main ── */}
            <div className="flex-1 flex overflow-hidden min-h-0">

                {/* ── 좌측: 선수 정보 ── */}
                <div className="flex-[2] min-w-0 border-r border-slate-800 overflow-y-auto custom-scrollbar p-4 space-y-3">

                    {/* 선수 기본 정보 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <div className="px-3 py-1.5" style={{ backgroundColor: primaryColor }}>
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


                    {/* Extension: 감정 상태 */}
                    {isExt && negState && (
                        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                            <div className="px-3 py-1.5" style={{ backgroundColor: primaryColor }}>
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/80">협상 감정 상태</span>
                            </div>
                            <div className="p-3 space-y-2">
                                {[
                                    { label: '존중감',   value: negState.respect,     color: 'bg-indigo-500' },
                                    { label: '신뢰도',   value: negState.trust,       color: 'bg-emerald-500' },
                                    { label: '불만족도', value: negState.frustration, color: 'bg-red-500' },
                                ].map(({ label, value, color }) => (
                                    <div key={label} className="flex items-center gap-2">
                                        <div className="w-14 text-xs font-bold text-slate-500">{label}</div>
                                        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-500 ${color}`}
                                                style={{ width: `${Math.round(value * 100)}%` }}
                                            />
                                        </div>
                                        <div className="w-7 text-xs font-mono text-right text-slate-500">
                                            {Math.round(value * 100)}
                                        </div>
                                    </div>
                                ))}
                                {negState.lowballCount > 0 && (
                                    <div className="text-xs text-amber-400 font-bold pt-1">
                                        ⚠ 저가 경고 {negState.lowballCount}/3
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Extension: 협상 현황 */}
                    {isExt && negState && (
                        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-1.5">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">협상 현황</div>
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

                    {/* FA: 협상 현황 */}
                    {isFA && faEntry && faRound > 0 && (
                        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-1.5">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">협상 현황</div>
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

                    {/* Release: 데드캡 정보 */}
                    {isRel && releaseMode !== 'waive' && (
                        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-1.5">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">데드캡 정보</div>
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

                {/* ── 중앙: 채팅 패널 ── */}
                <div className="flex-[3] min-w-0 border-r border-slate-800 flex flex-col">

                    {/* 채팅 헤더 */}
                    <div className="flex-shrink-0 p-4 border-b border-slate-800 flex items-center gap-3">
                        <div
                            className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-black text-white"
                            style={{ backgroundColor: accentColor }}
                        >
                            {player.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-white ko-tight">{player.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{player.position} · {player.age}세 · OVR {player.ovr}</div>
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-2">
                            <span className="text-2xl leading-none">{moraleEmoji(moraleScore)}</span>
                            <div className="text-right">
                                <div className={`text-xs font-bold ${moraleTextColor(moraleScore)}`}>{getMoraleLabel(moraleScore)}</div>
                                <div className="text-[10px] font-mono text-slate-500">{Math.round(moraleScore)}</div>
                            </div>
                        </div>
                    </div>

                    {/* 메시지 목록 */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                        {chatMessages.map(msg => {
                            // 상태 배지
                            if (msg.role === 'status') {
                                return (
                                    <div key={msg.id} className="flex justify-center">
                                        <div className={`text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full border ${
                                            msg.isSuccess
                                                ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                                                : 'bg-red-500/20 border-red-500/30 text-red-400'
                                        }`}>{msg.text}</div>
                                    </div>
                                );
                            }

                            // GM 오퍼 버블 (우측 정렬)
                            if (msg.role === 'gm') {
                                return (
                                    <div key={msg.id} className="flex justify-end">
                                        <div className="max-w-[85%] bg-indigo-600/15 border border-indigo-500/25 rounded-2xl rounded-tr-sm px-4 py-3">
                                            <div className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-1">내 오퍼</div>
                                            <div className="text-sm font-mono font-bold text-white">{msg.text}</div>
                                            {msg.subText && (
                                                <div className="text-[10px] text-slate-400 mt-0.5">{msg.subText}</div>
                                            )}
                                        </div>
                                    </div>
                                );
                            }

                            // 선수 대사 버블 (좌측 정렬)
                            return (
                                <div key={msg.id} className="flex items-start gap-2.5 animate-in fade-in slide-in-from-bottom-1 duration-200">
                                    <div
                                        className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-black text-white mt-0.5"
                                        style={{ backgroundColor: accentColor }}
                                    >
                                        {player.name.charAt(0)}
                                    </div>
                                    <div className="max-w-[85%] bg-slate-800 border border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3">
                                        <p className="text-sm text-slate-100 leading-relaxed">&ldquo;{msg.text}&rdquo;</p>
                                        {msg.subText && (
                                            <p className="text-[10px] font-mono text-slate-400 mt-1.5 bg-slate-700/50 rounded px-2 py-1">
                                                {msg.subText}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={chatEndRef} />
                    </div>
                </div>

                {/* ── 우측: 오퍼 폼 ── */}
                <div className="flex-[4] min-w-0 flex flex-col overflow-y-auto custom-scrollbar p-6 gap-5 border-l border-slate-800">

                    {/* FM 스타일 오퍼 요약 카드 */}
                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex-shrink-0">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">현재 제안</div>
                        <p className="text-sm text-slate-200 leading-relaxed">{offerSummaryText}</p>
                        {totalContractValue > 0 && (() => {
                            const offerYears = isFA ? faOfferYears : isExt ? extOfferYears : 0;
                            const offerSalary = isFA ? faOfferSalary : extOfferSalary;
                            return (
                                <div className="mt-3 pt-2.5 border-t border-slate-700/50">
                                    <table className="w-full">
                                        <thead>
                                            <tr>
                                                <th className="text-left text-[10px] font-black uppercase tracking-widest text-slate-500 pb-2">연차</th>
                                                <th className="text-left text-[10px] font-black uppercase tracking-widest text-slate-500 pb-2">시즌</th>
                                                <th className="text-right text-[10px] font-black uppercase tracking-widest text-slate-500 pb-2">캡히트</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Array.from({ length: offerYears }, (_, i) => {
                                                const y = currentSeasonYear + i;
                                                const season = `${y}-${String(y + 1).slice(-2)}`;
                                                return (
                                                    <tr key={i} className="border-t border-slate-800">
                                                        <td className="py-1 text-xs text-slate-500">{i + 1}년차</td>
                                                        <td className="py-1 text-xs font-mono text-slate-400">{season}</td>
                                                        <td className="py-1 text-right text-xs font-mono font-bold text-amber-400">{fmtM(offerSalary)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t border-slate-700">
                                                <td colSpan={2} className="pt-2 text-xs text-slate-400 font-bold">총 계약액</td>
                                                <td className="pt-2 text-right text-sm font-mono font-black text-amber-300">{fmtM(totalContractValue)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            );
                        })()}
                    </div>

                    {/* ── FA 컨트롤 ── */}
                    {isFA && faEntry && !isFAFinal && (
                        <>
                            {/* 계약 슬롯 */}
                            <div className="flex-shrink-0">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">계약 슬롯</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {slots.map(slot => (
                                        <button
                                            key={slot}
                                            onClick={() => {
                                                setSelectedSlot(slot);
                                                const newMax = slotMaxMap[slot] ?? vetMin;
                                                setFaOfferSalary(prev => Math.min(prev, newMax));
                                                setFaOfferYears(prev => Math.min(prev, SLOT_MAX_YEARS[slot] ?? 4));
                                            }}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                                selectedSlot === slot
                                                    ? 'border-indigo-500 bg-indigo-500/20 text-white'
                                                    : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
                                            }`}
                                        >
                                            {SLOT_LABELS[slot]}
                                        </button>
                                    ))}
                                    {slots.length === 0 && (
                                        <div className="text-xs text-slate-500 py-1">사용 가능한 슬롯 없음</div>
                                    )}
                                </div>
                            </div>

                            {/* 제시 연봉 인풋 */}
                            <div className="flex-shrink-0 space-y-1.5">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">제시 연봉 / yr</div>
                                <div className="relative flex items-center">
                                    <span className="absolute left-3 text-sm font-mono font-bold text-slate-400 pointer-events-none">$</span>
                                    <input
                                        type="number"
                                        min={vetMin}
                                        max={Math.max(currentSlotMax, faEntry.askingSalary)}
                                        step={100_000}
                                        value={faOfferSalary}
                                        onChange={e => {
                                            const v = parseInt(e.target.value) || 0;
                                            const max = Math.max(currentSlotMax, faEntry.askingSalary);
                                            setFaOfferSalary(Math.max(vetMin, Math.min(v, max)));
                                        }}
                                        disabled={selectedSlot === 'vet_min'}
                                        className={`w-full bg-slate-800 border rounded-lg pl-7 py-2.5 text-sm font-mono font-bold text-white focus:outline-none disabled:opacity-50 transition-colors ${
                                            faIsAboveAsking
                                                ? 'border-emerald-500/60 focus:border-emerald-400'
                                                : faIsBelowWalkaway
                                                ? 'border-red-500/60 focus:border-red-400'
                                                : 'border-slate-700 focus:border-indigo-500'
                                        }`}
                                    />
                                </div>
                                <div className="flex justify-between text-[10px] font-mono text-slate-500">
                                    <span>최소 {fmtM(vetMin)}</span>
                                    <span className="text-amber-500">요구 {fmtM(faEntry.askingSalary)}</span>
                                    <span>최대 {fmtM(Math.max(currentSlotMax, faEntry.askingSalary))}</span>
                                </div>
                                <div className="text-[10px] text-center">
                                    {faIsAboveAsking
                                        ? <span className="text-emerald-400">✓ 요구 이상 — 높은 수락 확률</span>
                                        : faIsBelowWalkaway
                                        ? <span className="text-red-400">✗ 최저선 미달 — 거절 확정</span>
                                        : <span className="text-slate-500">협상 구간</span>
                                    }
                                </div>
                            </div>

                            {/* 계약 연수 */}
                            <div className="flex-shrink-0 space-y-2">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">계약 연수</div>
                                <select
                                    value={faOfferYears}
                                    onChange={e => setFaOfferYears(Number(e.target.value))}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono font-bold text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                                >
                                    {Array.from({ length: faMaxYears }, (_, i) => i + 1).map(y => (
                                        <option key={y} value={y}>{y}년</option>
                                    ))}
                                </select>
                            </div>

                            {/* 거절 사유 */}
                            {faResult && !faResult.accepted && (
                                <div className="flex-shrink-0 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-xs text-red-400">
                                    {faResult.reason ?? '거절됨 — 조건을 수정해 재협상하세요.'}
                                </div>
                            )}

                            {/* 제출 버튼 */}
                            <div className="flex-shrink-0 flex gap-3 mt-auto pt-2">
                                {faResult && !faResult.accepted && (
                                    <button
                                        onClick={() => setFaResult(null)}
                                        className="flex-1 py-3 rounded-xl text-sm font-bold bg-slate-700 hover:bg-slate-600 text-slate-200 transition-all"
                                    >재협상</button>
                                )}
                                <button
                                    onClick={handleFASubmit}
                                    disabled={slots.length === 0 || faIsBelowWalkaway}
                                    className="flex-1 py-3 rounded-xl font-black uppercase tracking-wide text-sm transition-all
                                        bg-indigo-600 hover:bg-indigo-500 text-white
                                        disabled:opacity-40 disabled:cursor-not-allowed"
                                >오퍼 제출</button>
                            </div>
                        </>
                    )}

                    {/* FA 완료 */}
                    {isFAFinal && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-5">
                            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/50 flex items-center justify-center">
                                <span className="text-3xl text-emerald-400">✓</span>
                            </div>
                            <div className="text-2xl font-black text-emerald-400 uppercase tracking-wide">계약 체결!</div>
                            <button
                                onClick={onClose}
                                className="px-10 py-3 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-all"
                            >완료</button>
                        </div>
                    )}

                    {/* ── Extension 컨트롤 ── */}
                    {isExt && negState && !isExtFinal && (
                        <>
                            {/* 제시 연봉 인풋 */}
                            <div className="flex-shrink-0 space-y-1.5">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">제시 연봉 / yr</div>
                                <div className="relative flex items-center">
                                    <span className="absolute left-3 text-sm font-mono font-bold text-slate-400 pointer-events-none">$</span>
                                    <input
                                        type="number"
                                        min={Math.round(negState.demand.insultThreshold * 0.9)}
                                        max={Math.round(negState.demand.openingAsk * 1.3)}
                                        step={100_000}
                                        value={extOfferSalary}
                                        onChange={e => {
                                            const v = parseInt(e.target.value) || 0;
                                            const min = Math.round(negState.demand.insultThreshold * 0.9);
                                            const max = Math.round(negState.demand.openingAsk * 1.3);
                                            setExtOfferSalary(Math.max(min, Math.min(v, max)));
                                        }}
                                        className={`w-full bg-slate-800 border rounded-lg pl-7 py-2.5 text-sm font-mono font-bold text-white focus:outline-none transition-colors ${
                                            extOfferSalary >= negState.demand.targetAAV
                                                ? 'border-emerald-500/60 focus:border-emerald-400'
                                                : extOfferSalary < negState.demand.insultThreshold
                                                ? 'border-red-600/60 focus:border-red-500'
                                                : extOfferSalary < negState.demand.reservationFloor
                                                ? 'border-red-500/60 focus:border-red-400'
                                                : 'border-slate-700 focus:border-violet-500'
                                        }`}
                                    />
                                </div>
                                <div className="flex justify-between text-[10px] font-mono text-slate-500">
                                    <span>최소 {fmtM(Math.round(negState.demand.insultThreshold * 0.9))}</span>
                                    <span className="text-amber-500">요구 {fmtM(negState.currentCounterAAV)}</span>
                                    <span>최대 {fmtM(Math.round(negState.demand.openingAsk * 1.3))}</span>
                                </div>
                                <div className="text-[10px] text-center">
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

                            {/* 계약 연수 */}
                            <div className="flex-shrink-0 space-y-2">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">계약 연수</div>
                                <select
                                    value={extOfferYears}
                                    onChange={e => setExtOfferYears(Number(e.target.value))}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono font-bold text-white focus:outline-none focus:border-violet-500 cursor-pointer"
                                >
                                    {[1, 2, 3, 4].map(y => (
                                        <option key={y} value={y}>{y}년</option>
                                    ))}
                                </select>
                            </div>

                            {/* 카운터 배너 */}
                            {lastExtResponse?.outcome === 'COUNTER' && (
                                <div className="flex-shrink-0 bg-violet-500/10 border border-violet-500/30 rounded-xl px-4 py-3 text-xs text-violet-300">
                                    카운터 오퍼: {fmtM(lastExtResponse.counterAAV)} / yr · {lastExtResponse.counterYears}년 — 가운데 채팅 확인
                                </div>
                            )}

                            {/* 제출 버튼 */}
                            <div className="flex-shrink-0 mt-auto pt-2">
                                <button
                                    onClick={handleExtSubmit}
                                    className="w-full py-3 rounded-xl font-black uppercase tracking-wide text-sm transition-all
                                        bg-violet-600 hover:bg-violet-500 text-white"
                                >오퍼 제출</button>
                            </div>
                        </>
                    )}

                    {/* Extension 최종 상태 */}
                    {isExtFinal && negState && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-5">
                            <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
                                negState.signed
                                    ? 'bg-emerald-500/20 border-2 border-emerald-500/50'
                                    : 'bg-red-500/20 border-2 border-red-500/50'
                            }`}>
                                <span className={`text-3xl ${negState.signed ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {negState.signed ? '✓' : '✗'}
                                </span>
                            </div>
                            <div className={`text-2xl font-black uppercase tracking-wide ${negState.signed ? 'text-emerald-400' : 'text-red-400'}`}>
                                {negState.signed ? '계약 연장!' : '협상 결렬'}
                            </div>
                            <button
                                onClick={onClose}
                                className={`px-10 py-3 rounded-xl font-bold text-sm transition-all ${
                                    negState.signed
                                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                        : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                                }`}
                            >{negState.signed ? '완료' : '닫기'}</button>
                        </div>
                    )}

                    {/* ── Release 컨트롤 ── */}
                    {isRel && (
                        <>
                            {/* 방출 방식 */}
                            <div className="flex-shrink-0 space-y-2">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">방출 방식</div>
                                <div className="grid grid-cols-3 gap-2">
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
                                                className={`p-3 rounded-xl border transition-all text-left ${
                                                    isDisabled
                                                        ? 'opacity-30 cursor-not-allowed border-slate-700 bg-transparent'
                                                        : isSelected
                                                        ? 'border-red-500/60 bg-red-500/10 text-white'
                                                        : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:border-slate-600'
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
                                <div className="flex-shrink-0 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">제시 금액</div>
                                        <div className={`text-lg font-mono font-black ${buyoutAccepted ? 'text-emerald-400' : 'text-red-400'}`}>
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
                                    <div className="flex justify-between text-[10px] font-mono text-slate-500">
                                        <span>최소 {fmtM(minBuyoutAmount)} ({minBuyoutPct}%)</span>
                                        <span>전액 {fmtM(totalRemaining)}</span>
                                    </div>
                                </div>
                            )}

                            {/* 데드캡 확인 + 방출 버튼 */}
                            <div className="flex-shrink-0 mt-auto pt-2 space-y-3">
                                <div className="bg-slate-800 rounded-xl px-5 py-3 flex items-center justify-between">
                                    <span className="text-sm text-slate-400">
                                        {releaseMode === 'stretch' ? '연간 데드캡' : '이번 시즌 데드캡'}
                                    </span>
                                    <span className="text-lg font-mono font-black text-red-400">
                                        {releaseMode === 'waive'   ? fmtM(totalRemaining)  :
                                         releaseMode === 'stretch' ? fmtM(stretchAnnual)   :
                                         fmtM(buyoutAmount)}
                                    </span>
                                </div>
                                <button
                                    disabled={releaseMode === 'buyout' && !buyoutAccepted}
                                    onClick={handleReleaseConfirm}
                                    className="w-full py-3 rounded-xl font-black uppercase tracking-wide text-sm transition-all
                                        bg-red-600 hover:bg-red-500 text-white
                                        disabled:opacity-40 disabled:cursor-not-allowed"
                                >방출 확정</button>
                            </div>
                        </>
                    )}
                </div>

            </div>
        </div>
    );
};
