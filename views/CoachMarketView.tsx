
import React, { useState } from 'react';
import { ArrowLeft, Users, X } from 'lucide-react';
import { calcCoachDemandSalary } from '../services/coachingStaff/coachGenerator';
import {
    Coach,
    CoachFAPool,
    CoachingStaff,
    LeagueCoachingData,
    StaffRole,
    CoachAbilities,
} from '../types/coaching';
import { formatMoney } from '../utils/formatMoney';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/common/Table';

interface CoachMarketViewProps {
    coachFAPool: CoachFAPool;
    coachingData: LeagueCoachingData;
    userTeamId: string;
    onHire: (role: StaffRole, coachId: string, demandSalary?: number) => void;
    onFire: (role: StaffRole) => void;
    onBack: () => void;
}

const ROLE_LABELS: Record<StaffRole, string> = {
    headCoach: '헤드 코치',
    offenseCoordinator: '공격 코디',
    defenseCoordinator: '수비 코디',
    developmentCoach: '디벨롭먼트',
    trainingCoach: '트레이닝',
};

const ROLE_ABBRS: Record<StaffRole, string> = {
    headCoach: 'HC',
    offenseCoordinator: 'OC',
    defenseCoordinator: 'DC',
    developmentCoach: 'DEV',
    trainingCoach: 'TRN',
};

const ALL_ROLES: StaffRole[] = [
    'headCoach',
    'offenseCoordinator',
    'defenseCoordinator',
    'developmentCoach',
    'trainingCoach',
];

const ABILITY_LABELS: Record<keyof CoachAbilities, string> = {
    teaching: '지도력',
    schemeDepth: '전술 깊이',
    communication: '소통력',
    playerEval: '선수 평가',
    motivation: '동기부여',
    playerRelation: '선수 관계',
    adaptability: '적응력',
    developmentVision: '성장 비전',
    experienceTransfer: '경험 전수',
    mentalCoaching: '멘탈 코칭',
    athleticTraining: '신체 훈련',
    recovery: '회복 관리',
    conditioning: '컨디셔닝',
};

// 슬롯별 핵심 능력치
const ROLE_MAIN_ABILITY: Record<StaffRole, keyof CoachAbilities> = {
    headCoach: 'teaching',
    offenseCoordinator: 'schemeDepth',
    defenseCoordinator: 'adaptability',
    developmentCoach: 'developmentVision',
    trainingCoach: 'athleticTraining',
};

function getAbilityColor(val: number): string {
    if (val >= 7) return 'text-emerald-400';
    if (val >= 5) return 'text-amber-400';
    return 'text-red-400';
}

function getMainAbility(role: StaffRole, coach: Coach): { label: string; value: number } {
    const key = ROLE_MAIN_ABILITY[role];
    return { label: ABILITY_LABELS[key], value: coach.abilities[key] };
}

function getAverageAbility(role: StaffRole, coach: Coach): number {
    const a = coach.abilities;
    if (role === 'trainingCoach') {
        return Math.round((a.athleticTraining + a.recovery + a.conditioning) / 3);
    }
    const vals = [a.teaching, a.schemeDepth, a.communication, a.playerEval,
        a.motivation, a.playerRelation, a.adaptability,
        a.developmentVision, a.experienceTransfer, a.mentalCoaching];
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
}

const AbilityTooltip: React.FC<{ role: StaffRole; coach: Coach }> = ({ coach }) => (
    <div className="flex flex-col gap-1">
        {(Object.keys(ABILITY_LABELS) as (keyof CoachAbilities)[]).map(key => (
            <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-[10px] text-slate-400">{ABILITY_LABELS[key]}</span>
                <span className={`text-[10px] font-black font-mono tabular-nums ${getAbilityColor(coach.abilities[key])}`}>{coach.abilities[key]}</span>
            </div>
        ))}
    </div>
);

function getCurrentCoachForRole(staff: CoachingStaff | undefined, role: StaffRole): Coach | null {
    if (!staff) return null;
    switch (role) {
        case 'headCoach': return staff.headCoach ?? null;
        case 'offenseCoordinator': return staff.offenseCoordinator ?? null;
        case 'defenseCoordinator': return staff.defenseCoordinator ?? null;
        case 'developmentCoach': return staff.developmentCoach ?? null;
        case 'trainingCoach': return staff.trainingCoach ?? null;
    }
}

