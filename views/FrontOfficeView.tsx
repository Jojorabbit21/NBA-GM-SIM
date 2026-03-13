
import React, { useState } from 'react';
import { Team } from '../types';
import { TeamFinance } from '../types/finance';
import { TEAM_FINANCE_DATA } from '../data/teamFinanceData';
import { TEAM_DATA } from '../data/teamData';
import { getBudgetManager } from '../services/financeEngine';

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

// ── 공통 엑셀 그리드 스타일 ──
const thClass = "py-1.5 px-2 text-xs font-bold uppercase tracking-wide text-slate-300 whitespace-nowrap border-b border-slate-600 bg-slate-800/80";
const tdClass = "py-1.5 px-2 text-xs font-medium text-slate-300 whitespace-nowrap border-b border-slate-700/60";
const tdValClass = "py-1.5 px-2 text-xs font-medium font-mono tabular-nums text-slate-300 whitespace-nowrap border-b border-slate-700/60 text-right";

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

    const traitRows: { label: string; value: number; desc: string }[] = [
        { label: '지출 의지', value: ownerProfile.spendingWillingness, desc: getSpendingLabel(ownerProfile.spendingWillingness) },
        { label: '우승 의지', value: ownerProfile.winNowPriority, desc: getWinNowLabel(ownerProfile.winNowPriority) },
        { label: '마케팅 중시', value: ownerProfile.marketingFocus, desc: getMarketingLabel(ownerProfile.marketingFocus) },
        { label: '인내심', value: ownerProfile.patience, desc: getPatienceLabel(ownerProfile.patience) },
    ];

    return (
        <div className="grid grid-cols-2">
            {/* ── 좌측: 재정 현황 ── */}
            <div className="border-r border-slate-700/60">
                <table className="w-full border-collapse text-xs">
                        <thead>
                            <tr>
                                <th colSpan={2} className={`${thClass} text-left`}>재정 현황</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* 시즌 예산 */}
                            <tr>
                                <td className={`${tdClass} font-bold text-slate-200`}>시즌 예산</td>
                                <td className={`${tdValClass} text-indigo-400 font-bold`}>{fmtFull(finance.budget)}</td>
                            </tr>

                            {/* 수익 */}
                            <tr>
                                <td className={`${tdClass} font-bold`}>총 수익</td>
                                <td className={`${tdValClass} text-emerald-400 font-bold`}>{fmtFull(totalRevenue)}</td>
                            </tr>
                            <tr>
                                <td className={`${tdClass} pl-4 text-slate-400`}>관중 입장료</td>
                                <td className={`${tdValClass} text-emerald-400`}>{fmtFull(finance.revenue.gate)}</td>
                            </tr>
                            <tr>
                                <td className={`${tdClass} pl-4 text-slate-400`}>중앙 방송 분배금</td>
                                <td className={`${tdValClass} text-emerald-400`}>{fmtFull(finance.revenue.broadcasting)}</td>
                            </tr>
                            <tr>
                                <td className={`${tdClass} pl-4 text-slate-400`}>로컬 미디어</td>
                                <td className={`${tdValClass} text-emerald-400`}>{fmtFull(finance.revenue.localMedia)}</td>
                            </tr>
                            <tr>
                                <td className={`${tdClass} pl-4 text-slate-400`}>스폰서십</td>
                                <td className={`${tdValClass} text-emerald-400`}>{fmtFull(finance.revenue.sponsorship)}</td>
                            </tr>
                            <tr>
                                <td className={`${tdClass} pl-4 text-slate-400`}>MD 판매</td>
                                <td className={`${tdValClass} text-emerald-400`}>{fmtFull(finance.revenue.merchandise)}</td>
                            </tr>
                            <tr>
                                <td className={`${tdClass} pl-4 text-slate-400`}>기타</td>
                                <td className={`${tdValClass} text-emerald-400`}>{fmtFull(finance.revenue.other)}</td>
                            </tr>

                            {/* 지출 */}
                            <tr>
                                <td className={`${tdClass} font-bold`}>총 지출</td>
                                <td className={`${tdValClass} text-red-400 font-bold`}>{fmtFull(totalExpenses)}</td>
                            </tr>
                            <tr>
                                <td className={`${tdClass} pl-4 text-slate-400`}>선수 연봉</td>
                                <td className={`${tdValClass} text-red-400`}>{fmtFull(finance.expenses.payroll)}</td>
                            </tr>
                            <tr>
                                <td className={`${tdClass} pl-4 text-slate-400`}>럭셔리 택스</td>
                                <td className={`${tdValClass} text-red-400`}>{fmtFull(finance.expenses.luxuryTax)}</td>
                            </tr>
                            <tr>
                                <td className={`${tdClass} pl-4 text-slate-400`}>경기장 운영비</td>
                                <td className={`${tdValClass} text-red-400`}>{fmtFull(finance.expenses.operations)}</td>
                            </tr>
                            <tr>
                                <td className={`${tdClass} pl-4 text-slate-400`}>코칭 스태프</td>
                                <td className={`${tdValClass} text-red-400`}>{fmtFull(finance.expenses.coachSalary)}</td>
                            </tr>

                            {/* 손익 */}
                            <tr>
                                <td className={`${tdClass} font-bold text-white border-t border-slate-600`}>영업 수입</td>
                                <td className={`${tdValClass} font-bold border-t border-slate-600 ${finance.operatingIncome >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {finance.operatingIncome >= 0 ? '+' : ''}{fmtFull(finance.operatingIncome)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
            </div>

            {/* ── 우측: 구단주 / 경기장 / 연고지 (연결된 3개 섹션) ── */}
            <div>
                <table className="w-full border-collapse text-xs">
                        {/* 구단주 */}
                        <thead>
                            <tr>
                                <th colSpan={2} className={`${thClass} text-left`}>구단주</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className={tdClass}>이름</td>
                                <td className={`${tdValClass} font-bold text-white`}>{ownerProfile.name}</td>
                            </tr>
                            <tr>
                                <td className={tdClass}>순자산</td>
                                <td className={`${tdValClass} font-bold text-emerald-400`}>{fmtFullB(ownerProfile.netWorth)}</td>
                            </tr>
                            {traitRows.map((t) => (
                                <tr key={t.label}>
                                    <td className={tdClass}>{t.label}</td>
                                    <td className={`${tdValClass} font-bold text-indigo-400`}>{t.desc}</td>
                                </tr>
                            ))}
                        </tbody>

                        {/* 경기장 */}
                        <thead>
                            <tr>
                                <th colSpan={2} className={`${thClass} text-left`}>경기장</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className={tdClass}>경기장명</td>
                                <td className={`${tdValClass} font-bold text-white`}>{market.arenaName}</td>
                            </tr>
                            <tr>
                                <td className={tdClass}>좌석 수</td>
                                <td className={`${tdValClass} font-bold`}>{market.arenaCapacity.toLocaleString()}석</td>
                            </tr>
                            <tr>
                                <td className={tdClass}>평균 입장료</td>
                                <td className={`${tdValClass} font-bold`}>${market.baseTicketPrice}</td>
                            </tr>
                        </tbody>

                        {/* 연고지 */}
                        <thead>
                            <tr>
                                <th colSpan={2} className={`${thClass} text-left`}>연고지</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className={tdClass}>도시</td>
                                <td className={`${tdValClass} font-bold text-white`}>{TEAM_DATA[myTeamId]?.city}</td>
                            </tr>
                            <tr>
                                <td className={tdClass}>광역 인구</td>
                                <td className={`${tdValClass} font-bold`}>{(market.metroPopulation / 100).toFixed(1)}M</td>
                            </tr>
                            <tr>
                                <td className={tdClass}>마켓 티어</td>
                                <td className={`${tdValClass} font-bold`}>Tier {market.marketTier} <span className="text-slate-500">{tierLabels[market.marketTier]}</span></td>
                            </tr>
                        </tbody>
                    </table>
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
                    <h2 className="text-xs font-black ko-tight text-white uppercase tracking-wider">
                        {TEAM_DATA[team.id]?.city} {TEAM_DATA[team.id]?.name}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">시즌 손익계산서 (Income Statement)</p>
                </div>

                <table className="w-full text-xs">
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
                            <td className="py-3 text-white font-black ko-tight text-xs">영업 수입 (Operating Income)</td>
                            <td className={`py-3 text-right font-black text-xs ${
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

/** 재무제표 행 */
const FSRow: React.FC<{ label: string; value: number; indent?: boolean }> = ({ label, value, indent }) => (
    <tr className="border-b border-slate-800/50">
        <td className={`py-2 text-slate-400 ${indent ? 'pl-6' : ''}`}>{label}</td>
        <td className="py-2 text-right text-slate-300 font-bold">{fmtM(value)}</td>
    </tr>
);
