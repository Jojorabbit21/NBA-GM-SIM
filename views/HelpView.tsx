
import React, { useState } from 'react';
import { 
    BookOpen, Target, Shield, Activity, 
    ChevronDown, ChevronUp, ArrowLeft, 
    HelpCircle, Zap, ShieldAlert, Settings2, 
    ArrowLeftRight, Cpu, DollarSign
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { PageHeader } from '../components/common/PageHeader';

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
                    <strong className="text-white text-lg">BPL GM Simulator 2025-26</strong>에 오신 것을 환영합니다.
                    당신은 프로 농구팀의 전권을 위임받은 단장(General Manager)으로 취임했습니다.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card variant="flat" padding="md">
                        <h4 className="text-white font-black mb-3 flex items-center gap-2">
                            <Target size={20} className="text-indigo-400" /> 목표
                        </h4>
                        <p>정규 시즌에서 좋은 성적을 거두고, 플레이오프를 뚫고 파이널 우승을 차지하는 것입니다.</p>
                    </Card>
                    <Card variant="flat" padding="md">
                        <h4 className="text-white font-black mb-3 flex items-center gap-2">
                            <Activity size={20} className="text-indigo-400" /> 진행
                        </h4>
                        <p>라커룸 화면에서 '경기 시작' 또는 '내일로 이동' 버튼을 눌러 일정을 진행할 수 있습니다.</p>
                    </Card>
                </div>
            </div>
        )
    },
    {
        id: 'offense',
        title: '2. 공격 전술 (Offensive Tactics)',
        icon: <Zap className="text-orange-400" size={28} />,
        content: (
            <div className="space-y-6 text-slate-300 text-base leading-relaxed">
                <p>라커룸 화면에서 팀의 공격 전술을 설정할 수 있습니다.</p>
                <div className="grid grid-cols-1 gap-4">
                    {[
                        { name: '밸런스 오펜스', desc: '모든 공격 루트를 균일하게 사용하며, 팀의 전체적인 오버롤이 높을 때 가장 큰 위력을 발휘합니다.' },
                        { name: '페이스 & 스페이스', desc: '공간 창출과 3점슛에 집중합니다. 높은 페이스로 인해 체력 소모가 큽니다.' },
                        { name: '그라인드', desc: '페이스를 낮추고 수비에 집중하는 늪 농구입니다. 득점 쟁탈전보다 실점 억제에 효과적입니다.' },
                        { name: '세븐 세컨즈', desc: '극단적인 런앤건입니다. 득점력은 폭발적이지만 턴오버와 실점 위험이 높습니다.' }
                    ].map(t => (
                        <Card key={t.name} variant="flat" padding="md">
                            <h5 className="text-orange-400 font-black mb-2 uppercase tracking-tight">{t.name}</h5>
                            <p className="text-slate-400 leading-relaxed">{t.desc}</p>
                        </Card>
                    ))}
                </div>
            </div>
        )
    },
    {
        id: 'defense',
        title: '3. 수비 전술 (Defensive Tactics)',
        icon: <Shield className="text-blue-400" size={28} />,
        content: (
            <div className="space-y-6 text-slate-300 text-base leading-relaxed">
                <div className="grid grid-cols-1 gap-6">
                    <Card variant="flat" padding="md">
                        <h5 className="text-blue-400 font-black mb-3 text-lg uppercase tracking-tight">맨투맨 & 퍼리미터</h5>
                        <p>대인 방어를 기본으로 외곽 슛을 억제합니다. 스틸을 노리지만 체력 소모가 큽니다.</p>
                    </Card>
                    <Card variant="outline" className="border-fuchsia-500/30 bg-fuchsia-900/10" padding="md">
                        <h5 className="text-fuchsia-400 font-black mb-3 text-lg uppercase tracking-tight flex items-center gap-2">
                            <ShieldAlert size={20} /> 에이스 스토퍼 (Ace Stopper)
                        </h5>
                        <p className="mb-4 text-slate-300">상대방의 핵심 득점원(Ace)을 전담 마크하여 효율을 떨어뜨립니다.</p>
                        <Badge variant="warning" className="mb-2">주의사항</Badge>
                        <ul className="list-disc pl-6 space-y-2 text-sm text-slate-400">
                            <li>스토퍼로 지정된 선수는 <span className="text-white font-bold">체력을 극심하게 소모</span>합니다.</li>
                            <li>수비 능력이 부족한 선수를 지정하면 오히려 대량 실점의 원인이 됩니다.</li>
                        </ul>
                    </Card>
                </div>
            </div>
        )
    },
    {
        id: 'trade',
        title: '4. 트레이드 및 재정',
        icon: <ArrowLeftRight className="text-purple-400" size={28} />,
        content: (
            <div className="space-y-6 text-slate-300 text-base leading-relaxed">
                <Card variant="flat" padding="md">
                    <h4 className="text-white font-black mb-3 flex items-center gap-2">
                        <Cpu size={20} className="text-purple-400" /> AI 트레이드 엔진
                    </h4>
                    <p>단순 오버롤 합계가 아닌, 팀의 상황(윈나우/리빌딩)과 샐러리 유동성을 고려한 현실적인 트레이드가 진행됩니다.</p>
                </Card>
                <Card variant="flat" padding="md">
                    <h4 className="text-white font-black mb-3 flex items-center gap-2">
                        <DollarSign size={20} className="text-amber-400" /> 샐러리 캡
                    </h4>
                    <p>프로 농구의 샐러리 구조를 따릅니다. 사치세 라인을 넘기면 구단주의 압박을 받을 수 있습니다.</p>
                </Card>
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
            <PageHeader 
                title="운영 매뉴얼" 
                description="BPL General Manager Guide"
                icon={<HelpCircle size={24} />}
                actions={
                    <button onClick={onBack} className="p-3 hover:bg-slate-800 rounded-full transition-colors group border border-slate-800">
                        <ArrowLeft size={20} className="text-slate-400 group-hover:text-white" />
                    </button>
                }
            />

            {/* Content Area */}
            <div className="w-full space-y-6">
                {SECTION_DATA.map((section) => (
                    <Card 
                        key={section.id} 
                        variant={openSection === section.id ? 'glass' : 'default'}
                        className={`transition-all duration-300 ${openSection === section.id ? 'ring-1 ring-indigo-500/30' : 'hover:bg-slate-800/50'}`}
                        padding="none"
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
                    </Card>
                ))}
            </div>
            
            <div className="flex justify-center mt-8">
                <Button variant="secondary" size="lg" onClick={onBack}>
                    대시보드로 돌아가기
                </Button>
            </div>
        </div>
    );
};
