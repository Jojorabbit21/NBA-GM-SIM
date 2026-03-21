/**
 * NegotiationScreen — FA 시장 바디 위 오버레이 (FM26 스타일)
 * 3패널: 좌(선수정보+감정) | 중(채팅) | 우(오퍼폼)  —  비율 2:5:3
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
    generateDemandSubText,
    type NegotiationType,
    type DialogueTrigger,
    type DialogueContext,
} from '../services/fa/negotiationDialogue';
import { TEAM_DATA } from '../data/teamData';
import type { Team } from '../types/team';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ContractData {
    salaries: number[];
    aav: number;
    total: number;
}

interface ChatMsg {
    id: number;
    role: 'player' | 'gm' | 'status';
    text: string;
    subText?: string;
    isSuccess?: boolean;
    contractData?: ContractData;
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
    extensionNotYet?: boolean; // 잔여 계약 > 1년 → 선수가 연장 거절, 협상 불가
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

// NBA CBA 슬롯별 연봉 에스컬레이터 (Bird권: 8%, 기타: 5%, vet_min: 0%)
// GM 오퍼 제출 시 대화체 문장 풀
const GM_OFFER_PHRASES = [
    '이 조건으로 함께하면 좋겠습니다.',
    '저희 팀에 꼭 필요한 선수입니다.',
    '성의껏 준비한 조건입니다. 검토해주세요.',
    '좋은 계약이 될 거라 믿습니다.',
    '함께 멋진 시즌을 만들어봅시다.',
    '최선을 다해 준비했습니다.',
    '진지하게 고려해주셨으면 합니다.',
    '우리 팀의 미래를 같이 만들어나갔으면 합니다.',
];

const SLOT_ESCALATOR: Record<SigningType, number> = {
    bird_full: 0.08, bird_early: 0.08, bird_non: 0.05,
    cap_space: 0.05, non_tax_mle: 0.05, tax_mle: 0.05, vet_min: 0.00,
};

/** 연차별 연봉: i=0 → 기준연봉 그대로, i>0 → base × (1+rate)^i */
function getYearlySalary(baseSalary: number, rate: number, yearIndex: number): number {
    return Math.round(baseSalary * Math.pow(1 + rate, yearIndex));
}

