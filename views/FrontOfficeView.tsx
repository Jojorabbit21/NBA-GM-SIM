
import React, { useState, useMemo } from 'react';
import { Team, Player } from '../types';
import { TeamFinance } from '../types/finance';
import { LeagueCoachingData } from '../types/coaching';
import { LeaguePickAssets, DraftPickAsset } from '../types/draftAssets';
import { PICK_SEASONS } from '../services/draftAssets/pickInitializer';
import { TRADED_FIRST_ROUND_PICKS, SWAP_RIGHTS } from '../data/draftPickTrades';
import { TEAM_FINANCE_DATA } from '../data/teamFinanceData';
import { TEAM_DATA } from '../data/teamData';
import { getBudgetManager } from '../services/financeEngine';
import { HeadCoachTable } from '../components/dashboard/CoachProfileCard';

type FrontOfficeTab = 'club' | 'payroll' | 'coaching' | 'draftPicks';

interface FrontOfficeViewProps {
    team: Team;
    teams: Team[];
    currentSimDate: string;
    myTeamId: string;
    coachingData?: LeagueCoachingData | null;
    onCoachClick?: (teamId: string) => void;
    leaguePickAssets?: LeaguePickAssets | null;
}

export const FrontOfficeView: React.FC<FrontOfficeViewProps> = ({
    team, teams, currentSimDate, myTeamId, coachingData, onCoachClick, leaguePickAssets,
}) => {
    const [activeTab, setActiveTab] = useState<FrontOfficeTab>('club');

    const finData = TEAM_FINANCE_DATA[myTeamId];
    const finance = getBudgetManager().getFinance(myTeamId);

    const tabClass = (key: FrontOfficeTab) =>
        `flex items-center gap-2 transition-all h-full border-b-2 font-black tracking-tight uppercase text-sm ${
            activeTab === key
                ? 'text-indigo-400 border-indigo-400'
                : 'text-slate-500 hover:text-slate-300 border-transparent'
        }`;

    return (
        <div className="h-full animate-in fade-in duration-700 ko-normal relative text-slate-200 flex flex-col overflow-hidden">
            <div className="w-full flex flex-col flex-1 min-h-0">
                {/* Tab Navigation — Dashboard 스타일 */}
                <div className="px-8 border-b border-slate-800 bg-slate-950 flex items-center justify-between h-14 flex-shrink-0">
                    <div className="flex items-center gap-8 h-full">
                        <button onClick={() => setActiveTab('club')} className={tabClass('club')}>
                            <span>구단</span>
                        </button>
                        <button onClick={() => setActiveTab('payroll')} className={tabClass('payroll')}>
                            <span>선수 급여</span>
                        </button>
                        <button onClick={() => setActiveTab('coaching')} className={tabClass('coaching')}>
                            <span>코칭 스태프</span>
                        </button>
                        <button onClick={() => setActiveTab('draftPicks')} className={tabClass('draftPicks')}>
                            <span>드래프트 픽</span>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    {activeTab === 'club' && finData && finance && (
                        <ClubTab finData={finData} finance={finance} team={team} teams={teams} myTeamId={myTeamId} />
                    )}
                    {activeTab === 'payroll' && (
                        <PayrollTab team={team} />
                    )}
                    {activeTab === 'coaching' && (
                        <div className="animate-in fade-in duration-500 h-full">
                            <HeadCoachTable coach={coachingData?.[team.id]?.headCoach} onCoachClick={() => onCoachClick?.(team.id)} />
                        </div>
                    )}
                    {activeTab === 'draftPicks' && (
                        <DraftPicksTab myTeamId={myTeamId} leaguePickAssets={leaguePickAssets} />
                    )}
                    {!finData && activeTab === 'club' && (
                        <div className="text-center text-slate-500 py-20">
                            재정 데이터를 불러올 수 없습니다.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── 공통 엑셀 그리드 스타일 ──
const thClass = "py-1.5 px-2 text-xs font-bold uppercase tracking-wide text-slate-300 whitespace-nowrap border-b border-slate-600 bg-slate-800";
const tdClass = "py-1.5 px-2 text-xs font-medium whitespace-nowrap border-b border-slate-700/60";
const tdValClass = "py-1.5 px-2 text-xs font-medium font-mono tabular-nums whitespace-nowrap border-b border-slate-700/60 text-right";

// ── 구단주 성향 자연어 변환 ──
function getSpendingLabel(v: number): string {
    if (v <= 3) return '구두쇠';
    if (v <= 6) return '보통';
    if (v <= 8) return '협조적';
    return '소비광';
}
function getWinNowLabel(v: number): string {
    if (v <= 3) return '장기성과 우선';
    if (v <= 7) return '중립';
    return '단기성과 우선';
}
function getPatienceLabel(v: number): string {
    if (v <= 3) return '인내심 없음';
    if (v <= 7) return '보통';
    return '현자';
}
function getMarketingLabel(v: number): string {
    if (v <= 3) return '수익 우선';
    if (v <= 6) return '중립';
    if (v <= 8) return '지출에 관대';
    return '지역 사회에 환원';
}

// ── 구단 탭 (재정 현황 + 구단주 + 경기장 — 엑셀 그리드) ──
const MONTH_LABELS: Record<string, string> = {
    '10': '10월', '11': '11월', '12': '12월',
    '01': '1월', '02': '2월', '03': '3월', '04': '4월',
};

const ClubTab: React.FC<{
    finData: (typeof TEAM_FINANCE_DATA)[string];
    finance: TeamFinance;
    team: Team;
    teams: Team[];
    myTeamId: string;
}> = ({ finData, finance, team, teams, myTeamId }) => {
    const { ownerProfile, market } = finData;
    const tierLabels: Record<number, string> = { 1: '대도시', 2: '중대도시', 3: '중소도시', 4: '소도시' };
    const totalRevenue = Object.values(finance.revenue).reduce((s, v) => s + v, 0);
    const totalExpenses = Object.values(finance.expenses).reduce((s, v) => s + v, 0);

    const attendanceStats = getBudgetManager().getAttendanceStats(myTeamId);
    const hasGames = attendanceStats.totalAttendance > 0;
    const monthKeys = Object.keys(attendanceStats.monthlyAttendance).sort();

    const traitRows: { label: string; value: number; desc: string }[] = [
        { label: '지출 의지', value: ownerProfile.spendingWillingness, desc: getSpendingLabel(ownerProfile.spendingWillingness) },
        { label: '우승 의지', value: ownerProfile.winNowPriority, desc: getWinNowLabel(ownerProfile.winNowPriority) },
        { label: '마케팅 중시', value: ownerProfile.marketingFocus, desc: getMarketingLabel(ownerProfile.marketingFocus) },
        { label: '인내심', value: ownerProfile.patience, desc: getPatienceLabel(ownerProfile.patience) },
    ];

    // 우측 컬럼 border 클래스 (중앙 구분선 — 밝은 색)
    const rL = "border-l-2 border-slate-400";

    return (
        <div className="border-b-2 border-b-slate-500">
            <table className="w-full border-collapse text-xs">
                <thead>
                    <tr>
                        <th colSpan={2} className={`${thClass} text-left`}>재정 현황</th>
                        <th colSpan={2} className={`${thClass} text-left ${rL}`}>구단주</th>
                    </tr>
                </thead>
                <tbody>
                    {/* Row 1: 시즌 예산 / 이름 */}
                    <tr>
                        <td className={`${tdClass} font-bold text-slate-200`}>시즌 예산</td>
                        <td className={`${tdValClass} text-indigo-400 font-bold`}>{fmtFull(finance.budget)}</td>
                        <td className={`${tdClass} ${rL}`}>이름</td>
                        <td className={`${tdValClass} font-bold text-white`}>{ownerProfile.name}</td>
                    </tr>
                    {/* Row 2: 관중 입장료 / 순자산 */}
                    <tr>
                        <td className={`${tdClass} pl-4 text-slate-400`}>관중 입장료</td>
                        <td className={`${tdValClass} text-emerald-400`}>{fmtFull(finance.revenue.gate)}</td>
                        <td className={`${tdClass} ${rL}`}>순자산</td>
                        <td className={`${tdValClass} font-bold text-emerald-400`}>{fmtFullB(ownerProfile.netWorth)}</td>
                    </tr>
                    {/* Row 3: 중앙 방송 / 지출 의지 */}
                    <tr>
                        <td className={`${tdClass} pl-4 text-slate-400`}>중앙 방송 분배금</td>
                        <td className={`${tdValClass} text-emerald-400`}>{fmtFull(finance.revenue.broadcasting)}</td>
                        <td className={`${tdClass} ${rL}`}>{traitRows[0].label}</td>
                        <td className={`${tdValClass} font-bold text-indigo-400`}>{traitRows[0].desc}</td>
                    </tr>
                    {/* Row 4: 로컬 미디어 / 우승 의지 */}
                    <tr>
                        <td className={`${tdClass} pl-4 text-slate-400`}>로컬 미디어</td>
                        <td className={`${tdValClass} text-emerald-400`}>{fmtFull(finance.revenue.localMedia)}</td>
                        <td className={`${tdClass} ${rL}`}>{traitRows[1].label}</td>
                        <td className={`${tdValClass} font-bold text-indigo-400`}>{traitRows[1].desc}</td>
                    </tr>
                    {/* Row 5: 스폰서십 / 마케팅 중시 */}
                    <tr>
                        <td className={`${tdClass} pl-4 text-slate-400`}>스폰서십</td>
                        <td className={`${tdValClass} text-emerald-400`}>{fmtFull(finance.revenue.sponsorship)}</td>
                        <td className={`${tdClass} ${rL}`}>{traitRows[2].label}</td>
                        <td className={`${tdValClass} font-bold text-indigo-400`}>{traitRows[2].desc}</td>
                    </tr>
                    {/* Row 6: MD 판매 / 인내심 */}
                    <tr>
                        <td className={`${tdClass} pl-4 text-slate-400`}>MD 판매</td>
                        <td className={`${tdValClass} text-emerald-400`}>{fmtFull(finance.revenue.merchandise)}</td>
                        <td className={`${tdClass} ${rL}`}>{traitRows[3].label}</td>
                        <td className={`${tdValClass} font-bold text-indigo-400`}>{traitRows[3].desc}</td>
                    </tr>
                    {/* Row 7: 기타 / 경기장 헤더 */}
                    <tr>
                        <td className={`${tdClass} pl-4 text-slate-400`}>기타</td>
                        <td className={`${tdValClass} text-emerald-400`}>{fmtFull(finance.revenue.other)}</td>
                        <th colSpan={2} className={`${thClass} text-left ${rL}`}>경기장</th>
                    </tr>
                    {/* Row 8: 총 수익 / 경기장명 */}
                    <tr>
                        <td className={`${tdClass} font-bold`}>총 수익</td>
                        <td className={`${tdValClass} text-emerald-400 font-bold`}>{fmtFull(totalRevenue)}</td>
                        <td className={`${tdClass} ${rL}`}>경기장명</td>
                        <td className={`${tdValClass} font-bold text-white`}>{market.arenaName}</td>
                    </tr>
                    {/* Row 9: 선수 연봉 / 좌석 수 */}
                    <tr>
                        <td className={`${tdClass} pl-4 text-slate-400`}>선수 연봉</td>
                        <td className={`${tdValClass} text-red-400`}>{fmtFull(finance.expenses.payroll)}</td>
                        <td className={`${tdClass} ${rL}`}>좌석 수</td>
                        <td className={`${tdValClass} font-bold`}>{market.arenaCapacity.toLocaleString()}석</td>
                    </tr>
                    {/* Row 10: 럭셔리 택스 / 평균 입장료 */}
                    <tr>
                        <td className={`${tdClass} pl-4 text-slate-400`}>럭셔리 택스</td>
                        <td className={`${tdValClass} text-red-400`}>{fmtFull(finance.expenses.luxuryTax)}</td>
                        <td className={`${tdClass} ${rL}`}>평균 입장료</td>
                        <td className={`${tdValClass} font-bold`}>${market.baseTicketPrice}</td>
                    </tr>
                    {/* Row 11: 경기장 운영비 / 연고지 헤더 */}
                    <tr>
                        <td className={`${tdClass} pl-4 text-slate-400`}>경기장 운영비</td>
                        <td className={`${tdValClass} text-red-400`}>{fmtFull(finance.expenses.operations)}</td>
                        <th colSpan={2} className={`${thClass} text-left ${rL}`}>연고지</th>
                    </tr>
                    {/* Row 12: 코칭 스태프 / 도시 */}
                    <tr>
                        <td className={`${tdClass} pl-4 text-slate-400`}>코칭 스태프</td>
                        <td className={`${tdValClass} text-red-400`}>{fmtFull(finance.expenses.coachSalary)}</td>
                        <td className={`${tdClass} ${rL}`}>도시</td>
                        <td className={`${tdValClass} font-bold text-white`}>{TEAM_DATA[myTeamId]?.city}</td>
                    </tr>
                    {/* Row 13: 스카우팅/선수 개발 / 광역 인구 */}
                    <tr>
                        <td className={`${tdClass} pl-4 text-slate-400`}>스카우팅/선수 개발</td>
                        <td className={`${tdValClass} text-red-400`}>{fmtFull(finance.expenses.scouting)}</td>
                        <td className={`${tdClass} ${rL}`}>광역 인구</td>
                        <td className={`${tdValClass} font-bold`}>{(market.metroPopulation * 10000).toLocaleString()}명</td>
                    </tr>
                    {/* Row 14: 마케팅/홍보 / 마켓 티어 */}
                    <tr>
                        <td className={`${tdClass} pl-4 text-slate-400`}>마케팅/홍보</td>
                        <td className={`${tdValClass} text-red-400`}>{fmtFull(finance.expenses.marketing)}</td>
                        <td className={`${tdClass} ${rL}`}>마켓 티어</td>
                        <td className={`${tdValClass} font-bold text-white`}>{tierLabels[market.marketTier]}</td>
                    </tr>
                    {/* Row 15: 일반 관리비 / 관중 통계 헤더 */}
                    <tr>
                        <td className={`${tdClass} pl-4 text-slate-400`}>일반 관리비</td>
                        <td className={`${tdValClass} text-red-400`}>{fmtFull(finance.expenses.administration)}</td>
                        <th colSpan={2} className={`${thClass} text-left ${rL}`}>관중 통계</th>
                    </tr>
                    {/* Row 16: 총 지출 / 시즌 총 관중 */}
                    <tr>
                        <td className={`${tdClass} font-bold`}>총 지출</td>
                        <td className={`${tdValClass} text-red-400 font-bold`}>{fmtFull(totalExpenses)}</td>
                        <td className={`${tdClass} ${rL} text-slate-400`}>시즌 총 관중</td>
                        <td className={`${tdValClass} font-bold text-white`}>
                            {hasGames ? attendanceStats.totalAttendance.toLocaleString() + '명' : '-'}
                        </td>
                    </tr>
                    {/* Row 17: 손익 / 경기당 평균 */}
                    <tr>
                        <td className={`${tdClass} font-bold text-white border-t border-slate-600`}>손익</td>
                        <td className={`${tdValClass} font-bold border-t border-slate-600 ${finance.operatingIncome >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {finance.operatingIncome >= 0 ? '+' : ''}{fmtFull(finance.operatingIncome)}
                        </td>
                        <td className={`${tdClass} ${rL} text-slate-400`}>경기당 평균</td>
                        <td className={`${tdValClass} font-bold text-white`}>
                            {hasGames ? attendanceStats.averageAttendance.toLocaleString() + '명' : '-'}
                        </td>
                    </tr>
                    {/* Row 18: (좌측 빈칸) / 평균 점유율 */}
                    <tr>
                        <td colSpan={2} className={`${tdClass}`} />
                        <td className={`${tdClass} ${rL} text-slate-400`}>평균 점유율</td>
                        <td className={`${tdValClass} font-bold ${hasGames ? (attendanceStats.averageOccupancy >= 0.85 ? 'text-emerald-400' : attendanceStats.averageOccupancy >= 0.70 ? 'text-yellow-400' : 'text-red-400') : 'text-white'}`}>
                            {hasGames ? (attendanceStats.averageOccupancy * 100).toFixed(1) + '%' : '-'}
                        </td>
                    </tr>
                    {/* 월별 관중 추이 (우측) */}
                    {monthKeys.map((mk) => {
                        const m = attendanceStats.monthlyAttendance[mk];
                        const avg = Math.round(m.total / m.games);
                        const occ = avg / market.arenaCapacity;
                        return (
                            <tr key={mk}>
                                <td colSpan={2} className={`${tdClass}`} />
                                <td className={`${tdClass} ${rL} pl-4 text-slate-400`}>{MONTH_LABELS[mk.slice(5)] ?? mk}</td>
                                <td className={`${tdValClass}`}>
                                    <AttendanceBar occupancy={occ} avg={avg} />
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

// ── 관중 점유율 바 ──
const AttendanceBar: React.FC<{ occupancy: number; avg: number }> = ({ occupancy, avg }) => {
    const pct = Math.min(occupancy * 100, 100);
    const color = pct >= 85 ? 'bg-emerald-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-red-500';
    return (
        <div className="flex items-center gap-2 justify-end">
            <span className="text-xs font-mono text-slate-400">{avg.toLocaleString()}명</span>
            <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`text-xs font-mono font-bold ${pct >= 85 ? 'text-emerald-400' : pct >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                {pct.toFixed(0)}%
            </span>
        </div>
    );
};

// ── 선수 급여 탭 ──
const PayrollTab: React.FC<{ team: Team }> = ({ team }) => {
    const { players, seasonColumns, totals } = useMemo(() => {
        // OVR 내림차순 정렬
        const sorted = [...team.roster].sort((a, b) => b.ovr - a.ovr);

        // 고정 6시즌 (2025-26 ~ 2030-31)
        const cols: string[] = [];
        for (let y = 2025; y < 2031; y++) {
            cols.push(`${y}-${String(y + 1).slice(-2)}`);
        }

        // 시즌별 합계
        const colTotals = new Array(cols.length).fill(0);
        for (const p of sorted) {
            if (!p.contract) continue;
            for (let i = 0; i < p.contract.years.length; i++) {
                const colIdx = i - p.contract.currentYear; // 2025-26 기준 offset
                if (colIdx >= 0 && colIdx < cols.length) {
                    colTotals[colIdx] += p.contract.years[i];
                }
            }
        }

        return { players: sorted, seasonColumns: cols, totals: colTotals };
    }, [team.roster]);

    return (
        <div className="animate-in fade-in duration-500 border-b-2 border-b-slate-500">
            <table className="w-full border-collapse text-xs table-fixed">
                <colgroup>
                    <col style={{ width: '140px' }} />
                    {seasonColumns.map(col => (
                        <col key={col} />
                    ))}
                </colgroup>
                <thead className="sticky top-0 z-10">
                    <tr>
                        <th className={`${thClass} text-left sticky left-0 bg-slate-800 z-20 whitespace-nowrap border-r border-slate-600`}>선수</th>
                        {seasonColumns.map(col => (
                            <th key={col} className={`${thClass} text-right border-l border-slate-600`}>{col}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {players.map(p => (
                        <PayrollRow key={p.id} player={p} seasonColumns={seasonColumns} />
                    ))}
                    {/* 합계 행 */}
                    <tr className="bg-slate-700">
                        <td className={`${tdClass} font-bold text-white sticky left-0 bg-slate-700 z-10 border-r border-slate-600`}>합계</td>
                        {totals.map((t, i) => (
                            <td key={i} className={`${tdValClass} font-bold text-white border-l border-slate-600`}>
                                {t > 0 ? fmtSalary(t) : ''}
                            </td>
                        ))}
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

const PayrollRow: React.FC<{ player: Player; seasonColumns: string[] }> = ({ player, seasonColumns }) => {
    const cells = useMemo(() => {
        const result: (string | null)[] = new Array(seasonColumns.length).fill(null);
        if (!player.contract) return result;
        for (let i = 0; i < player.contract.years.length; i++) {
            const colIdx = i - player.contract.currentYear;
            if (colIdx >= 0 && colIdx < seasonColumns.length) {
                let label = fmtSalary(player.contract.years[i]);
                if (player.contract.option && i === player.contract.option.year) {
                    label += player.contract.option.type === 'player' ? ' (PO)' : ' (TO)';
                }
                result[colIdx] = label;
            }
        }
        return result;
    }, [player, seasonColumns.length]);

    return (
        <tr className="hover:bg-slate-800/40">
            <td className={`${tdClass} text-slate-200 sticky left-0 bg-slate-900 z-10 border-r border-slate-600`}>{player.name}</td>
            {cells.map((cell, i) => (
                <td key={i} className={`${tdValClass} border-l border-slate-600 ${cell ? 'text-slate-300' : 'text-slate-700'}`}>
                    {cell ?? '-'}
                </td>
            ))}
        </tr>
    );
};

// ── 드래프트 픽 탭 ──

const DraftPicksTab: React.FC<{
    myTeamId: string;
    leaguePickAssets?: LeaguePickAssets | null;
}> = ({ myTeamId, leaguePickAssets }) => {
    const myPicks = leaguePickAssets?.[myTeamId] ?? [];

    // season-round → pick[] 매핑 (복수 픽 지원)
    const pickMap = useMemo(() => {
        const map = new Map<string, DraftPickAsset[]>();
        myPicks.forEach(p => {
            const key = `${p.season}-${p.round}`;
            const arr = map.get(key) || [];
            arr.push(p);
            map.set(key, arr);
        });
        return map;
    }, [myPicks]);

    // 내 원래 픽을 누가 가져갔는지 역방향 조회 (season-round → 현재 보유팀)
    const tradedAwayMap = useMemo(() => {
        const map = new Map<string, DraftPickAsset>();
        if (!leaguePickAssets) return map;
        for (const teamId of Object.keys(leaguePickAssets)) {
            if (teamId === myTeamId) continue;
            for (const pick of leaguePickAssets[teamId]) {
                if (pick.originalTeamId === myTeamId) {
                    map.set(`${pick.season}-${pick.round}`, pick);
                }
            }
        }
        return map;
    }, [leaguePickAssets, myTeamId]);

    const teamName = (id: string) => TEAM_DATA[id]?.name || id.toUpperCase();

    // 보호 조건 라벨
    const getProtectionLabel = (pick: DraftPickAsset): string | null => {
        if (!pick.protection) return null;
        const p = pick.protection;
        if (p.type === 'none') return '보호 없음';
        if (p.type === 'top' && p.threshold) {
            const fallback = p.fallbackSeason ? ` → ${p.fallbackSeason} ${p.fallbackRound === 1 ? '1라운드' : '2라운드'}로 전환` : '';
            return `상위 ${p.threshold}순위 보호${fallback}`;
        }
        if (p.type === 'lottery') return '로터리 보호';
        return null;
    };

    // 스왑 권리 라벨
    const getSwapLabel = (pick: DraftPickAsset): string | null => {
        if (!pick.swapRight) return null;
        const other = pick.swapRight.beneficiaryTeamId === myTeamId
            ? pick.swapRight.originTeamId
            : pick.swapRight.beneficiaryTeamId;
        const direction = pick.swapRight.beneficiaryTeamId === myTeamId ? '스왑 권리 보유' : '스왑 권리 피대상';
        return `↔ ${teamName(other)} (${direction})`;
    };

    // 픽 하나의 비고 텍스트
    const getPickNotes = (pick: DraftPickAsset): string[] => {
        const notes: string[] = [];
        const prot = getProtectionLabel(pick);
        if (prot) notes.push(prot);
        const swap = getSwapLabel(pick);
        if (swap) notes.push(swap);
        return notes;
    };

    // 라운드별 행 엔트리 생성 — 각 픽이 1행씩 차지
    interface RowEntry {
        label: string;
        color: string;
        notes: string[];
    }

    const buildRoundEntries = (picks: DraftPickAsset[], round: 1 | 2, season: number): RowEntry[] => {
        const entries: RowEntry[] = [];
        const tradedPick = tradedAwayMap.get(`${season}-${round}`);
        const hasOwnPick = picks.some(p => p.originalTeamId === myTeamId);

        // 자기 픽 보유
        if (hasOwnPick) {
            const ownPick = picks.find(p => p.originalTeamId === myTeamId)!;
            entries.push({ label: '보유', color: 'text-indigo-400 font-bold', notes: getPickNotes(ownPick) });
        }

        // 자기 픽을 넘긴 경우
        if (!hasOwnPick && tradedPick) {
            entries.push({
                label: `→ ${teamName(tradedPick.currentTeamId)}`,
                color: 'text-red-400/70',
                notes: getPickNotes(tradedPick),
            });
        }

        // 타팀에서 획득한 픽 (각각 1행)
        for (const p of picks) {
            if (p.originalTeamId === myTeamId) continue;
            entries.push({
                label: `${teamName(p.originalTeamId)} 픽 획득`,
                color: 'text-emerald-400 font-bold',
                notes: getPickNotes(p),
            });
        }

        // 엔트리가 없으면 빈 행
        if (entries.length === 0) {
            entries.push({ label: '보유', color: 'text-indigo-400 font-bold', notes: [] });
        }

        return entries;
    };

    // 시즌별 행 데이터 생성
    const seasonRows = useMemo(() => {
        return PICK_SEASONS.map(season => {
            const r1Picks = pickMap.get(`${season}-1`) || [];
            const r2Picks = pickMap.get(`${season}-2`) || [];
            const r1Entries = buildRoundEntries(r1Picks, 1, season);
            const r2Entries = buildRoundEntries(r2Picks, 2, season);
            const rowCount = Math.max(r1Entries.length, r2Entries.length);
            return { season, r1Entries, r2Entries, rowCount };
        });
    }, [pickMap, tradedAwayMap, myTeamId]);

    return (
        <div className="animate-in fade-in duration-500 border-b-2 border-b-slate-500">
            <table className="w-full border-collapse text-xs table-fixed">
                <colgroup>
                    <col style={{ width: '90px' }} />
                    <col style={{ width: '130px' }} />
                    <col />
                    <col style={{ width: '130px' }} />
                    <col />
                </colgroup>
                <thead className="sticky top-0 z-10">
                    <tr>
                        <th className={`${thClass} text-center`}>시즌</th>
                        <th className={`${thClass} text-center border-l border-slate-600`}>1라운드</th>
                        <th className={`${thClass} text-left border-l border-slate-600 pl-3`}>비고</th>
                        <th className={`${thClass} text-center border-l border-slate-600`}>2라운드</th>
                        <th className={`${thClass} text-left border-l border-slate-600 pl-3`}>비고</th>
                    </tr>
                </thead>
                <tbody>
                    {seasonRows.map(({ season, r1Entries, r2Entries, rowCount }) =>
                        Array.from({ length: rowCount }, (_, rowIdx) => {
                            const r1 = r1Entries[rowIdx];
                            const r2 = r2Entries[rowIdx];
                            const isFirstRow = rowIdx === 0;
                            const borderClass = rowIdx < rowCount - 1 ? 'border-b border-slate-700/30' : 'border-b border-slate-700/60';

                            return (
                                <tr key={`${season}-${rowIdx}`} className="hover:bg-slate-800/40">
                                    {isFirstRow && (
                                        <td
                                            rowSpan={rowCount}
                                            className={`${tdClass} text-center font-bold text-slate-200 bg-slate-800 border-b border-slate-700/60`}
                                        >
                                            {season}-{String(season + 1).slice(-2)}
                                        </td>
                                    )}
                                    {r1 ? (
                                        <>
                                            <td className={`py-1.5 px-2 text-xs text-center ${borderClass} border-l border-slate-600 ${r1.color}`}>
                                                {r1.label}
                                            </td>
                                            <td className={`py-1.5 px-2 text-left ${borderClass} border-l border-slate-600 pl-3`}>
                                                {r1.notes.map((note, i) => (
                                                    <div key={i} className="text-xs text-slate-100 leading-tight">{note}</div>
                                                ))}
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className={`py-1.5 px-2 ${borderClass} border-l border-slate-600`} />
                                            <td className={`py-1.5 px-2 ${borderClass} border-l border-slate-600`} />
                                        </>
                                    )}
                                    {r2 ? (
                                        <>
                                            <td className={`py-1.5 px-2 text-xs text-center ${borderClass} border-l border-slate-600 ${r2.color}`}>
                                                {r2.label}
                                            </td>
                                            <td className={`py-1.5 px-2 text-left ${borderClass} border-l border-slate-600 pl-3`}>
                                                {r2.notes.map((note, i) => (
                                                    <div key={i} className="text-xs text-slate-100 leading-tight">{note}</div>
                                                ))}
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className={`py-1.5 px-2 ${borderClass} border-l border-slate-600`} />
                                            <td className={`py-1.5 px-2 ${borderClass} border-l border-slate-600`} />
                                        </>
                                    )}
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>

            {/* ── 드래프트 픽 거래 기록 ── */}
            <h3 className="text-sm font-bold text-slate-300 mt-6 mb-2 px-2">거래 기록</h3>
            <PickTradeHistory myTeamId={myTeamId} />
        </div>
    );
};

/** 드래프트 픽 거래 기록 테이블 */
const PickTradeHistory: React.FC<{ myTeamId: string }> = ({ myTeamId }) => {
    const teamName = (id: string) => TEAM_DATA[id]?.name || id.toUpperCase();

    // 내 팀과 관련된 거래만 필터링
    const relevantTrades = useMemo(() => {
        const trades: { date: string; season: number; round: number; type: '픽 이동' | '스왑 권리'; description: string; direction: 'in' | 'out' | 'swap' }[] = [];

        for (const t of TRADED_FIRST_ROUND_PICKS) {
            if (t.originalTeamId === myTeamId) {
                // 내 픽을 넘긴 거래
                let protLabel = '';
                if (t.protection) {
                    if (t.protection.type === 'none') protLabel = ' (보호 없음)';
                    else if (t.protection.type === 'top' && t.protection.threshold) {
                        protLabel = ` (상위 ${t.protection.threshold}순위 보호`;
                        if (t.protection.fallbackSeason) protLabel += ` → ${t.protection.fallbackSeason} ${t.protection.fallbackRound === 1 ? '1라운드' : '2라운드'}로 전환`;
                        protLabel += ')';
                    } else if (t.protection.type === 'lottery') protLabel = ' (로터리 보호)';
                }
                trades.push({
                    date: '시즌 개시 전',
                    season: t.season,
                    round: t.round,
                    type: '픽 이동',
                    description: `${t.season} ${t.round}라운드 픽 → ${teamName(t.currentTeamId)}${protLabel}`,
                    direction: 'out',
                });
            } else if (t.currentTeamId === myTeamId) {
                // 타팀 픽을 획득한 거래
                let protLabel = '';
                if (t.protection) {
                    if (t.protection.type === 'none') protLabel = ' (보호 없음)';
                    else if (t.protection.type === 'top' && t.protection.threshold) {
                        protLabel = ` (상위 ${t.protection.threshold}순위 보호`;
                        if (t.protection.fallbackSeason) protLabel += ` → ${t.protection.fallbackSeason} ${t.protection.fallbackRound === 1 ? '1라운드' : '2라운드'}로 전환`;
                        protLabel += ')';
                    } else if (t.protection.type === 'lottery') protLabel = ' (로터리 보호)';
                }
                trades.push({
                    date: '시즌 개시 전',
                    season: t.season,
                    round: t.round,
                    type: '픽 이동',
                    description: `${teamName(t.originalTeamId)}의 ${t.season} ${t.round}라운드 픽 획득${protLabel}`,
                    direction: 'in',
                });
            }
        }

        for (const s of SWAP_RIGHTS) {
            if (s.beneficiaryTeamId === myTeamId) {
                trades.push({
                    date: '시즌 개시 전',
                    season: s.season,
                    round: s.round,
                    type: '스왑 권리',
                    description: `${s.season} ${s.round}라운드 — ${teamName(s.originTeamId)}과 스왑 권리 보유`,
                    direction: 'swap',
                });
            } else if (s.originTeamId === myTeamId) {
                trades.push({
                    date: '시즌 개시 전',
                    season: s.season,
                    round: s.round,
                    type: '스왑 권리',
                    description: `${s.season} ${s.round}라운드 — ${teamName(s.beneficiaryTeamId)}에 스왑 권리 제공`,
                    direction: 'swap',
                });
            }
        }

        trades.sort((a, b) => a.season - b.season || a.round - b.round);
        return trades;
    }, [myTeamId]);

    if (relevantTrades.length === 0) {
        return <div className="text-xs text-slate-500 px-2 pb-4">관련 거래 기록이 없습니다.</div>;
    }

    return (
        <table className="w-full border-collapse text-xs table-fixed">
            <colgroup>
                <col style={{ width: '100px' }} />
                <col style={{ width: '80px' }} />
                <col style={{ width: '60px' }} />
                <col />
            </colgroup>
            <thead className="sticky top-0 z-10">
                <tr>
                    <th className={`${thClass} text-center`}>거래 일자</th>
                    <th className={`${thClass} text-center border-l border-slate-600`}>유형</th>
                    <th className={`${thClass} text-center border-l border-slate-600`}>방향</th>
                    <th className={`${thClass} text-left border-l border-slate-600 pl-3`}>내용</th>
                </tr>
            </thead>
            <tbody>
                {relevantTrades.map((t, i) => (
                    <tr key={i} className="hover:bg-slate-800/40">
                        <td className={`${tdClass} text-center text-slate-400`}>{t.date}</td>
                        <td className={`${tdClass} text-center border-l border-slate-600 text-slate-300`}>{t.type}</td>
                        <td className={`${tdClass} text-center border-l border-slate-600 font-bold ${
                            t.direction === 'in' ? 'text-emerald-400' : t.direction === 'out' ? 'text-red-400/70' : 'text-amber-400/70'
                        }`}>
                            {t.direction === 'in' ? '획득' : t.direction === 'out' ? '양도' : '스왑'}
                        </td>
                        <td className={`${tdClass} text-left border-l border-slate-600 pl-3 text-slate-300`}>{t.description}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

/** 달러 → $00,000,000 표기 */
function fmtSalary(v: number): string {
    return `$${Math.round(v).toLocaleString()}`;
}

// ── 유틸 ──

/** 달러 값을 전체 표기로 변환 (예: 155300000 → $155,300,000) */
function fmtFull(v: number): string {
    return `$${Math.round(v).toLocaleString()}`;
}

/** $B 값을 전체 달러 표기로 변환 (예: 120 → $120,000,000,000) */
function fmtFullB(v: number): string {
    const dollars = Math.round(v * 1_000_000_000);
    return `$${dollars.toLocaleString()}`;
}

