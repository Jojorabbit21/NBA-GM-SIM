
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

export const GMProfileCard: React.FC<GMProfileCardProps> = ({ gmProfile, onGMClick, userNickname }) => {
    // 사용자 팀
    if (userNickname !== undefined) {
        return (
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 text-xs">
                <span className="text-slate-400">단장</span>
                <span className="font-semibold text-indigo-400">{userNickname || 'You'}</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 ko-normal">
                    사용자
                </span>
            </div>
        );
    }

    // CPU GM 없음
    if (!gmProfile) {
        return (
            <div className="flex items-center justify-center h-20 text-slate-500 text-xs ko-normal">
                GM 데이터가 없습니다
            </div>
        );
    }

    return (
        <div>
            <Row label="이름">
                <span
                    className={`text-slate-200 ${onGMClick ? 'hover:text-indigo-400 cursor-pointer transition-colors' : ''}`}
                    onClick={onGMClick}
                >
                    {gmProfile.name}
                </span>
            </Row>
            <Row label="성격">
                <span className="text-indigo-400 ko-normal">{GM_PERSONALITY_LABELS[gmProfile.personalityType]}</span>
            </Row>
            <Row label="노선">
                <span className={`ko-normal ${DIRECTION_COLORS[gmProfile.direction]}`}>
                    {DIRECTION_LABELS[gmProfile.direction]}
                </span>
            </Row>
            <SubHeader label="GM 성향" />
            {SLIDER_KEYS.map(key => {
                const { tag } = getGMSliderResult(key, gmProfile.sliders[key]);
                return (
                    <Row key={key} label={getGMSliderLabel(key)}>
                        <span className={`ko-normal ${SLIDER_COLORS[key]}`}>{tag}</span>
                    </Row>
                );
            })}
        </div>
    );
};
