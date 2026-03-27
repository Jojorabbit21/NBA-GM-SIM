import React, { useState, useMemo, useEffect } from 'react';
import type { Team, Player, ReleaseType } from '../types';
import type { PlayerContract } from '../types/player';
import type { FARole, LeagueFAMarket, FAMarketEntry, SigningType } from '../types/fa';
import { LEAGUE_FINANCIALS } from '../utils/constants';
import { calcTeamPayroll } from '../services/fa/faMarketBuilder';
import { TEAM_DATA } from '../data/teamData';
import { NegotiationScreen } from './NegotiationScreen';
import { RosterGrid } from '../components/roster/RosterGrid';
import type { CoachFAPool, CoachingStaff, StaffRole, CoachAbilities } from '../types/coaching';
import type { Coach } from '../types/coaching';
import { CoachNegotiationScreen } from './CoachNegotiationScreen';
import { formatMoney } from '../utils/formatMoney';
import { calcCoachOVR } from '../services/coachingStaff/coachGenerator';
import { getStaffSlot } from '../services/coachingStaff/coachHiringEngine';

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
    onOfferSheetSubmitted?: (playerId: string, updatedMarket: LeagueFAMarket) => void;
    onReleasePlayer: (playerId: string, releaseType: ReleaseType, buyoutAmount?: number) => void;
    onViewPlayer?: (player: Player) => void;
    currentDate?: string;
    initialNegotiateId?: string;  // PlayerDetailView에서 직접 협상 진입 시 자동 오픈
    // 코칭 스태프 탭
    coachFAPool?: CoachFAPool | null;
    myTeamStaff?: CoachingStaff | null;
    onHireCoach?: (role: StaffRole, coachId: string, finalSalary?: number) => void;
    onFireCoach?: (role: StaffRole, buyoutAmount: number) => void;
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
    bae:         '바이어뉴얼 익셉션',
    bird_full:   '풀 버드권',
    bird_early:  '얼리 버드권',
    bird_non:    '논버드',
    vet_min:     '베테랑 미니멈',
};

const SLOT_CAPS: Record<SigningType, string> = {
    cap_space:   '잔여 캡',
    non_tax_mle: '$14.1M',
    tax_mle:     '$5.7M',
    bae:         '$4.5M',
    bird_full:   '맥스',
    bird_early:  '전 연봉 175%',
    bird_non:    '전 연봉 120%',
    vet_min:     '미니멈',
};

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
// Staff FA Tab
// ─────────────────────────────────────────────────────────────

const STAFF_ROLE_LABELS_FA: Record<StaffRole, string> = {
    headCoach: '감독', offenseCoordinator: '공격', defenseCoordinator: '수비',
    developmentCoach: '디벨롭', trainingCoach: '트레이너',
};

const ROLE_MAIN_ABILITIES_FA: Record<StaffRole, [keyof CoachAbilities, keyof CoachAbilities, keyof CoachAbilities]> = {
    headCoach:          ['teaching', 'schemeDepth', 'motivation'],
    offenseCoordinator: ['schemeDepth', 'communication', 'playerEval'],
    defenseCoordinator: ['adaptability', 'mentalCoaching', 'schemeDepth'],
    developmentCoach:   ['developmentVision', 'experienceTransfer', 'teaching'],
    trainingCoach:      ['athleticTraining', 'recovery', 'conditioning'],
};

const ABILITY_SHORT_FA: Record<keyof CoachAbilities, string> = {
    teaching: '지도', schemeDepth: '전술', communication: '소통', playerEval: '평가',
    motivation: '동기', playerRelation: '관계', adaptability: '적응',
    developmentVision: '성장', experienceTransfer: '전수', mentalCoaching: '멘탈',
    athleticTraining: '신체', recovery: '회복', conditioning: '컨디',
};

const ALL_STAFF_ROLES_FA: StaffRole[] = ['headCoach', 'offenseCoordinator', 'defenseCoordinator', 'developmentCoach', 'trainingCoach'];

function coachValColor(v: number): string {
    if (v >= 7) return 'text-emerald-400';
    if (v >= 5) return 'text-amber-400';
    return 'text-rose-400';
}