/** 에스컬레이터 적용된 연봉 배열 생성 */
function generateEscalatedSalaries(base: number, rate: number, years: number): number[] {
    return Array.from({ length: years }, (_, i) => getYearlySalary(base, rate, i));
}

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
    extensionNotYet = false,
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
    const [extOfferSalaries, setExtOfferSalaries] = useState<number[]>(() => {
        const base  = negState?.demand.openingAsk ?? 0;
        const years = negState?.demand.askingYears ?? 2;
        return generateEscalatedSalaries(base, 0.08, years);
    });
    const [extOfferYears, setExtOfferYears] = useState(() => negState?.demand.askingYears ?? 2);
    const [lastExtResponse, setLastExtResponse] = useState<NegotiationResponse | null>(null);

    // ─── Contract Options State ───────────────────────────────
    const [faContractOption,  setFaContractOption]  = useState<'none' | 'player' | 'team'>('none');
    const [faNoTrade,         setFaNoTrade]          = useState(false);
    const [faTradeKicker,     setFaTradeKicker]      = useState(0); // 0 | 0.05 | 0.10 | 0.15
    const [extContractOption, setExtContractOption]  = useState<'none' | 'player' | 'team'>('none');
    const [extNoTrade,        setExtNoTrade]         = useState(false);
    const [extTradeKicker,    setExtTradeKicker]     = useState(0);

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
    const [faOfferSalaries, setFaOfferSalaries] = useState<number[]>(() => {
        const base     = faEntry?.askingSalary ?? 0;
        const years    = faEntry?.askingYears  ?? 2;
        const initRate = SLOT_ESCALATOR[slots[0] ?? 'vet_min'] ?? 0.05;
        return generateEscalatedSalaries(base, initRate, years);
    });
    const [faOfferYears, setFaOfferYears] = useState(() => faEntry?.askingYears ?? 2);
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

    const faEscalateRate  = SLOT_ESCALATOR[selectedSlot] ?? 0.05;
    const extEscalateRate = 0.08; // Extension은 항상 8%

    // 연봉 배열 파생값
    const faOfferSalary  = faOfferSalaries[0]  ?? 0;  // year 1 (계약 기준 저장에 사용)
    const extOfferSalary = extOfferSalaries[0] ?? 0;  // year 1
    const faOfferAAV     = faOfferSalaries.length  > 0 ? Math.round(faOfferSalaries.reduce((a, b)  => a + b, 0) / faOfferSalaries.length)  : 0;
    const extOfferAAV    = extOfferSalaries.length > 0 ? Math.round(extOfferSalaries.reduce((a, b) => a + b, 0) / extOfferSalaries.length) : 0;
    const faIsDecliningSalary  = faOfferSalaries.some((s, i)  => i > 0 && s < faOfferSalaries[i - 1]);
    const extIsDecliningSalary = extOfferSalaries.some((s, i) => i > 0 && s < extOfferSalaries[i - 1]);

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
    const addMsg = (role: ChatMsg['role'], text: string, subText?: string, isSuccess?: boolean, contractData?: ContractData) => {
        setChatMessages(prev => [...prev, { id: nextId(), role, text, subText, isSuccess, contractData }]);
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
        const trigger: DialogueTrigger = extensionNotYet ? 'EXT_NOT_YET' : isRel ? 'RELEASE_PROPOSE' : 'GREETING';
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
        const greetingSub = !extensionNotYet && isExt && negState
            ? generateDemandSubText('extension', negState.demand.openingAsk, negState.demand.askingYears, `${tendencySeed}:${player.id}`)
            : !extensionNotYet && isFA && faEntry
            ? generateDemandSubText('fa', faEntry.askingSalary, faEntry.askingYears, `${tendencySeed}:${player.id}`)
            : undefined;
        setChatMessages([{ id: nextId(), role: 'player', text: d, subText: greetingSub }]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── FA Submit ───────────────────────────────────────────
    const handleFASubmit = () => {
        if (!faEntry || !faMarket || faResult?.accepted) return;

        const newRound = faRound + 1;
        setFaRound(newRound);

        // 하향식 계약 사전 검증 (충성도 높고 재정적 야망 낮아야 고려)
        if (faIsDecliningSalary) {
            const loyalty  = tendencies.loyalty ?? 0.5;
            const financial = tendencies.financialAmbition ?? 0.5;
            if (loyalty - financial < 0.1) {
                setFaRound(newRound);
                setFaResult({ accepted: false, reason: '하향식 계약은 충성도가 높고 재정적 야망이 낮은 선수만 고려합니다.' });
                addPlayerMsg('REJECT', newRound, null, null);
                return;
            }
        }

        // GM 오퍼 버블
        const faPhrase = GM_OFFER_PHRASES[(newRound - 1) % GM_OFFER_PHRASES.length];
        addMsg('gm', faPhrase, undefined, undefined, { salaries: [...faOfferSalaries], aav: faOfferAAV, total: totalContractValue });

        const result = processUserOffer(
            faMarket, myTeam, player, faEntry.prevTeamId,
            {
                salary: faOfferAAV, years: faOfferYears, signingType: selectedSlot,
                option:      faContractOption !== 'none' && faOfferYears >= 2
                    ? { type: faContractOption as 'player' | 'team', year: faOfferYears - 1 }
                    : undefined,
                noTrade:     faNoTrade && selectedSlot === 'bird_full' ? true : undefined,
                tradeKicker: faTradeKicker > 0 && selectedSlot !== 'vet_min' ? faTradeKicker : undefined,
            },
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
            if (faOfferAAV < faEntry.walkAwaySalary * 0.65) trigger = 'OFFER_INSULT';
            else if (faOfferAAV < faEntry.walkAwaySalary)    trigger = 'OFFER_LOW';
            addPlayerMsg(trigger, newRound, null, null);
        }
    };

    // ─── Extension Submit ────────────────────────────────────
    const handleExtSubmit = () => {
        if (!negState || negState.walkedAway || negState.signed) return;

        // 하향식 계약 사전 검증
        if (extIsDecliningSalary) {
            const loyalty  = tendencies.loyalty ?? 0.5;
            const financial = tendencies.financialAmbition ?? 0.5;
            if (loyalty - financial < 0.1) {
                addPlayerMsg('REJECT', negState.roundsUsed + 1, negState, null);
                return;
            }
        }

        const { response, updatedState } = evaluateExtensionOffer(
            {
                years: extOfferYears, annualSalary: extOfferAAV, contenderScore,
                option:      extContractOption !== 'none' && extOfferYears >= 2
                    ? { type: extContractOption as 'player' | 'team', year: extOfferYears - 1 }
                    : undefined,
                noTrade:     extNoTrade ? true : undefined,
                tradeKicker: extTradeKicker > 0 ? extTradeKicker : undefined,
            },
            negState, tendencySeed,
        );

        setNegState(updatedState);
        setLastExtResponse(response);
        const newRound = updatedState.roundsUsed;

        // GM 오퍼 버블
        const extPhrase = GM_OFFER_PHRASES[(newRound - 1) % GM_OFFER_PHRASES.length];
        addMsg('gm', extPhrase, undefined, undefined, { salaries: [...extOfferSalaries], aav: extOfferAAV, total: totalContractValue });

        switch (response.outcome) {
            case 'ACCEPT':
                addPlayerMsg('ACCEPT', newRound, updatedState, null);
                setChatMessages(prev => [...prev, { id: nextId(), role: 'status', text: '✓ 계약 연장!', isSuccess: true }]);
                onExtensionSigned?.(player.id, response.contract);
                break;
            case 'COUNTER':
                addPlayerMsg('COUNTER', newRound, updatedState, `${response.counterYears}년 계약에 연 ${fmtM(response.counterAAV)} 정도면 사인할 수 있어요.`);
                break;
            case 'REJECT_HARD':
                addPlayerMsg(
                    extOfferAAV < negState.demand.insultThreshold ? 'OFFER_INSULT' : 'OFFER_LOW',
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
    const isExtFinal = isExt && !!(negState?.walkedAway || negState?.signed || extensionNotYet);
    const isFAFinal  = isFA  && !!faResult?.accepted;

    const faIsAboveAsking   = faEntry ? faOfferAAV >= faEntry.askingSalary  : false;
    const faIsBelowWalkaway = faEntry ? faOfferAAV < faEntry.walkAwaySalary : false;

    // 중앙 패널 오퍼 요약 문장 (FM 스타일)
    const offerSummaryText = (() => {
        if (isFA)  return `구단은 ${player.name}에게 AAV ${fmtM(faOfferAAV)}, ${faOfferYears}년 계약을 제안합니다.`;
        if (isExt) return `구단은 ${player.name}의 계약을 AAV ${fmtM(extOfferAAV)}, ${extOfferYears}년 연장 제안합니다.`;
        const modeNames: Record<ReleaseType, string> = { waive: '웨이브', stretch: '스트레치 웨이브', buyout: '바이아웃' };
        return `구단은 ${player.name}을(를) ${modeNames[releaseMode]} 방출 처리합니다.`;
    })();

    const totalContractValue = isFA
        ? faOfferSalaries.reduce((a, b) => a + b, 0)
        : isExt
        ? extOfferSalaries.reduce((a, b) => a + b, 0)
        : 0;

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
            <div className="flex-1 flex overflow-hidden min-h-0 p-3 gap-3">

                {/* ── 좌측: 선수 정보 ── */}
                <div className="flex-[2] min-w-0 rounded-2xl border border-slate-800 bg-slate-900/40 flex flex-col overflow-hidden">

                    {/* 위젯 헤더 */}
                    <div className="flex-shrink-0 px-4 py-2.5 border-b border-slate-800 bg-slate-800/50">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">선수 정보</span>
                    </div>

                    {/* 스크롤 영역 */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">

                        {/* 기본 정보 */}
                        <div className="px-4 py-3 space-y-1.5">
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">현재 연봉</span>
                                <span className="font-mono font-bold text-amber-400">{fmtM(player.salary ?? 0)} / yr</span>
                            </div>
                            {isExt && negState && (
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">잔여 계약</span>
                                    <span className="font-mono text-slate-300">{player.contractYears}년</span>
                                </div>
                            )}
                            {isFA && faEntry && (
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">관심 팀</span>
                                    <span className="font-mono text-slate-300">{faEntry.interestedTeamIds.length}팀</span>
                                </div>
                            )}
                            {isRel && (
                                <>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500">잔여 연수</span>
                                        <span className="font-mono text-slate-300">{remainingYears}년</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500">잔여 총액</span>
                                        <span className="font-mono font-bold text-amber-400">{fmtM(totalRemaining)}</span>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* 직전 계약 */}
                        {player.contract && (
                            <>
                                <div className="border-t border-slate-800" />
                                <div className="px-4 py-3">
                                    <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-2">직전 계약</div>
                                    <div className="space-y-1">
                                        {player.contract.years.map((sal, i) => {
                                            const isCurrent   = i === player.contract!.currentYear;
                                            const isCompleted = i <  player.contract!.currentYear;
                                            const opt = player.contract!.option;
                                            const isOptionYear = opt && opt.year === i;
                                            return (
                                                <div key={i} className={`flex justify-between items-center text-xs ${isCompleted ? 'opacity-35' : ''}`}>
                                                    <span className="text-slate-500 shrink-0">
                                                        {i + 1}년차
                                                        {isCurrent && <span className="ml-1 text-[9px] font-black text-indigo-400">현재</span>}
                                                        {isOptionYear && <span className="ml-1 text-[9px] text-slate-600">{opt!.type === 'player' ? '선수옵션' : '팀옵션'}</span>}
                                                    </span>
                                                    <span className="font-mono font-bold text-slate-200">{fmtM(sal)}</span>
                                                </div>
                                            );
                                        })}
                                        <div className="border-t border-slate-700/60 my-1" />
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-slate-500">총액</span>
                                            <span className="font-mono font-black text-amber-300">{fmtM(player.contract.years.reduce((a, b) => a + b, 0))}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-slate-500">유형</span>
                                            <span className="font-mono text-slate-400 flex items-center gap-1">
                                                {{ rookie: '루키', veteran: '베테랑', max: '맥스', min: '미니멈', extension: '연장' }[player.contract.type]}
                                                {player.contract.noTrade && <span className="text-[9px] font-black text-amber-400">NTC</span>}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* 감정 상태 (Extension only) */}
                        {isExt && negState && (
                            <>
                                <div className="border-t border-slate-800" />
                                <div className="px-4 py-3 space-y-2">
                                    <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-1">협상 감정</div>
                                    {[
                                        { label: '존중감',   value: negState.respect,     color: 'bg-indigo-500' },
                                        { label: '신뢰도',   value: negState.trust,       color: 'bg-emerald-500' },
                                        { label: '불만족도', value: negState.frustration, color: 'bg-red-500' },
                                    ].map(({ label, value, color }) => (
                                        <div key={label} className="flex items-center gap-2">
                                            <div className="w-14 text-xs text-slate-500 shrink-0">{label}</div>
                                            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.round(value * 100)}%` }} />
                                            </div>
                                            <div className="w-6 text-xs font-mono text-right text-slate-500">{Math.round(value * 100)}</div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {/* Release: 데드캡 정보 */}
                        {isRel && releaseMode !== 'waive' && (
                            <>
                                <div className="border-t border-slate-800" />
                                <div className="px-4 py-3 space-y-1.5">
                                    <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-2">데드캡 정보</div>
                                    {releaseMode === 'stretch' && (
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-slate-500">연간 데드캡</span>
                                            <span className="font-mono text-slate-300">{fmtM(stretchAnnual)} × {stretchYearsTotal}년</span>
                                        </div>
                                    )}
                                    {releaseMode === 'buyout' && (
                                        <>
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-slate-500">최소 요구액</span>
                                                <span className="font-mono text-red-400">{fmtM(minBuyoutAmount)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-slate-500">제시 금액</span>
                                                <span className={`font-mono font-bold ${buyoutAccepted ? 'text-emerald-400' : 'text-red-400'}`}>{fmtM(buyoutAmount)}</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* ── 중앙: 채팅 패널 ── */}
                <div className="flex-[5] min-w-0 rounded-2xl border border-slate-800 bg-slate-900/40 flex flex-col overflow-hidden">

                    {/* 채팅 헤더 */}
                    <div className="flex-shrink-0 p-4 border-b border-slate-800 bg-slate-800/50 flex items-center gap-3">
                        <div
                            className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-black text-white"
                            style={{ backgroundColor: accentColor }}
                        >
                            {player.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-white ko-tight">{player.name}</div>
                            <div className="text-xs text-slate-500 font-mono">{player.position} · {player.age}세</div>
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-2">
                            <span className="text-2xl leading-none">{moraleEmoji(moraleScore)}</span>
                            <div className={`text-base font-bold ${moraleTextColor(moraleScore)}`}>{getMoraleLabel(moraleScore)}</div>
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

                            // GM 오퍼 버블 (우측 정렬, 대화체)
                            if (msg.role === 'gm') {
                                const cd = msg.contractData;
                                return (
                                    <div key={msg.id} className="flex flex-col items-end gap-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
                                        <span className="text-xs font-bold text-indigo-400 px-1">GM</span>
                                        <div className="max-w-[85%] bg-indigo-600/20 border border-indigo-500/30 rounded-2xl rounded-br-sm px-4 py-3">
                                            <p className="text-sm text-white leading-relaxed">{msg.text}</p>
                                            {cd && (
                                                <table className="mt-2.5 w-full text-[11px] font-mono border-collapse">
                                                    <tbody>
                                                        {cd.salaries.map((sal, i) => (
                                                            <tr key={i}>
                                                                <td className="text-slate-500 pr-4 py-0.5">{i + 1}년차</td>
                                                                <td className="text-right text-slate-200">{fmtM(sal)}</td>
                                                            </tr>
                                                        ))}
                                                        <tr>
                                                            <td colSpan={2}><div className="border-t border-indigo-500/30 my-1" /></td>
                                                        </tr>
                                                        <tr>
                                                            <td className="text-slate-500 pr-4 py-0.5">AAV</td>
                                                            <td className="text-right text-indigo-300">{fmtM(cd.aav)}</td>
                                                        </tr>
                                                        <tr>
                                                            <td className="text-slate-500 pr-4 py-0.5">총액</td>
                                                            <td className="text-right font-black text-amber-300">{fmtM(cd.total)}</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    </div>
                                );
                            }

                            // 선수 대사 버블 (좌측 정렬)
                            return (
                                <div key={msg.id} className="flex flex-col items-start gap-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
                                    <span className="text-xs font-bold text-slate-400 px-1">{player.name}</span>
                                    <div className="max-w-[85%] bg-slate-800 border border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3">
                                        <p className="text-sm text-slate-100 leading-relaxed">&ldquo;{msg.text}&rdquo;</p>
                                        {msg.subText && (
                                            <p className="text-sm text-slate-100 leading-relaxed mt-1">&ldquo;{msg.subText}&rdquo;</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={chatEndRef} />
                    </div>
                </div>

                {/* ── 우측: 오퍼 폼 ── */}
                <div className="flex-[3] min-w-0 flex flex-col overflow-y-auto custom-scrollbar p-6 gap-5 rounded-2xl border border-slate-800 bg-slate-900/40">

                    {/* ── FA 컨트롤 ── */}
                    {isFA && faEntry && !isFAFinal && (
                        <>
                            {/* 계약 슬롯 */}
                            <div className="flex-shrink-0">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">계약 슬롯</div>
                                <div className="flex flex-wrap gap-1.5">
                                    {slots.map(slot => (
                                        <button
                                            key={slot}
                                            onClick={() => {
                                                setSelectedSlot(slot);
                                                const newMax  = slotMaxMap[slot] ?? vetMin;
                                                const newRate = SLOT_ESCALATOR[slot] ?? 0.05;
                                                const newMaxYears = SLOT_MAX_YEARS[slot] ?? 4;
                                                const clampedYears = Math.min(faOfferYears, newMaxYears);
                                                const clampedBase  = Math.min(faOfferSalaries[0] ?? 0, newMax);
                                                setFaOfferYears(clampedYears);
                                                setFaOfferSalaries(generateEscalatedSalaries(clampedBase, newRate, clampedYears));
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

                            {/* 계약 연수 */}
                            <div className="flex-shrink-0 space-y-1.5">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">계약 연수</div>
                                <select
                                    value={faOfferYears}
                                    onChange={e => {
                                        const y = Number(e.target.value);
                                        setFaOfferYears(y);
                                        setFaOfferSalaries(generateEscalatedSalaries(faOfferSalaries[0] ?? (faEntry.askingSalary), faEscalateRate, y));
                                    }}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-3 pr-8 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                                >
                                    {Array.from({ length: faMaxYears }, (_, i) => i + 1).map(y => (
                                        <option key={y} value={y}>{y}년</option>
                                    ))}
                                </select>
                            </div>

                            {/* 연차별 연봉 입력 테이블 */}
                            <div className="flex-shrink-0 space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">연차별 연봉</div>
                                    <div className="text-[10px] font-mono text-slate-500">AAV <span className="text-amber-400">{fmtM(faOfferAAV)}</span></div>
                                </div>
                                {faIsDecliningSalary && (
                                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-[10px] text-amber-400">
                                        ↘ 하향식 계약 — 충성도 ↑ · 재정적 야망 ↓ 선수만 수락
                                    </div>
                                )}
                                <table className="w-full">
                                    <tbody>
                                        {faOfferSalaries.map((sal, i) => {
                                            const y = currentSeasonYear + i;
                                            const season = `${y}-${String(y + 1).slice(-2)}`;
                                            const isDeclineYear = i > 0 && sal < faOfferSalaries[i - 1];
                                            return (
                                                <tr key={i}>
                                                    <td className="pr-1.5 py-0.5 text-[10px] text-slate-500 whitespace-nowrap w-8">{i + 1}년차</td>
                                                    <td className="pr-1.5 py-0.5 text-[10px] font-mono text-slate-500 w-12">{season}</td>
                                                    <td className="py-0.5">
                                                        <div className="flex items-center gap-1">
                                                            <div className="relative w-24 flex-shrink-0">
                                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-500 pointer-events-none">$</span>
                                                                <input
                                                                    type="number"
                                                                    step={100_000}
                                                                    min={vetMin}
                                                                    max={Math.max(currentSlotMax, faEntry.askingSalary)}
                                                                    disabled={selectedSlot === 'vet_min'}
                                                                    value={sal}
                                                                    onChange={e => {
                                                                        const v = parseInt(e.target.value) || 0;
                                                                        const max = Math.max(currentSlotMax, faEntry.askingSalary);
                                                                        const clamped = Math.max(vetMin, Math.min(v, max));
                                                                        if (i === 0) {
                                                                            setFaOfferSalaries(generateEscalatedSalaries(clamped, faEscalateRate, faOfferYears));
                                                                        } else {
                                                                            const next = [...faOfferSalaries];
                                                                            next[i] = clamped;
                                                                            setFaOfferSalaries(next);
                                                                        }
                                                                    }}
                                                                    className={`w-full bg-slate-800 border rounded pl-5 pr-1 py-1 text-[10px] font-mono font-bold text-white focus:outline-none disabled:opacity-40 transition-colors ${
                                                                        isDeclineYear
                                                                            ? 'border-amber-500/60 focus:border-amber-400'
                                                                            : 'border-slate-700 focus:border-indigo-500'
                                                                    }`}
                                                                />
                                                            </div>
                                                            {[-5_000_000, -1_000_000, 1_000_000, 5_000_000].map(delta => (
                                                                <button
                                                                    key={delta}
                                                                    disabled={selectedSlot === 'vet_min'}
                                                                    onClick={() => {
                                                                        const max = Math.max(currentSlotMax, faEntry.askingSalary);
                                                                        const newVal = Math.max(vetMin, Math.min(sal + delta, max));
                                                                        if (i === 0) {
                                                                            setFaOfferSalaries(generateEscalatedSalaries(newVal, faEscalateRate, faOfferYears));
                                                                        } else {
                                                                            const next = [...faOfferSalaries];
                                                                            next[i] = newVal;
                                                                            setFaOfferSalaries(next);
                                                                        }
                                                                    }}
                                                                    className="text-[9px] font-mono font-bold px-1 py-1 rounded bg-slate-800 border border-slate-700/60 hover:bg-slate-700 hover:border-slate-600 text-slate-400 hover:text-slate-200 transition-colors flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                                                                >
                                                                    {delta < 0 ? `${delta / 1_000_000}M` : `+${delta / 1_000_000}M`}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t border-slate-700/60">
                                            <td colSpan={2} className="pt-3 pb-0.5 text-xs text-slate-400 font-bold">총 계약액</td>
                                            <td className="pt-3 pb-0.5 text-right text-xs font-mono font-black text-amber-300">{fmtM(totalContractValue)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                                <div className="text-[10px] text-center pt-1">
                                    {faIsAboveAsking
                                        ? <span className="text-emerald-400">✓ 요구 이상 — 높은 수락 확률</span>
                                        : faIsBelowWalkaway
                                        ? <span className="text-red-400">✗ 최저선 미달 — 거절 확정</span>
                                        : <span className="text-slate-500">협상 구간 · 요구 {fmtM(faEntry.askingSalary)}</span>
                                    }
                                </div>
                            </div>

                            {/* ── 계약 조건 옵션 ── */}
                            <div className="flex-shrink-0 space-y-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">계약 조건</div>
                                {/* 계약 옵션 (2년 이상 시) */}
                                {faOfferYears >= 2 && (
                                    <div className="space-y-0.5">
                                        <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-1">계약 옵션</div>
                                        {(['none', 'team', 'player'] as const).map(opt => {
                                            const label = opt === 'none' ? '없음' : opt === 'team' ? '팀 옵션' : '선수 옵션';
                                            const sub = opt === 'team' ? '마지막 해 팀이 결정' : opt === 'player' ? '마지막 해 선수가 결정' : '';
                                            const active = faContractOption === opt;
                                            return (
                                                <label key={opt} className="flex items-center gap-2 py-0.5 cursor-pointer group">
                                                    <input type="radio" checked={active} onChange={() => setFaContractOption(opt)}
                                                        className="w-3 h-3 cursor-pointer appearance-none rounded-full border-2 border-slate-600 bg-slate-950 checked:border-blue-500 checked:bg-blue-500 checked:shadow-[inset_0_0_0_2px_rgb(2,6,23)] transition-colors flex-shrink-0" />
                                                    <span className={`text-xs transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>{label}</span>
                                                    {sub && <span className="text-[10px] text-slate-500">{sub}</span>}
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                                {/* 트레이드 키커 (vet_min 제외) */}
                                {selectedSlot !== 'vet_min' && (
                                    <div className="space-y-0.5">
                                        <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-1">트레이드 키커</div>
                                        {[0, 0.05, 0.10, 0.15].map(pct => {
                                            const label = pct === 0 ? '없음' : `+${(pct * 100).toFixed(0)}%`;
                                            const sub = pct > 0 ? `$${(faOfferAAV * pct / 1_000_000).toFixed(1)}M 추가` : '';
                                            const active = faTradeKicker === pct;
                                            return (
                                                <label key={pct} className="flex items-center gap-2 py-0.5 cursor-pointer group">
                                                    <input type="radio" checked={active} onChange={() => setFaTradeKicker(pct)}
                                                        className="w-3 h-3 cursor-pointer appearance-none rounded-full border-2 border-slate-600 bg-slate-950 checked:border-blue-500 checked:bg-blue-500 checked:shadow-[inset_0_0_0_2px_rgb(2,6,23)] transition-colors flex-shrink-0" />
                                                    <span className={`text-xs transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>{label}</span>
                                                    {sub && <span className="text-[10px] text-slate-500">{sub}</span>}
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                                {/* NTC (bird_full 전용) */}
                                {selectedSlot === 'bird_full' && (
                                    <div className="space-y-0.5">
                                        <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-1">무이적 조항 (NTC)</div>
                                        {[false, true].map(val => {
                                            const active = faNoTrade === val;
                                            return (
                                                <label key={String(val)} className="flex items-center gap-2 py-0.5 cursor-pointer group">
                                                    <input type="radio" checked={active} onChange={() => setFaNoTrade(val as boolean)}
                                                        className="w-3 h-3 cursor-pointer appearance-none rounded-full border-2 border-slate-600 bg-slate-950 checked:border-blue-500 checked:bg-blue-500 checked:shadow-[inset_0_0_0_2px_rgb(2,6,23)] transition-colors flex-shrink-0" />
                                                    <span className={`text-xs transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>{val ? '포함' : '미포함'}</span>
                                                    {val && <span className="text-[10px] text-slate-500">선수 동의 없이 트레이드 불가</span>}
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
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
                            {/* 계약 연수 */}
                            <div className="flex-shrink-0 space-y-1.5">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">계약 연수</div>
                                <select
                                    value={extOfferYears}
                                    onChange={e => {
                                        const y = Number(e.target.value);
                                        setExtOfferYears(y);
                                        setExtOfferSalaries(generateEscalatedSalaries(extOfferSalaries[0] ?? (negState.demand.openingAsk), extEscalateRate, y));
                                    }}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-3 pr-8 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                                >
                                    {[1, 2, 3, 4].map(y => (
                                        <option key={y} value={y}>{y}년</option>
                                    ))}
                                </select>
                            </div>

                            {/* 연차별 연봉 입력 테이블 */}
                            <div className="flex-shrink-0 space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">연차별 연봉</div>
                                    <div className="text-[10px] font-mono text-slate-500">AAV <span className="text-indigo-400">{fmtM(extOfferAAV)}</span></div>
                                </div>
                                {extIsDecliningSalary && (
                                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 text-[10px] text-amber-400">
                                        ↘ 하향식 계약 — 충성도 ↑ · 재정적 야망 ↓ 선수만 수락
                                    </div>
                                )}
                                <table className="w-full">
                                    <tbody>
                                        {extOfferSalaries.map((sal, i) => {
                                            const y = currentSeasonYear + i;
                                            const season = `${y}-${String(y + 1).slice(-2)}`;
                                            const isDeclineYear = i > 0 && sal < extOfferSalaries[i - 1];
                                            return (
                                                <tr key={i}>
                                                    <td className="pr-1.5 py-0.5 text-[10px] text-slate-500 whitespace-nowrap w-8">{i + 1}년차</td>
                                                    <td className="pr-1.5 py-0.5 text-[10px] font-mono text-slate-500 w-12">{season}</td>
                                                    <td className="py-0.5">
                                                        <div className="flex items-center gap-1">
                                                            <div className="relative w-24 flex-shrink-0">
                                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-500 pointer-events-none">$</span>
                                                                <input
                                                                    type="number"
                                                                    step={100_000}
                                                                    min={Math.round(negState.demand.insultThreshold * 0.9)}
                                                                    max={Math.round(negState.demand.openingAsk * 1.3)}
                                                                    value={sal}
                                                                    onChange={e => {
                                                                        const v = parseInt(e.target.value) || 0;
                                                                        const min = Math.round(negState.demand.insultThreshold * 0.9);
                                                                        const max = Math.round(negState.demand.openingAsk * 1.3);
                                                                        const clamped = Math.max(min, Math.min(v, max));
                                                                        if (i === 0) {
                                                                            setExtOfferSalaries(generateEscalatedSalaries(clamped, extEscalateRate, extOfferYears));
                                                                        } else {
                                                                            const next = [...extOfferSalaries];
                                                                            next[i] = clamped;
                                                                            setExtOfferSalaries(next);
                                                                        }
                                                                    }}
                                                                    className={`w-full bg-slate-800 border rounded pl-5 pr-1 py-1 text-[10px] font-mono font-bold text-white focus:outline-none transition-colors ${
                                                                        isDeclineYear
                                                                            ? 'border-amber-500/60 focus:border-amber-400'
                                                                            : extOfferAAV >= negState.demand.targetAAV
                                                                            ? 'border-emerald-500/60 focus:border-emerald-400'
                                                                            : extOfferAAV < negState.demand.insultThreshold
                                                                            ? 'border-red-600/60 focus:border-red-500'
                                                                            : extOfferAAV < negState.demand.reservationFloor
                                                                            ? 'border-red-500/60 focus:border-red-400'
                                                                            : 'border-slate-700 focus:border-indigo-500'
                                                                    }`}
                                                                />
                                                            </div>
                                                            {[-5_000_000, -1_000_000, 1_000_000, 5_000_000].map(delta => (
                                                                <button
                                                                    key={delta}
                                                                    onClick={() => {
                                                                        const min = Math.round(negState.demand.insultThreshold * 0.9);
                                                                        const max = Math.round(negState.demand.openingAsk * 1.3);
                                                                        const newVal = Math.max(min, Math.min(sal + delta, max));
                                                                        if (i === 0) {
                                                                            setExtOfferSalaries(generateEscalatedSalaries(newVal, extEscalateRate, extOfferYears));
                                                                        } else {
                                                                            const next = [...extOfferSalaries];
                                                                            next[i] = newVal;
                                                                            setExtOfferSalaries(next);
                                                                        }
                                                                    }}
                                                                    className="text-[9px] font-mono font-bold px-1 py-1 rounded bg-slate-800 border border-slate-700/60 hover:bg-slate-700 hover:border-slate-600 text-slate-400 hover:text-slate-200 transition-colors flex-shrink-0"
                                                                >
                                                                    {delta < 0 ? `${delta / 1_000_000}M` : `+${delta / 1_000_000}M`}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t border-slate-700/60">
                                            <td colSpan={2} className="pt-3 pb-0.5 text-xs text-slate-400 font-bold">총 계약액</td>
                                            <td className="pt-3 pb-0.5 text-right text-xs font-mono font-black text-amber-300">{fmtM(totalContractValue)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            {/* 카운터 배너 */}
                            {lastExtResponse?.outcome === 'COUNTER' && (
                                <div className="flex-shrink-0 bg-violet-500/10 border border-violet-500/30 rounded-xl px-4 py-3 text-xs text-violet-300">
                                    카운터 오퍼: {fmtM(lastExtResponse.counterAAV)} / yr · {lastExtResponse.counterYears}년 — 가운데 채팅 확인
                                </div>
                            )}

                            {/* ── 계약 조건 옵션 ── */}
                            <div className="flex-shrink-0 space-y-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-2">계약 조건</div>
                                {/* 계약 옵션 (2년 이상일 때) */}
                                {extOfferYears >= 2 && (
                                    <div className="space-y-0.5">
                                        <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-1">계약 옵션</div>
                                        {(['none', 'team', 'player'] as const).map(opt => {
                                            const label = opt === 'none' ? '없음' : opt === 'team' ? '팀 옵션' : '선수 옵션';
                                            const sub = opt === 'team' ? '마지막 해 팀이 결정' : opt === 'player' ? '마지막 해 선수가 결정' : '';
                                            const active = extContractOption === opt;
                                            return (
                                                <label key={opt} className="flex items-center gap-2 py-0.5 cursor-pointer group">
                                                    <input type="radio" checked={active} onChange={() => setExtContractOption(opt)}
                                                        className="w-3 h-3 cursor-pointer appearance-none rounded-full border-2 border-slate-600 bg-slate-950 checked:border-blue-500 checked:bg-blue-500 checked:shadow-[inset_0_0_0_2px_rgb(2,6,23)] transition-colors flex-shrink-0" />
                                                    <span className={`text-xs transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>{label}</span>
                                                    {sub && <span className="text-[10px] text-slate-500">{sub}</span>}
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                                {/* 트레이드 키커 */}
                                <div className="space-y-0.5">
                                    <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-1">트레이드 키커</div>
                                    {[0, 0.05, 0.10, 0.15].map(pct => {
                                        const label = pct === 0 ? '없음' : `+${(pct * 100).toFixed(0)}%`;
                                        const sub = pct > 0 ? `$${(extOfferAAV * pct / 1_000_000).toFixed(1)}M 추가` : '';
                                        const active = extTradeKicker === pct;
                                        return (
                                            <label key={pct} className="flex items-center gap-2 py-0.5 cursor-pointer group">
                                                <input type="radio" checked={active} onChange={() => setExtTradeKicker(pct)}
                                                    className="w-3 h-3 cursor-pointer appearance-none rounded-full border-2 border-slate-600 bg-slate-950 checked:border-blue-500 checked:bg-blue-500 checked:shadow-[inset_0_0_0_2px_rgb(2,6,23)] transition-colors flex-shrink-0" />
                                                <span className={`text-xs transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>{label}</span>
                                                {sub && <span className="text-[10px] text-slate-500">{sub}</span>}
                                            </label>
                                        );
                                    })}
                                </div>
                                {/* NTC */}
                                <div className="space-y-0.5">
                                    <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 mb-1">무이적 조항 (NTC)</div>
                                    {[false, true].map(val => {
                                        const active = extNoTrade === val;
                                        return (
                                            <label key={String(val)} className="flex items-center gap-2 py-0.5 cursor-pointer group">
                                                <input type="radio" checked={active} onChange={() => setExtNoTrade(val as boolean)}
                                                    className="w-3 h-3 cursor-pointer appearance-none rounded-full border-2 border-slate-600 bg-slate-950 checked:border-blue-500 checked:bg-blue-500 checked:shadow-[inset_0_0_0_2px_rgb(2,6,23)] transition-colors flex-shrink-0" />
                                                <span className={`text-xs transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>{val ? '포함' : '미포함'}</span>
                                                {val && <span className="text-[10px] text-slate-500">선수 동의 없이 트레이드 불가</span>}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 제출 버튼 */}
                            <div className="flex-shrink-0 mt-auto pt-2">
                                <button
                                    onClick={handleExtSubmit}
                                    className="w-full py-3 rounded-xl font-black uppercase tracking-wide text-sm transition-all
                                        bg-indigo-600 hover:bg-indigo-500 text-white"
                                >오퍼 제출</button>
                            </div>
                        </>
                    )}

                    {/* Extension 최종 상태 */}
                    {isExtFinal && negState && (
                        <div className="flex-1 flex flex-col items-center justify-center gap-5">
                            {extensionNotYet ? (
                                <>
                                    <div className="w-20 h-20 rounded-full flex items-center justify-center bg-slate-700/40 border-2 border-slate-600/50">
                                        <span className="text-3xl text-slate-400">—</span>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-lg font-black uppercase tracking-wide text-slate-400">협상 불가</div>
                                        <div className="text-xs text-slate-500 mt-1">잔여 계약이 1년 이상 남아있습니다</div>
                                    </div>
                                </>
                            ) : (
                                <>
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
                                </>
                            )}
                            <button
                                onClick={onClose}
                                className="px-10 py-3 rounded-xl font-bold text-sm bg-slate-700 hover:bg-slate-600 text-slate-200 transition-all"
                            >닫기</button>
                        </div>
                    )}

                    {/* ── Release 컨트롤 ── */}
                    {isRel && (
                        <>
                            {/* 방출 방식 */}
                            <div className="flex-shrink-0 space-y-2">
                                <div className="text-xs font-black uppercase tracking-widest text-slate-500">방출 방식</div>
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
                                        <div className="text-xs font-black uppercase tracking-widest text-slate-500">제시 금액</div>
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
