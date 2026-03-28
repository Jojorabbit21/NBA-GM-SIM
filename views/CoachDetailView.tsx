
import React, { useEffect, useRef, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import {
    Coach,
    HeadCoach,
    LeagueCoachingData,
    CoachingStaff,
    CoachAbilities,
    StaffRole,
} from '../types/coaching';
import { Team } from '../types';
import { TEAM_DATA } from '../data/teamData';
import { getTeamTheme } from '../utils/teamTheme';
import { getTeamLogoUrl } from '../utils/constants';
import { coachAbilityLabel, coachAbilityColor, coachAbilityBarColor } from '../utils/coachAbility';
import { formatMoney } from '../utils/formatMoney';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/common/Table';

interface CoachDetailViewProps {
    coach: HeadCoach;
    teamId: string;
    onBack: () => void;
    coachingData?: LeagueCoachingData;
    allTeams?: Team[];
    staffData?: CoachingStaff;
    initialRole?: StaffRole;
}

// ── 선호 축별 전술 용어 매핑 (값 → 짧은 자연어) ──
export type PrefKey = keyof HeadCoach['preferences'];

export interface PrefAxis {
    label: string;
    group: 'offense' | 'defense';
    color: string;
    /** 값 범위별 [태그, 한 줄 설명] */
    tiers: [number, string, string][];  // [최대값, 태그, 설명]
}

export const PREF_AXES: Record<PrefKey, PrefAxis> = {
    offenseIdentity: {
        label: '공격 체계',
        group: 'offense',
        color: 'text-indigo-400',
        tiers: [
            [2,  '프리랜스',         '에이스의 즉흥 플레이에 의존하는 히어로볼 성향'],
            [4,  '스타 중심',        '에이스에게 높은 자유도를 주되 최소한의 세트 플레이 병행'],
            [6,  '하이브리드',       '개인기와 팀 플레이를 상황에 따라 혼용'],
            [8,  '모션 오펜스',      '볼 무브먼트 기반의 체계적인 팀 오펜스 운영'],
            [10, '시스템 농구',      '누가 뛰든 동일한 원칙이 적용되는 전원 참여형 오펜스'],
        ],
    },
    tempo: {
        label: '경기 템포',
        group: 'offense',
        color: 'text-emerald-400',
        tiers: [
            [2,  '그라인드',         '포제션을 끝까지 활용하는 하프코트 중심의 느린 페이스'],
            [4,  '슬로우 페이스',    '급하지 않게 좋은 슛 기회를 만들어내는 데 집중'],
            [6,  '밸런스 템포',      '흐름에 따라 유연하게 속도를 조절'],
            [8,  '업템포',           '빠른 전환 공격과 얼리 오펜스를 적극 활용'],
            [10, '런앤건',           '세컨더리 브레이크까지 쉬지 않고 달리는 초고속 농구'],
        ],
    },
    scoringFocus: {
        label: '득점 방식',
        group: 'offense',
        color: 'text-amber-400',
        tiers: [
            [2,  '인사이드 헤비',    '림 어택과 포스트업이 주 무기, 외곽은 보조 수단'],
            [4,  '페인트 존 중심',   '안쪽 공략에 무게를 두되 오픈 3점은 허용'],
            [6,  '밸런스',           '인사이드·미드레인지·3점을 고루 분배'],
            [8,  '스페이싱 중시',    '플로어를 넓히고 3점 기회를 만드는 현대 농구 지향'],
            [10, '3점 헤비',         '극단적인 3점 볼륨, 코너·윙 슈터 확보가 최우선'],
        ],
    },
    pnrEmphasis: {
        label: '주요 플레이 타입',
        group: 'offense',
        color: 'text-cyan-400',
        tiers: [
            [2,  'ISO / 포스트업',   '스크린 없이 개인 돌파와 로우포스트로 승부'],
            [4,  '개인기 중심',      '1:1 무브를 앞세우되 간헐적으로 스크린 활용'],
            [6,  '혼합형',           '아이솔레이션·픽앤롤·핸드오프 등 다양한 액션 혼용'],
            [8,  '픽앤롤 중심',      '볼 핸들러-빅맨 투맨 게임을 핵심 무기로 운용'],
            [10, 'PnR 헤비',         '거의 모든 플레이가 스크린에서 시작되는 PnR 의존형'],
        ],
    },
    defenseStyle: {
        label: '수비 압박',
        group: 'defense',
        color: 'text-rose-400',
        tiers: [
            [2,  '드롭 커버리지',    '포지션을 유지하며 실수를 줄이는 보수적 셸 디펜스'],
            [4,  '컨서버티브',       '무리하지 않는 안정적 수비, 파울 관리 우선'],
            [6,  '상황 대응형',      '상대 스타일에 따라 압박 강도를 유연하게 조절'],
            [8,  '하이 프레셔',      '볼 핸들러에 강한 압박, 패싱 레인 차단 적극 시도'],
            [10, '블리츠 / 트래핑',  '풀코트까지 압박하며 턴오버를 강제하는 공격적 수비'],
        ],
    },
    helpScheme: {
        label: '헬프 스킴',
        group: 'defense',
        color: 'text-purple-400',
        tiers: [
            [2,  '스위치 올',        '맡은 선수를 끝까지 따라가며 개인 수비 책임 강조'],
            [4,  '제한적 헬프',      '1:1 수비 기본, 페인트 침투 시에만 최소한 헬프'],
            [6,  '밸런스 스킴',      '개인 수비와 팀 로테이션을 상황에 맞게 혼용'],
            [8,  '팀 로테이션',      '약한 쪽 헬프를 적극적으로 보내는 조직적 수비'],
            [10, '풀 로테이션',      '팀 전체가 유기체처럼 움직이는 시스템 수비'],
        ],
    },
    zonePreference: {
        label: '존 디펜스',
        group: 'defense',
        color: 'text-yellow-400',
        tiers: [
            [2,  '순수 대인',        '존 디펜스를 거의 사용하지 않는 대인 수비 고집'],
            [4,  '대인 기본',        '대인 수비 중심, 극히 드물게 변칙 존 활용'],
            [6,  '대인-존 혼용',     '상대 라인업에 따라 대인과 존을 유연하게 전환'],
            [8,  '존 다용',          '매치업 불리를 숨기거나 페이스 조절용으로 존을 자주 활용'],
            [10, '존 중심',          '존을 기본 세팅으로 가져가는 드문 스타일'],
        ],
    },
};

export function getAxisResult(axis: PrefAxis, val: number): { tag: string; desc: string } {
    for (const [max, tag, desc] of axis.tiers) {
        if (val <= max) return { tag, desc };
    }
    const last = axis.tiers[axis.tiers.length - 1];
    return { tag: last[1], desc: last[2] };
}

export const PREF_ORDER: PrefKey[] = [
    'offenseIdentity', 'tempo', 'scoringFocus', 'pnrEmphasis',
    'defenseStyle', 'helpScheme', 'zonePreference',
];

// ── 능력치 라벨 (13개 통합) ──
const ABILITY_LABELS: Record<keyof CoachAbilities, string> = {
    teaching: '지도력',
    schemeDepth: '전술 깊이',
    communication: '소통력',
    playerEval: '선수 평가',
    motivation: '동기부여',
    playerRelation: '선수 관계',
    adaptability: '적응력',
    developmentVision: '성장 비전',
    experienceTransfer: '경험 전수',
    mentalCoaching: '멘탈 코칭',
    athleticTraining: '신체 훈련',
    recovery: '회복 관리',
    conditioning: '컨디셔닝',
};

const ABILITY_ORDER: (keyof CoachAbilities)[] = [
    'teaching', 'schemeDepth', 'communication', 'playerEval',
    'motivation', 'playerRelation', 'adaptability',
    'developmentVision', 'experienceTransfer', 'mentalCoaching',
    'athleticTraining', 'recovery', 'conditioning',
];

// ── 직무 라벨 ──
const ROLE_LABELS: Record<StaffRole, string> = {
    headCoach: '헤드 코치',
    offenseCoordinator: '공격 코디네이터',
    defenseCoordinator: '수비 코디네이터',
    developmentCoach: '디벨롭먼트 코치',
    trainingCoach: '트레이닝 코치',
};

// ── 능력치 바 ──
const AbilityBar: React.FC<{ value: number }> = ({ value }) => {
    const filled = Math.round((value / 10) * 15);
    const barColor = coachAbilityBarColor(value);
    return (
        <div className="flex gap-0.5">
            {Array.from({ length: 15 }).map((_, i) => (
                <div
                    key={i}
                    className="w-2.5 h-2 rounded-sm"
                    style={{ backgroundColor: i < filled ? barColor : '#1e293b' }}
                />
            ))}
        </div>
    );
};

const InfoRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex items-center gap-3 px-4 py-2.5 border-t border-slate-800">
        <span className="text-xs text-slate-500 w-20 shrink-0">{label}</span>
        <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 min-w-0">{children}</span>
    </div>
);

