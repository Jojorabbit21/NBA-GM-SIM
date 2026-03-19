import React, { useState } from 'react';
import { Trophy, Shield } from 'lucide-react';
import { PlayerAwardEntry, PlayerAwardType } from '../../types/player';

// ── 어워드 메타데이터 ──

interface AwardMeta {
    /** 테이블 "이름" 컬럼 */
    name: string;
    /** 테이블 "내용" 컬럼 */
    detail: string;
    /** 헤더 트로피용 짧은 라벨 */
    shortLabel: string;
    img?: string;
    icon?: 'trophy' | 'shield';
    color: string;
    order: number;
}

const AWARD_META: Record<PlayerAwardType, AwardMeta> = {
    CHAMPION:             { name: '챔피언',         detail: '우승',   shortLabel: '우승',  img: '/images/final.png', color: 'text-amber-400',  order: 0 },
    REG_SEASON_CHAMPION:  { name: '정규시즌 우승',  detail: '우승',   shortLabel: 'RS',    img: '/images/reg.png',   color: 'text-amber-300',  order: 1 },
    MVP:                  { name: 'MVP',            detail: '수상',   shortLabel: 'MVP',   img: '/images/mvp.png',   color: 'text-yellow-400', order: 2 },
    FINALS_MVP:           { name: '파이널 MVP',     detail: '수상',   shortLabel: 'FMVP',  img: '/images/fmvp.png',  color: 'text-yellow-300', order: 3 },
    DPOY:                 { name: 'DPOY',           detail: '수상',   shortLabel: 'DPOY',  img: '/images/dpoy.png',  color: 'text-blue-400',   order: 4 },
    ALL_NBA_1:            { name: '올-오펜시브 팀',     detail: '1st',    shortLabel: '1st',   icon: 'trophy',           color: 'text-amber-400',  order: 5 },
    ALL_NBA_2:            { name: '올-오펜시브 팀',     detail: '2nd',    shortLabel: '2nd',   icon: 'trophy',           color: 'text-slate-300',  order: 6 },
    ALL_NBA_3:            { name: '올-오펜시브 팀',     detail: '3rd',    shortLabel: '3rd',   icon: 'trophy',           color: 'text-slate-400',  order: 7 },
    ALL_DEF_1:            { name: '올-디펜시브 팀',     detail: '1st',    shortLabel: 'D1st',  icon: 'shield',           color: 'text-green-400',  order: 8 },
    ALL_DEF_2:            { name: '올-디펜시브 팀',     detail: '2nd',    shortLabel: 'D2nd',  icon: 'shield',           color: 'text-green-500',  order: 9 },
};

// ── 헤더용 집계 ──

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
        .filter(a => AWARD_META[a.type] != null)
        .sort((a, b) => AWARD_META[a.type].order - AWARD_META[b.type].order);
}

// ── 헤더용 트로피 Pill (주요 4종, tooltip 포함) ──

const HeaderTrophy: React.FC<{ award: AggregatedAward }> = ({ award }) => {
    const [hovered, setHovered] = useState(false);
    const meta = AWARD_META[award.type];

    return (
        <div
            className="relative"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* 트로피 이미지 */}
            {meta.img && (
                <img src={meta.img} alt={meta.name} className="w-10 h-10 object-contain drop-shadow-lg" />
            )}
            {/* 우측 하단 카운트 칩 */}
            <span className="absolute -bottom-1 -right-1.5 bg-slate-800 border border-slate-600 rounded-full
                px-1.5 py-0 text-[9px] font-black text-white leading-4 shadow-md">
                ×{award.count}
            </span>
            {/* Tooltip */}
            {hovered && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50
                    bg-slate-800 border border-slate-600 rounded-lg px-3 py-2
                    text-xs text-slate-200 whitespace-nowrap shadow-xl pointer-events-none">
                    <div className="font-bold text-white mb-1">{meta.name}{award.count >= 2 ? ` ×${award.count}` : ''}</div>
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
    // MVP/DPOY는 1위(수상)만 헤더 트로피에 표시 (후보 제외)
    const winnersOnly = awards.filter(a => {
        if (a.type === 'MVP' || a.type === 'DPOY') return a.rank === 1 || a.rank == null;
        return true;
    });
    const headerAwards = aggregateAwards(winnersOnly).filter(a => headerTypes.includes(a.type));
    if (headerAwards.length === 0) return null;

    return (
        <div className="flex items-end gap-3 shrink-0">
            {headerAwards.map(a => (
                <HeaderTrophy key={a.type} award={a} />
            ))}
        </div>
    );
};

// ── SECTION 4 우측: 전체 수상 내역 테이블 ──

export const PlayerAwardList: React.FC<{ awards?: PlayerAwardEntry[] }> = ({ awards }) => {
    if (!awards || awards.length === 0) {
        return (
            <div className="flex items-center justify-center h-[400px]">
                <span className="text-slate-500 text-sm">수상 내역이 없습니다</span>
            </div>
        );
    }

    // 각 엔트리를 개별 행으로 (시즌 desc → order asc 정렬)
    const sorted = [...awards].sort((a, b) => {
        const seasonCmp = b.season.localeCompare(a.season);
        if (seasonCmp !== 0) return seasonCmp;
        return AWARD_META[a.type].order - AWARD_META[b.type].order;
    });

    return (
        <table className="w-full text-xs">
            <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-800">
                    <th className="px-4 py-2 text-left">시즌</th>
                    <th className="px-4 py-2 text-left">이름</th>
                    <th className="px-4 py-2 text-left">내용</th>
                </tr>
            </thead>
            <tbody>
                {sorted.map((entry, idx) => {
                    const meta = AWARD_META[entry.type];
                    return (
                        <tr key={idx} className="border-b border-slate-800/50 h-9 hover:bg-white/[0.02]">
                            <td className="px-4 font-mono tabular-nums text-slate-400">{entry.season}</td>
                            <td className="px-4">
                                <span className="flex items-center gap-1.5">
                                    {meta.img ? (
                                        <img src={meta.img} alt={meta.name} className="w-4 h-4 object-contain" />
                                    ) : meta.icon === 'shield' ? (
                                        <Shield size={14} className={meta.color} />
                                    ) : (
                                        <Trophy size={14} className={meta.color} />
                                    )}
                                    <span className={`font-bold ${meta.color}`}>{meta.name}</span>
                                </span>
                            </td>
                            <td className="px-4 font-bold text-slate-300">{meta.detail}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};
