
import React from 'react';
import { GMProfile, GMSliders, GM_PERSONALITY_LABELS } from '../../types/gm';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../common/Table';
import { DirectionBadge } from '../common/DirectionBadge';
import { getGMSliderResult, getGMSliderLabel } from '../../services/tradeEngine/gmProfiler';

interface GMProfileCardProps {
    gmProfile: GMProfile | null | undefined;
    onGMClick?: () => void;
}

const SLIDER_KEYS: (keyof GMSliders)[] = [
    'aggressiveness', 'starWillingness', 'youthBias', 'riskTolerance', 'pickWillingness',
];

const SLIDER_COLORS: Record<keyof GMSliders, string> = {
    aggressiveness: 'text-rose-400',
    starWillingness: 'text-amber-400',
    youthBias: 'text-emerald-400',
    riskTolerance: 'text-cyan-400',
    pickWillingness: 'text-purple-400',
};

export const GMProfileCard: React.FC<GMProfileCardProps> = ({ gmProfile, onGMClick }) => {
    if (!gmProfile) {
        return (
            <div className="flex items-center justify-center h-20">
                <p className="text-slate-500 text-xs ko-normal">GM 데이터가 없습니다</p>
            </div>
        );
    }

    return (
        <Table fullHeight={false} className="!rounded-none">
            <TableHead noRow>
                <tr className="text-slate-500 text-xs font-black uppercase tracking-widest h-10">
                    <TableHeaderCell colSpan={4} align="center" className="bg-slate-950">
                        기본 정보
                    </TableHeaderCell>
                    <TableHeaderCell colSpan={SLIDER_KEYS.length} className="border-l border-slate-800 bg-slate-950">
                        GM 성향
                    </TableHeaderCell>
                </tr>
                <tr className="text-slate-500 text-xs font-black uppercase tracking-widest h-10">
                    <TableHeaderCell align="center" style={{ width: 70, minWidth: 70 }} className="bg-slate-950 ko-normal">
                        직책
                    </TableHeaderCell>
                    <TableHeaderCell align="left" style={{ width: 180, minWidth: 180 }} className="bg-slate-950 ko-normal px-3">
                        이름
                    </TableHeaderCell>
                    <TableHeaderCell style={{ width: 90, minWidth: 90 }} className="bg-slate-950 ko-normal">
                        성격
                    </TableHeaderCell>
                    <TableHeaderCell style={{ width: 70, minWidth: 70 }} className="bg-slate-950 border-r border-slate-800 ko-normal">
                        노선
                    </TableHeaderCell>
                    {SLIDER_KEYS.map((key, i) => (
                        <TableHeaderCell
                            key={key}
                            align="center"
                            className={`bg-slate-950 ko-normal ${i === 0 ? 'border-l border-slate-800' : ''}`}
                        >
                            {getGMSliderLabel(key)}
                        </TableHeaderCell>
                    ))}
                </tr>
            </TableHead>
            <TableBody>
                <TableRow>
                    <TableCell align="center" style={{ width: 70, minWidth: 70 }}>
                        <span className="text-xs font-bold text-slate-500 ko-normal">단장</span>
                    </TableCell>
                    <TableCell align="left" style={{ width: 180, minWidth: 180 }}>
                        <span
                            className={`text-xs font-semibold text-slate-200 ${onGMClick ? 'hover:text-indigo-400 cursor-pointer transition-colors' : ''}`}
                            onClick={onGMClick}
                        >
                            {gmProfile.name}
                        </span>
                    </TableCell>
                    <TableCell align="center" style={{ width: 90, minWidth: 90 }}>
                        <span className="text-xs font-bold text-indigo-400 ko-normal">
                            {GM_PERSONALITY_LABELS[gmProfile.personalityType]}
                        </span>
                    </TableCell>
                    <TableCell align="center" style={{ width: 70, minWidth: 70 }} className="border-r border-slate-800">
                        <DirectionBadge direction={gmProfile.direction} size="sm" />
                    </TableCell>
                    {SLIDER_KEYS.map((key, i) => {
                        const { tag } = getGMSliderResult(key, gmProfile.sliders[key]);
                        return (
                            <TableCell
                                key={key}
                                align="center"
                                className={i === 0 ? 'border-l border-slate-800' : ''}
                            >
                                <span className={`text-xs font-black ko-normal ${SLIDER_COLORS[key]}`}>{tag}</span>
                            </TableCell>
                        );
                    })}
                </TableRow>
            </TableBody>
        </Table>
    );
};
