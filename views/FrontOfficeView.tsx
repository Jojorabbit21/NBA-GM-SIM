
import React, { useState, useMemo } from 'react';
import { Team } from '../types';
import { SavedTeamFinances, TeamFinance } from '../types/finance';
import { TEAM_FINANCE_DATA } from '../data/teamFinanceData';
import { TEAM_DATA } from '../data/teamData';
import { getBudgetManager } from '../services/financeEngine';
import { Building2, DollarSign, Users, TrendingUp, TrendingDown, Landmark } from 'lucide-react';

type FrontOfficeTab = 'finance' | 'owner' | 'arena';

interface FrontOfficeViewProps {
    team: Team;
    teams: Team[];
    currentSimDate: string;
    myTeamId: string;
}

export const FrontOfficeView: React.FC<FrontOfficeViewProps> = ({
    team, teams, currentSimDate, myTeamId,
}) => {
    const [activeTab, setActiveTab] = useState<FrontOfficeTab>('finance');

    const finData = TEAM_FINANCE_DATA[myTeamId];
    const finance = getBudgetManager().getFinance(myTeamId);

    const tabs: { key: FrontOfficeTab; label: string; icon: React.ReactNode }[] = [
        { key: 'finance', label: '재정', icon: <DollarSign size={16} /> },
        { key: 'owner', label: '구단주', icon: <Landmark size={16} /> },
        { key: 'arena', label: '경기장', icon: <Building2 size={16} /> },
    ];

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-500 overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-3 bg-slate-950 border-b border-slate-800">
                <div className="flex items-center justify-between">
                    <h1 className="text-lg font-black ko-tight tracking-tight text-white">
                        프론트 오피스
                    </h1>
                    <span className="text-xs text-slate-500">{currentSimDate}</span>
                </div>
                {/* Tabs */}
                <div className="flex gap-4 mt-2">
                    {tabs.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold ko-tight rounded-lg transition-all ${
                                activeTab === tab.key
                                    ? 'text-indigo-400 bg-indigo-500/10'
                                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                            }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6 space-y-6">
                {activeTab === 'finance' && finance && finData && (
                    <FinanceTab finance={finance} finData={finData} team={team} />
                )}
                {activeTab === 'owner' && finData && (
                    <OwnerTab finData={finData} team={team} />
                )}
                {activeTab === 'arena' && finData && (
                    <ArenaTab finData={finData} team={team} teams={teams} myTeamId={myTeamId} />
                )}
                {!finData && (
                    <div className="text-center text-slate-500 py-20">
                        재정 데이터를 불러올 수 없습니다.
                    </div>
                )}
            </div>
        </div>
    );
};

