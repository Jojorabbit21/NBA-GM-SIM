import React, { useState } from 'react';
import { Trophy, Shield } from 'lucide-react';
import { PlayerAwardEntry, PlayerAwardType } from '../../types/player';

// ── 어워드 메타데이터 ──

interface AwardMeta {
    label: string;
    shortLabel: string;
    img?: string;
    icon?: 'trophy' | 'shield';
    color: string;
    order: number;
}

const AWARD_META: Record<PlayerAwardType, AwardMeta> = {
    CHAMPION:   { label: '우승',           shortLabel: '우승',    img: '/images/final.png', color: 'text-amber-400',  order: 0 },
    MVP:        { label: 'MVP',            shortLabel: 'MVP',     img: '/images/mvp.png',   color: 'text-yellow-400', order: 1 },
    FINALS_MVP: { label: '파이널 MVP',     shortLabel: 'FMVP',    img: '/images/fmvp.png',  color: 'text-yellow-300', order: 2 },
    DPOY:       { label: 'DPOY',           shortLabel: 'DPOY',    img: '/images/dpoy.png',  color: 'text-blue-400',   order: 3 },
    ALL_NBA_1:  { label: 'All-NBA 1st',    shortLabel: '1st',     icon: 'trophy',           color: 'text-amber-400',  order: 4 },
    ALL_NBA_2:  { label: 'All-NBA 2nd',    shortLabel: '2nd',     icon: 'trophy',           color: 'text-slate-300',  order: 5 },
    ALL_NBA_3:  { label: 'All-NBA 3rd',    shortLabel: '3rd',     icon: 'trophy',           color: 'text-slate-400',  order: 6 },
    ALL_DEF_1:  { label: 'All-Def 1st',    shortLabel: 'D1st',    icon: 'shield',           color: 'text-green-400',  order: 7 },
    ALL_DEF_2:  { label: 'All-Def 2nd',    shortLabel: 'D2nd',    icon: 'shield',           color: 'text-green-500',  order: 8 },
};

// ── 집계 ──

interface AggregatedAward {
    type: PlayerAwardType;
    count: number;
    seasons: string[];
}

function aggregateAwards(awards: PlayerAwardEntry[]): AggregatedAward[] {
    const map = new Map<PlayerAwardType, { count: number; seasons: string[] }>();
    for (const a of awards) {
        const existing = map.get(a.type);
        if (existing) {
            existing.count++;
            existing.seasons.push(a.season);
        } else {
            map.set(a.type, { count: 1, seasons: [a.season] });
        }
    }
    return Array.from(map.entries())
        .map(([type, data]) => ({ type, ...data }))
        .sort((a, b) => AWARD_META[a.type].order - AWARD_META[b.type].order);
}

// ── 개별 어워드 Pill (tooltip 포함) ──

const AwardPill: React.FC<{ award: AggregatedAward; compact?: boolean }> = ({ award, compact }) => {
    const [hovered, setHovered] = useState(false);
    const meta = AWARD_META[award.type];

    return (
        <div
            className="relative inline-flex"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div className={`flex items-center gap-1.5 ${compact ? 'gap-1' : ''} px-2 py-1 rounded-lg
                bg-white/5 border border-white/10 cursor-default transition-colors hover:bg-white/10`}>
                {meta.img ? (
                    <img src={meta.img} alt={meta.label} className={compact ? 'w-5 h-5' : 'w-5 h-5'} style={{ objectFit: 'contain' }} />
                ) : meta.icon === 'shield' ? (
                    <Shield size={compact ? 14 : 16} className={meta.color} />
                ) : (
                    <Trophy size={compact ? 14 : 16} className={meta.color} />
                )}
                {!compact && (
                    <span className={`text-xs font-bold ${meta.color}`}>
                        {meta.shortLabel}
                    </span>
                )}
                {award.count >= 2 && (
                    <span className={`text-[10px] font-black ${meta.color} opacity-80`}>
                        ×{award.count}
                    </span>
                )}
            </div>
            {/* Tooltip */}
            {hovered && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50
                    bg-slate-800 border border-slate-600 rounded-lg px-3 py-2
                    text-xs text-slate-200 whitespace-nowrap shadow-xl pointer-events-none">
                    <div className="font-bold text-white mb-1">{meta.label}{award.count >= 2 ? ` ×${award.count}` : ''}</div>
                    {award.seasons.map((s, i) => (
                        <div key={i} className="text-slate-400">{s}</div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── 헤더용 트로피 (주요 4종만, 이미지 중심) ──

export const HeaderAwardTrophies: React.FC<{ awards: PlayerAwardEntry[] }> = ({ awards }) => {
    const headerTypes: PlayerAwardType[] = ['CHAMPION', 'MVP', 'FINALS_MVP', 'DPOY'];
    const headerAwards = aggregateAwards(awards).filter(a => headerTypes.includes(a.type));
    if (headerAwards.length === 0) return null;

    return (
        <div className="flex items-center gap-1.5 shrink-0">
            {headerAwards.map(a => (
                <AwardPill key={a.type} award={a} compact />
            ))}
        </div>
    );
};

// ── SECTION 4 우측: 전체 수상 내역 리스트 ──

export const PlayerAwardList: React.FC<{ awards?: PlayerAwardEntry[] }> = ({ awards }) => {
    if (!awards || awards.length === 0) {
        return (
            <div className="flex items-center justify-center h-[400px]">
                <span className="text-slate-500 text-sm">수상 내역이 없습니다</span>
            </div>
        );
    }

    const aggregated = aggregateAwards(awards);

    return (
        <div className="p-4 space-y-2">
            {aggregated.map(a => (
                <AwardPill key={a.type} award={a} />
            ))}
        </div>
    );
};
