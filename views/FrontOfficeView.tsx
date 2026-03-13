
import React, { useState } from 'react';
import { Team } from '../types';
import { TeamFinance } from '../types/finance';
import { LeagueCoachingData } from '../types/coaching';
import { TEAM_FINANCE_DATA } from '../data/teamFinanceData';
import { TEAM_DATA } from '../data/teamData';
import { getBudgetManager } from '../services/financeEngine';
import { HeadCoachTable } from '../components/dashboard/CoachProfileCard';

type FrontOfficeTab = 'club' | 'coaching';

interface FrontOfficeViewProps {
    team: Team;
    teams: Team[];
    currentSimDate: string;
    myTeamId: string;
    coachingData?: LeagueCoachingData | null;
    onCoachClick?: (teamId: string) => void;
}

export const FrontOfficeView: React.FC<FrontOfficeViewProps> = ({
    team, teams, currentSimDate, myTeamId, coachingData, onCoachClick,
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
                        <button onClick={() => setActiveTab('coaching')} className={tabClass('coaching')}>
                            <span>코칭 스태프</span>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    {activeTab === 'club' && finData && finance && (
                        <ClubTab finData={finData} finance={finance} team={team} teams={teams} myTeamId={myTeamId} />
                    )}
                    {activeTab === 'coaching' && (
                        <div className="animate-in fade-in duration-500 h-full">
                            <HeadCoachTable coach={coachingData?.[team.id]?.headCoach} onCoachClick={() => onCoachClick?.(team.id)} />
                        </div>
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
const thClass = "py-1.5 px-2 text-xs font-bold uppercase tracking-wide text-slate-300 whitespace-nowrap border-b border-slate-600 bg-slate-800/80";
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
    const rL = "border-l-2 border-slate-400/60";

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

// ── 유틸 ──

/** $M 값을 전체 달러 표기로 변환 (예: 155.3 → $155,300,000) */
function fmtFull(v: number): string {
    const dollars = Math.round(v * 1_000_000);
    return `$${dollars.toLocaleString()}`;
}

/** $B 값을 전체 달러 표기로 변환 (예: 120 → $120,000,000,000) */
function fmtFullB(v: number): string {
    const dollars = Math.round(v * 1_000_000_000);
    return `$${dollars.toLocaleString()}`;
}