// ── 재정 탭 ──
const FinanceTab: React.FC<{
    finance: TeamFinance;
    finData: (typeof TEAM_FINANCE_DATA)[string];
    team: Team;
}> = ({ finance, finData, team }) => {
    const totalRevenue = Object.values(finance.revenue).reduce((s, v) => s + v, 0);
    const totalExpenses = Object.values(finance.expenses).reduce((s, v) => s + v, 0);

    const revenueItems = [
        { label: '관중 입장료', value: finance.revenue.gate, color: 'bg-emerald-500' },
        { label: '중앙 방송 분배금', value: finance.revenue.broadcasting, color: 'bg-blue-500' },
        { label: '로컬 미디어', value: finance.revenue.localMedia, color: 'bg-sky-500' },
        { label: '스폰서십', value: finance.revenue.sponsorship, color: 'bg-violet-500' },
        { label: 'MD 판매', value: finance.revenue.merchandise, color: 'bg-amber-500' },
        { label: '기타', value: finance.revenue.other, color: 'bg-slate-500' },
    ];

    const expenseItems = [
        { label: '선수 연봉', value: finance.expenses.payroll, color: 'bg-red-500' },
        { label: '럭셔리 택스', value: finance.expenses.luxuryTax, color: 'bg-orange-500' },
        { label: '운영비', value: finance.expenses.operations, color: 'bg-slate-500' },
        { label: '코칭 스태프', value: finance.expenses.coachSalary, color: 'bg-yellow-500' },
    ];

    return (
        <>
            {/* Summary Cards */}
            <div className="grid grid-cols-4 gap-4">
                <SummaryCard label="총 수익" value={totalRevenue} suffix="M" positive />
                <SummaryCard label="총 지출" value={totalExpenses} suffix="M" />
                <SummaryCard
                    label="영업 수입"
                    value={finance.operatingIncome}
                    suffix="M"
                    positive={finance.operatingIncome >= 0}
                    highlight
                />
                <SummaryCard label="시즌 예산" value={finance.budget} suffix="M" />
            </div>

            {/* Revenue & Expenses */}
            <div className="grid grid-cols-2 gap-6">
                {/* Revenue Breakdown */}
                <div className="rounded-3xl bg-slate-900 border border-slate-800 p-5">
                    <h3 className="text-sm font-bold ko-tight text-slate-300 mb-4 flex items-center gap-2">
                        <TrendingUp size={16} className="text-emerald-400" />
                        수익 내역
                    </h3>
                    <div className="space-y-3">
                        {revenueItems.map(item => (
                            <BarItem key={item.label} {...item} total={totalRevenue} />
                        ))}
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-700 flex justify-between text-sm">
                        <span className="text-slate-400 font-bold ko-tight">합계</span>
                        <span className="text-emerald-400 font-bold">${totalRevenue.toFixed(1)}M</span>
                    </div>
                </div>

                {/* Expenses Breakdown */}
                <div className="rounded-3xl bg-slate-900 border border-slate-800 p-5">
                    <h3 className="text-sm font-bold ko-tight text-slate-300 mb-4 flex items-center gap-2">
                        <TrendingDown size={16} className="text-red-400" />
                        지출 내역
                    </h3>
                    <div className="space-y-3">
                        {expenseItems.map(item => (
                            <BarItem key={item.label} {...item} total={totalExpenses} />
                        ))}
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-700 flex justify-between text-sm">
                        <span className="text-slate-400 font-bold ko-tight">합계</span>
                        <span className="text-red-400 font-bold">${totalExpenses.toFixed(1)}M</span>
                    </div>
                </div>
            </div>
        </>
    );
};

