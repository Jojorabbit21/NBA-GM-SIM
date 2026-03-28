
import React, { useMemo, useState, useEffect } from 'react';
import { useTabParam } from '../hooks/useTabParam';
import { Team, Player } from '../types';
import type { ReleaseType } from '../types';
import { DeadMoneyEntry } from '../types/team';
import { TeamFinance } from '../types/finance';
import { LeagueCoachingData } from '../types/coaching';
import type { Coach, CoachFAPool, StaffRole } from '../types/coaching';
import { CoachNegotiationScreen } from './CoachNegotiationScreen';
import type { LeagueTrainingConfigs, TeamTrainingConfig } from '../types/training';
import { LeaguePickAssets } from '../types/draftAssets';
import type { PlayerContract } from '../types/player';
import type { OffseasonPhase } from '../types/app';
import { TEAM_FINANCE_DATA } from '../data/teamFinanceData';
import { TEAM_DATA } from '../data/teamData';
import { DraftPicksPanel } from '../components/frontoffice/DraftPicksPanel';
import { NegotiationScreen } from './NegotiationScreen';
import type { NegotiationState } from '../services/fa/extensionEngine';
import { getBudgetManager, calculateLuxuryTax } from '../services/financeEngine';
import { coachAbilityLabel, coachAbilityColor } from '../utils/coachAbility';
import { LeagueGMProfiles, GM_PERSONALITY_LABELS, DIRECTION_LABELS } from '../types/gm';
import { LEAGUE_FINANCIALS, SIGNING_EXCEPTIONS } from '../utils/constants';
import { calcTeamPayroll } from '../services/fa/faMarketBuilder';

type FrontOfficeTab = 'club' | 'payroll' | 'coaching' | 'draftPicks' | 'investment';

interface FrontOfficeViewProps {
    team: Team;
    teams: Team[];
    currentSimDate: string;
    myTeamId: string;
    coachingData?: LeagueCoachingData | null;
    onCoachClick?: (teamId: string, role?: StaffRole) => void;
    onGMClick?: (teamId: string) => void;
    onViewPlayer?: (player: Player, teamId?: string, teamName?: string) => void;
    leaguePickAssets?: LeaguePickAssets | null;
    leagueGMProfiles?: LeagueGMProfiles | null;
    userNickname?: string;
    seasonShort?: string;
    // 계약 관리 탭용 props (선택적)
    offseasonPhase?: OffseasonPhase;
    onReleasePlayer?: (playerId: string, releaseType: ReleaseType, buyoutAmount?: number) => void;
    onTeamOptionDecide?: (playerId: string, exercised: boolean) => void;
    onExtensionOffer?: (playerId: string, contract: PlayerContract) => void;
    tendencySeed?: string;
    initialNegotiateId?: string;                          // 자동 오픈 선수 ID
    initialNegotiateType?: 'extension' | 'release';       // 자동 오픈 협상 타입
    coachFAPool?: CoachFAPool | null;
    leagueTrainingConfigs?: LeagueTrainingConfigs | null;
    onTrainingViewOpen?: () => void;  // 훈련 계획 뷰 열기
    onExtendCoachAccepted?: (role: StaffRole, salary: number, years: number) => void;
    onFireCoach?: (role: StaffRole, buyoutAmount: number) => void;
    onInvestmentTabOpen?: () => void; // 구단주 투자 뷰 열기
    investmentConfirmed?: boolean;    // 현 시즌 투자 배분 완료 여부
}

