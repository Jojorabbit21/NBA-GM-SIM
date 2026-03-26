
import React from 'react';
import { HeadCoach } from '../../types/coaching';
import { PREF_AXES, PREF_ORDER, getAxisResult } from '../../views/CoachDetailView';
import { formatMoney } from '../../utils/formatMoney';

interface HeadCoachTableProps {
    coach: HeadCoach | null | undefined;
    onCoachClick?: () => void;
}

const thBase = "py-3 px-1.5 text-xs font-black uppercase tracking-widest text-slate-500 whitespace-nowrap border-b border-slate-800 text-center";
const tdBase = "py-2 px-3 whitespace-nowrap border-b border-slate-800/50";

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
            <table className="w-full border-separate border-spacing-0" style={{ minWidth: '800px' }}>
                <thead className="bg-slate-950 sticky top-0 z-40">
                    {/* 그룹 헤더 */}
                    <tr className="h-8">
                        <th colSpan={4} className="bg-slate-950 border-b border-r border-slate-800" />
                        <th
                            colSpan={offenseKeys.length}
                            className="py-1 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center bg-slate-950 border-b border-r border-slate-800"
                        >
                            공격 전술
                        </th>
                        <th
                            colSpan={defenseKeys.length}
                            className="py-1 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center bg-slate-950 border-b border-slate-800"
                        >
                            수비 전술
                        </th>
                    </tr>
                    {/* 열 헤더 */}
                    <tr className="h-10">
                        <th className={`${thBase} pl-4 text-left border-r border-slate-800 sticky left-0 z-10 bg-slate-950`}>이름</th>
                        <th className={`${thBase} border-r border-slate-800`}>역할</th>
                        <th className={`${thBase} border-r border-slate-800`}>연봉</th>
                        <th className={`${thBase} border-r border-slate-800`}>잔여계약</th>
                        {offenseKeys.map((key, i) => (
                            <th
                                key={key}
                                className={`${thBase} ${i === offenseKeys.length - 1 ? 'border-r border-slate-800' : ''}`}
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
                    <tr className="group hover:bg-white/5">
                        <td className={`${tdBase} pl-4 border-r border-slate-800 sticky left-0 bg-slate-900 group-hover:bg-slate-800 z-10 transition-colors`}>
                            <span
                                className={`text-xs text-slate-200 ${onCoachClick ? 'hover:text-indigo-400 cursor-pointer transition-colors' : ''}`}
                                onClick={onCoachClick}
                            >
                                {coach.name}
                            </span>
                        </td>
                        <td className={`${tdBase} border-r border-slate-800 text-center`}>
                            <span className="text-xs text-slate-400 ko-normal">감독</span>
                        </td>
                        <td className={`${tdBase} border-r border-slate-800 text-center`}>
                            <span className="text-xs font-mono tabular-nums text-emerald-400">{formatMoney(coach.contractSalary)}</span>
                        </td>
                        <td className={`${tdBase} border-r border-slate-800 text-center`}>
                            <span className="text-xs font-mono tabular-nums text-slate-300">{coach.contractYearsRemaining}년</span>
                        </td>
                        {offenseKeys.map((key, i) => {
                            const axis = PREF_AXES[key];
                            const { tag } = getAxisResult(axis, coach.preferences[key]);
                            return (
                                <td
                                    key={key}
                                    className={`${tdBase} text-center ko-normal text-xs ${axis.color} ${i === offenseKeys.length - 1 ? 'border-r border-slate-800' : ''}`}
                                >
                                    {tag}
                                </td>
                            );
                        })}
                        {defenseKeys.map(key => {
                            const axis = PREF_AXES[key];
                            const { tag } = getAxisResult(axis, coach.preferences[key]);
                            return (
                                <td key={key} className={`${tdBase} text-center ko-normal text-xs ${axis.color}`}>
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
