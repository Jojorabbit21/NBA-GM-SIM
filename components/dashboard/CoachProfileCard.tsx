
import React from 'react';
import { HeadCoach } from '../../types/coaching';
import { PREF_AXES, PREF_ORDER, getAxisResult } from '../../views/CoachDetailView';
import { formatMoney } from '../../utils/formatMoney';

interface HeadCoachTableProps {
    coach: HeadCoach | null | undefined;
    onCoachClick?: () => void;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex items-center justify-between px-4 py-1.5 text-xs border-b border-slate-800 last:border-0">
        <span className="text-slate-400">{label}</span>
        <span className="font-bold">{children}</span>
    </div>
);

const SubHeader: React.FC<{ label: string }> = ({ label }) => (
    <div className="px-4 py-1 text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-800 bg-slate-800/50">
        {label}
    </div>
);

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
        <div>
            <Row label="이름">
                <span
                    className={`text-slate-200 ${onCoachClick ? 'hover:text-indigo-400 cursor-pointer transition-colors' : ''}`}
                    onClick={onCoachClick}
                >
                    {coach.name}
                </span>
            </Row>
            <Row label="연봉">
                <span className="text-emerald-400 font-mono">{formatMoney(coach.contractSalary)}</span>
            </Row>
            <Row label="계약">
                <span className="text-slate-300 font-mono">
                    {coach.contractYears}년 계약 / 잔여 {coach.contractYearsRemaining}년
                </span>
            </Row>
            <SubHeader label="공격 전술" />
            {offenseKeys.map(key => {
                const axis = PREF_AXES[key];
                const { tag } = getAxisResult(axis, coach.preferences[key]);
                return (
                    <Row key={key} label={axis.label}>
                        <span className={`ko-normal ${axis.color}`}>{tag}</span>
                    </Row>
                );
            })}
            <SubHeader label="수비 전술" />
            {defenseKeys.map(key => {
                const axis = PREF_AXES[key];
                const { tag } = getAxisResult(axis, coach.preferences[key]);
                return (
                    <Row key={key} label={axis.label}>
                        <span className={`ko-normal ${axis.color}`}>{tag}</span>
                    </Row>
                );
            })}
        </div>
    );
};
