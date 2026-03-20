
import React, { useState, useMemo } from 'react';
import { Team, Player } from '../types';
import { TeamFinance } from '../types/finance';
import { LeagueCoachingData } from '../types/coaching';
import { LeaguePickAssets } from '../types/draftAssets';
import { TEAM_FINANCE_DATA } from '../data/teamFinanceData';
import { TEAM_DATA } from '../data/teamData';
import { DraftPicksPanel } from '../components/frontoffice/DraftPicksPanel';
import { getBudgetManager } from '../services/financeEngine';
import { HeadCoachTable } from '../components/dashboard/CoachProfileCard';
import { GMProfileCard } from '../components/dashboard/GMProfileCard';
import { LeagueGMProfiles } from '../types/gm';

type FrontOfficeTab = 'club' | 'payroll' | 'coaching' | 'draftPicks';

interface FrontOfficeViewProps {
    team: Team;
    teams: Team[];
    currentSimDate: string;
    myTeamId: string;
    coachingData?: LeagueCoachingData | null;
    onCoachClick?: (teamId: string) => void;
    onGMClick?: (teamId: string) => void;
    onViewPlayer?: (player: Player, teamId?: string, teamName?: string) => void;
    leaguePickAssets?: LeaguePickAssets | null;
    leagueGMProfiles?: LeagueGMProfiles | null;
    userNickname?: string;
    seasonShort?: string;
}

