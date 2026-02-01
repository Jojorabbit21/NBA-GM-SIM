
import React, { useState, useMemo, useEffect } from 'react';
import { Search, Info, UserPlus, FileText, Zap, HelpCircle, ArrowRight, Loader2, Sparkles, Trophy } from 'lucide-react';
import { Team, Player } from '../types';
import { OvrBadge, getRankStyle } from '../components/SharedComponents';
import { useScoutingReport } from '../services/queries';

interface DraftViewProps {
  prospects: Player[];
  onDraft: (player: Player) => void;
  team: Team;
}

export const DraftView: React.FC<DraftViewProps> = ({ prospects, onDraft, team }) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // State to track if user requested analysis for CURRENT selected player
  // This avoids auto-fetching as soon as you click a player. User must click "Analyze"
  const [analyzeRequested, setAnalyzeRequested] = useState(false);

  const selectedProspect = useMemo(() => 
    prospects.find(p => p.id === selectedId) || null, [prospects, selectedId]
  );

  const filteredProspects = useMemo(() => 
    prospects.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())),
    [prospects, searchTerm]
  );

  // TanStack Query Hook
  const { data: scoutingReport, isLoading: isScouting, isError } = useScoutingReport(analyzeRequested ? selectedProspect : null);

  useEffect(() => {
    // Reset analysis request when selection changes
    setAnalyzeRequested(false);
  }, [selectedId]);

  const handleScout = () => {
    if (!selectedProspect) return;
    setAnalyzeRequested(true);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] animate-in fade-in duration-500 ko-normal gap-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-slate-800 pb-6 flex-shrink-0">
        <div>
          <h2 className="text-4xl lg:text-5xl font-black ko-tight text-slate-100 uppercase tracking-tight">드래프트 보드</h2>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input 
            type="text" 
            placeholder="유망주 이름 검색..." 
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl py-3 pl-12 pr-4 text-sm font-bold text-white focus:outline-none focus:border-indigo-500 transition-all"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 overflow-hidden">
        {/* Left: Prospect List */}
        {/* [Optimization] bg-slate-900/60 -> bg-slate-900/90 */}
        <div className="lg:col-span-4 bg-slate-900/90 border border-slate-800 rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-slate-800 bg-slate-800/20 flex items-center justify-between">
            <span className="text-xs font-black uppercase text-slate-400 tracking-widest">Available Prospects ({filteredProspects.length})</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2 bg-slate-950/20">
            {filteredProspects.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-4 opacity-50">
                    <Info size={40} />
                    <p className="font-bold text-sm">검색 결과가 없습니다.</p>
                </div>
            ) : filteredProspects.map(p => (
              <button 
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all ${selectedId === p.id ? 'bg-indigo-600 border-indigo-400 shadow-lg' : 'bg-slate-900/40 border-slate-800 hover:border-slate-700'}`}
              >
                <div className="!mx-0 !w-10 !h-10 !text-xl">
                   <OvrBadge ovr={p.ovr} className="w-full h-full" />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className={`font-black text-sm truncate ${selectedId === p.id ? 'text-white' : 'text-slate-200'}`}>{p.name}</div>
                  <div className={`text-[10px] font-black uppercase tracking-tighter ${selectedId === p.id ? 'text-indigo-200' : 'text-slate-500'}`}>
                    {p.position} | {p.age}세 | {p.height}cm
                  </div>
                </div>
                {selectedId === p.id && <ArrowRight size={18} className="text-white animate-in slide-in-from-left-2 duration-300" />}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Scouting Analysis */}
        {/* [Optimization] bg-slate-900/60 -> bg-slate-900/90 */}
        <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl relative">
          {selectedProspect ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="p-8 border-b border-slate-800 bg-slate-950/40 flex justify-between items-center">
                <div className="flex items-center gap-6">
                  <div className="!w-16 !h-16 !text-3xl !rounded-2xl">
                    <OvrBadge ovr={selectedProspect.ovr} className="w-full h-full" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-black text-white oswald uppercase tracking-tight leading-none">{selectedProspect.name}</h3>
                    <div className="mt-2 flex gap-3">
                      <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-black uppercase">{selectedProspect.position}</span>
                      <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{selectedProspect.height}cm / {selectedProspect.weight}kg</span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => onDraft(selectedProspect)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl transition-all active:scale-95 flex items-center gap-3 border border-emerald-400/30"
                >
                  <UserPlus size={20} /> 지명하기 (Draft)
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8">
                {/* Physicals & Core Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl text-center">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">운동능력</span>
                    <div className={`mx-auto ${getRankStyle(selectedProspect.ath)}`}>{selectedProspect.ath}</div>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl text-center">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">외곽득점</span>
                    <div className={`mx-auto ${getRankStyle(selectedProspect.out)}`}>{selectedProspect.out}</div>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl text-center">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">플레이메이킹</span>
                    <div className={`mx-auto ${getRankStyle(selectedProspect.plm)}`}>{selectedProspect.plm}</div>
                  </div>
                  <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl text-center">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">수비능력</span>
                    <div className={`mx-auto ${getRankStyle(selectedProspect.def)}`}>{selectedProspect.def}</div>
                  </div>
                </div>

                {/* Scouting Report Section */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-3xl overflow-hidden shadow-inner">
                  <div className="px-6 py-4 bg-indigo-600/10 border-b border-slate-800 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <Sparkles size={18} className="text-indigo-400" />
                      <span className="text-sm font-black text-indigo-100 uppercase tracking-widest">Gemini AI Scouting Report</span>
                    </div>
                    {(!scoutingReport && !isScouting) && (
                      <button 
                        onClick={handleScout}
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-black uppercase transition-all"
                      >
                        심층 분석 실행
                      </button>
                    )}
                  </div>
                  
                  <div className="p-8 min-h-[200px] flex flex-col justify-center">
                    {isScouting ? (
                      <div className="flex flex-col items-center gap-4 text-slate-500 animate-pulse">
                        <Loader2 className="animate-spin text-indigo-500" size={32} />
                        <p className="text-xs font-bold uppercase tracking-widest">유망주 스탯 시뮬레이션 및 커리어 패스 분석 중...</p>
                      </div>
                    ) : scoutingReport ? (
                      <div className="space-y-6">
                        {scoutingReport.map((line, i) => (
                          <div key={i} className="flex gap-4">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2 flex-shrink-0" />
                            <p className="text-slate-300 font-medium leading-relaxed">{line}</p>
                          </div>
                        ))}
                      </div>
                    ) : isError ? (
                        <div className="text-center text-red-400 font-bold text-sm">
                            분석 데이터를 불러오는 데 실패했습니다.
                        </div>
                    ) : (
                      <div className="flex flex-col items-center gap-6 text-slate-600 text-center py-10">
                        <div className="p-4 bg-slate-900 rounded-full border border-slate-800"><Zap size={32} className="opacity-20" /></div>
                        <div>
                          <p className="font-bold text-slate-400">데이터 기반 심층 분석 리포트가 생성되지 않았습니다.</p>
                          <p className="text-xs mt-1">상단의 분석 버튼을 눌러 스카우팅 리포트를 열람하십시오.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Additional Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-3">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">장점 (Potential Assets)</span>
                      <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 rounded-2xl">
                         <p className="text-xs text-emerald-400/80 leading-relaxed font-bold">
                            {selectedProspect.ovr > 70 ? "검증된 신체 툴과 농구 IQ를 보유하고 있습니다. 즉시 전력감으로 활용이 가능한 수준입니다." : "뛰어난 성장 가능성과 원석으로서의 가치가 매우 높습니다."}
                         </p>
                      </div>
                   </div>
                   <div className="space-y-3">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2">주의사항 (Red Flags)</span>
                      <div className="bg-red-500/5 border border-red-500/20 p-4 rounded-2xl">
                         <p className="text-xs text-red-400/80 leading-relaxed font-bold">
                            {selectedProspect.durability < 75 ? "내구성에 의문부호가 있습니다. 철저한 컨디션 관리가 동반되어야 만개할 수 있습니다." : "아직 리그의 거친 몸싸움에 적응하기 위한 힘 보강이 필요해 보입니다."}
                         </p>
                      </div>
                   </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 space-y-6">
                <div className="p-10 bg-slate-800/20 rounded-full border border-slate-800 shadow-inner">
                    <Trophy size={64} className="opacity-10" />
                </div>
                <div className="text-center">
                    <p className="font-black text-xl uppercase oswald tracking-widest text-slate-500">Pick Your Future</p>
                    <p className="text-sm font-bold mt-2">좌측 목록에서 분석할 유망주를 선택하십시오.</p>
                </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
