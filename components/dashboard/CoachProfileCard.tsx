
import React from 'react';
import { HeadCoach } from '../../types/coaching';
import { PREF_AXES, PREF_ORDER, getAxisResult } from '../../views/CoachDetailView';
import { formatMoney } from '../../utils/formatMoney';

interface HeadCoachTableProps {
    coach: HeadCoach | null | undefined;
    onCoachClick?: () => void;
}

const thBase = "py-2 px-3 text-xs font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap bg-slate-800 text-left border-b border-slate-700";

export const HeadCoachTable: React.FC<HeadCoachTableProps> = ({ coach, onCoachClick }) => {
    if (!coach) {
        return (
            <div className="flex items-center justify-center h-20 text-slate-500 text-xs ko-normal">
                코치 데이터가 없습니다
            </div>
        );
    }

    const offenseKeys = PREF_ORDER.filter(k => PREF_AXES[k].group === 'offense');
    const defenseKeys = PREF_ORDER.filter(k => PREF_AXES[k].group === 'defense');

    return (
        <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs" style={{ minWidth: '800px' }}>
                <thead>
                    {/* 그룹 헤더 */}
                    <tr className="border-b border-slate-700">
                        <th colSpan={4} className="py-1 px-3 bg-slate-800 border-r border-slate-700" />
                        <th
                            colSpan={offenseKeys.length}
                            className="py-1 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center bg-slate-800/60 border-r border-slate-700"
                        >
                            공격 전술
                        </th>
                        <th
                            colSpan={defenseKeys.length}
                            className="py-1 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center bg-slate-800/60"
                        >
                            수비 전술
                        </th>
                    </tr>
                    {/* 열 헤더 */}
                    <tr>
                        <th className={`${thBase} sticky left-0 z-10 border-r border-slate-700`}>이름</th>
                        <th className={`${thBase} border-r border-slate-700`}>역할</th>
                        <th className={`${thBase} border-r border-slate-700`}>연봉</th>
                        <th className={`${thBase} border-r border-slate-700`}>잔여계약</th>
                        {offenseKeys.map((key, i) => (
                            <th
                                key={key}
                                className={`${thBase} ${i === offenseKeys.length - 1 ? 'border-r border-slate-700' : ''}`}
                            >
                                {PREF_AXES[key].label}
                            </th>
                        ))}
                        {defenseKeys.map(key => (
                            <th key={key} className={thBase}>{PREF_AXES[key].label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    <tr className="group border-b border-slate-800 hover:bg-slate-800/50">
                        <td className="py-2 px-3 text-xs sticky left-0 bg-slate-900 group-hover:bg-slate-800/50 z-10 border-r border-slate-800">
                            <span
                                className={`text-slate-200 ${onCoachClick ? 'hover:text-indigo-400 cursor-pointer transition-colors' : ''}`}
                                onClick={onCoachClick}
                            >
                                {coach.name}
                            </span>
                        </td>
                        <td className="py-2 px-3 text-xs text-slate-400 border-r border-slate-800 whitespace-nowrap">감독</td>
                        <td className="py-2 px-3 text-xs font-mono text-emerald-400 border-r border-slate-800 whitespace-nowrap">
                            {formatMoney(coach.contractSalary)}
                        </td>
                        <td className="py-2 px-3 text-xs font-mono text-slate-300 border-r border-slate-800 whitespace-nowrap">
                            {coach.contractYearsRemaining}년
                        </td>
                        {offenseKeys.map((key, i) => {
                            const axis = PREF_AXES[key];
                            const { tag } = getAxisResult(axis, coach.preferences[key]);
                            return (
                                <td
                                    key={key}
                                    className={`py-2 px-3 text-xs ko-normal whitespace-nowrap ${axis.color} ${i === offenseKeys.length - 1 ? 'border-r border-slate-800' : ''}`}
                                >
                                    {tag}
                                </td>
                            );
                        })}
                        {defenseKeys.map(key => {
                            const axis = PREF_AXES[key];
                            const { tag } = getAxisResult(axis, coach.preferences[key]);
                            return (
                                <td key={key} className={`py-2 px-3 text-xs ko-normal whitespace-nowrap ${axis.color}`}>
                                    {tag}
                                </td>
                            );
                        })}
                    </tr>
                </tbody>
            </table>
        </div>
    );
};