export const CoachMarketView: React.FC<CoachMarketViewProps> = ({
    coachFAPool,
    coachingData,
    userTeamId,
    onHire,
    onFire,
    onBack,
}) => {
    const [selectedRole, setSelectedRole] = useState<StaffRole>('headCoach');
    const [tooltipId, setTooltipId] = useState<string | null>(null);
    const [pendingHire, setPendingHire] = useState<{ coach: Coach; role: StaffRole; demandSalary: number } | null>(null);

    const userStaff = coachingData[userTeamId];
    const currentCoach = getCurrentCoachForRole(userStaff, selectedRole);

    // FA 풀은 단일 배열 — 선택된 슬롯 기준 평균으로 정렬
    const sortedPool = [...coachFAPool.coaches].sort((a, b) =>
        getAverageAbility(selectedRole, b) - getAverageAbility(selectedRole, a)
    );

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300 overflow-hidden bg-slate-950">

            {/* ═══ 상단 헤더 ═══ */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900 shrink-0">
                <button
                    onClick={onBack}
                    className="flex items-center justify-center w-7 h-7 rounded-md bg-slate-800 hover:bg-slate-700 transition-colors text-slate-300"
                >
                    <ArrowLeft size={14} />
                </button>
                <div className="flex items-center gap-2">
                    <Users size={16} className="text-indigo-400" />
                    <h1 className="text-sm font-black text-white uppercase tracking-widest">코치 영입 / 해고</h1>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                <div className="p-4 flex flex-col gap-4">

                    {/* ═══ 직무 탭 ═══ */}
                    <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl">
                        {ALL_ROLES.map(role => (
                            <button
                                key={role}
                                onClick={() => setSelectedRole(role)}
                                className={`flex-1 py-2 px-1 rounded-lg text-xs font-black uppercase tracking-wide transition-all ${
                                    selectedRole === role
                                        ? 'bg-indigo-600 text-white shadow-lg'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                                }`}
                            >
                                <span className="hidden sm:inline">{ROLE_LABELS[role]}</span>
                                <span className="sm:hidden">{ROLE_ABBRS[role]}</span>
                            </button>
                        ))}
                    </div>

                    {/* ═══ 현재 팀 코치 섹션 ═══ */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-700 flex items-center justify-between">
                            <span className="text-xs font-black text-white uppercase tracking-widest">현재 배치</span>
                            <span className="text-xs text-slate-500">{ROLE_LABELS[selectedRole]}</span>
                        </div>

                        {currentCoach ? (
                            <div className="flex items-center gap-4 px-4 py-3">
                                <div className="w-10 h-10 rounded-xl bg-slate-800 ring-1 ring-slate-700 flex items-center justify-center shrink-0">
                                    <span className="text-xs font-black text-indigo-400">{ROLE_ABBRS[selectedRole]}</span>
                                </div>
                                <div className="flex flex-col flex-1 min-w-0">
                                    <span className="text-sm font-black text-white truncate">{currentCoach.name}</span>
                                    <div className="flex items-center gap-3 mt-0.5">
                                        <span className="text-xs text-emerald-400 font-mono tabular-nums">{formatMoney(currentCoach.contractSalary)}</span>
                                        <span className="text-xs text-slate-500">잔여 {currentCoach.contractYearsRemaining}년</span>
                                        <span className={`text-xs font-black font-mono ${getAbilityColor(getAverageAbility(selectedRole, currentCoach))}`}>
                                            OVR {getAverageAbility(selectedRole, currentCoach)}
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => onFire(selectedRole)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 transition-colors shrink-0"
                                >
                                    해고
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3 px-4 py-3">
                                <div className="w-10 h-10 rounded-xl bg-slate-800/50 ring-1 ring-slate-800 flex items-center justify-center shrink-0">
                                    <span className="text-xs font-black text-slate-600">{ROLE_ABBRS[selectedRole]}</span>
                                </div>
                                <span className="text-xs text-slate-600 font-bold">공석 — FA 풀에서 코치를 고용하세요</span>
                            </div>
                        )}
                    </div>

                    {/* ═══ FA 풀 테이블 ═══ */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-700 flex items-center justify-between">
                            <span className="text-xs font-black text-white uppercase tracking-widest">FA 코치 풀</span>
                            <span className="text-xs text-slate-500">{sortedPool.length}명</span>
                        </div>

                        {sortedPool.length === 0 ? (
                            <div className="flex items-center justify-center h-20">
                                <span className="text-xs text-slate-600">FA 풀에 해당 직무 코치가 없습니다</span>
                            </div>
                        ) : (
                            <Table className="border-0 !rounded-none shadow-none">
                                <TableHead>
                                    <TableHeaderCell className="text-xs py-2 border-r border-slate-800/50" align="left">코치명</TableHeaderCell>
                                    <TableHeaderCell className="text-xs w-20 py-2 border-r border-slate-800/50">주요 능력</TableHeaderCell>
                                    <TableHeaderCell className="text-xs w-16 py-2 border-r border-slate-800/50">평균</TableHeaderCell>
                                    <TableHeaderCell className="text-xs w-24 py-2 border-r border-slate-800/50">요구 연봉</TableHeaderCell>
                                    <TableHeaderCell className="text-xs w-16 py-2 border-r border-slate-800/50">계약</TableHeaderCell>
                                    <TableHeaderCell className="text-xs w-16 py-2">고용</TableHeaderCell>
                                </TableHead>
                                <TableBody>
                                    {sortedPool.map(coach => {
                                        const main = getMainAbility(selectedRole, coach);
                                        const avg = getAverageAbility(selectedRole, coach);
                                        const isTooltipOpen = tooltipId === coach.id;
                                        return (
                                            <TableRow
                                                key={coach.id}
                                                className="hover:bg-slate-900/40 transition-colors relative"
                                            >
                                                <TableCell className="text-xs py-2 border-r border-slate-800/50">
                                                    <div className="relative">
                                                        <button
                                                            className="text-xs font-bold text-slate-200 hover:text-indigo-400 transition-colors text-left"
                                                            onClick={() => setTooltipId(isTooltipOpen ? null : coach.id)}
                                                        >
                                                            {coach.name}
                                                        </button>
                                                        {isTooltipOpen && (
                                                            <div className="absolute left-0 top-full mt-1 z-50 w-48 p-3 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl">
                                                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">{ROLE_LABELS[selectedRole]} 능력치</div>
                                                                <AbilityTooltip role={selectedRole} coach={coach} />
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-2 border-r border-slate-800/50 text-center">
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-[10px] text-slate-500">{main.label}</span>
                                                        <span className={`text-xs font-black font-mono tabular-nums ${getAbilityColor(main.value)}`}>{main.value}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-2 border-r border-slate-800/50 text-center">
                                                    <span className={`text-xs font-black font-mono tabular-nums ${getAbilityColor(avg)}`}>{avg}</span>
                                                </TableCell>
                                                <TableCell className="py-2 border-r border-slate-800/50 text-center">
                                                    <span className="text-xs font-mono text-emerald-400 tabular-nums">{formatMoney(calcCoachDemandSalary(coach, selectedRole, 'fa'))}</span>
                                                </TableCell>
                                                <TableCell className="py-2 border-r border-slate-800/50 text-center">
                                                    <span className="text-xs text-slate-400 font-mono">{coach.contractYears}년</span>
                                                </TableCell>
                                                <TableCell className="py-2 text-center">
                                                    <button
                                                        onClick={() => setPendingHire({
                                                            coach,
                                                            role: selectedRole,
                                                            demandSalary: calcCoachDemandSalary(coach, selectedRole, 'fa'),
                                                        })}
                                                        className="px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wide bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                                                    >
                                                        고용
                                                    </button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        )}
                    </div>

                </div>
            </div>

        {/* ═══ 고용 확인 모달 ═══ */}
        {pendingHire && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-80 overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                        <span className="text-sm font-black text-white uppercase tracking-widest">코치 영입 확인</span>
                        <button onClick={() => setPendingHire(null)} className="text-slate-500 hover:text-slate-300 transition-colors">
                            <X size={16} />
                        </button>
                    </div>
                    <div className="px-5 py-4 flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-800 ring-1 ring-slate-700 flex items-center justify-center shrink-0">
                                <span className="text-xs font-black text-indigo-400">{ROLE_ABBRS[pendingHire.role]}</span>
                            </div>
                            <div>
                                <div className="text-sm font-black text-white">{pendingHire.coach.name}</div>
                                <div className="text-xs text-slate-400">{ROLE_LABELS[pendingHire.role]}</div>
                            </div>
                        </div>
                        <div className="bg-slate-800 rounded-xl px-4 py-3 flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-400">OVR</span>
                                <span className={`text-xs font-black font-mono ${getAbilityColor(getAverageAbility(pendingHire.role, pendingHire.coach))}`}>
                                    {getAverageAbility(pendingHire.role, pendingHire.coach)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-400">계약 기간</span>
                                <span className="text-xs font-mono text-slate-200">{pendingHire.coach.contractYears}년</span>
                            </div>
                            <div className="flex items-center justify-between border-t border-slate-700 pt-1.5 mt-0.5">
                                <span className="text-xs font-bold text-slate-300">요구 연봉</span>
                                <span className="text-sm font-black font-mono text-emerald-400">{formatMoney(pendingHire.demandSalary)}</span>
                            </div>
                        </div>
                        <div className="text-xs text-slate-500 text-center">이 조건으로 계약을 체결하시겠습니까?</div>
                    </div>
                    <div className="px-5 pb-4 flex gap-2">
                        <button
                            onClick={() => setPendingHire(null)}
                            className="flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wide bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                        >
                            취소
                        </button>
                        <button
                            onClick={() => {
                                onHire(pendingHire.role, pendingHire.coach.id, pendingHire.demandSalary);
                                setPendingHire(null);
                            }}
                            className="flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wide bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                        >
                            계약 체결
                        </button>
                    </div>
                </div>
            </div>
        )}
        </div>
    );
};
