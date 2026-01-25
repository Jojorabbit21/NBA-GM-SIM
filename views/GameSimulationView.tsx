
import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Team } from '../types';

// 상황별 메시지 분리
const GENERAL_MESSAGES = [
    "코칭 스태프가 머리를 맞대는 중...",
    "선수들이 작전 타임에 물 마시는 중...",
    "심판이 애매한 판정을 비디오 판독 중...",
    "관중들이 파도를 타는 중...",
    "마스코트가 하프코트 슛을 시도 중...",
    "치어리더가 분위기를 띄우는 중...",
    "벤치 멤버들이 수건을 돌리는 중...",
    "감독이 작전판에 열정적으로 그림 그리는 중...",
    "전력분석관이 태블릿을 두드리는 중...",
    "양 팀 선수들이 거친 몸싸움을 벌입니다...",
    "빠른 템포로 공수 전환이 이루어집니다...",
];

const CLUTCH_MESSAGES = [
    "4쿼터 막판, 수비 집중력이 높아집니다!",
    "승부처! 감독이 에이스를 호출합니다.",
    "관중석이 숨을 죽이고 지켜봅니다...",
    "한 골 싸움! 치열한 공방전!",
    "타임아웃! 마지막 작전을 지시합니다.",
    "상대 팀 감독이 심판에게 거칠게 항의합니다!",
    "선수들의 눈빛이 달라졌습니다.",
    "에이스가 공을 잡았습니다. 아이솔레이션 시도...",
    "경기장 분위기가 최고조에 달합니다!",
];

const SUPER_CLUTCH_MESSAGES = [
    "운명의 시간이 다가옵니다...",
    "마지막 10초! 원 포제션 게임!",
    "버저비터가 터질 것인가!",
    "심장이 멎을 듯한 초접전...",
    "공이 허공을 가릅니다...",
    "승부를 결정짓는 슛이 림을 향합니다!",
    "기적 같은 플레이가 나올 수 있을까요?",
    "모든 관중이 기립했습니다!",
    "역사에 남을 명승부...",
];

const GARBAGE_MESSAGES = [
    "점수 차가 많이 벌어졌습니다.",
    "주전 선수들이 벤치로 물러나 휴식을 취합니다.",
    "가비지 타임, 유망주들이 코트를 밟습니다.",
    "승부의 추는 이미 기운 것 같습니다.",
    "일방적인 경기 흐름이 계속됩니다.",
    "관중들이 하나둘 경기장을 빠져나갑니다...",
    "감독이 벤치 멤버들에게 기회를 줍니다.",
    "사실상 승패가 결정되었습니다.",
];

