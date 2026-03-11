
import React from 'react';
import { HeadCoach, HeadCoachPreferences } from '../../types/coaching';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';

interface HeadCoachTableProps {
    coach: HeadCoach | null | undefined;
}

const PREFERENCE_COLS: {
    key: keyof HeadCoachPreferences;
    label: string;
    group: 'offense' | 'defense';
}[] = [
    { key: 'offenseIdentity', label: 'SYS', group: 'offense' },
    { key: 'tempo',           label: 'TMP', group: 'offense' },
    { key: 'scoringFocus',    label: 'SCR', group: 'offense' },
    { key: 'pnrEmphasis',     label: 'PNR', group: 'offense' },
    { key: 'defenseStyle',    label: 'DEF', group: 'defense' },
    { key: 'helpScheme',      label: 'HLP', group: 'defense' },
    { key: 'zonePreference',  label: 'ZON', group: 'defense' },
];

const PREF_TOOLTIPS: Record<keyof HeadCoachPreferences, string> = {
    offenseIdentity: '1=히어로볼 / 10=시스템농구',
    tempo:           '1=그라인드 / 10=런앤건',
    scoringFocus:    '1=페인트존 / 10=3점라인',
    pnrEmphasis:     '1=ISO·포스트 / 10=PnR헤비',
    defenseStyle:    '1=보수적 / 10=공격적프레셔',
    helpScheme:      '1=1:1고수 / 10=적극로테이션',
    zonePreference:  '1=대인전용 / 10=존위주',
};

const getPrefColor = (val: number): string => {
    if (val >= 9) return 'text-fuchsia-400';
    if (val >= 7) return 'text-emerald-400';
    if (val >= 4) return 'text-amber-400';
    return 'text-slate-500';
};

export const HeadCoachTable: React.FC<HeadCoachTableProps> = ({ coach }) => {
    if (!coach) {
        return (
            <div className="flex items-center justify-center h-40">
                <p className="text-slate-500 text-sm ko-normal">코치 데이터가 없습니다</p>
            </div>
        );
    }

    const offenseCols = PREFERENCE_COLS.filter(c => c.group === 'offense');
    const defenseCols = PREFERENCE_COLS.filter(c => c.group === 'defense');

    return (
        <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 px-1">Head Coach</h3>
            <Table fullHeight={false}>
                <TableHead noRow>
                    <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest h-10">
                        <TableHeaderCell colSpan={4} align="left" className="bg-slate-950">
                            Info
                        </TableHeaderCell>
                        <TableHeaderCell colSpan={offenseCols.length} className="border-l border-slate-800 bg-slate-950">
                            Offense
                        </TableHeaderCell>
                        <TableHeaderCell colSpan={defenseCols.length} className="border-l border-slate-800 bg-slate-950">
                            Defense
                        </TableHeaderCell>
                    </tr>
                    <tr className="text-slate-500 text-[10px] font-black uppercase tracking-widest h-10">
                        <TableHeaderCell align="left" style={{ width: 200, minWidth: 200 }} className="bg-slate-950">
                            Name
                        </TableHeaderCell>
                        <TableHeaderCell style={{ width: 70, minWidth: 70 }} className="bg-slate-950">
                            Salary
                        </TableHeaderCell>
                        <TableHeaderCell style={{ width: 50, minWidth: 50 }} className="bg-slate-950">
                            Yr
                        </TableHeaderCell>
                        <TableHeaderCell style={{ width: 50, minWidth: 50 }} className="bg-slate-950 border-r border-slate-800">
                            Left
                        </TableHeaderCell>
                        {offenseCols.map((col, i) => (
                            <TableHeaderCell
                                key={col.key}
                                style={{ width: 54, minWidth: 54 }}
                                className={i === 0 ? 'border-l border-slate-800' : ''}
                                title={PREF_TOOLTIPS[col.key]}
                            >
                                {col.label}
                            </TableHeaderCell>
                        ))}
                        {defenseCols.map((col, i) => (
                            <TableHeaderCell
                                key={col.key}
                                style={{ width: 54, minWidth: 54 }}
                                className={i === 0 ? 'border-l border-slate-800' : ''}
                                title={PREF_TOOLTIPS[col.key]}
                            >
                                {col.label}
                            </TableHeaderCell>
                        ))}
                    </tr>
                </TableHead>
                <TableBody>
                    <TableRow>
                        <TableCell align="left" style={{ width: 200, minWidth: 200 }}>
                            <span className="text-xs font-semibold text-slate-200">{coach.name}</span>
                        </TableCell>
                        <TableCell align="center" style={{ width: 70, minWidth: 70 }}>
                            <span className="text-xs font-mono text-emerald-400">${coach.contractSalary}M</span>
                        </TableCell>
                        <TableCell align="center" style={{ width: 50, minWidth: 50 }}>
                            <span className="text-xs font-mono text-slate-400">{coach.contractYears}</span>
                        </TableCell>
                        <TableCell align="center" style={{ width: 50, minWidth: 50 }} className="border-r border-slate-800">
                            <span className="text-xs font-mono text-slate-400">{coach.contractYearsRemaining}</span>
                        </TableCell>
                        {offenseCols.map((col, i) => {
                            const val = coach.preferences[col.key];
                            return (
                                <TableCell
                                    key={col.key}
                                    align="center"
                                    className={i === 0 ? 'border-l border-slate-800' : ''}
                                    title={PREF_TOOLTIPS[col.key]}
                                >
                                    <span className={`font-mono font-black tabular-nums ${getPrefColor(val)}`}>{val}</span>
                                </TableCell>
                            );
                        })}
                        {defenseCols.map((col, i) => {
                            const val = coach.preferences[col.key];
                            return (
                                <TableCell
                                    key={col.key}
                                    align="center"
                                    className={i === 0 ? 'border-l border-slate-800' : ''}
                                    title={PREF_TOOLTIPS[col.key]}
                                >
                                    <span className={`font-mono font-black tabular-nums ${getPrefColor(val)}`}>{val}</span>
                                </TableCell>
                            );
                        })}
                    </TableRow>
                </TableBody>
            </Table>
        </div>
    );
};
