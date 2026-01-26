
import React, { useState } from 'react';
import { 
    BookOpen, Target, Shield, Briefcase, Activity, 
    ChevronDown, ChevronUp, Wallet, Brain, Trophy, 
    ArrowLeft, HelpCircle, Zap, Scale 
} from 'lucide-react';

interface HelpViewProps {
    onBack: () => void;
}

// Helper Icon Component
const UsersIcon = ({ className, size }: { className?: string, size?: number }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
);

const SECTION_DATA = [
    {
        id: 'basics',
        title: '게임 기본 (Basics)',
        icon: <BookOpen className="text-indigo-400" size={24} />,
        content: (
            <div className="space-y-4 text-slate-300 text-sm leading-relaxed">
                <p>
                    <strong className="text-white">NBA GM Simulator 2026</strong>에 오신 것을 환영합니다. 
                    당신은 NBA 팀의 전권을 위임받은 단장(GM)이 되어, 로스터 구성부터 경기 전술, 트레이드, 드래프트까지 모든 것을 관리합니다.
                </p>
                <ul className="list-disc pl-5 space-y-2">
                    <li><strong className="text-indigo-300">목표:</strong> 정규 시즌에서 좋은 성적을 거두고, 플레이오프를 거쳐 파이널 우승을 차지하는 것입니다.</li>
                    <li><strong className="text-indigo-300">진행:</strong> 메인 대시보드에서 '경기 시작' 또는 '내일로 이동' 버튼을 눌러 일정을 진행합니다.</li>
                    <li><strong className="text-indigo-300">자동 저장:</strong> 게임은 중요한 이벤트(경기 종료, 트레이드 등)마다 자동으로 저장됩니다.</li>
                </ul>
            </div>
        )
    },
    {
        id: 'roster',
        title: '선수단 관리 (Roster & OVR)',
        icon: <UsersIcon className="text-emerald-400" size={24} />,
        content: (
            <div className="space-y-4 text-slate-300 text-sm leading-relaxed">
                <p>
                    선수의 능력치는 다양한 세부 스탯을 기반으로 산출된 <strong className="text-emerald-300">OVR(종합 능력치)</strong>로 요약됩니다.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                        <div className="text-xs font-black text-slate-500 uppercase mb-1">능력치 구성</div>
                        <ul className="space-y-1 text-xs">
                            <li><span className="text-white">INS:</span> 골밑 득점력 (레이업, 덩크, 포스트업)</li>
                            <li><span className="text-white">OUT:</span> 외곽 슛 능력 (3점, 미드레인지)</li>
                            <li><span className="text-white">PLM:</span> 경기 조율 (패스, 핸들링)</li>
                            <li><span className="text-white">DEF:</span> 수비력 (대인방어, 스틸, 블록)</li>
                        </ul>
                    </div>
                    <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                        <div className="text-xs font-black text-slate-500 uppercase mb-1">컨디션 관리</div>
                        <p className="text-xs">
                            경기 출전 시간이 길어질수록 선수의 <span className="text-amber-400">체력(Condition)</span>이 소모됩니다. 
                            체력이 낮으면 부상 확률이 급격히 증가하고 경기력이 저하됩니다. 로테이션을 적절히 분배하세요.
                        </p>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'tactics',
        title: '전술 시스템 (Tactics)',
        icon: <Target className="text-orange-400" size={24} />,
        content: (
            <div className="space-y-4 text-slate-300 text-sm leading-relaxed">
                <p>
                    단순히 OVR이 높은 팀이 이기는 것이 아닙니다. 상대의 약점을 파고드는 전술이 승패를 가릅니다.
                </p>
                <div className="space-y-3">
                    <div className="border-l-2 border-orange-500/50 pl-3">
                        <h4 className="text-white font-bold mb-1">공격 전술 (Offense)</h4>
                        <ul className="space-y-1 text-xs">
                            <li><strong className="text-orange-300">Pace & Space:</strong> 3점슛 위주의 빠른 공격. 핸들러와 슈터가 중요합니다.</li>
                            <li><strong className="text-orange-300">Post Focus:</strong> 빅맨을 활용한 골밑 공략. 상대의 골밑 수비가 약할 때 유리합니다.</li>
                            <li><strong className="text-orange-300">Seven Seconds:</strong> 7초 안에 슛을 던지는 극단적인 런앤건. 체력 소모가 큽니다.</li>
                        </ul>
                    </div>
                    <div className="border-l-2 border-blue-500/50 pl-3">
                        <h4 className="text-white font-bold mb-1">수비 전술 (Defense)</h4>
                        <ul className="space-y-1 text-xs">
                            <li><strong className="text-blue-300">Ace Stopper:</strong> 상대 에이스를 전담 마크하여 효율을 떨어뜨립니다.</li>
                            <li><strong className="text-blue-300">Zone Defense:</strong> 골밑을 보호하지만 3점슛 허용 위험이 커집니다.</li>
                        </ul>
                    </div>
                </div>
            </div>
        )
    },
    {
        id: 'trade',
        title: '트레이드 및 재정 (Trade & Finance)',
        icon: <Briefcase className="text-fuchsia-400" size={24} />,
        content: (
            <div className="space-y-4 text-slate-300 text-sm leading-relaxed">
                <p>
                    트레이드 시장은 냉혹합니다. AI 구단들은 손해 보는 장사를 하지 않습니다.
                </p>
                <div className="grid grid-cols-1 gap-3">
                    <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                        <div className="flex items-center gap-2 mb-2">
                            <Scale size={14} className="text-slate-400" />
                            <span className="font-bold text-white text-xs">가치 산정 기준</span>
                        </div>
                        <p className="text-xs">
                            선수의 가치는 <strong>OVR, 나이, 잠재력, 계약 규모</strong>에 따라 결정됩니다. 
                            나이가 많거나 고액 연봉인 선수는 가치가 떨어지며, 어린 유망주는 높은 가치를 가집니다.
                        </p>
                    </div>
                    <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                        <div className="flex items-center gap-2 mb-2">
                            <Wallet size={14} className="text-slate-400" />
                            <span className="font-bold text-white text-xs">샐러리 캡 (Salary Cap)</span>
                        </div>
                        <ul className="space-y-1 text-xs list-disc pl-4">
                            <li><span className="text-amber-400">Luxury Tax ($170M):</span> 이 선을 넘으면 사치세가 부과됩니다.</li>
                            <li><span className="text-orange-400">1st Apron ($178M):</span> 영입 및 트레이드에 제약이 생깁니다.</li>
                            <li><span className="text-red-400">2nd Apron ($189M):</span> 매우 강력한 제재가 가해집니다.</li>
                        </ul>
                    </div>
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
        <div className="flex flex-col h-[calc(100vh-120px)] animate-in fade-in duration-500 ko-normal gap-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-slate-800 pb-6 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-slate-800 rounded-full transition-colors group">
                        <ArrowLeft size={28} className="text-slate-400 group-hover:text-white" />
                    </button>
                    <div>
                        <h2 className="text-4xl font-black ko-tight text-slate-100 uppercase tracking-tight flex items-center gap-3">
                            <HelpCircle className="text-indigo-500" size={32} /> 게임 가이드
                        </h2>
                        <p className="text-slate-500 text-sm font-bold mt-1">단장님을 위한 NBA GM Simulator 운영 매뉴얼</p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-950/30 rounded-[2.5rem] border border-slate-800 p-6 md:p-10 shadow-inner">
                <div className="max-w-4xl mx-auto space-y-4">
                    {SECTION_DATA.map((section) => (
                        <div 
                            key={section.id} 
                            className={`border border-slate-800 rounded-2xl overflow-hidden transition-all duration-300 ${openSection === section.id ? 'bg-slate-900 shadow-xl ring-1 ring-indigo-500/30' : 'bg-slate-900/40 hover:bg-slate-900/60'}`}
                        >
                            <button 
                                onClick={() => toggleSection(section.id)}
                                className="w-full flex items-center justify-between p-6 text-left"
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-xl bg-slate-950 border border-slate-800 ${openSection === section.id ? 'scale-110 shadow-lg' : ''} transition-transform`}>
                                        {section.icon}
                                    </div>
                                    <span className={`text-lg font-black uppercase tracking-tight ${openSection === section.id ? 'text-white' : 'text-slate-400'}`}>
                                        {section.title}
                                    </span>
                                </div>
                                {openSection === section.id ? <ChevronUp className="text-indigo-500" /> : <ChevronDown className="text-slate-600" />}
                            </button>
                            
                            {openSection === section.id && (
                                <div className="px-6 pb-6 pl-[5.5rem] animate-in slide-in-from-top-2 duration-300">
                                    <div className="pt-4 border-t border-slate-800/50">
                                        {section.content}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Pro Tip Box */}
                    <div className="mt-8 p-6 bg-gradient-to-br from-indigo-900/20 to-purple-900/20 rounded-3xl border border-indigo-500/20 flex gap-5 items-start">
                        <div className="p-3 bg-indigo-500/20 rounded-full text-indigo-400 flex-shrink-0">
                            <Brain size={24} />
                        </div>
                        <div>
                            <h4 className="text-base font-black text-indigo-200 uppercase tracking-widest mb-2">GM's Secret Tip</h4>
                            <p className="text-sm text-slate-400 leading-relaxed font-medium">
                                시즌 중 유망주들의 <strong className="text-white">잠재력(Potential)</strong>은 
                                출전 시간과 활약에 따라 변동될 수 있습니다. 
                                당장 OVR이 낮더라도 어린 선수들에게 충분한 기회를 주면, 미래의 슈퍼스타로 성장할 수 있습니다.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