export const GameSimulatingView: React.FC<{ 
  homeTeam: Team, 
  awayTeam: Team, 
  userTeamId?: string | null,
  finalHomeScore?: number,
  finalAwayScore?: number,
  onSimulationComplete?: () => void
}> = ({ homeTeam, awayTeam, userTeamId, finalHomeScore = 110, finalAwayScore = 105, onSimulationComplete }) => {
  const [progress, setProgress] = useState(0);
  const [shots, setShots] = useState<{id: number, x: number, y: number, isMake: boolean}[]>([]);
  const [currentMessage, setCurrentMessage] = useState(GENERAL_MESSAGES[0]);
  
  // 종료 상태 및 진행률을 ref로 관리 (타이머 클로저 문제 해결)
  const isFinishedRef = useRef(false);
  const progressRef = useRef(0);
  
  // 콜백 함수를 ref에 저장하여 의존성 문제 해결
  const onCompleteRef = useRef(onSimulationComplete);
  useEffect(() => {
      onCompleteRef.current = onSimulationComplete;
  }, [onSimulationComplete]);
  
  // 턴제 스코어링 상태 및 Ref (Ref는 setInterval 내에서 최신값 참조용)
  const [currentHomeScore, setCurrentHomeScore] = useState(0);
  const [currentAwayScore, setCurrentAwayScore] = useState(0);
  const homeScoreRef = useRef(0);
  const awayScoreRef = useRef(0);

  // 1. 시뮬레이션 진행 루프 (0% -> 100%)
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const runSimulationStep = () => {
        setProgress(prev => {
            if (prev >= 100) {
                progressRef.current = 100;
                return 100;
            }

            // 클러치 타임 로직: 진행률에 따라 속도 조절
            const isLateGame = prev > 85; 
            const isVeryLateGame = prev > 94;

            // 진행 증가량 (뒤로 갈수록 조금씩만 증가)
            const increment = isVeryLateGame ? 0.4 : (isLateGame ? 0.6 : 1.5);
            const next = Math.min(100, prev + increment);
            
            // Ref 업데이트 (메시지 타이머가 참조함)
            progressRef.current = next;

            // 딜레이 (뒤로 갈수록 느려짐 -> 긴장감 조성)
            const delay = isVeryLateGame ? 300 : (isLateGame ? 100 : 30);

            timeoutId = setTimeout(runSimulationStep, delay);
            return next;
        });
    };

    runSimulationStep();
    return () => clearTimeout(timeoutId);
  }, []); // 의존성 배열 비움 (한 번만 실행)

  // 2. 점수 동기화 (progress 변화에 반응)
  useEffect(() => {
      const ratio = progress / 100;
      
      // 진행률에 비례한 목표 점수 계산
      const targetHome = Math.floor(finalHomeScore * ratio);
      const targetAway = Math.floor(finalAwayScore * ratio);

      // 점수가 목표치보다 낮으면 증가 (랜덤하게 2점 또는 3점씩)
      setCurrentHomeScore(prev => {
          let next = prev;
          if (prev >= finalHomeScore) next = finalHomeScore;
          else if (prev < targetHome) next = Math.min(finalHomeScore, prev + (Math.random() > 0.6 ? 3 : 2));
          
          homeScoreRef.current = next; // Ref 동기화
          return next;
      });

      setCurrentAwayScore(prev => {
          let next = prev;
          if (prev >= finalAwayScore) next = finalAwayScore;
          else if (prev < targetAway) next = Math.min(finalAwayScore, prev + (Math.random() > 0.6 ? 3 : 2));
          
          awayScoreRef.current = next; // Ref 동기화
          return next;
      });
  }, [progress, finalHomeScore, finalAwayScore]);

  // 3. 종료 처리 (100% 도달 시)
  useEffect(() => {
      if (progress >= 100 && !isFinishedRef.current) {
          isFinishedRef.current = true;
          
          // 최종 점수 확정
          setCurrentHomeScore(finalHomeScore);
          setCurrentAwayScore(finalAwayScore);
          homeScoreRef.current = finalHomeScore;
          awayScoreRef.current = finalAwayScore;
          
          // 2초 딜레이 후 콜백 실행 (타이머 정리하지 않음 - 종료 보장)
          setTimeout(() => {
              if (onCompleteRef.current) {
                  onCompleteRef.current();
              }
          }, 2000);
      }
  }, [progress, finalHomeScore, finalAwayScore]);

  // 4. 배경 효과 (슛 차트 & 메시지)
  useEffect(() => {
    const shotTimer = setInterval(() => {
        setShots(prev => {
            if (isFinishedRef.current) return prev; // 종료되면 슛 중단
            const isHome = Math.random() > 0.5;
            const isMake = Math.random() > 0.45;
            const hoopX = isHome ? 88.75 : 5.25;
            const direction = isHome ? -1 : 1;
            const dist = Math.random() * 28;
            const angle = (Math.random() * Math.PI) - (Math.PI / 2);
            const x = Math.max(2, Math.min(92, hoopX + Math.cos(angle) * dist * direction));
            const y = Math.max(2, Math.min(48, 25 + Math.sin(angle) * dist));
            return [...prev.slice(-40), { id: Date.now(), x, y, isMake }];
        });
    }, 120);

    const msgTimer = setInterval(() => {
        if (isFinishedRef.current) {
            setCurrentMessage("경기 종료 - 결과 집계 중...");
            return;
        }

        const currentProgress = progressRef.current;
        const scoreDiff = Math.abs(homeScoreRef.current - awayScoreRef.current);
        
        let targetPool = GENERAL_MESSAGES;
        
        if (currentProgress > 60 && scoreDiff >= 20) {
            targetPool = GARBAGE_MESSAGES;
        } else if (currentProgress > 94 && scoreDiff <= 3) {
            targetPool = SUPER_CLUTCH_MESSAGES;
        } else if (currentProgress > 85 && scoreDiff <= 10) {
            targetPool = CLUTCH_MESSAGES;
        }

        setCurrentMessage(prev => {
            let next;
            if (targetPool.length <= 1) return targetPool[0];
            do {
                next = targetPool[Math.floor(Math.random() * targetPool.length)];
            } while (next === prev);
            return next;
        });
    }, 1500); 

    return () => {
        clearInterval(shotTimer);
        clearInterval(msgTimer);
    };
  }, []);

  if (!homeTeam || !awayTeam) return null;

  return (
    <div className="fixed inset-0 bg-slate-950 z-[110] flex flex-col items-center justify-center p-4 overflow-hidden">
      {/* Background Effect */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500 rounded-full blur-[150px]"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500 rounded-full blur-[150px]"></div>
      </div>

      {/* Unified Container */}
      <div className="relative z-10 w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header Section (Scoreboard) */}
        <div className="flex items-center justify-between px-6 py-8 md:px-12 bg-slate-950/30">
            {/* Away Team */}
            <div className="flex flex-col items-center gap-3 w-32 md:w-40">
                <img src={awayTeam.logo} className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-2xl animate-in zoom-in duration-500" alt="" />
                <div className="text-center w-full">
                    <div className="text-lg md:text-xl font-black text-white oswald uppercase tracking-tight text-shadow-lg truncate w-full">{awayTeam.name}</div>
                    <div className="text-4xl md:text-5xl font-black text-slate-200 oswald tabular-nums mt-1 drop-shadow-xl">{currentAwayScore}</div>
                </div>
            </div>

            {/* Center Info */}
            <div className="flex-1 px-4 flex flex-col items-center justify-center gap-4">
                 <div className={`text-sm md:text-lg font-black text-center min-h-[3rem] flex items-center justify-center break-keep leading-snug animate-pulse transition-colors duration-300 ${
                     Math.abs(currentHomeScore - currentAwayScore) >= 20 && progress > 60 
                        ? 'text-slate-500'
                        : progress > 94 && Math.abs(currentHomeScore - currentAwayScore) <= 3
                            ? 'text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]'
                            : progress > 85 && Math.abs(currentHomeScore - currentAwayScore) <= 10
                                ? 'text-yellow-400'
                                : 'text-indigo-300'
                 }`}>
                    {currentMessage}
                 </div>
                 <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden shadow-inner border border-slate-700">
                    <div className={`h-full transition-all duration-300 ease-linear ${
                        Math.abs(currentHomeScore - currentAwayScore) >= 20 && progress > 60 
                            ? 'bg-slate-600'
                            : progress > 94 && Math.abs(currentHomeScore - currentAwayScore) <= 3
                                ? 'bg-gradient-to-r from-red-600 to-orange-500 shadow-[0_0_20px_rgba(220,38,38,0.6)]'
                                : 'bg-gradient-to-r from-indigo-600 to-blue-500'
                    }`} style={{ width: `${progress}%` }}></div>
                 </div>
            </div>

            {/* Home Team */}
            <div className="flex flex-col items-center gap-3 w-32 md:w-40">
                <img src={homeTeam.logo} className="w-16 h-16 md:w-20 md:h-20 object-contain drop-shadow-2xl animate-in zoom-in duration-500" alt="" />
                <div className="text-center w-full">
                    <div className="text-lg md:text-xl font-black text-white oswald uppercase tracking-tight text-shadow-lg truncate w-full">{homeTeam.name}</div>
                    <div className="text-4xl md:text-5xl font-black text-slate-200 oswald tabular-nums mt-1 drop-shadow-xl">{currentHomeScore}</div>
                </div>
            </div>
        </div>

        {/* Court Section (Bottom) */}
        <div className="relative w-full aspect-[94/50] bg-slate-950 border-t border-slate-800">
            <svg viewBox="0 0 94 50" className="absolute inset-0 w-full h-full opacity-80">
                <rect width="94" height="50" fill="#0f172a" />
                <g fill="none" stroke="#1e293b" strokeWidth="0.4">
                    <rect x="0" y="0" width="94" height="50" />
                    <line x1="47" y1="0" x2="47" y2="50" />
                    <circle cx="47" cy="25" r="6" />
                    <circle cx="47" cy="25" r="2" fill="#1e293b" />
                    <rect x="0" y="17" width="19" height="16" />
                    <circle cx="19" cy="25" r="6" strokeDasharray="1,1" />
                    <path d="M 0 3 L 14 3 A 23.75 23.75 0 0 1 14 47 L 0 47" />
                    <circle cx="5.25" cy="25" r="1.5" />
                    <rect x="75" y="17" width="19" height="16" />
                    <circle cx="75" cy="25" r="6" strokeDasharray="1,1" />
                    <path d="M 94 3 L 80 3 A 23.75 23.75 0 0 0 80 47 L 94 47" />
                    <circle cx="88.75" cy="25" r="1.5" />
                </g>
            </svg>
            {shots.map(s => (
                <div key={s.id} className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-opacity duration-1000" style={{ left: `${(s.x / 94) * 100}%`, top: `${(s.y / 50) * 100}%` }}>
                    {s.isMake ? <div className="w-2 md:w-2.5 h-2 md:h-2.5 rounded-full bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,1)] border border-emerald-300"></div> : <X size={12} className="text-red-500/60 drop-shadow-[0_0_5px_rgba(239,68,68,0.5)]" strokeWidth={3} />}
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};
