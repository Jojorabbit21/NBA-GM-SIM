
import React, { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { HeadCoach } from '../types/coaching';
import { TEAM_DATA } from '../data/teamData';
import { getTeamTheme } from '../utils/teamTheme';
import { getTeamLogoUrl } from '../utils/constants';
import { formatMoney } from '../utils/formatMoney';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../components/common/Table';

interface CoachDetailViewProps {
    coach: HeadCoach;
    teamId: string;
    onBack: () => void;
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

export const CoachDetailView: React.FC<CoachDetailViewProps> = ({ coach, teamId, onBack }) => {
    const teamInfo = TEAM_DATA[teamId];
    const teamColors = teamInfo?.colors || null;
    const theme = getTeamTheme(teamId, teamColors);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onBack]);

    const offenseKeys = PREF_ORDER.filter(k => PREF_AXES[k].group === 'offense');
    const defenseKeys = PREF_ORDER.filter(k => PREF_AXES[k].group === 'defense');

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-300 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">

                {/* ═══ HEADER ═══ */}
                <div className="border-b border-white/5 relative overflow-hidden" style={{ backgroundColor: theme.bg }}>
                    <div className="absolute inset-0 bg-black/40 pointer-events-none" />

                    {/* Back button */}
                    <div className="px-6 pt-5 pb-4 relative z-10">
                        <button
                            onClick={onBack}
                            className="flex items-center gap-1.5 bg-black/30 hover:bg-black/50 backdrop-blur-sm ring-1 ring-white/15 px-3 py-1.5 rounded-lg transition-colors"
                            style={{ color: theme.text }}
                        >
                            <ArrowLeft size={14} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">뒤로</span>
                        </button>
                    </div>

                    {/* Coach name */}
                    <div className="px-6 pt-1 pb-4 relative z-10 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-black/20 ring-1 ring-white/10 flex items-center justify-center">
                            <span className="text-xl font-black" style={{ color: theme.accent }}>HC</span>
                        </div>
                        <h2 className="text-3xl font-black uppercase tracking-tight" style={{ color: theme.text }}>
                            {coach.name}
                        </h2>
                    </div>

                    <div className="mx-6" />

                    {/* Info table */}
                    <div className="px-6 py-3 relative z-10">
                        <table className="text-sm" style={{ color: theme.text, opacity: 0.7 }}>
                            <thead>
                                <tr className="text-xs uppercase tracking-wider border-b border-white/15" style={{ opacity: 0.5 }}>
                                    <th className="pr-8 pb-2 text-left font-bold">팀</th>
                                    <th className="pr-8 pb-2 text-left font-bold">연봉</th>
                                    <th className="pr-8 pb-2 text-left font-bold">계약기간</th>
                                    <th className="pb-2 text-left font-bold">잔여기간</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="font-bold">
                                    <td className="pr-8 pt-2">
                                        <span className="flex items-center gap-1.5">
                                            <img src={getTeamLogoUrl(teamId)} className="w-4 h-4 object-contain" alt="" />
                                            {teamInfo ? `${teamInfo.city} ${teamInfo.name}` : teamId.toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="pr-8 pt-2">{formatMoney(coach.contractSalary)}</td>
                                    <td className="pr-8 pt-2">{coach.contractYears}년</td>
                                    <td className="pt-2">{coach.contractYearsRemaining}년</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div className="h-6" />
                </div>

                {/* ═══ BODY ═══ */}
                <div className="bg-slate-950">

                    {/* ═══ 공격 전술 ═══ */}
                    <div className="px-4 py-2.5 bg-slate-800 border-b border-slate-700">
                        <span className="text-xs font-black text-white uppercase tracking-widest">공격 전술</span>
                    </div>
                    <Table className="border-0 !rounded-none shadow-none">
                        <TableHead>
                            <TableHeaderCell className="text-xs w-32 py-2 border-r border-slate-800/50">항목</TableHeaderCell>
                            <TableHeaderCell className="text-xs w-40 py-2 border-r border-slate-800/50">성향</TableHeaderCell>
                            <TableHeaderCell className="text-xs py-2">설명</TableHeaderCell>
                        </TableHead>
                        <TableBody>
                            {offenseKeys.map(key => {
                                const axis = PREF_AXES[key];
                                const { tag, desc } = getAxisResult(axis, coach.preferences[key]);
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

                    {/* ═══ 수비 전술 ═══ */}
                    <div className="px-4 py-2.5 bg-slate-800 border-y border-slate-700">
                        <span className="text-xs font-black text-white uppercase tracking-widest">수비 전술</span>
                    </div>
                    <Table className="border-0 !rounded-none shadow-none">
                        <TableHead>
                            <TableHeaderCell className="text-xs w-32 py-2 border-r border-slate-800/50">항목</TableHeaderCell>
                            <TableHeaderCell className="text-xs w-40 py-2 border-r border-slate-800/50">성향</TableHeaderCell>
                            <TableHeaderCell className="text-xs py-2">설명</TableHeaderCell>
                        </TableHead>
                        <TableBody>
                            {defenseKeys.map(key => {
                                const axis = PREF_AXES[key];
                                const { tag, desc } = getAxisResult(axis, coach.preferences[key]);
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
            </div>
        </div>
    );
};
