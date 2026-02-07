
import React, { useState } from 'react';
import { 
    BookOpen, Target, Shield, Activity, 
    ChevronDown, ChevronUp, Wallet, Brain, 
    ArrowLeft, HelpCircle, Zap, Scale, Cpu, 
    Users, AlertCircle, ShieldAlert, Timer, Settings2, DollarSign,
    ArrowLeftRight, ClipboardList
} from 'lucide-react';

interface HelpViewProps {
    onBack: () => void;
}

const SECTION_DATA = [
    {
        id: 'basics',
        title: '1. 게임의 기본 (Basics)',
        icon: <BookOpen className="text-indigo-400" size={28} />,
        content: (
            <div className="space-y-6 text-slate-300 text-base leading-relaxed">
                <p>
                    <strong className="text-white text-lg">NBA GM Simulator 2025-26</strong>에 오신 것을 환영합니다. 
                    당신은 NBA 팀의 전권을 위임받은 단장(General Manager)으로 취임했습니다. 
                    로스터 구성부터 경기 전술, 선수 로테이션, 트레이드까지 프로 농구 구단의 모든 것을 관리합니다.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
                        <h4 className="text-white font-black mb-3 flex items-center gap-2">
                            <Target size={20} className="text-indigo-400" /> 목표
                        </h4>
                        <p>정규 시즌에서 좋은 성적을 거두고, 플레이오프를 뚫고 파이널 우승을 차지하는 것입니다.</p>
                    </div>
                    <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
                        <h4 className="text-white font-black mb-3 flex items-center gap-2">
                            <Activity size={20} className="text-indigo-400" /> 진행
                        </h4>
                        <p>라커룸 화면에서 '경기 시작' 또는 '내일로 이동' 버튼을 눌러 일정을 진행할 수 있습니다.</p>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'roster',
        title: '2. 선수단 및 체력 관리 (Roster)',
        icon: <Users className="text-emerald-400" size={28} />,
        content: (
            <div className="space-y-6 text-slate-300 text-base leading-relaxed">
                <div className="space-y-4">
                    <h4 className="text-white font-black text-lg">로테이션 및 출전 시간</h4>
                    <p>라커룸 화면에서 선발 명단을 설정할 수 있습니다. 각 포지션 당 한 명만 설정이 가능합니다.</p>
                    <p>또한 선수마다 <span className="text-emerald-400">출전 시간에 제한</span>을 둘 수 있습니다. 만약 선수 출전 시간 제한을 두지 않는다면 로스터 각 선수들의 OVR 수치, 전술 유연성 슬라이더 계수에 따라 차등 분배됩니다.</p>
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-300 flex items-start gap-3">
                        <AlertCircle size={20} className="flex-shrink-0 mt-1" />
                        <p>선수를 원래 포지션이 아닌 다른 포지션에 배정한다면 <strong className="text-white">100%의 퍼포먼스를 발휘하지 못할 가능성</strong>이 높습니다.</p>
                    </div>
                </div>
                
                <div className="space-y-4 pt-4 border-t border-slate-800">
                    <h4 className="text-white font-black text-lg">체력 및 부상 시스템</h4>
                    <p>체력은 선수의 출전 시간, 내구도, 지구력, 전술의 페이스에 영향을 받습니다.</p>
                    <ul className="list-disc pl-6 space-y-3">
                        <li>경기를 치르고 나서 하루 이상의 휴식일을 가지면 대부분의 체력은 회복되지만, <span className="text-amber-400">백투백 경기를 치르면 더 많은 체력을 소모</span>하게 됩니다.</li>
                        <li>만약 체력이 현저히 낮은 선수를 경기에 오랜 시간 투입한다면 일정 확률로 <span className="text-red-400 font-bold">단기/장기 부상</span>이 발생할 가능성이 있습니다.</li>
                    </ul>
                </div>
            </div>
        )
    },
    {
        id: 'offense',
        title: '3-1. 공격 전술 (Offensive Tactics)',
        icon: <Zap className="text-orange-400" size={28} />,
        content: (
            <div className="space-y-6 text-slate-300 text-base leading-relaxed">
                <p>라커룸 화면에서 팀의 공격 전술을 설정할 수 있으며, 전술 기록 탭에서 설정한 전술의 승률과 세부 지표를 확인할 수 있습니다.</p>
                <div className="grid grid-cols-1 gap-4">
                    {[
                        { name: '밸런스 오펜스', desc: '모든 공격 루트를 균일하게 사용하며, 팀의 전체적인 오버롤이 높을 때 가장 큰 위력을 발휘합니다.' },
                        { name: '페이스 & 스페이스', desc: '많은 활동량, 3점 슛 성공률과 지구력, 그리고 볼 핸들러의 패스 능력에 따라 공격의 성패가 좌우됩니다. 높은 페이스로 인해 선수들에게 높은 수준의 체력을 요합니다.' },
                        { name: '퍼리미터 포커스', desc: '대부분의 공격을 픽앤롤에서 시작합니다. 좋은 볼핸들러와 파괴적인 빅맨이 있다면 효과가 극대화됩니다.' },
                        { name: '그라인드', desc: '페이스를 최대한으로 낮추고, 팀 디펜스를 통해 상대방의 득점을 최대한 제한하는 늪 농구입니다. 팀 전체적인 수비 역량과 미드레인지 득점 능력을 중요시하는 올드 스쿨 스타일입니다.' },
                        { name: '세븐 세컨즈', desc: '극단적으로 높은 페이스를 통해 최대한 빠르게 공격을 마무리하는 런앤건 전술입니다. 수비 리바운드를 중요시하고 반대로 공격 리바운드는 거의 시도하지 않습니다. 빠른 포인트가드, 피지컬이 좋고 드라이브에 능한 포워드 자원이 있다면 사용하기 좋은 전술입니다.' }
                    ].map(t => (
                        <div key={t.name} className="bg-slate-900/50 p-5 rounded-2xl border border-slate-800">
                            <h5 className="text-orange-400 font-black mb-2 uppercase tracking-tight">{t.name}</h5>
                            <p className="text-slate-400 leading-relaxed">{t.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        )
    },
    {
        id: 'defense',
        title: '3-2. 수비 전술 (Defensive Tactics)',
        icon: <Shield className="text-blue-400" size={28} />,
        content: (
            <div className="space-y-6 text-slate-300 text-base leading-relaxed">
                <div className="grid grid-cols-1 gap-6">
                    <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
                        <h5 className="text-blue-400 font-black mb-3 text-lg uppercase tracking-tight">맨투맨 & 퍼리미터</h5>
                        <p>3점라인 바깥에서부터 상대방을 강력하게 압박하는 수비 전술입니다. 대인 방어와 스위치 수비를 통해 상대방의 턴오버를 강제하고, 높은 지역에서의 속공을 이끌어냅니다. 좋은 퍼리미터 디펜스 능력과 헬프 디펜스 IQ를 필요로 합니다. 존 디펜스보다 많은 체력을 요구하며 앞선 수비 자원들의 파울이 빠르게 쌓일 수 있습니다.</p>
                    </div>
                    <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
                        <h5 className="text-blue-400 font-black mb-3 text-lg uppercase tracking-tight">지역 방어 및 골밑 보호</h5>
                        <p>인사이드 존을 가득 채워 상대방에게 2점 대신 3점을 던지게 만드는 전술입니다. 좋은 빅맨과 앞선에서 상대의 볼 핸들러를 저지할 가드 자원들이 있다면 효율이 극대화됩니다. 상대방의 2점 성공률이 제한되지만 반대로 3점 야투 시도는 늘어날 수 있으며, 상대방 빅맨/파워포워드의 파울 유도 능력이 좋다면 많은 자유투를 내어줄 수도 있습니다.</p>
                    </div>
                    <div className="bg-fuchsia-900/20 p-6 rounded-2xl border border-fuchsia-500/30">
                        <h5 className="text-fuchsia-400 font-black mb-3 text-lg uppercase tracking-tight flex items-center gap-2">
                            <ShieldAlert size={20} /> 에이스 스토퍼 (Ace Stopper)
                        </h5>
                        <p className="mb-4 text-slate-300">팀 내 최고의 수비수에게 상대방의 핵심 득점원(Ace)을 경기 내내 전담 마크하게 지시하는 고난도 수비 전술입니다.</p>
                        <ul className="list-disc pl-6 space-y-2 text-sm text-slate-400">
                            <li><strong>선정 기준:</strong> 단순히 수비 스탯만 높은 선수가 아니라, 에이스를 끈질기게 추격할 수 있는 <span className="text-white font-bold">신체 능력(스피드/지구력)</span>과 흐름을 끊는 <span className="text-white font-bold">수비 센스</span>를 복합적으로 평가하여 자동 선정합니다.</li>
                            <li><strong>효과:</strong> 스토퍼가 매치업 우위를 점할 경우 상대 에이스의 야투율을 급격히 떨어뜨리고 실책을 유발합니다.</li>
                            <li><strong>리스크:</strong> 상대 에이스를 쫓아다니기 위해 스토퍼는 <span className="text-amber-400">평소보다 훨씬 많은 체력을 소모</span>합니다. 만약 역량이 부족한 선수가 배치될 경우 수비 구멍이 되어 대량 실점의 빌미가 될 수 있습니다.</li>
                        </ul>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'sliders',
        title: '3-3. 전술 세부 조정 슬라이더 (Sliders)',
        icon: <Settings2 className="text-amber-400" size={28} />,
        content: (
            <div className="space-y-6 text-slate-300 text-base leading-relaxed">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[
                        { name: '공격 페이스', desc: '전체적인 공격 속도를 조절합니다. 페이스가 늘어날수록 야투 시도는 늘어나지만 턴오버가 많아질 수 있으며 선수들의 체력이 눈에 띄게 감소합니다.' },
                        { name: '공격 리바운드', desc: '높게 설정되면 공격 리바운드 참여도가 높아져 득점 확률이 증가하지만, 백코트가 늦어져 실점(속공 허용) 위험이 늘어납니다.' },
                        { name: '수비 리바운드', desc: '높게 설정되면 모든 선수가 박스아웃 싸움을 시작하여 리바운드 사수율이 높아지지만 이후의 페이스(속공)가 느려지게 됩니다.' },
                        { name: '수비 강도', desc: '높을수록 야투 억제력은 좋아지지만 파울이 늘어납니다. 인테리어 디펜스 능력이 좋지 않은 선수들에게 높은 강도를 요구하면 많은 자유투를 헌납하게 됩니다.' },
                        { name: '풀 코트 프레스', desc: '하프라인부터 상대 볼 핸들러를 압박합니다. 앞선 수비 능력이 좋다면 많은 턴오버를 유발하지만, 뚫릴 경우 상대방에게 쉬운 드라이브 기회를 내주게 됩니다.' },
                        { name: '존 디펜스 빈도', desc: '높을수록 선수들이 자기 자리를 사수하려는 경향이 강해집니다. 인테리어 수비와 패스 퍼셉션이 좋은 경우 상대 턴오버를 유발하지만, 반대의 경우 많은 3점 기회를 제공합니다.' }
                    ].map(s => (
                        <div key={s.name} className="bg-slate-900/30 p-5 rounded-2xl border border-slate-800">
                            <h5 className="text-amber-400 font-black mb-2 text-sm uppercase">{s.name}</h5>
                            <p className="text-sm text-slate-400 leading-relaxed">{s.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        )
    },
    {
        id: 'trade',
        title: '4. 트레이드 및 재정 (Trade & Finance)',
        icon: <ArrowLeftRight className="text-purple-400" size={28} />,
        content: (
            <div className="space-y-6 text-slate-300 text-base leading-relaxed">
                <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
                    <h4 className="text-white font-black mb-3 flex items-center gap-2">
                        <Cpu size={20} className="text-purple-400" /> 현실적인 트레이드 알고리즘
                    </h4>
                    <p className="mb-4">본 시뮬레이션에는 단순 오버롤 합계가 아닌 현실적인 가치 분석 시스템이 적용되어 있습니다.</p>
                    <ul className="list-disc pl-6 space-y-2 text-slate-400 text-sm">
                        <li>AI 단장들은 팀의 상황(컨텐더/리빌더), 로스터 구성, 연령대, 오버롤 대비 연봉 효율성 등을 모두 고려합니다.</li>
                        <li>프랜차이즈 스타를 헐값에 넘기거나, 의미 없는 선수들을 묶어 주전급을 요구하는 비현실적 트레이드는 발생하지 않습니다.</li>
                    </ul>
                </div>
                
                <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800">
                    <h4 className="text-white font-black mb-3 flex items-center gap-2">
                        <DollarSign size={20} className="text-amber-400" /> 재정 운영 (Salary Cap)
                    </h4>
                    <p>본 시뮬레이션은 NBA의 샐러리 구조를 그대로 따릅니다. 각 단장은 샐러리 상황에 맞게 선수단을 운영하고, 트레이드를 통해 재정 건전성(사치세 관리)을 유지해야 합니다.</p>
                </div>
            </div>
        )
    }
];

export const HelpView: React.FC<HelpViewProps> = ({ onBack }) => {
    const [openSection, setOpenSection] = useState<string | null>('basics');

    const toggleSection = (id: string) => {
        setOpenSection(prev => prev === id ? null : id);
    };

    return (
        <div className="flex flex-col min-h-full animate-in fade-in duration-500 ko-normal gap-8 pb-20 w-full">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-slate-800 pb-8 flex-shrink-0">
                <div className="flex items-center gap-6">
                    <button onClick={onBack} className="p-3 hover:bg-slate-800 rounded-full transition-colors group">
                        <ArrowLeft size={32} className="text-slate-400 group-hover:text-white" />
                    </button>
                    <div>
                        <h2 className="text-5xl font-black ko-tight text-slate-100 uppercase tracking-tight flex items-center gap-4">
                            <HelpCircle className="text-indigo-500" size={40} /> 운영 매뉴얼
                        </h2>
                        <p className="text-slate-500 text-base font-bold mt-2 uppercase tracking-widest">NBA General Manager Operating Strategy Guide</p>
                    </div>
                </div>
            </div>

            {/* Full Width Accordion Content Area */}
            <div className="w-full space-y-6">
                {SECTION_DATA.map((section) => (
                    <div 
                        key={section.id} 
                        className={`w-full border border-slate-800 rounded-[2rem] overflow-hidden transition-all duration-300 ${openSection === section.id ? 'bg-slate-900/60 shadow-2xl ring-1 ring-indigo-500/30' : 'bg-slate-900/20 hover:bg-slate-900/40'}`}
                    >
                        <button 
                            onClick={() => toggleSection(section.id)}
                            className="w-full flex items-center justify-between p-8 text-left group"
                        >
                            <div className="flex items-center gap-6">
                                <div className={`p-4 rounded-2xl bg-slate-950 border border-slate-800 ${openSection === section.id ? 'scale-110 shadow-indigo-500/20 shadow-xl' : ''} transition-transform`}>
                                    {section.icon}
                                </div>
                                <span className={`text-2xl font-black uppercase tracking-tight ${openSection === section.id ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>
                                    {section.title}
                                </span>
                            </div>
                            <div className={`p-2 rounded-full transition-colors ${openSection === section.id ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-600'}`}>
                                {openSection === section.id ? <ChevronUp size={28} /> : <ChevronDown size={28} />}
                            </div>
                        </button>
                        
                        {openSection === section.id && (
                            <div className="px-8 pb-10 pl-[7rem] animate-in slide-in-from-top-4 duration-500">
                                <div className="pt-8 border-t border-slate-800/50">
                                    {section.content}
                                </div>
                            </div>
                        )}
                    </div>
                ))}

            </div>
        </div>
    );
};
