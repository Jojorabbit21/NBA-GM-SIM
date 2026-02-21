
import React, { useEffect, useState } from 'react';
import { Team } from '../types';
import { Briefcase, Trophy, PenTool } from 'lucide-react';
import { TEAM_DATA } from '../data/teamData';
import { TeamLogo } from '../components/common/TeamLogo';

interface OnboardingViewProps {
  team: Team;
  onComplete: () => void;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({ team, onComplete }) => {
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisibleLines(prev => {
        if (prev >= 6) {
          clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, 600);
    return () => clearInterval(timer);
  }, []);

  const ownerName = TEAM_DATA[team.id]?.owner || "The Ownership Group";

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 lg:p-8 relative overflow-hidden ko-normal pretendard">
      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-slate-900 to-transparent opacity-80"></div>
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-3xl"></div>
        <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-indigo-900/10 rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] relative overflow-hidden animate-in fade-in zoom-in-95 duration-700">
        {/* Top accent line */}
        <div className="h-1 w-full bg-gradient-to-r from-indigo-700 via-indigo-400 to-indigo-700"></div>

        <div className="p-8 lg:p-12 relative">
          {/* Watermark Logo */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.04] pointer-events-none">
            <TeamLogo teamId={team.id} size="custom" className="w-[500px] h-[500px] object-contain" />
          </div>

          {/* Header */}
          <div className="flex justify-between items-start mb-10 border-b border-slate-800 pb-6">
            <div className="flex items-center gap-4">
              <TeamLogo teamId={team.id} size="xl" className="drop-shadow-md" />
              <div>
                <h1 className="text-3xl font-black uppercase tracking-tight oswald text-white leading-none">
                  {team.city} {team.name}
                </h1>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">
                  Front Office Memorandum
                </p>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-600 uppercase tracking-widest">DATE</div>
              <div className="text-sm font-black text-slate-300 oswald">OCT 20, 2025</div>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-8 relative z-10 min-h-[300px]">
            <div className={`transition-all duration-700 ${visibleLines >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <p className="text-lg font-bold text-slate-100">
                신임 단장님께,
              </p>
              <p className="text-slate-400 mt-2 font-medium leading-relaxed">
                2025-26 시즌, 우리 <span className="font-bold text-slate-200">{team.name}</span>의 지휘봉을 잡게 된 것을 진심으로 환영합니다. 구단주 그룹과 팬들은 당신의 비전과 리더십에 큰 기대를 걸고 있습니다.
              </p>
            </div>

            <div className="space-y-4 pl-4 border-l-2 border-indigo-500/30">
              <div className={`flex items-start gap-4 transition-all duration-700 delay-100 ${visibleLines >= 2 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}>
                <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="font-black text-indigo-400 oswald text-sm">1</span>
                </div>
                <div>
                  <h3 className="font-bold text-slate-200 text-lg">로스터를 구성하고, 우승에 도전하세요.</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    선수단의 강점과 약점을 파악하여 최적의 로테이션을 구축하십시오. 우리의 목표는 단순한 플레이오프 진출이 아닌, 래리 오브라이언 트로피입니다.
                  </p>
                </div>
              </div>

              <div className={`flex items-start gap-4 transition-all duration-700 delay-200 ${visibleLines >= 3 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}>
                <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Briefcase size={14} className="text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-200 text-lg">트레이드를 통해 팀 전력을 강화하세요.</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    시장의 기회를 놓치지 마십시오. 과감한 결단과 협상력으로 팀의 미래를 위한 최고의 조각을 찾아내야 합니다.
                  </p>
                </div>
              </div>

              <div className={`flex items-start gap-4 transition-all duration-700 delay-300 ${visibleLines >= 4 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}>
                <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Trophy size={14} className="text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-200 text-lg">단장님의 전술 운영 능력을 보여주세요.</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    코트 위에서 펼쳐지는 치열한 수싸움에서 승리하십시오. 당신의 전략이 곧 우리의 승리 공식이 될 것입니다.
                  </p>
                </div>
              </div>
            </div>

            <div className={`pt-8 border-t border-slate-800 flex justify-between items-end transition-all duration-1000 ${visibleLines >= 5 ? 'opacity-100' : 'opacity-0'}`}>
              <div className="space-y-1">
                <p className="font-handwriting text-2xl text-indigo-400 transform -rotate-2 ml-4 min-h-[32px]">
                  {ownerName}
                </p>
                <p className="text-xs font-black text-slate-600 uppercase tracking-widest">TEAM OWNER</p>
              </div>

              <button
                onClick={onComplete}
                className="group flex items-center gap-3 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl shadow-lg shadow-indigo-900/40 transition-all duration-300 hover:shadow-indigo-900/60 hover:-translate-y-0.5 active:scale-[0.98]"
              >
                <span className="flex flex-col items-start">
                  <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">OFFICIAL SIGNATURE</span>
                  <span className="text-lg font-black uppercase oswald tracking-wide">임명 수락 및 시즌 시작</span>
                </span>
                <PenTool className="ml-2 group-hover:rotate-12 transition-transform" size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
