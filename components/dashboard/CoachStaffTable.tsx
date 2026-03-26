
import React from 'react';
import type { CoachingStaff, StaffRole, CoachAbilities, TrainingCoachAbilities } from '../../types/coaching';
import { Table, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';
import { formatMoney } from '../../utils/formatMoney';

interface CoachStaffTableProps {
    staff: CoachingStaff | null | undefined;
    onCoachClick?: (role: StaffRole) => void;
}

// ── 능력치 그룹 정의 ──
const COACH_GROUPS: { label: string; keys: (keyof CoachAbilities)[]; shorts: string[] }[] = [
    { label: '훈련 효율', keys: ['teaching', 'schemeDepth', 'communication', 'playerEval'],        shorts: ['지도', '전술', '소통', '평가'] },
    { label: '팀 관리',   keys: ['motivation', 'playerRelation', 'adaptability', 'mentalCoaching'], shorts: ['동기', '관계', '적응', '멘탈'] },
    { label: '선수 육성', keys: ['developmentVision', 'experienceTransfer'],                        shorts: ['성장', '전수'] },
];
const TRAINER_GROUP: { label: string; keys: (keyof TrainingCoachAbilities)[]; shorts: string[] } = {
    label: '신체 훈련', keys: ['athleticTraining', 'recovery', 'conditioning'], shorts: ['신체', '회복', '컨디'],
};

const COACH_COLS   = COACH_GROUPS.flatMap(g => g.keys.map((k, i) => ({ key: k as string, short: g.shorts[i] })));
const TRAINER_COLS = TRAINER_GROUP.keys.map((k, i) => ({ key: k as string, short: TRAINER_GROUP.shorts[i] }));

const STAFF_ROWS: { role: StaffRole; label: string; fullName: string }[] = [
    { role: 'headCoach',          label: '감독',       fullName: '감독'      },
    { role: 'offenseCoordinator', label: '공격 코디',  fullName: '공격코치'  },
    { role: 'defenseCoordinator', label: '수비 코디',  fullName: '수비코치'  },
    { role: 'developmentCoach',   label: '디벨롭먼트', fullName: '디벨롭'   },
    { role: 'trainingCoach',      label: '트레이닝',   fullName: '트레이너'  },
];

function getCoachFromStaff(staff: CoachingStaff, role: StaffRole) {
    return staff[role];
}

function valColor(v: number): string {
    if (v >= 7) return 'text-emerald-400';
    if (v >= 5) return 'text-amber-400';
    return 'text-rose-400';
}

// ── 컬럼 폭 ──
const W = { NAME: 160, ROLE: 72, SALARY: 80, CONTRACT: 52, ATTR: 46 };
const LEFT_ROLE = W.NAME;

const sticky = (left: number, width: number): React.CSSProperties => ({
    left, width, minWidth: width, maxWidth: width, position: 'sticky', zIndex: 30,
});

const renderAttrCell = (key: string, val: number | undefined) => (
    <TableCell key={key} align="center" className="font-mono font-black text-xs border-r border-slate-800/30 tabular-nums">
        {val !== undefined
            ? <span className={valColor(val)}>{val}</span>
            : <span className="text-slate-700">-</span>}
    </TableCell>
);

export const CoachStaffTable: React.FC<CoachStaffTableProps> = ({ staff, onCoachClick }) => {
    const trainerColCount = TRAINER_COLS.length;

    return (
        <div className="overflow-x-auto">
            <table
                style={{ tableLayout: 'fixed', minWidth: '100%', borderCollapse: 'collapse' }}
                className="w-full text-left"
            >
                <colgroup>
                    <col style={{ width: W.NAME }} />
                    <col style={{ width: W.ROLE }} />
                    <col style={{ width: W.SALARY }} />
                    <col style={{ width: W.CONTRACT }} />
                    {COACH_COLS.map((_, i)   => <col key={`cc-${i}`} style={{ width: W.ATTR }} />)}
                    {TRAINER_COLS.map((_, i) => <col key={`tc-${i}`} style={{ width: W.ATTR }} />)}
                </colgroup>

                {/* ═══ 헤더 ═══ */}
                <thead className="bg-slate-950 sticky top-0 z-40">
                    {/* Row 1 — 그룹 */}
                    <tr className="h-9">
                        <th colSpan={4} className="bg-slate-950 border-b border-r border-slate-800 sticky left-0 z-50 align-middle text-center">
                            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">코치 정보</span>
                        </th>
                        {COACH_GROUPS.map(g => (
                            <th key={g.label} colSpan={g.keys.length} className="bg-slate-950 border-b border-r border-slate-800 align-middle text-center">
                                <span className="text-xs font-black text-slate-400 uppercase tracking-widest ko-normal">{g.label}</span>
                            </th>
                        ))}
                        <th colSpan={trainerColCount} className="bg-slate-950 border-b border-r border-slate-800 align-middle text-center">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest ko-normal">{TRAINER_GROUP.label}</span>
                        </th>
                    </tr>
                    {/* Row 2 — 개별 컬럼 라벨 */}
                    <tr className="h-9 text-slate-500 text-xs font-black uppercase tracking-widest">
                        <TableHeaderCell style={{ ...sticky(0, W.NAME), zIndex: 50 }}         align="left" className="pl-4 bg-slate-950">이름</TableHeaderCell>
                        <TableHeaderCell style={{ ...sticky(LEFT_ROLE, W.ROLE), zIndex: 50 }} className="bg-slate-950 border-r border-slate-800">직무</TableHeaderCell>
                        <TableHeaderCell width={W.SALARY}>연봉</TableHeaderCell>
                        <TableHeaderCell width={W.CONTRACT}>계약</TableHeaderCell>
                        {COACH_COLS.map(c   => <TableHeaderCell key={c.key} width={W.ATTR} className="border-r border-slate-800/50">{c.short}</TableHeaderCell>)}
                        {TRAINER_COLS.map(c => <TableHeaderCell key={c.key} width={W.ATTR} className="border-r border-slate-800/50">{c.short}</TableHeaderCell>)}
                    </tr>
                </thead>

                {/* ═══ 바디 ═══ */}
                <TableBody>
                    {STAFF_ROWS.map(r => {
                        const coach = staff ? getCoachFromStaff(staff, r.role) : null;
                        const isTrainer = r.role === 'trainingCoach';
                        const abilities = coach?.abilities as Record<string, number> | undefined;

                        return (
                            <TableRow key={r.role} className="group">
                                {/* 이름 */}
                                <TableCell style={sticky(0, W.NAME)} className="pl-4 bg-slate-900 group-hover:bg-slate-800 transition-colors">
                                    {coach ? (
                                        <button
                                            className="text-xs font-semibold text-slate-200 hover:text-indigo-400 transition-colors text-left truncate w-full"
                                            onClick={() => onCoachClick?.(r.role)}
                                        >
                                            {coach.name}
                                        </button>
                                    ) : (
                                        <span className="text-xs text-slate-600 italic">공석</span>
                                    )}
                                </TableCell>
                                {/* 직무 배지 */}
                                <TableCell style={sticky(LEFT_ROLE, W.ROLE)} className="bg-slate-900 group-hover:bg-slate-800 transition-colors text-center border-r border-slate-800">
                                    <span className="text-xs font-black text-slate-400 bg-slate-800 ring-1 ring-slate-700 rounded px-1.5 py-0.5 truncate">{r.fullName}</span>
                                </TableCell>
                                {/* 연봉 */}
                                <TableCell align="right" className="pr-3 font-mono text-xs tabular-nums">
                                    {coach && coach.contractSalary > 0
                                        ? <span className="text-slate-200">{formatMoney(coach.contractSalary)}</span>
                                        : <span className="text-slate-700">-</span>}
                                </TableCell>
                                {/* 잔여 계약 */}
                                <TableCell align="center">
                                    {coach
                                        ? <span className="text-xs font-mono text-slate-500 tabular-nums">{coach.contractYearsRemaining}년</span>
                                        : <span className="text-slate-700 text-xs">-</span>}
                                </TableCell>
                                {COACH_COLS.map(c => renderAttrCell(c.key, !isTrainer && abilities ? abilities[c.key] : undefined))}
                                {TRAINER_COLS.map(c => renderAttrCell(c.key, isTrainer && abilities ? abilities[c.key] : undefined))}
                            </TableRow>
                        );
                    })}
                </TableBody>
            </table>
        </div>
    );
};
