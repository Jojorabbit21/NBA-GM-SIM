
import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Team, Player } from '../types';
import { calculatePlayerOvr } from '../utils/constants';
import { OvrBadge } from '../components/common/OvrBadge';
import { Table, TableBody, TableRow, TableHeaderCell, TableCell, TableHead } from '../components/common/Table';
import { ATTR_GROUPS, ATTR_LABEL, ATTR_AVG_KEYS, ATTR_NAME_MAP } from '../data/attributeConfig';
import { LotteryResult } from '../services/draft/lotteryEngine';

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

// ── 상수 ──

const GROUP_LABEL_KR: Record<string, string> = {
    INSIDE: '인사이드 스코어링', OUTSIDE: '아웃사이드 스코어링', PLAYMAKING: '플레이메이킹',
    DEFENSE: '수비능력', REBOUND: '리바운드', ATHLETIC: '운동능력',
};

const WIDTHS = {
    NAME: 160,
    POS: 54,
    AGE: 44,
    HT: 50,
    WT: 50,
    OVR: 56,
    POT: 50,
    ATTR: 54,
    SCOUT: 280,
};

// ── 능력치 키 (AVG 제외) ──

const ATTR_COLS = ATTR_GROUPS.flatMap(g => g.keys.filter(k => !ATTR_AVG_KEYS.has(k)));

type SortConfig = { key: string; direction: 'asc' | 'desc'; };

// ── Sticky 위치 계산 ──

const LEFT_NAME = 0;
const LEFT_POS = WIDTHS.NAME;
const LEFT_AGE = LEFT_POS + WIDTHS.POS;
const LEFT_HT = LEFT_AGE + WIDTHS.AGE;
const LEFT_WT = LEFT_HT + WIDTHS.HT;
const LEFT_OVR = LEFT_WT + WIDTHS.WT;
const LEFT_POT = LEFT_OVR + WIDTHS.OVR;

const getStickyStyle = (left: number, width: number, isLast: boolean = false) => ({
    left,
    width,
    minWidth: width,
    maxWidth: width,
    position: 'sticky' as const,
    zIndex: 30,
    borderRight: isLast ? undefined : 'none',
});

// ── 탭 타입 ──

type DraftTab = 'board' | 'lottery';

// ── 로터리 결과 테이블 ──

interface LotteryResultsTableProps {
    lotteryResult: LotteryResult;
    teams: Team[];
    myTeamId?: string;
}

/** 승률 기반 색상: 5할 미만=빨강(낮을수록 밝은), 5할 이상=초록(높을수록 밝은) */
const getWinPctColor = (winPct: number): string => {
    if (winPct >= 0.700) return 'text-emerald-300';
    if (winPct >= 0.600) return 'text-emerald-400';
    if (winPct >= 0.500) return 'text-emerald-500';
    if (winPct >= 0.400) return 'text-red-500';
    if (winPct >= 0.300) return 'text-red-400';
    return 'text-red-300';
};

