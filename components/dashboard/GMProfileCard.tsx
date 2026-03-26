
import React from 'react';
import { GMProfile, GMSliders, GM_PERSONALITY_LABELS, DIRECTION_LABELS, TeamDirection } from '../../types/gm';
import { getGMSliderResult, getGMSliderLabel } from '../../services/tradeEngine/gmProfiler';

interface GMProfileCardProps {
    gmProfile?: GMProfile | null | undefined;
    onGMClick?: () => void;
    /** 사용자 팀일 경우 닉네임 전달 — CPU GM 대신 사용자 표시 */
    userNickname?: string;
}

const SLIDER_KEYS: (keyof GMSliders)[] = [
    'aggressiveness', 'starWillingness', 'youthBias', 'riskTolerance', 'pickWillingness',
];

const DIRECTION_COLORS: Record<TeamDirection, string> = {
    winNow: 'text-red-400',
    buyer: 'text-amber-400',
    standPat: 'text-slate-400',
    seller: 'text-blue-400',
    tanking: 'text-purple-400',
};

const SLIDER_COLORS: Record<keyof GMSliders, string> = {
    aggressiveness: 'text-rose-400',
    starWillingness: 'text-amber-400',
    youthBias: 'text-emerald-400',
    riskTolerance: 'text-cyan-400',
    pickWillingness: 'text-purple-400',
};

const thBase = "py-3 px-1.5 text-xs font-black uppercase tracking-widest text-slate-500 whitespace-nowrap border-b border-slate-800 text-center";
const tdBase = "py-2 px-3 whitespace-nowrap border-b border-slate-800/50";

export const GMProfileCard: React.FC<GMProfileCardProps> = ({ gmProfile, onGMClick, userNickname }) => {
    const isUser = userNickname !== undefined;

    return (
        <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0" style={{ minWidth: '600px' }}>
                <thead className="bg-slate-950 sticky top-0 z-40">
                    {/* 그룹 헤더 */}
                    <tr className="h-8">
                        <th colSpan={3} className="bg-slate-950 border-b border-r border-slate-800" />
                        <th
                            colSpan={SLIDER_KEYS.length}
                            className="py-1 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center bg-slate-950 border-b border-slate-800"
                        >
                            GM 성향
                        </th>
                    </tr>
                    {/* 열 헤더 */}
                    <tr className="h-10">
                        <th className={`${thBase} pl-4 text-left border-r border-slate-800 sticky left-0 z-10 bg-slate-950`}>이름</th>
                        <th className={`${thBase} border-r border-slate-800`}>성격</th>
                        <th className={`${thBase} border-r border-slate-800`}>노선</th>
                        {SLIDER_KEYS.map(k => (
                            <th key={k} className={thBase}>{getGMSliderLabel(k)}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    <tr className="group hover:bg-white/5">
                        {/* 이름 */}
                        <td className={`${tdBase} pl-4 border-r border-slate-800 sticky left-0 bg-slate-900 group-hover:bg-slate-800 z-10 transition-colors`}>
                            {isUser ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-indigo-400">{userNickname || 'You'}</span>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 ko-normal">
                                        사용자
                                    </span>
                                </div>
                            ) : (
                                <span
                                    className={`text-xs text-slate-200 ${onGMClick ? 'hover:text-indigo-400 cursor-pointer transition-colors' : ''}`}
                                    onClick={onGMClick}
                                >
                                    {gmProfile?.name ?? '-'}
                                </span>
                            )}
                        </td>
                        {/* 성격 */}
                        <td className={`${tdBase} border-r border-slate-800 text-center`}>
                            {gmProfile ? (
                                <span className="text-xs text-indigo-400 ko-normal">{GM_PERSONALITY_LABELS[gmProfile.personalityType]}</span>
                            ) : (
                                <span className="text-xs text-slate-600">-</span>
                            )}
                        </td>
                        {/* 노선 */}
                        <td className={`${tdBase} border-r border-slate-800 text-center`}>
                            {gmProfile ? (
                                <span className={`text-xs ko-normal ${DIRECTION_COLORS[gmProfile.direction]}`}>{DIRECTION_LABELS[gmProfile.direction]}</span>
                            ) : (
                                <span className="text-xs text-slate-600">-</span>
                            )}
                        </td>
                        {/* GM 성향 슬라이더 */}
                        {SLIDER_KEYS.map(key => {
                            if (!gmProfile) {
                                return (
                                    <td key={key} className={`${tdBase} text-center`}>
                                        <span className="text-xs text-slate-600">-</span>
                                    </td>
                                );
                            }
                            const { tag } = getGMSliderResult(key, gmProfile.sliders[key]);
                            return (
                                <td key={key} className={`${tdBase} text-center`}>
                                    <span className={`text-xs ko-normal ${SLIDER_COLORS[key]}`}>{tag}</span>
                                </td>
                            );
                        })}
                    </tr>
                </tbody>
            </table>
        </div>
    );
};