type SelectedRole = StaffRole;

function getCoachFromStaff(staff: CoachingStaff | null | undefined, role: SelectedRole) {
    if (!staff) return null;
    switch (role) {
        case 'headCoach': return staff.headCoach;
        case 'offenseCoordinator': return staff.offenseCoordinator;
        case 'defenseCoordinator': return staff.defenseCoordinator;
        case 'developmentCoach': return staff.developmentCoach;
        case 'trainingCoach': return staff.trainingCoach;
    }
}

export const CoachDetailView: React.FC<CoachDetailViewProps> = ({ coach, teamId, onBack, coachingData, allTeams, staffData, initialRole }) => {
    const [currentTeamId, setCurrentTeamId] = useState(teamId);
    const [teamDropOpen, setTeamDropOpen] = useState(false);
    const [selectedRole, setSelectedRole] = useState<SelectedRole>(initialRole ?? 'headCoach');
    const teamDropRef = useRef<HTMLDivElement>(null);

    const currentStaff = coachingData?.[currentTeamId] ?? staffData ?? null;
    const currentCoach = currentStaff?.headCoach ?? coach;
    const selectedCoach = getCoachFromStaff(currentStaff, selectedRole);

    const teamInfo = TEAM_DATA[currentTeamId];
    const theme = getTeamTheme(currentTeamId, teamInfo?.colors ?? null);

    const offenseKeys = PREF_ORDER.filter(k => PREF_AXES[k].group === 'offense');
    const defenseKeys = PREF_ORDER.filter(k => PREF_AXES[k].group === 'defense');

    const sortedTeams = useMemo(() =>
        allTeams ? [...allTeams].sort((a, b) => a.name.localeCompare(b.name)) : [],
        [allTeams]
    );

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onBack]);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (teamDropRef.current && !teamDropRef.current.contains(e.target as Node)) {
                setTeamDropOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const ROLE_ABBRS: Record<StaffRole, string> = {
        headCoach: 'HC',
        offenseCoordinator: 'OC',
        defenseCoordinator: 'DC',
        developmentCoach: 'DEV',
        trainingCoach: 'TRN',
    };

    const renderAbilitiesTable = () => {
        if (!selectedCoach) {
            return (
                <div className="flex items-center justify-center h-24">
                    <span className="text-xs text-slate-600">해당 직무 코치 공석</span>
                </div>
            );
        }

        const abilities = (selectedCoach as Coach).abilities;
        return (
            <Table className="border-0 !rounded-none shadow-none">
                <TableHead>
                    <TableHeaderCell className="text-xs w-32 py-2 border-r border-slate-800/50" align="left">능력치</TableHeaderCell>
                    <TableHeaderCell className="text-xs w-20 py-2 border-r border-slate-800/50">등급</TableHeaderCell>
                    <TableHeaderCell className="text-xs py-2" align="left">그래프</TableHeaderCell>
                </TableHead>
                <TableBody>
                    {ABILITY_ORDER.map(key => (
                        <TableRow key={key} className="hover:bg-slate-900/40 transition-colors">
                            <TableCell className="text-xs font-bold text-white py-2 border-r border-slate-800/50 ko-normal">{ABILITY_LABELS[key]}</TableCell>
                            <TableCell className="text-[10px] font-bold py-2 border-r border-slate-800/50 text-center">
                                <span className={coachAbilityColor(abilities[key])}>
                                    {coachAbilityLabel(abilities[key])}
                                </span>
                            </TableCell>
                            <TableCell className="py-2">
                                <AbilityBar value={abilities[key]} />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        );
    };

    const ALL_ROLES: StaffRole[] = ['headCoach', 'offenseCoordinator', 'defenseCoordinator', 'developmentCoach', 'trainingCoach'];

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300 overflow-hidden">

            {/* ═══ 브레드크럼 바 ═══ */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-white/10 shrink-0"
                style={{ backgroundColor: theme.bg }}>

                {/* 뒤로 버튼 */}
                <button
                    onClick={onBack}
                    className="flex items-center justify-center w-7 h-7 rounded-md bg-black/30 hover:bg-black/50 transition-colors shrink-0"
                    style={{ color: theme.text }}
                >
                    <ArrowLeft size={14} />
                </button>

                <span className="text-white/30 text-sm mx-1">/</span>

                {/* 팀 드롭다운 */}
                <div ref={teamDropRef} className="relative">
                    <button
                        onClick={() => setTeamDropOpen(o => !o)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-black/20 hover:bg-black/40 transition-colors"
                        style={{ color: theme.text }}
                    >
                        <img src={getTeamLogoUrl(currentTeamId)} className="w-4 h-4 object-contain" alt="" />
                        <span className="text-xs font-bold">
                            {teamInfo ? `${teamInfo.city} ${teamInfo.name}` : currentTeamId.toUpperCase()}
                        </span>
                        {allTeams && <ChevronDown size={11} className="opacity-60" />}
                    </button>
                    {teamDropOpen && allTeams && (
                        <div className="absolute top-full left-0 mt-1 z-50 w-52 max-h-72 overflow-y-auto custom-scrollbar rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
                            {sortedTeams.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => { setCurrentTeamId(t.id); setTeamDropOpen(false); }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-800 transition-colors ${t.id === currentTeamId ? 'text-white font-bold' : 'text-slate-300'}`}
                                >
                                    <img src={getTeamLogoUrl(t.id)} className="w-4 h-4 object-contain shrink-0" alt="" />
                                    <span className="truncate">{t.name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <span className="text-white/30 text-sm mx-1">›</span>
                <span className="text-xs font-bold" style={{ color: theme.text, opacity: 0.8 }}>감독</span>
            </div>

            {/* ═══ 스크롤 영역 ═══ */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-none custom-scrollbar bg-slate-950">
                <div className="grid items-start gap-4 p-4" style={{ gridTemplateColumns: '2fr 8fr' }}>

                    {/* ── 좌열: 인물 정보 카드 ── */}
                    <div className="flex flex-col gap-3">
                        {/* HC 카드 */}
                        <div
                            className={`flex flex-col bg-slate-900 border rounded-xl overflow-hidden cursor-pointer transition-all ${selectedRole === 'headCoach' ? 'border-indigo-500/60 ring-1 ring-indigo-500/30' : 'border-slate-800 hover:border-slate-700'}`}
                            onClick={() => setSelectedRole('headCoach')}
                        >
                            <div className="relative overflow-hidden border-b border-white/5" style={{ backgroundColor: theme.bg }}>
                                <div className="absolute inset-0 bg-black/40 pointer-events-none" />
                                <div className="px-4 py-4 relative z-10 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-black/20 ring-1 ring-white/10 flex items-center justify-center shrink-0">
                                        <span className="text-sm font-black" style={{ color: theme.accent }}>HC</span>
                                    </div>
                                    <h2 className="text-lg font-black uppercase tracking-tight truncate" style={{ color: theme.text }}>
                                        {currentCoach?.name ?? '-'}
                                    </h2>
                                </div>
                            </div>
                            <InfoRow label="팀">
                                <img src={getTeamLogoUrl(currentTeamId)} className="w-4 h-4 object-contain" alt="" />
                                {teamInfo ? `${teamInfo.city} ${teamInfo.name}` : currentTeamId.toUpperCase()}
                            </InfoRow>
                            {currentCoach ? (
                                <>
                                    <InfoRow label="나이">
                                        <span className="font-mono tabular-nums">{currentCoach.age}세</span>
                                    </InfoRow>
                                    <InfoRow label="연봉">
                                        <span className="text-emerald-400 font-mono tabular-nums">{formatMoney(currentCoach.contractSalary)}</span>
                                    </InfoRow>
                                    <InfoRow label="계약기간">
                                        <span className="font-mono tabular-nums">{currentCoach.contractYears}년</span>
                                    </InfoRow>
                                    <InfoRow label="잔여기간">
                                        <span className="font-mono tabular-nums">{currentCoach.contractYearsRemaining}년</span>
                                    </InfoRow>
                                </>
                            ) : (
                                <>
                                    <InfoRow label="연봉"><span className="text-slate-600">-</span></InfoRow>
                                    <InfoRow label="계약기간"><span className="text-slate-600">-</span></InfoRow>
                                    <InfoRow label="잔여기간"><span className="text-slate-600">-</span></InfoRow>
                                </>
                            )}
                        </div>

                        {/* OC / DC / Dev / Trainer 카드 */}
                        {(['offenseCoordinator', 'defenseCoordinator', 'developmentCoach', 'trainingCoach'] as StaffRole[]).map(role => {
                            const roleCoach = getCoachFromStaff(currentStaff, role);
                            const isSelected = selectedRole === role;
                            return (
                                <div
                                    key={role}
                                    className={`flex items-center gap-3 px-3 py-3 bg-slate-900 border rounded-xl cursor-pointer transition-all ${isSelected ? 'border-indigo-500/60 ring-1 ring-indigo-500/30' : 'border-slate-800 hover:border-slate-700'}`}
                                    onClick={() => setSelectedRole(role)}
                                >
                                    <div className="w-8 h-8 rounded-lg bg-slate-800 ring-1 ring-slate-700 flex items-center justify-center shrink-0">
                                        <span className="text-[10px] font-black text-slate-400">{ROLE_ABBRS[role]}</span>
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{ROLE_LABELS[role]}</span>
                                        <span className={`text-xs font-bold truncate ${roleCoach ? 'text-slate-200' : 'text-slate-600'}`}>
                                            {roleCoach ? roleCoach.name : '공석'}
                                        </span>
                                        {roleCoach && (
                                            <span className="text-[10px] text-emerald-500 font-mono tabular-nums">
                                                {formatMoney(roleCoach.contractSalary)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ── 우열: 전술 테이블 + 능력치 테이블 ── */}
                    <div className="flex flex-col gap-4">

                        {/* HC 선택 시 공격/수비 전술 표시 */}
                        {selectedRole === 'headCoach' && (
                            <>
                                {/* 공격 전술 */}
                                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                                    <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-700">
                                        <span className="text-xs font-black text-white uppercase tracking-widest">공격 전술</span>
                                    </div>
                                    <Table className="border-0 !rounded-none shadow-none">
                                        <TableHead>
                                            <TableHeaderCell className="text-xs w-32 py-2 border-r border-slate-800/50" align="left">항목</TableHeaderCell>
                                            <TableHeaderCell className="text-xs w-40 py-2 border-r border-slate-800/50" align="left">성향</TableHeaderCell>
                                            <TableHeaderCell className="text-xs py-2" align="left">설명</TableHeaderCell>
                                        </TableHead>
                                        <TableBody>
                                            {offenseKeys.map(key => {
                                                const axis = PREF_AXES[key];
                                                const val = currentCoach?.preferences[key] ?? 5;
                                                const { tag, desc } = getAxisResult(axis, val);
                                                return (
                                                    <TableRow key={key} className="hover:bg-slate-900/40 transition-colors">
                                                        <TableCell className="text-xs font-bold text-white py-2 border-r border-slate-800/50 ko-normal">{axis.label}</TableCell>
                                                        <TableCell className={`text-xs font-black py-2 border-r border-slate-800/50 ${axis.color}`}>{tag}</TableCell>
                                                        <TableCell className="text-xs text-slate-400 py-2 ko-normal">{desc}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>

                                {/* 수비 전술 */}
                                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                                    <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-700">
                                        <span className="text-xs font-black text-white uppercase tracking-widest">수비 전술</span>
                                    </div>
                                    <Table className="border-0 !rounded-none shadow-none">
                                        <TableHead>
                                            <TableHeaderCell className="text-xs w-32 py-2 border-r border-slate-800/50" align="left">항목</TableHeaderCell>
                                            <TableHeaderCell className="text-xs w-40 py-2 border-r border-slate-800/50" align="left">성향</TableHeaderCell>
                                            <TableHeaderCell className="text-xs py-2" align="left">설명</TableHeaderCell>
                                        </TableHead>
                                        <TableBody>
                                            {defenseKeys.map(key => {
                                                const axis = PREF_AXES[key];
                                                const val = currentCoach?.preferences[key] ?? 5;
                                                const { tag, desc } = getAxisResult(axis, val);
                                                return (
                                                    <TableRow key={key} className="hover:bg-slate-900/40 transition-colors">
                                                        <TableCell className="text-xs font-bold text-white py-2 border-r border-slate-800/50 ko-normal">{axis.label}</TableCell>
                                                        <TableCell className={`text-xs font-black py-2 border-r border-slate-800/50 ${axis.color}`}>{tag}</TableCell>
                                                        <TableCell className="text-xs text-slate-400 py-2 ko-normal">{desc}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </>
                        )}

                        {/* 능력치 테이블 (모든 직무) */}
                        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                            <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-700 flex items-center justify-between">
                                <span className="text-xs font-black text-white uppercase tracking-widest">
                                    {ROLE_LABELS[selectedRole]} 능력치
                                </span>
                                {selectedCoach && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-400">{selectedCoach.name}</span>
                                        <span className="text-xs font-mono text-emerald-400">{formatMoney(selectedCoach.contractSalary)}</span>
                                    </div>
                                )}
                            </div>
                            {renderAbilitiesTable()}
                        </div>

                    </div>

                </div>
            </div>
        </div>
    );
};