const LotteryResultsTable: React.FC<LotteryResultsTableProps> = ({ lotteryResult, teams, myTeamId }) => {
    // 리그 순위 계산 (승률 내림차순)
    const leagueRankMap = useMemo(() => {
        const sorted = [...teams].sort((a, b) => {
            const aPct = a.wins + a.losses > 0 ? a.wins / (a.wins + a.losses) : 0;
            const bPct = b.wins + b.losses > 0 ? b.wins / (b.wins + b.losses) : 0;
            return bPct - aPct || b.wins - a.wins;
        });
        const map = new Map<string, number>();
        sorted.forEach((t, i) => map.set(t.id, i + 1));
        return map;
    }, [teams]);

    const teamMap = useMemo(() => {
        const map = new Map<string, Team>();
        teams.forEach(t => map.set(t.id, t));
        return map;
    }, [teams]);

    const rows = lotteryResult.finalOrder.map((teamId, idx) => {
        const team = teamMap.get(teamId);
        const pick = idx + 1;
        const movement = lotteryResult.pickMovements.find(m => m.teamId === teamId);
        const lotteryEntry = lotteryResult.lotteryTeams.find(lt => lt.teamId === teamId);
        const isTop4 = lotteryResult.top4Drawn.includes(teamId);
        const isMyTeam = teamId === myTeamId;
        const leagueRank = leagueRankMap.get(teamId) ?? 0;
        const winPct = team && (team.wins + team.losses) > 0 ? team.wins / (team.wins + team.losses) : 0;

        return { teamId, team, pick, movement, lotteryEntry, isTop4, isMyTeam, leagueRank, winPct };
    });

    return (
        <div className="flex-1 min-h-0">
            <Table fullHeight className="!rounded-none !border-x-0 !border-t-0 text-xs">
                <TableHead>
                    <TableHeaderCell width={70} align="center">지명순위</TableHeaderCell>
                    <TableHeaderCell align="left" className="pl-4">팀</TableHeaderCell>
                    <TableHeaderCell width={50} align="center">순위</TableHeaderCell>
                    <TableHeaderCell width={70} align="center">성적</TableHeaderCell>
                    <TableHeaderCell width={60} align="center">승률</TableHeaderCell>
                    <TableHeaderCell width={80} align="center">로터리 확률</TableHeaderCell>
                    <TableHeaderCell width={80} align="center">순위 변동</TableHeaderCell>
                </TableHead>
                <TableBody>
                    {rows.map(r => {
                        const diff = r.movement ? r.movement.preLotteryPosition - r.movement.finalPosition : 0;
                        const pctColor = getWinPctColor(r.winPct);
                        return (
                            <TableRow key={r.teamId} className={r.isMyTeam ? 'bg-indigo-950/30' : ''}>
                                <TableCell align="center">
                                    <span className={`font-black ${r.pick <= 4 ? 'text-amber-400' : r.pick <= 14 ? 'text-slate-300' : 'text-slate-500'}`}>
                                        {r.pick}
                                    </span>
                                </TableCell>
                                <TableCell align="left" className="pl-4">
                                    <div className="flex items-center gap-2">
                                        {r.team?.logo && <img src={r.team.logo} alt="" className="w-5 h-5 object-contain" />}
                                        <span className={`font-semibold ${r.isMyTeam ? 'text-indigo-400' : 'text-slate-200'}`}>
                                            {r.team ? `${r.team.city} ${r.team.name}` : r.teamId}
                                        </span>
                                        {r.isTop4 && <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs font-black">LOTTERY</span>}
                                    </div>
                                </TableCell>
                                <TableCell align="center" className="font-black text-slate-400 tabular-nums">
                                    {r.leagueRank}
                                </TableCell>
                                <TableCell align="center" className={`font-semibold tabular-nums ${pctColor}`}>
                                    {r.team ? `${r.team.wins}-${r.team.losses}` : '-'}
                                </TableCell>
                                <TableCell align="center" className={`font-mono tabular-nums ${pctColor}`}>
                                    {r.team ? `.${(r.winPct * 1000).toFixed(0).padStart(3, '0')}` : '-'}
                                </TableCell>
                                <TableCell align="center" className="font-mono tabular-nums">
                                    {r.lotteryEntry
                                        ? <span className="text-slate-400">{(r.lotteryEntry.odds * 100).toFixed(1)}%</span>
                                        : <span className="text-slate-600">-</span>
                                    }
                                </TableCell>
                                <TableCell align="center">
                                    {diff !== 0 ? (
                                        <span className={`font-black tabular-nums ${diff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {diff > 0 ? `+${diff}` : diff}
                                        </span>
                                    ) : (
                                        <span className="text-slate-600">-</span>
                                    )}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
};

// ── 메인 컴포넌트 ──

interface DraftViewProps {
    prospects: Player[];
    onDraft: (player: Player) => void;
    team: Team;
    readOnly?: boolean;
    lotteryResult?: LotteryResult | null;
    teams?: Team[];
    myTeamId?: string;
}

export const DraftView: React.FC<DraftViewProps> = ({ prospects, lotteryResult, teams, myTeamId }) => {
    const [activeTab, setActiveTab] = useState<DraftTab>('board');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'pot', direction: 'desc' });
    const [posFilter, setPosFilter] = useState<string>('ALL');

    const handleSort = (key: string) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
    };

    const getSortValue = (p: Player, key: string): number | string => {
        if (key === 'name') return p.name;
        if (key === 'position') return p.position;
        if (key === 'age') return p.age;
        if (key === 'ovr') return calculatePlayerOvr(p);
        if (key === 'pot') return p.potential;
        if (key === 'height') return p.height;
        if (key === 'weight') return p.weight;
        if (key in p) return (p as any)[key];
        return 0;
    };

    const sortedProspects = useMemo(() => {
        let list = [...prospects];

        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            list = list.filter(p => p.name.toLowerCase().includes(q));
        }
        if (posFilter !== 'ALL') {
            list = list.filter(p => p.position === posFilter);
        }

        list.sort((a, b) => {
            const aVal = getSortValue(a, sortConfig.key);
            const bVal = getSortValue(b, sortConfig.key);
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }
            return sortConfig.direction === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
        });

        return list;
    }, [prospects, searchTerm, posFilter, sortConfig]);

    // 그룹별 colSpan 계산 (AVG 키 제외)
    const groupColSpans = ATTR_GROUPS.map(g => ({
        label: GROUP_LABEL_KR[g.label] || g.label,
        colSpan: g.keys.filter(k => !ATTR_AVG_KEYS.has(k)).length,
    }));

    const hasLottery = !!lotteryResult && !!teams;

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-500 overflow-hidden">
            {/* Tab Navigation — RosterTabs 스타일 */}
            <div className="px-8 border-b border-slate-800 bg-slate-950 flex items-center h-12 flex-shrink-0">
                <div className="flex items-center gap-8 h-full">
                    <button
                        onClick={() => setActiveTab('board')}
                        className={`flex items-center transition-all h-full border-b-2 font-black tracking-tight uppercase text-sm ko-normal ${
                            activeTab === 'board' ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 hover:text-slate-300 border-transparent'
                        }`}
                    >드래프트 보드</button>
                    {hasLottery && (
                        <button
                            onClick={() => setActiveTab('lottery')}
                            className={`flex items-center transition-all h-full border-b-2 font-black tracking-tight uppercase text-sm ko-normal ${
                                activeTab === 'lottery' ? 'text-indigo-400 border-indigo-400' : 'text-slate-500 hover:text-slate-300 border-transparent'
                            }`}
                        >로터리 결과</button>
                    )}
                </div>
            </div>

            {activeTab === 'board' && (
                <>
                    {/* Filter Bar */}
                    <div className="flex-shrink-0 px-6 py-2.5 border-b border-white/10 flex items-center gap-4 bg-slate-950/60">
                        {/* 인원수 */}
                        <span className="text-xs font-black text-white tabular-nums">{sortedProspects.length}명</span>
                        {/* 포지션 필터 */}
                        <div className="flex items-center gap-1">
                            {['ALL', 'PG', 'SG', 'SF', 'PF', 'C'].map(pos => (
                                <button
                                    key={pos}
                                    onClick={() => setPosFilter(pos)}
                                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                        posFilter === pos
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-slate-800 text-white/70 hover:text-white'
                                    }`}
                                >
                                    {pos}
                                </button>
                            ))}
                        </div>
                        {/* 검색 */}
                        <div className="relative w-56">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                            <input
                                type="text"
                                placeholder="유망주 검색..."
                                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-1.5 pl-9 pr-3 text-xs font-bold text-white focus:outline-none focus:border-indigo-500 transition-all"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Board Table */}
                    <div className="flex-1 min-h-0">
                        <Table style={{ tableLayout: 'fixed', minWidth: '100%' }} fullHeight className="!rounded-none !border-x-0 !border-t-0 text-xs">
                            <colgroup>
                                <col style={{ width: WIDTHS.NAME }} />
                                <col style={{ width: WIDTHS.POS }} />
                                <col style={{ width: WIDTHS.AGE }} />
                                <col style={{ width: WIDTHS.HT }} />
                                <col style={{ width: WIDTHS.WT }} />
                                <col style={{ width: WIDTHS.OVR }} />
                                <col style={{ width: WIDTHS.POT }} />
                                {ATTR_COLS.map((k) => <col key={k} style={{ width: WIDTHS.ATTR }} />)}
                                <col style={{ width: WIDTHS.SCOUT }} />
                            </colgroup>
                            <thead className="bg-slate-950 sticky top-0 z-40 shadow-sm">
                                {/* Header Row 1: Groups */}
                                <tr className="h-10">
                                    <th colSpan={7} className="bg-slate-950 border-b border-r border-slate-800 sticky left-0 z-50 align-middle">
                                        <div className="h-full flex items-center justify-center">
                                            <span className="text-xs font-black text-slate-500 uppercase tracking-widest ko-normal">선수 정보</span>
                                        </div>
                                    </th>
                                    {groupColSpans.map((g, i) => (
                                        <th key={i} colSpan={g.colSpan} className="bg-slate-950 border-b border-r border-slate-800 px-2 align-middle">
                                            <div className="h-full flex items-center justify-center">
                                                <span className="text-xs font-black text-slate-400 uppercase tracking-widest ko-normal">{g.label}</span>
                                            </div>
                                        </th>
                                    ))}
                                    <th colSpan={1} className="bg-slate-950 border-b border-slate-800 px-2 align-middle">
                                        <div className="h-full flex items-center justify-center">
                                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest ko-normal">스카우팅</span>
                                        </div>
                                    </th>
                                </tr>
                                {/* Header Row 2: Labels */}
                                <tr className="h-10 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                                    <TableHeaderCell
                                        style={{ ...getStickyStyle(LEFT_NAME, WIDTHS.NAME), zIndex: 50 }}
                                        align="left" className="pl-4 bg-slate-950"
                                        sortable onSort={() => handleSort('name')} sortDirection={sortConfig.key === 'name' ? sortConfig.direction : null}
                                    >이름</TableHeaderCell>
                                    <TableHeaderCell
                                        style={{ ...getStickyStyle(LEFT_POS, WIDTHS.POS), zIndex: 50 }}
                                        align="left" className="bg-slate-950 border-r border-slate-800"
                                        sortable onSort={() => handleSort('position')} sortDirection={sortConfig.key === 'position' ? sortConfig.direction : null}
                                    >포지션</TableHeaderCell>
                                    <TableHeaderCell
                                        style={{ ...getStickyStyle(LEFT_AGE, WIDTHS.AGE), zIndex: 50 }}
                                        align="left" className="bg-slate-950 border-r border-slate-800"
                                        sortable onSort={() => handleSort('age')} sortDirection={sortConfig.key === 'age' ? sortConfig.direction : null}
                                    >나이</TableHeaderCell>
                                    <TableHeaderCell
                                        style={{ ...getStickyStyle(LEFT_HT, WIDTHS.HT), zIndex: 50 }}
                                        align="left" className="bg-slate-950 border-r border-slate-800"
                                        sortable onSort={() => handleSort('height')} sortDirection={sortConfig.key === 'height' ? sortConfig.direction : null}
                                    >키</TableHeaderCell>
                                    <TableHeaderCell
                                        style={{ ...getStickyStyle(LEFT_WT, WIDTHS.WT), zIndex: 50 }}
                                        align="left" className="bg-slate-950 border-r border-slate-800"
                                        sortable onSort={() => handleSort('weight')} sortDirection={sortConfig.key === 'weight' ? sortConfig.direction : null}
                                    >몸무게</TableHeaderCell>
                                    <TableHeaderCell
                                        style={{ ...getStickyStyle(LEFT_OVR, WIDTHS.OVR), zIndex: 50 }}
                                        className="bg-slate-950 border-r border-slate-800"
                                        sortable onSort={() => handleSort('ovr')} sortDirection={sortConfig.key === 'ovr' ? sortConfig.direction : null}
                                    >OVR</TableHeaderCell>
                                    <TableHeaderCell
                                        style={{ ...getStickyStyle(LEFT_POT, WIDTHS.POT, true), zIndex: 50 }}
                                        className="bg-slate-950 border-r border-slate-800"
                                        sortable onSort={() => handleSort('pot')} sortDirection={sortConfig.key === 'pot' ? sortConfig.direction : null}
                                    >POT</TableHeaderCell>
                                    {ATTR_COLS.map(k => (
                                        <TableHeaderCell
                                            key={k}
                                            width={WIDTHS.ATTR}
                                            className="border-r border-slate-800"
                                            sortable
                                            onSort={() => handleSort(k)}
                                            sortDirection={sortConfig.key === k ? sortConfig.direction : null}
                                            title={ATTR_NAME_MAP[k] || k}
                                        >
                                            {ATTR_LABEL[k] || k}
                                        </TableHeaderCell>
                                    ))}
                                    <TableHeaderCell width={WIDTHS.SCOUT} align="center">코멘트</TableHeaderCell>
                                </tr>
                            </thead>
                            <TableBody>
                                {sortedProspects.map((p) => {
                                    const ovr = calculatePlayerOvr(p);
                                    return (
                                        <TableRow key={p.id} className="group">
                                            <TableCell style={getStickyStyle(LEFT_NAME, WIDTHS.NAME)} align="left" className="pl-4 bg-slate-900 group-hover:bg-slate-800 transition-colors">
                                                <span className="font-semibold text-slate-200 truncate">{p.name}</span>
                                            </TableCell>
                                            <TableCell style={getStickyStyle(LEFT_POS, WIDTHS.POS)} align="left" className="text-slate-500 font-semibold bg-slate-900 group-hover:bg-slate-800 transition-colors border-r border-slate-800">{p.position}</TableCell>
                                            <TableCell style={getStickyStyle(LEFT_AGE, WIDTHS.AGE)} align="left" className="text-slate-500 font-semibold bg-slate-900 group-hover:bg-slate-800 transition-colors border-r border-slate-800/30">{p.age}</TableCell>
                                            <TableCell style={getStickyStyle(LEFT_HT, WIDTHS.HT)} align="left" className="text-slate-500 font-semibold bg-slate-900 group-hover:bg-slate-800 transition-colors border-r border-slate-800/30">{p.height}</TableCell>
                                            <TableCell style={getStickyStyle(LEFT_WT, WIDTHS.WT)} align="left" className="text-slate-500 font-semibold bg-slate-900 group-hover:bg-slate-800 transition-colors border-r border-slate-800/30">{p.weight}</TableCell>
                                            <TableCell style={getStickyStyle(LEFT_OVR, WIDTHS.OVR)} align="center" className="bg-slate-900 group-hover:bg-slate-800 transition-colors border-r border-slate-800/30">
                                                <div className="flex justify-center items-center"><OvrBadge value={ovr} size="sm" className="!w-7 !h-7 !text-xs !shadow-none" /></div>
                                            </TableCell>
                                            <TableCell style={getStickyStyle(LEFT_POT, WIDTHS.POT, true)} align="center" className="bg-slate-900 group-hover:bg-slate-800 transition-colors border-r border-slate-800">
                                                <span className="font-mono font-black tabular-nums text-amber-400/80">{p.potential}</span>
                                            </TableCell>
                                            {ATTR_COLS.map(k => (
                                                <TableCell key={k} align="center" className="font-semibold font-mono border-r border-slate-800/30" value={(p as any)[k]} variant="attribute" colorScale />
                                            ))}
                                            <TableCell align="center" className="pl-3">
                                                <span className="text-slate-500 italic truncate block">{getScoutComment(p)}</span>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>

                        {sortedProspects.length === 0 && (
                            <div className="flex items-center justify-center h-40 text-slate-600 font-bold text-sm">
                                검색 결과가 없습니다.
                            </div>
                        )}
                    </div>
                </>
            )}

            {activeTab === 'lottery' && hasLottery && (
                <LotteryResultsTable lotteryResult={lotteryResult!} teams={teams!} myTeamId={myTeamId} />
            )}
        </div>
    );
};