export const FrontOfficeView: React.FC<FrontOfficeViewProps> = ({
    team, teams, currentSimDate, myTeamId, coachingData, onCoachClick, onGMClick, onViewPlayer, leaguePickAssets, leagueGMProfiles, userNickname, seasonShort = '2025-26',
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
                        <ClubTab finData={finData} finance={finance} myTeamId={myTeamId} />
                    )}
                    {activeTab === 'payroll' && (
                        <PayrollTab team={team} seasonShort={seasonShort} myTeamId={myTeamId} onViewPlayer={onViewPlayer} />
                    )}
                    {activeTab === 'coaching' && (
                        <div className="animate-in fade-in duration-500 h-full">
                            {team.id === myTeamId ? (
                                <GMProfileCard userNickname={userNickname || 'You'} />
                            ) : (
                                <GMProfileCard gmProfile={leagueGMProfiles?.[team.id]} onGMClick={() => onGMClick?.(team.id)} />
                            )}
                            <HeadCoachTable coach={coachingData?.[team.id]?.headCoach} onCoachClick={() => onCoachClick?.(team.id)} />
                        </div>
                    )}
                    {activeTab === 'draftPicks' && (
                        <DraftPicksPanel teamId={myTeamId} leaguePickAssets={leaguePickAssets} />
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

// ── 구단 탭 공통 컴포넌트 ──
const MONTH_LABELS: Record<string, string> = {
    '10': '10월', '11': '11월', '12': '12월',
    '01': '1월', '02': '2월', '03': '3월', '04': '4월',
};

const WidgetHeader: React.FC<{ title: string; primaryColor: string }> = ({ title, primaryColor }) => (
    <div className="px-4 py-2 shrink-0" style={{ backgroundColor: primaryColor }}>
        <span className="text-sm font-bold text-white">{title}</span>
    </div>
);

const SubHeader: React.FC<{ label: string }> = ({ label }) => (
    <div className="px-4 py-1 text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-800 bg-slate-800/50">
        {label}
    </div>
);

const DataRow: React.FC<{
    label: string;
    value: React.ReactNode;
    valueClass?: string;
    indent?: boolean;
}> = ({ label, value, valueClass = 'text-white', indent }) => (
    <div className={`flex items-center justify-between py-1.5 text-xs border-b border-slate-800 last:border-0 ${indent ? 'pl-8 pr-4' : 'px-4'}`}>
        <span className={indent ? 'text-slate-400' : 'text-slate-300'}>{label}</span>
        <span className={`font-bold font-mono tabular-nums ${valueClass}`}>{value}</span>
    </div>
);

// ── 구단 탭 ──
const ClubTab: React.FC<{
    finData: (typeof TEAM_FINANCE_DATA)[string];
    finance: TeamFinance;
    myTeamId: string;
}> = ({ finData, finance, myTeamId }) => {
    const { ownerProfile, market } = finData;
    const primaryColor = TEAM_DATA[myTeamId]?.colors?.primary ?? '#4f46e5';
    const tierLabels: Record<number, string> = { 1: '대도시', 2: '중대도시', 3: '중소도시', 4: '소도시' };
    const totalRevenue = Object.values(finance.revenue).reduce((s, v) => s + v, 0);
    const totalExpenses = Object.values(finance.expenses).reduce((s, v) => s + v, 0);

    const attendanceStats = getBudgetManager().getAttendanceStats(myTeamId);
    const hasGames = attendanceStats.totalAttendance > 0;
    const monthKeys = Object.keys(attendanceStats.monthlyAttendance).sort();

    const traitRows = [
        { label: '지출 의지', desc: getSpendingLabel(ownerProfile.spendingWillingness) },
        { label: '우승 의지', desc: getWinNowLabel(ownerProfile.winNowPriority) },
        { label: '마케팅 중시', desc: getMarketingLabel(ownerProfile.marketingFocus) },
        { label: '인내심', desc: getPatienceLabel(ownerProfile.patience) },
    ];

    const occClass = (occ: number) =>
        occ >= 0.85 ? 'text-emerald-400' : occ >= 0.70 ? 'text-yellow-400' : 'text-red-400';

    return (
        <div className="p-4 flex gap-4 items-start">
            {/* 1열 (4): 재정 현황 */}
            <div className="flex-[4] bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                <WidgetHeader title="재정 현황" primaryColor={primaryColor} />
                <DataRow label="시즌 예산" value={fmtFull(finance.budget)} valueClass="text-indigo-400" />
                <SubHeader label="수익" />
                <DataRow label="관중 입장료" value={fmtFull(finance.revenue.gate)} valueClass="text-emerald-400" indent />
                <DataRow label="중앙 방송 분배금" value={fmtFull(finance.revenue.broadcasting)} valueClass="text-emerald-400" indent />
                <DataRow label="로컬 미디어" value={fmtFull(finance.revenue.localMedia)} valueClass="text-emerald-400" indent />
                <DataRow label="스폰서십" value={fmtFull(finance.revenue.sponsorship)} valueClass="text-emerald-400" indent />
                <DataRow label="MD 판매" value={fmtFull(finance.revenue.merchandise)} valueClass="text-emerald-400" indent />
                <DataRow label="기타" value={fmtFull(finance.revenue.other)} valueClass="text-emerald-400" indent />
                <DataRow label="총 수익" value={fmtFull(totalRevenue)} valueClass="text-emerald-400" />
                <SubHeader label="지출" />
                <DataRow label="선수 연봉" value={fmtFull(finance.expenses.payroll)} valueClass="text-red-400" indent />
                <DataRow label="럭셔리 택스" value={fmtFull(finance.expenses.luxuryTax)} valueClass="text-red-400" indent />
                <DataRow label="경기장 운영비" value={fmtFull(finance.expenses.operations)} valueClass="text-red-400" indent />
                <DataRow label="코칭 스태프" value={fmtFull(finance.expenses.coachSalary)} valueClass="text-red-400" indent />
                <DataRow label="스카우팅/선수 개발" value={fmtFull(finance.expenses.scouting)} valueClass="text-red-400" indent />
                <DataRow label="마케팅/홍보" value={fmtFull(finance.expenses.marketing)} valueClass="text-red-400" indent />
                <DataRow label="일반 관리비" value={fmtFull(finance.expenses.administration)} valueClass="text-red-400" indent />
                <DataRow label="총 지출" value={fmtFull(totalExpenses)} valueClass="text-red-400" />
                <DataRow
                    label="손익"
                    value={`${finance.operatingIncome >= 0 ? '+' : ''}${fmtFull(finance.operatingIncome)}`}
                    valueClass={finance.operatingIncome >= 0 ? 'text-emerald-400' : 'text-red-400'}
                />
            </div>

            {/* 2열 (3): 경기장 + 관중 통계 */}
            <div className="flex-[3] flex flex-col gap-4">
                {/* 경기장 */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                    <WidgetHeader title="경기장" primaryColor={primaryColor} />
                    <DataRow label="경기장명" value={market.arenaName} />
                    <DataRow label="좌석 수" value={`${market.arenaCapacity.toLocaleString()}석`} />
                    <DataRow label="평균 입장료" value={`$${market.baseTicketPrice}`} />
                </div>

                {/* 관중 통계 */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                    <WidgetHeader title="관중 통계" primaryColor={primaryColor} />
                    <DataRow label="시즌 총 관중" value={hasGames ? `${attendanceStats.totalAttendance.toLocaleString()}명` : '-'} />
                    <DataRow label="경기당 평균" value={hasGames ? `${attendanceStats.averageAttendance.toLocaleString()}명` : '-'} />
                    <DataRow
                        label="평균 점유율"
                        value={hasGames ? `${(attendanceStats.averageOccupancy * 100).toFixed(1)}%` : '-'}
                        valueClass={hasGames ? occClass(attendanceStats.averageOccupancy) : 'text-white'}
                    />
                    {monthKeys.map(mk => {
                        const m = attendanceStats.monthlyAttendance[mk];
                        const avg = Math.round(m.total / m.games);
                        const occ = avg / market.arenaCapacity;
                        return (
                            <div key={mk} className="flex items-center justify-between px-4 py-1.5 text-xs border-b border-slate-800 last:border-0">
                                <span className="text-slate-400">{MONTH_LABELS[mk.slice(5)] ?? mk}</span>
                                <AttendanceBar occupancy={occ} avg={avg} />
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 3열 (3): 구단주 + 연고지 */}
            <div className="flex-[3] flex flex-col gap-4">
                {/* 구단주 */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                    <WidgetHeader title="구단주" primaryColor={primaryColor} />
                    <DataRow label="이름" value={ownerProfile.name} />
                    <DataRow label="순자산" value={fmtFullB(ownerProfile.netWorth)} valueClass="text-emerald-400" />
                    {traitRows.map(r => (
                        <DataRow key={r.label} label={r.label} value={r.desc} valueClass="text-indigo-400" />
                    ))}
                </div>

                {/* 연고지 */}
                <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                    <WidgetHeader title="연고지" primaryColor={primaryColor} />
                    <DataRow label="도시" value={TEAM_DATA[myTeamId]?.city ?? ''} />
                    <DataRow label="광역 인구" value={`${(market.metroPopulation * 10000).toLocaleString()}명`} />
                    <DataRow label="마켓 티어" value={tierLabels[market.marketTier] ?? ''} />
                </div>
            </div>
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
const PayrollTab: React.FC<{
    team: Team;
    seasonShort: string;
    myTeamId: string;
    onViewPlayer?: (player: Player, teamId?: string, teamName?: string) => void;
}> = ({ team, seasonShort, myTeamId, onViewPlayer }) => {
    const primaryColor = TEAM_DATA[myTeamId]?.colors?.primary ?? '#4f46e5';
    const teamName = TEAM_DATA[myTeamId] ? `${TEAM_DATA[myTeamId].city} ${TEAM_DATA[myTeamId].name}` : team.name;

    const { players, seasonColumns, totals } = useMemo(() => {
        const sorted = [...team.roster].sort((a, b) => b.ovr - a.ovr);

        const baseYear = seasonShort ? parseInt(seasonShort) : 2025;
        const cols: string[] = [];
        for (let y = baseYear; y < baseYear + 6; y++) {
            cols.push(`${y}-${String(y + 1).slice(-2)}`);
        }

        const colTotals = new Array(cols.length).fill(0);
        for (const p of sorted) {
            if (!p.contract) continue;
            for (let i = 0; i < p.contract.years.length; i++) {
                const colIdx = i - p.contract.currentYear;
                if (colIdx >= 0 && colIdx < cols.length) {
                    colTotals[colIdx] += p.contract.years[i];
                }
            }
        }

        return { players: sorted, seasonColumns: cols, totals: colTotals };
    }, [team.roster, seasonShort]);

    const COL_W = 120;

    return (
        <div className="p-4 animate-in fade-in duration-500">
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                <WidgetHeader title="선수 급여" primaryColor={primaryColor} />
                <div className="overflow-x-auto">
                    <table className="border-collapse text-xs" style={{ width: `${160 + COL_W * seasonColumns.length}px` }}>
                        <colgroup>
                            <col style={{ width: '160px' }} />
                            {seasonColumns.map(col => <col key={col} style={{ width: `${COL_W}px` }} />)}
                        </colgroup>
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-slate-800 border-b border-slate-700">
                                <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-400 sticky left-0 bg-slate-800 z-20">선수</th>
                                {seasonColumns.map(col => (
                                    <th key={col} className="px-4 py-2 text-right text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">{col}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {players.map(p => (
                                <PayrollRow
                                    key={p.id}
                                    player={p}
                                    seasonColumns={seasonColumns}
                                    myTeamId={myTeamId}
                                    teamName={teamName}
                                    onViewPlayer={onViewPlayer}
                                />
                            ))}
                            <tr className="bg-slate-800 border-t-2 border-slate-700">
                                <td className="px-4 py-2 text-xs font-bold text-white sticky left-0 bg-slate-800 z-10">합계</td>
                                {totals.map((t, i) => (
                                    <td key={i} className="px-4 py-2 text-right text-xs font-bold font-mono tabular-nums text-white">
                                        {t > 0 ? fmtSalary(t) : ''}
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const PayrollRow: React.FC<{
    player: Player;
    seasonColumns: string[];
    myTeamId: string;
    teamName: string;
    onViewPlayer?: (player: Player, teamId?: string, teamName?: string) => void;
}> = ({ player, seasonColumns, myTeamId, teamName, onViewPlayer }) => {
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
        <tr className="group border-b border-slate-800 hover:bg-slate-800">
            <td className="px-4 py-1.5 text-xs text-slate-200 sticky left-0 bg-slate-900 group-hover:bg-slate-800 z-10">
                {onViewPlayer ? (
                    <button
                        onClick={() => onViewPlayer(player, myTeamId, teamName)}
                        className="hover:text-white hover:underline transition-colors text-left"
                    >
                        {player.name}
                    </button>
                ) : player.name}
            </td>
            {cells.map((cell, i) => (
                <td key={i} className={`px-4 py-1.5 text-right text-xs font-mono tabular-nums ${cell ? 'text-slate-300' : 'text-slate-700'}`}>
                    {cell ?? '-'}
                </td>
            ))}
        </tr>
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