const StaffFATab: React.FC<{
    coachFAPool?: CoachFAPool | null;
    myTeamStaff?: CoachingStaff | null;
    onNegotiateCoach?: (coach: Coach, role: StaffRole) => void;
    onCoachFireTarget?: (coach: Coach, role: StaffRole) => void;
}> = ({ coachFAPool, myTeamStaff, onNegotiateCoach, onCoachFireTarget }) => {
    const [selectedRole, setSelectedRole] = useState<StaffRole>('headCoach');

    const mainAbilKeys = ROLE_MAIN_ABILITIES_FA[selectedRole];

    const coaches = useMemo(() => {
        if (!coachFAPool?.coaches) return [];
        return [...coachFAPool.coaches].sort(
            (a, b) => calcCoachOVR(b, selectedRole) - calcCoachOVR(a, selectedRole)
        );
    }, [coachFAPool, selectedRole]);

    const currentCoach = myTeamStaff ? getStaffSlot(myTeamStaff, selectedRole) : null;

    return (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-3">
            {/* Role selector */}
            <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl flex-shrink-0">
                {ALL_STAFF_ROLES_FA.map(role => (
                    <button
                        key={role}
                        onClick={() => setSelectedRole(role)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${
                            selectedRole === role ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                    >
                        {STAFF_ROLE_LABELS_FA[role]}
                    </button>
                ))}
            </div>

            {/* 현재 배치 */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex-shrink-0">
                <div className="px-4 py-2 bg-slate-800/60 border-b border-slate-700 flex items-center justify-between">
                    <span className="text-xs font-black text-white uppercase tracking-widest">현재 배치</span>
                    <span className="text-xs text-slate-500">{STAFF_ROLE_LABELS_FA[selectedRole]}</span>
                </div>
                {currentCoach ? (
                    <div className="flex items-center gap-3 px-4 py-3">
                        <div className="flex flex-col flex-1 min-w-0">
                            <span className="text-sm font-black text-white truncate">{currentCoach.name}</span>
                            <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-xs font-mono text-emerald-400">{formatMoney(currentCoach.contractSalary)}</span>
                                <span className="text-xs text-slate-500">잔여 {currentCoach.contractYearsRemaining}년</span>
                                <span className={`text-xs font-black font-mono ${coachValColor(calcCoachOVR(currentCoach, selectedRole))}`}>
                                    OVR {calcCoachOVR(currentCoach, selectedRole)}
                                </span>
                            </div>
                        </div>
                        {onCoachFireTarget && currentCoach && (
                            <button
                                onClick={() => {
                                    const coach = myTeamStaff ? getStaffSlot(myTeamStaff, selectedRole) : null;
                                    if (coach) onCoachFireTarget(coach, selectedRole);
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 transition-colors shrink-0"
                            >
                                해고
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="px-4 py-3">
                        <span className="text-xs text-slate-600 font-bold">공석 — FA 풀에서 코치를 고용하세요</span>
                    </div>
                )}
            </div>

            {/* FA 코치 테이블 */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-slate-800/60 border-b border-slate-700 flex items-center justify-between">
                    <span className="text-xs font-black text-white uppercase tracking-widest">FA 코치 풀</span>
                    <span className="text-xs text-slate-500">{coaches.length}명</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-slate-800 border-b border-slate-700">
                                <th className="px-4 py-2 text-left font-bold uppercase tracking-wider text-slate-400">이름</th>
                                <th className="px-3 py-2 text-center font-bold uppercase tracking-wider text-slate-400 w-12">OVR</th>
                                {mainAbilKeys.map(k => (
                                    <th key={k} className="px-3 py-2 text-center font-bold uppercase tracking-wider text-slate-400 w-12">{ABILITY_SHORT_FA[k]}</th>
                                ))}
                                <th className="px-3 py-2 text-right font-bold uppercase tracking-wider text-slate-400">요구 연봉</th>
                                <th className="px-3 py-2 text-center font-bold uppercase tracking-wider text-slate-400 w-16">계약</th>
                                <th className="px-3 py-2 w-16" />
                            </tr>
                        </thead>
                        <tbody>
                            {coaches.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-slate-600">FA 코치가 없습니다</td>
                                </tr>
                            ) : coaches.map(coach => {
                                const avg = calcCoachOVR(coach, selectedRole);
                                return (
                                    <tr key={coach.id} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                                        <td className="px-4 py-2 font-semibold text-slate-200 whitespace-nowrap">{coach.name}</td>
                                        <td className="px-3 py-2 text-center">
                                            <span className={`font-black font-mono tabular-nums ${coachValColor(avg)}`}>{avg}</span>
                                        </td>
                                        {mainAbilKeys.map(k => (
                                            <td key={k} className="px-3 py-2 text-center">
                                                <span className={`font-black font-mono tabular-nums ${coachValColor(coach.abilities[k])}`}>{coach.abilities[k]}</span>
                                            </td>
                                        ))}
                                        <td className="px-3 py-2 text-right font-mono text-emerald-400 tabular-nums whitespace-nowrap">{formatMoney(coach.contractSalary)}</td>
                                        <td className="px-3 py-2 text-center text-slate-400 font-mono">{coach.contractYears}년</td>
                                        <td className="px-3 py-2 text-right">
                                            {onNegotiateCoach && (
                                                <button
                                                    onClick={() => onNegotiateCoach?.(coach, selectedRole)}
                                                    className="px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wide bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                                                >
                                                    고용
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// CapStatus — 상단 팀 재정 요약
// ─────────────────────────────────────────────────────────────

const CapStatus: React.FC<{ myTeam: Team; usedMLE: Record<string, boolean>; primaryColor: string; currentSeason: string }> = ({ myTeam, usedMLE, currentSeason }) => {
    const payroll   = calcTeamPayroll(myTeam);
    const deadTotal = (myTeam.deadMoney ?? []).reduce((s, d) => s + d.amount, 0);
    const cap       = LEAGUE_FINANCIALS.SALARY_CAP;
    const tax       = LEAGUE_FINANCIALS.TAX_LEVEL;
    const apron1    = LEAGUE_FINANCIALS.FIRST_APRON;
    const apron2    = LEAGUE_FINANCIALS.SECOND_APRON;
    const remaining = Math.max(0, cap - payroll);
    const mleUsed   = usedMLE[myTeam.id] ?? false;

    const capBarPct = Math.min(100, (payroll / apron2) * 100);

    // 캡 구간별 프로그레스 바 색상
    const capBarColor =
        payroll < cap    ? '#10b981' :  // 언더캡 — 에메랄드
        payroll < tax    ? '#eab308' :  // 캡~럭셔리택스 — 옐로우
        payroll < apron1 ? '#f97316' :  // 택스~1st 에이프런 — 오렌지
        payroll < apron2 ? '#ef4444' :  // 1st~2nd 에이프런 — 레드
                           '#dc2626';  // 2nd 에이프런 초과 — 다크레드

    return (
        <div className="flex-shrink-0 border-b border-slate-800 bg-slate-950 flex items-center divide-x divide-slate-800">
            <div className="px-6 py-3 min-w-[120px]">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">총 페이롤</div>
                <div className="text-sm font-mono font-bold text-white">{formatMoney(payroll)}</div>
            </div>
            {deadTotal > 0 && (
                <div className="px-6 py-3 min-w-[100px]">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">데드캡</div>
                    <div className="text-sm font-mono font-bold text-red-400">{formatMoney(deadTotal)}</div>
                </div>
            )}
            <div className="px-6 py-3 min-w-[100px]">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">잔여 캡</div>
                <div className={`text-sm font-mono font-bold ${remaining > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {remaining > 0 ? formatMoney(remaining) : '캡 초과'}
                </div>
            </div>
            <div className="px-6 py-3 min-w-[160px]">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-0.5">MLE</div>
                <div className={`text-sm font-bold ${mleUsed ? 'text-slate-500 line-through' : 'text-indigo-400'}`}>
                    {mleUsed ? '사용됨' : payroll < apron1 ? '논택스 ($14.1M)' : payroll < apron2 ? '택스페이어 ($5.7M)' : '없음'}
                </div>
            </div>
            <div className="flex-1 px-6 py-3 min-w-[200px]">
                <div className="flex justify-between text-[9px] font-mono text-slate-500 mb-1.5">
                    <span>캡 {formatMoney(cap)}</span>
                    <span>택스 {formatMoney(tax)}</span>
                    <span>에이프런 {formatMoney(apron1)}</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden relative">
                    <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${capBarPct}%`, backgroundColor: capBarColor }}
                    />
                    <div className="absolute top-0 bottom-0 w-px bg-indigo-500/60" style={{ left: `${(cap / apron2) * 100}%` }} />
                    <div className="absolute top-0 bottom-0 w-px bg-amber-500/60" style={{ left: `${(tax / apron2) * 100}%` }} />
                </div>
            </div>
            <div className="px-6 py-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{currentSeason}</div>
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
    onOfferSheetSubmitted,
    onReleasePlayer,
    onViewPlayer,
    currentDate = '',
    initialNegotiateId,
    coachFAPool,
    myTeamStaff,
    onHireCoach,
    onFireCoach,
}) => {
    // 협상 타깃 (NegotiationScreen 오버레이를 열 때 사용) — fa 타입만
    const [negotiationTarget, setNegotiationTarget] = useState<{
        type: 'fa';
        playerId: string;
    } | null>(null);

    // PlayerDetailView에서 직접 진입 시 자동 오픈
    useEffect(() => {
        if (initialNegotiateId) setNegotiationTarget({ type: 'fa', playerId: initialNegotiateId });
    }, [initialNegotiateId]);

    // FA walk away 후 재협상 불가 선수 ID
    const [blockedNegotiationIds, setBlockedNegotiationIds] = useState<Set<string>>(new Set());

    // FA 협상 라운드 간 쿨다운: playerId → 다음 오퍼 가능 날짜
    const [cooldownMap, setCooldownMap] = useState<Record<string, string>>({});

    // FA 협상 상태 영속화: playerId → { round, result }
    const [faSessionStates, setFaSessionStates] = useState<Record<string, { round: number; result: { accepted: boolean; reason?: string } | null }>>({});

    const [mainTab, setMainTab] = useState<'players' | 'staff'>('players');
    const [coachNegTarget, setCoachNegTarget] = useState<{ coach: Coach; role: StaffRole } | null>(null);
    const [coachFireTarget, setCoachFireTarget] = useState<{ coach: Coach; role: StaffRole } | null>(null);

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

    // RosterGrid용 FA 선수 임시 team
    const faTeamForGrid = useMemo(() => ({
        ...myTeam,
        roster: filteredEntries.map(e => faPlayerMap[e.playerId]).filter(Boolean) as Player[],
    }), [myTeam, filteredEntries, faPlayerMap]);

    const primaryColor = TEAM_DATA[myTeam.id]?.colors?.primary ?? '#4f46e5';

    // NegotiationScreen용 데이터 계산 (fa 타입만)
    const ntEntry   = negotiationTarget
        ? market?.entries.find(e => e.playerId === negotiationTarget.playerId) ?? null
        : null;
    const ntPlayer: Player | null = negotiationTarget
        ? faPlayerMap[negotiationTarget.playerId] ?? null
        : null;

    return (
        <div className="relative h-full flex flex-col overflow-hidden animate-in fade-in duration-500">
            {/* ── 탭 바 ── */}
            <div className="flex-shrink-0 border-b border-slate-800 bg-slate-950 flex items-center px-6 h-12 gap-8">
                {(['players', 'staff'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setMainTab(tab)}
                        className={`h-full border-b-2 text-sm font-black uppercase tracking-wide transition-all ${
                            mainTab === tab ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 border-transparent hover:text-slate-300'
                        }`}
                    >
                        {tab === 'players' ? '선수' : '스태프'}
                    </button>
                ))}
            </div>

            {/* ── 선수 탭 ── */}
            {mainTab === 'players' && (!market ? (
                <div className="flex-1 flex items-center justify-center text-slate-500">
                    <div className="text-center space-y-2">
                        <div className="text-4xl mb-3">🏀</div>
                        <div className="font-bold text-slate-400">FA 풀이 비어 있습니다.</div>
                        <div className="text-sm text-slate-500">프론트 오피스 &gt; 계약 관리에서 선수를 방출하면 즉시 이곳에 등록됩니다.</div>
                        <div className="text-sm text-slate-600">오프시즌에는 계약 만료 선수들이 자동으로 추가됩니다.</div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 min-h-0 overflow-hidden">
                    <RosterGrid
                        team={faTeamForGrid}
                        tab="roster"
                        showFooter={false}
                        hideAvgColumns={true}
                        onPlayerClick={(player) => onViewPlayer?.(player)}
                        renderRowAction={(player) => {
                            const entry = market?.entries.find(e => e.playerId === player.id);
                            const blocked = blockedNegotiationIds.has(player.id);
                            const isPendingMatch = entry?.status === 'pending_match';
                            const isRFA = entry?.isRFA ?? false;
                            const isOtherTeamRFA = isRFA && entry?.originalTeamId && entry.originalTeamId !== myTeam.id;

                            if (isPendingMatch) {
                                return (
                                    <span className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-amber-400 whitespace-nowrap">
                                        매칭 대기
                                    </span>
                                );
                            }

                            return (
                                <div className="flex items-center gap-1.5">
                                    {isRFA && (
                                        <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">RFA</span>
                                    )}
                                    <button
                                        onClick={() => !blocked && setNegotiationTarget({ type: 'fa', playerId: player.id })}
                                        disabled={blocked}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-white hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap ${isOtherTeamRFA ? 'bg-orange-600 hover:bg-orange-500' : 'bg-indigo-600 hover:bg-indigo-500'}`}
                                    >
                                        {isOtherTeamRFA ? '오퍼시트' : '협상'}
                                    </button>
                                </div>
                            );
                        }}
                    />
                </div>
            ))}

            {/* ── 스태프 탭 ── */}
            {mainTab === 'staff' && (
                <StaffFATab
                    coachFAPool={coachFAPool}
                    myTeamStaff={myTeamStaff}
                    onNegotiateCoach={(coach, role) => setCoachNegTarget({ coach, role })}
                    onCoachFireTarget={(coach, role) => setCoachFireTarget({ coach, role })}
                />
            )}

            {/* ── CoachNegotiationScreen 오버레이 (고용) ── */}
            {coachNegTarget && (
                <CoachNegotiationScreen
                    coach={coachNegTarget.coach}
                    role={coachNegTarget.role}
                    negotiationType="hire"
                    myTeam={myTeam}
                    onClose={() => setCoachNegTarget(null)}
                    onAccept={(finalSalary, finalYears) => {
                        onHireCoach?.(coachNegTarget.role, coachNegTarget.coach.id, finalSalary);
                        setCoachNegTarget(null);
                    }}
                />
            )}

            {/* ── NegotiationScreen 오버레이 (코치 해고) ── */}
            {coachFireTarget && onFireCoach && (
                <NegotiationScreen
                    negotiationType="release"
                    coach={coachFireTarget.coach}
                    coachRole={coachFireTarget.role}
                    myTeam={myTeam}
                    teams={teams}
                    tendencySeed={tendencySeed}
                    currentSeasonYear={currentSeasonYear}
                    currentSeason={currentSeason}
                    usedMLE={{}}
                    onClose={() => setCoachFireTarget(null)}
                    onFireCoach={(role, buyoutAmount) => {
                        onFireCoach(role, buyoutAmount);
                        setCoachFireTarget(null);
                    }}
                />
            )}

            {/* ── NegotiationScreen 오버레이 (fa 타입만) ── */}
            {negotiationTarget && ntPlayer && (
                <NegotiationScreen
                    negotiationType="fa"
                    player={ntPlayer}
                    myTeam={myTeam}
                    teams={teams}
                    tendencySeed={tendencySeed}
                    currentSeasonYear={currentSeasonYear}
                    currentSeason={currentSeason}
                    usedMLE={usedMLE}
                    faEntry={ntEntry ?? undefined}
                    faMarket={leagueFAMarket ?? undefined}
                    onClose={() => setNegotiationTarget(null)}
                    onFAOfferAccepted={(playerId, contract, signingType, updatedMarket) => {
                        onOfferAccepted(playerId, contract, signingType, updatedMarket);
                    }}
                    onFAOfferSheetSubmitted={(playerId, _offerSheet, updatedMarket) => {
                        onOfferSheetSubmitted?.(playerId, updatedMarket);
                        setNegotiationTarget(null);
                    }}
                    onNegotiationBlocked={(playerId) => {
                        setBlockedNegotiationIds(prev => new Set([...prev, playerId]));
                    }}
                    onCooldownStarted={(playerId, nextOfferDate) => {
                        setCooldownMap(prev => ({ ...prev, [playerId]: nextOfferDate }));
                    }}
                    onFAStateChange={(playerId, round, result) => {
                        setFaSessionStates(prev => ({ ...prev, [playerId]: { round, result } }));
                    }}
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
