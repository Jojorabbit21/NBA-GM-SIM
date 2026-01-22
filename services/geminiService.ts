
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { PlayerBoxScore } from '../types';
import { GameTactics } from './gameEngine'; 

async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  retries: number = 2,
  delay: number = 2000
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const status = error?.status || error?.response?.status;
    const message = error?.message || error?.response?.message || '';
    
    const isRateLimit = status === 429 || status === 'RESOURCE_EXHAUSTED' || message.includes('quota') || message.includes('RESOURCE_EXHAUSTED');
    const isServerError = typeof status === 'number' && status >= 500;

    if (retries > 0 && (isRateLimit || isServerError)) {
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(operation, retries - 1, delay * 2);
    } else {
      throw error;
    }
  }
}

export async function generateNewsTicker(teamName: string, recentEvents: string[]) {
  const apiKey = process.env.API_KEY;
  
  const fallbackNews = [
    `Standard News: ${teamName} 구단이 시즌 운영에 박차를 가하고 있습니다.`,
    `NBA Ticker: 2025-26 정규리그 개막 이후 순위권 경쟁이 치열합니다.`,
    `League Info: 모든 팀들이 플레이오프 진출을 위한 로스터 최적화에 집중하고 있습니다.`
  ];

  return fallbackNews;
}

export async function generateOwnerWelcome(teamName: string) {
  const apiKey = process.env.API_KEY;
  const fallbackMessage = `[OWNER]: ${teamName}에 오신 것을 환영합니다. 우리의 목표와 실현 가능성을 점검해주십시오.`;
  
  return fallbackMessage;
}

export async function generateGameRecapNews(gameResult: {
  home: any; 
  away: any; 
  homeScore: number;
  awayScore: number;
  homeBox: PlayerBoxScore[];
  awayBox: PlayerBoxScore[];
  userTactics: GameTactics; 
  myTeamId: string;
}): Promise<string[] | null> {
  const apiKey = process.env.API_KEY;
  
  const winner = gameResult.homeScore > gameResult.awayScore ? gameResult.home.name : gameResult.away.name;
  const loser = gameResult.homeScore < gameResult.awayScore ? gameResult.home.name : gameResult.away.name;
  const isWin = (gameResult.myTeamId === gameResult.home.id && gameResult.homeScore > gameResult.awayScore) ||
                (gameResult.myTeamId === gameResult.away.id && gameResult.awayScore > gameResult.homeScore);
  const myTeamName = gameResult.myTeamId === gameResult.home.id ? gameResult.home.name : gameResult.away.name;

  const fallbackRecap = [
    `[속보] ${winner}, ${loser} 상대로 ${Math.abs(gameResult.homeScore - gameResult.awayScore)}점차 승리`,
    isWin 
      ? `[경기 분석] ${myTeamName}의 전술적 승리, 팬들의 환호 속 경기 종료`
      : `[경기 분석] ${myTeamName}, 아쉬운 패배... 다음 경기 반등 노린다`,
    `[현장 반응] 경기장 분위기 고조, 양 팀 선수들 치열한 승부 펼쳐`
  ];

  // =====================================================================================
  // [QUOTA ISSUE] GenAI API Temporarily Disabled
  // API 호출 로직을 주석 처리하여 기본 Fallback 메시지만 반환하도록 수정함.
  // =====================================================================================
  
  /*
  if (!apiKey) {
    return fallbackRecap;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    const isMyTeamHome = gameResult.myTeamId === gameResult.home.id;
    const myTeam = isMyTeamHome ? gameResult.home : gameResult.away;
    const opponentTeam = isMyTeamHome ? gameResult.away : gameResult.home;
    const myScore = isMyTeamHome ? gameResult.homeScore : gameResult.awayScore;
    const opponentScore = isMyTeamHome ? gameResult.awayScore : gameResult.homeScore;
    
    if (!gameResult.homeBox || !gameResult.awayBox) return fallbackRecap;

    const myBox = isMyTeamHome ? gameResult.homeBox : gameResult.awayBox;
    const oppBox = isMyTeamHome ? gameResult.awayBox : gameResult.homeBox;
    
    const myTopPerformer = [...myBox].sort((a, b) => b.pts - a.pts)[0];
    const oppTopPerformer = [...oppBox].sort((a, b) => b.pts - a.pts)[0];

    const offenseTacticsDisplay = gameResult.userTactics?.offenseTactics?.map(t => {
      switch(t) {
        case 'Balance': return '밸런스 오펜스';
        case 'PaceAndSpace': return '페이스 & 스페이스';
        case 'PerimeterFocus': return '퍼리미터 포커스';
        case 'PostFocus': return '포스트 포커스';
        case 'Grind': return '그라인드';
        case 'SevenSeconds': return '세븐 세컨즈';
        default: return t;
      }
    }).join(', ') || '기본 전술';

    const defenseTacticDisplay = gameResult.userTactics?.defenseTactics?.map(t => {
      switch(t) {
        case 'ManToManPerimeter': return '맨투맨 & 퍼리미터 수비';
        case 'ZoneDefense': return '존 디펜스';
        case 'AceStopper': return '에이스 스토퍼';
        default: return t;
      }
    }).join(', ') || '기본 수비';

    const prompt = `Act as a seasoned NBA sports journalist for ESPN. 
    Write 3 short news paragraphs (bullet points) in KOREAN about this game.
    
    Game Info:
    - ${myTeam.city} ${myTeam.name} vs ${opponentTeam.city} ${opponentTeam.name}
    - Score: ${myScore} - ${opponentScore} (${isWin ? 'Win' : 'Loss'})
    - My Team Top Player: ${myTopPerformer?.playerName} (${myTopPerformer?.pts}pts)
    - Opponent Top Player: ${oppTopPerformer?.playerName} (${oppTopPerformer?.pts}pts)
    - Tactics: Offense(${offenseTacticsDisplay}), Defense(${defenseTacticDisplay})

    Requirements:
    1. First point: Overall summary of the game result and key moment.
    2. Second point: Analysis of ${myTeam.name}'s performance, tactics effectiveness, and key player.
    3. Third point: Future outlook or coach's reaction.
    
    Return ONLY a JSON array of strings.`;

    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    }));
    
    const jsonStr = response.text;
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
    
    return fallbackRecap;

  } catch (error: any) {
    const isQuota = error?.status === 429 || error?.status === 'RESOURCE_EXHAUSTED' || error?.message?.includes('quota');
    if (isQuota) {
      console.warn("Gemini API quota exceeded (Game Recap). Using fallback content.");
    } else {
      console.error("Gemini Error (Game Recap):", error);
    }
    return fallbackRecap;
  }
  */

  return fallbackRecap;
}
