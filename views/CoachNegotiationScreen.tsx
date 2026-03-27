/**
 * CoachNegotiationScreen — 코치 채용/연장 오버레이
 * NegotiationScreen과 동일한 3패널 디자인: 좌(코치정보) | 중(대화록) | 우(오퍼폼)  —  비율 2:5:3
 */

import React, { useState, useRef, useEffect } from 'react';
import type { Coach, StaffRole, CoachAbilities, HeadCoachPreferences } from '../types/coaching';
import { calcCoachDemandSalary, calcCoachOVR } from '../services/coachingStaff/coachGenerator';
import { formatMoney } from '../utils/formatMoney';
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
    negotiationType: 'hire' | 'extension';
    myTeam: Team;
    userNickname?: string;
    onClose: () => void;
    onAccept: (finalSalary: number, finalYears: number) => void;
}

// ─── Constants ───────────────────────────────────────────────

const ROLE_LABELS: Record<StaffRole, string> = {
    headCoach: '감독', offenseCoordinator: '공격 코치',
    defenseCoordinator: '수비 코치', developmentCoach: '디벨롭먼트',
    trainingCoach: '트레이닝 코치',
};

const ABILITY_LABELS: Record<keyof CoachAbilities, string> = {
    teaching: '지도', schemeDepth: '전술', communication: '소통', playerEval: '평가',
    motivation: '동기', playerRelation: '관계', adaptability: '적응',
    developmentVision: '성장', experienceTransfer: '전수', mentalCoaching: '멘탈',
    athleticTraining: '신체', recovery: '회복', conditioning: '컨디',
};

const PREF_LABELS: Record<keyof HeadCoachPreferences, [string, string]> = {
    offenseIdentity: ['히어로볼', '시스템농구'],
    tempo:           ['하프코트', '런앤건'],
    scoringFocus:    ['페인트존', '3점라인'],
    pnrEmphasis:     ['ISO/포스트', 'PnR헤비'],
    defenseStyle:    ['보수적 대인', '공격적 프레셔'],
    helpScheme:      ['1:1 고수', '헬프로테이션'],
    zonePreference:  ['대인 전용', '존 위주'],
};

const ALL_STAFF_ROLES: StaffRole[] = [
    'headCoach', 'offenseCoordinator', 'defenseCoordinator', 'developmentCoach', 'trainingCoach',
];

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

// ─── Helpers ─────────────────────────────────────────────────

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

function evaluateOffer(offerSalary: number, demandSalary: number, round: number): 'accept' | 'counter' | 'reject' {
    const ratio = offerSalary / demandSalary;
    if (ratio >= 0.95) return 'accept';
    if (round >= MAX_ROUNDS - 1) return ratio >= 0.82 ? 'accept' : 'reject';
    if (ratio >= 0.78) return 'counter';
    return 'reject';
}

// ─── Component ───────────────────────────────────────────────

