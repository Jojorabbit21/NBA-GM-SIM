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
import { getMaxCapPct, isSuperMaxEligible, isRoseRuleEligible } from '../services/fa/contractEligibility';
import {
    generateDialogue,
    generateDemandSubText,
    type NegotiationType,
    type DialogueTrigger,
    type DialogueContext,
} from '../services/fa/negotiationDialogue';
import { TEAM_DATA } from '../data/teamData';
import type { Team } from '../types/team';
import { getLocalPopularityLabel, getNationalPopularityLabel } from '../services/playerPopularity';

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
    role: 'player' | 'gm' | 'status' | 'narration';
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
    onNegotiationBlocked?: (playerId: string) => void; // 협상 영구 결렬 시 호출
    onCooldownStarted?: (playerId: string, nextOfferDate: string) => void; // 거절 후 쿨다운 시작
    onNegStateChange?: (playerId: string, state: NegotiationState) => void; // Extension 감정 상태 영속화
    onFAStateChange?: (playerId: string, round: number, result: { accepted: boolean; reason?: string } | null) => void; // FA 상태 영속화
    persistedNegState?: NegotiationState;  // Extension: 이전 감정 상태 복원
    persistedFARound?: number;             // FA: 이전 라운드 수
    persistedFAResult?: { accepted: boolean; reason?: string } | null; // FA: 이전 결과
    currentDate?: string;        // 현재 게임 날짜 (쿨다운 비교용)
    cooldownNextDate?: string;   // 이 선수의 다음 오퍼 가능 날짜
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

// 계약 수락 후 GM 계약 요약 문장 생성
function buildGMSigningMessage(
    type: 'fa' | 'extension',
    playerName: string,
    years: number,
    aav: number,
    total: number,
    option?: { type: 'player' | 'team' } | null,
    noTrade?: boolean,
    tradeKicker?: number,
): string {
    const extras: string[] = [];
    if (option?.type === 'player') extras.push('선수 옵션');
    if (option?.type === 'team')   extras.push('팀 옵션');
    if (noTrade)                   extras.push('트레이드 거부권');
    if (tradeKicker)               extras.push(`트레이드 키커 ${(tradeKicker * 100).toFixed(0)}%`);
    const extraText = extras.length > 0 ? ` (${extras.join(' · ')} 포함)` : '';
    if (type === 'extension') {
        return `좋아요. 그럼 계약 내용을 확인해볼게요. ${years}년 연장, 연평균 ${fmtM(aav)}, 총액 ${fmtM(total)}${extraText}. 앞으로도 잘 부탁드립니다.`;
    }
    return `환영합니다, ${playerName}. 계약 내용 확인해드릴게요. ${years}년, 연평균 ${fmtM(aav)}, 총액 ${fmtM(total)}${extraText}. 팀에 합류하게 돼서 기쁩니다.`;
}