// ── 구단주 탭 ──
const OwnerTab: React.FC<{
    finData: (typeof TEAM_FINANCE_DATA)[string];
    team: Team;
}> = ({ finData, team }) => {
    const { ownerProfile } = finData;
    const traits = [
        { label: '지출 의지', value: ownerProfile.spendingWillingness, desc: '택스 납부 및 FA 투자 의지' },
        { label: '우승 우선', value: ownerProfile.winNowPriority, desc: '단기 우승 vs 장기 육성' },
        { label: '마케팅 중시', value: ownerProfile.marketingFocus, desc: '수익 극대화 vs 팬 서비스' },
        { label: '인내심', value: ownerProfile.patience, desc: '리빌딩 과정에 대한 인내심' },
    ];

    return (
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6">
            <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 flex items-center justify-center">
                    <Landmark size={24} className="text-indigo-400" />
                </div>
                <div>
                    <h2 className="text-lg font-black ko-tight text-white">{ownerProfile.name}</h2>
                    <p className="text-sm text-slate-400">
                        순자산: <span className="text-emerald-400 font-bold">${ownerProfile.netWorth}B</span>
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                {traits.map(trait => (
                    <div key={trait.label} className="rounded-2xl bg-slate-800/50 p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold ko-tight text-slate-300">{trait.label}</span>
                            <span className="text-sm font-bold text-indigo-400">{trait.value}/10</span>
                        </div>
                        <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-indigo-500 rounded-full transition-all"
                                style={{ width: `${trait.value * 10}%` }}
                            />
                        </div>
                        <p className="text-xs text-slate-500 mt-1.5">{trait.desc}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ── 경기장 탭 ──
const ArenaTab: React.FC<{
    finData: (typeof TEAM_FINANCE_DATA)[string];
    team: Team;
    teams: Team[];
    myTeamId: string;
}> = ({ finData, team, teams, myTeamId }) => {
    const { market } = finData;
    const tierLabels: Record<number, string> = { 1: '대도시', 2: '중대도시', 3: '중소도시', 4: '소도시' };

    // 이번 시즌 홈 관중 통계 (budget manager에서 가져오기)
    const budgetMgr = getBudgetManager();
    const myFinance = budgetMgr.getFinance(myTeamId);
    const gatePerGame = myFinance && myFinance.revenue.gate > 0
        ? (myFinance.revenue.gate / Math.max(1, team.wins + team.losses) * 2) // 대략 홈 경기 비율
        : 0;

    return (
        <div className="space-y-6">
            {/* Arena Info */}
            <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6">
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 flex items-center justify-center">
                        <Building2 size={24} className="text-indigo-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-black ko-tight text-white">{market.arenaName}</h2>
                        <p className="text-sm text-slate-400">
                            {TEAM_DATA[myTeamId]?.city} {TEAM_DATA[myTeamId]?.name}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <InfoCard label="좌석 수" value={market.arenaCapacity.toLocaleString()} unit="석" />
                    <InfoCard label="평균 입장료" value={`$${market.baseTicketPrice}`} />
                    <InfoCard label="마켓 티어" value={`Tier ${market.marketTier}`} sub={tierLabels[market.marketTier]} />
                </div>
            </div>

            {/* Market Info */}
            <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6">
                <h3 className="text-sm font-bold ko-tight text-slate-300 mb-4 flex items-center gap-2">
                    <Users size={16} className="text-sky-400" />
                    연고지 정보
                </h3>
                <div className="grid grid-cols-3 gap-4">
                    <InfoCard label="광역 인구" value={`${(market.metroPopulation / 100).toFixed(1)}`} unit="백만 명" />
                    <InfoCard label="로컬 미디어" value={`$${market.localMediaDeal}M`} sub="/년" />
                    <InfoCard label="스폰서 기본" value={`$${market.sponsorshipBase}M`} sub="/년" />
                </div>
            </div>
        </div>
    );
};

// ── 공통 컴포넌트 ──

const SummaryCard: React.FC<{
    label: string;
    value: number;
    suffix?: string;
    positive?: boolean;
    highlight?: boolean;
}> = ({ label, value, suffix = '', positive, highlight }) => (
    <div className={`rounded-2xl p-4 border ${
        highlight
            ? value >= 0
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-red-500/10 border-red-500/30'
            : 'bg-slate-900 border-slate-800'
    }`}>
        <p className="text-xs text-slate-400 font-bold ko-tight mb-1">{label}</p>
        <p className={`text-xl font-bold ${
            highlight
                ? value >= 0 ? 'text-emerald-400' : 'text-red-400'
                : positive ? 'text-emerald-400' : 'text-white'
        }`}>
            ${value.toFixed(1)}{suffix}
        </p>
    </div>
);

const BarItem: React.FC<{
    label: string;
    value: number;
    color: string;
    total: number;
}> = ({ label, value, color, total }) => {
    const pct = total > 0 ? (value / total) * 100 : 0;
    return (
        <div>
            <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-400">{label}</span>
                <span className="text-slate-300 font-bold">${value.toFixed(1)}M</span>
            </div>
            <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
};

const InfoCard: React.FC<{
    label: string;
    value: string;
    unit?: string;
    sub?: string;
}> = ({ label, value, unit, sub }) => (
    <div className="rounded-2xl bg-slate-800/50 p-4">
        <p className="text-xs text-slate-500 mb-1">{label}</p>
        <p className="text-lg font-bold text-white">
            {value}
            {unit && <span className="text-xs text-slate-400 ml-1">{unit}</span>}
        </p>
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
);