export const CoachNegotiationScreen: React.FC<CoachNegotiationScreenProps> = ({
    coach, role, negotiationType, myTeam, userNickname, onClose, onAccept,
}) => {
    const primaryColor = TEAM_DATA[myTeam.id]?.colors?.primary ?? '#4f46e5';
    const gmName = userNickname ?? 'GM';
    const negotiationMode = negotiationType === 'extension' ? 'extension' : 'fa';

    const [offerRole, setOfferRole] = useState<StaffRole>(role);
    const baseDemandForRole = (r: StaffRole) => calcCoachDemandSalary(coach, r, negotiationMode);

    const [offerSalary, setOfferSalary] = useState(() => Math.round(baseDemandForRole(role) * 0.82));
    const [offerYears, setOfferYears] = useState(3);
    const [round, setRound] = useState(0);
    const [currentDemand, setCurrentDemand] = useState(() => baseDemandForRole(role));
    const [phase, setPhase] = useState<'negotiating' | 'accepted' | 'rejected'>('negotiating');
    const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
    const idRef = useRef(0);
    const chatEndRef = useRef<HTMLDivElement>(null);

    const nextId = () => { idRef.current += 1; return idRef.current; };
    const addMsg = (msgRole: ChatMsg['role'], text: string, isSuccess?: boolean) =>
        setChatMessages(prev => [...prev, { id: nextId(), role: msgRole, text, isSuccess }]);

    // 초기 인사
    useEffect(() => {
        const bd = baseDemandForRole(role);
        const msgs: ChatMsg[] = [];
        if (negotiationType === 'hire') {
            msgs.push({ id: nextId(), role: 'gm', text: `${coach.name}, 우리 팀에 합류해주셨으면 합니다. 조건을 제안드릴게요.` });
            msgs.push({ id: nextId(), role: 'coach', text: `${formatMoney(bd)}, ${coach.contractYears}년 계약을 원합니다.` });
        } else {
            msgs.push({ id: nextId(), role: 'gm', text: `${coach.name}, 계약 연장 협상을 하러 왔습니다. 앞으로도 함께하면 좋겠습니다.` });
            msgs.push({ id: nextId(), role: 'coach', text: `${formatMoney(bd)}, ${offerYears}년 계약이면 고려해보겠습니다.` });
        }
        setChatMessages(msgs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 자동 스크롤
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    const handleRoleChange = (newRole: StaffRole) => {
        if (round > 0) return;
        setOfferRole(newRole);
        const nd = baseDemandForRole(newRole);
        setCurrentDemand(nd);
        setOfferSalary(Math.round(nd * 0.82));
    };

    const handleSubmitOffer = () => {
        if (phase !== 'negotiating') return;
        addMsg('gm', `${formatMoney(offerSalary)}, ${offerYears}년 계약을 제안합니다.`);
        const result = evaluateOffer(offerSalary, currentDemand, round);
        setTimeout(() => {
            if (result === 'accept') {
                addMsg('coach', pickMsg(COACH_ACCEPT_MSGS, round + Math.floor(offerSalary / 1_000_000)), true);
                setTimeout(() => {
                    addMsg('status', `계약 성사: ${formatMoney(offerSalary)}/년 × ${offerYears}년 = 총 ${formatMoney(offerSalary * offerYears)}`, true);
                    setPhase('accepted');
                }, 500);
            } else if (result === 'reject') {
                addMsg('coach', pickMsg(COACH_REJECT_MSGS, round));
                setTimeout(() => {
                    addMsg('status', '협상 결렬. 코치가 오퍼를 거절했습니다.', false);
                    setPhase('rejected');
                }, 500);
            } else {
                const ratio = offerSalary / currentDemand;
                const newDemand = ratio >= 0.88 ? Math.round(currentDemand * 0.97) : currentDemand;
                addMsg('coach', pickMsg(COACH_COUNTER_MSGS, round).replace('{demand}', formatMoney(newDemand)));
                setCurrentDemand(newDemand);
                setRound(prev => prev + 1);
            }
        }, 400);
    };

    const baseDemand = baseDemandForRole(offerRole);
    const salaryMin = Math.round(baseDemand * 0.55);
    const salaryMax = Math.round(baseDemand * 1.40);
    const salaryStep = 100_000;

    const adjustSalary = (delta: number) =>
        setOfferSalary(s => Math.max(salaryMin, Math.min(salaryMax, s + delta)));

    return (
        <div className="absolute inset-0 z-50 bg-slate-950 flex flex-col text-slate-200 animate-in fade-in duration-200">

            {/* ── 헤더 ── */}
            <div className="flex-shrink-0 h-12 px-5 border-b border-slate-800 bg-slate-950 flex items-center gap-3">
                <button
                    onClick={onClose}
                    className="flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-white transition-colors flex-shrink-0"
                >
                    <span>←</span>
                    <span>뒤로</span>
                </button>
            </div>

            {/* ── 3패널 메인 ── */}
            <div className="flex-1 flex overflow-hidden min-h-0 p-3 gap-3">

                {/* ── 좌: 코치 정보 ── */}
                <div className="flex-[2] min-w-0 rounded-2xl border border-slate-800 bg-slate-900/40 flex flex-col overflow-hidden">

                    <div className="flex-shrink-0 px-4 py-2" style={{ backgroundColor: primaryColor }}>
                        <span className="text-sm font-bold text-white">코치 정보</span>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">

                        {/* 이름 + 직전 연봉/요구 조건 */}
                        <div className="px-4 pt-4 pb-3 border-b border-slate-800">
                            <div className="text-base font-black text-white ko-tight leading-tight mb-2">{coach.name}</div>
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="text-xs">
                                    <span className="text-slate-500">직전 연봉 </span>
                                    <span className="font-mono text-slate-300">{formatMoney(coach.contractSalary)}</span>
                                </div>
                                <div className="w-px h-3 bg-slate-700" />
                                <div className="text-xs">
                                    <span className="text-slate-500">요구 </span>
                                    <span className="font-mono font-bold text-emerald-400">{formatMoney(baseDemandForRole(offerRole))}</span>
                                </div>
                            </div>
                        </div>

                        {/* 능력치 (전체, 슬라이더) */}
                        <div className="px-4 py-3 space-y-1.5">
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">능력치</div>
                            {(Object.entries(coach.abilities) as [keyof CoachAbilities, number][]).map(([key, val]) => (
                                <div key={key} className="flex items-center gap-2 text-xs">
                                    <span className="text-slate-500 flex-shrink-0 w-8">{ABILITY_LABELS[key]}</span>
                                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full"
                                            style={{ width: `${(val / 10) * 100}%`, backgroundColor: abilityBarColor(val) }}
                                        />
                                    </div>
                                    <span className={`font-mono font-bold w-4 text-right flex-shrink-0 ${abilityColor(val)}`}>{val}</span>
                                </div>
                            ))}
                        </div>

                        {/* 전술 선호도 */}
                        {coach.preferences && (
                            <div className="px-4 py-3 space-y-1.5 border-t border-slate-800">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">전술 선호도</div>
                                {(Object.entries(coach.preferences) as [keyof HeadCoachPreferences, number][]).map(([key, val]) => {
                                    const [lo, hi] = PREF_LABELS[key];
                                    return (
                                        <div key={key} className="text-xs space-y-0.5">
                                            <div className="flex justify-between text-[10px] text-slate-600">
                                                <span>{lo}</span><span>{hi}</span>
                                            </div>
                                            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-indigo-500/70"
                                                    style={{ width: `${(val / 10) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* 현재 계약 (별도 하위 섹션) */}
                        <div className="px-4 py-3 border-t border-slate-800 space-y-1">
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">현재 계약</div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">직전 연봉</span>
                                <span className="font-mono text-slate-300">{formatMoney(coach.contractSalary)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-500">계약 기간</span>
                                <span className="font-mono text-slate-300">{coach.contractYears}년</span>
                            </div>
                        </div>

                    </div>
                </div>

                {/* ── 중앙: 협상 대화록 ── */}
                <div className="flex-[5] min-w-0 rounded-2xl border border-slate-800 bg-slate-900/40 flex flex-col overflow-hidden">

                    <div className="flex-shrink-0 px-4 py-2" style={{ backgroundColor: primaryColor }}>
                        <span className="text-sm font-bold text-white">협상 대화록</span>
                    </div>

                    {/* 메시지 목록 */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                        {chatMessages.map(msg => {
                            if (msg.role === 'status') {
                                if (msg.isSuccess) {
                                    return (
                                        <div key={msg.id} className="flex flex-col items-center gap-2">
                                            <span className="text-xs text-emerald-400 font-bold text-center">{msg.text}</span>
                                            <button
                                                onClick={() => onAccept(offerSalary, offerYears)}
                                                className="px-6 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                                            >계약 체결</button>
                                        </div>
                                    );
                                }
                                return (
                                    <div key={msg.id} className="flex flex-col items-center gap-2">
                                        <span className="text-xs text-slate-500 italic">{msg.text}</span>
                                        <button
                                            onClick={onClose}
                                            className="px-6 py-1.5 rounded-lg text-xs font-bold bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                                        >닫기</button>
                                    </div>
                                );
                            }
                            if (msg.role === 'gm') {
                                return (
                                    <div key={msg.id} className="flex flex-col items-end gap-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
                                        <span className="text-xs font-bold text-indigo-400 px-1">{gmName}</span>
                                        <div className="max-w-[85%] bg-indigo-600/20 border border-indigo-500/30 rounded-2xl rounded-br-sm px-4 py-3">
                                            <p className="text-sm text-white leading-relaxed">{msg.text}</p>
                                        </div>
                                    </div>
                                );
                            }
                            return (
                                <div key={msg.id} className="flex flex-col items-start gap-1 animate-in fade-in slide-in-from-bottom-1 duration-200">
                                    <span className="text-xs font-bold text-slate-400 px-1">{coach.name}</span>
                                    <div className="max-w-[85%] bg-slate-800 border border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3">
                                        <p className="text-sm text-slate-100 leading-relaxed">&ldquo;{msg.text}&rdquo;</p>
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={chatEndRef} />
                    </div>

                    {/* 결과 바 */}
                    {phase === 'accepted' && (
                        <div className="px-5 py-3 border-t border-slate-800 bg-emerald-950/30 flex items-center justify-between gap-3 flex-shrink-0">
                            <span className="text-xs text-emerald-300 font-bold">계약이 성사되었습니다.</span>
                            <button
                                onClick={() => onAccept(offerSalary, offerYears)}
                                className="px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                            >계약 체결</button>
                        </div>
                    )}
                    {phase === 'rejected' && (
                        <div className="px-5 py-3 border-t border-slate-800 bg-red-950/30 flex items-center justify-between gap-3 flex-shrink-0">
                            <span className="text-xs text-red-300 font-bold">협상이 결렬되었습니다.</span>
                            <button
                                onClick={onClose}
                                className="px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                            >닫기</button>
                        </div>
                    )}
                </div>

                {/* ── 우측: 계약 제안 ── */}
                <div className={`flex-[3] min-w-0 flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 relative transition-opacity duration-300 ${phase !== 'negotiating' ? 'opacity-40 pointer-events-none select-none' : ''}`}>

                    <div className="flex-shrink-0 px-4 py-2" style={{ backgroundColor: primaryColor }}>
                        <span className="text-sm font-bold text-white">계약 제안</span>
                    </div>

                    <div className="p-5 flex flex-col gap-4">

                        {/* 직무 드랍다운 */}
                        <div className="space-y-1.5">
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">직무</div>
                            <select
                                value={offerRole}
                                onChange={e => handleRoleChange(e.target.value as StaffRole)}
                                disabled={round > 0}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-indigo-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {ALL_STAFF_ROLES.map(r => (
                                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                                ))}
                            </select>
                        </div>

                        {/* 계약 기간 */}
                        <div className="space-y-1.5">
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">계약 기간</div>
                            <div className="flex gap-1.5">
                                {[2, 3, 4].map(y => (
                                    <button
                                        key={y}
                                        onClick={() => setOfferYears(y)}
                                        className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-colors ${
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

                        {/* 연봉 — 증감 버튼 + 인풋 */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">연봉/년</div>
                                <div className="text-xs font-mono text-slate-400">{formatMoney(offerSalary)}</div>
                            </div>
                            <div className="flex items-center gap-1">
                                {[-500_000, -100_000].map(delta => (
                                    <button
                                        key={delta}
                                        onClick={() => adjustSalary(delta)}
                                        className="text-xs font-mono px-2 py-1.5 rounded bg-slate-700/50 border border-slate-600/60 hover:bg-slate-600/60 hover:border-slate-500/80 text-slate-300 hover:text-white transition-colors flex-shrink-0"
                                    >
                                        {delta === -500_000 ? '-500K' : '-100K'}
                                    </button>
                                ))}
                                <div className="relative flex-1 min-w-0">
                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">$</span>
                                    <input
                                        type="number"
                                        step={salaryStep}
                                        min={salaryMin}
                                        max={salaryMax}
                                        value={offerSalary}
                                        onChange={e => {
                                            const v = parseInt(e.target.value) || 0;
                                            setOfferSalary(Math.max(salaryMin, Math.min(salaryMax, v)));
                                        }}
                                        className="w-full bg-slate-800 border border-slate-700 rounded pl-7 pr-1 py-1.5 text-xs font-mono font-bold text-white focus:outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-inner-spin-button]:hidden [&::-webkit-outer-spin-button]:hidden"
                                    />
                                </div>
                                {[100_000, 500_000].map(delta => (
                                    <button
                                        key={delta}
                                        onClick={() => adjustSalary(delta)}
                                        className="text-xs font-mono px-2 py-1.5 rounded bg-slate-700/50 border border-slate-600/60 hover:bg-slate-600/60 hover:border-slate-500/80 text-slate-300 hover:text-white transition-colors flex-shrink-0"
                                    >
                                        {delta === 500_000 ? '+500K' : '+100K'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 오퍼 제출 버튼 */}
                        <button
                            onClick={handleSubmitOffer}
                            disabled={phase !== 'negotiating'}
                            className="w-full py-2.5 rounded-xl text-sm font-black uppercase tracking-wide bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed mt-1"
                        >
                            오퍼 제출
                        </button>

                    </div>
                </div>

            </div>
        </div>
    );
};
