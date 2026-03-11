
import React from 'react';
import { HeadCoach } from '../../types/coaching';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';
import { PREF_AXES, PREF_ORDER, getAxisResult } from '../../views/CoachDetailView';

interface HeadCoachTableProps {
    coach: HeadCoach | null | undefined;
    onCoachClick?: () => void;
}

export const HeadCoachTable: React.FC<HeadCoachTableProps> = ({ coach, onCoachClick }) => {
    if (!coach) {
        return (
            <div className="flex items-center justify-center h-40">
                <p className="text-slate-500 text-xs ko-normal">코치 데이터가 없습니다</p>
            </div>
        );
    }

    const offenseKeys = PREF_ORDER.filter(k => PREF_AXES[k].group === 'offense');
    const defenseKeys = PREF_ORDER.filter(k => PREF_AXES[k].group === 'defense');

    return (
        <Table fullHeight={false} className="!rounded-none">
            <TableHead noRow>
                <tr className="text-slate-500 text-xs font-black uppercase tracking-widest h-10">
                    <TableHeaderCell colSpan={5} align="center" className="bg-slate-950">
                        기본 정보
                    </TableHeaderCell>
                    <TableHeaderCell colSpan={offenseKeys.length} className="border-l border-slate-800 bg-slate-950">
                        공격 전술
                    </TableHeaderCell>
                    <TableHeaderCell colSpan={defenseKeys.length} className="border-l border-slate-800 bg-slate-950">
                        수비 전술
                    </TableHeaderCell>
                </tr>
                <tr className="text-slate-500 text-xs font-black uppercase tracking-widest h-10">
                    <TableHeaderCell align="center" style={{ width: 70, minWidth: 70 }} className="bg-slate-950 ko-normal">
                        직책
                    </TableHeaderCell>
                    <TableHeaderCell align="left" style={{ width: 180, minWidth: 180 }} className="bg-slate-950 ko-normal">
                        이름
                    </TableHeaderCell>
                    <TableHeaderCell style={{ width: 70, minWidth: 70 }} className="bg-slate-950 ko-normal">
                        연봉
                    </TableHeaderCell>
                    <TableHeaderCell style={{ width: 50, minWidth: 50 }} className="bg-slate-950 ko-normal">
                        계약
                    </TableHeaderCell>
                    <TableHeaderCell style={{ width: 50, minWidth: 50 }} className="bg-slate-950 border-r border-slate-800 ko-normal">
                        잔여
                    </TableHeaderCell>
                    {offenseKeys.map((key, i) => (
                        <TableHeaderCell
                            key={key}
                            align="center"
                            className={`bg-slate-950 ko-normal ${i === 0 ? 'border-l border-slate-800' : ''}`}
                        >
                            {PREF_AXES[key].label}
                        </TableHeaderCell>
                    ))}
                    {defenseKeys.map((key, i) => (
                        <TableHeaderCell
                            key={key}
                            align="center"
                            className={`bg-slate-950 ko-normal ${i === 0 ? 'border-l border-slate-800' : ''}`}
                        >
                            {PREF_AXES[key].label}
                        </TableHeaderCell>
                    ))}
                </tr>
            </TableHead>
            <TableBody>
                <TableRow>
                    <TableCell align="center" style={{ width: 70, minWidth: 70 }}>
                        <span className="text-xs font-bold text-slate-500 ko-normal">감독</span>
                    </TableCell>
                    <TableCell align="left" style={{ width: 180, minWidth: 180 }}>
                        <span
                            className={`text-xs font-semibold text-slate-200 ${onCoachClick ? 'hover:text-indigo-400 cursor-pointer transition-colors' : ''}`}
                            onClick={onCoachClick}
                        >
                            {coach.name}
                        </span>
                    </TableCell>
                    <TableCell align="center" style={{ width: 70, minWidth: 70 }}>
                        <span className="text-xs font-mono text-emerald-400">${coach.contractSalary}M</span>
                    </TableCell>
                    <TableCell align="center" style={{ width: 50, minWidth: 50 }}>
                        <span className="text-xs font-mono text-slate-400">{coach.contractYears}년</span>
                    </TableCell>
                    <TableCell align="center" style={{ width: 50, minWidth: 50 }} className="border-r border-slate-800">
                        <span className="text-xs font-mono text-slate-400">{coach.contractYearsRemaining}년</span>
                    </TableCell>
                    {offenseKeys.map((key, i) => {
                        const axis = PREF_AXES[key];
                        const { tag } = getAxisResult(axis, coach.preferences[key]);
                        return (
                            <TableCell
                                key={key}
                                align="center"
                                className={i === 0 ? 'border-l border-slate-800' : ''}
                            >
                                <span className={`text-xs font-black ko-normal ${axis.color}`}>{tag}</span>
                            </TableCell>
                        );
                    })}
                    {defenseKeys.map((key, i) => {
                        const axis = PREF_AXES[key];
                        const { tag } = getAxisResult(axis, coach.preferences[key]);
                        return (
                            <TableCell
                                key={key}
                                align="center"
                                className={i === 0 ? 'border-l border-slate-800' : ''}
                            >
                                <span className={`text-xs font-black ko-normal ${axis.color}`}>{tag}</span>
                            </TableCell>
                        );
                    })}
                </TableRow>
            </TableBody>
        </Table>
    );
};
