/**
 * CoachNegotiationScreen — 코치 채용/연장/해고 오버레이
 * 3패널: 좌(코치 정보) | 중(채팅/해고 안내) | 우(오퍼 폼/해고 처리)
 */

import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Coach, StaffRole, CoachAbilities } from '../types/coaching';
import { calcCoachDemandSalary, calcCoachOVR } from '../services/coachingStaff/coachGenerator';
import { TEAM_DATA } from '../data/teamData';
import type { Team } from '../types/team';

// ─── Types ───────────────────────────────────────────────────

interface ChatMsg {
    id: number;
    role: 'gm' | 'coach' | 'status';
    text: string;
    isSuccess?: boolean;
}

export interface CoachNegotiationScreenProps {
    coach: Coach;
    role: StaffRole;
    negotiationType: 'hire' | 'extension' | 'fire';
    myTeam: Team;
    onClose: () => void;
    /** hire/extension: (finalSalary, finalYears) / fire: (buyoutAmount, 0) */
    onAccept: (finalSalary: number, finalYears: number) => void;
}

// ─── Constants ───────────────────────────────────────────────

const ROLE_LABELS: Record<StaffRole, string> = {
    headCoach: '감독', offenseCoordinator: '공격 코치',
    defenseCoordinator: '수비 코치', developmentCoach: '디벨롭먼트',
    trainingCoach: '트레이닝 코치',
};

const ABILITY_SHORT: Record<keyof CoachAbilities, string> = {
    teaching: '지도', schemeDepth: '전술', communication: '소통', playerEval: '평가',
    motivation: '동기', playerRelation: '관계', adaptability: '적응',
    developmentVision: '성장', experienceTransfer: '전수', mentalCoaching: '멘탈',
    athleticTraining: '신체', recovery: '회복', conditioning: '컨디',
};

const ROLE_KEY_ABILITIES: Record<StaffRole, (keyof CoachAbilities)[]> = {
    headCoach:          ['teaching', 'schemeDepth', 'motivation', 'communication'],
    offenseCoordinator: ['schemeDepth', 'communication', 'playerEval', 'adaptability'],
    defenseCoordinator: ['adaptability', 'mentalCoaching', 'schemeDepth', 'playerRelation'],
    developmentCoach:   ['developmentVision', 'experienceTransfer', 'teaching', 'mentalCoaching'],
    trainingCoach:      ['athleticTraining', 'recovery', 'conditioning', 'motivation'],
};

const COACH_COUNTER_MSGS = [
    '{demand}이면 고려해볼 수 있습니다.',
    '{demand} 정도라면 생각해보겠습니다.',
    '제 가치를 더 인정해주셨으면 합니다. {demand}을 제안합니다.',
    '솔직히 말씀드리면, {demand}는 받아야 합니다.',
];

const COACH_ACCEPT_MSGS = [
    '좋습니다. 함께하죠.',
    '계약하겠습니다. 기대에 부응하겠습니다.',
    '이 조건이면 충분합니다. 잘 부탁드립니다.',
    '좋은 결정입니다. 열심히 하겠습니다.',
];

const COACH_REJECT_MSGS = [
    '죄송합니다. 이 조건으로는 계약하기 어렵습니다.',
    '저를 충분히 인정해주지 않는 것 같습니다.',
    '다른 팀을 알아보겠습니다.',
];

const MAX_ROUNDS = 3;
const MIN_BUYOUT_PCT = 50; // 바이아웃 최소 50%

// ─── Helpers ─────────────────────────────────────────────────

function fmtM(v: number): string {
    return `$${(v / 1_000_000).toFixed(1)}M`;
}

function abilityColor(v: number): string {
    if (v >= 7) return 'text-emerald-400';
    if (v >= 5) return 'text-amber-400';
    return 'text-rose-400';
}

function abilityBarColor(v: number): string {
    if (v >= 7) return '#34d399';
    if (v >= 5) return '#fbbf24';
    return '#f87171';
}

function pickMsg(arr: string[], seed: number): string {
    return arr[seed % arr.length];
}

function evaluateOffer(
    offerSalary: number,
    demandSalary: number,
    round: number,
): 'accept' | 'counter' | 'reject' {
    const ratio = offerSalary / demandSalary;
    if (ratio >= 0.95) return 'accept';
    if (round >= MAX_ROUNDS - 1) {
        return ratio >= 0.82 ? 'accept' : 'reject';
    }
    if (ratio >= 0.78) return 'counter';
    return 'reject';
}

