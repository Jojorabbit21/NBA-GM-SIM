
import React, { useState, useMemo } from 'react';
import { Search, UserPlus, ChevronUp, ChevronDown } from 'lucide-react';
import { Team, Player } from '../types';
import { OvrBadge } from '../components/common/OvrBadge';
import { PageHeader } from '../components/common/PageHeader';
import { calculatePlayerOvr } from '../utils/constants';
import { ATTR_GROUPS, ATTR_LABEL, ATTR_AVG_KEYS } from '../data/attributeConfig';

// ── 스카우팅 한줄 평가 생성 ──

const SCOUT_COMMENTS: { check: (p: Player) => boolean; text: string }[] = [
    { check: p => p.potential >= 95, text: '제너레이셔널 탤런트. 프랜차이즈 스타 잠재력.' },
    { check: p => p.ath >= 80 && p.speed >= 80, text: '엘리트급 운동능력. 트랜지션 게임의 핵심.' },
    { check: p => (p.threeCorner + p.three45 + p.threeTop) / 3 >= 75, text: '뛰어난 3점 슈팅 능력. 스페이싱에 큰 기여 예상.' },
    { check: p => p.passVision >= 75 && p.passIq >= 75, text: '탁월한 코트 비전과 패스 센스 보유.' },
    { check: p => p.intDef >= 75 && p.blk >= 70, text: '림 프로텍터로서의 잠재력이 돋보임.' },
    { check: p => p.perDef >= 75 && p.steal >= 70, text: '수비 스위치 능력이 뛰어남. 멀티 포지션 수비 가능.' },
    { check: p => p.postPlay >= 70 && p.strength >= 70, text: '전통적 빅맨 스킬셋. 포스트업 위협적.' },
    { check: p => p.handling >= 70 && p.spdBall >= 70, text: '볼 핸들링이 좋아 셀프 크리에이션 가능.' },
    { check: p => p.durability < 65, text: '내구성에 우려. 부상 관리 필수.' },
    { check: p => p.offConsist >= 75 && p.defConsist >= 75, text: '양쪽 코트에서 일관된 플레이 기대.' },
    { check: p => p.hustle >= 80, text: '팀에 에너지를 불어넣는 허슬 플레이어.' },
    { check: () => true, text: '발전 가능성이 있는 원석. 꾸준한 육성 필요.' },
];

function getScoutComment(p: Player): string {
    for (const sc of SCOUT_COMMENTS) {
        if (sc.check(p)) return sc.text;
    }
    return '';
}

// ── 능력치 히트맵 색상 (25~90 범위 기준) ──

function getAttrColor(value: number): React.CSSProperties | undefined {
    const min = 25, max = 90;
    const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
    if (ratio > 0.5) {
        const opacity = (ratio - 0.5) * 2 * 0.45;
        return { backgroundColor: `rgba(16, 185, 129, ${opacity})` };
    } else {
        const opacity = (0.5 - ratio) * 2 * 0.45;
        if (opacity < 0.05) return undefined;
        return { backgroundColor: `rgba(239, 68, 68, ${opacity})` };
    }
}

// ── 컬럼 정의 ──

interface ColDef {
    key: string;
    label: string;
    width: number;
    sortable?: boolean;
    group?: string;       // 능력치 그룹 헤더
    isAttr?: boolean;     // 능력치 컬럼
    isAvg?: boolean;      // 카테고리 평균
    stickyLeft?: number;
    stickyShadow?: boolean;
}

function buildColumns(): ColDef[] {
    const cols: ColDef[] = [
        { key: 'rank', label: '#', width: 44, stickyLeft: 0 },
        { key: 'name', label: '이름', width: 160, sortable: true, stickyLeft: 44 },
        { key: 'position', label: 'POS', width: 48, sortable: true, stickyLeft: 204 },
        { key: 'ovr', label: 'OVR', width: 48, sortable: true, stickyLeft: 252, stickyShadow: true },
        { key: 'pot', label: 'POT', width: 48, sortable: true },
        { key: 'age', label: 'AGE', width: 44, sortable: true },
        { key: 'height', label: 'HT', width: 48, sortable: true },
        { key: 'weight', label: 'WT', width: 48, sortable: true },
    ];

    for (const group of ATTR_GROUPS) {
        for (const key of group.keys) {
            const isAvg = ATTR_AVG_KEYS.has(key);
            cols.push({
                key,
                label: ATTR_LABEL[key] || key,
                width: 42,
                sortable: true,
                group: group.label,
                isAttr: true,
                isAvg,
            });
        }
    }

    cols.push({ key: 'scout', label: '스카우팅 코멘트', width: 280 });
    return cols;
}