export const FrontOfficeView: React.FC<FrontOfficeViewProps> = ({
    team, teams, currentSimDate, myTeamId, coachingData, onCoachClick, onGMClick, onViewPlayer, leaguePickAssets, leagueGMProfiles, userNickname, seasonShort = '2025-26',
    offseasonPhase, onReleasePlayer, onTeamOptionDecide, onExtensionOffer, tendencySeed = '',
    initialNegotiateId, initialNegotiateType,
    coachFAPool, leagueTrainingConfigs, onTrainingViewOpen,
    onExtendCoachAccepted, onFireCoach, onInvestmentTabOpen, investmentConfirmed,
}) => {
    const [activeTab, setActiveTab] = useTabParam<FrontOfficeTab>('club');
    const [coachingTabExtNeg, setCoachingTabExtNeg] = useState<{ role: StaffRole; coach: Coach } | null>(null);
    const [coachingTabFireTarget, setCoachingTabFireTarget] = useState<{ role: StaffRole; coach: Coach } | null>(null);

    const primaryColor = TEAM_DATA[myTeamId]?.colors?.primary ?? '#4f46e5';
    const textColor = TEAM_DATA[myTeamId]?.colors?.text ?? '#FFFFFF';
    const finData = TEAM_FINANCE_DATA[myTeamId];
    const finance = getBudgetManager().getFinance(myTeamId);

    const tabClass = (key: FrontOfficeTab) =>
        `flex items-center gap-2 transition-all h-full border-b-2 font-black tracking-tight uppercase text-sm ${
            activeTab === key
                ? 'text-indigo-400 border-indigo-400'
                : 'text-slate-500 hover:text-slate-300 border-transparent'
        }`;

    return (
        <>
        <div className="h-full animate-in fade-in duration-700 ko-normal relative text-slate-200 flex flex-col overflow-hidden">
            <div className="w-full flex flex-col flex-1 min-h-0">
                {/* Tab Navigation — Dashboard 스타일 */}
                <div className="px-8 border-b border-slate-800 bg-slate-950 flex items-center justify-between h-14 flex-shrink-0">
                    <div className="flex items-center gap-8 h-full">
                        <button onClick={() => setActiveTab('club')} className={tabClass('club')}>
                            <span>재정 및 구단 정보</span>
                        </button>
                        <button onClick={() => setActiveTab('payroll')} className={tabClass('payroll')}>
                            <span>샐러리</span>
                        </button>
                        <button onClick={() => setActiveTab('coaching')} className={tabClass('coaching')}>
                            <span>코칭 스태프</span>
                        </button>
                        <button onClick={() => setActiveTab('draftPicks')} className={tabClass('draftPicks')}>
                            <span>드래프트 픽</span>
                        </button>
                        <button onClick={() => setActiveTab('investment')} className={tabClass('investment')}>
                            <span>구단주 투자</span>
                            {investmentConfirmed === false && (
                                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    {activeTab === 'club' && finData && finance && (
                        <ClubTab finData={finData} finance={finance} myTeamId={myTeamId} />
                    )}
                    {activeTab === 'payroll' && (
                        <PayrollTab
                            team={team}
                            seasonShort={seasonShort}
                            myTeamId={myTeamId}
                            onViewPlayer={onViewPlayer}
                            teams={teams}
                            onReleasePlayer={onReleasePlayer}
                            onExtensionOffer={onExtensionOffer}
                            tendencySeed={tendencySeed}
                            currentSimDate={currentSimDate}
                            offseasonPhase={offseasonPhase}
                            initialNegotiateId={initialNegotiateId}
                            initialNegotiateType={initialNegotiateType}
                            coachingData={coachingData}
                            onExtendCoachAccepted={onExtendCoachAccepted}
                            onFireCoach={onFireCoach}
                            onCoachClick={onCoachClick}
                            userNickname={userNickname}
                        />
                    )}
                    {activeTab === 'coaching' && (() => {
                        const gm = leagueGMProfiles?.[team.id];
                        const staff = coachingData?.[team.id];
                        const simYear = parseInt(currentSimDate.slice(0, 4));
                        const thCls = 'px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap border-r border-slate-700';
                        const tdCls = 'px-4 py-1.5 text-xs whitespace-nowrap border-r border-slate-700';
                        return (
                            <div className="p-4 flex flex-col gap-4 animate-in fade-in duration-500">
                                {/* ── 단장 테이블 ── */}
                                <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                                    <WidgetHeader title="단장" primaryColor={primaryColor} />
                                    <div className="overflow-x-auto">
                                        <table className="w-full border-collapse text-xs">
                                            <thead>
                                                <tr className="bg-slate-800 border-b border-slate-700">
                                                    <th className={`${thCls} text-left sticky left-0 bg-slate-800 z-10`}>직무</th>
                                                    <th className={`${thCls} text-left`}>이름</th>
                                                    <th className={`${thCls} text-right`}>나이</th>
                                                    <th className={`${thCls} text-left`}>성격</th>
                                                    <th className={`${thCls} text-left`}>노선</th>
                                                    {GM_SLIDER_LABELS.map(([, label]) => (
                                                        <th key={label} className={`${thCls} text-right`}>{label}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {gm ? (
                                                    <tr className="group border-b border-slate-800 hover:bg-slate-800">
                                                        <td className={`${tdCls} text-slate-400 sticky left-0 bg-slate-900 group-hover:bg-slate-800 z-10`}>단장</td>
                                                        <td className={`${tdCls}`}>
                                                            <button
                                                                onClick={() => onGMClick?.(team.id)}
                                                                className="text-slate-200 hover:text-indigo-400 transition-colors font-semibold"
                                                            >
                                                                {gm.name}
                                                            </button>
                                                        </td>
                                                        <td className={`${tdCls} text-right font-mono tabular-nums text-slate-300`}>
                                                            {gm.birthYear ? simYear - gm.birthYear : '—'}
                                                        </td>
                                                        <td className={`${tdCls} text-slate-300`}>{GM_PERSONALITY_LABELS[gm.personalityType]}</td>
                                                        <td className={`${tdCls} text-slate-300`}>{DIRECTION_LABELS[gm.direction]}</td>
                                                        {GM_SLIDER_LABELS.map(([key]) => (
                                                            <td key={key} className={`${tdCls} text-right font-mono tabular-nums font-bold ${coachValColor((gm.sliders as any)[key] ?? 0)}`}>
                                                                {(gm.sliders as any)[key] ?? '—'}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ) : (
                                                    <tr>
                                                        <td colSpan={10} className="py-8 text-center text-slate-600 text-xs">단장 정보 없음</td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* ── 코칭 스태프 테이블 ── */}
                                <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                                    <div className="px-4 py-2 flex items-center justify-between flex-shrink-0" style={{ backgroundColor: primaryColor }}>
                                        <span className="text-sm font-bold text-white">코칭 스태프</span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full border-collapse text-xs">
                                            <thead>
                                                <tr className="bg-slate-800 border-b border-slate-700">
                                                    <th className={`${thCls} text-left sticky left-0 bg-slate-800 z-10`}>직무</th>
                                                    <th className={`${thCls} text-left`}>이름</th>
                                                    <th className={`${thCls} text-right`}>나이</th>
                                                    {COACH_ABILITY_LABELS.map(([, label]) => (
                                                        <th key={label} className={`${thCls} text-right`}>{label}</th>
                                                    ))}
                                                    <th className={`${thCls} text-right`}>계약</th>
                                                    <th className={`${thCls} text-right`}>연봉</th>
                                                    {(onExtendCoachAccepted || onFireCoach) && team.id === myTeamId && (
                                                        <th className="px-3 py-2 bg-slate-800" />
                                                    )}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {STAFF_ROLES.map(r => {
                                                    const coach = (staff as any)?.[r.key] as import('../types/coaching').Coach | undefined | null;
                                                    return (
                                                        <tr key={r.key} className="group border-b border-slate-800 hover:bg-slate-800">
                                                            <td className={`${tdCls} text-slate-400 sticky left-0 bg-slate-900 group-hover:bg-slate-800 z-10`}>{r.label}</td>
                                                            <td className={`${tdCls}`}>
                                                                {coach ? (
                                                                    <button
                                                                        onClick={() => onCoachClick?.(team.id, r.key)}
                                                                        className="text-slate-200 hover:text-indigo-400 transition-colors font-semibold"
                                                                    >
                                                                        {coach.name}
                                                                    </button>
                                                                ) : <span className="text-slate-700">—</span>}
                                                            </td>
                                                            <td className={`${tdCls} text-right font-mono tabular-nums ${coach ? 'text-slate-300' : 'text-slate-700'}`}>
                                                                {coach?.age ?? '—'}
                                                            </td>
                                                            {COACH_ABILITY_LABELS.map(([key]) => (
                                                                <td key={key} className={`${tdCls} text-center font-bold ${coach ? coachValColor(coach.abilities[key as keyof typeof coach.abilities] ?? 0) : 'text-slate-700'}`}>
                                                                    {coach ? coachAbilityLabel(coach.abilities[key as keyof typeof coach.abilities] ?? 0) : '—'}
                                                                </td>
                                                            ))}
                                                            <td className={`${tdCls} text-right font-mono tabular-nums ${coach ? 'text-slate-300' : 'text-slate-700'}`}>
                                                                {coach?.contractYears ? `${coach.contractYears}년` : '—'}
                                                            </td>
                                                            <td className={`${tdCls} text-right font-mono tabular-nums ${coach ? 'text-emerald-400' : 'text-slate-700'}`}>
                                                                {coach ? fmtSalary(coach.contractSalary) : '—'}
                                                            </td>
                                                            {(onExtendCoachAccepted || onFireCoach) && team.id === myTeamId && (
                                                                <td className="px-3 py-1.5 text-right whitespace-nowrap">
                                                                    {coach && (
                                                                        <div className="flex items-center justify-end gap-1.5">
                                                                            {onExtendCoachAccepted && (
                                                                                <button
                                                                                    onClick={() => setCoachingTabExtNeg({ role: r.key, coach })}
                                                                                    className="px-2 py-0.5 rounded text-xs font-bold transition-opacity"
                                                                                    style={{ backgroundColor: primaryColor, color: textColor }}
                                                                                >
                                                                                    연장
                                                                                </button>
                                                                            )}
                                                                            {onFireCoach && (
                                                                                <button
                                                                                    onClick={() => setCoachingTabFireTarget({ role: r.key, coach })}
                                                                                    className="px-2 py-0.5 rounded text-xs font-bold transition-opacity"
                                                                                    style={{ backgroundColor: primaryColor, color: textColor }}
                                                                                >
                                                                                    해고
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                            )}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                    {activeTab === 'draftPicks' && (
                        <DraftPicksPanel teamId={myTeamId} leaguePickAssets={leaguePickAssets} primaryColor={primaryColor} />
                    )}
                    {activeTab === 'investment' && (
                        <div className="p-6 flex flex-col gap-4 animate-in fade-in duration-500">
                            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                                <div className="text-xs font-black text-white uppercase tracking-widest mb-3">
                                    구단주 투자 현황
                                </div>
                                {finData ? (
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-slate-400">배분 상태</span>
                                            <span className={investmentConfirmed ? 'text-green-400' : 'text-yellow-400'}>
                                                {investmentConfirmed ? '배분 완료' : '미배분'}
                                            </span>
                                        </div>
                                        {!investmentConfirmed && (
                                            <button
                                                onClick={onInvestmentTabOpen}
                                                className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-lg transition-colors text-sm"
                                            >
                                                지금 배분하기
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="text-slate-500 text-sm">재정 데이터를 불러올 수 없습니다.</div>
                                )}
                            </div>
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

        {/* 코칭 탭 — 코치 연장 협상 */}
        {coachingTabExtNeg && onExtendCoachAccepted && (
            <CoachNegotiationScreen
                coach={coachingTabExtNeg.coach}
                role={coachingTabExtNeg.role}
                negotiationType="extension"
                myTeam={team}
                userNickname={userNickname}
                onClose={() => setCoachingTabExtNeg(null)}
                onAccept={(finalSalary, finalYears) => {
                    onExtendCoachAccepted(coachingTabExtNeg.role, finalSalary, finalYears);
                }}
            />
        )}

        {/* 코칭 탭 — 코치 해고 */}
        {coachingTabFireTarget && onFireCoach && (
            <NegotiationScreen
                negotiationType="release"
                coach={coachingTabFireTarget.coach}
                coachRole={coachingTabFireTarget.role}
                myTeam={team}
                teams={teams}
                tendencySeed={tendencySeed ?? ''}
                currentSeasonYear={new Date(currentSimDate).getFullYear()}
                currentSeason={seasonShort ?? ''}
                usedMLE={{}}
                onClose={() => setCoachingTabFireTarget(null)}
                onFireCoach={(role, buyoutAmount) => {
                    onFireCoach(role, buyoutAmount);
                    setCoachingTabFireTarget(null);
                }}
            />
        )}
        </>
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

// ── 달러 → 약식 M 표기 ──
function fmtM(v: number): string {
    return `$${(v / 1_000_000).toFixed(1)}M`;
}

// ── 캡 기준선 바 시각화 ──
const CAP_BAR_MIN = 120_000_000;
const CAP_BAR_MAX = 215_000_000;
const toBarPct = (v: number) =>
    Math.min(100, Math.max(0, ((v - CAP_BAR_MIN) / (CAP_BAR_MAX - CAP_BAR_MIN)) * 100));

const CapBar: React.FC<{ payroll: number }> = ({ payroll }) => {
    const { SALARY_FLOOR, SALARY_CAP, TAX_LEVEL, FIRST_APRON, SECOND_APRON } = LEAGUE_FINANCIALS;
    const pct = toBarPct(payroll);

    const barColor =
        payroll < SALARY_FLOOR  ? '#64748b'
        : payroll < SALARY_CAP  ? '#10b981'
        : payroll < TAX_LEVEL   ? '#f59e0b'
        : payroll < FIRST_APRON ? '#f97316'
        : payroll < SECOND_APRON ? '#ef4444'
        : '#991b1b';

    const thresholds = [
        { v: SALARY_FLOOR, label: 'Floor', color: '#64748b' },
        { v: SALARY_CAP,   label: 'Cap',   color: '#10b981' },
        { v: TAX_LEVEL,    label: 'Tax',   color: '#f59e0b' },
        { v: FIRST_APRON,  label: '1st',   color: '#f97316' },
        { v: SECOND_APRON, label: '2nd',   color: '#ef4444' },
    ];

    return (
        <div className="px-4 py-3">
            {/* 바 트랙 + 커서를 감싸는 상대 레이어 */}
            <div className="relative">
                {/* overflow-hidden 트랙: fill 클리핑 */}
                <div className="relative h-3 bg-slate-700 rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: barColor }}
                    />
                    {thresholds.map(t => (
                        <div
                            key={t.label}
                            className="absolute inset-y-0 w-px"
                            style={{ left: `${toBarPct(t.v)}%`, backgroundColor: t.color, opacity: 0.9 }}
                        />
                    ))}
                </div>
                {/* 커서: 트랙 바깥에서 absolute → fill 끝과 정확히 일치 */}
                <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-white bg-slate-900 z-10"
                    style={{ left: `${pct}%` }}
                />
            </div>
            {/* 기준선 티커 */}
            <div className="relative h-4 mt-0.5">
                {thresholds.map(t => (
                    <div
                        key={t.label}
                        className="absolute -translate-x-1/2"
                        style={{ left: `${toBarPct(t.v)}%` }}
                    >
                        <span className="text-[10px] font-bold whitespace-nowrap" style={{ color: t.color }}>
                            {t.label}
                        </span>
                    </div>
                ))}
            </div>
            {/* 금액 범례 */}
            <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1">
                {thresholds.map(t => (
                    <div key={t.label} className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">{t.label} {fmtM(t.v)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ── 캡 우측 위젯 전체 ──
const CapSidePanel: React.FC<{ team: Team; primaryColor: string; seasonShort: string }> = ({ team, primaryColor, seasonShort }) => {
    const { SALARY_FLOOR, SALARY_CAP, TAX_LEVEL, FIRST_APRON, SECOND_APRON } = LEAGUE_FINANCIALS;

    const payroll = calcTeamPayroll(team);
    const luxTax = calculateLuxuryTax(payroll, TAX_LEVEL);
    const deadMoney: DeadMoneyEntry[] = team.deadMoney ?? [];
    const deadTotal = deadMoney.reduce((s, d) => s + d.amount, 0);

    const capSpace   = SALARY_CAP - payroll;
    const floorShort = SALARY_FLOOR - payroll;

    // 현재 구간 라벨·색상
    const zoneLabel = payroll < SALARY_FLOOR  ? '플로어 미달'
                    : payroll < SALARY_CAP    ? '캡 스페이스'
                    : payroll < TAX_LEVEL     ? '캡 초과 (비과세)'
                    : payroll < FIRST_APRON   ? '럭셔리 택스 납부'
                    : payroll < SECOND_APRON  ? '1차 에이프런 초과'
                    : '2차 에이프런 초과';
    const zoneColor = payroll < SALARY_FLOOR  ? 'text-slate-400'
                    : payroll < SALARY_CAP    ? 'text-emerald-400'
                    : payroll < TAX_LEVEL     ? 'text-yellow-400'
                    : payroll < FIRST_APRON   ? 'text-orange-400'
                    : 'text-red-400';

    // 캡 스페이스: 양수=여유(초록), 음수=초과(빨강)
    const capSpaceVal = capSpace >= 0
        ? <span className="font-bold font-mono tabular-nums text-emerald-400">+{fmtM(capSpace)}</span>
        : <span className="font-bold font-mono tabular-nums text-red-400">{fmtM(Math.abs(capSpace))} 초과</span>;

    // 럭셔리 택스·에이프런: 미만=여유(초록), 초과=초과분(오렌지/빨강)
    const thresholdVal = (threshold: number, overColor: string) => {
        const diff = payroll - threshold;
        return diff >= 0
            ? <span className={`font-bold font-mono tabular-nums ${overColor}`}>{fmtM(diff)} 초과</span>
            : <span className="font-bold font-mono tabular-nums text-emerald-400">{fmtM(-diff)} 미만</span>;
    };

    const releaseLabel: Record<string, string> = {
        waive: 'Waive', buyout: 'Buyout', stretch: 'Stretch',
    };

    return (
        <div className="flex flex-col gap-4">

            {/* ① 캡 현황 */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                <WidgetHeader title="샐러리 캡 현황" primaryColor={primaryColor} />
                <DataRow label="총 페이롤" value={<span className={`font-bold font-mono tabular-nums ${zoneColor}`}>{fmtM(payroll)}</span>} />
                <DataRow label="구간" value={<span className={zoneColor}>{zoneLabel}</span>} />
                <DataRow label="캡 스페이스" value={capSpaceVal} />
                <DataRow label="럭셔리 택스" value={thresholdVal(TAX_LEVEL, 'text-orange-400')} />
                <DataRow label="1차 에이프런" value={thresholdVal(FIRST_APRON, 'text-red-400')} />
                <DataRow label="2차 에이프런" value={thresholdVal(SECOND_APRON, 'text-red-500')} />
                {payroll >= TAX_LEVEL && (
                    <DataRow
                        label="예상 럭셔리 택스"
                        value={<span className="font-bold font-mono tabular-nums text-red-400">{fmtM(luxTax)}</span>}
                    />
                )}
                <DataRow
                    label="샐러리 플로어"
                    value={floorShort > 0
                        ? <span className="font-bold font-mono tabular-nums text-slate-400">{fmtM(floorShort)} 미달</span>
                        : <span className="font-bold text-emerald-400">충족</span>
                    }
                />
                <div className="border-t border-slate-800">
                    <CapBar payroll={payroll} />
                </div>
            </div>

            {/* ③ 서명 예외 가용 여부 */}
            {(() => {
                const { SALARY_CAP, TAX_LEVEL, FIRST_APRON, SECOND_APRON } = LEAGUE_FINANCIALS;
                const { NON_TAX_MLE, TAXPAYER_MLE, BAE } = SIGNING_EXCEPTIONS;
                const currentSeasonStartYear = parseInt(seasonShort?.split('-')[0] ?? '2025');
                const baeUsedThisSeason = (team as any).usedBAEyear === currentSeasonStartYear;

                const hasNonTaxMLE  = payroll < FIRST_APRON;
                const hasTaxMLE     = payroll >= FIRST_APRON && payroll < SECOND_APRON;
                const hasBAE        = payroll < TAX_LEVEL && !baeUsedThisSeason;
                const hasRoomEx     = payroll < SALARY_CAP;
                const roomAmount    = Math.max(0, SALARY_CAP - payroll);

                const rows = [
                    {
                        label: '논택스 MLE',
                        available: hasNonTaxMLE,
                        detail: hasNonTaxMLE ? `${fmtM(NON_TAX_MLE)} · 최대 4년` : '1차 에이프런 초과',
                        note: '1차 에이프런 미만 팀',
                    },
                    {
                        label: '택스페이어 MLE',
                        available: hasTaxMLE,
                        detail: hasTaxMLE ? `${fmtM(TAXPAYER_MLE)} · 최대 2년` : (payroll < FIRST_APRON ? '논택스 MLE 적용' : '2차 에이프런 초과'),
                        note: '1차~2차 에이프런 사이',
                    },
                    {
                        label: '바이어뉴얼 (BAE)',
                        available: hasBAE,
                        detail: hasBAE ? `${fmtM(BAE)} · 최대 2년` : (payroll >= TAX_LEVEL ? '납세자 팀 불가' : '이미 사용됨'),
                        note: '비납세자 · 격년 1회',
                    },
                    {
                        label: '룸 익셉션',
                        available: hasRoomEx,
                        detail: hasRoomEx ? `${fmtM(roomAmount)} (잔여 캡)` : '캡 초과',
                        note: '캡 스페이스 팀만',
                    },
                ];

                return (
                    <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                        <WidgetHeader title="예외 조항 현황" primaryColor={primaryColor} />
                        {rows.map(row => (
                            <div key={row.label} className="flex items-center justify-between px-4 py-1.5 text-xs border-b border-slate-800 last:border-0">
                                <span className="text-slate-300">{row.label}</span>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className="font-mono text-slate-400 whitespace-nowrap">{row.detail}</span>
                                    <span className={`font-bold ${row.available ? 'text-emerald-400' : 'text-slate-500'}`}>
                                        {row.available ? '가용' : '불가'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                );
            })()}
        </div>
    );
};

// ── 코칭 탭 상수 ──
const COACH_ABILITY_LABELS: [string, string][] = [
    ['teaching', '지도'], ['schemeDepth', '전술'], ['communication', '소통'],
    ['playerEval', '평가'], ['motivation', '동기'], ['playerRelation', '관계'],
    ['adaptability', '적응'], ['developmentVision', '성장'], ['experienceTransfer', '경험'],
    ['mentalCoaching', '멘탈'], ['athleticTraining', '신체'], ['recovery', '회복'],
    ['conditioning', '컨디션'],
];
const GM_SLIDER_LABELS: [string, string][] = [
    ['aggressiveness', '공격성'], ['starWillingness', '스타'], ['youthBias', '유스'],
    ['riskTolerance', '리스크'], ['pickWillingness', '픽'],
];
const coachValColor = coachAbilityColor;

// ── 선수 급여 탭 ──
const STAFF_ROLES: { key: 'headCoach' | 'offenseCoordinator' | 'defenseCoordinator' | 'developmentCoach' | 'trainingCoach'; label: string }[] = [
    { key: 'headCoach',          label: '감독'    },
    { key: 'offenseCoordinator', label: '공격코치' },
    { key: 'defenseCoordinator', label: '수비코치' },
    { key: 'developmentCoach',   label: '디벨롭'  },
    { key: 'trainingCoach',      label: '트레이너' },
];

const PayrollTab: React.FC<{
    team: Team;
    seasonShort: string;
    myTeamId: string;
    onViewPlayer?: (player: Player, teamId?: string, teamName?: string) => void;
    teams?: Team[];
    onReleasePlayer?: (playerId: string, releaseType: ReleaseType, buyoutAmount?: number) => void;
    onExtensionOffer?: (playerId: string, contract: PlayerContract) => void;
    tendencySeed?: string;
    currentSimDate?: string;
    offseasonPhase?: OffseasonPhase;
    initialNegotiateId?: string;
    initialNegotiateType?: 'extension' | 'release';
    coachingData?: LeagueCoachingData | null;
    onExtendCoachAccepted?: (role: StaffRole, salary: number, years: number) => void;
    onFireCoach?: (role: StaffRole, buyoutAmount: number) => void;
    onCoachClick?: (teamId: string, role?: StaffRole) => void;
    userNickname?: string;
}> = ({ team, seasonShort, myTeamId, onViewPlayer, teams = [], onReleasePlayer, onExtensionOffer, tendencySeed = '', currentSimDate = '', offseasonPhase, initialNegotiateId, initialNegotiateType, coachingData, onExtendCoachAccepted, onFireCoach, onCoachClick, userNickname }) => {
    const primaryColor = TEAM_DATA[myTeamId]?.colors?.primary ?? '#4f46e5';
    const textColor = TEAM_DATA[myTeamId]?.colors?.text ?? '#FFFFFF';
    const teamName = TEAM_DATA[myTeamId] ? `${TEAM_DATA[myTeamId].city} ${TEAM_DATA[myTeamId].name}` : team.name;

    const [negotiationTarget, setNegotiationTarget] = useState<{ type: 'extension' | 'release'; playerId: string } | null>(null);
    const [blockedNegotiationIds, setBlockedNegotiationIds] = useState<Set<string>>(new Set());
    const [cooldownMap, setCooldownMap] = useState<Record<string, string>>({});
    const [extNegStates, setExtNegStates] = useState<Record<string, NegotiationState>>({});
    const [coachExtNeg, setCoachExtNeg] = useState<{ role: StaffRole; coach: Coach } | null>(null);
    const [coachFireTarget, setCoachFireTarget] = useState<{ role: StaffRole; coach: Coach } | null>(null);

    useEffect(() => {
        if (initialNegotiateId && initialNegotiateType) {
            setNegotiationTarget({ type: initialNegotiateType, playerId: initialNegotiateId });
        }
    }, [initialNegotiateId, initialNegotiateType]);

    const ntPlayer = negotiationTarget ? team.roster.find(p => p.id === negotiationTarget.playerId) ?? null : null;
    const showActions = !!(onReleasePlayer && onExtensionOffer);

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

        // 데드캡도 합계에 포함 (스트레치는 해당 연도 전체에 반영)
        for (const d of (team.deadMoney ?? [])) {
            if (d.releaseType === 'stretch' && d.stretchYearsTotal) {
                const startYear = parseInt(d.season);
                for (let y = startYear; y < startYear + d.stretchYearsTotal; y++) {
                    const ci = cols.indexOf(`${y}-${String(y + 1).slice(-2)}`);
                    if (ci >= 0) colTotals[ci] += d.amount;
                }
            } else {
                const ci = cols.indexOf(d.season);
                if (ci >= 0) colTotals[ci] += d.amount;
            }
        }

        return { players: sorted, seasonColumns: cols, totals: colTotals };
    }, [team.roster, team.deadMoney, seasonShort]);

    const { staffRows, staffTotals } = useMemo(() => {
        const staff = coachingData?.[team.id];
        const baseYear = seasonShort ? parseInt(seasonShort) : 2025;
        const colCount = 6;
        const colTotals = new Array(colCount).fill(0);

        const rows = STAFF_ROLES.map(r => {
            const coach = staff?.[r.key];
            const salary = coach?.contractSalary ?? 0;
            const yearsRemaining = coach?.contractYearsRemaining ?? 0;
            const salaries: (number | null)[] = Array.from({ length: colCount }, (_, i) =>
                coach && i < yearsRemaining ? salary : null
            );
            salaries.forEach((s, i) => { if (s) colTotals[i] += s; });
            return { key: r.key, label: r.label, name: coach?.name ?? null, salaries };
        });

        return { staffRows: rows, staffTotals: colTotals };
    }, [coachingData, team.id, seasonShort]);

    // 이름 컬럼 너비: 가장 긴 이름에서 동적 계산 (한글 ~15px/글자 + 패딩)
    const nameColWidth = useMemo(() => {
        const maxLen = Math.max(...players.map(p => p.name.length), 2);
        return maxLen * 15 + 32;
    }, [players]);
    const actionColWidth = 110;
    const seasonColWidth = `calc((100% - ${nameColWidth}px - ${showActions ? actionColWidth : 0}px) / ${seasonColumns.length})`;

    return (
        <div className="p-4 animate-in fade-in duration-500 flex gap-4 items-start">
            {/* 좌: 선수 급여 + 코칭스태프 급여 (세로 스택) */}
            <div className="flex-[7] min-w-0 flex flex-col gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                <WidgetHeader title="선수 급여" primaryColor={primaryColor} />
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs table-fixed">
                        <colgroup>
                            <col style={{ width: `${nameColWidth}px` }} />
                            {seasonColumns.map((_, i) => <col key={i} style={{ width: seasonColWidth }} />)}
                            {showActions && <col style={{ width: `${actionColWidth}px` }} />}
                        </colgroup>
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-slate-800 border-b border-slate-700">
                                <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-400 sticky left-0 bg-slate-800 z-20 whitespace-nowrap border-r border-slate-700">선수</th>
                                {seasonColumns.map(col => (
                                    <th key={col} className="px-4 py-2 text-right text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap border-r border-slate-700">{col}</th>
                                ))}
                                {showActions && <th className="px-3 py-2" />}
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
                                    onExtension={showActions ? (id) => {
                                        if (!blockedNegotiationIds.has(id)) setNegotiationTarget({ type: 'extension', playerId: id });
                                    } : undefined}
                                    onRelease={showActions ? (id) => setNegotiationTarget({ type: 'release', playerId: id }) : undefined}
                                    isExtensionBlocked={blockedNegotiationIds.has(p.id)}
                                    primaryColor={primaryColor}
                                    textColor={textColor}
                                />
                            ))}
                            {(team.deadMoney ?? []).length > 0 && (
                                <>
                                    {(team.deadMoney ?? []).map((d, i) => {
                                        const startYear = parseInt(d.season);
                                        const activeColSet = new Set<number>();
                                        if (d.releaseType === 'stretch' && d.stretchYearsTotal) {
                                            for (let y = startYear; y < startYear + d.stretchYearsTotal; y++) {
                                                const ci = seasonColumns.indexOf(`${y}-${String(y + 1).slice(-2)}`);
                                                if (ci >= 0) activeColSet.add(ci);
                                            }
                                        } else {
                                            const ci = seasonColumns.indexOf(d.season);
                                            if (ci >= 0) activeColSet.add(ci);
                                        }
                                        return (
                                            <tr key={i} className="group border-b border-slate-800">
                                                <td className="px-4 py-1.5 text-xs text-slate-400 italic sticky left-0 bg-slate-900 z-10 whitespace-nowrap border-r border-slate-700">
                                                    {d.playerName}
                                                </td>
                                                {seasonColumns.map((_, ci) => (
                                                    <td key={ci} className={`px-4 py-1.5 text-right text-xs font-mono tabular-nums italic whitespace-nowrap border-r border-slate-700 ${activeColSet.has(ci) ? 'text-slate-300' : 'text-slate-700'}`}>
                                                        {activeColSet.has(ci) ? fmtSalary(d.amount) : '-'}
                                                    </td>
                                                ))}
                                                {showActions && <td className="px-3 py-1.5" />}
                                            </tr>
                                        );
                                    })}
                                </>
                            )}
                            <tr className="bg-slate-800 border-t-2 border-slate-700">
                                <td className="px-4 py-2 text-xs font-bold text-white sticky left-0 bg-slate-800 z-10 whitespace-nowrap border-r border-slate-700">합계</td>
                                {totals.map((t, i) => (
                                    <td key={i} className="px-4 py-2 text-right text-xs font-bold font-mono tabular-nums text-white whitespace-nowrap border-r border-slate-700">
                                        {t > 0 ? fmtSalary(t) : ''}
                                    </td>
                                ))}
                                {showActions && <td className="px-3 py-1.5" />}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            {/* 코칭스태프 급여 테이블 */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                <WidgetHeader title="코칭스태프 급여" primaryColor={primaryColor} />
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs table-fixed">
                        <colgroup>
                            <col style={{ width: `${nameColWidth}px` }} />
                            {seasonColumns.map((_, i) => <col key={i} style={{ width: seasonColWidth }} />)}
                            {(onExtendCoachAccepted || onFireCoach) && <col style={{ width: `${actionColWidth}px` }} />}
                        </colgroup>
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-slate-800 border-b border-slate-700">
                                <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-400 sticky left-0 bg-slate-800 z-20 whitespace-nowrap border-r border-slate-700">코치</th>
                                {seasonColumns.map(col => (
                                    <th key={col} className="px-4 py-2 text-right text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap border-r border-slate-700">{col}</th>
                                ))}
                                {(onExtendCoachAccepted || onFireCoach) && <th className="px-3 py-2" />}
                            </tr>
                        </thead>
                        <tbody>
                            {staffRows.filter(r => r.name !== null).map(r => (
                                <tr key={r.key} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                                    <td className="px-4 py-2 sticky left-0 bg-slate-900 hover:bg-slate-800/50 z-10 border-r border-slate-700 whitespace-nowrap">
                                        <button
                                            className="text-xs font-semibold text-slate-200 hover:text-indigo-400 transition-colors text-left"
                                            onClick={() => onCoachClick?.(myTeamId, r.key as StaffRole)}
                                        >
                                            {r.name}
                                        </button>
                                    </td>
                                    {r.salaries.map((s, i) => (
                                        <td key={i} className="px-4 py-2 text-right text-xs font-mono tabular-nums text-slate-300 whitespace-nowrap border-r border-slate-700">
                                            {s !== null ? fmtSalary(s) : <span className="text-slate-700">–</span>}
                                        </td>
                                    ))}
                                    {(onExtendCoachAccepted || onFireCoach) && (
                                        <td className="px-3 py-1.5 text-right whitespace-nowrap">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {onExtendCoachAccepted && (
                                                    <button
                                                        onClick={() => {
                                                            const coach = (coachingData?.[myTeamId] as any)?.[r.key] as Coach | undefined;
                                                            if (coach) {
                                                                setCoachExtNeg({
                                                                    role: r.key as StaffRole,
                                                                    coach,
                                                                });
                                                            }
                                                        }}
                                                        className="px-2 py-0.5 rounded text-xs font-bold transition-opacity"
                                                        style={{ backgroundColor: primaryColor, color: textColor }}
                                                    >
                                                        연장
                                                    </button>
                                                )}
                                                {onFireCoach && (
                                                    <button
                                                        onClick={() => {
                                                            const coach = (coachingData?.[myTeamId] as any)?.[r.key] as Coach | undefined;
                                                            if (coach) setCoachFireTarget({ role: r.key as StaffRole, coach });
                                                        }}
                                                        className="px-2 py-0.5 rounded text-xs font-bold transition-opacity"
                                                        style={{ backgroundColor: primaryColor, color: textColor }}
                                                    >
                                                        해고
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))}
                            <tr className="bg-slate-800 border-t-2 border-slate-700">
                                <td className="px-4 py-2 text-xs font-bold text-white sticky left-0 bg-slate-800 z-10 whitespace-nowrap border-r border-slate-700">합계</td>
                                {staffTotals.map((t, i) => (
                                    <td key={i} className="px-4 py-2 text-right text-xs font-bold font-mono tabular-nums text-white whitespace-nowrap border-r border-slate-700">
                                        {t > 0 ? fmtSalary(t) : ''}
                                    </td>
                                ))}
                                {(onExtendCoachAccepted || onFireCoach) && <td />}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            </div>{/* 좌측 스택 닫기 */}
            {/* 우: 샐러리 캡 패널 */}
            <div className="flex-[3] min-w-0">
                <CapSidePanel team={team} primaryColor={primaryColor} seasonShort={seasonShort} />
            </div>

            {/* 코치 연장 협상 화면 */}
            {coachExtNeg && onExtendCoachAccepted && (
                <CoachNegotiationScreen
                    coach={coachExtNeg.coach}
                    role={coachExtNeg.role}
                    negotiationType="extension"
                    myTeam={team}
                    userNickname={userNickname}
                    onClose={() => setCoachExtNeg(null)}
                    onAccept={(finalSalary, finalYears) => {
                        onExtendCoachAccepted(coachExtNeg.role, finalSalary, finalYears);
                    }}
                />
            )}

            {/* 코치 해고 화면 */}
            {coachFireTarget && onFireCoach && (
                <NegotiationScreen
                    negotiationType="release"
                    coach={coachFireTarget.coach}
                    coachRole={coachFireTarget.role}
                    myTeam={team}
                    teams={teams}
                    tendencySeed={tendencySeed ?? ''}
                    currentSeasonYear={new Date(currentSimDate).getFullYear()}
                    currentSeason={seasonShort ?? ''}
                    usedMLE={{}}
                    onClose={() => setCoachFireTarget(null)}
                    onFireCoach={(role, buyoutAmount) => {
                        onFireCoach(role, buyoutAmount);
                        setCoachFireTarget(null);
                    }}
                />
            )}

            {/* NegotiationScreen 오버레이 */}
            {negotiationTarget && ntPlayer && onReleasePlayer && onExtensionOffer && (
                <NegotiationScreen
                    negotiationType={negotiationTarget.type}
                    player={ntPlayer}
                    myTeam={team}
                    teams={teams}
                    tendencySeed={tendencySeed}
                    currentSeasonYear={new Date(currentSimDate).getFullYear()}
                    currentSeason={seasonShort}
                    usedMLE={{}}
                    extensionNotYet={
                        negotiationTarget.type === 'extension' &&
                        (ntPlayer.contract ? ntPlayer.contract.years.length - (ntPlayer.contract.currentYear ?? 0) : 0) > 1
                    }
                    onClose={() => setNegotiationTarget(null)}
                    onExtensionSigned={(playerId, contract) => { onExtensionOffer(playerId, contract); }}
                    onNegotiationBlocked={(playerId) => { setBlockedNegotiationIds(prev => new Set([...prev, playerId])); }}
                    onCooldownStarted={(playerId, nextOfferDate) => { setCooldownMap(prev => ({ ...prev, [playerId]: nextOfferDate })); }}
                    onNegStateChange={(playerId, state) => { setExtNegStates(prev => ({ ...prev, [playerId]: state })); }}
                    persistedNegState={extNegStates[negotiationTarget.playerId]}
                    currentDate={currentSimDate}
                    cooldownNextDate={cooldownMap[negotiationTarget.playerId]}
                    onReleasePlayer={onReleasePlayer}
                    onViewPlayer={onViewPlayer ? (p) => onViewPlayer(p, myTeamId, teamName) : undefined}
                />
            )}
        </div>
    );
};

const PayrollRow: React.FC<{
    player: Player;
    seasonColumns: string[];
    myTeamId: string;
    teamName: string;
    onViewPlayer?: (player: Player, teamId?: string, teamName?: string) => void;
    onExtension?: (playerId: string) => void;
    onRelease?: (playerId: string) => void;
    isExtensionBlocked?: boolean;
    primaryColor?: string;
    textColor?: string;
}> = ({ player, seasonColumns, myTeamId, teamName, onViewPlayer, onExtension, onRelease, isExtensionBlocked, primaryColor = '#4f46e5', textColor = '#FFFFFF' }) => {
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
            <td className="px-4 py-1.5 text-xs text-slate-200 sticky left-0 bg-slate-900 group-hover:bg-slate-800 z-10 whitespace-nowrap border-r border-slate-700">
                {onViewPlayer ? (
                    <button
                        onClick={() => onViewPlayer(player, myTeamId, teamName)}
                        className="hover:text-indigo-400 transition-colors text-left"
                    >
                        {player.name}
                    </button>
                ) : player.name}
            </td>
            {cells.map((cell, i) => (
                <td key={i} className={`px-4 py-1.5 text-right text-xs font-mono tabular-nums whitespace-nowrap border-r border-slate-700 ${cell ? 'text-slate-300' : 'text-slate-700'}`}>
                    {cell ?? '-'}
                </td>
            ))}
            {(onExtension || onRelease) && (
                <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                        {onExtension && (
                            <button
                                onClick={() => onExtension(player.id)}
                                disabled={isExtensionBlocked}
                                className="px-2 py-0.5 rounded text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                                style={{ backgroundColor: primaryColor, color: textColor }}
                            >
                                연장
                            </button>
                        )}
                        {onRelease && (
                            <button
                                onClick={() => onRelease(player.id)}
                                className="px-2 py-0.5 rounded text-xs font-bold transition-opacity"
                                style={{ backgroundColor: primaryColor, color: textColor }}
                            >
                                방출
                            </button>
                        )}
                    </div>
                </td>
            )}
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

/** 실제 달러 값을 $B/$M 단위로 표기 (예: 13400000000 → $13.4B) */
function fmtFullB(v: number): string {
    if (v >= 1_000_000_000) {
        const b = v / 1_000_000_000;
        const formatted = b % 1 === 0 ? b.toString() : parseFloat(b.toFixed(2)).toString();
        return `$${formatted}B`;
    }
    if (v >= 1_000_000) {
        const m = v / 1_000_000;
        const formatted = m % 1 === 0 ? m.toString() : parseFloat(m.toFixed(1)).toString();
        return `$${formatted}M`;
    }
    return `$${v.toLocaleString()}`;
}

