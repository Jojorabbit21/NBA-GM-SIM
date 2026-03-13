
import React, { useState } from 'react';
import { Team } from '../types';
import { TeamFinance } from '../types/finance';
import { TEAM_FINANCE_DATA } from '../data/teamFinanceData';
import { TEAM_DATA } from '../data/teamData';
import { getBudgetManager } from '../services/financeEngine';
import { Building2, DollarSign, Users, Landmark } from 'lucide-react';

type FrontOfficeTab = 'club' | 'finance';

interface FrontOfficeViewProps {
    team: Team;
    teams: Team[];
    currentSimDate: string;
    myTeamId: string;
}

export const FrontOfficeView: React.FC<FrontOfficeViewProps> = ({
    team, teams, currentSimDate, myTeamId,
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
                        <button onClick={() => setActiveTab('finance')} className={tabClass('finance')}>
                            <span>재무제표</span>
                        </button>
                    </div>
                    <span className="text-xs text-slate-500">{currentSimDate}</span>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    {activeTab === 'club' && finData && finance && (
                        <ClubTab finData={finData} finance={finance} team={team} teams={teams} myTeamId={myTeamId} />
                    )}
                    {activeTab === 'finance' && finance && finData && (
                        <FinanceStatementTab finance={finance} finData={finData} team={team} />
                    )}
                    {!finData && (
                        <div className="text-center text-slate-500 py-20">
                            재정 데이터를 불러올 수 없습니다.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── 구단 탭 (재정 요약 + 구단주 + 경기장을 2×2 그리드로) ──
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

    return (
        <div className="p-6 space-y-6">
            {/* Row 1: 재정 요약 (left) + 구단주 (right) */}
            <div className="grid grid-cols-2 gap-6">
                {/* 재정 요약 테이블 */}
                <div className="rounded-3xl bg-slate-900 border border-slate-800 p-5">
                    <h3 className="text-sm font-bold ko-tight text-slate-300 mb-4 flex items-center gap-2">
                        <DollarSign size={16} className="text-emerald-400" />
                        재정 현황
                    </h3>
                    <table className="w-full text-sm">
                        <tbody>
                            <StatRow label="총 수익" value={totalRevenue} color="text-emerald-400" />
                            <StatRow label="총 지출" value={totalExpenses} color="text-red-400" />
                            <tr className="border-t border-slate-700">
                                <td className="py-2.5 text-slate-300 font-bold ko-tight">영업 수입</td>
                                <td className={`py-2.5 text-right font-black text-base ${
                                    finance.operatingIncome >= 0 ? 'text-emerald-400' : 'text-red-400'
                                }`}>
                                    {finance.operatingIncome >= 0 ? '+' : ''}{fmtM(finance.operatingIncome)}
                                </td>
                            </tr>
                            <StatRow label="시즌 예산" value={finance.budget} color="text-indigo-400" />
                            <StatRow label="선수 연봉 (Payroll)" value={finance.expenses.payroll} color="text-white" />
                            <StatRow label="럭셔리 택스" value={finance.expenses.luxuryTax} color={finance.expenses.luxuryTax > 0 ? 'text-orange-400' : 'text-slate-500'} />
                        </tbody>
                    </table>
                </div>

                {/* 구단주 정보 테이블 */}
                <div className="rounded-3xl bg-slate-900 border border-slate-800 p-5">
                    <h3 className="text-sm font-bold ko-tight text-slate-300 mb-4 flex items-center gap-2">
                        <Landmark size={16} className="text-indigo-400" />
                        구단주
                    </h3>
                    <table className="w-full text-sm">
                        <tbody>
                            <tr className="border-b border-slate-800">
                                <td className="py-2.5 text-slate-400">이름</td>
                                <td className="py-2.5 text-right text-white font-bold">{ownerProfile.name}</td>
                            </tr>
                            <tr className="border-b border-slate-800">
                                <td className="py-2.5 text-slate-400">순자산</td>
                                <td className="py-2.5 text-right text-emerald-400 font-bold">${ownerProfile.netWorth}B</td>
                            </tr>
                            <TraitRow label="지출 의지" value={ownerProfile.spendingWillingness} desc="택스 납부 및 FA 투자 의지" />
                            <TraitRow label="우승 우선" value={ownerProfile.winNowPriority} desc="단기 우승 vs 장기 육성" />
                            <TraitRow label="마케팅 중시" value={ownerProfile.marketingFocus} desc="수익 극대화 vs 팬 서비스" />
                            <TraitRow label="인내심" value={ownerProfile.patience} desc="리빌딩 인내심" />
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Row 2: 경기장 정보 (full width) */}
            <div className="rounded-3xl bg-slate-900 border border-slate-800 p-5">
                <h3 className="text-sm font-bold ko-tight text-slate-300 mb-4 flex items-center gap-2">
                    <Building2 size={16} className="text-sky-400" />
                    경기장 & 연고지
                </h3>
                <div className="grid grid-cols-2 gap-6">
                    {/* 경기장 */}
                    <table className="w-full text-sm">
                        <thead>
                            <tr><th colSpan={2} className="text-left text-xs text-slate-500 pb-2 font-bold uppercase tracking-wider">경기장</th></tr>
                        </thead>
                        <tbody>
                            <tr className="border-b border-slate-800">
                                <td className="py-2.5 text-slate-400">경기장명</td>
                                <td className="py-2.5 text-right text-white font-bold">{market.arenaName}</td>
                            </tr>
                            <tr className="border-b border-slate-800">
                                <td className="py-2.5 text-slate-400">좌석 수</td>
                                <td className="py-2.5 text-right text-white font-bold">{market.arenaCapacity.toLocaleString()}석</td>
                            </tr>
                            <tr className="border-b border-slate-800">
                                <td className="py-2.5 text-slate-400">평균 입장료</td>
                                <td className="py-2.5 text-right text-white font-bold">${market.baseTicketPrice}</td>
                            </tr>
                            <tr>
                                <td className="py-2.5 text-slate-400">운영비</td>
                                <td className="py-2.5 text-right text-white font-bold">{fmtM(finance.expenses.operations)}</td>
                            </tr>
                        </tbody>
                    </table>

                    {/* 연고지 */}
                    <table className="w-full text-sm">
                        <thead>
                            <tr><th colSpan={2} className="text-left text-xs text-slate-500 pb-2 font-bold uppercase tracking-wider">연고지</th></tr>
                        </thead>
                        <tbody>
                            <tr className="border-b border-slate-800">
                                <td className="py-2.5 text-slate-400">도시</td>
                                <td className="py-2.5 text-right text-white font-bold">{TEAM_DATA[myTeamId]?.city}</td>
                            </tr>
                            <tr className="border-b border-slate-800">
                                <td className="py-2.5 text-slate-400">광역 인구</td>
                                <td className="py-2.5 text-right text-white font-bold">{(market.metroPopulation / 100).toFixed(1)}M</td>
                            </tr>
                            <tr className="border-b border-slate-800">
                                <td className="py-2.5 text-slate-400">마켓 티어</td>
                                <td className="py-2.5 text-right text-white font-bold">Tier {market.marketTier} <span className="text-slate-500 text-xs ml-1">{tierLabels[market.marketTier]}</span></td>
                            </tr>
                            <tr className="border-b border-slate-800">
                                <td className="py-2.5 text-slate-400">로컬 미디어</td>
                                <td className="py-2.5 text-right text-white font-bold">${market.localMediaDeal}M<span className="text-slate-500 text-xs ml-1">/년</span></td>
                            </tr>
                            <tr>
                                <td className="py-2.5 text-slate-400">스폰서 기본</td>
                                <td className="py-2.5 text-right text-white font-bold">${market.sponsorshipBase}M<span className="text-slate-500 text-xs ml-1">/년</span></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// ── 재무제표 탭 (손익계산서 형식) ──
const FinanceStatementTab: React.FC<{
    finance: TeamFinance;
    finData: (typeof TEAM_FINANCE_DATA)[string];
    team: Team;
}> = ({ finance, finData, team }) => {
    const totalRevenue = Object.values(finance.revenue).reduce((s, v) => s + v, 0);
    const totalExpenses = Object.values(finance.expenses).reduce((s, v) => s + v, 0);

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6">
                {/* 제목 */}
                <div className="text-center mb-6">
                    <h2 className="text-base font-black ko-tight text-white uppercase tracking-wider">
                        {TEAM_DATA[team.id]?.city} {TEAM_DATA[team.id]?.name}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">시즌 손익계산서 (Income Statement)</p>
                </div>

                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b-2 border-slate-600">
                            <th className="text-left py-2 text-slate-400 font-bold text-xs uppercase tracking-wider">항목</th>
                            <th className="text-right py-2 text-slate-400 font-bold text-xs uppercase tracking-wider">금액 ($M)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* 수익 섹션 */}
                        <tr>
                            <td colSpan={2} className="pt-4 pb-1 text-xs font-bold text-emerald-400 uppercase tracking-wider">수익 (Revenue)</td>
                        </tr>
                        <FSRow label="관중 입장료" value={finance.revenue.gate} indent />
                        <FSRow label="중앙 방송 분배금" value={finance.revenue.broadcasting} indent />
                        <FSRow label="로컬 미디어" value={finance.revenue.localMedia} indent />
                        <FSRow label="스폰서십" value={finance.revenue.sponsorship} indent />
                        <FSRow label="MD 판매" value={finance.revenue.merchandise} indent />
                        <FSRow label="기타 수익" value={finance.revenue.other} indent />
                        <tr className="border-t border-slate-700">
                            <td className="py-2 text-slate-200 font-bold ko-tight pl-4">총 수익</td>
                            <td className="py-2 text-right text-emerald-400 font-black">{fmtM(totalRevenue)}</td>
                        </tr>

                        {/* 지출 섹션 */}
                        <tr>
                            <td colSpan={2} className="pt-5 pb-1 text-xs font-bold text-red-400 uppercase tracking-wider">지출 (Expenses)</td>
                        </tr>
                        <FSRow label="선수 연봉" value={finance.expenses.payroll} indent />
                        <FSRow label="럭셔리 택스" value={finance.expenses.luxuryTax} indent />
                        <FSRow label="구장 운영비" value={finance.expenses.operations} indent />
                        <FSRow label="코칭 스태프" value={finance.expenses.coachSalary} indent />
                        <tr className="border-t border-slate-700">
                            <td className="py-2 text-slate-200 font-bold ko-tight pl-4">총 지출</td>
                            <td className="py-2 text-right text-red-400 font-black">{fmtM(totalExpenses)}</td>
                        </tr>

                        {/* 영업 수입 */}
                        <tr className="border-t-2 border-slate-600">
                            <td className="py-3 text-white font-black ko-tight text-base">영업 수입 (Operating Income)</td>
                            <td className={`py-3 text-right font-black text-lg ${
                                finance.operatingIncome >= 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}>
                                {finance.operatingIncome >= 0 ? '+' : ''}{fmtM(finance.operatingIncome)}
                            </td>
                        </tr>

                        {/* 예산 */}
                        <tr className="border-t border-slate-700">
                            <td className="py-2.5 text-slate-400 ko-tight">승인 예산</td>
                            <td className="py-2.5 text-right text-indigo-400 font-bold">{fmtM(finance.budget)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// ── 유틸 / 공통 컴포넌트 ──

function fmtM(v: number): string {
    return `$${v.toFixed(1)}M`;
}

/** 재정 요약 테이블 행 */
const StatRow: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
    <tr className="border-b border-slate-800">
        <td className="py-2.5 text-slate-400">{label}</td>
        <td className={`py-2.5 text-right font-bold ${color}`}>{fmtM(value)}</td>
    </tr>
);

/** 구단주 성향 행 (게이지 바 포함) */
const TraitRow: React.FC<{ label: string; value: number; desc: string }> = ({ label, value, desc }) => (
    <tr className="border-b border-slate-800">
        <td className="py-2.5">
            <span className="text-slate-400">{label}</span>
            <span className="text-[10px] text-slate-600 ml-1.5">{desc}</span>
        </td>
        <td className="py-2.5">
            <div className="flex items-center justify-end gap-2">
                <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${value * 10}%` }} />
                </div>
                <span className="text-indigo-400 font-bold text-xs w-8 text-right">{value}/10</span>
            </div>
        </td>
    </tr>
);

/** 재무제표 행 */
const FSRow: React.FC<{ label: string; value: number; indent?: boolean }> = ({ label, value, indent }) => (
    <tr className="border-b border-slate-800/50">
        <td className={`py-2 text-slate-400 ${indent ? 'pl-6' : ''}`}>{label}</td>
        <td className="py-2 text-right text-slate-300 font-bold">{fmtM(value)}</td>
    </tr>
);