const COLUMNS = buildColumns();

// ── 그룹 헤더 행 계산 ──

interface GroupSpan { label: string; colSpan: number; }

function buildGroupSpans(): GroupSpan[] {
    const spans: GroupSpan[] = [];
    const nonAttrCount = COLUMNS.filter(c => !c.isAttr && c.key !== 'scout').length;
    spans.push({ label: '', colSpan: nonAttrCount });

    for (const group of ATTR_GROUPS) {
        spans.push({ label: group.label, colSpan: group.keys.length });
    }

    spans.push({ label: '', colSpan: 1 }); // scout column
    return spans;
}

const GROUP_SPANS = buildGroupSpans();

// ── 정렬 타입 ──

interface SortConfig { key: string; dir: 'asc' | 'desc'; }

// ── 메인 컴포넌트 ──

interface DraftViewProps {
    prospects: Player[];
    onDraft: (player: Player) => void;
    team: Team;
    readOnly?: boolean;
}

export const DraftView: React.FC<DraftViewProps> = ({ prospects, onDraft, team, readOnly }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'ovr', dir: 'desc' });
    const [posFilter, setPosFilter] = useState<string>('ALL');

    // 정렬 + 필터 + OVR 계산
    const sortedProspects = useMemo(() => {
        let list = prospects.map(p => ({
            player: p,
            ovr: calculatePlayerOvr(p),
            pot: p.potential,
        }));

        // 검색 필터
        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            list = list.filter(e => e.player.name.toLowerCase().includes(q));
        }

        // 포지션 필터
        if (posFilter !== 'ALL') {
            list = list.filter(e => e.player.position === posFilter);
        }

        // 정렬
        const { key, dir } = sortConfig;
        list.sort((a, b) => {
            let va: number, vb: number;
            if (key === 'ovr') { va = a.ovr; vb = b.ovr; }
            else if (key === 'pot') { va = a.pot; vb = b.pot; }
            else if (key === 'name') {
                return dir === 'asc' ? a.player.name.localeCompare(b.player.name) : b.player.name.localeCompare(a.player.name);
            }
            else if (key === 'position') {
                return dir === 'asc' ? a.player.position.localeCompare(b.player.position) : b.player.position.localeCompare(a.player.position);
            }
            else { va = (a.player as any)[key] ?? 0; vb = (b.player as any)[key] ?? 0; }
            return dir === 'desc' ? (vb! - va!) : (va! - vb!);
        });

        return list;
    }, [prospects, searchTerm, posFilter, sortConfig]);

    const handleSort = (key: string) => {
        setSortConfig(prev =>
            prev.key === key
                ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
                : { key, dir: 'desc' }
        );
    };

    const totalWidth = COLUMNS.reduce((s, c) => s + c.width, 0);

    return (
        <div className="flex flex-col h-[calc(100vh-120px)] animate-in fade-in duration-500 ko-normal gap-4">
            <PageHeader
                title="드래프트 보드"
                icon={<UserPlus size={24} />}
                actions={
                    <div className="flex items-center gap-3">
                        {/* 포지션 필터 */}
                        <div className="flex items-center gap-1">
                            {['ALL', 'PG', 'SG', 'SF', 'PF', 'C'].map(pos => (
                                <button
                                    key={pos}
                                    onClick={() => setPosFilter(pos)}
                                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                        posFilter === pos
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-slate-800 text-slate-400 hover:text-white'
                                    }`}
                                >
                                    {pos}
                                </button>
                            ))}
                        </div>
                        {/* 검색 */}
                        <div className="relative w-60">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                            <input
                                type="text"
                                placeholder="유망주 검색..."
                                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 pl-9 pr-3 text-xs font-bold text-white focus:outline-none focus:border-indigo-500 transition-all"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <span className="text-xs font-bold text-slate-500 tabular-nums">{sortedProspects.length}명</span>
                    </div>
                }
            />

            {/* 테이블 */}
            <div className="flex-1 bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
                <div className="h-full overflow-auto custom-scrollbar">
                    <table className="text-xs border-collapse" style={{ minWidth: totalWidth }}>
                        {/* 그룹 헤더 (능력치 카테고리) */}
                        <thead className="sticky top-0 z-30">
                            <tr className="bg-slate-950">
                                {GROUP_SPANS.map((gs, i) => (
                                    <th
                                        key={i}
                                        colSpan={gs.colSpan}
                                        className={`py-1 text-[9px] font-black uppercase tracking-widest text-center border-b border-slate-800 ${
                                            gs.label ? 'text-indigo-400/70 border-x border-slate-800/50' : 'text-transparent'
                                        }`}
                                    >
                                        {gs.label || '\u00A0'}
                                    </th>
                                ))}
                            </tr>
                            {/* 컬럼 헤더 */}
                            <tr className="bg-slate-950 border-b border-slate-700/50">
                                {COLUMNS.map(col => {
                                    const isSorted = sortConfig.key === col.key;
                                    const stickyStyle: React.CSSProperties = col.stickyLeft !== undefined
                                        ? { position: 'sticky', left: col.stickyLeft, zIndex: 20 }
                                        : {};

                                    return (
                                        <th
                                            key={col.key}
                                            style={{ width: col.width, minWidth: col.width, ...stickyStyle }}
                                            className={`py-2 px-1 font-black text-center whitespace-nowrap select-none bg-slate-950 ${
                                                col.sortable ? 'cursor-pointer hover:text-white' : ''
                                            } ${col.isAvg ? 'text-indigo-400/80' : 'text-slate-500'} ${
                                                col.stickyShadow ? 'shadow-[2px_0_5px_rgba(0,0,0,0.5)]' : ''
                                            } ${col.key === 'name' || col.key === 'scout' ? 'text-left' : ''}`}
                                            onClick={() => col.sortable && handleSort(col.key)}
                                        >
                                            <span className="inline-flex items-center gap-0.5">
                                                {col.label}
                                                {isSorted && (
                                                    sortConfig.dir === 'desc'
                                                        ? <ChevronDown size={10} className="text-indigo-400" />
                                                        : <ChevronUp size={10} className="text-indigo-400" />
                                                )}
                                            </span>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>

                        <tbody>
                            {sortedProspects.map((entry, idx) => {
                                const p = entry.player;
                                const rank = idx + 1;
                                const rankColor = rank === 1 ? 'text-amber-400' : rank === 2 ? 'text-slate-300' : rank === 3 ? 'text-amber-600' : 'text-slate-600';

                                return (
                                    <tr key={p.id} className="border-b border-slate-800/40 hover:bg-white/[0.03] transition-colors">
                                        {COLUMNS.map(col => {
                                            const stickyStyle: React.CSSProperties = col.stickyLeft !== undefined
                                                ? { position: 'sticky', left: col.stickyLeft, zIndex: 10 }
                                                : {};
                                            const bgClass = col.stickyLeft !== undefined ? 'bg-slate-900' : '';

                                            let content: React.ReactNode;
                                            let cellStyle: React.CSSProperties | undefined;
                                            let align = 'text-center';

                                            switch (col.key) {
                                                case 'rank':
                                                    content = <span className={`font-black ${rankColor}`}>{rank}</span>;
                                                    break;
                                                case 'name':
                                                    align = 'text-left';
                                                    content = <span className="font-bold text-white truncate block">{p.name}</span>;
                                                    break;
                                                case 'position':
                                                    content = <span className="font-bold text-slate-400">{p.position}</span>;
                                                    break;
                                                case 'ovr':
                                                    content = <OvrBadge value={entry.ovr} size="sm" />;
                                                    break;
                                                case 'pot':
                                                    content = <span className="font-bold text-amber-400/80 tabular-nums">{entry.pot}</span>;
                                                    break;
                                                case 'age':
                                                    content = <span className="text-slate-400 tabular-nums">{p.age}</span>;
                                                    break;
                                                case 'height':
                                                    content = <span className="text-slate-400 tabular-nums">{p.height}</span>;
                                                    break;
                                                case 'weight':
                                                    content = <span className="text-slate-400 tabular-nums">{p.weight}</span>;
                                                    break;
                                                case 'scout':
                                                    align = 'text-left';
                                                    content = <span className="text-slate-500 italic truncate block">{getScoutComment(p)}</span>;
                                                    break;
                                                default:
                                                    if (col.isAttr) {
                                                        const val = (p as any)[col.key] as number;
                                                        cellStyle = getAttrColor(val);
                                                        content = (
                                                            <span className={`tabular-nums font-mono ${col.isAvg ? 'font-black text-white' : 'text-slate-300'}`}>
                                                                {val ?? '-'}
                                                            </span>
                                                        );
                                                    }
                                                    break;
                                            }

                                            return (
                                                <td
                                                    key={col.key}
                                                    style={{ width: col.width, minWidth: col.width, ...stickyStyle, ...cellStyle }}
                                                    className={`py-1.5 px-1 ${align} ${bgClass} ${
                                                        col.stickyShadow ? 'shadow-[2px_0_5px_rgba(0,0,0,0.3)]' : ''
                                                    }`}
                                                >
                                                    {content}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {sortedProspects.length === 0 && (
                        <div className="flex items-center justify-center h-40 text-slate-600 font-bold text-sm">
                            검색 결과가 없습니다.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