// ─── Component ───────────────────────────────────────────────

export const CoachNegotiationScreen: React.FC<CoachNegotiationScreenProps> = ({
    coach, role, negotiationType, myTeam, onClose, onAccept,
}) => {
    const primaryColor = TEAM_DATA[myTeam.id]?.colors?.primary ?? '#4f46e5';
    const ovr = calcCoachOVR(coach, role);
    const isFire = negotiationType === 'fire';

    // ── 협상 모드 state ──
    const baseDemand = isFire ? 0 : calcCoachDemandSalary(coach, role, negotiationType === 'extension' ? 'extension' : 'fa');
    const [offerSalary, setOfferSalary] = useState(() => isFire ? 0 : Math.round(baseDemand * 0.82));
    const [offerYears, setOfferYears] = useState(3);
    const [round, setRound] = useState(0);
    const [currentDemand, setCurrentDemand] = useState(baseDemand);
    const [phase, setPhase] = useState<'negotiating' | 'accepted' | 'rejected'>('negotiating');
    const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
    const idRef = useRef(0);
    const chatEndRef = useRef<HTMLDivElement>(null);

    // ── 해고 모드 state ──
    const totalRemaining = isFire ? coach.contractSalary * coach.contractYearsRemaining : 0;
    const minBuyout = Math.round(totalRemaining * MIN_BUYOUT_PCT / 100);
    const [fireMode, setFireMode] = useState<'waive' | 'buyout'>('waive');
    const [buyoutAmount, setBuyoutAmount] = useState(() => Math.round(totalRemaining * 0.70));
    const fireCost = fireMode === 'waive' ? totalRemaining : buyoutAmount;
    const buyoutValid = buyoutAmount >= minBuyout;

    const nextId = () => { idRef.current += 1; return idRef.current; };

    const addMsg = (msgRole: ChatMsg['role'], text: string, isSuccess?: boolean) => {
        setChatMessages(prev => [...prev, { id: nextId(), role: msgRole, text, isSuccess }]);
    };

    // 초기 인사 (협상 모드만)
    useEffect(() => {
        if (isFire) return;
        const msgs: ChatMsg[] = [];
        if (negotiationType === 'hire') {
            msgs.push({ id: nextId(), role: 'gm', text: `${coach.name}, 우리 팀에 합류해주셨으면 합니다. 조건을 제안드릴게요.` });
            msgs.push({ id: nextId(), role: 'coach', text: `${fmtM(baseDemand)}, ${coach.contractYears}년 계약을 원합니다.` });
        } else {
            msgs.push({ id: nextId(), role: 'gm', text: `${coach.name}, 계약 연장 협상을 하러 왔습니다. 앞으로도 함께하면 좋겠습니다.` });
            msgs.push({ id: nextId(), role: 'coach', text: `${fmtM(baseDemand)}, ${offerYears}년 계약이면 고려해보겠습니다.` });
        }
        setChatMessages(msgs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 자동 스크롤
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    const handleSubmitOffer = () => {
        if (phase !== 'negotiating') return;

        addMsg('gm', `${fmtM(offerSalary)}, ${offerYears}년 계약을 제안합니다.`);

        const result = evaluateOffer(offerSalary, currentDemand, round);

        setTimeout(() => {
            if (result === 'accept') {
                addMsg('coach', pickMsg(COACH_ACCEPT_MSGS, round + Math.floor(offerSalary / 1_000_000)), true);
                setTimeout(() => {
                    addMsg('status', `계약 성사: ${fmtM(offerSalary)}/년 × ${offerYears}년 = 총 ${fmtM(offerSalary * offerYears)}`, true);
                    setPhase('accepted');
                }, 500);
            } else if (result === 'reject') {
                addMsg('coach', pickMsg(COACH_REJECT_MSGS, round));
                setTimeout(() => {
                    addMsg('status', '협상 결렬. 코치가 오퍼를 거절했습니다.');
                    setPhase('rejected');
                }, 500);
            } else {
                const ratio = offerSalary / currentDemand;
                const newDemand = ratio >= 0.88
                    ? Math.round(currentDemand * 0.97)
                    : currentDemand;
                const counterText = pickMsg(COACH_COUNTER_MSGS, round)
                    .replace('{demand}', fmtM(newDemand));
                addMsg('coach', counterText);
                setCurrentDemand(newDemand);
                setRound(prev => prev + 1);
            }
        }, 400);
    };

    const ratio = offerSalary / currentDemand;
    const sliderMin = Math.round(baseDemand * 0.60);
    const sliderMax = Math.round(baseDemand * 1.30);
    const keyAbilities = ROLE_KEY_ABILITIES[role];

    // 배지
    const typeBadgeLabel = isFire ? '코치 해고' : negotiationType === 'hire' ? 'FA 영입' : '계약 연장';
    const typeBadgeClass = isFire
        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
        : negotiationType === 'hire'
            ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
            : 'bg-violet-500/20 text-violet-400 border border-violet-500/30';

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 animate-in fade-in duration-300">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${typeBadgeClass}`}>
                        {typeBadgeLabel}
                    </span>
                    <span className="text-sm font-black text-white">{coach.name}</span>
                    <span className="text-xs text-slate-500">{ROLE_LABELS[role]}</span>
                </div>
                <button
                    onClick={onClose}
                    className="w-7 h-7 rounded-md bg-slate-800 hover:bg-slate-700 transition-colors flex items-center justify-center text-slate-400"
                >
                    <X size={14} />
                </button>
            </div>

            {/* 3패널 바디 */}
            <div className="flex-1 min-h-0 flex">

                {/* ── 좌: 코치 정보 ── */}
                <div className="w-[220px] flex-shrink-0 border-r border-slate-800 bg-slate-950 flex flex-col overflow-y-auto">
                    {/* OVR + 역할 */}
                    <div className="px-5 pt-6 pb-4 border-b border-slate-800">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                {ROLE_LABELS[role]}
                            </span>
                            <span className={`text-2xl font-black font-mono tabular-nums ${abilityColor(ovr)}`}>
                                {ovr}
                            </span>
                        </div>
                        <div className="text-sm font-black text-white leading-tight mt-1">{coach.name}</div>
                        <div className="mt-2">
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${typeBadgeClass}`}>
                                {typeBadgeLabel}
                            </span>
                        </div>
                    </div>

                    {/* 핵심 능력치 */}
                    <div className="px-5 py-4 border-b border-slate-800">
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3">핵심 능력치</div>
                        <div className="flex flex-col gap-2">
                            {keyAbilities.map(k => (
                                <div key={k} className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] text-slate-400 w-8 shrink-0">{ABILITY_SHORT[k]}</span>
                                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all"
                                            style={{
                                                width: `${(coach.abilities[k] / 10) * 100}%`,
                                                backgroundColor: abilityBarColor(coach.abilities[k]),
                                            }}
                                        />
                                    </div>
                                    <span className={`text-[10px] font-black font-mono tabular-nums w-4 text-right shrink-0 ${abilityColor(coach.abilities[k])}`}>
                                        {coach.abilities[k]}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 계약 정보 */}
                    <div className="px-5 py-4">
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">
                            {isFire ? '현재 계약' : negotiationType === 'extension' ? '연장 요구 조건' : '요구 조건'}
                        </div>
                        {negotiationType === 'extension' && (
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="text-[10px] text-slate-500">현재 연봉</span>
                                <span className="text-[10px] font-mono text-slate-400">{fmtM(coach.contractSalary)}</span>
                            </div>
                        )}
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-slate-400">{isFire ? '연봉' : '요구 연봉'}</span>
                            <span className="text-xs font-black font-mono text-emerald-400">{fmtM(coach.contractSalary)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400">{isFire ? '잔여 계약' : '요구 계약'}</span>
                            <span className="text-[10px] font-mono text-slate-300">{isFire ? coach.contractYearsRemaining : coach.contractYears}년</span>
                        </div>
                        {isFire && (
                            <div className="mt-3 pt-3 border-t border-slate-800">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-slate-400">잔여 총액</span>
                                    <span className="text-xs font-black font-mono text-rose-400">{fmtM(totalRemaining)}</span>
                                </div>
                            </div>
                        )}
                        {negotiationType === 'extension' && (
                            <div className="mt-2 text-[9px] text-slate-600">
                                * 현재 연봉 대비 10% 할인 적용
                            </div>
                        )}
                    </div>
                </div>

                {/* ── 중: 채팅 or 해고 안내 ── */}
                {isFire ? (
                    /* 해고 안내 패널 */
                    <div className="flex-1 min-w-0 flex flex-col bg-slate-950 px-6 py-8 gap-5 overflow-y-auto">
                        <div className="flex flex-col gap-1">
                            <div className="text-lg font-black text-white">{coach.name}</div>
                            <div className="text-xs text-slate-500">{ROLE_LABELS[role]} · 계약 잔여 {coach.contractYearsRemaining}년</div>
                        </div>

                        {/* 해고 안내 메시지 */}
                        <div className="bg-red-950/30 border border-red-500/20 rounded-xl px-4 py-4">
                            <div className="text-xs font-black text-red-400 uppercase tracking-wider mb-2">해고 통보</div>
                            <p className="text-xs text-slate-300 leading-relaxed">
                                {coach.name}과의 계약을 해지합니다.
                                잔여 계약 {coach.contractYearsRemaining}년({fmtM(totalRemaining)})에 대한 위로금을 지급해야 합니다.
                            </p>
                        </div>

                        {/* 위로금 요약 */}
                        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-4 flex flex-col gap-3">
                            <div className="text-xs font-black uppercase tracking-wider text-slate-400">위로금 요약</div>
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-slate-500">연봉</span>
                                    <span className="text-xs font-mono text-slate-300">{fmtM(coach.contractSalary)}/년</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-slate-500">잔여 기간</span>
                                    <span className="text-xs font-mono text-slate-300">{coach.contractYearsRemaining}년</span>
                                </div>
                                <div className="border-t border-slate-800 pt-2 flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-300">잔여 총액</span>
                                    <span className="text-sm font-black font-mono text-rose-400">{fmtM(totalRemaining)}</span>
                                </div>
                            </div>
                        </div>

                        {/* 해고 방식별 설명 */}
                        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-4 flex flex-col gap-2">
                            <div className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">방식별 비교</div>
                            <div className="flex items-start gap-2">
                                <div className={`w-2 h-2 mt-1 rounded-full flex-shrink-0 ${fireMode === 'waive' ? 'bg-rose-400' : 'bg-slate-600'}`} />
                                <div>
                                    <div className="text-xs font-bold text-slate-300">웨이브</div>
                                    <div className="text-[10px] text-slate-500">잔여 계약 전액 즉시 지급 — {fmtM(totalRemaining)}</div>
                                </div>
                            </div>
                            <div className="flex items-start gap-2">
                                <div className={`w-2 h-2 mt-1 rounded-full flex-shrink-0 ${fireMode === 'buyout' ? 'bg-amber-400' : 'bg-slate-600'}`} />
                                <div>
                                    <div className="text-xs font-bold text-slate-300">바이아웃</div>
                                    <div className="text-[10px] text-slate-500">합의 위로금 지급 — 최소 {fmtM(minBuyout)} ({MIN_BUYOUT_PCT}%)</div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* 협상 채팅 패널 */
                    <div className="flex-1 min-w-0 flex flex-col bg-slate-950">
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 py-4 flex flex-col gap-3">
                            {chatMessages.map(msg => (
                                <div
                                    key={msg.id}
                                    className={`flex ${msg.role === 'gm' ? 'justify-end' : msg.role === 'status' ? 'justify-center' : 'justify-start'}`}
                                >
                                    {msg.role === 'status' ? (
                                        <div className={`px-3 py-1.5 rounded-full text-xs font-bold ${msg.isSuccess ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'}`}>
                                            {msg.text}
                                        </div>
                                    ) : msg.role === 'gm' ? (
                                        <div className="max-w-[75%]">
                                            <div className="text-[9px] font-black uppercase tracking-wider text-slate-500 text-right mb-0.5">GM</div>
                                            <div
                                                className="px-3 py-2 rounded-xl rounded-br-sm text-xs text-white"
                                                style={{ backgroundColor: primaryColor + '40', border: `1px solid ${primaryColor}50` }}
                                            >
                                                {msg.text}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="max-w-[75%]">
                                            <div className="text-[9px] font-black uppercase tracking-wider text-slate-500 mb-0.5">
                                                {coach.name}
                                            </div>
                                            <div className="px-3 py-2 rounded-xl rounded-bl-sm text-xs text-slate-200 bg-slate-800 border border-slate-700">
                                                {msg.text}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div ref={chatEndRef} />
                        </div>

                        {/* 결과 바 */}
                        {phase === 'accepted' && (
                            <div className="px-5 py-3 border-t border-slate-800 bg-emerald-950/30 flex items-center justify-between gap-3 flex-shrink-0">
                                <span className="text-xs text-emerald-300 font-bold">계약이 성사되었습니다.</span>
                                <button
                                    onClick={() => onAccept(offerSalary, offerYears)}
                                    className="px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                                >
                                    계약 체결
                                </button>
                            </div>
                        )}
                        {phase === 'rejected' && (
                            <div className="px-5 py-3 border-t border-slate-800 bg-red-950/30 flex items-center justify-between gap-3 flex-shrink-0">
                                <span className="text-xs text-red-300 font-bold">협상이 결렬되었습니다.</span>
                                <button
                                    onClick={onClose}
                                    className="px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                                >
                                    닫기
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ── 우: 오퍼 폼 or 해고 처리 ── */}
                <div className="w-[240px] flex-shrink-0 border-l border-slate-800 bg-slate-900 flex flex-col">
                    {isFire ? (
                        /* 해고 처리 패널 */
                        <>
                            <div className="px-4 py-3 border-b border-slate-800">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">해고 처리</div>
                            </div>
                            <div className="flex-1 px-4 py-4 flex flex-col gap-4 overflow-y-auto">
                                {/* 해고 방식 */}
                                <div className="flex flex-col gap-1.5">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">위로금 방식</div>
                                    {[
                                        { mode: 'waive' as const, name: '웨이브', desc: `잔여 전액 즉시 지급`, amount: totalRemaining },
                                        { mode: 'buyout' as const, name: '바이아웃', desc: `합의 위로금 지급`, amount: buyoutAmount },
                                    ].map(({ mode, name, desc, amount }) => {
                                        const isSelected = fireMode === mode;
                                        return (
                                            <label key={mode} className="flex items-center gap-2 py-1 cursor-pointer group">
                                                <input
                                                    type="radio"
                                                    name="fireMode"
                                                    value={mode}
                                                    checked={isSelected}
                                                    onChange={() => setFireMode(mode)}
                                                    className="w-3 h-3 cursor-pointer appearance-none rounded-full border-2 border-slate-600 bg-slate-950 checked:border-rose-500 checked:bg-rose-500 checked:shadow-[inset_0_0_0_2px_rgb(2,6,23)] transition-colors flex-shrink-0"
                                                />
                                                <div>
                                                    <span className={`text-xs font-bold transition-colors ${isSelected ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>{name}</span>
                                                    <div className="text-[10px] text-slate-500 mt-0.5">{desc} — <span className="text-rose-400 font-mono font-bold">{fmtM(amount)}</span></div>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>

                                {/* 바이아웃 금액 조정 */}
                                {fireMode === 'buyout' && (
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center justify-between">
                                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">위로금</div>
                                            <div className="text-sm font-black font-mono text-rose-400">{fmtM(buyoutAmount)}</div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {[-500_000, -1_000_000].map(delta => (
                                                <button
                                                    key={delta}
                                                    onClick={() => setBuyoutAmount(prev => Math.max(minBuyout, Math.min(totalRemaining, prev + delta)))}
                                                    className="text-xs font-mono px-2 py-1 rounded bg-slate-700/50 border border-slate-600/60 hover:bg-slate-600/60 text-slate-300 hover:text-white transition-colors flex-shrink-0"
                                                >
                                                    {`-$${Math.abs(delta) / 1_000_000}M`}
                                                </button>
                                            ))}
                                            <input
                                                type="range"
                                                min={minBuyout}
                                                max={totalRemaining}
                                                step={100_000}
                                                value={buyoutAmount}
                                                onChange={e => setBuyoutAmount(Number(e.target.value))}
                                                className="flex-1 accent-rose-500"
                                            />
                                            {[500_000, 1_000_000].map(delta => (
                                                <button
                                                    key={delta}
                                                    onClick={() => setBuyoutAmount(prev => Math.max(minBuyout, Math.min(totalRemaining, prev + delta)))}
                                                    className="text-xs font-mono px-2 py-1 rounded bg-slate-700/50 border border-slate-600/60 hover:bg-slate-600/60 text-slate-300 hover:text-white transition-colors flex-shrink-0"
                                                >
                                                    {`+$${delta / 1_000_000}M`}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="flex justify-between text-[9px] text-slate-600">
                                            <span>최소 {fmtM(minBuyout)} ({MIN_BUYOUT_PCT}%)</span>
                                            <span>전액 {fmtM(totalRemaining)}</span>
                                        </div>
                                        {!buyoutValid && (
                                            <div className="text-[10px] text-red-400">최소 {MIN_BUYOUT_PCT}% 이상 지급해야 합니다.</div>
                                        )}
                                    </div>
                                )}

                                {/* 위로금 요약 박스 */}
                                <div className={`rounded-xl px-3 py-3 flex flex-col gap-1.5 ${isFire ? 'bg-red-950/20 border border-red-500/20' : 'bg-slate-800'}`}>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-slate-400">방식</span>
                                        <span className="text-xs font-mono text-slate-300">{fireMode === 'waive' ? '웨이브' : '바이아웃'}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-slate-400">위로금</span>
                                        <span className="text-sm font-black font-mono text-rose-400">{fmtM(fireCost)}</span>
                                    </div>
                                    <div className="flex items-center justify-between border-t border-slate-700/50 pt-1.5 mt-0.5">
                                        <span className="text-[10px] text-slate-500">전체 대비</span>
                                        <span className="text-[10px] font-mono text-slate-400">
                                            {totalRemaining > 0 ? `${Math.round(fireCost / totalRemaining * 100)}%` : '–'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="px-4 pb-4 flex-shrink-0 flex flex-col gap-2">
                                <button
                                    onClick={() => onAccept(fireCost, 0)}
                                    disabled={fireMode === 'buyout' && !buyoutValid}
                                    className="w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wide bg-rose-600 hover:bg-rose-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    해고 확정 — {fmtM(fireCost)}
                                </button>
                                <button
                                    onClick={onClose}
                                    className="w-full py-2 rounded-xl text-xs font-black uppercase tracking-wide bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors"
                                >
                                    취소
                                </button>
                            </div>
                        </>
                    ) : (
                        /* 협상 오퍼 폼 */
                        <>
                            <div className="px-4 py-3 border-b border-slate-800">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">계약 제안</div>
                            </div>

                            <div className="flex-1 px-4 py-4 flex flex-col gap-4 overflow-y-auto">
                                {/* 계약 기간 */}
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">계약 기간</div>
                                    <div className="flex gap-1.5">
                                        {[2, 3, 4].map(y => (
                                            <button
                                                key={y}
                                                onClick={() => setOfferYears(y)}
                                                disabled={phase !== 'negotiating'}
                                                className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-colors disabled:opacity-50 ${
                                                    offerYears === y
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                                }`}
                                            >
                                                {y}년
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* 연봉 슬라이더 */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">연봉/년</div>
                                        <div className="text-sm font-black font-mono text-white">{fmtM(offerSalary)}</div>
                                    </div>
                                    <input
                                        type="range"
                                        min={sliderMin}
                                        max={sliderMax}
                                        step={50_000}
                                        value={offerSalary}
                                        onChange={e => setOfferSalary(Number(e.target.value))}
                                        disabled={phase !== 'negotiating'}
                                        className="w-full accent-indigo-500 disabled:opacity-50"
                                    />
                                    <div className="flex justify-between text-[9px] text-slate-600 mt-1">
                                        <span>{fmtM(sliderMin)}</span>
                                        <span>{fmtM(sliderMax)}</span>
                                    </div>
                                </div>

                                {/* 요약 */}
                                <div className="bg-slate-800 rounded-xl px-3 py-3 flex flex-col gap-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-slate-400">총액</span>
                                        <span className="text-xs font-mono text-slate-300">{fmtM(offerSalary * offerYears)}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-slate-400">요구 대비</span>
                                        <span className={`text-[10px] font-black font-mono ${
                                            ratio >= 0.95 ? 'text-emerald-400' : ratio >= 0.82 ? 'text-amber-400' : 'text-rose-400'
                                        }`}>
                                            {(ratio * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                    {round > 0 && (
                                        <div className="flex items-center justify-between border-t border-slate-700 pt-1.5 mt-0.5">
                                            <span className="text-[10px] text-slate-500">협상 라운드</span>
                                            <span className="text-[10px] font-mono text-slate-400">{round} / {MAX_ROUNDS}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="text-[9px] text-slate-600 text-center">
                                    현재 요구: {fmtM(currentDemand)} / {coach.contractYears}년
                                </div>
                            </div>

                            <div className="px-4 pb-4 flex-shrink-0">
                                <button
                                    onClick={handleSubmitOffer}
                                    disabled={phase !== 'negotiating'}
                                    className="w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wide bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {phase === 'negotiating' ? '오퍼 제출' : phase === 'accepted' ? '수락됨' : '거절됨'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