// 선수 맺음말 풀
const PLAYER_FAREWELL_PHRASES = [
    '잘 부탁드립니다. 기대에 부응하는 모습 보여드리겠습니다.',
    '열심히 하겠습니다. 좋은 결과 만들어봐요.',
    '감사합니다. 코트에서 최선을 다하겠습니다.',
    '잘 됐네요. 함께 좋은 시즌 만들어봅시다.',
    '결정했어요. 좋은 계약이 됐으면 합니다.',
];

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
    onNegotiationBlocked,
    onCooldownStarted,
    onNegStateChange,
    onFAStateChange,
    persistedNegState,
    persistedFARound,
    persistedFAResult,
    currentDate = '',
    cooldownNextDate,
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

    // 선수 성격 기반 FA 협상 최대 라운드
    // loyalty(0~1): 높을수록 오래 기다림 (+0~3)
    // temperament(-1~+1): 다혈질일수록 빨리 walk away (-0~2)
    const maxFARounds = useMemo(() => {
        const base = 4;
        const loyaltyBonus     = Math.round((tendencies.loyalty ?? 0.5) * 3);
        const temperamentMalus = tendencies.temperament > 0 ? Math.round(tendencies.temperament * 2) : 0;
        return Math.max(2, Math.min(7, base + loyaltyBonus - temperamentMalus));
    }, [tendencies]);

    // 선수 성격 기반 라운드 간 쿨다운 (일수)
    // temperament 다혈질(+1): +2일, loyalty 낮음(0): +1일
    const faCooldownDays = useMemo(() => {
        const base             = 1;
        const temperamentExtra = tendencies.temperament > 0 ? Math.round(tendencies.temperament) : 0;
        const loyaltyExtra     = Math.round((1 - (tendencies.loyalty ?? 0.5)));
        return Math.max(1, Math.min(3, base + temperamentExtra + loyaltyExtra));
    }, [tendencies]);

    const allPlayers    = useMemo(() => teams.flatMap(t => t.roster), [teams]);
    const contenderScore = useMemo(() => {
        const total = myTeam.wins + myTeam.losses;
        return total > 0 ? Math.min(1, (myTeam.wins / total) * 1.5) : 0.5;
    }, [myTeam.wins, myTeam.losses]);

    // ─── Extension State ─────────────────────────────────────
    const [negState, setNegState] = useState<NegotiationState | null>(() => {
        if (!isExt) return null;
        const base = persistedNegState
            ?? initNegotiationState(player, myTeam, allPlayers, tendencySeed, currentSeasonYear, currentSeason);

        // 마지막 오퍼 후 경과일에 따라 frustration 자연 회복 (0.03/day, 최대 0.15)
        if (persistedNegState?.lastOfferDate && currentDate && currentDate > persistedNegState.lastOfferDate) {
            const daysPassed = Math.floor(
                (new Date(currentDate + 'T12:00:00').getTime() - new Date(persistedNegState.lastOfferDate + 'T12:00:00').getTime())
                / 86_400_000
            );
            if (daysPassed > 0) {
                const recovery = Math.min(0.15, daysPassed * 0.03);
                return {
                    ...base,
                    frustration: Math.max(0, base.frustration - recovery),
                    respect:     Math.min(1, base.respect + recovery * 0.3),
                };
            }
        }
        return base;
    });

    // ─── 자기 인식 지표 (8개) ─────────────────────────────────
    const selfAssessmentItems = useMemo(() => {
        const ego               = tendencies.ego               ?? 0;   // -1 ~ +1
        const loyalty           = tendencies.loyalty           ?? 0.5; // 0 ~ 1
        const financialAmbition = tendencies.financialAmbition ?? 0.5; // 0 ~ 1
        const winDesire         = tendencies.winDesire         ?? 0.5; // 0 ~ 1

        const c = (v: number) => Math.max(0, Math.min(1, v));
        const ovrNorm = c((player.ovr - 70) / 25);   // 70→0, 95→1

        type Item = { label: string; text: string; color: string };

        // 1. 자기 평가 등급 — ego는 OVR 기반 점수에 ±delta로 가감
        const selfScore = c(ovrNorm + ego * 0.15);
        const selfGrade: Item = selfScore > 0.82
            ? { label: '자기 평가 등급', text: '최정상급', color: 'text-emerald-400' }
            : selfScore > 0.68
            ? { label: '자기 평가 등급', text: '올스타급', color: 'text-emerald-400' }
            : selfScore > 0.54
            ? { label: '자기 평가 등급', text: '핵심 스타터급', color: 'text-indigo-400' }
            : selfScore > 0.40
            ? { label: '자기 평가 등급', text: '스타터급', color: 'text-slate-300' }
            : selfScore > 0.26
            ? { label: '자기 평가 등급', text: '롤플레이어급', color: 'text-slate-300' }
            : { label: '자기 평가 등급', text: '유망주', color: 'text-amber-400' };

        // 2. 기대 역할
        const roleScore = c(ovrNorm + ego * 0.10);
        const expectedRole: Item = roleScore > 0.80
            ? { label: '기대 역할', text: '1옵션', color: 'text-emerald-400' }
            : roleScore > 0.65
            ? { label: '기대 역할', text: '1~2옵션', color: 'text-emerald-400' }
            : roleScore > 0.50
            ? { label: '기대 역할', text: '2~3옵션', color: 'text-indigo-400' }
            : roleScore > 0.35
            ? { label: '기대 역할', text: '정규 스타터', color: 'text-slate-300' }
            : roleScore > 0.20
            ? { label: '기대 역할', text: '식스맨', color: 'text-amber-400' }
            : { label: '기대 역할', text: '로테이션', color: 'text-slate-500' };

        // 3. 연봉 만족도
        const demandAAV = isExt
            ? (negState?.demand.targetAAV ?? player.salary ?? 0)
            : (faEntry?.askingSalary    ?? player.salary ?? 0);
        const salaryRatio = demandAAV > 0 ? c((player.salary ?? 0) / demandAAV) : 0.7;
        const salaryScore = c(salaryRatio * 0.65 + (1 - financialAmbition) * 0.35);
        const salarySatisfaction: Item = salaryScore > 0.78
            ? { label: '연봉 만족도', text: '매우 만족', color: 'text-emerald-400' }
            : salaryScore > 0.60
            ? { label: '연봉 만족도', text: '만족', color: 'text-indigo-400' }
            : salaryScore > 0.42
            ? { label: '연봉 만족도', text: '보통', color: 'text-slate-300' }
            : salaryScore > 0.25
            ? { label: '연봉 만족도', text: '불만족', color: 'text-amber-400' }
            : { label: '연봉 만족도', text: '매우 불만족', color: 'text-red-400' };

        // 4. 시장 가치 인식
        const marketScore = c(ovrNorm + ego * 0.18);
        const marketPerception: Item = marketScore > 0.80
            ? { label: '시장 가치 인식', text: '최상위권', color: 'text-emerald-400' }
            : marketScore > 0.65
            ? { label: '시장 가치 인식', text: '상위권', color: 'text-emerald-400' }
            : marketScore > 0.50
            ? { label: '시장 가치 인식', text: '평균 이상', color: 'text-indigo-400' }
            : marketScore > 0.35
            ? { label: '시장 가치 인식', text: '평균', color: 'text-slate-300' }
            : { label: '시장 가치 인식', text: '평균 이하', color: 'text-slate-400' };

        // 5. 팀 헌신도
        const commitScore = isExt
            ? c(loyalty * 0.40 + (negState?.respect ?? 0.7) * 0.35 + (negState?.trust ?? 0.7) * 0.25)
            : c(loyalty * 0.60 + moraleScore / 100 * 0.40);
        const teamCommitment: Item = commitScore > 0.78
            ? { label: '팀 헌신도', text: '매우 높음', color: 'text-emerald-400' }
            : commitScore > 0.62
            ? { label: '팀 헌신도', text: '높음', color: 'text-emerald-400' }
            : commitScore > 0.46
            ? { label: '팀 헌신도', text: '보통', color: 'text-slate-300' }
            : commitScore > 0.30
            ? { label: '팀 헌신도', text: '낮음', color: 'text-amber-400' }
            : { label: '팀 헌신도', text: '매우 낮음', color: 'text-red-400' };

        // 6. 우승 기대감
        const champScore = c(winDesire * 0.55 + contenderScore * 0.45);
        const championshipHope: Item = champScore > 0.78
            ? { label: '우승 기대감', text: '매우 높음', color: 'text-emerald-400' }
            : champScore > 0.62
            ? { label: '우승 기대감', text: '높음', color: 'text-emerald-400' }
            : champScore > 0.46
            ? { label: '우승 기대감', text: '보통', color: 'text-indigo-400' }
            : champScore > 0.30
            ? { label: '우승 기대감', text: '낮음', color: 'text-amber-400' }
            : { label: '우승 기대감', text: '매우 낮음', color: 'text-slate-500' };

        // 7. 환경 만족도
        const frustPenalty = isExt ? (negState?.frustration ?? 0) * 0.20 : 0;
        const envScore = c(moraleScore / 100 * 0.50 + loyalty * 0.30 + (1 - frustPenalty) * 0.20);
        const envSatisfaction: Item = envScore > 0.78
            ? { label: '환경 만족도', text: '매우 만족', color: 'text-emerald-400' }
            : envScore > 0.62
            ? { label: '환경 만족도', text: '만족', color: 'text-indigo-400' }
            : envScore > 0.46
            ? { label: '환경 만족도', text: '보통', color: 'text-slate-300' }
            : envScore > 0.30
            ? { label: '환경 만족도', text: '불만족', color: 'text-amber-400' }
            : { label: '환경 만족도', text: '매우 불만족', color: 'text-red-400' };

        // 8. 레거시 욕구
        const ageNorm = c((player.age - 23) / 14); // 23세→0, 37세→1
        const legacyScore = c((ego + 1) / 2 * 0.40 + winDesire * 0.35 + ageNorm * 0.25);
        const legacyDesire: Item = legacyScore > 0.78
            ? { label: '레거시 욕구', text: '매우 강함', color: 'text-emerald-400' }
            : legacyScore > 0.62
            ? { label: '레거시 욕구', text: '강함', color: 'text-indigo-400' }
            : legacyScore > 0.46
            ? { label: '레거시 욕구', text: '보통', color: 'text-slate-300' }
            : legacyScore > 0.30
            ? { label: '레거시 욕구', text: '약함', color: 'text-slate-400' }
            : { label: '레거시 욕구', text: '없음', color: 'text-slate-500' };

        return [selfGrade, expectedRole, salarySatisfaction, marketPerception, teamCommitment, championshipHope, envSatisfaction, legacyDesire];
    }, [tendencies, moraleScore, player, negState, faEntry, contenderScore, isExt]);

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
    const yos              = currentSeasonYear - (player.draftYear ?? currentSeasonYear);
    const maxCapResult     = getMaxCapPct(player, yos, currentSeasonYear, isExt);
    const capPct           = maxCapResult.pct;
    const capPctReason     = maxCapResult.reason;
    const faMaxAllowed     = Math.round(LEAGUE_FINANCIALS.SALARY_CAP * capPct);
    const vetMin      = yos >= 7 ? 3_000_000 : yos >= 4 ? 2_200_000 : 1_500_000;

    // ─── 자격 조건 ───────────────────────────────────────────
    const isSuperMax  = yos >= 7 && yos <= 9 && isSuperMaxEligible(player, currentSeasonYear);
    const isRoseRule  = yos < 7 && isRoseRuleEligible(player);
    const recentAwards = useMemo(() => {
        const fmt = (y: number) => `${y}-${String(y + 1).slice(-2)}`;
        const recentLabels = new Set([fmt(currentSeasonYear - 1), fmt(currentSeasonYear - 2), fmt(currentSeasonYear - 3)]);
        const all = [
            ...(player.career_history ?? []).flatMap(s => (s.awards ?? []).map(a => ({ ...a, season: a.season || s.season }))),
            ...(player.awards ?? []),
        ].filter(a => recentLabels.has(a.season));
        return {
            mvp:    all.filter(a => a.type === 'MVP').map(a => a.season),
            dpoy:   all.filter(a => a.type === 'DPOY').map(a => a.season),
            allNba: all.filter(a => a.type === 'ALL_NBA_1' || a.type === 'ALL_NBA_2' || a.type === 'ALL_NBA_3')
                       .map(a => ({ season: a.season, tier: a.type === 'ALL_NBA_1' ? '1st' : a.type === 'ALL_NBA_2' ? '2nd' : '3rd' })),
        };
    }, [player, currentSeasonYear]);

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
    const [faResult, setFaResult]           = useState<{ accepted: boolean; reason?: string } | null>(persistedFAResult ?? null);
    const [faRound, setFaRound]             = useState(persistedFARound ?? 0);

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

    // 캡% 입력 표시 (year 1 기준 실시간 역산)
    const [faCapPctStr,  setFaCapPctStr]  = useState<string>('');
    const [extCapPctStr, setExtCapPctStr] = useState<string>('');

    useEffect(() => {
        if (faOfferSalaries[0] > 0)
            setFaCapPctStr(((faOfferSalaries[0] / LEAGUE_FINANCIALS.SALARY_CAP) * 100).toFixed(1));
    }, [faOfferSalaries]);

    useEffect(() => {
        if (extOfferSalaries[0] > 0)
            setExtCapPctStr(((extOfferSalaries[0] / LEAGUE_FINANCIALS.SALARY_CAP) * 100).toFixed(1));
    }, [extOfferSalaries]);

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

    // 향후 5년 데드캡 영향 테이블
    const deadCapTable = useMemo(() => {
        const seasonLabel = (offset: number) => {
            const y = currentSeasonYear + offset;
            return `${y}-${String(y + 1).slice(-2)}`;
        };
        return Array.from({ length: 5 }, (_, i) => {
            const label = seasonLabel(i);
            const existing = (myTeam.deadMoney ?? []).reduce((sum, entry) => {
                if (entry.releaseType === 'stretch') {
                    return sum + ((entry.stretchYearsRemaining ?? 0) > i ? entry.amount : 0);
                }
                return sum + (i === 0 ? entry.amount : 0);
            }, 0);
            const addition =
                releaseMode === 'waive'   && i === 0 ? totalRemaining :
                releaseMode === 'stretch' && i < stretchYearsTotal ? Math.round(stretchAnnual) :
                releaseMode === 'buyout'  && i === 0 ? buyoutAmount :
                0;
            return { label, existing, addition, total: existing + addition };
        });
    }, [myTeam.deadMoney, releaseMode, totalRemaining, stretchAnnual, stretchYearsTotal, buyoutAmount, currentSeasonYear]);

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
        const msgs: ChatMsg[] = [];

        // 1. 장면 설명
        const narration = isExt
            ? `단장실 — ${currentSeason} 계약 연장 협상`
            : isRel
            ? '단장실 — 비공개 면담'
            : `${myTeam.name} 연습시설 — FA 서명 미팅`;
        msgs.push({ id: nextId(), role: 'narration', text: narration });

        // 2. GM 첫 인사
        const gmIntro = isExt
            ? `${player.name}, 오늘 시간 내줘서 고마워요. 함께할 앞으로의 계획에 대해 솔직하게 얘기 나눠봅시다.`
            : isRel
            ? `${player.name}... 이 시즌 동안 정말 헌신해줘서 고마워요. 오늘 드리려는 얘기가 쉽지 않은 내용이에요.`
            : `반갑습니다, ${player.name}. 우리 팀에 관심 가져줘서 고마워요. 편하게 앉아요.`;
        msgs.push({ id: nextId(), role: 'gm', text: gmIntro });

        // 3. 선수 인사 대사
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
        msgs.push({ id: nextId(), role: 'player', text: d, subText: greetingSub });

        setChatMessages(msgs);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── 감정 상태 영속화 (부모에 콜백) ──────────────────────
    const isMounted = useRef(false);
    useEffect(() => {
        if (!isMounted.current) { isMounted.current = true; return; }
        if (negState) onNegStateChange?.(player.id, negState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [negState]);

    useEffect(() => {
        if (!isMounted.current) return;
        onFAStateChange?.(player.id, faRound, faResult);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [faRound, faResult]);

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
            // GM 계약 요약
            const faSigningMsg = buildGMSigningMessage(
                'fa', player.name, faOfferYears, faOfferAAV, totalContractValue,
                faContractOption !== 'none' && faOfferYears >= 2 ? { type: faContractOption as 'player' | 'team' } : null,
                faNoTrade && selectedSlot === 'bird_full', faTradeKicker > 0 ? faTradeKicker : undefined,
            );
            addMsg('gm', faSigningMsg);
            // 선수 맺음말
            const farewellIdx = player.id.charCodeAt(0) % PLAYER_FAREWELL_PHRASES.length;
            addMsg('player', PLAYER_FAREWELL_PHRASES[farewellIdx]);
            setChatMessages(prev => [...prev, { id: nextId(), role: 'status', text: '계약 체결 — 대화 종료', isSuccess: true }]);

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

            // 최대 라운드 초과 시 선수 walk away → 재협상 불가
            if (newRound >= maxFARounds) {
                addPlayerMsg('WALKED_AWAY', newRound, null, null);
                setChatMessages(prev => [...prev, { id: nextId(), role: 'status', text: '협상 결렬', isSuccess: false }]);
                onNegotiationBlocked?.(player.id);
            } else if (currentDate) {
                // 거절 후 쿨다운 시작 — 다음 오퍼 가능 날짜 계산
                const d = new Date(currentDate + 'T12:00:00');
                d.setDate(d.getDate() + faCooldownDays);
                const nextDate = d.toISOString().slice(0, 10);
                onCooldownStarted?.(player.id, nextDate);
            }
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
                offerDate:   currentDate || undefined,
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
                // GM 계약 요약
                addMsg('gm', buildGMSigningMessage(
                    'extension', player.name, extOfferYears, extOfferAAV, totalContractValue,
                    extContractOption !== 'none' && extOfferYears >= 2 ? { type: extContractOption as 'player' | 'team' } : null,
                    extNoTrade, extTradeKicker > 0 ? extTradeKicker : undefined,
                ));
                // 선수 맺음말
                addMsg('player', PLAYER_FAREWELL_PHRASES[
                    player.id.charCodeAt(0) % PLAYER_FAREWELL_PHRASES.length
                ]);
                setChatMessages(prev => [...prev, { id: nextId(), role: 'status', text: '계약 연장 — 대화 종료', isSuccess: true }]);
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
                onNegotiationBlocked?.(player.id);
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
    const isFAFinal    = isFA  && !!faResult?.accepted;
    const isFABlocked  = isFA  && faRound >= maxFARounds && !faResult?.accepted;
    // 쿨다운 활성 여부 및 남은 일수
    const cooldownActive = isFA && !!cooldownNextDate && !!currentDate && currentDate < cooldownNextDate;
    const cooldownRemaining = cooldownActive && cooldownNextDate && currentDate
        ? (() => {
            const a = new Date(currentDate  + 'T12:00:00');
            const b = new Date(cooldownNextDate + 'T12:00:00');
            return Math.ceil((b.getTime() - a.getTime()) / 86_400_000);
        })()
        : 0;
    const isWalkedAway  = isExt && !!negState?.walkedAway;
    const isExtDisabled = isWalkedAway || (isExt && extensionNotYet);

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

    // ─── Label helpers ───────────────────────────────────────
    const respectLbl = (v: number): { label: string; color: string } => {
        if (v >= 0.8) return { label: '매우 존중받고 있음',       color: 'text-emerald-400' };
        if (v >= 0.6) return { label: '존중받고 있음',           color: 'text-teal-400' };
        if (v >= 0.4) return { label: '보통',                    color: 'text-slate-400' };
        if (v >= 0.2) return { label: '존중받지 못한다고 느낌',  color: 'text-amber-400' };
        return              { label: '무시받고 있음',            color: 'text-red-400' };
    };
    const trustLbl = (v: number): { label: string; color: string } => {
        if (v >= 0.8) return { label: '매우 신뢰함',         color: 'text-emerald-400' };
        if (v >= 0.6) return { label: '신뢰하고 있음',       color: 'text-teal-400' };
        if (v >= 0.4) return { label: '보통',                color: 'text-slate-400' };
        if (v >= 0.2) return { label: '약간 불신하고 있음',  color: 'text-amber-400' };
        return              { label: '전혀 신뢰하지 않음',   color: 'text-red-400' };
    };
    const frustrationLbl = (v: number): { label: string; color: string } => {
        if (v >= 0.8) return { label: '매우 불만족하고 있음', color: 'text-red-400' };
        if (v >= 0.6) return { label: '불만족하고 있음',     color: 'text-amber-400' };
        if (v >= 0.4) return { label: '보통',                color: 'text-slate-400' };
        if (v >= 0.2) return { label: '약간 만족함',         color: 'text-teal-400' };
        return              { label: '매우 만족함',          color: 'text-emerald-400' };
    };

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
            </div>

            {/* ── 3-panel Main ── */}
            <div className="flex-1 flex overflow-hidden min-h-0 p-3 gap-3">

                {/* ── 좌측: 선수 정보 ── */}
                <div className="flex-[2] min-w-0 rounded-2xl border border-slate-800 bg-slate-900/40 flex flex-col overflow-hidden">

                    {/* 위젯 헤더 */}
                    <div className="flex-shrink-0 px-4 py-2" style={{ backgroundColor: primaryColor }}>
                        <span className="text-sm font-bold text-white">선수 정보</span>
                    </div>

                    {/* 스크롤 영역 */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">

                        {/* 이름 */}
                        <div className="px-4 pt-4 pb-2">
                            <div className="text-base font-black text-white ko-tight leading-tight">{player.name}</div>
                        </div>

                        {/* 프로필 */}
                        <div className="px-4 pb-3 space-y-1">
                            {[
                                { label: '포지션', value: player.position },
                                { label: '나이',   value: `${player.age}세` },
                                { label: '신장',   value: `${player.height}cm` },
                                { label: '체중',   value: `${player.weight}kg` },
                                ...(isFA && faEntry ? [{ label: '관심 팀', value: `${faEntry.interestedTeamIds.length}팀` }] : []),
                            ].map(({ label, value }) => (
                                <div key={label} className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">{label}</span>
                                    <span className="font-mono text-slate-200">{value}</span>
                                </div>
                            ))}
                        </div>

                        {/* 인기도 */}
                        <div className="px-4 py-3 space-y-1">
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">인기도</div>
                            {[
                                { label: '지역적인 인기', value: getLocalPopularityLabel(player.popularity?.local    ?? 0) },
                                { label: '전국적인 인기', value: getNationalPopularityLabel(player.popularity?.national ?? 0) },
                            ].map(({ label, value }) => (
                                <div key={label} className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">{label}</span>
                                    <span className="text-slate-200 font-semibold">{value}</span>
                                </div>
                            ))}
                        </div>

                        {/* 현재 계약 */}
                        {player.contract && (
                            <div className="px-4 py-3 space-y-1">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">현재 계약</div>
                                {player.contract.years.map((sal, i) => {
                                    const startYear    = currentSeasonYear - player.contract!.currentYear;
                                    const year         = startYear + i;
                                    const seasonLabel  = `${year}-${String(year + 1).slice(-2)}`;
                                    const isCurrent    = i === player.contract!.currentYear;
                                    const isCompleted  = i <  player.contract!.currentYear;
                                    const opt          = player.contract!.option;
                                    const isOptionYear = opt && opt.year === i;
                                    return (
                                        <div key={i} className="flex justify-between items-center text-xs">
                                            <span className={`flex items-center gap-1 ${isCompleted ? 'text-slate-500' : 'text-slate-500'}`}>
                                                {seasonLabel}
                                                {isCurrent    && <span className="text-indigo-400 font-black">현재</span>}
                                                {isOptionYear && <span className="text-slate-500">{opt!.type === 'player' ? '선수옵션' : '팀옵션'}</span>}
                                            </span>
                                            <span className={`font-mono font-bold ${isCompleted ? 'text-slate-500' : 'text-slate-200'}`}>{fmtM(sal)}</span>
                                        </div>
                                    );
                                })}
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">AAV</span>
                                    <span className="font-mono text-slate-300">{fmtM(player.contract.years.slice(player.contract.currentYear).reduce((a, b) => a + b, 0) / (player.contract.years.length - player.contract.currentYear))}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">유형</span>
                                    <span className="text-slate-400 flex items-center gap-1">
                                        {{ rookie: '루키', veteran: '베테랑', max: '맥스', min: '미니멈', extension: '연장' }[player.contract.type]}
                                        {player.contract.noTrade && <span className="text-amber-400 font-black ml-1">NTC</span>}
                                    </span>
                                </div>
                                {isRel && (
                                    <>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-slate-500">잔여 연수</span>
                                            <span className="font-mono text-slate-300">{remainingYears}년</span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-slate-500">잔여 총액</span>
                                            <span className="font-mono font-bold text-white">{fmtM(totalRemaining)}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* 자격 조건 */}
                        <div className="px-4 py-3 space-y-1.5">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">자격 조건</div>
                                {yos >= 7 && yos <= 9 && (
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500">슈퍼맥스 대상</span>
                                        <span className={isSuperMax ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                                            {isSuperMax ? '✓ 해당' : '미해당'}
                                        </span>
                                    </div>
                                )}
                                {yos < 7 && (
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500">로즈룰 대상</span>
                                        <span className={isRoseRule ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                                            {isRoseRule ? '✓ 해당' : '미해당'}
                                        </span>
                                    </div>
                                )}
                                <div className="pt-0.5 space-y-1">
                                    <div className="text-xs text-slate-500 mb-0.5">최근 3년 수상</div>
                                    {[
                                        { label: 'MVP',            entries: recentAwards.mvp.map(s => s) },
                                        { label: 'DPOY',           entries: recentAwards.dpoy.map(s => s) },
                                        { label: '올-오펜시브',    entries: recentAwards.allNba.map(a => `${a.season}(${a.tier})`) },
                                    ].map(({ label, entries }) => (
                                        <div key={label} className="flex justify-between items-start gap-2 text-xs">
                                            <span className="text-slate-500 flex-shrink-0">{label}</span>
                                            <span className="text-right font-mono text-slate-300">
                                                {entries.length ? entries.join(', ') : '없음'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                        </div>

                        {/* 기분 및 태도 (Extension only) */}
                        {isExt && negState && (
                            <div className="px-4 py-3 space-y-1">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">기분 및 태도</div>
                                {[
                                    { label: '존중심',   lbl: respectLbl(negState.respect) },
                                    { label: '신뢰도',   lbl: trustLbl(negState.trust) },
                                    { label: '불만족도', lbl: frustrationLbl(negState.frustration) },
                                ].map(({ label, lbl }) => (
                                    <div key={label} className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500">{label}</span>
                                        <span className={`font-semibold text-right ${lbl.color}`}>{lbl.label}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* 자기 인식 */}
                        <div className="px-4 py-3 space-y-1 border-t border-slate-800/60">
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">자기 인식</div>
                            {selfAssessmentItems.map(({ label, text, color }) => (
                                <div key={label} className="flex justify-between items-center text-xs gap-2">
                                    <span className="text-slate-500 flex-shrink-0">{label}</span>
                                    <span className={`font-semibold text-right ${color}`}>{text}</span>
                                </div>
                            ))}
                        </div>

                    </div>
                </div>

                {/* ── 중앙: 채팅 패널 ── */}
                <div className="flex-[5] min-w-0 rounded-2xl border border-slate-800 bg-slate-900/40 flex flex-col overflow-hidden">

                    {/* 위젯 헤더 */}
                    <div className="flex-shrink-0 px-4 py-2" style={{ backgroundColor: primaryColor }}>
                        <span className="text-sm font-bold text-white">선수와 대화</span>
                    </div>

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
                            // 장면 설명 — 숨김
                            if (msg.role === 'narration') return null;

                            // 상태 배지
                            if (msg.role === 'status') {
                                if (!msg.isSuccess) {
                                    return (
                                        <div key={msg.id} className="flex justify-center py-1">
                                            <span className="text-xs text-slate-500 italic">선수가 단장실을 떠났습니다.</span>
                                        </div>
                                    );
                                }
                                return (
                                    <div key={msg.id} className="flex justify-center">
                                        <div className="text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full border bg-emerald-500/20 border-emerald-500/30 text-emerald-400">{msg.text}</div>
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
                                                            <td className="text-right font-black text-white">{fmtM(cd.total)}</td>
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
                <div className={`flex-[3] min-w-0 flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 relative transition-opacity duration-300 ${(negState?.signed || isFAFinal) ? 'opacity-40 pointer-events-none select-none' : ''}`}>

                    {/* 위젯 헤더 */}
                    <div className="flex-shrink-0 px-4 py-2" style={{ backgroundColor: primaryColor }}>
                        <span className="text-sm font-bold text-white">
                            {isFA ? 'FA 서명 조건' : isExt ? '계약 연장 조건' : '방출 처리'}
                        </span>
                    </div>

                    {/* 스크롤 바디 */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-5">

                    {/* ── FA 컨트롤 ── */}
                    {isFA && faEntry && !isFAFinal && !isFABlocked && (
                        <>
                            {/* 계약 슬롯 */}
                            <div className="flex-shrink-0">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">계약 슬롯</div>
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
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">계약 연수</div>
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

                            {/* 연차별 연봉 */}
                            <div className="flex-shrink-0 space-y-2">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">연차별 연봉</div>
                                {/* 캡% 지정 — 1년차 기준으로 달러 자동 계산 */}
                                {selectedSlot !== 'vet_min' && (
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-slate-500">캡% 지정</span>
                                            <span className="text-xs font-mono text-indigo-400/80">상한 {(capPct * 100).toFixed(0)}%</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                                <input
                                                    type="number"
                                                    step={0.1}
                                                    min={0}
                                                    max={capPct * 100}
                                                    value={faCapPctStr}
                                                    onChange={e => setFaCapPctStr(e.target.value)}
                                                    onBlur={e => {
                                                        const pct = parseFloat(e.target.value);
                                                        if (!isNaN(pct) && pct > 0) {
                                                            const raw = Math.round(LEAGUE_FINANCIALS.SALARY_CAP * pct / 100);
                                                            const clamped = Math.min(raw, currentSlotMax);
                                                            setFaOfferSalaries(generateEscalatedSalaries(clamped, faEscalateRate, faOfferYears));
                                                        } else {
                                                            setFaCapPctStr(faOfferSalaries[0] > 0 ? ((faOfferSalaries[0] / LEAGUE_FINANCIALS.SALARY_CAP) * 100).toFixed(1) : '');
                                                        }
                                                    }}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') {
                                                            const pct = parseFloat((e.target as HTMLInputElement).value);
                                                            if (!isNaN(pct) && pct > 0) {
                                                                const raw = Math.round(LEAGUE_FINANCIALS.SALARY_CAP * pct / 100);
                                                                const clamped = Math.min(raw, currentSlotMax);
                                                                setFaOfferSalaries(generateEscalatedSalaries(clamped, faEscalateRate, faOfferYears));
                                                            }
                                                        }
                                                    }}
                                                    className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white text-right focus:outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                                                />
                                                <span className="text-xs text-slate-500">%</span>
                                            </div>
                                    </div>
                                )}
                                <div className="space-y-1 border-t border-slate-800 pt-2">
                                    {faOfferSalaries.map((sal, i) => {
                                        const y = currentSeasonYear + i;
                                        const season = `${y}-${String(y + 1).slice(-2)}`;
                                        const isDeclineYear = i > 0 && sal < faOfferSalaries[i - 1];
                                        return (
                                            <div key={i} className="flex items-center gap-1">
                                                <span className="text-xs text-slate-500 whitespace-nowrap flex-shrink-0 w-[88px]">{i + 1}년차 {season}</span>
                                                {[-5_000_000, -1_000_000].map(delta => (
                                                    <button
                                                        key={delta}
                                                        disabled={selectedSlot === 'vet_min'}
                                                        onClick={() => {
                                                            const newVal = sal + delta;
                                                            if (i === 0) {
                                                                setFaOfferSalaries(generateEscalatedSalaries(newVal, faEscalateRate, faOfferYears));
                                                            } else {
                                                                const next = [...faOfferSalaries];
                                                                next[i] = newVal;
                                                                setFaOfferSalaries(next);
                                                            }
                                                        }}
                                                        className="text-xs font-mono px-2 py-1.5 rounded bg-slate-700/50 border border-slate-600/60 hover:bg-slate-600/60 hover:border-slate-500/80 text-slate-300 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                                                    >
                                                        {`-$${Math.abs(delta) / 1_000_000}M`}
                                                    </button>
                                                ))}
                                                <div className="relative flex-1 min-w-0">
                                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">$</span>
                                                    <input
                                                        type="number"
                                                        step={100_000}
                                                        disabled={selectedSlot === 'vet_min'}
                                                        value={sal}
                                                        onChange={e => {
                                                            const v = parseInt(e.target.value) || 0;
                                                            if (i === 0) {
                                                                setFaOfferSalaries(generateEscalatedSalaries(v, faEscalateRate, faOfferYears));
                                                            } else {
                                                                const next = [...faOfferSalaries];
                                                                next[i] = v;
                                                                setFaOfferSalaries(next);
                                                            }
                                                        }}
                                                        className={`w-full bg-slate-800 border rounded pl-7 pr-1 py-1.5 text-xs font-mono font-bold text-white focus:outline-none disabled:opacity-40 transition-colors ${
                                                            isDeclineYear
                                                                ? 'border-amber-500/60 focus:border-amber-400'
                                                                : 'border-slate-700 focus:border-indigo-500'
                                                        }`}
                                                    />
                                                </div>
                                                {[1_000_000, 5_000_000].map(delta => (
                                                    <button
                                                        key={delta}
                                                        disabled={selectedSlot === 'vet_min'}
                                                        onClick={() => {
                                                            const newVal = sal + delta;
                                                            if (i === 0) {
                                                                setFaOfferSalaries(generateEscalatedSalaries(newVal, faEscalateRate, faOfferYears));
                                                            } else {
                                                                const next = [...faOfferSalaries];
                                                                next[i] = newVal;
                                                                setFaOfferSalaries(next);
                                                            }
                                                        }}
                                                        className="text-xs font-mono px-2 py-1.5 rounded bg-slate-700/50 border border-slate-600/60 hover:bg-slate-600/60 hover:border-slate-500/80 text-slate-300 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                                                    >
                                                        {`+$${delta / 1_000_000}M`}
                                                    </button>
                                                ))}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="space-y-1 pt-2 mt-1 border-t border-slate-700/50">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-400 font-semibold">총 계약액</span>
                                        <span className="font-mono font-bold text-white">{fmtM(totalContractValue)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-400">AAV</span>
                                        <span className="font-mono text-white">{fmtM(faOfferAAV)}</span>
                                    </div>
                                </div>
                                <div className="text-xs text-center">
                                    {faIsAboveAsking
                                        ? <span className="text-emerald-400">✓ 요구 이상 — 높은 수락 확률</span>
                                        : faIsBelowWalkaway
                                        ? <span className="text-red-400">✗ 최저선 미달 — 거절 확정</span>
                                        : <span className="text-slate-500">협상 구간 · 요구 {fmtM(faEntry.askingSalary)}</span>
                                    }
                                </div>
                            </div>

                            {/* ── 계약 조건 옵션 ── */}
                            <div className="flex-shrink-0">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">계약 조건</div>
                                <div className="divide-y divide-slate-800">
                                    {/* 계약 옵션 (2년 이상 시) */}
                                    {faOfferYears >= 2 && (
                                        <div className="py-3 space-y-0.5">
                                            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">계약 옵션</div>
                                            {(['none', 'team', 'player'] as const).map(opt => {
                                                const label = opt === 'none' ? '없음' : opt === 'team' ? '팀 옵션' : '선수 옵션';
                                                const active = faContractOption === opt;
                                                return (
                                                    <label key={opt} className="flex items-center gap-2 py-0.5 cursor-pointer group">
                                                        <input type="radio" checked={active} onChange={() => setFaContractOption(opt)}
                                                            className="w-3 h-3 cursor-pointer appearance-none rounded-full border-2 border-slate-600 bg-slate-950 checked:border-blue-500 checked:bg-blue-500 checked:shadow-[inset_0_0_0_2px_rgb(2,6,23)] transition-colors flex-shrink-0" />
                                                        <span className={`text-xs transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>{label}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {/* 트레이드 키커 (vet_min 제외) */}
                                    {selectedSlot !== 'vet_min' && (
                                        <div className="py-3 space-y-0.5">
                                            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">트레이드 키커</div>
                                            {[0, 0.05, 0.10, 0.15].map(pct => {
                                                const label = pct === 0 ? '없음' : `+${(pct * 100).toFixed(0)}%`;
                                                const sub = pct > 0 ? `$${(faOfferAAV * pct / 1_000_000).toFixed(1)}M 추가` : '';
                                                const active = faTradeKicker === pct;
                                                return (
                                                    <label key={pct} className="flex items-center gap-2 py-0.5 cursor-pointer group">
                                                        <input type="radio" checked={active} onChange={() => setFaTradeKicker(pct)}
                                                            className="w-3 h-3 cursor-pointer appearance-none rounded-full border-2 border-slate-600 bg-slate-950 checked:border-blue-500 checked:bg-blue-500 checked:shadow-[inset_0_0_0_2px_rgb(2,6,23)] transition-colors flex-shrink-0" />
                                                        <span className={`text-xs transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>{label}</span>
                                                        {sub && <span className="text-xs text-slate-500">{sub}</span>}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {/* 트레이드 거부권 (bird_full 전용) */}
                                    {selectedSlot === 'bird_full' && (
                                        <div className="py-3 space-y-0.5">
                                            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">트레이드 거부권</div>
                                            {[false, true].map(val => {
                                                const active = faNoTrade === val;
                                                return (
                                                    <label key={String(val)} className="flex items-center gap-2 py-0.5 cursor-pointer group">
                                                        <input type="radio" checked={active} onChange={() => setFaNoTrade(val as boolean)}
                                                            className="w-3 h-3 cursor-pointer appearance-none rounded-full border-2 border-slate-600 bg-slate-950 checked:border-blue-500 checked:bg-blue-500 checked:shadow-[inset_0_0_0_2px_rgb(2,6,23)] transition-colors flex-shrink-0" />
                                                        <span className={`text-xs transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>{val ? '포함' : '미포함'}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 거절 사유 */}
                            {faResult && !faResult.accepted && !cooldownActive && (
                                <div className="flex-shrink-0 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-xs text-red-400">
                                    {faResult.reason ?? '거절됨 — 조건을 수정해 재협상하세요.'}
                                </div>
                            )}

                            {/* 쿨다운 배너 */}
                            {cooldownActive && (
                                <div className="flex-shrink-0 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-xs text-amber-400">
                                    선수가 생각할 시간이 필요합니다. <span className="font-bold">{cooldownRemaining}일 후</span> 재협상 가능합니다.
                                </div>
                            )}

                            {/* 제출 버튼 */}
                            <div className="flex-shrink-0 flex gap-3 mt-auto pt-2">
                                {faResult && !faResult.accepted && !cooldownActive && (
                                    <button
                                        onClick={() => setFaResult(null)}
                                        className="flex-1 py-3 rounded-xl text-sm font-bold bg-slate-700 hover:bg-slate-600 text-slate-200 transition-all"
                                    >재협상</button>
                                )}
                                <button
                                    onClick={handleFASubmit}
                                    disabled={slots.length === 0 || faIsBelowWalkaway || cooldownActive}
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
                    {isExt && negState && !negState.signed && (
                        <>
                            {/* 계약 연수 */}
                            <div className="flex-shrink-0 space-y-1.5">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">계약 연수</div>
                                <select
                                    value={extOfferYears}
                                    disabled={isExtDisabled}
                                    onChange={e => {
                                        const y = Number(e.target.value);
                                        setExtOfferYears(y);
                                        setExtOfferSalaries(generateEscalatedSalaries(extOfferSalaries[0] ?? (negState.demand.openingAsk), extEscalateRate, y));
                                    }}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-3 pr-8 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-indigo-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {[1, 2, 3, 4].map(y => (
                                        <option key={y} value={y}>{y}년</option>
                                    ))}
                                </select>
                            </div>

                            {/* 연차별 연봉 */}
                            <div className="flex-shrink-0 space-y-2">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">연차별 연봉</div>
                                {/* 캡% 지정 — 1년차 기준으로 달러 자동 계산 */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-500">캡% 지정</span>
                                        <span className="text-xs font-mono text-indigo-400/80">상한 {(capPct * 100).toFixed(0)}%</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                            <input
                                                type="number"
                                                step={0.1}
                                                min={0}
                                                max={capPct * 100}
                                                value={extCapPctStr}
                                                disabled={isExtDisabled}
                                                onChange={e => setExtCapPctStr(e.target.value)}
                                                onBlur={e => {
                                                    const pct = parseFloat(e.target.value);
                                                    if (!isNaN(pct) && pct > 0) {
                                                        const newSal = Math.round(LEAGUE_FINANCIALS.SALARY_CAP * pct / 100);
                                                        setExtOfferSalaries(generateEscalatedSalaries(newSal, extEscalateRate, extOfferYears));
                                                    } else {
                                                        setExtCapPctStr(extOfferSalaries[0] > 0 ? ((extOfferSalaries[0] / LEAGUE_FINANCIALS.SALARY_CAP) * 100).toFixed(1) : '');
                                                    }
                                                }}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') {
                                                        const pct = parseFloat((e.target as HTMLInputElement).value);
                                                        if (!isNaN(pct) && pct > 0) {
                                                            const newSal = Math.round(LEAGUE_FINANCIALS.SALARY_CAP * pct / 100);
                                                            setExtOfferSalaries(generateEscalatedSalaries(newSal, extEscalateRate, extOfferYears));
                                                        }
                                                    }
                                                }}
                                                className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white text-right focus:outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden disabled:opacity-40 disabled:cursor-not-allowed"
                                            />
                                            <span className="text-xs text-slate-500">%</span>
                                        </div>
                                </div>
                                <div className="space-y-1 border-t border-slate-800 pt-2">
                                    {extOfferSalaries.map((sal, i) => {
                                        const y = currentSeasonYear + i;
                                        const season = `${y}-${String(y + 1).slice(-2)}`;
                                        const isDeclineYear = i > 0 && sal < extOfferSalaries[i - 1];
                                        return (
                                            <div key={i} className="flex items-center gap-1">
                                                <span className="text-xs text-slate-500 whitespace-nowrap flex-shrink-0 w-[88px]">{i + 1}년차 {season}</span>
                                                {[-5_000_000, -1_000_000].map(delta => (
                                                    <button
                                                        key={delta}
                                                        disabled={isExtDisabled}
                                                        onClick={() => {
                                                            const newVal = sal + delta;
                                                            if (i === 0) {
                                                                setExtOfferSalaries(generateEscalatedSalaries(newVal, extEscalateRate, extOfferYears));
                                                            } else {
                                                                const next = [...extOfferSalaries];
                                                                next[i] = newVal;
                                                                setExtOfferSalaries(next);
                                                            }
                                                        }}
                                                        className="text-xs font-mono px-2 py-1.5 rounded bg-slate-700/50 border border-slate-600/60 hover:bg-slate-600/60 hover:border-slate-500/80 text-slate-300 hover:text-white transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-700/50 disabled:hover:border-slate-600/60 disabled:hover:text-slate-300"
                                                    >
                                                        {`-$${Math.abs(delta) / 1_000_000}M`}
                                                    </button>
                                                ))}
                                                <div className="relative flex-1 min-w-0">
                                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">$</span>
                                                    <input
                                                        type="number"
                                                        step={100_000}
                                                        value={sal}
                                                        disabled={isExtDisabled}
                                                        onChange={e => {
                                                            const v = parseInt(e.target.value) || 0;
                                                            if (i === 0) {
                                                                setExtOfferSalaries(generateEscalatedSalaries(v, extEscalateRate, extOfferYears));
                                                            } else {
                                                                const next = [...extOfferSalaries];
                                                                next[i] = v;
                                                                setExtOfferSalaries(next);
                                                            }
                                                        }}
                                                        className={`w-full bg-slate-800 border rounded pl-7 pr-1 py-1.5 text-xs font-mono font-bold text-white focus:outline-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                                            isDeclineYear
                                                                ? 'border-amber-500/60 focus:border-amber-400'
                                                                : 'border-slate-700 focus:border-indigo-500'
                                                        }`}
                                                    />
                                                </div>
                                                {[1_000_000, 5_000_000].map(delta => (
                                                    <button
                                                        key={delta}
                                                        disabled={isExtDisabled}
                                                        onClick={() => {
                                                            const newVal = sal + delta;
                                                            if (i === 0) {
                                                                setExtOfferSalaries(generateEscalatedSalaries(newVal, extEscalateRate, extOfferYears));
                                                            } else {
                                                                const next = [...extOfferSalaries];
                                                                next[i] = newVal;
                                                                setExtOfferSalaries(next);
                                                            }
                                                        }}
                                                        className="text-xs font-mono px-2 py-1.5 rounded bg-slate-700/50 border border-slate-600/60 hover:bg-slate-600/60 hover:border-slate-500/80 text-slate-300 hover:text-white transition-colors flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-slate-700/50 disabled:hover:border-slate-600/60 disabled:hover:text-slate-300"
                                                    >
                                                        {`+$${delta / 1_000_000}M`}
                                                    </button>
                                                ))}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="space-y-1 pt-2 mt-1 border-t border-slate-700/50">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-400 font-semibold">총 계약액</span>
                                        <span className="font-mono font-bold text-white">{fmtM(totalContractValue)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-400">AAV</span>
                                        <span className="font-mono text-white">{fmtM(extOfferAAV)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* 카운터 배너 */}
                            {lastExtResponse?.outcome === 'COUNTER' && (
                                <div className="flex-shrink-0 bg-violet-500/10 border border-violet-500/30 rounded-xl px-4 py-3 text-xs text-violet-300">
                                    카운터 오퍼: {fmtM(lastExtResponse.counterAAV)} / yr · {lastExtResponse.counterYears}년 — 가운데 채팅 확인
                                </div>
                            )}

                            {/* ── 계약 조건 옵션 ── */}
                            <div className="flex-shrink-0">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">계약 조건</div>
                                <div className="divide-y divide-slate-800">
                                    {/* 계약 옵션 (2년 이상일 때) */}
                                    {extOfferYears >= 2 && (
                                        <div className="py-3 space-y-0.5">
                                            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">계약 옵션</div>
                                            {(['none', 'team', 'player'] as const).map(opt => {
                                                const label = opt === 'none' ? '없음' : opt === 'team' ? '팀 옵션' : '선수 옵션';
                                                const active = extContractOption === opt;
                                                return (
                                                    <label key={opt} className={`flex items-center gap-2 py-0.5 ${isExtDisabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer group'}`}>
                                                        <input type="radio" checked={active} onChange={() => setExtContractOption(opt)}
                                                            disabled={isExtDisabled}
                                                            className="w-3 h-3 cursor-pointer appearance-none rounded-full border-2 border-slate-600 bg-slate-950 checked:border-blue-500 checked:bg-blue-500 checked:shadow-[inset_0_0_0_2px_rgb(2,6,23)] transition-colors flex-shrink-0 disabled:cursor-not-allowed" />
                                                        <span className={`text-xs transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>{label}</span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {/* 트레이드 키커 */}
                                    <div className="py-3 space-y-0.5">
                                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">트레이드 키커</div>
                                        {[0, 0.05, 0.10, 0.15].map(pct => {
                                            const label = pct === 0 ? '없음' : `+${(pct * 100).toFixed(0)}%`;
                                            const sub = pct > 0 ? `$${(extOfferAAV * pct / 1_000_000).toFixed(1)}M 추가` : '';
                                            const active = extTradeKicker === pct;
                                            return (
                                                <label key={pct} className={`flex items-center gap-2 py-0.5 ${isExtDisabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer group'}`}>
                                                    <input type="radio" checked={active} onChange={() => setExtTradeKicker(pct)}
                                                        disabled={isExtDisabled}
                                                        className="w-3 h-3 cursor-pointer appearance-none rounded-full border-2 border-slate-600 bg-slate-950 checked:border-blue-500 checked:bg-blue-500 checked:shadow-[inset_0_0_0_2px_rgb(2,6,23)] transition-colors flex-shrink-0 disabled:cursor-not-allowed" />
                                                    <span className={`text-xs transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>{label}</span>
                                                    {sub && <span className="text-xs text-slate-500">{sub}</span>}
                                                </label>
                                            );
                                        })}
                                    </div>
                                    {/* 트레이드 거부권 */}
                                    <div className="py-3 space-y-0.5">
                                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">트레이드 거부권</div>
                                        {[false, true].map(val => {
                                            const active = extNoTrade === val;
                                            return (
                                                <label key={String(val)} className={`flex items-center gap-2 py-0.5 ${isExtDisabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer group'}`}>
                                                    <input type="radio" checked={active} onChange={() => setExtNoTrade(val as boolean)}
                                                        disabled={isExtDisabled}
                                                        className="w-3 h-3 cursor-pointer appearance-none rounded-full border-2 border-slate-600 bg-slate-950 checked:border-blue-500 checked:bg-blue-500 checked:shadow-[inset_0_0_0_2px_rgb(2,6,23)] transition-colors flex-shrink-0 disabled:cursor-not-allowed" />
                                                    <span className={`text-xs transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>{val ? '포함' : '미포함'}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* 제출 버튼 */}
                            <div className="flex-shrink-0 mt-auto pt-2">
                                <button
                                    onClick={handleExtSubmit}
                                    disabled={isExtDisabled}
                                    className="w-full py-3 rounded-xl font-black uppercase tracking-wide text-sm transition-all
                                        bg-indigo-600 hover:bg-indigo-500 text-white
                                        disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
                                >오퍼 제출</button>
                            </div>
                        </>
                    )}



                    {/* ── Release 컨트롤 ── */}
                    {isRel && (
                        <>
                            {/* 방출 방식 */}
                            <div className="flex-shrink-0 space-y-2">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">방출 방식</div>
                                <div className="space-y-0.5">
                                    {([
                                        { mode: 'waive'   as ReleaseType, name: '웨이브',           desc: `잔여 계약 전액 즉시 처리 — ${fmtM(totalRemaining)}`,                              disabled: false },
                                        { mode: 'stretch' as ReleaseType, name: '스트레치 웨이브',  desc: `잔여 금액 분산 처리 — 연간 ${fmtM(Math.round(stretchAnnual))} × ${stretchYearsTotal}년`, disabled: remainingYears <= 1 },
                                        { mode: 'buyout'  as ReleaseType, name: '바이아웃',         desc: `협상 합의금 지급 — 최소 ${fmtM(minBuyoutAmount)}`,                                 disabled: false },
                                    ]).map(({ mode, name, desc, disabled }) => {
                                        const isSelected = releaseMode === mode;
                                        return (
                                            <label key={mode} className={`flex items-start gap-2 py-1 ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer group'}`}>
                                                <input
                                                    type="radio"
                                                    name="releaseMode"
                                                    value={mode}
                                                    checked={isSelected}
                                                    disabled={disabled}
                                                    onChange={() => setReleaseMode(mode)}
                                                    className="mt-0.5 w-3 h-3 cursor-pointer appearance-none rounded-full border-2 border-slate-600 bg-slate-950 checked:border-red-500 checked:bg-red-500 checked:shadow-[inset_0_0_0_2px_rgb(2,6,23)] transition-colors flex-shrink-0 disabled:cursor-not-allowed"
                                                />
                                                <div>
                                                    <span className={`text-xs transition-colors ${isSelected ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>{name}</span>
                                                    <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 바이아웃 금액 */}
                            {releaseMode === 'buyout' && (
                                <div className="flex-shrink-0 space-y-1.5">
                                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400">제시 금액</div>
                                    <div className="flex items-center gap-1">
                                        {[-5_000_000, -1_000_000].map(delta => (
                                            <button
                                                key={delta}
                                                onClick={() => {
                                                    const next = Math.min(totalRemaining, Math.max(minBuyoutAmount, buyoutAmount + delta));
                                                    setBuyoutSlider(Math.round(next / totalRemaining * 100));
                                                }}
                                                className="text-xs font-mono px-2 py-1.5 rounded bg-slate-700/50 border border-slate-600/60 hover:bg-slate-600/60 hover:border-slate-500/80 text-slate-300 hover:text-white transition-colors flex-shrink-0"
                                            >
                                                {`-$${Math.abs(delta) / 1_000_000}M`}
                                            </button>
                                        ))}
                                        <div className="relative flex-1 min-w-0">
                                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">$</span>
                                            <input
                                                type="number"
                                                step={100_000}
                                                value={buyoutAmount}
                                                onChange={e => {
                                                    const v = parseInt(e.target.value) || 0;
                                                    const clamped = Math.min(totalRemaining, Math.max(0, v));
                                                    setBuyoutSlider(Math.round(clamped / totalRemaining * 100));
                                                }}
                                                className="w-full bg-slate-800 border border-slate-700 rounded pl-7 pr-1 py-1.5 text-xs font-mono font-bold text-white focus:outline-none focus:border-red-500"
                                            />
                                        </div>
                                        {[1_000_000, 5_000_000].map(delta => (
                                            <button
                                                key={delta}
                                                onClick={() => {
                                                    const next = Math.min(totalRemaining, Math.max(minBuyoutAmount, buyoutAmount + delta));
                                                    setBuyoutSlider(Math.round(next / totalRemaining * 100));
                                                }}
                                                className="text-xs font-mono px-2 py-1.5 rounded bg-slate-700/50 border border-slate-600/60 hover:bg-slate-600/60 hover:border-slate-500/80 text-slate-300 hover:text-white transition-colors flex-shrink-0"
                                            >
                                                {`+$${delta / 1_000_000}M`}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex justify-between text-xs font-mono text-slate-500">
                                        <span>최소 {fmtM(minBuyoutAmount)}</span>
                                        <span>전액 {fmtM(totalRemaining)}</span>
                                    </div>
                                </div>
                            )}

                            {/* 향후 5년 데드캡 테이블 */}
                            <div className="flex-shrink-0 space-y-2">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">향후 5년 데드캡 영향</div>
                                <div className="rounded-xl border border-slate-700 overflow-hidden">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="bg-slate-800/80">
                                                <th className="text-left px-3 py-2 text-slate-400 font-bold">시즌</th>
                                                <th className="text-right px-3 py-2 text-slate-400 font-bold">기존</th>
                                                <th className="text-right px-3 py-2 text-slate-400 font-bold">추가분</th>
                                                <th className="text-right px-3 py-2 text-slate-400 font-bold">합계</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {deadCapTable.map(({ label, existing, addition, total }, i) => (
                                                <tr key={label} className={`border-t border-slate-700/60 ${i === 0 ? 'bg-slate-800/30' : ''}`}>
                                                    <td className="px-3 py-2 font-mono text-slate-300">{label}</td>
                                                    <td className="px-3 py-2 text-right font-mono text-slate-400">
                                                        {existing > 0 ? fmtM(existing) : <span className="text-slate-600">—</span>}
                                                    </td>
                                                    <td className={`px-3 py-2 text-right font-mono font-bold ${addition > 0 ? 'text-red-400' : 'text-slate-600'}`}>
                                                        {addition > 0 ? `+${fmtM(addition)}` : '—'}
                                                    </td>
                                                    <td className={`px-3 py-2 text-right font-mono font-black ${total > 0 ? 'text-white' : 'text-slate-600'}`}>
                                                        {total > 0 ? fmtM(total) : '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* 방출 확정 버튼 */}
                            <div className="flex-shrink-0 mt-auto pt-1">
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
                    </div>{/* 스크롤 바디 end */}
                </div>

            </div>
        </div>
    );
};
